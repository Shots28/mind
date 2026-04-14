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

### 3. VAPI tool-calls silently no-op'd (from prior session, committed this pass)

**Symptom:** Voice assistant's `mark_habit_done`, `complete_task`, `create_task`, `create_journal_entry` tool calls returned 200 to VAPI but never wrote to the DB. Users heard the assistant say "marked done" but the UI didn't reflect it.

**Root cause:** VAPI `tool-calls` events omit `message.call.metadata`, so `metadata.userId` was undefined and every tool call hit a silent `if (!userId) return` guard.

**Fix:** Added a fallback in the webhook handler: when metadata lacks `userId`, look up the call row by the `X-Call-Id` header (which VAPI always sets) and recover `user_id` + internal `callId` from the `calls` table. The rest of the handler is unchanged.

Commit: `50db444` — *Recover VAPI tool-call userId via X-Call-Id header fallback*

## Verified working (no changes needed)

Tasks: quick-add, full modal, completion, drag-reorder, edit-on-click, category filter, context filter. Habits: create, toggle, streak, progress. Journal: Cmd+Enter quick capture, date grouping. Events: calendar Month/Week/Day views, day-panel edit, daily recurrence, read-only Google sync rendering. Projects: create, inline add-task, progress counter. Contexts: switcher filtering. Notifications: due-today + completed. Global search across tasks. Signup onboarding (Welcome → first task prompt → "You're all set" → `/today` with the task present).

## Process notes

- React controlled inputs require the native setter + `input` event dispatch to fill programmatically; `form.requestSubmit()` beats dispatching a synthetic Enter KeyboardEvent.
- Chrome MCP sanitizer strips `outerHTML` with cookie-ish content; use `innerText` for DOM inspection.
- `EventsWidget` and `CalendarView` both need the master-id unwrap (`event._parentId || event.id`) before any `updateEvent`/`deleteEvent` call; recurrence instances are virtual rows, not DB rows.
- Supabase Realtime is *two* things: the client-side `channel(...).on('postgres_changes', ...)` subscription AND server-side membership in the `supabase_realtime` publication. Adding a subscription without publishing the table is a silent no-op — the WebSocket connects, but nothing ever fires. Always pair new Realtime subscriptions with a publication migration.
- `supabase secrets list` shows **digests** (SHA-256-ish hashes), not plaintext values. Can't use it to recover a webhook HMAC secret for local replay; simulate at the DB layer with the service-role key instead.
