// Cross-device sync for scrapbook keepsakes (the "later slice" from scrapbook.ts, unlocked
// by R2 persistence: a keepsake row is now a few short text fields around an https URL,
// not half a megabyte of base64). Rides BEHIND the task sync as a separate best-effort
// pass: any failure here (the table not yet migrated, network, RLS) leaves local books
// untouched and can never mark the task sync failed. Pure merge + row mapping live here
// and are unit-tested; the tasks engine's LWW discipline applies, keyed on createdAt
// (a remade week's newer keepsake replaces the older one everywhere).

import { type SupabaseClient } from '@supabase/supabase-js';

import { MAX_SCRAPBOOKS, type Scrapbook } from './scrapbook';
import { loadScrapbooks, saveScrapbooks } from './storage';

const TABLE = 'scrapbooks';

/** The remote row shape (snake_case), matching the Supabase `scrapbooks` table.
 *  Every field is emitted unconditionally (the batch-upsert key-union rule, see sync.ts). */
export type ScrapbookRow = {
  user_id?: string;
  week_start: string;
  image: string;
  caption: string;
  created_at: string; // ISO; CLIENT-written like tasks.updated_at, it is the LWW truth
};

export function bookToRow(b: Scrapbook, userId: string): ScrapbookRow {
  return {
    user_id: userId,
    week_start: b.weekStart,
    image: b.image,
    caption: b.caption,
    created_at: new Date(b.createdAt).toISOString(),
  };
}

/** Remote row -> local book. A corrupt created_at parses to a finite fallback (now) so it
 *  can never NaN-poison the LWW comparison (the same defence as sync.ts rowToTask). */
export function rowToBook(r: ScrapbookRow): Scrapbook {
  const createdAt = Date.parse(r.created_at);
  return {
    weekStart: r.week_start,
    image: r.image,
    caption: typeof r.caption === 'string' ? r.caption : '',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}

/** Only an R2-served https keepsake syncs: a legacy data: book is ~500KB of base64 that
 *  would bloat every pull, and it predates persistence, so it stays device-local by design. */
export function isSyncableBook(b: Pick<Scrapbook, 'image'>): boolean {
  return /^https:/i.test(b.image);
}

export type ScrapbookMergeResult = { merged: Scrapbook[]; toPush: Scrapbook[] };

/** Non-finite createdAt ranks as -Infinity so a corrupt stamp always loses (never wins by NaN). */
function rank(createdAt: number): number {
  return Number.isFinite(createdAt) ? createdAt : -Infinity;
}

/**
 * Reconcile local and remote keepsakes per week: the newer createdAt wins, ties keep
 * local and push nothing (already in sync). Local-only syncable books push up (the
 * first-sync migration); remote-only books pull down; data: books stay in the merged
 * local set but never push. No tombstones: a keepsake is never individually deleted
 * in-app, and the local MAX_SCRAPBOOKS cap is a render bound, not a deletion to
 * propagate, so the merged set is simply capped to the newest weeks like upsertScrapbook.
 */
export function mergeScrapbooks(local: Scrapbook[], remote: Scrapbook[]): ScrapbookMergeResult {
  const pairs = new Map<string, { local?: Scrapbook; remote?: Scrapbook }>();
  for (const b of local) pairs.set(b.weekStart, { ...pairs.get(b.weekStart), local: b });
  for (const b of remote) pairs.set(b.weekStart, { ...pairs.get(b.weekStart), remote: b });

  const merged: Scrapbook[] = [];
  const toPush: Scrapbook[] = [];
  for (const { local: l, remote: r } of pairs.values()) {
    const winner = l && r ? (rank(l.createdAt) >= rank(r.createdAt) ? l : r) : (l ?? r);
    if (!winner) continue;
    merged.push(winner);
    const localNewer = l != null && (r == null || rank(l.createdAt) > rank(r.createdAt));
    if (localNewer && isSyncableBook(winner)) toPush.push(winner);
  }
  merged.sort((a, b) => b.weekStart.localeCompare(a.weekStart)); // newest week first, the local shape
  return { merged: merged.slice(0, MAX_SCRAPBOOKS), toPush };
}

/**
 * One best-effort scrapbook sync pass: pull the account's keepsake rows (RLS-scoped),
 * merge with this device's books, persist the merged set, push what the server lacks.
 * `foreignLocal` mirrors the task sync's cross-account guard: when the local store
 * belonged to a DIFFERENT account, this device's books must never migrate into the new
 * one, so the merge starts from empty and the pull simply lands the new account's books.
 */
export async function syncScrapbooks(client: SupabaseClient, userId: string, foreignLocal = false): Promise<void> {
  try {
    const { data, error } = await client.from(TABLE).select('*');
    if (error) return; // pre-migration (table missing), RLS, or transient: quietly out
    const remote = ((data ?? []) as ScrapbookRow[]).map(rowToBook);
    const local = foreignLocal ? [] : await loadScrapbooks();
    const { merged, toPush } = mergeScrapbooks(local, remote);
    await saveScrapbooks(merged);
    if (toPush.length > 0) {
      await client.from(TABLE).upsert(
        toPush.map((b) => bookToRow(b, userId)),
        { onConflict: 'user_id,week_start' },
      );
    }
  } catch {
    // best effort, never disturbs the task sync it rides behind
  }
}
