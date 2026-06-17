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
});

describe('scheduleFields', () => {
  it('today is undated', () => {
    expect(scheduleFields({ mode: 'today' }, jun17)).toEqual({});
  });

  it('tomorrow sets a one-off due date', () => {
    expect(scheduleFields({ mode: 'tomorrow' }, jun17)).toEqual({ due: '2026-06-18' });
  });

  it('daily and weekly set recurrence', () => {
    expect(scheduleFields({ mode: 'daily' }, jun17)).toEqual({ recurrence: { kind: 'daily' } });
    expect(scheduleFields({ mode: 'weekly', weekdays: [1, 3] }, jun17)).toEqual({
      recurrence: { kind: 'weekly', weekdays: [1, 3] },
    });
  });
});
