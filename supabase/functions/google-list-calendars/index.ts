import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/supabase-admin.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { getValidAccessToken } from "../_shared/google-auth.ts";

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

  let connectionId: string | undefined;
  try {
    ({ connectionId } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!connectionId) {
    return new Response(JSON.stringify({ error: "connectionId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify user owns this connection
  const admin = getSupabaseAdmin();
  const { data: conn } = await admin
    .from("google_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("user_id", auth.user.id)
    .single();

  if (!conn) {
    return new Response(JSON.stringify({ error: "Connection not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const accessToken = await getValidAccessToken(connectionId);

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      const err = await res.json();
      return new Response(
        JSON.stringify({ error: "Google API error", details: err }),
        {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await res.json();

    const calendars = (data.items || []).map(
      (cal: {
        id: string;
        summary: string;
        backgroundColor: string;
        primary?: boolean;
        accessRole: string;
      }) => ({
        id: cal.id,
        name: cal.summary,
        color: cal.backgroundColor,
        primary: cal.primary || false,
        accessRole: cal.accessRole,
      }),
    );

    return new Response(JSON.stringify({ calendars }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
