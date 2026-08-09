import { describe, expect, it } from 'vitest';

import { mergeShared, type SharedTask } from './ours-merge';
import { withMonotonicStamps } from './tasks';

function task(over: Partial<SharedTask> & { id: string }): SharedTask {
  return { title: 'x', done: false, createdAt: 1000, updatedAt: 1000, ...over };
}

describe('mergeShared', () => {
  it('pulls down a row only the server has, and pushes one only I have', () => {
    const res = mergeShared([task({ id: 'mine' })], [task({ id: 'theirs' })]);
    expect(res.merged.map((t) => t.id).sort()).toEqual(['mine', 'theirs']);
    // Only my offline addition needs sending; theirs is already where it lives.
    expect(res.toPush.map((t) => t.id)).toEqual(['mine']);
  });

  it('takes the newer copy of a row both sides hold', () => {
    const res = mergeShared(
      [task({ id: 'a', title: 'bins', updatedAt: 5000 })],
      [task({ id: 'a', title: 'take the bins out', updatedAt: 9000 })],
    );
    expect(res.merged[0].title).toBe('take the bins out');
    expect(res.toPush).toEqual([]); // already in sync, nothing owed
  });

  // THE ONE THAT MATTERS. Two people tick the bins from two phones on different days, offline.
  // Whole-row last-write-wins would drop whichever tick lost the timestamp race, and somebody's
  // completed work would silently un-complete on their partner's screen. The union cannot lose one.
  it('UNIONS completedDates, so neither person’s tick can be lost to the other’s newer edit', () => {
    const mine = task({ id: 'bins', updatedAt: 1000, completedDates: ['2026-08-05'] });
    const theirs = task({ id: 'bins', updatedAt: 9000, title: 'bins (green)', completedDates: ['2026-08-06'] });

    const res = mergeShared([mine], [theirs]);
    expect(res.merged[0].title).toBe('bins (green)'); // their newer edit still wins the row
    expect(res.merged[0].completedDates).toEqual(['2026-08-05', '2026-08-06']); // and my tick survives it
  });

  it('pushes back when the union GREW beyond the server, so the other phone converges too', () => {
    const mine = task({ id: 'bins', updatedAt: 1000, completedDates: ['2026-08-05'] });
    const theirs = task({ id: 'bins', updatedAt: 9000, completedDates: ['2026-08-06'] });

    // My copy LOST the last-write-wins comparison, so a naive merge would push nothing and the
    // other person would never see my tick.
    const res = mergeShared([mine], [theirs]);
    expect(res.toPush.map((t) => t.id)).toEqual(['bins']);
    expect(res.toPush[0].completedDates).toEqual(['2026-08-05', '2026-08-06']);
  });

  it('does not push when the union added nothing the server did not already have', () => {
    const shared = ['2026-08-05', '2026-08-06'];
    const res = mergeShared(
      [task({ id: 'bins', updatedAt: 1000, completedDates: ['2026-08-05'] })],
      [task({ id: 'bins', updatedAt: 9000, completedDates: shared })],
    );
    expect(res.toPush).toEqual([]);
  });

  it('keeps completed dates sorted and free of duplicates when both people ticked the same day', () => {
    const res = mergeShared(
      [task({ id: 'a', updatedAt: 2000, completedDates: ['2026-08-06', '2026-08-04'] })],
      [task({ id: 'a', updatedAt: 1000, completedDates: ['2026-08-06', '2026-08-05'] })],
    );
    expect(res.merged[0].completedDates).toEqual(['2026-08-04', '2026-08-05', '2026-08-06']);
  });

  // A tombstone is an ordinary row with a newer stamp. "Delete always wins" would let one person's
  // stale removal beat the other's fresh re-add, which on a shared list reads as the app siding
  // with whoever gave up on the task.
  it('resolves a removal against a re-add by TIME, not by treating a delete as special', () => {
    const removed = task({ id: 'a', updatedAt: 5000, deletedAt: 5000 });
    const readded = task({ id: 'a', updatedAt: 8000, deletedAt: null });

    // The later write wins whichever SIDE it arrives on: the outcome is a fact about the clock, not
    // about whose phone happened to run the merge. Both orderings must agree, or two people would
    // see different lists and each would be certain the other had deleted their task.
    expect(mergeShared([removed], [readded]).merged[0].deletedAt).toBeNull();
    expect(mergeShared([readded], [removed]).merged[0].deletedAt).toBeNull();
  });

  it('lets a removal beat an OLDER add, so a deliberate delete is not undone by a stale copy', () => {
    const added = task({ id: 'a', updatedAt: 5000, deletedAt: null });
    const removed = task({ id: 'a', updatedAt: 8000, deletedAt: 8000 });

    expect(mergeShared([added], [removed]).merged[0].deletedAt).toBe(8000);
    expect(mergeShared([removed], [added]).merged[0].deletedAt).toBe(8000);
  });

  it('keeps tombstones in the merged set rather than dropping them', () => {
    const res = mergeShared([], [task({ id: 'gone', deletedAt: 4000 })]);
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0].deletedAt).toBe(4000);
  });

  // A corrupt stamp that parses to NaN makes every `>` false, which would silently adopt the
  // corrupt row and pin the task to it forever.
  it('makes a corrupt updatedAt LOSE rather than win by default', () => {
    const res = mergeShared(
      [task({ id: 'a', title: 'corrupt', updatedAt: Number.NaN })],
      [task({ id: 'a', title: 'good', updatedAt: 1 })],
    );
    expect(res.merged[0].title).toBe('good');
  });

  it('is stable and ordered by creation, so two phones render the same list in the same order', () => {
    const res = mergeShared(
      [task({ id: 'z', createdAt: 1 }), task({ id: 'a', createdAt: 3 })],
      [task({ id: 'm', createdAt: 2 })],
    );
    expect(res.merged.map((t) => t.id)).toEqual(['z', 'm', 'a']);
  });

  it('breaks a createdAt tie by id, so the order can never depend on which phone merged', () => {
    const res = mergeShared([task({ id: 'b', createdAt: 7 })], [task({ id: 'a', createdAt: 7 })]);
    expect(res.merged.map((t) => t.id)).toEqual(['a', 'b']);
  });

  // The law that outranks every merge rule in this file. If a field naming a person ever appears,
  // this test is the thing that should fail first.
  it('carries NOTHING that could attribute a completion to a person', () => {
    const res = mergeShared(
      [task({ id: 'a', done: true, doneAt: 4000, updatedAt: 4000 })],
      [task({ id: 'a', updatedAt: 1000 })],
    );
    const keys = Object.keys(res.merged[0]);
    expect(keys).not.toContain('doneBy');
    expect(keys).not.toContain('done_by');
    expect(keys).not.toContain('userId');
    // doneAt is a TIME and is allowed; it says when, never who.
    expect(res.merged[0].doneAt).toBe(4000);
  });
});

