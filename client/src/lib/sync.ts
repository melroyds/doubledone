import { type SupabaseClient } from '@supabase/supabase-js';

import { type Recurrence } from './recurrence';
import { mergeTasks } from './sync-merge';
import { cleanLeftOff } from './leftoff';
import { type LeftOff, type Slices, type Task } from './tasks';

// The Supabase seam for sync. The row <-> Task mapping is pure and unit-tested;
// pull / push / syncOnce wrap the merge engine (sync-merge.ts) around the network.
// Timestamps cross as ISO strings (timestamptz on the server) and live as epoch ms
// locally. The server's updated_at must be the value we send, not a now() trigger,
// or last-write-wins breaks: see the schema and the decision log.

const TABLE = 'tasks';

/** The remote row shape (snake_case), matching the Supabase `tasks` table. */
export type TaskRow = {
  id: string;
  user_id?: string;
  title: string;
  done: boolean;
  due: string | null;
  recurrence: Recurrence | null;
  completed_dates: string[] | null;
  skipped_dates: string[] | null;
  completed_at: string | null;
  complexity: number | null;
  slices: Slices | null;
  silent_parent: boolean | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  pinned_at: string | null;
  big: boolean | null;
  shared_ref: string | null;
  // 2026-10-04 (supabase/tasks-left-off.sql). The first is the "Where you left off" line; the other three
  // were device-local until then, which is why a tiny step on another device could not know what it was.
  left_off: LeftOff | null;
  open_parent: boolean | null;
  parent_title: string | null;
  combined_from: { id: string; title: string }[] | null;
};

/** Local Task -> remote row, stamped with the owner's id for RLS. Every field is emitted
 *  UNCONDITIONALLY (null, never an absent key): supabase-js batch upsert unions keys across
 *  the rows in one call and defaults the gaps to NULL, so a conditionally-emitted field
 *  would silently null that column on every other row in the batch. */
export function taskToRow(task: Task, userId: string): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    done: task.done,
    due: task.due ?? null,
    recurrence: task.recurrence ?? null,
    completed_dates: task.completedDates ?? null,
    skipped_dates: task.skippedDates ?? null,
    completed_at: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    complexity: task.complexity ?? null,
    slices: task.slices ?? null,
    silent_parent: task.silentParent ?? null,
    parent_id: task.parentId ?? null,
    created_at: new Date(task.createdAt).toISOString(),
    updated_at: new Date(task.updatedAt).toISOString(),
    deleted_at: task.deletedAt ? new Date(task.deletedAt).toISOString() : null,
    pinned_at: task.pinnedAt ? new Date(task.pinnedAt).toISOString() : null,
    big: task.big ?? null,
    shared_ref: task.sharedRef ?? null,
    left_off: task.leftOff ?? null,
    open_parent: typeof task.openParent === 'boolean' ? task.openParent : null,
    parent_title: task.parentTitle ?? null,
    combined_from: task.combinedFrom ?? null,
  };
}

/** Remote row -> local Task. Optional fields are only set when present, so a
 *  round-trip with taskToRow is exact and nothing is polluted with undefined.
 *
 *  Timestamps are parsed defensively: a corrupt or unparseable remote value would
 *  otherwise become NaN, and a NaN updatedAt loses every LWW comparison (NaN > x is
 *  always false) and poisons the byCreated sort, silently pinning the task to the
 *  bad row. Each parse falls back to created_at, then Date.now(), so a finite
 *  timestamp always lands. */
export function rowToTask(row: TaskRow): Task {
  const createdAt = finiteOr(Date.parse(row.created_at), Date.now());
  const task: Task = {
    id: row.id,
    title: row.title,
    done: row.done,
    createdAt,
    updatedAt: finiteOr(Date.parse(row.updated_at), createdAt),
  };
  if (row.due != null) task.due = row.due;
  if (row.recurrence != null) task.recurrence = row.recurrence;
  if (row.completed_dates != null) task.completedDates = row.completed_dates;
  if (row.skipped_dates != null) task.skippedDates = row.skipped_dates;
  if (row.completed_at != null) task.completedAt = finiteOr(Date.parse(row.completed_at), createdAt);
  if (row.complexity != null) task.complexity = row.complexity;
  if (row.slices != null) task.slices = row.slices;
  if (row.silent_parent) task.silentParent = true;
  if (row.parent_id != null) task.parentId = row.parent_id;
  if (row.deleted_at != null) task.deletedAt = finiteOr(Date.parse(row.deleted_at), createdAt);
  if (row.pinned_at != null) task.pinnedAt = finiteOr(Date.parse(row.pinned_at), createdAt);
  if (row.big) task.big = true;
  if (row.shared_ref != null) task.sharedRef = row.shared_ref;
  // Validated, never trusted: a malformed jsonb from the server must not reach a render.
  const leftOff = cleanLeftOff(row.left_off);
  if (leftOff) task.leftOff = leftOff;
  if (typeof row.open_parent === 'boolean') task.openParent = row.open_parent;
  if (typeof row.parent_title === 'string') task.parentTitle = row.parent_title;
  const combined = cleanCombinedFrom(row.combined_from);
  if (combined) task.combinedFrom = combined;
  return task;
}

