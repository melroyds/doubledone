-- Ours, open to everyone.
--
-- Melroy's call, 2026-08-13: "everybody at launch." Until now `create_pair_invite` refused any
-- caller whose email was not in `ours_allowlist`, a table populated BY HAND in the dashboard
-- because this repo is public. That was right for a two-household dogfood and is wrong the moment
-- the app tells anybody the feature exists: a person who reads the store listing, installs, and
-- tries to start a shared list would be refused with no way to fix it themselves.
--
-- NOTE the asymmetry that made this urgent rather than tidy: JOINING with a code was never gated,
-- only STARTING a list. So the gate refused exactly the person a store listing brings you, and let
-- through the person they invite.
--
-- APPLY THIS BEFORE, OR IN THE SAME SITTING AS, the merge that ships the store copy and the
-- onboarding step. The app will claim the feature exists; this is what makes that true.
--
-- Idempotent, and safe to run twice.

-- 1. The door on Today and in Settings. It gated the MENU ROW, so without this the feature stays
--    invisible even once invites work.
create or replace function public.ours_is_open()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select auth.uid() is not null;
$$;

revoke all on function public.ours_is_open() from public, anon;
grant execute on function public.ours_is_open() to authenticated;

-- 2. Creating an invite. This is the shipped function REPLAYED VERBATIM with the allowlist block
--    removed, nothing else touched. Every other guard (the advisory lock, the self-invite check,
--    the one-live-pair rule, the rate limit) is exactly as it was.
create or replace function public.create_pair_invite(p_invited_email text, p_my_label text, p_name text default null)
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
  k_max_pairs constant int := 1;    -- the 1:many cap, LIVE lists only. Raising it is this number,
                                    -- and the byte-identical one in join_pair.
  k_max_lists constant int := 25;   -- live + frozen. NOT a product limit, an abuse ceiling: once
                                    -- the cap counts live only, create/leave loops forever.
  v_uid uuid := auth.uid();
  v_email text;
  v_invited text := lower(btrim(coalesce(p_invited_email, '')));  -- normalise ONCE, use everywhere
  v_label text;
  v_name text;
  v_code text := '';
  v_bytes bytea;
  v_pair uuid;
  v_existing uuid;
  i int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Serialise this caller against themselves. The caps below are read-then-write and the primary
  -- key cannot backstop them by design (the 1:many shape must survive). Also stops a double-tapped
  -- create minting two pairs and two live codes, where the UI shows only the second and the first
  -- is unreachable by anything in the app. Transaction-scoped; the key expression is
  -- byte-identical in join_pair, because a create racing a join is a real interleaving.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;

  if position('@' in v_invited) = 0 then
    raise exception 'an email is required' using errcode = '22023';
  end if;
  -- Compared post-normalisation. Unnormalised, a trailing space from a mobile keyboard let a user
  -- invite THEMSELVES: they then redeemed their own code, the idempotent branch found no other
  -- member, and the client rendered a shared list with a null partner and no error anywhere.
  if v_invited = v_email then
    raise exception 'that is your own address' using errcode = '22023';
  end if;

  v_label := coalesce(nullif(btrim(left(btrim(p_my_label), 40)), ''), 'me');
  -- Empty stays NULL rather than becoming a word: NULL is "the app's own name for this", which each
  -- reader sees in their own language. Trimmed to the column's own ceiling so a long paste is a
  -- shorter name and never a constraint error thrown at someone naming their kitchen list.
  v_name := nullif(btrim(left(btrim(coalesce(p_name, '')), 40)), '');

  -- Re-mint rather than dead-end. The address is hashed and unreadable, so a mistyped invitee
  -- (which this design makes a NORMAL failure, not an exotic one) would otherwise be unrecoverable
  -- except by forget_pair, which hard-deletes the list in a product whose law is "leaving is one
  -- tap, and nothing is lost". Only ever for a live pair you are ALONE in: the moment someone has
  -- joined, this refuses, and the way out is Leave.
  select m.pair_id into v_existing
  from public.pair_members m
  join public.pairs pr on pr.id = m.pair_id
  where m.user_id = v_uid and pr.closed_at is null
  limit 1;

  if v_existing is not null then
    if (select count(*) from public.pair_members m where m.pair_id = v_existing) > 1 then
      raise exception 'already in a shared list' using errcode = '23505';
    end if;
    v_pair := v_existing;
    update public.pair_invites set used_at = coalesce(used_at, now())
      where pair_invites.pair_id = v_pair and used_at is null;
    update public.pair_members set label = v_label
      where pair_members.pair_id = v_pair and user_id = v_uid;
    -- The re-mint is the second run through the same form, so it carries the name too. coalesce
    -- keeps an existing one when this call passed none, so re-minting can never quietly un-name a
    -- list. Safe on this branch only, where nobody else has joined yet: renaming a list a second
    -- person is living in is rename_pair's job, further down.
    update public.pairs set name = coalesce(v_name, name) where id = v_pair;
  else
    if (select count(*) from public.pair_members m where m.user_id = v_uid) >= k_max_lists then
      raise exception 'too many old lists' using errcode = '54000';
    end if;
    insert into public.pairs (name) values (v_name) returning id into v_pair;
    insert into public.pair_members (pair_id, user_id, label) values (v_pair, v_uid, v_label);
  end if;

  v_bytes := extensions.gen_random_bytes(k_len);
  for i in 0..k_len - 1 loop
    v_code := v_code || substr(k_alphabet, 1 + (get_byte(v_bytes, i) % length(k_alphabet)), 1);
  end loop;

  -- Self-maintaining retention, so nothing accumulates by intention alone. Note the alias:
  -- unqualified `expires_at` would be AMBIGUOUS against this function's OUT parameter (42702).
  delete from public.pair_invites i where i.expires_at < now() - interval '7 days';

  insert into public.pair_invites (code_hash, pair_id, created_by, created_label, invited_email_hash, expires_at)
  values (
    encode(extensions.digest(v_code, 'sha256'), 'hex'),
    v_pair, v_uid, v_label,
    encode(extensions.digest(v_invited, 'sha256'), 'hex'),
    now() + k_ttl
  );

  return query select v_code, v_pair, now() + k_ttl;
end;
$$;

-- 3. The table itself. Dropped last, so a failure in step 2 leaves the gate intact rather than
--    half-open. CASCADE is deliberate: nothing references it once the function above is replaced.
drop table if exists public.ours_allowlist cascade;

-- Read-back. Expect true for any signed-in caller, and zero rows for the table.
select public.ours_is_open() as ours_is_open_for_me;
select count(*) as allowlist_tables_left
from information_schema.tables
where table_schema = 'public' and table_name = 'ours_allowlist';
