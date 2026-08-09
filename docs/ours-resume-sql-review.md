Do not apply as-is. Eight defects, three of which are security or data-loss, and one of them puts a user into a live shared list their own app cannot render or leave.

Nothing here is exploitable on apply day through the shipped UI, because no client calls `invite_to_resume`, `resume_pair` or `sweep_shared_tombstones` (verified: zero references in `client/`, `server/`, `scripts/`). But all three are granted to `authenticated` and therefore reachable by any signed-in bearer token through PostgREST, so "no client calls it" is not "unreachable". Fix the schema before the client work, not after.

---

## The one-sided reopen: NO, not by any path

This is the constraint the feature rests on, so here is the whole trace rather than a verdict.

`closed_at` is cleared in exactly one place in the entire schema: `ours-resume.sql:215`. Nothing else writes it to null. There is no UPDATE policy on `public.pairs` and no INSERT or UPDATE policy on `public.pair_members`, so no client can clear it directly. Line 215 is reached only after the consume UPDATE at 191-201 returns a row, which requires all six of: the code hash matches, `used_at is null`, `expires_at > now()`, `invited_email_hash = sha256(the caller's OWN address)`, the caller is already a member of that pair, and the pair is closed and not disabled.

Every attack on that I could construct fails:

- **Mint and redeem your own code.** `invite_to_resume:83-86` selects `v_other` with `m.user_id <> v_uid`, so the binding is always to the other member. `create_pair_invite:502-504` refuses your own address. There is no path to a code bound to its own minter.
- **Reuse an old join code on a frozen pair.** `create_pair_invite` only ever mints against a live pair (`:517-521` filters `closed_at is null`, else it makes a fresh one). The only two writers of `closed_at`, `leave_pair:748-752` and `prune_empty_pair:365-367`, expire every outstanding invite on that pair in the same transaction. So an unused invite never survives a freeze, and `resume_pair` requires `closed_at is not null`. Closed.
- **Forge the binding.** GoTrue addresses are unique and confirmed, and a null email hashes to null and matches nothing.
- **The minter vanishes, leaving a live ticket.** If the minter deletes their account or calls `forget_pair`, their membership row goes, `prune_empty_pair` fires, and it expires the pair's outstanding invites. The code dies with them.
- **`join_pair`'s idempotent branch.** It returns a success row for a resume code (defect 4 below), but it writes nothing and never touches `closed_at`. A false success on screen, not a reopen.

**So resuming is genuinely two-sided. Both people act. The law holds.**

The honest caveat, and it is defect 1: the minter's act is up to 24 hours old, is never re-read, and has no revoke button. That is not a reopen without consent. It is a reopen on consent nobody re-checked, and the damage is not "dragged back to your ex" (they did offer), it is "silently placed in a second live list your client cannot show you and has no Leave for". Fix 1 closes it. Note also that the revoke mechanism already exists and just has no UI: `leave_pair(p)` on an already-frozen pair is a no-op on `closed_at` and still expires the outstanding code, and any member may call it.

---

## Must-fix, worst first

### 1. `resume_pair` never re-checks the MINTER's live-pair cap (security)

`ours-resume.sql:178-182` re-validates the redeemer. `invite_to_resume:93-97` validates the minter once, at mint. Nothing reads the minter again before `:215` clears `closed_at` up to 24 hours later, and the advisory locks at `:64` and `:171` are both keyed on the caller, so they serialise nothing across the two people.

