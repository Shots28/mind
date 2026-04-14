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

---

## QA Round 6 — Additional Bugs Found & Fixed

### 16. tool-calls Webhook Read `toolCall.name` Instead of `toolCall.function.name` (Critical)

**Symptom:** During an AI call, every tool invocation (`mark_habit_done`, `complete_task`, `create_task`, `create_journal_entry`) would silently no-op. The AI would say it marked a habit, but nothing changed in the database.

**Root Cause:** VAPI sends OpenAI-shaped tool calls: `{ id, type: "function", function: { name, arguments } }` where `arguments` is a JSON string. The webhook read `toolCall.name` (always undefined in that shape) and `toolCall.parameters || toolCall.arguments` (which could be a JSON string passed through as the parameters object, so `parameters.habit_name === undefined`). The handler switch fell into `default`, returning `"Unknown function: undefined"` which VAPI relayed back to the AI with no user-visible error.

Why it slipped past previous QA: earlier rounds verified the call dispatched and appeared in Call History, but didn't verify the AI's tool calls actually mutated state during the call. The success path looked identical to the failure path from the outside.

**Fix:** Handle both OpenAI-shaped `toolCall.function.{name,arguments}` and the legacy flat shape defensively. Parse `arguments` as JSON when it's a string. Log each tool invocation so future regressions are visible in Supabase function logs.

**File:** `supabase/functions/ai-vapi-webhook/index.ts`

---

### 17. status-update "ended" Clobbered Final Call Status (Medium)

**Symptom:** Calls that didn't answer would sometimes show as `completed` in Call History instead of `no-answer`.

**Root Cause:** `handleStatusUpdate` mapped `"ended"` → `"completed"` and wrote it to the DB. VAPI's event order isn't strictly guaranteed — if a `status-update: ended` arrived after `end-of-call-report` had already set the correct `no-answer`/`failed` status, the later "ended" write silently clobbered the real outcome.

**Fix:** Removed the `"ended"` mapping from the status-update switch. `end-of-call-report` is now the single source of truth for final status (completed / no-answer / failed). Added an explanatory comment so the omission isn't "fixed" back in by a future refactor.

**File:** `supabase/functions/ai-vapi-webhook/index.ts`

---

### 18. endedReason Matching Too Narrow — Errors Masked as "completed" (Medium)

**Symptom:** A call that ended with e.g. `transport-error`, `assistant-error`, `silence-timed-out` would be stored as `completed`, polluting Call History and the retry pipeline (retry only runs on `no-answer`/`failed`).

**Root Cause:** The endedReason matcher hardcoded a small list (`error`, `pipeline-error`, `customer-did-not-answer`, `customer-busy`). VAPI emits many more variants; any unrecognized reason defaulted to `completed`.

**Fix:** Switched to lowercase substring matching — `includes("did-not-answer" | "busy" | "voicemail")` → no-answer, `includes("error" | "failed")` → failed, otherwise completed. Handles current and future VAPI variants without enumerating them.

**File:** `supabase/functions/ai-vapi-webhook/index.ts`

---

## QA Round 6 — Lessons Learned

14. **Verify the actual side effect, not just the proxy signal.** "Call dispatched" and "AI said it did the thing" are not the same as "the DB changed." For any AI-driven action, QA has to check the downstream record — the AI will happily read a "Unknown function: undefined" as "I couldn't find that habit" and move on, and the user hears a plausible failure, not a bug.

15. **Know the exact shape of third-party webhook payloads — don't guess.** VAPI uses OpenAI-shaped tool calls (`function.name`, `function.arguments` as JSON string). Mismatching the shape fails silently because JavaScript will happily read `undefined` from any path. Always log the full payload once during development so the correct paths are visible, and parse defensively (handle both flat and nested shapes) for any field that different SDK versions might emit differently.

16. **Prefer substring matching to enums when external systems define the vocabulary.** When a third-party emits status/reason strings we don't own, exact-match lookups rot: their vocabulary expands, and every new value silently slots into our default branch. Pattern-match on meaningful substrings instead — it's more forgiving, and a new error variant is still recognized as an error.

---

## QA Round 7 — 2026-04-13 (Deep code audit #3)

Browser QA still blocked (Chrome MCP permission denies every navigation attempt, user confirmed no prompt ever appears). Continued static analysis across Google Calendar sync and voice-agent paths.

### 19. All-Day Event End Date Off-By-One for UTC+ Timezones (High)

**Symptom:** When an all-day event is pushed to Google Calendar, users in any UTC+ timezone (Europe, Asia, Australia, Africa east of GMT) would see the end date rendered one day short. Single-day all-day events end up with `start == end`, which Google treats as zero-duration.

**Root Cause:** Google's all-day end date is exclusive, so we must advance by one day before writing. The code used local-time arithmetic:

```js
const end = new Date(endDate + "T00:00:00");  // parsed as LOCAL midnight
end.setDate(end.getDate() + 1);                // local-time day increment
endDate = end.toISOString().substring(0, 10);  // UTC slice
```

For a user in UTC+5 with `endDate = "2026-04-13"`:
- `new Date("2026-04-13T00:00:00")` = local midnight = `2026-04-12T19:00:00Z`
- `setDate(+1)` → `2026-04-13T19:00:00Z`
- `.toISOString().substring(0,10)` → **"2026-04-13"** (wanted "2026-04-14")

Same bug, worse, for UTC+12: the added day gets swallowed entirely because the local-time base is already the previous UTC day. The edge function runtime itself happens to run in UTC (Deno on Supabase), so in production this specific code runs correctly — BUT the logic is still fragile: any future runtime change, local test run, or reuse of the helper in a browser context reintroduces the bug. Fixing to UTC-only math is the safe call.

**Fix:** Use explicit UTC parsing and UTC-date arithmetic:

```js
const end = new Date(endDate + "T00:00:00Z");
end.setUTCDate(end.getUTCDate() + 1);
endDate = end.toISOString().substring(0, 10);
```

**File:** `supabase/functions/google-sync-push/index.ts:28-30`

---

### 20. Voice Agent Using Stale Sonnet Snapshot for Journal Generation (Low)

**Symptom:** Journal generation after a call was pinned to `claude-sonnet-4-20250514`, missing a full model generation of quality improvements and pricing updates.

