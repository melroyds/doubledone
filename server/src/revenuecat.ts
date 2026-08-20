// The RevenueCat webhook: Apple IAP purchases write the SAME D1 entitlements row that Stripe does,
// so premium is decided in one place regardless of which store sold it. Stripe stays the source of
// truth for pricing and refunds; this only proxies Apple's subscription lifecycle into our store.
//
// Pure pieces (auth check, user resolution, the event -> entitlement map) are exported and heavily
// unit-tested, because one of them (CANCELLATION) is a piece of billing logic that is obvious to
// get wrong and costs a paying customer their access if you do.

import { type D1LikeDatabase, type Entitlement, writeEntitlement } from './entitlements';
import { buildOwnerEmail } from './monitor';
import { timingSafeEqual } from './stripe';

export type RcEnv = {
  DB?: D1LikeDatabase;
  // The shared secret configured as the webhook's Authorization header value in the RevenueCat
  // dashboard. RevenueCat has no HMAC signature, so this constant IS the auth. Make it long.
  RC_WEBHOOK_AUTH?: string;
  // The owner-alert path (same binding the monitor + Stripe money alerts use). Optional.
  SEND_EMAIL?: { send(message: unknown): Promise<unknown> };
  FEEDBACK_TO?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITLEMENT = 'premium';

/** Constant-time compare of the request's Authorization header against the configured secret.
 *  A missing header or an empty configured secret both fail closed. */
export function verifyRcAuth(request: Request, secret: string): boolean {
  if (!secret) return false;
  const got = request.headers.get('Authorization') ?? '';
  return timingSafeEqual(got, secret);
}

/** Resolve the Supabase user id an event belongs to, or null. The app_user_id if it is UUID-shaped;
 *  else the first UUID among aliases (a purchase made while anonymous then logged in); else null.
 *  Never returns an anonymous ($RCAnonymousID:…) id, so a garbage D1 row is impossible. */
export function appUserIdFromRcEvent(event: unknown): string | null {
  const e = (event ?? {}) as { app_user_id?: unknown; aliases?: unknown };
  const primary = typeof e.app_user_id === 'string' ? e.app_user_id : '';
  if (UUID_RE.test(primary)) return primary;
  if (Array.isArray(e.aliases)) {
    const alias = e.aliases.find((a): a is string => typeof a === 'string' && UUID_RE.test(a));
    if (alias) return alias;
  }
  return null;
}

// Grants: premium on, auto-renew implied on. status 'active', period end refreshed from the event.
const GRANT_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']);

/** Map a RevenueCat event to an entitlement change, or null (a 200 with no write). Also resolves
 *  the user; a non-UUID owner yields null. `nowMs` is injected for the stale-expiration guard.
 *
 *  The two mappings that matter, and are easy to get backwards:
 *   - CANCELLATION means auto-renew was turned off. Access RUNS TO the period end. It is NOT a
 *     revoke (EXPIRATION is). The one exception is a CUSTOMER_SUPPORT cancel, which is a refund.
 *   - BILLING_ISSUE keeps premium ON: Apple runs a grace period, and EXPIRATION arrives later if
 *     it never resolves. Revoking here would punish someone whose card merely expired.
 */
export function entitlementFromRcEvent(event: unknown, nowMs: number): Entitlement | null {
  const e = (event ?? {}) as {
    type?: unknown;
    entitlement_ids?: unknown;
    expiration_at_ms?: unknown;
    cancel_reason?: unknown;
  };
  const type = typeof e.type === 'string' ? e.type : '';
  const userId = appUserIdFromRcEvent(event);
  if (!userId) return null;

  // Only ever touch premium for an event that is actually about the premium entitlement. Guards a
  // spurious revoke arriving for some unrelated entitlement.
  const ids = Array.isArray(e.entitlement_ids) ? e.entitlement_ids : [];
  if (!ids.includes(ENTITLEMENT)) return null;

  const expMs = typeof e.expiration_at_ms === 'number' ? e.expiration_at_ms : null;
  const periodEndSec = expMs != null ? Math.floor(expMs / 1000) : null;
  const base = { userId, customerId: null, source: 'apple' as const };

  if (GRANT_TYPES.has(type)) {
    return { ...base, premium: true, status: 'active', currentPeriodEnd: periodEndSec, cancelAtPeriodEnd: false };
  }
  if (type === 'NON_RENEWING_PURCHASE') {
    // A one-off (non-subscription) purchase: grant, but it will not renew.
    return { ...base, premium: true, status: 'active', currentPeriodEnd: periodEndSec, cancelAtPeriodEnd: true };
  }
  if (type === 'CANCELLATION') {
    // A support-issued cancel is a REFUND, so revoke now. Any other reason is "auto-renew off",
    // which keeps access to the end of the paid period (exactly Stripe's cancel_at_period_end).
    if (e.cancel_reason === 'CUSTOMER_SUPPORT') {
      return { ...base, premium: false, status: 'canceled', currentPeriodEnd: null, cancelAtPeriodEnd: true };
    }
    return { ...base, premium: true, status: 'canceled', currentPeriodEnd: null, cancelAtPeriodEnd: true };
  }
  if (type === 'BILLING_ISSUE') {
    // Grace period: keep premium on. currentPeriodEnd null so the writer's COALESCE preserves it.
    // cancelAtPeriodEnd is set to false here because the writer cannot express "unchanged" for this
    // column and a failed charge is not a scheduled cancel; the (rare) overlap is cosmetic UI copy.
    return { ...base, premium: true, status: 'past_due', currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }
  if (type === 'EXPIRATION') {
    // The real loss of access. Guard against out-of-order delivery: RevenueCat retries and does not
    // guarantee ordering, so an EXPIRATION overtaking a RENEWAL must not revoke a live subscriber.
    // Only revoke once the expiration is actually in the past.
    if (expMs != null && expMs > nowMs) return null;
    return { ...base, premium: false, status: 'expired', currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }
  // TEST, SUBSCRIPTION_PAUSED, TRANSFER (handled in the route), and anything new: no write.
  return null;
}

/**
 * WHY a delivery ended the way it did, recorded on every logged row so the audit log answers "what
 * happened to this event" and not merely "this event arrived".
 *
 * `sandbox` is declared one commit AHEAD of its use. The guard that rejects sandbox events lands
 * next, and having the member here already makes that change purely additive against this type.
 */
export type RcOutcome =
  | 'applied'
  | 'duplicate'
  | 'transfer'
  | 'unresolved-user'
  | 'other-entitlement'
  | 'stale-expiration'
  | 'sandbox'
  | 'no-op';

/** One row of the delivery log. A named allowlist: everything here is deliberate, and anything not
 *  listed (country, subscriber_attributes, IP, the raw body) is deliberately not kept. */
export type RcEventRow = {
  eventId: string | null;
  type: string;
  periodType: string | null;
  environment: string | null;
  store: string | null;
  productId: string | null;
  appUserId: string | null;
  originalTransactionId: string | null;
  userId: string | null;
  price: number | null;
  priceInPurchasedCurrency: number | null;
  currency: string | null;
  isTrialConversion: number | null;
  applied: number;
  outcome: RcOutcome;
  eventTimestampMs: number | null;
};

/** Total coercers. A wrong-typed field from a webhook becomes null rather than landing a string in
 *  a REAL column, and an empty string is not a value worth keeping. */
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Project an event onto the log row. TOTAL: `{}`, `null` and every wrong-typed field are handled,
 * because a logging failure must never be able to take down a billing webhook.
 */
export function rcEventRow(event: unknown, outcome: RcOutcome): RcEventRow {
  const e = (event ?? {}) as Record<string, unknown>;
  return {
    eventId: str(e.id),
    type: typeof e.type === 'string' ? e.type : '',
    periodType: str(e.period_type),
    environment: str(e.environment),
    store: str(e.store),
    productId: str(e.product_id),
    appUserId: str(e.app_user_id),
    originalTransactionId: str(e.original_transaction_id),
    userId: appUserIdFromRcEvent(event),
    price: num(e.price),
    priceInPurchasedCurrency: num(e.price_in_purchased_currency),
    currency: str(e.currency),
    // Three-valued on purpose: missing stays NULL. "We were not told" and "it was not a conversion"
    // are different billing answers, and collapsing them to 0 is how a log starts lying.
    isTrialConversion: typeof e.is_trial_conversion === 'boolean' ? (e.is_trial_conversion ? 1 : 0) : null,
    applied: outcome === 'applied' ? 1 : 0,
    outcome,
    eventTimestampMs: num(e.event_timestamp_ms),
  };
}

/**
 * The reason `entitlementFromRcEvent` returned null, mirroring its precedence EXACTLY (user first,
 * then the entitlement id, then the stale-EXPIRATION guard, then simply a type we do not act on).
 * Kept beside it so the two cannot drift; a test asserts the mirror over the shared fixtures.
 */
export function rcIgnoreOutcome(event: unknown, nowMs: number): RcOutcome {
  const e = (event ?? {}) as { type?: unknown; entitlement_ids?: unknown; expiration_at_ms?: unknown };
  if (!appUserIdFromRcEvent(event)) return 'unresolved-user';
  const ids = Array.isArray(e.entitlement_ids) ? e.entitlement_ids : [];
  if (!ids.includes(ENTITLEMENT)) return 'other-entitlement';
  if (e.type === 'EXPIRATION') {
    const expMs = num(e.expiration_at_ms);
    if (expMs != null && expMs > nowMs) return 'stale-expiration';
  }
  return 'no-op';
}

/** Create-if-missing, so a Worker deploy never has to wait on a schema apply (the scrapbook_log
 *  lesson: rows vanished for weeks because the table postdated the code that wrote it). */
export const RC_EVENTS_DDL =
  "CREATE TABLE IF NOT EXISTS rc_events (id integer primary key autoincrement, event_id text unique, type text not null, period_type text, environment text, store text, product_id text, app_user_id text, original_transaction_id text, user_id text, price real, price_in_purchased_currency real, currency text, is_trial_conversion integer, applied integer not null default 0, outcome text not null, event_timestamp_ms integer, created_at text not null default (datetime('now')))";

/**
 * Append one row. NEVER throws and never returns a failure: observability that can break a billing
 * path is worse than no observability. INSERT OR IGNORE plus the UNIQUE event_id makes an
 * at-least-once re-delivery a no-op rather than a duplicate row.
 */
export async function logRcEvent(db: D1LikeDatabase, row: RcEventRow, nowISO: string): Promise<void> {
  try {
    await db.prepare(RC_EVENTS_DDL).run();
    await db
      .prepare(
        `INSERT OR IGNORE INTO rc_events (event_id, type, period_type, environment, store, product_id, app_user_id,
           original_transaction_id, user_id, price, price_in_purchased_currency, currency, is_trial_conversion,
           applied, outcome, event_timestamp_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
      )
      .bind(
        row.eventId, row.type, row.periodType, row.environment, row.store, row.productId, row.appUserId,
        row.originalTransactionId, row.userId, row.price, row.priceInPurchasedCurrency, row.currency,
        row.isTrialConversion, row.applied, row.outcome, row.eventTimestampMs, nowISO,
      )
      .run();
  } catch {
    // Deliberately silent. A missing table, a locked database, a schema drift: none of them are
    // worth failing a purchase over.
  }
}

/** Email the owner via the same proven send path as the monitor and the Stripe money alerts. */
async function alertOwner(env: RcEnv, subject: string, body: string): Promise<void> {
  if (!env.SEND_EMAIL || !env.FEEDBACK_TO) return;
  const from = 'feedback@doubledone.app';
  const raw = buildOwnerEmail({ from, to: env.FEEDBACK_TO, subject, body, uuid: crypto.randomUUID(), date: new Date().toUTCString() });
  const { EmailMessage } = (await import('cloudflare:email')) as { EmailMessage: new (from: string, to: string, raw: string) => unknown };
  await env.SEND_EMAIL.send(new EmailMessage(from, env.FEEDBACK_TO, raw));
}

/** POST /rc-webhook — RevenueCat calls this server-to-server. The Authorization header is the auth
 *  (no HMAC exists); the raw body carries the event. Same fail-open idempotency posture as the
 *  Stripe webhook, keyed in the `rc:` namespace so it can never collide with Stripe's evt_ ids. */
export async function handleRcWebhook(request: Request, env: RcEnv, nowISO: string, nowMs: number): Promise<Response> {
  if (!env.RC_WEBHOOK_AUTH || !env.DB) return new Response('not configured', { status: 503 });
  if (!verifyRcAuth(request, env.RC_WEBHOOK_AUTH)) return new Response('unauthorized', { status: 401 });

  let body: { event?: unknown };
  try {
    body = (await request.json()) as { event?: unknown };
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const event = (body?.event ?? {}) as { type?: unknown; id?: unknown };
  const type = typeof event.type === 'string' ? event.type : '';

  // TRANSFER should never fire under keep-with-original Restore Behavior. If it does (a genuine
  // phone handover), write nothing and let a human resolve it in the dashboard, because the event
  // carries no expiration to grant the new owner with.
  if (type === 'TRANSFER') {
    await alertOwner(env, 'DoubleDone: a RevenueCat TRANSFER fired', `A TRANSFER event arrived, which should not happen under keep-with-original Restore Behavior. Resolve it in the RevenueCat dashboard. Event id: ${typeof event.id === 'string' ? event.id : '(none)'}.`).catch(() => {});
    await logRcEvent(env.DB, rcEventRow(event, 'transfer'), nowISO);
    return new Response(JSON.stringify({ received: true, transfer: true }), { headers: { 'content-type': 'application/json' } });
  }

  const ent = entitlementFromRcEvent(event, nowMs);
  if (!ent) {
    // The one that mattered most: an ANONYMOUS purchase dies here, and until now died silently, so
    // a paying customer existed nowhere in our data at all.
    await logRcEvent(env.DB, rcEventRow(event, rcIgnoreOutcome(event, nowMs)), nowISO);
    return new Response(JSON.stringify({ received: true, ignored: true }), { headers: { 'content-type': 'application/json' } });
  }

  // Idempotency: RevenueCat delivers at-least-once. Skip an event we already applied. Fail OPEN on
  // any dedup-store error: writeEntitlement is an idempotent upsert, so re-processing is harmless,
  // and a real billing event must never be dropped because the dedup store hiccuped.
  const eventId = typeof event.id === 'string' ? `rc:${event.id}` : '';
  if (eventId) {
    try {
      const seen = await env.DB.prepare('SELECT 1 FROM processed_events WHERE event_id = ?1').bind(eventId).first();
      if (seen) {
        await logRcEvent(env.DB, rcEventRow(event, 'duplicate'), nowISO);
        return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { 'content-type': 'application/json' } });
      }
    } catch {
      // fail open: proceed to write
    }
  }
  await writeEntitlement(env.DB, ent, nowISO);
  // AFTER the write, never before, so `applied = 1` can never claim something that did not happen.
  await logRcEvent(env.DB, rcEventRow(event, 'applied'), nowISO);
  if (eventId) {
    try {
      await env.DB.prepare('INSERT OR IGNORE INTO processed_events (event_id, created_at) VALUES (?1, ?2)').bind(eventId, nowISO).run();
    } catch {
      // best-effort: a missed dedup insert only risks a harmless idempotent re-write
    }
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'content-type': 'application/json' } });
}
