import { addDaysISO, toISODate } from './day';
import { newerLeftOff, normalizeLeftOffText } from './leftoff';
import { isDueOn, type Recurrence } from './recurrence';
import { type LeftOff } from './tasks';

// What belongs on Today, and what "done" means once tasks can repeat.
// Pure and tested; the screen just renders the result.

export type Scheduled = {
  done: boolean;
  completedAt?: number | null; // one-off completion time; a done one-off shows on Today only the day it was finished
  due?: string | null;
  recurrence?: Recurrence;
  completedDates?: string[]; // ISO dates a recurring task was completed
  skippedDates?: string[]; // ISO dates whose instance the user removed from Today (the series continues)
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
 * Skip a recurring task's instance for one day, returning a new task: that day's
 * occurrence leaves Today, and the series is untouched (it returns on its next due
 * day). This is Today's "remove" for a recurring task: Today manages days, the
 * Repeating drawer manages the series. Idempotent (an already-skipped day is a
 * no-op) and non-mutating. One-offs never carry skippedDates; they tombstone.
 */
export function skipOn<T extends Scheduled>(task: T, date: Date): T {
  const iso = toISODate(date);
  const dates = task.skippedDates ?? [];
  if (dates.includes(iso)) return task;
  return { ...task, skippedDates: [...dates, iso] };
}

/**
 * What lands on Today. A recurring task shows when it is due today. An OPEN one-off
 * shows when it is undated (the "do it now" capture default) or its due date is today
 * or earlier, so an overdue one-off rolls forward calmly, with no shaming. A DONE
 * one-off shows only on the day it was finished, then it lives in the Lookback (a
 * completed task never carries into the next day). Future one-offs wait in Later.
 * A recurring task whose instance was skipped for this day (skipOn) stays off Today
 * for just this day; skippedDates never touches a one-off.
 */
export function tasksForToday<T extends Scheduled>(tasks: T[], date: Date): T[] {
  const todayIso = toISODate(date);
  return tasks.filter((t) => {
    if (t.deletedAt || t.silentParent) return false;
    if (isRecurring(t)) return isDueOn(t, date) && !(t.skippedDates ?? []).includes(todayIso);
    if (t.done) return t.completedAt != null && toISODate(new Date(t.completedAt)) === todayIso;
    return t.due == null || t.due <= todayIso;
  });
}

/**
 * The Tuck choice: split today's rows into the ones that stay in the list and the finished ones that fold
 * into the "Done today" line at its foot. A pure, order-keeping partition done at RENDER, so everything
 * that reads the whole day (the weight gauge, the close-the-day count, Plan my day, the Calendar) is
 * untouched by construction. Two finished rows stay in place anyway: one ticked a moment ago (`settling`,
 * so the tick is seen before it goes) and `keepInPlace` (the held task's closing line, which plays where
 * the tick happened).
 */
export function tuckFinished<T extends Scheduled & { id: string }>(
  rows: T[],
  date: Date,
  settling: readonly string[],
  keepInPlace: string | null,
): { open: T[]; tucked: T[] } {
  const open: T[] = [];
  const tucked: T[] = [];
  for (const row of rows) {
    if (isDoneOn(row, date) && !settling.includes(row.id) && row.id !== keepInPlace) tucked.push(row);
    else open.push(row);
  }
  return { open, tucked };
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
 * Float the HELD task to the top of the list, always BELOW a pinned task.
 *
 * SUPERSEDES the 2026-08-22 "the held row never floats" clause, by Melroy's device verdict
 * (2026-08-23): the dot alone was ineffective at row level. Pin stays visually senior by
 * construction here: the pin floats first and the held task slots under it, never above, so the
 * paid signal keeps its seat. A DONE task keeps floating on purpose: the ticked contract's
 * closing line plays inside the cell (2026-08-30), and it must play at the top, where the tick
 * just happened, not wherever the done row would otherwise land. The caller stops passing the id
 * when the beat ends. Same array reference back when nothing moves, matching pinFirst's contract.
 */
export function holdSecond<T extends Pinnable & { id: string }>(tasks: T[], heldId: string | null): T[] {
  if (!heldId) return tasks;
  const idx = tasks.findIndex((t) => t.id === heldId);
  if (idx < 0) return tasks;
  const seat = tasks.length > 0 && tasks[0].pinnedAt != null && !tasks[0].done && tasks[0].id !== heldId ? 1 : 0;
  if (idx === seat) return tasks;
  const held = tasks[idx];
  const rest = tasks.filter((t) => t !== held);
  return [...rest.slice(0, seat), held, ...rest.slice(seat)];
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
 * SYNCED by plain LWW since 2026-07-12 (mapped in sync.ts). The updatedAt bump here is load-bearing:
 * it is what lets a clear outrank the merge's pre-column tie-seed (sync-merge.ts), do not remove it.
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
 * Rename a task in place. The title is trimmed; an empty or unchanged result is a no-op that
 * returns the SAME array reference, so callers can skip a commit (and a sync write) when nothing
 * really changed. Bumps updatedAt on a real change so the rename syncs by plain LWW. Works for
 * any task kind: a recurring row IS its series, so renaming it renames the series, which is what
 * the one visible row implies.
 */
export function renameTask<T extends { id: string; title: string; updatedAt: number }>(
  tasks: T[],
  id: string,
  title: string,
  now: number,
): T[] {
  const next = title.trim();
  if (next.length === 0) return tasks;
  const target = tasks.find((t) => t.id === id);
  if (!target || target.title === next) return tasks;
  return tasks.map((t) => (t.id === id ? { ...t, title: next, updatedAt: now } : t));
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
  createdAt?: number;
  updatedAt: number;
  openParent?: boolean; // a tiny-version parent: never auto-completed (its pebbles are partial)
  leftOff?: LeftOff | null;
};

/**
 * Write a task's "Where you left off" line, the way renameTask writes a title: the text is normalised
 * (lib/leftoff), an unchanged line returns the SAME array (no commit, no sync, no "Noted."), a new one is
 * stamped with today's calendar day and bumps updatedAt for last-write-wins, and an empty one clears the
 * line (the key is deleted, as a cleared pin or big is). Only a live one-off takes a line: a repeat keeps
 * any it had hidden and untouched. Pure.
 */
export function setLeftOff<T extends Scheduled & { id: string; updatedAt: number; leftOff?: LeftOff | null }>(
  tasks: T[],
  id: string,
  raw: string,
  todayIso: string,
  now: number,
): T[] {
  const text = normalizeLeftOffText(raw);
  let changed = false;
  const next = tasks.map((t) => {
    if (t.id !== id || t.deletedAt || isRecurring(t)) return t;
    if (text === (t.leftOff?.text ?? '')) return t;
    changed = true;
    const out: T = { ...t, updatedAt: now };
    if (text) out.leftOff = { text, writtenOn: todayIso };
    else delete out.leftOff;
    return out;
  });
  return changed ? next : tasks;
}

/**
 * A parent's children that belong to its CURRENT round: the live ones, less any finished before the newest
 * live one was even created. A breakdown makes all its steps at once, before any is done, so every step
 * counts. A task made tiny twice keeps its first, finished pebble alive when its flag is unknown (it may be a
 * real step, so it is never retired on a guess); that pebble was done before the second one existed, so it
 * belongs to an earlier round and must not make the task look like a two-step breakdown (2026-10-04: it
 * did, and the second shrink's tick FINISHED the real task). Pure.
 */
export function currentRound<C extends { done: boolean; completedAt?: number | null; createdAt?: number; deletedAt?: number | null }>(children: C[]): C[] {
  const live = children.filter((c) => !c.deletedAt);
  const newest = Math.max(-Infinity, ...live.map((c) => (typeof c.createdAt === 'number' ? c.createdAt : -Infinity)));
  return live.filter((c) => !(c.done && typeof c.completedAt === 'number' && c.completedAt < newest));
}

/**
 * After a task completes, walk up its parent chain (Cluster B): for each ancestor
 * whose children are now ALL done, mark that ancestor done too, so it surfaces in
 * the Lookback as the finished whole task, and keep walking up. Returns the updated
 * tasks plus any parents that just completed, newest finished last (the last is the
 * topmost "whole thing" the screen names in the finish celebration). Pure; the screen
 * does the commit and the celebration. A `seen` set guards against a malformed cycle.
 * `completedAt` dates the finished parents (default `now`): settleCompletions passes the step's own
 * completion time, so the whole task lands on the same day as its last step.
 */
export function completeAncestors<T extends Parentable>(
  tasks: T[],
  completedId: string,
  date: Date,
  now: number,
  completedAt: number = now,
): { tasks: T[]; completed: T[] } {
  let next = tasks;
  const completed: T[] = [];
  const seen = new Set<string>();
  let cursorId = tasks.find((t) => t.id === completedId)?.parentId;
  while (cursorId && !seen.has(cursorId)) {
    seen.add(cursorId);
    const parent = next.find((t) => t.id === cursorId);
    // An open (tiny-version) parent never auto-completes: its children are partial pebbles.
    // A parent already back on Today is finished by its own tick, never on a guess by a child's (the repair
    // brings an ambiguous one back open, and re-ticking its step must not then finish it with a bloom).
    if (!parent || isDoneOn(parent, date) || parent.openParent || !parent.silentParent) break;
    const children = next.filter((t) => t.parentId === cursorId && !t.deletedAt);
    if (children.length === 0 || !children.every((c) => isDoneOn(c, date))) break;
    // Above the direct parent, an ancestor with ONE child in its round is not known to be a breakdown (it may
    // be a tiny step's real task whose flag an older build never wrote): stop, and settleCompletions' trailing
    // call brings it back. The direct parent got that call before the walk began.
    if (cursorId !== tasks.find((t) => t.id === completedId)?.parentId && currentRound(children).length < 2) break;
    next = next.map((t) => (t.id === cursorId ? { ...t, done: true, completedAt, silentParent: false, updatedAt: now } : t));
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
  // tiny:move (2026-10-04): the spent pebble is retired, so any line written on it moves onto the real task
  // as it comes back, the newer line winning (decision-log, "Where you left off").
  const pebble = tasks.find((t) => t.id === completedId);
  const moved = newerLeftOff(parent.leftOff, pebble?.leftOff);
  const next = tasks.map((t) => {
    if (t.id === parentId) {
      const back = { ...t, silentParent: false, updatedAt: now };
      if (moved) back.leftOff = moved;
      return back;
    }
    if (t.id === completedId) return { ...t, deletedAt: now, updatedAt: now };
    return t;
  });
  return { tasks: next, parentTitle: parent.title };
}

/**
 * What finishing tasks does to their parents, for EVERY way a task gets finished: the Today row tick, Done in
 * Focus, a bulk Done, the last part of a stepped task, and a resize of the parts that completes one. Until
 * 2026-10-04 only the row tick did this, so finishing a broken-down task's LAST step anywhere else left the
 * big task hidden for good (never done, never in the Lookback, the very payoff it exists for), and a tiny
 * step done in Focus never brought its real task back. For each id that is now done:
 * - a tiny step brings its real task back and retires the spent pebble (resurfaceOpenParent). A parent counts
 *   as tiny only while its CURRENT ROUND (currentRound) holds a single child, the one pebble Make it tiny
 *   allows; with two or more, the flag is a stale one left by breaking down a once-tiny task, so it is
 *   cleared and the parent walks up as the decomposition it now is;
 * - a parent whose tiny flag is UNKNOWN (undefined: made before Break it down began writing false, or synced
 *   from another device, which never receives the flag) with one child in its round is brought back open,
 *   not finished. It may be a tiny step's real task whose flag was lost, and finishing that on a guess would
 *   put a task the user never finished in the Lookback. healStuckParents makes the same call. A breakdown
 *   made on this device from this build writes openParent: false, so its finish is never in doubt here;
 * - any other step walks up with completeAncestors, dated to the step's own completion, and an ancestor the
 *   walk stops below gets the same call.
 * Returns the updated tasks, every whole task that finished (each with its chain depth; the LAST is the one
 * the bloom names) and every real task brought back. Pure; the screen commits and plays the moment.
 */
export function settleCompletions<T extends Parentable>(
  tasks: T[],
  completedIds: string[],
  date: Date,
  now: number,
): {
  tasks: T[];
  wholes: { task: T; depth: number }[];
  whole: T | null;
  wholeDepth: number;
  backs: { title: string; tiny: boolean }[];
  parentBack: string | null;
  parentBackTiny: boolean;
} {
  let next = tasks;
  const wholes: { task: T; depth: number }[] = [];
  const backs: { title: string; tiny: boolean }[] = [];
  const bringBack = (id: string, title: string, tiny: boolean, fromChild?: string) => {
    // A child that stays (it may be a real step) lends its line to the task coming back, the newer winning.
    const lent = fromChild ? next.find((t) => t.id === fromChild)?.leftOff : undefined;
    next = next.map((t) => {
      if (t.id !== id) return t;
      const back = { ...t, silentParent: false, updatedAt: now };
      const line = newerLeftOff(t.leftOff, lent);
      if (line) back.leftOff = line;
      return back;
    });
    backs.push({ title, tiny });
  };
  // The three-way call for a hidden parent whose child just finished: a tiny task's real task comes back, any
  // other parent with one child in its round comes back, anything else is walked up. Returns whether the walk
  // should go on.
  const decide = (parentId: string, childId: string): 'walk' | 'stop' => {
    const parent = next.find((t) => t.id === parentId);
    if (!parent || parent.deletedAt || isDoneOn(parent, date) || !parent.silentParent) return 'stop';
    const round = currentRound(next.filter((t) => t.parentId === parentId));
    if (parent.openParent && round.length >= 2) {
      next = next.map((t) => (t.id === parentId ? { ...t, openParent: false, updatedAt: now } : t));
      return 'walk';
    }
    if (parent.openParent) {
      const child = next.find((t) => t.id === childId);
      // Retire only a spent pebble: a child that was itself broken down is a finished task of record.
      const spent = child && !next.some((g) => g.parentId === childId);
      if (spent) {
        const back = resurfaceOpenParent(next, childId, now);
        if (back.parentTitle != null) {
          next = back.tasks;
          backs.push({ title: back.parentTitle, tiny: true });
        }
      } else {
        bringBack(parentId, parent.title, true);
      }
      return 'stop';
    }
    // Not known-tiny with ONE child in its round: brought back, never finished, whatever the flag says. A
    // synced `false` is not proof while older store builds are live: they never write open_parent, so a task
    // broken down here and later made tiny there keeps a stale false (the 2026-10-04 review). Bringing a task
    // back is recoverable; finishing one the user never finished is not.
    if (round.length === 1) {
      bringBack(parentId, parent.title, false, childId);
      return 'stop';
    }
    return 'walk';
  };
  for (const id of completedIds) {
    const task = next.find((t) => t.id === id);
    if (!task || !task.parentId || task.deletedAt || !isDoneOn(task, date)) continue;
    if (decide(task.parentId, id) === 'stop') continue;
    const walked = completeAncestors(next, id, date, now, task.completedAt ?? now);
    next = walked.tasks;
    if (walked.completed.length === 0) continue;
    const top = walked.completed[walked.completed.length - 1];
    wholes.push({ task: top, depth: walked.completed.length });
    // The walk stops below a tiny ancestor, or one with a single child in its round (a tiny step that was itself
    // broken down, flag known or not): give it the same call the direct parent got, so it comes back rather
    // than staying hidden or being guessed done.
    if (top.parentId) decide(top.parentId, top.id);
  }
  const last = wholes.length > 0 ? wholes[wholes.length - 1] : null;
  const lastBack = backs.length > 0 ? backs[backs.length - 1] : null;
  return {
    tasks: next,
    wholes,
    whole: last ? last.task : null,
    wholeDepth: last ? last.depth : 0,
    backs,
    parentBack: lastBack ? lastBack.title : null,
    parentBackTiny: lastBack ? lastBack.tiny : false,
  };
}

/** How long Remove's Undo stays on offer (today.tsx offerUndoRemove). The repair waits it out. */
export const UNDO_REMOVE_MS = 6000;

/**
 * The repair for parents that are ALREADY stuck, run when tasks load, on a warm resume, and after a sync
 * pull. A completion that never walked up (Done in Focus before 2026-10-04, or a step finished on another
 * device, through the REST API or by an AI agent, none of which can walk a parent) leaves a silent parent
 * hidden with every step done; removing every step leaves it hidden with none. Until nothing changes:
 * - two or more live steps, ALL done: finished, dated to the last step, and the walk continues up its chain;
 * - exactly ONE live step, done, or every step removed: brought back to Today open. One finished step may be
 *   a tiny step's real task whose flag a sync wiped, and nothing synced tells the two apart, so it is never
 *   finished on a guess. Back on Today it is one tick from done, and never lost;
 * - a tiny step's real task (single live child) comes back once its pebble is done, the spent pebble retired.
 *   An openParent with two or more live children is a stale flag on a decomposition, and is cleared;
 * - Combine's leftovers: a parent whose remaining steps went into a live umbrella, with nothing left open
 *   when they did, is tidied away (Combine's own rule), never "finished". A folded step is known by its
 *   umbrella's combinedFrom, or, because that is device-local, by its tombstone matching the umbrella's
 *   createdAt to the millisecond (Combine stamps both with one `now`, and both columns sync);
 * - the real task behind a tiny step that Combine wrongly DELETED (until 2026-10-04) comes back, recognised
 *   by its tombstone matching its folded pebble's. This needs the device-local tiny flag, so it reaches only
 *   the device that made the task tiny, and never a task the user folded or removed on purpose.
 *
 * Every write is stamped from the row it repairs (its own updatedAt + 1), never the clock: the repair beats
 * exactly the stale copy it was derived from and LOSES to any real edit made since on another device, and
 * two devices repairing the same state converge on the same result, so nothing ping-pongs. Nothing whose
 * step is still inside Remove's Undo (the screen's `pendingRemoved`, with UNDO_REMOVE_MS as a clock
 * backstop) is touched, so an Undo always finds the parent as it left it. Live counts are the parent's
 * current round (currentRound). A parent with no
 * steps at all, live or removed, is left alone (its steps may simply not have synced yet). Quiet on purpose:
 * no bloom for a finish made long ago. Idempotent, and it returns the SAME array when nothing is stuck. Pure.
 */
export function healStuckParents<T extends Parentable & { createdAt?: number; combinedFrom?: { id: string }[] }>(
  tasks: T[],
  now: number,
  pendingRemoved: ReadonlySet<string> = new Set(),
): T[] {
  let next = tasks;
  const bump = (t: T) => (Number.isFinite(t.updatedAt) ? t.updatedAt : 0) + 1;
  // Folded by Combine into an umbrella that is still live, or that was itself folded into a live one: by its
  // record, or by the tombstone matching the umbrella's birth. Compared in whole milliseconds, because a
  // stamp can carry a fraction locally (a fractional clock correction, before 2026-10-04) while the server
  // keeps whole ones.
  const ms = (v: number) => Math.trunc(v);
  const umbrellas = new Set(tasks.filter((u) => !u.deletedAt && !u.parentId).map((u) => u.id));
  for (let grew = true; grew; ) {
    grew = false;
    const born = new Set(tasks.filter((u) => umbrellas.has(u.id) && typeof u.createdAt === 'number').map((u) => ms(u.createdAt as number)));
    const named = new Set(tasks.filter((u) => umbrellas.has(u.id)).flatMap((u) => (u.combinedFrom ?? []).map((c) => c.id)));
    for (const u of tasks) {
      if (umbrellas.has(u.id) || u.parentId || u.deletedAt == null || !(named.has(u.id) || born.has(ms(u.deletedAt)))) continue;
      umbrellas.add(u.id);
      grew = true;
    }
  }
  const foldedIds = new Set<string>();
  const umbrellaBorn = new Set<number>();
  for (const u of tasks) {
    if (!umbrellas.has(u.id)) continue;
    if (u.combinedFrom) for (const c of u.combinedFrom) foldedIds.add(c.id);
    if (typeof u.createdAt === 'number') umbrellaBorn.add(ms(u.createdAt));
  }
  const isFolded = (c: T) => c.deletedAt != null && (foldedIds.has(c.id) || umbrellaBorn.has(ms(c.deletedAt)));
  // Remove's Undo is still on offer: by the screen's own list, and, as a backstop, by the clock either way
  // (a correction can move it between the removal and now).
  const recentlyRemoved = (c: T) => pendingRemoved.has(c.id) || (c.deletedAt != null && Math.abs(now - c.deletedAt) < UNDO_REMOVE_MS);

  // The real task behind a tiny step that Combine deleted along with its pebble.
  const wronged = new Set(
    next
      .filter((p) => p.openParent && p.deletedAt != null && !foldedIds.has(p.id) && next.some((c) => c.parentId === p.id && foldedIds.has(c.id) && c.deletedAt === p.deletedAt))
      .map((p) => p.id),
  );
  if (wronged.size > 0) next = next.map((t) => (wronged.has(t.id) ? { ...t, deletedAt: null, silentParent: false, updatedAt: bump(t) } : t));

  for (let pass = 0; pass < 64; pass += 1) {
    const stuck = next.find((p) => {
      if (!p.silentParent || p.deletedAt || p.done) return false;
      const all = next.filter((c) => c.parentId === p.id);
      if (all.length === 0 || all.some(recentlyRemoved)) return false;
      const live = all.filter((c) => !c.deletedAt);
      return live.length === 0 || live.every((c) => c.done);
    });
    if (!stuck) return next;
    const all = next.filter((c) => c.parentId === stuck.id);
    const live = all.filter((c) => !c.deletedAt);
    const round = currentRound(all);
    const set = (id: string, patch: (t: T) => T) => {
      next = next.map((t) => (t.id === id ? patch(t) : t));
    };
    if (stuck.openParent && round.length >= 2) {
      // A stale tiny flag on what is now a decomposition: clear it, and the next pass judges it as one.
      set(stuck.id, (t) => ({ ...t, openParent: false, updatedAt: bump(t) }));
      continue;
    }
    const folded = all.filter(isFolded);
    if (!stuck.openParent && folded.length > 0) {
      const foldAt = Math.max(...folded.map((c) => c.deletedAt as number));
      const lastDone = Math.max(-Infinity, ...live.map((c) => (typeof c.completedAt === 'number' ? c.completedAt : Infinity)));
      if (lastDone <= foldAt) {
        // Nothing was left open when its work went into an umbrella: tidied away, as Combine does.
        set(stuck.id, (t) => ({ ...t, deletedAt: foldAt, updatedAt: bump(t) }));
        continue;
      }
    }
    if (stuck.openParent || round.length < 2) {
      // Back to Today, not done. For a tiny step's real task, its one spent pebble is retired (only a
      // childless one: a pebble that was itself broken down is a finished task of record).
      const pebble = stuck.openParent && round.length === 1 && round[0].done && !next.some((g) => g.parentId === round[0].id) ? round[0] : null;
      const lent = round.length === 1 && round[0].done ? round[0].leftOff : undefined;
      set(stuck.id, (t) => {
        const back = { ...t, silentParent: false, updatedAt: bump(t) };
        const line = newerLeftOff(t.leftOff, lent);
        if (line) back.leftOff = line;
        return back;
      });
      if (pebble) set(pebble.id, (t) => ({ ...t, deletedAt: typeof t.completedAt === 'number' ? t.completedAt : bump(t), updatedAt: bump(t) }));
      continue;
    }
    const last = Math.max(...round.map((c) => (typeof c.completedAt === 'number' && Number.isFinite(c.completedAt) ? c.completedAt : -Infinity)));
    const completedAt = Number.isFinite(last) ? last : bump(stuck);
    set(stuck.id, (t) => ({ ...t, done: true, completedAt, silentParent: false, updatedAt: bump(t) }));
  }
  return next;
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