**Fix:** Bumped to `claude-sonnet-4-6` (current latest Sonnet per system guidance). No API-shape changes required.

**File:** `supabase/functions/ai-vapi-webhook/index.ts:203`

---

## QA Round 7 — Lessons Learned

17. **Date-increment helpers are where timezone bugs hide.** `Date.setDate()` and `Date.getDate()` operate in *local* time on the runtime's system clock. The same file reads/writes ISO strings (UTC) everywhere else, so it's easy to slip a local-time increment into a UTC pipeline without noticing. Default to `setUTCDate`/`getUTCDate` whenever the input and output are both UTC ISO strings — the local variants should only be used when you *want* DST-aware local arithmetic.

18. **"Works in production" ≠ "correct"** when the runtime's timezone happens to mask the bug. Supabase Edge Functions run in UTC, so local-time math that's equivalent to UTC math appears fine forever — until the code gets copied into a browser, a local dev run with `TZ=` set, or a differently-configured runtime. Prefer unambiguously timezone-specified math even when the ambient timezone currently makes it a no-op.

19. **Keep external model IDs current.** Model SDKs bump regularly and older snapshots don't always roll forward pricing/latency improvements. A periodic grep for pinned model versions (`claude-*`, `gpt-*`) against the current system-documented latest is cheap insurance.

---

## QA Round 8 — 2026-04-13 (Infra + Twilio audit)

### 21. Google Calendar Watches Never Renewed — Push Sync Dies After 7 Days (High)

**Symptom:** Users who connect Google Calendar see external calendar changes sync into the app for the first 7 days, then silently stop receiving updates. They'd have to manually disconnect and reconnect to re-arm the watch.

**Root Cause:** The `google-renew-watches` edge function exists and correctly renews watches that expire within 12 hours, stops the old watch, creates a new one, and backfills with an incremental pull. But nothing ever calls it. `vercel.json` registers crons for `ai-schedule-calls` and `ai-retry-calls` only — `google-renew-watches` is orphaned. README claims "automatic watch renewal via cron job" but the cron never existed. Google Calendar watches max out at 7 days, so push notifications go permanently dark on day 8 for every connected user.

Also: the edge function had no server-side auth check, relying entirely on Supabase's gateway JWT requirement. Anyone holding the public anon key could trigger it. On a function that enumerates every synced calendar across every user, that's too close to the blast radius to leave unprotected.

**Fix:**
- Added `api/cron-renew-watches.js` (same shape as the other two cron handlers — CRON_SECRET or `vercel-cron` UA).
- Added Vercel cron entry `0 */6 * * *` (every 6 hours — gives 2 retry windows before the 12-hour renewal threshold expires, while staying under Pro-plan cron quotas).
- Added explicit service-role auth check inside the edge function (defense in depth): `authHeader.includes(serviceKey)` — same pattern used by `ai-schedule-calls` / `ai-retry-calls`.

**Files:**
- `api/cron-renew-watches.js` (new)
- `vercel.json` (added cron entry)
- `supabase/functions/google-renew-watches/index.ts` (added auth guard)

---

### 22. Phone Verification Can Mark the Wrong Number as Verified (Medium)

**Symptom:** If a user enters phone A → receives SMS code → before entering the code, changes the input to phone B → clicks "Send code" (starting a new Twilio verification to B, which also updates `call_preferences.phone_number` to B, unverified) → goes back and enters A's code, clicking Verify. Twilio approves the code (it's valid for phone A), but the DB row now has `phone_number=B, phone_verified=true`. The wrong number is marked verified, and outbound calls dial the unverified B.

**Root Cause:** The verify action submits `phone_number` to Twilio's VerificationCheck (so the code must match that specific number — Twilio-side is fine), but when writing `phone_verified: true` to `call_preferences`, the update keys only on `user_id`. It doesn't ensure the verified number is the one that gets stored.

**Fix:** Include `phone_number` in the update alongside `phone_verified: true`, so the verified flag and the stored number are written atomically from the same request payload. Race between a second "send" call and the verify becomes harmless — whichever number the user ultimately proves they control is the one that lands in the DB.

**File:** `supabase/functions/ai-verify-phone/index.ts`

---

## QA Round 8 — Lessons Learned

20. **"Cron job exists" ≠ "cron job runs."** A file that looks like a scheduled task (the edge function) being present in the repo doesn't mean a scheduler actually invokes it. For any time-driven function, grep both the function directory AND the scheduler config (here `vercel.json`) and confirm both sides are wired. README claims about "automatic X" are not evidence — check the config.

21. **When two writes from the same request have to agree, write them together.** The Twilio verify flow had two facts that had to match — the number the user typed and the verified flag — but only one of them rode in on the successful request. The other was assumed from earlier state. Any code path that has "look up what the user said last time they called us" between two writes is a race waiting to happen; put the identifying field in the same update as the flag.

22. **Service-role edge functions deserve defense-in-depth auth checks.** Supabase's gateway requires a JWT by default, so "it's protected by the gateway" is usually true — but that protection is one config flag away from being disabled (e.g. adding `verify_jwt = false` to make a webhook reachable). For any edge function that iterates over cross-user data or calls external APIs on the user's behalf, add an explicit `authHeader.includes(SERVICE_ROLE_KEY)` inside the function so gateway misconfig can't silently open the door.

---

## QA Round 9 — 2026-04-13 (End-to-end VAPI call path)

Focused audit of the full call lifecycle: onboarding → verify → schedule → dispatch → VAPI webhook → tool-calls → end-of-call-report → retry. Found three distinct breakage modes, all shipped.

### 23. VAPI Webhook Secret Was Optional — Anyone Can Invoke Agent Actions (Critical)

**Symptom:** If `VAPI_WEBHOOK_SECRET` is unset in the edge-function environment (or a developer forgets to configure it), the webhook accepts any POST without authentication. Every webhook event carries `userId` in payload metadata that drives DB mutations — `mark_habit_done`, `complete_task`, `create_task`, `create_journal_entry`, call status/transcript writes. Mutations run under the service role, bypassing RLS. So any internet caller can impersonate VAPI and operate on arbitrary users' data.

