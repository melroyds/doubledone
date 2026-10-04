-- "Where you left off", and the three fields that were device-local: four additive columns on
-- public.tasks (2026-10-04).
--
-- PASTE THIS FILE ALONE into the Supabase SQL editor, BEFORE the app that writes these ships: the app
-- sends every column on every upsert, so until the live table has them every signed-in push fails.
-- Then run `python scripts/check-migrations.py` and see all four reported present.
--
-- What they are:
--   · left_off      the owner's own one line for coming back to a task, { text, writtenOn }, with the
--                   calendar day it was written. Never selected by the REST API or MCP (api.ts / mcp.ts
--                   name their columns), never copied onto a shared list.
--   · open_parent   true on a "Make it tiny" real task, false on a breakdown. Until now it lived only on
--                   the device that made the task tiny, so another device's tick of the tiny step could
--                   not know what it was.
--   · parent_title  a tiny step's real task's title, for its "A tiny step toward" line on every device.
--   · combined_from the record of what Combine folded into a task ({ id, title }[]).
--
-- Why it is safe on a live table with real subscribers:
--   · Additive and nullable. Every existing row keeps working, unchanged, with all four null.
--   · RLS is UNTOUCHED. These are ordinary columns on a row its owner already owns; the existing "own
--     rows only" policies cover them exactly as they cover title.
--   · No CHECK constraints, on purpose: one rejected row aborts a whole batch upsert. The app validates
--     what it reads instead (lib/leftoff cleanLeftOff, sync.ts rowToTask).
--   · Older app builds never name these columns, so their upserts leave them untouched.
--   · Pre-column values are seeded by the merge's tie rule (sync-merge.ts SEEDED_FIELDS) on each
--     device's first sync after this.
--
-- Mirrored into supabase/schema.sql, which stays the readable description of the live shape.

alter table public.tasks
  add column if not exists left_off jsonb,
  add column if not exists open_parent boolean,
  add column if not exists parent_title text,
  add column if not exists combined_from jsonb;

-- Read-back. Expect exactly four rows:
--   combined_from | jsonb   | YES
--   left_off      | jsonb   | YES
--   open_parent   | boolean | YES
--   parent_title  | text    | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks'
  and column_name in ('left_off', 'open_parent', 'parent_title', 'combined_from')
order by column_name;
