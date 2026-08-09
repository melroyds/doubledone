-- DoubleDone: Ours, PHASE 3.5. Changing the name your person sees you by.
--
-- Applies AFTER supabase/ours.sql and supabase/ours-resume.sql. Idempotent: safe to run twice.
-- PASTE THIS FILE ALONE, like the last one. It adds one function and touches nothing else.
--
-- DO NOT APPLY UNTIL REVIEWED. Every SQL file in this feature has been, and the two that were not
-- reviewed hard enough came back with eight and four defects respectively.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A FUNCTION AND NOT A POLICY
--
-- `pair_members` has a select policy and a delete-self policy and deliberately NO update policy.
-- That absence is a security control, not an oversight: it is what stops either person editing the
-- OTHER person's row, and `ours.sql` says so where the column is declared. Adding an update policy
-- to let you edit your own row would mean writing a predicate that has to get `user_id = auth.uid()`
-- right forever, on a table where getting it wrong lets one partner rewrite how the other is named
-- on their own home screen.
--
-- A definer function scoped to auth.uid() in its WHERE clause cannot be widened by accident: there
-- is no policy to loosen, and the scope is one line in one place. Same shape as rename_pair.
--
-- The design (design-source/ours-design-round2.md) puts this on the management screen behind the
-- shared list's header line.
-- ---------------------------------------------------------------------------

create or replace function public.rename_self(p_pair uuid, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- is_pair_writable is membership-scoped, so this one line covers "not yours", "frozen" and
  -- "killed", and tells a non-member nothing about whether the list exists.
  --
  -- REFUSING ON A FROZEN LIST IS DELIBERATE, and matches rename_pair. A freeze stops every write,
  -- and the name you had is part of what the list WAS: changing how you are labelled inside a
  -- closed relationship is editing a record rather than updating a name.
  if not public.is_pair_writable(p_pair) then
    raise exception 'not your list' using errcode = '42501';
  end if;

  -- An EMPTY label is refused rather than coalesced, and this is the interesting decision.
  --
  -- The other two writers of this column coalesce an empty label to the word 'me', which is fine
  -- for the person who typed it and reads absurdly on the OTHER person's screen ("Sharing with
  -- me"). Storing NULL instead is worse: `loadMyPairs` derives partnerLabel from the other member's
  -- row, so a null there is indistinguishable from having no partner at all, and the screen falls
  -- back to "waiting for someone to join" over a list somebody is actively using.
  --
  -- So the only safe answer is to refuse, and to make the client stop it before it gets here. The
  -- client-side derivation is being fixed in the same change to key on whether a member EXISTS
  -- rather than on whether they have a label, so this is belt and braces rather than the only guard.
  v_label := nullif(btrim(left(btrim(coalesce(p_label, '')), 40)), '');
  if v_label is null then
    raise exception 'a name is required' using errcode = '22023';
  end if;

  update public.pair_members
     set label = v_label
   where pair_id = p_pair and user_id = v_uid;   -- the scope, in one place, unwidenable
end;
$$;

revoke all on function public.rename_self(uuid, text) from public, anon;
grant execute on function public.rename_self(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- POST-APPLY READ-BACKS.
--
--   -- 1. It exists, with the shape the client expects, and anon cannot run it.
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          pg_get_function_result(p.oid) as returns,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_run
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'rename_self';
--   -- expect one row: (p_pair uuid, p_label text) -> void, anon_can_run false.
--
--   -- 2. pair_members STILL has no update policy. This function exists so that it never needs
--   --    one, so if a policy has appeared, something has taken the other route as well.
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename = 'pair_members' and cmd = 'UPDATE';
--   -- expect 0.
--
-- BEHAVIOURAL, with two test accounts:
--   a. A renames themselves on a live pair. B's next read shows the new name. A's OWN label
--      changes and B's does not.
--   b. A calls it with B's pair but A is not a member: refused.
--   c. A calls it on a FROZEN pair: refused, and the stored label is unchanged.
--   d. A calls it with an empty string, and with 41 characters of whitespace: refused both times,
--      and the stored label is unchanged. Nothing is ever left null.
--   e. A calls it with 60 characters: stored at exactly 40, no error.
-- ---------------------------------------------------------------------------
