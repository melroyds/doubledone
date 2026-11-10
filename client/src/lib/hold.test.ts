import { describe, expect, it } from 'vitest';

import { DAILY_FOLLOW_UP, escalationTimes, heldOnToday, holdOutcome, holdRequiresSwap, holdStepAt, type HoldWaits, LADDER_OFFSETS_MIN, parseHoldContract, shiftOutOfQuiet } from './hold';
import { type Recurrence } from './recurrence';

// Local-time constructor, matching how the engine reads the clock.
const at = (h: number, m = 0, day = 16) => new Date(2026, 7, day, h, m); // Aug 2026

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('shiftOutOfQuiet', () => {
  it('leaves the waking day alone', () => {
    expect(shiftOutOfQuiet(at(9, 0))).toEqual(at(9, 0));
    expect(shiftOutOfQuiet(at(21, 29))).toEqual(at(21, 29));
    expect(shiftOutOfQuiet(at(8, 30))).toEqual(at(8, 30));
  });

  it('moves a late-evening time to the NEXT morning, not the same one', () => {
    expect(shiftOutOfQuiet(at(21, 30))).toEqual(at(8, 30, 17));
    expect(shiftOutOfQuiet(at(23, 59))).toEqual(at(8, 30, 17));
  });

  it('moves a small-hours time to that same morning', () => {
    expect(shiftOutOfQuiet(at(3, 15))).toEqual(at(8, 30, 16));
    expect(shiftOutOfQuiet(at(0, 0))).toEqual(at(8, 30, 16));
    expect(shiftOutOfQuiet(at(8, 29))).toEqual(at(8, 30, 16));
  });
});

describe('escalationTimes', () => {
  // The happy path: an afternoon hold gets the full ladder, untouched.
  it('gives an afternoon hold four distinct steps at the documented offsets', () => {
    const steps = escalationTimes(at(13, 0));
    expect(steps.map(hhmm)).toEqual(['13:30', '14:30', '16:00', '19:00']);
    expect(LADDER_OFFSETS_MIN).toHaveLength(steps.length);
  });

  // The design promise in the header: an evening hold becomes ONE morning knock, never four
  // notifications in a row at breakfast.
  it('collapses an evening hold to a single morning step', () => {
    const steps = escalationTimes(at(22, 0)); // every offset lands in quiet hours
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual(at(8, 30, 17));
  });

  it('keeps the late steps that clear quiet hours on their own', () => {
    // 20:00 hold: +30 = 20:30 ok, +90 = 21:30 shifts, +3h = 23:00 shifts (dropped, same 08:30),
    // +6h = 02:00 next day, shifts to that day's 08:30 (also dropped).
    const steps = escalationTimes(at(20, 0));
    expect(steps.map(hhmm)).toEqual(['20:30', '08:30']);
    expect(steps[1].getDate()).toBe(17);
  });

  it('is always ascending and always after the hold moment', () => {
    for (const h of [0, 3, 7, 9, 12, 15, 18, 21, 23]) {
      const held = at(h, 10);
      const steps = escalationTimes(held);
      expect(steps.length).toBeGreaterThan(0);
      let prev = held;
      for (const s of steps) {
        expect(s.getTime()).toBeGreaterThan(prev.getTime());
        prev = s;
      }
    }
  });

  // The predictability promise (the autistic side of the audience): same hold time, same ladder,
  // every time. No randomness anywhere.
  it('is deterministic', () => {
    expect(escalationTimes(at(13, 0))).toEqual(escalationTimes(at(13, 0)));
  });
});

describe('the daily follow-up', () => {
  it('deliberately avoids the daily reminder’s default hour', () => {
    expect(DAILY_FOLLOW_UP.hour).toBe(9);
    expect(DAILY_FOLLOW_UP.minute).toBe(30); // 9:00 would stack on the daily reminder
  });
});

describe('holdRequiresSwap (one contract at a time)', () => {
  const contract = { taskId: 't1', title: 'Call the dentist', heldAt: 0, notifIds: ['a'] };

  it('asks before replacing a DIFFERENT held task', () => {
    expect(holdRequiresSwap(contract, 't2')).toBe(true);
  });

  it('never asks when nothing is held, or when re-holding the same task', () => {
    expect(holdRequiresSwap(null, 't1')).toBe(false);
    expect(holdRequiresSwap(contract, 't1')).toBe(false);
  });
});

