-- DoubleDone: Ours, PHASE 5. Waking a frozen list, and letting removed words age out.
--
-- Applies AFTER supabase/ours.sql. Idempotent: safe to run more than once.
--
-- PASTE THIS FILE ALONE. Do NOT re-run ours.sql first, on a database that already has it. The
-- normalise in section 3c depends on ours.sql's OLD trigger still being live, and re-applying
-- ours.sql installs the new one early, which turns that statement into a silent no-op and strands
-- every backdated tombstone as immutable. Read-back 5 detects it and carries the remedy.
--
-- DO NOT APPLY UNTIL THIS FILE HAS BEEN ADVERSARIALLY REVIEWED. The Phase 1 file had eight real
-- defects when written by hand, two of which silently disabled their own security controls, and
-- the panel's verdict was "do not apply as-is". This one touches the freeze, which is the feature's
-- only safety exit, so the bar is higher rather than lower.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS ADDS, AND THE ONE RULE IT MUST NOT BREAK
--
-- Melroy, 2026-08-09: a frozen list should be resumable with the same person, rather than rebuilt
-- from nothing. Agreed, with one absolute constraint that shapes the whole design:
--
--   RESUMING IS NEVER UNILATERAL.
--
-- In a domestic threat model the entire value of "it closes for both of you" is that leaving is a
-- door the other person cannot drag you back through. A one-sided reopen would quietly turn leaving
-- into a pause somebody else can undo, on the one feature whose threat model is domestic. So
-- resuming is the PAIRING HANDSHAKE AGAIN: one member mints a code, the other redeems it, and only
-- then does closed_at clear. Both people actively choose it, which is the property that keeps
-- leaving meaningful.
--
-- It deliberately reuses the existing invite table, the existing hashing, the existing single
-- statement verify-and-consume, and the existing rate-limit table, so there is one pairing
-- mechanism in this schema rather than two that can drift apart.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Minting a resume code.
--
-- The address is NOT typed by the user this time. Both people are already members, so the server
-- knows the other member's address and binds to it directly: nothing is disclosed (the minter is
-- never shown it, and the redeemer is never shown one), and it removes the single sharpest edge in
-- the original flow, where a mistyped address produced an unrecoverable dead end.
-- ---------------------------------------------------------------------------

