-- Ours: a shared row can carry a date.
--
-- PASTE THIS FILE ALONE into the Supabase SQL editor. It does not touch ours.sql, ours-resume.sql
-- or tasks-shared-ref.sql, and it does not need them.
--
-- WHY: the shared capture bar was thinner than Today's because a shared row could only hold a title
-- and a repeat. Melroy's own dogfood data proved the gap: he created a task called
-- "Census on August 11", typing the date into the title because there was nowhere else to put it.
-- With this column the WHEN door works on Ours the same way it does on Today.
--
-- Why it is safe on a live table:
--   · Additive and nullable. Every existing row keeps working, unchanged, with due null.
--   · RLS is UNTOUCHED. The existing pair-membership policies cover this column exactly as they
--     cover title. Nothing here widens who can read or write a row.
--   · Older app builds ignore a column they do not know about, so this can be applied before the
--     client that writes it ships. It MUST be applied first: the client emits every column
--     unconditionally on batch upsert, so a build writing `due` against a table without it would
--     fail every shared write.
--   · Text, not date, matching `tasks.due` exactly: 'YYYY-MM-DD' in the user's own local day, never
--     a timestamp. A shared list spans two people who may be in different timezones, and a date is
--     the one thing that must mean the same calendar square on both screens.
--
-- The length check is the same defensive shape as the rest of this table: a partner-controlled
-- value is never trusted to be well formed just because our client wrote it.

alter table public.shared_tasks
  add column if not exists due text check (due is null or char_length(due) = 10);

-- Read-back. Expect exactly one row: due | text | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'shared_tasks' and column_name = 'due';
