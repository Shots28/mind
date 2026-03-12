import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { getValidAccessToken } from "../_shared/google-auth.ts";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

Deno.serve(async () => {
  const admin = getSupabaseAdmin();
  const results = { renewed: 0, synced: 0, errors: 0, retried: 0 };

  // 1. Renew expiring watches (within 12 hours of expiry)
  const twelveHoursFromNow = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { data: expiringWatches } = await admin
    .from("synced_calendars")
    .select("*")
    .eq("is_enabled", true)
    .lt("watch_expiration", twelveHoursFromNow)
    .not("watch_channel_id", "is", null);

  for (const cal of expiringWatches || []) {
    try {
      const accessToken = await getValidAccessToken(cal.google_connection_id);

      // Stop old watch
      if (cal.watch_channel_id && cal.watch_resource_id) {
        try {
          await fetch(`${GCAL_BASE}/channels/stop`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: cal.watch_channel_id,
              resourceId: cal.watch_resource_id,
            }),
          });
        } catch {
          // Ignore
        }
      }

      // Create new watch
      const channelId = crypto.randomUUID();
      const watchToken = crypto.randomUUID();
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

      const res = await fetch(
        `${GCAL_BASE}/calendars/${encodeURIComponent(cal.google_calendar_id)}/events/watch`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: channelId,
            type: "web_hook",
            address: `${supabaseUrl}/functions/v1/google-webhook`,
            token: watchToken,
            expiration,
          }),
        },
      );

      if (res.ok) {
        const watchData = await res.json();
        await admin
          .from("synced_calendars")
          .update({
            watch_channel_id: channelId,
            watch_resource_id: watchData.resourceId,
            watch_token: watchToken,
            watch_expiration: new Date(Number(watchData.expiration)).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", cal.id);
        results.renewed++;
      }
    } catch (err) {
      console.error(`Failed to renew watch for calendar ${cal.id}:`, err);
      results.errors++;
    }
  }

  // 2. Incremental sync for stale calendars (not synced in 5+ min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: staleCalendars } = await admin
    .from("synced_calendars")
    .select("id, user_id")
    .eq("is_enabled", true)
    .or(`last_synced_at.is.null,last_synced_at.lt.${fiveMinAgo}`);

  for (const cal of staleCalendars || []) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      await fetch(`${supabaseUrl}/functions/v1/google-sync-pull`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ syncedCalendarId: cal.id }),
      });
      results.synced++;
    } catch (err) {
      console.error(`Failed to sync calendar ${cal.id}:`, err);
      results.errors++;
    }
  }

  // 3. Retry pending push events (include soft-deleted events that need push-delete)
  const { data: pendingEvents } = await admin
    .from("events")
    .select("id, user_id, deleted_at, google_event_id")
    .eq("sync_status", "pending_push")
    .limit(50);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const event of pendingEvents || []) {
    try {
      const action = event.deleted_at ? "delete" : event.google_event_id ? "update" : "create";

      await fetch(`${supabaseUrl}/functions/v1/google-sync-push`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventId: event.id, action }),
      });
      results.retried++;
    } catch (err) {
      console.error(`Failed to retry push for event ${event.id}:`, err);
      results.errors++;
    }
  }

  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { "Content-Type": "application/json" },
  });
});
