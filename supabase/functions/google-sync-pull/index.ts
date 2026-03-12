import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getAuthenticatedUser, getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { getValidAccessToken } from "../_shared/google-auth.ts";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

interface GoogleEvent {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  etag?: string;
  organizer?: { email?: string; self?: boolean };
  guestsCanModify?: boolean;
  updated?: string;
}

function googleEventToLocal(
  gEvent: GoogleEvent,
  userId: string,
  calendarId: string,
  connectionId: string,
  contextId: string | null,
) {
  const isAllDay = !!gEvent.start?.date;

  return {
    user_id: userId,
    title: gEvent.summary || "(No title)",
    description: gEvent.description || null,
    location: gEvent.location || null,
    start_date: isAllDay ? gEvent.start!.date! : gEvent.start?.dateTime || null,
    end_date: isAllDay ? gEvent.end?.date || null : gEvent.end?.dateTime || null,
    all_day: isAllDay,
    recurrence_rule: gEvent.recurrence?.[0] || null,
    recurring_event_id: null, // Resolved in a second pass
    original_start_date: gEvent.originalStartTime?.dateTime || gEvent.originalStartTime?.date || null,
    is_read_only: gEvent.organizer?.self === false && !gEvent.guestsCanModify,
    google_event_id: gEvent.id,
    google_calendar_id: calendarId,
    google_connection_id: connectionId,
    google_etag: gEvent.etag || null,
    sync_status: "synced",
    source: "google",
    last_synced_at: new Date().toISOString(),
    context_id: contextId,
  };
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  // Can be called from frontend (JWT) or internally from webhook (service_role)
  const auth = await getAuthenticatedUser(req);
  const admin = getSupabaseAdmin();

  const body = await req.json();
  const { syncedCalendarId, fullSync } = body;

  if (!syncedCalendarId) {
    return new Response(JSON.stringify({ error: "syncedCalendarId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch synced calendar details
  const { data: syncedCal, error: calErr } = await admin
    .from("synced_calendars")
    .select("*, google_connections(id, is_active)")
    .eq("id", syncedCalendarId)
    .single();

  if (calErr || !syncedCal) {
    return new Response(JSON.stringify({ error: "Calendar not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // If called from frontend, verify ownership
  if (auth && syncedCal.user_id !== auth.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = syncedCal.user_id;
  const calendarId = syncedCal.google_calendar_id;
  const connectionId = syncedCal.google_connection_id;

  // Debounce: skip if synced less than 30s ago (prevents duplicate webhook triggers)
  if (syncedCal.last_synced_at) {
    const lastSync = new Date(syncedCal.last_synced_at);
    if (Date.now() - lastSync.getTime() < 30_000 && !fullSync) {
      return new Response(JSON.stringify({ skipped: true, reason: "recently_synced" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const accessToken = await getValidAccessToken(connectionId);

    // Find reverse context mapping for this calendar
    const { data: mapping } = await admin
      .from("context_calendar_mappings")
      .select("context_id")
      .eq("user_id", userId)
      .eq("synced_calendar_id", syncedCalendarId)
      .maybeSingle();

    const contextId = mapping?.context_id || null;

    // Pre-load all existing events for this calendar to avoid N+1 queries
    const { data: existingEvents } = await admin
      .from("events")
      .select("id, google_event_id, google_etag, sync_status, deleted_at")
      .eq("user_id", userId)
      .eq("google_calendar_id", calendarId);

    const existingByGoogleId = new Map<string, { id: string; google_etag: string | null; sync_status: string | null; deleted_at: string | null }>();
    for (const e of existingEvents || []) {
      if (e.google_event_id) existingByGoogleId.set(e.google_event_id, e);
    }

    let useSyncToken = !fullSync && syncedCal.sync_token;
    let allGoogleEventIds: string[] = [];
    let pageToken: string | null = null;
    let newSyncToken: string | null = null;

    let created = 0, updated = 0, deleted = 0;

    do {
      // Build request URL
      const url = new URL(`${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("maxResults", "250");
      url.searchParams.set("singleEvents", "false");

      if (useSyncToken) {
        url.searchParams.set("syncToken", syncedCal.sync_token);
      } else {
        // Full sync: 3 months ago to 1 year ahead
        const timeMin = new Date();
        timeMin.setMonth(timeMin.getMonth() - 3);
        const timeMax = new Date();
        timeMax.setFullYear(timeMax.getFullYear() + 1);
        url.searchParams.set("timeMin", timeMin.toISOString());
        url.searchParams.set("timeMax", timeMax.toISOString());
      }

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 410) {
        // Sync token expired -- do full sync
        useSyncToken = false;
        pageToken = null;
        continue;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Google API error: ${JSON.stringify(err)}`);
      }

      const data = await res.json();
      const events: GoogleEvent[] = data.items || [];
      pageToken = data.nextPageToken || null;
      if (data.nextSyncToken) {
        newSyncToken = data.nextSyncToken;
      }

      // Separate into master events and instances, process masters first
      const masters = events.filter(e => !e.recurringEventId && e.status !== "cancelled");
      const instances = events.filter(e => e.recurringEventId && e.status !== "cancelled");
      const cancelled = events.filter(e => e.status === "cancelled");

      // Process creates/updates: masters first
      for (const gEvent of [...masters, ...instances]) {
        allGoogleEventIds.push(gEvent.id);
        const localEvent = googleEventToLocal(gEvent, userId, calendarId, connectionId, contextId);
        const existing = existingByGoogleId.get(gEvent.id);

        if (existing) {
          // Only update if etag changed (event actually modified)
          if (existing.google_etag !== gEvent.etag) {
            await admin
              .from("events")
              .update({
                ...localEvent,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
            updated++;
          }
        } else {
          const { data: inserted } = await admin.from("events").insert(localEvent).select("id, google_event_id").single();
          if (inserted) existingByGoogleId.set(gEvent.id, { id: inserted.id, google_etag: gEvent.etag || null, sync_status: "synced", deleted_at: null });
          created++;
        }
      }

      // Process deletions
      for (const gEvent of cancelled) {
        const toDelete = existingByGoogleId.get(gEvent.id);
        if (toDelete) {
          await admin.from("events").delete().eq("id", toDelete.id);
          existingByGoogleId.delete(gEvent.id);
          deleted++;
        }
      }
    } while (pageToken);

    // For full sync: reconcile -- delete local events that no longer exist on Google
    if (!useSyncToken && allGoogleEventIds.length > 0) {
      const googleIdSet = new Set(allGoogleEventIds);
      for (const [googleEventId, event] of existingByGoogleId) {
        // Skip pending push events (user created locally) and soft-deleted
        if (event.sync_status === "pending_push" || event.deleted_at) continue;
        if (!googleIdSet.has(googleEventId)) {
          await admin.from("events").delete().eq("id", event.id);
          deleted++;
        }
      }
    }

    // Update sync token and last synced timestamp
    const updateData: Record<string, unknown> = {
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (newSyncToken) {
      updateData.sync_token = newSyncToken;
    }
    await admin
      .from("synced_calendars")
      .update(updateData)
      .eq("id", syncedCalendarId);

    // Log
    await admin.from("sync_log").insert({
      user_id: userId,
      google_connection_id: connectionId,
      synced_calendar_id: syncedCalendarId,
      action: fullSync ? "pull_full" : "pull_incremental",
      details: { created, updated, deleted },
    });

    return new Response(JSON.stringify({ success: true, created, updated, deleted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await admin.from("sync_log").insert({
      user_id: userId,
      google_connection_id: connectionId,
      synced_calendar_id: syncedCalendarId,
      action: "error",
      details: { error: (err as Error).message },
    });

    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
