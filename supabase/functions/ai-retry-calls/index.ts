import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

const VAPI_API_URL = "https://api.vapi.ai/call/phone";
const MAX_RETRIES = 2;
const RETRY_DELAY_MINUTES = 15;

Deno.serve(async (req: Request) => {
  // Only allow POST with service role key (from CRON)
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader || !authHeader.includes(serviceKey || "")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const vapiKey = Deno.env.get("VAPI_API_KEY");
  const vapiPhoneNumberId = Deno.env.get("VAPI_PHONE_NUMBER_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!vapiKey || !vapiPhoneNumberId) {
    return new Response("Not configured", { status: 500 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const retryThreshold = new Date(
    now.getTime() - RETRY_DELAY_MINUTES * 60 * 1000
  ).toISOString();
  const twoHoursAgo = new Date(
    now.getTime() - 2 * 60 * 60 * 1000
  ).toISOString();

  // Find calls eligible for retry:
  // - status is no-answer or failed
  // - retry_count < MAX_RETRIES
  // - scheduled at least RETRY_DELAY_MINUTES ago (give time between retries)
  // - scheduled within last 2 hours (don't retry old calls)
  const { data: calls, error } = await admin
    .from("calls")
    .select("id, user_id, retry_count")
    .in("status", ["no-answer", "failed"])
    .lt("retry_count", MAX_RETRIES)
    .lt("scheduled_at", retryThreshold)
    .gt("scheduled_at", twoHoursAgo);

  if (error || !calls) {
    console.error("Failed to fetch retryable calls:", error);
    return new Response("Error", { status: 500 });
  }

  let retried = 0;

  for (const call of calls) {
    try {
      // Get user's phone number
      const { data: prefs } = await admin
        .from("call_preferences")
        .select("phone_number")
        .eq("user_id", call.user_id)
        .eq("is_active", true)
        .single();

      if (!prefs?.phone_number) continue;

      // Update retry count and reset status
      await admin
        .from("calls")
        .update({
          retry_count: call.retry_count + 1,
          status: "scheduled",
          scheduled_at: now.toISOString(),
        })
        .eq("id", call.id);

      // Re-dispatch via VAPI
      const vapiResp = await fetch(VAPI_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vapiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumberId: vapiPhoneNumberId,
          customer: { number: prefs.phone_number },
          assistantOverrides: {
            serverUrl: `${supabaseUrl}/functions/v1/ai-vapi-webhook`,
            metadata: {
              userId: call.user_id,
              callId: call.id,
            },
          },
        }),
      });

      if (vapiResp.ok) {
        const vapiData = await vapiResp.json();
        await admin
          .from("calls")
          .update({ vapi_call_id: vapiData.id })
          .eq("id", call.id);
        retried++;
      } else {
        console.error("VAPI retry failed:", await vapiResp.text());
        await admin
          .from("calls")
          .update({ status: "failed" })
          .eq("id", call.id);
      }
    } catch (err) {
      console.error(`Error retrying call ${call.id}:`, err);
    }
  }

  return new Response(
    JSON.stringify({ retried, eligible: calls.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
