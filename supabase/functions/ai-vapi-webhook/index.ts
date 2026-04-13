import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { buildAssistantConfig } from "../_shared/assistant-config.ts";
import {
  markHabitDone,
  completeTask,
  createTask,
  createJournalEntry,
} from "../_shared/agent-actions.ts";

// Handle assistant-request: return dynamic assistant config using shared module
async function handleAssistantRequest(metadata: Record<string, string>) {
  const userId = metadata?.userId;
  const callId = metadata?.callId;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing userId" }), {
      status: 400,
    });
  }

  const admin = getSupabaseAdmin();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const webhookUrl = `${supabaseUrl}/functions/v1/ai-vapi-webhook`;

  const { data: prefs } = await admin
    .from("call_preferences")
    .select("voice_id")
    .eq("user_id", userId)
    .single();

  const assistantConfig = await buildAssistantConfig(
    userId,
    callId || "",
    webhookUrl,
    prefs?.voice_id
  );

  return new Response(
    JSON.stringify({ assistant: assistantConfig }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// Handle function calls from the AI during the conversation
async function handleFunctionCall(
  functionName: string,
  parameters: Record<string, string>,
  metadata: Record<string, string>
) {
  const userId = metadata?.userId;
  const callId = metadata?.callId;

  if (!userId) {
    return { result: "Error: missing user context" };
  }

  let result;
  switch (functionName) {
    case "mark_habit_done":
      result = await markHabitDone(userId, parameters.habit_name);
      break;
    case "complete_task":
      result = await completeTask(userId, parameters.task_title);
      break;
    case "create_task":
      result = await createTask(
        userId,
        parameters.title,
        parameters.due_date,
        parameters.priority
      );
      break;
    case "create_journal_entry":
      result = await createJournalEntry(
        userId,
        parameters.content,
        parameters.mood,
        callId
      );
      break;
    default:
      result = { success: false, message: `Unknown function: ${functionName}` };
  }

  return { result: result.message };
}

// Handle status updates from VAPI
async function handleStatusUpdate(
  status: string,
  metadata: Record<string, string>
) {
  const callId = metadata?.callId;
  if (!callId) return;

  const admin = getSupabaseAdmin();

  const statusMap: Record<string, string> = {
    ringing: "ringing",
    "in-progress": "in-progress",
    forwarding: "in-progress",
    ended: "completed",
  };

  const dbStatus = statusMap[status];
  if (!dbStatus) return;

  const update: Record<string, unknown> = { status: dbStatus };
  if (status === "in-progress") {
    update.started_at = new Date().toISOString();
  }

  await admin.from("calls").update(update).eq("id", callId);
}

// Handle end-of-call report
async function handleEndOfCallReport(body: Record<string, unknown>) {
  const msg = body.message as Record<string, unknown> || {};
  const call = msg.call as Record<string, unknown> || {};
  const metadata = call.metadata as Record<string, string> ||
    msg.metadata as Record<string, string> ||
    body.metadata as Record<string, string> ||
    {};
  const callId = metadata?.callId;
  const userId = metadata?.userId;

  console.log("End-of-call-report metadata:", JSON.stringify(metadata), "callId:", callId, "userId:", userId);

  if (!callId || !userId) return;

  const admin = getSupabaseAdmin();

  const endedReason = msg.endedReason as string || body.endedReason as string;
  // Transcript can be a string or inside artifact
  const artifact = msg.artifact as Record<string, unknown> || {};
  const transcript = artifact.transcript as string || msg.transcript as string || body.transcript as string || "";
  const durationSeconds = msg.durationSeconds as number ||
    body.durationSeconds as number;

  // Determine final status
  let finalStatus = "completed";
  if (
    endedReason === "customer-did-not-answer" ||
    endedReason === "customer-busy"
  ) {
    finalStatus = "no-answer";
  } else if (endedReason === "error" || endedReason === "pipeline-error") {
    finalStatus = "failed";
  }

  // Update call record
  await admin
    .from("calls")
    .update({
      status: finalStatus,
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds || null,
      transcript: transcript || null,
    })
    .eq("id", callId);

  // Auto-generate journal entry if meaningful conversation and none was created during the call
  if (finalStatus === "completed" && transcript && transcript.length > 200) {
    // Check if a journal entry was already created for this call
    const { data: existing } = await admin
      .from("journal_entries")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle();

    if (!existing) {
      await generateJournalFromTranscript(userId, callId, transcript);
    }
  }
}

// Generate a journal entry from the call transcript using Claude
async function generateJournalFromTranscript(
  userId: string,
  callId: string,
  transcript: string
) {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY not set, skipping journal generation");
    return;
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Here is a transcript of a daily check-in phone call. Generate a reflective journal entry from it, written in first person from the user's perspective. Keep it natural and concise -- capture the key reflections, events, and feelings mentioned. Also determine the mood as one of: great, good, okay, bad, terrible.

Respond in JSON format: {"entry": "...", "mood": "..."}

Transcript:
${transcript}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("Claude API error:", await resp.text());
      return;
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text;
    if (!text) return;

    // Parse JSON from Claude's response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);

    await createJournalEntry(
      userId,
      parsed.entry,
      parsed.mood,
      callId
    );

    // Update call summary
    const admin = getSupabaseAdmin();
    const summary =
      parsed.entry.length > 100
        ? parsed.entry.substring(0, 100) + "..."
        : parsed.entry;
    await admin.from("calls").update({ summary }).eq("id", callId);
  } catch (err) {
    console.error("Journal generation failed:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify webhook secret
  const webhookSecret = Deno.env.get("VAPI_WEBHOOK_SECRET");
  if (webhookSecret) {
    const headerSecret = req.headers.get("x-vapi-secret");
    if (headerSecret !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const body = await req.json();
  const messageType = body.message?.type || body.type;

  // Extract metadata from call object (VAPI nests it under message.call.metadata)
  const metadata = body.message?.call?.metadata ||
    body.message?.metadata ||
    body.metadata ||
    {};

  console.log("Webhook event:", messageType, "metadata:", JSON.stringify(metadata));

  try {
    switch (messageType) {
      case "assistant-request": {
        return await handleAssistantRequest(metadata);
      }

      case "tool-calls": {
        // VAPI sends tool-calls with toolCallList array
        const toolCallList = body.message?.toolCallList || [];
        const results = [];

        for (const toolCall of toolCallList) {
          const result = await handleFunctionCall(
            toolCall.name,
            toolCall.parameters || toolCall.arguments || {},
            metadata
          );
          results.push({
            toolCallId: toolCall.id,
            result: result.result,
          });
        }

        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Keep legacy function-call support as fallback
      case "function-call": {
        const fnCall = body.message?.functionCall || body.functionCall || {};
        const result = await handleFunctionCall(
          fnCall.name,
          fnCall.parameters || {},
          metadata
        );
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      case "status-update": {
        const status = body.message?.status || body.status;
        await handleStatusUpdate(status, metadata);
        return new Response("OK", { status: 200 });
      }

      case "end-of-call-report": {
        await handleEndOfCallReport(body);
        return new Response("OK", { status: 200 });
      }

      default:
        console.log("Unhandled event type:", messageType);
        return new Response("OK", { status: 200 });
    }
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
