-- Ours, the bridges: one additive column on public.tasks.
--
-- PASTE THIS FILE ALONE into the Supabase SQL editor. It does not touch ours.sql or
-- ours-resume.sql and it does not need them; those files own the shared list, this one owns the
-- single field on YOUR OWN tasks that remembers a task came from one.
--
-- What it is: when you bring a row from a shared list over to your Today, your copy carries
-- 'pairId/sharedTaskId' so the two stay joined. That is what makes your tick close both, what
-- draws the faint "· Ours" on your copy and nowhere else, and what lets your copy leave your day
-- quietly (never into your Lookback) when it gets handled on Ours instead.
--
-- Why it is safe on a live table with real subscribers:
--   · Additive and nullable. Every existing row keeps working, unchanged, with shared_ref null.
--   · RLS is UNTOUCHED. This is an ordinary column on a row its owner already owns; the existing
--     "own rows only" policies cover it exactly as they cover title.
--   · It holds NO second person's data. It records which of YOUR tasks came from a shared list,
--     never anything the other person wrote, and never who did what. A task that has not crossed
--     a bridge stays null forever.
--   · Older app builds ignore a column they do not know about, so this can be applied before the
--     client that writes it ships.
--
-- Mirrored into supabase/schema.sql, which stays the readable description of the live shape.

alter table public.tasks
  add column if not exists shared_ref text;

-- Read-back. Expect exactly one row: shared_ref | text | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks' and column_name = 'shared_ref';
