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
- [x] **Full per-language adversarial pass** for es/fr/it/de against the settled English. Three
      native lenses each, refute-by-default verifiers, then a per-language synthesis and a
      cross-language terminology check: 174 raised, 124 confirmed, 61 keys rewritten (es 21,
      it 15, fr 13, de 12). A separate cross-file verification then caught four more, including
      the one terminology break the terminology agent had named and the German pass had missed
- [ ] **An honest undo for "Delete this list for good".** It cannot be undone once the RPC
      returns (no INSERT policy on `pair_members`, no rejoin path, and the prune trigger
      hard-deletes and cascades once the second member has gone), so the only truthful undo is
      a DELAYED COMMIT: hold it locally, call the RPC when the window closes. `forgetHint`
      ships now and makes the current state honest; the affordance itself waits for the design
      pass rather than being built twice
- [x] **The six dogfood blockers from the Phase 3 audit**, all in this screen: the minted code
      could vanish before it was readable; "Get a new code" was a dead button that destroyed the
      code on screen; leaving was a one-way door out of the whole feature whose only exit was the
      irreversible delete; `loadMyPair` picked an arbitrary membership; a failed read told someone
      they had no list; and a stale read could overwrite a newer one and re-arm the arrival beat.
      Plus the kill switch being read and ignored, a live pair nobody joined having no exit, and
      the poll never stopping
- [ ] **Dogfood gate:** Melroy and his wife pair on web before Phase 3 starts

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
- [x] `lib/ours-sync.ts`: push/pull, reconcile after **every** write, the poll policy as a pure
      testable rule (`shouldPoll`), and a FULL pull with no `deleted_at` filter. 25 tests. Note
      the deliberate reversal: an `updated_at > watermark` delta looks like an optimisation and
      is a data-loss bug here, because `mergeShared` reads a local row missing from the remote
      set as local-only and pushes it, so every row outside the delta would be re-pushed on
      every poll and a row the other person deleted would be resurrected by yours
- [ ] The polling HOOK itself (AppState + focus + idle timer), which belongs with the screen and
      waits for the design pass
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
- [ ] **Frozen lists stay readable, tucked away** (Melroy, 2026-08-09). `loadMyPair` becomes
      `{ live, frozen[] }` and the design draws a quiet read-only archive below the live list.
      Without this, starting a new list makes the old one vanish while its own copy promises
      "you can still read everything here", in five languages
- [ ] **Resuming a frozen list, by the SAME handshake that made it** (Melroy, 2026-08-09). One
      member mints a fresh code bound to the other's address, the other redeems it, and
      `closed_at` clears with every row still in place. **Never unilateral**, and that is the
      whole design: in a domestic threat model the value of "it closes for both of you" is that
      it is a door the other person cannot drag you back through, so a one-sided reopen would
      turn leaving into a pause someone else can undo. Needs a reopen path in
      `join_pair` (which today refuses closed pairs, correctly), and it only works while BOTH
      memberships still exist. A frozen list costs no live slot, so an old one can be resumed
      later even while a current list exists
- [ ] "Put it away" on a frozen list: TUCKS, deletes nothing (round one's D8, which replaces the
      build's destructive `forget_pair` and removes the delayed-commit-undo problem entirely)
- [ ] **Tombstone redaction at 30 days** (Melroy, 2026-08-09). A definer
      `sweep_shared_tombstones(pair)` blanks the TITLE on tombstones past the horizon without
      touching `updated_at`, so both devices adopt the redaction on their next pull and neither
      pushes the old words back. Gated on `is_pair_member`, not `is_pair_writable`, or it
      silently no-ops on the frozen lists that need it most. 30 is the smallest number
      comfortably past Phase 5's seven-day Restore window, and that coupling is deliberate.
      **Decided against** hard deletion for now: it fixes growth too, but cannot ship until a
      cached row can say "the server has seen this", or a task created offline is
      indistinguishable from a swept one
- [ ] "Remove this list" on a frozen list deletes your own membership
- [ ] Done rows stop rendering at the day boundary (parity with `tasksForToday`)
- [ ] Tombstones under seven days: dimmed "Recently removed" with Restore, naming nobody
- [ ] The finality affirmations do NOT fire on Ours (the app only promises finality where it
      controls finality, and here your person can un-tick)

## Phase 6 · Recurrence (full scope, decided 2026-08-09)

*"A few recurrences" is still most of what makes a household list a household list: the bins
do not become one-offs because the rest of the list is.*

- [ ] Render shared recurring tasks through the existing engine unchanged (`tasksForToday` is
      already generic over a structural type), feeding it `completedDatesOf(row.completions)`
- [ ] Cadence capture on Ours, reusing the repeating drawer rather than a second surface
- [x] **The completion log stays unattributed.** Dates and times only, no per-occurrence
      attribution, ever, or the model becomes the chore ledger the never-shame laws outlaw.
      Built and tested in `lib/ours-merge.ts`, including the un-tick the first version could not
      express (2026-08-09)
- [ ] Confirm by test that a miss is unstorable, so no witness can ever see one
- [x] **A cadence the reader's build cannot understand SHOWS, it does not hide** (Melroy,
      2026-08-09). The seam already keeps an unreadable cadence verbatim; `repeatSummaryOf` and
      `isUnreadableRepeat` are the reader's half, and `knownRecurrence` carries the summary
      through so the client that DOES understand a cadence never strips the fallback the client
      that does not depends on
