import { describe, expect, it } from 'vitest';

import { asRecurrence, dayOfWeek, daysBetween, isDueOn, recurringDueToday } from './cadence';

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
