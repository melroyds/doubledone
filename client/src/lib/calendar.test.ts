import { describe, expect, it } from 'vitest';

import { addMonths, completionsByDay, monthLabel, monthMatrix } from './calendar';
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

  it('places a one-off on its completedAt day', () => {
    const tasks = [{ id: 'a', title: 'A', done: true, completedAt: new Date(2026, 5, 15, 10).getTime() }];
    expect(completionsByDay(tasks).get('2026-06-15')).toEqual([{ id: 'a', title: 'A', recurring: false }]);
  });

  it('falls back to updatedAt when completedAt is missing', () => {
    const tasks = [{ id: 'b', title: 'B', done: true, updatedAt: new Date(2026, 5, 16, 9).getTime() }];
    expect(completionsByDay(tasks).get('2026-06-16')).toEqual([{ id: 'b', title: 'B', recurring: false }]);
  });

  it('adds one entry per recurring completion date', () => {
    const tasks = [
      { id: 'c', title: 'C', done: false, recurrence: daily, completedDates: ['2026-06-14', '2026-06-15'] },
    ];
    const byDay = completionsByDay(tasks);
    expect(byDay.get('2026-06-14')).toEqual([{ id: 'c', title: 'C', recurring: true }]);
    expect(byDay.get('2026-06-15')).toEqual([{ id: 'c', title: 'C', recurring: true }]);
  });

  it('excludes tombstoned tasks and not-done one-offs', () => {
    const tasks = [
      { id: 'd', title: 'D', done: true, completedAt: new Date(2026, 5, 15).getTime(), deletedAt: 1 },
      { id: 'e', title: 'E', done: false },
    ];
    expect(completionsByDay(tasks).size).toBe(0);
  });
});