- [ ] The cadence WRITER must include a plain-English `summary` in the recurrence object, in its
      own language, whenever it writes one. Same shape the public REST API already uses. A reader
      that understands the cadence ignores it and renders its own localised line; the stored one
      is a fallback, never the source of truth
- [ ] Render an unreadable repeat: shown, never placed on a day, never counted as due today

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
- **No per-person completion state, pending or final, in any shape, including on a device.**
  Mutual confirm, verify together, two-key done, sign-off and every other name for it are refused
  by this line. The reason is narrow and worth keeping: any gate that actually works has to be
  visible to the server, and server-visible per-party completion state on a list of exactly two
  people is `done_by` with a clock bolted on. The local-only version dies on your own second
  device, which holds no memory of who armed it. (Decided 2026-08-09, panel in
  [`ours-features-review.md`](ours-features-review.md).) The need underneath, "ticked does not
  always mean done", is a definition-of-done problem and belongs to decomposition; the other need,
  "things change under me", is Phase 5's change surface.
- **Every pair is a sealed room.** Nothing renders how many lists someone is in, or with whom.
- **No user's email or account identifier is ever shown to another user, in any surface.**
- Tests for every pure module; gates green before every commit; decision-log entry on every
  feat commit; E2E case in the same commit as the feature.


## Check for updates (all three platforms)

*Agreed with Melroy 2026-08-09, and deliberately sequenced AFTER the dogfood gate and the round-two
design pass, so it does not compete with either.*

**Order, agreed:** dogfood gate first, then the design, then this build across all three platforms,
then the Worker deploy, then testing.

**What it is for.** Two people on a shared list can be on different app versions, which is the
ordinary state. This shrinks that window. **It does not close it**, and the plan must not pretend
otherwise: rollouts are staggered by days, people decline updates, and some older Android devices
cannot take the newest build at all. The "show, do not hide" handling of an unreadable cadence stays
the safety net for the window that remains. Both, never either.

- [ ] **Web.** The biggest win and the only one needing nothing external: a tab or an installed PWA
      can be weeks stale with no signal, because the browser keeps serving what it cached. Detect a
      newer build and offer a quiet reload.
- [ ] **Android and iOS: point at the respective store** (Melroy's explicit preference). There is no
      in-app update API on iOS at all, and Play's needs a native module, so the honest shape is the
      app comparing its own version against a published latest and offering a link.
- [ ] **One route on the `doubledone-ai` Worker** serving the latest version per platform. One
      endpoint on infrastructure that already exists. **Needs Melroy's per-instance OK to deploy.**
- [ ] **A quiet fact, never a nag.** No badge, no repeated modal, nothing that reads as "you are out
      of date" to someone who opened the app to write down one thing. The standing rule is remove
      friction, never add a setting, and an update prompt is a demand on attention. A line in
      Settings that is simply true, plus at most one unobtrusive mention when a build is genuinely
      old.
- [ ] Strings in five locales, through the same never-shame lens as everything else.
- [ ] E2E cases per platform, and a real check that the web path does not loop on a reload.

## Backlog


- **House typography drift OUTSIDE the `ours` namespace** (found by the language verification pass,
  2026-08-09, deliberately not swept in a copy commit). Curly apostrophes at `en.ts:860,867`,
  `fr.ts:389,512,844,845,856,863,865`, `it.ts:393,856,857,863`, `de.ts:115,1000`; backslash-escaped
  delimiters that should be delimiter switches at `fr.ts:573,722,724` and `it.ts:32,967`. All
  pre-existing, all in shipped native-reviewed strings, and both forms render identically, so this
  is tidiness rather than a defect. **Trigger:** the next time any of those namespaces is edited for
  another reason.
- **French `presetOwn` drops the self-agency the other four keep** (en "Name it yourself", es "Ponle
  tú el nombre", it "Dalle un nome tu", de "Selbst benennen", fr "Lui donner un nom"), and it
  near-duplicates fr's own `namePlaceholder` on the very next screen. Low severity, flagged rather
  than proposed by the verification pass. **Trigger:** a French reader mentions it, or the round-two
  design pass changes that screen.
- **`notThem` frames the judgement on the HUMAN in fr and de** ("la bonne personne", "der richtige
  Mensch"), where es and it use the speaker-side frame ("quien esperabas", "chi ti aspettavi"). The
  German terminology break was fixed; the framing question was raised by one agent and never put to
  a verifier, so it is parked rather than acted on. **Trigger:** the round-two copy pass, where it
  belongs beside `wasntWho`, which already moved to the speaker-side frame in it and de.
