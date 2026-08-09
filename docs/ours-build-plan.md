# Ours: the build sequence

*The staged plan for the `ours` branch. Architecture in [`shared-lists.md`](shared-lists.md),
the adversarial argument behind it in [`shared-lists-review.md`](shared-lists-review.md).
Full scope, including recurrence, decided 2026-08-09.*

> **Branch rule.** `ours` does NOT deploy. `main` auto-deploys the web on every push, so all of
> this is built here and merged only on Melroy's explicit word, exactly as `premium` and
> `settle` were. The merge IS the web deploy.

**The immediate next action is always the first unchecked box.**

---

## Prerequisites, already on `main`

- [x] `makeId()` gains a random tail (the cross-device primary-key collision, e70f809)
- [x] `isAccountGone()` requires the constraint name, fails safe (e70f809)

Both were found by the architecture panel reading shipped code, and both had to land before
any second table carrying a user foreign key existed.

---

## Phase 1 · Foundation (Supabase only, nothing user-visible)

Nothing in the client changes. Ships to live Supabase ahead of any client that reads it, per
the `skipped_dates` / `big` precedent, because `taskToRow` emits every field unconditionally.

- [x] `pairs`, `pair_members`, `pair_invites`, `shared_tasks` per the locked schema
      (`shared-lists.md` §3), including `recurrence` and `completed_dates` on `shared_tasks`
- [x] `tasks` gains **two** nullable columns: `shared_id`, `shared_pair_id` (a shared task's
      id is only unique within its pair, so the link needs both, §5a)
- [x] `is_pair_member(uuid)` definer helper; RLS on all four tables. `pair_invites` gets
      **zero policies**; `pair_members` gets **no insert and no update policy** (that absence
      is the security control)
- [x] `create_pair_invite()` and `join_pair(code)`, hardened like the live `delete_account()`:
      server-side entropy, hash-only storage, single-statement verify-and-consume, per-account
      and global rate limits inside the function, `MAX_PAIRS_PER_USER = 1` as a named constant
- [x] **Invites are bound to one email address** (Melroy, 2026-08-09). A mistyped code then
      fails instead of handing a stranger a place in the household, which also closes the
      confirmed finding about a mis-texted code. Discloses nothing: the creator already knows
      the address they typed, and the joiner is never shown one.
- [x] **`ours_allowlist` gates creation during the build.** Populated by hand in the dashboard,
      never in this repo, which is public: nobody's email belongs in source control. Removing
      the gate at launch is one `if` block and one `drop table`.
- [x] `leave_pair()` (freeze + expire outstanding invites) and `forget_pair()`
- [x] `after delete on pair_members` trigger: delete the pair when no members remain
- [x] `server_now()` stable function (the clock, phase 3 consumes it)
- [x] Schema-as-code in `supabase/ours.sql`, its own file so `tasks`' policies are never
      touched. **Adversarially reviewed before it is applied** (RLS and definer mistakes are
      the whole risk), then applied by Melroy and verified by a read-back

## Phase 2 · Pairing

- [x] `lib/pairing.ts`: pure formatting, normalisation, validation and error classification, plus
      `lib/ours-api.ts`, the RPC seam. 45 tests, no database needed
- [x] **The list's NAME, which Phase 1 had no column for.** `pairs.name` (nullable, capped),
      a third argument on `create_pair_invite`, a third output column on `join_pair`, and
      `rename_pair()`. NULL means "the app's own word", so an unnamed list reads in each
      person's own language rather than being frozen into the creator's
- [x] `ours_is_open()`: a caller-scoped probe so the Settings door is never drawn for an
      account the allowlist will refuse. Fails closed on anything ambiguous
- [x] Create flow: preset picker (The shop · The house · Looking after someone · Just us ·
      name it yourself, default Ours), self-chosen label, code display, OS share sheet
      (clipboard where there is no share sheet)
