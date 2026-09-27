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
import { type D1LikeDatabase, type Entitlement, type EntitlementView, readEntitlement, writeEntitlement } from './entitlements';
import { decodeJwtEmail } from './mcp';
import { buildOwnerEmail } from './monitor';
import { activeTrial } from './trials';
import { defaultVerifySub, type SubVerifier } from './verify';

export type StripeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string; // the monthly recurring price (the default)
  STRIPE_PRICE_ID_ANNUAL?: string; // the yearly price; when unset, the annual option simply falls back to monthly
  APP_URL?: string; // where Checkout returns to (default the deployed web app)
};

const STRIPE_API = 'https://api.stripe.com/v1';
const DEFAULT_APP_URL = 'https://doubledone.app';

// --- Checkout --------------------------------------------------------------

/** The form body for Create-Checkout-Session. Pure and unit-tested: the user id
 *  rides on both the session and the subscription so the webhook can attribute it. */
export function checkoutSessionForm(env: StripeEnv, userId: string, email?: string, plan?: 'monthly' | 'annual'): URLSearchParams {
  const appUrl = env.APP_URL ?? DEFAULT_APP_URL;
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  // Annual only when the caller asked for it AND the annual price is configured; otherwise monthly.
  const price = plan === 'annual' && env.STRIPE_PRICE_ID_ANNUAL ? env.STRIPE_PRICE_ID_ANNUAL : env.STRIPE_PRICE_ID;
  form.set('line_items[0][price]', price ?? '');
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
export async function createCheckoutSession(env: StripeEnv, userId: string, email?: string, plan?: 'monthly' | 'annual'): Promise<string | null> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) return null;
  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: checkoutSessionForm(env, userId, email, plan).toString(),
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

// --- Closing billing on account deletion ------------------------------------
// Deleting an account removes the auth row, and nothing in that path ever reached Stripe, so a paying
// person who deleted kept being charged with no account left to cancel from. /account/close-billing runs
// FIRST (the client refuses to delete until it answers), and cancels every Stripe subscription that can
// still take money. The customer record itself is KEPT: its invoices are the trail for refunds and disputes.

// Every status in which a subscription can still take money, or come back to taking it. past_due and unpaid
// read as "not Premium" to the app but Stripe keeps retrying the card; incomplete can still be paid; paused
// (a trial that ended with no card) resumes into charging the moment a card is added.
export const CHARGEABLE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

