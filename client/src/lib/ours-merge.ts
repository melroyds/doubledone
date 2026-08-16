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

/**
 * The per-date completion record of a repeating shared row.
 *
 * NOT a set of dates, and the difference is the whole of this file's hardest bug. A grow-only set
 * of ticked dates cannot lose a tick, which is right, but it also cannot express an UN-tick, so
 * removing today's date locally was silently restored by the very next merge and never reached the
 * server at all. Two shipped promises rest on un-ticking working: the finality affirmations are
 * deliberately withheld on Ours *because* your person can un-tick, and Phase 5 stops rendering done
 * rows at the day boundary so that un-tick works all day. Both were half true.
 *
 * So each date carries the time it was last ticked and the time it was last cleared, and the later
 * one wins. Both maps are grow-only in keys and monotonic in values, which makes this a
 * last-write-wins element set: order of merging cannot change the answer, no tick is ever lost, no
 * un-tick is ever lost, and ticking again after an un-tick works (which a simple add-set plus
 * remove-set could never do).
 *
 * Still a record of WHEN and never of WHO. There is no person anywhere in this shape, and there
 * must never be.
 */
export type CompletionLog = {
  on?: Record<string, number>; // ISO date -> epoch ms it was last ticked
  off?: Record<string, number>; // ISO date -> epoch ms it was last un-ticked
};

/** A row of a shared list, mirroring `public.shared_tasks`. Structurally a subset of Task on
 *  purpose, so the existing pure day/recurrence helpers (which are generic over their inputs) work
 *  on these unchanged, via `completedDatesOf` below. */
export type SharedTask = {
  id: string;
  title: string;
  done: boolean;
  doneAt?: number | null; // epoch ms the row was ticked. A TIME. Never who.
  recurrence?: Recurrence;
  rawRecurrence?: unknown; // a cadence THIS build cannot read, kept verbatim so it is never erased
  completions?: CompletionLog; // per-date tick / un-tick record, by EITHER person, unattributed
  /**
   * The day this lands on BOTH your Todays. 'YYYY-MM-DD', local, or absent for the ordinary case.
   *
   * Absent is the DEFAULT and the common one: milk, batteries, ask about the gutter. Those live in
   * the room and are read when you are going to the shop; putting them on a day would be handing
   * the other person write access to your morning, which is the overwhelm this app exists to
   * prevent.
   *
   * A date is the deliberate exception, for the shared thing that genuinely has a day: the parcel on
   * Thursday, rent on Friday. A repeat (`recurrence`) is the same idea with a rhythm, and the two are
   * mutually exclusive in practice for the same reason they are on a personal task.
   */
  due?: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null; // tombstone, same convention as tasks
};

/**
 * Whether a repeat counts as done on a date.
 *
 * A TIE resolves to done. Two writes landing in the same millisecond is vanishingly rare, and of
 * the two ways to be wrong, "your finished work quietly un-finished itself" is the one this
 * audience cannot afford. Both errors are recoverable by tapping again; only one of them stings.
 */
export function isDoneOn(log: CompletionLog | undefined, date: string): boolean {
  const on = log?.on?.[date];
  if (on === undefined) return false; // a date never ticked is not done, whatever `off` says
  return on >= (log?.off?.[date] ?? Number.NEGATIVE_INFINITY);
}

/** The plain sorted dates a repeat is done on, which is what the shared recurrence engine and the
 *  existing pure day helpers consume. Derived, never stored, so the two can never disagree. */
export function completedDatesOf(log: CompletionLog | undefined): string[] {
  return Object.keys(log?.on ?? {})
    .filter((d) => isDoneOn(log, d))
    .sort();
}

/**
 * Tick a date. Records the time; records nothing about who.
 *
 * Both of these lift their own stamp past the opposing one rather than trusting the caller's clock,
 * which is the same guarantee `withMonotonicStamps` gives the ROW and which the completion log used
 * to leave as a promise in a comment. No caller could have honoured it: the stamp being competed
 * with was written by the other person's phone, whose clock this device does not control. Without
 * the lift, one far-future stamp (a phone set to 2030, or a hand-rolled PostgREST call, which RLS
 * permits for your own pair) pins a date until real time catches up, and the SQL clamp cannot reach
 * inside the jsonb to help.
 */
export function tickOn(log: CompletionLog | undefined, date: string, now: number): CompletionLog {
  const off = log?.off?.[date];
  const stamp = off !== undefined && off > now ? off : now; // a tie already resolves to done
  return { ...log, on: { ...log?.on, [date]: stamp } };
}

