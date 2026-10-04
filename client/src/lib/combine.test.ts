import { describe, expect, it } from 'vitest';

import { combineTasks, earliestDue, eligibleForCombine } from './combine';
import { type Task } from './tasks';

// Minimal task builder; title defaults to the id.
function mk(over: Partial<Task> & { id: string }): Task {
  return { title: over.id, done: false, createdAt: 0, updatedAt: 0, ...over };
}

describe('eligibleForCombine', () => {
  it('accepts a plain open one-off', () => {
    expect(eligibleForCombine(mk({ id: 'a' }))).toBe(true);
  });
  it('rejects a done task', () => {
    expect(eligibleForCombine(mk({ id: 'a', done: true }))).toBe(false);
  });
  it('rejects a soft-deleted task', () => {
    expect(eligibleForCombine(mk({ id: 'a', deletedAt: 5 }))).toBe(false);
  });
  it('rejects a recurring task', () => {
    expect(eligibleForCombine(mk({ id: 'a', recurrence: { kind: 'daily' } }))).toBe(false);
  });
});

describe('earliestDue', () => {
  it('takes the soonest of dated tasks', () => {
    expect(earliestDue([{ due: '2026-06-20' }, { due: '2026-06-18' }])).toBe('2026-06-18');
  });
  it('counts an undated task as the earliest (lands on Today, no deadline)', () => {
    expect(earliestDue([{ due: null }, { due: '2026-06-20' }])).toBe(null);
  });
  it('is null when every task is undated', () => {
    expect(earliestDue([{ due: null }, { due: undefined }])).toBe(null);
  });
  it('keeps a single date', () => {
    expect(earliestDue([{ due: '2026-06-20' }])).toBe('2026-06-20');
  });
});

