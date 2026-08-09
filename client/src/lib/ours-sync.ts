import { type SupabaseClient } from '@supabase/supabase-js';

import { type CompletionLog, mergeShared, type SharedTask } from './ours-merge';
import { type Recurrence } from './recurrence';

// The Supabase seam for the SHARED list. Same shape as sync.ts: the row <-> task mapping is pure
// and unit-tested, and pull / push / syncPairOnce wrap the merge engine (ours-merge.ts) around the
// network. Timestamps cross as ISO strings (timestamptz on the server) and live as epoch ms here.
//
// The server's `updated_at` is the value WE send, never a now() trigger, or last-write-wins breaks.
// supabase/ours.sql says so at the top and clamps a far-future stamp rather than overwriting it.

const TABLE = 'shared_tasks';

/** Mirrors `char_length(title) between 1 and 500` in supabase/ours.sql. `public.tasks.title` has NO
 *  such cap, so a title that is perfectly legal on your personal list is fatal on the shared one,
 *  which is exactly what Phase 4's "Share to Ours" will create. The whole toPush set goes as ONE
 *  upsert, so a single 23514 aborts every row in it and the pair silently stops converging in both
 *  directions, with no symptom either person can see except the other appearing to go quiet. */
export const TITLE_MAX = 500;

/** Spread rather than slice: Postgres counts code points and JS counts UTF-16 units, so a plain
 *  slice can cut through a surrogate pair and swap one poison row for another. Emoji in task titles
 *  are ordinary in this audience. */
function clampTitle(title: string): string {
  return title.length <= TITLE_MAX ? title : [...title].slice(0, TITLE_MAX).join('');
}

