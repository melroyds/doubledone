-- DoubleDone: Ours, the shared partner list. PHASE 1, the foundation.
--
-- Architecture: docs/shared-lists.md · the argument behind it: docs/shared-lists-review.md
-- Sequence: docs/ours-build-plan.md · this file's own review: docs/ours-sql-review.md
--
-- Kept in its OWN file, and public.tasks' policies are NOT touched. That separation is the
-- load-bearing decision of the whole feature: a mistake in a widened policy on `tasks` would
-- expose PERSONAL tasks, the one thing this product promises never to leak. A mistake in here
-- can only ever expose data that was already shared with one chosen person.
--
-- Apply in the Supabase SQL editor. Idempotent: safe to run more than once.
--
-- APPLY TO A THROWAWAY PROJECT FIRST. This file has real defects when written by hand; the
-- version before review had eight, two of which silently disabled their own security controls.
-- A 42702 or a missing extension surfaces in ten seconds on a scratch project and in the middle
-- of a live apply otherwise. Then run the read-backs at the bottom.
--
-- ON A THROWAWAY PROJECT, RUN THIS FIRST, or the two `alter table public.tasks` lines below fail
-- with "relation public.tasks does not exist". It is a stub standing in for the live table, and
-- only the two columns those lines touch have to be real:
--
--   create table if not exists public.tasks (
--     id text primary key,
--     user_id uuid not null references auth.users (id) on delete cascade
--   );
--
-- Never run that on the real project. There, public.tasks already exists with all its data.
--
-- WHAT IS NOW-OR-NEVER: `create table if not exists` is a TOTAL NO-OP on a table that already
-- exists, including its inline CHECK constraints. So every column and every CHECK below must be
-- right on the FIRST apply. Function bodies are `create or replace` and cost nothing to revise.
--
-- NOTHING IN THE CLIENT READS ANY OF THIS YET. Phase 1 ships ahead of the code that uses it, per
-- the `skipped_dates` / `big` precedent, because sync's row mapping emits every field
-- unconditionally and a client that sends an unknown column fails the whole push.
--
-- INHERITED RULE, restated because it is easy to lose: there is deliberately NO trigger that
-- sets updated_at = now(). Sync resolves conflicts by comparing updated_at and the client sends
-- the authoritative value. Two accounts writing one row is the case personal sync never had to
-- survive, so the trigger below CLAMPS a far-future stamp rather than overwriting it, and phase
-- 3 gives both devices one clock (server_now()) rather than trusting two.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- The pair: exactly two people, no owner, no admin, no roles.
-- ---------------------------------------------------------------------------

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text check (name is null or char_length(name) between 1 and 40),
                                -- What this list is FOR, agreed once and identical on both phones,
                                -- because a household calls it one thing. NULL is the normal state
                                -- and not a missing value: it means "the app's own word", which
                                -- each reader then sees in their own language. Storing the literal
                                -- 'Ours' would freeze one household into one language forever, and
                                -- an Italian partner would read an English name for their own home.
  closed_at timestamptz,        -- the list is FROZEN (reads stay, writes stop). Set by leave_pair,
                                -- AND by the prune trigger when one member is left behind by any
                                -- other exit path. Zero rows ever move; nothing is copied and
                                -- nothing is lost.
  disabled_at timestamptz       -- the abuse kill switch, flipped BY HAND in the dashboard on a
                                -- valid report. One clause in the write path; no moderation code,
                                -- no service_role key, "timely response" becomes thirty seconds.
);

-- Membership IS the RLS anchor. The composite key means a user may belong to MANY pairs and only
-- never twice to the same one, so the 1:many shape (one list per relationship) needs no migration
-- later: the cap lives in the two functions as a named constant, not in the schema.
create table if not exists public.pair_members (
  pair_id uuid not null references public.pairs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text check (label is null or char_length(label) between 1 and 40),
                                -- a SELF-chosen short name, typed at pairing, scoped to this pair,
                                -- dead when the pair is. Never an email: no user's email, phone or
                                -- account identifier is ever rendered to another user, anywhere.
                                -- Capped because there is no UPDATE policy, so this string is
                                -- immutable for its whole life on someone else's home surface.
  joined_at timestamptz not null default now(),
  primary key (pair_id, user_id)
);
create index if not exists pair_members_user on public.pair_members (user_id);

