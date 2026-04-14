# Voice AI Agent - QA Findings & Fixes

**Date:** 2026-04-13
**Tester:** QA (automated)
**Environment:** Production (mind-coral.vercel.app)

---

## Bugs Found & Fixed

### 1. VAPI Webhook Event Type Mismatch (Critical)

**Symptom:** Tool calls (mark_habit_done, complete_task, create_task, create_journal_entry) all silently failed. The AI would try to execute actions but nothing happened in the database.

**Root Cause:** The webhook handler listened for `function-call` events, but VAPI sends `tool-calls` events. The event type never matched, so the handler fell through to the default case and returned `200 OK` with no action taken.

**Fix:** Added a `tool-calls` case to the webhook handler that processes `toolCallList[]` and returns the `{ results: [{ toolCallId, result }] }` format VAPI expects.

**File:** `supabase/functions/ai-vapi-webhook/index.ts`

---

### 2. VAPI Response Format Mismatch (Critical)

**Symptom:** Even if the event type matched, the response format was wrong.

**Root Cause:** The webhook returned `{ result: "..." }` but VAPI expects `{ results: [{ toolCallId: "...", result: "..." }] }` with the tool call ID echoed back.

**Fix:** Updated the tool-calls handler to build a `results` array with `toolCallId` from each `toolCall.id`.

**File:** `supabase/functions/ai-vapi-webhook/index.ts`

---

### 3. Metadata Extraction Path Wrong (Critical)

**Symptom:** `userId` was always `undefined` in webhook handlers, causing all database operations to fail silently (habits, tasks, journal entries all require userId).