/** The remote row shape (snake_case), matching `public.shared_tasks`. */
export type SharedRow = {
  id: string;
  pair_id: string;
  title: string;
  done: boolean;
  done_at: string | null;
  // jsonb, so `unknown` is the honest type: this column is written by the OTHER person's client and
  // may hold a cadence this build has never heard of. knownRecurrence decides what to trust.
  recurrence: unknown;
  completions: CompletionLog | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/**
 * Local task -> remote row.
 *
 * Every field is emitted UNCONDITIONALLY (null, never an absent key), the same hard-won rule as
 * `taskToRow`: supabase-js unions the keys across the rows of one batch upsert and defaults the
 * gaps to NULL, so a conditionally-emitted field silently nulls that column on every OTHER row in
 * the batch.
 *
 * `created_by` is deliberately NOT sent. A BEFORE trigger stamps it from auth.uid() and would
 * overwrite anything we sent anyway, and the point of that trigger is that the client is not
 * trusted with authorship: either partner could otherwise forge the other's.
 */
export function sharedToRow(task: SharedTask, pairId: string): SharedRow {
  return {
    id: task.id,
    pair_id: pairId,
    title: clampTitle(task.title),
    done: task.done,
    done_at: task.doneAt ? new Date(task.doneAt).toISOString() : null,
    recurrence: task.recurrence ?? task.rawRecurrence ?? null,  // an unreadable cadence rides back out verbatim
    completions: task.completions ?? null,
    created_at: new Date(task.createdAt).toISOString(),
    updated_at: new Date(task.updatedAt).toISOString(),
    deleted_at: task.deletedAt ? new Date(task.deletedAt).toISOString() : null,
  };
}

/**
 * Remote row -> local task. Optional fields are only set when present, so a round-trip is exact.
 *
 * Timestamps are parsed defensively for the same reason sync.ts does it: a corrupt remote value
 * becomes NaN, and a NaN `updatedAt` loses every comparison (NaN > x is always false) and poisons
 * the sort, silently pinning the row to the bad copy. Each parse falls back to created_at, then to
 * the epoch, so a finite number always lands.
 *
 * The completion log is validated rather than trusted: it arrives as jsonb from a column the OTHER
 * person's client also writes, so a shape this build does not expect must degrade to "no
 * completions" rather than reach the merge engine and throw on someone's shared list.
 */
export function rowToShared(row: SharedRow): SharedTask {
  const createdAt = finiteOr(Date.parse(row.created_at), 0);
  const task: SharedTask = {
    id: row.id,
    title: row.title,
    done: row.done,
    createdAt,
    updatedAt: finiteOr(Date.parse(row.updated_at), createdAt),
  };
  if (row.done_at != null) task.doneAt = finiteOr(Date.parse(row.done_at), createdAt);
  const recurrence = knownRecurrence(row.recurrence);
  if (recurrence) task.recurrence = recurrence;
  // A cadence this build cannot read is kept VERBATIM and pushed back untouched, so a client that
  // does not understand a repeat is never the client that erases it for the person who set it.
  else if (row.recurrence != null) task.rawRecurrence = row.recurrence;
  const completions = sanitiseCompletions(row.completions);
  if (completions) task.completions = completions;
  if (row.deleted_at != null) task.deletedAt = finiteOr(Date.parse(row.deleted_at), createdAt);
  return task;
}

/** A finite epoch-ms value, or the fallback when the parse produced NaN / Infinity. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Keep only `{date: finite number}` entries. Anything else on either side is dropped. */
function sanitiseStamps(input: unknown): Record<string, number> | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const out: Record<string, number> = {};
  for (const [date, stamp] of Object.entries(input as Record<string, unknown>)) {
    if (typeof stamp === 'number' && Number.isFinite(stamp)) out[date] = stamp;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Validate a cadence written by the OTHER person's client.
 *
 * Same rule as sanitiseCompletions one function below, applied to the column it was silently
 * missing: `ours.sql` validates only the SIZE of this jsonb. `isDueOn` reads `r.weekdays.includes`
 * with no guard, so a `{"kind":"weekly"}` from a newer or hand-rolled client white-screens the other
 * person's whole shared list, and there is no error boundary anywhere above it.
 */
export function knownRecurrence(input: unknown): Recurrence | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const r = input as {
    kind?: unknown;
    weekdays?: unknown;
    days?: unknown;
    anchor?: unknown;
    start?: unknown;
    summary?: unknown;
  };
  const startOk = r.start === undefined || typeof r.start === 'string';
  // See `repeatSummaryOf` below: a `summary` key rides along inside this object and must SURVIVE
  // the clean rebuild, or the client that understands a cadence becomes the one that strips the
  // fallback the client that does not understand it depends on.
  const carry = <T>(out: T): T => (typeof r.summary === 'string' ? { ...out, summary: r.summary } : out);
  if (r.kind === 'none') return carry({ kind: 'none' });
  if (r.kind === 'daily')
    return startOk ? carry({ kind: 'daily', ...(typeof r.start === 'string' ? { start: r.start } : {}) } as Recurrence) : undefined;
  if (r.kind === 'weekly') {
    if (!Array.isArray(r.weekdays) || !r.weekdays.length) return undefined;
    if (!r.weekdays.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)) return undefined;
    if (!startOk) return undefined;
    return carry({ kind: 'weekly', weekdays: r.weekdays as number[], ...(typeof r.start === 'string' ? { start: r.start } : {}) } as Recurrence);
  }
  if (r.kind === 'interval') {
    if (typeof r.days !== 'number' || !Number.isInteger(r.days) || r.days < 1) return undefined;
    if (typeof r.anchor !== 'string') return undefined;
    return carry({ kind: 'interval', days: r.days, anchor: r.anchor });
  }
  return undefined;
}

export function sanitiseCompletions(input: unknown): CompletionLog | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const raw = input as { on?: unknown; off?: unknown };
  const on = sanitiseStamps(raw.on);
  const off = sanitiseStamps(raw.off);
  if (!on && !off) return undefined;
  const out: CompletionLog = {};
  if (on) out.on = on;
  if (off) out.off = off;
  return out;
}

