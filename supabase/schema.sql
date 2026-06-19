-- DoubleDone: the `tasks` table + row-level security.
--
-- Source of truth for the schema that cloud sync targets. The live table was
-- created in the Supabase dashboard earlier in the build; this file is what to
-- diff it against and what to recreate it from. Apply in the Supabase SQL editor.
-- VERIFIED against live via PostgREST type probes on 2026-06-18: id text, title text,
-- done boolean, due text, recurrence json, completed_dates json, updated_at timestamptz,
-- deleted_at timestamptz. id is text (device ids like "t-abc-1", not UUIDs), so inserts
-- are safe. One drift: live created_at was bigint (epoch ms) while the sync mapping sends
-- ISO strings, so run the one-time migration at the bottom to make it timestamptz.
--
-- IMPORTANT (last-write-wins): there is deliberately NO trigger that sets
-- updated_at = now() on write. Sync resolves conflicts by comparing updated_at,
-- and the client sends the authoritative value. A now() trigger would clobber it
-- and silently break conflict resolution. created_at/updated_at are client-written.

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due text,                       -- 'YYYY-MM-DD' for a one-off; null = someday (live is text)
  recurrence jsonb,               -- the Recurrence object; null = one-off (live is json; both work)
  completed_dates jsonb,          -- array of ISO dates a recurring task was ticked (live is json)
  completed_at timestamptz,       -- when a one-off was finished (the calendar/Lookback record)
  complexity integer,             -- effort signal (decomposition minutes); weights the celebration
  slices jsonb,                   -- { total, done } for a task tracked across parts; null = whole task
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz          -- soft-delete tombstone; null = live
);

alter table public.tasks enable row level security;

-- Privacy by architecture: each user can see and write only their own rows.
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- Fast "all my rows" pulls.
create index if not exists tasks_user_id_idx on public.tasks (user_id);

-- ---------------------------------------------------------------------------
-- One-time migration. The live table predates this file and its created_at
-- drifted to bigint (epoch ms), which the sync mapping (ISO strings) cannot
-- write. Run this once in the Supabase SQL editor to align it. Safe on an
-- empty table; converts any existing epoch-ms values correctly.
-- ---------------------------------------------------------------------------
-- alter table public.tasks
--   alter column created_at type timestamptz using to_timestamp(created_at / 1000.0);
--
-- The live table had its PRIMARY KEY on the wrong column (not id), so upserts
-- (on_conflict=id) failed with 42P10, and a plain "add primary key (id)" failed with
-- 42P16 (a table can have only one PK). Drop whatever PK exists and make id the PK
-- (safe on the empty table; id is the client-generated identity):
-- do $$ declare pk text;
-- begin
--   select conname into pk from pg_constraint
--   where conrelid = 'public.tasks'::regclass and contype = 'p';
--   if pk is not null then execute format('alter table public.tasks drop constraint %I', pk); end if;
--   alter table public.tasks add primary key (id);
-- end $$;
--
-- D2 added the completion-record columns (run once; idempotent):
-- alter table public.tasks
--   add column if not exists completed_at timestamptz,
--   add column if not exists complexity integer;
--
-- Slices (task progress across parts) added the slices column (run once; idempotent):
-- alter table public.tasks
--   add column if not exists slices jsonb;

-- ---------------------------------------------------------------------------
-- ai_calls: pseudonymous AI-call telemetry (the moat). The Worker writes one
-- row per Claude call (decompose / strategise / triage) with its input, the
-- returned JSON, model, token usage and latency. DELIBERATELY no user_id, no IP:
-- this data is never tied to an account. Insert-only RLS, so the public anon key
-- the Worker writes with can add rows but nothing can read them back through the
-- API (analysis happens server-side / in the dashboard).
--
-- Privacy note: unlike the tasks table, this retains the task TEXT the user
-- typed. It is pseudonymous, but it is task content, so it must be disclosed
-- in-product before any public launch (see BUILD-PLAN Privacy and Security).
-- ---------------------------------------------------------------------------

create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,           -- 'decompose' | 'strategise' | 'triage'
  model text not null,              -- the Claude model id used
  input jsonb,                      -- the request input sent to Claude (task text / tasks / lines)
  output jsonb,                     -- the parsed returned JSON (steps / plan / items)
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
  -- NB: no user_id, on purpose.
);

alter table public.ai_calls enable row level security;

-- Insert-only for anyone (the Worker writes with the anon key). No select/update/
-- delete policy exists, so rows can never be read back through PostgREST.
create policy "ai_calls_insert_any" on public.ai_calls
  for insert with check (true);

-- Run once in the Supabase SQL editor to create the table above. The Worker also
-- needs SUPABASE_URL and SUPABASE_ANON_KEY set as secrets (see CLAUDE.md), then a
-- redeploy (`npx wrangler deploy` from server/). Until then the Worker just skips
-- logging (telemetry is optional, never blocks a user request).

-- ---------------------------------------------------------------------------
-- delete_account(): the right to erasure (Australian Privacy Principles /
-- GDPR-style). A signed-in user calls this from the client
-- (`supabase.rpc('delete_account')`) to hard-delete their account and all of
-- their data. SECURITY DEFINER so it can remove the auth.users row; scoped to
-- auth.uid() so a caller can only ever delete themselves. Their tasks rows are
-- removed automatically by the FK (tasks.user_id references auth.users(id) on
-- delete cascade). No service_role key is involved (that key is never used in
-- this project). `set search_path = ''` + fully-qualified names is the Supabase
-- security-definer hardening recommendation.
--
-- Idempotent (create or replace); run once in the Supabase SQL editor. EXECUTE
-- is granted only to authenticated, never to anon.
-- ---------------------------------------------------------------------------

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
