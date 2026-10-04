// The pure heart of cloud sync: merge a local task list with the remote one by
// last-write-wins on updatedAt, and work out which rows the server still needs.
// No network, no Supabase, no clock, so it is fully unit-testable (sync-merge.test.ts).
// The integration seam that actually talks to Supabase lives in sync.ts and calls this.

import { type Task } from './tasks';

/**
 * The Task fields the server never stores (TaskRow has no column for them), so the copy on THIS device is
 * their only truth. A row pulled from the server cannot carry them, so whenever the remote copy wins (it is
 * newer, or the timestamps TIE, which is every sync after a push), reconcileConflict carries each one from
 * the local copy instead of letting it vanish.
 *
 * Until 2026-10-04 only manualOrder was carried, so the SECOND sync after any of these was set silently
 * wiped it on a single device: Make it tiny's real task lost openParent (ticking the tiny step then
 * completed the real task instead of bringing it back) and its step lost parentTitle (its eyebrow went); a
 * broken-down step lost decompositionId (its completion outcome stopped reaching the moat); a reminder lost
 * nudgeAt / nudgeId (the bell went and it could no longer be cancelled, so it fired on a finished task);
 * suggestBreakdown and combinedFrom went too.
 *
 * sync-merge.test.ts fails unless every Task key is either synced by taskToRow or listed here. A field
 * that GAINS a column must leave this list in the same commit, or the carry would overwrite the synced
 * value with this device's copy. (Another device still never receives these. That needs the columns.)
 */
export const LOCAL_ONLY_FIELDS = [
  'manualOrder',
  'decompositionId',
  'decompositionSteps',
  'suggestBreakdown',
  'nudgeAt',
  'nudgeId',
] as const satisfies readonly (keyof Task)[];

/**
 * Fields that GAINED a column on 2026-10-04 (openParent, parentTitle, combinedFrom, beside the new leftOff):
 * plain last-write-wins from now on, plus the pre-column seed `big` got. On a timestamp TIE the two rows are
 * the same logical version, so a value held only locally is from before the column existed: it is kept and
 * pushed, so the first sync after the migration SEEDS the server instead of erasing the device's copy.
 */
export const SEEDED_FIELDS = ['openParent', 'parentTitle', 'combinedFrom'] as const satisfies readonly (keyof Task)[];

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
      // slices.done, seed a tie-held big (the pre-column migration, see reconcileConflict), and carry the
      // local-only manualOrder. Push when local won OR the reconciliation grew the synced data beyond the
      // server's remote copy, so the server converges too.
      const reconciled = reconcileConflict(l, r);
      merged.push(reconciled);
      const localNewer = rank(l.updatedAt) > rank(r.updatedAt);
      const grewBeyondRemote =
        (reconciled.completedDates?.length ?? 0) > (r.completedDates?.length ?? 0) ||
        (reconciled.slices?.done ?? 0) > (r.slices?.done ?? 0) ||
        (reconciled.big === true && r.big !== true) ||
        SEEDED_FIELDS.some((key) => reconciled[key] != null && r[key] == null);
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
// completedDates is unioned (grow-only) and slices.done takes the max. The local-only fields (never sent
// to the server, LOCAL_ONLY_FIELDS) are carried from the local copy instead of being dropped when the
// remote row wins. This is the never-lose-a-task, never-shame-by-disappearance guarantee, made real in sync.
function reconcileConflict(l: Task, r: Task): Task {
  const out: Task = rank(l.updatedAt) > rank(r.updatedAt) ? { ...l } : { ...r };

  const dates = new Set([...(l.completedDates ?? []), ...(r.completedDates ?? [])]);
  if (dates.size > 0) out.completedDates = [...dates].sort();

  if (out.slices) {
    const done = Math.max(l.slices?.done ?? 0, r.slices?.done ?? 0);
    out.slices = { total: out.slices.total, done: Math.min(done, out.slices.total) };
  }

  // big syncs by plain LWW (marking or clearing bumps updatedAt, so the winner's value is the truth), with
  // ONE exception: on a timestamp tie the two rows are the same logical version, so a big held by only one
  // side can only be a mark from the pre-column era, when big lived on-device and never synced. OR it in,
  // so the first sync after the column lands SEEDS every existing mark instead of erasing it. Between NEW
  // clients this cannot resurrect a cleared big (a real clear bumps updatedAt and never ties). Two accepted
  // transition edges, both biased keep-not-lose on purpose (adversarial review 2026-07-12): a pre-column
  // client's old local-carry re-attaches big to rows it adopts, manufacturing a tie that re-seeds a cleared
  // big ONCE when that device upgrades (a re-clear then sticks by LWW); and a pre-column mark is lost if
  // another writer edited that row before the device's first new-client sync (no tie, remote wins). Seeding
  // wider than exact ties would turn the second edge into permanent resurrection, the worse failure.
  // Finite equality, not rank equality: two corrupt (non-finite) stamps must not fake a tie.
  if (Number.isFinite(l.updatedAt) && l.updatedAt === r.updatedAt && (l.big || r.big)) out.big = true;

  for (const key of LOCAL_ONLY_FIELDS) carryLocal(out, l, key);
  if (Number.isFinite(l.updatedAt) && l.updatedAt === r.updatedAt) {
    for (const key of SEEDED_FIELDS) if (l[key] != null && r[key] == null) seedFromLocal(out, l, key);
  }

  return out;
}

/** A pre-column value from the local copy onto a tied reconciliation (see SEEDED_FIELDS). */
function seedFromLocal<K extends (typeof SEEDED_FIELDS)[number]>(out: Task, l: Task, key: K): void {
  out[key] = l[key];
}

/** One local-only field from the local copy onto the reconciled task: kept when local has it, absent when
 *  local has none (so a carry never invents a key). */
function carryLocal<K extends (typeof LOCAL_ONLY_FIELDS)[number]>(out: Task, l: Task, key: K): void {
  if (l[key] != null) out[key] = l[key];
  else delete out[key];
}

/** LWW rank of an updatedAt: a non-finite value (a corrupt remote row that parsed to NaN, say)
 *  ranks as -Infinity, so it always loses the comparison rather than winning it. A NaN compared
 *  directly makes every `>` false, which would silently adopt the corrupt row and pin the task to
 *  it; mapping to -Infinity makes the good copy win instead. */
function rank(updatedAt: number): number {
  return Number.isFinite(updatedAt) ? updatedAt : -Infinity;
}
