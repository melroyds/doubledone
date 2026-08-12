// The bridges between a shared list and your own Today. Pure, so every rule here is testable
// without a screen or a network (ours-bridge.test.ts).
//
// The governing sentence from the design: NOTHING crosses without a person choosing it. A shared
// task never lands on your Today; you bring it. Your own task never appears on the shared list; you
// share it. This file holds the small amount of logic that keeps a chosen crossing honest afterwards.
//
// The one thing it must never do is leak WHO. A bridge is the obvious place for attribution to creep
// back in ("Alex finished this"), because at the moment of crossing you genuinely do know which side
// acted. Every function below is written to know only THAT something happened, never who.

import { isSharedDoneOn, type SharedTask } from './ours-merge';
import { type Task } from './tasks';

const SEP = '/';

/**
 * The link a pulled copy carries: which list it came from, and which row.
 *
 * ONE string rather than two columns, because it costs one additive nullable column on a live
 * `tasks` table with real subscribers rather than two, and nothing ever queries it server-side. It
 * is only ever written and read whole.
 */
export function makeSharedRef(pairId: string, sharedId: string): string {
  return pairId + SEP + sharedId;
}

/** Read a link back apart. Returns null on anything malformed rather than half a link, because a
 *  half-parsed ref would match the wrong list and bridge a tick to a stranger's task. */
export function parseSharedRef(ref: string | undefined | null): { pairId: string; sharedId: string } | null {
  if (typeof ref !== 'string') return null;
  const at = ref.indexOf(SEP);
  if (at <= 0 || at === ref.length - 1) return null;
  const pairId = ref.slice(0, at);
  const sharedId = ref.slice(at + 1);
  // An id containing the separator would re-split differently on the way back, so refuse it here
  // rather than silently bridging to a task that does not exist.
  if (sharedId.includes(SEP)) return null;
  return { pairId, sharedId };
}

/**
 * Which rows of a list are already on your Today, as shared-id -> your task's id.
 *
 * The "Bring to my Today" action reads this so it can say "already there" instead of quietly making
 * a second copy.
 *
 * Neither a tombstoned NOR a finished copy counts, and the second half of that was a trap. You
 * removed it from your day, or it is done: either way it is not on your plate, and bringing it over
 * again is a thing you are allowed to want (a repeat that has come round again, most obviously).
 * While only tombstones were ignored, a copy marked done by the other side left you with something
 * you could not see on Today AND could not re-add from Ours. Melroy: "before this fix, I could
 * re-add the missing completed task. Now I can't from the Ours screen."
 */
export function pulledFrom(tasks: Task[], pairId: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const task of tasks) {
    if (task.deletedAt || task.done) continue;
    const ref = parseSharedRef(task.sharedRef);
    if (ref?.pairId === pairId) out.set(ref.sharedId, task.id);
  }
  return out;
}

/**
 * Copies whose shared origin has been REMOVED from the list.
 *
 * Melroy raised this having watched it: "I removed tasks from the Ours list and the copies still
 * remain in my Today list. I know that's not a bug. But SHOULD it be? Do we leave an indicator?"
 *
 * The copy deliberately stays (see `sharedRestNotes`: removal is not completion, and nobody else's
 * tidying should reach into your day). That answers "should we delete it" and says nothing at all
 * about "should we tell you", and I had conflated the two. THE CASE THAT DECIDES IT IS WASTED
 * EFFORT: your person takes "milk" off the list because she already bought it, your copy sits there
 * silent, and you go and buy milk. For this audience effort is the scarce resource, and doing
 * cancelled work stings more than almost anything else the app could get wrong.
 *
 * It is also the sibling of a case already handled. A row FINISHED on the other side leaves a note
 * on your copy; a row REMOVED left nothing, and the silent one is the one that can waste an
 * afternoon.
 *
 * Returns ids only. What the caller draws must say the fact and nothing more: never who (there is
 * no such data anywhere in this feature, and this is exactly where the temptation comes back) and
 * never why (removal could be done, not-needed, or tidying, and the app cannot tell them apart).
 *
 * A copy you have already FINISHED is excluded: you did the thing, so its origin's fate is not
 * news. So is one you have removed yourself.
 *
 * KNOWN AND ACCEPTED LIMIT, with the number corrected: `sweep_shared_tombstones` redacts tombstones
 * at THIRTY days, not the seven I first wrote here (supabase/ours-resume.sql, `k_horizon`, chosen to
 * sit comfortably past Phase 5's seven-day Restore window). After that a removed origin is
 * indistinguishable from one never pulled and the note stops appearing.
 *
 * Thirty days is longer than this note deserves to live. It matters in the first day or two; past
 * that it is the app still mentioning a deletion nobody is thinking about, which is the creepiness
 * the seven-day figure had me believing we avoided. Not changed here, because the sweep horizon is
 * load-bearing for Restore and is not this note's to move. Recorded so the next reader has the real
 * number rather than the one I assumed.
 */
