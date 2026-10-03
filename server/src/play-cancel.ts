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
export async function mayHavePlay(db: D1LikeDatabase | undefined, userId: string, hint = false): Promise<boolean> {
  // The app's own word that this account may hold a Play subscription we have not heard about yet (it is
  // signing out of an Android build, or its device shows a Google Play purchase whose webhook is still on
  // its way). It only ever makes us look harder: the lookup is for an id the app has already given to
  // RevenueCat, so it creates nobody, and a person can only ask about themselves (the token is verified).
  if (hint) return true;
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

// Google's account hold lasts up to 60 days, and during it the subscription's expiry is a PAST
// timestamp even though fixing the card brings it back and resumes charging.
const HELD_WINDOW_MS = 60 * 24 * 3_600_000;

export type PlayRenewal = { id: string; mayAlreadyBeOff: boolean };

/**
 * The Play subscriptions in a v1 subscriber body that can still charge, as their store transaction ids
 * (the GPA.… order ids the cancel takes). A subscription with a billing issue in the last 60 days is
 * HELD (grace or account hold): it can recover and charge, whatever its expiry says, so it is cancelled
 * too. Otherwise a subscription that is over, or whose renewal is already off, is skipped.
 * A refund alone does NOT skip it, because a refunded subscription can still be set to renew.
 * `mayAlreadyBeOff` marks a held row whose renewal may already be off (a billing-issue cancel sets
 * `unsubscribe_detected_at`, and so does a person cancelling), so a refusal to cancel it again is not
 * a failure: without that, a retry after a failed delete would wedge on it for 60 days.
 * FAILS CLOSED: a body with no subscriber, or a live row with no id, answers null.
 */
export function renewingPlaySubscriptions(body: unknown, nowMs: number): PlayRenewal[] | null {
  const subscriber = (body as { subscriber?: unknown } | null)?.subscriber;
  if (!subscriber || typeof subscriber !== 'object') return null;
  const subs = (subscriber as { subscriptions?: unknown }).subscriptions;
  if (subs == null) return [];
  if (typeof subs !== 'object') return null;
  const out: PlayRenewal[] = [];
  for (const raw of Object.values(subs as Record<string, unknown>)) {
    const r = (raw ?? {}) as { store?: unknown; expires_date?: unknown; unsubscribe_detected_at?: unknown; billing_issues_detected_at?: unknown; store_transaction_id?: unknown };
    if (r.store !== 'play_store') continue;
    const exp = typeof r.expires_date === 'string' ? Date.parse(r.expires_date) : NaN;
    const unsubscribed = typeof r.unsubscribe_detected_at === 'string' && r.unsubscribe_detected_at !== '';
    const issueAt = typeof r.billing_issues_detected_at === 'string' ? Date.parse(r.billing_issues_detected_at) : NaN;
    const held = Number.isFinite(issueAt) && nowMs - issueAt <= HELD_WINDOW_MS;
    if (!held) {
      if (Number.isFinite(exp) && exp <= nowMs) continue; // over: nothing left to charge
      if (unsubscribed) continue; // renewal already off
    }
    if (typeof r.store_transaction_id !== 'string' || r.store_transaction_id === '') return null; // live, and we cannot name it
    out.push({ id: r.store_transaction_id, mayAlreadyBeOff: held && unsubscribed });
  }
  return out;
}

/**
 * Turn off renewal on every Google Play subscription this user still has. Answers how many were
 * turned off (0 for everyone who never bought on Play, without a single RevenueCat call), or null
 * when it could not be done in full: then the caller answers 502 and the app deletes nothing.
 * Keeps going past a failed cancel, so as much renewal as possible stops, then still says null.
 */
export async function cancelPlayRenewals(env: PlayCancelEnv, userId: string, nowMs: number, doFetch: typeof fetch = fetch, hint = false): Promise<number | null> {
  if (!(await mayHavePlay(env.DB, userId, hint))) return 0;
  if (!env.RC_SECRET_KEY) return null; // a Play subscriber, and no way to reach their billing: say so
  let body: unknown;
  try {
    const { url, init } = buildSubscriberRequest(userId, env.RC_SECRET_KEY);
    const res = await doFetch(url, init);
    // Defensive only: the v1 GET creates a customer for an unknown id rather than 404ing.
    if (res.status === 404) return 0;
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  }
  const ids = renewingPlaySubscriptions(body, nowMs);
  if (!ids) return null;
  let cancelled = 0;
  let failed = false;
  for (const renewal of ids) {
    try {
      const { url, init } = buildPlayCancelRequest(userId, renewal.id, env.RC_SECRET_KEY);
      const res = await doFetch(url, init);
      if (res.ok) cancelled += 1;
      // A held subscription whose renewal is already off can be refused a second cancel. That refusal
      // (a 4xx) means there is nothing left to stop, not a failure. A 5xx is still a failure.
      else if (!(renewal.mayAlreadyBeOff && res.status >= 400 && res.status < 500)) failed = true;
    } catch {
      failed = true;
    }
  }
  return failed ? null : cancelled;
}
