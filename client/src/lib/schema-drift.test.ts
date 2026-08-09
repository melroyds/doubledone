import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Two SQL files hold a copy of the same function, on purpose, and nothing in Postgres or in either
// file stops them drifting. This test is the only thing that does.
//
// WHY THERE ARE TWO. `supabase/ours.sql` is the whole schema and is re-runnable.
// `supabase/ours-resume.sql` is the Phase 5 migration and must apply STANDALONE against a database
// holding Phase 1's version, which is exactly what Melroy will do. So the fixed `join_pair` has to
// exist in both: in the migration so the fix actually lands, and in the schema so a later re-run of
// that self-declared-idempotent file cannot reinstate the old body. The third review pass verified
// they matched by hand; a hand check does not survive the next edit.
//
// THE DEFECT THIS GUARDS. `join_pair`'s idempotent branch must refuse closed and killed pairs.
// Without that clause, a resume code typed into the app's only code box returns a full success row
// over a list that is still frozen: nothing consumed, nothing cleared, and the screen reading
// "sharing with Sam".

const SQL_DIR = join(__dirname, '..', '..', '..', 'supabase');
const read = (name: string) => readFileSync(join(SQL_DIR, name), 'utf8');

/** Pull one `create or replace function` body out of a file, by name. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = sql.indexOf('\n$$;\n', start);
  expect(end, `${name} has no closing $$;`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('the two copies of join_pair', () => {
  const schema = read('ours.sql');
  const migration = read('ours-resume.sql');

  it('are byte-identical, so applying either file leaves the same function', () => {
    expect(functionBody(migration, 'join_pair')).toBe(functionBody(schema, 'join_pair'));
  });

  // The whole reason the copies exist. Stated as its own assertion so that if someone ever
  // legitimately diverges them, this still fails and says why.
  it('both refuse a closed or killed pair in BOTH paths', () => {
    for (const [name, sql] of [
      ['ours.sql', schema],
      ['ours-resume.sql', migration],
    ] as const) {
      const body = functionBody(sql, 'join_pair');
      const guards = body.match(/closed_at is null and pr\.disabled_at is null/g) ?? [];
      // One in the idempotent branch, one in the consume statement. A single occurrence means the
      // idempotent branch has lost its guard, which is the defect the third review found.
      expect(guards.length, `${name}: join_pair should guard both paths`).toBe(2);
    }
  });
});

describe('the two copies of the origin trigger', () => {
  // Same argument, and the more dangerous of the two: a re-run of ours.sql that reinstated the old
  // body would hand the retention clock back to the client while the sweep reads it as a duration,
  // which is a permanent delete button.
  it('both own deleted_at on the server rather than trusting the client', () => {
    for (const [name, sql] of [
      ['ours.sql', read('ours.sql')],
      ['ours-resume.sql', read('ours-resume.sql')],
    ] as const) {
      const body = functionBody(sql, 'stamp_shared_task_origin');
      expect(body, `${name}: the retention clock is missing`).toContain('else old.deleted_at');
      expect(body, `${name}: a row born deleted must start its clock now`).toContain('new.deleted_at := now()');
      // And nothing inherited was dropped in the restatement.
      expect(body).toContain('new.created_by := auth.uid()');
      expect(body).toContain('new.pair_id := old.pair_id');
      expect((body.match(/least\(/g) ?? []).length, `${name}: all three clamps`).toBe(3);
    }
  });
});
