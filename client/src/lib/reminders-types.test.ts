import { describe, expect, it } from 'vitest';

import { clampHour, formatReminderHour, type ReminderReason, reminderReasonLine } from './reminders-types';

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

describe('formatReminderHour', () => {
  it('reads as a calm 12-hour time across the day', () => {
    expect(formatReminderHour(0)).toBe('12:00 AM');
    expect(formatReminderHour(9)).toBe('9:00 AM');
    expect(formatReminderHour(12)).toBe('12:00 PM');
    expect(formatReminderHour(13)).toBe('1:00 PM');
    expect(formatReminderHour(18)).toBe('6:00 PM');
    expect(formatReminderHour(23)).toBe('11:00 PM');
  });

  it('clamps a bad hour before formatting', () => {
    expect(formatReminderHour(30)).toBe('11:00 PM');
    expect(formatReminderHour(-1)).toBe('12:00 AM');
  });
});