// The widened tasks.ts helper, exercised on a SHARED row. Its own behaviour is covered in
// tasks.test.ts; what is proved here is that the shared shape goes through the same one, because
// two implementations of "whose write won" is exactly how two people end up on two different lists.
describe('withMonotonicStamps, on shared rows', () => {
  it('lifts a write that a slow clock stamped behind the row it replaces', () => {
    // Their phone wrote at 9000. Mine is a minute slow and stamps my edit at 1000, so without this
    // my own change would lose to the copy it replaced and appear to undo itself in front of me.
    const prev = [task({ id: 'bins', updatedAt: 9000 })];
    const next = [task({ id: 'bins', title: 'bins (green)', updatedAt: 1000 })];

    const out = withMonotonicStamps(next, prev);
    expect(out[0].updatedAt).toBe(9001);
    expect(mergeShared(out, prev).merged[0].title).toBe('bins (green)');
  });

  it('leaves an unchanged row alone, so lifting adds no spurious pushes', () => {
    const prev = [task({ id: 'a', updatedAt: 5000 })];
    expect(withMonotonicStamps([task({ id: 'a', updatedAt: 5000 })], prev)[0].updatedAt).toBe(5000);
  });

  it('leaves a brand new row at its own stamp, having nothing to clear', () => {
    expect(withMonotonicStamps([task({ id: 'new', updatedAt: 42 })], [])[0].updatedAt).toBe(42);
  });
});
