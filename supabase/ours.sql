-- DoubleDone: Ours, the shared partner list. PHASE 1, the foundation.
--
-- Architecture: docs/shared-lists.md · the adversarial argument: docs/shared-lists-review.md
-- Sequence: docs/ours-build-plan.md
--
-- Kept in its OWN file, and public.tasks' policies are NOT touched. That separation is the
-- load-bearing decision of the whole feature: a mistake in a widened policy on `tasks` would
-- expose PERSONAL tasks, the one thing this product promises never to leak. A mistake in here
-- can only ever expose data that was already shared with one chosen person.
--
-- Apply in the Supabase SQL editor. Idempotent: safe to run more than once.
--
-- NOTHING IN THE CLIENT READS ANY OF THIS YET. Phase 1 ships ahead of the code that uses it,
-- per the `skipped_dates` / `big` precedent, because sync's row mapping emits every field
-- unconditionally and a client that sends an unknown column fails the whole push.
--
-- INHERITED RULE, restated because it is easy to lose: there is deliberately NO trigger that
-- sets updated_at = now(). Sync resolves conflicts by comparing updated_at and the client
-- sends the authoritative value. Two accounts writing one row is the case personal sync never
-- had to survive, which is why phase 3 gives both devices ONE clock (server_now() below)
-- rather than trusting two.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- The pair: exactly two people, no owner, no admin, no roles.
-- ---------------------------------------------------------------------------

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  closed_at timestamptz,        -- set when someone leaves: the list FREEZES (reads stay, writes stop).
                                -- Zero rows ever move on unpair; nothing is copied and nothing is lost.
  disabled_at timestamptz       -- the abuse kill switch, flipped BY HAND in the dashboard on a valid
                                -- report. One clause in the write policy; no moderation code, no
                                -- service_role key, "timely response" becomes thirty seconds.
);

-- Membership IS the RLS anchor. The composite key means a user may belong to MANY pairs and
-- only never twice to the same one, so the 1:many shape (one list per relationship) needs no
-- migration later: the cap lives in join_pair() as a named constant, not in the schema.
create table if not exists public.pair_members (
  pair_id uuid not null references public.pairs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,                   -- a SELF-chosen short name, typed at pairing, scoped to this pair,
                                -- dead when the pair is. Never an email: no user's email, phone or
                                -- account identifier is ever rendered to another user, anywhere.
  joined_at timestamptz not null default now(),
  primary key (pair_id, user_id)
);
create index if not exists pair_members_user on public.pair_members (user_id);

