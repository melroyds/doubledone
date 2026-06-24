// Combine: the inverse of Break-it-down. Several tasks fold into one umbrella task.
// Pure and tested; the screen does the AI call, the commit, and the celebration.
//
// The selected tasks are tombstoned (the same reversible soft-delete the sync engine
// already uses) and recorded on the umbrella's `combinedFrom`, so nothing is lost and a
// future un-combine is possible. A decomposition's silent parent that loses ALL its
// children to a combine is tombstoned too (its work has moved into the umbrella).
// DoubleDone's decompositions are single-level, so there is no grandparent chain to
// re-walk. The umbrella is an ordinary visible task: completing it blooms like any other.

import { type Task } from './tasks';
import { isRecurring } from './today';

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
};

/**
 * Fold the selected tasks into one umbrella task. The selected are tombstoned and
 * recorded on `umbrella.combinedFrom`; the umbrella lands at the earliest due date (see
 * earliestDue). Any decomposition silent-parent that the combine empties (all its
 * children folded away) is tombstoned too. Pure: returns the new umbrella and the updated
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

  // A silent parent whose children were ALL folded into the umbrella has nothing left to
  // wait for; tombstone it so it does not linger as an invisible ghost. (A parent that
  // still has live children is left alone, it completes normally when those are done.)
  const parentIds = new Set(
    selected.map((t) => t.parentId).filter((p): p is string => p != null),
  );
  const next =
    parentIds.size === 0
      ? tombstoned
      : tombstoned.map((t) => {
          if (!parentIds.has(t.id)) return t;
          const liveChildren = tombstoned.filter((c) => c.parentId === t.id && !c.deletedAt);
          return liveChildren.length === 0 ? { ...t, deletedAt: now, updatedAt: now } : t;
        });

  return { umbrella, next: [...next, umbrella] };
}
