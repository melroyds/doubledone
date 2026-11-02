import { describe, expect, it } from 'vitest';

import { asRecurrence, buildRecurrence, dayOfWeek, daysBetween, isDueOn, recurringDueToday, reopenForRepeat, tickForDay, type RepeatSpec } from './cadence';

describe('date helpers (UTC calendar days)', () => {
  it('daysBetween counts whole days, signed, NaN on junk', () => {
    expect(daysBetween('2026-06-18', '2026-06-20')).toBe(2);
    expect(daysBetween('2026-06-20', '2026-06-18')).toBe(-2);
    expect(daysBetween('2026-06-20', '2026-06-20')).toBe(0);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // 2026 is not a leap year
    expect(Number.isNaN(daysBetween('nope', '2026-06-20'))).toBe(true);
  });
  it('dayOfWeek is 0=Sun..6=Sat, -1 on junk', () => {
    expect(dayOfWeek('2026-06-20')).toBe(6); // Saturday (the fixture day the mcp test relies on)
    expect(dayOfWeek('2026-06-21')).toBe(0); // Sunday
    expect(dayOfWeek('2026-06-22')).toBe(1); // Monday
    expect(dayOfWeek('bad')).toBe(-1);
  });
});

describe('isDueOn', () => {
  const today = '2026-06-20'; // Saturday
  it('daily is due once started', () => {
    expect(isDueOn({ kind: 'daily' }, today)).toBe(true);
    expect(isDueOn({ kind: 'daily', start: '2026-06-01' }, today)).toBe(true);
    expect(isDueOn({ kind: 'daily', start: '2026-07-01' }, today)).toBe(false); // future start
  });
  it('weekly is due only on its weekdays, once started', () => {
    expect(isDueOn({ kind: 'weekly', weekdays: [6] }, today)).toBe(true); // Sat
    expect(isDueOn({ kind: 'weekly', weekdays: [1, 3, 5] }, today)).toBe(false); // Mon/Wed/Fri
    expect(isDueOn({ kind: 'weekly', weekdays: [6], start: '2026-07-01' }, today)).toBe(false);
  });
  it('interval is due every N days from the anchor, never before it', () => {
    expect(isDueOn({ kind: 'interval', days: 2, anchor: '2026-06-18' }, today)).toBe(true); // +2
    expect(isDueOn({ kind: 'interval', days: 2, anchor: '2026-06-19' }, today)).toBe(false); // +1
    expect(isDueOn({ kind: 'interval', days: 1, anchor: '2026-06-20' }, today)).toBe(true); // every day, day 0
    expect(isDueOn({ kind: 'interval', days: 2, anchor: '2026-06-22' }, today)).toBe(false); // anchor in future
    expect(isDueOn({ kind: 'interval', days: 0, anchor: '2026-06-20' }, today)).toBe(false); // guard: 0 never divides
  });
  it('none is never a recurring due', () => {
    expect(isDueOn({ kind: 'none' }, today)).toBe(false);
  });
});

describe('asRecurrence (defensive JSONB narrowing)', () => {
  it('accepts the three real kinds', () => {
    expect(asRecurrence({ kind: 'daily', start: '2026-06-01' })).toEqual({ kind: 'daily', start: '2026-06-01' });
    expect(asRecurrence({ kind: 'weekly', weekdays: [1, 5] })).toEqual({ kind: 'weekly', weekdays: [1, 5], start: undefined });
    expect(asRecurrence({ kind: 'interval', days: 3, anchor: '2026-06-01' })).toEqual({ kind: 'interval', days: 3, anchor: '2026-06-01' });
  });
  it('rejects none, null, and malformed shapes', () => {
    expect(asRecurrence({ kind: 'none' })).toBeNull();
    expect(asRecurrence(null)).toBeNull();
    expect(asRecurrence('daily')).toBeNull();
    expect(asRecurrence({ kind: 'weekly' })).toBeNull(); // no weekdays
    expect(asRecurrence({ kind: 'weekly', weekdays: ['x'] })).toBeNull();
    expect(asRecurrence({ kind: 'interval', anchor: '2026-06-01' })).toBeNull(); // no days
  });
});