create or replace function public.invite_to_resume(p_pair uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  k_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  k_len constant int := 6;
  k_ttl constant interval := interval '24 hours';
  k_max_pairs constant int := 1;   -- byte-identical to create_pair_invite and join_pair
  v_uid uuid := auth.uid();
  v_other uuid;
  v_other_email text;
  v_label text;
  v_code text := '';
  v_bytes bytea;
  i int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Same lock key as the other two pairing functions, because a resume racing a create is a real
  -- interleaving: both of them care about how many LIVE pairs this account has.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- Must be YOUR list, and it must actually be frozen. A live list has nothing to resume, and
  -- saying so plainly beats minting a code that would do nothing.
  if not exists (select 1 from public.pair_members m where m.pair_id = p_pair and m.user_id = v_uid) then
    raise exception 'not your list' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pairs pr where pr.id = p_pair and pr.closed_at is not null) then
    -- Race-only and self-healing (the other member resumed while this screen was open). Safe to say
    -- honestly: membership is checked above, and a member can already read closed_at. Deliberately
    -- NOT the word "open": classifyPairError forks 42501 on the substring "not open", and a near
    -- miss there is a trap for the next reader.
    raise exception 'that list is already live' using errcode = '42501';
  end if;

  -- A pair killed by the abuse switch is NOT resumable, and must not be distinguishable from any
  -- other refusal here, or this becomes an oracle telling a reported user they were reported.
  if exists (select 1 from public.pairs pr where pr.id = p_pair and pr.disabled_at is not null) then
    raise exception 'not your list' using errcode = '42501';
  end if;

  -- The other member must still exist. If they used forget_pair, or deleted their account, there is
  -- nobody to hand a code to, and a solo list is not the model.
  select m.user_id into v_other
  from public.pair_members m
  where m.pair_id = p_pair and m.user_id <> v_uid
  limit 1;
  if v_other is null then
    -- The other member deleted their account or their membership, so prune_empty_pair froze this
    -- pair and left you as its only member. This is PERMANENT: join_pair requires closed_at is
    -- null and resume_pair requires existing membership, so nothing can ever add a second person
    -- to a frozen pair. It borrowed 23505 "full" before, which told a person who had just been
    -- left that a list containing one person was full. 42501 rather than a new code, so a stale
    -- client degrades to "This list is closed to changes", which is true of a list staying frozen;
    -- anything on 23505 degrades to "you already have a shared list, you can leave it", which is
    -- the worst available sentence here. Nothing is disclosed: the membership read already lets
    -- this caller see there is nobody else, and the client already computes partnerLabel as null.
    raise exception 'nobody left to resume with' using errcode = '42501';
  end if;

  -- Waking this list would put you over the live cap. Frozen lists cost no slot, so this only fires
  -- when you already have a LIVE list, which is the honest reason and matches errAlreadyPaired.
  if (select count(*) from public.pair_members m
        join public.pairs pr on pr.id = m.pair_id
       where m.user_id = v_uid and pr.closed_at is null) >= k_max_pairs then
    raise exception 'already in a shared list' using errcode = '23505';
  end if;

  select lower(btrim(u.email)) into v_other_email from auth.users u where u.id = v_other;
  if v_other_email is null or position('@' in v_other_email) = 0 then
    -- An account with no readable address cannot be bound to, and an unbound resume code would be
    -- a re-entry ticket anyone holding it could use. Refuse rather than weaken the binding.
    -- Folded onto the same line as "nobody left": from the reader's side it is the same fact, and
    -- it stops a screen with no email field on it ever saying an address looks wrong. Unreachable
    -- today anyway, since email OTP is the only sign-up path.
    raise exception 'nobody left to resume with' using errcode = '42501';
  end if;

  select coalesce(m.label, 'me') into v_label
  from public.pair_members m where m.pair_id = p_pair and m.user_id = v_uid;

  v_bytes := extensions.gen_random_bytes(k_len);
  for i in 0..k_len - 1 loop
    v_code := v_code || substr(k_alphabet, 1 + (get_byte(v_bytes, i) % length(k_alphabet)), 1);
  end loop;

  -- Supersede any outstanding resume code YOU minted, so one person tapping twice does not leave
  -- two live tickets. Scoped to the CALLER, not the pair: this is the first flow in the schema
  -- where BOTH members can mint into one pair, and a pair-wide supersede silently kills the code
  -- the app has already shown the other person, which then reads as invalid and burns their rate
  -- limit. Two people in one kitchen both tapping Resume is the likely case, not the exotic one.
  -- create_pair_invite's re-mint can be pair-scoped only because its branch runs while the caller
  -- is ALONE in the pair; this function's precondition is the opposite. Killing theirs buys
  -- nothing anyway: their code is bound to YOUR address and admits only YOU, an existing member.
  -- Pair-wide expiry belongs to the freeze, where leave_pair and prune_empty_pair already do it.
  -- Steady state is therefore at most ONE live code per member, each bound to the other.
  update public.pair_invites i set used_at = coalesce(i.used_at, now())
    where i.pair_id = p_pair and i.created_by = v_uid and i.used_at is null;

  delete from public.pair_invites i where i.expires_at < now() - interval '7 days';

  insert into public.pair_invites (code_hash, pair_id, created_by, created_label, invited_email_hash, expires_at)
  values (
    encode(extensions.digest(v_code, 'sha256'), 'hex'),
    p_pair, v_uid, v_label,
    encode(extensions.digest(v_other_email, 'sha256'), 'hex'),
    now() + k_ttl
  );

  return query select v_code, now() + k_ttl;
end;
$$;

