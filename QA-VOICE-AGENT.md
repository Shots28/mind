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

## Lessons Learned

1. **Always check the actual webhook payload format** - VAPI's docs show `tool-calls` with `toolCallList[]`, not `function-call` with `functionCall`. Don't assume payload shapes from other providers (OpenAI).

2. **Metadata nesting varies by provider** - VAPI nests metadata under `message.call.metadata`, not `message.metadata`. Always add console.log for the full payload during development.

3. **Model tools vs assistant tools** - In VAPI, `model.tools` are OpenAI-style synchronous function calls. `assistant.tools` with `server.url` are server-side tools that don't interrupt the conversation flow.

4. **DRY from the start** - The system prompt, tool definitions, and assistant config were duplicated across 3 files. Creating a shared module early prevents drift and makes fixes propagate automatically.

5. **Test with real data** - The tool calls only fail when there's actual user data to query. Empty-state testing misses these bugs entirely.

6. **Test calls need different guards than CRON calls** - "Call Me Now" is a user-initiated action that should always work. Duplicate-per-day and monthly-limit checks are for automated scheduling only. Mixing the two code paths without branching causes test calls to silently fail.

7. **Check response bodies, not just status codes** - A 200 OK with `{ scheduled: 0 }` is functionally a failure for the user. Always inspect the payload when the semantics matter.
