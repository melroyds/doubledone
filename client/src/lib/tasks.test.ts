import { describe, expect, it } from 'vitest';

import { completeOnDay, deserialize, makeId, parseDump, serialize, sweepElapsedNudges, type Task, withMonotonicStamps } from './tasks';

const sample: Task[] = [
  { id: 'a', title: 'Water the plants', done: false, createdAt: 10, updatedAt: 10 },
  { id: 'b', title: 'Pay the rent', done: true, createdAt: 20, updatedAt: 25 },
];

describe('serialize / deserialize', () => {
  it('round-trips a list of tasks', () => {
    expect(deserialize(serialize(sample))).toEqual(sample);
  });

  it('returns an empty list for null or empty input', () => {
    expect(deserialize(null)).toEqual([]);
    expect(deserialize('')).toEqual([]);
  });

  it('returns an empty list for corrupt JSON instead of throwing', () => {
    expect(deserialize('{not json')).toEqual([]);
    expect(deserialize('undefined')).toEqual([]);
  });

  it('returns an empty list when the blob is not an array', () => {
    expect(deserialize('{"id":"a"}')).toEqual([]);
    expect(deserialize('42')).toEqual([]);
  });

  it('drops malformed entries but keeps the well-formed ones', () => {
    const raw = JSON.stringify([
      { id: 'a', title: 'Keep me', done: false, createdAt: 1 },
      { id: 'b', title: 'No createdAt', done: false },
      { title: 'No id', done: false, createdAt: 2 },
      null,
      'a string',
      { id: 'c', title: 'Keep me too', done: true, createdAt: 3 },
    ]);
    expect(deserialize(raw)).toEqual([
      { id: 'a', title: 'Keep me', done: false, createdAt: 1, updatedAt: 1 },
      { id: 'c', title: 'Keep me too', done: true, createdAt: 3, updatedAt: 3 },
    ]);
  });

  it('backfills updatedAt from createdAt for older blobs that predate it', () => {
    const raw = JSON.stringify([{ id: 'a', title: 'Old task', done: false, createdAt: 7 }]);
    expect(deserialize(raw)).toEqual([
      { id: 'a', title: 'Old task', done: false, createdAt: 7, updatedAt: 7 },
    ]);
  });

  it('keeps an explicit updatedAt when present', () => {
    const raw = JSON.stringify([{ id: 'a', title: 'T', done: false, createdAt: 7, updatedAt: 99 }]);
    expect(deserialize(raw)[0].updatedAt).toBe(99);
  });
});

describe('parseDump', () => {
  it('returns one title per non-empty line, trimmed', () => {
    expect(parseDump('  call the dentist  \nbuy milk')).toEqual(['call the dentist', 'buy milk']);
  });

  it('drops blank lines and whitespace-only lines', () => {
    expect(parseDump('a\n\n   \nb\n')).toEqual(['a', 'b']);
  });

  it('handles a single line', () => {
    expect(parseDump('just one thing')).toEqual(['just one thing']);
  });

  it('returns an empty array for empty or whitespace input', () => {
    expect(parseDump('')).toEqual([]);
    expect(parseDump('   \n  \n')).toEqual([]);
  });

  it('tolerates CRLF line endings', () => {
    expect(parseDump('first\r\nsecond')).toEqual(['first', 'second']);
  });

  it('strips leading list markers so pasted lists just work', () => {
    expect(parseDump('- buy milk\n* call mum\n1. book flights\n2) renew rego')).toEqual([
      'buy milk',
      'call mum',
      'book flights',
      'renew rego',
    ]);
  });

  it('does not mistake a hyphenated value for a list marker', () => {
    expect(parseDump('-5 degrees tonight')).toEqual(['-5 degrees tonight']);
  });
});

describe('sweepElapsedNudges', () => {
  const withNudge = (id: string, nudgeAt: number): Task => ({
    id,
    title: id,
    done: false,
    createdAt: 0,
    updatedAt: 0,
    nudgeAt,
    nudgeId: `nudge-${id}`,
  });

  it('strips nudgeAt and nudgeId from a task whose nudge time has passed', () => {
    const out = sweepElapsedNudges([withNudge('a', 1000)], 2000);
    expect(out[0].nudgeAt).toBeUndefined();
    expect(out[0].nudgeId).toBeUndefined();
  });

  it('keeps a nudge that is still in the future, returning the same reference', () => {
    const tasks = [withNudge('a', 5000)];
    const out = sweepElapsedNudges(tasks, 2000);
    expect(out[0].nudgeAt).toBe(5000);
    expect(out).toBe(tasks);
  });

  it('treats a nudge exactly at now as elapsed', () => {
    const out = sweepElapsedNudges([withNudge('a', 2000)], 2000);
    expect(out[0].nudgeAt).toBeUndefined();
  });

  it('leaves nudge-free tasks untouched and returns the same reference', () => {
    const tasks: Task[] = [{ id: 'a', title: 'a', done: false, createdAt: 0, updatedAt: 0 }];
    expect(sweepElapsedNudges(tasks, 9999)).toBe(tasks);
  });

  it('sweeps only the elapsed ones in a mixed list', () => {
    const out = sweepElapsedNudges([withNudge('past', 1000), withNudge('future', 9000)], 5000);
    expect(out.find((t) => t.id === 'past')?.nudgeAt).toBeUndefined();
    expect(out.find((t) => t.id === 'future')?.nudgeAt).toBe(9000);
  });
});

