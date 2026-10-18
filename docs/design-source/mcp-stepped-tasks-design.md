# Design: stepped tasks through MCP and the REST API (adversarially reviewed)

Read-only review against `landing-v2` @ 986a8f0 (`server/` is identical to `main` there). I checked every claim against the code myself. Most of the design held up. The corrections below are the ones that would have shipped a bug, a test that cannot pass, or a smoke test that proves nothing.

## What I changed and why

**Would have shipped wrong**

1. **The REST smoke test proves nothing.** `handleApi` checks the bearer *before* routing (`api.ts:472-478`), so the OLD Worker also answers 401 to `POST /api/v1/tasks/x/steps`. This is the CLAUDE.md "a 200 proves nothing" gotcha in a new form. The REST proof is now the public `GET /api/v1/openapi.json` (version `1.3.0` plus the new path).
2. **The QA ids collide.** MCP-18 and MCP-19 already exist (`scripts/gen-test-suite.py:634,637`). The new cases are **MCP-20 to MCP-24**.
3. **`update_task done: true` on a sliced task is now +1 part, the same as `complete_task`.** It no longer fills every part. The design's own R5 says an over-tick is permanent (`sync-merge.ts:106-109` keeps the max), so a second tool must not fill everything in one call. This also keeps today's equivalence: both tools go through `setDone` (`mcp.ts:793,801`). REST `done: true` still fills, matching Focus Done (`today.tsx:1282`), because REST has explicit counts.
4. **Renamed `complete_task`'s `parts` to `count`.** `parts` was the total on `add_task` / `update_task` and a delta on `complete_task`. That is the same trap the design's own pushback #1 warned about.
5. **The guard on a slices write now pins `total` too, and uses the raw stored text.** The old guard was `slices->>done=eq.<normalised>`. It let a concurrent resize be reverted, because the write sends the whole object. It also never matches a malformed stored value, so the agent would loop on "try again".
6. **`done: true` comes before the sliced branch.** Today's flaw left rows that are `done: true` at 2/5. With the old order they hit the `done=is.false` guard and looped forever. They now answer "Already done."
7. **Re-completing a done one-off now writes nothing.** Today `complete_task` PATCHes unconditionally (`mcp.ts:355-364`), which re-stamps `completed_at`. That moves the task in the Lookback and would re-run the new walk. The read is already there, so the reply is "Already done." and the PATCH gains `done=is.false`.
8. **The parity fixture asserted something false.** Take an ancestor with a stale tiny flag and two or more steps in its round. The app's `decide()` clears the flag and returns `'walk'`, but `today.ts:513` ignores that return, so `backs` stays empty while the server stops. The "`backs` non-empty exactly when `leftForApp`" assertion would fail. The new invariant compares end states (section 7).
9. **The tiny case was mislabelled.** Make it tiny also sets `silent_parent` (`today.tsx:2710`), and its pebble carries `parent_id` / `parent_title` (`today.tsx:2711`). So `(step of "X")`, "is broken into steps" and REST `brokenDown` all mislabel a tiny task. The wording is now neutral (`(toward "X")`, "waiting on its steps"), and the REST field is now `hidden`.

**Simpler**

10. **The server uses one finish rule at every level and never writes `open_parent`.** It finishes only when the answer is certain. Every other case, including the stale tiny flag, goes to the app's repair, which reaches the same end state (`today.ts:617-620` clears the flag then finishes, `632-644` brings the task back). The port is smaller and writes one field fewer.
11. **REST parts fields are flat and match on read and write: `partsTotal` / `partsDone`.** Before, `parts` was an integer on input and an object on output.
12. **Annotations:** `readOnlyHint: false` is already the default, so setting it on writers does nothing. The lever that matters is `readOnlyHint: true` on the six readers. Writers keep the defaults, and `destructiveHint` defaulting to true is the cautious signal.

**New risk and gaps**

13. **New risk R11: done and slices can drift apart in the merge.** `reconcileConflict` takes the max `slices.done` but the last-write-wins winner's `done` (`sync-merge.ts:101-109`). Say a device edits a sliced row after the agent's completing tick but before its next pull. The task then sits at "5 / 5" and open, and tapping it does nothing (`applySliceDelta` is a no-op at the limit, `slices.ts:46-47`). This already happens between two devices. A second writer makes it more likely. The fix is one line in the client, in its own commit, outside this server-only change.
14. **The telemetry trigger had the wrong denominator.** The app's breakdown goes through `/plan` (`today.tsx:2546`, `index.ts:777`), not `/decompose`.
15. **REST also refuses `repeat` on a sliced task, a step or a hidden big task (409).** Section 2 listed this for MCP only.
16. **A leading bullet is stripped from step titles too.** `break_down` writes `• ` before each step (`mcp.ts:627`).
17. **Docs list fixes:**
    - `CLAUDE.md` is gitignored (`.gitignore:48`), so its row is a local edit after deploy, not part of any commit.
    - Added the CHANGELOG `[Unreleased]` entry and the README line ("nine tools", `README.md:54`).
    - The OpenAPI schema is called `TaskPatch`, not `TaskUpdate`.
18. **Added notes:**
    - The undo path: delete the steps, and the app's repair brings the big task back.
    - Never copy a parent rename onto its steps' `parent_title`.
    - Agent ticks never close an Ours row (the server never touches `shared_ref`).
    - Connectors cache `tools/list`.
    - `check-migrations.py` does not probe `slices` / `parent_id` / `silent_parent` / `complexity`. Every client upsert names them (`sync.ts:49-74`), so live sync is the proof they exist.

**Claims that held** (spot-checked):
- The app writes for a breakdown: `bdAccept` (`today.tsx:2580-2628`), `manualBreakdownSubmit` (`2657-2688`).
- The app's finish and repair rules: `decide()` round-of-one rule (`today.ts:495`), `currentRound` (`328-332`), `healStuckParents` finishing two or more and bringing back fewer (`632-648`), in 1.8.0 (`6deb815`), live on both stores (`version.json`).
- The step title strings: German `Min.` (`de.ts:53`), the others `min`.
- Capture's slices-only-without-repeat rule (`BrainDump.tsx:235`).
- The held card's no-breakdown-on-repeat-or-sliced gate (`TaskRow.tsx:483`).
- `rowToTask` passes `slices` through unvalidated (`sync.ts:100`).
- The documented `left_off` privacy line (`schema.sql:34`, `docs/mcp.md:398`).
- `breakdown.added` is console-only (`events.ts:21-61`).
- The full-steps logging in the app's `/decompose` (`index.ts:505`).
- Calendar A4 (`calendar.ts:104-111`).
- The OpenAPI drift items: `api.ts:331,365,499,570` and the DELETE route returning 204 every time (`api.ts:582-587`).

