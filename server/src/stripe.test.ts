import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkoutSessionForm,
  createCheckoutSession,
  createPortalSession,
  type D1LikeDatabase,
  entitlementFromEvent,
  entitlementFromSubscription,
  handleCheckout,
  handleEntitlement,
  handlePortal,
  handleWebhook,
  isTerminalCopy,
  moneyAlertFromEvent,
  parseSigHeader,
  READ_FAILED_ALERT_KIND,
  readEntitlement,
  readFailedAlert,
  readSubscription,
  signPayload,
  STRIPE_MIN_TRIAL_LEAD_SEC,
  SUBSCRIPTION_READ_TIMEOUT_MS,
  subscriptionIdFromEvent,
  verifyWebhook,
  writeEntitlement,
} from './stripe';
import { decodeJwtSub } from './mcp';
import { sqliteD1 } from './sqlite-d1.test-helper';

// The verifier stub for the existing behaviour tests: a decoded sub counts as verified, so these tests
// keep testing what they always tested. The PR A block at the bottom uses the REAL verifier with forged
// tokens to prove the wall, and never touches the network (a rejected alg needs no key fetch).
const trust = async (token: string) => decodeJwtSub(token);

const env = { STRIPE_PRICE_ID: 'price_123', APP_URL: 'https://doubledone.app' };

describe('checkoutSessionForm', () => {
  it('builds a subscription checkout carrying the user id on session and subscription', () => {
    const f = checkoutSessionForm(env, 'user-1', 'a@b.co');
    expect(f.get('mode')).toBe('subscription');
    expect(f.get('line_items[0][price]')).toBe('price_123');
    expect(f.get('client_reference_id')).toBe('user-1');
    expect(f.get('metadata[user_id]')).toBe('user-1');
    expect(f.get('subscription_data[metadata][user_id]')).toBe('user-1');
    expect(f.get('success_url')).toBe('https://doubledone.app/premium?status=success');
    expect(f.get('customer_email')).toBe('a@b.co');
  });

  it('uses the annual price when plan is annual and it is configured', () => {
    const annualEnv = { ...env, STRIPE_PRICE_ID_ANNUAL: 'price_year' };
    expect(checkoutSessionForm(annualEnv, 'user-1', undefined, 'annual').get('line_items[0][price]')).toBe('price_year');
    expect(checkoutSessionForm(annualEnv, 'user-1', undefined, 'monthly').get('line_items[0][price]')).toBe('price_123');
  });

  it('falls back to monthly when annual is asked for but not configured', () => {
    expect(checkoutSessionForm(env, 'user-1', undefined, 'annual').get('line_items[0][price]')).toBe('price_123');
  });
  it('carries a trial end only when one is given', () => {
    expect(checkoutSessionForm(env, 'user-1').has('subscription_data[trial_end]')).toBe(false);
    expect(checkoutSessionForm(env, 'user-1', undefined, 'monthly', 1_800_000_000).get('subscription_data[trial_end]')).toBe('1800000000');
  });
});

describe('webhook signature', () => {
  it('parses a Stripe-Signature header', () => {
    expect(parseSigHeader('t=123,v1=abc,v1=def')).toEqual({ t: '123', v1: ['abc', 'def'] });
  });

  it('verifies a correctly signed payload and rejects tampering / staleness', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const secret = 'test-signing-secret';
    const now = 1_750_000_000;
    const header = await signPayload(body, secret, now);

    expect(await verifyWebhook(body, header, secret, 300, now)).toBe(true);
    expect(await verifyWebhook(body + ' ', header, secret, 300, now)).toBe(false); // tampered body
    expect(await verifyWebhook(body, header, 'a-different-secret', 300, now)).toBe(false); // wrong secret
    expect(await verifyWebhook(body, header, secret, 300, now + 1000)).toBe(false); // outside tolerance
    expect(await verifyWebhook(body, 'garbage', secret, 300, now)).toBe(false);
  });
});

describe('entitlementFromEvent', () => {
  it('grants premium on a paid checkout session, capturing the customer id', () => {
    const ent = entitlementFromEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'u1', payment_status: 'paid', status: 'complete', customer: 'cus_1' } },
    });
    expect(ent).toEqual({ userId: 'u1', premium: true, status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe' });
  });

  it('does NOT grant premium on a complete-but-unpaid checkout session', () => {
    const ent = entitlementFromEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'u1', payment_status: 'unpaid', status: 'complete', customer: 'cus_1' } },
    });
    expect(ent).toMatchObject({ userId: 'u1', premium: false, status: 'incomplete' });
  });

  it('grants premium when no payment is required (a trial or 100%-off promo)', () => {
    const ent = entitlementFromEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'u1', payment_status: 'no_payment_required' } },
    });
    expect(ent).toMatchObject({ userId: 'u1', premium: true, status: 'active' });
  });

  it('tracks subscription status changes by metadata user id', () => {
    const active = entitlementFromEvent({
      type: 'customer.subscription.updated',
      data: { object: { metadata: { user_id: 'u2' }, status: 'active', current_period_end: 1_760_000_000 } },
    });
    expect(active).toMatchObject({ userId: 'u2', premium: true, currentPeriodEnd: 1_760_000_000 });

    const canceled = entitlementFromEvent({
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { user_id: 'u2' }, status: 'canceled' } },
    });
    expect(canceled).toMatchObject({ userId: 'u2', premium: false, status: 'canceled' });
  });

  it('reads cancel_at_period_end and the dahlia items period', () => {
    const ent = entitlementFromEvent({
      type: 'customer.subscription.updated',
      data: { object: { metadata: { user_id: 'u3' }, status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: 1_765_000_000 }] } } },
    });
    expect(ent).toMatchObject({ userId: 'u3', premium: true, cancelAtPeriodEnd: true, currentPeriodEnd: 1_765_000_000 });
  });

  it('treats a dahlia cancel_at timestamp as a scheduled cancel (boolean stays false)', () => {
    const ent = entitlementFromEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          metadata: { user_id: 'u4' },
          status: 'active',
          cancel_at_period_end: false,
          cancel_at: 1_784_533_872,
          items: { data: [{ current_period_end: 1_784_533_872 }] },
        },
      },
    });
    expect(ent).toMatchObject({ userId: 'u4', premium: true, cancelAtPeriodEnd: true, currentPeriodEnd: 1_784_533_872 });
  });

  it('ignores unrelated events and events with no user id', () => {
    expect(entitlementFromEvent({ type: 'invoice.paid', data: { object: {} } })).toBeNull();
    expect(entitlementFromEvent({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid' } } })).toBeNull();
  });
});

// Minimal in-memory D1 that honours the upsert's COALESCE(started_at) tenure rule.
function fakeDb(): D1LikeDatabase & { rows: Map<string, Record<string, unknown>> } {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    prepare(_sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
          const [userId, premium, status, cpe, cancelAtEnd, startedAt, customerId, source, updatedAt] = args as [
            string,
            number,
            string,
            number | null,
            number,
            string | null,
            string | null,
            string,
            string,
          ];
          const existing = rows.get(userId);
          rows.set(userId, {
            user_id: userId,
            premium,
            status,
            current_period_end: cpe ?? (existing?.current_period_end as number | null) ?? null, // COALESCE(new, existing)
            cancel_at_period_end: cancelAtEnd,
            started_at: (existing?.started_at as string | null) ?? startedAt, // COALESCE(existing, new)
            stripe_customer_id: customerId ?? (existing?.stripe_customer_id as string | null) ?? null,
            source,
            updated_at: updatedAt,
          });
        },
        async first<T>() {
          const r = rows.get(args[0] as string);
          return (r ?? null) as T | null;
        },
        async all<T>() {
          return { results: [...rows.values()] as T[] };
        },
      };
      return stmt;
    },
  };
}