/**
 * The plain-English cadence line a row carries for readers that cannot compute one.
 *
 * DECIDED 2026-08-09 (Melroy): a repeat whose cadence this build cannot read is SHOWN, not hidden.
 * The scenario is ordinary rather than exotic: the two people are on different app versions, one
 * sets a cadence the other's build has never heard of, and that build genuinely cannot work out
 * which days it lands on. Hiding the row means one person sees it and the other does not, each with
 * a reasonable and wrong story about the other having deleted it, which is the invisible
 * disagreement this whole feature exists to prevent. A visible oddity is the cheaper failure.
 *
 * The writing client, which DOES understand the cadence, writes a plain-English summary alongside
 * the machine form, in its own language. Same shape the public REST API already uses (a normalised
 * recurrence object plus a `repeats` summary), so this is a known pattern here rather than an
 * invention. It rides INSIDE the recurrence object, which means it needs no column and is preserved
 * for free by the verbatim carry that already protects an unreadable cadence.
 *
 * A reader that understands the cadence must IGNORE this and render its own localised line, so an
 * Italian reader is not shown an English one whenever it could have been avoided. The stored
 * summary is a fallback, never the source of truth.
 */
export function repeatSummaryOf(task: SharedTask): string | undefined {
  const from = task.recurrence ?? task.rawRecurrence;
  if (typeof from !== 'object' || from === null) return undefined;
  const summary = (from as { summary?: unknown }).summary;
  return typeof summary === 'string' && summary.trim() ? summary : undefined;
}

/** Whether this build can place the row on a day at all. A row that repeats and cannot be placed is
 *  still shown, with `repeatSummaryOf` if it has one, and is never treated as due today. */
export function isUnreadableRepeat(task: SharedTask): boolean {
  return task.recurrence === undefined && task.rawRecurrence != null;
}

/**
 * Pull one pair's rows, TOMBSTONES INCLUDED.
 *
 * There is no `deleted_at is null` filter and there must never be one. Row-level security already
 * scopes this to pairs the caller belongs to, and a tombstone is how a removal travels: filtered
 * out, a row your person removed simply stops arriving, your copy never learns it is gone, and the
 * next push resurrects it on their screen. That is the failure that reads as the app taking sides.
 *
 * The pull is deliberately FULL rather than an `updated_at > watermark` delta. A delta would look
 * like an optimisation and would be a data-loss bug: `mergeShared` reads a local row missing from
 * the remote set as local-only and pushes it, so every row outside the delta would be re-pushed on
 * every poll, and a row the other person had genuinely deleted would be resurrected by yours. A
 * household list is tens of rows; when that stops being true, the fix is a merge that knows it is
 * looking at a delta, not a filter bolted onto this one.
 */
export const PAGE_SIZE = 500;

export async function pullPair(client: SupabaseClient, pairId: string): Promise<SharedTask[]> {
  // Keyset-paged on `id`. One unpaginated select('*') is silently truncated by PostgREST at the
  // project's max-rows, and `shared_tasks` only grows (no delete policy, nothing prunes tombstones).
  // Past that cap mergeShared reads every locally-cached row outside the page as "added while
  // offline" and pushes it, which is exactly the resurrection failure the full pull exists to avoid,
  // reintroduced through the transport instead of the filter. Terminates on an EMPTY page, never a
  // short one, because a short page is what a filtered or partial read looks like too.
  const out: SharedTask[] = [];
  let after: string | null = null;
  for (;;) {
    let q = client.from(TABLE).select('*').eq('pair_id', pairId).order('id', { ascending: true }).limit(PAGE_SIZE);
    if (after !== null) q = q.gt('id', after);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as SharedRow[];
    if (rows.length === 0) return out;
    out.push(...rows.map(rowToShared));
    after = rows[rows.length - 1].id;
  }
}