---

## 0. The design on one screen

| Change | What it is |
|---|---|
| **New MCP tool `add_steps`** | The accept-the-plan tool. It writes a hidden big task plus linked steps, exactly as `bdAccept` / `manualBreakdownSubmit` do. Pass `task_id` to break down an existing task, or `title` to create the big task and its steps together. |
| **`parts` on `add_task` / `update_task`** | Track in steps (`slices {total, done}`), 2 to 50, one-off tasks only. |
| **`complete_task` (and `update_task done: true`)** | A sliced task moves forward **one part**, or `count` parts. A step closes, and the server finishes the big task **only when the answer is certain**. Everything else is left to the app's repair. Ticking a hidden big task directly is refused. A task already done answers "Already done." and writes nothing. |
| **Reads** | `list_today` / `list_upcoming` mark `(3/10 parts)` and `(toward "X")`. |
| **`break_down`** | Still writes nothing. It now points at `add_steps` and logs the full offered steps. |
| **REST** | `partsTotal` / `partsDone` on the existing routes, `steps` on `POST /tasks`, a new `POST /tasks/{id}/steps`, and five new read fields. OpenAPI **1.2.3 → 1.3.0**. |
| **Shared pure module** | `server/src/steps.ts`, used by both surfaces. One fixture file, `server/src/settle-cases.json`, is run by the server port and by the client's `settleCompletions` + `healStuckParents`, and the tests assert the same **end state**. |

**Two pushbacks on the Backlog wording (kept), plus one extension:**

1. **Call the slice count `parts`, not `steps`.** In this API `steps` already means two things: `break_down`'s integer hint, and the array of linked steps. The app's own copy uses "Count it in parts" (`today.countInParts`, `en.ts:1176`), and every description names "Track in steps" (`sliceTitle`) so the model can match what the user says.
2. **One accept tool, not a `steps` array on `add_task` / `update_task`.** Those two tools already juggle the `due` / `repeat` either-or rule. One tool with one job is easier for a model to call correctly. It also covers steps the user dictates with no AI involved, which is why it is `add_steps` and not `accept_breakdown`.
3. **Extension, the same principle:** `complete_task`'s optional count is called **`count`**, because `parts` already means the total everywhere else.

---

## 1. MCP tool changes

### 1a. New tool: `add_steps`

**Description (written for the model):**
> Break one of the user's tasks into linked steps, the way the app's "Break it down" does. The big task is tucked away out of the list, and its steps go on today, or on the days you give them. When the user ticks the LAST step, here or in the app, the big task closes itself as done. Call this ONLY after the user has said yes to these exact steps: steps from `break_down` as they edited them, or steps they dictated. Pass `task_id` to break down a task already on their list, or `title` to create the big task together with its steps. Use 2 to 20 steps, in the order they will be done. Do NOT also call `add_task` for these steps. Not for a repeating task, or for one tracked in parts.

**Input schema:** unchanged from the draft. `task_id` | `title`, plus `steps[]` (2 to 20). Each step has `title` (required), `minutes` (integer 1 to 480) and `due` ('YYYY-MM-DD'), with `additionalProperties: false`. The `task_id` / `title` either-or rule is checked at runtime, not with `oneOf`.

**Normalising what the model sends** (`steps.ts`, pure):
- Trim the title. Strip a leading list marker (`• `, `- `, `* `, `1.`, the same set `parseDump` strips), because `break_down` writes `• ` before each step. Strip a trailing `(N min)` / `(N Min.)`.
- If `minutes` is missing but the title had the suffix, take the minutes from the suffix.
- A finite non-integer `minutes` is rounded. Outside 1 to 480 it is refused, not clamped.
- Step titles, and the `title`-mode big-task title, are at most 500 characters.
- `due` goes through `isValidIsoDay`.
- **Ids:** one `mcp-<ms36>-<rand6>` base per call, with `-p` for the big task and `-<i>` for each step. They are unique within the batch by construction, not by luck. (`tasks.id` is a global primary key.)

**`title` mode: ONE PostgREST `POST` of n+1 rows** (a single INSERT, so it is atomic).

| Row | Fields (every row emits the **same key set**, see R2) |
|---|---|
| Big task | `id`, `user_id: sub`, `title`, `done: false`, `created_at = updated_at = T`, `silent_parent: true`, `open_parent: false`, `complexity` = sum of minutes or `null`, `parent_id: null`, `parent_title: null`, `due: null` |
| Step i | `id`, `user_id: sub`, `title: "{title} ({m} min)"` (or the plain title), `done: false`, `created_at = updated_at = T + 1 + i` ms, `parent_id`, `parent_title`, `complexity: m` or `null`, `due` or `null`, `silent_parent: null`, `open_parent: null` |

**`task_id` mode: read, insert, guarded flip, with a compensating write if the flip misses.**
1. **Read:** `GET id,title,done,recurrence,slices,silent_parent` with `deleted_at=is.null`. Each refusal is `isError` and writes nothing:
   - none found → "No matching task found."
   - `done` → "That one is already done."
   - repeating → "A repeating task can't be broken into steps. Add them as their own tasks, or stop it repeating first."
   - valid `slices` → "That task is tracked in parts. Make it one whole task first (update_task parts: null), then break it down."
   - `silent_parent` true → "That task is already waiting on its steps. They are on the list." (Neutral on purpose: a Make-it-tiny task is hidden the same way.)