export function removedOrigins(tasks: Task[], shared: SharedTask[], pairId: string): Set<string> {
  const byId = new Map(shared.map((row) => [row.id, row]));
  const out = new Set<string>();
  for (const task of tasks) {
    if (task.deletedAt || task.done) continue;
    const ref = parseSharedRef(task.sharedRef);
    if (ref?.pairId !== pairId) continue;
    if (byId.get(ref.sharedId)?.deletedAt) out.add(task.id);
  }
  return out;
}

/**
 * The copies that should now read as DONE, because the shared row got finished on the other side.
 *
 * REVERSED 2026-08-11, by Melroy, having watched the old behaviour twice: "It should remain and be
 * marked as done. A win counts for both people. Not just one."
 *
 * The old version retired the copy (a tombstone) and left a dashed note in its place, on the
 * reasoning that the work was done but YOU did not do it, so completing it would invent a memory.
 * That reasoning holds for a task of your own. It does not hold for a list two people keep on
 * purpose: the shopping got done, the day is genuinely lighter, and the person who did not do it
 * this time is not owed a smaller day for it. It also had the day quietly emptying itself, and a row
 * that vanishes is the "did I delete that?" loop this app exists to avoid. The note was a patch over
 * a disappearance that should not have been happening.
 *
 * IT IS MARKED DONE **WITH** `completedAt`, and this paragraph used to claim the exact opposite,
 * "by construction" and all. Melroy reversed it on 2026-08-11 ("a win counts for both people, not
 * just one") and the claim survived the change, sitting in the pure, tested layer where a rule looks
 * authoritative while the actual policy lives in a screen file. A "by construction" sentence is the
 * kind a future reader stops verifying, which is exactly why a stale one is worse than none.
 *
 * The policy lives in today.tsx's settle, deliberately: what enters your Lookback is a product
 * decision about your week, not a property of this matching function.
 *
 * A REMOVED shared row deliberately does not trigger this. Removal is not completion, and your copy
 * is your own task now; nobody else's tidying should reach into your day.
 */
export function sharedRestNotes(
  tasks: Task[],
  shared: SharedTask[],
  pairId: string,
  date: string,
): { id: string; title: string }[] {
  const byId = new Map(shared.map((s) => [s.id, s]));
  const out: { id: string; title: string }[] = [];
  for (const task of tasks) {
    if (task.done || task.deletedAt) continue;
    // A RECURRING copy is never retired here, and this is a data-loss guard rather than a nicety.
    // A brought copy is created as a one-off, but nothing stops somebody giving theirs a rhythm
    // afterwards. `task.done` is always false on a repeat, so it would sail through every test
    // below and then be tombstoned with `deletedAt` — which on a repeat deletes the WHOLE SERIES,
    // not today's instance, because their partner ticked the shared row once.
    if (task.recurrence !== undefined && task.recurrence.kind !== 'none') continue;
    const ref = parseSharedRef(task.sharedRef);
    if (ref?.pairId !== pairId) continue;
    const origin = byId.get(ref.sharedId);
    if (!origin || origin.deletedAt) continue;
    if (isSharedDoneOn(origin, date)) out.push({ id: task.id, title: task.title });
  }
  return out;
}
