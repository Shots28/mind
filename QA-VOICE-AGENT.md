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
