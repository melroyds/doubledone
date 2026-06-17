import { describe, expect, it } from 'vitest';

import { type Recurrence } from './recurrence';
import { isDoneOn, tasksForToday, toggleDoneOn, upcomingTasks } from './today';

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

  it('a recurring task completed yesterday reads not done today (daily reset)', () => {
    expect(isDoneOn({ done: false, recurrence: daily, completedDates: ['2026-06-16'] }, today)).toBe(
      false,
    );
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
  it('keeps undated, due-today, overdue (rolled forward), and recurring; not future', () => {
    const tasks = [
      { id: 'undated', done: false },
      { id: 'due-today', done: false, due: iso },
      { id: 'overdue', done: false, due: '2026-06-10' },
      { id: 'future', done: false, due: '2026-06-20' },
      { id: 'daily', done: false, recurrence: daily },
    ];
    expect(tasksForToday(tasks, today).map((t) => t.id)).toEqual([
      'undated',
      'due-today',
      'overdue',
      'daily',
    ]);
  });

  it('excludes soft-deleted (tombstoned) tasks, recurring or not', () => {
    const tasks = [
      { id: 'live', done: false },
      { id: 'gone', done: false, deletedAt: 123 },
      { id: 'gone-daily', done: false, recurrence: daily, deletedAt: 123 },
    ];
    expect(tasksForToday(tasks, today).map((t) => t.id)).toEqual(['live']);
  });
});

describe('upcomingTasks', () => {
  it('returns future one-offs not done, soonest first', () => {
    const tasks = [
      { id: 'today', done: false, due: iso }, // due today, not upcoming
      { id: 'later', done: false, due: '2026-06-25' },
      { id: 'soon', done: false, due: '2026-06-19' },
      { id: 'past', done: false, due: '2026-06-10' },
      { id: 'done-future', done: true, due: '2026-06-20' },
      { id: 'recurring', done: false, recurrence: daily },
      { id: 'undated', done: false },
    ];
    expect(upcomingTasks(tasks, today).map((t) => t.id)).toEqual(['soon', 'later']);
  });

  it('excludes soft-deleted future tasks', () => {
    const tasks = [
      { id: 'soon', done: false, due: '2026-06-19' },
      { id: 'gone', done: false, due: '2026-06-20', deletedAt: 1 },
    ];
    expect(upcomingTasks(tasks, today).map((t) => t.id)).toEqual(['soon']);
  });
});
