-- DoubleDone: Ours, PHASE 5. Waking a frozen list, and letting removed words age out.
--
-- Applies AFTER supabase/ours.sql. Idempotent: safe to run more than once.
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
    raise exception 'not your list' using errcode = '42501';
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
    raise exception 'that list is full' using errcode = '23505';  -- reuses the calm "cannot pair" line
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
    raise exception 'an email is required' using errcode = '22023';
  end if;

  select coalesce(m.label, 'me') into v_label
  from public.pair_members m where m.pair_id = p_pair and m.user_id = v_uid;

  v_bytes := extensions.gen_random_bytes(k_len);
  for i in 0..k_len - 1 loop
    v_code := v_code || substr(k_alphabet, 1 + (get_byte(v_bytes, i) % length(k_alphabet)), 1);
  end loop;

  -- Supersede any outstanding resume code for this pair, so only the newest one works. Same shape
  -- as create_pair_invite's re-mint: a person who taps twice must not leave two live tickets.
  update public.pair_invites set used_at = coalesce(used_at, now())
    where pair_invites.pair_id = p_pair and used_at is null;

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

  if (select count(*) from public.pair_members m
        join public.pairs pr on pr.id = m.pair_id
       where m.user_id = v_uid and pr.closed_at is null) >= k_max_pairs then
    raise exception 'already in a shared list' using errcode = '23505';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;

  -- Byte-identical normalisation to join_pair, or a perfectly-typed code hashes to something the
  -- database has never seen. 0 and 1 are NOT stripped: a wrong character should fail honestly.
  v_hash := encode(extensions.digest(
    upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');

  update public.pair_invites i
     set used_at = now()
   where i.code_hash = v_hash
     and i.used_at is null
     and i.expires_at > now()
     and i.invited_email_hash = encode(extensions.digest(v_email, 'sha256'), 'hex')
     and exists (select 1 from public.pair_members m
                 where m.pair_id = i.pair_id and m.user_id = v_uid)
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
-- 3. Letting removed words age out.
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
-- Gated on membership rather than writability, or it would silently no-op on exactly the frozen
-- lists that have been sitting there longest.
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
     and t.title <> k_redacted;   -- idempotent, and keeps updated_at untouched on a second run

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sweep_shared_tombstones(uuid) from public, anon;
grant execute on function public.sweep_shared_tombstones(uuid) to authenticated;

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
--   -- 3. join_pair still refuses closed pairs. This is the clause resume_pair exists so as NOT to
--   --    weaken, so if it has gone, something has widened the wrong function.
--   select pg_get_functiondef(p.oid) like '%closed_at is null%' as still_tight
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'join_pair';
--   -- expect true.
-- ---------------------------------------------------------------------------