describe('combineTasks', () => {
  const NOW = 1000;

  it('Case A: folds standalone tasks into one umbrella at the earliest due date', () => {
    const tasks = [mk({ id: 'a', due: '2026-06-20' }), mk({ id: 'b', due: '2026-06-18' }), mk({ id: 'c' })];
    const { umbrella, next } = combineTasks(tasks, ['a', 'b'], 'Do the thing', NOW, 'u1');

    expect(umbrella.id).toBe('u1');
    expect(umbrella.title).toBe('Do the thing');
    expect(umbrella.due).toBe('2026-06-18');
    expect(umbrella.combinedFrom).toEqual([
      { id: 'a', title: 'a' },
      { id: 'b', title: 'b' },
    ]);
    expect(next.find((t) => t.id === 'a')?.deletedAt).toBe(NOW);
    expect(next.find((t) => t.id === 'b')?.deletedAt).toBe(NOW);
    expect(next.find((t) => t.id === 'c')?.deletedAt).toBeUndefined();
    expect(next.find((t) => t.id === 'u1')).toBeTruthy();
  });

  it('Case B: tombstones a silent parent once all its children are folded away', () => {
    const tasks = [
      mk({ id: 'p', silentParent: true }),
      mk({ id: 's1', parentId: 'p' }),
      mk({ id: 's2', parentId: 'p' }),
    ];
    const { next } = combineTasks(tasks, ['s1', 's2'], 'Umbrella', NOW, 'u1');
    expect(next.find((t) => t.id === 's1')?.deletedAt).toBe(NOW);
    expect(next.find((t) => t.id === 's2')?.deletedAt).toBe(NOW);
    expect(next.find((t) => t.id === 'p')?.deletedAt).toBe(NOW);
  });

  it('Case C: leaves a silent parent that still has a live child', () => {
    const tasks = [
      mk({ id: 'p', silentParent: true }),
      mk({ id: 's1', parentId: 'p' }),
      mk({ id: 's2', parentId: 'p' }),
      mk({ id: 's3', parentId: 'p' }),
    ];
    const { next } = combineTasks(tasks, ['s1', 's2'], 'Umbrella', NOW, 'u1');
    expect(next.find((t) => t.id === 'p')?.deletedAt).toBeUndefined();
    expect(next.find((t) => t.id === 's3')?.deletedAt).toBeUndefined();
  });

  it("Case C/mixed: combines a standalone task with one of a parent's children", () => {
    const tasks = [
      mk({ id: 'free' }),
      mk({ id: 'p', silentParent: true }),
      mk({ id: 's1', parentId: 'p' }),
      mk({ id: 's2', parentId: 'p' }),
    ];
    const { next } = combineTasks(tasks, ['free', 's1'], 'Umbrella', NOW, 'u1');
    expect(next.find((t) => t.id === 'free')?.deletedAt).toBe(NOW);
    expect(next.find((t) => t.id === 's1')?.deletedAt).toBe(NOW);
    expect(next.find((t) => t.id === 'p')?.deletedAt).toBeUndefined();
  });

  it('Case D: tombstones every parent emptied across different decompositions', () => {
    // Two steps each: a real decomposition. A parent with ONE child in its round comes back instead, whatever
    // its flag says (below), because it could be a tiny step's real task.
    const tasks = [
      mk({ id: 'p1', silentParent: true, openParent: false }),
      mk({ id: 'a1', parentId: 'p1' }),
      mk({ id: 'a2', parentId: 'p1' }),
      mk({ id: 'p2', silentParent: true, openParent: false }),
      mk({ id: 'b1', parentId: 'p2' }),
      mk({ id: 'b2', parentId: 'p2' }),
    ];
    const { next } = combineTasks(tasks, ['a1', 'a2', 'b1', 'b2'], 'Umbrella', NOW, 'u1');
    expect(next.find((t) => t.id === 'p1')?.deletedAt).toBe(NOW);
    expect(next.find((t) => t.id === 'p2')?.deletedAt).toBe(NOW);
  });

  // The verify pass (2026-10-04): an older store build never writes open_parent, so a task broken down here
  // and later made tiny there keeps a stale false. Combining its pebble must bring it back, never delete it.
  it('brings back a one-child parent whose flag says breakdown (a stale false)', () => {
    const tasks = [
      mk({ id: 'real', silentParent: true, openParent: false }),
      mk({ id: 'pebble', parentId: 'real', parentTitle: 'real' }),
      mk({ id: 'other' }),
    ];
    const { next, broughtBack } = combineTasks(tasks, ['pebble', 'other'], 'Both', 100, 'u');
    const real = next.find((t) => t.id === 'real');
    expect(real?.deletedAt).toBeUndefined();
    expect(real?.silentParent).toBe(false);
    expect(broughtBack).toEqual(['real']);
  });

  // 2026-10-04: combining a tiny step deleted the real task behind it (its OPEN parent). The pebble was
  // scaffolding, so emptying it brings the real task back instead, and it is never tombstoned.
  it('brings a tiny step\'s real task back instead of deleting it', () => {
    const tasks = [
      mk({ id: 'real', silentParent: true, openParent: true }),
      mk({ id: 'pebble', parentId: 'real', parentTitle: 'real' }),
      mk({ id: 'other' }),
    ];
    const { next } = combineTasks(tasks, ['pebble', 'other'], 'Both', 100, 'u');
    const real = next.find((t) => t.id === 'real');
    expect(real?.deletedAt).toBeUndefined();
    expect(real?.silentParent).toBe(false);
    expect(real?.updatedAt).toBe(100);
    expect(next.find((t) => t.id === 'pebble')?.deletedAt).toBe(100);
  });

  it('tidies away a parent whose only other step is already done (it hid for good before)', () => {
    const tasks = [
      mk({ id: 'big', silentParent: true }),
      mk({ id: 's1', parentId: 'big', done: true, completedAt: 5 }),
      mk({ id: 's2', parentId: 'big' }),
      mk({ id: 's3', parentId: 'big' }),
    ];
    const { next } = combineTasks(tasks, ['s2', 's3'], 'Rest', 100, 'u');
    expect(next.find((t) => t.id === 'big')?.deletedAt).toBe(100);
    expect(next.find((t) => t.id === 's1')).toMatchObject({ done: true, completedAt: 5 }); // still in the Lookback
    expect(next.find((t) => t.id === 's1')?.deletedAt).toBeUndefined();
  });

  // The review's catches (2026-10-04): the done-step rule must never touch a parent already finished or
  // already back on Today, and a nested chain must not strand its root.
  it('never touches a parent that is already finished, or already back on Today', () => {
    const finished = [
      mk({ id: 'big', done: true, completedAt: 9 }),
      mk({ id: 's1', parentId: 'big', done: true }),
      mk({ id: 's2', parentId: 'big', done: true }),
      mk({ id: 's3', parentId: 'big' }), // a mis-tap untick
      mk({ id: 'o' }),
    ];
    expect(combineTasks(finished, ['s3', 'o'], 'U', 100, 'u').next.find((t) => t.id === 'big')).toMatchObject({ done: true, completedAt: 9 });
    expect(combineTasks(finished, ['s3', 'o'], 'U', 100, 'u').next.find((t) => t.id === 'big')?.deletedAt).toBeUndefined();
    const visible = [mk({ id: 'big' }), mk({ id: 's1', parentId: 'big' }), mk({ id: 'o' })];
    expect(combineTasks(visible, ['s1', 'o'], 'U', 100, 'u').next.find((t) => t.id === 'big')?.deletedAt).toBeUndefined();
  });

  it('walks up a nested chain: an emptied milestone takes its emptied root with it', () => {
    const tasks = [
      mk({ id: 'root', silentParent: true, openParent: false }),
      mk({ id: 'mile', parentId: 'root', silentParent: true, openParent: false }),
      mk({ id: 'm2', parentId: 'root', done: true }),
      mk({ id: 's1', parentId: 'mile' }),
      mk({ id: 's2', parentId: 'mile' }),
    ];
    const { next } = combineTasks(tasks, ['s1', 's2'], 'U', 100, 'u');
    expect(next.find((t) => t.id === 'mile')?.deletedAt).toBe(100);
    expect(next.find((t) => t.id === 'root')?.deletedAt).toBe(100);
  });

  it('brings back a parent with no tiny flag whose only child ever was the folded one (never a loss)', () => {
    const tasks = [mk({ id: 'maybeTiny', silentParent: true }), mk({ id: 'only', parentId: 'maybeTiny' }), mk({ id: 'o' })];
    const r = combineTasks(tasks, ['only', 'o'], 'U', 100, 'u');
    expect(r.next.find((t) => t.id === 'maybeTiny')).toMatchObject({ silentParent: false });
    expect(r.next.find((t) => t.id === 'maybeTiny')?.deletedAt).toBeUndefined();
    expect(r.broughtBack).toEqual(['maybeTiny']);
  });

  // The re-verify's catch: a task made tiny twice has a retired first pebble. Counting it made the
  // real task look like a two-step breakdown on any device without the flag, and Combine deleted it.
  it('brings back a twice-tiny real task whatever its flag says', () => {
    for (const openParent of [true, undefined]) {
      const tasks = [
        mk({ id: 'real', silentParent: true, openParent }),
        mk({ id: 'p1', parentId: 'real', done: true, completedAt: 100, createdAt: 50, deletedAt: 100 }),
        mk({ id: 'p2', parentId: 'real', createdAt: 200 }),
        mk({ id: 'o' }),
      ];
      const r = combineTasks(tasks, ['p2', 'o'], 'U', 300, 'u');
      expect(r.next.find((t) => t.id === 'real')?.deletedAt).toBeUndefined();
      expect(r.next.find((t) => t.id === 'real')?.silentParent).toBe(false);
      expect(r.broughtBack).toEqual(['real']);
    }
  });

  it('re-checks a parent skipped earlier once a later fold empties it', () => {
    // Selection order puts the root's own step before the milestone's steps.
    const tasks = [
      mk({ id: 'root', silentParent: true, openParent: false }),
      mk({ id: 'S', parentId: 'root' }),
      mk({ id: 'M', parentId: 'root', silentParent: true, openParent: false }),
      mk({ id: 'M1', parentId: 'M' }),
      mk({ id: 'M2', parentId: 'M' }),
    ];
    const { next } = combineTasks(tasks, ['S', 'M1', 'M2'], 'U', 100, 'u');
    expect(next.find((t) => t.id === 'M')?.deletedAt).toBe(100);
    expect(next.find((t) => t.id === 'root')?.deletedAt).toBe(100);
  });

  it('places the umbrella on Today when any selected task is undated', () => {
    const tasks = [mk({ id: 'a', due: '2026-06-20' }), mk({ id: 'b' })];
    const { umbrella } = combineTasks(tasks, ['a', 'b'], 'U', NOW, 'u1');
    expect(umbrella.due).toBe(null);
  });

  it('bumps updatedAt on every task it touches', () => {
    const tasks = [
      mk({ id: 'p', silentParent: true, updatedAt: 1 }),
      mk({ id: 's1', parentId: 'p', updatedAt: 1 }),
      mk({ id: 's2', parentId: 'p', updatedAt: 1 }),
    ];
    const { next } = combineTasks(tasks, ['s1', 's2'], 'Umbrella', NOW, 'u1');
    expect(next.find((t) => t.id === 's1')?.updatedAt).toBe(NOW);
    expect(next.find((t) => t.id === 'p')?.updatedAt).toBe(NOW);
  });
});
