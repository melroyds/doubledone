import { describe, expect, it } from 'vitest';

import { describeRecurrence, isDueOn, scheduleFields, type Recurrence } from './recurrence';

const jun17 = new Date(2026, 5, 17); // a specific local day
const jun18 = new Date(2026, 5, 18);

describe('isDueOn', () => {
  it('a one-off is due only on its due date', () => {
    const t = { due: '2026-06-17', recurrence: { kind: 'none' } as Recurrence };
    expect(isDueOn(t, jun17)).toBe(true);
    expect(isDueOn(t, jun18)).toBe(false);
  });

  it('no due date and no recurrence is never date-due (someday bucket)', () => {
    expect(isDueOn({}, jun17)).toBe(false);
    expect(isDueOn({ due: null }, jun17)).toBe(false);
  });

  it('daily is due every day', () => {
    const t = { recurrence: { kind: 'daily' } as Recurrence };
    expect(isDueOn(t, jun17)).toBe(true);
    expect(isDueOn(t, jun18)).toBe(true);
  });

  it('weekly is due only on its weekdays', () => {
    const day = jun17.getDay();
    const due = { recurrence: { kind: 'weekly', weekdays: [day] } as Recurrence };
    const notDue = { recurrence: { kind: 'weekly', weekdays: [(day + 1) % 7] } as Recurrence };
    expect(isDueOn(due, jun17)).toBe(true);
    expect(isDueOn(notDue, jun17)).toBe(false);
  });

  it('interval is due every n days from its anchor', () => {
    const t = { recurrence: { kind: 'interval', days: 2, anchor: '2026-06-18' } as Recurrence };
    expect(isDueOn(t, new Date(2026, 5, 18))).toBe(true); // anchor day
    expect(isDueOn(t, new Date(2026, 5, 19))).toBe(false); // +1
    expect(isDueOn(t, new Date(2026, 5, 20))).toBe(true); // +2
    expect(isDueOn(t, new Date(2026, 5, 17))).toBe(false); // before the anchor
  });

  it('daily with a future start is not due before it, due on and after', () => {
    const t = { recurrence: { kind: 'daily', start: '2026-06-18' } as Recurrence };
    expect(isDueOn(t, jun17)).toBe(false); // before start
    expect(isDueOn(t, jun18)).toBe(true); // on start
    expect(isDueOn(t, new Date(2026, 5, 19))).toBe(true); // after start
  });

  it('weekly respects both the weekday and a future start', () => {
    const t = { recurrence: { kind: 'weekly', weekdays: [jun18.getDay()], start: '2026-06-18' } as Recurrence };
    const weekBefore = new Date(2026, 5, 11); // same weekday as jun18, but before the start
    expect(isDueOn(t, weekBefore)).toBe(false); // matching weekday, before start
    expect(isDueOn(t, jun18)).toBe(true); // matching weekday, on start
  });
});

