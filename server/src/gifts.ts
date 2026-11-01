// "A month on us" (decision log 2026-10-25): a month of Premium given as thanks for a note to us, on every platform
// through the same server rail as the card-free trial. One gift per account per 180 days. Like trials, the read
// checks the clock (no cron), and every store error reads as "not given" so a hiccup never serves Premium for free.

import { type D1LikeDatabase } from './telemetry';

export const GIFT_DAYS = 30;
export const GIFT_SPACING_DAYS = 180;
const DAY = 86400;

const CREATE = `CREATE TABLE IF NOT EXISTS gifts (
  user_id text not null, granted_at integer not null, expires_at integer not null, reason text not null,
  primary key (user_id, granted_at))`;

// Create-if-missing once per isolate (the alerts_sent pattern), so a Worker deploy never waits on a schema apply.
let ensured: Promise<void> | null = null;
async function ensure(db: D1LikeDatabase): Promise<void> {
  if (!ensured) ensured = db.prepare(CREATE).run().then(() => undefined, () => { ensured = null; });
  return ensured;
}

export type GiftState = { active: boolean; expiresAt: number | null; lastGrantedAt: number | null };

/** The account's latest gift: whether it is running now, when it ends, and when it was given. Null on a store
 *  error, so callers can fail closed (no Premium) or say "cannot tell" (no offer). */
export async function giftState(db: D1LikeDatabase, userId: string, nowSec: number): Promise<GiftState | null> {
  try {
    await ensure(db);
    const row = await db
      .prepare('SELECT granted_at, expires_at FROM gifts WHERE user_id = ?1 ORDER BY granted_at DESC LIMIT 1')
      .bind(userId)
      .first<{ granted_at: number; expires_at: number }>();
    if (!row) return { active: false, expiresAt: null, lastGrantedAt: null };
    return { active: row.expires_at > nowSec, expiresAt: row.expires_at, lastGrantedAt: row.granted_at };
  } catch {
    return null;
  }
}

/** Whether a gift given at `lastGrantedAt` still blocks a new one at `nowSec` (the 180-day spacing). */
export function withinSpacing(lastGrantedAt: number | null, nowSec: number): boolean {
  return lastGrantedAt != null && nowSec - lastGrantedAt < GIFT_SPACING_DAYS * DAY;
}

/**
 * Give this account a month of Premium, unless it had one in the last 180 days. Race-safe: the insert carries its
 * own spacing check (INSERT ... SELECT ... WHERE NOT EXISTS), so two sends in the same second cannot both give one,
 * and the read-back tells the caller which happened.
 */
export async function grantGift(
  db: D1LikeDatabase,
  userId: string,
  nowSec: number,
): Promise<{ result: 'given' | 'spaced' | 'error'; expiresAt: number | null }> {
  const expiresAt = nowSec + GIFT_DAYS * DAY;
  try {
    await ensure(db);
    await db
      .prepare(
        `INSERT OR IGNORE INTO gifts (user_id, granted_at, expires_at, reason)
         SELECT ?1, ?2, ?3, 'feedback'
         WHERE NOT EXISTS (SELECT 1 FROM gifts WHERE user_id = ?1 AND granted_at > ?4)`,
      )
      .bind(userId, nowSec, expiresAt, nowSec - GIFT_SPACING_DAYS * DAY)
      .run();
    const row = await db
      .prepare('SELECT granted_at, expires_at FROM gifts WHERE user_id = ?1 ORDER BY granted_at DESC LIMIT 1')
      .bind(userId)
      .first<{ granted_at: number; expires_at: number }>();
    if (!row) return { result: 'error', expiresAt: null };
    return row.granted_at === nowSec ? { result: 'given', expiresAt: row.expires_at } : { result: 'spaced', expiresAt: null };
  } catch {
    return { result: 'error', expiresAt: null };
  }
}

/**
 * The floor a note must meet before a month can follow it (the design's rule, mirrored in the client's
 * lib/note.ts and held equal by both test suites): two or more words with at least six letters between them, or
 * one word of twelve letters or more. A word is a run of letters in any script; spaces and punctuation are not
 * letters. "Love it" and "Tagesübersicht" pass; "ok", "great" and "hi hi" do not.
 */
export function meetsFloor(text: string): boolean {
  const words = text.match(/\p{L}+/gu) ?? [];
  const letters = words.reduce((n, w) => n + [...w].length, 0);
  if (words.length >= 2 && letters >= 6) return true;
  return words.some((w) => [...w].length >= 12);
}