**Root Cause:** VAPI nests call metadata at `body.message.call.metadata`, but the webhook was reading from `body.message.metadata` (which doesn't exist).

**Fix:** Updated all metadata extraction to check `body.message.call.metadata` first, then fall back to `body.message.metadata` and `body.metadata`.

**Files:** `supabase/functions/ai-vapi-webhook/index.ts` (main handler + end-of-call-report)

---

### 4. Tools Defined in Wrong Location (Medium)

**Symptom:** Tool calls interrupted the AI conversation flow, causing unnatural pauses.

**Root Cause:** Tools were defined inside `model.tools` (OpenAI-style function definitions). This makes them synchronous model-level tools. For VAPI server-side execution, tools should be at the `assistant.tools` level with a `server.url` pointing to the webhook.

**Fix:** Moved tool definitions from `model.tools` to `assistant.tools` with `server: { url: webhookUrl }` on each tool. The model config now only has system prompt messages, no tools.

**File:** `supabase/functions/_shared/assistant-config.ts`

---

### 5. Inline Assistant Config Missing (Medium - previously fixed)

**Symptom:** VAPI calls had no instructions. AI just said "Hey, how can I help you today?" instead of following the structured check-in flow.

**Root Cause:** The scheduler passed a partial `assistant` object with only `serverUrl` and `metadata`, no model/voice/prompt. VAPI used it as-is.

**Fix:** Built full inline assistant config with model (gpt-4o-mini), voice (11labs), system prompt, tools, and serverUrl.

**File:** `supabase/functions/_shared/assistant-config.ts` (new shared module)

---

### 6. CORS + Auth for Test Calls (Medium - previously fixed)

**Symptom:** "Call Me Now" button failed with 401 on the CORS preflight OPTIONS request.

**Root Cause:** The scheduler function checked auth before handling CORS, and only accepted the service role key (not user JWTs).

**Fix:** Added CORS handling at the top of the request handler. Added dual auth: JWT verification for test calls (`test_user_id` in body), service role key for CRON.

**File:** `supabase/functions/ai-schedule-calls/index.ts`

---

### 7. End-of-Call Transcript Extraction (Minor)

**Symptom:** Transcript not being saved from end-of-call reports.

**Root Cause:** VAPI nests the transcript inside `message.artifact.transcript`, not `message.transcript`.

**Fix:** Added `artifact.transcript` as the primary extraction path.

**File:** `supabase/functions/ai-vapi-webhook/index.ts`

---

## Code Refactoring

### Shared Assistant Config Module

Created `supabase/functions/_shared/assistant-config.ts` to eliminate code duplication across three functions:

- **Before:** `ai-schedule-calls`, `ai-retry-calls`, and `ai-vapi-webhook` each had their own inline copies of `VAPI_TOOL_DEFINITIONS` and `buildSystemPrompt()` (~200 lines duplicated 3x).
- **After:** Single shared module exports `buildAssistantConfig()` that all three import.

---

## Features Verified Working

| Feature | Status | Notes |
|---------|--------|-------|
| Task create (Must Do) | Pass | Instant add via inline input |
| Task complete | Pass | Progress ring updates to 100% |
| Task in Up Next | Pass | Separate category |
| Habit create | Pass | Modal with name, frequency, color |
| Habit toggle | Pass | Strikethrough + streak counter |
| Habit progress | Pass | 7-day chart, percentage |
| Journal quick capture | Pass | Cmd+Enter from Today view |
| Journal history | Pass | Grouped by date, timestamps |
| Calendar month view | Pass | Tasks shown on day panel |
| Voice agent onboarding | Pass | 5-step flow, settings persist |
| Call Me Now | Pass | Dispatches VAPI call, toast confirms |
| Call History | Pass | Shows scheduled/failed calls with timestamps |
| Settings panel | Pass | All AI check-in controls render correctly |

---

## QA Round 2 — Additional Bugs Found & Fixed

### 8. "Call Me Now" Silently Blocked by Duplicate Check (Medium)

**Symptom:** Clicking "Call Me Now" appeared to succeed (no error) but no call was actually dispatched. Call History showed no new entry.

**Root Cause:** The scheduler's duplicate-call-per-day check (`not status in ('failed','no-answer')`) found an existing "scheduled" call from earlier and skipped the user. Test calls were subject to the same guards as CRON-scheduled calls.

**Fix:** Wrapped the duplicate-call and monthly-limit checks in `if (!testUserId)` so test calls bypass both guards. Also added response body checking in the frontend — `triggerTestCall()` now throws an error if `scheduled: 0` comes back, which surfaces as an error toast.

**Files:** `supabase/functions/ai-schedule-calls/index.ts`, `src/contexts/VoiceAgentContext.jsx`

---

### 9. Dead Code in Day-of-Week Detection (Minor)

**Symptom:** No user-facing impact, but 22 lines of convoluted dead code cluttered `isUserDueForCall()`.

**Root Cause:** An earlier attempt at day-of-week detection using nested ternaries and `parseInt` was left in place after a simpler approach was added below it. The variable `dayOfWeek` was computed but never used — only `userDayOfWeek` was referenced.

**Fix:** Removed the dead code block (lines 220-241).

**File:** `supabase/functions/ai-schedule-calls/index.ts`

---

## QA Round 2 — Additional Features Verified

| Feature | Status | Notes |
|---------|--------|-------|
| Projects — create | Pass | Name, description, context, color picker |
| Projects — add/complete task | Pass | Inline add, progress bar updates |
| Tasks — By Project grouping | Pass | Groups under project name |
| Tasks — Completed filter | Pass | Strikethrough, green checkmarks, project tags |
| Search | Pass | Instant results matching task names |
| Notification bell | Pass | Shows due-today + completed notifications |
| "+ New" sidebar button | Pass | Opens full New Task modal |
| Context filter dropdown | Pass | Opens, shows All Contexts |
| Today — date navigation | Pass | Previous/next day arrows, "Today" link back |
| Today — past day view | Pass | Shows correct habits/tasks for that date |
| Habits view — progress chart | Pass | 7-day chart, streak counters |
| Settings — frequency change | Pass | Switches between daily/weekdays/custom, persists across reload |
| Settings — custom day picker | Pass | Day pills toggle on/off correctly |
| Call Me Now (after fix) | Pass | New call created and dispatched to VAPI |
| Call History — new entry | Pass | Shows the newly dispatched call |

---

## QA Round 3 — Additional Bugs Found & Fixed

### 10. UTC Timezone Bug in Voice Agent Context (Critical)

**Symptom:** If a user in America/Denver gets called at 9 PM local time, the AI system prompt would say the wrong date and check the wrong day's habits.

**Root Cause:** `getUserContext()` used `new Date().toISOString().split("T")[0]` and `new Date().getDay()` for date and day-of-week, which are UTC-based. A 9 PM Denver call is 3 AM UTC the next day, so the system prompt would say "Today is Tuesday" when the user is still on Monday, and check Tuesday's habits instead of Monday's.

**Fix:** 
- `getUserContext()` now accepts an optional `timezone` parameter and uses `toLocaleDateString("en-CA", { timeZone })` and `Intl.DateTimeFormat` for timezone-correct date/day.
- `buildAssistantConfig()` now fetches the user's timezone from `call_preferences` and passes it to `getUserContext()`.
- Added `getUserLocalDate()` helper for `markHabitDone()` so habits are logged to the correct local date during calls.

**Files:** `supabase/functions/_shared/agent-actions.ts`, `supabase/functions/_shared/assistant-config.ts`

---

### 11. Journal View Shows "Ctrl+Enter" on Mac (Minor)

**Symptom:** The Journal view's compose area shows "Ctrl+Enter to submit" and the empty state tip says "Use Ctrl+Enter to submit quickly" — but on Mac it should say "⌘+Enter" (matching the Today view's Capture Thought widget).

**Root Cause:** Hardcoded "Ctrl+Enter" string in `JournalView.jsx`, while `JournalWidget.jsx` correctly uses "⌘+Enter".