describe('recurringDueToday (the whole MCP list rule)', () => {
  const today = '2026-06-20';
  it('true only when due today and not done/skipped today', () => {
    expect(recurringDueToday({ kind: 'daily' }, [], [], today)).toBe(true);
    expect(recurringDueToday({ kind: 'daily' }, [today], [], today)).toBe(false); // done today
    expect(recurringDueToday({ kind: 'daily' }, [], [today], today)).toBe(false); // skipped today
    expect(recurringDueToday({ kind: 'daily' }, ['2026-06-19'], [], today)).toBe(true); // done a different day
    expect(recurringDueToday({ kind: 'weekly', weekdays: [1] }, [], [], today)).toBe(false); // not due (Mon vs Sat)
    expect(recurringDueToday(null, [], [], today)).toBe(false); // not recurring
    expect(recurringDueToday({ kind: 'none' }, [], [], today)).toBe(false);
  });
  it('tolerates non-array completed/skipped', () => {
    expect(recurringDueToday({ kind: 'daily' }, null, undefined, today)).toBe(true);
  });
});

describe('buildRecurrence (the MCP repeat -> internal Recurrence gate)', () => {
  const today = '2026-06-20';

  it('daily carries a start, defaulting to today, mirroring scheduleFields', () => {
    expect(buildRecurrence({ kind: 'daily' }, today)).toEqual({ kind: 'daily', start: today });
    expect(buildRecurrence({ kind: 'daily', start: '2026-07-01' }, today)).toEqual({ kind: 'daily', start: '2026-07-01' });
  });

  it('weekly needs a non-empty weekdays array of ints 0..6, and carries a start', () => {
    expect(buildRecurrence({ kind: 'weekly', weekdays: [1, 3, 5] }, today)).toEqual({
      kind: 'weekly',
      weekdays: [1, 3, 5],
      start: today,
    });
    expect(buildRecurrence({ kind: 'weekly', weekdays: [6], start: '2026-07-01' }, today)).toEqual({
      kind: 'weekly',
      weekdays: [6],
      start: '2026-07-01',
    });
    // Malformed weekly -> null (the tool turns this into a calm error, never a 500).
    expect(buildRecurrence({ kind: 'weekly' }, today)).toBeNull(); // no weekdays
    expect(buildRecurrence({ kind: 'weekly', weekdays: [] }, today)).toBeNull(); // empty
    expect(buildRecurrence({ kind: 'weekly', weekdays: [7] }, today)).toBeNull(); // out of range
    expect(buildRecurrence({ kind: 'weekly', weekdays: [-1] }, today)).toBeNull(); // out of range
    expect(buildRecurrence({ kind: 'weekly', weekdays: [1.5] }, today)).toBeNull(); // non-integer
    expect(buildRecurrence({ kind: 'weekly', weekdays: ['1'] }, today)).toBeNull(); // wrong type
  });

  it('every_n_days needs an integer days >= 1 and becomes an interval anchored to start ?? today', () => {
    expect(buildRecurrence({ kind: 'every_n_days', days: 2 }, today)).toEqual({ kind: 'interval', days: 2, anchor: today });
    expect(buildRecurrence({ kind: 'every_n_days', days: 3, start: '2026-07-01' }, today)).toEqual({
      kind: 'interval',
      days: 3,
      anchor: '2026-07-01',
    });
    expect(buildRecurrence({ kind: 'every_n_days' }, today)).toBeNull(); // no days
    expect(buildRecurrence({ kind: 'every_n_days', days: 0 }, today)).toBeNull(); // < 1
    expect(buildRecurrence({ kind: 'every_n_days', days: -2 }, today)).toBeNull();
    expect(buildRecurrence({ kind: 'every_n_days', days: 1.5 }, today)).toBeNull(); // non-integer
  });

  it('rejects an unknown kind, a bad start, and non-objects (null, never throws)', () => {
    // 'monthly' USED to be the unknown-kind example here, and it is now supported (2026-08-19), so
    // this reaches for one that is genuinely not in the vocabulary. Worth keeping a real unknown:
    // the point of the case is that an agent inventing a cadence gets a calm null, not a 500.
    expect(buildRecurrence({ kind: 'yearly' }, today)).toBeNull();
    expect(buildRecurrence({ kind: 'daily', start: 'not-a-date' }, today)).toBeNull();
    expect(buildRecurrence({ kind: 'daily', start: 123 }, today)).toBeNull();
    expect(buildRecurrence(null, today)).toBeNull();
    expect(buildRecurrence(undefined, today)).toBeNull();
    // A non-object (a bare string) is junk an agent could send; it must narrow to null, not throw.
    expect(buildRecurrence('daily' as unknown as RepeatSpec, today)).toBeNull();
    expect(buildRecurrence({}, today)).toBeNull();
  });

  // #29 (2026-11-01): the start used to be checked on its first ten characters only, so a datetime passed and
  // the app, which splits a start on '-', read it as no date and never showed the repeat. A real day or nothing.
  it('refuses a start that is a datetime, or not a real calendar day, for every kind', () => {
    for (const start of ['2026-11-01T10:00:00Z', '2026-11-01T00:00', '2026-11-01 ', '2026-02-30', '2026-13-01', '2026-1-05']) {
      expect(buildRecurrence({ kind: 'daily', start }, today), start).toBeNull();
      expect(buildRecurrence({ kind: 'weekly', weekdays: [1], start }, today), start).toBeNull();
      expect(buildRecurrence({ kind: 'every_n_days', days: 2, start }, today), start).toBeNull();
      expect(buildRecurrence({ kind: 'monthly', start } as RepeatSpec, today), start).toBeNull();
    }
    // A plain real day still works, leap day included.
    expect(buildRecurrence({ kind: 'daily', start: '2028-02-29' }, today)).toEqual({ kind: 'daily', start: '2028-02-29' });
  });

  it('the built recurrence round-trips through asRecurrence + isDueOn (shape parity with the app)', () => {
    const r = buildRecurrence({ kind: 'weekly', weekdays: [6] }, today); // today is a Saturday
    expect(r).not.toBeNull();
    expect(asRecurrence(r)).toEqual(r); // the built shape is a valid internal Recurrence
    expect(isDueOn(r!, today)).toBe(true); // and it reads as due on its weekday
  });
});