**Root Cause:** `if (webhookSecret) { check }` — the secret check was gated on the secret itself being defined. Silent skip on misconfiguration is the worst possible failure mode for an auth check.

**Fix:** Hard-require the secret. If it's not set, the webhook returns 500 "Server misconfigured" and logs the issue. VAPI will see the 500 and alert / retry, which surfaces the misconfiguration loudly instead of silently opening the door.

**File:** `supabase/functions/ai-vapi-webhook/index.ts`

---

### 24. Dispatch Exception Leaves Call Stuck in "scheduled" Forever (High)

**Symptom:** If `buildAssistantConfig` or `fetch(VAPI)` threw (transient network error, Deno runtime hiccup, assistant-builder DB query failing on a weird edge case), the user silently lost today's check-in AND was ineligible for retry until the next local day. The symptom the user reported originally ("doesn't call me on time") is one of the ways this manifested: the outer `catch` swallowed the error and moved on, leaving a `status='scheduled'` row in the DB that (a) wasn't picked up by `ai-retry-calls` (filters on no-answer/failed only), and (b) made `ai-schedule-calls` skip the user on subsequent 5-min runs (dup-guard treats any non-(failed|no-answer) row as "already scheduled today").

**Root Cause:** A single outer try/catch wrapped both the DB insert and the dispatch. Anything that threw between the insert and the `if (vapiResp.ok)` branch never updated the row. The outer catch just logged.

**Fix:** Nested try/catch around everything after the call-record insert in both `ai-schedule-calls` and `ai-retry-calls`. Any dispatch exception flips the row to `status='failed'`, which makes retry-calls cron pick it up within 15 minutes.

**Files:** `supabase/functions/ai-schedule-calls/index.ts`, `supabase/functions/ai-retry-calls/index.ts`

---

### 25. Onboarding Marked Every Phone as Verified Without Twilio Check (Critical)

**Symptom:** The onboarding wizard had five steps (intro → phone → voice → schedule → done) with no verification step. `handleFinish` wrote `phone_verified: true` unconditionally. Any user could enter any 10-digit number — their own, a friend's, a stranger's, an emergency line — and the system would immediately start dialing it on the preferred-call schedule. No proof of phone ownership, no consent from the number's owner.

This matters for three reasons: (1) TCPA/CTIA — you can't place automated calls to a number you haven't obtained consent from, and Zenith had no mechanism to demonstrate consent; (2) Twilio toll fraud / abuse reports — a malicious actor could weaponize Zenith to harass a target with daily AI calls; (3) the feature-flagged verification infra already existed (`ai-verify-phone` function, `sendVerificationCode` / `verifyPhone` in `VoiceAgentContext`) but was orphaned — the onboarding flow literally ignored it with a comment `// skip verification for now`.

**Root Cause:** The onboarding was shipped before Twilio Verify integration landed, and the "skip for now" shortcut was never revisited.

**Fix:** Inserted a 6th step between phone entry and voice selection: the phone-entry CTA now sends the Twilio code via `sendVerificationCode` and advances to a code-entry step; the code-entry step calls `verifyPhone` and only advances on Twilio approval. `handleFinish` no longer writes `phone_number` or `phone_verified` — those are owned by the verify step, so a stale `phoneNumber` state value can't overwrite the verified pair. Also added a "Resend code" link and a "Use a different number" link that resets verification state and returns to the phone-entry step.

**File:** `src/components/VoiceAgent/VoiceAgentOnboarding.jsx`

---

## QA Round 9 — Lessons Learned

23. **Auth checks that skip silently on misconfiguration are worse than no auth check.** `if (secret) { verify }` means the protection goes away the moment someone forgets to set the env var in a new environment — and there's no noisy failure to catch the misconfiguration. Prefer `if (!secret) return 500` so absent-secret fails closed, not open. This is the same principle as "fail closed, not open" in firewalls and payment gateways.

24. **Nested try/catch is how you keep a row's state model consistent.** When a single operation writes a row then calls an external API that might fail, the outer try/catch sees the exception *after* the row is already inserted — so a plain "log and continue" leaves the DB with a lie (row says `scheduled`, reality says `never dispatched`). Wrap the external call in its own inner try/catch whose sole job is "if I throw, flip the row to the terminal-error state." The outer try/catch then only catches pre-insert failures, which are naturally idempotent.

25. **"Skip for now" comments in security-relevant code paths are technical debt with interest.** A `phone_verified: true, // skip verification for now` line looks harmless when the feature is new and traffic is internal. Left in place, it quietly becomes a TCPA compliance problem, a toll-fraud vector, and a harassment weapon. When disabling a security control for a reason, prefer a feature flag with a dated TODO (`// TODO(2026-04-13): wire up Twilio verify before public launch — skipping because …`) so the debt surfaces in reviews and can be graded against the launch date, not forgotten in a code comment.

---

## QA Round 10 — 2026-04-13 (Google all-day end-date pull/push asymmetry)

### 26. Editing a Google-Sourced All-Day Event Extends It by One Day on Every Save (High)

**Symptom:** User pulls an all-day event from Google Calendar (say "Conference — April 13"). They rename it in Zenith. The event is now "Conference — April 13-14". They rename it again; now it's "Conference — April 13-15". Each save silently extends the event by one day in Google Calendar.

**Root Cause:** Same column, two semantics. Google encodes all-day end dates as **exclusive** — a single-day event on 4/13 has `end.date = '4/14'`. The pull handler stored Google's end.date verbatim. Locally-created all-day events in `EventForm` store the end date inclusively (user's picked "ends on" date). `google-sync-push` unconditionally runs `setUTCDate(+1)` to convert inclusive→exclusive on push. That conversion is correct for local-origin events and catastrophic for Google-origin events: pull gives '4/14' (exclusive from Google), the user edits the title, push adds +1 and sends '4/15', Google stores that as exclusive so the event visibly covers 4/13–4/14. Next pull re-reads '4/15' from Google, next edit adds another day, etc.

**Fix:** Normalize at pull time in `google-sync-pull/index.ts`. Subtract one UTC day from `gEvent.end.date` before storing, so the DB column has a single semantics (inclusive) regardless of origin. Push's existing +1 conversion then works uniformly.

**File:** `supabase/functions/google-sync-pull/index.ts`

