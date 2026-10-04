// Combine: the inverse of Break-it-down. Several tasks fold into one umbrella task.
// Pure and tested; the screen does the AI call, the commit, and the celebration.
//
// The selected tasks are tombstoned (the same reversible soft-delete the sync engine
// already uses) and recorded on the umbrella's `combinedFrom`, so nothing is lost and a
// future un-combine is possible. A hidden decomposition parent left with nothing open
// is tombstoned too (its remaining work has moved into the umbrella), walking up a nested
// chain, while a tiny step's real task comes back instead (combineTasks says why). The
// umbrella is an ordinary visible task: it completes like any other, with no bloom.

import { type Task } from './tasks';
import { currentRound, isRecurring } from './today';

/**
 * A task is eligible to combine when it is a plain, open one-off: not recurring, not
 * already done, not deleted. A recurring task repeats and has no single due to fold; a
 * done or deleted task is not live work. The screen filters the selection through this
 * before offering Combine. Pure.
 */
export function eligibleForCombine(task: Task): boolean {
  return !isRecurring(task) && !task.done && !task.deletedAt;
}

/**
 * The umbrella's due date: the earliest spot among the selected tasks. An undated task
 * counts as the earliest (it sits on Today with no imposed deadline), so a combine that
 * includes an undated, due-today, or overdue task lands on Today; otherwise the umbrella
 * takes the soonest future date. Worst case the user moves it afterwards. Pure.
 */
export function earliestDue(selected: Pick<Task, 'due'>[]): string | null {
  if (selected.some((t) => t.due == null)) return null;
  const dues = selected.map((t) => t.due).filter((d): d is string => d != null).sort();
  return dues[0] ?? null;
}

export type CombineResult = {
  umbrella: Task; // the new umbrella task
  next: Task[]; // full updated list: selected tombstoned, emptied parents tombstoned, umbrella appended
  broughtBack: string[]; // titles of the tiny steps' real tasks brought back to Today instead of tombstoned
};

/**
 * Fold the selected tasks into one umbrella task. The selected are tombstoned and
 * recorded on `umbrella.combinedFrom`; the umbrella lands at the earliest due date (see
 * earliestDue). Any decomposition silent-parent that the combine empties (all its
 * children folded away) is tombstoned too. The ONE exception is a tiny step's real task (an
 * OPEN parent): its pebble was scaffolding toward that task, not a part of it, so emptying it
 * brings the real task back to Today instead (until 2026-10-04 it was tombstoned, deleting the
 * very task the user had shrunk to get started). Pure: returns the new umbrella and the updated
 * task list. `umbrellaId` and `now` are injected so tests are deterministic.
 */
export function combineTasks(
  tasks: Task[],
  selectedIds: string[],
  umbrellaTitle: string,
  now: number,
  umbrellaId: string,
): CombineResult {
  const selectedSet = new Set(selectedIds);
  const selected = tasks.filter((t) => selectedSet.has(t.id));

  const umbrella: Task = {
    id: umbrellaId,
    title: umbrellaTitle.trim(),
    done: false,
    createdAt: now,
    updatedAt: now,
    due: earliestDue(selected),
    combinedFrom: selected.map((t) => ({ id: t.id, title: t.title })),
  };

  // Tombstone the selected tasks (reversible soft-delete, synced as a delete).
  const tombstoned = tasks.map((t) =>
    selectedSet.has(t.id) ? { ...t, deletedAt: now, updatedAt: now } : t,
  );

  // A HIDDEN, unfinished silent parent with nothing left to WAIT for (no open step: every other
  // step is done or gone) has had its remaining work moved into the umbrella; tombstone it so it
  // does not linger as an invisible ghost. A step already done stays done in the Lookback and
  // does not hold it back (until 2026-10-04 it did, and the parent hid for good). A parent that
  // still has an open step is left alone; it completes normally when those are done. A parent
  // already FINISHED or already back on Today is never touched, whatever happens to its steps.
  //
  // The exception is a tiny step's real task: the pebble was scaffolding toward it, not a part of
  // it, so it comes back to Today instead (until 2026-10-04 it was tombstoned, deleting the very
  // task the user had shrunk to get started). Its flag is device-local, so a parent with no flag
  // at all whose CURRENT ROUND (before this combine) held only the folded step is treated the same
  // way: a duplicate beside the umbrella is better than a loss. Rounds, not all-time children, so
  // a pebble retired in an earlier shrink never makes a twice-tiny task look like a breakdown, and
  // a tiny flag over two or more children in the round is a stale one on a decomposition.
  //
  // Chains nest (phase milestones, a step broken down again), so a parent tombstoned here has
  // its own parent checked in turn.
  let next = tombstoned;
  const broughtBack: string[] = [];
  const queue = selected.map((t) => t.parentId).filter((p): p is string => p != null);
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    // `seen` marks only a parent already acted on, so one skipped for an open step is checked again if a
    // later fold empties it (the queue follows the selection's order, not the chain's).
    if (seen.has(id)) continue;
    const p = next.find((t) => t.id === id);
    if (!p || !p.silentParent || p.done || p.deletedAt) continue;
    const children = next.filter((c) => c.parentId === id);
    if (children.some((c) => !c.deletedAt && !c.done)) continue;
    seen.add(id);
    const roundBefore = currentRound(tasks.filter((c) => c.parentId === id)).length;
    if ((p.openParent && roundBefore < 2) || (p.openParent === undefined && roundBefore === 1)) {
      next = next.map((t) => (t.id === id ? { ...t, silentParent: false, updatedAt: now } : t));
      broughtBack.push(p.title);
      continue;
    }
    next = next.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t));
    if (p.parentId) queue.push(p.parentId);
  }

  return { umbrella, next: [...next, umbrella], broughtBack };
}
