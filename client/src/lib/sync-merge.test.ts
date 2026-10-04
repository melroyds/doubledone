import { describe, expect, it } from 'vitest';

import { rowToTask, taskToRow } from './sync';
import { LOCAL_ONLY_FIELDS, mergeTasks } from './sync-merge';
import { type Task } from './tasks';

// createdAt defaults to 0 so merged sorts deterministically by id (the tiebreak),
// which keeps the id-order assertions below stable. Override createdAt when a test
// is specifically about createdAt ordering.
function task(id: string, updatedAt: number, extra: Partial<Task> = {}): Task {
  return { id, title: id, done: false, createdAt: 0, updatedAt, ...extra };
}

const ids = (ts: Task[]) => ts.map((t) => t.id);

describe('mergeTasks', () => {
  it('two empty sides merge to nothing', () => {
    expect(mergeTasks([], [])).toEqual({ merged: [], toPush: [] });
  });

  it('local-only tasks are kept and pushed (the first-sign-in migration)', () => {
    const local = [task('b', 1), task('a', 1)];
    const res = mergeTasks(local, []);
    expect(ids(res.merged)).toEqual(['a', 'b']);
    expect(ids(res.toPush)).toEqual(['a', 'b']);
  });

  it('remote-only tasks are pulled down and never pushed back', () => {
    const res = mergeTasks([], [task('a', 1), task('b', 1)]);
    expect(ids(res.merged)).toEqual(['a', 'b']);
    expect(res.toPush).toEqual([]);
  });

  it('when local is newer it wins and is pushed', () => {
    const res = mergeTasks([task('x', 20, { title: 'local' })], [task('x', 10, { title: 'remote' })]);
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0].title).toBe('local');
    expect(ids(res.toPush)).toEqual(['x']);
  });

  it('when remote is newer it wins and nothing is pushed', () => {
    const res = mergeTasks([task('x', 10, { title: 'local' })], [task('x', 20, { title: 'remote' })]);
    expect(res.merged[0].title).toBe('remote');
    expect(res.toPush).toEqual([]);
  });

  it('a tie adopts remote and pushes nothing (already in sync)', () => {
    const res = mergeTasks([task('x', 15, { title: 'local' })], [task('x', 15, { title: 'remote' })]);
    expect(res.merged[0].title).toBe('remote');
    expect(res.toPush).toEqual([]);
  });

  it('a local delete (newer tombstone) wins over a live remote and is pushed', () => {
    const res = mergeTasks([task('x', 200, { deletedAt: 200 })], [task('x', 100)]);
    expect(res.merged[0].deletedAt).toBe(200);
    expect(ids(res.toPush)).toEqual(['x']);
  });

  it('a remote delete (newer tombstone) wins over a live local and is not pushed', () => {
    const res = mergeTasks([task('x', 100)], [task('x', 200, { deletedAt: 200 })]);
    expect(res.merged[0].deletedAt).toBe(200);
    expect(res.toPush).toEqual([]);
  });

  it('partitions a mixed set correctly', () => {
    const local = [
      task('localonly', 1),
      task('localnewer', 20),
      task('remotenewer', 10),
      task('tie', 15),
    ];
    const remote = [
      task('remoteonly', 2),
      task('localnewer', 10),
      task('remotenewer', 20),
      task('tie', 15),
    ];
    const res = mergeTasks(local, remote);
    expect(ids(res.merged)).toEqual(['localnewer', 'localonly', 'remotenewer', 'remoteonly', 'tie']);
    expect(ids(res.toPush)).toEqual(['localnewer', 'localonly']);
  });

  it('sorts merged by createdAt, then id', () => {
    const local = [task('z', 1, { createdAt: 100 }), task('a', 1, { createdAt: 300 })];
    const remote = [task('m', 1, { createdAt: 200 })];
    expect(ids(mergeTasks(local, remote).merged)).toEqual(['z', 'm', 'a']);
  });

  it('unions completedDates so an offline recurring tick survives a remote-newer edit', () => {
    const local = [task('r', 10, { completedDates: ['2026-06-25'] })];
    const remote = [task('r', 20, { title: 'edited', completedDates: [] })];
    const res = mergeTasks(local, remote);
    expect(res.merged[0].title).toBe('edited'); // remote won LWW
    expect(res.merged[0].completedDates).toEqual(['2026-06-25']); // but the tick is never erased
    expect(ids(res.toPush)).toEqual(['r']); // and pushed so the server converges to the union
  });

  it('keeps the max slices.done across a conflict (progress is monotonic)', () => {
    const local = [task('s', 10, { slices: { total: 5, done: 3 } })];
    const remote = [task('s', 20, { slices: { total: 5, done: 1 } })];
    const res = mergeTasks(local, remote);
    expect(res.merged[0].slices).toEqual({ total: 5, done: 3 });
    expect(ids(res.toPush)).toEqual(['s']); // progress grew beyond remote, so push
  });

  it('a corrupt remote row with a non-finite updatedAt loses to the good local copy', () => {
    // A NaN updatedAt (an unparseable remote timestamp) would make every `>` comparison false and
    // silently adopt the corrupt row, pinning the task to it. Treating non-finite as -Infinity makes
    // the good local copy win instead. NaN is the realistic value Date.parse returns on a bad string.
    const local = [task('x', 50, { title: 'good local' })];
    const remote = [task('x', NaN, { title: 'corrupt remote' })];
    const res = mergeTasks(local, remote);
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0].title).toBe('good local'); // the corrupt row did NOT win
    expect(ids(res.toPush)).toEqual(['x']); // local won, so push so the server is corrected
  });

  // 2026-10-04: only manualOrder was carried, so the second sync after Make it tiny (a timestamp TIE) wiped
  // openParent and ticking the tiny step then COMPLETED the real task; a reminder lost its id and fired on a
  // finished task; a broken-down step lost decompositionId and stopped reporting its outcome.
  it('carries every local-only field when the remote copy wins on a tie (the second sync)', () => {
    const local = [
      task('real', 10, { silentParent: true, openParent: true }),
      task('pebble', 10, { parentId: 'real', parentTitle: 'Clean the garage', decompositionId: 'd1', decompositionSteps: 3, nudgeAt: 99, nudgeId: 'n1', suggestBreakdown: true, combinedFrom: [{ id: 'a', title: 'A' }] }),
    ];
    // What the server sends back: the same rows, without any field it has no column for.
    const remote = local.map((t) => rowToTask(taskToRow(t, 'u')));
    const res = mergeTasks(local, remote);
    expect(res.merged.find((t) => t.id === 'real')?.openParent).toBe(true);
    const pebble = res.merged.find((t) => t.id === 'pebble');
    expect(pebble).toMatchObject({ parentTitle: 'Clean the garage', decompositionId: 'd1', decompositionSteps: 3, nudgeAt: 99, nudgeId: 'n1', suggestBreakdown: true });
    expect(pebble?.combinedFrom).toEqual([{ id: 'a', title: 'A' }]);
    expect(res.toPush).toEqual([]); // local-only fields never make a push
  });

  it('drops a stale tiny flag when another device has since hidden the task again (a new episode)', () => {
    // This device: the task came back from its tiny step (visible, flag still true). Another device then broke
    // it down (hidden again, newer). Carrying the flag would turn the new real steps into tiny steps.
    const local = [task('r', 10, { openParent: true })];
    const remote = [task('r', 20, { silentParent: true })];
    expect(mergeTasks(local, remote).merged[0]).not.toHaveProperty('openParent');
    // Within one episode (a tie, or a newer remote while it stayed hidden) the flag is kept.
    expect(mergeTasks([task('r', 10, { silentParent: true, openParent: true })], [task('r', 20, { silentParent: true })]).merged[0].openParent).toBe(true);
  });

  it('never invents a local-only key the local copy does not have', () => {
    const res = mergeTasks([task('x', 10)], [task('x', 20, { title: 'remote' })]);
    for (const key of LOCAL_ONLY_FIELDS) expect(res.merged[0]).not.toHaveProperty(key);
  });

  // The drift guard: every Task key is either synced (it survives taskToRow -> rowToTask) or listed as
  // local-only, never both and never neither. A new Task field fails this until it is placed.
  it('every Task field is either synced or carried as local-only', () => {
    const full: Required<Task> = {
      id: 'f', title: 'f', done: true, createdAt: 1, updatedAt: 2, deletedAt: 3, completedAt: 4, complexity: 5,
      due: '2026-10-04', recurrence: { kind: 'daily' }, completedDates: ['2026-10-04'], skippedDates: ['2026-10-03'],
      slices: { total: 2, done: 1 }, suggestBreakdown: true, decompositionId: 'd', decompositionSteps: 2, parentId: 'p',
      parentTitle: 'P', silentParent: true, openParent: true, combinedFrom: [{ id: 'c', title: 'C' }], nudgeAt: 6,
      nudgeId: 'n', pinnedAt: 7, manualOrder: 8, sharedRef: 'pair/row', big: true,
    };
    const synced = new Set(Object.keys(rowToTask(taskToRow(full, 'u'))));
    const localOnly = new Set<string>(LOCAL_ONLY_FIELDS);
    for (const key of Object.keys(full)) {
      expect({ key, placed: synced.has(key) !== localOnly.has(key) }).toEqual({ key, placed: true });
    }
  });

  it('preserves local-only manualOrder when the remote row wins', () => {
    const local = [task('x', 10, { manualOrder: 2 })];
    const remote = [task('x', 20, { title: 'remote' })];
    const res = mergeTasks(local, remote);
    expect(res.merged[0].title).toBe('remote'); // remote won LWW
    expect(res.merged[0].manualOrder).toBe(2); // local-only field carried, not dropped
    expect(res.toPush).toEqual([]); // manualOrder is not synced, so nothing to push
  });

  describe('big (synced by LWW since the column landed, with the tie-seed migration)', () => {
    it('a big marked on another device arrives (remote newer carries big down, no push)', () => {
      const res = mergeTasks([task('x', 10)], [task('x', 20, { big: true })]);
      expect(res.merged[0].big).toBe(true);
      expect(res.toPush).toEqual([]);
    });

    it('a big marked locally (newer) wins and is pushed', () => {
      const res = mergeTasks([task('x', 20, { big: true })], [task('x', 10)]);
      expect(res.merged[0].big).toBe(true);
      expect(ids(res.toPush)).toEqual(['x']);
    });

    it('a NEWER remote clear beats a stale local big (no resurrection)', () => {
      // Device B unmarked big (bumping updatedAt); device A still holds the old mark. The clear wins.
      const res = mergeTasks([task('x', 10, { big: true })], [task('x', 20)]);
      expect(res.merged[0].big).toBeUndefined();
      expect(res.toPush).toEqual([]);
    });

    it('a TIE seeds a pre-column local big into the column and pushes it (the migration sync)', () => {
      // Before the column existed, big lived on-device only, so a synced row holds big locally while
      // the server row (same updatedAt) has none. The first sync must seed, never erase.
      const res = mergeTasks([task('x', 15, { big: true })], [task('x', 15)]);
      expect(res.merged[0].big).toBe(true);
      expect(ids(res.toPush)).toEqual(['x']);
    });

    it('a tie where only the remote holds big keeps it and pushes nothing', () => {
      const res = mergeTasks([task('x', 15)], [task('x', 15, { big: true })]);
      expect(res.merged[0].big).toBe(true);
      expect(res.toPush).toEqual([]);
    });

    it('a tie where BOTH sides hold big stays big and pushes nothing (the converged steady state)', () => {
      // After the migration every marked task lives in this state on every sync forever; if this ever
      // pushed, each sync would re-upsert every big task in an endless write loop.
      const res = mergeTasks([task('x', 15, { big: true })], [task('x', 15, { big: true })]);
      expect(res.merged[0].big).toBe(true);
      expect(res.toPush).toEqual([]);
    });

    it('a NEWER local clear beats a stale remote big and is pushed (the clear propagates)', () => {
      const res = mergeTasks([task('x', 20)], [task('x', 10, { big: true })]);
      expect(res.merged[0].big).toBeUndefined();
      expect(ids(res.toPush)).toEqual(['x']);
    });

    it('two corrupt (non-finite) stamps never fake a tie-seed', () => {
      // rank() maps both to -Infinity for LWW, but -Inf === -Inf is NOT a logical-version tie;
      // the seed requires finite equality, so corrupt rows cannot smuggle a big in.
      const res = mergeTasks([task('x', NaN, { big: true })], [task('x', NaN)]);
      expect(res.merged[0].big).toBeUndefined();
    });

    it('a tie-seed on a tombstone stays deleted (the seed can never un-delete)', () => {
      const res = mergeTasks([task('x', 15, { deletedAt: 15, big: true })], [task('x', 15, { deletedAt: 15 })]);
      expect(res.merged[0].deletedAt).toBe(15);
      expect(res.merged[0].big).toBe(true); // inert on a tombstone, but seeded consistently
      expect(ids(res.toPush)).toEqual(['x']);
    });
  });
});