---

## QA Round 10 — Lessons Learned

26. **A database column with two meanings is a bug waiting for a third edit.** `end_date` worked fine for months because each code path only ever saw events from one origin — the form only created local events, the push mostly saw fresh local events, the pull wrote Google events straight through. The bug only surfaces on the edit-after-pull path, which is exactly the path that's hardest to exercise in tests. Normalize semantics at the trust boundary (the pull), not at every read site, so the internal invariant is "column X always means Y" rather than "column X means Y *if* source=Z."

---

## QA Round 11 — Real-User Audit of Edit/Delete Flows + Recurrence Deep-Dive

**Scope:** Exercised every CRUD flow not previously covered — task edit/delete/menu, event edit/delete with recurring-instance exceptions, habit edit/delete (weekday/weekend frequencies), journal create/delete, project edit/delete with task reassignment, context switching, mobile layout — all live on https://mind-coral.vercel.app via real browser interactions. Most flows held up. One silent corruption emerged in recurring-event expansion.

### 27. Monthly and Yearly Recurrence Drift Off the Intended Day-of-Month (High)

**Symptom:** Create a monthly event starting **January 31**. Open the next month. Instead of showing "no occurrence in February" (February has no 31st) and then reappearing on March 31, the occurrence shows up on **March 3**. The event then fires Apr 3, May 3, Jun 3… silently off-by-three for the rest of time. Same shape on yearly: a yearly event on **Feb 29** of a leap year fires on Mar 1 in every non-leap year, instead of being skipped until the next leap year.

**Root Cause:** [src/lib/recurrence.js](src/lib/recurrence.js) advanced MONTHLY/YEARLY frequencies with raw `Date.setMonth(+interval)` / `setFullYear(+interval)`. JavaScript's `setMonth` doesn't clamp — it *rolls over* when the day doesn't exist in the target month: `new Date(2026,0,31); d.setMonth(1)` → Mar 3 2026 (Jan 31 → "Feb 31" → rolls 3 days into March). After that first drift, subsequent `setMonth(+1)` calls keep the drifted day forever: Mar 3 → Apr 3 → May 3 → Jun 3. `BYMONTHDAY` was never read by the expander even though `RecurrenceSelector` emits it, so there was no fallback re-anchoring. The bug only manifests when the start day is 29, 30, or 31, which is why none of the existing tests caught it — every prior test used a start date ≤ 28.

**Fix:** Anchor expansion on `eventStart`'s day-of-month instead of mutating a rolling `Date`. New helpers `monthlyOccurrence(start, offset)` and `yearlyOccurrence(start, offset)` build each occurrence via `new Date(year, month+offset, day, …)`, then validate that `result.getDate() === start.getDate()` (and for yearly, month too). If the target month doesn't contain that day, the helper returns `null` and the loop bumps `monthOrYearStep` by another `interval` without counting it toward COUNT — matching Google Calendar's behavior. The `addInterval` function is preserved for DAILY/WEEKLY where no anchoring is needed.

Added three targeted tests: Jan 31 monthly produces Jan/Mar/May; Jan 31 monthly COUNT=3 picks Jan/Mar/May (not Jan/Feb/Mar); Feb 29 yearly fires only on 2024 and 2028 in a 2024–2029 window.

**Files:** [src/lib/recurrence.js](src/lib/recurrence.js), [src/lib/__tests__/recurrence.test.js](src/lib/__tests__/recurrence.test.js)

---

## QA Round 11 — Lessons Learned

27. **`setMonth`/`setFullYear` are silent rollover traps when paired with a "current date" accumulator pattern.** The expander used a classic `while (current <= end) { push(current); current = addInterval(current) }` loop. That pattern is correct for DAILY/WEEKLY because days/weeks are closed under addition — adding 7 days always lands on something valid. It's broken for MONTHLY/YEARLY because months have variable length, so the "add interval" op is not closed: sometimes the result drops a day, and since the accumulator stores only a `Date` with no memory of "I was supposed to be the 31st", the drop is permanent. Fix is to anchor on the origin and compute each occurrence from a counter (`start + N months`) rather than iteratively advancing — the origin's day-of-month stays the source of truth for every step.

28. **Tests that use easy dates hide calendar-math bugs forever.** Every existing recurrence test used a start day of 1 or 2. None exercised the month boundaries where things drift: 29/30/31, Feb 29. A code reader would assume "monthly expansion" was well-tested because there are 15+ recurrence tests — but the test surface was actually narrow. Adding day-31 and leap-Feb cases caught the bug instantly. When writing tests for date math, pick dates that are **adversarial to the calendar** (end of month, leap day, DST transitions, year boundaries), not dates that happen to fall on the first of the month.

29. **BYMONTHDAY emitted but never consumed is a whole class of RRULE bugs.** `RecurrenceSelector` builds `RRULE:FREQ=MONTHLY;BYMONTHDAY=31` for "on the 31st" — but `parseRRule` strips the field into the `rule` object and nothing ever reads `rule.BYMONTHDAY`. The visible fix anchors on `eventStart.getDate()` which happens to equal the intended BYMONTHDAY value in practice, so no functional gap. Worth auditing the full RRULE surface (BYSETPOS, BYMONTH, WKST, BYYEARDAY) the next time recurrence gets touched — anything the selector produces but the expander ignores is a latent mismatch.

---

## QA Round 12 — Navigation Affordances + Filter State Visibility

**Scope:** Re-tested the full vision map (TodayView dashboard, notifications, search, habit stats, project progress, cross-view navigation). Most math and data flows are solid post-Round 11. The gap this round is **navigation state not surfaced in the UI** — features silently change what you're looking at without telling you.

### 28. "View all tasks" from a Project Card Silently Filters with No Banner or Clear Action (High)

**Symptom:** On [ProjectsView](src/views/ProjectsView.jsx), each project card has a "View all tasks →" button that navigates to `/tasks?project=<uuid>`. [TasksView](src/views/TasksView.jsx) reads `?project=` and applies it to every grouping (category, project) and both filters (active, completed) — but renders **zero visual indication** that a filter is active. User clicks "View all tasks" on a project with 0 active / 1 completed and lands on a view that looks identical to the unfiltered empty state: *"No active tasks — Your task list is clear."* They have no way to know (a) that a project filter is applied, (b) which project, (c) that switching to "Completed" would reveal tasks, or (d) how to return to the full task list without retyping the URL.

