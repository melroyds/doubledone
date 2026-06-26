// Stripe (test mode) for DoubleDone Premium: a Checkout subscription that unlocks
// the AI scrapbook beyond the free monthly taste. Dependency-free: it talks to the
// Stripe REST API over fetch and verifies webhooks with Web Crypto, so the pure
// pieces (the checkout request, the signature check, the event -> entitlement map)
// are exported and unit-tested.
//
// Secrets are Worker secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET); the price
// id is a non-secret var. The flow: client (signed in) -> /checkout -> Stripe
// Checkout -> Stripe webhook -> /stripe-webhook writes the entitlement to D1 ->
// the client reads it from /entitlement. The server never trusts the client for
// premium status; only a verified webhook grants it.

import { isCompEmail } from './comp';
import { decodeJwtEmail, decodeJwtSub } from './mcp';
import { type D1LikeDatabase } from './telemetry';

export type StripeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  APP_URL?: string; // where Checkout returns to (default the deployed web app)
};

const STRIPE_API = 'https://api.stripe.com/v1';
const DEFAULT_APP_URL = 'https://doubledone.app';

// --- Checkout --------------------------------------------------------------

/** The form body for Create-Checkout-Session. Pure and unit-tested: the user id
 *  rides on both the session and the subscription so the webhook can attribute it. */
export function checkoutSessionForm(env: StripeEnv, userId: string, email?: string): URLSearchParams {
  const appUrl = env.APP_URL ?? DEFAULT_APP_URL;
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('line_items[0][price]', env.STRIPE_PRICE_ID ?? '');
  form.set('line_items[0][quantity]', '1');
  form.set('client_reference_id', userId);
  form.set('metadata[user_id]', userId);
  form.set('subscription_data[metadata][user_id]', userId);
  form.set('success_url', `${appUrl}/premium?status=success`);
  form.set('cancel_url', `${appUrl}/premium?status=cancelled`);
  form.set('allow_promotion_codes', 'true');
  if (email) form.set('customer_email', email);
  return form;
}

/** Create a Checkout Session and return its hosted URL, or null on any failure. */
export async function createCheckoutSession(env: StripeEnv, userId: string, email?: string): Promise<string | null> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) return null;
  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: checkoutSessionForm(env, userId, email).toString(),
  });
  if (!res.ok) return null;
  const session = (await res.json()) as { url?: unknown };
  return typeof session.url === 'string' ? session.url : null;
}

