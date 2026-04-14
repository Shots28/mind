import { getSupabaseAdmin } from "./supabase-admin.ts";
import { getUserContext } from "./agent-actions.ts";

// VAPI rejects assistant-level `tools` ("assistant.property tools should not
// exist"); tools must be nested under `model.tools`. Each tool is marked
// `async: true` so VAPI does not pause the conversation waiting for the
// webhook — the LLM keeps talking while the DB write happens in the
// background. Per-tool `server.url` is omitted; the top-level `server`
// below routes all tool-call events (and carries the shared secret).
function buildToolDefinitions() {
  return [
    {
      type: "function",
      async: true,
      function: {
        name: "mark_habit_done",
        description: "Mark a specific habit as completed for today. Fire-and-forget: the LLM should acknowledge and move on without waiting for confirmation.",
        parameters: {
          type: "object",
          properties: {
            habit_name: { type: "string", description: "Name of the habit to mark as done" },
          },
          required: ["habit_name"],
        },
      },
    },
    {
      type: "function",
      async: true,
      function: {
        name: "complete_task",
        description: "Mark an existing task as completed. Fire-and-forget: acknowledge and move on without waiting.",
        parameters: {
          type: "object",
          properties: {
            task_title: { type: "string", description: "Title of the task to mark as completed" },
          },
          required: ["task_title"],
        },
      },
    },
    {
      type: "function",
      async: true,
      function: {
        name: "create_task",
        description: "Create a new task for the user. Fire-and-forget: acknowledge and move on without waiting.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Task title" },
            due_date: { type: "string", description: "Due date in YYYY-MM-DD format, optional" },
            priority: { type: "string", enum: ["urgent", "high", "normal", "low"], description: "Task priority, defaults to normal" },
          },
          required: ["title"],
        },
      },
    },
    {
      type: "function",
      async: true,
      function: {
        name: "create_journal_entry",
        description: "Save a journal entry from the conversation. Fire-and-forget: acknowledge and move on without waiting.",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "The journal entry content, written in first person from the user's perspective" },
            mood: { type: "string", enum: ["great", "good", "okay", "bad", "terrible"], description: "The user's mood" },
          },
          required: ["content"],
        },
      },
    },
    // VAPI built-in: ends the phone call. Without this, the LLM can SAY
    // "goodbye" but has no mechanism to actually terminate — the line stays
    // open until the silence timeout or the user hangs up. Any wrap-up
    // utterance must be followed by calling this tool.
    { type: "endCall" },
  ];
}

function buildSystemPrompt(
  userName: string,
  context: Awaited<ReturnType<typeof getUserContext>>
) {
  const today = context.today;

  let habitsSection = "";
  if (context.habits.length > 0) {
    habitsSection = context.habits
      .map((h: { title: string; done: boolean }) => `- ${h.title}: ${h.done ? "DONE" : "NOT DONE"}`)
      .join("\n");
  } else {
    habitsSection = "No habits set up yet.";
  }

  let tasksSection = "";
  if (context.tasks.length > 0) {
    tasksSection = context.tasks
      .slice(0, 10)
      .map((t: { title: string; due_date: string | null; priority: string }) =>
        `- ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ""}${t.priority !== "normal" ? ` [${t.priority}]` : ""}`)
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
Wrap up warmly in one sentence, THEN immediately call the endCall tool to
hang up. Do NOT say you'll end the call and then keep talking or wait for
the user to hang up — you must actively terminate via endCall.

## RULES
- Warm but concise. One sentence at a time. Never monologue.
- Confirm the user's intent verbally before calling a tool (e.g., "So I'll mark
  meditation as done, yep?"). You do NOT need to wait for a tool result before
  continuing — tools run in the background. After calling one, flow straight
  into the next thing naturally. Never say "let me check" or "one moment" or
  pause for a tool.
- Never give advice or opinions unless explicitly asked.
- If they want to skip everything, wrap up warmly without guilt-tripping.
- If they go off-topic, gently steer back after a moment.
- Total call should be under 5 minutes when covering all sections.
- NEVER recite the same phrases. Vary your language every call to feel natural.`;
}

export async function buildAssistantConfig(
  userId: string,
  callId: string,
  webhookUrl: string,
  voiceId?: string | null
) {
  const admin = getSupabaseAdmin();

  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const userName =
    userData?.user?.user_metadata?.full_name ||
    userData?.user?.email?.split("@")[0] ||
    "there";

  // Fetch user's timezone for correct date/day-of-week in system prompt
  const { data: prefData } = await admin
    .from("call_preferences")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  const context = await getUserContext(userId, prefData?.timezone);
  const systemPrompt = buildSystemPrompt(userName, context);

  // Pass the webhook secret inline so VAPI includes `x-vapi-secret` on every
  // webhook POST. Without this, our handler's secret check returns 401 on
  // every tool call, which silently drops mark_habit_done / complete_task /
  // etc. — exactly the "tools didn't work" symptom users reported.
  const webhookSecret = Deno.env.get("VAPI_WEBHOOK_SECRET");

  return {
    server: {
      url: webhookUrl,
      ...(webhookSecret ? { secret: webhookSecret } : {}),
    },
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      tools: buildToolDefinitions(),
    },
    voice: {
      provider: "11labs",
      voiceId: voiceId || "21m00Tcm4TlvDq8ikWAM",
    },
    maxDurationSeconds: 600,
    silenceTimeoutSeconds: 30,
    metadata: {
      userId,
      callId,
    },
  };
}
