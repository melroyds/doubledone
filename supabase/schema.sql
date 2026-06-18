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
