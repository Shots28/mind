import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getAuthenticatedUser, getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { getValidAccessToken } from "../_shared/google-auth.ts";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

interface PushRequest {
  eventId: string;
  action: "create" | "update" | "delete";
}

function toGoogleEvent(event: Record<string, unknown>) {
  const isAllDay = event.all_day as boolean;

  const gEvent: Record<string, unknown> = {
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
  };

  if (isAllDay) {
    const startDate = (event.start_date as string).substring(0, 10);
    let endDate = event.end_date
      ? (event.end_date as string).substring(0, 10)
      : startDate;
    // Google all-day end date is exclusive -- add one day
    const end = new Date(endDate + "T00:00:00");
    end.setDate(end.getDate() + 1);
    endDate = end.toISOString().substring(0, 10);

    gEvent.start = { date: startDate };
    gEvent.end = { date: endDate };
  } else {
    gEvent.start = { dateTime: event.start_date };
    gEvent.end = { dateTime: event.end_date || event.start_date };
  }

  if (event.recurrence_rule) {
    gEvent.recurrence = [event.recurrence_rule as string];
  }

  return gEvent;
}

async function findTargetCalendar(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  contextId: string | null,
): Promise<{ calendarId: string; connectionId: string } | null> {
  // 1. Check context-calendar mapping
  if (contextId) {
    const { data: mapping } = await admin
      .from("context_calendar_mappings")
      .select("synced_calendar_id, synced_calendars(google_calendar_id, google_connection_id)")
      .eq("user_id", userId)
      .eq("context_id", contextId)
      .maybeSingle();

    if (mapping?.synced_calendars) {
      const sc = mapping.synced_calendars as Record<string, string>;
      return {
        calendarId: sc.google_calendar_id,
        connectionId: sc.google_connection_id,
      };
    }
  }

  // 2. Fallback to default calendar
  const { data: defaultCal } = await admin
    .from("synced_calendars")
    .select("google_calendar_id, google_connection_id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .eq("is_enabled", true)
    .maybeSingle();

  if (defaultCal) {
    return {
      calendarId: defaultCal.google_calendar_id,
      connectionId: defaultCal.google_connection_id,
    };
  }

  return null;
}

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

  const { eventId, action } = (await req.json()) as PushRequest;
  const admin = getSupabaseAdmin();

  // Fetch the event
  const { data: event, error: eventErr } = await admin
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("user_id", auth.user.id)
    .single();

  if (eventErr || !event) {
    return new Response(JSON.stringify({ error: "Event not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Skip read-only events
  if (event.is_read_only) {
    return new Response(JSON.stringify({ skipped: true, reason: "read_only" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Determine target calendar
  let calendarId = event.google_calendar_id;
  let connectionId = event.google_connection_id;

  if (!calendarId || !connectionId) {
    const target = await findTargetCalendar(admin, auth.user.id, event.context_id);
    if (!target) {
      // No calendar to sync to -- keep as local
      return new Response(JSON.stringify({ skipped: true, reason: "no_calendar" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    calendarId = target.calendarId;
    connectionId = target.connectionId;
  }

  try {
    const accessToken = await getValidAccessToken(connectionId);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    let googleEventId = event.google_event_id;
    let etag = event.google_etag;

    if (action === "create") {
      const gEvent = toGoogleEvent(event);
      const res = await fetch(
        `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: "POST", headers, body: JSON.stringify(gEvent) },
      );

      if (!res.ok) {
        const err = await res.json();
        await admin
          .from("events")
          .update({ sync_status: "pending_push" })
          .eq("id", eventId);

        await admin.from("sync_log").insert({
          user_id: auth.user.id,
          google_connection_id: connectionId,
          action: "error",
          event_id: eventId,
          details: { error: err, push_action: "create" },
        });

        return new Response(JSON.stringify({ error: "Google API error", details: err }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const created = await res.json();
      googleEventId = created.id;
      etag = created.etag;

      await admin
        .from("events")
        .update({
          google_event_id: googleEventId,
          google_calendar_id: calendarId,
          google_connection_id: connectionId,
          google_etag: etag,
          sync_status: "synced",
          source: event.source === "google" ? "google" : "local",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", eventId);

      await admin.from("sync_log").insert({
        user_id: auth.user.id,
        google_connection_id: connectionId,
        action: "push_create",
        event_id: eventId,
        google_event_id: googleEventId,
      });
    } else if (action === "update") {
      if (!googleEventId) {
        // Event not yet synced -- create instead
        return new Response(JSON.stringify({ error: "No google_event_id, create first" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const gEvent = toGoogleEvent(event);

      // Use If-Match for conflict detection
      if (etag) {
        headers["If-Match"] = etag;
      }

      const res = await fetch(
        `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
        { method: "PATCH", headers, body: JSON.stringify(gEvent) },
      );

      if (res.status === 412) {
        // Conflict -- Google event was modified. Mark for user notification.
        await admin
          .from("events")
          .update({ sync_status: "pending_pull" })
          .eq("id", eventId);

        await admin.from("sync_log").insert({
          user_id: auth.user.id,
          google_connection_id: connectionId,
          action: "error",
          event_id: eventId,
          google_event_id: googleEventId,
          details: { error: "etag_conflict", push_action: "update" },
        });

        return new Response(JSON.stringify({ conflict: true }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!res.ok) {
        const err = await res.json();
        await admin
          .from("events")
          .update({ sync_status: "pending_push" })
          .eq("id", eventId);

        return new Response(JSON.stringify({ error: "Google API error", details: err }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updated = await res.json();
      await admin
        .from("events")
        .update({
          google_etag: updated.etag,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", eventId);

      await admin.from("sync_log").insert({
        user_id: auth.user.id,
        google_connection_id: connectionId,
        action: "push_update",
        event_id: eventId,
        google_event_id: googleEventId,
      });
    } else if (action === "delete") {
      if (googleEventId) {
        const res = await fetch(
          `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
          { method: "DELETE", headers },
        );

        // 404/410 = already deleted on Google, treat as success
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          await admin
            .from("events")
            .update({ sync_status: "pending_push" })
            .eq("id", eventId);

          return new Response(JSON.stringify({ error: "Delete failed" }), {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await admin.from("sync_log").insert({
          user_id: auth.user.id,
          google_connection_id: connectionId,
          action: "push_delete",
          event_id: eventId,
          google_event_id: googleEventId,
        });
      }

      // Hard-delete from DB
      await admin.from("events").delete().eq("id", eventId);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await admin
      .from("events")
      .update({ sync_status: "pending_push" })
      .eq("id", eventId);

    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