**Fix:** Changed to platform-aware hint using `navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'`.

**File:** `src/views/JournalView.jsx`

---

## QA Round 3 — Additional Features Verified

| Feature | Status | Notes |
|---------|--------|-------|
| Active toggle — off | Pass | Toggle turns grey, Call Me Now disabled |
| Active toggle — persistence | Pass | Survives page reload |
| Voice change | Pass | Changed to Rachel, label updated, persists across reload |
| Context filter dropdown | Pass | Opens, shows All Contexts + Work (newly created) |
| Context — create | Pass | "Work" context created, appears in dropdown immediately |
| Calendar — Month view | Pass | Today highlighted, tasks on day panel |
| Calendar — Week view | Pass | Sun-Sat columns, tasks visible on today |
| Calendar — Day view | Pass | Events + Tasks sections, + buttons for both |
| Calendar — New Event modal | Pass | Pre-fills correct date, All day toggle, context picker |
| Habits view — progress chart | Pass | 7-day bars, 50% today, streak counters |
| Habits view — all habits list | Pass | Shows both habits with "Daily" frequency |
| Journal — Cmd+Enter capture | Pass | Saved at 01:16 PM, toast shown, field cleared |
| Journal — entries grouped | Pass | "MONDAY, APRIL 13, 2026" header, timestamps |
| Past day navigation | Pass | Arrow navigates to Apr 12, "Today" link returns |
| Habit toggle on past day | Pass | Exercise toggled for Apr 12, 50% updated |
| Notification bell | Pass | Shows 3 items: 1 due today + 2 completed |
| "+ New" sidebar button | Pass | Opens full New Task modal with all fields |

---

## QA Round 4 — Additional Bugs Found & Fixed

### 12. No CRON Trigger for Automated Calls (Critical — Root Cause of "No Call Received")

**Symptom:** User set up AI check-ins with a 1:30 PM daily call time, but never received a call. Only "Call Me Now" (manual test) worked.

**Root Cause:** The `ai-schedule-calls` and `ai-retry-calls` Supabase edge functions existed and worked correctly, but **nothing was triggering them automatically**. No CRON job, no pg_cron, no Vercel cron — the scheduler had no trigger. Only manual "Call Me Now" calls worked because those hit the function directly from the frontend.

**Fix:** Created Vercel CRON job handlers:
- `api/cron-schedule-calls.js` — runs every 5 minutes, proxies to `ai-schedule-calls` edge function with service role key auth
- `api/cron-retry-calls.js` — runs every 15 minutes, proxies to `ai-retry-calls` edge function
- Updated `vercel.json` with CRON schedules and fixed rewrite rule to exclude `/api/` paths

**Note:** Every-5-minute CRON requires Vercel Pro plan. Hobby plan supports daily only.

**Prerequisite:** `SUPABASE_SERVICE_ROLE_KEY` must be added to Vercel environment variables.

**Files:** `api/cron-schedule-calls.js` (new), `api/cron-retry-calls.js` (new), `vercel.json` (modified)

---

## QA Round 4 — Additional Features Verified

| Feature | Status | Notes |
|---------|--------|-------|
| Tasks — Active filter | Pass | Shows 1 active task |
| Tasks — Completed filter | Pass | Shows 2 completed with green checks, strikethrough |
| Tasks — All filter | Pass | Shows all 3 tasks |
| Tasks — By Project grouping | Pass | "NO PROJECT" and "COMPLETED" sections |
| Search — instant results | Pass | "groceries" matches "Buy groceries for dinner" |
| Projects view | Pass | Website Redesign card with progress bar, task count |
| Call time change to 1:30 PM | Pass | Saved and persisted across reload |

---

## Lessons Learned

1. **Always check the actual webhook payload format** - VAPI's docs show `tool-calls` with `toolCallList[]`, not `function-call` with `functionCall`. Don't assume payload shapes from other providers (OpenAI).

2. **Metadata nesting varies by provider** - VAPI nests metadata under `message.call.metadata`, not `message.metadata`. Always add console.log for the full payload during development.

3. **Model tools vs assistant tools** - In VAPI, `model.tools` are OpenAI-style synchronous function calls. `assistant.tools` with `server.url` are server-side tools that don't interrupt the conversation flow.

4. **DRY from the start** - The system prompt, tool definitions, and assistant config were duplicated across 3 files. Creating a shared module early prevents drift and makes fixes propagate automatically.

5. **Test with real data** - The tool calls only fail when there's actual user data to query. Empty-state testing misses these bugs entirely.

6. **Test calls need different guards than CRON calls** - "Call Me Now" is a user-initiated action that should always work. Duplicate-per-day and monthly-limit checks are for automated scheduling only. Mixing the two code paths without branching causes test calls to silently fail.

