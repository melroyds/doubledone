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
});
