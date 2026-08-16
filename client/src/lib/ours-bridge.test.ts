import { describe, expect, it } from 'vitest';

import { makeSharedRef, parseSharedRef, pulledFrom, removedOrigins, sharedRestNotes } from './ours-bridge';
import { type SharedTask } from './ours-merge';
import { type Task } from './tasks';

function task(over: Partial<Task> & { id: string }): Task {
  return { title: 'x', done: false, createdAt: 1000, updatedAt: 1000, ...over };
}
function shared(over: Partial<SharedTask> & { id: string }): SharedTask {
  return { title: 'x', done: false, createdAt: 1000, updatedAt: 1000, ...over };
}

const PAIR = 'pair-1';
const DAY = '2026-08-09';

describe('the link a pulled copy carries', () => {
  it('round-trips', () => {
    expect(parseSharedRef(makeSharedRef(PAIR, 'task-9'))).toEqual({ pairId: PAIR, sharedId: 'task-9' });
  });

  // A half-parsed ref would match the WRONG list, and a tick bridged to a stranger's task is the
  // worst failure this feature has. Refuse rather than guess.
  it('refuses anything malformed rather than returning half a link', () => {
    for (const bad of ['', '/', 'no-separator', '/leading', 'trailing/', 'a/b/c', undefined, null]) {
      expect(parseSharedRef(bad)).toBeNull();
    }
  });
});

describe('which rows are already on my Today', () => {
  it('maps shared id to my copy, ignoring other lists and my ordinary tasks', () => {
    const tasks = [
      task({ id: 'mine-1', sharedRef: makeSharedRef(PAIR, 'milk') }),
      task({ id: 'mine-2', sharedRef: makeSharedRef('other-pair', 'bins') }),
      task({ id: 'mine-3' }),
    ];
    expect([...pulledFrom(tasks, PAIR)]).toEqual([['milk', 'mine-1']]);
  });

  // You took it off your day. Bringing it over again is a thing you are allowed to want.
  it('does not count a copy you removed', () => {
    const tasks = [task({ id: 'mine-1', sharedRef: makeSharedRef(PAIR, 'milk'), deletedAt: 5000 })];
    expect(pulledFrom(tasks, PAIR).size).toBe(0);
  });
});

describe('a copy whose shared row was finished on the other side', () => {
  const pulled = task({ id: 'mine', title: 'take the bins out', sharedRef: makeSharedRef(PAIR, 'bins') });

  it('is picked up when the shared row is done for the day', () => {
    const done = shared({ id: 'bins', done: true, completions: { on: { [DAY]: 9000 } } });
    expect(sharedRestNotes([pulled], [done], PAIR, DAY)).toEqual([{ id: 'mine', title: 'take the bins out' }]);
  });

  it('leaves my copy alone while the shared row is still open', () => {
    expect(sharedRestNotes([pulled], [shared({ id: 'bins' })], PAIR, DAY)).toEqual([]);
  });

  // I ticked it myself, which already closed both. A rest-note here would tell me somebody else
  // handled a thing I just did, and it would take my own finish out of my Lookback.
  it('never fires on a copy I already ticked', () => {
    const done = shared({ id: 'bins', done: true, completions: { on: { [DAY]: 9000 } } });
    expect(sharedRestNotes([{ ...pulled, done: true }], [done], PAIR, DAY)).toEqual([]);
  });

  // "Handled on Ours" would be a lie, and your copy is your own task now.
  it('does not fire when they REMOVED the shared row rather than finishing it', () => {
    const gone = shared({ id: 'bins', deletedAt: 9000 });
    expect(sharedRestNotes([pulled], [gone], PAIR, DAY)).toEqual([]);
  });

  it('does not fire when the shared row is nowhere in the cache', () => {
    expect(sharedRestNotes([pulled], [], PAIR, DAY)).toEqual([]);
  });

  it('is per-day for a repeat: yesterday being done says nothing about today', () => {
    const repeat = shared({ id: 'bins', recurrence: { kind: 'daily' }, completions: { on: { '2026-08-08': 9000 } } });
    expect(sharedRestNotes([pulled], [repeat], PAIR, DAY)).toEqual([]);
    expect(sharedRestNotes([pulled], [repeat], PAIR, '2026-08-08')).toHaveLength(1);
  });

  it('ignores a copy from a different list', () => {
    const done = shared({ id: 'bins', done: true, completions: { on: { [DAY]: 9000 } } });
    expect(sharedRestNotes([{ ...pulled, sharedRef: makeSharedRef('other', 'bins') }], [done], PAIR, DAY)).toEqual([]);
  });

  // The law, checked on the bridge itself, which is where attribution is most tempting: at the
  // moment of crossing you genuinely DO know which side acted.
  it('returns a title and an id, and nothing that could name a person', () => {
    const done = shared({ id: 'bins', done: true, doneAt: 9000, completions: { on: { [DAY]: 9000 } } });
    const [note] = sharedRestNotes([pulled], [done], PAIR, DAY);
    expect(Object.keys(note).sort()).toEqual(['id', 'title']);
  });
});