2. **Insert** the step rows alone (same key set, `T + 1 + i`, `parent_title` = the current title).
3. **Flip:** `PATCH tasks?id=eq.P&deleted_at=is.null&done=is.false&silent_parent=not.is.true&recurrence=is.null&slices=is.null` with `{silent_parent: true, open_parent: false, updated_at: now}`, plus `complexity: sum` only when at least one step has minutes. That matches the AI path, and the manual path leaves complexity alone. The extra `recurrence` / `slices` guards are free and close the window between the read and this write.
4. **Flip fails or matches 0 rows:** `PATCH tasks?id=in.(…the inserted ids…)` with `{deleted_at: now, updated_at: now}`, then reply "That task changed just now, so nothing was added. Try again." (`isError`). If the compensation also fails, say so plainly: "Some steps may have landed on their own. Check list_today."

What the flip never touches on the big task: `title`, `due`, `created_at`, `left_off`, `pinned_at`, `big`, `shared_ref` (the same as `bdAccept`, `today.tsx:2616`).

Allowed, as in the app:
- A step can itself be broken down (a nested chain).
- A "· Ours" copy can be broken down. BUILD-PLAN:191 (3) already parks a known bug there: "the Ours settle retirement can mark a broken-down Ours copy done while its steps stay open". This inherits it, and nothing new is added.

**Reply:** "Broke "Clear the garage" into 4 steps on today. It's tucked away now, and it closes itself when the last step is ticked." Then one line per step: `• Bag up the rubbish (5 min)  [mcp-…]`. The big task's id is not shown.

**Undo (in docs/mcp.md, not the description):** remove the steps with `delete_task`. The app's repair brings the big task back on the next open (`today.ts:606-608, 632-644`: every step removed means it comes back open).

**Other errors:**
- Both `task_id` and `title` given, or neither.
- Fewer than 2 steps: "Give at least two steps. One step on its own never closes the big task; use add_task or update_task instead."
- More than 20 steps, an empty title, bad minutes, or a bad `due`.
- PostgREST 401/403 → `TOKEN_EXPIRED`. Anything else → the calm transient line.

**Why a minimum of 2** when the app's manual breakdown allows 1: a round of one is brought back to Today and never closes itself (`today.ts:495`). An agent should not be able to set that trap.

### 1b. `add_task`: `parts`

```json
"parts": { "type": "integer", "minimum": 2, "maximum": 50,
  "description": "Optional: track it in parts, the app's 'Track in steps' (e.g. 10 for a ten-episode series). Each complete_task ticks one part, and it is done when every part is. Not with `repeat`. For a task made of DIFFERENT steps, use add_steps instead." }
```
- **Writes:** the existing row plus `slices: {total: N, done: 0}`. `due` is allowed. `repeat` is refused (matches `BrainDump.tsx:235`). Non-integer or out-of-range values are refused.
- **Every `add_task` reply now carries the id:** `Added "Watch Severance" to today, in 10 parts. [mcp-…]`. This changes the text of every `add_task` reply, so the tests that pin that exact text change too.

### 1c. `complete_task`

**New description:**
> Tick one of the user's tasks, by the id from list_today. A one-off closes. A REPEATING task ('(repeats)') is ticked for ONE day … *(the existing wording stays)*. A task TRACKED IN PARTS ('(3/10 parts)') moves forward ONE part, as one tap in the app does. Pass `count` to tick more, and the remaining count finishes it. A STEP ('(toward "X")') closes, and when it is the last open step, "X" closes as done too and the reply says so. The big task itself is not listed and can't be ticked directly: tick its steps.

**New input:** `count: {type: integer, minimum: 1, maximum: 50, description: "For a task tracked in parts: how many parts to tick (default 1). Ignored for other tasks."}`

**Flow** (read-first, one shared function used by `complete_task` and `update_task done: true`):
1. **Read:** `GET id,title,done,recurrence,completed_dates,slices,parent_id,silent_parent` with `deleted_at=is.null`.
2. **`silent_parent` true:** refuse with "“X” is waiting on its steps. Tick those, and it closes or comes back by itself." No write.
3. **Repeat:** unchanged. It ticks `completed_dates` only.
4. **`done` already true** (a one-off, or a legacy sliced row the old flaw left at 2/5): "Already done." No write. This must come before step 5, or those legacy rows hit the guard and loop forever.
5. **Sliced** (a valid `slices`, normalised like `cleanSlices`, `tasks.ts:106-114`):
   - `target = min(total, done + count)`.
   - **Guard on the raw stored text**, never the normalised value: `slices->>done=eq.<raw>&slices->>total=eq.<raw>&done=is.false&deleted_at=is.null` (`is.null` where a key is absent). Pinning `total` stops a concurrent resize from being reverted, because the write sends the whole object.
   - Not completing: `{slices: {total, done: target}, updated_at}`. Reply: "Ticked one part of “X”: 3 of 10 done. Pass count to tick more, and 7 finishes it."
   - Completing: `{slices: {total, done: total}, done: true, completed_at: now, updated_at}`, then the finish walk if `parent_id` is set.
   - 0 rows → "It changed just now. Try again."
6. **One-off:** PATCH with `done=is.false&deleted_at=is.null`, so a re-tick never re-stamps `completed_at` and never moves the task in the Lookback. 0 rows → "It changed just now. Check list_today." Then the finish walk if `parent_id` is set.

**Why +1 by default:** it matches the app's main gesture (a tap is `step(+1)`, `TaskRow.tsx:973`). The sync merge keeps the **highest** `slices.done` it has ever seen (`sync-merge.ts:106-109`), so an over-tick that reaches a device can never be lowered. An under-tick costs one more call. That asymmetry decides it, and it is why `update_task done: true` does exactly the same thing.

**The finish walk** (`planFinish` in `steps.ts`). The server finishes only when the answer is certain:
```
cursor = step.parent_id; seen = {}; depth cap 8; completedAt = the step's completed_at
loop while cursor and cursor not in seen:
  parent   = GET id=eq.cursor (id,title,done,recurrence,completed_dates,silent_parent,open_parent,parent_id,deleted_at)
  children = GET parent_id=eq.cursor (id,done,recurrence,completed_dates,completed_at,created_at,deleted_at)
  stop unless: parent found, not deleted, not done, silent_parent true, open_parent NOT true
  round = currentRound(children)                       # exact port, today.ts:328-332
  stop if round.length < 2                             # one rule at every level, 0 included
  stop unless every live child isDoneOn(day)           # isDoneOn ported, today.ts:25-28
  PATCH id=eq.cursor&done=is.false&silent_parent=is.true&open_parent=not.is.true&deleted_at=is.null
        {done: true, completed_at: completedAt, silent_parent: false, updated_at: now}
  0 rows → stop.  Else record it; cursor = parent.parent_id
leftForApp = the loop stopped at a parent that is still hidden and not done
```
(Optional: fold the two GETs into one, `or=(id.eq.P,parent_id.eq.P)`.)

