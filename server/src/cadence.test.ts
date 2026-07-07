import { describe, expect, it } from 'vitest';

import { asRecurrence, buildRecurrence, dayOfWeek, daysBetween, isDueOn, recurringDueToday, type RepeatSpec } from './cadence';

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
    expect(buildRecurrence({ kind: 'monthly' }, today)).toBeNull();
    expect(buildRecurrence({ kind: 'daily', start: 'not-a-date' }, today)).toBeNull();
    expect(buildRecurrence({ kind: 'daily', start: 123 }, today)).toBeNull();
    expect(buildRecurrence(null, today)).toBeNull();
    expect(buildRecurrence(undefined, today)).toBeNull();
    // A non-object (a bare string) is junk an agent could send; it must narrow to null, not throw.
    expect(buildRecurrence('daily' as unknown as RepeatSpec, today)).toBeNull();
    expect(buildRecurrence({}, today)).toBeNull();
  });

  it('the built recurrence round-trips through asRecurrence + isDueOn (shape parity with the app)', () => {
    const r = buildRecurrence({ kind: 'weekly', weekdays: [6] }, today); // today is a Saturday
    expect(r).not.toBeNull();
    expect(asRecurrence(r)).toEqual(r); // the built shape is a valid internal Recurrence
    expect(isDueOn(r!, today)).toBe(true); // and it reads as due on its weekday
  });
});