// A brought copy is CREATED as a one-off, but nothing stops somebody giving theirs a rhythm
// afterwards, and `deletedAt` on a repeat kills the whole series rather than today's instance.
it('never retires a recurring copy, whatever the shared row says', () => {
  const repeating = task({ id: 'mine', sharedRef: makeSharedRef(PAIR, 'bins'), recurrence: { kind: 'daily' } });
  const done = shared({ id: 'bins', done: true, completions: { on: { [DAY]: 9000 } } });
  expect(sharedRestNotes([repeating], [done], PAIR, DAY)).toEqual([]);
});

// A finished copy is not on your plate. While only tombstones were skipped, a copy the other side
// marked done was invisible on Today AND un-re-addable from Ours: stuck in both directions.
it('does not count a copy that is already done', () => {
  const tasks = [task({ id: 'mine-1', sharedRef: makeSharedRef(PAIR, 'milk'), done: true })];
  expect(pulledFrom(tasks, PAIR).size).toBe(0);
});

// A row taken off the shared list leaves your copy alone (it is your task now) but must SAY so.
// The deciding case is wasted effort: your person removes "milk" because she already bought it, and
// a silent copy sends you to the shop for milk.
describe('a copy whose shared row was REMOVED', () => {
  const mine = task({ id: 'mine', title: 'milk', sharedRef: makeSharedRef(PAIR, 'milk') });
  const gone = shared({ id: 'milk', deletedAt: 9000 });

  it('is flagged while the tombstone is still visible', () => {
    expect([...removedOrigins([mine], [gone], PAIR)]).toEqual(['mine']);
  });

  it('is not flagged while the shared row is still on the list', () => {
    expect(removedOrigins([mine], [shared({ id: 'milk' })], PAIR).size).toBe(0);
  });

  // You did the thing. Its origin's fate is not news, and a note here would read as a correction.
  it('says nothing about a copy you already finished', () => {
    expect(removedOrigins([{ ...mine, done: true }], [gone], PAIR).size).toBe(0);
  });

  it('says nothing about a copy you removed yourself', () => {
    expect(removedOrigins([{ ...mine, deletedAt: 1 }], [gone], PAIR).size).toBe(0);
  });

  it('ignores a copy from a different list', () => {
    expect(removedOrigins([{ ...mine, sharedRef: makeSharedRef('other', 'milk') }], [gone], PAIR).size).toBe(0);
  });

  // The accepted limit: after the server's seven-day sweep the tombstone is gone, and a removed
  // origin becomes indistinguishable from one never pulled. It goes quiet rather than guessing.
  it('goes quiet once the tombstone has been swept, rather than guessing', () => {
    expect(removedOrigins([mine], [], PAIR).size).toBe(0);
  });

  // The law, on the one bridge where attribution is most tempting: this returns ids, never people.
  it('returns ids and nothing that could name a person', () => {
    const withWho = shared({ id: 'milk', deletedAt: 9000, doneAt: 5000 });
    expect([...removedOrigins([mine], [withWho], PAIR)]).toEqual(['mine']);
  });
});
