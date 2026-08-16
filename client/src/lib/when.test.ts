import { describe, expect, it } from 'vitest';

import { type CaptureSchedule } from './recurrence';
import { tomorrowISO, whenChanges, whenFields } from './when';

// Sun 16 Aug 2026, local, matching the design boards.
const TODAY = new Date(2026, 7, 16);
const TODAY_ISO = '2026-08-16';

describe('whenFields', () => {
  // THE one this function exists for. `scheduleFields` maps 'today' and 'anytime' to the SAME empty
  // answer, which is right for a personal task (undated means today) and silently wrong on a shared
  // row, where no date means "reaches nobody's day". The capture bar above this sheet shipped that
  // bug once already.
  it('makes Today a real date, and Anytime no date at all', () => {
    expect(whenFields({ mode: 'today' }, TODAY)).toEqual({ due: TODAY_ISO, recurrence: { kind: 'none' } });
    expect(whenFields({ mode: 'anytime' }, TODAY)).toEqual({ due: null, recurrence: { kind: 'none' } });
  });

  it('resolves Tomorrow, and takes a picked date as given', () => {
    expect(whenFields({ mode: 'tomorrow' }, TODAY).due).toBe('2026-08-17');
    expect(whenFields({ mode: 'date', date: '2026-08-20' }, TODAY).due).toBe('2026-08-20');
  });

  // The edit half. Omitting the other key would leave the old value in place, and the row would end
  // up both dated AND repeating, which is the one state the model says cannot exist.
  it('always answers with BOTH keys, so the other half is cleared and never merely absent', () => {
    const every: CaptureSchedule[] = [
      { mode: 'anytime' },
      { mode: 'today' },
      { mode: 'tomorrow' },
      { mode: 'date', date: '2026-08-20' },
      { mode: 'daily' },
      { mode: 'weekly', weekdays: [2] },
      { mode: 'everyN', days: 3 },
    ];
    for (const schedule of every) {
      const answer = whenFields(schedule, TODAY);
      expect(Object.keys(answer).sort()).toEqual(['due', 'recurrence']);
      expect(answer.recurrence).toBeDefined();
    }
  });

  it('clears the date whenever a rhythm is the answer', () => {
    expect(whenFields({ mode: 'daily' }, TODAY).due).toBeNull();
    expect(whenFields({ mode: 'weekly', weekdays: [2] }, TODAY).due).toBeNull();
    expect(whenFields({ mode: 'everyN', days: 3 }, TODAY).due).toBeNull();
  });

  it('never answers with both a date and a readable rhythm', () => {
    const every: CaptureSchedule[] = [
      { mode: 'anytime' },
      { mode: 'today' },
      { mode: 'tomorrow' },
      { mode: 'date', date: '2026-08-20' },
      { mode: 'daily', start: '2026-08-20' },
      { mode: 'weekly', weekdays: [4], start: '2026-08-20' },
      { mode: 'everyN', days: 3, start: '2026-08-20' },
    ];
    for (const schedule of every) {
      const { due, recurrence } = whenFields(schedule, TODAY);
      expect(due !== null && recurrence.kind !== 'none').toBe(false);
    }
  });

  // A day chosen while a rhythm is alive is that rhythm's START, which is the resolution the third
  // design round settled on. It must reach the recurrence and never become a due date.
  it('carries a chosen day into the rhythm as its start, not as a date', () => {
    const weekly = whenFields({ mode: 'weekly', weekdays: [4], start: '2026-08-20' }, TODAY);
    expect(weekly.due).toBeNull();
    expect(weekly.recurrence).toMatchObject({ kind: 'weekly', weekdays: [4], start: '2026-08-20' });

    // An interval keeps its phase under a different key, and losing it re-phases the series.
    const every3 = whenFields({ mode: 'everyN', days: 3, start: '2026-08-13' }, TODAY);
    expect(every3.recurrence).toMatchObject({ kind: 'interval', days: 3, anchor: '2026-08-13' });
  });
});

describe('whenChanges', () => {
  const plain = { due: null, recurrence: undefined };
  const dated = { due: '2026-08-20', recurrence: undefined };
  const weekly = { due: null, recurrence: { kind: 'weekly' as const, weekdays: [2], start: '2026-08-04' } };

  // An idle Set must not write. Every mutator commits with a fresh stamp, and a fresh stamp is what
  // the OTHER person's screen reads as "changed since you looked", so a no-op that writes sends them
  // hunting for a change nobody made.
  it('is false when the answer matches what the row already carries', () => {
    expect(whenChanges(whenFields({ mode: 'anytime' }, TODAY), plain)).toBe(false);
    expect(whenChanges(whenFields({ mode: 'date', date: '2026-08-20' }, TODAY), dated)).toBe(false);
    expect(whenChanges(whenFields({ mode: 'weekly', weekdays: [2], start: '2026-08-04' }, TODAY), weekly)).toBe(false);
  });

  it('treats an absent recurrence and an explicit none as the same nothing', () => {
    expect(whenChanges(whenFields({ mode: 'anytime' }, TODAY), { due: null, recurrence: { kind: 'none' } })).toBe(false);
    expect(whenChanges(whenFields({ mode: 'anytime' }, TODAY), { due: undefined })).toBe(false);
  });

  it('is true for every real move', () => {
    expect(whenChanges(whenFields({ mode: 'date', date: '2026-08-21' }, TODAY), dated)).toBe(true); // date to date
    expect(whenChanges(whenFields({ mode: 'anytime' }, TODAY), dated)).toBe(true); // back to plain
    expect(whenChanges(whenFields({ mode: 'anytime' }, TODAY), weekly)).toBe(true); // rhythm ends
    expect(whenChanges(whenFields({ mode: 'date', date: '2026-08-20' }, TODAY), weekly)).toBe(true); // rhythm to date
    expect(whenChanges(whenFields({ mode: 'weekly', weekdays: [2] }, TODAY), plain)).toBe(true); // plain to rhythm
  });

  // Re-phasing is a real change even though the cadence's words do not move: "Every Tuesday" reads
  // the same before and after, and an interval's anchor decides which days it actually lands on.
  it('is true when only the start moves', () => {
    expect(whenChanges(whenFields({ mode: 'weekly', weekdays: [2], start: '2026-08-25' }, TODAY), weekly)).toBe(true);
  });

  it('is true when the weekdays change', () => {
    expect(whenChanges(whenFields({ mode: 'weekly', weekdays: [5], start: '2026-08-04' }, TODAY), weekly)).toBe(true);
  });
});

describe('tomorrowISO', () => {
  it('crosses a month end without arithmetic at the call site', () => {
    expect(tomorrowISO(new Date(2026, 7, 31))).toBe('2026-09-01');
    expect(tomorrowISO(TODAY)).toBe('2026-08-17');
  });
});
