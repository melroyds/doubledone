import { describe, expect, it } from 'vitest';

import { clampHour, clampMinute, formatReminderHour, formatReminderTime, nextDailySlot, type ReminderReason, reminderReasonLine , staleNudgeIdentifiers, RHYTHM_CHANNEL, DAILY_CHANNEL, TASK_NUDGE_CHANNEL, MAX_NUDGE_LIFETIME_MS, slotTimeoutsMs } from './reminders-types';

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

describe('nextDailySlot (the nudge health "next around" pick)', () => {
  const at = (h: number, m: number) => new Date(2026, 6, 12, h, m);

  it('picks the soonest slot after now, across midnight when needed', () => {
    const slots = [
      { hour: 9, minute: 0 },
      { hour: 13, minute: 0 },
      { hour: 21, minute: 0 },
    ];
    expect(nextDailySlot(slots, at(10, 30))).toEqual({ hour: 13, minute: 0 });
    expect(nextDailySlot(slots, at(22, 0))).toEqual({ hour: 9, minute: 0 }); // wraps to tomorrow
  });

  it('a slot exactly at now counts as tomorrow (it just fired)', () => {
    expect(nextDailySlot([{ hour: 9, minute: 0 }, { hour: 9, minute: 5 }], at(9, 0))).toEqual({ hour: 9, minute: 5 });
  });

  it('handles minutes and clamps junk; empty is null', () => {
    expect(nextDailySlot([{ hour: 20, minute: 30 }], at(20, 29))).toEqual({ hour: 20, minute: 30 });
    expect(nextDailySlot([{ hour: 30, minute: 99 }], at(12, 0))).toEqual({ hour: 23, minute: 59 });
    expect(nextDailySlot([], at(12, 0))).toBeNull();
  });
});

describe('staleNudgeIdentifiers (the app-open guilt-pile sweep)', () => {
  const n = (identifier: string, channelId: string | null) => ({ identifier, channelId });

  it('dismisses delivered Rhythm and daily/routine nudges: offers to open the app, and the app is open', () => {
    const presented = [n('r1', RHYTHM_CHANNEL), n('r2', RHYTHM_CHANNEL), n('d1', DAILY_CHANNEL)];
    expect(staleNudgeIdentifiers(presented)).toEqual(['r1', 'r2', 'd1']);
  });

  it('KEEPS per-task nudges: they point at one specific task and stay actionable', () => {
    const presented = [n('t1', TASK_NUDGE_CHANNEL), n('r1', RHYTHM_CHANNEL)];
    expect(staleNudgeIdentifiers(presented)).toEqual(['r1']);
  });

  it('falls back to the stable identifier families when channels are absent (iOS)', () => {
    const presented = [n('rhythm-abc-9', null), n('routine-xyz', null), n('doubledone-daily', null), n('nudge-task1', null)];
    expect(staleNudgeIdentifiers(presented)).toEqual(['rhythm-abc-9', 'routine-xyz', 'doubledone-daily']);
  });

  it('keeps anything unrecognised: never over-dismiss', () => {
    expect(staleNudgeIdentifiers([n('x', null), n('y', 'some-future-channel'), n('nudge-task1', null)])).toEqual([]);
    expect(staleNudgeIdentifiers([])).toEqual([]);
  });
});

describe('slotTimeoutsMs (the closed-app half of "missed nudges never stack")', () => {
  it('a lone daily slot wraps to tomorrow and takes the 12h cap', () => {
    expect(slotTimeoutsMs([{ hour: 9, minute: 0 }])).toEqual([MAX_NUDGE_LIFETIME_MS]);
  });

  it('each slot expires exactly when its successor arrives, so two can never sit in the tray', () => {
    // A water Rhythm: 9:00, 9:30, 11:00. Gaps: 30min, 90min, and 22h (capped).
    const out = slotTimeoutsMs([
      { hour: 9, minute: 0 },
      { hour: 9, minute: 30 },
      { hour: 11, minute: 0 },
    ]);
    expect(out).toEqual([30 * 60_000, 90 * 60_000, MAX_NUDGE_LIFETIME_MS]);
  });

  it('answers in input order, not sorted order', () => {
    const out = slotTimeoutsMs([
      { hour: 11, minute: 0 },
      { hour: 9, minute: 0 },
    ]);
    expect(out).toEqual([MAX_NUDGE_LIFETIME_MS, 2 * 60 * 60_000]);
  });

  it('wraps across midnight: an evening slot expires when the morning one lands', () => {
    const out = slotTimeoutsMs([
      { hour: 22, minute: 0 },
      { hour: 8, minute: 0 },
    ]);
    expect(out[0]).toBe(10 * 60 * 60_000); // 22:00 -> 8:00 is 10h, under the cap
    expect(out[1]).toBe(MAX_NUDGE_LIFETIME_MS); // 8:00 -> 22:00 is 14h, capped
  });

  it('an empty schedule stays empty', () => {
    expect(slotTimeoutsMs([])).toEqual([]);
  });
});