describe('entitlement store', () => {
  it('writes premium then reads it back, preserving the tenure start and customer across a cancel', async () => {
    const db = fakeDb();
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe' }, '2026-06-20T00:00:00Z');
    let view = await readEntitlement(db, 'u1');
    expect(view).toEqual({ premium: true, status: 'active', since: '2026-06-20T00:00:00Z', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe' });

    // a cancel-at-period-end keeps premium active but flags the pending cancel, and must
    // NOT reset the tenure clock or lose the customer (a null customer must not clobber it)
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: true, customerId: null, source: 'stripe' }, '2026-09-01T00:00:00Z');
    view = await readEntitlement(db, 'u1');
    expect(view.cancelAtPeriodEnd).toBe(true);
    expect(view.since).toBe('2026-06-20T00:00:00Z');
    expect(view.customerId).toBe('cus_1'); // preserved by COALESCE
  });

  it('reports not-premium for an unknown user', async () => {
    expect(await readEntitlement(fakeDb(), 'nobody')).toEqual({ premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null, source: null });
  });
});

// The fetch-doing functions: we mock global fetch and assert the request shape and
// the parsing, the same contract-test approach the AI request builders use. No live
// Stripe call. (Secret key here is a dummy string, never a real sk_ token.)
const SK = 'test-secret-key';

describe('Stripe API request builders', () => {
  const cfg = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', APP_URL: 'https://doubledone.app' };
  afterEach(() => vi.unstubAllGlobals());

  it('createCheckoutSession returns null when Stripe is not configured', async () => {
    expect(await createCheckoutSession({}, 'u1')).toBeNull();
  });

  it('createCheckoutSession posts to Stripe and returns the hosted url', async () => {
    let seen: { url: string; init: { headers: Record<string, string> } } | null = null;
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string> }) => {
      seen = { url, init };
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/sess_1' }), { status: 200 });
    });
    const url = await createCheckoutSession(cfg, 'u1', 'a@b.co');
    expect(url).toBe('https://checkout.stripe.com/c/sess_1');
    expect(seen!.url).toContain('/checkout/sessions');
    expect(seen!.init.headers.authorization).toBe(`Bearer ${SK}`);
  });

  it('createCheckoutSession returns null on a non-ok Stripe response', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 400 }));
    expect(await createCheckoutSession(cfg, 'u1')).toBeNull();
  });

  it('createPortalSession returns null without config, and the portal url on success', async () => {
    expect(await createPortalSession({}, 'cus_1', 'https://x')).toBeNull();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/1' }), { status: 200 }));
    expect(await createPortalSession(cfg, 'cus_1', 'https://doubledone.app/premium')).toBe('https://billing.stripe.com/p/1');
  });
});

describe('Stripe HTTP handlers', () => {
  const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
  const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=/g, '')}.s`;
  const req = (path: string, auth?: string, body?: unknown) =>
    new Request(`https://w/${path}`, {
      method: 'POST',
      headers: auth ? { Authorization: `Bearer ${auth}` } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('handleCheckout 401s without a token, 503s when not configured', async () => {
    expect((await handleCheckout(req('checkout'), {}, cors, trust)).status).toBe(401);
    expect((await handleCheckout(req('checkout', tokenFor('u1'), {}), {}, cors, trust)).status).toBe(503);
  });

  it('handlePortal 401s without a token, 404s with no stored subscription', async () => {
    expect((await handlePortal(req('portal'), {}, cors, trust)).status).toBe(401);
    const env = { STRIPE_SECRET_KEY: SK, DB: fakeDb() };
    expect((await handlePortal(req('portal', tokenFor('u1')), env, cors, trust)).status).toBe(404);
  });

  it('handleEntitlement 401s without a token and returns a view when authed', async () => {
    expect((await handleEntitlement(new Request('https://w/entitlement'), {}, cors, trust)).status).toBe(401);
    const res = await handleEntitlement(
      new Request('https://w/entitlement', { headers: { Authorization: `Bearer ${tokenFor('u1')}` } }),
      { DB: fakeDb() },
      cors,
      trust,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ premium: false });
  });

  it('handleEntitlement returns a comp premium view for an allowlisted email (no DB needed)', async () => {
    const compToken = `h.${btoa(JSON.stringify({ sub: 'u1', email: 'owner@example.test' })).replace(/=/g, '')}.s`;
    const res = await handleEntitlement(
      new Request('https://w/entitlement', { headers: { Authorization: `Bearer ${compToken}` } }),
      { COMP_EMAILS: 'owner@example.test' },
      cors,
      trust,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ premium: true, status: 'comp' });
  });

  it('handleWebhook 503s when not configured', async () => {
    const res = await handleWebhook(req('stripe-webhook', undefined, {}), {}, '2026-06-20T00:00:00Z');
    expect(res.status).toBe(503);
  });
});

