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

  it('weekly lists its weekdays, and a full week reads as every day', () => {
    expect(describeRecurrence({ kind: 'weekly', weekdays: [1, 3] })).toBe('Mon, Wed');
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
