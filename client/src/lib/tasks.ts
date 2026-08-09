// Pure task helpers: the data model plus serialize / deserialize / dump parsing.
// No React Native or storage imports, so this is unit-testable in a node env
// (see tasks.test.ts). The AsyncStorage wrapper lives in storage.ts and stays a
// thin, untested SDK seam.

import { correctedNow } from './clock';
import { type Recurrence } from './recurrence';

// A task with parts: a thing done in N steps (10 TV episodes, a 3-step chore).
// `done` is the slices completed (0..total); the task is finished exactly when
// done >= total. See lib/slices for the (pure) progress arithmetic.
export type Slices = { total: number; done: number };

export type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number; // epoch ms; stable identity + sort
  updatedAt: number; // epoch ms; bumped on every change, drives last-write-wins sync
  deletedAt?: number | null; // epoch ms tombstone; set = soft-deleted, hidden from views, synced as a delete
  completedAt?: number | null; // epoch ms a one-off was finished (the calendar/Lookback record); recurring uses completedDates
  complexity?: number | null; // effort signal (decomposition minutes); weights the celebration, never shown as a score
  due?: string | null; // 'YYYY-MM-DD' for a one-off; null/undefined = someday
  recurrence?: Recurrence; // absent = one-off (see lib/recurrence)
  completedDates?: string[]; // ISO dates a recurring task was ticked (per-day completion)
  skippedDates?: string[]; // ISO dates a recurring task's instance was removed from Today (skip-today; the series continues, see lib/today skipOn)
  slices?: Slices | null; // absent = whole task; present = track progress across parts (see lib/slices)
  suggestBreakdown?: boolean; // AI triage flagged this as too big to just do; shows an inline "break it down?" on the row
  decompositionId?: string; // pseudonymous id of the AI decomposition this step came from; links to the /outcome completion ping (the moat)
  decompositionSteps?: number; // how many steps that decomposition produced (the moat's completion denominator)
  parentId?: string; // this task is a child (a decomposition step or a tiny-version) of a bigger task; links to its silent parent (Cluster B chain)
  parentTitle?: string; // the parent's title, denormalised so the whole-task celebration needs no lookup
  silentParent?: boolean; // a silent parent: kept for the eventual whole-task celebration, hidden from Today / Later until its children are all done
  openParent?: boolean; // a tiny-version parent: its children are partial pebbles, so it never auto-completes (it resurfaces instead); see completeAncestors
  combinedFrom?: { id: string; title: string }[]; // an umbrella made by Combine (the inverse of decompose): the id + title of each task folded into it, kept for the moat and a future un-combine
  nudgeAt?: number; // epoch ms a local "remind me" nudge will fire (today only); drives the row indicator
  nudgeId?: string; // the scheduled-notification id, so the nudge can be cancelled when the task is done / removed / deferred
  pinnedAt?: number; // epoch ms this task was pinned as the day's ONE priority (premium). The at-most-one invariant lives in the pin action, not here. A leaf field: never auto-cleared, so a pinned task that rolls forward unfinished just rolls. Floats to the top of Today via pinFirst.
  manualOrder?: number; // LOCAL-ONLY (premium "Plan my order"): a render-time sort slot, floated by applyManualOrder. NOT synced (deliberately absent from sync.ts taskToRow/rowToTask), so it persists on-device and survives sync (local wins), but cross-device order is a documented follow-up needing a remote column.
  big?: boolean; // user-marked "this one is a lot": weights the day's gauge (counts as BIG_WEIGHT normal tasks, with a floor so one lone big still reads at least "full") and the heavy-day signal, and makes finishing it a big-win (reward.isBigWin). A leaf field, never auto-cleared. SYNCED since 2026-07-12 (the `big` column + sync.ts mapping; plain LWW because setBig bumps updatedAt, plus a tie-seed in sync-merge for marks from the pre-column era).
};

