import { addDaysISO, toISODate } from './day';
import { isDueOn, type Recurrence } from './recurrence';

// What belongs on Today, and what "done" means once tasks can repeat.
// Pure and tested; the screen just renders the result.

export type Scheduled = {
  done: boolean;
  completedAt?: number | null; // one-off completion time; a done one-off shows on Today only the day it was finished
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
 * What lands on Today. A recurring task shows when it is due today. An OPEN one-off
 * shows when it is undated (the "do it now" capture default) or its due date is today
 * or earlier, so an overdue one-off rolls forward calmly, with no shaming. A DONE
 * one-off shows only on the day it was finished, then it lives in the Lookback (a
 * completed task never carries into the next day). Future one-offs wait in Later.
 */
export function tasksForToday<T extends Scheduled>(tasks: T[], date: Date): T[] {
  const todayIso = toISODate(date);
  return tasks.filter((t) => {
    if (t.deletedAt || t.silentParent) return false;
    if (isRecurring(t)) return isDueOn(t, date);
    if (t.done) return t.completedAt != null && toISODate(new Date(t.completedAt)) === todayIso;
    return t.due == null || t.due <= todayIso;
  });
}

/** A task that can be pinned as the day's one priority (premium). `done` gates the float: a completed
 *  pin recedes so the day re-centres on the open work (see pinFirst). */
export type Pinnable = { pinnedAt?: number; done?: boolean };

/**
 * Float the single ACTIVE pinned task to the front of Today: a STABLE PARTITION, the pinned task first
 * then everything else in its original order, nothing else reordered. Runs at render over the result of
 * tasksForToday, so the pure ordering tasksForToday returns (load-bearing for sync diffing) is never
 * mutated. A COMPLETED pin does not float (it stays pinned underneath and floats again if reopened), so
 * a finished "one thing" never sits struck-through above the work that is left. The feature is ONE pin;
 * if a two-device race ever leaves more than one pinned, the highest pinnedAt wins, ties breaking to the
 * earliest in the list, never a ranked block and never a crash. Returns the same array reference when
 * nothing floats, so the caller can skip work.
 */
export function pinFirst<T extends Pinnable>(tasks: T[]): T[] {
  let top: T | undefined;
  for (const t of tasks) {
    if (t.pinnedAt != null && !t.done && (top === undefined || t.pinnedAt > (top.pinnedAt ?? 0))) top = t;
  }
  if (!top) return tasks;
  const pinned = top;
  return [pinned, ...tasks.filter((t) => t !== pinned)];
}

/**
 * Pin a task as the day's ONE priority, or unpin it (acting on the current pin clears it). Stamps
 * pinnedAt on the target, clears the pin off every OTHER task, and bumps updatedAt on each change so a
 * displaced pin syncs and wins last-write-wins. The at-most-one invariant lives here, kept pure so it is
 * unit-testable (the screen action just calls this, commits, and confirms).
 */
export function setPin<T extends { id: string; pinnedAt?: number; updatedAt: number }>(tasks: T[], id: string, now: number): T[] {
  const wasPinned = tasks.find((t) => t.id === id)?.pinnedAt != null;
  return tasks.map((t) => {
    if (t.id === id) {
      const next = { ...t, updatedAt: now };
      if (wasPinned) delete next.pinnedAt;
      else next.pinnedAt = now;
      return next;
    }
    if (t.pinnedAt != null) {
      const next = { ...t, updatedAt: now };
      delete next.pinnedAt; // only one pin at a time
      return next;
    }
    return t;
  });
}

/** A task carrying an accepted manual-order slot (premium "Plan my order"). A LOCAL-ONLY leaf field. */
export type Orderable = { id: string; manualOrder?: number };

/**
 * Apply an accepted manual order at RENDER: tasks with a manualOrder float ahead in ascending order, and
 * everything else keeps its incoming relative order behind them. A STABLE sort that returns the SAME array
 * reference when nothing has a manualOrder (so the render path can skip work). Composed OUTSIDE the pure
 * tasksForToday (like pinFirst), so the load-bearing tasksForToday order is never mutated. Used as
 * pinFirst(applyManualOrder(tasksForToday(...))), so a pin still wins the very top.
 */
export function applyManualOrder<T extends Orderable>(tasks: T[]): T[] {
  if (!tasks.some((t) => t.manualOrder != null)) return tasks;
  const ordered = tasks.filter((t) => t.manualOrder != null);
  const rest = tasks.filter((t) => t.manualOrder == null);
  ordered.sort((a, b) => (a.manualOrder ?? 0) - (b.manualOrder ?? 0)); // Array.sort is stable, so ties keep order
  return [...ordered, ...rest];
}

/**
 * Apply an accepted sequence: stamp manualOrder = position for each id in `orderedIds` and bump updatedAt
 * (so the local copy wins last-write-wins and the order survives a sync), and CLEAR any stale manualOrder
 * off tasks not in the new order. Pure and unit-tested. manualOrder is a LOCAL-ONLY leaf field (deliberately
 * not mapped in sync.ts, so it needs no remote column; cross-device order sync is a documented follow-up).
 */
export function setSequence<T extends { id: string; manualOrder?: number; updatedAt: number }>(
  tasks: T[],
  orderedIds: string[],
  now: number,
): T[] {
  const rank = new Map(orderedIds.map((id, i) => [id, i] as const));
  return tasks.map((t) => {
    const r = rank.get(t.id);
    if (r != null) return { ...t, manualOrder: r, updatedAt: now };
    if (t.manualOrder != null) {
      const next = { ...t, updatedAt: now };
      delete next.manualOrder;
      return next;
    }
    return t;
  });
}

/**
 * Mark (or unmark) tasks as "big": the user saying this one thing is a lot. Multi-select, so it stamps
 * `big` on every given id at once, or clears it when `on` is false (deleting the key so the field stays
 * absent, not false, mirroring setPin). Bumps updatedAt; untouched tasks are returned by reference.
 * LOCAL-ONLY for now (big is not mapped in sync.ts), so it persists on-device; cross-device is a follow-up.
 */
export function setBig<T extends { id: string; big?: boolean; updatedAt: number }>(
  tasks: T[],
  ids: string[],
  on: boolean,
  now: number,
): T[] {
  const set = new Set(ids);
  return tasks.map((t) => {
    if (!set.has(t.id)) return t;
    const next = { ...t, updatedAt: now };
    if (on) next.big = true;
    else delete next.big;
    return next;
  });
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