The sequence needs no malice. B leaves P, P freezes. A mints a resume code (A's live count is 0, because a frozen list costs no slot). A then taps "Start a shared list" on the same frozen screen, `ours.tsx:361`. `create_pair_invite`'s `v_existing` probe only sees live pairs, finds none, takes the else branch at `ours.sql:537` and creates live pair Q with A in it. That branch contains no invite supersede at all (the supersede at `:528` is in the other branch), so A's resume code is untouched. B redeems within 24h and P wakes.

A now holds two live pairs against `k_max_pairs = 1`. `loadMyPairs` (`ours-api.ts:196-197`) gives the live slot to the newest `joined_at`, which is Q, and puts only `!isLive` pairs into `frozen[]`, so P is in neither. P renders nowhere in A's app. B writes into it freely. A cannot read it, rename it, or reach its Leave control, and is now permanently blocked from `join_pair` and `resume_pair` because every cap sees 2.

**Edit.** One clause inside the existing consume UPDATE, between the membership `exists()` at `:197-198` and the liveness `exists()` at `:199-200`:

```sql
     and not exists (
       -- The other member said yes up to 24 hours ago, when their side had no live list, and
       -- nothing has re-read them since. Waking this list changes THEIR live count as well as
       -- yours. In the predicate rather than a raise, for two reasons: a raise would be an oracle
       -- telling a redeemer that the person who left them has started a new list with someone
       -- else, and zero rows is already this function's calm "that code is not valid". used_at
       -- stays null, so the code still works once their other list ends.
       select 1
       from public.pair_members om                              -- the other member of THIS pair
       join public.pair_members ot on ot.user_id = om.user_id   -- every pair they are in
       join public.pairs opr on opr.id = ot.pair_id
       where om.pair_id = i.pair_id
         and om.user_id <> v_uid
         and ot.pair_id <> i.pair_id
         and opr.closed_at is null
     )
```

Every reference is alias-qualified deliberately: `pair_id` is an OUT parameter of this function, so a bare one is a 42702 at runtime, the trap `ours.sql:551` already documents.

`opr.closed_at is null` is byte-identical to the three existing cap counters, so a frozen prior list still costs nothing and a disabled-but-not-closed pair still costs a slot. Keep the gate at `:178-182`: it is about the caller's own state, so it is honest rather than an oracle, and it is a cheap early exit.

Accepted cost, name it in the comment: a refusal lands on the no-raise path and spends one of the redeemer's ten wrong-guess attempts.

### 2. The 30-day horizon is set by whoever wrote the row (data-loss)

`ours-resume.sql:268` destroys words on `t.deleted_at < now() - 30 days`. `ours.sql:327` exempts `deleted_at` from the trigger's clamp on the stated grounds that "nothing reads it as a magnitude, only null / not-null". This migration makes that sentence false and does not change the trigger.

`deleted_at` is client-supplied unconditionally (`ours-sync.ts:68`), unclamped in both directions, and writable by any member of a live pair (`shared_tasks_update_member` tests only `is_pair_writable`).

The version that needs no attacker is the one that matters. Skew correction is a no-op in production: `applyServerTime` has no caller anywhere in `client/src` outside its own test, so `nowMs()` is the raw device clock, and `ours.sql:320-321` already concedes that honest phones have wrong clocks (it is why the other three clamps exist). A device more than 30 days slow removes a task, `withMonotonicStamps` lifts `updated_at` so the push lands and wins, and `deleted_at` rides in raw. The first sweep after that permanently redacts a task removed one minute ago, inside the seven-day Restore window, and the same wrong stamp had already hidden the row from "Recently removed" so there was never a Restore to reach for. The sweep does not touch `updated_at`, so `reconcile` (`ours-merge.ts:224`, a tie resolves to remote) makes both devices adopt the dot and neither pushes the words back.

The adversarial version adds one thing worth naming: on a live pair a member could already blank a title with one PATCH, so this is not an authorisation escalation. What it adds is **timing**. Backdate while live, leave, then sweep the frozen list, which is the one state whose whole promise is "reads stay, writes stop, zero rows move" and where the other person has no write path to undo it.

**Edit.** Make `deleted_at` server-owned the moment it is non-null. This replaces a live, security-critical function body, so paste the existing one whole and add the two blocks rather than retyping, or the `created_by` pin, the `pair_id` pin and the three clamps quietly vanish (exactly the class the Phase 1 review caught twice). Ship it in `ours-resume.sql` as a `create or replace`:

```sql
create or replace function public.stamp_shared_task_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.deleted_at is not null then
      new.deleted_at := now();     -- a row that arrives already removed starts its clock now
    end if;
  else
    new.pair_id := old.pair_id;
    if new.created_by is not null and new.created_by is distinct from old.created_by then
      new.created_by := old.created_by;
    end if;
    -- The retention clock is the SERVER's. sweep_shared_tombstones now reads this column as a
    -- MAGNITUDE, which the old comment below said nothing did. Unclamped and client-written under
    -- a pair-scoped UPDATE policy it is a permanent delete button: one PATCH setting 1970
    -- collapses the 30-day horizon to zero, and an honest phone with a slow clock does the same
    -- thing by accident. A null still passes through untouched, so Restore and the null /
    -- not-null contract the client relies on are unchanged. Coalescing to OLD stops a re-pushed
    -- tombstone, and the sweep's own UPDATE, walking the horizon forward so nothing ever ages out.
    new.deleted_at := case
      when new.deleted_at is null then null      -- restore, always allowed
      when old.deleted_at is null then now()     -- the moment the server saw the removal
      else old.deleted_at                        -- immutable once stamped
    end;
  end if;

  new.updated_at := least(new.updated_at, now() + interval '1 day');
  new.created_at := least(new.created_at, now() + interval '1 day');
  if new.done_at is not null then
    new.done_at := least(new.done_at, now() + interval '1 day');
  end if;
  return new;
end;
$$;
```

Three things that must ride with it:

- Correct `ours.sql:327`, whose comment this invalidates, in the same commit.
- Read it back with `pg_get_functiondef` and confirm `created_by`, `pair_id` and all three `least(` calls survived.
- Normalise pre-existing tombstones before any sweep caller is wired: `update public.shared_tasks set deleted_at = now() where deleted_at is not null and deleted_at < now() - interval '30 days';` Ours is still behind `ours_allowlist`, so this is tester data at most, but do not assume it.

Do not instead use `updated_at` as the proxy (its clamp is one-sided, so it backdates just as freely) and do not add `and t.updated_at < now() - k_horizon` to the sweep (forgeable by the same hand, and useless against a wrong clock, which backdates both stamps). Free win worth noting: `deleted_at` can no longer be stamped in the future either, which was an unbounded way to keep a tombstone out of the sweep forever. Accepted cost: a task created and removed while offline gets its horizon stamped at sync time, which can only move destruction later, never earlier.

### 3. The sweep bypasses the abuse kill switch (security)

`ours-resume.sql:260-262` gates on `pair_members` only. `disabled_at` is never consulted, and the function is SECURITY DEFINER over an owner-owned table without `force row level security`, so `shared_tasks_update_member` (and with it the `disabled_at` clause inside `is_pair_writable`) never runs. This is the only member-callable statement in either file that destroys content on a killed pair.

The comment at `:240-242` argues the membership gate purely in terms of frozen lists, which is right for `closed_at` and silently takes `disabled_at` with it. `invite_to_resume`, twenty lines earlier, goes out of its way to refuse a disabled pair.

`ours.sql:63-65` says the kill switch is "one clause in the write path" and `docs/shared-lists.md:407` says timely response is thirty seconds. After this migration both are false, and those sentences are load-bearing for Apple 1.2 and Play UGC review. Chain it with defect 2 and a reported account can pre-backdate rows while the list is live and then blank the case file after the switch is thrown.

**Edit.** One clause in the UPDATE, not a raise:

```sql
  update public.shared_tasks t
     set title = k_redacted
   where t.pair_id = p_pair
     and t.deleted_at is not null
     and t.deleted_at < now() - k_horizon
     and t.title <> k_redacted   -- idempotent, and keeps updated_at untouched on a second run
     and exists (select 1 from public.pairs pr
                 where pr.id = t.pair_id and pr.disabled_at is null);
```

Predicate rather than `raise ... 42501` for two of this file's own reasons. A member who used to get a count and now gets a 42501 has learned the list was reported, which is precisely the oracle `invite_to_resume:75-79` refuses to be. And if the client ever calls this on pull, a raise reintroduces the exact bug `docs/ours-phase3-audit.md:57` recorded, where a 42501 on a frozen pair pinned a device at its last sync under copy promising nothing is lost.

Then extend the comment at `:240-242` so the next reader cannot re-widen it: frozen lists are swept deliberately, killed lists are not, the two flags are not interchangeable, and the accepted cost is that a killed pair's removed words never age out (bounded, since both members can still drop their membership and the whole pair cascades).

### 4. `join_pair` reports a false success for a resume code (wrong-behaviour)

The file argues at `:139-148` that resume must be a separate function because `join_pair`'s consume predicate requires `closed_at is null`. True of the consume UPDATE, false of the function. `join_pair` has a second path, the idempotent branch at `ours.sql:628-630`, whose only conditions are `code_hash`, `expires_at > now()` and `is_pair_member(i.pair_id)`. No `used_at`, no `closed_at`, no `disabled_at`.

This migration creates the first invite in the schema that is unused, unexpired, and points at a frozen pair. A resume code's redeemer is a member of that pair by construction. So every resume code satisfies that branch, for either party, every time.

It is reachable through shipped UI: the frozen card's "Join instead" (`ours.tsx:362`) opens the app's only code box, which calls `joinPair` (`ours-api.ts:91`). The branch returns `(pair_id, partner_label, pair_name)`, `ours-api.ts:97` sees a truthy `pair_id` and returns ok, and `ours.tsx:229-230` hard-codes `closedAt: null, disabledAt: null`, so the screen reads "sharing with Sam" over a list that is still frozen. Nothing was consumed, nothing was cleared, no attempt row was recorded, and the follow-up `refresh()` drops the screen back to "closed" with no error line, because `failure` was cleared and never set.

**Edit.** `create or replace function public.join_pair(p_code text, p_my_label text)` inside `ours-resume.sql`, restating the body from `ours.sql:580-689` verbatim with only lines 628-630 changed, and mirror the identical edit into `ours.sql` in the same commit so a later re-run of that self-declared-idempotent file cannot reinstate the old body. No `drop function` needed: the signature and the RETURNS TABLE shape are unchanged, so `create or replace` is legal and preserves the ACLs.

```sql
  select i.pair_id into v_pair
  from public.pair_invites i
  where i.code_hash = v_hash
    and i.expires_at > now()
    and public.is_pair_member(i.pair_id)
    -- Liveness, byte-identical to the consume statement below. Phase 5 mints the first invite that
    -- can point at a FROZEN pair, and a resume code's redeemer is a member of that pair BY
    -- CONSTRUCTION, so without this the branch returns a full success row that clears no
    -- closed_at, consumes no code and changes nothing. Written inline and NOT as
    -- is_pair_writable(), even though the helper is exact here, because the consume below cannot
    -- use it (the joiner is not a member yet) and a call to it four lines above that comment
    -- invites someone to "make it consistent" and break joining outright.
    and exists (select 1 from public.pairs pr
                where pr.id = i.pair_id and pr.closed_at is null and pr.disabled_at is null);
```

Do **not** add `and i.used_at is null`: a resume code has `used_at` null so it fixes nothing, and it inverts the branch's purpose (the lost-response retry it exists for always has `used_at` set). `and i.used_at is not null` is defensible and makes the branch's precondition true by construction, but it also turns "A types their own unredeemed code" from a quiet success into a 23505, so treat it as optional and decide it deliberately. The liveness clause alone closes the defect, and it closes the same false success on a `disabled_at` pair, which is reachable today.

After the fix a resume code in the join box falls through to the consume UPDATE, fails its own `closed_at is null`, and gets the calm "that code is not valid". That is honest for the wrong door, but it is a false failure on a shipped button, so it must not ship silently: see the product decisions below.

### 5. `invite_to_resume`'s supersede kills the OTHER member's code (wrong-behaviour)

`:116-117` is scoped to the pair with no `created_by` filter, and the lock at `:64` is keyed on the caller, so two members minting neither serialise nor reliably supersede. The idiom is lifted from `create_pair_invite:528`, where pair-scoping is safe only because that branch runs while the caller is alone in the pair (`:523-526` raises the moment anyone else has joined). `invite_to_resume` has the opposite precondition: it requires a second member. The invariant that made the idiom safe was left behind.

Sequential, and it is the likely one for two people in one kitchen. A taps Resume and reads code CA off the screen. B taps Resume ten seconds later, not having heard. B's `:116-117` stamps `used_at` on CA, then mints CB. B types CA. The consume matches on hash, binding, membership and freeze, and fails on `used_at is null` alone. Zero rows, so the calm "that code is not valid", plus a wrong-guess row against B's ten-per-hour ceiling shared with `join_pair`. Two people trying to come back are told the six characters they can both see are wrong, and if either taps for a fresh code they kill the other's, indefinitely.

Concurrent: different lock keys, and under READ COMMITTED neither supersede sees the other's uncommitted insert, so both codes commit live and the comment at `:114-115` is false.

**Edit.** Replace `:114-117`:

```sql
  -- Supersede any outstanding resume code YOU minted, so one person tapping twice does not leave
  -- two live tickets. Scoped to the CALLER, not the pair: this is the first flow in the schema
  -- where BOTH members can mint into one pair, and a pair-wide supersede silently kills the code
  -- the app has already shown the other person, which then reads as invalid and burns their rate
  -- limit. create_pair_invite's re-mint can be pair-scoped only because its branch runs while the
  -- caller is ALONE in the pair. Killing theirs buys nothing anyway: their code is bound to YOUR
  -- address and admits only YOU, an existing member. Pair-wide expiry belongs to the freeze, and
  -- leave_pair and prune_empty_pair already do it there.
  update public.pair_invites i set used_at = coalesce(i.used_at, now())
    where i.pair_id = p_pair and i.created_by = v_uid and i.used_at is null;
```

Steady state becomes at most one live code per member, each bound to the other, both valid, and the existing caller-keyed lock now enforces exactly that invariant. Rewrite the comment's claim from one live code per pair to one per member. Do not swap the advisory lock at `:64` to a pair key: that key is what serialises the read-then-write caps against `join_pair:605` and `create_pair_invite:485` on the same account, and replacing it opens a two-live-pairs race.

### 6. `resume_pair` has no idempotent branch, so a successful retry says "you already have a list" (wrong-behaviour)

`join_pair` puts its idempotent branch above the cap check precisely so a retry after a successful redemption recognises itself. `resume_pair` copied the structure and dropped the branch. Once a resume succeeds the pair is live and the caller is in it, so the very next call hits `:178-182`, counts 1, and raises 23505 without the word "full". `classifyPairError:130` returns `already-paired`, `ours.tsx:37` renders `errAlreadyPaired`: "For now, DoubleDone keeps one shared list at a time. You can leave the one you have whenever you like." The person who has just resumed with their partner is told they already have a list and invited to leave it, on the most loaded surface in the product. The advisory lock is transaction-scoped and released on commit, so a double tap is enough. A lost PostgREST response on a flaky mobile connection is the case `ours.sql:625-627` says this branch exists for.

**Edit.** Move the `v_hash` assignment up (not optional: the branch reads it, and a null `v_hash` matches nothing, silently), then insert the branch, both above the cap check. After the throttle block ending at `:176`:

```sql
  -- Moved UP from below: the idempotent branch needs v_hash. Byte-identical normalisation to
  -- join_pair, or a perfectly-typed code hashes to something the database has never seen.
  v_hash := encode(extensions.digest(
    upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');

  -- Idempotent, exactly as join_pair, and ABOVE the cap check for the same reason it sits there:
  -- once a resume has succeeded the pair is LIVE and the caller is a member, so the cap fires
  -- first and answers a successful retry with "you already have a shared list, you can leave it".
  -- This branch writes NOTHING and requires closed_at IS NULL, so it can never resume anything: a
  -- frozen pair falls straight through to the real handshake and the never-unilateral law is
  -- untouched. Bounded by expiry, so a long-dead code is not a free success. The label comes from
  -- pair_members, not i.created_label, or the MINTER hitting this branch is shown their own name
  -- as their partner's.
  select i.pair_id into v_pair
  from public.pair_invites i
  where i.code_hash = v_hash
    and i.expires_at > now()
    and public.is_pair_member(i.pair_id)
    and exists (select 1 from public.pairs pr
                where pr.id = i.pair_id and pr.closed_at is null and pr.disabled_at is null);
  if v_pair is not null then
    select m.label into v_label from public.pair_members m
      where m.pair_id = v_pair and m.user_id <> v_uid limit 1;
    select pr.name into v_name from public.pairs pr where pr.id = v_pair;
    return query select v_pair, v_label, v_name;
    return;
  end if;
```

Then delete the now-duplicated `v_hash` assignment at `:188-189`. This also resolves the rare tail left by fix 5 cleanly: if both members mint and both type, the second redeemer lands on this branch and sees the live list rather than a 23505.

### 7. Three user-facing strings that are false (wrong-behaviour)

`ours.sql:115-118` calls the raised messages a contract, and `classifyPairError` keys on errcode plus a message token. `invite_to_resume` borrows three tokens for states none of them describes, and the comment at `:88` admits it.

The one that matters: B deletes their account or calls `forget_pair`, `prune_empty_pair` freezes P and leaves A as its only member, A taps Resume, `:88` raises 23505 with "full", and the app tells a person who has just been left that a list containing one person is full. The true state, "there is nobody left to wake this with, and there never will be", is permanent (`join_pair` requires `closed_at is null`, `resume_pair` requires existing membership, so nothing can ever add a second member to a frozen pair) and the app has no way to say it. Nothing is disclosed by saying it: `pair_members_select_member` already lets A read both rows, and `loadMyPairs:187` already computes `partnerLabel: null` from exactly that read.

**Edits.** Keep 42501 rather than inventing a code, because a stale client then degrades to `not-yours` ("This list is closed to changes"), which is true of a frozen list that is staying frozen. Anything on 23505 degrades to `already-paired`, whose copy tells a bereaved user to leave a list they do not have.

- `:88` becomes `raise exception 'nobody left to resume with' using errcode = '42501';`
- `:103` (the no-readable-address branch, unreachable today since email OTP is the only sign-up path) folds onto the same line. From the user's side it is the same fact, and it stops a screen with no email field ever saying an address looks wrong.
- `:72` becomes `raise exception 'that list is already live' using errcode = '42501';` Avoid the word "open": `classifyPairError:129` forks 42501 on the substring `not open`, and a near-miss there is a trap for the next reader. This one is race-only and self-healing, and safe to raise honestly, since membership is checked at `:68` first and a member can already read `closed_at`.
- Leave the `disabled_at` refusal at `:77-79` on the shared "not your list" line exactly as it is. That indistinguishability is deliberate and correct.

Client side, in the same commit or the new state degrades to a vague line: add `'partner-gone'` to `PairFailure`, fork the 42501 branch in `classifyPairError` on `nobody left`, add a `FAILURE_LINE` entry (the `Record<Exclude<PairFailure,'signed-out'>, string>` will force it), and one calm string in all five catalogs saying plainly that this list stays readable forever but cannot be woken, and pointing at Forget or a new list.

### 8. Post-apply read-back 3 cannot fail (clarity)

`pg_get_functiondef(...) like '%closed_at is null%'` returns true even after the clause it protects is deleted, because `join_pair` contains that substring twice: the live-pair cap at `ours.sql:641` and the consume predicate at `:663`. Someone reads `ours-build-plan.md:152-153` ("needs a reopen path in `join_pair`") literally, deletes the consume clause, runs read-back 3 to check exactly that, and the verification signs off on the regression this file names at `:139-143` as its whole reason for existing.

**Edit**, and it must be written after fix 4, which adds a second copy of the full conjunction:

```sql
--   -- 3. join_pair still refuses closed and killed pairs, in BOTH of its paths: the idempotent
--   --    branch and the consume statement. Counted, not LIKE'd: the bare phrase "closed_at is
--   --    null" also appears in the live-pair cap, so a LIKE passes on a database where the door
--   --    has been opened.
--   select (select count(*) from regexp_matches(pg_get_functiondef(p.oid),
--             'closed_at is null and pr\.disabled_at is null', 'g')) = 2 as still_tight
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'join_pair';
--   -- expect true.
```

The read-back set is also three catalog queries and asserts nothing behavioural, where Phase 1 ended with steps a to d. Add, with two test accounts:

- e. A and B paired, A leaves. B calls `invite_to_resume`, A redeems, `pairs.closed_at` is null. A calls `resume_pair` with the SAME code again and gets the same row with no error, and `closed_at` is still null.
- f. A and B on a frozen pair, both call `invite_to_resume`. `select count(*) from pair_invites where pair_id = P and used_at is null` is 2, and A's code still redeems as B.
- g. B leaves P, A mints a resume code, A then calls `create_pair_invite` for C and C joins. B redeems the code: it must fail calmly and P must still be frozen.
- h. With `pairs.disabled_at` set by hand and a tombstone older than 30 days, `sweep_shared_tombstones` returns 0 and the title is unchanged. Clear `disabled_at` and it returns 1.
- i. A resume code typed into `join_pair` returns zero rows, and the pair's `closed_at` is unchanged.

---

## Product decisions, not defects

These are yours to call. None of them is a bug in the SQL.

1. **Can a frozen list be woken while you already have a live one?** The SQL says no, at both `:93-97` and `:178-182`. `ours-build-plan.md:157` and `decision-log.md:5106` both say yes. They cannot both stand. My read: the SQL is right and the docs are wrong, because `loadMyPairs` can surface exactly one live list and would orphan the other. Correct both sentences to "a frozen list costs you no slot, so leaving never blocks you from starting a new one, but waking one needs a free live slot on both sides". If you leave the docs as they are, the next reader loosens the check fix 1 depends on.

2. **Who calls the sweep, and what may the privacy copy promise?** There is no cron, no `pg_cron`, and no client call site, so redaction happens only when something explicitly calls the RPC for one pair. The comment at `:241-242` reads as coverage the mechanism does not have. The Worker cron cannot do it (it holds the anon key, and `service_role` is a standing never). The cheap answer is one call from `loadMyPairs`, which already enumerates the live pair and every frozen one on every Ours open, which makes coverage "either person opens the app" rather than "someone opens that specific archive". Whatever you choose, the copy must say removed items keep their words for **at least** 30 days and are blanked the next time either of you opens the list. Never "within 30 days". That sentence is what Google fetches during review, and it is cheap to pin now and expensive to have promised wrong.

3. **Should the frozen screen offer a resume-code entry of its own?** After fix 4, a valid resume code typed into "Join instead" gets a calm refusal and burns one of ten hourly attempts. Far better than a withdrawn reunion, still wrong for the user. The right shape is a "Resume with Sam" action wired to a new `resumePair()` seam, and `ours.joinInstead` on the frozen branch either trying resume first or being relabelled. Until that lands, `invite_to_resume` should not be reachable from any UI.

4. **Should a resume code be revocable, and should Resume be offered at all when it cannot succeed?** The revoke mechanism exists (`leave_pair` on an already-frozen pair expires the code) and just has no button. And the client can already see it is alone in a frozen pair (`partnerLabel === null`), so the never-shame answer is to not offer Resume there, and treat the new `partner-gone` error as the backstop for the race rather than the explanation.

5. **Should the sweep be user-callable at all?** Even after fix 2, either member can trigger redaction of the other's removed words the moment they cross the horizon. That is consistent with two equal writers and no owner, which is the model, but it is a design question worth answering on purpose rather than by default.

---

## What is right, and should not be touched

The core design holds, and the parts under most pressure are the parts that are correct.

Binding the code to the other member's address server-side, so nothing is typed and nobody can mint to themselves, is what makes the never-unilateral law structural rather than procedural. The single verify-and-consume UPDATE with all its conditions inside the predicate is the right shape, and the reason four of the eight fixes above are one clause each. The no-raise throttle path is copied correctly and for the stated reason. Refusing to widen `join_pair` and writing a separate function was the right call, even though defect 4 shows the argument for it was one path short. Redact rather than hard-delete, with the reason (a cached row cannot yet say "the server has seen this") written down, is the right constraint honoured. Not touching `updated_at` in the sweep, so both devices adopt the redaction without either pushing the words back, is a genuinely subtle piece of reasoning and it survives every fix above, including the trigger change. And gating the sweep on membership rather than writability is right for `closed_at`; it just needed to say `disabled_at` out loud.

Apply order: fix 2's trigger and fix 4's `join_pair` are `create or replace` over live, security-critical bodies, so paste them whole and read them back. Everything else is new-function text in this file.