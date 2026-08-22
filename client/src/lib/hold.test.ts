import { describe, expect, it } from 'vitest';

import { DAILY_FOLLOW_UP, escalationTimes, holdRequiresSwap, LADDER_OFFSETS_MIN, shiftOutOfQuiet } from './hold';

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