describe('Stripe handler flows (mocked fetch / signed webhook)', () => {
  const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
  const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=/g, '')}.s`;
  const WH = 'wh-test-secret';
  afterEach(() => vi.unstubAllGlobals());

  it('handleCheckout returns the url on success, 502 when Stripe fails', async () => {
    const env = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123' };
    const checkoutReq = (body: unknown) =>
      new Request('https://w/checkout', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('u1')}` }, body: JSON.stringify(body) });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/x' }), { status: 200 }));
    const ok = await handleCheckout(checkoutReq({ email: 'a@b.co' }), env, cors, trust);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ url: 'https://checkout.stripe.com/c/x' });

    vi.stubGlobal('fetch', async () => new Response('no', { status: 400 }));
    expect((await handleCheckout(checkoutReq({}), env, cors, trust)).status).toBe(502);
  });

  it('handleCheckout refuses an already-subscribed user (409) but lets a trial user convert', async () => {
    // An active PAID subscriber (premium + a Stripe customer) must not open a second Checkout.
    const paidEnv = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: fakeDb() };
    await writeEntitlement(paidEnv.DB, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe' }, '2026-06-20T00:00:00Z');
    const req = () => new Request('https://w/checkout', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('u1')}` }, body: '{}' });
    expect((await handleCheckout(req(), paidEnv, cors, trust)).status).toBe(409);

    // A trial user (premium, but NO Stripe customer yet) is intentionally allowed to convert: the guard falls
    // through to Stripe, so "Go Premium to keep it" still works.
    const trialEnv = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: fakeDb() };
    await writeEntitlement(trialEnv.DB, { userId: 'u1', premium: true, status: 'trial', currentPeriodEnd: null, cancelAtPeriodEnd: true, customerId: null, source: 'stripe' }, '2026-06-20T00:00:00Z');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/y' }), { status: 200 }));
    expect((await handleCheckout(req(), trialEnv, cors, trust)).status).toBe(200);
  });

  it('handleCheckout refuses a DUNNING subscriber (the past_due double-subscription bug)', async () => {
    // past_due: premium reads false (access lapsed) but the subscription is ALIVE at Stripe and
    // retrying the card. Selling this user a second subscription would double-charge them and the
    // webhook upsert would overwrite stripe_customer_id, orphaning the first. The old guard keyed
    // on premium && customerId, so this exact state slipped through. 409 with the DISTINCT body,
    // so the client can say "fix the card" instead of the wrong "you're already on Premium".
    const req = () => new Request('https://w/checkout', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('u1')}` }, body: '{}' });
    for (const status of ['past_due', 'unpaid']) {
      const env = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: fakeDb() };
      await writeEntitlement(env.DB, { userId: 'u1', premium: false, status, currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe' }, '2026-06-20T00:00:00Z');
      const res = await handleCheckout(req(), env, cors, trust);
      expect(res.status, status).toBe(409);
      expect(await res.json(), status).toEqual({ error: 'billing_issue' });
    }
  });

  it('handleCheckout still lets a LAPSED subscriber re-subscribe (customerId alone must never block)', async () => {
    // status canceled: the old subscription no longer exists at Stripe, but the customer id is
    // kept for history (the COALESCE in writeEntitlement). A fresh Checkout is the CORRECT path
    // back to paying; the portal would have nothing to restart. Same for an abandoned checkout
    // (incomplete), which self-expires at Stripe and must not lock the user out of ever buying.
    // These two are why the guard keys on premium-or-dunning, not on customerId alone.
    const req = () => new Request('https://w/checkout', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('u1')}` }, body: '{}' });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/z' }), { status: 200 }));
    for (const status of ['canceled', 'incomplete', 'incomplete_expired']) {
      const env = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: fakeDb() };
      await writeEntitlement(env.DB, { userId: 'u1', premium: false, status, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: 'cus_old', source: 'stripe' }, '2026-06-20T00:00:00Z');
      expect((await handleCheckout(req(), env, cors, trust)).status, status).toBe(200);
    }
  });

  it('handleEntitlement returns a default view when DB is unbound', async () => {
    const res = await handleEntitlement(
      new Request('https://w/entitlement', { headers: { Authorization: `Bearer ${tokenFor('u1')}` } }),
      {},
      cors,
      trust,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ premium: false });
  });

  it('handleWebhook verifies a signed event and writes the entitlement', async () => {
    const db = fakeDb();
    const now = 1_750_000_000;
    const event = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'u9', payment_status: 'paid', status: 'complete', customer: 'cus_9' } },
    });
    const sig = await signPayload(event, WH, now);
    const res = await handleWebhook(
      new Request('https://w/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': sig }, body: event }),
      { STRIPE_WEBHOOK_SECRET: WH, DB: db },
      '2026-06-20T00:00:00Z',
      now,
    );
    expect(res.status).toBe(200);
    expect((await readEntitlement(db, 'u9')).premium).toBe(true);
  });

  it('handleWebhook dedups a redelivered event id (writes the entitlement once)', async () => {
    // A SQL-aware fake: entitlements upsert plus processed_events dedup, so a duplicate is observable.
    const ents = new Map<string, unknown>();
    const seen = new Set<string>();
    let entWrites = 0;
    const db = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const stmt = {
          bind(...a: unknown[]) {
            args = a;
            return stmt;
          },
          async first<T>() {
            if (sql.includes('processed_events')) return (seen.has(args[0] as string) ? { ok: 1 } : null) as T | null;
            return (ents.get(args[0] as string) ?? null) as T | null;
          },
          async run() {
            if (sql.includes('processed_events')) seen.add(args[0] as string);
            else {
              entWrites += 1;
              ents.set(args[0] as string, { premium: args[1] });
            }
          },
          async all<T>() {
            return { results: [] as T[] };
          },
        };
        return stmt;
      },
    } as unknown as D1LikeDatabase;
    const now = 1_750_000_000;
    const event = JSON.stringify({ id: 'evt_dup1', type: 'checkout.session.completed', data: { object: { client_reference_id: 'u1', payment_status: 'paid' } } });
    const sig = await signPayload(event, WH, now);
    const mk = () => new Request('https://w/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': sig }, body: event });
    const wenv = { STRIPE_WEBHOOK_SECRET: WH, DB: db };
    const first = await handleWebhook(mk(), wenv, 'now', now);
    const second = await handleWebhook(mk(), wenv, 'now', now);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });
    expect(entWrites).toBe(1); // the redelivery did not write the entitlement a second time
  });

  it('handleWebhook rejects a bad signature and unparseable json', async () => {
    const env = { STRIPE_WEBHOOK_SECRET: WH, DB: fakeDb() };
    const badSig = await handleWebhook(
      new Request('https://w/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=bad' }, body: '{}' }),
      env,
      'now',
      1,
    );
    expect(badSig.status).toBe(400);

    const now = 1_750_000_000;
    const sig = await signPayload('not json', WH, now);
    const badJson = await handleWebhook(
      new Request('https://w/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': sig }, body: 'not json' }),
      env,
      'now',
      now,
    );
    expect(badJson.status).toBe(400);
  });

  it('handlePortal 503s without config and returns the billing url when subscribed', async () => {
    const portalReq = () => new Request('https://w/portal', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('u1')}` } });
    expect((await handlePortal(portalReq(), {}, cors, trust)).status).toBe(503);

    const db = fakeDb();
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 1, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe' }, '2026-06-20T00:00:00Z');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/2' }), { status: 200 }));
    const res = await handlePortal(portalReq(), { STRIPE_SECRET_KEY: SK, DB: db }, cors, trust);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/p/2' });
  });
});

describe('moneyAlertFromEvent', () => {
  it('alerts on a dispute, carrying the amount and the event id', () => {
    const a = moneyAlertFromEvent({ id: 'evt_1', type: 'charge.dispute.created', data: { object: { amount: 999, currency: 'aud' } } });
    expect(a?.kind).toBe('stripe-dispute');
    expect(a?.detail).toContain('9.99 AUD');
    expect(a?.detail).toContain('evt_1');
  });
  it('alerts on a refund (reads amount_refunded, not the original charge)', () => {
    const a = moneyAlertFromEvent({ id: 'evt_2', type: 'charge.refunded', data: { object: { amount: 2000, amount_refunded: 500, currency: 'aud' } } });
    expect(a?.kind).toBe('stripe-refund');
    expect(a?.detail).toContain('5.00 AUD');
  });
  it('alerts on a failed payment (reads amount_due)', () => {
    expect(moneyAlertFromEvent({ id: 'evt_3', type: 'invoice.payment_failed', data: { object: { amount_due: 700, currency: 'usd' } } })?.kind).toBe('stripe-payment-failed');
  });
  it('ignores entitlement and unrelated events', () => {
    expect(moneyAlertFromEvent({ type: 'checkout.session.completed', data: { object: {} } })).toBeNull();
    expect(moneyAlertFromEvent({ type: 'customer.subscription.updated', data: { object: {} } })).toBeNull();
    expect(moneyAlertFromEvent({ type: 'invoice.paid', data: { object: {} } })).toBeNull();
  });
  it('never leaks card / name / email (counts and the event id only)', () => {
    const a = moneyAlertFromEvent({
      id: 'evt_x',
      type: 'charge.dispute.created',
      data: { object: { amount: 100, currency: 'aud', billing_details: { email: 'jo@example.com', name: 'Jo Bloggs' } } },
    });
    expect(a?.detail).not.toContain('jo@example.com');
    expect(a?.detail).not.toContain('Jo Bloggs');
  });
});

describe('PR A: the money routes verify the bearer', () => {
  afterEach(() => vi.unstubAllGlobals());
  const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '');
  // A hand-made token carrying somebody else's uuid: the exact shape the 2026-09-25 audit walked in with.
  const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'victim-1' })}.`;
  const post = (path: string) =>
    new Request(`https://w/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${forged}` }, body: '{}' });

  it('a forged alg:none token never reaches Stripe or D1 on /portal, /checkout or /entitlement (real verifier)', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const db = { prepare: vi.fn() } as never;
    const env = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_1', DB: db, SUPABASE_URL: 'https://proj.supabase.co' };
    expect((await handlePortal(post('portal'), env, cors)).status).toBe(401);
    expect((await handleCheckout(post('checkout'), env, cors)).status).toBe(401);
    const ent = await handleEntitlement(new Request('https://w/entitlement', { headers: { Authorization: `Bearer ${forged}` } }), env, cors);
    expect(ent.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    expect((db as { prepare: ReturnType<typeof vi.fn> }).prepare).not.toHaveBeenCalled();
  });

  it('a verified token still reaches the portal (the wall is the signature, not the route)', async () => {
    const env = { STRIPE_SECRET_KEY: SK, DB: fakeDb(), SUPABASE_URL: 'https://proj.supabase.co' };
    // The stub verifier answers for the genuine user; no customer on file -> the calm 404, past the wall.
    const res = await handlePortal(post('portal'), env, cors, async () => 'u1');
    expect(res.status).toBe(404);
  });
});

