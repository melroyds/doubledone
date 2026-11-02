// The RevenueCat v1 requests this Worker makes, built as data so their shape is a tested contract
// rather than something only a live call can confirm. A leaf module on purpose: the reconcile route
// and the account-deletion route both need them, and stripe.ts importing the reconcile module would
// close an import cycle through the webhook (revenuecat.ts imports timingSafeEqual from stripe.ts).
// Since 2026-11-03 it also holds the ONE reader of a subscriber body (premiumFromSubscriber), shared by
// the reconcile and the store check (store-premium.ts), so the two can never disagree about what
// "Premium is active" means. Still imports nothing.

/**
 * GET /v1/subscribers/{id}. v1 and NOT v2 deliberately: it returns `subscriptions` keyed by product
 * with a per-subscription `is_sandbox`, `store` and `store_transaction_id`, which is everything the
 * reconcile and the deletion paths read. The v2 customer endpoints need a project id, a different
 * shape and pagination to answer the same question. NOTE: RevenueCat CREATES a customer for an id it
 * has never seen, so callers gate this call on having a reason to ask.
 */
export function buildSubscriberRequest(userId: string, secret: string): { url: string; init: RequestInit } {
  return {
    url: `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    init: { method: 'GET', headers: { Authorization: `Bearer ${secret}`, accept: 'application/json' } },
  };
}

/**
 * POST /v1/subscribers/{id}/subscriptions/{store_transaction_identifier}/cancel: turns OFF renewal on
 * a Google Play subscription. RevenueCat's own words: "The subscription remains valid until its
 * expiration time, but it will not renew." Never confuse it with /revoke, which takes a product id,
 * ends access at once and REFUNDS the last purchase. Nothing in this Worker ever calls /revoke.
 */
export function buildPlayCancelRequest(userId: string, storeTransactionId: string, secret: string): { url: string; init: RequestInit } {
  return {
    url: `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/subscriptions/${encodeURIComponent(storeTransactionId)}/cancel`,
    init: { method: 'POST', headers: { Authorization: `Bearer ${secret}`, accept: 'application/json' } },
  };
}

/** The RevenueCat entitlement id, mirroring revenuecat.ts and the client. */
export const PREMIUM_ENTITLEMENT = 'premium';

/** The stores a v1 subscription row can grant from. Its own literal type, so this leaf imports nothing. */
export type StoreSource = 'apple' | 'google';

/**
 * Which of our sources a v1 subscription row's `store` belongs to, or null for one we never grant from.
 * The v1 body spells stores in lower case (`app_store`, `play_store`), unlike the webhook. A missing
 * store is Apple, as it always was. `promotional` (a dashboard grant) and every other store grants
 * nothing: both readers of this GRANT premium, so a store we do not sell through must mean no.
 */
export function sourceForV1Store(store: unknown): StoreSource | null {
  if (store === undefined || store === null || store === '') return 'apple';
  if (store === 'app_store' || store === 'mac_app_store') return 'apple';
  if (store === 'play_store') return 'google';
  return null;
}

/**
 * What a subscriber body says about Premium. `untilMs` is when that answer stops being true: the store's
 * expiry, or for a sandbox subscription read with a grace, a little after it (see premiumFromSubscriber).
 * 'malformed' means RevenueCat answered something we cannot read, which must decide NOTHING: never a no.
 */
export type SubscriberPremium =
  | { kind: 'active'; source: StoreSource; sandbox: boolean; expiresMs: number; untilMs: number; cancelAtPeriodEnd: boolean }
  | { kind: 'inactive' }
  | { kind: 'malformed' };

const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v !== '';

/**
 * Read a v1 subscriber body. Pure, total, never throws.
 *
 * FAILS CLOSED in every direction. No premium entitlement, no expiry, an unparseable expiry, an expiry
 * already past, no matching subscription row, a refund, or a store we do not sell through: all 'inactive'.
 * Only a body with no `subscriber` object at all is 'malformed'. A null expiry (lifetime) is not active: we
 * sell none.
 *
 * Grace and billing issues need no maths here: during a store grace period RevenueCat moves the
 * entitlement's expires_date to the grace end, so a billing issue in grace reads active, and billing retry
 * after grace reads expired. A refund is read from the row's own `refunded_at` rather than trusting
 * RevenueCat to pull expires_date back.
 *
 * The row's product key: for a Google base plan RevenueCat names the product `subscription:base_plan`, while
 * the v1 body may key the row by the bare subscription id, so both spellings are tried. Only the row carries
 * `is_sandbox`, so a missing row means we cannot tell, and that is a no.
 *
 * `sandboxGraceMs` (the store check passes ten minutes, the reconcile passes nothing): a SANDBOX subscription
 * with no cancel and no billing issue counts as active for that long past its expiry. Sandbox months last
 * five minutes and renew at the very moment they expire, so a re-check landing then would otherwise refuse a
 * reviewer whose renewal RevenueCat has not recorded yet. Production never gets it: Apple renews ahead of expiry.
 */
export function premiumFromSubscriber(body: unknown, nowMs: number, opts: { sandboxGraceMs?: number } = {}): SubscriberPremium {
  const sub = (body as { subscriber?: unknown } | null)?.subscriber;
  if (!sub || typeof sub !== 'object') return { kind: 'malformed' };
  const s = sub as Record<string, unknown>;

  const ents = s.entitlements;
  const ent = (ents && typeof ents === 'object' ? (ents as Record<string, unknown>)[PREMIUM_ENTITLEMENT] : undefined) as
    | { expires_date?: unknown; product_identifier?: unknown }
    | undefined;
  if (!ent || typeof ent !== 'object') return { kind: 'inactive' };
  const expiresMs = typeof ent.expires_date === 'string' ? Date.parse(ent.expires_date) : NaN;
  if (!Number.isFinite(expiresMs)) return { kind: 'inactive' }; // absent (lifetime) or unreadable

  const subs = s.subscriptions && typeof s.subscriptions === 'object' ? (s.subscriptions as Record<string, unknown>) : undefined;
  const productId = typeof ent.product_identifier === 'string' ? ent.product_identifier : '';
  const keys = productId ? [productId, productId.split(':')[0]] : [];
  const row = keys.map((k) => subs?.[k]).find((r) => r && typeof r === 'object') as
    | { is_sandbox?: unknown; unsubscribe_detected_at?: unknown; billing_issues_detected_at?: unknown; refunded_at?: unknown; store?: unknown }
    | undefined;
  if (!row) return { kind: 'inactive' }; // cannot prove which environment, so no
  if (nonEmpty(row.refunded_at)) return { kind: 'inactive' }; // refunded: access ended with the money
  const source = sourceForV1Store(row.store);
  if (!source) return { kind: 'inactive' }; // promotional, or a store we never sell through

  const sandbox = row.is_sandbox === true;
  // Auto-renew already off. Access still runs to the period end (the webhook's CANCELLATION reading).
  const cancelAtPeriodEnd = nonEmpty(row.unsubscribe_detected_at);
  const graceMs = sandbox && !cancelAtPeriodEnd && !nonEmpty(row.billing_issues_detected_at) ? Math.max(0, opts.sandboxGraceMs ?? 0) : 0;
  const untilMs = expiresMs + graceMs;
  if (untilMs <= nowMs) return { kind: 'inactive' };
  return { kind: 'active', source, sandbox, expiresMs, untilMs, cancelAtPeriodEnd };
}

/** The subscriber's first App User ID, as RevenueCat reports it, or null. Used to vouch for a reinstall. */
export function originalAppUserId(body: unknown): string | null {
  const id = (body as { subscriber?: { original_app_user_id?: unknown } } | null)?.subscriber?.original_app_user_id;
  return typeof id === 'string' && id !== '' ? id : null;
}
