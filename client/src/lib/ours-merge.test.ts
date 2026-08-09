import { describe, expect, it } from 'vitest';

import {
  clearOn,
  COMPLETION_MAX_DATES,
  completedDatesOf,
  isDoneOn,
  mergeCompletions,
  mergeShared,
  type SharedTask,
  isSharedDoneOn,
  setSharedDone,
  tickOn,
  washedSince,
} from './ours-merge';
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
  // completed work would silently un-complete on their partner's screen.
  it('merges completions per DATE, so neither person’s tick is lost to the other’s newer edit', () => {
    const mine = task({ id: 'bins', updatedAt: 1000, completions: { on: { '2026-08-05': 1000 } } });
    const theirs = task({ id: 'bins', updatedAt: 9000, title: 'bins (green)', completions: { on: { '2026-08-06': 9000 } } });

    const res = mergeShared([mine], [theirs]);
    expect(res.merged[0].title).toBe('bins (green)'); // their newer edit still wins the row
    expect(completedDatesOf(res.merged[0].completions)).toEqual(['2026-08-05', '2026-08-06']);
  });

  it('pushes back when the merge GREW the log beyond the server, so the other phone converges too', () => {
    const mine = task({ id: 'bins', updatedAt: 1000, completions: { on: { '2026-08-05': 1000 } } });
    const theirs = task({ id: 'bins', updatedAt: 9000, completions: { on: { '2026-08-06': 9000 } } });

    // My copy LOST the last-write-wins comparison, so a naive merge would push nothing and the
    // other person would never see my tick.
    const res = mergeShared([mine], [theirs]);
    expect(res.toPush.map((t) => t.id)).toEqual(['bins']);
    expect(completedDatesOf(res.toPush[0].completions)).toEqual(['2026-08-05', '2026-08-06']);
  });

  it('does not push when the merge added nothing the server did not already have', () => {
    const res = mergeShared(
      [task({ id: 'bins', updatedAt: 1000, completions: { on: { '2026-08-05': 1000 } } })],
      [task({ id: 'bins', updatedAt: 9000, completions: { on: { '2026-08-05': 1000, '2026-08-06': 9000 } } })],
    );
    expect(res.toPush).toEqual([]);
  });

  it('keeps completed dates sorted and free of duplicates when both people ticked the same day', () => {
    const res = mergeShared(
      [task({ id: 'a', updatedAt: 2000, completions: { on: { '2026-08-06': 1, '2026-08-04': 1 } } })],
      [task({ id: 'a', updatedAt: 1000, completions: { on: { '2026-08-06': 2, '2026-08-05': 1 } } })],
    );
    expect(completedDatesOf(res.merged[0].completions)).toEqual(['2026-08-04', '2026-08-05', '2026-08-06']);
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

// The completion log, and the bug it exists to fix.
//
// The first version of this file held completedDates as a grow-only UNION, which cannot lose a
// tick (right) and therefore cannot express an UN-tick (wrong). Removing today's date locally was
// restored by the very next merge and never reached the server at all. Sixteen tests passed,
// because every one of them asked "can a tick be lost", where "no, never, by construction" is also
// the defect. Two shipped promises rest on un-ticking working: the finality affirmations are
// withheld on Ours BECAUSE your person can un-tick, and Phase 5 stops rendering done rows at the
// day boundary so that un-tick works all day.
describe('the completion log', () => {
  const DAY = '2026-08-09';

  it('UN-TICKING SURVIVES A MERGE with the server copy that still has it ticked', () => {
    const theirs = task({ id: 'bins', updatedAt: 5000, completions: { on: { [DAY]: 5000 } } });
    const mine = { ...theirs, completions: clearOn(theirs.completions, DAY, 6000) };

    const res = mergeShared([mine], [theirs]);
    expect(isDoneOn(res.merged[0].completions, DAY)).toBe(false);
    expect(completedDatesOf(res.merged[0].completions)).toEqual([]);
  });

  // An un-tick does not make my row newer than a retitle they made an hour ago, so without the
  // log-grew branch the un-tick would live on this phone alone and their screen would disagree.
  it('pushes the un-tick even when my row LOST the last-write-wins comparison', () => {
    const theirs = task({ id: 'bins', updatedAt: 9000, title: 'bins (green)', completions: { on: { [DAY]: 5000 } } });
    const mine = task({ id: 'bins', updatedAt: 5000, completions: { on: { [DAY]: 5000 }, off: { [DAY]: 6000 } } });

    const res = mergeShared([mine], [theirs]);
    expect(res.toPush.map((t) => t.id)).toEqual(['bins']);
    expect(isDoneOn(res.toPush[0].completions, DAY)).toBe(false);
    expect(res.toPush[0].title).toBe('bins (green)'); // their edit still wins the row itself
  });

  // A plain add-set plus remove-set could never do this: once removed, removed forever. A household
  // ticking the bins, realising it was the wrong bin, then doing it properly is an ordinary Tuesday.
  it('lets a date be ticked AGAIN after it was un-ticked', () => {
    let log = tickOn(undefined, DAY, 1000);
    log = clearOn(log, DAY, 2000);
    expect(isDoneOn(log, DAY)).toBe(false);

    log = tickOn(log, DAY, 3000);
    expect(isDoneOn(log, DAY)).toBe(true);
    expect(completedDatesOf(log)).toEqual([DAY]);
  });

  it('gives the same answer whichever phone merges, and merging twice changes nothing', () => {
    const a = task({ id: 'x', updatedAt: 1, completions: { on: { [DAY]: 5000 } } });
    const b = task({ id: 'x', updatedAt: 2, completions: { on: { [DAY]: 5000 }, off: { [DAY]: 7000 } } });

    const ab = mergeShared([a], [b]).merged[0];
    const ba = mergeShared([b], [a]).merged[0];
    expect(ab.completions).toEqual(ba.completions);
    expect(isDoneOn(ab.completions, DAY)).toBe(false);

    // Idempotent: feeding the result back in must not flip anything.
    expect(mergeShared([ab], [ab]).merged[0].completions).toEqual(ab.completions);
  });

  // Kills the cheaper version of growsBeyond that counts KEYS instead of comparing stamps. Here the
  // server has the date ticked then cleared, and I have re-ticked it: the merged log has exactly as
  // many keys as theirs, so a count-based check pushes nothing and my re-tick never reaches them.
  it('pushes a RE-TICK that adds no new key, only a later stamp', () => {
    const theirs = task({ id: 'x', updatedAt: 9000, completions: { on: { [DAY]: 1000 }, off: { [DAY]: 2000 } } });
    const mine = task({ id: 'x', updatedAt: 1, completions: { on: { [DAY]: 3000 }, off: { [DAY]: 2000 } } });

    const res = mergeShared([mine], [theirs]);
    expect(res.toPush.map((t) => t.id)).toEqual(['x']);
    expect(isDoneOn(res.toPush[0].completions, DAY)).toBe(true);
  });

  it('keeps the LATER of two ticks on the same date rather than the first it happened to see', () => {
    const a = task({ id: 'x', updatedAt: 1, completions: { on: { [DAY]: 1000 } } });
    const b = task({ id: 'x', updatedAt: 1, completions: { on: { [DAY]: 8000 } } });
    expect(mergeShared([a], [b]).merged[0].completions?.on?.[DAY]).toBe(8000);
  });

  // Of the two ways to be wrong in a dead heat, "your finished work quietly un-finished itself" is
  // the one this audience cannot afford. Both are recoverable by tapping again; only one stings.
  it('resolves an exact tie in favour of DONE', () => {
    expect(isDoneOn({ on: { [DAY]: 5000 }, off: { [DAY]: 5000 } }, DAY)).toBe(true);
  });

  it('never calls a date done that was never ticked, whatever the off map says', () => {
    expect(isDoneOn({ off: { [DAY]: 5000 } }, DAY)).toBe(false);
    expect(isDoneOn(undefined, DAY)).toBe(false);
    expect(completedDatesOf({ off: { [DAY]: 5000 } })).toEqual([]);
  });

  it('leaves the log absent rather than empty when neither side has one', () => {
    const res = mergeShared([task({ id: 'x', updatedAt: 1 })], [task({ id: 'x', updatedAt: 2 })]);
    expect(res.merged[0].completions).toBeUndefined();
  });

  // The law again, at the level it is easiest to break by accident: the log is the one structure
  // that grows a key per event, so it is where a person's id would most plausibly get attached.
  it('records only DATES and TIMES, never a person', () => {
    const log = clearOn(tickOn(undefined, DAY, 1000), DAY, 2000);
    for (const side of [log.on ?? {}, log.off ?? {}]) {
      for (const [date, stamp] of Object.entries(side)) {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof stamp).toBe('number');
      }
    }
  });
});


// --- the fixes the Phase 3 audit asked for -------------------------------------------------

// The completion log protected repeats and left ONE-OFFS entirely outside it: their tick lives in
// done / doneAt, which rode whole-row last-write-wins. The field answer for this feature is "mostly
// one-offs with a few recurrences", so the protected case was the minority of the list.
describe('a one-off tick is protected too', () => {
  const T1 = 5000;
  const T2 = 9000;

  it('survives the other person’s newer unrelated edit, and is pushed back', () => {
    const mine = task({ id: 'milk', updatedAt: T1, done: true, doneAt: T1, completions: { on: { '2026-08-09': T1 } } });
    const theirs = task({ id: 'milk', updatedAt: T2, title: 'milk (oat)' });

    const res = mergeShared([mine], [theirs]);
    expect(res.merged[0].title).toBe('milk (oat)'); // their retitle still wins the row
    expect(res.merged[0].done).toBe(true); // and my tick is not collateral damage
    expect(res.merged[0].doneAt).toBe(T1);
    expect(res.toPush.map((t) => t.id)).toEqual(['milk']); // they get it back, not just me
  });

  it('survives the mirror case: an UN-tick against a newer retitle', () => {
    const mine = task({
      id: 'milk',
      updatedAt: T1,
      done: false,
      completions: { on: { '2026-08-09': T1 }, off: { '2026-08-09': T1 + 1 } },
    });
    const theirs = task({ id: 'milk', updatedAt: T2, title: 'milk (oat)', done: true, doneAt: T1 });

    const res = mergeShared([mine], [theirs]);
    expect(res.merged[0].title).toBe('milk (oat)');
    expect(res.merged[0].done).toBe(false);
    expect(res.merged[0].doneAt).toBeNull();
  });

  it('converges through tick, un-tick and re-tick whichever phone merges', () => {
    let log = tickOn(undefined, '2026-08-09', 1000);
    log = clearOn(log, '2026-08-09', 2000);
    log = tickOn(log, '2026-08-09', 3000);
    const a = task({ id: 'x', updatedAt: 1, completions: log });
    const b = task({ id: 'x', updatedAt: 2, title: 'edited' });

    expect(mergeShared([a], [b]).merged[0].done).toBe(true);
    expect(mergeShared([b], [a]).merged[0].done).toBe(true);
  });

  // A row that has never been ticked THROUGH the log must keep whatever last-write-wins decided, so
  // a client predating the log does not have its ticks erased by a client that has one.
  it('leaves a row with no completion log to plain last-write-wins', () => {
    const mine = task({ id: 'x', updatedAt: 9000, done: true, doneAt: 9000 });
    const theirs = task({ id: 'x', updatedAt: 1000, done: false });
    expect(mergeShared([mine], [theirs]).merged[0].done).toBe(true);
  });

  it('does NOT project done onto a repeat, whose done means something else', () => {
    const repeat = task({
      id: 'bins',
      updatedAt: 9000,
      done: false,
      recurrence: { kind: 'daily' },
      completions: { on: { '2026-08-09': 5000 } },
    });
    expect(mergeShared([repeat], [task({ id: 'bins', updatedAt: 1 })]).merged[0].done).toBe(false);
  });
});

// clearOn's docstring used to say the caller owed it a stamp later than the tick it clears. No
// caller could honour that: the tick was stamped by the other person's phone.
describe('the log defends its own stamps', () => {
  const DAY = '2026-08-09';
  const FUTURE = Date.UTC(2030, 0, 1);

  it('un-ticks a date whose tick is stamped in the future', () => {
    const log = clearOn({ on: { [DAY]: FUTURE } }, DAY, 1000);
    expect(isDoneOn(log, DAY)).toBe(false);
  });

  it('re-ticks a date whose un-tick is stamped in the future', () => {
    const log = tickOn({ on: { [DAY]: 1 }, off: { [DAY]: FUTURE } }, DAY, 1000);
    expect(isDoneOn(log, DAY)).toBe(true);
  });

  it('still uses the caller’s clock when it is already ahead', () => {
    expect(clearOn({ on: { [DAY]: 1000 } }, DAY, 5000).off?.[DAY]).toBe(5000);
    expect(tickOn({ off: { [DAY]: 1000 } }, DAY, 5000).on?.[DAY]).toBe(5000);
  });
});

// The column has a 64KB CHECK. When a log crosses it the 23514 poisons the whole batch upsert and
// nothing recovers, because even deleting the task keeps the payload on the tombstone.
describe('the completion log cannot outgrow its column', () => {
  function bigLog(n: number, from = 0) {
    const on: Record<string, number> = {};
    for (let i = 0; i < n; i += 1) on[new Date(Date.UTC(2020, 0, 1 + from + i)).toISOString().slice(0, 10)] = i + 1;
    return { on };
  }

  it('keeps the newest dates and drops the oldest', () => {
    const input = bigLog(900);
    const all = Object.keys(input.on).sort();
    const merged = mergeCompletions(input, undefined)!;
    const kept = Object.keys(merged.on ?? {}).sort();

    expect(kept).toHaveLength(COMPLETION_MAX_DATES);
    expect(kept[kept.length - 1]).toBe(all[all.length - 1]); // the newest survives
    expect(kept[0]).toBe(all[all.length - COMPLETION_MAX_DATES]); // the oldest 170 are gone
    expect(kept).toEqual(all.slice(-COMPLETION_MAX_DATES));
  });

  it('commutes: capping after the union equals capping each side first', () => {
    const a = bigLog(500);
    const b = bigLog(500, 400);
    const once = mergeCompletions(a, b);
    const twice = mergeCompletions(mergeCompletions(a, undefined), mergeCompletions(b, undefined));
    expect(once).toEqual(twice);
  });

  // A date must never survive as an un-tick whose tick has been forgotten, which would read as
  // never done rather than as history that has aged out.
  it('evicts a date from BOTH maps together', () => {
    const on: Record<string, number> = {};
    const off: Record<string, number> = {};
    for (let i = 0; i < 800; i += 1) {
      const d = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
      on[d] = 1;
      off[d] = 2;
    }
    const merged = mergeCompletions({ on, off }, undefined)!;
    expect(Object.keys(merged.on ?? {}).sort()).toEqual(Object.keys(merged.off ?? {}).sort());
  });
});

describe('ticking a shared row', () => {
  const DAY = '2026-08-09';
  const NOW = 5000;

  it('ticks and un-ticks a ONE-OFF, keeping done a projection of the log', () => {
    const t = task({ id: 'milk' });
    const ticked = setSharedDone(t, DAY, true, NOW);
    expect(ticked.done).toBe(true);
    expect(ticked.doneAt).toBe(NOW);
    expect(isSharedDoneOn(ticked, DAY)).toBe(true);

    const cleared = setSharedDone(ticked, DAY, false, NOW + 1);
    expect(cleared.done).toBe(false);
    expect(cleared.doneAt).toBeNull();
    expect(isSharedDoneOn(cleared, DAY)).toBe(false);
  });

  it('ticks and un-ticks a REPEAT per day, leaving the row itself not done', () => {
    const t = task({ id: 'bins', recurrence: { kind: 'daily' } });
    const ticked = setSharedDone(t, DAY, true, NOW);

    expect(isSharedDoneOn(ticked, DAY)).toBe(true);
    expect(isSharedDoneOn(ticked, '2026-08-10')).toBe(false); // tomorrow is its own day
    expect(ticked.done).toBe(false); // the ROW is never "done", only the day is

    expect(isSharedDoneOn(setSharedDone(ticked, DAY, false, NOW + 1), DAY)).toBe(false);
  });

  // The whole reason everything goes through the log. Un-ticking is why the finality affirmations
  // are withheld on Ours, and why two-party confirmation was refused.
  it('un-ticks even when the tick came from the other person’s clock, running ahead', () => {
    const theirs = task({ id: 'bins', recurrence: { kind: 'daily' }, completions: { on: { [DAY]: Date.UTC(2030, 0, 1) } } });
    expect(isSharedDoneOn(setSharedDone(theirs, DAY, false, NOW), DAY)).toBe(false);
  });

  it('bumps updatedAt so the write actually travels', () => {
    expect(setSharedDone(task({ id: 'x', updatedAt: 1 }), DAY, true, NOW).updatedAt).toBe(NOW);
  });

  it('survives a tick, un-tick, re-tick on one day', () => {
    let t = task({ id: 'x' });
    t = setSharedDone(t, DAY, true, 1000);
    t = setSharedDone(t, DAY, false, 2000);
    t = setSharedDone(t, DAY, true, 3000);
    expect(isSharedDoneOn(t, DAY)).toBe(true);
    expect(t.done).toBe(true);
  });
});

describe('the quiet wash', () => {
  const SEEN = 5000;
  const none = new Set<string>();

  it('washes only what changed since you last looked', () => {
    const tasks = [task({ id: 'old', updatedAt: 4000 }), task({ id: 'new', updatedAt: 6000 })];
    expect([...washedSince(tasks, SEEN, none)]).toEqual(['new']);
  });

  // The one that keeps the never-attribute law true on a purely visual feature. A wash on a row you
  // just wrote yourself reads as "they touched this too", which invents attribution from nothing.
  it('never washes a row YOU changed', () => {
    const tasks = [task({ id: 'mine', updatedAt: 9000 }), task({ id: 'theirs', updatedAt: 9000 })];
    expect([...washedSince(tasks, SEEN, new Set(['mine']))]).toEqual(['theirs']);
  });

  it('washes nothing on a first-ever visit, so opening a list is never a wall of highlights', () => {
    const tasks = [task({ id: 'a', updatedAt: 9000 }), task({ id: 'b', updatedAt: 9000 })];
    expect(washedSince(tasks, 0, none).size).toBe(0);
    expect(washedSince(tasks, Number.NaN, none).size).toBe(0);
  });

  it('treats a row stamped exactly at your last look as already seen', () => {
    expect(washedSince([task({ id: 'a', updatedAt: SEEN })], SEEN, none).size).toBe(0);
  });

  it('ignores a corrupt stamp rather than washing on it', () => {
    expect(washedSince([task({ id: 'a', updatedAt: Number.NaN })], SEEN, none).size).toBe(0);
  });

  it('names nobody and counts nothing: it returns ids and only ids', () => {
    const out = washedSince([task({ id: 'a', updatedAt: 9000 })], SEEN, none);
    expect([...out]).toEqual(['a']);
  });
});

// The bug an adversarial pass found and sixteen tests missed, because every one of them passed the
// SAME day to the tick and the un-tick. Across a day boundary, or across a timezone gap on the very
// first day, a one-off could be ticked and then never un-ticked again by anyone, on any phone.
describe('un-ticking a shared ONE-OFF on a different day than it was ticked', () => {
  const MON = '2026-08-10';
  const SUN = '2026-08-09';

  it('un-ticks on a LATER day than the tick', () => {
    const ticked = setSharedDone(task({ id: 'milk' }), SUN, true, 1000);
    const cleared = setSharedDone(ticked, MON, false, 2000);

    expect(cleared.done).toBe(false);
    expect(cleared.doneAt).toBeNull();
    expect(isSharedDoneOn(cleared, MON)).toBe(false);
    expect(isSharedDoneOn(cleared, SUN)).toBe(false); // the tick itself is gone, not just today's view
  });

  // The timezone case, which fires on day one: my phone says Sunday, theirs already says Monday.
  it('un-ticks on an EARLIER day than the tick', () => {
    const ticked = setSharedDone(task({ id: 'milk' }), MON, true, 1000);
    expect(setSharedDone(ticked, SUN, false, 2000).done).toBe(false);
  });

  it('clears a tick spread over several days, not merely the newest', () => {
    let t = task({ id: 'milk' });
    t = setSharedDone(t, '2026-08-01', true, 1000);
    t = setSharedDone(t, '2026-08-05', true, 2000);
    const cleared = setSharedDone(t, MON, false, 3000);

    expect(completedDatesOf(cleared.completions)).toEqual([]);
    expect(cleared.done).toBe(false);
  });

  it('can be ticked AGAIN after a cross-day un-tick', () => {
    const ticked = setSharedDone(task({ id: 'milk' }), SUN, true, 1000);
    const cleared = setSharedDone(ticked, MON, false, 2000);
    const again = setSharedDone(cleared, MON, true, 3000);

    expect(again.done).toBe(true);
    expect(isSharedDoneOn(again, MON)).toBe(true);
  });

  // The merge must not resurrect it: a stale copy still holding the tick loses to the clear.
  it('survives a merge against a copy that still holds the old tick', () => {
    const ticked = setSharedDone(task({ id: 'milk', updatedAt: 1000 }), SUN, true, 1000);
    const cleared = setSharedDone(ticked, MON, false, 2000);

    expect(mergeShared([cleared], [ticked]).merged[0].done).toBe(false);
    expect(mergeShared([ticked], [cleared]).merged[0].done).toBe(false); // order cannot matter
  });

  it('leaves a REPEAT per-day, where one date IS the right scope', () => {
    const bins = task({ id: 'bins', recurrence: { kind: 'daily' } });
    const ticked = setSharedDone(setSharedDone(bins, SUN, true, 1000), MON, true, 2000);
    const cleared = setSharedDone(ticked, MON, false, 3000);

    expect(isSharedDoneOn(cleared, MON)).toBe(false);
    expect(isSharedDoneOn(cleared, SUN)).toBe(true); // Sunday's finish is still Sunday's
  });
});