// ---- Path A (2026-09-30): the checkout guard knows every store; /entitlement says when it cannot check.
describe('Path A: no second subscription through Stripe', () => {
  const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
  const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=/g, '')}.s`;
  const req = () => new Request('https://w/checkout', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('u1')}` }, body: '{}' });
  afterEach(() => vi.unstubAllGlobals());

  it('refuses a live Apple or Google subscriber (they have no Stripe customer at all)', async () => {
    for (const source of ['apple', 'google'] as const) {
      const env = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: fakeDb() };
      await writeEntitlement(env.DB, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: null, source }, '2026-09-30T00:00:00Z');
      const res = await handleCheckout(req(), env, cors, trust);
      expect(res.status, source).toBe(409);
      expect(await res.json(), source).toEqual({ error: 'already_subscribed' });
    }
  });

  it('refuses a payment failing at any store: past_due or unpaid', async () => {
    // A store grace period keeps premium ON; a failing Stripe card has it off.
    const cases: ['apple' | 'google' | 'stripe', string, boolean][] = [['apple', 'past_due', true], ['google', 'past_due', true], ['stripe', 'past_due', false], ['stripe', 'unpaid', false]];
    for (const [source, status, premium] of cases) {
      const env = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: fakeDb() };
      await writeEntitlement(env.DB, { userId: 'u1', premium, status, currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: source === 'stripe' ? 'cus_1' : null, source }, '2026-09-30T00:00:00Z');
      const res = await handleCheckout(req(), env, cors, trust);
      expect(res.status, `${source} ${status}`).toBe(409);
      expect(await res.json(), `${source} ${status}`).toEqual({ error: 'billing_issue' });
    }
  });

  it('still lets a LAPSED store subscriber buy on the web (an ended subscription blocks nothing)', async () => {
    const env = { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: fakeDb() };
    await writeEntitlement(env.DB, { userId: 'u1', premium: false, status: 'expired', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null, source: 'google' }, '2026-09-30T00:00:00Z');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/z' }), { status: 200 }));
    expect((await handleCheckout(req(), env, cors, trust)).status).toBe(200);
  });
});

