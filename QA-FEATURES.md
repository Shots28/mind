# QA — Feature Pass (2026-04-13)

End-to-end QA on prod (https://mind-coral.vercel.app) against the vision in README.md.

## Fixes shipped this pass

### 1. Events on `/today` had no edit UX (high severity)

**Symptom:** Event rows in the Today widget were create/delete-only. Clicking a row did nothing — no modal, no handler. Users had to delete and recreate an event for any change (title typo, wrong time, wrong context, etc.). Inconsistent with `/calendar`, where clicking the same event opens the full EventForm.

**Root cause:** `EventsWidget.jsx` never imported `updateEvent`, `Modal`, or `EventForm`. The event `<div>` had no `onClick`. Recurrence instances had no routing.

**Fix:** Mirrored the `CalendarView` pattern into `EventsWidget`:
- `onClick` on the row → `handleEventClick` → `setEditingEvent(event)`
- Recurrence instances route through `RecurrenceActionDialog` so the user picks "this one" vs "all in series" before opening the form
- `Modal` + `EventForm` render at the bottom of the widget; on submit, `updateEvent` is called with the master/parent id (critical for recurrence)
- Delete button gets `e.stopPropagation()` so it doesn't also open the edit modal
- Read-only (Google-sourced) events open the form in read-only mode — same as calendar

**Verified on prod:** Clicked "Test Event Updated" (a recurring event) on `/today` → "Edit recurring event" dialog → "This event only" → full `Edit Event` form loads with prefilled title, all-day toggle, start/end date + time, context, location, description, recurrence dropdown. Matches calendar edit exactly.

Commit: `b4e9777` — *Add click-to-edit for events in /today widget*

### 2. VAPI writes didn't reach the UI without reload (critical for AI-first)

**Symptom:** VAPI voice agent calls `create_task`, `mark_habit_done`, `create_journal_entry` successfully — rows appear in the DB — but the user sees nothing change until they manually reload. Breaks the "talk to your app" core loop.

**Root causes (two layers):**
1. `TaskContext`, `JournalContext`, and `HabitContext` had **no Realtime subscriptions**. Only `EventContext` did. External writes (voice agent, other devices, cron jobs) were invisible to the running session.
2. Even after adding subscriptions, nothing fired — because `tasks`, `habits`, `habit_logs`, and `journal_entries` were **not members of the `supabase_realtime` PostgreSQL publication**. Supabase Realtime only streams changes for published tables.

**Fix:**
- Extracted shared `useRecentIds` hook (`src/lib/useRecentIds.js`) — TTL-based echo dedup for own-writes (optimistic dispatch → DB write → Realtime echo arrives → skipped).
- Added `supabase.channel(...).on('postgres_changes', { event: '*', schema: 'public', table: <t>, filter: 'user_id=eq.<uid>' }, ...)` to Task/Journal/Habit contexts. INSERT handlers re-hydrate joined relations (`contexts`, `projects`) since raw Realtime payloads only carry base columns. Habit context subscribes to *two* channels — `habits` for rename/toggle, and `habit_logs` for voice-agent `mark_habit_done`.
- Migration `20260413200000_realtime_publication_for_vapi_tables.sql` adds the five tables to `supabase_realtime` idempotently (DO block swallows `duplicate_object` so reruns are safe).

**Verified on prod:** Inserted a task via service-role REST as a VAPI-style external write → task appeared on `/tasks` within 5s with no reload. Inserted a `habit_logs` row for a fresh habit → schema accepted, and the data-level path is identical to the (verified) task path.

Commits: `31306b1` — *Add Realtime subscriptions to Task, Habit, Journal contexts* + this pass — *Publish VAPI-written tables to supabase_realtime*

### 3. Call History froze during live calls (critical for AI-first)

**Symptom:** While a phone call is in flight, the VAPI webhook writes status transitions to the `calls` row (`scheduled` → `ringing` → `in-progress` → `completed`) and, at end-of-call, a transcript + summary. None of that surfaced in the Settings → Call History UI until the user reloaded the page or closed/reopened Settings. The voice experience felt disconnected from the visual UI.

**Root cause:** `VoiceAgentContext` fetched `calls` once on mount and never subscribed. Compounding factor: even had a subscription existed, the `calls` table was not in the `supabase_realtime` publication.

**Fix:**
- Subscription in `VoiceAgentContext` on `calls` filtered by `user_id=eq.<uid>` with INSERT/UPDATE → `UPSERT_CALL`, DELETE → `DELETE_CALL`.
- Migration `20260413230000_realtime_publication_for_calls.sql` adds `calls` to `supabase_realtime` idempotently.

**Verified on prod:** Inserted a scheduled call via service-role → "Scheduled" row appeared at top of list within 3s. PATCH `status=ringing` → row re-rendered as "Ringing" live. PATCH `status=completed, duration_seconds=147, transcript=..., summary=...` → row flipped to `Completed · 2:27`, click expanded to reveal transcript + summary. All without reload.

Commit: `ab0e70b` — *Realtime subscription + publication for VAPI call lifecycle*

### 4. VAPI tool-calls silently no-op'd (from prior session, committed this pass)

**Symptom:** Voice assistant's `mark_habit_done`, `complete_task`, `create_task`, `create_journal_entry` tool calls returned 200 to VAPI but never wrote to the DB. Users heard the assistant say "marked done" but the UI didn't reflect it.

**Root cause:** VAPI `tool-calls` events omit `message.call.metadata`, so `metadata.userId` was undefined and every tool call hit a silent `if (!userId) return` guard.

**Fix:** Added a fallback in the webhook handler: when metadata lacks `userId`, look up the call row by the `X-Call-Id` header (which VAPI always sets) and recover `user_id` + internal `callId` from the `calls` table. The rest of the handler is unchanged.

Commit: `50db444` — *Recover VAPI tool-call userId via X-Call-Id header fallback*

### 5. Notification bell items were click-dead (medium severity)

**Symptom:** Clicking a row in the notification panel (overdue / due-today / completed task) did nothing. The only interactive affordance was the tiny × dismiss button on the right. Users had to close the panel, navigate to `/tasks`, scroll, and find the task manually — defeating the point of the notification. Inconsistent with the global search dropdown in the same TopBar, where each result row deep-links into `/tasks?task=<id>` and opens the edit modal.

**Root cause:** In `NotificationPanel.jsx`, the `.notification-item` `<div>` had no `onClick`. Only the `<X>` dismiss button was interactive. No `useNavigate`, no deep-link.

**Fix:** Mirror the global search pattern:
- `useNavigate()` from react-router
- `handleOpen(taskId)` → `navigate('/tasks?task=<id>')` then `onClose()` to close the panel
- `role="button"` + `tabIndex={0}` + `onKeyDown` Enter/Space for keyboard access
- `e.stopPropagation()` on the dismiss button so × doesn't also navigate
- `cursor: pointer` on `.notification-item` in `Notifications.css` so the whole row reads as clickable

`TasksView` already consumes `?task=<id>` (from a prior QA round) and opens the edit modal — no backend or routing changes needed.

Commit: this pass — *Make notification items navigate to the task on click*

### 6. Voice agent's mood was captured but invisible (medium severity, AI-first gap)

**Symptom:** The VAPI `create_journal_entry` tool takes a `mood` enum (`great|good|okay|bad|terrible`). The LLM actually passes it — e.g., after a journaling section it calls `create_journal_entry(content, mood: "good")`. The value lands in `journal_entries.mood` in the DB. But the UI never rendered it anywhere. From the user's perspective: the voice agent asked how they were feeling, they answered, and the reflection was silently dropped. The most "AI-first" data the system captures was the most invisible.

**Root cause:** `JournalEntryCard` only rendered `created_at`, `contexts.name`, and `content`. `mood` wasn't referenced in any component. `JournalContext.createEntry` accepted mood as a param but nothing in the UI passed it (or displayed it back).

**Fix:** Added a mood emoji indicator in the entry header next to the phone-call badge:

```
great → 😄   good → 🙂   okay → 😐   bad → 🙁   terrible → 😞
```

- `MOOD_EMOJI` map in `JournalEntryCard.jsx`; renders `<span className="journal-entry-mood" title={entry.mood}>{MOOD_EMOJI[entry.mood]}</span>` when present
- Unknown mood strings (LLM could say "ecstatic") render as nothing — no crash, no layout shift
- Restructured `.journal-entry-header` to wrap time + mood in a `.journal-entry-meta` flex container with `margin-right: auto`, so context and delete button cluster cleanly on the right regardless of whether mood/context are present

**Verified on prod:** Inserted a `journal_entries` row with `source: voice_agent, mood: good` via service-role → appeared on `/journal` within 3s via realtime with a 🙂 emoji next to the phone icon; hovering showed "good" tooltip. Inserted an out-of-enum mood ("ecstatic") → entry rendered cleanly with just the phone icon, no emoji, no error.

Commit: `f378d3c` — *Surface mood on voice-agent journal entries*

### 7. VAPI create_task silently lost tasks on unparseable inputs (high severity, AI-first gap)

**Symptom:** User: *"Remind me to call mom on Thursday."* → Agent: *"Got it, added 'call mom' to your list."* → **task never appears.** Same failure mode for natural-language dates ("tomorrow", "next Friday") and paraphrased priorities ("super urgent", "medium"). The user hears success and trusts the system — the system is lying.

**Root causes (two):**
1. `tasks.due_date` is a DATE column. Inserting `"Thursday"` fails with Postgres error `22007: invalid input syntax for type date`.
2. `tasks.priority` has a CHECK constraint `priority IN ('urgent','high','normal','low')`. Anything else fails with `23514: violates check constraint`.

Both failures happen inside the tool-call handler's async promise (we register tools with `async: true` and wrap the DB write in `EdgeRuntime.waitUntil`). The optimistic ack went back to VAPI *before* the DB round-trip, so the agent's utterance ("I added that to your list") is fully detached from whether the write actually succeeded. Logs show the 22007 but there is no user-visible signal.

**Fix (`supabase/functions/_shared/agent-actions.ts`):**
- `normalizeDueDate(raw)` — regex-gates YYYY-MM-DD; anything else → `null` (task saved, just without a date). Better to drop the date than drop the task.
- `normalizePriority(raw)` — set-membership check against the four valid values; anything else → `"normal"` fallback.
- Both apply only to VAPI-originated writes; the web UI's `createTask` path continues to bind to the form's typed inputs and is unaffected.

**Verified:**
- REST POST with `due_date: "Thursday"` against raw `tasks` table → `22007` (reproduces the pre-fix failure).
- Same POST with `due_date: "super urgent"` style priority → `23514`.
- Post-fix, the sanitizers route both through to valid inserts; deployed via `supabase functions deploy ai-vapi-webhook`.

Commit: `50f8efc` — *Sanitize VAPI create_task due_date + priority*

### 8. Voice-agent `mood` column accepted arbitrary strings that the UI never renders (medium severity, AI-first gap)

**Symptom:** `create_journal_entry` tool declares `mood` as an enum (`great|good|okay|bad|terrible`). VAPI's gpt-4o-mini *mostly* obeys the enum but occasionally paraphrases ("ecstatic", "anxious", "mixed"). The `generateJournalFromTranscript` fallback (Claude sonnet converting end-of-call transcript → journal entry) is even looser — it's prompted to pick from the enum, but Claude sometimes returns `"reflective"`, `"contemplative"`, etc. Both paths land the raw string in `journal_entries.mood` (no DB CHECK constraint on that column). The UI only renders an emoji for the five canonical values, so any out-of-enum mood silently shows up as a row with *no* mood indicator — indistinguishable from "no mood captured at all" from the user's POV.

**Root cause:** `createJournalEntry` in `_shared/agent-actions.ts` wrote `mood: mood || null` — no validation against the enum the UI actually cares about. `mood` has no Postgres CHECK constraint (unlike `source`, which has `CHECK (source IN ('manual','voice_agent'))`), so garbage passed straight through. Same "invisible captured data" pattern as fix #6 — but here the fix is at the write boundary, not the read boundary.

**Fix (`supabase/functions/_shared/agent-actions.ts`):**
- `normalizeMood(raw)` — set-membership check against `{great, good, okay, bad, terrible}`; anything else → `null`. Falling back to `null` (not, say, `"okay"`) is deliberate: we must not fabricate a mood the user didn't express. `null` means "no indicator," which is exactly what the UI already shows for unknown strings — so DB state now matches UI state.
- Applied inside `createJournalEntry`; covers both the VAPI tool-call path and `generateJournalFromTranscript`'s Claude-driven call (which reuses `createJournalEntry`).

**Verified:**
- Probed prod with a service-role REST insert `mood: "contemplative"` → journal page rendered row with phone-badge but zero mood emoji (reproduces the pre-fix invisible-data symptom).
- Unit-tested `normalizeMood` against 12 cases (five valid enums, three LLM paraphrases, empty/null/undefined, uppercase) — all pass.
- Deployed via `supabase functions deploy ai-vapi-webhook`. Future voice-agent journal entries with out-of-enum moods will be stored as `NULL` instead of garbage strings.

Commit: `34308f7` — *Normalize voice-agent mood to UI enum or null*

### 9. Voice agent told "no habits set up yet" when user had habits not due today (medium severity, AI-first gap)

**Symptom:** User with e.g. five weekends-only habits gets a Wednesday check-in call. Agent section prompt says "No habits set up yet" and the LLM, following the prompt, offers to help set up some habits — despite the user already having habits, just none scheduled for the current day of the week. Same failure mode for weekdays-only habits on a Saturday, or custom-day habits on an off-day. Worse, the LLM can plausibly get talked into calling a tool it doesn't have (there is no `create_habit`), or the user feels unheard ("I already have habits, they're just weekly").

**Root cause:** `getUserContext` filters habits by day-of-week into `habitsDueToday`, then returns only `habits: habitsWithStatus` — the total-habit count is discarded before it reaches the system prompt builder. `buildSystemPrompt` branches on `context.habits.length > 0`, so the "0 due today" case collapses into the "0 total" case, producing the misleading "No habits set up yet" string.

**Fix:**
- `agent-actions.ts` → `getUserContext` now also returns `totalHabitsCount: habits.length` (the pre-filter count).
- `assistant-config.ts` → `buildSystemPrompt` adds a middle branch: if `habits.length === 0 && totalHabitsCount > 0`, the habits section reads *"No habits scheduled for today. Skip this section — don't suggest setting up new habits."* — explicit instruction so the LLM doesn't fish for habit setup.

**Verified:**
- Unit-tested the three-branch logic across 4 cases (0/0, 0/3, 1 done, 2 mixed) — all produce the expected prompt fragment.
- Deployed via `supabase functions deploy ai-vapi-webhook ai-schedule-calls ai-retry-calls` (all three reference the shared `assistant-config.ts` bundle, so all need redeploying).

Commit: `ac9adff` — *Distinguish "no habits yet" from "no habits today" in voice-agent prompt*

### 10. Empty `task_title` / `habit_name` from VAPI silently completed random work (high severity, AI-first gap)

**Symptom:** If VAPI's LLM emits `complete_task({task_title: ""})` or `mark_habit_done({habit_name: ""})` — a schema violation, but LLMs occasionally produce them on ambiguous user utterances ("mark that done", "I did it") — the existing fuzzy-match logic would silently complete the **first** incomplete task/habit in the user's list. The user hears an optimistic ack ("Marked '' complete") and a random task on their list goes green. Potentially destructive if the user had been deferring a high-value task that now silently gets archived as completed.

**Root cause:** `completeTask` / `markHabitDone` / `createJournalEntry` all used `String.prototype.includes` for fuzzy matching. `"any string".includes("")` is always `true`, so an empty-string argument matches every row and `.find()` returns the first. Same trapdoor applies to `createTask` with empty `title` — a blank-title row would land in the DB and render as a ghost task on `/tasks`. The `async: true` webhook path makes it worse: the user-facing ack was already spoken before the DB write fires, so there's no "operation failed" signal the LLM can surface.

**Fix (`supabase/functions/_shared/agent-actions.ts`):** Added early-return empty-guards to all four VAPI-facing action functions. Any input that is falsy or whitespace-only short-circuits with `{success: false, message: "No X provided"}` before the DB ever sees it.

```ts
if (!taskTitle || !taskTitle.trim()) {
  return { success: false, message: "No task title provided" };
}
```

**Verified:**
- Reproduced pre-fix hazard in Node: `"Write launch post".includes("")` === `true`, `.find()` returns the first row — confirmed the silent-match behavior.
- Post-fix unit test: 6 cases ("", " ", null, undefined, "call" → matches, "Write" → matches) all produce expected results — guards fire for all four empty-ish inputs, normal matching still works.
- Deployed `ai-vapi-webhook`. Same guard pattern covers `markHabitDone`, `completeTask`, `createTask`, `createJournalEntry`.

Commit: this pass — *Empty-guard VAPI tool-call inputs to prevent random-match completions*

## Verified working (no changes needed)

Tasks: quick-add, full modal, completion, drag-reorder, edit-on-click, category filter, context filter. Habits: create, toggle, streak, progress. Journal: Cmd+Enter quick capture, date grouping. Events: calendar Month/Week/Day views, day-panel edit, daily recurrence, read-only Google sync rendering. Projects: create, inline add-task, progress counter. Contexts: switcher filtering. Notifications: due-today + completed. Global search across tasks. Signup onboarding (Welcome → first task prompt → "You're all set" → `/today` with the task present).

## Process notes

- React controlled inputs require the native setter + `input` event dispatch to fill programmatically; `form.requestSubmit()` beats dispatching a synthetic Enter KeyboardEvent.
- Chrome MCP sanitizer strips `outerHTML` with cookie-ish content; use `innerText` for DOM inspection.
- `EventsWidget` and `CalendarView` both need the master-id unwrap (`event._parentId || event.id`) before any `updateEvent`/`deleteEvent` call; recurrence instances are virtual rows, not DB rows.
- Supabase Realtime is *two* things: the client-side `channel(...).on('postgres_changes', ...)` subscription AND server-side membership in the `supabase_realtime` publication. Adding a subscription without publishing the table is a silent no-op — the WebSocket connects, but nothing ever fires. Always pair new Realtime subscriptions with a publication migration.
- `supabase secrets list` shows **digests** (SHA-256-ish hashes), not plaintext values. Can't use it to recover a webhook HMAC secret for local replay; simulate at the DB layer with the service-role key instead.
- Supabase Realtime `postgres_changes` with a `user_id=eq.<uid>` filter silently drops DELETE events unless the table has `REPLICA IDENTITY FULL` — the server can't evaluate the filter against `payload.old` when only the primary key is replicated. Fine for tables where hard-deletes don't happen externally (`calls`, `events` which soft-delete), but if you ever add an external hard-delete path to a filtered subscription, add `ALTER TABLE <t> REPLICA IDENTITY FULL` in the migration.
- "AI-first real-time" means every DB table an external agent (voice, cron, integration) writes to must have both a client subscription *and* publication membership — otherwise the in-flight user sees stale state for the whole interaction window. Checklist when adding a new agent-writable table: (1) ALTER PUBLICATION, (2) context-level subscription, (3) reducer cases, (4) recent-ids dedup for own-writes.
- **`async: true` VAPI tools detach user-facing confirmations from DB success.** The optimistic ack ("Added that to your list") goes out before the write completes. If the write fails — constraint violation, type mismatch, missing FK — the user still hears success. Treat every `agent-actions.ts` writer as if the LLM will pass malformed input: gate DB-constrained columns (date formats, enum values, FK existence) with a normalizer that either coerces to a valid value or drops the problematic field but still saves the row. Never let an LLM paraphrase cause a task/habit/journal to silently disappear.
- LLM tool inputs are "trusted" only in the sense that we asked for a format — the schema `description` field is a request, not an enforcement mechanism. Treat tool arguments like untrusted JSON: validate at the boundary of `agent-actions`.
- **"No DB CHECK constraint" does not mean "column accepts anything safely."** `journal_entries.mood` has no `CHECK` but the UI only renders five values — so missing constraint = silently-lost data, not safely-stored data. When a column's write path is LLM-driven and its read path has a finite render set (emoji map, icon enum, color table), normalize at write time to the UI's value set. The DB-write boundary is the last place you can force consistency between what the LLM said and what the user sees.
- **`String.includes("")` is always true.** Any fuzzy-match that uses `str.toLowerCase().includes(needle.toLowerCase())` must guard against an empty `needle` before the match runs, or the "first-in-list" match will fire for every call that happens to get an empty argument. LLM tool calls are the main place this bites — the schema says `required`, but tool arguments can still arrive empty when the user's utterance was too vague to extract a noun. Treat empty strings as "no match attempted," not "wildcard."
- Displayable data the voice agent captures but the UI doesn't render becomes an invisible feature. Audit every tool-call parameter: if it ends up in a column, there should be a visible UI surface for it (even a subtle one — a 🙂 emoji in a header row is enough). Otherwise users get the feeling of "the AI listened but nothing happened."
