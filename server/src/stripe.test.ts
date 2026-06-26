import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkoutSessionForm,
  createCheckoutSession,
  createPortalSession,
  type D1LikeDatabase,
  entitlementFromEvent,
  handleCheckout,
  handleEntitlement,
  handlePortal,
  handleWebhook,
  parseSigHeader,
  readEntitlement,
  signPayload,
  verifyWebhook,
  writeEntitlement,
} from './stripe';

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
    expect(ent).toEqual({ userId: 'u1', premium: true, status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: 'cus_1' });
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
          const [userId, premium, status, cpe, cancelAtEnd, startedAt, customerId, updatedAt] = args as [
            string,
            number,
            string,
            number | null,
            number,
            string | null,
            string | null,
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
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1' }, '2026-06-20T00:00:00Z');
    let view = await readEntitlement(db, 'u1');
    expect(view).toEqual({ premium: true, status: 'active', since: '2026-06-20T00:00:00Z', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1' });

    // a cancel-at-period-end keeps premium active but flags the pending cancel, and must
    // NOT reset the tenure clock or lose the customer (a null customer must not clobber it)
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: true, customerId: null }, '2026-09-01T00:00:00Z');
    view = await readEntitlement(db, 'u1');
    expect(view.cancelAtPeriodEnd).toBe(true);
    expect(view.since).toBe('2026-06-20T00:00:00Z');
    expect(view.customerId).toBe('cus_1'); // preserved by COALESCE
  });

  it('reports not-premium for an unknown user', async () => {
    expect(await readEntitlement(fakeDb(), 'nobody')).toEqual({ premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null });
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
    expect((await handleCheckout(req('checkout'), {}, cors)).status).toBe(401);
    expect((await handleCheckout(req('checkout', tokenFor('u1'), {}), {}, cors)).status).toBe(503);
  });

  it('handlePortal 401s without a token, 404s with no stored subscription', async () => {
    expect((await handlePortal(req('portal'), {}, cors)).status).toBe(401);
    const env = { STRIPE_SECRET_KEY: SK, DB: fakeDb() };
    expect((await handlePortal(req('portal', tokenFor('u1')), env, cors)).status).toBe(404);
  });

  it('handleEntitlement 401s without a token and returns a view when authed', async () => {
    expect((await handleEntitlement(new Request('https://w/entitlement'), {}, cors)).status).toBe(401);
    const res = await handleEntitlement(
      new Request('https://w/entitlement', { headers: { Authorization: `Bearer ${tokenFor('u1')}` } }),
      { DB: fakeDb() },
      cors,
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
    const ok = await handleCheckout(checkoutReq({ email: 'a@b.co' }), env, cors);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ url: 'https://checkout.stripe.com/c/x' });

    vi.stubGlobal('fetch', async () => new Response('no', { status: 400 }));
    expect((await handleCheckout(checkoutReq({}), env, cors)).status).toBe(502);
  });

  it('handleEntitlement returns a default view when DB is unbound', async () => {
    const res = await handleEntitlement(
      new Request('https://w/entitlement', { headers: { Authorization: `Bearer ${tokenFor('u1')}` } }),
      {},
      cors,
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
    expect((await handlePortal(portalReq(), {}, cors)).status).toBe(503);

    const db = fakeDb();
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 1, cancelAtPeriodEnd: false, customerId: 'cus_1' }, '2026-06-20T00:00:00Z');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/2' }), { status: 200 }));
    const res = await handlePortal(portalReq(), { STRIPE_SECRET_KEY: SK, DB: db }, cors);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/p/2' });
  });
});