// The verified sub is always a Supabase uuid. It is checked against this before it goes into a Stripe search
// query, so no caller can ever shape that query.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET a Stripe resource: the parsed body on a 2xx, null on anything else (a non-2xx, a throw, bad JSON). */
async function stripeGet(env: StripeEnv, path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${STRIPE_API}${path}`, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Like stripeGet, but it also says when Stripe answered "no such resource". A customer id the live key cannot
 * see (a TEST-mode id left in D1 from before go-live, or a customer removed in the dashboard) is answered with
 * a 400/404 `resource_missing`, and that customer then has no subscriptions under this key: it is an empty
 * list, not a failure. Treating it as a failure made the route 502 forever for that person, so they could
 * never delete their account.
 */
async function stripeGetOrMissing(env: StripeEnv, path: string): Promise<{ body: unknown | null; missing: boolean }> {
  try {
    const res = await fetch(`${STRIPE_API}${path}`, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
    if (res.ok) return { body: await res.json(), missing: false };
    if (res.status === 400 || res.status === 404) {
      const err = (await res.json().catch(() => null)) as { error?: { code?: unknown } } | null;
      if (err?.error?.code === 'resource_missing') return { body: null, missing: true };
    }
    return { body: null, missing: false };
  } catch {
    return { body: null, missing: false };
  }
}

/** The chargeable subscription ids in one Stripe list or search page, or null when the page cannot be
 *  trusted to be complete (malformed, or has_more, which would hide a live subscription behind a cursor). */
function chargeableIds(body: unknown): string[] | null {
  const page = body as { data?: unknown; has_more?: unknown } | null;
  if (!page || !Array.isArray(page.data) || page.has_more === true) return null;
  return page.data
    .filter((s): s is { id: string; status: string } => typeof s?.id === 'string' && typeof s?.status === 'string')
    .filter((s) => CHARGEABLE_STATUSES.has(s.status))
    .map((s) => s.id);
}

/**
 * Every subscription that can still charge this user, or null when Stripe could not answer in full (the
 * caller then fails closed: an account is never deleted on a half look). Two lookups, merged by id:
 *  - the customer D1 knows (`customerId`), which is always current;
 *  - a search on metadata.user_id, because Checkout sends customer_email rather than customer, so every
 *    checkout makes a NEW Stripe customer and D1 keeps only the latest. A person who lapsed and came back,
 *    or who met the old double-subscription bug, can have a live subscription on a customer D1 has lost.
 *    Every subscription carries metadata.user_id (checkoutSessionForm), so the search finds them all.
 * Search is eventually consistent (about a minute), which is why the customer list runs as well.
 */
export async function findChargeableSubscriptions(env: StripeEnv, userId: string, customerId: string | null): Promise<string[] | null> {
  if (!env.STRIPE_SECRET_KEY || !UUID_RE.test(userId)) return null;
  const ids = new Set<string>();
  if (customerId) {
    // No status filter: Stripe's default leaves out canceled ones, and the rest are filtered here. A customer
    // Stripe says does not exist has nothing to cancel, and the search below still covers every live one.
    // Anything else short of a full answer fails closed.
    const got = await stripeGetOrMissing(env, `/subscriptions?customer=${encodeURIComponent(customerId)}&limit=100`);
    if (!got.missing) {
      const byCustomer = chargeableIds(got.body);
      if (!byCustomer) return null;
      byCustomer.forEach((id) => ids.add(id));
    }
  }
  const query = `metadata['user_id']:'${userId}'`;
  const byUser = chargeableIds(await stripeGet(env, `/subscriptions/search?query=${encodeURIComponent(query)}&limit=100`));
  if (!byUser) return null;
  byUser.forEach((id) => ids.add(id));
  return [...ids];
}

/**
 * Cancel one subscription NOW, not at the period end: the account it serves is being deleted, so there is
 * no access left to run out. Stripe's defaults apply (no proration credit, no final invoice), and the
 * comment shows on the subscription in the dashboard. A refusal is re-read before it counts as a failure,
 * because the usual cause is that it is already canceled (a double tap, or a second device at once).
 */
export async function cancelSubscriptionNow(env: StripeEnv, subscriptionId: string): Promise<boolean> {
  if (!env.STRIPE_SECRET_KEY) return false;
  const form = new URLSearchParams();
  form.set('cancellation_details[comment]', 'account_deleted');
  try {
    const res = await fetch(`${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (res.ok) return true;
  } catch {
    // a dropped connection may still have landed at Stripe: read it back below
  }
  const now = (await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`)) as { status?: unknown } | null;
  return now?.status === 'canceled' || now?.status === 'incomplete_expired';
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

// Exported so the RevenueCat webhook (which has no HMAC, only a shared-secret Authorization
// header) can reuse the same constant-time compare. A crypto helper, not the entitlement writer,
// so this shared use does not couple RevenueCat to Stripe's business logic.
export function timingSafeEqual(a: string, b: string): boolean {
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
    return { userId, premium: paid, status: paid ? 'active' : 'incomplete', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId, source: 'stripe' };
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
      source: 'stripe',
    };
  }

  return null;
}

// --- money-trouble alerts (the control centre's Stripe arm) -----------------

export type MoneyAlert = { kind: string; title: string; detail: string };

/** The amount on a money event, in dollars, as a " for 9.99 AUD" suffix. Prefers the
 *  refunded/due amount over the original charge, so each event reports the relevant figure. */
function amountSuffix(obj: Record<string, unknown>): string {
  const cents = [obj.amount_refunded, obj.amount_due, obj.amount].find((v) => typeof v === 'number') as number | undefined;
  if (typeof cents !== 'number') return '';
  const cur = typeof obj.currency === 'string' ? obj.currency.toUpperCase() : '';
  return ` for ${(cents / 100).toFixed(2)}${cur ? ' ' + cur : ''}`;
}

/** Map a Stripe event to a money-trouble alert (dispute / refund / failed payment), or
 *  null. Stripe's dashboard no longer emails on these, so the verified webhook is where
 *  they get caught. Carries ONLY the event type, amount, currency and the Stripe event id
 *  (clickable in the dashboard): never a card, a name, or an email. */
export function moneyAlertFromEvent(event: unknown): MoneyAlert | null {
  const e = event as { id?: unknown; type?: unknown; data?: { object?: Record<string, unknown> } };
  const type = typeof e.type === 'string' ? e.type : '';
  const obj = e.data?.object ?? {};
  const id = typeof e.id === 'string' ? e.id : '(no id)';
  const amt = amountSuffix(obj);
  if (type === 'charge.dispute.created') {
    return { kind: 'stripe-dispute', title: 'Stripe dispute opened', detail: `A chargeback was opened${amt}. At this size it is most likely card-testing or friendly fraud. Open it in the Stripe dashboard: ${id}.` };
  }
  if (type === 'charge.refunded') {
    return { kind: 'stripe-refund', title: 'Stripe refund', detail: `A charge was refunded${amt}. Stripe event ${id}.` };
  }
  if (type === 'invoice.payment_failed') {
    return { kind: 'stripe-payment-failed', title: 'Stripe payment failed', detail: `A subscription payment failed${amt}. The customer enters dunning and Stripe will retry. Stripe event ${id}.` };
  }
  return null;
}

// --- D1 entitlement store ---------------------------------------------------
// The store moved to entitlements.ts (2026-07-18) so Apple IAP can write the same rows without
// coupling to Stripe. Re-exported here so existing importers of stripe.ts keep working.
export { readEntitlement, writeEntitlement };
export type { D1LikeDatabase, Entitlement, EntitlementView };

// --- HTTP handlers ---------------------------------------------------------

type FullEnv = StripeEnv & {
  // The project URL the verifier reads the JWKS from (the same value the MCP and REST surfaces use).
  SUPABASE_URL?: string;
  DB?: D1LikeDatabase;
  COMP_EMAILS?: string;
  // The control centre's email path (reused for money-trouble alerts), same binding the
  // hourly monitor + /feedback use. Optional, so a webhook with billing-only config skips it.
  SEND_EMAIL?: { send(message: unknown): Promise<unknown> };
  FEEDBACK_TO?: string;
  // Per-USER limit on /account/close-billing (keyed on the verified sub, so a carrier NAT never locks out
  // real people). Optional, so tests and local dev without the binding simply skip it.
  BILLING_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
};

/** Email the owner via the proven send_email path (same as /feedback + the monitor). */
async function sendOwnerAlert(env: FullEnv, subject: string, body: string): Promise<void> {
  if (!env.SEND_EMAIL || !env.FEEDBACK_TO) return;
  const from = 'feedback@doubledone.app';
  const raw = buildOwnerEmail({ from, to: env.FEEDBACK_TO, subject, body, uuid: crypto.randomUUID(), date: new Date().toUTCString() });
  const { EmailMessage } = (await import('cloudflare:email')) as { EmailMessage: new (from: string, to: string, raw: string) => unknown };
  await env.SEND_EMAIL.send(new EmailMessage(from, env.FEEDBACK_TO, raw));
}

export function bearer(request: Request): string {
  const auth = request.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** POST /checkout — authed (the user's Supabase token). Returns { url } to redirect to. */
export async function handleCheckout(
  request: Request,
  env: FullEnv,
  cors: Record<string, string>,
  verifySub: SubVerifier = defaultVerifySub,
): Promise<Response> {
  const token = bearer(request);
  if (!token) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  // VERIFIED, not decoded: this route reaches money. A forged token carrying somebody else's uuid used to
  // get here (2026-09-25 audit). An unset SUPABASE_URL fails closed inside the verifier (null -> 401).
  const sub = await verifySub(token, env.SUPABASE_URL ?? '');
  if (!sub) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { ...JSON_HEADERS, ...cors } });
  }
  // Defence-in-depth: a user whose subscription still EXISTS at Stripe must not open a SECOND
  // Checkout (a duplicate subscription is a real double charge, and the webhook's upsert would
  // then overwrite stripe_customer_id and orphan the first). Two shapes of "still exists":
  //  - premium on (active/trialing) with a customer: the classic already-subscribed case.
  //  - DUNNING (past_due/unpaid): premium reads false because access lapsed, but the subscription
  //    is alive at Stripe and retrying the card. Selling this user a second subscription instead
  //    of sending them to the portal to fix the card is the double-charge bug this guard exists
  //    for; it slipped through when the guard keyed on premium alone.
  // Deliberately still ALLOWED through: a trial (premium, no customer) converting; a lapsed
  // subscriber (status canceled, customer kept for history) re-subscribing, since their old sub
  // no longer exists and the portal would have nothing to restart; and an abandoned checkout
  // (incomplete/incomplete_expired), which self-expires at Stripe and must not lock the user out
  // of ever buying. Keying on customerId ALONE would have broken those last two.
  if (env.DB) {
    try {
      const existing = await readEntitlement(env.DB, sub);
      const dunning = existing.status === 'past_due' || existing.status === 'unpaid';
      if (existing.customerId && (existing.premium || dunning)) {
        return new Response(JSON.stringify({ error: dunning ? 'billing_issue' : 'already_subscribed' }), { status: 409, headers: { ...JSON_HEADERS, ...cors } });
      }
    } catch {
      // a transient read must never block a legitimate new checkout; fall through and create the session
    }
  }
  let email: string | undefined;
  let plan: 'monthly' | 'annual' | undefined;
  try {
    const body = (await request.json()) as { email?: unknown; plan?: unknown };
    email = typeof body?.email === 'string' ? body.email : undefined;
    plan = body?.plan === 'annual' ? 'annual' : undefined;
  } catch {
    email = undefined;
  }
  const url = await createCheckoutSession(env, sub, email, plan);
  if (!url) return new Response(JSON.stringify({ error: 'checkout_failed' }), { status: 502, headers: { ...JSON_HEADERS, ...cors } });
  return new Response(JSON.stringify({ url }), { headers: { ...JSON_HEADERS, ...cors } });
}

/** POST /portal — authed. Returns { url } to the Stripe Billing Portal (manage / cancel).
 *  Needs the customer id the webhook stored; 404 if the user has no subscription yet. */
export async function handlePortal(
  request: Request,
  env: FullEnv,
  cors: Record<string, string>,
  verifySub: SubVerifier = defaultVerifySub,
): Promise<Response> {
  const token = bearer(request);
  if (!token) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  // VERIFIED, not decoded: this route reaches money. A forged token carrying somebody else's uuid used to
  // get here (2026-09-25 audit). An unset SUPABASE_URL fails closed inside the verifier (null -> 401).
  const sub = await verifySub(token, env.SUPABASE_URL ?? '');
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

/**
 * POST /account/close-billing, authed. Called by the app BEFORE it deletes the account, on every
 * platform (it cancels billing, it sells nothing, so Android's Path C allows it). Cancels every Stripe
 * subscription that can still charge the caller, immediately, and answers 200 { cancelled: n }; 0 when
 * there is nothing to cancel. Idempotent: a second call finds nothing live and answers 0.
 *
 * Fails closed and claims nothing it did not do: a Stripe lookup it cannot trust in full, or any cancel
 * that did not land, answers 502 (after still trying every other cancel), and the app then deletes
 * nothing. The Stripe customer and its invoices stay. Apple billing is out of reach: the app tells an
 * Apple subscriber to cancel in their iPhone's Settings before they confirm.
 */
export async function handleCloseBilling(
  request: Request,
  env: FullEnv,
  cors: Record<string, string>,
  verifySub: SubVerifier = defaultVerifySub,
): Promise<Response> {
  const token = bearer(request);
  if (!token) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  // VERIFIED, not decoded: this route cancels somebody's subscriptions, so a forged token carrying another
  // person's uuid must never reach Stripe. An unset SUPABASE_URL fails closed inside the verifier (null -> 401).
  const sub = await verifySub(token, env.SUPABASE_URL ?? '');
  if (!sub) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  // Each call spends Stripe reads (a list and a search), which are capped across the whole account, so a
  // person gets a few tries a minute and no more. Checked before any D1 or Stripe call.
  if (env.BILLING_LIMITER && !(await env.BILLING_LIMITER.limit({ key: `close:${sub}` })).success) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { ...JSON_HEADERS, ...cors } });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { ...JSON_HEADERS, ...cors } });
  }
  // The customer D1 knows, found the same way /portal finds it. A missing row or a D1 hiccup is not fatal:
  // the metadata search still finds every subscription, on every customer.
  let customerId: string | null = null;
  if (env.DB) {
    try {
      customerId = (await readEntitlement(env.DB, sub)).customerId;
    } catch {
      customerId = null;
    }
  }
  const ids = await findChargeableSubscriptions(env, sub, customerId);
  if (!ids) return new Response(JSON.stringify({ error: 'close_billing_failed' }), { status: 502, headers: { ...JSON_HEADERS, ...cors } });
  let cancelled = 0;
  let failed = false;
  for (const id of ids) {
    if (await cancelSubscriptionNow(env, id)) cancelled += 1;
    else failed = true; // keep going: stop as much billing as we can, then say it was not all
  }
  if (failed) return new Response(JSON.stringify({ error: 'close_billing_failed' }), { status: 502, headers: { ...JSON_HEADERS, ...cors } });
  return new Response(JSON.stringify({ cancelled }), { headers: { ...JSON_HEADERS, ...cors } });
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

  // Money-trouble alerts (disputes / refunds / failed payments). Additive + best-effort:
  // Stripe's dashboard no longer emails on these, so the verified, idempotent webhook is
  // where they get caught. This never touches entitlements (those event types are disjoint
  // from these), reuses processed_events to skip a redelivery, and a send failure can never
  // fail the webhook. Counts + the event id only; no card, name or email ever rides along.
  try {
    const money = moneyAlertFromEvent(event);
    if (money && env.SEND_EMAIL && env.FEEDBACK_TO) {
      const evtId = typeof (event as { id?: unknown }).id === 'string' ? (event as { id: string }).id : '';
      let seen = false;
      if (evtId) {
        try {
          seen = !!(await env.DB.prepare('SELECT 1 FROM processed_events WHERE event_id = ?1').bind(evtId).first());
        } catch {
          // fail open: a dedup hiccup must not drop a money alert
        }
      }
      if (!seen) {
        await sendOwnerAlert(env, `[DoubleDone] ${money.title}`, money.detail);
        if (evtId) {
          try {
            await env.DB.prepare('INSERT OR IGNORE INTO processed_events (event_id, created_at) VALUES (?1, ?2)').bind(evtId, nowISO).run();
          } catch {
            // best effort
          }
        }
      }
    }
  } catch {
    // a notification must never fail the webhook
  }
  return new Response(JSON.stringify({ received: true }), { headers: JSON_HEADERS });
}

/** GET /entitlement — authed. The app asks "am I premium, and since when?". */
export async function handleEntitlement(
  request: Request,
  env: FullEnv,
  cors: Record<string, string>,
  verifySub: SubVerifier = defaultVerifySub,
): Promise<Response> {
  const token = bearer(request);
  if (!token) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  // VERIFIED, not decoded: this route reaches money. A forged token carrying somebody else's uuid used to
  // get here (2026-09-25 audit). An unset SUPABASE_URL fails closed inside the verifier (null -> 401).
  const sub = await verifySub(token, env.SUPABASE_URL ?? '');
  if (!sub) return new Response(JSON.stringify({ error: 'sign_in_required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } });
  // Owner / comp: an allowlisted email is always premium, with no Stripe sub. The email claim is read
  // decode-only, which is safe here because the token's signature was verified just above; the costed money
  // gate (requirePremium) re-checks the same allowlist the same way. The far-past `since` gives the comp the
  // full tenure-based scrapbook allowance.
  if (isCompEmail(decodeJwtEmail(token), env.COMP_EMAILS)) {
    return new Response(
      JSON.stringify({ premium: true, status: 'comp', since: '2025-01-01T00:00:00.000Z', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null, source: 'stripe' }),
      { headers: { ...JSON_HEADERS, ...cors } },
    );
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null, source: null }), {
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
    return new Response(JSON.stringify({ premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null, source: null }), {
      headers: { ...JSON_HEADERS, ...cors },
    });
  }
  // A card-free trial also reports premium to the client (status 'trial') until it expires, with no Stripe
  // customer (so the manage portal correctly 404s and the UI can offer "keep Premium" instead of "manage").
  if (!view.premium) {
    const nowSec = Math.floor(Date.now() / 1000);
    const trial = await activeTrial(env.DB, sub, nowSec);
    if (trial.active) {
      view = { premium: true, status: 'trial', since: new Date(nowSec * 1000).toISOString(), currentPeriodEnd: trial.expiresAt, cancelAtPeriodEnd: true, customerId: null, source: 'stripe' };
    }
  }
  return new Response(JSON.stringify(view), { headers: { ...JSON_HEADERS, ...cors } });
}
