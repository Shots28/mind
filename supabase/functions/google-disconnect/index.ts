import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getAuthenticatedUser, getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { getValidAccessToken, revokeGoogleToken } from "../_shared/google-auth.ts";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { connectionId, keepEvents } = await req.json();
  const admin = getSupabaseAdmin();

  // Verify ownership
  const { data: conn } = await admin
    .from("google_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", auth.user.id)
    .single();

  if (!conn) {
    return new Response(JSON.stringify({ error: "Connection not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Stop all watch channels
  const { data: syncedCals } = await admin
    .from("synced_calendars")
    .select("*")
    .eq("google_connection_id", connectionId);

  for (const cal of syncedCals || []) {
    if (cal.watch_channel_id && cal.watch_resource_id) {
      try {
        const accessToken = await getValidAccessToken(connectionId);
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
        // Continue cleanup even if watch stop fails
      }
    }
  }

  // 2. Handle events based on user choice
  if (keepEvents) {
    // Convert Google events to local events
    await admin
      .from("events")
      .update({
        google_event_id: null,
        google_calendar_id: null,
        google_connection_id: null,
        google_etag: null,
        sync_status: "local",
        source: "local",
      })
      .eq("google_connection_id", connectionId)
      .eq("user_id", auth.user.id);
  } else {
    // Delete all events from this connection
    await admin
      .from("events")
      .delete()
      .eq("google_connection_id", connectionId)
      .eq("user_id", auth.user.id)
      .eq("source", "google");

    // Convert locally-created synced events to local
    await admin
      .from("events")
      .update({
        google_event_id: null,
        google_calendar_id: null,
        google_connection_id: null,
        google_etag: null,
        sync_status: "local",
      })
      .eq("google_connection_id", connectionId)
      .eq("user_id", auth.user.id);
  }

  // 3. Set pending_push events to local
  await admin
    .from("events")
    .update({ sync_status: "local", google_event_id: null, google_calendar_id: null, google_connection_id: null })
    .eq("google_connection_id", connectionId)
    .eq("sync_status", "pending_push");

  // 4. Delete context_calendar_mappings for this connection's calendars
  const calIds = (syncedCals || []).map((c) => c.id);
  if (calIds.length > 0) {
    await admin
      .from("context_calendar_mappings")
      .delete()
      .in("synced_calendar_id", calIds);
  }

  // 5. Delete synced_calendars
  await admin
    .from("synced_calendars")
    .delete()
    .eq("google_connection_id", connectionId);

  // 6. Revoke Google token (best effort)
  try {
    await revokeGoogleToken(conn.access_token);
  } catch {
    // Non-blocking
  }

  // 7. Delete the connection
  await admin
    .from("google_connections")
    .delete()
    .eq("id", connectionId);

  // Log
  await admin.from("sync_log").insert({
    user_id: auth.user.id,
    google_connection_id: connectionId,
    action: "disconnect",
    details: { keepEvents, calendarsRemoved: calIds.length },
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
