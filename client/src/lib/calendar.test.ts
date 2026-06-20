import { describe, expect, it } from 'vitest';

import { addMonths, completionsByDay, monthLabel, monthMatrix, scheduledByDay } from './calendar';
import { type Recurrence } from './recurrence';

describe('monthMatrix', () => {
  it('lays out weeks of 7, padded, with the right day count', () => {
    const jan = monthMatrix(2026, 0); // January 2026
    jan.forEach((week) => expect(week).toHaveLength(7));
    expect(jan.flat().filter(Boolean)).toHaveLength(31);
  });

  it('is Gregorian-correct for leap and non-leap February', () => {
    expect(monthMatrix(2024, 1).flat().filter(Boolean)).toHaveLength(29); // leap
    expect(monthMatrix(2025, 1).flat().filter(Boolean)).toHaveLength(28); // not
  });

  it('aligns day 1 to its weekday and starts the month there', () => {
    const flat = monthMatrix(2026, 0).flat();
    const firstIdx = flat.findIndex((c) => c !== null);
    expect(firstIdx).toBe(new Date(2026, 0, 1).getDay());
    expect(flat[firstIdx]).toBe('2026-01-01');
  });
});

describe('addMonths', () => {
  it('rolls the year over forwards and backwards', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths(2026, 5, 1)).toEqual({ year: 2026, month: 6 });
  });
});

describe('monthLabel', () => {
  it('renders name and year', () => {
    expect(monthLabel(2026, 5)).toBe('June 2026');
    expect(monthLabel(2026, 0)).toBe('January 2026');
  });
});

describe('completionsByDay', () => {
  const daily = { kind: 'daily' } as Recurrence;
  const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

  it('places a one-off on its completedAt day', () => {
    const tasks = [{ id: 'a', title: 'A', done: true, createdAt: at(2026, 5, 15), completedAt: new Date(2026, 5, 15, 10).getTime() }];
    expect(completionsByDay(tasks).get('2026-06-15')).toEqual([{ id: 'a', title: 'A', recurring: false, big: false }]);
  });

  it('falls back to updatedAt when completedAt is missing', () => {
    const tasks = [{ id: 'b', title: 'B', done: true, createdAt: at(2026, 5, 16), updatedAt: new Date(2026, 5, 16, 9).getTime() }];
    expect(completionsByDay(tasks).get('2026-06-16')).toEqual([{ id: 'b', title: 'B', recurring: false, big: false }]);
  });

  it('adds one entry per recurring completion date', () => {
    const tasks = [
      { id: 'c', title: 'C', done: false, createdAt: at(2026, 5, 1), recurrence: daily, completedDates: ['2026-06-14', '2026-06-15'] },
    ];
    const byDay = completionsByDay(tasks);
    expect(byDay.get('2026-06-14')).toEqual([{ id: 'c', title: 'C', recurring: true, big: false }]);
    expect(byDay.get('2026-06-15')).toEqual([{ id: 'c', title: 'C', recurring: true, big: false }]);
  });

  it('flags a long-lingering completion as a big win', () => {
    const tasks = [{ id: 'old', title: 'Old', done: true, createdAt: at(2026, 5, 1), completedAt: at(2026, 5, 15) }];
    expect(completionsByDay(tasks).get('2026-06-15')).toEqual([{ id: 'old', title: 'Old', recurring: false, big: true }]);
  });

  it('excludes tombstoned tasks and not-done one-offs', () => {
    const tasks = [
      { id: 'd', title: 'D', done: true, createdAt: at(2026, 5, 15), completedAt: at(2026, 5, 15), deletedAt: 1 },
      { id: 'e', title: 'E', done: false, createdAt: at(2026, 5, 18) },
    ];
    expect(completionsByDay(tasks).size).toBe(0);
  });
});

describe('scheduledByDay', () => {
  const today = new Date(2026, 5, 20); // 20 Jun 2026
  const base = { done: false, createdAt: 0 };

  it('groups future-dated one-offs by their due date', () => {
    const m = scheduledByDay(
      [
        { ...base, id: 'a', title: 'A', due: '2026-06-21' },
        { ...base, id: 'b', title: 'B', due: '2026-06-21' },
        { ...base, id: 'c', title: 'C', due: '2026-06-25' },
      ],
      today,
    );
    expect(m.get('2026-06-21')?.map((s) => s.id)).toEqual(['a', 'b']);
    expect(m.get('2026-06-25')).toEqual([{ id: 'c', title: 'C' }]);
  });

  it('excludes today/overdue, done, deleted, recurring, and undated tasks', () => {
    const m = scheduledByDay(
      [
        { ...base, id: 'today', title: 'Today', due: '2026-06-20' },
        { ...base, id: 'past', title: 'Overdue', due: '2026-06-18' },
        { ...base, id: 'done', title: 'Done', due: '2026-06-22', done: true },
        { ...base, id: 'del', title: 'Del', due: '2026-06-22', deletedAt: 1 },
        { ...base, id: 'rec', title: 'Daily', recurrence: { kind: 'daily' } as Recurrence },
        { ...base, id: 'undated', title: 'Someday' },
      ],
      today,
    );
    expect(m.size).toBe(0);
  });
});
