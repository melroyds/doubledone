import { describe, expect, it } from 'vitest';

import { addDaysISO, daysBetween, formatTodayLabel, isSameDay, startOfDay, toISODate } from './day';

describe('startOfDay', () => {
  it('zeroes the time but keeps the calendar date', () => {
    const d = new Date(2026, 5, 17, 14, 33, 12, 500); // 17 Jun 2026, 14:33
    const s = startOfDay(d);
    expect(s.getFullYear()).toBe(2026);
    expect(s.getMonth()).toBe(5);
    expect(s.getDate()).toBe(17);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(s.getMilliseconds()).toBe(0);
  });

  it('does not mutate its argument', () => {
    const d = new Date(2026, 5, 17, 9, 0, 0);
    startOfDay(d);
    expect(d.getHours()).toBe(9);
  });
});

describe('isSameDay', () => {
  it('is true for two times on the same calendar day', () => {
    expect(isSameDay(new Date(2026, 5, 17, 0, 0), new Date(2026, 5, 17, 23, 59))).toBe(true);
  });

  it('is false one minute after midnight into the next day', () => {
    expect(isSameDay(new Date(2026, 5, 17, 23, 59), new Date(2026, 5, 18, 0, 1))).toBe(false);
  });

  it('is false for the same day-of-month in a different month or year', () => {
    expect(isSameDay(new Date(2026, 5, 17), new Date(2026, 6, 17))).toBe(false);
    expect(isSameDay(new Date(2025, 5, 17), new Date(2026, 5, 17))).toBe(false);
  });
});

describe('daysBetween', () => {
  it('is 0 for two times on the same day', () => {
    expect(daysBetween(new Date(2026, 5, 17, 1, 0), new Date(2026, 5, 17, 22, 0))).toBe(0);
  });

  it('counts forward and backward', () => {
    expect(daysBetween(new Date(2026, 5, 17), new Date(2026, 5, 18))).toBe(1);
    expect(daysBetween(new Date(2026, 5, 17), new Date(2026, 5, 24))).toBe(7);
    expect(daysBetween(new Date(2026, 5, 17), new Date(2026, 5, 14))).toBe(-3);
  });

  it('crosses a month boundary correctly', () => {
    // 30 Jun -> 2 Jul is two days regardless of month length.
    expect(daysBetween(new Date(2026, 5, 30), new Date(2026, 6, 2))).toBe(2);
  });

  it('ignores the time of day on either end', () => {
    // Late on day 1 to early on day 2 is still exactly one calendar day.
    expect(daysBetween(new Date(2026, 5, 17, 23, 30), new Date(2026, 5, 18, 0, 30))).toBe(1);
  });
});

describe('formatTodayLabel', () => {
  it('returns a non-empty string', () => {
    expect(formatTodayLabel(new Date(2026, 5, 17)).length).toBeGreaterThan(0);
  });

  it('matches for the same day and differs across days (locale-agnostic)', () => {
    const a = formatTodayLabel(new Date(2026, 5, 17, 8));
    const b = formatTodayLabel(new Date(2026, 5, 17, 20));
    const c = formatTodayLabel(new Date(2026, 5, 18, 8));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('toISODate', () => {
  it('formats a local date as YYYY-MM-DD, zero-padded', () => {
    expect(toISODate(new Date(2026, 5, 7))).toBe('2026-06-07');
    expect(toISODate(new Date(2026, 11, 25))).toBe('2026-12-25');
  });

  it('uses the local calendar day, not the time of day', () => {
    expect(toISODate(new Date(2026, 5, 17, 23, 59))).toBe('2026-06-17');
  });
});

describe('addDaysISO', () => {
  it('adds days within a month', () => {
    expect(addDaysISO(new Date(2026, 5, 17), 1)).toBe('2026-06-18');
  });

  it('rolls over month and year boundaries', () => {
    expect(addDaysISO(new Date(2026, 5, 30), 2)).toBe('2026-07-02');
    expect(addDaysISO(new Date(2026, 11, 31), 1)).toBe('2027-01-01');
  });

  it('handles zero and negative offsets', () => {
    expect(addDaysISO(new Date(2026, 5, 17), 0)).toBe('2026-06-17');
    expect(addDaysISO(new Date(2026, 5, 1), -1)).toBe('2026-05-31');
  });
});