- **Why the server only finishes, and never brings a task back:** `resurfaceOpenParent`, `bringBack` and the repair all **move the child's `left_off` line onto the parent** (`today.ts:403-408, 455-461, 636-641`). The server never reads or writes `left_off`, which is a documented privacy line. Retiring a pebble without moving its line would lose the user's words. So those cases stay with the app.
- **Why one rule and no flag clearing** (changed from the draft): the app clears a stale tiny flag at the direct parent and then walks. Above it, `decide()` clears the flag but its `'walk'` return is ignored (`today.ts:513`), so the app finishes nothing there. Every case the server stops on is one the repair finishes or brings back on the next open (`today.ts:617-648`), with the same end state. The only loss is the agent's "that's the whole thing" line in a rare legacy case: a task made tiny on 1.8.0, then broken down on 1.7.0.
- **Round of 0 at the direct parent** (only reachable with clock skew) is left to the repair, which brings it back. The in-app tick would finish it. That is the safe direction, accepted.
- **Replies:**
  - Not the last step: "Marked it done. 2 of 4 steps toward "Clear the garage" done." (The counts come from the `children` read.)
  - Last step: "Marked it done. That was the last step, so "Clear the garage" is done too. That's the whole thing."
  - Left for the app: "Marked it done. "X" will sort itself out next time DoubleDone opens." It may come back, or it may finish, so the reply says neither.
  - Walk write failed: the same line. **The reply never claims a close that did not land.**

### 1d. `update_task`

**New input:** `parts: {type: ['integer','null'], minimum 2, maximum 50, description: "Track this one-off in parts (2-50). Progress so far carries over, and a count at or below the parts already done finishes it. null makes it one whole task again. Not for a repeating task, or one waiting on its steps."}`

- **One read, then one PATCH**, whenever `parts`, `done` or a non-null `repeat` is given. The read covers the same columns as 1c.
- **Refused combinations:** `parts` with `done`, and `parts` with a non-null `repeat`. One change of shape at a time. `parts` with `title` / `due` is fine.
- **`parts: N`:**
  - Refused on a repeating task, a done task or a hidden task (`silent_parent`).
  - Otherwise it writes `setSliceTotal` semantics (`slices.ts:58-63`): `{total: N, done: min(N, prevDone)}`, `done: done >= N`. It uses the same raw-value guard as 1c.
  - If that completes the task, it adds `completed_at: now` and runs the walk (`confirmSliceEdit`, `today.tsx:2443-2447`).
- **`parts: null`:** `clearSlices` (`slices: null`, the done flag left alone). If the task is not sliced, reply "It wasn't tracked in parts."
- **`done: true`:** exactly the 1c path with `count: 1`. On a sliced task it ticks **one part**, not all (changed from the draft, see R5).
- **`done: false`:**
  - On a sliced task: refused, "Parts only go forward from here. Step one back in the app." The max-merge would bring the count straight back.
  - On a step: it reopens the step only. The app's untick never reopens a finished parent (`today.tsx:2222`).
- **A non-null `repeat` on a sliced task, a step (`parent_id`) or a hidden task:** refused.
- **`title` on a hidden big task:** allowed. **Do not copy the new title onto its steps' `parent_title`.** Bumping `updated_at` on sibling rows would beat a device's unsynced edit on those steps. A slightly stale marker is the cheaper failure.

### 1e. Reads

- `list_today` / `list_upcoming` also select `slices,parent_id,parent_title`, and render:
  - `• Watch Severance  (3/10 parts)  [id]`
  - `• Bag up the rubbish (5 min)  (toward "Clear the garage")  [id]`
  - The marker is `(a step)` when `parent_title` is null. Rows from builds before 2026-10-04 never sent it.
- `(toward "X")` is true for both a breakdown step and a tiny pebble, because the server cannot tell them apart without reading the parent.
- Both descriptions name the markers. Hidden big tasks stay excluded, unchanged. `search` is unchanged (its shape is pinned for Deep Research).

### 1f. `break_down`

- **Description:** "...This ONLY proposes the steps and adds nothing. Show them to the user, let them change any, and once they say yes call **add_steps** with the steps they agreed (not add_task), so the steps stay linked and the big task closes itself when the last one is done..."
- **Last line of the reply:** "Nothing's been added yet. Say the word and I'll add these as linked steps." Still no `[...]` tokens (the test at `mcp.test.ts:529-550` stays).
- Still exactly one fetch (the test at `mcp.test.ts:525-526` stays). Telemetry: see section 5.

### 1g. How propose-then-accept is preserved

