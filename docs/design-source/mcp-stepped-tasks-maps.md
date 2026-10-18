# App side

## How DoubleDone represents and runs stepped tasks (read-only map, nothing changed)

Repo root: `C:/Users/molte/Dropbox/Claude Output/Product Manager Portfolio/DoubleDone`. All paths below are relative to it. This is the design check that the `BUILD-PLAN.md:175` item ("MCP: stepped tasks") asks for first.

**Two things to know before the detail:**
- `acceptPlan` (`client/src/app/today.tsx:1967-1980`) is **Strategise**. It only re-dates tasks. Accepting a Break-it-down plan is **`bdAccept`** (`today.tsx:2580-2628`).
- There is **no `minutes`, `phase` or `order` field or column anywhere**. Minutes live in the step's title text and in `complexity`. A phase is an ordinary child task. Order comes from `created_at` alone.

---

## A. Break it down (AI, manual, and Make it tiny)

### A1. AI flow
1. **Asking the questions:** `biteElephant(text, parentId?)` (`today.tsx:2516-2532`). It records `bdParentId`: the existing task's id, or null for a breakdown started from the capture box. Event: `breakdown.started`.
2. **Getting the plan:** `bdSubmitQuestions` (`today.tsx:2538-2574`).
   - Mints `corrId = makeId()`, the pseudonymous decomposition id, at 2543.
   - Calls `plan()` (imported as `planBreakdown`, `client/src/lib/ai.ts:121-134`), which POSTs `/plan` with `decompositionId`.
   - `parsePlanResult` (`ai.ts:99-118`) returns `{ phases: {title, focus}[], firstSteps: {title, minutes}[] }`.
   - Dates are worked out on the client by `spreadDueDates` (`client/src/lib/spread.ts:22-50`, where `null` means Today):
     - phase starts = `spreadDueDates(phases.length, today, dueDate, 'gradual')` (2559)
     - phase one's steps spread within phase one's window (2560-2562)
     - only `phases.slice(1)` go on as later phases (2564). **Phase 0 is never stored as a row.**
3. **Review:** `components/BreakdownReview.tsx`. The user can untick, edit or remove steps and later phases. `ReviewStep = {title, minutes, date}` and `ReviewPhase = {title, date}` (14-15). The `focus` field is dropped. Event: `breakdown.steps.edited` (111-113).
4. **Accept, `bdAccept` (`today.tsx:2580-2628`).** Rows written (all through `commit` → `writeTasks` → `withMonotonicStamps`, in `task-writes.ts:39-50` and `tasks.ts:187-193`):

