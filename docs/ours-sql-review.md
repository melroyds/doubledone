# The Ours Phase-1 SQL review record

*Verbatim synthesis from the adversarial review of `supabase/ours.sql`, 2026-08-09, run BEFORE
the file touched any database. Four lenses (RLS and privilege, does-it-actually-run, abuse and
enumeration, and whether the schema makes the product's laws true by construction), 44 findings
raised, 33 confirmed by refute-by-default verification, 49 agents. Verdict: do not apply as-is.
Every must-fix below is now applied to the file; this is kept whole because it is the reasoning,
including four reviewer contradictions it resolved and three proposed fixes it rejected as
actively harmful.*

---

Do not apply as-is. The file has real defects, and two of them break laws the product states in its own docs.

Below is the consolidated list. 28 panel findings collapse to 8 must-fix, 5 should-fix, 7 notes. I resolved four direct contradictions between reviewers (flagged inline), rejected three proposed fixes that would break something, and added two things the panel missed.

---

# PREFLIGHT (before any of this reaches live)

**P1. This file has never been executed, not even once.** Apply it to a throwaway Supabase project first and read the errors. A `42702 column reference is ambiguous` or a missing extension surfaces in ten seconds there and in the middle of a live apply otherwise. The existing body is clean on that front (I checked every unqualified column reference against the OUT parameter names), but several fixes below add statements, and one of mine would have broken it (see M6, the `i.expires_at` alias).

**P2. Confirm pgcrypto's schema.** The file calls `extensions.digest` and `extensions.gen_random_bytes`. If pgcrypto lives in `public` on this project, every one of those fails.

```sql
select extname, extnamespace::regnamespace from pg_extension where extname = 'pgcrypto';
```

**P3. Know which edits are now-or-never.** `create table if not exists` is a **total no-op** on a table that already exists, including new inline CHECKs and renamed columns. So table shape (M6, M7, and part of M3) must be right on the *first* apply. Function bodies are `create or replace` and cost nothing to fix later. That distinction is what drives the ordering below.

---

# MUST FIX BEFORE APPLYING

## M1. `join_pair`'s rate limiter records nothing, the email binding fails open, and a wrong guess burns the couple's invite

Four panel findings (two rated fatal) are one bug cluster. `insert into pair_join_attempts` at line 354 is inside the same transaction as every `raise exception` below it, and PostgREST rolls back an RPC on error. Only *successful* joins ever commit an attempt row, and `k_max_pairs = 1` caps that at one per account for life. Both ceilings are unreachable by construction. Separately, `if v_invited <> v_email` evaluates to NULL when `auth.users.email` is null, and an IF treats NULL as false, so the address binding is skipped entirely. And the consume UPDATE does not check the email, so a wrong-recipient attempt sets `used_at` and kills the real invitee's code.

**Contradiction resolved:** reviewers proposed four different shapes (widen the signature with an `outcome` column; delete the global ceiling; move the insert down; count failures only). Take **count failures only, signature unchanged**. It fixes the rollback *and* removes the global-lockout DoS (successful and idempotent replays stop feeding the counter), with no `drop function` and no client contract to negotiate.

Replace lines 324-402 entirely:

```sql
create or replace function public.join_pair(p_code text, p_my_label text)
returns table (pair_id uuid, partner_label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  k_max_pairs constant int := 1;             -- LIVE lists only, see the join below
  k_attempts_per_hour constant int := 10;    -- per account, WRONG GUESSES only
  k_global_per_hour constant int := 5000;    -- runaway backstop, not the primary defence
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_pair uuid;
  v_label text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Serialise this caller against themselves. The cap below is a read-then-write and the PK
  -- (pair_id, user_id) cannot backstop it by design (the 1:many shape must survive). Also stops
  -- a double-tapped join racing its own idempotency branch. Transaction-scoped, released on
  -- commit or on any raise. pg_catalog is implicitly searched, so bare calls resolve under
  -- search_path = ''. The key expression is byte-identical in create_pair_invite().
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if (select count(*) from public.pair_join_attempts a
      where a.user_id = v_uid and a.attempted_at > now() - interval '1 hour') >= k_attempts_per_hour then
    raise exception 'too many attempts, try later' using errcode = '54000';
  end if;
  if (select count(*) from public.pair_join_attempts a
      where a.attempted_at > now() - interval '1 hour') >= k_global_per_hour then
    raise exception 'too many attempts, try later' using errcode = '54000';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;

  -- Strip whatever the code was DISPLAYED with. shared-lists.md §2 renders it as K7M-P4Q, so
  -- btrim alone fails a perfectly-typed code. The class is a whitelist, not a [-\s] blacklist,
  -- so a pasted non-breaking hyphen or NBSP dies too. Keep 0/1 rather than stripping them: a
  -- user who typed 0 for O should fail honestly, not have a character silently deleted.
  -- normalise(generated) === generated, so stored hashes are unaffected.
  v_hash := encode(extensions.digest(
    upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');

  -- Idempotent: already a member of this code's pair, succeed quietly, so a lost response never
  -- reads as "this code has been used". Bounded by expiry: the retry window is seconds, and an
  -- unbounded branch makes a dead code a free success forever.
  select i.pair_id into v_pair
  from public.pair_invites i
  where i.code_hash = v_hash and i.expires_at > now() and public.is_pair_member(i.pair_id);
  if v_pair is not null then
    select m.label into v_label from public.pair_members m
      where m.pair_id = v_pair and m.user_id <> v_uid limit 1;
    return query select v_pair, v_label;
    return;
  end if;

  -- The cap counts LIVE lists only, see M5.
  if (select count(*) from public.pair_members m
        join public.pairs pr on pr.id = m.pair_id
       where m.user_id = v_uid and pr.closed_at is null) >= k_max_pairs then
    raise exception 'already in a shared list' using errcode = '23505';
  end if;

  -- Verify and consume in ONE statement, with the email binding and the pair's liveness IN the
  -- predicate. Three things that were separate checks and are now unforgeable:
  --   1. a wrong-address attempt can no longer CONSUME the invite (it just does not match),
  --   2. a null email can never match, where `v_invited <> v_email` waved it straight through,
  --   3. an invite can never admit anyone to a pair that is frozen or killed, so flipping
  --      disabled_at by hand locks the door behind it instead of leaving a 24h re-entry ticket.
  -- The exists() is written inline DELIBERATELY and must not be replaced with
  -- is_pair_writable(): after M2 that helper requires membership, and the joiner is not a
  -- member yet. Swapping it in breaks joining outright.
  update public.pair_invites i
     set used_at = now()
   where i.code_hash = v_hash
     and i.used_at is null
     and i.expires_at > now()
     and i.invited_email_hash = encode(extensions.digest(v_email, 'sha256'), 'hex')
     and exists (select 1 from public.pairs pr
                 where pr.id = i.pair_id and pr.closed_at is null and pr.disabled_at is null)
  returning i.pair_id, i.created_label into v_pair, v_label;

  -- NO RAISE ON THIS PATH. It is the only guessing path, and a raise aborts the transaction,
  -- which takes the attempt row with it and leaves both ceilings permanently at zero. Zero rows
  -- back IS "that code is not valid", the single line the client renders for wrong, expired,
  -- used, not-yours and killed alike. Counting FAILURES rather than calls is what stops the
  -- idempotent-success branch feeding a global lockout.
  if v_pair is null then
    delete from public.pair_join_attempts a where a.attempted_at < now() - interval '1 hour';
    insert into public.pair_join_attempts (user_id) values (v_uid);
    return;
  end if;

  if (select count(*) from public.pair_members m where m.pair_id = v_pair) >= 2 then
    raise exception 'that list is full' using errcode = '23505';
  end if;

  insert into public.pair_members (pair_id, user_id, label)
    values (v_pair, v_uid, coalesce(nullif(btrim(left(btrim(p_my_label), 40)), ''), 'me'));

  return query select v_pair, v_label;
end;
$$;
```

Also delete `v_invited text;` from the declare block (done above) and change line 333's ceiling comment.

**On the global ceiling: raise it to 5000, do not delete it.** One reviewer wanted it gone (50 throwaway accounts hold a platform-wide lockout down for an hour, with a message that is a lie to the victim). That is a real shared-fate DoS, but the answer is a tenfold blast radius, not deletion: 500 deliverable mailboxes is a real cost, 5000 wrong guesses an hour is unreachable at any realistic scale, and it is still a genuine runaway backstop against a distributed walk. The email binding is what actually makes the code space unwalkable now, and that is what the docs should say.

**Verify after applying:** as a test account, call `join_pair` with 12 junk codes. Expect `select count(*) from public.pair_join_attempts` = 10, and 54000 on the 11th. Then create a real invite for A, attempt it as B, and assert that invite's `used_at` is still null.

## M2. `is_pair_writable()` is a definer oracle over `public.pairs` that any caller can query about any household

It reads `pairs` as definer (bypassing the select policy), never consults `auth.uid()`, and has no membership test. It and `is_pair_member` are the only two functions in the file without the `revoke all ... from public, anon` the rest follow, so anon can call it with the publishable key that ships in the web bundle. An ex-member who kept the pair uuid (it was in their local cache and PostgREST returned it to them for as long as they were a member) can poll it forever: true while the list is alive, false once frozen. That is a relationship-state signal about a household they were removed from, in the one feature whose threat model is domestic.

The membership scope is the load-bearing half. The revoke only closes the anon path, and the realistic attacker still holds a valid JWT.

```sql
create or replace function public.is_pair_writable(p uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  -- The caller test is DELIBERATE, do not "simplify" it out. This means "may I write to this
  -- pair", not "is this pair writable": the unscoped form answered questions about households
  -- the caller has no relationship to. exists() returns true/false and never null, so there is
  -- no null-in-policy pitfall.
  select public.is_pair_member(p) and exists (
    select 1 from public.pairs pr
    where pr.id = p and pr.closed_at is null and pr.disabled_at is null
  );
$$;

-- Same posture as every other function in this file. The GRANT is mandatory, not decorative:
-- RLS policy expressions run with the CALLER's privileges, so an authenticated user without
-- EXECUTE gets "permission denied for function" instead of a policy result, which would break
-- every shared_tasks read and write.
revoke all on function public.is_pair_member(uuid), public.is_pair_writable(uuid) from public, anon;
grant execute on function public.is_pair_member(uuid), public.is_pair_writable(uuid) to authenticated;
revoke all on function public.prune_empty_pair() from public, anon;
```

Place immediately after line 149, before the `enable row level security` block.

**The most dangerous interaction in the whole review:** two reviewers separately proposed (a) scoping this function to members and (b) using it inside `join_pair`'s consume statement to check pair liveness. Applying both **breaks joining entirely**, because the joiner is not a member at that moment. M1 uses an inline `exists` for exactly this reason. Do not tidy it.

Leave the three `shared_tasks` policies alone. `is_pair_member(pair_id) and is_pair_writable(pair_id)` is now logically redundant but self-documenting, and the cost is one PK-index probe on a household-sized table.

## M3. `created_by` is client-controlled on insert and rewritable on update, so either partner can forge authorship

The write policies check only membership and writability. Nothing binds `created_by` to `auth.uid()` and nothing pins it across an UPDATE. `created_by` is the one attribution the product renders ("you see who added a task", the copy required by the privacy-policy work in §D4) and the only evidence a report can carry. B can read A's uuid from `pair_members`, then POST a row stamped with it. `pair_id` is equally mutable, which breaks "every pair is a sealed room" the moment the cap rises.

**Contradiction resolved:** one reviewer proposed `new.created_by := old.created_by` unconditionally on UPDATE. **Reject that.** The `on delete set null` referential action is implemented as an UPDATE on `shared_tasks` and fires this trigger, so an unconditional revert either fails erasure with a 23503 or, worse, silently reverts the SET NULL and leaves a dangling uuid for a deleted account. Let the null transition through.

Also **reject** the other reviewer's proposed `and created_by = auth.uid()` policy WITH CHECK. supabase-js upsert is `INSERT ... ON CONFLICT DO UPDATE`, whose INSERT with-check is applied to every proposed row, so your person ticking a task you wrote would 42501 the whole batch.

Add after line 191 (after the shared_tasks policies, before the prune section):

```sql
-- Authorship, household and clocks are SERVER-coerced, never client-accepted. RLS cannot do this
-- job: WITH CHECK sees only the NEW row, so it can test who you are but not what the row WAS. A
-- BEFORE trigger coerces SILENTLY, which is what a batched last-write-wins push needs. BEFORE ROW
-- triggers fire before RLS WITH CHECK, and ON CONFLICT DO UPDATE routes through the UPDATE branch
-- with OLD as the existing row, so both paths land on the right answer.
create or replace function public.stamp_shared_task_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();          -- the client's value is ignored, never trusted
  else
    new.pair_id := old.pair_id;            -- a row can never walk into another household
    -- Authorship is immutable, with ONE hole left open on purpose: a null must pass through,
    -- because created_by's `on delete set null` fires this trigger during delete_account(), and
    -- blocking it would either put a deleted user's identifier back or fail erasure outright.
    -- Residual, accepted: a member can BLANK authorship, which renders identically to a deleted
    -- account. A far smaller lie than "your partner wrote this", and the price of not fighting
    -- the FK. Phase 2's shared row mapping must simply never send created_by (see N4).
    if new.created_by is not null and new.created_by is distinct from old.created_by then
      new.created_by := old.created_by;
    end if;
  end if;

  -- No row may be stamped more than a day in the future. updated_at is client-authoritative BY
  -- DESIGN (the rule at the top of this file), which was safe while one person owned both
  -- devices and is not the moment a second account writes the same row: an unbounded stamp wins
  -- every LWW comparison forever, so ONE PATCH pins a tombstone your person can never restore.
  -- CLAMP, not a CHECK constraint: a CHECK hard-fails an honest phone with a wrong clock and
  -- poisons the whole batch upsert with a 23514. A day rather than minutes because nowMs()
  -- carries no skew correction yet; server_now() is the read that eventually fixes that.
  new.updated_at := least(new.updated_at, now() + interval '1 day');
  new.created_at := least(new.created_at, now() + interval '1 day');
  if new.done_at is not null then
    new.done_at := least(new.done_at, now() + interval '1 day');
  end if;
  -- deleted_at is deliberately unbounded: nothing reads it as a magnitude, only null / not-null.
  return new;
end;
$$;

drop trigger if exists shared_tasks_stamp_origin on public.shared_tasks;
create trigger shared_tasks_stamp_origin
  before insert or update on public.shared_tasks
  for each row execute function public.stamp_shared_task_origin();

revoke all on function public.stamp_shared_task_origin() from public, anon;
```

SECURITY INVOKER (the default) is correct here, so `auth.uid()` is the caller's. Do not write `security definer`. It must not touch `updated_at` with `now()`, which is why this is a clamp and not an assignment.

Do **not** apply the same clamp to `public.tasks`. Live table, paying subscribers, single-writer so the defect is absent.

## M4. Only `leave_pair` freezes a pair. Account deletion leaves a live, writable, one-person zombie list

The section comment at lines 193-197 claims the trigger holds "for EVERY exit path". It does not: `prune_empty_pair` acts only when *zero* members remain. Three paths remove a member and leave `closed_at` null, so `is_pair_writable` stays true and the survivor's client, whose only signal is `closed_at`, shows a live list: `delete_account()`'s cascade through `pair_members.user_id`, `forget_pair()` (no closed check at all), and a direct `DELETE /pair_members?user_id=eq.<self>` under the delete-self policy.

Concretely: B exercises erasure, A keeps adding "get milk for the baby" to a list with no second reader, indefinitely, with nothing in the data to tell the UI otherwise. And A cannot start a new one (see M5).

Fix the trigger, not the three callers. `leave_pair` stays as it is, because it must freeze *without* deleting a membership, so the trigger never fires for it.

```sql
create or replace function public.prune_empty_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.pair_members m where m.pair_id = old.pair_id) then
    delete from public.pairs where id = old.pair_id;  -- cascades to invites and shared_tasks
  else
    -- One person left behind is a FROZEN list, never a live one-person list. This is
    -- leave_pair()'s freeze applied to the paths that never call it: delete_account()'s
    -- auth.users cascade, forget_pair(), and a direct DELETE under pair_members_delete_self.
    -- Without it "they left" is byte-identical to "they have not joined yet" in the data.
    -- Expiring the invites closes the same 24h re-entry ticket leave_pair already closes, which
    -- matters most on the delete_account path where a seat frees up while a code is still live.
    -- ASSUMES N=2, which join_pair enforces: at two people any departure ends the relationship.
    -- A third seat must revisit this branch, or one of three leaving freezes the other two.
    update public.pairs set closed_at = coalesce(closed_at, now()) where id = old.pair_id;
    update public.pair_invites set used_at = coalesce(used_at, now())
      where pair_id = old.pair_id and used_at is null;
  end if;
  return old;
end;
$$;
```

`coalesce` preserves the original leave time when someone leaves then later forgets. The definer runs as the owning role and bypasses RLS, exactly as the existing `delete from public.pairs` already does. Amend the section comment at 193-197 in the same edit: the "a future third person" clause is now false.

## M5. The one-pair cap counts frozen memberships, so Leave permanently locks a user out of the feature

`leave_pair` deliberately keeps the membership row (the freeze is what preserves read access), and both cap checks count `pair_members` with no reference to `pairs.closed_at`. So the moment you leave, you still count as paired and can neither create nor join another list. The only escape is `forget_pair`, which destroys the frozen list you were promised would not be lost.

This breaks two things the docs specify by name: shared-lists.md §2's "*Sam joined · That wasn't who I meant*, one tap to unpair and mint a fresh code", and §5's "you take things from it one at a time, when you can face it". It also means a coercive ex holds your access to the feature hostage.

The target line is byte-identical at 274 and 372, so one search-and-replace covers both. Replace:

```sql
  if (select count(*) from public.pair_members m where m.user_id = v_uid) >= k_max_pairs then
```

with:

```sql
  -- The cap counts LIVE lists only. A frozen list is an archive: no door, no switcher, no
  -- writes, so it must cost nothing, or "nothing is lost" quietly means "nothing is lost,
  -- unless you ever want to share with anyone again". Deliberately NOT also excluding
  -- disabled_at: closed_at is the user's own choice, disabled_at is the abuse kill switch, and
  -- it should keep costing the slot rather than hand an abuser a fresh one. It costs the victim
  -- nothing, because Leave is available to any member of a disabled pair and un-counts it here.
  if (select count(*) from public.pair_members m
        join public.pairs pr on pr.id = m.pair_id
       where m.user_id = v_uid and pr.closed_at is null) >= k_max_pairs then
```

(Already folded into M1's `join_pair` above. Apply it to `create_pair_invite` too.)

Nothing else moves. Line 393's "that list is full" is scoped to the target pair, and `leave_pair`'s ownership check must keep seeing a closed pair. This opens an unbounded create/leave loop on the create side, which S3 closes.

**Read-back check, two signed-in accounts:** A creates, B joins, A calls `leave_pair`, A calls `create_pair_invite` and gets a code (this is the assertion that fails today), A can still SELECT the frozen `shared_tasks`, an INSERT into the frozen pair still 42501s.

## M6. `pair_invites.invited_email` is a permanent plaintext store of a third party's address, with no erasure path

Redemption stamps `used_at` and never deletes the row. Nothing sweeps expired invites. So the table accumulates, indefinitely, every address every user has ever typed at pairing, including typos, including people who never joined and never had an account, joined to `created_by`, which names who typed it. There is no FK to `auth.users` on it, so `delete_account()` does not reach it, and the file's own comment ("delete_account() needs no change at all", line 91) is true for `created_by` and false for this column. The address is never returned, never rendered, and never read by any client. It is only ever compared. It does not need to be plaintext.

**Now-or-never.** After the first apply this is a rename on a live table holding real third-party addresses.

Line 61, replace the column:

```sql
  invited_email_hash text not null,  -- sha256 of the lowercased, trimmed address. The code is
                                     -- BOUND to one address (Melroy, 2026-08-09), so a mistyped
                                     -- code fails instead of handing a stranger a place in your
                                     -- household, without the address ever being at rest here.
                                     -- Be honest about the limit: an email hash is dictionary-
                                     -- reversible, so this is pseudonymisation, not encryption.
                                     -- It defeats bulk harvest, a support export, and the
                                     -- dashboard-query-pasted-in-a-bug-thread case, and it
                                     -- closes the never-redeemed invite permanently, which no
                                     -- amount of pruning would.
```

Then in `create_pair_invite`, the column list at 294 takes `invited_email_hash` and the value at 299 becomes `encode(extensions.digest(v_invited, 'sha256'), 'hex')` (see S2 for `v_invited`). The join-side comparison is already in M1.

Add the opportunistic sweep so retention is bounded by construction, not intention. No cron, no pg_cron. Put it just before the invite insert:

```sql
  -- Self-maintaining retention. Note the alias: `where expires_at < ...` unqualified would be
  -- AMBIGUOUS against this function's OUT parameter of the same name (42702).
  delete from public.pair_invites i where i.expires_at < now() - interval '7 days';
```

One behaviour interaction to know rather than discover: the idempotent re-join branch now also carries an expiry condition (M1), so a weeks-old code no longer succeeds quietly. That branch exists to survive a lost response, a window of seconds, so 24 hours plus a seven-day sweep keeps the guarantee that matters with a wide margin.

The cost is honest: you can no longer look at the row to debug "what did they actually type". S4 is the right answer to that, and it is a better answer anyway.

## M7. Every other user-authored string is uncapped, and the labels can never be changed or removed

`shared_tasks.title` is capped at 500 precisely because "a direct PostgREST call walks around a client-side limit". The other three surfaces are not. `pair_members.label` and `pair_invites.created_label` have no length check and arrive as raw RPC parameters that are only `btrim`ed, and `pair_members` has deliberately no UPDATE policy, so the string is immutable for its whole life: the person it is rendered to cannot edit it and the person who wrote it cannot correct it. A 3 MB label stalls the victim's Ours screen. A 200-character slur is permanent, unremovable, on their home surface, and it is the string that goes in front of an Apple 1.2 reviewer. This is the "how a name field becomes a message channel" hazard that §1 refused a `pairs.name` column over, shipped one table across.

Separately, `shared_tasks.id` is unbounded `text` and both jsonb columns tolerate values up to 1 GB, so the title cap is decorative against its own threat model: put the payload in `id` or `recurrence` instead. The client's shared pull will be an unbounded `select('*')`, so whatever lands is downloaded.

**Now-or-never** for all five. Inline in the `create table` blocks:

```sql
-- pair_members, line 45
  label text check (label is null or char_length(label) between 1 and 40),

-- pair_invites, line 60
  created_label text not null check (char_length(created_label) between 1 and 40),

-- shared_tasks, lines 78 / 83 / 84
  id text not null check (char_length(id) between 1 and 64),
  ...
  recurrence jsonb check (recurrence is null or octet_length(recurrence::text) <= 4096),
  completed_dates jsonb check (completed_dates is null or octet_length(completed_dates::text) <= 65536),
```

The numbers, so nobody re-litigates them later. `char_length` counts characters, not bytes, so 40 is no penalty on CJK or accented scripts. `id` at 64 is 3.5x headroom on `makeId()`'s ~18 chars, and the reason is not storage: a pulled shared task writes this value into `tasks.shared_id`, so a partner-controlled unbounded id crosses out of the shared table into the victim's personal rows. `recurrence` at 4096 is 64x the largest legal value. `completed_dates` at 65536 is ~5000 ISO dates, about 13 years of daily ticks, and it must sit far above the legitimate curve because that column grows forever by design and is never pruned. `octet_length(x::text)` rather than `pg_column_size(x)`: immutable, and it measures what actually crosses the wire to the partner's device.

Then mirror the cap on input at all three RPC write sites, so an honest user never meets the error. Replace `coalesce(nullif(btrim(p_my_label), ''), 'me')` with:

```sql
coalesce(nullif(btrim(left(btrim(p_my_label), 40)), ''), 'me')
```

The `left()` must sit inside the nullif/coalesce chain or a whitespace-only label stops falling through to 'me'. Verify: `'   '` → btrim `''` → left `''` → nullif null → `'me'`. Correct. The outer btrim catches a truncation that lands mid-space.

Note which half is load-bearing, because it is the reverse of the title case: there is no client write path to these tables, so the `left()` is the enforcer and the CHECK is the backstop that survives a careless later edit to either function.

**Rejected:** a reviewer's proposed UPDATE policy on `pair_members` to allow renaming. The absence of that policy is the security control. If a rename is wanted, it is a `rename_in_pair(uuid, text)` definer RPC scoped to `user_id = auth.uid()`, which is Phase 2 work.

## M8. The self-invite guard and the allowlist compare unnormalised addresses

Line 281 tests `lower(p_invited_email) = v_email` while line 299 stores `lower(btrim(p_invited_email))`. Mobile keyboards and email autocomplete routinely append a trailing space, so the guard passes and the invite is written bound to the creator's own address. They then redeem their own code, `join_pair`'s idempotent branch finds them already a member, `where m.user_id <> v_uid` returns no row, and the function returns `(pair_id, null)`. The client renders a shared list with a null partner label, no error raised anywhere, indistinguishable from a real pairing.

The same class of bug sits on the allowlist: `ours_allowlist.email` is hand-pasted in the dashboard and compared raw, so `Melroy@Gmail.com ` means a tester gets "ours is not open yet" forever and the debugging starts on the function rather than the row.

Both fixed in S2's `create_pair_invite` rewrite below. Listed here because the self-invite one produces a broken, unrenderable state on a live database.

---

# SHOULD FIX

## S1. `create_pair_invite` full replacement (folds in M5, M6, M7, M8, S2, S3)

Everything above lands in one function. Here it is whole:

```sql
create or replace function public.create_pair_invite(p_invited_email text, p_my_label text)
returns table (code text, pair_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- No I, L, O, 0 or 1: this code gets read aloud across a kitchen.
  k_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  k_len constant int := 6;
  k_ttl constant interval := interval '24 hours';
  k_max_pairs constant int := 1;    -- the 1:many cap, LIVE lists only. Raising it is this number.
  k_max_lists constant int := 25;   -- live + frozen. NOT a product limit, an abuse ceiling: once
                                    -- the cap counts live only, create/leave loops forever.
  v_uid uuid := auth.uid();
  v_email text;
  v_invited text := lower(btrim(coalesce(p_invited_email, '')));  -- normalise ONCE, use everywhere
  v_label text;
  v_code text := '';
  v_bytes bytea;
  v_pair uuid;
  i int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Same lock, same key expression, as join_pair. A create racing a join is a real interleaving,
  -- so the two must agree byte for byte. Without it a double-tap or a retried RPC whose response
  -- was lost mints two pairs and two live codes, the UI shows only the second, and the first is
  -- unreachable by anything in the app.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;

  -- The build-time gate. Normalised on the READ side so it fixes rows already pasted into the
  -- dashboard as well as rows pasted later. Delete this block and the table to open Ours.
  if not exists (select 1 from public.ours_allowlist a where lower(btrim(a.email)) = v_email) then
    raise exception 'ours is not open yet' using errcode = '42501';
  end if;

  if (select count(*) from public.pair_members m
        join public.pairs pr on pr.id = m.pair_id
       where m.user_id = v_uid and pr.closed_at is null) >= k_max_pairs then
    raise exception 'already in a shared list' using errcode = '23505';
  end if;
  if (select count(*) from public.pair_members m where m.user_id = v_uid) >= k_max_lists then
    raise exception 'too many old lists' using errcode = '54000';
  end if;

  if position('@' in v_invited) = 0 then
    raise exception 'an email is required' using errcode = '22023';
  end if;
  if v_invited = v_email then
    raise exception 'that is your own address' using errcode = '22023';
  end if;

  v_label := coalesce(nullif(btrim(left(btrim(p_my_label), 40)), ''), 'me');

  insert into public.pairs default values returning id into v_pair;
  insert into public.pair_members (pair_id, user_id, label) values (v_pair, v_uid, v_label);

  v_bytes := extensions.gen_random_bytes(k_len);
  for i in 0..k_len - 1 loop
    v_code := v_code || substr(k_alphabet, 1 + (get_byte(v_bytes, i) % length(k_alphabet)), 1);
  end loop;

  delete from public.pair_invites i where i.expires_at < now() - interval '7 days';

  insert into public.pair_invites (code_hash, pair_id, created_by, created_label, invited_email_hash, expires_at)
  values (
    encode(extensions.digest(v_code, 'sha256'), 'hex'),
    v_pair, v_uid,
    v_label,
    encode(extensions.digest(v_invited, 'sha256'), 'hex'),
    now() + k_ttl
  );

  return query select v_code, v_pair, now() + k_ttl;
end;
$$;
```

A declare-block initialiser referencing a parameter is valid plpgsql and pure, so evaluating `v_invited` before the signed-in check has no side effect. A null `p_invited_email` becomes `''`, fails the `@` test, and raises the same calm 22023 as before, so no error surface changes. 25 old lists is unreachable by any real household and cheap to raise. Keep its message off the never-shame surface: no honest user will see it, and if one does the client should show the generic calm failure.

**Client caveat to record, not a schema change:** with the lock in place, the loser of a double-tapped create now raises 23505 instead of silently minting a phantom pair. The Ours screen must read 23505 from `create_pair_invite` as "you already have a list, here it is" and show it, not a red error, or the fix trades a broken state for a never-shame paper cut.

## S2. Line 41's comment is wrong

It says the cap "lives in `join_pair()` as a named constant". It lives in both functions. Correct it while you are in the file, so the next reader does not audit only one.

## S3. Correct the docs in the same commit

Three statements go from false to true, or from true to false, with these edits:

- `docs/shared-lists.md:110` and `docs/shared-lists-review.md:235`: name the per-invite **email binding** as the primary anti-guessing control, with the per-account and global caps described as what they now are, a throttle on wrong guesses. Review line 235's "an email-OTP account per five guesses" should read ten, and the deferral trigger ("any sign of redeem abuse in logs") only becomes observable at all with M1 applied.
- `docs/shared-lists.md:153-155` and `docs/ours-build-plan.md:48`: the trigger is "delete the pair when no members remain, **freeze it when one does**". The "every exit path (… a future third person)" clause is now wrong and must go.
- `docs/shared-lists.md:167` and §5's "Unpair freezes": name account deletion and Remove-this-list as freeze paths, not just Leave.

## S4. There is no way to mint a fresh code, and the email binding makes that a dead end

`create_pair_invite` refuses a second call because you are already a member, and no other path issues a code. So a mistyped invitee address, which the file's own comment anticipates as the normal case, is unrecoverable: the only escape is `forget_pair`, which hard-deletes the pair and every shared task in it, in a product where removal is always a tombstone and whose stated law is "leaving is one tap, and nothing is lost".

The docs specify the recovery that the schema cannot perform (§2: "one tap to unpair and mint a fresh code"). M6 makes this sharper, because you can no longer inspect the stored address to work out what went wrong.

The right shape, Phase 2 or now: when the caller is the **sole** member of a **live** pair, `create_pair_invite` expires the outstanding invite and mints a new one for the new address, rather than raising 23505. Everything it needs is already in the function. I would take it now while the file is open, but it is a product decision and it is genuinely cheap later, so it is your call.

## S5. `pair_join_attempts` needs no second index

One reviewer wanted `create index ... on pair_join_attempts (attempted_at)` for the global count. With M1 the table only grows on wrong guesses, is capped at 5000 rows an hour by its own ceiling, and is pruned to a one-hour window on every failure. A sequential scan of a few hundred rows costs nothing. Less machinery beats more.

---

# NOTE ONLY

**N1. The email binding contradicts the architecture doc and creates a dead end nobody has designed for.** shared-lists.md §2 says the pairing code was "chosen over email invites because … it needs no deliverability, sends no 'you've been invited!' mail". The schema now requires A to type B's exact *account* email. For a partner who has not signed up yet, A cannot know which address B will use, and if B signs in with a different one the failure renders as "that code is not valid", indistinguishable from a wrong code. No panel finding caught this. Two things follow: §2 needs rewriting, and Phase 2's copy must say plainly that the code only works for the address you typed. This is the strongest argument for S4.

**N2. Anon losing EXECUTE on the helpers changes one error shape.** A signed-out `GET /rest/v1/shared_tasks` turns from an empty array into a permission-denied, because the select policy calls `is_pair_member`. Nothing reads these tables yet, so it is noise, but any future signed-out surface must not query them.

**N3. Phase 2's shared row mapping must not send `created_by`.** M3's trigger lets a null through so erasure works, which means a client that emits `created_by: null` on every push blanks authorship silently. Omit the key entirely and PostgREST leaves the column alone on both the insert and the conflict-update path.

**N4. "Remove this list" wants undo, not a confirm dialog.** `forget_pair` on a solo pair fires the trigger, deletes the pair, and cascades every shared task with no tombstone. That is correct behaviour (they are only your own rows and you asked), but it is exactly the case your own rule covers: destructive actions get undo, not a confirm.

**N5. Control-character and bidi stripping on labels is optional.** The 40-char cap closes the DoS-shaped harm. A bidi override garbling a line is cosmetic with a one-tap remedy, and shared-lists.md §11 explicitly refuses filtering a couple's own words. If you want it, it belongs in the Phase 2 input sanitiser, not in three duplicated SQL expressions.

**N6. Deleting an account clears your rate-limit history**, because `pair_join_attempts.user_id` cascades. It costs an account and a fresh OTP per reset. Accepted.

**N7. Adding `shared_id` and `shared_pair_id` to live `tasks` is safe with the currently-shipped client. I verified this rather than assuming it.** `pullRemote` does `select('*')` so both columns arrive, but `rowToTask` builds the Task explicitly and ignores unknown keys, and `taskToRow` omits them, so PostgREST never includes them in an upsert's SET list and cannot null them. Both are nullable with no default, so no table rewrite and only a momentary lock. Also worth knowing: `isAccountGone` already got its constraint-name fix on 2026-08-09, so the §9 landmine (`shared_tasks`' FKs triggering a destructive account-gone wipe) is already closed.

---

# POST-APPLY VERIFICATION

Run these in the SQL editor after applying, before touching any client work.

```sql
-- The now-or-never constraints actually landed (they silently do NOT if a table pre-existed).
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.pair_members'::regclass, 'public.pair_invites'::regclass,
                   'public.shared_tasks'::regclass)
  and contype = 'c'
order by 1, 2;
-- Expect: label 1-40, created_label 1-40, title 1-500, id 1-64, recurrence <=4096,
-- completed_dates <=65536.

-- The column is the hash, not the address.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pair_invites';
-- Expect invited_email_hash, and NO invited_email.

-- Both helpers are closed to anon.
select p.proname, array_to_string(p.proacl, ' ') from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_pair_member','is_pair_writable');
-- Expect no `=X/` grant to anon on either.
```

Then, signed out, with the anon key from the shipped web bundle:

```
curl -s -X POST 'https://kmzkbihazrffqrsbrbpl.supabase.co/rest/v1/rpc/is_pair_writable' \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' -d '{"p":"00000000-0000-0000-0000-000000000000"}'
```

Expect a permission-denied body, not `true` or `false`.

Then the two-account sequence: A creates, B joins with the code **typed with its hyphen** (this is M1's regression), B PATCHes a row A created setting `created_by` to B and `pair_id` to anything and both come back unchanged with no error, A calls `leave_pair` then `create_pair_invite` and gets a code, B calls `delete_account` and `select closed_at from public.pairs` is non-null.

---

# DECISION-LOG ENTRIES THIS COMMIT OWES

Four, each recording what was decided *against*:

1. **Authorship and clocks are server-coerced by a BEFORE trigger**, chosen over an RLS `with check` (breaks batched upsert) and over a `now()` trigger on `updated_at` (breaks LWW outright). The stamp bound is a clamp rather than a CHECK because a CHECK hard-fails an honest wrong clock and poisons the whole batch.
2. **The invitee's address is stored hashed**, chosen over plaintext-plus-a-purge (needs pg_cron, a second erasure path to keep in sync forever, and still retains never-redeemed invites). Accepted as pseudonymisation, not anonymisation.
3. **The pair cap counts live lists only**, with `disabled_at` deliberately still consuming a slot so the kill switch never hands an abuser a fresh one.
4. **A predicate promoted out of an RLS policy into a named `public.` function has become a public API** and needs its `revoke`/`grant` pair in the same edit. That is the rule that would have caught `is_pair_writable`, and Phases 2 and 3 will want to factor out more predicates.