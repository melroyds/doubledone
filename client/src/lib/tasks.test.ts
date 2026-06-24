import { describe, expect, it } from 'vitest';

import { deserialize, parseDump, serialize, sweepElapsedNudges, type Task } from './tasks';

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
