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
      if (l.updatedAt > r.updatedAt) {
        merged.push(l);
        toPush.push(l); // local is newer, server needs it
      } else {
        merged.push(r); // remote is newer or a tie, adopt it, nothing to push
      }
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
