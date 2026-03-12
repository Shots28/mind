import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

Deno.serve(async (req: Request) => {
  // Google sends push notifications as POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const channelId = req.headers.get("X-Goog-Channel-ID");
  const resourceId = req.headers.get("X-Goog-Resource-ID");
  const resourceState = req.headers.get("X-Goog-Resource-State");
  const channelToken = req.headers.get("X-Goog-Channel-Token");

  // Initial sync verification
  if (resourceState === "sync") {
    return new Response("OK", { status: 200 });
  }

  if (!channelId) {
    return new Response("Missing channel ID", { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Look up the synced calendar by channel ID
  const { data: syncedCal, error } = await admin
    .from("synced_calendars")
    .select("id, user_id, watch_token, watch_resource_id")
    .eq("watch_channel_id", channelId)
    .maybeSingle();

  if (error || !syncedCal) {
    // Stale notification -- return 200 to stop Google from retrying
    return new Response("OK", { status: 200 });
  }

  // Verify watch token (CSRF/spoofing protection)
  if (!syncedCal.watch_token || channelToken !== syncedCal.watch_token) {
    console.error("Watch token missing or mismatch for channel:", channelId);
    return new Response("Forbidden", { status: 403 });
  }

  // Verify resource ID matches
  if (syncedCal.watch_resource_id && resourceId !== syncedCal.watch_resource_id) {
    console.error("Resource ID mismatch for channel:", channelId);
    return new Response("OK", { status: 200 });
  }

  // Trigger incremental pull for this calendar
  // Call google-sync-pull internally using service_role
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    await fetch(`${supabaseUrl}/functions/v1/google-sync-pull`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        syncedCalendarId: syncedCal.id,
        fullSync: false,
      }),
    });
  } catch (err) {
    console.error("Failed to trigger sync pull:", err);
  }

  return new Response("OK", { status: 200 });
});