7. **Check response bodies, not just status codes** - A 200 OK with `{ scheduled: 0 }` is functionally a failure for the user. Always inspect the payload when the semantics matter.

8. **Always use user timezone for date calculations** - Edge functions run in UTC. Any date-sensitive logic (habits, "today", day-of-week) must use the user's stored timezone. A 9 PM Mountain Time call is 3 AM UTC the next day — without timezone-aware dates, the AI sees wrong habits and wrong date.

9. **Platform-aware UI hints** - Keyboard shortcut hints should detect the platform. Hardcoding "Ctrl" breaks Mac UX where users expect "⌘".

10. **Deploy the trigger, not just the function** - Building a scheduler edge function is only half the job. Without a CRON trigger (Vercel cron, pg_cron, or external), the function sits idle and users never get called. Always verify the full invocation chain end-to-end.

---

## QA Round 5 — Additional Bugs Found & Fixed

### 13. Scheduled Calls Never Fired — 5-Minute Window Too Tight (Critical)

**Symptom:** Pro-plan Vercel cron runs every 5 min, but user set preferred time 1:30 PM and no call arrived. Reproduces whenever the cron invocation drifts past the tail of the acceptance window (e.g., Vercel fires at 13:35:20 for a 5-min schedule).

**Root Cause:** `isUserDueForCall()` required `now - preferred` to fall in `[0, 5)` minutes. Vercel cron jitter (cold starts, queueing delays of 30s+) can push a fire-time past that window entirely, so the correct tick is skipped and the next tick has `diff >= 5` and is also rejected. Same bug affects any user whose Vercel cron run straddles the preferred minute boundary.

**Fix:** Changed the time check to *"any time past preferred time today is due"* and let the already-present duplicate-today guard handle idempotency. This means a cron running every 5 min, every 15 min, hourly, or even once daily will all fire the call as soon as the run happens after the preferred time — no more missed windows from scheduling jitter.

**File:** `supabase/functions/ai-schedule-calls/index.ts`

---

### 14. Duplicate-Call-Today Check Used UTC, Not Local Day (Medium)

**Symptom:** For users whose preferred time crosses UTC midnight (e.g., 9 PM MDT = 3 AM UTC next day), the "already called today?" guard missed the existing call and the scheduler would dispatch a second one on the next tick.

**Root Cause:** `.gte("scheduled_at", ${userToday}T00:00:00).lt("scheduled_at", ${userToday}T23:59:59)` compared a user-local date string to a UTC timestamptz column. Postgres interprets the naive string as UTC, so the window is the wrong 24 hours for any non-UTC user.

**Fix:** Added `getUserLocalDayBoundsUTC()` helper that converts the user's local YYYY-MM-DD into correct UTC start/end ISO timestamps (handles DST and extreme offsets via Intl probe). Both the duplicate-today check and the monthly-limit check now use these bounds.

**File:** `supabase/functions/ai-schedule-calls/index.ts`

---

### 15. CRON_SECRET Silently Returns 401 When Unset (Medium)

**Symptom:** If `CRON_SECRET` env var wasn't configured in Vercel, every cron invocation returned 401 — `'Bearer <real-secret>' !== 'Bearer undefined'` — and nothing in the Vercel logs clearly pointed to the missing var.

**Root Cause:** The handler did strict equality on an undefined secret. Also, on auth failure it returned generic 401 with no log context.

**Fix:** 
- If `CRON_SECRET` is set, it's required as before.
- If `CRON_SECRET` is unset, fall back to checking the `vercel-cron` user-agent (downstream edge function is still protected by the service role key).
- Both paths now log structured warnings on failure + log the status/body of the edge function response to Vercel function logs, so misconfiguration is visible.

**Files:** `api/cron-schedule-calls.js`, `api/cron-retry-calls.js`

---

## QA Round 5 — Lessons Learned

11. **Tight time windows + jittery cron = silent failure.** Any scheduler that says "fire if within N minutes of target" has to either (a) run more frequently than N or (b) tolerate late runs by treating the window as "anytime today after target, deduped by a per-day guard." Pick (b) unless you specifically need sub-N precision — it's robust to cron jitter, cold starts, plan downgrades, and missed ticks.

12. **Never compare timezone-naive date strings against a timestamptz column.** Postgres interprets naive strings as UTC, which is almost never what you want for "user's today." Always convert the user's local day to correct UTC start/end bounds before filtering. Use an Intl-based probe (not a hardcoded `* 3600` offset) so DST and unusual zones work.

13. **Defensive auth should fail loudly, not silently.** A 401 with no log line is indistinguishable from a 500 or a 200 with no effect. Always log which branch of the auth check rejected and what the request claimed to be — cron misconfiguration is one of the easiest problems to diagnose if you can see it, and one of the hardest if you can't.