/** A well-formed Combine record ({ id, title }[]), or undefined. */
function cleanCombinedFrom(value: unknown): { id: string; title: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((c): c is { id: string; title: string } => typeof c === 'object' && c !== null && typeof (c as { id?: unknown }).id === 'string' && typeof (c as { title?: unknown }).title === 'string');
  return out.length > 0 ? out.map((c) => ({ id: c.id, title: c.title })) : undefined;
}

/** A finite epoch-ms value, or the fallback when the parse produced NaN/Infinity. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Rows per page of the pull. Under PostgREST's max-rows cap, so a page is never silently clipped. */
export const PULL_PAGE_SIZE = 500;

/**
 * Pull every row the signed-in user can see (RLS-scoped), tombstones included. Keyset-paged on `id`, the
 * way pullPair is (2026-10-04): one unpaged select('*') is silently truncated by PostgREST at the
 * project's max-rows, and `tasks` only grows (tombstones are never pruned). Past that cap a new device got a
 * partial list, an existing one read every row outside the page as "added offline" and pushed it, which
 * could undo another device's deletion, and the parent repair (healStuckParents) would have judged a big
 * task by a page that was missing some of its steps. Terminates on an EMPTY page, never a short one.
 */
export async function pullRemote(client: SupabaseClient): Promise<Task[]> {
  const out: Task[] = [];
  let after: string | null = null;
  for (;;) {
    let q = client.from(TABLE).select('*').order('id', { ascending: true }).limit(PULL_PAGE_SIZE);
    if (after !== null) q = q.gt('id', after);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as TaskRow[];
    if (rows.length === 0) return out;
    out.push(...rows.map(rowToTask));
    after = rows[rows.length - 1].id;
  }
}

/** Upsert the given tasks (the merge engine's toPush) by primary key. */
export async function pushTasks(client: SupabaseClient, tasks: Task[], userId: string): Promise<void> {
  if (tasks.length === 0) return;
  const rows = tasks.map((t) => taskToRow(t, userId));
  const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

/**
 * One sync pass: pull the account's rows, reconcile with local by last-write-wins,
 * push back whatever the server is missing or has an older copy of, and return the
 * merged set for the caller to persist locally. Local-first: on first sign-in the
 * whole anonymous list is in toPush, so it migrates into the account automatically.
 */
export async function syncOnce(client: SupabaseClient, local: Task[], userId: string): Promise<Task[]> {
  const remote = await pullRemote(client);
  const { merged, toPush } = mergeTasks(local, remote);
  await pushTasks(client, toPush, userId);
  return merged;
}

/**
 * Whether the local store was last synced with a DIFFERENT account than `userId`.
 * When true the local tasks are not this user's (a sign-out then sign-in as someone
 * else, or a half-finished sign-out), so they must NOT be merged or migrated into this
 * account, sync from an empty local set instead. `owner === null` (anonymous, no prior
 * account) is deliberately not "another", so an anonymous-first sign-in still migrates
 * its local list up.
 */
export function localBelongsToAnother(owner: string | null, userId: string): boolean {
  return owner !== null && owner !== userId;
}

// The generated name of the ONE foreign key that means "your account is gone": Postgres names an
// inline `references` constraint `<table>_<column>_fkey`, and supabase/schema.sql declares
// `user_id uuid not null references auth.users (id) on delete cascade` on public.tasks. If that
// declaration is ever renamed, this constant must move with it (grep for it; nothing else uses it).
const ACCOUNT_FK = 'tasks_user_id_fkey';

/**
 * Whether a sync error means the signed-in account no longer exists (deleted here or on
 * another device). A Postgres foreign-key violation (SQLSTATE 23503) on a write is the signal,
 * but the CONSTRAINT NAME must match too.
 *
 * The name check was added 2026-08-09. This function used to read any 23503 as "your account is
 * gone", which was true only while `tasks.user_id` was the sole foreign key in the whole schema.
 * The caller's response is destructive and irreversible (today.tsx clears tasks, purges the R2
 * keepsakes, wipes local data and signs out), so the day a second table with a user foreign key
 * exists (shared lists), an unrelated violation would have destroyed a live user's history.
 * Requiring the name makes the check independent of everything the schema gains later.
 *
 * Fails SAFE in both directions: a network error, an expired token, a violation from any other
 * constraint, or an unrecognised message all return false, so the worst case is a genuinely
 * deleted account's second device keeping its local copy (already a documented limit) rather
 * than a live user losing their week.
 */
export function isAccountGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  if (e.code !== '23503') return false;
  const message = typeof e.message === 'string' ? e.message : '';
  const details = typeof e.details === 'string' ? e.details : '';
  return `${message} ${details}`.includes(ACCOUNT_FK);
}
