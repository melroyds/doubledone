import { describe, expect, it } from 'vitest';

import { type Recurrence } from './recurrence';
import { isDoneOn, tasksForToday, toggleDoneOn } from './today';

const today = new Date(2026, 5, 17);
const iso = '2026-06-17';
const daily = { kind: 'daily' } as Recurrence;

describe('isDoneOn', () => {
  it('a one-off uses its done flag', () => {
    expect(isDoneOn({ done: true }, today)).toBe(true);
    expect(isDoneOn({ done: false }, today)).toBe(false);
  });

  it('a recurring task is done only on dates in completedDates', () => {
    expect(isDoneOn({ done: false, recurrence: daily, completedDates: [iso] }, today)).toBe(true);
    expect(isDoneOn({ done: false, recurrence: daily, completedDates: [] }, today)).toBe(false);
    expect(isDoneOn({ done: true, recurrence: daily }, today)).toBe(false); // global done ignored
  });
});

describe('toggleDoneOn', () => {
  it('flips done for a one-off', () => {
    expect(toggleDoneOn({ done: false }, today).done).toBe(true);
    expect(toggleDoneOn({ done: true }, today).done).toBe(false);
  });

  it('adds then removes today for a recurring task, leaving other days untouched', () => {
    const base = { done: false, recurrence: daily, completedDates: ['2026-06-16'] };
    const onceDone = toggleDoneOn(base, today);
    expect(onceDone.completedDates).toEqual(['2026-06-16', iso]);
    const undone = toggleDoneOn(onceDone, today);
    expect(undone.completedDates).toEqual(['2026-06-16']);
  });
});

describe('tasksForToday', () => {
  it('keeps undated captures, due-today one-offs, and recurring due today', () => {
    const tasks = [
      { id: 'undated', done: false },
      { id: 'due-today', done: false, due: iso },
      { id: 'due-other', done: false, due: '2026-06-20' },
      { id: 'daily', done: false, recurrence: daily },
    ];
    const ids = tasksForToday(tasks, today).map((t) => t.id);
    expect(ids).toEqual(['undated', 'due-today', 'daily']);
  });
});
