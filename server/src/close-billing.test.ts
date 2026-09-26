import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeJwtSub } from './mcp';
import { CHARGEABLE_STATUSES, cancelSubscriptionNow, type D1LikeDatabase, findChargeableSubscriptions, handleCloseBilling } from './stripe';

// POST /account/close-billing: account deletion stops Stripe billing FIRST. Same approach as
// stripe.test.ts: global fetch is stubbed with a small in-memory Stripe, and nothing reaches the network.
// (The secret key is a dummy string, never a real sk_ token.)

const SK = 'test-secret-key';
const USER = '5f0c1b9e-2d3a-4c5b-8e7f-0a1b2c3d4e5f';
const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
const trust = async (token: string) => decodeJwtSub(token);
const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=/g, '')}.s`;
const post = (token?: string) =>
  new Request('https://w/account/close-billing', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: '{}' });

type FakeSub = { id: string; status: string; customer: string; userId: string };
type Call = { method: string; url: string; auth: string | null; body: string | null };

/** An in-memory Stripe: the list, search, retrieve and cancel endpoints, over a mutable set of subs. */
function fakeStripe(subs: FakeSub[], opts: { fail?: 'list' | 'search'; hasMore?: 'list' | 'search'; refuseCancel?: string[] } = {}) {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const view = (s: FakeSub) => ({ id: s.id, object: 'subscription', status: s.status, customer: s.customer, metadata: { user_id: s.userId } });
  const fetchStub = vi.fn(async (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url: input, auth: init?.headers?.authorization ?? null, body: init?.body ?? null });
    const url = new URL(input);
    const path = url.pathname.replace(/^\/v1/, '');
    if (method === 'GET' && path === '/subscriptions') {
      if (opts.fail === 'list') return json({ error: { message: 'boom' } }, 500);
      // Stripe's default list leaves out canceled subscriptions.
      const data = subs.filter((s) => s.customer === url.searchParams.get('customer') && s.status !== 'canceled').map(view);
      return json({ object: 'list', data, has_more: opts.hasMore === 'list' });
    }
    if (method === 'GET' && path === '/subscriptions/search') {
      if (opts.fail === 'search') return json({ error: { message: 'boom' } }, 500);
      const uid = /metadata\['user_id'\]:'([^']+)'/.exec(url.searchParams.get('query') ?? '')?.[1];
      const data = subs.filter((s) => s.userId === uid).map(view);
      return json({ object: 'search_result', data, has_more: opts.hasMore === 'search' });
    }
    const one = /^\/subscriptions\/([^/]+)$/.exec(path);
    const target = one ? subs.find((s) => s.id === decodeURIComponent(one[1])) : undefined;
    if (one && !target) return json({ error: { code: 'resource_missing' } }, 404);
    if (target && method === 'GET') return json(view(target));
    if (target && method === 'DELETE') {
      if (opts.refuseCancel?.includes(target.id)) return json({ error: { message: 'nope' } }, 500);
      if (target.status === 'canceled') return json({ error: { message: 'already canceled' } }, 400);
      target.status = 'canceled';
      return json(view(target));
    }
    return json({ error: { message: 'unexpected call' } }, 500);
  });
  vi.stubGlobal('fetch', fetchStub);
  return { calls, subs, fetchStub, deletes: () => calls.filter((c) => c.method === 'DELETE').map((c) => decodeURIComponent(new URL(c.url).pathname.split('/').pop() ?? '')) };
}

/** A D1 holding one entitlements row (the customer the webhook last wrote), or throwing on read. */
function dbWith(customerId: string | null, opts: { throws?: boolean } = {}): D1LikeDatabase & { reads: number } {
  const db = {
    reads: 0,
    prepare(_sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        async first<T>() {
          db.reads += 1;
          if (opts.throws) throw new Error('d1 down');
          if (!customerId) return null as T | null;
          return { premium: 1, status: 'active', started_at: null, current_period_end: null, cancel_at_period_end: 0, stripe_customer_id: customerId, source: 'stripe' } as T;
        },
        async run() {
          throw new Error('close-billing must never write D1');
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1LikeDatabase & { reads: number };
}

const env = (db?: D1LikeDatabase) => ({ STRIPE_SECRET_KEY: SK, SUPABASE_URL: 'https://proj.supabase.co', DB: db });

describe('POST /account/close-billing: who is asking', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('401s with no bearer, touching neither Stripe nor D1', async () => {
    const stripe = fakeStripe([]);
    const db = dbWith('cus_1');
    const res = await handleCloseBilling(post(), env(db), cors, trust);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'sign_in_required' });
    expect(stripe.fetchStub).not.toHaveBeenCalled();
    expect(db.reads).toBe(0);
  });

  it('401s on a forged alg:none token under the REAL verifier, before any Stripe or D1 call', async () => {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USER })}.`;
    const stripe = fakeStripe([{ id: 'sub_victim', status: 'active', customer: 'cus_1', userId: USER }]);
    const db = dbWith('cus_1');
    const res = await handleCloseBilling(post(forged), env(db), cors); // no stub: defaultVerifySub
    expect(res.status).toBe(401);
    expect(stripe.fetchStub).not.toHaveBeenCalled();
    expect(db.reads).toBe(0);
    expect(stripe.subs[0].status).toBe('active'); // the victim's subscription is untouched
  });

  it('503s when Stripe is not configured (so the app deletes nothing)', async () => {
    const res = await handleCloseBilling(post(tokenFor(USER)), { SUPABASE_URL: 'https://proj.supabase.co' }, cors, trust);
    expect(res.status).toBe(503);
  });
});