describe('monthly (client parity)', () => {
  const on = (day: number, start?: string) => ({ kind: 'monthly' as const, day, start });

  it('lands on its day, and clamps a short month to its last day rather than skipping', () => {
    expect(isDueOn(on(15), '2026-06-15')).toBe(true);
    expect(isDueOn(on(15), '2026-06-16')).toBe(false);
    expect(isDueOn(on(31), '2026-02-28')).toBe(true); // clamped
    expect(isDueOn(on(31), '2026-02-27')).toBe(false);
    expect(isDueOn(on(31), '2026-04-30')).toBe(true);
    expect(isDueOn(on(31), '2026-01-31')).toBe(true); // no clamp needed
    expect(isDueOn(on(30), '2028-02-29')).toBe(true); // leap year
  });

  it('respects a start date', () => {
    expect(isDueOn(on(15, '2026-07-01'), '2026-06-15')).toBe(false);
    expect(isDueOn(on(15, '2026-07-01'), '2026-07-15')).toBe(true);
  });

  it('round-trips through the JSONB narrowing, and refuses a nonsense day', () => {
    expect(asRecurrence({ kind: 'monthly', day: 15, start: '2026-06-01' })).toEqual({ kind: 'monthly', day: 15, start: '2026-06-01' });
    expect(asRecurrence({ kind: 'monthly', day: 0 })).toBeNull();
    expect(asRecurrence({ kind: 'monthly', day: 32 })).toBeNull();
    expect(asRecurrence({ kind: 'monthly', day: 1.5 })).toBeNull();
    expect(asRecurrence({ kind: 'monthly' })).toBeNull();
  });

  // An agent saying "monthly" with no day means the day it is saying it on, which mirrors the app,
  // where choosing Monthly defaults to today's day of the month.
  it('builds from an agent repeat spec, defaulting the day to the start', () => {
    expect(buildRecurrence({ kind: 'monthly' } as RepeatSpec, '2026-06-17')).toEqual({ kind: 'monthly', day: 17, start: '2026-06-17' });
    expect(buildRecurrence({ kind: 'monthly', day: 1 } as RepeatSpec, '2026-06-17')).toEqual({ kind: 'monthly', day: 1, start: '2026-06-17' });
    expect(buildRecurrence({ kind: 'monthly', day: 1, start: '2026-09-01' } as RepeatSpec, '2026-06-17')).toEqual({ kind: 'monthly', day: 1, start: '2026-09-01' });
  });

  it('refuses a malformed agent spec with null rather than throwing', () => {
    expect(buildRecurrence({ kind: 'monthly', day: 0 } as RepeatSpec, '2026-06-17')).toBeNull();
    expect(buildRecurrence({ kind: 'monthly', day: 32 } as RepeatSpec, '2026-06-17')).toBeNull();
    expect(buildRecurrence({ kind: 'monthly', day: 'first' } as RepeatSpec, '2026-06-17')).toBeNull();
    expect(buildRecurrence({ kind: 'monthly', start: 'not-a-day' } as RepeatSpec, '2026-06-17')).toBeNull();
  });
});