describe('holdStepAt (the moat resolution)', () => {
  const held = at(13, 0); // steps 13:30, 14:30, 16:00, 19:00

  it('counts the knocks that have actually fired', () => {
    expect(holdStepAt(held, at(13, 10))).toBe(0); // before the first
    expect(holdStepAt(held, at(13, 30))).toBe(1);
    expect(holdStepAt(held, at(15, 0))).toBe(2);
    expect(holdStepAt(held, at(19, 0))).toBe(4);
  });

  it('keeps counting through the daily follow-up, one per morning', () => {
    expect(holdStepAt(held, at(9, 31, 17))).toBe(5); // next day, after 09:30
    expect(holdStepAt(held, at(9, 29, 17))).toBe(4); // next day, before it
    expect(holdStepAt(held, at(9, 31, 19))).toBe(7);
  });

  it('caps, so telemetry can never carry an unbounded number', () => {
    expect(holdStepAt(held, new Date(2027, 7, 16))).toBe(30);
  });
});

// Bug #8 (2026-11-01): every path below used to leave the contract knocking each morning about a task
// that was no longer on Today, with "Let it go" nowhere on screen to stop it.
describe('the watcher: heldOnToday and holdOutcome', () => {
  type Row = {
    id: string;
    done: boolean;
    due?: string | null;
    completedAt?: number | null;
    createdAt?: number;
    recurrence?: Recurrence;
    completedDates?: string[];
    skippedDates?: string[];
    deletedAt?: number | null;
    silentParent?: boolean;
    openParent?: boolean;
    parentId?: string;
  };
  const sunday = at(10, 0); // 2026-08-16 is a Sunday
  const monday = at(10, 0, 17);
  const row = (id: string, extra: Partial<Row> = {}): Row => ({ id, done: false, ...extra });
  const heldRow = (extra: Partial<Row> = {}) => row('held', extra);
  const outcome = (tasks: Row[], date = sunday, waits: HoldWaits = {}) => holdOutcome(tasks, 'held', date, waits);

  it('keeps an open task that is on Today, today and after the day rolls', () => {
    expect(heldOnToday([heldRow()], 'held', sunday)).toBe(true);
    expect(outcome([heldRow()])).toBe('keep');
    expect(outcome([heldRow()], monday)).toBe('keep'); // undated: still today's
    expect(outcome([heldRow({ due: '2026-08-10' })], monday)).toBe('keep'); // overdue rolls forward, calmly
    expect(outcome([heldRow({ recurrence: { kind: 'daily' } })], monday)).toBe('keep'); // due again tomorrow
  });

  it('completes on a tick, a one-off or a repeat’s day', () => {
    expect(outcome([heldRow({ done: true, completedAt: sunday.getTime() })])).toBe('completed');
    expect(outcome([heldRow({ recurrence: { kind: 'daily' }, completedDates: ['2026-08-16'] })])).toBe('completed');
  });

  it('counts a task finished and then removed as finished', () => {
    expect(outcome([heldRow({ done: true, completedAt: sunday.getTime(), deletedAt: sunday.getTime() + 1 })])).toBe('completed');
  });

  it('releases a task that has left Today', () => {
    expect(heldOnToday([], 'held', sunday)).toBe(false);
    expect(outcome([])).toBe('released'); // missing
    expect(outcome([heldRow({ deletedAt: 1 })])).toBe('released'); // Remove, Combine, a delete synced from another device
    const brokenDown = [heldRow({ silentParent: true, openParent: false }), row('s1', { parentId: 'held' }), row('s2', { parentId: 'held' })];
    expect(outcome(brokenDown)).toBe('released'); // Break it down: its steps are on Today, the task is not
    expect(outcome([heldRow({ due: '2026-08-20' })])).toBe('released'); // Move to, or Lighten today
    expect(outcome([heldRow({ recurrence: { kind: 'weekly', weekdays: [0] } })], monday)).toBe('released'); // a repeat not due today
    expect(outcome([heldRow({ recurrence: { kind: 'daily' }, skippedDates: ['2026-08-16'] })])).toBe('released'); // a repeat removed from today
  });

  it('waits out Remove’s Undo, so Undo finds the contract and every knock where they were', () => {
    const removed = [heldRow({ deletedAt: 1 })];
    expect(outcome(removed, sunday, { undoable: ['held'] })).toBe('keep');
    expect(outcome(removed, sunday, { undoable: ['other'] })).toBe('released'); // the Undo bar moved on to another task
    expect(outcome(removed, sunday, { undoable: null })).toBe('released'); // the window closed
    expect(outcome([heldRow()], sunday, { undoable: null })).toBe('keep'); // Undo was tapped: back on Today
  });

  it('waits while the swap question naming it is on screen, and a finish still finishes', () => {
    expect(outcome([heldRow({ deletedAt: 1 })], sunday, { asking: true })).toBe('keep');
    expect(outcome([heldRow({ done: true, completedAt: sunday.getTime() })], sunday, { asking: true })).toBe('completed');
  });

  describe('Make it tiny', () => {
    const tinyParent = heldRow({ silentParent: true, openParent: true, createdAt: 1 });
    const pebble = (extra: Partial<Row> = {}) => row('pebble', { parentId: 'held', createdAt: 2, ...extra });

    it('stands on Today through its pebble, because the real task always comes back', () => {
      expect(heldOnToday([tinyParent, pebble()], 'held', sunday)).toBe(true);
      expect(outcome([tinyParent, pebble()])).toBe('keep');
      expect(heldOnToday([tinyParent, pebble({ deletedAt: 3 })], 'held', sunday)).toBe(true); // removed: the repair brings it back
      expect(heldOnToday([tinyParent, pebble({ done: true, completedAt: 5 })], 'held', sunday)).toBe(true); // finished elsewhere: same
      const pebbleBrokenDown = [tinyParent, pebble({ silentParent: true }), row('step', { parentId: 'pebble', createdAt: 3 })];
      expect(heldOnToday(pebbleBrokenDown, 'held', sunday)).toBe(true);
    });

    it('leaves Today when its pebble went to a later day, or when the task itself was removed', () => {
      expect(outcome([tinyParent, pebble({ due: '2026-08-20' })])).toBe('released');
      expect(outcome([{ ...tinyParent, deletedAt: 3 }, pebble()])).toBe('released');
    });

    it('reads a stale tiny flag on a breakdown as the breakdown it is', () => {
      expect(outcome([tinyParent, pebble(), row('second', { parentId: 'held', createdAt: 3 })])).toBe('released');
    });
  });
});