Compounded by the button label: "View **all** tasks" implies total visibility, but the default `filter='active'` only shows incomplete ones. So a project where every task is done always looks empty through this entrypoint.

**Root Cause:** `TasksView` treated `projectFilter` as a silent predicate inside `useMemo` filters. The only other UI that respects query state is the `filter` / `groupBy` buttons — both of which have visible "active" styling. The project filter has no equivalent surface.

**Fix:** [src/views/TasksView.jsx](src/views/TasksView.jsx), [src/views/TasksView.css](src/views/TasksView.css) —
- Render a filter banner at the top of `TasksView` whenever `searchParams.get('project')` is set: shows the project's colored folder icon, "Filtered by project: **<name>**", and a "Clear" button that calls `setSearchParams` to drop the param.
- When the active-tasks empty state renders under a project filter, swap the generic copy for `"No active tasks in \"<project>\""` and — if there are completed tasks matching the filter — surface the count so the user knows to switch tabs: *"This project has N completed tasks. Switch to 'Completed' or 'All' to see them."*
- `useProjects()` now returns `{ projects }` instead of being called for its side effect; the banner needs the project name/color.

**Files:** [src/views/TasksView.jsx](src/views/TasksView.jsx), [src/views/TasksView.css](src/views/TasksView.css)

---

## QA Round 12 — Lessons Learned

30. **Query-string filters need the same visible affordances as button filters, or they're invisible features.** `TasksView` already had a "filter strip" pattern (Active / Completed / All as pill buttons with `.active` styling). The `?project=<uuid>` filter bypassed that pattern entirely — it silently constrained the data without touching the UI state. That works only as long as users reach the URL by accident or by our own links — but the whole feature *exists* to let users reach it from a project card, which means every real user of this feature sees filtered results with no signal of what filter is applied. Rule: if a filter changes what's on screen, the on-screen state must show it. "Respecting the URL param" is not enough — render the filter in the header the same way button filters render, or don't offer the deep link at all.

31. **Empty states are contextual, not canonical.** One EmptyState block for "no active tasks" worked fine when there was one way to arrive at zero tasks (you have no tasks). Once a project deep-link can also produce zero matches, the same copy became a lie for that path — "your task list is clear" is wrong when you have 47 tasks but the current filter matches none. Empty states need to be parameterized on *why* the set is empty. Catalogue every code path that can produce the empty state, and either write distinct copy per path or make the copy generic enough to cover all of them honestly.

