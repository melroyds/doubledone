// The card-free "Try Premium" trial: a one-time, 30-day Premium grant per ACCOUNT, with NO card and NO Stripe.
// Tracked write-once in D1 (the trials table, keyed by the verified Supabase user id), so one account gets one
// trial ever, and it reverts to free on its own when expires_at passes (the read checks the clock, no cron).
// The /trial/start handler verifies the token cryptographically before calling startTrial, and the trial is
// gated on a synced (email) account, because an anonymous user has no identity to enforce one-per-person.

import { type D1LikeDatabase } from './telemetry';

export const TRIAL_DAYS = 30;
const SECONDS_PER_DAY = 86400;

/** Whether this account has an ACTIVE trial right now (a trial exists and has not yet expired). */
export async function activeTrial(
  db: D1LikeDatabase,
  userId: string,
  nowSec: number,
): Promise<{ active: boolean; expiresAt: number | null }> {
  try {
    const row = await db.prepare('SELECT expires_at FROM trials WHERE user_id = ?1').bind(userId).first<{ expires_at: number }>();
    const expiresAt = typeof row?.expires_at === 'number' ? row.expires_at : null;
    return { active: expiresAt != null && expiresAt > nowSec, expiresAt };
  } catch {
    return { active: false, expiresAt: null };
  }
}

/**
 * Start the one-time trial for this account. Returns 'started' on first use; 'already' if this account ever had
 * a trial (active OR expired, so it can never be re-trialed); 'error' on a store failure. Race-safe via
 * INSERT OR IGNORE on the user_id primary key: a concurrent second call is a no-op, and the read-back tells the
 * two apart (our insert stamped started_at === nowSec; a pre-existing row has an older started_at).
 */
export async function startTrial(
  db: D1LikeDatabase,
  userId: string,
  nowSec: number,
): Promise<{ result: 'started' | 'already' | 'error'; expiresAt: number | null }> {
  const expiresAt = nowSec + TRIAL_DAYS * SECONDS_PER_DAY;
  try {
    await db.prepare('INSERT OR IGNORE INTO trials (user_id, started_at, expires_at) VALUES (?1, ?2, ?3)').bind(userId, nowSec, expiresAt).run();
    const row = await db.prepare('SELECT started_at, expires_at FROM trials WHERE user_id = ?1').bind(userId).first<{ started_at: number; expires_at: number }>();
    if (!row) return { result: 'error', expiresAt: null };
    return { result: row.started_at === nowSec ? 'started' : 'already', expiresAt: typeof row.expires_at === 'number' ? row.expires_at : null };
  } catch {
    return { result: 'error', expiresAt: null };
  }
}
