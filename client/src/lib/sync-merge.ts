// The pure heart of cloud sync: merge a local task list with the remote one by
// last-write-wins on updatedAt, and work out which rows the server still needs.
// No network, no Supabase, no clock, so it is fully unit-testable (sync-merge.test.ts).
// The integration seam that actually talks to Supabase lives in sync.ts and calls this.

import { type Task } from './tasks';

export type MergeResult = {
  merged: Task[]; // the reconciled set to persist locally (includes tombstones)
  toPush: Task[]; // the subset the server is missing or has an older copy of
};

/**
 * Reconcile local and remote tasks.
 *
 * For each id seen on either side, the copy with the greater `updatedAt` wins
 * (a delete is just a tombstone with a newer `updatedAt`, so deletions win the
 * same way edits do). `merged` is every winner, to be saved locally. `toPush` is
 * the winners the server does not yet have: local-only tasks (the anonymous list
 * on first sign-in) and tasks where the local copy is newer. Remote-newer and
 * tie cases are already in sync, so they are never pushed.
 */
export function mergeTasks(local: Task[], remote: Task[]): MergeResult {
  const pairs = new Map<string, { local?: Task; remote?: Task }>();
  for (const t of local) pairs.set(t.id, { ...pairs.get(t.id), local: t });
  for (const t of remote) pairs.set(t.id, { ...pairs.get(t.id), remote: t });

  const merged: Task[] = [];
  const toPush: Task[] = [];
  for (const { local: l, remote: r } of pairs.values()) {
    if (l && r) {
      // Whole-row LWW would silently lose a synced completion or slices progress the loser holds, and would
      // drop the local-only fields when the remote row wins. Reconcile instead: take the LWW winner, but
      // union completedDates (grow-only, so an offline recurring tick is never erased), keep the max
      // slices.done, and carry the local-only big / manualOrder. Push when local won OR the union grew the
      // synced data beyond the server's remote copy, so the server converges to the union too.
      const reconciled = reconcileConflict(l, r);
      merged.push(reconciled);
      const localNewer = rank(l.updatedAt) > rank(r.updatedAt);
      const grewBeyondRemote =
        (reconciled.completedDates?.length ?? 0) > (r.completedDates?.length ?? 0) ||
        (reconciled.slices?.done ?? 0) > (r.slices?.done ?? 0);
      if (localNewer || grewBeyondRemote) toPush.push(reconciled);
    } else if (l) {
      merged.push(l);
      toPush.push(l); // local-only (e.g. anonymous tasks pre-sign-in), push to seed the account
    } else if (r) {
      merged.push(r); // remote-only, pull it down
    }
  }

  const byCreated = (a: Task, b: Task) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  merged.sort(byCreated);
  toPush.sort(byCreated);
  return { merged, toPush };
}

// Reconcile a task present on both sides. The LWW winner is the base, but the synced completion data is made
// monotonic so a tick or progress made on one device is never erased by a newer unrelated edit on another:
// completedDates is unioned (grow-only) and slices.done takes the max. The local-only fields (big,
// manualOrder, never sent to the server) are carried from the local copy instead of being dropped when the
// remote row wins. This is the never-lose-a-task, never-shame-by-disappearance guarantee, made real in sync.
function reconcileConflict(l: Task, r: Task): Task {
  const out: Task = rank(l.updatedAt) > rank(r.updatedAt) ? { ...l } : { ...r };

  const dates = new Set([...(l.completedDates ?? []), ...(r.completedDates ?? [])]);
  if (dates.size > 0) out.completedDates = [...dates].sort();

  if (out.slices) {
    const done = Math.max(l.slices?.done ?? 0, r.slices?.done ?? 0);
    out.slices = { total: out.slices.total, done: Math.min(done, out.slices.total) };
  }

  if (l.big) out.big = true;
  else delete out.big;
  if (l.manualOrder != null) out.manualOrder = l.manualOrder;
  else delete out.manualOrder;

  return out;
}

/** LWW rank of an updatedAt: a non-finite value (a corrupt remote row that parsed to NaN, say)
 *  ranks as -Infinity, so it always loses the comparison rather than winning it. A NaN compared
 *  directly makes every `>` false, which would silently adopt the corrupt row and pin the task to
 *  it; mapping to -Infinity makes the good copy win instead. */
function rank(updatedAt: number): number {
  return Number.isFinite(updatedAt) ? updatedAt : -Infinity;
}