describe('tickForDay (PR B: a repeat is ticked for a day, never closed)', () => {
  it('adds the day once, and reports an already-ticked day as a no-op', () => {
    expect(tickForDay(['2026-09-01'], '2026-09-25', true)).toEqual({ dates: ['2026-09-01', '2026-09-25'], already: false });
    expect(tickForDay(['2026-09-25'], '2026-09-25', true)).toEqual({ dates: ['2026-09-25'], already: true });
  });
  it('removes the day on an un-tick, and reports a day that was never ticked as a no-op', () => {
    expect(tickForDay(['2026-09-01', '2026-09-25'], '2026-09-25', false)).toEqual({ dates: ['2026-09-01'], already: false });
    expect(tickForDay(['2026-09-01'], '2026-09-25', false)).toEqual({ dates: ['2026-09-01'], already: true });
  });
  it('treats junk (null, non-array, non-string entries) as empty rather than throwing', () => {
    expect(tickForDay(null, '2026-09-25', true)).toEqual({ dates: ['2026-09-25'], already: false });
    expect(tickForDay([1, null, '2026-09-25'], '2026-09-25', true)).toEqual({ dates: ['2026-09-25'], already: true });
  });
});

describe('reopenForRepeat (#23: a repeat set on a done task)', () => {
  it("keeps the finish on the day the caller names (the user's local date), not completed_at's UTC day", () => {
    // Ticked at 08:30 on Mon 2 Nov in Melbourne (UTC+11) is Sun 1 Nov 21:30 UTC.
    const row = { done: true, completed_at: '2026-11-01T21:30:00+00:00', completed_dates: null };
    expect(reopenForRepeat(row)?.day).toBe('2026-11-01');
    expect(reopenForRepeat(row, '2026-11-02')).toEqual({ day: '2026-11-02', dates: ['2026-11-02'] });
    // A day that is not a real calendar day is ignored, never stored.
    expect(reopenForRepeat(row, '2026-02-30')?.day).toBe('2026-11-01');
    expect(reopenForRepeat(row, '2026-11-02T08:30')?.day).toBe('2026-11-01');
  });

  it('is null for a task that is not done: nothing to reopen', () => {
    expect(reopenForRepeat({ done: false, completed_at: '2026-10-30T09:00:00+00:00' })).toBeNull();
    expect(reopenForRepeat({})).toBeNull();
    expect(reopenForRepeat({ done: 'true' })).toBeNull();
  });

  it("keeps the finish as a tick on completed_at's UTC day", () => {
    expect(reopenForRepeat({ done: true, completed_at: '2026-10-30T21:15:00+00:00', completed_dates: null })).toEqual({
      day: '2026-10-30',
      dates: ['2026-10-30'],
    });
    // An offset timestamp is read as the instant it names, so the day is UTC's.
    expect(reopenForRepeat({ done: true, completed_at: '2026-10-31T07:30:00+11:00' })?.day).toBe('2026-10-30');
  });

  it("adds to ticks the row already carries, once, never dropping one (the app's merge keeps them all anyway)", () => {
    expect(reopenForRepeat({ done: true, completed_at: '2026-10-30T09:00:00Z', completed_dates: ['2026-10-01'] })?.dates).toEqual(['2026-10-01', '2026-10-30']);
    expect(reopenForRepeat({ done: true, completed_at: '2026-10-30T09:00:00Z', completed_dates: ['2026-10-30'] })?.dates).toEqual(['2026-10-30']);
  });

  it("falls back to updated_at's day, as the app's Lookback does, and invents no tick when neither reads", () => {
    expect(reopenForRepeat({ done: true, completed_at: null, updated_at: '2026-09-02T03:00:00+00:00' })).toEqual({ day: '2026-09-02', dates: ['2026-09-02'] });
    expect(reopenForRepeat({ done: true, completed_at: 'garbled', updated_at: 'also garbled' })).toEqual({ day: null, dates: null });
  });

  it("#24: with the account's time zone, the finish lands on the day it was in that zone, and a named day still wins", () => {
    // 21:30 UTC on Sun 1 Nov is 08:30 on Mon 2 Nov in Melbourne.
    const row = { done: true, completed_at: '2026-11-01T21:30:00+00:00', updated_at: '2026-09-01T23:00:00+00:00', completed_dates: null };
    expect(reopenForRepeat(row, undefined, 'Australia/Melbourne')).toEqual({ day: '2026-11-02', dates: ['2026-11-02'] });
    expect(reopenForRepeat(row, '2026-11-01', 'Australia/Melbourne')?.day).toBe('2026-11-01');
    expect(reopenForRepeat({ ...row, completed_at: null }, undefined, 'Australia/Melbourne')?.day).toBe('2026-09-02');
    // No zone, or one that does not validate, is the UTC day as before.
    expect(reopenForRepeat(row, undefined, null)?.day).toBe('2026-11-01');
    expect(reopenForRepeat(row, undefined, 'Mars/Olympus_Mons')?.day).toBe('2026-11-01');
  });
});
