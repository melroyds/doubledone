import { describe, expect, it } from 'vitest';

import { mergeTasks } from './sync-merge';
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

  it('preserves local-only big and manualOrder when the remote row wins', () => {
    const local = [task('x', 10, { big: true, manualOrder: 2 })];
    const remote = [task('x', 20, { title: 'remote' })];
    const res = mergeTasks(local, remote);
    expect(res.merged[0].title).toBe('remote'); // remote won LWW
    expect(res.merged[0].big).toBe(true); // local-only field carried, not dropped
    expect(res.merged[0].manualOrder).toBe(2);
    expect(res.toPush).toEqual([]); // local-only fields are not synced, so nothing to push
  });
});
