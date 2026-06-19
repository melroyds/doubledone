import { addDaysISO, toISODate } from './day';
import { isDueOn, type Recurrence } from './recurrence';

// What belongs on Today, and what "done" means once tasks can repeat.
// Pure and tested; the screen just renders the result.

export type Scheduled = {
  done: boolean;
  due?: string | null;
  recurrence?: Recurrence;
  completedDates?: string[]; // ISO dates a recurring task was completed
  deletedAt?: number | null; // soft-delete tombstone; set = never shown
};

export function isRecurring(t: Scheduled): boolean {
  return t.recurrence != null && t.recurrence.kind !== 'none';
}

/** Done-state for a given day. Recurring tasks complete per-day; others use `done`. */
export function isDoneOn(t: Scheduled, date: Date): boolean {
  if (isRecurring(t)) return (t.completedDates ?? []).includes(toISODate(date));
  return t.done;
}

/**
 * Flip done-state for a given day, returning a new task. A recurring task ticks
 * for that day only (and returns next time it is due); a one-off flips `done`.
 */
export function toggleDoneOn<T extends Scheduled>(task: T, date: Date): T {
  if (!isRecurring(task)) {
    return { ...task, done: !task.done };
  }
  const iso = toISODate(date);
  const dates = task.completedDates ?? [];
  const completedDates = dates.includes(iso) ? dates.filter((d) => d !== iso) : [...dates, iso];
  return { ...task, completedDates };
}

/**
 * What lands on Today. A recurring task shows when it is due today. A one-off
 * shows when it is undated (the "do it now" capture default) or its due date is
 * today or earlier, so an overdue one-off rolls forward calmly, with no shaming.
 * Future-dated one-offs wait in the Later list.
 */
export function tasksForToday<T extends Scheduled>(tasks: T[], date: Date): T[] {
  const todayIso = toISODate(date);
  return tasks.filter((t) =>
    t.deletedAt ? false : isRecurring(t) ? isDueOn(t, date) : t.due == null || t.due <= todayIso,
  );
}

/**
 * Defer a one-off to tomorrow: set its due to the day after `date`, so it drops
 * off Today and returns tomorrow. A calm "not today", the single-task sibling of
 * close-the-day's roll forward, with no counter and no penalty (the never-shame
 * spine). Recurring tasks are returned unchanged, they move by cadence, not by
 * deferral.
 */
export function deferToTomorrow<T extends Scheduled>(task: T, date: Date): T {
  if (isRecurring(task)) return task;
  return { ...task, due: addDaysISO(date, 1) };
}

/** Future-dated one-offs (due after today), not done, soonest first: the "Later" list. */
export function upcomingTasks<T extends Scheduled>(tasks: T[], date: Date): T[] {
  const todayIso = toISODate(date);
  return tasks
    .filter((t) => !t.deletedAt && !isRecurring(t) && t.due != null && t.due > todayIso && !t.done)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
}
