import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getAuthenticatedUser, getSupabaseAdmin } from "../_shared/supabase-admin.ts";

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { action, phone_number, code } = await req.json();

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const verifySid = Deno.env.get("TWILIO_VERIFY_SID");

  if (!accountSid || !authToken || !verifySid) {
    return new Response(
      JSON.stringify({ error: "Phone verification not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const twilioAuth = btoa(`${accountSid}:${authToken}`);

  if (action === "send") {
    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send verification code via Twilio Verify
    const resp = await fetch(
      `https://verify.twilio.com/v2/Services/${verifySid}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${twilioAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone_number,
          Channel: "sms",
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.json();
      return new Response(
        JSON.stringify({ error: err.message || "Failed to send verification code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert call_preferences with the phone number (unverified)
    const admin = getSupabaseAdmin();
    await admin.from("call_preferences").upsert(
      {
        user_id: auth.user.id,
        phone_number,
        phone_verified: false,
      },
      { onConflict: "user_id" }
    );

    return new Response(
      JSON.stringify({ success: true, message: "Verification code sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (action === "verify") {
    if (!phone_number || !code) {
      return new Response(
        JSON.stringify({ error: "Phone number and code are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check verification code
    const resp = await fetch(
      `https://verify.twilio.com/v2/Services/${verifySid}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${twilioAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone_number,
          Code: code,
        }),
      }
    );

    const result = await resp.json();

    if (!resp.ok || result.status !== "approved") {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark phone as verified
    const admin = getSupabaseAdmin();
    await admin
      .from("call_preferences")
      .update({ phone_verified: true })
      .eq("user_id", auth.user.id);

    return new Response(
      JSON.stringify({ success: true, message: "Phone verified" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ error: "Invalid action. Use 'send' or 'verify'" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
