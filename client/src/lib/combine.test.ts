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
    const tasks = [
      mk({ id: 'p1', silentParent: true }),
      mk({ id: 'a1', parentId: 'p1' }),
      mk({ id: 'p2', silentParent: true }),
      mk({ id: 'b1', parentId: 'p2' }),
    ];
    const { next } = combineTasks(tasks, ['a1', 'b1'], 'Umbrella', NOW, 'u1');
    expect(next.find((t) => t.id === 'p1')?.deletedAt).toBe(NOW);
    expect(next.find((t) => t.id === 'p2')?.deletedAt).toBe(NOW);
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