- `add_steps` is the only tool that writes linked steps, and its description gates it on the user's yes to these exact steps. The chat stays the review surface. This **reverses** the 2026-07-07 "a separate add_task commits them" line (`decision-log.md:3863`), and the decision log must say so.
- **Tier 2: annotations.** Set `readOnlyHint: true` on `list_today`, `list_upcoming`, `search`, `fetch` and `break_down` (break_down changes nothing of the user's). Writers keep the protocol defaults (`readOnlyHint: false`, `destructiveHint: true`), which are already the cautious signal. Explicit `false` on writers adds nothing.
- **Rejected: a proposal token** that `add_steps` must echo. It would only prove `break_down` ran, not that a human said yes. It would also block steps the user dictates. That is consent theatre.
- `SERVER_INFO.version` **1.0.0 → 1.1.0**.

---

## 2. REST API parity (v1.3.0)

The REST API stays "CRUD + query". `add_steps` writes rows and spends no AI, so it belongs on both surfaces. Only AI actions stay MCP-only (`decision-log.md:3878`, reworded).

| Endpoint | Change |
|---|---|
| `POST /tasks` | `partsTotal` (int 2-50, `due` allowed, `repeat` → 400). New `steps` (array, same item shape as MCP) creates the big task and its steps in one insert and returns **201 `{task, steps}`**. `steps` together with `due` / `repeat` / `partsTotal` → 400. |
| **`POST /tasks/{id}/steps`** (new) | Body `{steps: [...]}`. The same read, insert, guarded flip and compensating write as MCP. 201 `{task, steps}`. 400 for a bad id or bad input, 404 if missing, **409** if done, repeating, tracked in parts or already hidden. |
| `PATCH /tasks/{id}` | `partsTotal: int\|null` (null clears). `partsDone: int`, **absolute and forward-only**: lower than the current count → 409, above the total → 400, equal → 200 with no write. Any two of `partsTotal` / `partsDone` / `done` → 400. `done: true` on a sliced task **fills every part** (Focus Done parity). `done: false` on one → 409. `done` on a hidden task → 409 "tick its steps". `repeat` on a sliced task, a step or a hidden task → 409. `done: true` on a done one-off → 200, no write. When the walk finishes anything, the response adds **`finished: Task[]`**, topmost last. |
| `DELETE /tasks/{id}` | Tier 2: a hidden task → 409. This makes DELETE read-first. |
| `GET` (every mode) | `Task` gains `partsTotal`, `partsDone` (both null for a whole task), `parentId`, `parentTitle`, and `hidden` (true while it waits behind its steps: a broken-down or made-tiny task). `SELECT` adds `slices,parent_id,parent_title,silent_parent`. `toApiTask` cleans `slices` the way `cleanSlices` does, because devices are not trusted (`sync.ts:100` copies the value through unchecked). `left_off` stays unselected. |

**Why REST is absolute while MCP is relative:** HTTP integrators retry, so the write must be idempotent. A model reasons best with "tick one more". Both go through one `advanceParts(slices, target)` in `steps.ts`.

**OpenAPI** (`openapi.ts`):
- `info.version` **1.3.0**.
- New schemas `StepInput` and `StepsCreated`, and a `Conflict` (409) response.
- `Task` / `TaskInput` / `TaskPatch` get the new fields, and the new path is added.
- **Drift fixes, in their own `fix(api)` commit:**
  - The plain list is "every task that is not deleted, done and hidden ones included" (`api.ts:129`), not "open and dated" (`openapi.ts:36`).
  - Drop the DELETE 404, which the route never returns (`api.ts:582-587`).
  - `TaskInput.due` does not enforce "future" (`api.ts:325-328`).
  - The repeat error strings name monthly (`api.ts:331,365,499,570`).

---

## 3. Field-for-field match with the app

| Concern | App (`bdAccept` / manual / capture) | Server | Note |
|---|---|---|---|
| Big-task flags | `silentParent: true, openParent: false` | same | |
| Big-task complexity | sum (AI), untouched (manual) | sum if any step has minutes, else untouched | |
| `title`-mode big-task `due` | none | none | |
| Step title | `t('breakdown.stepTitleWithMinutes')` | `"{title} ({m} min)"` | en, es, fr and it match. German shows `min` instead of `Min.` (`de.ts:53`). Accepted, because the server cannot know the locale. |
| Step complexity | `s.minutes` | integer minutes | The column is `integer` (`schema.sql:27`). |
| Step `due` | a spread date, or absent | `'YYYY-MM-DD'` or null | Null means today, so the UTC/local mismatch never applies. |
| Step `created_at` | `now + i` (step 0 ties the parent) | big task `T`, steps `T + 1 + i` | Harmless: `currentRound` compares children only. |
| `decompositionId` / `Steps` | set, but device-only (`sync-merge.ts:25-32`) | not written (no column) | See section 5. |
| Phases | children with no minutes | a step with no `minutes` and a `due` | No phase concept added. |
| Slices | `{total, done: 0}` | same, integers | |
| Ours copy | can be broken down | can be broken down | An agent tick never closes the shared row. The server never touches `shared_ref`, which is today's behaviour for every agent tick. |

**Sync:**
- Every column used is synced and already live. **No migration.**
  - `open_parent` / `parent_title` are probed by `check-migrations.py:68-69`.
  - `slices` / `parent_id` / `silent_parent` / `complexity` are named on every client upsert (`sync.ts:49-74`), so working sync proves they exist.
- Server writes reach a device on its next pull. Devices correct their clocks against the server (`tasks.ts:226-233`), so the server's `now()` beats an older device copy.
- 1.7.0 builds do not name `open_parent` / `parent_title` in their upserts, so they leave both alone.

**How the app closes them:**
- **The user ticks the last step in the app:** `decide()` sees a hidden big task, `openParent: false` and a round of 2 or more, so `completeAncestors` runs and **the bloom plays**. No client change needed.
- **The agent ticks the last step:** the server finishes the big task, dated to the step. The device pulls it into "Done today" and the Lookback with no bloom (the same as the repair), and the agent's reply carries the moment.
- **Lookback count:** the big task plus each step (4 for a 3-step breakdown), as in the app.

**Calendar (A4):** in `task_id` mode the hidden big task keeps its own `due`, so `scheduledByDay` still shows it as planned on that day (`calendar.ts:104-111`). That is the same as an app-made breakdown today. **Not changed here.** Parked as a client Backlog item, trigger "the next Calendar change or a report". When it is picked up, show it as the deadline it is ("due: Clear the garage").

---

## 4. What each read and write does with these rows

| Tool / route | Hidden big task | Step | Sliced task |
|---|---|---|---|
| `list_today`, REST `?today` | hidden (unchanged) | listed, `(toward "X")` | listed, `(3/10 parts)` |
| `list_upcoming`, REST `?upcoming` | hidden | listed on its `due` | listed |
| `search`, REST `?q` | hidden | plain title | plain title |
| REST plain list / `GET /tasks/{id}` | returned, `hidden: true` | `parentId`, `parentTitle` | `partsTotal`, `partsDone` |
| `fetch` | Tier 2: "waiting on its steps" instead of the wrong "on today" (`mcp.ts:584-585`) | unchanged | Tier 2: "3 of 10 parts done" |
| `complete_task` / `update_task done: true` / REST `done: true` | **refused** | closes, then the walk | MCP: +1 (or `count`). REST: fills every part. REST `partsDone`: absolute. |
| `update_task` / `PATCH` | title and due allowed (no copy onto the steps); `repeat` / `parts` refused | `repeat` refused; `done: false` reopens the step only | `parts` / `partsTotal` resizes; `done: false` refused |
| `delete_task` / `DELETE` | Tier 2: refused. It is reachable, because `task_id` mode hands the agent the id. | tombstone only, **no walk** (the same as the app's Remove) | tombstone |

---

## 5. Telemetry parity

| Half of the moat | App | MCP today | This design |
|---|---|---|---|
| **Offered** | `/plan` logs the whole plan plus `corrId` (`index.ts:777`). `/decompose` logs `output: {steps}` (`index.ts:505`). | `output: {steps: <count>}` only (`mcp.ts:850`) | **Log `output: {steps}` in full.** Covered by the policy's "the returned JSON". |
| **Accepted** | `breakdown.added` is console-only (not in `APP_EVENTS`, `events.ts:21-61`) | none | none (parity) |
| **Completed** | `/outcome` per step, keyed by the device-only `decompositionId` | none | **Deferred.** It needs the parked `decomposition_id` / `decomposition_steps` columns. |

**Flag for Melroy: this is a conscious exception to "Telemetry before traffic", and it needs a decision-log line.**
- With no column, nothing ties an agent-written step to its offer. Encoding `corrId` in the step id would only cover agent ticks, while most steps are ticked on the phone. Rejected as biased.
- **My pick:** ship offered-only now. Pull the column migration forward (Backlog, BUILD-PLAN:191 (1), attached to the notes build) when MCP rows reach about 5% of all offered breakdowns over four weeks.
  - Numerator: rows with `endpoint = 'decompose'` and `input.via = 'mcp'`.
  - Denominator: every `plan` row plus every `decompose` row. **The app's breakdown runs through `/plan`** (`today.tsx:2546`), so counting decompose rows alone would wildly overstate the MCP share.
- **Do not** bump the app's `slices.defined` counter (`events.ts:40`) from the server. It measures the held card, and agent writes would blur it.
- When the columns land: `break_down` mints a `corrId` (`ai_calls.corr_id` already exists, `telemetry.ts:60`), `add_steps` takes `plan_id` and writes both columns, they leave `LOCAL_ONLY_FIELDS`, and the walk calls `logOutcome` for agent ticks.

---

## 6. Risks, and what NOT to do

| # | Risk | Guard |
|---|---|---|
| R1 | **A hidden big task with no children** (the repair leaves childless parents alone, so it stays invisible for good) | `title` mode is one atomic insert. `task_id` mode inserts first, then the guarded flip, then the compensating write. Leftover risk: if the Worker dies between insert and flip, the steps and the big task are both visible. A retry then adds a second round, untidy but no loss. Accepted. |
| R2 | **The batch-union trap** (mixed keys fail with PGRST102, and a union-upsert nulls columns, `sync.ts:45-48`) | One key set per batch, with explicit nulls. Never upsert the existing big task inside the steps batch. |
| R3 | **Bring-back on the server would touch `left_off`** | The server only finishes. The rest goes to the repair, 1.8.0+ live on both stores. Until a device opens, the agent cannot see that task. |
| R4 | **Lowering `slices.done` springs back on sync** | Never lowered: refused on MCP, 409 on REST. |
| R5 | **Over-ticking parts is permanent** | +1 default on `complete_task` **and** `update_task done: true`. Only an explicit `count`, REST `partsDone`, or REST `done: true` goes further. |
| R6 | **Two last-step ticks at once** (each writer sees the other step open) | The device repair finishes it right after its next pull (`today.tsx:901`). Accepted. |
| R7 | **A device edit made before its next pull wins last-write-wins**, on the big task (pushes `silent_parent: null` back) or on a step the walk just counted as done (pushes `done: false` back, leaving the big task finished while one step is open again) | The same multi-device race as any field. Documented, not fixable server-side. |
| R8 | **A concurrent increment is lost** in the merge (device at 4, server +1 from 2, merged 4) | The same as the app. Documented. |
| R9 | **No write rate limit** | The cap of 20 bounds one call. A loop is no worse than `add_task` today. |
| R10 | **A retry after a `title`-mode timeout that actually landed** creates a duplicate big task and steps | No idempotency key, the same as `add_task`. `task_id` mode is naturally idempotent, because the retry reads `silent_parent` and is refused. Accepted. |
| **R11** | **done and slices drift apart in the merge.** `reconcileConflict` takes the max `slices.done` but the winner's `done` (`sync-merge.ts:101-109`). Say a device edits a sliced row after the agent's completing tick but before pulling. The row ends at 5/5 and open, and a tap is a no-op at the limit (`slices.ts:46-47`). | Already true between two devices, but more reachable now. **A client `fix(sync)` in its own commit:** if the merged slices are complete and the task is not done, set it done with `completedAt` from whichever side has one, plus a test. It reaches the web on the next push and native on the next store build. Not part of this server change. Backlog it if it does not ship alongside. |

**Do NOT:**
- Write steps through `add_task`.
- Add a consent token.
- Add a "phase" concept.
- Add a `language` parameter.
- Expose Make it tiny over MCP.
- Compute "today" for a step's `due`.
- Allow one-step breakdowns.
- Write `open_parent` from the walk.
- Copy a big-task rename onto its steps.
- Change client runtime code in this change (R11 is its own commit).
- Pull the `decomposition_id` migration forward without Melroy's word.
- Bundle the earlier audit findings 3 to 13 into the feature commits.

**Tiers:**
- **Tier 1:** sections 1 to 3, and section 5's offered-side fix.
- **Tier 2** (same deploy, separate `fix` commits):
  - the `fetch` status lines
  - the `delete_task` / DELETE refusal on a hidden task
  - the `deleted_at=is.null` guard on `update_task` / `delete_task` (finding 4)
  - the readers' `readOnlyHint`
  - the OpenAPI drift fixes
- **Tier 3** (Backlog, with triggers):
  - the completion half of the telemetry (trigger above)
  - deleting a whole breakdown with its open steps (trigger: the first user who asks)
  - `fetch` showing step progress
  - Calendar A4
  - R11, if it does not ship alongside
- **Tier 4:** Make it tiny over MCP, a consent token, a locale parameter.

---

## 7. Test plan (contract tests, Supabase mocked with `vi.stubGlobal`)

Lift the `sequence` helper out of `api.test.ts:468` into a shared test helper, so `mcp.test.ts` can use it too.

**`server/src/steps.test.ts` (pure):**
- `stepTitle`:
  - appends `(N min)`
  - strips `(5 min)` / `(5 Min.)` and a leading `• ` / `- ` / `1.`
  - takes minutes from the suffix when `minutes` is absent
  - leaves the title plain with no minutes
- `parseSteps`: refuses fewer than 2 and more than 20, an empty title, `0` / `481` / `"5"` minutes, a bad `due`, unknown keys and a 501-character title. Rounds 5.4 to 5.
- `buildStepRows`:
  - **an identical key set on every row**
  - `created_at` strictly +1 ms from the big task, then each step
  - `user_id` = sub everywhere
  - integer complexity, `parent_title`, `due: null` when absent
  - the hidden flags on the big task only
  - ids unique by construction
- `advanceParts` / `setTotal` / `clear`:
  - +1, +k clamped, already complete, completes
  - never lowers
  - shrinking completes the task
  - malformed slices normalised like `cleanSlices`
  - **the guard uses the raw stored text**
- `currentRound` and `isDoneOn` (with a repeating child), ported.

**`server/src/settle-cases.json` (shared fixtures):**
- Each case holds the tasks, the completed id, `serverFinishes` (ids) and `endState`: per task, `done` / `silentParent` / `openParent` / deleted, after the app's repair.
- Cases:
  - the last of 2 finishes
  - not the last does nothing
  - a round of 1 is left
  - a tiny pebble (`open_parent`, round 1) is left
  - a stale tiny flag with a round of 2 or more is left (the repair clears it and finishes)
  - a nested chain finishes both
  - an ancestor with a round of 1 stops
  - an ancestor with a stale tiny flag stops (**the case the old assertion got wrong**)
  - a deleted, done or visible parent does nothing
  - a cycle terminates
  - an earlier round's done child is excluded
  - `completed_at` equals the step's
  - a step folded by Combine
- **Server:** `planFinish` over each case, converted to rows, returns exactly `serverFinishes`.
- **`client/src/lib/settle-parity.test.ts`** reads the same file (the `schema-drift.test.ts` precedent for reading across folders) and asserts three things per case:
  - (a) `serverFinishes` ⊆ the ids `settleCompletions` finishes. The server never finishes what the app would not.
  - (b) Applying `serverFinishes` (done, `completedAt`, `silentParent: false`) and then `healStuckParents` gives `endState`.
  - (c) `settleCompletions` and then `healStuckParents` gives `endState`.
- (b) together with (c) is the proof that leaving cases to the app really works.

**`mcp.test.ts`:**
- **`tools/list`:**
  - the exact name list at `:155` updated
  - the `add_steps` schema asserted
  - `break_down`'s description names `add_steps`
  - `complete_task` has `count`, not `parts`
  - the readers carry `readOnlyHint: true`
- **`add_steps`, `title` mode:**
  - exactly one POST of n+1 uniform rows, and no PATCH
  - the reply has step ids and no big-task id
  - the leading `• ` is stripped
- **`add_steps`, `task_id` mode:**
  - calls in the order GET, then POST, then PATCH
  - the PATCH filters `deleted_at`, `done`, `silent_parent`, `recurrence` and `slices`
  - the PATCH body is exact, with no complexity when no step has minutes
- **`add_steps` refusals and failures:**
  - each of the five refusals is one fetch and no write
  - a flip that returns `[]` → a tombstone PATCH on exactly the inserted ids, then `isError`
  - a POST that fails → no PATCH
  - 401 → `TOKEN_EXPIRED`
- **`complete_task` on steps:**
  - last step: the parent PATCH body is `{done, completed_at: <step's>, silent_parent: false, updated_at}`, guarded by `open_parent=not.is.true`, **and the body has no `open_parent` key**
  - not the last step: no parent write, "2 of 4"
  - round of 1, tiny pebble or stale flag: no parent write, no tombstone, the neutral reply
  - on a hidden big task: refused, no write
  - the walk write fails: the reply never claims the close
- **`complete_task` on other tasks:**
  - a done one-off: "Already done.", one fetch only
  - a done sliced row at 2/5: "Already done.", no write
  - a one-off PATCH carries `done=is.false`
- **Parts:**
  - +1 sends the raw `done` and `total` guards and no `done` key
  - `count: k` clamps
  - completing sends `done` + `completed_at`, then the walk
  - already complete: no write
- **`update_task`:**
  - `done: true` on a sliced task is +1 and **matches complete_task byte for byte**
  - a `parts` resize carries progress over, and a shrink that completes runs the walk
  - `parts: null`
  - `parts` + `done` refused, `parts` + `repeat` refused
  - refusals: a repeating task, a hidden task, a done task
  - `done: false` on parts refused
  - `repeat` on a step or a sliced task refused
  - a title on a hidden task makes no write to its children
- **`add_task`:** `parts` gives `slices {N, 0}`, `parts` + `repeat` is refused, and every reply carries the id.
- **`list_today`:** the select includes `slices,parent_id,parent_title`, and both markers plus the `(a step)` fallback render.
- **`break_down`:** still exactly one fetch, and it logs the full `output: {steps}`.

**`api.test.ts`:**
- The same cases over REST.
- The 409 vs 400 split.
- `partsDone`: forward, equal and lower.
- Any two of `partsTotal` / `partsDone` / `done` → 400.
- `finished` in the PATCH response.
- `toApiTask`: the new fields, cleaning bad slices, and `hidden`.
- A DELETE on a hidden task → 409.
- OpenAPI: 1.3.0, the new path, the schemas, `TaskPatch`.
- **A parity test** feeding MCP and REST the same answers with fake timers, and asserting identical write bodies for a part tick and for the parent finish.

**Manual cases (`scripts/gen-test-suite.py`; regenerate both files in the same commit).** Every MCP case starts by refreshing the connector's tool list, because connectors cache `tools/list`.
- **MCP-20 (P1):** `break_down`, then a yes, then `add_steps` in claude.ai. The app shows the steps and the big task is hidden.
- **MCP-21 (P1):** tick the last step **in the app**. The bloom plays.
- **MCP-22 (P1):** tick the last step **through the agent**. The reply names the whole task, and the app shows it in Done today and the Lookback.
- **MCP-23 (P2):** `add_task parts: 3`. The agent ticks one, the app shows 1/3, and a tap in the app continues it.
- **MCP-24 (P2):** break down an existing dated task. Check the Calendar against section 3, then undo it by deleting the steps: the big task comes back on the next open.
- **API-04 (P2):** steps through REST.
- **API-05 (P2):** `partsDone` through REST.
- Update the stale API-03 ("current at 1.1.0", `gen-test-suite.py:670`) to 1.3.0.

---

## 8. Docs to update

**In the feature commits:**

- **`docs/mcp.md`:**
  - nine tools → ten (`:19`)
  - a new `add_steps` section, including the undo path
  - the `add_task`, `complete_task` (`count`), `update_task`, `list_today` and `break_down` sections (`:212-226`), with the markers and the "the last step closes the big task" line
  - "What MCP does not expose" (`:394-414`): parts and step links are now exposed. Pins, "a lot", effort estimates, the tiny / combine bookkeeping and `left_off` stay hidden. "AI steps added without a yes" now names `add_steps`.
  - "Protocol details"
  - "Where the code lives": add `steps.ts`
  - the MCP-vs-REST paragraph: MCP `done` ticks one part, REST `done` fills them all
- **`docs/api.md`:** the new fields, the routes, the 409s, and the hidden-task notes at `:115-117` and `:289-291`.
- **`openapi.ts`:** as in section 2.
- **`README.md:54`:** "nine tools" → ten, and OpenAPI v1.3.0.
- **`CHANGELOG.md`:** an `[Unreleased]` entry (its own rule, `CHANGELOG.md:7`).
- **`decision-log.md`** (required for `feat` commits). What was decided and what was rejected:
  - `parts` over `steps`
  - `count`
  - one accept tool, which **reverses the 2026-07-07 "add_task per step" line**
  - finish-only, with the `left_off` reason, and the one-rule simplification
  - +1 on both MCP done paths
  - no consent token
  - the telemetry exception and its corrected trigger
  - Calendar A4 parked
- **`BUILD-PLAN.md`:**
  - move the Backlog item at `:175` to built
  - add the Tier 3 items with their triggers
  - correct BUILD-PLAN:191 (1): `open_parent` / `parent_title` / `combined_from` landed 2026-10-04, and only the `decomposition_*` columns are still parked

**Not in any commit:**

- **`CLAUDE.md`** (gitignored, so a local edit after the deploy):
  - nine tools → ten, naming `add_steps`
  - `parts`
  - OpenAPI v1.3.0
  - "AI actions are MCP-only, linked steps are CRUD on both"
  - the new LATEST Worker version id

**Checked, no change needed:**

- `docs/connect-claude-to-doubledone.html` / `.pdf` names no tools.
- **Privacy policy:** agents read nothing new that is personal, and the full offered steps are already covered by "the returned JSON".

---

## 9. Deploy note

- **What ships:** the Worker only (`server/`). The client change is one test file.
  - No migration (run `python scripts/check-migrations.py` anyway).
  - No new secret, no new binding, no EAS or store build.
- **Branch:** a fresh branch off `main`. `server/` is identical on `main` and `landing-v2`, so there is no overlap with the pending landing merge.
- **Commits:**
  1. `feat(mcp,api): track a task in parts`
  2. `feat(mcp,api): linked steps, and the last step closes the big task`
  3. the Tier 2 `fix` commits, including `fix(api)` for the OpenAPI drift
  4. R11, separately, if Melroy wants it in the same window
- **Gates:** `npm run typecheck`, `npm test` and `npm run lint`, run bare and never piped through `tail`.
- **Main and the web:** merging to `main` redeploys an unchanged web bundle. That waits for Melroy's word and his weekend window.
- **Before deploying:**
  - Merge `main` into `premium`, then check `git diff --stat main premium -- server` is empty. Otherwise the next deploy from `premium` would quietly remove `add_steps`.
  - Record the current version (`npx wrangler deployments list`) as the rollback target.
- **Deploy:** `npx wrangler deploy` from `server/`. **Only on Melroy's per-instance OK.**
- **Smoke test** (the catch-all `200 doubledone-ai` and the API's 401-before-routing both mean a status code proves nothing):
  - **MCP:** `tools/list` with any JWT-shaped bearer (`index.ts:1247`; discovery needs no verification) contains `add_steps`, and `complete_task` has `count`.
  - **REST:** the public `GET /api/v1/openapi.json` reports `info.version: "1.3.0"` and lists `/tasks/{id}/steps`. **Do not** use "the new route answers 401 with no token": the old Worker does that too (`api.ts:472-478`).
  - Then run MCP-20 to MCP-22 on Melroy's own account, after refreshing the connector's tools.
- **Rollback:** `npx wrangler rollback <previous version>`. Rows the new tools wrote stay valid under the old Worker: its `complete_task` just will not walk, and 1.8.0+ devices repair on open.
- **After deploy:** update the local CLAUDE.md version line.

---

## Melroy's calls (2026-10-18)

All four as recommended: `parts` + `count`; the server finishes only, one rule at every level; offered-only telemetry now with the 5% trigger; R11 ships alongside as its own client commit.

## Next move

1. **Melroy makes four calls before any code** (my pick in brackets):
   - `parts` as the name, and `count` on `complete_task` (yes)
   - finish-only on the server, with one rule at every level (yes)
   - offered-only telemetry for now, with the corrected 5% trigger (yes)
   - R11, the client merge fix: ship it alongside as its own commit, or Backlog it (ship it: it is one line, and agents make it more reachable)
2. **Then build** commit 1 (parts), then commit 2 (steps plus the shared fixture), on a branch off `main`. Gates green, QA cases MCP-20 to MCP-24 and API-04/05 added. Stop at "ready for a Worker deploy when you want one".
