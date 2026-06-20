import { describe, expect, it } from 'vitest';

import {
  addDaysISO,
  daysBetween,
  formatTodayLabel,
  friendlyDate,
  fromISODate,
  isReentry,
  isSameDay,
  startOfDay,
  toISODate,
} from './day';

describe('isReentry', () => {
  const today = new Date(2026, 5, 20); // 20 Jun 2026
  it('is false on a brand-new install and a same-day reopen', () => {
    expect(isReentry(null, today, 4)).toBe(false);
    expect(isReentry('2026-06-20', today, 4)).toBe(false);
  });
  it('is false for a short gap, true at or past the threshold', () => {
    expect(isReentry('2026-06-18', today, 4)).toBe(false); // 2-day gap
    expect(isReentry('2026-06-16', today, 4)).toBe(true); // 4-day gap
    expect(isReentry('2026-06-01', today, 4)).toBe(true); // long gap
  });
});

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

describe('fromISODate', () => {
  it('parses a local date with no UTC shift', () => {
    const d = fromISODate('2026-06-18');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(18);
  });
});

describe('friendlyDate', () => {
  it('labels the next day as Tomorrow', () => {
    expect(friendlyDate('2026-06-18', new Date(2026, 5, 17))).toBe('Tomorrow');
  });

  it('labels other days with weekday and date', () => {
    const label = friendlyDate('2026-06-20', new Date(2026, 5, 17));
    expect(label).toMatch(/20/);
    expect(label).toMatch(/Jun/);
  });
});