// Shown once on a brand-new install so the first open is not an empty void.
// These are real, deletable tasks, persisted like any other. The third previews
// the Bite-the-Elephant ethos: shrink the dreaded thing to a startable step.
export const SEED: Task[] = [
  { id: 'seed-water', title: 'Drink a glass of water', done: false, createdAt: 0, updatedAt: 0 },
  { id: 'seed-reply', title: "Reply to Sam's message", done: false, createdAt: 1, updatedAt: 1 },
  { id: 'seed-laundry', title: 'Start the laundry, just sort the pile', done: false, createdAt: 2, updatedAt: 2 },
];

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.done === 'boolean' &&
    typeof t.createdAt === 'number'
  );
}

/** Serialize tasks for storage. */
export function serialize(tasks: Task[]): string {
  return JSON.stringify(tasks);
}

/**
 * Parse stored tasks defensively. A corrupt or partial blob must never crash the
 * app or throw away a load: anything unreadable yields an empty list, and any
 * entry that is not a well-formed Task is dropped rather than trusted.
 */
export function deserialize(raw: string | null): Task[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isTask).map(withDefaults);
}

// Older stored blobs predate updatedAt; backfill it from createdAt so last-write-wins
// always has a value to compare, without dropping the task. A malformed `slices`
// (hand-edited storage, a future shape) is dropped rather than trusted, never crashing.
function withDefaults(t: Task): Task {
  const out: Task = { ...t, updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : t.createdAt };
  const slices = cleanSlices((t as Record<string, unknown>).slices);
  if (slices) out.slices = slices;
  else delete out.slices;
  return out;
}

/** Coerce an unknown into a well-formed Slices, or undefined. Clamps done to 0..total. */
function cleanSlices(value: unknown): Slices | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const s = value as Record<string, unknown>;
  if (typeof s.total !== 'number' || typeof s.done !== 'number') return undefined;
  const total = Math.max(0, Math.floor(s.total));
  if (total < 1) return undefined;
  const done = Math.min(total, Math.max(0, Math.floor(s.done)));
  return { total, done };
}

/**
 * Split a brain-dump blob into task titles: one per line, trimmed, blanks
 * dropped. This is the friction-free capture, type freely and let the lines
 * become tasks. Leading list markers (-, *, bullets, numbers) are stripped so
 * pasting an existing list just works.
 */
export function parseDump(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * Strip the "remind me" nudge fields from any task whose nudge time has already passed, so a
 * fired (or now-moot) nudge stops showing its stale row indicator. Pure: returns the SAME array
 * reference when nothing changed, so callers can skip a needless write. The scheduled
 * notification is already spent by the time it elapses, so there is nothing to cancel here.
 */
export function sweepElapsedNudges(tasks: Task[], now: number): Task[] {
  let changed = false;
  const out = tasks.map((t) => {
    if (t.nudgeAt != null && t.nudgeAt <= now) {
      changed = true;
      const next = { ...t };
      delete next.nudgeAt;
      delete next.nudgeId;
      return next;
    }
    return t;
  });
  return changed ? out : tasks;
}

/**
 * Mark a task done as of an EARLIER day ("Done on…"): it was finished, just never
 * ticked, so the Lookback should attribute it to the day it actually happened.
 * completedAt lands at NOON LOCAL of the chosen day, so a timezone edge never
 * bleeds the completion into a neighbouring day. updatedAt is stamped `now` so
 * last-write-wins sync carries the change. A sliced task completes outright
 * (every slice filled), the same as any other finish.
 */
export function completeOnDay(task: Task, dayIso: string, now: number): Task {
  const [y, m, d] = dayIso.split('-').map(Number);
  const completedAt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12).getTime();
  const out: Task = { ...task, done: true, completedAt, updatedAt: now };
  if (task.slices) out.slices = { total: task.slices.total, done: task.slices.total };
  return out;
}