/** Un-tick a date. Must STRICTLY beat the tick it clears, because a tie resolves to done. */
export function clearOn(log: CompletionLog | undefined, date: string, now: number): CompletionLog {
  const on = log?.on?.[date];
  const stamp = on !== undefined && on >= now ? on + 1 : now;
  return { ...log, off: { ...log?.off, [date]: stamp } };
}

/**
 * Let go of every date a log currently counts as done, because the row has stopped repeating.
 *
 * THE trap this exists for, and it is the sharpest one in the whole When design. A repeat's ticks
 * live ONLY in `completions`: `done` stays false on the row, because a repeat is never finished, it
 * is finished *on a day*. The moment a write clears the recurrence, `reconcile` stops treating the
 * row as repeating and starts projecting `done` from that same log, which is correct for a one-off
 * and catastrophic here. "Every Thursday", ticked twice in the past month, becomes a row that says
 * DONE, for both people, carrying a doneAt from whenever it was last ticked. And it PUSHES, so the
 * other phone gets it too.
 *
 * Deleting the keys does not work. `mergeStamps` re-supplies them from whichever copy still has
 * them, which on a two-person list is the other person's phone. A completion log is a CRDT: the
 * only way to say "not done" is to say it LOUDER, which is what an `off` stamp is for.
 *
 * So: an off stamp per currently-on date, through `clearOn`, which already owns the rule that an
 * off must STRICTLY beat the on it clears (a tie resolves to done). The history survives, which
 * matters: the Lookback is built on it, and a week of bin nights somebody actually did should not
 * be erased because the rhythm ended.
 *
 * Call this on EVERY write that makes a repeating row non-repeating. All three forms do it: a
 * `{ kind: 'none' }`, an absent recurrence, and the dated one. The dated one is the easiest to
 * miss, because setting a date does not feel like an ending, and it is the worst to get wrong: the
 * row lands on both Todays already struck through and stays.
 */
export function releaseCompletions(log: CompletionLog | undefined, now: number): CompletionLog | undefined {
  if (!log) return log;
  return completedDatesOf(log).reduce((acc, date) => clearOn(acc, date, now), log);
}

/**
 * Whether a shared row counts as done on a given day.
 *
 * ONE function for both shapes, because the alternative is every caller remembering which kind of
 * row it is holding. A repeat is done on the day its log says so; a one-off is done full stop, and
 * `reconcile` keeps that flag a projection of the same log, so the two can never disagree.
 */
export function isSharedDoneOn(task: SharedTask, date: string): boolean {
  if (task.recurrence !== undefined && task.recurrence.kind !== 'none') return isDoneOn(task.completions, date);
  return task.done;
}

/**
 * Tick or un-tick a shared row on a day.
 *
 * EVERYTHING goes through the completion log, including one-offs, and that is the point: it is the
 * only structure that can express an un-tick, and un-ticking is load-bearing here. It is why the
 * finality affirmations are withheld on Ours and it is the reason two-party confirmation was
 * refused, so it has to be exactly as easy as ticking.
 *
 * `done` and `doneAt` are then set to match for a one-off, which is what `reconcile` would derive
 * anyway: writing them here means the row is right on screen immediately rather than only after the
 * next merge. Pure, so `now` comes in rather than being read.
 */
export function setSharedDone(task: SharedTask, date: string, done: boolean, now: number): SharedTask {
  const repeating = task.recurrence !== undefined && task.recurrence.kind !== 'none';

  // A REPEAT is done per day, so one date is exactly the right scope.
  if (repeating) {
    const completions = done ? tickOn(task.completions, date, now) : clearOn(task.completions, date, now);
    return { ...task, completions, updatedAt: now };
  }

  // A ONE-OFF is done or not done, full stop, and that is where clearing only today's date was
  // silently wrong. Tick it on Sunday, come back Monday, tap it: `clearOn` wrote off['monday']
  // against on['sunday'], which is inert, the projection below stayed true, and the row could never
  // be un-ticked again by anyone, on any phone. Every further tap repeated the no-op while bumping
  // `updatedAt`, so it also washed on the other person's screen: the room announcing a change that
  // had not happened. It survived sixteen tests because every one of them passed the SAME day to
  // both calls, and it fires across a timezone gap on the very first day.
  //
  // So an un-tick clears every date the log currently reports as on. Each still gets its own
  // strictly-greater `off` stamp, so this stays a commutative last-write-wins element set and no
  // ordering of merges can resurrect the tick.
  const completions = done
    ? tickOn(task.completions, date, now)
    : [...completedDatesOf(task.completions), date].reduce<CompletionLog>((log, on) => clearOn(log, on, now), task.completions ?? {});

  const dates = completedDatesOf(completions);
  const last = dates[dates.length - 1];
  return {
    ...task,
    completions,
    updatedAt: now,
    done: dates.length > 0,
    doneAt: last !== undefined ? (completions.on?.[last] ?? null) : null,
  };
}