- [x] Join flow: code entry, self-label, **no pre-join preview** (§2), post-join confirmation
      both ways ("You're now sharing with Sam. Not them? Leave." / "Sam joined · That wasn't
      who I meant")
- [x] Leave: one tap, on the Ours screen itself, expiring outstanding invites in the same
      statement. Plus the frozen state and "Remove this list"
- [x] Signed-out Ours: the calm one-screen explanation, never a nag
- [x] The Phase-2 door, in Settings (Today's quiet door is Phase 3)
- [ ] **Claude Design pass** over all nine states, brief in
      [`design-source/ours-design-prompt.md`](design-source/ours-design-prompt.md). The screen
      built here is deliberately plain: working, on-strings, one state at a time, so the design
      has something real to replace
- [x] **Adversarial copy review, English pass.** Five lenses, refute-by-default verifiers,
      113 of 159 findings confirmed: 30 keys rewritten, `forgetHint` added, and the whole
      block swept back to house apostrophes. Verbatim synthesis in
      [`ours-copy-review.md`](ours-copy-review.md)
- [ ] **Full per-language adversarial pass** for es/fr/it/de against the settled English,
      same shape as the four native catalog passes (Melroy, 2026-08-09: "let's be thorough AF")
- [ ] **An honest undo for "Delete this list for good".** It cannot be undone once the RPC
      returns (no INSERT policy on `pair_members`, no rejoin path, and the prune trigger
      hard-deletes and cascades once the second member has gone), so the only truthful undo is
      a DELAYED COMMIT: hold it locally, call the RPC when the window closes. `forgetHint`
      ships now and makes the current state honest; the affordance itself waits for the design
      pass rather than being built twice
- [ ] **Dogfood gate:** Melroy and his wife pair on web before Phase 3 starts
      (needs `supabase/ours.sql` re-run for the name columns and `ours_is_open`)

## Phase 3 · The list and its clock

- [x] `withMonotonicStamps` widened to `<T extends { id: string; updatedAt: number }>` (the
      existing tasks.ts one, not a second copy) and exercised on shared rows
- [x] `lib/clock.ts`: the correction itself. Round-trip midpoint, a plausibility bound on the
      SERVER reading only (a device years wrong is the thing being fixed), fails open to zero,
      and cleared on session end from `useSession` so the next person gets their own clock.
      `nowMs()` applies it, so this fixes personal cross-device and MCP skew in the same stroke
- [ ] Call `server_now()` once per sync and feed `applyServerTime`. Until this lands the
      correction is a no-op in production, which is deliberately the safe direction
- [x] `lib/ours-merge.ts`: LWW + tombstones + **grow-only union of `completedDates`**, pure,
      16 tests (two people ticking the bins from two phones converge; a removal races a re-add
      by TIME and gives the same answer whichever phone merges; a corrupt stamp loses)
- [ ] `lib/ours-sync.ts`: push/pull, reconcile after **every** write, poll at 15s while the
      screen is focused AND the app is active, stopping on blur/background and after ten idle
      minutes, filtering on `updated_at` only (never `deleted_at is null`)
- [x] Local cache `doubledone.ours.v1` = `{ [pairId]: tasks[] }`, rendered only when the pair
      matches a confirmed membership. **Added to `wipeLocalData` and its regression test in the
      same commit**
- [ ] The Ours screen: Today's grammar, same rows, same held card minus the AI actions
- [ ] The quiet door on Today: reads `Ours` (or the chosen name). **No count**, ever

## Phase 4 · The bridges

- [ ] Pull to my Today: fresh id, fresh `createdAt`, `shared_id` + `shared_pair_id` set,
      idempotent (a second pull focuses the existing copy)
- [ ] **Your** tick closes the shared row (one hop, the `completeAncestors` shape)
- [ ] **Their** tick tombstones your copy; it never marks it done (work you did not do must
      never enter your Lookback)
- [ ] A shared removal never removes anything from your Today
- [ ] Share to Ours from the personal held card

## Phase 5 · The guards that make the laws true

*Swapped ahead of recurrence on the field answer (couple 1, 2026-08-09: "mostly one-offs with
a few recurrences"). The list is therefore usable without a cadence picker, so the safety work
lands first and a real household gets a real thing sooner.*

- [ ] Freeze on unpair: `pairs.closed_at`, reads stay, writes stop, **zero rows move**
- [ ] "Remove this list" on a frozen list deletes your own membership
- [ ] Done rows stop rendering at the day boundary (parity with `tasksForToday`)
- [ ] Tombstones under seven days: dimmed "Recently removed" with Restore, naming nobody
- [ ] The finality affirmations do NOT fire on Ours (the app only promises finality where it
      controls finality, and here your person can un-tick)

## Phase 6 · Recurrence (full scope, decided 2026-08-09)

*"A few recurrences" is still most of what makes a household list a household list: the bins
do not become one-offs because the rest of the list is.*

- [ ] Render shared recurring tasks through the existing engine unchanged (`tasksForToday` is
      already generic over a structural type)
- [ ] Cadence capture on Ours, reusing the repeating drawer rather than a second surface
- [ ] **`completed_dates` stays an unattributed set of dates.** No per-occurrence attribution,
      ever, or the model becomes the chore ledger the never-shame laws outlaw
- [ ] Confirm by test that a miss is unstorable, so no witness can ever see one

## Phase 7 · Compliance, before any store binary

Two accounts seeing each other's free text puts DoubleDone under Apple 1.2 and Play's UGC
policy. After two guideline rejections in July, a third blocks the whole release.

- [ ] Report: one quiet row → existing `/feedback` Worker route with a context tag and pair id
- [ ] Block: "Leave this list" on the Ours screen (already Phase 2), named honestly
- [ ] Kill path: `pairs.disabled_at`, one clause in the RLS predicate, flipped by hand
- [ ] Privacy policy, **both copies, same commit**, plus the delete-account clause in 5 locales
- [ ] Terms paragraph defining objectionable content
- [ ] Store forms: Play IARC and Apple age rating gain user interaction + UGC; annotate the
      existing Data Safety row; App Review notes pointing at Report and Block

## Phase 8 · Finish

- [ ] Five locales, through the never-shame string audit (the presets are a values statement)
- [ ] E2E cases in `gen-test-suite.py`, suite regenerated
- [ ] Screenshots including Ours, all locales
- [ ] Decision-log entries recording what was decided **against**, per the panel: `created_by`
      kept while `done_by` dropped; freeze over copy; the answer to the clock assumption
      dangling at `decision-log.md:303`
- [ ] **Web first.** Merge to `main` on Melroy's word, live with two real households for a
      fortnight, and only then does Phase 7's kit gate an AAB or IPA

---

## Standing rules for this branch

- **No `done_by` column, in any phase.** A tally must be impossible because the data does not
  exist, the Rhythms bar (`product-spec.md:102`), not because the UI declines to render it.
- **No number on Today that another person can change.**
- **No assignment, no roles, no per-person stats, ever.** A request from the second seat is a
  partner request, never counted as user demand.
- **Every pair is a sealed room.** Nothing renders how many lists someone is in, or with whom.
- **No user's email or account identifier is ever shown to another user, in any surface.**
- Tests for every pure module; gates green before every commit; decision-log entry on every
  feat commit; E2E case in the same commit as the feature.