describe('describeRecurrence', () => {
  it('labels the simple cases', () => {
    expect(describeRecurrence({ kind: 'none' })).toBe('One-off');
    expect(describeRecurrence({ kind: 'daily' })).toBe('Every day');
  });

  // FRAMED, not bare. This asserted 'Mon, Wed', which is what shipped and what Melroy hit on a
  // shared row: "it just says Thursday. It doesn't specify anything. Feels random." A bare weekday
  // was also the odd one out beside its own siblings, 'Every day' and 'Every 2 days'.
  it('weekly reads as a rhythm, and a full week collapses to every day', () => {
    expect(describeRecurrence({ kind: 'weekly', weekdays: [1, 3] })).toBe('Every Mon, Wed');
    expect(describeRecurrence({ kind: 'weekly', weekdays: [4] })).toBe('Every Thu');
    expect(describeRecurrence({ kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day');
  });

  it('interval reads as every n days', () => {
    expect(describeRecurrence({ kind: 'interval', days: 2, anchor: '2026-06-18' })).toBe('Every 2 days');
  });

  it('appends a future start only when given today', () => {
    const today = new Date(2026, 5, 17);
    expect(describeRecurrence({ kind: 'daily', start: '2026-06-25' }, today)).toContain('from');
    expect(describeRecurrence({ kind: 'daily', start: '2026-06-17' }, today)).toBe('Every day'); // starts today -> no hint
    expect(describeRecurrence({ kind: 'daily', start: '2026-06-25' })).toBe('Every day'); // no today -> cadence only
  });
});

describe('scheduleFields', () => {
  it('today is undated', () => {
    expect(scheduleFields({ mode: 'today' }, jun17)).toEqual({});
  });

  it('tomorrow sets a one-off due date', () => {
    expect(scheduleFields({ mode: 'tomorrow' }, jun17)).toEqual({ due: '2026-06-18' });
  });

  it('date sets a one-off due on the chosen day', () => {
    expect(scheduleFields({ mode: 'date', date: '2026-07-01' }, jun17)).toEqual({ due: '2026-07-01' });
  });

  it('daily and weekly set recurrence with a start (today by default)', () => {
    expect(scheduleFields({ mode: 'daily' }, jun17)).toEqual({ recurrence: { kind: 'daily', start: '2026-06-17' } });
    expect(scheduleFields({ mode: 'weekly', weekdays: [1, 3] }, jun17)).toEqual({
      recurrence: { kind: 'weekly', weekdays: [1, 3], start: '2026-06-17' },
    });
  });

  it('everyN sets an interval recurrence anchored to today', () => {
    expect(scheduleFields({ mode: 'everyN', days: 2 }, jun17)).toEqual({
      recurrence: { kind: 'interval', days: 2, anchor: '2026-06-17' },
    });
  });

  it('a chosen future start flows into the daily/weekly start and the interval anchor', () => {
    expect(scheduleFields({ mode: 'daily', start: '2026-06-25' }, jun17)).toEqual({
      recurrence: { kind: 'daily', start: '2026-06-25' },
    });
    expect(scheduleFields({ mode: 'weekly', weekdays: [1], start: '2026-06-25' }, jun17)).toEqual({
      recurrence: { kind: 'weekly', weekdays: [1], start: '2026-06-25' },
    });
    expect(scheduleFields({ mode: 'everyN', days: 3, start: '2026-06-25' }, jun17)).toEqual({
      recurrence: { kind: 'interval', days: 3, anchor: '2026-06-25' },
    });
  });
});

describe('monthly', () => {
  const on = (day: number, start?: string): { recurrence: Recurrence } => ({ recurrence: { kind: 'monthly', day, start } });

  it('lands on its day of the month and nowhere else', () => {
    const r = on(15);
    expect(isDueOn(r, new Date(2026, 5, 15))).toBe(true);
    expect(isDueOn(r, new Date(2026, 5, 14))).toBe(false);
    expect(isDueOn(r, new Date(2026, 5, 16))).toBe(false);
    expect(isDueOn(r, new Date(2026, 6, 15))).toBe(true); // and again next month
  });

  // THE one this design turns on. A month too short must CLAMP to its last day, never skip: the
  // months a skip would silently drop are exactly the ones a rent or a bill cannot afford to miss.
  it('clamps to the last day of a month too short for it, rather than skipping', () => {
    const r = on(31);
    expect(isDueOn(r, new Date(2026, 1, 28))).toBe(true); // Feb 2026 has 28 days
    expect(isDueOn(r, new Date(2026, 1, 27))).toBe(false);
    expect(isDueOn(r, new Date(2026, 3, 30))).toBe(true); // April has 30
    expect(isDueOn(r, new Date(2026, 0, 31))).toBe(true); // January has 31, so no clamp
    expect(isDueOn(r, new Date(2026, 0, 30))).toBe(false);
  });

  it('knows a leap year', () => {
    const r = on(30);
    expect(isDueOn(r, new Date(2028, 1, 29))).toBe(true); // 2028 is a leap year
    expect(isDueOn(r, new Date(2026, 1, 28))).toBe(true); // 2026 is not
  });

  // Stated as a property rather than a date list: whatever the day, EVERY month gets exactly one.
  it('never skips a month, for any day of the month', () => {
    for (const day of [1, 15, 28, 29, 30, 31]) {
      for (let month = 0; month < 12; month += 1) {
        const hits = [];
        const daysInMonth = new Date(2026, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d += 1) {
          if (isDueOn(on(day), new Date(2026, month, d))) hits.push(d);
        }
        expect(hits).toHaveLength(1);
      }
    }
  });

  it('respects a start date, so a habit can begin next month', () => {
    const r = on(15, '2026-07-01');
    expect(isDueOn(r, new Date(2026, 5, 15))).toBe(false); // June, before the start
    expect(isDueOn(r, new Date(2026, 6, 15))).toBe(true);
  });

  it('reads as a rhythm, with an English ordinal', () => {
    expect(describeRecurrence({ kind: 'monthly', day: 1 })).toBe('Every month on the 1st');
    expect(describeRecurrence({ kind: 'monthly', day: 2 })).toBe('Every month on the 2nd');
    expect(describeRecurrence({ kind: 'monthly', day: 3 })).toBe('Every month on the 3rd');
    expect(describeRecurrence({ kind: 'monthly', day: 11 })).toBe('Every month on the 11th'); // not "11st"
    expect(describeRecurrence({ kind: 'monthly', day: 21 })).toBe('Every month on the 21st');
    expect(describeRecurrence({ kind: 'monthly', day: 31 })).toBe('Every month on the 31st');
  });

  it('captures with a start, and never also a due date', () => {
    const f = scheduleFields({ mode: 'monthly', day: 17 }, jun17);
    expect(f.recurrence).toEqual({ kind: 'monthly', day: 17, start: '2026-06-17' });
    expect(f.due).toBeUndefined();
  });
});