/**
 * Upsert on the COMPOSITE key, and READ BACK what the server actually stored.
 *
 * The composite key is because a shared task's id is only unique within its pair by design, so
 * conflicting on `id` alone would let one household's write collide with another's.
 *
 * The read-back is because `ours.sql`'s BEFORE trigger CLAMPS `updated_at`, `created_at` and
 * `done_at` to `now() + 1 day` rather than rejecting them. Without it, a device whose clock is more
 * than a day fast keeps its own un-clamped stamp, `localNewer` stays true forever, and it re-pushes
 * the same rows every poll, each push re-clamping to a fresh `now() + 1 day` and beating anything
 * the other phone can legitimately write. The partner's retitle reverts within fifteen seconds,
 * repeatedly, from a phone lying face-down on a table. `pushTasks` in sync.ts needs no read-back
 * only because no trigger touches `tasks.updated_at`, and that precondition does not travel here.
 */
export async function pushShared(client: SupabaseClient, tasks: SharedTask[], pairId: string): Promise<SharedTask[]> {
  if (tasks.length === 0) return [];
  const rows = tasks.map((t) => sharedToRow(t, pairId));
  const { data, error } = await client.from(TABLE).upsert(rows, { onConflict: 'pair_id,id' }).select();
  if (error) throw error;
  return ((data ?? []) as SharedRow[]).map(rowToShared);
}

/**
 * A write refused because the pair is read-only (frozen or killed), rather than broken.
 *
 * The SELECT policy needs only `is_pair_member`; both write policies need `is_pair_writable`, which
 * also requires `closed_at is null and disabled_at is null`. So on a frozen pair the pull succeeds
 * forever and the push 42501s forever. Same shape as `isAccountGone` in sync.ts, and the same
 * reason: a caller that cannot tell these apart does something destructive with the wrong one.
 */
export function isPairReadOnly(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501';
}

/**
 * One sync pass for one pair: pull, reconcile, push what the server is missing or holds older, and
 * return the merged set for the caller to cache.
 *
 * The caller's contract is to run this after EVERY write, not only on a timer. Two people are
 * typing into the same list, so the gap between a local change and its reconciliation is the window
 * in which their screens disagree, and on a shared surface a disagreement looks like the other
 * person having done something.
 */
export type PairSyncResult = {
  merged: SharedTask[];
  /** Set when the pull succeeded and the PUSH did not. The merged set is still good and must still
   *  be cached; only the "your person has seen this" affordance should read this. */
  pushError?: unknown;
};

export async function syncPairOnce(client: SupabaseClient, pairId: string, local: SharedTask[]): Promise<PairSyncResult> {
  // A failed READ still throws: there is nothing worth caching, and pretending the list is empty is
  // how a screen tells someone their shared list is gone.
  const remote = await pullPair(client, pairId);
  const { merged, toPush } = mergeShared(local, remote);
  try {
    const stored = new Map((await pushShared(client, toPush, pairId)).map((t) => [t.id, t]));
    return { merged: merged.map((t) => stored.get(t.id) ?? t) };
  } catch (pushError) {
    // A frozen pair pulls forever and pushes never, and nothing but a successful push empties
    // toPush, so throwing here pinned the device at its last fully-successful sync: on the one
    // screen a bereaved or separated person may keep for years, under copy promising "Nothing is
    // lost. You can still read everything here." Returning the error rather than swallowing it
    // keeps a real push bug diagnosable.
    return { merged, pushError };
  }
}

// --- when to look again ------------------------------------------------------------------

/** How often the shared list looks for the other person's changes while you are actually on it. */
export const POLL_MS = 15_000;

/** How long a screen may sit untouched before polling stops. A list left open on a desk is not a
 *  person waiting, and this is somebody's battery and somebody's row count. */
export const IDLE_STOP_MS = 10 * 60_000;

/**
 * Whether the poll should still be running. Pure, so the rule is testable without a screen: the
 * hook that owns the timer feeds it focus, app state, and how long since the last interaction.
 *
 * All three conditions are required. Polling a blurred screen spends a battery to update pixels
 * nobody is looking at, and polling a backgrounded app on a phone is worse.
 */
export function shouldPoll(focused: boolean, active: boolean, idleMs: number): boolean {
  return focused && active && idleMs < IDLE_STOP_MS;
}