/**
 * Guarantee a monotonic updatedAt for every task a commit CHANGED, so a change to a task we
 * have synced always wins last-write-wins, even against a row a DIFFERENT clock wrote.
 *
 * The bug this closes: sync is last-write-wins on updatedAt, and every task write used to
 * stamp the browser clock. Once the MCP server (a Cloudflare Worker) began writing rows on
 * ITS clock, a user whose browser clock runs even slightly behind produced deletes/edits with
 * an updatedAt LOWER than the Worker-written remote copy, so the remote won the merge and the
 * change silently resurrected on the next pull. Another device's clock is the same hazard.
 *
 * The fix: if a task's new stamp is not strictly greater than the copy we held (t.updatedAt <
 * prev.updatedAt), bump it to prev.updatedAt + 1. Because our local copy already reflects the
 * remote's (foreign) updatedAt after a sync, +1 clears the remote too, so the change wins.
 * A `<` comparison (never `<=`) means an UNCHANGED task, whose updatedAt equals prev, is never
 * touched, so this adds no spurious pushes. Pure; the screen calls it inside commit().
 *
 * Generic over the row shape (it only ever reads `id` and `updatedAt`), because the shared list has
 * the same hazard in a sharper form: there, the "different clock" is not a Worker or your own other
 * phone, it is ANOTHER PERSON's phone writing the same row in the same minute. One implementation,
 * so the two paths cannot drift into disagreeing about who won.
 */
export function withMonotonicStamps<T extends { id: string; updatedAt: number }>(next: T[], prev: T[]): T[] {
  const prevById = new Map(prev.map((t) => [t.id, t]));
  return next.map((t) => {
    const p = prevById.get(t.id);
    return p && t.updatedAt < p.updatedAt ? { ...t, updatedAt: p.updatedAt + 1 } : t;
  });
}

// A task id: the millisecond, a counter, and a random tail, so two tasks captured in the same tick
// still differ WITHIN a device and across two of them.
//
// The counter lives here, shared, rather than beside the screen that captures. It used to be
// module-scope in today.tsx, which was fine while Today was the ONLY place a task could be born. The
// Calendar can now create one too, and two screens each holding their own counter both start at 1, so
// a task made on each within the same millisecond would collide on `t-<ms>-1`. One counter for the
// whole app removes that by construction rather than by luck.
//
// The random tail closes the OTHER collision, found 2026-08-09 while designing shared lists: the
// counter restarts at 1 every launch, so two DEVICES of the same account minting their first task of
// a session in the same millisecond produced the same id, and this id is a global primary key in
// Supabase (`tasks.id text primary key`), so the upsert would silently overwrite one real task with
// the other. Math.random is deliberate: this is collision avoidance, never a secret, and it is the
// one randomness source Hermes has always had (see the Intl gotcha in CLAUDE.md).
let addCounter = 0;

export function makeId(): string {
  addCounter += 1;
  const tail = Math.random().toString(36).slice(2, 6).padEnd(4, '0'); // 4 chars of [0-9a-z]
  return `t-${Date.now().toString(36)}-${addCounter.toString(36)}${tail}`;
}

/**
 * The clock read used to stamp createdAt / updatedAt / tombstones.
 *
 * It lives here, outside any component, for the same reason makeId does: the React Compiler's purity
 * rule rejects `Date.now()` called from a function defined during render, since a re-render would
 * silently produce a different value. Module scope keeps every screen's handlers pure by construction
 * rather than by each one remembering to declare its own copy.
 *
 * It is now the DEVICE clock plus a correction established against the server's (see lib/clock),
 * because every stamp written here drives last-write-wins against rows a different clock wrote: the
 * MCP Worker's, your other phone's, and on a shared list another person's. The correction is zero
 * until a sync sets it, so this is exactly `Date.now()` on a device that has never synced.
 */
export function nowMs(): number {
  return correctedNow(Date.now());
}
