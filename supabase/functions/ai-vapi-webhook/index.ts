import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  getUserContext,
  markHabitDone,
  completeTask,
  createTask,
  createJournalEntry,
} from "../_shared/agent-actions.ts";

const VAPI_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "mark_habit_done",
      description: "Mark a specific habit as completed for today",
      parameters: {
        type: "object",
        properties: {
          habit_name: {
            type: "string",
            description: "Name of the habit to mark as done",
          },
        },
        required: ["habit_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark an existing task as completed",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description: "Title of the task to mark as completed",
          },
        },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task for the user",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          due_date: {
            type: "string",
            description: "Due date in YYYY-MM-DD format, optional",
          },
          priority: {
            type: "string",
            enum: ["urgent", "high", "normal", "low"],
            description: "Task priority, defaults to normal",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_journal_entry",
      description: "Save a journal entry from the conversation",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "The journal entry content, written in first person from the user's perspective",
          },
          mood: {
            type: "string",
            enum: ["great", "good", "okay", "bad", "terrible"],
            description: "The user's mood",
          },
        },
        required: ["content"],
      },
    },
  },
];

function buildSystemPrompt(
  userName: string,
  context: Awaited<ReturnType<typeof getUserContext>>
) {
  const today = context.today;

  let habitsSection = "";
  if (context.habits.length > 0) {
    habitsSection = context.habits
      .map(
        (h: { title: string; done: boolean }) =>
          `- ${h.title}: ${h.done ? "DONE" : "NOT DONE"}`
      )
      .join("\n");
  } else {
    habitsSection = "No habits set up yet.";
  }

  let tasksSection = "";
  if (context.tasks.length > 0) {
    tasksSection = context.tasks
      .slice(0, 10)
      .map(
        (t: { title: string; due_date: string | null; priority: string }) =>
          `- ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ""}${t.priority !== "normal" ? ` [${t.priority}]` : ""}`
      )
      .join("\n");
  } else {
    tasksSection = "No pending tasks.";
  }

  const journalNote =
    context.daysSinceLastJournal !== null
      ? `Last journal entry was ${context.daysSinceLastJournal} day${context.daysSinceLastJournal !== 1 ? "s" : ""} ago.`
      : "No journal entries yet.";

  return `You are ${userName}'s daily check-in partner from Zenith. Today is ${today}.

You follow a structured check-in with 3 sections: habits, tasks, and journaling.
Before each section, ask if they want to cover it. If they decline, move on
immediately without pushing. Never use the same phrasing twice across calls --
vary your wording naturally while keeping the same intent.

## CALL FLOW

### 1. Opening
Greet them warmly by name. Keep it brief -- one sentence. Then go straight into
the first section (habits). Do NOT preview all sections or ask if the overall
structure sounds good. Just start.

### 2. Section: Habits
Ask if they want to go over their habits. Vary how you ask each time.

If YES:
Go through each habit due today, one at a time:
${habitsSection}

For habits already marked DONE: briefly acknowledge it and move on.
For habits NOT DONE: ask if they completed it, in a natural way.
  - If they say yes: confirm and call mark_habit_done. Acknowledge naturally.
  - If they say no: be encouraging, zero judgment. Move on quickly.

If NO: Acknowledge and move to the next section.

### 3. Section: Tasks
Ask if they want to cover tasks.

If YES:
Do NOT read out their full task list -- it's too long and wastes time. Instead:
  - Ask if they completed anything today they want to check off. If yes, use
    complete_task to mark it done.
  - Ask if they have anything new to add. If yes, confirm the title, then use
    create_task. Default priority to normal unless they specify otherwise.
  - Keep this section quick and conversational.

Their current tasks for reference (do NOT read these out loud):
${tasksSection}

If NO: Acknowledge and move on.

### 4. Section: Journal
Ask if they'd like to do a quick journal reflection.
${journalNote}

If YES:
  - Prompt them with an open-ended question about their day, feelings, or thoughts.
    Vary the prompt each time.
  - LISTEN. Let them talk. Use brief natural affirmations.
  - Ask at most 1-2 follow-ups if they seem to want to continue.
  - When they wind down, briefly summarize what they shared and ask if they'd like
    it saved as a journal entry.
  - If yes: call create_journal_entry with a clean, first-person version of what
    they said. Ask about mood if it wasn't clear from context.

If NO: Acknowledge.

### 5. Closing
Wrap up warmly. Keep it to one sentence.

## RULES
- Warm but concise. One sentence at a time. Never monologue.
- Always confirm before taking any action.
- Never give advice or opinions unless explicitly asked.
- If they want to skip everything, wrap up warmly without guilt-tripping.
- If they go off-topic, gently steer back after a moment.
- Total call should be under 5 minutes when covering all sections.
- NEVER recite the same phrases. Vary your language every call to feel natural.`;
}

// Handle assistant-request: return dynamic assistant config
async function handleAssistantRequest(metadata: Record<string, string>) {
  const userId = metadata?.userId;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing userId" }), {
      status: 400,
    });
  }

  const admin = getSupabaseAdmin();

  // Get user info
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const userName =
    userData?.user?.user_metadata?.full_name ||
    userData?.user?.email?.split("@")[0] ||
    "there";

  // Get voice preference
  const { data: prefs } = await admin
    .from("call_preferences")
    .select("voice_id")
    .eq("user_id", userId)
    .single();

  const context = await getUserContext(userId);
  const systemPrompt = buildSystemPrompt(userName, context);

  return new Response(
    JSON.stringify({
      assistant: {
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }],
          tools: VAPI_TOOL_DEFINITIONS,
        },
        voice: {
          provider: "11labs",
          voiceId: prefs?.voice_id || "21m00Tcm4TlvDq8ikWAM", // default Rachel
        },
        maxDurationSeconds: 600,
        silenceTimeoutSeconds: 30,
        metadata,
      },
    }),
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
  const metadata = (body.message as Record<string, unknown>)?.metadata as Record<string, string> ||
    body.metadata as Record<string, string>;
  const callId = metadata?.callId;
  const userId = metadata?.userId;

  if (!callId || !userId) return;

  const admin = getSupabaseAdmin();

  const endedReason = (body.message as Record<string, unknown>)?.endedReason as string || body.endedReason as string;
  const transcript = (body.message as Record<string, unknown>)?.transcript as string || body.transcript as string || "";
  const durationSeconds = (body.message as Record<string, unknown>)?.durationSeconds as number ||
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
  const messageType =
    body.message?.type || body.type;

  try {
    switch (messageType) {
      case "assistant-request": {
        const metadata = body.message?.metadata || body.metadata || {};
        return await handleAssistantRequest(metadata);
      }

      case "function-call": {
        const fnCall = body.message?.functionCall || body.functionCall || {};
        const metadata = body.message?.metadata || body.metadata || {};
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
        const metadata = body.message?.metadata || body.metadata || {};
        await handleStatusUpdate(status, metadata);
        return new Response("OK", { status: 200 });
      }

      case "end-of-call-report": {
        await handleEndOfCallReport(body);
        return new Response("OK", { status: 200 });
      }

      default:
        return new Response("OK", { status: 200 });
    }
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
