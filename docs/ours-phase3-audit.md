# Ours: the Phase 3 engine audit

*Verbatim fix list from the adversarial audit of 2026-08-09, run before any real household touched
the code. Five lenses (do two phones converge, can anything be lost or resurrected, privacy under
the domestic threat model, does the client agree with the database, what happens on a real phone),
every finding then put to a refute-by-default verifier that had to state the exact sequence of
events. 53 raised, 41 confirmed, 19 distinct defects.*

*Numbers 1 to 6, 16, 17 and 18 are FIXED. The screen defects (7 to 15) and 19 are open; see
`ours-build-plan.md`.*

---

# Ours audit: the fix list

38 findings in, 19 distinct defects out. Verified by reading the code, not the docs.

---

## Does anything block a two-couple dogfood?

**Yes. Six things, all in `client/src/app/ours.tsx` plus one function in `ours-api.ts`.** None of them are in the merge engine or the seam, because none of that code has a caller yet (`grep`: `syncPairOnce`, `pullPair`, `pushShared`, `mergeShared`, `applyServerTime`, `loadOursTasks`, `saveOursTasks`, `pruneOursCache` are referenced only by their own tests). The dogfood exercises pairing only, and pairing is where the live damage is.

The six, in the order a tester will meet them: the minted code can vanish before it is readable (#7), "Get a new code" is a dead button that destroys the code on screen (#8), leaving is a one-way door whose only exit is the irreversible delete (#9, with #10 as its prerequisite), a failed read tells someone they have no list (#11), and a stale read can park a permanent Leave under a flickering arrival beat (#12). Testers leave and re-pair constantly, which is exactly the path that is broken.

## Does anything block merging this branch to a live web deploy?

**No, not on safety.** The Settings door is gated server-side by `ours_is_open()` against `ours_allowlist`, so nobody outside the allowlist is shown it. `/ours` is reachable by direct URL on the SPA, but it renders the intro and every RPC refuses with a calm `not-open` line, which is the designed behaviour. Nothing in the branch changes shipped personal behaviour, with one exception: `nowMs()` (tasks.ts:222) already routes through `correctedNow`, and it is inert only because `applyServerTime` has no caller.

So merge whenever you want. Two conditions:

1. Do not run the dogfood on the merged build until the six above land.
2. **Do not tick `ours-build-plan.md:101` ("call `server_now()` once per sync") until #6 lands.** That box arms `clock.ts` for the personal list as well as Ours, and `applyServerTime` currently believes a reading of any round-trip duration.

---

## Fix before Phase 3 wires the seam (latent, but data loss the moment it has a caller)

### 1. A one-off's tick is unprotected and silently reverts

`client/src/lib/ours-merge.ts`, `reconcile` (186-194) and the push gate (164-165).

`completions` is the only field lifted out of whole-row LWW. A non-recurring row stores its tick in `done`/`doneAt` and carries no completion log, so any newer unrelated edit by the other person (a retitle, a restore) takes the whole row and the tick is gone from both phones and the server. `growsBeyond` inspects only `completions`, so the losing side does not even push it back. The field answer in the build plan (Phase 5, line 132) is "mostly one-offs with a few recurrences", so the protected case is the minority and the unprotected case is most of the list. This is the exact failure the file header says it exists to prevent.

**Smallest correct fix:** route the one-off tick through the log too, and make `done`/`doneAt` derived rather than independently writable. In `reconcile`, after `mergeCompletions`, when the winner is non-recurring, set `out.done = completedDatesOf(completions).length > 0` and `out.doneAt` to the winning `on` stamp, else null. Guard on a non-empty log so a row never ticked through the log keeps its LWW `done`. `growsBeyond` then already covers the push-back. No schema change, no migration, and it removes the second completion code path instead of adding a second set of rules to it.

Do **not** take the obvious-looking alternative ("keep whichever side's `doneAt` is later"). An un-ticked one-off has `doneAt: null`, so it has no stamp to compete with and a tick would beat every un-tick forever. That is the grow-only union bug you already fixed, re-introduced on the one-off path.

**Test that must fail first:** in `ours-merge.test.ts`, "a one-off tick survives the other person's newer retitle, and is pushed back". Merge a local row `{done:true, doneAt:T1, updatedAt:T1}` against a remote `{title:'milk (oat)', done:false, updatedAt:T2>T1}` and assert the merged row keeps `title:'milk (oat)'` and `done:true`, and appears in `toPush`. Add the mirror case (an un-tick racing a newer retitle) and a tick/un-tick/re-tick convergence case.

**Note for Phase 3, same edit:** `SharedTask` names the field `doneAt`, and `today.ts:70` gates a done one-off on `completedAt`. `today.ts:24` reads `completedDates`, which `SharedTask` does not have. The claim in ours-merge.ts:44 that these feed the existing helpers "unchanged" is not true today; the adapter is `completedDatesOf` plus a `doneAt → completedAt` rename at the boundary. Write it once, in one place.

### 2. A refused push throws away a successful pull, permanently

`client/src/lib/ours-sync.ts`, `syncPairOnce` (151-156).

`await pushShared(...)` sits before `return merged`. The SELECT policy needs only `is_pair_member`; both write policies need `is_pair_writable` (`ours.sql:267-276`), which additionally requires `closed_at is null and disabled_at is null`. So on a frozen pair the pull succeeds forever and the push 42501s forever, and because nothing but a successful push can empty `toPush`, the failure never clears. The device is pinned at its last fully-successful sync on the one screen a bereaved or separated person may keep for years, under copy that promises "Nothing is lost. You can still read everything here." That is "reads stay, writes stop" being false at exactly the moment it matters.

**Smallest correct fix:** classify and tolerate the read-only refusal, in the `isAccountGone` idiom already in `sync.ts:164`.

```ts
export function isPairReadOnly(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501';
}

export type PairSyncResult = { merged: SharedTask[]; pushError?: unknown };

export async function syncPairOnce(client, pairId, local): Promise<PairSyncResult> {
  const remote = await pullPair(client, pairId);   // a failed READ still throws: nothing to cache
  const { merged, toPush } = mergeShared(local, remote);
  try {
    await pushShared(client, toPush, pairId);
    return { merged };
  } catch (pushError) {
    return { merged, pushError };
  }
}
```

Return the error rather than swallowing it, so a real push bug stays diagnosable and only the "reached your person" affordance reads it. Caching `merged` early loses nothing: re-merging it against an unchanged remote recomputes the same `toPush`.

Do not fix this with a `writable` flag alone. The freeze lands mid-session, so any flag from `loadMyPair` is one poll stale and the push throws anyway. A flag is a fine optimisation on top, never the fix.

**Test that must fail first:** in `ours-sync.test.ts`, "keeps a pull that succeeded when the push is refused". Mock the select to return one remote row and the upsert to return `{ error: { code: '42501' } }`; assert the merged set comes back with both rows and `pushError` set. Add a second: any other push error still throws. Four existing tests need `.merged` appended.

### 3. The server clamps `updated_at` and the client never learns

`client/src/lib/ours-sync.ts`, `pushShared` (135-140).

`ours.sql:322` deliberately clamps `updated_at`, `created_at` and `done_at` to `now() + 1 day` rather than rejecting them. The upsert has no `.select()`, so the client keeps its own un-clamped stamp. `localNewer` (ours-merge.ts:164) is a pure timestamp compare, so a device more than a day fast re-pushes the same rows on every 15-second poll, and each push re-clamps to a fresh `now() + 1 day`, which beats anything the other phone can legitimately write. The partner's retitle reverts within fifteen seconds, repeatedly, and the phone doing it is face-down on a table. `done` on a one-off and `deletedAt` ride the same winner, so it also un-ticks and resurrects.

`pushTasks` (sync.ts:112) is safe without a read-back only because `schema.sql` guarantees no trigger touches `tasks.updated_at`. That precondition does not travel to this table.

**Smallest correct fix:** have `pushShared` return the server's echo and overlay it onto `merged`.

```ts
const { data, error } = await client.from(TABLE).upsert(rows, { onConflict: 'pair_id,id' }).select();
if (error) throw error;
return ((data ?? []) as SharedRow[]).map(rowToShared);
```

then in `syncPairOnce`, `const stored = new Map(echo.map(t => [t.id, t])); return merged.map(t => stored.get(t.id) ?? t);`. The SELECT policy already permits the read-back, no trigger touches `completions`, and `rowToShared` already drops `created_by`.

**Test that must fail first:** in `ours-sync.test.ts`, "adopts the stamp the server actually stored". The mock's `upsert` needs to become thenable after `.select()`. Push a row stamped two days ahead, return it clamped, assert the merged row carries the clamped `updatedAt`. Second test: feeding that set back in produces no upsert call.

### 4. One over-long title kills the pair's sync in both directions, silently

`client/src/lib/ours-sync.ts`, `sharedToRow` (line 45) with `pushShared`.

`ours.sql:122` enforces `char_length(title) between 1 and 500`. Nothing on the client mirrors it, and `public.tasks.title` has no such cap, so a title that is legal on the personal list is fatal on the shared one, which is precisely what Phase 4's "Share to Ours" creates. `pushShared` sends the whole `toPush` set as one upsert, so PostgREST issues one statement and a 23514 aborts every row in it. Combined with #2, the pair stops converging in both directions permanently, and the only symptom either person has is that the other appears to have stopped using the list.

**Smallest correct fix:** clamp at the seam, not only at a future input, because Phase 4 copies a title no Ours input ever touched.

```ts
export const TITLE_MAX = 500; // mirrors supabase/ours.sql:122
const clampTitle = (s: string) => (s.length <= TITLE_MAX ? s : [...s].slice(0, TITLE_MAX).join(''));
```

Spread rather than `slice`, because Postgres counts code points and JS counts UTF-16 units; a cut through a surrogate pair swaps one poison row for another, and emoji in titles are common in this audience. Convergence is safe: local holds 700, remote holds 500 at the same `updatedAt`, and `reconcile`'s tie resolves to remote, so the local copy shortens on the next pull.

`maxLength={500}` still belongs on the Phase 3 capture input, so an honest user never meets the truncation silently.

**Test that must fail first:** in `ours-sync.test.ts`, "clamps a title to the length the column will accept". Assert a 700-character title emits exactly 500, and that a 700-character title containing an astral emoji at the boundary emits no lone surrogate.

### 5. A future completion stamp is unclearable, and an un-tick can stamp behind the tick it clears

`client/src/lib/ours-merge.ts`, `tickOn`/`clearOn` (80-88), read by `isDoneOn` (65-69). Same root, two directions.

`clearOn`'s own docstring says the caller owes it a stamp later than the tick it clears. No caller can honour that: the tick was stamped by the other person's phone. `withMonotonicStamps` closes exactly this hazard for the row and is applied automatically; the completion log is the one place it is left as a promise. And nothing bounds magnitude, so one far-future `on` stamp (a phone set to 2030, or a second seat PATCHing PostgREST directly, which RLS permits for their own pair) pins that date to done on both phones until real time catches up. The SQL clamp cannot reach it: `ours.sql:322` covers the columns and never looks inside the jsonb.

**Smallest correct fix,** pure and clock-free, mirroring `withMonotonicStamps`:

```ts
export function tickOn(log, date, now) {
  const off = log?.off?.[date];
  const stamp = off !== undefined && off > now ? off : now; // a tie already resolves to done
  return { ...log, on: { ...log?.on, [date]: stamp } };
}
export function clearOn(log, date, now) {
  const on = log?.on?.[date];
  const stamp = on !== undefined && on >= now ? on + 1 : now; // must strictly beat the tick it clears
  return { ...log, off: { ...log?.off, [date]: stamp } };
}
```

Both halves are required. Monotonic `clearOn` alone trades a stuck-done for a stuck-not-done, which lines 61-63 call the one this audience cannot afford. Update the 84-85 comment: it defends itself now, it does not delegate. Every existing test passes a `now` ahead of the opposing stamp, so `Math.max` is a no-op and no assertion changes.

Defence in depth if you want it: in `sanitiseStamps` (ours-sync.ts:91), **drop** any stamp above `Date.now() + 86_400_000`, mirroring the ceiling the SQL trigger applies to the columns. Drop rather than clamp, since a poisoned `on` clamped to now+1day still blocks un-ticks for a day.

**Test that must fail first:** in `ours-merge.test.ts`, "an un-tick stamped BEHIND the tick it clears still un-ticks": `on['2026-08-09'] = Date.UTC(2030,0,1)`, `clearOn` with a 2026 `now`, expect `isDoneOn` false. Plus the mirror, "a re-tick behind a stale off still sticks".

### 6. `applyServerTime` believes a reading of any round trip

`client/src/lib/clock.ts` (36-54).

The only bracket check is order (`deviceAfter < deviceBefore`), never width. The midpoint cancels a symmetric round trip; the residual is `(uplink - downlink) / 2`, so a reading's error is bounded by half its own round trip and by nothing else. A 40-second reply on a train, or a JS thread frozen by a phone lock mid-request, sets a correction tens of seconds wrong. The 2020-2100 window cannot catch that, because a twenty-second error is perfectly plausible. `nowMs()` is the single mint point for every timestamp in the app, so the blast radius is the personal list too. This is the file's own stated nightmare ("a skew we get WRONG would poison every timestamp written from then on").

**Smallest correct fix:** one constant, one guard, immediately after line 44.

```ts
const MAX_ROUND_TRIP_MS = 2_000;
if (deviceAfter - deviceBefore > MAX_ROUND_TRIP_MS) return false;
```

Rejecting keeps the previous correction, which on a device that has never synced is zero, which is exactly today's shipped behaviour. That is the file's fail-open posture throughout.

**Keep the unconditional overwrite at line 52.** Two of the reviewers proposed "keep the smallest-RTT sample seen this session"; do not take it. Phone clocks jump (OS NTP resync, a user changing the date), and a latched sample then applies a stale offset to an already-correct clock, permanently, refusing the fresh reading that would fix it. Newest-believable is the right retention rule, and the RTT gate is what makes "believable" mean something.

**Test that must fail first:** in `clock.test.ts`, under the "fails OPEN" block: a 40,000ms bracket returns `false` and leaves a previously established good skew untouched, and a 300ms bracket taken straight after still applies (so the rejection is not sticky). Also correct the "accurate to milliseconds" claim at line 31, which is only true once this bound exists.

---

## Blocks the dogfood (all live now)

### 7. The minted code can vanish before anyone reads it

`client/src/app/ours.tsx`, `submitCreate` (137-159) and `body()`'s branch order.

The code renders only inside `if (pair)` at line 363, but `pair` is null at that moment and is populated only by the `void refresh()` on line 158. `flow === 'code'` matches neither the create branch (399) nor join (472), so between the RPC returning and the two-query refresh landing, `body()` falls through to the intro screen: someone who just tapped "Get code" is looking at "Ours · Start a shared list · Join instead". If that refresh fails, `refresh` has no else branch (#11), so that is the resting state, and the code is unrecoverable because the server returns it exactly once. `submitJoin` has the identical shape: a successful join briefly reads as nothing having happened.

**Smallest correct fix:** seed `pair` from each RPC's own return value before `void refresh()`, and let refresh reconcile. Do not hoist the code branch above the partnerLabel branch; that would hide the arrival beat and its exit.

**Test:** manual, and it belongs in `scripts/gen-test-suite.py` as a P1 case: "mint a code on a throttled connection, the code is on screen from the moment the button stops spinning and never replaced by the intro screen".

### 8. "Get a new code" is a dead button that destroys the code on screen

`client/src/app/ours.tsx` (384-394).

It sets `flow='create'` and `setCode(null)`, but `if (pair)` at 363 returns before `flow === 'create'` at 399, and nothing clears `pair`. So the create form is unreachable and the button's only effect is to blank the six characters the user could still have read aloud. `en.ts:366` actively tells them to press it ("A code lasts a day, so get a new one if nothing happens"), and the server's deliberate re-mint path (`ours.sql:517-536`), which exists so a mistyped invitee address is recoverable without the hard delete, is unreachable from the app. QA case OUR-07 cannot pass.

**Smallest correct fix:** line 363 becomes `if (pair && flow !== 'create') {`. Do not also lift the join branch (`join_pair` raises 23505 for someone already in a live pair) and do not call `submitCreate` directly (on a fresh mount `theirEmail` is `''`, so it returns `bad-email` with no form on screen). Worth seeding `setMyLabel(pair.myLabel ?? '')` on tap, or the re-mint's `update pair_members set label` silently rewrites the creator's label to "me".

**Test:** E2E case OUR-07 in `gen-test-suite.py`: from the waiting screen, "Get a new code" reaches the create form, and submitting it shows a different six-character code.

### 9. Leaving is a one-way door out of the whole feature

`client/src/app/ours.tsx`, the frozen branch (281-299).

`leave_pair` sets `closed_at` and deletes no membership (`ours.sql:748`), so `loadMyPair` returns that frozen pair forever. The frozen branch returns before create (399), join (472) and the idle Start / Join state (511), and its only interactive element is "Delete this list for good". So the answer to "I want to share a list with someone new" is "first permanently destroy everything your ex, or your late partner, wrote". The database says the opposite: `create_pair_invite` (520) and `join_pair` (639-641) count live pairs only, `ours.sql:727-729` says a frozen list costs no slot, the file's own post-apply read-back (c) asserts "A leaves → A can call `create_pair_invite` again", and `errAlreadyPaired` in all five catalogs promises "nothing is lost". The client is the only thing refusing. This catches the person who was left, too, and the survivor of a partner's account deletion (`prune_empty_pair`, ours.sql:365).

**Smallest correct fix, three edits, and #10 is a prerequisite:**
1. `const frozen = !!(pair?.closedAt || pair?.disabledAt);` (folds in #13).
2. Line 281 becomes `if (frozen && flow === 'idle')`, and the frozen block gains the two idle affordances beneath the forget block, reusing the existing `ours.start` and `ours.joinInstead` strings.
3. Lines 302 and 363 gain `!frozen`, so a frozen pair can never render as the sharing or waiting state once `flow` leaves idle.

**Test:** in `ours-api.test.ts`, the two-membership cases below. Plus an E2E case: "leave a list, then start a new one without deleting the old".

### 10. `loadMyPair` picks an arbitrary membership

`client/src/lib/ours-api.ts` (136-146).

`rows.find((r) => r.user_id === userId)` on an unordered PostgREST read, with no liveness preference. Multiple memberships are a designed state, not an exotic one: leaving freezes without deleting the row, and `k_max_lists = 25` permits 25 of them. In practice the heap yields the oldest, which is the frozen one, so the screen can show "frozen" while the live list the partner is actively using is unreachable, and `leave()`, `forget()` and every Phase 3 task sync then point at the wrong list. `pruneOursCache`, when wired, would be handed the wrong id and delete the live list's cache off the phone.

**Smallest correct fix:** add `joined_at` to the select, do both reads before choosing, then rank among the caller's own rows: a pair with `closed_at` and `disabled_at` both null wins, newest `joined_at` breaks the tie, and fall back to the newest membership overall so a user whose only list is frozen still gets it. Keep it a preference, never a filter. Do not widen the return type yet; `pruneOursCache` has no production caller, and when Phase 3 wires it, hand it every confirmed membership id, frozen included, since a frozen list is still readable.

**Test that must fail first:** in `ours-api.test.ts`'s `loadMyPair` block, which today only ever mocks a single membership: "a frozen membership listed FIRST and a live one second returns the live one", and "two frozen memberships return the most recently joined".

### 11. A failed read tells someone they have no list

`client/src/app/ours.tsx`, `refresh` (99-114).

`if (res.ok)` has no else, and `setLoading(false)` runs anyway, so a failed read leaves `pair` null and falls through to "Ours · A list you both keep · Start a shared list". The seam already classifies this correctly as `offline` (pairing.ts:126) and the copy already exists (`ours.errOffline`); both are discarded. If the user then taps Start and submits with the network back, `create_pair_invite` either raises 23505 and contradicts the screen, or, for a solo pair with an outstanding invite, re-mints and kills the code their person is holding. This is also the door into the two-membership state in #10.

**Smallest correct fix:** add a `loaded` flag set only on a successful read, call `report(res.failure)` on failure, and guard only the final "Nothing yet" return with `if (!loaded) return <quiet retry>`. Leave the create and join flows untouched so an in-progress form survives. A genuinely empty account gets `{ok:true, value:null}`, sets `loaded`, and reaches the real empty state.

**Test:** manual, P1 in the suite: "open Ours with the network off while you have a list; the screen never offers to start one".

### 12. A stale read overwrites a newer one, and re-arms the arrival beat

`client/src/app/ours.tsx`, `refresh` (99-114) with the interval (124-130).

No sequencing, no cancellation, two sequential queries inside `loadMyPair`, and seven call sites. Whichever reply lands last wins `setPair`, `setArrived` and `hadPartner.current`, regardless of which snapshot is older. So the waiting screen can announce "Sam joined the list · That wasn't who I meant", drop back to "waiting for someone to join", and announce it again ten seconds later, while Sam is looking at the shared list. Worse in the write path: a rename's slow read landing after a Leave restores the live pair, showing "Sharing with Sam" and a live Leave button to someone who has already left, with no interval running to correct it.

This is not cosmetic. The beat it flickers carries `leave`, and leaving is permanent for both people. The most likely response to a screen that looks broken is to tap the thing offering an escape.

**Smallest correct fix:** a pass counter in a `useRef`, bumped *before* the early return so a session ending mid-flight also invalidates the in-flight read.

```ts
const pass = useRef(0);
const refresh = useCallback(async () => {
  const mine = ++pass.current;
  if (!supabase || !session) { setPair(null); setLoading(false); return; }
  const res = await loadMyPair(supabase, session.user.id);
  if (mine !== pass.current) return; // overtaken: a newer pass owns the screen
  ...
}, [session]);
```

Newest-issued-wins, not skip-if-in-flight: five call sites fire `refresh` immediately after a state-changing RPC and a drop-the-new guard would discard exactly those.

**Test:** manual is weak here. The honest one is to extract the "did they arrive" decision into a pure helper and test it, or accept this as a code-review-only fix and add the E2E case "background and reopen the waiting screen while a join is in flight; the arrival announces once".

---

## Fix in the same pass, cheap, lower harm

### 13. `disabledAt` is read from the server and never used

`client/src/app/ours.tsx` (122, 281). `MyPair` carries it (ours-api.ts:31, 156) and nothing looks at it, while `is_pair_writable` treats it identically to `closed_at`. A killed pair renders as "Sharing with Sam" with an editable name, and a rename returns "This list is closed to changes" underneath a heading saying the list is live. Phase 7 describes the kill switch as one clause in the RLS predicate, which is true on the server and false on the client. Folded into #9's `frozen` derivation, one line, no new strings, because the shipped frozen copy is literally true for a killed list. Test: `loadMyPair` returns `disabledAt` set and `closedAt` null; the screen renders the frozen block.

### 14. A live pair nobody joined has no exit

`client/src/app/ours.tsx`, the waiting branch (363-396). `leave()` renders only under `partnerLabel`, `forget()` only under `closedAt`. Someone who created a list to see what it was, and changed their mind, is met with "Waiting for someone to join" forever. The server has an exit; the screen never calls it. Add the existing quiet leave action to the waiting branch. It needs a **new string**, not `ours.leaveHint`, which says "It closes for both of you" and is false when there is no both.

### 15. The waiting poll never stops

`client/src/app/ours.tsx` (124-130). Gated on `waiting` alone: no focus gate, no AppState gate, no ceiling, so a tab left open polls two Supabase reads every ten seconds all night, including after the 24-hour invite TTL has made the answer impossible. `ours-sync.ts` exports the pure rule for this (`shouldPoll`, `IDLE_STOP_MS`) and it is imported nowhere. Add a lifetime ceiling and an AppState skip, and refresh once on foreground so nobody is stranded. Also fix the comment at line 56, which claims a focus gate the code does not have; that claim is how this hid. Leave `shouldPoll` for the Phase 3 list poll, where its idle semantics are the right ones. Test: `shouldPoll` is already covered; this one is a code-review fix.

### 16. `pullPair` is unpaginated

`client/src/lib/ours-sync.ts` (127-131). One `select('*')` with no `limit`, no `order`, treated as the complete remote set. PostgREST truncates at the project's max-rows (Supabase default 1000) and `shared_tasks` grows forever, since there is no delete policy and nothing prunes tombstones. Past the cap, `mergeShared`'s `else if (l)` branch reads every locally-cached row outside the page as "added while offline" and pushes it, which is the exact failure the docstring says it rejected the delta pull to avoid, reintroduced through the transport. Years away for a household list, but the failure mode is deleted rows coming back. Keyset-page on `id` with an `order`, terminating on an empty page rather than a short one. Test: a pair whose rows exceed one page pulls all of them and pushes nothing back.

### 17. Partner-written `recurrence` jsonb is taken on trust

`client/src/lib/ours-sync.ts` (78). One line above `sanitiseCompletions`, whose docstring states the rule that also covers this column: it is jsonb the other person's client writes. `ours.sql:125` validates only size. `isDueOn` then does `r.weekdays.includes(...)` with no guard, so `{"kind":"weekly"}` from a newer or hand-rolled client white-screens the victim's Ours list with no error boundary anywhere. Add a `knownRecurrence()` validator beside `sanitiseCompletions`, keep the unreadable original in an opaque `rawRecurrence` so a build that cannot read a cadence is never the build that erases it, and make `isDueOn` total with a `default: return false`. Test: weekly with no `weekdays`, weekly with `weekdays: "mon"`, `interval` with `days: 0`, and `{"kind":"monthly"}` each leave `recurrence` absent and each still round-trips byte-identical back out through `sharedToRow`.

### 18. The completion log grows forever against a 64KB cap

`client/src/lib/ours-merge.ts` (91-110) against `ours.sql:126`. At about 29 bytes per entry the real ceiling is roughly 2,300 entries across `on` plus `off`, so a daily repeat kept alive crosses it in about six years, or three with heavy un-ticking. The SQL comment still claims "~5000 dates, about 13 years", computed for the old array shape and never re-derived. When it crosses, the 23514 poisons the whole batch and nothing recovers, and deleting the task does not help because the tombstone carries the same payload. Fix with a deterministic **count** cap in `mergeCompletions` (newest 730 date keys by ISO string order, dropping evicted dates from both maps together), not a time horizon, so the file stays clock-free and top-N-by-key still commutes with union. Correct the stale comment in the same commit, and note there that editing the CHECK in `create table if not exists` is a no-op on the live table. Test: merging a 900-date log stays at 730 and keeps the newest, and `clamp(merge(a,b)) === clamp(merge(clamp a, clamp b))`.

### 19. Tombstones keep their words forever

`client/src/lib/ours-merge.ts` (169-171) with `pullPair`. Removal sets `deleted_at` and keeps `title`, the pull re-fetches every tombstone on every poll by design, and nothing anywhere ever deletes one. So on a shared list "remove" means "stop rendering": the words stay in the other person's `doubledone.ours.v1` for the life of the install and in `shared_tasks` indefinitely. Phase 5's "Recently removed" stops rendering after seven days; nothing stops storing. See the product decision below, since the horizon is a policy choice. The mechanism that fits the merge without a client change is a definer `sweep_shared_tombstones(pair)` that **redacts the title** (to a single non-word character, since the CHECK forbids empty) on tombstones past the horizon, without touching `updated_at`, so both devices adopt the redaction on their next pull via `reconcile`'s tie-to-remote and neither pushes the old title back. Gate it on `is_pair_member`, not `is_pair_writable`, or it silently no-ops on the frozen lists that need it most.

---

## Where the fix is a product decision, not code

1. **What a frozen list looks like once a live one exists (#9, #10).** Today `MyPair` is a single pair, so the moment someone starts a new list the frozen one stops rendering, while `ours.frozenBody` promises "you can still read everything here". Options: (a) accept it, one list on screen at a time, and change the copy to stop promising permanent access; (b) `loadMyPair` returns `{ live, frozen[] }` and the design pass draws a quiet read-only archive block; (c) keep today's behaviour, where a new list requires destroying the old, which contradicts the SQL, the copy and the read-back assertion. My pick is (b), and it belongs in the design brief now, because state 8 of the brief assumes there is only ever one list.

2. **Tombstone retention (#19).** How long do the words of a removed shared task live. Options: redact server-side after N days (30 is the smallest number strictly greater than Phase 5's seven-day Restore window, and the coupling needs writing down); hard-delete the rows, which fixes growth as well as privacy but cannot ship until a cached row carries "the server has acknowledged this", or an offline-created row is indistinguishable from a swept one; or keep them forever and say so in the privacy policy. My pick is redact at 30 days now and park hard deletion with that trigger.

3. **What an unreadable cadence looks like on a shared row (#17).** With the validator, an unknown cadence falls through to no recurrence and no due date, so the row never lands on Today: invisible to one person, visible to the other, each certain the other deleted it. On a shared surface the safer default is to show a row you cannot schedule rather than hide it. Phase 6 currently promises the engine is reused "unchanged"; that line needs a caveat.

4. **Whether an un-joined creator can leave, and what the copy says (#14).** The affordance is three lines. The string is the decision: `leaveHint`'s "It closes for both of you, and you can both still read everything" is false when nobody joined, and a new key means the es/fr/it/de pass (Phase 2, still open) carries one more line.

5. **The one-off completion model (#1) is engineering, but its consequence is product-visible.** Routing one-off ticks through the CompletionLog makes `done` a derived projection, which the Phase 3 tick handler must respect. Decide it before that screen is built, not after; this is the cheapest moment it will ever be, because no row exists.

---

## What is in good shape, honestly

- **The CompletionLog is genuinely well built.** Commutative, idempotent, expresses an un-tick, ties resolve to done for a reason that is written down and correct, and `growsBeyond` compares stamps rather than key counts, which is the subtle thing most implementations get wrong. The bug in it is a scoping bug (one-offs were left outside), not a design bug.
- **`ours.sql` is the strongest artifact in the set.** The absent INSERT policy on `pair_members` as the security control, the definer functions, the `is_pair_writable` split, the advisory lock in `create_pair_invite`, the re-mint branch, hash-only invite storage, and post-apply read-backs that assert the behaviours the client then contradicts. Where the client and the schema disagree in this audit, the schema is right every time.
- **`pairing.ts` and `ours-api.ts`'s error handling.** One calm failure name per outcome, `invalid-code` collapsing five distinct reasons so a guesser learns nothing, and no PostgREST sentence escaping the file. The only defect in `ours-api.ts` is the membership pick.
- **`storage.ts`'s Ours cache.** Keyed by pair before it needs to be, defensive on load, in `wipeLocalData` with its regression test, and `pruneOursCache` exists before anything needs it.
- **The seam's field discipline.** Unconditional field emission, the NaN-defended parses, `created_by` deliberately never sent, and the round-trip test. The bugs in `ours-sync.ts` are all at the network boundary, not in the mapping.
- **The comments.** Three of these defects were found by reading a comment that promised something the code beneath it did not do (`clearOn`'s "the caller owes this", `sanitiseCompletions`'s rule one line above the unvalidated `recurrence`, the poll's claimed focus gate). That is a good problem to have: the reasoning is written down, so the drift is visible. Fix the three comments in the same commits as the code, or the next reader trusts them again.