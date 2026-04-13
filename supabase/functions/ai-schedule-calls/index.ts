import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { buildAssistantConfig } from "../_shared/assistant-config.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPI_API_URL = "https://api.vapi.ai/call/phone";
const MONTHLY_CALL_LIMIT = 30;

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  // Parse body for test_user_id
  let body: { test_user_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // No body or invalid JSON — that's fine for CRON calls
  }

  let testUserId: string | null = null;

  if (body.test_user_id) {
    // Test call mode: verify the user's JWT
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !supabaseUrl) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user || user.id !== body.test_user_id) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    testUserId = user.id;
  } else {
    // CRON mode: require service role key
    if (!authHeader || !authHeader.includes(serviceKey || "")) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
  }

  const vapiKey = Deno.env.get("VAPI_API_KEY");
  const vapiPhoneNumberId = Deno.env.get("VAPI_PHONE_NUMBER_ID");

  if (!vapiKey || !vapiPhoneNumberId) {
    console.error("VAPI_API_KEY or VAPI_PHONE_NUMBER_ID not set");
    return new Response("Not configured", { status: 500, headers: corsHeaders });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();

  // Get users to schedule
  let query = admin
    .from("call_preferences")
    .select("user_id, phone_number, timezone, preferred_call_time, call_frequency, call_days")
    .eq("is_active", true)
    .eq("phone_verified", true)
    .eq("onboarding_completed", true);

  if (testUserId) {
    query = query.eq("user_id", testUserId);
  }

  const { data: users, error } = await query;

  if (error || !users) {
    console.error("Failed to fetch users:", error);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }

  let scheduled = 0;

  for (const user of users) {
    try {
      // Skip time check for test calls
      if (!testUserId && !isUserDueForCall(user, now)) continue;

      // Check no call already scheduled/completed today
      const userToday = getUserLocalDate(now, user.timezone);
      const { data: existingCalls } = await admin
        .from("calls")
        .select("id")
        .eq("user_id", user.user_id)
        .gte("scheduled_at", `${userToday}T00:00:00`)
        .lt("scheduled_at", `${userToday}T23:59:59`)
        .not("status", "in", '("failed","no-answer")')
        .limit(1);

      if (existingCalls && existingCalls.length > 0) continue;

      // Check monthly limit
      const monthStart = `${userToday.substring(0, 7)}-01`;
      const { count } = await admin
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.user_id)
        .gte("scheduled_at", monthStart)
        .eq("status", "completed");

      if ((count || 0) >= MONTHLY_CALL_LIMIT) continue;

      // Create call record
      const { data: call, error: callError } = await admin
        .from("calls")
        .insert({
          user_id: user.user_id,
          status: "scheduled",
          scheduled_at: now.toISOString(),
        })
        .select("id")
        .single();

      if (callError || !call) {
        console.error("Failed to create call record:", callError);
        continue;
      }

      // Build assistant config from shared module
      const { data: prefs } = await admin
        .from("call_preferences")
        .select("voice_id")
        .eq("user_id", user.user_id)
        .single();

      const webhookUrl = `${supabaseUrl}/functions/v1/ai-vapi-webhook`;
      const assistantConfig = await buildAssistantConfig(
        user.user_id,
        call.id,
        webhookUrl,
        prefs?.voice_id
      );

      // Dispatch VAPI outbound call
      const vapiResp = await fetch(VAPI_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vapiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumberId: vapiPhoneNumberId,
          customer: { number: user.phone_number },
          assistant: assistantConfig,
        }),
      });

      if (vapiResp.ok) {
        const vapiData = await vapiResp.json();
        await admin
          .from("calls")
          .update({ vapi_call_id: vapiData.id })
          .eq("id", call.id);
        scheduled++;
      } else {
        const errText = await vapiResp.text();
        console.error("VAPI call failed:", errText);
        await admin
          .from("calls")
          .update({ status: "failed" })
          .eq("id", call.id);
      }
    } catch (err) {
      console.error(`Error scheduling call for user ${user.user_id}:`, err);
    }
  }

  return new Response(
    JSON.stringify({ scheduled, total_users: users.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

function getUserLocalDate(now: Date, timezone: string): string {
  return now
    .toLocaleDateString("en-CA", { timeZone: timezone })
    .split("T")[0]; // YYYY-MM-DD
}

function isUserDueForCall(
  user: {
    timezone: string;
    preferred_call_time: string;
    call_frequency: string;
    call_days?: number[];
  },
  now: Date
): boolean {
  // Get current time in user's timezone
  const userTime = now.toLocaleTimeString("en-GB", {
    timeZone: user.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Parse preferred time (HH:MM format from TIME column)
  const preferredTime = user.preferred_call_time.substring(0, 5); // "21:00"

  // Check if within 5-minute window
  const [prefH, prefM] = preferredTime.split(":").map(Number);
  const [nowH, nowM] = userTime.split(":").map(Number);

  const prefMinutes = prefH * 60 + prefM;
  const nowMinutes = nowH * 60 + nowM;
  const diff = nowMinutes - prefMinutes;

  // Within 0-4 minutes after preferred time
  if (diff < 0 || diff >= 5) return false;

  // Check day of week
  const dayOfWeek = parseInt(
    now.toLocaleDateString("en-US", {
      timeZone: user.timezone,
      weekday: "narrow",
    }) === "S"
      ? // Need a more reliable method
        new Intl.DateTimeFormat("en-US", {
          timeZone: user.timezone,
          weekday: "short",
        })
          .format(now)
          .charAt(0) === "S"
        ? (() => {
            const day = new Intl.DateTimeFormat("en-US", {
              timeZone: user.timezone,
              weekday: "long",
            }).format(now);
            return day === "Sunday" ? "0" : "6";
          })()
        : "0"
      : "0"
  );

  // Simpler approach: get day of week in user's timezone
  const dayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timezone,
    weekday: "long",
  }).format(now);

  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const userDayOfWeek = dayMap[dayStr] ?? 0;

  switch (user.call_frequency) {
    case "daily":
      return true;
    case "weekdays":
      return userDayOfWeek >= 1 && userDayOfWeek <= 5;
    case "weekends":
      return userDayOfWeek === 0 || userDayOfWeek === 6;
    case "custom":
      return user.call_days?.includes(userDayOfWeek) ?? false;
    default:
      return true;
  }
}

