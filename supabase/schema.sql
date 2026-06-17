-- DoubleDone: the `tasks` table + row-level security.
--
-- Source of truth for the schema that cloud sync targets. The live table was
-- created in the Supabase dashboard earlier in the build; this file is what to
-- diff it against and what to recreate it from. Apply in the Supabase SQL editor.
-- Column NAMES here were confirmed against the live table via PostgREST; the
-- types/constraints below are the intended design, so verify them against live.
--
-- IMPORTANT (last-write-wins): there is deliberately NO trigger that sets
-- updated_at = now() on write. Sync resolves conflicts by comparing updated_at,
-- and the client sends the authoritative value. A now() trigger would clobber it
-- and silently break conflict resolution. created_at/updated_at are client-written.
--
-- IMPORTANT (id type): `id` is TEXT, because task ids are generated on-device
-- (e.g. "t-abc-1"), not UUIDs. If the live column is uuid, sync inserts will fail;
-- this is the first thing to verify.

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due date,                       -- 'YYYY-MM-DD' for a one-off; null = someday
  recurrence jsonb,               -- the Recurrence object; null = one-off
  completed_dates jsonb,          -- array of ISO dates a recurring task was ticked
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
