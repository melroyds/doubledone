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
  silentParent?: boolean; // a silent parent (Cluster B): hidden from Today / Later until its children are done
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
    t.deletedAt || t.silentParent ? false : isRecurring(t) ? isDueOn(t, date) : t.due == null || t.due <= todayIso,
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

/** Move a one-off to a specific date (the calm "Move to…"); recurring tasks are unchanged. */
export function deferTo<T extends Scheduled>(task: T, iso: string): T {
  if (isRecurring(task)) return task;
  return { ...task, due: iso };
}

/** Future-dated one-offs (due after today), not done, soonest first: the "Later" list. */
export function upcomingTasks<T extends Scheduled>(tasks: T[], date: Date): T[] {
  const todayIso = toISODate(date);
  return tasks
    .filter((t) => !t.deletedAt && !t.silentParent && !isRecurring(t) && t.due != null && t.due > todayIso && !t.done)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
}

type Parentable = Scheduled & {
  id: string;
  title: string;
  parentId?: string;
  completedAt?: number | null;
  updatedAt: number;
  openParent?: boolean; // a tiny-version parent: never auto-completed (its pebbles are partial)
};

/**
 * After a task completes, walk up its parent chain (Cluster B): for each ancestor
 * whose children are now ALL done, mark that ancestor done too, so it surfaces in
 * the Lookback as the finished whole task, and keep walking up. Returns the updated
 * tasks plus any parents that just completed, newest finished last (the last is the
 * topmost "whole thing" the screen names in the finish celebration). Pure; the screen
 * does the commit and the celebration. A `seen` set guards against a malformed cycle.
 */
export function completeAncestors<T extends Parentable>(
  tasks: T[],
  completedId: string,
  date: Date,
  now: number,
): { tasks: T[]; completed: T[] } {
  let next = tasks;
  const completed: T[] = [];
  const seen = new Set<string>();
  let cursorId = tasks.find((t) => t.id === completedId)?.parentId;
  while (cursorId && !seen.has(cursorId)) {
    seen.add(cursorId);
    const parent = next.find((t) => t.id === cursorId);
    // An open (tiny-version) parent never auto-completes: its children are partial pebbles.
    if (!parent || isDoneOn(parent, date) || parent.openParent) break;
    const children = next.filter((t) => t.parentId === cursorId && !t.deletedAt);
    if (children.length === 0 || !children.every((c) => isDoneOn(c, date))) break;
    next = next.map((t) => (t.id === cursorId ? { ...t, done: true, completedAt: now, silentParent: false, updatedAt: now } : t));
    completed.push(next.find((t) => t.id === cursorId)!);
    cursorId = parent.parentId;
  }
  return { tasks: next, completed };
}

/** Whether a task already has an active (incomplete, not deleted) child. Guards Make-it-tiny
 *  from spawning a duplicate pebble for the same parent. Pure. */
export function hasActiveTinyChild<T extends { parentId?: string; done: boolean; deletedAt?: number | null }>(
  tasks: T[],
  parentId: string,
): boolean {
  return tasks.some((t) => t.parentId === parentId && !t.done && !t.deletedAt);
}

/**
 * When a tiny-version pebble is completed, bring its OPEN parent back onto Today and retire
 * the spent pebble (it was scaffolding to cross the start line, not a task of record), so
 * pebbles never pile up no matter how many times the task is shrunk. Returns the updated
 * tasks plus the parent's title for the progress nudge, or a null title when the completed
 * task is not a tiny pebble of an open parent. Pure.
 */
export function resurfaceOpenParent<T extends Parentable>(
  tasks: T[],
  completedId: string,
  now: number,
): { tasks: T[]; parentTitle: string | null } {
  const parentId = tasks.find((t) => t.id === completedId)?.parentId;
  if (!parentId) return { tasks, parentTitle: null };
  const parent = tasks.find((t) => t.id === parentId);
  if (!parent || !parent.openParent) return { tasks, parentTitle: null };
  const next = tasks.map((t) => {
    if (t.id === parentId) return { ...t, silentParent: false, updatedAt: now };
    if (t.id === completedId) return { ...t, deletedAt: now, updatedAt: now };
    return t;
  });
  return { tasks: next, parentTitle: parent.title };
}

/** The parent's title if this task is a tiny-version pebble (its parent is an OPEN parent),
 *  else null. Lets a row show an "a tiny step toward X" eyebrow, distinguishing a pebble
 *  from an ordinary decomposition step (whose parent is silent, not open). Pure. */
export function tinyParentTitle<T extends { parentId?: string; parentTitle?: string; openParent?: boolean; id: string }>(
  tasks: T[],
  task: T,
): string | null {
  if (!task.parentId || !task.parentTitle) return null;
  const parent = tasks.find((t) => t.id === task.parentId);
  return parent?.openParent ? task.parentTitle : null;
}