describe('completeOnDay', () => {
  const base: Task = { id: 'a', title: 'Water the plants', done: false, createdAt: 10, updatedAt: 10 };
  const now = 1_700_000_000_000;

  it('stamps completedAt at local NOON of the chosen day, never a neighbouring day', () => {
    const out = completeOnDay(base, '2026-06-20', now);
    expect(out.completedAt).toBe(new Date(2026, 5, 20, 12).getTime());
  });

  it('marks the task done and bumps updatedAt to now so sync carries it', () => {
    const out = completeOnDay(base, '2026-06-20', now);
    expect(out.done).toBe(true);
    expect(out.updatedAt).toBe(now);
  });

  it('completes a sliced task outright: every slice filled', () => {
    const sliced: Task = { ...base, slices: { total: 5, done: 2 } };
    const out = completeOnDay(sliced, '2026-06-19', now);
    expect(out.slices).toEqual({ total: 5, done: 5 });
    expect(out.done).toBe(true);
  });

  it('does not invent slices on a whole task', () => {
    const out = completeOnDay(base, '2026-06-19', now);
    expect(out.slices).toBeUndefined();
  });

  it('handles a month boundary (the chosen day, not the neighbour)', () => {
    const out = completeOnDay(base, '2026-07-01', now);
    expect(out.completedAt).toBe(new Date(2026, 6, 1, 12).getTime());
  });

  it('leaves the original task untouched (pure)', () => {
    const sliced: Task = { ...base, slices: { total: 3, done: 1 } };
    completeOnDay(sliced, '2026-06-19', now);
    expect(sliced.done).toBe(false);
    expect(sliced.slices).toEqual({ total: 3, done: 1 });
  });
});

describe('withMonotonicStamps (delete/edit must win LWW against a foreign clock)', () => {
  const mk = (over: Partial<Task>): Task => ({ id: 'a', title: 't', done: false, createdAt: 1, updatedAt: 1, ...over });

  it('bumps a changed task whose new stamp is BEHIND the copy we held (browser clock behind the MCP Worker)', () => {
    // The local copy carries the Worker-written updatedAt (2000, "the future"); the browser
    // delete stamped 1500 (its clock is behind). Without the bump this tombstone loses LWW.
    const prev = [mk({ id: 'x', updatedAt: 2000 })];
    const next = [mk({ id: 'x', updatedAt: 1500, deletedAt: 1500 })];
    const out = withMonotonicStamps(next, prev);
    expect(out[0].updatedAt).toBe(2001); // strictly beats the remote copy (2000)
    expect(out[0].deletedAt).toBe(1500); // the change itself is preserved
  });

  it('leaves a normal change alone when its stamp already beats the held copy', () => {
    const prev = [mk({ id: 'x', updatedAt: 1000 })];
    const next = [mk({ id: 'x', updatedAt: 3000, done: true })];
    expect(withMonotonicStamps(next, prev)[0].updatedAt).toBe(3000); // untouched
  });

  it('never touches an unchanged task (same updatedAt as prev), so it adds no spurious pushes', () => {
    const prev = [mk({ id: 'x', updatedAt: 2000 }), mk({ id: 'y', updatedAt: 5 })];
    const next = [mk({ id: 'x', updatedAt: 2000 }), mk({ id: 'y', updatedAt: 5 })];
    const out = withMonotonicStamps(next, prev);
    expect(out.map((t) => t.updatedAt)).toEqual([2000, 5]);
  });

  it('leaves a brand-new task (no prev) untouched', () => {
    const out = withMonotonicStamps([mk({ id: 'new', updatedAt: 10 })], []);
    expect(out[0].updatedAt).toBe(10);
  });
});

describe('makeId', () => {
  // The reason this moved out of today.tsx: the Calendar can now create tasks too, and two screens
  // each with their own counter both start at 1, so same-millisecond captures on each would collide.
  // One shared counter makes that impossible rather than unlikely.
  it('never repeats, even for ids minted in the same millisecond', () => {
    const ids = Array.from({ length: 500 }, () => makeId());
    expect(new Set(ids).size).toBe(500);
  });

  it('is shaped as a task id', () => {
    expect(makeId()).toMatch(/^t-[0-9a-z]+-[0-9a-z]+$/);
  });
});
