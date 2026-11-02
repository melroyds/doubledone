// The anonymous purchase id an account-less iPhone proves its Premium with, and the one scrambled form of
// it this Worker ever writes down. A leaf on purpose: the store check (store-premium.ts) reads the webhook's
// rc_events table, and the webhook (revenuecat.ts) records ids the store check must refuse, so the two
// importing each other would close a cycle. Imports nothing but a type.

import type { D1LikeDatabase } from './telemetry';

/**
 * RevenueCat's anonymous App User ID exactly as its SDKs make it: `$RCAnonymousID:` and a uuid's 32 hex
 * digits with the dashes taken out, lowercase (purchases-ios IdentityManager, purchases-js). Stricter than
 * RevenueCat's own pattern, which also allows g to z: every id an SDK generates still passes. 47 characters.
 * The SAME pattern as client/src/lib/iap.ts ANON_PURCHASER_RE: keep the two identical.
 *
 * It rules out exactly one thing, and it is the thing that matters most: an account. A signed-in user's
 * App User ID is their Supabase uuid, and uuids are not secret (a shared-list partner can read one), so a
 * header that took any id would let anyone borrow a paying account's Premium. It does NOT prove the id
 * bought anything. That is the webhook log's job (store-premium.ts).
 */
export const ANON_PURCHASER_RE = /^\$RCAnonymousID:[0-9a-f]{32}$/;

export function isAnonPurchaser(v: unknown): v is string {
  return typeof v === 'string' && ANON_PURCHASER_RE.test(v);
}

/** The webhook events that say an id BOUGHT Premium: the only ones the store check counts as proof. */
export const PURCHASE_TYPES = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION'] as const;
/** Our App Store products all start with this (app.doubledone.premium.monthly and .annual). */
export const PREMIUM_PRODUCT_PREFIX = 'app.doubledone.premium.';

/**
 * hex(HMAC-SHA256(key = RC_SECRET_KEY, message = 'store-premium:v1:' + id)), 64 lowercase hex. The only form
 * of an anonymous id this Worker ever stores. Peppered rather than a plain hash because rc_events keeps the
 * raw id as RevenueCat sends it, so a plain SHA-256 would let anyone who can read D1 join the two. The key
 * is RC_SECRET_KEY because the store check cannot run without it anyway: no new secret to forget to put.
 * Rotating that key re-scrambles every id (docs/operations.md says what that orphans). Never throws on a
 * string. The key is imported per call, which takes microseconds.
 */
export async function purchaserHash(id: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`store-premium:v1:${id}`)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The scrambled ids the store check refuses outright. `why` is 'account' when a RevenueCat delivery listed
 * the id beside an account (it belongs to that account now, and works only through it), or 'blocked' when
 * the owner blocked it by hand (docs/operations.md). No account id, no raw id, kept like rc_events. Created
 * at runtime by both writers, so a deploy never waits on a schema apply.
 */
export const REFUSED_DDL =
  'CREATE TABLE IF NOT EXISTS store_premium_refused (id_hash text primary key, why text not null, at integer not null) WITHOUT ROWID';

/** Every anonymous id a RevenueCat event names (its app_user_id, original_app_user_id and aliases), each once. */
export function anonIdsOf(event: unknown): string[] {
  const e = (event ?? {}) as { app_user_id?: unknown; original_app_user_id?: unknown; aliases?: unknown };
  const named = [e.app_user_id, e.original_app_user_id, ...(Array.isArray(e.aliases) ? e.aliases : [])];
  return [...new Set(named.filter(isAnonPurchaser))];
}

/**
 * Record ids as an account's own, so the store check refuses them from now on. Called by the webhook for every
 * verified delivery that resolves to an account. INSERT OR IGNORE, so a re-delivery is a no-op and a 'blocked'
 * row stays blocked. Never throws: refusing is a security nicety on a billing path, and a billing webhook must
 * never fail over it.
 */
export async function refuseForAccount(db: D1LikeDatabase, secret: string, ids: string[], nowMs: number): Promise<void> {
  if (ids.length === 0) return;
  try {
    await db.prepare(REFUSED_DDL).run();
    for (const id of ids) {
      const hash = await purchaserHash(id, secret);
      await db.prepare('INSERT OR IGNORE INTO store_premium_refused (id_hash, why, at) VALUES (?1, ?2, ?3)').bind(hash, 'account', nowMs).run();
    }
  } catch {
    // best effort: the next delivery for that account records it again
  }
}