revoke all on function public.invite_to_resume(uuid) from public, anon;
grant execute on function public.invite_to_resume(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Redeeming one.
--
-- Deliberately a SEPARATE function from join_pair rather than a widening of it. join_pair's consume
-- predicate requires `closed_at is null`, and that clause is load-bearing: it is what stops an old
-- invite admitting a stranger to a household that has since ended. Relaxing it there would put the
-- resume case and the stranger case behind one predicate, which is exactly the kind of shared
-- condition that gets loosened later by someone who does not know why it is tight.
--
-- The consume statement here carries FOUR conditions the original does not have to: the redeemer
-- must already be a member of this pair (so a leaked code admits nobody new), the pair must be
-- frozen rather than live or killed, the code must be unused and unexpired, and the address must
-- match. All four sit inside the single UPDATE, so none of them can be skipped by a null.
-- ---------------------------------------------------------------------------

create or replace function public.resume_pair(p_code text)
returns table (pair_id uuid, partner_label text, pair_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  k_attempts_per_hour constant int := 10;   -- per account, WRONG GUESSES only, same as join_pair
  k_max_pairs constant int := 1;
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_pair uuid;
  v_label text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if (select count(*) from public.pair_join_attempts a
      where a.user_id = v_uid and a.attempted_at > now() - interval '1 hour') >= k_attempts_per_hour then
    raise exception 'too many attempts, try later' using errcode = '54000';
  end if;

  -- Byte-identical normalisation to join_pair, or a perfectly-typed code hashes to something the
  -- database has never seen. 0 and 1 are NOT stripped: a wrong character should fail honestly.
  -- ABOVE the cap check, because the idempotent branch below reads it and a null hash would match
  -- nothing, silently.
  v_hash := encode(extensions.digest(
    upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');

  -- Idempotent, exactly as join_pair, and ABOVE the cap check for the same reason it sits there.
  -- Once a resume has succeeded the pair is LIVE and the caller is a member, so without this the
  -- cap fires first and answers a SUCCESSFUL retry with "you already have a shared list, you can
  -- leave it" on the most loaded surface in the product, to somebody who has just got back a list
  -- with their person. The advisory lock is transaction-scoped, so a double tap is enough, and a
  -- lost PostgREST response on a flaky connection is the case this branch exists for.
  --
  -- It writes NOTHING and requires closed_at IS NULL, so it can never resume anything: a frozen
  -- pair falls straight through to the real handshake below and the never-unilateral law is
  -- untouched. Bounded by expiry, so a long-dead code is not a free success. The label comes from
  -- pair_members and not from i.created_label, or the MINTER hitting this branch would be shown
  -- their own name as their partner's.
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

  if (select count(*) from public.pair_members m
        join public.pairs pr on pr.id = m.pair_id
       where m.user_id = v_uid and pr.closed_at is null) >= k_max_pairs then
    raise exception 'already in a shared list' using errcode = '23505';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;

  update public.pair_invites i
     set used_at = now()
   where i.code_hash = v_hash
     and i.used_at is null
     and i.expires_at > now()
     and i.invited_email_hash = encode(extensions.digest(v_email, 'sha256'), 'hex')
     and exists (select 1 from public.pair_members m
                 where m.pair_id = i.pair_id and m.user_id = v_uid)
     -- The OTHER member said yes up to 24 hours ago, when their side had no live list, and nothing
     -- has re-read them since. Waking this list changes THEIR live count as well as yours, and the
     -- advisory locks in both functions are keyed on the CALLER, so they serialise nothing across
     -- two people. Without this: B leaves, A mints a resume code, A then starts a fresh list with
     -- someone else (create_pair_invite's probe sees only live pairs, finds none, and its
     -- new-pair branch carries no invite supersede at all), B redeems within the day, and A now
     -- holds TWO live pairs against a cap of one. loadMyPairs gives the live slot to the newest
     -- join and puts only frozen pairs in the archive, so the woken list renders NOWHERE in A's
     -- app: B writes into it freely, A cannot read it, rename it, or reach its Leave control, and
     -- A is permanently blocked from every future pairing because each cap counts two.
     --
     -- In the predicate rather than a raise, for two reasons: a raise would be an oracle telling a
     -- redeemer that the person who left them has since started a list with somebody else, and
     -- zero rows is already this function's calm "that code is not valid". used_at stays null, so
     -- the code still works once their other list ends. Accepted cost: the refusal spends one of
     -- the redeemer's ten hourly attempts. Every reference is alias-qualified deliberately, since
     -- pair_id is an OUT parameter of this function and a bare one is a 42702 at runtime.
     and not exists (
       select 1
       from public.pair_members om
       join public.pair_members ot on ot.user_id = om.user_id
       join public.pairs opr on opr.id = ot.pair_id
       where om.pair_id = i.pair_id
         and om.user_id <> v_uid
         and ot.pair_id <> i.pair_id
         and opr.closed_at is null
     )
     and exists (select 1 from public.pairs pr
                 where pr.id = i.pair_id and pr.closed_at is not null and pr.disabled_at is null)
  returning i.pair_id, i.created_label into v_pair, v_label;

  -- NO RAISE ON THIS PATH, for the same reason join_pair has none: a raise rolls the transaction
  -- back and takes the attempt row with it, so the throttle would record nothing but successes and
  -- never fire. Zero rows back IS "that code is not valid", the one line the client renders for
  -- wrong, expired, used, not-yours, live-already and killed alike.
  if v_pair is null then
    delete from public.pair_join_attempts a where a.attempted_at < now() - interval '1 hour';
    insert into public.pair_join_attempts (user_id) values (v_uid);
    return;
  end if;

  -- The list wakes. ZERO ROWS MOVE: every task, every completion stamp and every tombstone is
  -- exactly where it was, which is the whole point of having frozen rather than copied.
  update public.pairs set closed_at = null where id = v_pair;

  select pr.name into v_name from public.pairs pr where pr.id = v_pair;

  return query select v_pair, v_label, v_name;
end;
$$;

revoke all on function public.resume_pair(text) from public, anon;
grant execute on function public.resume_pair(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Closing the wrong door that section 2 just made reachable.
--
-- This migration mints the FIRST invite in the schema that is unused, unexpired and points at a
-- FROZEN pair. join_pair's CONSUME statement refuses those, which is the whole argument for
-- resume_pair being its own function. But join_pair has a SECOND path, the idempotent branch, whose
-- only conditions were hash, expiry and membership, and a resume code's redeemer is a member of
-- that pair BY CONSTRUCTION. So every resume code satisfied it, for either party, every time, and
-- typing one into the frozen card's "Join instead" returned a full success row over a list that was
-- still closed: nothing consumed, nothing cleared, and the screen reading "sharing with Sam".
--
-- Restated VERBATIM from ours.sql, which carries the same fix, because this file must be applyable
-- on its own against a database holding Phase 1's version. The two must not drift. No drop needed:
-- the signature and RETURNS TABLE shape are unchanged, so create-or-replace preserves the ACLs.
-- ---------------------------------------------------------------------------

create or replace function public.join_pair(p_code text, p_my_label text)
returns table (pair_id uuid, partner_label text, pair_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  k_max_pairs constant int := 1;             -- LIVE lists only, see the join below
  k_attempts_per_hour constant int := 10;    -- per account, WRONG GUESSES only
  k_global_per_hour constant int := 5000;    -- runaway backstop, not the primary defence. The
                                             -- email binding is what makes the code space
                                             -- unwalkable; this only stops a distributed spray.
                                             -- Deliberately high: a low ceiling would let a few
                                             -- throwaway accounts lock out every real user.
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_pair uuid;
  v_label text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

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

  -- Strip whatever the code was DISPLAYED with: the design renders it as K7M-P4Q, so btrim alone
  -- would fail a perfectly-typed code. A whitelist, not a [-\s] blacklist, so a pasted
  -- non-breaking hyphen or NBSP dies too. 0 and 1 are NOT stripped: someone who typed 0 for O
  -- should fail honestly rather than have a character silently deleted.
  v_hash := encode(extensions.digest(
    upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');

  -- Idempotent: already a member of this code's pair, succeed quietly, so a lost response never
  -- reads as "this code has been used". Bounded by expiry, because that window is seconds and an
  -- unbounded branch would make a long-dead code a free success forever.
  select i.pair_id into v_pair
  from public.pair_invites i
  where i.code_hash = v_hash and i.expires_at > now() and public.is_pair_member(i.pair_id)
    -- Liveness, byte-identical to the consume statement below. Phase 5 (ours-resume.sql) mints the
    -- first invite that can point at a FROZEN pair, and a resume code's redeemer is a member of
    -- that pair BY CONSTRUCTION, so without this the branch hands back a full success row that
    -- consumes no code, clears no closed_at and changes nothing, while the screen reads "sharing
    -- with Sam" over a list that is still closed. Written inline and NOT as is_pair_writable(),
    -- even though the helper is exact here, because the consume below CANNOT use it (the joiner is
    -- not a member yet) and a call to it four lines above that comment invites someone to "make it
    -- consistent" and break joining outright. Also closes the same false success on a killed pair,
    -- which is reachable today.
    and exists (select 1 from public.pairs pr
                where pr.id = i.pair_id and pr.closed_at is null and pr.disabled_at is null);
  if v_pair is not null then
    select m.label into v_label from public.pair_members m
      where m.pair_id = v_pair and m.user_id <> v_uid limit 1;
    select pr.name into v_name from public.pairs pr where pr.id = v_pair;
    return query select v_pair, v_label, v_name;
    return;
  end if;

  if (select count(*) from public.pair_members m
        join public.pairs pr on pr.id = m.pair_id
       where m.user_id = v_uid and pr.closed_at is null) >= k_max_pairs then
    raise exception 'already in a shared list' using errcode = '23505';
  end if;

  -- Verify and consume in ONE statement, with the email binding and the pair's liveness IN the
  -- predicate. Three things that were separate checks and are now unforgeable:
  --   1. a wrong-address attempt can no longer CONSUME the invite, so a stranger's guess cannot
  --      burn the real invitee's code,
  --   2. a null account email can never match, where a separate `v_invited <> v_email` check
  --      evaluated to NULL and an IF waved it straight through,
  --   3. an invite can never admit anyone to a pair that is frozen or killed, so flipping
  --      disabled_at by hand locks the door behind it.
  -- The exists() is inline DELIBERATELY and must NOT be replaced with is_pair_writable(): that
  -- helper now requires membership, and the joiner is not a member yet. Swapping it in breaks
  -- joining outright.
  update public.pair_invites i
     set used_at = now()
   where i.code_hash = v_hash
     and i.used_at is null
     and i.expires_at > now()
     and i.invited_email_hash = encode(extensions.digest(v_email, 'sha256'), 'hex')
     and exists (select 1 from public.pairs pr
                 where pr.id = i.pair_id and pr.closed_at is null and pr.disabled_at is null)
  returning i.pair_id, i.created_label into v_pair, v_label;

  -- NO RAISE ON THIS PATH. It is the only guessing path, and a raise aborts the transaction, which
  -- takes the attempt row with it and leaves both ceilings permanently at zero: the throttle would
  -- record nothing but successes and never fire. Zero rows back IS "that code is not valid", the
  -- single line the client renders for wrong, expired, used, not-yours and killed alike.
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

  -- Read AFTER the insert, so this is a member reading their own list's name and not a definer
  -- function handing a stranger the name of a household they failed to get into.
  select pr.name into v_name from public.pairs pr where pr.id = v_pair;

  return query select v_pair, v_label, v_name;
end;
$$;

revoke all on function public.join_pair(text, text) from public, anon;
grant execute on function public.join_pair(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3a. Letting removed words age out.
--
-- Melroy, 2026-08-09: redact at 30 days. Removal on a shared list sets deleted_at and keeps the
-- title, the pull re-fetches every tombstone by design, and nothing anywhere deletes one, so
-- "remove" currently means "stop rendering" while the words stay on both devices and here forever.
--
-- REDACTS THE TITLE, does not delete the row. A hard delete cannot ship until a cached row can say
-- "the server has seen this", because until then a task created offline is indistinguishable from
-- one that was swept, and the client would resurrect it.
--
-- Crucially it does NOT touch updated_at. That is what makes both devices adopt the redaction on
-- their next pull without either of them pushing the old title back: the row is not "newer", so
-- reconcile's tie resolves to the remote copy, which is the redacted one.
--
-- Gated on membership rather than writability, which is right for `closed_at`: frozen lists are
-- swept DELIBERATELY, or it would no-op on exactly the lists that have been sitting longest. That
-- argument does NOT extend to `disabled_at`, and silently taking it along was a real hole: this is
-- the only member-callable statement in either file that destroys content, the function is SECURITY
-- DEFINER so `shared_tasks_update_member` (and the `disabled_at` clause inside `is_pair_writable`)
-- never runs, and a reported account could otherwise blank the case file after the switch was
-- thrown. `ours.sql` calls the kill switch "one clause in the write path" and the architecture doc
-- promises a thirty-second response; both are load-bearing for Apple 1.2 and Play UGC review.
--
-- THE TWO FLAGS ARE NOT INTERCHANGEABLE. Frozen: swept. Killed: never. Accepted cost, bounded: a
-- killed pair's removed words never age out, and both members can still drop their membership,
-- which cascades the whole pair away.
-- ---------------------------------------------------------------------------

create or replace function public.sweep_shared_tombstones(p_pair uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  k_horizon constant interval := interval '30 days';  -- comfortably past Phase 5's 7-day Restore
  k_redacted constant text := '.';                    -- the CHECK forbids an empty title
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.pair_members m where m.pair_id = p_pair and m.user_id = v_uid) then
    raise exception 'not your list' using errcode = '42501';
  end if;

  update public.shared_tasks t
     set title = k_redacted
   where t.pair_id = p_pair
     and t.deleted_at is not null
     and t.deleted_at < now() - k_horizon
     and t.title <> k_redacted    -- idempotent, and keeps updated_at untouched on a second run
     -- A predicate rather than a raise, for two of this file's own reasons. A member who used to
     -- get a count and now gets a 42501 has learned the list was reported, which is exactly the
     -- oracle invite_to_resume refuses to be. And if this is ever called on pull, a raise
     -- reintroduces the defect the Phase 3 audit recorded, where a 42501 on a frozen pair pinned a
     -- device at its last sync under copy promising nothing is lost.
     and exists (select 1 from public.pairs pr
                 where pr.id = t.pair_id and pr.disabled_at is null);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sweep_shared_tombstones(uuid) from public, anon;
grant execute on function public.sweep_shared_tombstones(uuid) to authenticated;

-- 3b. Normalise anything already carrying a backdated stamp, BEFORE any sweep caller is wired. Ours is
-- still behind ours_allowlist so this is tester data at most, but do not assume it.
--
-- THE ORDER IS LOAD-BEARING: this must run ABOVE the create-or-replace below, while ours.sql's old
-- body (which ignores deleted_at entirely) is still live. The new body pins deleted_at to OLD on
-- every UPDATE, including this one, so run afterwards it takes the `else old.deleted_at` arm,
-- reports rows updated, and changes nothing. Triggers fire for postgres in the SQL editor and DDL
-- is visible to later statements in the same transaction, so this is not theoretical.
--
-- Self-limiting on a re-run, deliberately: run 2 meets the new trigger and no-ops, which is the
-- RIGHT answer, because by then every stamp is server-set and a second reset would push genuine
-- 30-day-old tombstones out of the sweep's reach forever. Do NOT make it order-independent by
-- disabling the trigger around it: that works by making it repeatable, which quietly breaks the
-- retention promise on every future apply.
update public.shared_tasks
   set deleted_at = now()
 where deleted_at is not null and deleted_at < now() - interval '30 days';

-- ---------------------------------------------------------------------------
-- 3c. The retention clock becomes the SERVER's.
--
-- The sweep above reads `deleted_at` as a MAGNITUDE, which nothing did before this migration, and
-- `ours.sql` said so out loud when it exempted the column from its clamps. That sentence is no
-- longer true, and leaving it unclamped turns a client-written column into a permanent delete
-- button: one PATCH setting 1970 collapses the thirty-day horizon to zero.
--
-- The version needing no attacker is the one that matters. The clock correction is inert in
-- production (nothing calls applyServerTime yet), so `nowMs()` is the raw device clock, and this
-- schema already concedes that honest phones have wrong ones, which is why the other three clamps
-- exist. A device more than thirty days slow removes a task, the monotonic lift makes the push win,
-- and `deleted_at` rides in raw. The first sweep then permanently redacts a task removed one minute
-- ago, INSIDE the seven-day Restore window, and the same wrong stamp had already hidden the row
-- from "Recently removed" so there was never a Restore to reach for.
--
-- The whole body is restated rather than patched, because a create-or-replace that drops the
-- `created_by` pin, the `pair_id` pin or the three clamps loses them silently, which is precisely
-- the class the Phase 1 review caught twice. Read it back afterwards.
-- ---------------------------------------------------------------------------

create or replace function public.stamp_shared_task_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();          -- the client's value is ignored, never trusted
    if new.deleted_at is not null then
      new.deleted_at := now();             -- a row that arrives already removed starts its clock now
    end if;
  else
    new.pair_id := old.pair_id;            -- a row can never walk into another household
    -- Authorship is immutable, with ONE hole left open on purpose: a null must pass through,
    -- because created_by's `on delete set null` is implemented as an UPDATE and fires this
    -- trigger during delete_account(). Blocking it would either put a deleted user's identifier
    -- back or fail erasure outright with a 23503.
    if new.created_by is not null and new.created_by is distinct from old.created_by then
      new.created_by := old.created_by;
    end if;
    -- The retention clock. A null still passes through untouched, so Restore and the null /
    -- not-null contract the client relies on are unchanged. Coalescing to OLD is what stops a
    -- re-pushed tombstone, and the sweep's own UPDATE, from walking the horizon forward so nothing
    -- ever ages out. Free win: it can no longer be stamped in the FUTURE either, which was an
    -- unbounded way to keep a tombstone out of the sweep forever. Accepted cost: a task created and
    -- removed while offline has its horizon stamped at sync time, which can only move destruction
    -- later, never earlier.
    new.deleted_at := case
      when new.deleted_at is null then null      -- restore, always allowed
      when old.deleted_at is null then now()     -- the moment the server saw the removal
      else old.deleted_at                        -- immutable once stamped
    end;
  end if;

  -- No row may be stamped more than a day in the future. Unchanged from ours.sql, and restated here
  -- only because the whole body has to be.
  new.updated_at := least(new.updated_at, now() + interval '1 day');
  new.created_at := least(new.created_at, now() + interval '1 day');
  if new.done_at is not null then
    new.done_at := least(new.done_at, now() + interval '1 day');
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- POST-APPLY READ-BACKS. Run these before any client work.
--
--   -- 1. All three functions exist, with the shapes the client expects.
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          pg_get_function_result(p.oid) as returns
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('invite_to_resume', 'resume_pair', 'sweep_shared_tombstones')
--   order by 1;
--   -- expect exactly 3 rows.
--
--   -- 2. None of them is executable by anon.
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_run
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('invite_to_resume', 'resume_pair', 'sweep_shared_tombstones');
--   -- expect anon_can_run = false on all three.
--
--   -- 3. join_pair still refuses closed and killed pairs, in BOTH of its paths: the idempotent
--   --    branch and the consume statement. COUNTED, not LIKE'd. The bare phrase "closed_at is
--   --    null" also appears in that function's live-pair cap, so a LIKE returns true on a database
--   --    where the door has already been opened, and would sign off on the exact regression this
--   --    file exists to prevent.
--   select (select count(*) from regexp_matches(pg_get_functiondef(p.oid),
--             'closed_at is null and pr\.disabled_at is null', 'g')) = 2 as still_tight
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'join_pair';
--   -- expect true.
--
--   -- 4. The trigger rewrite did not silently drop anything it inherited, AND actually installed
--   --    the Phase 5 retention clock. The last clause is the load-bearing one: the three
--   --    inherited assertions are all satisfied by the OLD body, so without it this returns true
--   --    on a database where the clock was never installed or was reverted by a re-run of
--   --    ours.sql.
--   select pg_get_functiondef(p.oid) like '%new.created_by := auth.uid()%'
--      and pg_get_functiondef(p.oid) like '%new.pair_id := old.pair_id%'
--      and (select count(*) from regexp_matches(pg_get_functiondef(p.oid), 'least\(', 'g')) = 3
--      and pg_get_functiondef(p.oid) like '%else old.deleted_at%'
--        as trigger_intact
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'stamp_shared_task_origin';
--   -- expect true.
--
-- BEHAVIOURAL CHECKS, with two test accounts. The catalog queries above assert shape; these assert
-- what the functions actually DO, which is where every defect in the review of this file lived.
--
--   e. A and B paired, A leaves. B calls invite_to_resume, A redeems: pairs.closed_at is null.
--      A calls resume_pair with the SAME code again: same row back, no error, closed_at still null.
--   f. A and B on a frozen pair, BOTH call invite_to_resume. Two rows in pair_invites with
--      used_at null, and A's code still redeems as B. (Before the fix, B's mint killed A's code.)
--   g. B leaves P. A mints a resume code, then calls create_pair_invite for C and C joins. B now
--      redeems the resume code: it must fail CALMLY and P must still be frozen. (Before the fix, A
--      ended up in two live pairs, one of which A's own app could neither render nor leave.)
--   h. With pairs.disabled_at set by hand and a tombstone older than 30 days,
--      sweep_shared_tombstones returns 0 and the title is unchanged. Clear disabled_at: returns 1.
--      NOTE THE SETUP, because section 3c makes an old tombstone unmanufacturable by ordinary SQL,
--      which is the whole point of it: no INSERT or UPDATE can leave deleted_at in the past. So the
--      test row needs the same wrapper as the remedy in read-back 5, and this is the only way the
--      sweep will ever be testable at all, which is worth knowing about the one member-callable
--      statement in either file that destroys content:
--        begin;
--        alter table public.shared_tasks disable trigger shared_tasks_stamp_origin;
--        update public.shared_tasks set deleted_at = now() - interval '31 days' where id = '<test>';
--        alter table public.shared_tasks enable trigger shared_tasks_stamp_origin;
--        commit;
--   i. A resume code typed into join_pair returns zero rows, and closed_at is unchanged.
--
--   -- 5. No tombstone is left beyond the horizon before any sweep is wired.
--   select count(*) from public.shared_tasks where deleted_at < now() - interval '30 days';
--   -- expect 0. If it is NOT 0, the normalise above ran against the NEW trigger (ours.sql was
--   -- re-applied first, or this file was run twice) and those rows are now immutable by ordinary
--   -- SQL. Remedy ONCE, deliberately, never on a schedule:
--   --   begin;
--   --   alter table public.shared_tasks disable trigger shared_tasks_stamp_origin;
--   --   update public.shared_tasks set deleted_at = now()
--   --     where deleted_at is not null and deleted_at < now() - interval '30 days';
--   --   alter table public.shared_tasks enable trigger shared_tasks_stamp_origin;
--   --   commit;
--   -- One transaction, so the lock blocks concurrent writes rather than leaving a window in which
--   -- a client write lands unclamped.
-- ---------------------------------------------------------------------------