describe('POST /account/close-billing: the verified path', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cancels every chargeable subscription on the known customer AND on older customers, once each, and keeps the customers', async () => {
    const stripe = fakeStripe([
      { id: 'sub_now', status: 'active', customer: 'cus_new', userId: USER },
      { id: 'sub_dunning', status: 'past_due', customer: 'cus_new', userId: USER },
      { id: 'sub_orphan', status: 'active', customer: 'cus_old', userId: USER }, // D1 lost this customer
      { id: 'sub_done', status: 'canceled', customer: 'cus_old', userId: USER },
      { id: 'sub_other_person', status: 'active', customer: 'cus_x', userId: '00000000-0000-4000-8000-000000000000' },
    ]);
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_new')), cors, trust);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 3 });
    expect(stripe.deletes().sort()).toEqual(['sub_dunning', 'sub_now', 'sub_orphan']); // each once, the merge dedups
    expect(stripe.subs.find((s) => s.id === 'sub_other_person')?.status).toBe('active');
    // Immediate cancel with the dashboard comment, authed with the secret key; the customer is never deleted.
    const del = stripe.calls.find((c) => c.method === 'DELETE')!;
    expect(new URL(del.url).pathname).toMatch(/^\/v1\/subscriptions\/sub_/);
    expect(new URLSearchParams(del.body ?? '').get('cancellation_details[comment]')).toBe('account_deleted');
    expect(new URLSearchParams(del.body ?? '').get('cancel_at_period_end')).toBeNull();
    expect(del.auth).toBe(`Bearer ${SK}`);
    expect(stripe.calls.some((c) => c.url.includes('/customers'))).toBe(false);
    // The known customer was listed, and the search was scoped to exactly this user's uuid.
    expect(stripe.calls.some((c) => c.method === 'GET' && c.url.includes('customer=cus_new'))).toBe(true);
    const search = stripe.calls.find((c) => c.url.includes('/subscriptions/search'))!;
    expect(new URL(search.url).searchParams.get('query')).toBe(`metadata['user_id']:'${USER}'`);
  });

  for (const status of [...CHARGEABLE_STATUSES]) {
    it(`cancels a subscription in status ${status}`, async () => {
      const stripe = fakeStripe([{ id: `sub_${status}`, status, customer: 'cus_1', userId: USER }]);
      const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ cancelled: 1 });
      expect(stripe.deletes()).toEqual([`sub_${status}`]);
    });
  }

  it('leaves subscriptions that can no longer charge alone (canceled, incomplete_expired)', async () => {
    const stripe = fakeStripe([
      { id: 'sub_c', status: 'canceled', customer: 'cus_1', userId: USER },
      { id: 'sub_ie', status: 'incomplete_expired', customer: 'cus_1', userId: USER },
    ]);
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust);
    expect(await res.json()).toEqual({ cancelled: 0 });
    expect(stripe.deletes()).toEqual([]);
  });

  it('answers 0 when there is no customer and nothing to cancel (a free account), without listing a customer', async () => {
    const stripe = fakeStripe([]);
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null)), cors, trust);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 0 });
    expect(stripe.calls.map((c) => new URL(c.url).pathname)).toEqual(['/v1/subscriptions/search']);
  });

  it('still finds and cancels by user id when D1 has no row, is unbound, or throws', async () => {
    for (const db of [dbWith(null), undefined, dbWith('cus_1', { throws: true })]) {
      const stripe = fakeStripe([{ id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER }]);
      const res = await handleCloseBilling(post(tokenFor(USER)), env(db), cors, trust);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ cancelled: 1 });
      expect(stripe.deletes()).toEqual(['sub_1']);
      vi.unstubAllGlobals();
    }
  });

  it('is idempotent: a second call finds nothing live and answers 0', async () => {
    const stripe = fakeStripe([
      { id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER },
      { id: 'sub_2', status: 'unpaid', customer: 'cus_1', userId: USER },
    ]);
    const first = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust);
    expect(await first.json()).toEqual({ cancelled: 2 });
    const second = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ cancelled: 0 });
    expect(stripe.deletes()).toEqual(['sub_1', 'sub_2']); // no second round of cancels
  });
});

