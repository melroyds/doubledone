import { type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { type Recurrence } from './recurrence';
import { isAccountGone, localBelongsToAnother, rowToTask, syncOnce, taskToRow, type TaskRow } from './sync';
import { type Task } from './tasks';

describe('localBelongsToAnother', () => {
  it('is false for anonymous local (no prior owner), so a first sign-in still migrates', () => {
    expect(localBelongsToAnother(null, 'user-b')).toBe(false);
  });
  it('is false when the local store already belongs to this user', () => {
    expect(localBelongsToAnother('user-a', 'user-a')).toBe(false);
  });
  it('is true when the local store belongs to a different user (never inherit it)', () => {
    expect(localBelongsToAnother('user-a', 'user-b')).toBe(true);
  });
});

describe('isAccountGone', () => {
  it('is true for a violation of the tasks.user_id foreign key (the user row is gone)', () => {
    expect(
      isAccountGone({
        code: '23503',
        message: 'insert or update on table "tasks" violates foreign key constraint "tasks_user_id_fkey"',
        details: 'Key (user_id)=(9f1c) is not present in table "users".',
      }),
    ).toBe(true);
  });

  // THE REGRESSION THIS EXISTS FOR (2026-08-09). The caller's response is destructive and
  // irreversible: today.tsx clears tasks, purges the R2 keepsakes, wipes local data and signs out.
  // While tasks.user_id was the schema's only foreign key, any 23503 could safely be read as
  // "account gone". The moment a second table with a user foreign key exists (shared lists), a
  // violation from THAT constraint would have destroyed a live user's history. The name is what
  // makes this check independent of everything the schema gains later.
  it('is FALSE for a 23503 from any other constraint, so an unrelated violation never wipes a live user', () => {
    expect(
      isAccountGone({
        code: '23503',
        message: 'insert or update on table "shared_tasks" violates foreign key constraint "shared_tasks_created_by_fkey"',
        details: 'Key (created_by)=(9f1c) is not present in table "users".',
      }),
    ).toBe(false);
    expect(isAccountGone({ code: '23503', message: 'violates foreign key constraint "pair_members_pair_id_fkey"' })).toBe(false);
  });

  it('is false for a 23503 whose constraint cannot be identified (fails safe, keeps the data)', () => {
    expect(isAccountGone({ code: '23503', message: 'violates foreign key constraint' })).toBe(false);
    expect(isAccountGone({ code: '23503' })).toBe(false);
  });

  it('is false for other Postgrest errors', () => {
    expect(isAccountGone({ code: 'PGRST116' })).toBe(false);
    expect(isAccountGone({ code: '42P01' })).toBe(false);
  });
  it('is false for a network error, null, or a codeless error', () => {
    expect(isAccountGone(new Error('Network request failed'))).toBe(false);
    expect(isAccountGone(null)).toBe(false);
    expect(isAccountGone({ message: 'no code here' })).toBe(false);
  });
});

describe('taskToRow / rowToTask', () => {
  it('round-trips a minimal task', () => {
    const t: Task = { id: 'a', title: 'Water plants', done: false, createdAt: 0, updatedAt: 1000 };
    expect(rowToTask(taskToRow(t, 'user-1'))).toEqual(t);
  });

  it('round-trips a pinned task, and an unpinned task never gains pinnedAt', () => {
    const pinned: Task = { id: 'p', title: 'Call the dentist', done: false, createdAt: 0, updatedAt: 1000, pinnedAt: 1718000000000 };
    expect(rowToTask(taskToRow(pinned, 'user-1'))).toEqual(pinned);
    const plain: Task = { id: 'q', title: 'Buy milk', done: false, createdAt: 0, updatedAt: 1000 };
    expect(rowToTask(taskToRow(plain, 'user-1'))).not.toHaveProperty('pinnedAt');
  });

  // The Ours bridge. A task that never crossed one must stay null forever, so an ordinary user's
  // rows carry no trace of a feature they do not use.
  it('round-trips a pulled copy, and a task that never crossed a bridge stays null', () => {
    const pulled: Task = { id: 'p', title: 'take the bins out', done: false, createdAt: 0, updatedAt: 1000, sharedRef: 'pair-1/bins' };
    expect(rowToTask(taskToRow(pulled, 'user-1'))).toEqual(pulled);

    const plain: Task = { id: 'q', title: 'Water the plants', done: false, createdAt: 0, updatedAt: 1000 };
    expect(taskToRow(plain, 'user-1').shared_ref).toBeNull();
    expect(rowToTask(taskToRow(plain, 'user-1'))).not.toHaveProperty('sharedRef');
  });

  it('round-trips a big task, and a plain task never gains big (a null / false column stays absent)', () => {
    const big: Task = { id: 'g', title: 'Do the tax return', done: false, createdAt: 0, updatedAt: 1000, big: true };
    expect(rowToTask(taskToRow(big, 'user-1'))).toEqual(big);
    const plain: Task = { id: 'h', title: 'Buy milk', done: false, createdAt: 0, updatedAt: 1000 };
    expect(taskToRow(plain, 'user-1').big).toBeNull();
    expect(rowToTask(taskToRow(plain, 'user-1'))).not.toHaveProperty('big');
    expect(rowToTask({ ...taskToRow(plain, 'user-1'), big: false })).not.toHaveProperty('big');
  });

  it('round-trips a full task (due, recurrence, completedDates, skippedDates, tombstone)', () => {
    const t: Task = {
      id: 'b',
      title: 'Stretch',
      done: true,
      createdAt: 1718000000000,
      updatedAt: 1718000005000,
      due: '2026-06-20',
      recurrence: { kind: 'daily' } as Recurrence,
      completedDates: ['2026-06-18', '2026-06-19'],
      skippedDates: ['2026-06-17'],
      completedAt: 1718000007000,
      complexity: 30,
      deletedAt: 1718000009000,
    };
    expect(rowToTask(taskToRow(t, 'user-1'))).toEqual(t);
  });

  it('round-trips a sliced task', () => {
    const t: Task = {
      id: 's',
      title: 'Watch the series',
      done: false,
      createdAt: 1718000000000,
      updatedAt: 1718000005000,
      slices: { total: 10, done: 3 },
    };
    expect(rowToTask(taskToRow(t, 'user-1'))).toEqual(t);
  });

  it('round-trips the decompose chain (a silent parent and a child step)', () => {
    const parent: Task = {
      id: 'p', title: 'Plan the party', done: false, createdAt: 1718000000000, updatedAt: 1718000005000,
      silentParent: true,
    };
    const child: Task = {
      id: 'c', title: 'Book the venue', done: false, createdAt: 1718000000000, updatedAt: 1718000005000,
      parentId: 'p',
    };
    expect(rowToTask(taskToRow(parent, 'user-1'))).toEqual(parent);
    expect(rowToTask(taskToRow(child, 'user-1'))).toEqual(child);
  });

  it('stamps user_id and nulls absent optionals on the row', () => {
    const row = taskToRow({ id: 'a', title: 'x', done: false, createdAt: 0, updatedAt: 0 }, 'u');
    expect(row.user_id).toBe('u');
    expect(row.due).toBeNull();
    expect(row.recurrence).toBeNull();
    expect(row.completed_dates).toBeNull();
    expect(row.skipped_dates).toBeNull();
    expect(row.completed_at).toBeNull();
    expect(row.complexity).toBeNull();
    expect(row.slices).toBeNull();
    expect(row.silent_parent).toBeNull();
    expect(row.parent_id).toBeNull();
    expect(row.deleted_at).toBeNull();
  });

  it('maps timestamps through ISO strings', () => {
    const row = taskToRow(
      { id: 'a', title: 'x', done: false, createdAt: 0, updatedAt: 1718000005000 },
      'u',
    );
    expect(row.created_at).toBe('1970-01-01T00:00:00.000Z');
    expect(Date.parse(row.updated_at)).toBe(1718000005000);
  });
});

describe('syncOnce', () => {
  function fakeClient(remote: TaskRow[]) {
    const upserts: TaskRow[][] = [];
    const client = {
      from: () => ({
        select: async () => ({ data: remote, error: null }),
        upsert: async (rows: TaskRow[]) => {
          upserts.push(rows);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    return { client, upserts };
  }

  it('migrates a local-only list into an empty account (pushes all, returns merged)', async () => {
    const local: Task[] = [
      { id: 'a', title: 'one', done: false, createdAt: 1, updatedAt: 1 },
      { id: 'b', title: 'two', done: false, createdAt: 2, updatedAt: 2 },
    ];
    const { client, upserts } = fakeClient([]);
    const merged = await syncOnce(client, local, 'u');
    expect(merged.map((t) => t.id)).toEqual(['a', 'b']);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('adopts a newer remote and pushes nothing back', async () => {
    const local: Task[] = [{ id: 'a', title: 'local', done: false, createdAt: 1, updatedAt: 10 }];
    const remote = [taskToRow({ id: 'a', title: 'remote', done: false, createdAt: 1, updatedAt: 20 }, 'u')];
    const { client, upserts } = fakeClient(remote);
    const merged = await syncOnce(client, local, 'u');
    expect(merged[0].title).toBe('remote');
    expect(upserts).toHaveLength(0);
  });

  it('pushes a locally-newer task', async () => {
    const local: Task[] = [{ id: 'a', title: 'local-new', done: false, createdAt: 1, updatedAt: 30 }];
    const remote = [taskToRow({ id: 'a', title: 'remote-old', done: false, createdAt: 1, updatedAt: 5 }, 'u')];
    const { client, upserts } = fakeClient(remote);
    const merged = await syncOnce(client, local, 'u');
    expect(merged[0].title).toBe('local-new');
    expect(upserts[0][0].title).toBe('local-new');
  });
});