-- Invites. Written and read ONLY by the two functions below; the client never touches this
-- table (RLS on, zero policies, the same posture as ai_calls).
create table if not exists public.pair_invites (
  code_hash text primary key,   -- sha256 of the plaintext code. The plaintext is returned once,
                                -- to the creator, and never stored.
  pair_id uuid not null references public.pairs (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_label text not null,  -- the creator's self-chosen name, shown to the joiner AFTER joining
  invited_email text not null,  -- the code is BOUND to one address (Melroy, 2026-08-09). A mistyped
                                -- code then simply fails instead of handing a stranger a place in
                                -- your household. Nothing is disclosed by this: the creator already
                                -- knows the address they typed, and the joiner is never shown one.
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists pair_invites_pair on public.pair_invites (pair_id);

-- The shared tasks themselves.
--
-- NOTE WHAT IS ABSENT: there is no done_by column, and there never will be. The never-shame law
-- says a per-person tally must be impossible to COMPUTE, and this product's own standard (set by
-- Routines, which has no streak anywhere in its data) is that such a thing must not exist in the
-- shape of the data, not merely go unrendered. At two people the column would buy no privacy
-- anyway: if it was not me, it was you.
create table if not exists public.shared_tasks (
  id text not null,             -- client-minted, same shape as tasks.id
  pair_id uuid not null references public.pairs (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  done boolean not null default false,
  done_at timestamptz,          -- a TIME, not a person
  recurrence jsonb,             -- the same Recurrence object the personal engine already renders
  completed_dates jsonb,        -- an UNATTRIBUTED set of dates. Merged as a grow-only union, so two
                                -- people ticking the bins from two phones converge. Never per-person,
                                -- or the model itself becomes the chore ledger the laws outlaw.
  created_by uuid references auth.users (id) on delete set null,
                                -- SET NULL, deliberately. Cascade would gut the other person's
                                -- living list when someone deletes their account; no-action would
                                -- make erasure fail outright. This keeps the words and removes the
                                -- name, so delete_account() needs no change at all.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,       -- tombstone, same convention as tasks
  primary key (pair_id, id)     -- so an id collision can never cross two households
);
create index if not exists shared_tasks_pair_updated on public.shared_tasks (pair_id, updated_at);

-- The link home for a task pulled onto a personal Today. BOTH columns: a shared task's id is
-- unique only within its pair (see the primary key above), so the id alone is ambiguous the
-- moment anyone belongs to two lists.
alter table public.tasks add column if not exists shared_id text;
alter table public.tasks add column if not exists shared_pair_id uuid;

-- ---------------------------------------------------------------------------
-- The build-time gate (temporary).
--
-- While Ours is being built, only the addresses in here may create a shared list. Populated BY
-- HAND in the Supabase dashboard, never in this repo, which is public: nobody's email belongs
-- in source control. RLS on with zero policies, so no client can read the list of testers.
-- Removing the gate at launch is: drop the check in create_pair_invite, drop this table.
-- ---------------------------------------------------------------------------

create table if not exists public.ours_allowlist (
  email text primary key,
  added_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS. Membership is read through ONE definer helper, so no policy ever queries the table it
-- is defined on (a membership policy ON pair_members is a 42P17 infinite-recursion error).
-- ---------------------------------------------------------------------------

create or replace function public.is_pair_member(p uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.pair_members m
    where m.pair_id = p and m.user_id = auth.uid()
  );
$$;

-- Whether a pair currently accepts writes: not frozen by a leaver, not disabled for abuse.
create or replace function public.is_pair_writable(p uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.pairs pr
    where pr.id = p and pr.closed_at is null and pr.disabled_at is null
  );
$$;

alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.pair_invites enable row level security;
alter table public.shared_tasks enable row level security;
alter table public.ours_allowlist enable row level security;

-- pairs: members may read their own pair. Nobody inserts or updates directly; both happen
-- inside the definer functions below.
drop policy if exists "pairs_select_member" on public.pairs;
create policy "pairs_select_member" on public.pairs
  for select using (public.is_pair_member(id));

-- pair_members: you may read the membership of pairs you are in (that is how you learn your
-- person's chosen label), and you may delete only your OWN row (that is Leave).
--
-- THERE IS DELIBERATELY NO INSERT POLICY AND NO UPDATE POLICY. That absence is the security
-- control: if the client could insert here, any account could add itself to any pair by id,
-- which would make the invite code decorative and let a removed ex walk back in with one POST.
drop policy if exists "pair_members_select_member" on public.pair_members;
create policy "pair_members_select_member" on public.pair_members
  for select using (public.is_pair_member(pair_id));
drop policy if exists "pair_members_delete_self" on public.pair_members;
create policy "pair_members_delete_self" on public.pair_members
  for delete using (user_id = auth.uid());

-- pair_invites and ours_allowlist: RLS on, ZERO policies. No client can read or write either,
-- ever; only the definer functions below touch them.

-- shared_tasks: membership to read, membership AND a writable pair to change anything.
drop policy if exists "shared_tasks_select_member" on public.shared_tasks;
create policy "shared_tasks_select_member" on public.shared_tasks
  for select using (public.is_pair_member(pair_id));
drop policy if exists "shared_tasks_insert_member" on public.shared_tasks;
create policy "shared_tasks_insert_member" on public.shared_tasks
  for insert with check (public.is_pair_member(pair_id) and public.is_pair_writable(pair_id));
drop policy if exists "shared_tasks_update_member" on public.shared_tasks;
create policy "shared_tasks_update_member" on public.shared_tasks
  for update using (public.is_pair_member(pair_id) and public.is_pair_writable(pair_id))
  with check (public.is_pair_member(pair_id) and public.is_pair_writable(pair_id));
-- No delete policy: removal is a tombstone (deleted_at), never a hard delete, so a removal
-- can propagate to the other device instead of a row silently reappearing on the next pull.

-- ---------------------------------------------------------------------------
-- The pair when nobody is left. A trigger rather than logic inside one function, so it holds
-- for EVERY exit path (leave, account deletion, a future third person) rather than only the
-- path someone remembered to update.
-- ---------------------------------------------------------------------------

create or replace function public.prune_empty_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.pair_members m where m.pair_id = old.pair_id) then
    delete from public.pairs where id = old.pair_id;  -- cascades to invites and shared_tasks
  end if;
  return old;
end;
$$;

drop trigger if exists pair_members_prune on public.pair_members;
create trigger pair_members_prune
  after delete on public.pair_members
  for each row execute function public.prune_empty_pair();

-- ---------------------------------------------------------------------------
-- ONE clock for two devices.
--
-- Personal sync could trust the client's updated_at because one person owned both devices. The
-- moment a second account writes the same row, the faster phone wins every conflict forever and
-- invisibly. The client reads this once per sync and carries the skew, rather than the server
-- overwriting timestamps (which would break last-write-wins outright).
-- ---------------------------------------------------------------------------

create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now(); $$;

revoke all on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;

-- ---------------------------------------------------------------------------
-- Creating an invite.
--
-- The code is generated HERE, never by the client: the client is not trusted for entropy. Only
-- the hash is stored, and the plaintext is returned exactly once.
-- ---------------------------------------------------------------------------

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
  k_max_pairs constant int := 1;   -- the 1:many cap. Raising it is changing this number.
  v_uid uuid := auth.uid();
  v_email text;
  v_code text := '';
  v_bytes bytea;
  v_pair uuid;
  i int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  -- The build-time gate. Delete this block and the table to open Ours to everyone.
  if not exists (select 1 from public.ours_allowlist a where a.email = v_email) then
    raise exception 'ours is not open yet' using errcode = '42501';
  end if;

  if (select count(*) from public.pair_members m where m.user_id = v_uid) >= k_max_pairs then
    raise exception 'already in a shared list' using errcode = '23505';
  end if;

  if p_invited_email is null or position('@' in p_invited_email) = 0 then
    raise exception 'an email is required' using errcode = '22023';
  end if;
  if lower(p_invited_email) = v_email then
    raise exception 'that is your own address' using errcode = '22023';
  end if;

  insert into public.pairs default values returning id into v_pair;
  insert into public.pair_members (pair_id, user_id, label)
    values (v_pair, v_uid, coalesce(nullif(btrim(p_my_label), ''), 'me'));

  v_bytes := extensions.gen_random_bytes(k_len);
  for i in 0..k_len - 1 loop
    v_code := v_code || substr(k_alphabet, 1 + (get_byte(v_bytes, i) % length(k_alphabet)), 1);
  end loop;

  insert into public.pair_invites (code_hash, pair_id, created_by, created_label, invited_email, expires_at)
  values (
    encode(extensions.digest(v_code, 'sha256'), 'hex'),
    v_pair, v_uid,
    coalesce(nullif(btrim(p_my_label), ''), 'me'),
    lower(btrim(p_invited_email)),
    now() + k_ttl
  );

  return query select v_code, v_pair, now() + k_ttl;
end;
$$;

revoke all on function public.create_pair_invite(text, text) from public, anon;
grant execute on function public.create_pair_invite(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Redeeming one.
--
-- Everything happens in one transaction, and the invite is consumed by a SINGLE conditional
-- update: a select-then-update would reopen single-use as a race between two fast taps.
-- ---------------------------------------------------------------------------

create table if not exists public.pair_join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists pair_join_attempts_recent on public.pair_join_attempts (user_id, attempted_at);
alter table public.pair_join_attempts enable row level security;  -- zero policies: functions only

create or replace function public.join_pair(p_code text, p_my_label text)
returns table (pair_id uuid, partner_label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  k_max_pairs constant int := 1;
  k_attempts_per_hour constant int := 10;    -- per account
  k_global_per_hour constant int := 500;     -- a ceiling on the whole system, so the code space
                                             -- cannot be walked even with many accounts
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_pair uuid;
  v_invited text;
  v_label text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  if (select count(*) from public.pair_join_attempts a
      where a.user_id = v_uid and a.attempted_at > now() - interval '1 hour') >= k_attempts_per_hour then
    raise exception 'too many attempts, try later' using errcode = '54000';
  end if;
  if (select count(*) from public.pair_join_attempts a
      where a.attempted_at > now() - interval '1 hour') >= k_global_per_hour then
    raise exception 'too many attempts, try later' using errcode = '54000';
  end if;
  insert into public.pair_join_attempts (user_id) values (v_uid);

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  v_hash := encode(extensions.digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex');

  -- Idempotent: if this caller is ALREADY in the pair this code belongs to, succeed quietly, so
  -- a lost response never reads to the user as "this code has been used".
  select i.pair_id into v_pair
  from public.pair_invites i
  where i.code_hash = v_hash and public.is_pair_member(i.pair_id);
  if v_pair is not null then
    select m.label into v_label from public.pair_members m
      where m.pair_id = v_pair and m.user_id <> v_uid limit 1;
    return query select v_pair, v_label;
    return;
  end if;

  if (select count(*) from public.pair_members m where m.user_id = v_uid) >= k_max_pairs then
    raise exception 'already in a shared list' using errcode = '23505';
  end if;

  -- Verify and consume in ONE statement.
  update public.pair_invites i
     set used_at = now()
   where i.code_hash = v_hash
     and i.used_at is null
     and i.expires_at > now()
  returning i.pair_id, i.invited_email, i.created_label into v_pair, v_invited, v_label;

  if v_pair is null then
    raise exception 'that code is not valid' using errcode = '22023';
  end if;

  -- The code is bound to one address.
  if v_invited <> v_email then
    raise exception 'that code is not valid' using errcode = '22023';
  end if;

  if (select count(*) from public.pair_members m where m.pair_id = v_pair) >= 2 then
    raise exception 'that list is full' using errcode = '23505';
  end if;

  insert into public.pair_members (pair_id, user_id, label)
    values (v_pair, v_uid, coalesce(nullif(btrim(p_my_label), ''), 'me'));

  return query select v_pair, v_label;
end;
$$;

revoke all on function public.join_pair(text, text) from public, anon;
grant execute on function public.join_pair(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaving. The list FREEZES for both people: reads stay, writes stop, zero rows move.
-- Nothing is copied into anyone's personal list and nothing is destroyed; you take things
-- across one at a time with the pull gesture, when you can face it.
-- ---------------------------------------------------------------------------

create or replace function public.leave_pair(p_pair uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.pair_members m where m.pair_id = p_pair and m.user_id = v_uid) then
    raise exception 'not your list' using errcode = '42501';
  end if;

  update public.pairs set closed_at = coalesce(closed_at, now()) where id = p_pair;
  -- Any outstanding code dies with the relationship, or it is a live re-entry ticket for the
  -- next 24 hours.
  update public.pair_invites set used_at = coalesce(used_at, now())
    where pair_id = p_pair and used_at is null;
end;
$$;

revoke all on function public.leave_pair(uuid) from public, anon;
grant execute on function public.leave_pair(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Removing a frozen list from your side. Deletes only YOUR membership; the trigger above
-- disposes of the pair once the second person does the same.
-- ---------------------------------------------------------------------------

create or replace function public.forget_pair(p_pair uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.pair_members where pair_id = p_pair and user_id = auth.uid();
end;
$$;

revoke all on function public.forget_pair(uuid) from public, anon;
grant execute on function public.forget_pair(uuid) to authenticated;