-- Invites. Written and read ONLY by the functions below; the client never touches this table
-- (RLS on, zero policies, the same posture as ai_calls).
create table if not exists public.pair_invites (
  code_hash text primary key,   -- sha256 of the plaintext code. The plaintext is returned once,
                                -- to the creator, and never stored.
  pair_id uuid not null references public.pairs (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_label text not null check (char_length(created_label) between 1 and 40),
  invited_email_hash text not null,
                                -- sha256 of the lowercased, trimmed address. The code is BOUND to
                                -- one address (Melroy, 2026-08-09), so a mistyped code fails
                                -- instead of handing a stranger a place in your household. Hashed
                                -- because this column is only ever COMPARED, never returned or
                                -- rendered, and plaintext would leave every address every user
                                -- ever typed at rest here forever, including people who never
                                -- joined and have no account and no erasure path. Be honest about
                                -- the limit: an email hash is dictionary-reversible, so this is
                                -- pseudonymisation, not encryption. It defeats bulk harvest, a
                                -- support export, and a dashboard query pasted into a bug thread.
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
  id text not null check (char_length(id) between 1 and 64),
                                -- capped because a pulled shared task writes this value into
                                -- tasks.shared_id, so an unbounded partner-controlled id would
                                -- cross out of the shared table into the victim's personal rows.
  pair_id uuid not null references public.pairs (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  done boolean not null default false,
  done_at timestamptz,          -- a TIME, not a person
  recurrence jsonb check (recurrence is null or octet_length(recurrence::text) <= 4096),
  completed_dates jsonb check (completed_dates is null or octet_length(completed_dates::text) <= 65536),
                                -- an UNATTRIBUTED set of dates, merged as a grow-only union so two
                                -- people ticking the bins from two phones converge. Never
                                -- per-person, or the model becomes the chore ledger the laws
                                -- outlaw. The cap sits far above the legitimate curve (~5000 dates,
                                -- about 13 years of daily ticks) because it grows forever by design.
  created_by uuid references auth.users (id) on delete set null,
                                -- SET NULL, deliberately. Cascade would gut the other person's
                                -- living list when someone deletes their account; no-action would
                                -- make erasure fail outright. This keeps the words and removes the
                                -- name, so delete_account() needs no change at all. Server-stamped
                                -- by the trigger below: the client's value is never trusted.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,       -- tombstone, same convention as tasks
  primary key (pair_id, id)     -- so an id collision can never cross two households
);
create index if not exists shared_tasks_pair_updated on public.shared_tasks (pair_id, updated_at);

-- The link home for a task pulled onto a personal Today. BOTH columns: a shared task's id is
-- unique only within its pair (see the primary key above), so the id alone is ambiguous the
-- moment anyone belongs to two lists. Safe against the currently-shipped client: rowToTask builds
-- its Task explicitly and ignores unknown keys, and taskToRow omits them, so a push can never
-- null them.
alter table public.tasks add column if not exists shared_id text;
alter table public.tasks add column if not exists shared_pair_id uuid;

-- For a database that already took the first version of this file: `create table if not exists`
-- silently skips a table that exists, columns and CHECKs included, so the column above lands here
-- too. Harmless on a fresh apply, where it finds the column already there and does nothing.
alter table public.pairs add column if not exists name text
  check (name is null or char_length(name) between 1 and 40);

-- ---------------------------------------------------------------------------
-- The build-time gate (temporary).
--
-- While Ours is being built, only the addresses in here may create a shared list. Populated BY
-- HAND in the Supabase dashboard, never in this repo, which is public: nobody's email belongs in
-- source control. RLS on with zero policies, so no client can read the list of testers. Removing
-- the gate at launch is: drop the check in create_pair_invite, drop this table.
-- ---------------------------------------------------------------------------

create table if not exists public.ours_allowlist (
  email text primary key,
  added_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS. Membership is read through ONE definer helper, so no policy ever queries the table it is
-- defined on (a membership policy ON pair_members is a 42P17 infinite-recursion error).
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

create or replace function public.is_pair_writable(p uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  -- The caller test is DELIBERATE, do not "simplify" it out. This means "may I write to this
  -- pair", not "is this pair writable". Unscoped, it was a definer oracle any account could poll
  -- about any household it knew the id of: true while the list was alive, false once frozen, a
  -- relationship-state signal about a home the caller had been removed from, in the one feature
  -- whose threat model is domestic. exists() never returns null, so there is no null-in-policy
  -- pitfall.
  select public.is_pair_member(p) and exists (
    select 1 from public.pairs pr
    where pr.id = p and pr.closed_at is null and pr.disabled_at is null
  );
$$;

-- The GRANT is mandatory, not decorative: RLS policy expressions run with the CALLER's
-- privileges, so an authenticated user without EXECUTE gets "permission denied for function"
-- instead of a policy result, which would break every shared_tasks read and write.
revoke all on function public.is_pair_member(uuid), public.is_pair_writable(uuid) from public, anon;
grant execute on function public.is_pair_member(uuid), public.is_pair_writable(uuid) to authenticated;

alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.pair_invites enable row level security;
alter table public.shared_tasks enable row level security;
alter table public.ours_allowlist enable row level security;

-- pairs: members may read their own pair. Nobody inserts or updates directly; both happen inside
-- the definer functions below.
drop policy if exists "pairs_select_member" on public.pairs;
create policy "pairs_select_member" on public.pairs
  for select using (public.is_pair_member(id));

-- pair_members: you may read the membership of pairs you are in (that is how you learn your
-- person's chosen label), and you may delete only your OWN row (that is Leave).
--
-- THERE IS DELIBERATELY NO INSERT POLICY AND NO UPDATE POLICY. That absence is the security
-- control: if the client could insert here, any account could add itself to any pair by id, which
-- would make the invite code decorative and let a removed ex walk back in with one POST. A rename
-- feature, if ever wanted, is a definer RPC scoped to auth.uid(), never an UPDATE policy.
drop policy if exists "pair_members_select_member" on public.pair_members;
create policy "pair_members_select_member" on public.pair_members
  for select using (public.is_pair_member(pair_id));
drop policy if exists "pair_members_delete_self" on public.pair_members;
create policy "pair_members_delete_self" on public.pair_members
  for delete using (user_id = auth.uid());

-- pair_invites, ours_allowlist and pair_join_attempts: RLS on, ZERO policies. No client can read
-- or write any of them, ever; only the definer functions below touch them.

-- shared_tasks: membership to read, a writable pair to change anything.
drop policy if exists "shared_tasks_select_member" on public.shared_tasks;
create policy "shared_tasks_select_member" on public.shared_tasks
  for select using (public.is_pair_member(pair_id));
drop policy if exists "shared_tasks_insert_member" on public.shared_tasks;
create policy "shared_tasks_insert_member" on public.shared_tasks
  for insert with check (public.is_pair_writable(pair_id));
drop policy if exists "shared_tasks_update_member" on public.shared_tasks;
create policy "shared_tasks_update_member" on public.shared_tasks
  for update using (public.is_pair_writable(pair_id))
  with check (public.is_pair_writable(pair_id));
-- No delete policy: removal is a tombstone (deleted_at), never a hard delete, so a removal can
-- propagate to the other device instead of a row silently reappearing on the next pull.

-- ---------------------------------------------------------------------------
-- Authorship, household and clocks are SERVER-coerced, never client-accepted.
--
-- RLS cannot do this job: WITH CHECK sees only the NEW row, so it can test who you are but not
-- what the row WAS. Without this, either partner could POST a row stamped with the other's uuid
-- (created_by is the one attribution the product renders, and the only evidence a report can
-- carry), or move a row into another household by rewriting pair_id.
--
-- SECURITY INVOKER (the default) is correct here so auth.uid() is the caller's. A BEFORE ROW
-- trigger fires before RLS WITH CHECK, and supabase-js upsert routes through the UPDATE branch
-- with OLD as the existing row, so both paths land on the right answer.
-- ---------------------------------------------------------------------------

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
    -- because created_by's `on delete set null` is implemented as an UPDATE and fires this
    -- trigger during delete_account(). Blocking it would either put a deleted user's identifier
    -- back or fail erasure outright with a 23503. Residual, accepted: a member can BLANK
    -- authorship, which renders identically to a deleted account. A far smaller lie than "your
    -- partner wrote this", and the price of not fighting the foreign key. The client's shared row
    -- mapping must therefore never SEND created_by (omit the key entirely; a literal null blanks).
    if new.created_by is not null and new.created_by is distinct from old.created_by then
      new.created_by := old.created_by;
    end if;
  end if;

  -- No row may be stamped more than a day in the future. updated_at is client-authoritative BY
  -- DESIGN (the rule at the top of this file), which was safe while one person owned both devices
  -- and is not the moment a second account writes the same row: an unbounded stamp wins every
  -- last-write-wins comparison forever, so ONE patch could pin a tombstone your person can never
  -- restore. A CLAMP rather than a CHECK constraint, because a CHECK hard-fails an honest phone
  -- with a wrong clock and poisons the whole batch upsert with a 23514. A day rather than minutes
  -- because nowMs() carries no skew correction yet; server_now() is the read that fixes that.
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

-- ---------------------------------------------------------------------------
-- What happens when a member leaves, by ANY path.
--
-- A trigger rather than logic inside one function, so it holds for every exit: leave, account
-- deletion's cascade through auth.users, forget_pair(), and a direct DELETE under the delete-self
-- policy. Only leave_pair() freezes without deleting a membership, so the trigger never fires for
-- it and it does its own freezing.
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
  else
    -- One person left behind is a FROZEN list, never a live one-person list. Without this, an
    -- account deletion leaves the survivor adding "get milk for the baby" to a list with no second
    -- reader, indefinitely, because closed_at is the client's only signal and nothing set it.
    -- Expiring the invites closes the same 24h re-entry ticket leave_pair closes, which matters
    -- most here: a seat has just freed up while a code may still be live.
    -- ASSUMES N=2, which the functions enforce: at two people any departure ends the relationship.
    -- A third seat must revisit this branch, or one of three leaving freezes the other two.
    update public.pairs set closed_at = coalesce(closed_at, now()) where id = old.pair_id;
    update public.pair_invites set used_at = coalesce(used_at, now())
      where pair_id = old.pair_id and used_at is null;
  end if;
  return old;
end;
$$;

drop trigger if exists pair_members_prune on public.pair_members;
create trigger pair_members_prune
  after delete on public.pair_members
  for each row execute function public.prune_empty_pair();

revoke all on function public.prune_empty_pair() from public, anon;

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
-- Wrong-guess throttling. Only FAILED joins are recorded (see join_pair), which is what makes
-- both ceilings reachable at all and stops a successful pairing feeding a global lockout.
-- ---------------------------------------------------------------------------

create table if not exists public.pair_join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists pair_join_attempts_recent on public.pair_join_attempts (user_id, attempted_at);
alter table public.pair_join_attempts enable row level security;  -- zero policies: functions only

-- ---------------------------------------------------------------------------
-- "May I use this yet?"
--
-- Scoped to the CALLER and nothing else: it answers about you, never about an address you type, so
-- it is not a membership oracle for the allowlist. It exists because a door that offers a feature
-- the server will then refuse is a small lie, and this app does not tell them. When the gate comes
-- off at launch this function returns true for everyone and the door simply stops being gated.
-- ---------------------------------------------------------------------------

create or replace function public.ours_is_open()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.ours_allowlist a
    join auth.users u on lower(btrim(u.email)) = lower(btrim(a.email))
    where u.id = auth.uid()
  );
$$;

revoke all on function public.ours_is_open() from public, anon;
grant execute on function public.ours_is_open() to authenticated;

-- ---------------------------------------------------------------------------
-- Creating an invite.
--
-- The code is generated HERE, never by the client: the client is not trusted for entropy. Only
-- the hash is stored, and the plaintext is returned exactly once.
-- ---------------------------------------------------------------------------

-- The two-argument shape from the first version of this file must GO, not merely be replaced: a
-- third parameter with a default creates an OVERLOAD, and PostgREST then cannot tell which one a
-- named-argument call means, so every create would fail with an ambiguity error nobody could read.
drop function if exists public.create_pair_invite(text, text);

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

  -- The build-time gate. Normalised on the READ side, so it forgives an address already pasted
  -- into the dashboard with stray case or a trailing space. Delete this block and the table to
  -- open Ours to everyone.
  if not exists (select 1 from public.ours_allowlist a where lower(btrim(a.email)) = v_email) then
    raise exception 'ours is not open yet' using errcode = '42501';
  end if;

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

revoke all on function public.create_pair_invite(text, text, text) from public, anon;
grant execute on function public.create_pair_invite(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Redeeming one.
--
-- Everything happens in one transaction, and the invite is consumed by a SINGLE conditional
-- update: a select-then-update would reopen single-use as a race between two fast taps.
-- ---------------------------------------------------------------------------

-- Same reason as above, and one more: `create or replace` cannot change a RETURNS TABLE shape at
-- all (42P13), so the third output column needs the drop even without the overload problem.
drop function if exists public.join_pair(text, text);

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
  where i.code_hash = v_hash and i.expires_at > now() and public.is_pair_member(i.pair_id);
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
-- Renaming. A shared object, so either member may do it while the list is alive, and both see the
-- new name on their next read. Frozen lists refuse, because a freeze stops every write and a name
-- is no exception: what the list was called is part of what the list WAS.
--
-- A definer function rather than an UPDATE policy on `pairs`, so the table keeps zero write grants
-- and the only paths in stay countable on one hand. Clearing it back to NULL is allowed and means
-- "call it whatever the app calls it", in each reader's own language.
-- ---------------------------------------------------------------------------

create or replace function public.rename_pair(p_pair uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_pair_writable(p_pair) then
    -- is_pair_writable is membership-scoped, so this covers "not yours", "frozen" and "killed"
    -- with one line and tells a non-member nothing about whether the list exists.
    raise exception 'not your list' using errcode = '42501';
  end if;
  update public.pairs
     set name = nullif(btrim(left(btrim(coalesce(p_name, '')), 40)), '')
   where id = p_pair;
end;
$$;

revoke all on function public.rename_pair(uuid, text) from public, anon;
grant execute on function public.rename_pair(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaving. The list FREEZES for both people: reads stay, writes stop, zero rows move. Nothing is
-- copied into anyone's personal list and nothing is destroyed; you take things across one at a
-- time with the pull gesture, when you can face it. A frozen list costs you no slot, so leaving
-- never locks you out of ever sharing again.
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
  -- Any outstanding code dies with the relationship, or it is a live re-entry ticket for the next
  -- 24 hours.
  update public.pair_invites set used_at = coalesce(used_at, now())
    where pair_invites.pair_id = p_pair and used_at is null;
end;
$$;

revoke all on function public.leave_pair(uuid) from public, anon;
grant execute on function public.leave_pair(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Removing a frozen list from your side. Deletes only YOUR membership; the trigger above disposes
-- of the pair once the second person does the same. Destructive and deliberately so: these are
-- your own rows and you asked. The client owes this an UNDO rather than a confirm dialog.
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

-- ---------------------------------------------------------------------------
-- POST-APPLY READ-BACKS. Run these before any client work.
--
--   -- 1. The now-or-never CHECKs actually landed (they silently do NOT if a table pre-existed).
--   select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid in ('public.pair_members'::regclass, 'public.pair_invites'::regclass,
--                      'public.shared_tasks'::regclass)
--     and contype = 'c';
--
--   -- 2. pgcrypto is where this file expects it (else every digest call fails).
--   select extname, extnamespace::regnamespace from pg_extension where extname = 'pgcrypto';
--
--   -- 3. The email column is the HASH, not plaintext.
--   select column_name from information_schema.columns
--   where table_name = 'pair_invites' and column_name like 'invited%';
--
--   -- 4. No policy on the three closed tables, and none that inserts pair_members.
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public'
--     and tablename in ('pair_invites','ours_allowlist','pair_join_attempts','pair_members');
--
-- Then, with two signed-in test accounts:
--   a. 12 junk codes into join_pair → count(pair_join_attempts) = 10, and 54000 on the 11th.
--   b. A creates an invite for B; C attempts it → that invite's used_at is STILL NULL.
--   c. A creates, B joins, A leaves → A can call create_pair_invite again (the M5 assertion),
--      A can still SELECT the frozen shared_tasks, an INSERT into the frozen pair 42501s.
--   d. B deletes their account → the pair's closed_at is set, not null (the M4 assertion).
-- ---------------------------------------------------------------------------