// The stored contract is read by Today (storage's loadHold) AND by the headless widget, which reads the raw value
// itself. One parser, so the two can never disagree about whether a task is held.
describe('parseHoldContract', () => {
  const good = { taskId: 't1', title: 'Call the bank', heldAt: 1000, notifIds: ['n1', 'n2'] };

  it('reads a well-formed contract', () => {
    expect(parseHoldContract(JSON.stringify(good))).toEqual(good);
  });

  it('reads nothing stored as no contract', () => {
    expect(parseHoldContract(null)).toBeNull();
  });

  it('keeps only the string notification ids, and an absent list as empty', () => {
    expect(parseHoldContract(JSON.stringify({ ...good, notifIds: ['n1', 5, null, 'n2'] }))?.notifIds).toEqual(['n1', 'n2']);
    expect(parseHoldContract(JSON.stringify({ taskId: 't1', title: 'x', heldAt: 1 }))?.notifIds).toEqual([]);
  });

  it('reads junk or a half-written shape as no contract, never a throw', () => {
    for (const raw of ['not json', 'null', '5', '[]', JSON.stringify({ title: 'x', heldAt: 1 }), JSON.stringify({ taskId: 't1', heldAt: 1 }), JSON.stringify({ taskId: 't1', title: 'x', heldAt: '1' })]) {
      expect(parseHoldContract(raw)).toBeNull();
    }
  });
});
