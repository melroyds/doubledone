// Account deletion stops Google Play billing too (Path A, 2026-09-30). On 2026-09-27 Melroy decided
// that deleting an account stops its billing FIRST, on every platform; Stripe got that the same day.
// A Play subscription cannot be cancelled from Stripe, so it goes through RevenueCat's v1 cancel,
// which turns renewal OFF and leaves access to the end of the paid period. It never refunds.

import { type D1LikeDatabase, readEntitlement } from './entitlements';
import { buildPlayCancelRequest, buildSubscriberRequest } from './rc-v1';

export type PlayCancelEnv = { DB?: D1LikeDatabase; RC_SECRET_KEY?: string };

/**
 * Might this user hold a Google Play subscription? Asked BEFORE any RevenueCat call, because the v1
 * lookup CREATES a customer for an id it has never seen: a web-only user's id has no business
 * reaching RevenueCat, least of all on the way out of the door. Two independent signals, because the
 * delivery log swallows its own write failures: the row's source, or any Play delivery in the log.
 * If NEITHER can be read, the answer is yes. A deleted account that keeps charging is far worse than
 * one extra lookup.
 */
export async function mayHavePlay(db: D1LikeDatabase | undefined, userId: string): Promise<boolean> {
  if (!db) return false; // no store at all (tests, local dev): nothing was ever recorded to find
  let known = false;
  try {
    if ((await readEntitlement(db, userId)).source === 'google') return true;
    known = true;
  } catch {
    // unreadable: fall through to the log
  }
  try {
    const hit = await db.prepare("SELECT 1 AS hit FROM rc_events WHERE user_id = ?1 AND store = 'PLAY_STORE' LIMIT 1").bind(userId).first();
    if (hit) return true;
    known = true;
  } catch {
    // unreadable (or the log table was never created): the entitlement answer, if any, stands
  }
  return !known;
}

/**
 * The Play subscriptions in a v1 subscriber body that can still renew, as their store transaction ids
 * (the GPA.… order ids the cancel takes). Skips a subscription that is over, one whose renewal is
 * already off (`unsubscribe_detected_at`, so a retry after a failed delete cannot wedge on Google
 * refusing a second cancel), and a refunded one. FAILS CLOSED: a body with no subscriber, or a
 * renewing row with no id to cancel it by, answers null, and the caller then deletes nothing.
 */
export function renewingPlaySubscriptions(body: unknown, nowMs: number): string[] | null {
  const subscriber = (body as { subscriber?: unknown } | null)?.subscriber;
  if (!subscriber || typeof subscriber !== 'object') return null;
  const subs = (subscriber as { subscriptions?: unknown }).subscriptions;
  if (subs == null) return [];
  if (typeof subs !== 'object') return null;
  const out: string[] = [];
  for (const raw of Object.values(subs as Record<string, unknown>)) {
    const r = (raw ?? {}) as { store?: unknown; expires_date?: unknown; unsubscribe_detected_at?: unknown; refunded_at?: unknown; store_transaction_id?: unknown };
    if (r.store !== 'play_store') continue;
    const exp = typeof r.expires_date === 'string' ? Date.parse(r.expires_date) : NaN;
    if (Number.isFinite(exp) && exp <= nowMs) continue; // over: nothing left to renew
    if (typeof r.unsubscribe_detected_at === 'string' && r.unsubscribe_detected_at !== '') continue; // already not renewing
    if (typeof r.refunded_at === 'string' && r.refunded_at !== '') continue; // refunded: not renewing
    if (typeof r.store_transaction_id !== 'string' || r.store_transaction_id === '') return null; // live, and we cannot name it
    out.push(r.store_transaction_id);
  }
  return out;
}

/**
 * Turn off renewal on every Google Play subscription this user still has. Answers how many were
 * turned off (0 for everyone who never bought on Play, without a single RevenueCat call), or null
 * when it could not be done in full: then the caller answers 502 and the app deletes nothing.
 * Keeps going past a failed cancel, so as much renewal as possible stops, then still says null.
 */
export async function cancelPlayRenewals(env: PlayCancelEnv, userId: string, nowMs: number, doFetch: typeof fetch = fetch): Promise<number | null> {
  if (!(await mayHavePlay(env.DB, userId))) return 0;
  if (!env.RC_SECRET_KEY) return null; // a Play subscriber, and no way to reach their billing: say so
  let body: unknown;
  try {
    const { url, init } = buildSubscriberRequest(userId, env.RC_SECRET_KEY);
    const res = await doFetch(url, init);
    if (res.status === 404) return 0; // RevenueCat has never heard of them: nothing to renew
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  }
  const ids = renewingPlaySubscriptions(body, nowMs);
  if (!ids) return null;
  let cancelled = 0;
  let failed = false;
  for (const id of ids) {
    try {
      const { url, init } = buildPlayCancelRequest(userId, id, env.RC_SECRET_KEY);
      const res = await doFetch(url, init);
      if (res.ok) cancelled += 1;
      else failed = true;
    } catch {
      failed = true;
    }
  }
  return failed ? null : cancelled;
}
