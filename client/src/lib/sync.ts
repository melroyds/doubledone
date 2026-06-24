import { type SupabaseClient } from '@supabase/supabase-js';

import { type Recurrence } from './recurrence';
import { mergeTasks } from './sync-merge';
import { type Slices, type Task } from './tasks';

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
  completed_at: string | null;
  complexity: number | null;
  slices: Slices | null;
  silent_parent: boolean | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Local Task -> remote row, stamped with the owner's id for RLS. */
export function taskToRow(task: Task, userId: string): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    done: task.done,
    due: task.due ?? null,
    recurrence: task.recurrence ?? null,
    completed_dates: task.completedDates ?? null,
    completed_at: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    complexity: task.complexity ?? null,
    slices: task.slices ?? null,
    silent_parent: task.silentParent ?? null,
    parent_id: task.parentId ?? null,
    created_at: new Date(task.createdAt).toISOString(),
    updated_at: new Date(task.updatedAt).toISOString(),
    deleted_at: task.deletedAt ? new Date(task.deletedAt).toISOString() : null,
  };
}

/** Remote row -> local Task. Optional fields are only set when present, so a
 *  round-trip with taskToRow is exact and nothing is polluted with undefined. */
export function rowToTask(row: TaskRow): Task {
  const task: Task = {
    id: row.id,
    title: row.title,
    done: row.done,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
  if (row.due != null) task.due = row.due;
  if (row.recurrence != null) task.recurrence = row.recurrence;
  if (row.completed_dates != null) task.completedDates = row.completed_dates;
  if (row.completed_at != null) task.completedAt = Date.parse(row.completed_at);
  if (row.complexity != null) task.complexity = row.complexity;
  if (row.slices != null) task.slices = row.slices;
  if (row.silent_parent) task.silentParent = true;
  if (row.parent_id != null) task.parentId = row.parent_id;
  if (row.deleted_at != null) task.deletedAt = Date.parse(row.deleted_at);
  return task;
}

/** Pull every row the signed-in user can see (RLS-scoped), tombstones included. */
export async function pullRemote(client: SupabaseClient): Promise<Task[]> {
  const { data, error } = await client.from(TABLE).select('*');
  if (error) throw error;
  return ((data ?? []) as TaskRow[]).map(rowToTask);
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

/**
 * Whether a sync error means the signed-in account no longer exists (deleted here or on
 * another device). The only foreign key on the `tasks` table is user_id -> auth.users
 * (ON DELETE CASCADE), so a Postgres foreign-key violation (SQLSTATE 23503) on a write
 * can only mean the user row is gone. Deliberately narrow: a network error, an expired
 * token, or any other failure returns false, so a transient hiccup never wipes local data.
 */
export function isAccountGone(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23503';
}