| Row | Fields |
|---|---|
| **Parent, existing task** (2615-2616) | the same row, with `silentParent: true`, `openParent: false`, `complexity: totalMinutes` (sum of the kept steps' minutes), `updatedAt: now`. Title, `due`, `createdAt`, `leftOff`, `pinnedAt` and `big` are left alone. |
| **Parent, from the capture box** (2617) | a new row: `{id: makeId(), title: bdTask, done: false, createdAt: now, updatedAt: now, silentParent: true, openParent: false, complexity: totalMinutes}`. No due date. |
| **Each step** (2593-2603) | `id: makeId()`, `title: t('breakdown.stepTitleWithMinutes', {title, minutes})` (en `'{title} ({minutes} min)'`, de `'{title} ({minutes} Min.)'`, `client/src/lib/catalogs/en.ts:53`), `done: false`, `createdAt = updatedAt = now + i`, `complexity: s.minutes`, `parentId`, `parentTitle: bdTask`, `decompositionId: corrId`, `decompositionSteps: selected.length`, and `due: s.date` only when it is not null (null means undated, so it sits on Today). |
| **Each later phase** (2604-2612) | `id`, `title: p.title` (no minutes suffix, no `complexity`, no `decompositionId`), `done: false`, `createdAt = updatedAt = now + selected.length + i`, the same `parentId` / `parentTitle`, and `due: p.date` when set. |

- **How phases are stored:** as children of the same parent, with nothing marking them as phases. They count toward the parent's completion, so the big task only closes once every step **and** every phase milestone is done. When the user reaches one, its row's "Break it down" (`breakdownExisting`, 2633-2636) makes that milestone a silent parent of its own, which builds a nested chain.
- **After accepting:** event `breakdown.added {added, offered, phases, spread}` (2621-2626).

### A2. Manual breakdown (AI off)
`manualBreakdownSubmit` (`today.tsx:2657-2688`).
- Steps: `{id, title, done: false, createdAt/updatedAt: now + i, parentId, parentTitle}`. No complexity, no due date, no decompositionId.
- Parent: `silentParent: true, openParent: false, updatedAt: now`. Its complexity is not changed.
- Event: `breakdown.manual`.

### A3. Make it tiny
`makeTiny` (`today.tsx:2693-2720`).
- Guarded by `hasActiveTinyChild` (`client/src/lib/today.ts:377-382`): any child that is open and not deleted blocks a second pebble.
- Parent: `silentParent: true, openParent: true, updatedAt: now`.
- Child: `{id, title: tinyTitle, done: false, createdAt: now, updatedAt: now, parentId: id, parentTitle: title}`. No due date, no complexity.
- Event: `tiny.made`.
- The row shows "A tiny step toward X" only when the parent is `openParent` and the child has `parentTitle` (`tinyParentTitle`, `today.ts:656-663`, and `TaskRow.tsx:1049-1062`). An ordinary breakdown step has no such label.

### A4. Hidden while it has open steps
- `tasksForToday` (`today.ts:70`) and `upcomingTasks` (`today.ts:277`) drop `silentParent`. So do every server read: `mcp.ts:327, 451, 515` and `api.ts:133, 147, 162`.
- **The Calendar does not.** `scheduledByDay` (`client/src/lib/calendar.ts:103-111`) has no `silentParent` check. A hidden parent with a future `due` still shows as planned on that day. No test covers this, so it looks unintended.

### A5. How ticking the last step closes the parent
Every way of finishing a task goes through `finishTasks` (`today.tsx:2168-2199`): the row tick `toggle` (2201-2246), the last part of a stepped task `step` (2496-2508), the parts editor completing a task (2446-2447), Done in Focus `focusComplete` (1275-1297) and bulk Done (1574-1595). "Done on…" does not, since it only re-dates (1261-1271).

`finishTasks` calls `settleCompletions` (`today.ts:436-526`). The deciding step is `decide()` (468-500):
- **Parent not hidden, already done, or deleted** → stop.
- **`openParent` and 2 or more in the round** → clear the stale tiny flag, then walk up.
- **`openParent` and 1 in the round** (a tiny pebble) → `resurfaceOpenParent` (391-414). The parent becomes `silentParent: false` (`openParent` stays true) and the spent pebble is tombstoned (`deletedAt: now`).
- **Not tiny, and exactly 1 in the round** → the parent is **brought back to Today open, never finished** (495-498). Melroy confirmed this safe rule (`decision-log.md:9135-9141`). **A one-step breakdown therefore never closes itself.**
- **Otherwise** → `completeAncestors` (344-373). Each parent whose live children are all done is set to `{done: true, completedAt: <the last step's completedAt>, silentParent: false, updatedAt: now}`, and the walk continues up the chain.
  - It stops at a parent that is `openParent` or not `silentParent` (361).
  - Above the direct parent, it stops where the round has fewer than 2 (367).
  - A `seen` set guards against a malformed cycle.

"The round" is `currentRound` (`today.ts:328-332`): the live children, minus any finished before the newest live child was created.

**What the user sees** (`today.tsx:2189-2194`): a bloom for the topmost finished task. `stepCount` counts its live children, phases included. The size of the celebration comes from `celebrationTier` (`celebrate.ts:24-35`): bigger if the task is marked big, waited 7 days or more, or its `complexity` is 90 or more.

**Unticking a step does not reopen a finished parent.** The untick path never calls `finishTasks` (`today.tsx:2222`).

### A6. Self-repair for completions the app did not see
`healStuckParents` (`today.ts:559-651`) runs on load and focus (`today.tsx:630`), on a warm resume (843) and after every sync (901). It covers steps finished on another device, through the API or by an agent. For a hidden, not-done parent:
- **2 or more live in the round, all done** → finished, dated to the latest step's `completedAt`.
- **0 or 1 live** → brought back to Today.
- **Tiny pebble done** → parent back, pebble retired.
- It also tidies parents whose steps went into a Combine.
- Repairs are stamped with the row's own `updatedAt + 1` (565), not the clock, so a real edit made elsewhere still wins. No bloom plays.
- **A hidden parent with no children at all is left alone**, so it stays hidden indefinitely (606).
- This repair shipped in commit `6deb815` (2026-10-04), which is in 1.8.0. 1.8.0 is live on both stores, but older installs never repair.

### A7. Completion date and the Calendar
- The parent's `completedAt` is the step's own `completedAt` (`today.ts:505`, `:368`), or the round's latest in the repair (646-648). So the whole task lands on the same day as its last step.
- Once finished, the parent is an ordinary done one-off. It shows on Today's "Done today" that day (`tasksForToday`, `today.ts:72`).
- The Lookback / Calendar (`completionsByDay`, `calendar.ts:64-82`) counts **both** the parent and each step on its own day. A 3-step breakdown is 4 completions.
- `isBigWin` (`reward.ts:24-26`) is true when `complexity` is 25 or more, the task waited 7 days or more, or it is marked big. Steps with 25+ minutes count too.
- A retired tiny pebble is tombstoned, so it never appears in the Lookback.

### A8. Telemetry
- **On the server:** `/plan` logs an `ai_calls` row carrying `corrId` with the whole offered plan (`server/src/index.ts:738-782`).
- **Completion signal:** each finished step that has a `decompositionId` sends `buildOutcome` (`client/src/lib/outcome.ts:17-24`) to `/outcome` with `{id, steps_total, days_elapsed}` (`ai.ts:139-149`, handled at `index.ts:357-374`). Only AI steps send this. Phases, manual steps and tiny pebbles do not.
- **`decompositionId` and `decompositionSteps` never sync.** They are in `LOCAL_ONLY_FIELDS` (`sync-merge.ts:25-32`). A step finished on another device, or by a server writer, sends no completion signal.
- **Events that leave the device** (`telemetry.ts:23-50`, with the server allowlist in `server/src/events.ts:21-60`): only `breakdown.started`, `tiny.made` and `slices.defined`, as bare names.
- **Console only:** `breakdown.added`, `breakdown.manual`, `breakdown.steps.edited`, `parent.completed {depth}` and `tiny.stepDone`.

### A9. What syncs
- **Mapping:** `client/src/lib/sync.ts` (`TaskRow` 17-43, `taskToRow` 49-75, `rowToTask` 85-115). Columns are in `supabase/schema.sql:17-41`.
- **Synced:** `parent_id`, `silent_parent`, `open_parent`, `parent_title`, `complexity` (integer), `slices` (jsonb), `due`, `completed_at`, `created_at`, `updated_at`, `deleted_at`, `combined_from`.
- **Read-back rules:**
  - `silent_parent` becomes true only if truthy. false and null both mean "not hidden" (101).
  - `open_parent` keeps true and false, and null means unknown (110).
  - `parent_title` is kept only if it is a string (111).
- **Not synced:** `decompositionId`, `decompositionSteps`, `suggestBreakdown`, `manualOrder`, `nudgeAt` / `nudgeId`.
- **Upserts:** `taskToRow` sends every column on every upsert (`pushTasks`, 156-161, `onConflict: 'id'`).
- **When sync runs:** only on open, sign-in and sign-out (`today.tsx:866-945`, `1777`). There is no push on change, so a server write appears on the device's next open.
- **Merge:** last-write-wins on `updatedAt` (`sync-merge.ts:57-93`), then sorted by `createdAt`, then `id` (89-90).

### A10. Related
- **Chart a course** (`client/src/app/chart.tsx:175-196`) writes plain one-offs with `c-` ids, no `parentId`, `complexity: minutes`, and the same "(N min)" title.
- **What MCP does today:** `break_down` only proposes (`server/src/mcp.ts:170-183, 814-858`), then the agent calls `add_task`, which writes `{id: 'mcp-…', user_id, title, done: false, created_at, updated_at, due?, recurrence?}` (290-316, 719). The steps are unlinked. `complete_task` patches `done`, `completed_at` and `updated_at` only (355-365). It never walks a parent and never touches `slices`. The REST API matches (`api.ts:174-220`, ids `api-…` at 375-377), and its `SELECT` (47) exposes none of the parent or slices columns.

---

## B. Track in steps (`slices: {total, done}`)

**Model:** `Slices` (`tasks.ts:16`) and the pure maths in `client/src/lib/slices.ts`. The editor allows 2 to 50 parts (`MIN_SLICES`, `MAX_SLICES`, 13-14).
- `applySliceDelta` (40-49) clamps the count to 0..total and sets `done = (slices.done >= total)`. At a bound it changes nothing.
- `setSliceTotal` (58-63) clamps to 2..50 and carries progress over, with `done` reset to match.
- `clearSlices` (66-69) sets `slices: null` and leaves the done flag alone.

**Creating one:**
1. **From the capture box:** the step count in `BrainDump` is offered only for a single line with no repeat (`BrainDump.tsx:235, 411`). `capture` adds `slices: {total, done: 0}` (`today.tsx:2257, 2265`). Event: `slices.defined`.
2. **From the held card, "Track in steps":** offered on any one-off (`today.tsx:2871` for open Today rows, `3383` for Later rows). It opens `openSliceEdit` (2424-2430), then `confirmSliceEdit` (2433-2459), which calls `setSliceTotal` and stamps `updatedAt`. If shrinking the count finishes the task, it adds `completedAt: now` and runs `finishTasks`. Event: `slices.defined` or `slices.resized`.
3. **"Count in parts":** offered from the Break-it-down questions, the review and the manual breakdown, for an existing task only (`today.tsx:4513-4521, 4534-4542, 3953-3968`).
4. **Back to one task:** `makeWhole` (2461-2470). Event: `slices.cleared`.
- A sliced task hides Break it down and Make it tiny (`TaskRow.tsx:483-484`). A breakdown **step** can still be sliced.

**Moving through it:**
- A tap on a sliced row calls `step(id, +1)` (`TaskRow.tsx:966-1006`, `today.tsx:2475-2511`). It stamps `updatedAt`.
- Reaching the last part sets `completedAt: now`. Stepping back from complete sets `completedAt: null`.
- **Completing runs `finishTasks`** (2496-2508): the shared-list tick, the completion signal, and the parent walk if the sliced task is a breakdown step.
- Stepping back is "Undo a step" in the parts editor (`today.tsx:4104-4113`), or Later rows' `onRetreat` (3374).
- A tap on a finished sliced row does nothing (clamped).
- Focus Done and "Done on…" fill every part (`today.tsx:1282`, `tasks.ts:162`).
- The row shows `done / total` and a progress bar (the bar is hidden in the quiet appearance).
- Event: `slices.progressed {done, total, complete}`, console only.

**Sync:**
- `slices` is jsonb, sent as-is (`sync.ts:61, 100`). **`rowToTask` does not validate it.** Only the local load cleans it (`cleanSlices`, `tasks.ts:105-114`, which drops `total < 1` and clamps `done`).
- The merge takes the winner's `total` and the **highest `done`** seen on either side, capped at `total` (`sync-merge.ts:106-109`, tested as "progress is monotonic"). It pushes if that grew (77).
- **The `done` flag is not recomputed after that.** Consequence: neither a server nor an "Undo a step" made after the higher count synced can lower `slices.done`. It springs back up on the next sync, possibly next to `done: false`.
- `slices: null` on a newer row does win.
- The shared list has no slices (`BrainDump.tsx:53`).

---

## C. Rules a server writer must follow

1. **Ids.** Text, globally unique (`tasks.id text primary key`), any format. Prefixes in use: `t-`, `c-`, `mcp-`, `api-`, `seed-`. Use a random tail, as `mcp.ts:719` does. Set `user_id` to the verified user (RLS, `schema.sql:46-53`).
2. **`updated_at` is written by the client and has no trigger** (`schema.sql:12-15`). Every edit must stamp it, and it must beat the device's copy. The parent flip especially: if a device's copy is newer, it wins and pushes `silent_parent: null` back. The steps then point at a visible parent that never closes, because `decide()` and `completeAncestors` need `silentParent` (`today.ts:361, 470`). Devices correct their clock against the server, so server `now()` is normally fine.
3. **Parent row:** `silent_parent = true`, `open_parent = false` for a breakdown (true only for Make it tiny), `done = false`, `recurrence` null, no `slices`. `complexity` = the sum of step minutes, which is optional but drives the celebration and big-win marks. The title stays the task's own.
4. **Step rows:**
   - `parent_id` = the parent, `parent_title` = the parent's title, `done = false`, `recurrence` null (the app only breaks down one-offs, `TaskRow.tsx:483`).
   - `complexity` = minutes, as an **integer** (the column is `integer`).
   - The title is `"{title} ({minutes} min)"` in the user's language.
   - `due` null for today, else `'YYYY-MM-DD'`. The app uses the device's local day and the server uses UTC, so prefer null for "today".
   - Later phases are children too: title only, no minutes, no complexity, `due` = the phase start.
5. **Order is `created_at`, then `id`** (`sync-merge.ts:89`). Write the parent first, then steps in order, then phases, each **at least 1 ms apart**, as the app does with `now + i`. Postgres keeps microseconds but the app parses milliseconds, so equal milliseconds fall back to id order.
6. **Write 2 or more steps or the parent never auto-closes.** A round of one brings the parent back to Today instead (`today.ts:495`, `:632`). Adding a single step later, after the earlier ones are done, also leaves a round of one (`currentRound`).
7. **Never leave a hidden parent with no children.** The repair ignores it, so it would be invisible on Today and to MCP and REST. Write the steps first, then set the parent to hidden (or do both in one transaction or RPC).
8. **Completing a step server-side:** `done = true`, `completed_at` = now, bump `updated_at`. Steps are one-offs, never `completed_dates`. For parity, also walk the parent with the app's rules from `settleCompletions` and `healStuckParents`:
   - all live children done and 2 or more in the round → `done = true`, `completed_at` = the latest step's `completed_at`, `silent_parent = false`, `updated_at` bumped
   - never finish an `open_parent` task, and never finish a round of one
   - otherwise devices on 1.8.0 repair it quietly on their next open (no bloom), and older installs never do. Until then MCP and REST hide the parent.
   - The server cannot import the client (`api.ts:65-67`), so these rules need a port or a shared module.
9. **Completing a sliced task server-side:** set `slices.done = total` as well as `done = true`. Otherwise the row shows "2 / 5" while counting as done, and the next tap sets it back to `done: false` (`slices.ts:48`, `today.tsx:2484`). Today's `complete_task` has exactly this flaw. Write `slices` as `{total: integer 2..50, done: integer 0..total}`, because `rowToTask` does not validate it. Never try to lower `done`: the merge keeps the higher value.
10. **Tiny via server:** parent `silent_parent = true` and `open_parent = true`, exactly one open child with `parent_id` and `parent_title`. On the tick the app brings the parent back and tombstones the pebble.
11. **Completion signal for server-written steps:** the app cannot send it, because `decompositionId` is device-only. If the server should feed it, it must log the outcome itself (`logOutcome`, `index.ts:372`) or a column must be added.
12. **Any new task field** needs a column applied first. The client sends every column on upsert, and `sync-merge.test.ts` fails unless each Task key is either synced or listed in `LOCAL_ONLY_FIELDS`.

One more thing to settle in the design: whether the Calendar should keep showing a hidden parent's own `due` as planned (A4).

# Server side

## Server-side map: DoubleDone MCP + REST v1 (read-only, branch `landing-v2` @ 986a8f0)

I read every file named below and changed nothing. I did not run the tests, because vitest writes caches and the brief said change nothing. All paths are relative to `C:/Users/molte/Dropbox/Claude Output/Product Manager Portfolio/DoubleDone`.

---

### 1. Routing and auth

- **`/mcp` triage**, in `server/src/index.ts:1243-1249`:
  - OPTIONS goes to `handleMcp`.
  - A JWT-shaped bearer (`oauth.ts:63-67`, three base64url segments) goes to the legacy `handleMcp(request, env)`.
  - Anything else goes to `oauthFetch`. That covers the OAuth provider's opaque token, and no bearer at all, which gets the RFC 9728 401.
- **OAuth endpoints** go to the provider (`index.ts:1253`, `oauth.ts:73-83`). The provider config is at `oauth.ts:582-593`: `apiRoute:'/mcp'`, S256 only, scope `tasks`.
- **`/mcp/disconnect`** is at `index.ts:1224-1233`.
- **`/api/*`** goes to `handleApi` (`index.ts:183-185`), inside the app router.
- **OAuth API handler** (`oauth.ts:94-103`) calls `handleMcp` with `{kind:'oauth', getToken}`. `getToken` is `mcp-grants.ts:getAccessToken` (203-283):
  - It returns the cached access token if it has more than 60s left (214-215). That token is stored **in plaintext** in D1 (273).
  - Otherwise it refreshes against `/auth/v1/token?grant_type=refresh_token` and persists the rotated refresh token AES-GCM-encrypted.
  - A 401/403/404 on refresh revokes the grant. A 400 does not.
- **Verification**, in `verify.ts:35-50`: jose `jwtVerify` against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, algorithms `['ES256','RS256']`, issuer `${SUPABASE_URL}/auth/v1`, `sub` required. Any failure returns null.
  - MCP verifies only on `tools/call` (`mcp.ts:1015-1019`). A failure on the header path returns `TOKEN_EXPIRED` as isError. On the OAuth path it returns the calm "Try again" line, never a 401.
  - REST verifies every task route (`api.ts:477-478`) and returns 401.
  - The verified `sub` is what gets written as `user_id`. `decodeJwtSub` (`mcp.ts:248-260`) is now used only for tests and the email hint.

### 2. How rows reach Supabase

- **Calls:** plain `fetch` to PostgREST at `${SUPABASE_URL}/rest/v1/tasks`.
  - Headers: `apikey: SUPABASE_ANON_KEY`, `authorization: Bearer <the user's own JWT>`.
  - Writes add `content-type: application/json` and `prefer: return=representation` (`mcp.ts:281-288`, `api.ts:110-117`).
- **No elevated key** anywhere.
- **RLS** (`supabase/schema.sql:43-53`): select, insert, update and delete are each `auth.uid() = user_id`. Insert's `with check` is satisfied because the server sets `user_id = sub` from the same verified token.
- **Deletes:** never a SQL DELETE. Removal is a PATCH of `deleted_at` + `updated_at` (`mcp.ts:422-432`, `api.ts:223-229`).
- **`updated_at`** is always bumped by the writer. There is deliberately no `now()` trigger (`schema.sql:12-15`), so last-write-wins sync holds.
- **Errors:** PostgREST 401/403 maps to "token expired" (`mcp.ts:639-642`, `api.ts:399-402`). Anything else is the calm transient line on MCP and a 502 on REST.
- **Relevant columns** (`schema.sql:17-41`): `recurrence` jsonb, `completed_dates`, `skipped_dates`, `silent_parent` (29), `parent_id` (30), `left_off` (34).

### 3. MCP tools (`server/src/mcp.ts`)

- Protocol `2025-06-18` (62). `SERVER_INFO` is `doubledone` `1.0.0` (63) and has never been bumped.
- Shared `REPEAT_SCHEMA` (68-90): `kind` enum is daily, weekly, every_n_days, monthly. Also `weekdays` 0-6, `days` ≥1, `day` 1-31, `start`, with `additionalProperties:false`.
- `PREMIUM_TOOLS` is empty (212).

| Tool | Input schema | What it reads or writes |
|---|---|---|
| `add_task` (96-110, run 702-726) | `title` req, `due`, `repeat` | POST row `{id, user_id, title, done:false, created_at, updated_at}` (+`due` or `recurrence`) (290-316) |
| `list_today` (111-116, run 728-736) | none | GET (318-332), filtered in the Worker (338-352) |
| `list_upcoming` (117-126, run 738-751) | `days` int 1-30 | GET (447-459), next occurrence walk (466-499), output capped at 40 lines (747) |
| `complete_task` (127-140, run 753-759) | `id` req, `day` | read-first `setDone(on=true)` (647-679) |
| `update_task` (141-158, run 761-802) | `id` req, `title`, `due` str\|null, `repeat` obj\|null, `done` bool, `day` | PATCH fields (396-418), then `setDone` if `done` was given |
| `delete_task` (159-168, run 804-812) | `id` | PATCH tombstone (422-432) |
| `break_down` (169-183, run 814-858) | `task` req, `context`, `steps` 2-10 | Anthropic only, no Supabase call |
| `search` (188-197, run 861-868) | `query` req | GET (511-520), substring match in the Worker, cap 20 (524-539) |
| `fetch` (198-207, run 870-882) | `id` req | GET by id (542-549) |

**How `add_task` builds a row:**
- `title` is trimmed and required.
- `hasDue = args.due != null` and `hasRepeat = args.repeat != null`. Both at once is refused (708).
- `due` must pass `isValidIsoDay` (712). Past dates are allowed.
- A repeat goes through `buildRecurrence(args.repeat, todayIso)` (716), where today is the UTC day (`now.slice(0,10)`, 694).
- The id is `mcp-<Date.now base36>-<6 random>` (719).
- With neither `due` nor `repeat`, the task is undated, which means it shows on Today.
- The reply is `Added "X" to today.` / `for <due>.` / `, repeating.` (724). **It never returns the new id.**

**`setDone` (647-679), read-first:**
1. GET `id,done,recurrence,completed_dates` with `deleted_at=is.null`, `limit=1` (377-380).
2. If `asRecurrence(row.recurrence)` is non-null, it is treated as a repeat. `tickForDay` decides the change. On `already` it writes nothing and says so. Otherwise it PATCHes `completed_dates` only, never `done` (383-389). Every reply names the day.
3. Otherwise it is a one-off: PATCH `{done:true, completed_at, updated_at}` (355-365) or the reopen version (368-374). Both carry the `deleted_at` guard.

**`update_task`:**
- Field PATCH first, then `done` is applied to the row as it now stands (801).
- Setting `due` nulls `recurrence`, and setting `recurrence` nulls `due` (406-413).
- `day` is validated even when `done` is absent, but then ignored (788).

### 4. `break_down`: propose-only and its limits

- It never calls Supabase. The test at `mcp.test.ts:511-527` asserts exactly one fetch, to Anthropic.
- The reply is a bullet list followed by "Nothing's been added yet. Say the word and I'll add these." (624-630). It contains no `[id]` tokens (test at 529-550).
- **Guards, in order, all before any spend (818-833):**
  - `ANTHROPIC_API_KEY` must be present.
  - `task` and `context` are each capped at 2000 characters (`BREAKDOWN_MAX_CHARS`, 597).
  - Per-IP `AI_LIMITER` on the pasted-token path only (827-830). `ip` is `mcp:<CF-Connecting-IP>` (1022). The limiter is 30/60s (`wrangler.jsonc:26`).
  - Per-user hourly cap of 20 (`BREAKDOWN_HOURLY_CAP`, 594), as a fixed window in `OAUTH_KV`. Key is `mcp:bd:<sub>:<hourBucket>` (600-603), TTL 3900s.
  - Every refusal is isError.
- **How the cap behaves (609-621):** unbound KV means allow. A KV error means refuse (fail closed). It is a non-atomic get-then-put on eventually-consistent KV, so the cap is soft: it can be exceeded by concurrent calls or calls landing on different edges.
- **The model call:** reuses `decompose.ts`, model `claude-sonnet-4-6` (6), 3-6 steps (13), forced `record_steps` tool (89). `steps` and `context` fold in as a qualifying answer (899-907).
- **Telemetry:** `logAiCall` records `{endpoint:'decompose', input:{task, via:'mcp'}}` with **no `corrId`** (846-855, compare `telemetry.ts:41`). Agent decompositions can therefore never be linked to outcomes.

### 5. REST API v1 (`server/src/api.ts`, `openapi.ts`)

- **OpenAPI** 3.1.0, `info.version` **1.2.3** (`openapi.ts:15-18`). Served without a token at `/api/v1/openapi.json`, with Swagger UI at `/api/v1/docs` (`api.ts:465-468`).
- **Public task shape** `ApiTask` (31-40): `id, title, done, due, recurrence (normalised via asRecurrence), repeats (English summary, 68-91), createdAt, completedAt`. `SELECT` (47) never includes `left_off` or the parent fields.
- **`GET /tasks` read modes**, precedence `q` > `upcoming` > `today` > plain (411-440):
  - `?q`: open, not deleted, not a silent parent, `done=is.false`. Matched in the Worker, cap 50 (143-152, 239-251).
  - `?upcoming`: window clamped 1-30, default 7. One-offs in (today, end]. Each repeat's next occurrence becomes its `due` (158-167, 256-300).
  - `?today=true`: open, `recurrence=is.null`, not a silent parent, due today or earlier or undated (130-135). **Repeats are excluded here**, unlike MCP `list_today`.
  - Plain: only `deleted_at=is.null` (129). That includes done tasks and silent umbrellas.
- **`POST /tasks`:**
  - `parseCreate` (319-336): `title` is trimmed and required. `due` passes a **regex-only** shape check (48, 326). `repeat` must be an object. `due` and `repeat` together is a 400.
  - Then `buildRecurrence(repeat, UTC today)`. Null means 400 (495-501).
  - Id is `api-<base36>-<6>` (375-377). `createRequest` POSTs with `?select=SELECT` (174-189). Returns 201 `{task}`.
- **`PATCH /tasks/{id}`:**
  - `parseUpdate` (342-372): `title`, boolean `done`, `day` (`isValidIsoDay`, valid only with `done`), `due` (regex), `repeat` obj\|null. Non-null `due` and `repeat` together is a 400. An empty patch is a 400.
  - When `done` is present it reads first (551-564). `repeatsAfter` is judged on the shape after the patch (560-561). A repeat gets `completedDates = tickForDay(...)`. A one-off gets `done`.
  - `updateRequest` carries the `deleted_at=is.null` guard (198) and the same due/recurrence mutual exclusion (211-218).
- **`DELETE`:** tombstone, **always 204**, even on a miss (582-587).
- **Error handling:** an id that does not decode is a 400 (518-523). Any throw becomes a JSON 500 with CORS (446-455).
- **Parity with MCP:** same `buildRecurrence`, same `tickForDay`, same `asRecurrence` and `isDueOn`, same UTC day. But `addDaysIso`, `upcomingWindow` and `nextOccurrence` are **duplicated by copy** (`mcp.ts:438-499, 572-577` and `api.ts:256-308`), not shared.

### 6. Shared helpers (`server/src/cadence.ts`)

- `Recurrence` type (12-19): daily, weekly, interval, monthly, none.
- `isDueOn` (52-74). Monthly clamps to the last day of short months.
- `asRecurrence` (78-92): a defensive JSONB narrowing. `{kind:'none'}` and junk become null.
- `recurringDueToday` (97-109): due today, and not in `completed_dates` or `skipped_dates`.
- `buildRecurrence` (134-165): `start` defaults to today. `every_n_days` maps to `{kind:'interval', days, anchor}`. Monthly `day` defaults to `start`'s day of month (153).
- `tickForDay` (175-180): drops non-string entries and reports `already` when nothing would change.
- `isValidIsoDay` (184-190): a strict real-calendar-day check.

### 7. `silent_parent` and `parent_id` behaviour

| Surface | Silent umbrella (`silent_parent=true`) | Step rows (`parent_id` set) |
|---|---|---|
| MCP `list_today` (`mcp.ts:327`) | excluded (`not.is.true`, so null and false pass) | included, as plain titles |
| MCP `list_upcoming` (451), `search` (515) | excluded | included |
| MCP `fetch` (542-549) | **returned** (no filter) | returned |
| MCP `complete`/`update`/`delete` by id | allowed | allowed |
| REST `?q`, `?upcoming`, `?today` (147, 162, 133) | excluded | included |
| REST plain list, `GET /{id}` | **included** | included |

- **Neither surface reads or writes `parent_id`** (zero hits in `mcp.ts`, `api.ts`, `openapi.ts`).
- The completion cascade lives only in the client: `completeAncestors` / `settleCompletions` / `resurfaceOpenParent` (`client/src/lib/today.ts:344-474`) and the `healStuckParents` repair on Today open (`today.ts:602-649`).

---

### 8. Findings, ranked

**Medium**

1. **Agent completion does not cascade.**
   - `complete_task` or REST `PATCH done` on a breakdown's last step sets `done` on that step only.
   - The umbrella stays `silent_parent=true`, so it is invisible to the agent (excluded from `list_today` and `search`) and not finished in the app. It stays that way until a device opens Today, runs `healStuckParents`, and syncs.
   - A tiny pebble completed by an agent likewise does not retire itself or bring its real task back.
2. **An agent breakdown is flat and unlinked.**
   - The `break_down` → `add_task` flow creates top-level tasks: no `parent_id`, no umbrella, no whole-task payoff.
   - The MCP decompose log has no `corrId`, so agent breakdowns are outside the completion-outcome flywheel.
   - `add_task` also never returns the id it created (724-725).

**Low to medium**

3. **Series rows marked done before the 2026-09-25 fix stay hidden from every agent read.**
   - Every repeat read filters `done=false` (`mcp.ts:328, 455, 516`, `api.ts:148, 163`).
   - Decision log 8078-8093 fixes the write path but records no repair of existing rows.
   - Not verified against live data. A count over `tasks` with `recurrence is not null and done and deleted_at is null` would size it.

**Low**

4. **MCP `update_task` and `delete_task` have no `deleted_at` guard** (`mcp.ts:403, 423`). `complete`, `reopen` and `tick` do (356, 369, 384), and so does REST `PATCH` (`api.ts:198`).
   - `update_task` on a removed task edits it and replies "Updated."
   - `{title, done}` on a removed task writes the title, then reports "No matching task found." (a partial write).
   - Delete on both surfaces re-stamps an existing tombstone's time. The client reads that time for the undo window and Combine fold matching (`today.ts:574-592`).
5. **`fetch` returns removed and silent-parent rows** and labels a removed task "on today". This contradicts the code comments (`mcp.ts:561-564, 872-875`) and `docs/mcp.md:245`, which treat "deleted since search" as a miss.
6. **Three different rules for "is this a repeat".**
   - `list_today` and `list_upcoming` test `recurrence == null` (345, 473), so a `{kind:'none'}` row is dropped.
   - `setDone` uses `asRecurrence` (656), so the same row is a one-off.
   - `describeStatus` uses raw `!= null` (583), so the same row reads "repeats".
   - REST `?today` uses SQL `is.null`, so the row is hidden.
   - The test at `mcp.test.ts:815` claims a `{kind:'none'}` row is a one-off "exactly as it is to list_today". That is false: `list_today` hides it.
   - This is latent. The client writes `{kind:'none'}` only for shared rows (`when.ts:37-39`), and the copies onto a personal Today carry no recurrence (`ours-list.tsx:645-653`, `today.tsx:2346-2353`).
7. **`buildRecurrence` checks `start` loosely** (`cadence.ts:125-127, 136`). `2026-02-30` and `2026-07-01junk` are accepted and stored raw, even though the strict `isValidIsoDay` exists. The test at `cadence.test.ts:123-124` only covers obvious junk.
8. **REST `due` is regex-only** (`api.ts:326, 359`), while MCP uses `isValidIsoDay` (712, 772). `api.md:140,158` documents this, but it contradicts the "kept in lockstep" header at `api.ts:9-13`.
9. **REST repeat error messages omit monthly** (`api.ts:331, 365, 499, 570`), although monthly is accepted.
10. **OpenAPI drift** in `openapi.ts`:
    - The plain list is described as "open and dated" (36). In fact it returns every non-deleted row, including done tasks and umbrellas.
    - `DELETE` documents a 404 (121) that the handler never returns.
    - `InternalError` (223) is defined but no operation uses it.
    - `TaskInput.due` says "future", which is not enforced.

**Info**

11. **The MCP handler's own no-token branch (`mcp.ts:993-999`) cannot be reached in production.** `index.ts:1247` only calls `handleMcp` with a JWT-shaped bearer. The tests at `mcp.test.ts:187, 681` cover that dead branch.
12. **Writes return full rows to the Worker.** MCP writes use `return=representation` with no `select`, so the full row, including `left_off`, comes back to the Worker. Agents never see it. The `schema.sql:34` note ("never selected") is true for reads only.
13. **No rate limits beyond `break_down`.** The REST API and the other MCP tools have none, as documented in `docs/mcp.md:314`.

### 9. How the tests mock Supabase

**Mechanism**
- Global `fetch` is replaced with `vi.stubGlobal('fetch', vi.fn(...))` and restored with `afterEach(vi.unstubAllGlobals)`.
- Responses are minimal doubles cast to `Response`: `{ok, status?, json}` (`mcp.test.ts:43-45`).
- `sequence(...answers)` replies to calls in order and records URL, method and body (`mcp.test.ts:693-703`, `api.test.ts:468-478, 547-555`).
- The verifier is injected: `trust = decodeJwtSub`, passed as `handleMcp`'s 4th argument and `handleApi`'s 3rd (`mcp.test.ts:40`, `api.test.ts:25`). The "PR A" blocks use the real jose verifier with `alg:none` forged tokens and assert no fetch at all (`mcp.test.ts:589-618`, `api.test.ts:425-443`).
- KV and `AI_LIMITER` are plain `vi.fn` objects.

**What this leaves untested**
- Filter strings are only checked by substring on the decoded URL (`mcp.test.ts:91-104, 298-305, 344-349`, `api.test.ts:113-119`). PostgREST semantics never execute: the `or=` grammar, and `not.is.true` against NULL.

**Coverage gaps**
- No behavioural test for `parent_id` or silent-parent rows.
- No test of `update`, `delete` or `fetch` against a removed task.
- No test of the REST plain list's contents, or of DELETE on a miss.
- The OAuth path is only tested failing verification; there is no test of it running a tool successfully.
- No test of the 40-line cap on `list_upcoming`.
- `tools/list` is checked by tool names only, not schemas.
- No parity test that runs MCP and REST over the same rows.

### 10. `docs/mcp.md` against the code

These match: the tools table (136-146), the limits (307-314), the security model, and what is not exposed (396-414).

These are drifts:
- The `fetch` "miss" wording (243-248) is wrong for removed tasks (finding 5).
- The `list_today` umbrella note (165-168) holds for reads, but nothing tells an agent that completing the last step does not finish the umbrella (finding 1).