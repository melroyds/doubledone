import { describe, expect, it } from 'vitest';

import { clampHour, clampMinute, formatReminderHour, formatReminderTime, type ReminderReason, reminderReasonLine } from './reminders-types';

describe('reminderReasonLine', () => {
  it('gives a distinct, non-empty, never-alarming line for each reason', () => {
    const reasons: ReminderReason[] = ['denied', 'unsupported', 'error'];
    const lines = reasons.map(reminderReasonLine);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain('!'); // calm, never an alarm
    }
    expect(new Set(lines).size).toBe(reasons.length); // each case reads differently
  });

  it('points a denied user at the fix, not at themselves', () => {
    expect(reminderReasonLine('denied')).toMatch(/settings/i);
  });
});

describe('clampHour', () => {
  it('keeps a valid hour, rounds, and clamps out-of-range to 0-23', () => {
    expect(clampHour(9)).toBe(9);
    expect(clampHour(9.4)).toBe(9);
    expect(clampHour(-3)).toBe(0);
    expect(clampHour(30)).toBe(23);
  });

  it('falls back to 9 for a non-finite value', () => {
    expect(clampHour(NaN)).toBe(9);
    expect(clampHour(Infinity)).toBe(9);
  });
});

describe('clampMinute', () => {
  it('keeps a valid minute, rounds, and clamps out-of-range to 0-59', () => {
    expect(clampMinute(0)).toBe(0);
    expect(clampMinute(47)).toBe(47);
    expect(clampMinute(29.6)).toBe(30);
    expect(clampMinute(-3)).toBe(0);
    expect(clampMinute(75)).toBe(59);
  });

  it('falls back to 0 for a non-finite value', () => {
    expect(clampMinute(NaN)).toBe(0);
    expect(clampMinute(Infinity)).toBe(0);
  });
});

describe('formatReminderHour', () => {
  // Intl output; normalise the space variant (some ICU builds emit U+202F before am/pm).
  const label = (h: number) => formatReminderHour(h).replace(/ /g, ' ');

  it('reads as a calm 12-hour time across the day (en-AU default)', () => {
    expect(label(0)).toBe('12:00 am');
    expect(label(9)).toBe('9:00 am');
    expect(label(12)).toBe('12:00 pm');
    expect(label(13)).toBe('1:00 pm');
    expect(label(18)).toBe('6:00 pm');
    expect(label(23)).toBe('11:00 pm');
  });

  it('clamps a bad hour before formatting', () => {
    expect(label(30)).toBe('11:00 pm');
    expect(label(-1)).toBe('12:00 am');
  });
});

describe('formatReminderTime', () => {
  // Same normalisation as formatReminderHour: some ICU builds emit U+202F before am/pm.
  const label = (h: number, m: number) => formatReminderTime(h, m).replace(/ /g, ' ');

  it('reads as a calm minute-level time in the device convention (en-AU default)', () => {
    expect(label(9, 0)).toBe('9:00 am'); // :00 matches the hour-only label exactly
    expect(label(20, 47)).toBe('8:47 pm');
    expect(label(0, 5)).toBe('12:05 am');
    expect(label(12, 30)).toBe('12:30 pm');
  });

  it('agrees with formatReminderHour at :00, so the two paths never drift', () => {
    for (const h of [0, 9, 12, 23]) expect(formatReminderTime(h, 0)).toBe(formatReminderHour(h));
  });

  it('clamps a bad hour and minute before formatting', () => {
    expect(label(30, 99)).toBe('11:59 pm');
    expect(label(-1, -1)).toBe('12:00 am');
    expect(label(9, NaN)).toBe('9:00 am');
  });
});