describe('POST /account/close-billing: Stripe failures answer 502 and claim nothing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('502s when the customer list or the search fails, and cancels nothing on a half look', async () => {
    for (const fail of ['list', 'search'] as const) {
      const stripe = fakeStripe([{ id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER }], { fail });
      const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust);
      expect(res.status, fail).toBe(502);
      expect(await res.json()).toEqual({ error: 'close_billing_failed' });
      expect(stripe.deletes(), fail).toEqual([]);
      vi.unstubAllGlobals();
    }
  });

  it('502s when a page says has_more (a live subscription could hide behind the cursor)', async () => {
    for (const hasMore of ['list', 'search'] as const) {
      fakeStripe([{ id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER }], { hasMore });
      expect((await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust)).status, hasMore).toBe(502);
      vi.unstubAllGlobals();
    }
  });

  it('502s when Stripe is unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down');
    });
    expect((await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust)).status).toBe(502);
  });

  it('502s when a cancel does not land (still active on re-read), after still trying the others', async () => {
    const stripe = fakeStripe(
      [
        { id: 'sub_stuck', status: 'active', customer: 'cus_1', userId: USER },
        { id: 'sub_ok', status: 'active', customer: 'cus_1', userId: USER },
      ],
      { refuseCancel: ['sub_stuck'] },
    );
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust);
    expect(res.status).toBe(502);
    expect(stripe.deletes().sort()).toEqual(['sub_ok', 'sub_stuck']);
    expect(stripe.subs.find((s) => s.id === 'sub_ok')?.status).toBe('canceled'); // as much billing stopped as possible
    // A retry once Stripe recovers finishes the job and reports only what it did.
    vi.unstubAllGlobals();
    fakeStripe(stripe.subs);
    const retry = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1')), cors, trust);
    expect(await retry.json()).toEqual({ cancelled: 1 });
  });
});

describe('the close-billing helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cancelSubscriptionNow counts a refusal as done when the re-read says it is already canceled', async () => {
    fakeStripe([{ id: 'sub_1', status: 'canceled', customer: 'cus_1', userId: USER }]);
    expect(await cancelSubscriptionNow({ STRIPE_SECRET_KEY: SK }, 'sub_1')).toBe(true);
  });

  it('cancelSubscriptionNow is false without a key, and false when the re-read cannot confirm it', async () => {
    expect(await cancelSubscriptionNow({}, 'sub_1')).toBe(false);
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }));
    expect(await cancelSubscriptionNow({ STRIPE_SECRET_KEY: SK }, 'sub_1')).toBe(false);
  });

  it('findChargeableSubscriptions refuses a sub that is not a uuid, so no caller can shape the search query', async () => {
    const stripe = fakeStripe([]);
    expect(await findChargeableSubscriptions({ STRIPE_SECRET_KEY: SK }, "x' OR status:'active", null)).toBeNull();
    expect(stripe.fetchStub).not.toHaveBeenCalled();
    // ...and the handler turns that into the calm 502, not a delete.
    expect((await handleCloseBilling(post(tokenFor('not-a-uuid')), env(dbWith(null)), cors, trust)).status).toBe(502);
  });
});
