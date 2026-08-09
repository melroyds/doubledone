// The pure heart of the SHARED list's sync: reconcile my copy of a pair's tasks with the server's.
// No network, no Supabase, no clock, so all of it is unit-testable (ours-merge.test.ts). The seam
// that actually talks to Supabase is ours-sync.ts and calls this.
//
// This is sync-merge.ts's sibling and deliberately not its reuse. A personal task is edited by ONE
// person on several devices, minutes or hours apart. A shared task is edited by TWO PEOPLE at the
// same moment, in the same kitchen, and one of them is about to watch their tick vanish if the
// merge gets it wrong. Same last-write-wins spine, different things treated as un-losable.
//
// The never-shame law that shapes the whole file: `doneAt` is a TIME and never a person. There is
// no `done_by` column in supabase/ours.sql, so a per-person tally is not withheld here, it is
// uncomputable. Nothing in this file may ever grow one.

import { type Recurrence } from './recurrence';

/** A row of a shared list, mirroring `public.shared_tasks`. Structurally a subset of Task on
 *  purpose, so the existing pure day/recurrence helpers (which are generic over their inputs) work
 *  on these unchanged. */
export type SharedTask = {
  id: string;
  title: string;
  done: boolean;
  doneAt?: number | null; // epoch ms the row was ticked. A TIME. Never who.
  recurrence?: Recurrence;
  completedDates?: string[]; // ISO dates this repeat was ticked, by EITHER person, unattributed
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null; // tombstone, same convention as tasks
};

export type SharedMergeResult = {
  merged: SharedTask[]; // the reconciled set to cache locally, tombstones included
  toPush: SharedTask[]; // the subset the server is missing or holds an older copy of
};

/**
 * Reconcile my cached copy of a pair's list with the server's.
 *
 * Last-write-wins per row on `updatedAt`, exactly as personal sync does, with two rules that exist
 * because the two writers are people rather than devices:
 *
 *   1. `completedDates` is a GROW-ONLY UNION. Two people ticking the bins from two phones is the
 *      single most likely simultaneous write this feature will ever see, and losing one of those
 *      ticks means someone's completed work silently un-completes on their partner's screen. A
 *      union cannot lose one. It also cannot record who: it is a set of dates, and that is all the
 *      information that exists.
 *   2. A tombstone is not special. Removal is an `updatedAt` bump like any other, so a removal and
 *      a re-add race resolve by time rather than by "delete always wins", which would let one
 *      person's stale removal quietly beat the other's fresh add.
 */
export function mergeShared(local: SharedTask[], remote: SharedTask[]): SharedMergeResult {
  const pairs = new Map<string, { local?: SharedTask; remote?: SharedTask }>();
  for (const t of local) pairs.set(t.id, { ...pairs.get(t.id), local: t });
  for (const t of remote) pairs.set(t.id, { ...pairs.get(t.id), remote: t });

  const merged: SharedTask[] = [];
  const toPush: SharedTask[] = [];
  for (const { local: l, remote: r } of pairs.values()) {
    if (l && r) {
      const reconciled = reconcile(l, r);
      merged.push(reconciled);
      // Push when my copy won the comparison, OR when the union grew the completed set beyond what
      // the server holds, so the OTHER person's phone converges too rather than only mine.
      const localNewer = rank(l.updatedAt) > rank(r.updatedAt);
      const grew = (reconciled.completedDates?.length ?? 0) > (r.completedDates?.length ?? 0);
      if (localNewer || grew) toPush.push(reconciled);
    } else if (l) {
      // Local-only. Something I added while offline: the server has never seen it, so seed it.
      merged.push(l);
      toPush.push(l);
    } else if (r) {
      merged.push(r); // theirs, new to me
    }
  }

  const byCreated = (a: SharedTask, b: SharedTask) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  merged.sort(byCreated);
  toPush.sort(byCreated);
  return { merged, toPush };
}

/**
 * Reconcile one row present on both sides. The LWW winner is the base; the completed set is then
 * made monotonic on top of it, so a tick made by either person survives an unrelated newer edit by
 * the other (a retitle, a cadence change, a removal-then-restore).
 */
function reconcile(l: SharedTask, r: SharedTask): SharedTask {
  const out: SharedTask = rank(l.updatedAt) > rank(r.updatedAt) ? { ...l } : { ...r };

  const dates = new Set([...(l.completedDates ?? []), ...(r.completedDates ?? [])]);
  if (dates.size > 0) out.completedDates = [...dates].sort();

  return out;
}

/** LWW rank of an `updatedAt`: a non-finite value (a corrupt row that parsed to NaN, say) ranks as
 *  -Infinity so it always LOSES, rather than making every `>` comparison false and silently pinning
 *  the row to the corrupt copy. Same guard, same reason, as sync-merge.ts. */
function rank(updatedAt: number): number {
  return Number.isFinite(updatedAt) ? updatedAt : -Infinity;
}

// The other half of this story, keeping a write from stamping BEHIND the row it replaces when the
// two clocks disagree, is `withMonotonicStamps` in tasks.ts. It was already solving exactly this for
// the personal list against the MCP Worker's clock, so it was widened to any {id, updatedAt} rather
// than copied here: two implementations of "who won" is precisely how two people end up looking at
// two different lists.