/** Create a Billing Portal session for a customer (manage / cancel), returning its URL. */
export async function createPortalSession(env: StripeEnv, customerId: string, returnUrl: string): Promise<string | null> {
  if (!env.STRIPE_SECRET_KEY) return null;
  const form = new URLSearchParams();
  form.set('customer', customerId);
  form.set('return_url', returnUrl);
  const res = await fetch(`${STRIPE_API}/billing_portal/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) return null;
  const session = (await res.json()) as { url?: unknown };
  return typeof session.url === 'string' ? session.url : null;
}

// --- Webhook signature (Stripe's scheme, via Web Crypto) -------------------

/** Parse a `Stripe-Signature` header: `t=...,v1=...,v1=...`. */
export function parseSigHeader(header: string): { t: string; v1: string[] } {
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1] ?? '';
  const v1 = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  return { t, v1 };
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Verify a Stripe webhook: signed_payload = `${t}.${rawBody}`, HMAC-SHA256 with the
 *  signing secret, within the timestamp tolerance. `nowSec` is injectable for tests. */
export async function verifyWebhook(
  rawBody: string,
  sigHeader: string,
  secret: string,
  toleranceSec = 300,
  nowSec?: number,
): Promise<boolean> {
  const { t, v1 } = parseSigHeader(sigHeader);
  if (!t || v1.length === 0) return false;
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(t)) || Math.abs(now - Number(t)) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return v1.some((sig) => timingSafeEqual(sig, expected));
}

/** Sign a payload the way Stripe does. Test-only helper (verifyWebhook's inverse). */
export async function signPayload(rawBody: string, secret: string, t: number): Promise<string> {
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${rawBody}`)}`;
}

// --- Event -> entitlement --------------------------------------------------

export type Entitlement = {
  userId: string;
  premium: boolean;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
};

// dahlia (2026-04) moved current_period_end off the subscription top-level and into
// its items; read whichever is present.
function subscriptionPeriodEnd(obj: Record<string, unknown>): number | null {
  if (typeof obj.current_period_end === 'number') return obj.current_period_end;
  const items = (obj.items as { data?: { current_period_end?: unknown }[] } | undefined)?.data;
  const fromItem = Array.isArray(items) ? items[0]?.current_period_end : undefined;
  return typeof fromItem === 'number' ? fromItem : null;
}

/** Map a Stripe event to an entitlement change, or null if it is not one we act on.
 *  The user id rides in client_reference_id (checkout) or metadata.user_id (both). */
export function entitlementFromEvent(event: unknown): Entitlement | null {
  const e = event as { type?: unknown; data?: { object?: Record<string, unknown> } };
  const obj = e.data?.object ?? {};
  const type = typeof e.type === 'string' ? e.type : '';
  const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
  const customerId = typeof obj.customer === 'string' ? obj.customer : null;

  if (type === 'checkout.session.completed') {
    const userId = (obj.client_reference_id as string) || meta.user_id || '';
    if (!userId) return null;
    // Require a genuinely-settled payment. `status === 'complete'` can be true while payment_status is
    // 'unpaid' (async methods, misconfig), so it must NOT grant premium. 'no_payment_required' covers the
    // legitimate free starts (a 100%-off promo or a trial). The customer.subscription.* events that follow
    // are the authoritative source either way; this is the initial grant, kept strict.
    const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required';
    return { userId, premium: paid, status: paid ? 'active' : 'incomplete', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId };
  }

  if (type.startsWith('customer.subscription.')) {
    const userId = meta.user_id || '';
    if (!userId) return null;
    const status = typeof obj.status === 'string' ? obj.status : '';
    const premium = status === 'active' || status === 'trialing';
    return {
      userId,
      premium,
      status,
      currentPeriodEnd: subscriptionPeriodEnd(obj),
      // dahlia (2026-04) represents a scheduled "cancel at period end" via cancel_at
      // (a timestamp), leaving the old cancel_at_period_end boolean false. Accept either.
      cancelAtPeriodEnd: obj.cancel_at_period_end === true || typeof obj.cancel_at === 'number',
      customerId,
    };
  }

  return null;
}

// --- D1 entitlement store --------------------------------------------------

// The D1 shape is shared with telemetry; re-exported so tests can import it here.
export type { D1LikeDatabase };

/** Upsert an entitlement. `started_at` (tenure) is set once, on first premium grant,
 *  and preserved thereafter so a lapse never resets the loyalty clock. */
export async function writeEntitlement(db: D1LikeDatabase, ent: Entitlement, nowISO: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entitlements (user_id, premium, status, current_period_end, cancel_at_period_end, started_at, stripe_customer_id, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(user_id) DO UPDATE SET
         premium = ?2,
         status = ?3,
         current_period_end = COALESCE(?4, entitlements.current_period_end),
         cancel_at_period_end = ?5,
         started_at = COALESCE(entitlements.started_at, ?6),
         stripe_customer_id = COALESCE(?7, entitlements.stripe_customer_id),
         updated_at = ?8`,
    )
    .bind(ent.userId, ent.premium ? 1 : 0, ent.status, ent.currentPeriodEnd, ent.cancelAtPeriodEnd ? 1 : 0, ent.premium ? nowISO : null, ent.customerId, nowISO)
    .run();
}

export type EntitlementView = {
  premium: boolean;
  status: string | null;
  since: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
};

export async function readEntitlement(db: D1LikeDatabase, userId: string): Promise<EntitlementView> {
  const row = await db
    .prepare('SELECT premium, status, started_at, current_period_end, cancel_at_period_end, stripe_customer_id FROM entitlements WHERE user_id = ?1')
    .bind(userId)
    .first<{
      premium: number;
      status: string | null;
      started_at: string | null;
      current_period_end: number | null;
      cancel_at_period_end: number | null;
      stripe_customer_id: string | null;
    }>();
  if (!row) return { premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null };
  return {
    premium: row.premium === 1,
    status: row.status,
    since: row.started_at,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    customerId: row.stripe_customer_id,
  };
}

// --- HTTP handlers ---------------------------------------------------------

type FullEnv = StripeEnv & { DB?: D1LikeDatabase; COMP_EMAILS?: string };

export function bearer(request: Request): string {
  const auth = request.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** POST /checkout — authed (the user's Supabase token). Returns { url } to redirect to. */
export async function handleCheckout(request: Request, env: FullEnv, cors: Record<string, string>): Promise<Response> {
  const sub = decodeJwtSub(bearer(request));
  if (!sub) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { ...JSON_HEADERS, ...cors } });
  }
  let email: string | undefined;
  try {
    email = ((await request.json()) as { email?: unknown })?.email as string | undefined;
  } catch {
    email = undefined;
  }
  const url = await createCheckoutSession(env, sub, typeof email === 'string' ? email : undefined);
  if (!url) return new Response(JSON.stringify({ error: 'checkout_failed' }), { status: 502, headers: { ...JSON_HEADERS, ...cors } });
  return new Response(JSON.stringify({ url }), { headers: { ...JSON_HEADERS, ...cors } });
}

