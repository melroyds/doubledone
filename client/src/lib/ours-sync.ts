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

/** The remote row shape (snake_case), matching `public.shared_tasks`. */
export type SharedRow = {
  id: string;
  pair_id: string;
  title: string;
  done: boolean;
  done_at: string | null;
  recurrence: Recurrence | null;
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
    title: task.title,
    done: task.done,
    done_at: task.doneAt ? new Date(task.doneAt).toISOString() : null,
    recurrence: task.recurrence ?? null,
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
  if (row.recurrence != null) task.recurrence = row.recurrence;
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
export async function pullPair(client: SupabaseClient, pairId: string): Promise<SharedTask[]> {
  const { data, error } = await client.from(TABLE).select('*').eq('pair_id', pairId);
  if (error) throw error;
  return ((data ?? []) as SharedRow[]).map(rowToShared);
}

/** Upsert on the COMPOSITE key. A shared task's id is only unique within its pair by design, so
 *  conflicting on `id` alone would let one household's write collide with another's. */
export async function pushShared(client: SupabaseClient, tasks: SharedTask[], pairId: string): Promise<void> {
  if (tasks.length === 0) return;
  const rows = tasks.map((t) => sharedToRow(t, pairId));
  const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'pair_id,id' });
  if (error) throw error;
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
export async function syncPairOnce(client: SupabaseClient, pairId: string, local: SharedTask[]): Promise<SharedTask[]> {
  const remote = await pullPair(client, pairId);
  const { merged, toPush } = mergeShared(local, remote);
  await pushShared(client, toPush, pairId);
  return merged;
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
