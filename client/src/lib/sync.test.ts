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
  it('is true for a foreign-key violation (the user row is gone)', () => {
    expect(isAccountGone({ code: '23503', message: 'violates foreign key constraint' })).toBe(true);
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

  it('round-trips a full task (due, recurrence, completedDates, tombstone)', () => {
    const t: Task = {
      id: 'b',
      title: 'Stretch',
      done: true,
      createdAt: 1718000000000,
      updatedAt: 1718000005000,
      due: '2026-06-20',
      recurrence: { kind: 'daily' } as Recurrence,
      completedDates: ['2026-06-18', '2026-06-19'],
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