/** POST /portal — authed. Returns { url } to the Stripe Billing Portal (manage / cancel).
 *  Needs the customer id the webhook stored; 404 if the user has no subscription yet. */
export async function handlePortal(request: Request, env: FullEnv, cors: Record<string, string>): Promise<Response> {
  const sub = decodeJwtSub(bearer(request));
  if (!sub) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  if (!env.STRIPE_SECRET_KEY || !env.DB) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { ...JSON_HEADERS, ...cors } });
  }
  const view = await readEntitlement(env.DB, sub);
  if (!view.customerId) return new Response(JSON.stringify({ error: 'no_subscription' }), { status: 404, headers: { ...JSON_HEADERS, ...cors } });
  const url = await createPortalSession(env, view.customerId, `${env.APP_URL ?? DEFAULT_APP_URL}/premium`);
  if (!url) return new Response(JSON.stringify({ error: 'portal_failed' }), { status: 502, headers: { ...JSON_HEADERS, ...cors } });
  return new Response(JSON.stringify({ url }), { headers: { ...JSON_HEADERS, ...cors } });
}

/** POST /stripe-webhook — Stripe calls this. Verifies the signature, then writes the
 *  entitlement. Not origin-gated, not user-authed: the signature is the auth. */
export async function handleWebhook(request: Request, env: FullEnv, nowISO: string, nowSec?: number): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.DB) return new Response('not configured', { status: 503 });
  const raw = await request.text();
  const sig = request.headers.get('Stripe-Signature') ?? '';
  const ok = await verifyWebhook(raw, sig, env.STRIPE_WEBHOOK_SECRET, 300, nowSec);
  if (!ok) return new Response('bad signature', { status: 400 });

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const ent = entitlementFromEvent(event);
  if (ent) {
    // Idempotency: Stripe delivers at-least-once (automatic retries, occasional duplicates), so the same
    // event id can arrive twice. Skip one we have already applied. Fail OPEN on any dedup-store error or a
    // not-yet-created table: the entitlement write below is an idempotent upsert, so re-processing is
    // harmless, and a real billing event must never be dropped because the dedup store hiccuped.
    const eventId = typeof (event as { id?: unknown }).id === 'string' ? (event as { id: string }).id : '';
    if (eventId) {
      try {
        const seen = await env.DB.prepare('SELECT 1 FROM processed_events WHERE event_id = ?1').bind(eventId).first();
        if (seen) return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: JSON_HEADERS });
      } catch {
        // fail open: missing table or transient error, proceed to process
      }
    }
    try {
      await writeEntitlement(env.DB, ent, nowISO);
    } catch {
      return new Response('store error', { status: 500 });
    }
    if (eventId) {
      try {
        await env.DB.prepare('INSERT OR IGNORE INTO processed_events (event_id, created_at) VALUES (?1, ?2)').bind(eventId, nowISO).run();
      } catch {
        // best effort: the write already succeeded, the dedup record is non-critical
      }
    }
  }
  return new Response(JSON.stringify({ received: true }), { headers: JSON_HEADERS });
}

/** GET /entitlement — authed. The app asks "am I premium, and since when?". */
export async function handleEntitlement(request: Request, env: FullEnv, cors: Record<string, string>): Promise<Response> {
  const token = bearer(request);
  const sub = decodeJwtSub(token);
  if (!sub) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  // Owner / comp: an allowlisted email is always premium, with no Stripe sub. This read is decode-only
  // (like the sub above), so it grants only the CLIENT flag; the costed money gate (requirePremium) re-checks
  // the same allowlist against a cryptographically verified token. The far-past `since` gives the comp the
  // full tenure-based scrapbook allowance.
  if (isCompEmail(decodeJwtEmail(token), env.COMP_EMAILS)) {
    return new Response(
      JSON.stringify({ premium: true, status: 'comp', since: '2025-01-01T00:00:00.000Z', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null }),
      { headers: { ...JSON_HEADERS, ...cors } },
    );
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null }), {
      headers: { ...JSON_HEADERS, ...cors },
    });
  }
  // A transient D1 throw must not hard-500 the Premium/Settings screen (it would brush the never-alarm
  // spine). This is the cosmetic client flag, not the money gate (requirePremium stays fail-closed), so a
  // store error reports the calm FREE shape rather than an error.
  let view: EntitlementView;
  try {
    view = await readEntitlement(env.DB, sub);
  } catch {
    return new Response(JSON.stringify({ premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null }), {
      headers: { ...JSON_HEADERS, ...cors },
    });
  }
  return new Response(JSON.stringify(view), { headers: { ...JSON_HEADERS, ...cors } });
}
