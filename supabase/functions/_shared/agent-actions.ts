import { getSupabaseAdmin } from "./supabase-admin.ts";

// Get user's current context for building the AI system prompt
export async function getUserContext(userId: string, timezone?: string) {
  const admin = getSupabaseAdmin();
  const now = new Date();

  // Use user's timezone for date/day calculations to avoid UTC mismatch
  // e.g., 9 PM Denver = 3 AM UTC next day — without this, habits/date would be wrong
  const tz = timezone || "UTC";
  const today = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const dayStr = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const dayOfWeek = dayMap[dayStr] ?? now.getDay();

  // Fetch habits, today's logs, pending tasks, and last journal entry in parallel
  const [habitsRes, logsRes, tasksRes, journalRes] = await Promise.all([
    admin
      .from("habits")
      .select("id, title, frequency, custom_days, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("position"),
    admin
      .from("habit_logs")
      .select("habit_id")
      .eq("user_id", userId)
      .eq("date", today),
    admin
      .from("tasks")
      .select("id, title, due_date, priority, category")
      .eq("user_id", userId)
      .eq("is_completed", false)
      .order("priority")
      .limit(20),
    admin
      .from("journal_entries")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const habits = habitsRes.data || [];
  const todayLogs = new Set((logsRes.data || []).map((l: { habit_id: string }) => l.habit_id));
  const tasks = tasksRes.data || [];
  const lastJournal = journalRes.data?.[0];

  // Filter habits due today
  const habitsDueToday = habits.filter((h: { frequency: string; custom_days?: number[] }) => {
    switch (h.frequency) {
      case "daily":
        return true;
      case "weekdays":
        return dayOfWeek >= 1 && dayOfWeek <= 5;
      case "weekends":
        return dayOfWeek === 0 || dayOfWeek === 6;
      case "custom":
        return h.custom_days?.includes(dayOfWeek) ?? false;
      default:
        return true;
    }
  });

  const habitsWithStatus = habitsDueToday.map((h: { id: string; title: string }) => ({
    title: h.title,
    done: todayLogs.has(h.id),
    id: h.id,
  }));

  // Days since last journal entry
  let daysSinceLastJournal = null;
  if (lastJournal) {
    const lastDate = new Date(lastJournal.created_at);
    const now = new Date();
    daysSinceLastJournal = Math.floor(
      (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    habits: habitsWithStatus,
    tasks: tasks.map((t: { id: string; title: string; due_date: string | null; priority: string; category: string }) => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      priority: t.priority,
      category: t.category,
    })),
    daysSinceLastJournal,
    today,
  };
}

// Get user's local date in YYYY-MM-DD format
async function getUserLocalDate(userId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("call_preferences")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const tz = data?.timezone || "UTC";
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

// Mark a habit as done for today
export async function markHabitDone(userId: string, habitName: string) {
  const admin = getSupabaseAdmin();
  const today = await getUserLocalDate(userId);

  // Find matching habit (case-insensitive)
  const { data: habits } = await admin
    .from("habits")
    .select("id, title")
    .eq("user_id", userId)
    .eq("is_active", true);

  const habit = (habits || []).find(
    (h: { title: string }) => h.title.toLowerCase() === habitName.toLowerCase()
  ) || (habits || []).find(
    (h: { title: string }) => h.title.toLowerCase().includes(habitName.toLowerCase())
  );

  if (!habit) {
    return { success: false, message: `Could not find a habit matching "${habitName}"` };
  }

  // Check if already logged
  const { data: existing } = await admin
    .from("habit_logs")
    .select("id")
    .eq("habit_id", habit.id)
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    return { success: true, message: `${habit.title} is already marked as done for today` };
  }

  const { error } = await admin.from("habit_logs").insert({
    habit_id: habit.id,
    user_id: userId,
    date: today,
  });

  if (error) {
    return { success: false, message: `Failed to mark ${habit.title} as done: ${error.message}` };
  }

  return { success: true, message: `Marked ${habit.title} as done for today` };
}

// Complete an existing task
export async function completeTask(userId: string, taskTitle: string) {
  const admin = getSupabaseAdmin();

  // Find matching task (case-insensitive)
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title")
    .eq("user_id", userId)
    .eq("is_completed", false);

  const task = (tasks || []).find(
    (t: { title: string }) => t.title.toLowerCase() === taskTitle.toLowerCase()
  ) || (tasks || []).find(
    (t: { title: string }) => t.title.toLowerCase().includes(taskTitle.toLowerCase())
  );

  if (!task) {
    return { success: false, message: `Could not find a task matching "${taskTitle}"` };
  }

  const { error } = await admin
    .from("tasks")
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq("id", task.id);

  if (error) {
    return { success: false, message: `Failed to complete ${task.title}: ${error.message}` };
  }

  return { success: true, message: `Completed task: ${task.title}` };
}

// VAPI's LLM is instructed to pass YYYY-MM-DD, but it occasionally slips in
// "tomorrow", "Thursday", or a relative phrase. The DB is DATE-typed and
// rejects those with 22007, which in the webhook's async path means the
// optimistic ack already went out ("Added that to your list") but the task
// never actually landed. Better to drop the bad date and still save the task.
function normalizeDueDate(raw?: string): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

// tasks.priority has a CHECK constraint accepting only these four values.
// The tool schema declares the same enum, but the LLM sometimes paraphrases
// ("super urgent", "medium"). Same async-fail mode as the date — fall back
// to "normal" instead of dropping the task on the floor.
const VALID_PRIORITIES = new Set(["urgent", "high", "normal", "low"]);
function normalizePriority(raw?: string): string {
  return raw && VALID_PRIORITIES.has(raw) ? raw : "normal";
}

// Mood has no DB CHECK constraint, but the UI only renders an emoji for these
// five values (JournalEntryCard.MOOD_EMOJI). VAPI's gpt-4o-mini and Claude's
// transcript-to-journal path both occasionally paraphrase ("ecstatic",
// "reflective", "anxious") — those strings land in the row but render as
// nothing, so the user-visible effect is indistinguishable from "no mood
// captured." Coerce unknowns to null so the DB state matches the UI state
// (mood IS NULL = no indicator).
const VALID_MOODS = new Set(["great", "good", "okay", "bad", "terrible"]);
function normalizeMood(raw?: string | null): string | null {
  if (!raw) return null;
  return VALID_MOODS.has(raw) ? raw : null;
}

// Create a new task
export async function createTask(
  userId: string,
  title: string,
  dueDate?: string,
  priority?: string
) {
  const admin = getSupabaseAdmin();

  const { error } = await admin.from("tasks").insert({
    user_id: userId,
    title,
    due_date: normalizeDueDate(dueDate),
    priority: normalizePriority(priority),
    category: "up_next",
    is_completed: false,
  });

  if (error) {
    return { success: false, message: `Failed to create task: ${error.message}` };
  }

  return { success: true, message: `Created task: ${title}` };
}

// Create a journal entry from voice call
export async function createJournalEntry(
  userId: string,
  content: string,
  mood?: string,
  callId?: string
) {
  const admin = getSupabaseAdmin();

  const { error } = await admin.from("journal_entries").insert({
    user_id: userId,
    content,
    mood: normalizeMood(mood),
    call_id: callId || null,
    source: "voice_agent",
  });

  if (error) {
    return { success: false, message: `Failed to create journal entry: ${error.message}` };
  }

  return { success: true, message: "Journal entry saved" };
}
