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
    return new Response(JSON.stringify({ received: true, transfer: true }), { headers: { 'content-type': 'application/json' } });
  }

  const ent = entitlementFromRcEvent(event, nowMs);
  if (!ent) return new Response(JSON.stringify({ received: true, ignored: true }), { headers: { 'content-type': 'application/json' } });

  // Idempotency: RevenueCat delivers at-least-once. Skip an event we already applied. Fail OPEN on
  // any dedup-store error: writeEntitlement is an idempotent upsert, so re-processing is harmless,
  // and a real billing event must never be dropped because the dedup store hiccuped.
  const eventId = typeof event.id === 'string' ? `rc:${event.id}` : '';
  if (eventId) {
    try {
      const seen = await env.DB.prepare('SELECT 1 FROM processed_events WHERE event_id = ?1').bind(eventId).first();
      if (seen) return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { 'content-type': 'application/json' } });
    } catch {
      // fail open: proceed to write
    }
  }
  await writeEntitlement(env.DB, ent, nowISO);
  if (eventId) {
    try {
      await env.DB.prepare('INSERT OR IGNORE INTO processed_events (event_id, created_at) VALUES (?1, ?2)').bind(eventId, nowISO).run();
    } catch {
      // best-effort: a missed dedup insert only risks a harmless idempotent re-write
    }
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'content-type': 'application/json' } });
}