/**
 * The quiet wash: which rows changed since you last looked.
 *
 * A tint and a slightly stronger border, nothing more. It is the one concession to "something
 * happened while I was away", and the design argued FOR it on exactly one ground: it BOUNDS the
 * re-reading loop. Without it, the only way to know whether anything moved is to read the whole list
 * against your memory of it, every time, which for this audience is the checking compulsion with a
 * new object. With it, you look once and you are done.
 *
 * What it must never become: `mine` is subtracted, so your OWN edits never wash. That is not a
 * nicety. A wash on a row you just wrote would read as "your person touched this too", which is
 * attribution invented out of nothing, on a screen whose whole architecture refuses to store who
 * did what. The set names nobody and counts nothing; it is a set of ids, and the screen tints them.
 *
 * `seenAt` is a local time and `updatedAt` came from whichever phone wrote it, so a badly skewed
 * clock on either side can wash a row that is not new, or miss one that is. Both fail quietly and
 * both clear on the next open, which is why this is a tint and never a notification.
 */
export function washedSince(tasks: SharedTask[], seenAt: number, mine: ReadonlySet<string>): Set<string> {
  if (!Number.isFinite(seenAt) || seenAt <= 0) return new Set(); // a first-ever visit washes nothing
  const out = new Set<string>();
  for (const task of tasks) {
    if (mine.has(task.id)) continue;
    if (Number.isFinite(task.updatedAt) && task.updatedAt > seenAt) out.add(task.id);
  }
  return out;
}

/**
 * Whether a row still belongs on the list at all.
 *
 * It used to drop finished one-offs at the day boundary, for parity with Today. That was Today's
 * logic applied where it does not belong, and dogfooding killed it inside an hour: Melroy's wife
 * ticked a row, it vanished from his screen at midnight, and his report was the whole argument.
 * "They wouldn't have had a clue that the item just disappeared."
 *
 * A row leaving a shared list without a trace is the exact "did I delete that? did she?" loop the
 * rest-note was built to prevent on Today, reintroduced in the one place two people can unsettle
 * each other. And a household list is not a day: "the shopping" does not reset at midnight the way
 * a day one person is getting through does.
 *
 * So a finished row STAYS, struck through, until somebody removes it, and removal leaves a trace of
 * its own in Recently removed. If lists get cluttered in real use the answer is a collapsed
 * "Finished" fold at the foot, never a disappearance.
 *
 * `_date` is kept in the signature deliberately: the day-boundary question is a reasonable one to
 * ask again, and callers already pass it.
 */
export function stillOnList(task: SharedTask, _date: string): boolean {
  // Removed is the ONLY thing that takes a row off a shared list, and it leaves a trace: Recently
  // removed, seven days, one tap back.
  return !task.deletedAt;
}

/** Per-key maximum of two stamp maps: grow-only in keys, monotonic in values. */
function mergeStamps(a: Record<string, number> = {}, b: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [date, stamp] of Object.entries(b)) {
    const mine = out[date];
    if (mine === undefined || stamp > mine) out[date] = stamp;
  }
  return out;
}

/**
 * The most dates one log may carry, across `on` and `off` together.
 *
 * `shared_tasks.completions` has a 64KB CHECK, which at roughly 29 bytes an entry is about 2,300
 * entries: a daily repeat crosses it in a few years, and when it does the 23514 poisons the whole
 * batch upsert and nothing recovers, because even deleting the task keeps the payload on the
 * tombstone. Two years of daily history is far more than any surface reads, and the eviction is a
 * COUNT rather than a time horizon so this file stays clock-free and the cap still commutes: taking
 * the newest N keys of a union is the same set whichever order the union was built in.
 */
export const COMPLETION_MAX_DATES = 730;

/** Keep the newest N dates, dropping evicted ones from BOTH maps together so a date can never
 *  survive as an un-tick whose tick has been forgotten (which would read as never done). */
