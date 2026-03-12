import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getAuthenticatedUser, getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { getValidAccessToken } from "../_shared/google-auth.ts";

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

  const { syncedCalendarId } = await req.json();
  const admin = getSupabaseAdmin();

  // Fetch synced calendar
  const { data: syncedCal } = await admin
    .from("synced_calendars")
    .select("*")
    .eq("id", syncedCalendarId)
    .eq("user_id", auth.user.id)
    .single();

  if (!syncedCal) {
    return new Response(JSON.stringify({ error: "Calendar not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const accessToken = await getValidAccessToken(syncedCal.google_connection_id);

    // Stop existing watch if any
    if (syncedCal.watch_channel_id && syncedCal.watch_resource_id) {
      try {
        await fetch(`${GCAL_BASE}/channels/stop`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: syncedCal.watch_channel_id,
            resourceId: syncedCal.watch_resource_id,
          }),
        });
      } catch {
        // Ignore errors stopping old watch
      }
    }

    // Generate new channel ID and verification token
    const channelId = crypto.randomUUID();
    const watchToken = crypto.randomUUID();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/google-webhook`;

    // 7 days from now (max allowed by Google)
    const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const res = await fetch(
      `${GCAL_BASE}/calendars/${encodeURIComponent(syncedCal.google_calendar_id)}/events/watch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token: watchToken,
          expiration,
        }),
      },
    );

    if (!res.ok) {
      const err = await res.json();
      return new Response(JSON.stringify({ error: "Watch setup failed", details: err }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const watchData = await res.json();

    // Store watch details
    await admin
      .from("synced_calendars")
      .update({
        watch_channel_id: channelId,
        watch_resource_id: watchData.resourceId,
        watch_token: watchToken,
        watch_expiration: new Date(Number(watchData.expiration)).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", syncedCalendarId);

    return new Response(JSON.stringify({ success: true, expiration: watchData.expiration }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