describe('Path A: /entitlement says when it could not check', () => {
  const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
  const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=/g, '')}.s`;

  it('answers 503 on a D1 throw instead of a FREE that the buy guard would read as permission', async () => {
    const throwing = { prepare: () => ({ bind() { return this; }, run: async () => undefined, first: async () => { throw new Error('d1 down'); }, all: async () => ({ results: [] }) }) } as unknown as D1LikeDatabase;
    const res = await handleEntitlement(new Request('https://w/entitlement', { headers: { Authorization: `Bearer ${tokenFor('u1')}` } }), { DB: throwing }, cors, trust);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('reads a google row back through the route as google', async () => {
    const db = fakeDb();
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: null, source: 'google' }, '2026-09-30T00:00:00Z');
    const res = await handleEntitlement(new Request('https://w/entitlement', { headers: { Authorization: `Bearer ${tokenFor('u1')}` } }), { DB: db }, cors, trust);
    expect(await res.json()).toMatchObject({ premium: true, source: 'google' });
  });
});

describe('Path A review: the checkout guard fails closed', () => {
  const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
  const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=/g, '')}.s`;
  afterEach(() => vi.unstubAllGlobals());

  it('answers 503 and opens no checkout when the entitlement cannot be read', async () => {
    const opened = vi.fn(async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/x' }), { status: 200 }));
    vi.stubGlobal('fetch', opened);
    const throwing = { prepare: () => ({ bind() { return this; }, run: async () => undefined, first: async () => { throw new Error('d1 down'); }, all: async () => ({ results: [] }) }) } as unknown as D1LikeDatabase;
    const req = new Request('https://w/checkout', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('u1')}` }, body: '{}' });
    const res = await handleCheckout(req, { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: throwing }, cors, trust);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(opened).not.toHaveBeenCalled();
  });
});

// 2026-11-01: inside a card-free month, "Go Premium to keep it" charged the day it was tapped and the rest of the
// month was lost, which its own spoken label ("after your free month") and the positioning's "paying never springs a
// trap" both deny. The subscription now starts as a Stripe trial that ends when the free month does.
describe('the card-free month: keeping Premium early waits for the month to end', () => {
  const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
  const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=/g, '')}.s`;
  const NOW = 1_800_000_000;
  const DAY = 86400;
  afterEach(() => vi.unstubAllGlobals());

  async function checkoutWith(db: D1LikeDatabase) {
    const sent: URLSearchParams[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      sent.push(new URLSearchParams(String(init?.body ?? '')));
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/t' }), { status: 200 });
    });
    const req = new Request('https://w/checkout', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('u1')}` }, body: '{}' });
    const res = await handleCheckout(req, { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: db }, cors, trust, NOW);
    return { res, sent };
  }

  async function withFreeMonthEnding(expiresAt: number) {
    const db = await sqliteD1();
    db.raw.prepare('INSERT INTO trials (user_id, started_at, expires_at) VALUES (?, ?, ?)').run('u1', expiresAt - 30 * DAY, expiresAt);
    return db;
  }

  it('mid-month, the first charge waits for the day the free month ends', async () => {
    const { res, sent } = await checkoutWith(await withFreeMonthEnding(NOW + 20 * DAY));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].get('subscription_data[trial_end]')).toBe(String(NOW + 20 * DAY));
  });

  it("in the month's last two days, Stripe's 48-hour floor wins: the charge comes a little later, never sooner", async () => {
    const { res, sent } = await checkoutWith(await withFreeMonthEnding(NOW + DAY));
    expect(res.status).toBe(200);
    expect(sent[0].get('subscription_data[trial_end]')).toBe(String(NOW + STRIPE_MIN_TRIAL_LEAD_SEC));
  });

  it('with no free month, or one that has ended, checkout charges as it always did', async () => {
    const none = await checkoutWith(await sqliteD1());
    expect(none.res.status).toBe(200);
    expect(none.sent[0].has('subscription_data[trial_end]')).toBe(false);
    const ended = await checkoutWith(await withFreeMonthEnding(NOW - DAY));
    expect(ended.sent[0].has('subscription_data[trial_end]')).toBe(false);
  });

  it('a free month that cannot be read refuses (503) instead of charging at once', async () => {
    const db = await withFreeMonthEnding(NOW + 20 * DAY);
    const broken = {
      prepare: (sql: string) => {
        if (sql.includes('FROM trials')) throw new Error('d1 down');
        return db.prepare(sql);
      },
    } as unknown as D1LikeDatabase;
    const { res, sent } = await checkoutWith(broken);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(sent).toHaveLength(0);
  });
});

// 2026-11-01 (sweep #1): Stripe delivers out of order and retries a failed delivery for days, so an event's own copy
// of a subscription can be days stale. The webhook now writes the subscription as Stripe holds it NOW, read by id.
// Real SQLite behind it (the guards are SQL); a stubbed Stripe answers GET /v1/subscriptions/{id}.
type RealDb = Awaited<ReturnType<typeof sqliteD1>>;

describe('the webhook writes the LIVE subscription, not the event copy', () => {
  const WH = 'wh-test-secret';
  const NOW = 1_800_000_000;
  const UID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
  const PERIOD_END = NOW + 30 * 86400;
  const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
  const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=/g, '')}.s`;
  afterEach(() => vi.unstubAllGlobals());

  type LiveSub = { status: string; customer?: string; id?: string };
  /** A Stripe holding `subs` as they stand NOW (mutable, so a test can move one on). It answers the subscription
   *  read and records every call: 'fail' answers 500, 'throw' drops the connection, and { http, code } answers that
   *  status with Stripe's error shape. A Checkout it is asked to open always opens. */
  function stripeNow(subs: Record<string, LiveSub | 'fail' | 'throw' | { http: number; code?: string }>) {
    const calls: { url: string; method: string; auth: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
      calls.push({ url, method: init?.method ?? 'GET', auth: init?.headers?.authorization ?? null });
      if (url === 'https://api.stripe.com/v1/checkout/sessions') return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/again' }), { status: 200 });
      const id = decodeURIComponent(/^https:\/\/api\.stripe\.com\/v1\/subscriptions\/([^/?]+)$/.exec(url)?.[1] ?? '');
      const sub = subs[id];
      if (sub === 'throw') throw new TypeError('fetch failed');
      if (sub && typeof sub === 'object' && 'http' in sub) {
        // Stripe's own error shape, with a message that quotes part of the key, as Stripe's 401 does
        return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: sub.code, message: 'Invalid API Key provided: ****wxyz' } }), { status: sub.http });
      }
      if (!sub || sub === 'fail') return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
      const body = {
        id,
        object: 'subscription',
        customer: 'cus_1',
        metadata: { user_id: UID },
        cancel_at_period_end: false,
        cancel_at: null,
        items: { object: 'list', data: [{ current_period_end: PERIOD_END }] },
        ...sub,
      };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    return calls;
  }

  /** A customer.subscription.* event carrying its OWN copy of the subscription, which may be stale. */
  const subEvent = (eventId: string, type: string, subId: string, status: string, customer = 'cus_1') => ({
    id: eventId,
    type,
    data: { object: { id: subId, object: 'subscription', status, customer, metadata: { user_id: UID } } },
  });

  /** Deliver a signed event as Stripe would, at `at` (unix seconds, the signature's time and the Worker's clock). */
  async function deliver(db: D1LikeDatabase, event: unknown, extra: Partial<Parameters<typeof handleWebhook>[1]> = {}, at = NOW) {
    const body = JSON.stringify(event);
    const sig = await signPayload(body, WH, at);
    const req = new Request('https://w/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': sig }, body });
    return handleWebhook(req, { STRIPE_WEBHOOK_SECRET: WH, STRIPE_SECRET_KEY: SK, DB: db, ...extra }, '2026-11-01T00:00:00Z', at);
  }
  const processed = (db: RealDb, eventId: string) => !!db.raw.prepare('SELECT 1 FROM processed_events WHERE event_id = ?').get(eventId);
  const stripeSubOf = (db: RealDb) =>
    (db.raw.prepare('SELECT stripe_sub FROM entitlements WHERE user_id = ?').get(UID) as { stripe_sub: string | null } | undefined)?.stripe_sub ?? null;
  const checkout = (db: D1LikeDatabase) =>
    handleCheckout(
      new Request('https://w/checkout', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor(UID)}` }, body: '{}' }),
      { STRIPE_SECRET_KEY: SK, STRIPE_PRICE_ID: 'price_123', DB: db },
      cors,
      trust,
      NOW,
    );

  it('a retried past_due that lands after the card was fixed leaves Premium on', async () => {
    const db = await sqliteD1();
    const calls = stripeNow({ sub_A: { status: 'active' } });
    const fixed = await deliver(db, subEvent('evt_active', 'customer.subscription.updated', 'sub_A', 'active'));
    expect(await fixed.json()).toEqual({ received: true, live: 'active' });
    // Stripe's retry of the earlier failure arrives later. Its own copy still says past_due; Stripe says active.
    const stale = subEvent('evt_past_due', 'customer.subscription.updated', 'sub_A', 'past_due');
    expect(entitlementFromEvent(stale)).toMatchObject({ premium: false, status: 'past_due' }); // what used to be written
    const res = await deliver(db, stale);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, live: 'active' });
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', customerId: 'cus_1', currentPeriodEnd: PERIOD_END });
    expect(processed(db, 'evt_past_due')).toBe(true);
    // Both reads were the live subscription by id, authed with the secret key.
    const read = { url: 'https://api.stripe.com/v1/subscriptions/sub_A', method: 'GET', auth: `Bearer ${SK}` };
    expect(calls).toEqual([read, read]);
  });

  it('a card that really is failing still says so, and the checkout then refuses a second subscription', async () => {
    const db = await sqliteD1();
    stripeNow({ sub_A: { status: 'past_due' } });
    // even an event whose own copy says active is written as Stripe holds it now
    const res = await deliver(db, subEvent('evt_1', 'customer.subscription.updated', 'sub_A', 'active'));
    expect(await res.json()).toEqual({ received: true, live: 'past_due' });
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'past_due', customerId: 'cus_1' });
    const refused = await checkout(db);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'billing_issue' });
  });

  it("an old subscription's incomplete_expired after a new paid one writes nothing", async () => {
    const db = await sqliteD1();
    const subs: Record<string, LiveSub> = { sub_new: { status: 'active' }, sub_old: { status: 'incomplete_expired' } };
    const calls = stripeNow(subs);
    await deliver(db, subEvent('evt_new', 'customer.subscription.created', 'sub_new', 'active'));
    expect(stripeSubOf(db)).toBe('sub_new');
    const res = await deliver(db, subEvent('evt_old', 'customer.subscription.updated', 'sub_old', 'incomplete_expired'));
    expect(res.status).toBe(200);
    // An ending is written as the event carries it (no read of sub_old), and the refusal checks the recorded
    // sub_new against Stripe once: it is alive, so the refusal stands.
    expect(await res.json()).toEqual({ received: true, final: 'incomplete_expired', kept: true, by: 'other-subscription' });
    expect(calls.map((c) => c.url)).toEqual(['https://api.stripe.com/v1/subscriptions/sub_new', 'https://api.stripe.com/v1/subscriptions/sub_new']);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active' });
    expect(stripeSubOf(db)).toBe('sub_new');
    expect(processed(db, 'evt_old')).toBe(true); // handled, so Stripe does not keep retrying it
    // The new subscription's own news still lands: the guard is about WHICH subscription, not a freeze.
    subs.sub_new = { status: 'past_due' };
    const own = await deliver(db, subEvent('evt_new_2', 'customer.subscription.updated', 'sub_new', 'past_due'));
    expect(await own.json()).toEqual({ received: true, live: 'past_due' });
    expect((await readEntitlement(db, UID)).status).toBe('past_due');
  });

  it('a read that fails answers 500, writes and marks nothing, and the retry applies', async () => {
    // A change that is not an ending (an ending never waits on the read: see the block below).
    for (const failure of ['fail', 'throw', 'http', 'wrong-object', 'no-key'] as const) {
      const db = await sqliteD1();
      await writeEntitlement(db, { userId: UID, premium: true, status: 'active', currentPeriodEnd: 1, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe', stripeSub: 'sub_A' }, 'before');
      stripeNow({
        sub_A: failure === 'fail' || failure === 'throw' ? failure : failure === 'http' ? { http: 401 } : { status: 'unpaid', id: failure === 'wrong-object' ? 'sub_B' : 'sub_A' },
      });
      const event = subEvent('evt_x', 'customer.subscription.updated', 'sub_A', 'past_due');
      const res = await deliver(db, event, failure === 'no-key' ? { STRIPE_SECRET_KEY: undefined } : {});
      expect(res.status, failure).toBe(500);
      expect(await res.text(), failure).toBe('subscription read failed');
      expect(await readEntitlement(db, UID), failure).toMatchObject({ premium: true, status: 'active' });
      expect(processed(db, 'evt_x'), failure).toBe(false);
      // Stripe retries; this time it answers, and the live state lands (not the event's past_due).
      vi.unstubAllGlobals();
      stripeNow({ sub_A: { status: 'unpaid' } });
      const retry = await deliver(db, event);
      expect(retry.status, failure).toBe(200);
      expect(await retry.json(), failure).toEqual({ received: true, live: 'unpaid' });
      expect(await readEntitlement(db, UID), failure).toMatchObject({ premium: false, status: 'unpaid' });
      vi.unstubAllGlobals();
    }
  });

  it('a completed checkout writes its subscription as Stripe holds it, not the session copy', async () => {
    const db = await sqliteD1();
    const calls = stripeNow({ sub_C: { status: 'active', customer: 'cus_C' } });
    // The session's own copy says unpaid: a delivery held back from before an async payment settled.
    const session = {
      id: 'evt_cs',
      type: 'checkout.session.completed',
      data: { object: { object: 'checkout.session', client_reference_id: UID, subscription: 'sub_C', customer: 'cus_C', payment_status: 'unpaid', status: 'complete' } },
    };
    expect(await (await deliver(db, session)).json()).toEqual({ received: true, live: 'active' });
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', customerId: 'cus_C', currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, source: 'stripe' });
    expect(stripeSubOf(db)).toBe('sub_C');
    expect(calls.map((c) => c.url)).toEqual(['https://api.stripe.com/v1/subscriptions/sub_C']);
  });

  it("the card-free month's checkout (80d8823) lands as a Stripe trial, and the checkout guard then counts it", async () => {
    const db = await sqliteD1();
    stripeNow({ sub_T: { status: 'trialing' } });
    const session = { id: 'evt_cs_t', type: 'checkout.session.completed', data: { object: { client_reference_id: UID, subscription: 'sub_T', customer: 'cus_1', payment_status: 'no_payment_required' } } };
    expect(await (await deliver(db, session)).json()).toEqual({ received: true, live: 'trialing' });
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'trialing', customerId: 'cus_1' });
    expect(await (await checkout(db)).json()).toEqual({ error: 'already_subscribed' });
  });

  it('a checkout delivered after its subscription ended writes the ending, and one that names no subscription reads nothing', async () => {
    const db = await sqliteD1();
    const calls = stripeNow({ sub_C: { status: 'canceled' } });
    await deliver(db, { id: 'evt_late', type: 'checkout.session.completed', data: { object: { client_reference_id: UID, subscription: 'sub_C', payment_status: 'paid' } } });
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'canceled' });
    // Never one of ours (every Checkout we open is mode=subscription): its own copy is written, as before.
    const db2 = await sqliteD1();
    const res = await deliver(db2, { id: 'evt_pay', type: 'checkout.session.completed', data: { object: { client_reference_id: UID, payment_status: 'paid', customer: 'cus_9' } } });
    expect(await res.json()).toEqual({ received: true });
    expect(await readEntitlement(db2, UID)).toMatchObject({ premium: true, status: 'active', customerId: 'cus_9' });
    expect(calls).toHaveLength(1);
  });

  it('a live Apple or Google row is never switched off by a Stripe ending (the cross-store guard)', async () => {
    for (const source of ['apple', 'google'] as const) {
      const db = await sqliteD1();
      await writeEntitlement(db, { userId: UID, premium: true, status: 'active', currentPeriodEnd: NOW + 86400, cancelAtPeriodEnd: false, customerId: null, source }, 'before');
      const calls = stripeNow({ sub_A: { status: 'canceled' } });
      const res = await deliver(db, subEvent('evt_end', 'customer.subscription.deleted', 'sub_A', 'canceled'));
      expect(await res.json(), source).toEqual({ received: true, final: 'canceled', kept: true, by: 'other-store' });
      expect(await readEntitlement(db, UID), source).toMatchObject({ premium: true, status: 'active', source });
      expect(calls, source).toHaveLength(0); // an ending needs no read, and another store's refusal is not Stripe's to check
      vi.unstubAllGlobals();
    }
  });

  it('a duplicate is skipped before any Stripe read, and an event that is not ours reads nothing', async () => {
    const db = await sqliteD1();
    const calls = stripeNow({ sub_A: { status: 'active' } });
    const event = subEvent('evt_once', 'customer.subscription.updated', 'sub_A', 'active');
    await deliver(db, event);
    expect(await (await deliver(db, event)).json()).toEqual({ received: true, duplicate: true });
    const foreign = { id: 'evt_foreign', type: 'customer.subscription.updated', data: { object: { id: 'sub_Z', status: 'active', metadata: {} } } };
    expect(await (await deliver(db, foreign)).json()).toEqual({ received: true });
    expect(calls).toHaveLength(1);
  });

  // ---- The review of sweep #1 (2026-11-01): the live read made Stripe's API a dependency of every write, and the
  // which-subscription guard trusted a recorded id that can go stale. What never waits on the read, and the heal.

  /** The owner's inbox, for the alert tests. */
  function inbox() {
    const sent: { raw: string }[] = [];
    const send = async (m: unknown) => {
      sent.push(m as { raw: string });
    };
    return { sent, env: { SEND_EMAIL: { send }, FEEDBACK_TO: 'owner@example.test' } };
  }
  const subjectOf = (m: { raw: string }) => /^Subject: (.*)$/m.exec(m.raw)?.[1] ?? '';
  const bodyOf = (m: { raw: string }) => {
    const b64 = (m.raw.split('\r\n\r\n')[1] ?? '').replace(/\r\n/g, '');
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  };
  const alertsSent = (db: RealDb) => (db.raw.prepare('SELECT kind FROM alerts_sent ORDER BY created_at').all() as { kind: string }[]).map((a) => a.kind);
  const SUB = (id: string) => `https://api.stripe.com/v1/subscriptions/${id}`;

  /** The finding's row: sub_1 (cus_1) was recorded and then ended, and a Worker from before 2026-11-01 (a rollback,
   *  a deploy from a branch without the column, a D1 restore) then wrote the re-bought subscription on `customer`,
   *  the whole row but never stripe_sub, so sub_1 is still recorded. */
  async function staleRow(customer: string): Promise<RealDb> {
    const db = await sqliteD1();
    await writeEntitlement(db, { userId: UID, premium: false, status: 'canceled', currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe', stripeSub: 'sub_1' }, 'before');
    db.raw
      .prepare("UPDATE entitlements SET premium = 1, status = 'active', cancel_at_period_end = 0, current_period_end = ?, stripe_customer_id = ?, source = 'stripe' WHERE user_id = ?")
      .run(PERIOD_END, customer, UID);
    expect(stripeSubOf(db)).toBe('sub_1');
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', customerId: customer });
    return db;
  }

  describe('an ending never waits on the read', () => {
    it('a deletion lands as the event carries it, with no key, no answer, or a 401 from Stripe', async () => {
      for (const outage of ['no-key', 'throw', 'http-401'] as const) {
        const db = await sqliteD1();
        await writeEntitlement(db, { userId: UID, premium: true, status: 'active', currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe', stripeSub: 'sub_A' }, 'before');
        const calls = stripeNow({ sub_A: outage === 'throw' ? 'throw' : { http: 401 } });
        const res = await deliver(db, subEvent('evt_end', 'customer.subscription.deleted', 'sub_A', 'canceled'), outage === 'no-key' ? { STRIPE_SECRET_KEY: undefined } : {});
        expect(res.status, outage).toBe(200);
        expect(await res.json(), outage).toEqual({ received: true, final: 'canceled' });
        expect(await readEntitlement(db, UID), outage).toMatchObject({ premium: false, status: 'canceled' });
        expect(processed(db, 'evt_end'), outage).toBe(true);
        expect(calls, outage).toHaveLength(0);
        vi.unstubAllGlobals();
      }
    });

    it('an abandoned checkout that expires lands the same way', async () => {
      const db = await sqliteD1();
      await writeEntitlement(db, { userId: UID, premium: false, status: 'incomplete', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe', stripeSub: 'sub_A' }, 'before');
      const calls = stripeNow({ sub_A: 'fail' });
      const res = await deliver(db, subEvent('evt_exp', 'customer.subscription.updated', 'sub_A', 'incomplete_expired'));
      expect(await res.json()).toEqual({ received: true, final: 'incomplete_expired' });
      expect((await readEntitlement(db, UID)).status).toBe('incomplete_expired');
      expect(calls).toHaveLength(0);
    });

    it('a failing card that ends while Stripe cannot be read frees the web checkout again', async () => {
      // Before, that ending answered 500 for the three days Stripe retries and was then gone, so the row kept
      // answering 409 billing_issue and the person could never buy on the web again.
      const db = await sqliteD1();
      await writeEntitlement(db, { userId: UID, premium: false, status: 'past_due', currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe', stripeSub: 'sub_A' }, 'before');
      stripeNow({ sub_A: { http: 401 } });
      expect(await (await checkout(db)).json()).toEqual({ error: 'billing_issue' });
      expect((await deliver(db, subEvent('evt_end', 'customer.subscription.deleted', 'sub_A', 'canceled'))).status).toBe(200);
      const res = await checkout(db);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/again' });
    });
  });

  describe('a read that fails: the owner hears, and a paid purchase still shows', () => {
    const at = (hours: number) => NOW + Math.round(hours * 3600);
    const paidSession = (eventId: string, paymentStatus = 'paid') => ({
      id: eventId,
      type: 'checkout.session.completed',
      data: { object: { object: 'checkout.session', client_reference_id: UID, subscription: 'sub_C', customer: 'cus_C', payment_status: paymentStatus, status: 'complete' } },
    });

    it('emails the owner once per six hours, naming what Stripe answered and the event, never the person', async () => {
      const db = await sqliteD1();
      const { sent, env: mail } = inbox();
      stripeNow({ sub_A: { http: 401, code: 'api_key_expired' } });
      const res = await deliver(db, subEvent('evt_1', 'customer.subscription.updated', 'sub_A', 'active'), mail, at(0));
      expect(res.status).toBe(500);
      expect(sent).toHaveLength(1);
      expect(subjectOf(sent[0])).toBe('[DoubleDone] Stripe webhooks cannot read subscriptions');
      const body = bodyOf(sent[0]);
      expect(body).toContain('The read: HTTP 401 (api_key_expired).');
      expect(body).toContain('The event: customer.subscription.updated evt_1.');
      expect(body).toContain('stripe events resend <evt_id> --webhook-endpoint=<we_id>');
      expect(body).not.toContain(UID);
      expect(body).not.toContain('wxyz'); // Stripe's message quotes part of the key, and never rides along
      // the next failures inside six hours are quiet, and the first one after them emails again
      await deliver(db, subEvent('evt_2', 'customer.subscription.updated', 'sub_A', 'active'), mail, at(1));
      await deliver(db, subEvent('evt_3', 'customer.subscription.updated', 'sub_A', 'active'), mail, at(5.9));
      expect(sent).toHaveLength(1);
      await deliver(db, subEvent('evt_4', 'customer.subscription.updated', 'sub_A', 'active'), mail, at(6.1));
      expect(sent).toHaveLength(2);
      expect(alertsSent(db)).toEqual([READ_FAILED_ALERT_KIND, READ_FAILED_ALERT_KIND]);
    });

    it('records no alert where none can be sent', async () => {
      const db = await sqliteD1();
      stripeNow({ sub_A: 'throw' });
      expect((await deliver(db, subEvent('evt_1', 'customer.subscription.updated', 'sub_A', 'active'))).status).toBe(500);
      expect(alertsSent(db)).toEqual([]);
    });

    it('a paid checkout whose read fails is granted from its own copy, so a second Go Premium is refused, and the retry writes the live state', async () => {
      const db = await sqliteD1();
      stripeNow({ sub_C: { http: 503 } });
      const res = await deliver(db, paidSession('evt_cs'));
      expect(res.status).toBe(500);
      expect(await res.text()).toBe('subscription read failed');
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', customerId: 'cus_C', source: 'stripe' });
      expect(stripeSubOf(db)).toBe('sub_C');
      expect(processed(db, 'evt_cs')).toBe(false); // so Stripe retries, for the live state
      expect(await (await checkout(db)).json()).toEqual({ error: 'already_subscribed' });
      vi.unstubAllGlobals();
      stripeNow({ sub_C: { status: 'trialing', customer: 'cus_C' } });
      expect(await (await deliver(db, paidSession('evt_cs'))).json()).toEqual({ received: true, live: 'trialing' });
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'trialing', customerId: 'cus_C' });
      expect(processed(db, 'evt_cs')).toBe(true);
    });

    it('an unpaid checkout whose read fails writes nothing', async () => {
      const db = await sqliteD1();
      stripeNow({ sub_C: 'throw' });
      expect((await deliver(db, paidSession('evt_cs', 'unpaid'))).status).toBe(500);
      expect(db.raw.prepare('SELECT COUNT(*) AS n FROM entitlements').get()).toMatchObject({ n: 0 });
    });

    it('a checkout retried after its subscription ended never grants it again', async () => {
      const db = await sqliteD1();
      await writeEntitlement(db, { userId: UID, premium: false, status: 'canceled', currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, customerId: 'cus_C', source: 'stripe', stripeSub: 'sub_C' }, 'before');
      stripeNow({ sub_C: 'throw' });
      expect((await deliver(db, paidSession('evt_cs'))).status).toBe(500);
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'canceled' });
    });
  });

  describe('a recorded subscription that has ended stops guarding (the self-heal)', () => {
    it("an older Worker's stale id no longer keeps Premium on: the real subscription's failing card lands", async () => {
      const db = await staleRow('cus_2');
      const calls = stripeNow({ sub_1: { status: 'canceled', customer: 'cus_1' }, sub_2: { status: 'past_due', customer: 'cus_2' } });
      const res = await deliver(db, subEvent('evt_pd', 'customer.subscription.updated', 'sub_2', 'past_due', 'cus_2'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, live: 'past_due', healed: true });
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'past_due', customerId: 'cus_2' });
      expect(stripeSubOf(db)).toBe('sub_2');
      expect(processed(db, 'evt_pd')).toBe(true);
      expect(calls.map((c) => c.url)).toEqual([SUB('sub_2'), SUB('sub_1')]); // the live read, then the one check
      // the guard is about sub_2 from here, so an old subscription's ending is refused again
      const old = await deliver(db, subEvent('evt_old', 'customer.subscription.deleted', 'sub_1', 'canceled', 'cus_1'));
      expect(await old.json()).toEqual({ received: true, final: 'canceled', kept: true, by: 'other-subscription' });
      expect((await readEntitlement(db, UID)).status).toBe('past_due');
    });

    it("an older Worker's stale id no longer keeps Premium on: the real subscription's ending lands, with no read of its own", async () => {
      const db = await staleRow('cus_2');
      const calls = stripeNow({ sub_1: { status: 'canceled', customer: 'cus_1' } });
      const res = await deliver(db, subEvent('evt_end', 'customer.subscription.deleted', 'sub_2', 'canceled', 'cus_2'));
      expect(await res.json()).toEqual({ received: true, final: 'canceled', healed: true });
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'canceled', customerId: 'cus_2' });
      expect(stripeSubOf(db)).toBe('sub_2');
      expect(calls.map((c) => c.url)).toEqual([SUB('sub_1')]);
    });

    it('a recorded subscription that is alive keeps the refusal, and a card failing on it counts as alive', async () => {
      const db = await sqliteD1();
      await writeEntitlement(db, { userId: UID, premium: false, status: 'past_due', currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, customerId: 'cus_A', source: 'stripe', stripeSub: 'sub_A' }, 'before');
      stripeNow({ sub_A: { status: 'past_due', customer: 'cus_A' } });
      // on the same customer, so only "alive" can be what keeps it
      const res = await deliver(db, subEvent('evt_old', 'customer.subscription.deleted', 'sub_old', 'canceled', 'cus_A'));
      expect(await res.json()).toEqual({ received: true, final: 'canceled', kept: true, by: 'other-subscription' });
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'past_due' });
      expect(await (await checkout(db)).json()).toEqual({ error: 'billing_issue' });
    });

    it('an ended recorded subscription on a row about a THIRD one keeps the refusal, and the third heals it with its own news', async () => {
      // sub_1 was recorded and ended, an older Worker wrote sub_3 (cus_3), and sub_2, an abandoned checkout from the
      // same window (cus_2), expires late. The row is not about sub_2, so its ending must not switch sub_3 off.
      const db = await staleRow('cus_3');
      const subs: Record<string, LiveSub> = { sub_1: { status: 'canceled', customer: 'cus_1' }, sub_3: { status: 'active', customer: 'cus_3' } };
      stripeNow(subs);
      const res = await deliver(db, subEvent('evt_exp', 'customer.subscription.updated', 'sub_2', 'incomplete_expired', 'cus_2'));
      expect(await res.json()).toEqual({ received: true, final: 'incomplete_expired', kept: true, by: 'other-subscription' });
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', customerId: 'cus_3' });
      expect(stripeSubOf(db)).toBe('sub_1');
      subs.sub_3 = { status: 'past_due', customer: 'cus_3' };
      const own = await deliver(db, subEvent('evt_3', 'customer.subscription.updated', 'sub_3', 'past_due', 'cus_3'));
      expect(await own.json()).toEqual({ received: true, live: 'past_due', healed: true });
      expect(stripeSubOf(db)).toBe('sub_3');
    });

    it('a recorded subscription that cannot be read answers 500, writes and marks nothing, tells the owner, and the retry heals', async () => {
      const db = await staleRow('cus_2');
      const { sent, env: mail } = inbox();
      stripeNow({ sub_1: { http: 503 }, sub_2: { status: 'past_due', customer: 'cus_2' } });
      const event = subEvent('evt_pd', 'customer.subscription.updated', 'sub_2', 'past_due', 'cus_2');
      const res = await deliver(db, event, mail);
      expect(res.status).toBe(500);
      expect(await res.text()).toBe('subscription read failed');
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active' });
      expect(stripeSubOf(db)).toBe('sub_1');
      expect(processed(db, 'evt_pd')).toBe(false);
      expect(sent).toHaveLength(1);
      expect(bodyOf(sent[0])).toContain('The read: HTTP 503.');
      vi.unstubAllGlobals();
      stripeNow({ sub_1: { status: 'canceled', customer: 'cus_1' }, sub_2: { status: 'past_due', customer: 'cus_2' } });
      expect(await (await deliver(db, event, mail)).json()).toEqual({ received: true, live: 'past_due', healed: true });
    });

    it('a 404 for the recorded subscription is never read as an ending (a test-mode key answers that for every live id)', async () => {
      const db = await sqliteD1();
      await writeEntitlement(db, { userId: UID, premium: true, status: 'active', currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, customerId: 'cus_A', source: 'stripe', stripeSub: 'sub_A' }, 'before');
      stripeNow({ sub_A: { http: 404, code: 'resource_missing' } });
      // an old ending on the same customer, which "missing means ended" would have let switch a paying member off
      const res = await deliver(db, subEvent('evt_old', 'customer.subscription.deleted', 'sub_old', 'canceled', 'cus_A'));
      expect(res.status).toBe(500);
      expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active' });
      expect(processed(db, 'evt_old')).toBe(false);
    });
  });
});