function capDates(on: Record<string, number>, off: Record<string, number>): void {
  const dates = [...new Set([...Object.keys(on), ...Object.keys(off)])];
  if (dates.length <= COMPLETION_MAX_DATES) return;
  // ISO dates sort lexicographically, so this is newest-first without parsing anything.
  const evicted = dates.sort().slice(0, dates.length - COMPLETION_MAX_DATES);
  for (const date of evicted) {
    delete on[date];
    delete off[date];
  }
}

/** Merge two completion logs. Commutative and idempotent, so two phones converge whichever order
 *  they sync in, and re-merging the same pair changes nothing. */
export function mergeCompletions(a: CompletionLog | undefined, b: CompletionLog | undefined): CompletionLog | undefined {
  if (!a && !b) return undefined;
  const on = mergeStamps(a?.on, b?.on);
  const off = mergeStamps(a?.off, b?.off);
  capDates(on, off);
  const out: CompletionLog = {};
  if (Object.keys(on).length) out.on = on;
  if (Object.keys(off).length) out.off = off;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Whether a merged log holds anything the server's copy does not, and therefore owes it a push.
 *
 * Compares STAMPS and not just key counts. An un-tick of a date the server already has ticked adds
 * no key, and a re-tick of a date it already has cleared adds no key either, so counting would
 * silently keep both on this phone forever while the other person's screen disagreed.
 */
function growsBeyond(merged: CompletionLog | undefined, remote: CompletionLog | undefined): boolean {
  for (const side of ['on', 'off'] as const) {
    for (const [date, stamp] of Object.entries(merged?.[side] ?? {})) {
      const theirs = remote?.[side]?.[date];
      if (theirs === undefined || stamp > theirs) return true;
    }
  }
  return false;
}

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
 *   1. The completion log merges per DATE, never whole-row. Two people ticking the bins from two
 *      phones is the likeliest simultaneous write this feature will ever see, and whole-row
 *      last-write-wins drops whichever tick lost the race, silently un-completing someone's
 *      finished work on their partner's screen. See `CompletionLog`: it also carries un-ticks,
 *      which the first version of this file could not express at all.
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
      // Push when my copy won the comparison, OR when the merged completion log holds anything the
      // server's does not, so the OTHER person's phone converges too rather than only mine. This is
      // the branch an un-tick travels on: clearing today's date does not make my row newer than a
      // retitle they made an hour ago, so without this the un-tick would live on this phone alone.
      const localNewer = rank(l.updatedAt) > rank(r.updatedAt);
      if (localNewer || growsBeyond(reconciled.completions, r.completions)) toPush.push(reconciled);
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
 * Reconcile one row present on both sides. The LWW winner is the base; the completion log is then
 * merged per date on top of it, so a tick OR an un-tick made by either person survives an unrelated
 * newer edit by the other (a retitle, a cadence change, a removal-then-restore).
 */
function reconcile(l: SharedTask, r: SharedTask): SharedTask {
  const out: SharedTask = rank(l.updatedAt) > rank(r.updatedAt) ? { ...l } : { ...r };

  const completions = mergeCompletions(l.completions, r.completions);
  if (completions) out.completions = completions;
  else delete out.completions;

  // A ONE-OFF's tick lives in done / doneAt, and those ride whole-row last-write-wins, so until
  // this existed the per-date protection covered only repeats: any newer unrelated edit by the
  // other person (a retitle, a restore) took the whole row and the tick was gone from both phones
  // and the server, with growsBeyond not even pushing it back because it only inspects the log.
  // The field answer for this feature is "mostly one-offs with a few recurrences", so the protected
  // case was the minority. done is now a PROJECTION of the log for one-offs, which removes the
  // second completion code path rather than giving it a second set of rules.
  //
  // Guarded on a non-empty log, so a row that has never been ticked THROUGH the log keeps whatever
  // last-write-wins decided: a client that predates this must not have its ticks erased.
  if (!isRepeating(out) && completions && hasStamps(completions)) {
    const dates = completedDatesOf(completions);
    const last = dates[dates.length - 1];
    out.done = dates.length > 0;
    out.doneAt = last !== undefined ? (completions.on?.[last] ?? null) : null;
  }

  return out;
}

/** Whether a row repeats. `kind: 'none'` is the recurrence type's own way of saying it does not. */
function isRepeating(task: SharedTask): boolean {
  return task.recurrence !== undefined && task.recurrence.kind !== 'none';
}

function hasStamps(log: CompletionLog): boolean {
  return Object.keys(log.on ?? {}).length > 0 || Object.keys(log.off ?? {}).length > 0;
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
