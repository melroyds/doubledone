import { toISODate } from './day';
import { isDueOn, type Recurrence } from './recurrence';

// What belongs on Today, and what "done" means once tasks can repeat.
// Pure and tested; the screen just renders the result.

export type Scheduled = {
  done: boolean;
  due?: string | null;
  recurrence?: Recurrence;
  completedDates?: string[]; // ISO dates a recurring task was completed
};

function isRecurring(t: Scheduled): boolean {
  return t.recurrence != null && t.recurrence.kind !== 'none';
}

function isUndated(t: Scheduled): boolean {
  return t.due == null && (t.recurrence == null || t.recurrence.kind === 'none');
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
 * What lands on Today: anything due today, plus undated captures (no date and no
 * recurrence), which are the "do it now" brain-dump default and stay until done.
 */
export function tasksForToday<T extends Scheduled>(tasks: T[], date: Date): T[] {
  return tasks.filter((t) => isUndated(t) || isDueOn(t, date));
}

/** Future-dated one-offs (due after today), not done, soonest first: the "Later" list. */
export function upcomingTasks<T extends Scheduled>(tasks: T[], date: Date): T[] {
  const todayIso = toISODate(date);
  return tasks
    .filter((t) => !isRecurring(t) && t.due != null && t.due > todayIso && !t.done)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
}