describe('reading the subscription an event is about', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names the subscription itself, or the one behind a completed checkout', () => {
    expect(subscriptionIdFromEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } })).toBe('sub_1');
    expect(subscriptionIdFromEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_2' } } })).toBe('sub_2');
    expect(subscriptionIdFromEvent({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', subscription: 'sub_3' } } })).toBe('sub_3');
    expect(subscriptionIdFromEvent({ type: 'checkout.session.completed', data: { object: { subscription: { id: 'sub_4', object: 'subscription' } } } })).toBe('sub_4');
  });

  it('names nothing for a session without one, an empty id, or any other event', () => {
    expect(subscriptionIdFromEvent({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', subscription: null } } })).toBeNull();
    expect(subscriptionIdFromEvent({ type: 'checkout.session.completed', data: { object: { subscription: '' } } })).toBeNull();
    expect(subscriptionIdFromEvent({ type: 'invoice.paid', data: { object: { id: 'in_1', subscription: 'sub_5' } } })).toBeNull();
    expect(subscriptionIdFromEvent({ type: 'charge.refunded', data: { object: { id: 'ch_1' } } })).toBeNull();
    expect(subscriptionIdFromEvent({})).toBeNull();
  });

  it('maps a live subscription exactly as an event copy of it is mapped, and refuses anything else', () => {
    const obj = { id: 'sub_1', object: 'subscription', status: 'active', customer: 'cus_1', cancel_at: 1_900_000_000, items: { data: [{ current_period_end: 1_850_000_000 }] }, metadata: { user_id: 'u1' } };
    const fromLive = entitlementFromSubscription('u1', obj);
    expect(fromLive).toEqual({ userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 1_850_000_000, cancelAtPeriodEnd: true, customerId: 'cus_1', source: 'stripe', stripeSub: 'sub_1' });
    expect(entitlementFromEvent({ type: 'customer.subscription.updated', data: { object: obj } })).toEqual(fromLive);
    for (const junk of [null, undefined, 'sub_1', {}, { id: 'sub_1' }, { status: 'active' }, { id: '', status: 'active' }]) {
      expect(entitlementFromSubscription('u1', junk)).toBeNull();
    }
  });

  it('readSubscription reads by id with the secret key and a timeout', async () => {
    let asked = '';
    let auth = '';
    let signal: unknown = null;
    vi.stubGlobal('fetch', async (url: string, init?: { headers?: Record<string, string>; signal?: unknown }) => {
      asked = url;
      auth = init?.headers?.authorization ?? '';
      signal = init?.signal ?? null;
      return new Response(JSON.stringify({ id: 'sub_a/b', status: 'active' }), { status: 200 });
    });
    expect(await readSubscription({ STRIPE_SECRET_KEY: SK }, 'sub_a/b')).toEqual({ ok: true, sub: { id: 'sub_a/b', status: 'active' } });
    expect(asked).toBe('https://api.stripe.com/v1/subscriptions/sub_a%2Fb');
    expect(auth).toBe(`Bearer ${SK}`);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(SUBSCRIPTION_READ_TIMEOUT_MS).toBe(8000);
  });

  it("readSubscription says why it could not read, with Stripe's status and code but never its message", async () => {
    const why = async (answer: () => Response, env: { STRIPE_SECRET_KEY?: string } = { STRIPE_SECRET_KEY: SK }) => {
      vi.stubGlobal('fetch', async () => answer());
      const r = await readSubscription(env, 'sub_1');
      return r.ok ? 'ok' : r.why;
    };
    const stripeError = (status: number, code: string) => () => new Response(JSON.stringify({ error: { code, message: 'Expired API Key provided: ****wxyz' } }), { status });
    expect(await why(() => new Response('{}'), {})).toBe('STRIPE_SECRET_KEY is not set');
    expect(await why(stripeError(401, 'api_key_expired'))).toBe('HTTP 401 (api_key_expired)');
    expect(await why(stripeError(404, 'resource_missing'))).toBe('HTTP 404 (resource_missing)');
    expect(await why(stripeError(400, 'Not a code!'))).toBe('HTTP 400');
    expect(await why(() => new Response('<html>bad gateway</html>', { status: 502 }))).toBe('HTTP 502');
    expect(
      await why(() => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      }),
    ).toBe('no answer (the connection failed, or took over 8 seconds)');
    expect(await why(() => new Response(JSON.stringify({ id: 'sub_2', status: 'active' })))).toBe('HTTP 200, but not the subscription asked for');
    expect(await why(() => new Response('not json'))).toBe('HTTP 200, but not the subscription asked for');
  });

  it('knows an ending by its copy: canceled or incomplete_expired, on a subscription event only', () => {
    expect(isTerminalCopy({ type: 'customer.subscription.deleted', data: { object: { status: 'canceled' } } })).toBe(true);
    expect(isTerminalCopy({ type: 'customer.subscription.updated', data: { object: { status: 'incomplete_expired' } } })).toBe(true);
    // a canceled subscription's metadata can still change, and that update is as final as the deletion
    expect(isTerminalCopy({ type: 'customer.subscription.updated', data: { object: { status: 'canceled' } } })).toBe(true);
    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused', '']) {
      expect(isTerminalCopy({ type: 'customer.subscription.updated', data: { object: { status } } }), status).toBe(false);
    }
    expect(isTerminalCopy({ type: 'checkout.session.completed', data: { object: { status: 'canceled' } } })).toBe(false);
    expect(isTerminalCopy({})).toBe(false);
  });

  it('the read-failed email says what to do, in plain words', () => {
    const { subject, body } = readFailedAlert({ type: 'customer.subscription.updated', id: 'evt_9' }, 'HTTP 401');
    expect(subject).toBe('[DoubleDone] Stripe webhooks cannot read subscriptions');
    expect(body).toContain('The read: HTTP 401.');
    expect(body).toContain('The event: customer.subscription.updated evt_9.');
    expect(body).toContain('Get-Clipboard -Raw | npx wrangler secret put STRIPE_SECRET_KEY');
    expect(body).toContain('up to 15 days');
    expect(body).toContain('up to 30 days');
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`); // en and em dashes, never in what the owner reads
    expect(`${subject}\n${body}`).not.toMatch(dashes);
  });
});