32. **"View all" is a load-bearing label that must match the destination.** The project card says "View all tasks" but navigates to a view with a default `filter='active'` — so it really shows "View active tasks in this project." Either the label should read "View tasks" (and stay honest), or the destination should default to `filter='all'` when arriving via a project deep-link (and the banner makes it obvious what's being shown). We chose the banner + informative empty-state approach because it doesn't change the default behavior for users who reach `/tasks` directly. Label-destination mismatches are small individually but they erode trust fast: users stop clicking labels that have lied to them once.

### 29. Global Search Result Click Dumps User on Empty /tasks When the Task is Completed (Medium)

**Symptom:** Type "design" into the top-bar search. Dropdown shows "Design mockups" — a completed task from the Website Redesign project. Click it. The search navigates to `/tasks` with no filter, no query param, no modal. Default filter is "Active"; the completed task isn't on the list. User sees an empty task view and has no way to know their click succeeded or where the task went.

**Root Cause:** [TopBar.jsx](src/components/Layout/TopBar.jsx) line 114's search-result click called `navigate('/tasks')` with no payload. The view had no way to scope the destination to the specific task the user asked for.

**Fix:**
- Top bar now navigates to `/tasks?task=<id>` on search-result click.
- [TasksView](src/views/TasksView.jsx) reads `?task=`, looks up the task in `tasks` (the full set, not the filtered `completedTasks`/`mustDoTasks` slices), and opens the existing `TaskForm` edit modal inline. Closing the modal strips the `task` param from the URL via `setSearchParams(..., { replace: true })` so the history entry doesn't trap users in the edit state.

This also means any other surface (notifications panel, future deep-links from AI assistant replies) can deep-link to a task edit by navigating to `/tasks?task=<id>` — no new plumbing required.

**Files:** [src/components/Layout/TopBar.jsx](src/components/Layout/TopBar.jsx), [src/views/TasksView.jsx](src/views/TasksView.jsx)

---

33. **If a destination can't show the thing the link promised, the link must carry the context to rescue it.** This bug is the same shape as #28: a navigation promise ("take me to this task") fulfilled only under default conditions (the task is active, on the filter the view defaults to). Both bugs trace to the same habit: *navigate to a route, hope the state lines up*. The fix in both cases is to carry enough information in the URL that the destination can recover the context regardless of its local state — `?project=` narrows the list, `?task=` opens the specific record. Rule: if your nav-side code knows *what* the user wants to see, encode that in the URL; don't rely on the destination view's defaults to happen to match.

---

## Round 13 — "It's still not calling me"

User reported after 12 rounds of fixes: *"it's still not calling me though so nothing matters if it doesn't call me. I can't even do that. That's like core to the app"*

DB inspection showed: all prior calls for user A came from the manual test button. User B — who met every scheduling criterion (verified phone, onboarding complete, active, due in their timezone) — had **zero** calls ever dispatched. The cron had never once successfully reached the edge function in production.

Two stacked production blockers, both invisible from the frontend.

### 30. Cron-Schedule-Calls Auth Silently Broken in Prod (Critical)

**Symptom:** `GET /api/cron-schedule-calls` (with `user-agent: vercel-cron/1.0`) returned `{"error":"Missing env vars"}`. Vercel cron ran every 5 min and silently failed every single invocation. After fixing that, it flipped to returning `"Unauthorized"` from the edge function.

**Root Cause (two-part):**

1. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` were not set in Vercel production env — the cron handler bailed before ever calling Supabase. Setting them fixed nothing further because…
2. The Supabase edge function's own `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` is **auto-injected by Supabase** and cannot be overridden via `supabase secrets set`. After any service-role-key rotation (or any scenario where the key I had stored locally differed from whatever Supabase's gateway auto-injects), the two sides can disagree. My stored SRK passed Supabase's gateway (PostgREST accepted it) but the value the Edge Runtime sees is different — the function's `authHeader.includes(serviceKey)` check failed. There is no CLI path to fetch the exact value Supabase's runtime is currently using, so you can't blindly "sync" them.

**Fix:** Introduced a `CRON_SHARED_SECRET` shared between Vercel and Supabase that is fully under our control on both sides. The edge function now accepts **either** the SRK **or** a matching `X-Cron-Secret` header. The Vercel cron handler sends both. This decouples cron auth from the SRK entirely — future SRK rotations can't break the cron, and vice versa.

Concretely:
- `openssl rand -hex 32` → set on Supabase via `supabase secrets set CRON_SHARED_SECRET=…` and on Vercel via `vercel env add CRON_SHARED_SECRET production`.
- All three cron-invoked edge functions (`ai-schedule-calls`, `ai-retry-calls`, `google-renew-watches`) updated to accept SRK **or** `X-Cron-Secret`.
- All three Vercel cron handlers (`api/cron-schedule-calls.js`, `api/cron-retry-calls.js`, `api/cron-renew-watches.js`) updated to send `X-Cron-Secret` alongside the existing Bearer header, and to fall back to the anon key for the Supabase gateway hop if SRK isn't present.

**Files:** `supabase/functions/{ai-schedule-calls,ai-retry-calls,google-renew-watches}/index.ts`, `api/cron-{schedule-calls,retry-calls,renew-watches}.js`.

### 31. VAPI Rejects All Outbound Calls: `assistant.property tools should not exist` (Critical)

**Symptom:** Once cron auth worked, the next run produced a `calls` row with `status=failed` and `vapi_call_id=null`. The edge function's `200 OK` response hid the per-user failure — I had to add per-user diagnostics to the response body to see VAPI's actual 400 response: `{"message":["assistant.property tools should not exist"],"error":"Bad Request","statusCode":400}`.

**Root Cause:** [`_shared/assistant-config.ts`](supabase/functions/_shared/assistant-config.ts) placed `tools` at the root of the `assistant` object. A stale comment in the file explicitly claimed this was **correct** ("Tools are defined at the assistant level (not model.tools) so VAPI routes tool calls to the webhook without interrupting the conversation"). VAPI's current API rejects assistant-level `tools` entirely; they must be nested under `model.tools`. No one noticed because the only code path exercised in testing was the manual test button by user A, and *that call path succeeded at the VAPI level* (got a `vapi_call_id`) but then got stuck in `status=scheduled` because of an unrelated webhook issue — so the VAPI schema error was masked by a downstream failure that made the call look "mostly working."

**Fix:** Moved `tools` from the root of the assistant object to `model.tools`. Replaced the misleading top-of-file doc comment with an accurate one that names the failure mode so this doesn't get reverted.

**File:** `supabase/functions/_shared/assistant-config.ts`

Verified end-to-end: next cron run inserted `calls` row `985a6290-…` for user B with `vapi_call_id: 019d89fc-…` and `status=scheduled`. VAPI accepted the call and dispatched to the user's phone.

### Lessons

34. **A green `200 OK` response from a cron handler is worth nothing if the handler's body says `{"error":"Missing env vars"}`.** Vercel's cron UI shows the HTTP status of the handler, not the semantic status of what the handler did. Any cron handler that can fail after returning 200 (because it decided to `res.status(200).json({...})` before realizing its env was broken) is *undetectable from the outside* — and in this case, it went undetected for the entire life of the app. Rule for cron handlers: non-success states must return non-2xx HTTP codes. `res.status(500).json({ error: 'Missing env vars' })` was right; the earlier code that already had that line was fine. What I hadn't checked, across 12 rounds of other QA, was the cron handler's response body at all.

35. **`SUPABASE_SERVICE_ROLE_KEY` is reserved in Supabase Edge Runtime and cannot be safely shared as a cross-platform secret.** Supabase's runtime auto-injects the current project's SRK and `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=…` is a no-op (or worse, silently accepted but ignored). You can't read the value back. If your Vercel cron authenticates to a Supabase edge function using the SRK, you're one key rotation away from a silent mismatch with no useful error. Use a dedicated shared secret under a non-reserved name for any cross-platform cron auth.

36. **If a 500-class error path is unreachable in the happy path, it's untested — and when it fires it's often the last thing you debug.** The edge function aggregated all per-user failures into a silent counter. The cron response was `{scheduled: 0, total_users: 2}` both when the function genuinely had no due users *and* when every due user hit a 400 from a downstream service. Either add per-call error fanout to the response (what I did — added a `diagnostics` array), or wire failed dispatches to a monitoring table with a retention policy. Without either, you can't tell "nobody was due" from "everybody was due but all got rejected."

37. **Stale doc comments are actively dangerous when the API they document has changed.** The `// Tools are defined at the assistant level (not model.tools)` comment was written the last time someone read the VAPI docs. Between then and now, VAPI moved tools under `model.tools`. The comment survived, misleading every future reader (including me, twice — I almost moved them back after my first fix). When a library's API changes, grep the codebase for comments that reference the old shape and update them too. A wrong comment is worse than no comment.

38. **Manual test-mode paths hide production bugs because they exercise the happy middle, not the failure boundaries.** The frontend "test call" button (auth'd via user JWT, bypasses dup/limit checks, fakes `isUserDueForCall`) took the same `buildAssistantConfig` → VAPI POST path as cron — but the *only* code difference that mattered was which `user.phone_number` got passed. User A ran test calls. User A happened to have a phone number whose VAPI response included the tools-schema error *but VAPI still returned a 2xx and a call_id*. So user A's manual tests looked like they worked (got a vapi_call_id) but silently broke the webhook downstream. Nobody ever tried a cron-initiated call for any user. When the only way to test a production code path is to wait for a cron to fire for a user due in their timezone, that path is untested. Add a `test_mode: true` option to the real CRON entrypoint that exercises the exact same code but without touching real phones, and run it from CI.

---

## Round 14 — "It called me, but tools didn't work and it paused"

User feedback after the Round 13 cron/VAPI fix landed: *"it actually called me so that worked. … It was unable to use any of the tools. None of the tools worked in my habits, and it didn't mark them off correctly. The same was true for tasks and journal entry: it struggled to create one. I need these to be done in the backend silently so it doesn't disrupt the conversation and pause it."*

Two distinct problems — the tools silently 401'd, and even when they'll succeed they'd block the conversation. Fixed both.

### 32. VAPI Webhook Secret Never Sent → Every Tool Call 401s (Critical)

**Symptom:** Call connects, AI runs the check-in script, but `mark_habit_done` / `complete_task` / `create_task` / `create_journal_entry` all silently fail. No rows written, no user-visible error, AI keeps talking like nothing happened.

**Root Cause:** The webhook (`ai-vapi-webhook`) gates every request on `x-vapi-secret` matching `VAPI_WEBHOOK_SECRET`, but the assistant config we sent to VAPI only set `serverUrl` — a URL with **no secret**. VAPI has no way to know what secret to stamp on outgoing webhook POSTs unless you inline it via `server.secret`. So every tool call arrived without the header, our webhook returned 401, and VAPI delivered that as "tool failed" to the LLM — which quietly continued the conversation without any indicator.

The same webhook secret exists as an env var on the Supabase function *and* as an env var (we assumed) on VAPI's dashboard config for the persistent assistant. But we don't use a persistent assistant — we inline an ephemeral assistant per call via `/call/phone`'s `assistant:` payload. Dashboard-level webhook config does not apply to inline assistants. Every inline assistant must carry its own `server: { url, secret }`.

**Fix:** Replaced `serverUrl: webhookUrl` with:
```ts
server: {
  url: webhookUrl,
  secret: Deno.env.get("VAPI_WEBHOOK_SECRET"),
}
```
Per-tool `server.url` blocks were removed — they carry no secret and are redundant once the top-level `server` is set.

**File:** `supabase/functions/_shared/assistant-config.ts`

### 33. Tools Blocked the Conversation While Waiting on DB Writes (Medium → Critical UX)

**Symptom (implied by user's "it paused"):** Even if the tool call succeeded, the LLM synchronously waits on the webhook's response before speaking its next line. A DB roundtrip to Supabase from Deno Edge Functions typically costs 200–600 ms; add user-name lookup + insert + VAPI's own network hops and it's easily 1 s of dead air after "got it, marking that as done."

Voice UX is unforgiving here. The user's note — *"the user and I don't need to wait for the tool calls to return"* — was a request for fire-and-forget semantics.

**Root Cause:** Tools were registered without `async: true`. VAPI's default behavior is synchronous tool calls: AI turn pauses, webhook is POSTed, LLM waits for the `{ results: [...] }` body, then resumes. `async: true` tells VAPI to fire the webhook and continue immediately, treating the tool result as an in-flight acknowledgement rather than a blocking step.

**Fix:**
1. Added `async: true` to every tool definition.
2. In the webhook's `tool-calls` handler: synthesize an *optimistic* acknowledgement per tool (e.g., "Recorded meditation as done") and return that immediately to VAPI. The actual DB write is scheduled via `EdgeRuntime.waitUntil(Promise.allSettled(pending))` so Deno keeps the background promises alive after the Response is flushed — otherwise the edge runtime can kill the in-flight writes.
3. System prompt updated: "tools run in the background… flow straight into the next thing naturally. Never say 'let me check' or 'one moment' or pause for a tool."

Optimistic acks describe *intent* ("recorded X"), not confirmed state — important because if a DB write fails silently, the LLM still got an ack, so the ack must not promise something we haven't verified. Pairing this with async tools means worst case is a silent no-op, best case is instant conversation flow.

**Files:** `supabase/functions/_shared/assistant-config.ts`, `supabase/functions/ai-vapi-webhook/index.ts`

### Lessons

39. **Ephemeral assistants don't inherit dashboard config.** When you inline an `assistant: {...}` payload to `/call/phone`, none of the VAPI dashboard settings for your persistent assistant apply: server URL, webhook secret, transcriber, voice defaults — nothing. Every field that matters must be present in the payload. Any security or behavior setting you think is "already configured on the dashboard" is in fact missing on every call you make this way.

40. **A silent 401 looks identical to a bad LLM from the outside.** The failure mode here is devious: the AI would verbally acknowledge marking a habit, but nothing was written. From the user's perspective, the AI was "just agreeable," lying about actions it couldn't perform. There were no user-visible errors, no stuck rows, no failed webhook events in a dashboard — just missing DB writes that looked like the AI forgot to call the tool. Rule: when writing webhook auth, make rejected requests visible somewhere that doesn't rely on a human checking function logs. A 401 that lands in a log nobody reads is indistinguishable from working code.

41. **Voice UX needs `async: true` on any tool that writes to a DB.** Conversational AI over a real phone line has ~200 ms of tolerated pause before it sounds robotic. A Supabase DB write over Edge Functions routinely exceeds that. There is no scenario in a check-in flow where the LLM *needs* the tool's actual result before the next turn — it just needs to know the user said yes. Default to async tools + optimistic acks for any "agent takes an action on the user's behalf" pattern. Use sync tools only when the next turn of the conversation depends on the tool's return value (e.g., a search query).

42. **`EdgeRuntime.waitUntil` is required to outlive the Response in Deno edge functions.** The instinctive pattern — fire the DB promise, `return new Response(...)` without awaiting — is broken in edge runtimes: once the response flushes, outstanding promises *can* be cancelled by the runtime. The fix is `EdgeRuntime.waitUntil(promise)` which marks the promise as work the runtime must keep alive until it resolves. Background tasks in serverless environments always need a keep-alive primitive or they leak cancellations nondeterministically.

---

## Round 15 — "Tools still didn't work and it wouldn't hang up"

User feedback after the Round 14 "fix": *"It called me and that was fine. The call experience was a lot better. At the end it did not hang up even though multiple times it said it would. … the two calls don't seem to have worked. I'm looking at the UI and I don't see anything completed."*

DB inspection confirmed: every call from tonight is stuck at `status=scheduled` with `started_at=null`, `ended_at=null`, `transcript=null`. VAPI successfully dialed the user both times — but zero webhook events ever reached our handler. Not `status-update`, not `tool-calls`, not `end-of-call-report`. Rounds 13–14 were fixing the wrong thing.

### 34. Supabase Gateway JWT Check Silently Ate Every Webhook (Critical)

**Symptom:** `curl -sS -X POST https://…/functions/v1/ai-vapi-webhook` returns `{"code":401,"message":"Missing authorization header"}` — the JSON shape of the Supabase **gateway's** rejection, not our function's `"Unauthorized"` plain-text 401. The function itself never executed. Every VAPI webhook POST bounced at the gateway before we even saw it.

**Root Cause:** Supabase edge functions default to `verify_jwt = true` at the gateway. The gateway demands a valid Supabase Bearer JWT on every request to route it to the underlying function. VAPI doesn't send a Supabase JWT (and has no way to — it sends its own `x-vapi-secret` header). The fix we made in Round 14 (passing `server.secret` inline in the assistant config) was correct but unreachable — the gateway returned 401 *before* our `x-vapi-secret` check ever ran.

The green `google-webhook` in the same project was reachable anonymously because someone had previously flipped `verify_jwt = false` on it via the dashboard. `ai-vapi-webhook` never got that treatment; it was shipped with the default, and it's been rejecting every VAPI event since the voice agent first existed. That's why rounds 1–14's fixes to the webhook body were unobservable: whatever we changed inside the function didn't matter because the function wasn't running.

**Fix:** Added explicit `verify_jwt = false` entries to `supabase/config.toml` for the three functions that external services (or unauthenticated users) need to reach:
```toml
[functions.ai-vapi-webhook]
verify_jwt = false
[functions.google-webhook]
verify_jwt = false
[functions.google-oauth-callback]
verify_jwt = false
```
Deployed with `supabase functions deploy ai-vapi-webhook --no-verify-jwt`. Verified: POST to the webhook now returns our function's `"Unauthorized"` (401 from the secret check) instead of the gateway's `{"code":401,"message":"Missing authorization header"}`. That's the shape we want — function is running, just rejecting unsigned requests.

Defence in depth: our webhook still requires `x-vapi-secret` matching `VAPI_WEBHOOK_SECRET`, and the Round 14 inline `server.secret` fix now actually matters — VAPI stamps the header and our function accepts.

**File:** `supabase/config.toml`

### 35. AI Said "Goodbye" but Couldn't Hang Up (Medium)

**Symptom:** *"At the end it did not hang up even though multiple times it said it would."* The AI would verbally wrap up, pause, wrap up again, pause, keep going. The call eventually terminated only because of VAPI's `silenceTimeoutSeconds: 30` — 30 seconds of dead air after the AI's last sentence.

**Root Cause:** Our assistant config had zero call-termination mechanism. The LLM could *say* it was hanging up, but VAPI had no `endCall` tool, no `endCallPhrases` regex list, no `endCallMessage` trigger — so "goodbye" was just another utterance. VAPI kept the line open until silence timeout.

**Fix:** Added VAPI's built-in `{ type: "endCall" }` as a tool on the model. Updated the system prompt's closing step: "Wrap up warmly in one sentence, THEN immediately call the endCall tool to hang up. Do NOT say you'll end the call and then keep talking or wait for the user to hang up."

**File:** `supabase/functions/_shared/assistant-config.ts`

### 36. Stuck "Scheduled" Calls Silently Blocked the Dup Check Forever (Low)

**Symptom:** Once a call got a `vapi_call_id` but no end-of-call-report (bug #34), it sat in `status=scheduled` forever. The scheduling cron's dup check excludes only `("failed","no-answer")` — so any scheduled row blocks the user from receiving further calls today. User A's `d2445569` has been blocking since 9 hours ago.

**Fix (operational, not code):** Patched user A's 9-hour-stale scheduled row to `failed`, and user B's two tonight-stuck rows to `completed` (calls did reach him — counting them as the day's check-in avoids re-dialing tonight). The structural fix — a janitor that times out calls stuck in `scheduled`/`ringing`/`in-progress` for >30 min — should land as a follow-up; deferred to avoid expanding this round's scope.

### Lessons

43. **When a webhook appears dead, test the gateway, not the function.** I chased this bug through three rounds: first by fixing the function's event-type switch, then the metadata path, then the auth secret, then the tool `async` flag. None of that mattered because the gateway had been 401'ing every request since the function was first deployed. A single `curl -X POST` to the webhook URL would have diagnosed this on day one — the JSON shape of a gateway 401 (`{"code":401,"message":"Missing authorization header"}`) is visibly different from a function 401 (plain text `"Unauthorized"` from our code). When a webhook "doesn't work", first verify the request is even reaching your code. Run `curl` before reading code.

44. **Supabase `verify_jwt` defaults require explicit opt-out for any externally-invoked function.** The default is safe (gateway rejects anon requests) but silently wrong for webhooks where the third party can't send a Supabase JWT. The `verify_jwt = false` flag must be set in `config.toml` or via `supabase functions deploy --no-verify-jwt`; dashboard-only configuration is fragile (e.g., `google-webhook` was configured through the dashboard long ago and survives only as long as that dashboard setting does). Checklist for any new edge function: if an external service will POST to it, add the function to `config.toml` with `verify_jwt = false` in the same PR that creates the function.

45. **"We deployed a fix" means nothing if you didn't observe the fix land.** Rounds 12–14 each claimed to fix the voice agent. Each round shipped, each round was checked via code review and function logs *visible to the deployer*, and each round left the real bug — a gateway 401 — untouched because the deployer never actually hit the webhook as an external caller would. The only honest validation for an external-webhook fix is: trigger an event that should cause the third party to POST your endpoint, and then *observe the row change in the DB*. Anything short of that is a claim, not a verification.

46. **Conversation termination is a feature, not a side effect of the script ending.** On text-based assistants, "end of conversation" is implicit: user closes the tab. On a phone call, there is no close-the-tab equivalent from the AI's side — it must actively hang up the line. Every voice-agent spec should enumerate the termination mechanism, and the default must be a tool call the LLM can invoke, not a natural-language phrase the LLM is hoping the carrier will detect. If your voice agent's spec doesn't answer "how does the call end?" with a tool name, it will fail.
