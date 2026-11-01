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
const post = (token?: string, body = '{}') =>
  new Request('https://w/account/close-billing', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });

type FakeSub = { id: string; status: string; customer: string; userId: string };
type Call = { method: string; url: string; auth: string | null; body: string | null };

/** An in-memory Stripe: the list, search, retrieve and cancel endpoints, over a mutable set of subs. */
type FakeRc = { subscriptions?: Record<string, unknown>; getStatus?: number; refuseCancel?: string[]; refuseStatus?: number };

function fakeStripe(subs: FakeSub[], opts: { fail?: 'list' | 'search'; hasMore?: 'list' | 'search'; refuseCancel?: string[]; missingCustomer?: boolean; rc?: FakeRc } = {}) {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const view = (s: FakeSub) => ({ id: s.id, object: 'subscription', status: s.status, customer: s.customer, metadata: { user_id: s.userId } });
  const fetchStub = vi.fn(async (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url: input, auth: init?.headers?.authorization ?? init?.headers?.Authorization ?? null, body: init?.body ?? null });
    const url = new URL(input);
    // RevenueCat v1 (Play renewals), only when a test asks for it; otherwise it falls to 'unexpected call'.
    if (url.host === 'api.revenuecat.com' && opts.rc) {
      const rc = opts.rc;
      if (method === 'GET' && /^\/v1\/subscribers\/[^/]+$/.test(url.pathname)) {
        if (rc.getStatus && rc.getStatus !== 200) return json({ message: 'rc down' }, rc.getStatus);
        return json({ subscriber: { entitlements: {}, subscriptions: rc.subscriptions ?? {} } });
      }
      const cancel = /^\/v1\/subscribers\/[^/]+\/subscriptions\/([^/]+)\/cancel$/.exec(url.pathname);
      if (method === 'POST' && cancel) {
        return rc.refuseCancel?.includes(decodeURIComponent(cancel[1])) ? json({ message: 'nope' }, rc.refuseStatus ?? 500) : json({ subscriber: {} });
      }
    }
    const path = url.pathname.replace(/^\/v1/, '');
    if (method === 'GET' && path === '/subscriptions') {
      if (opts.fail === 'list') return json({ error: { message: 'boom' } }, 500);
      // A customer id the key cannot see (a test-mode id under the live key, or a removed customer).
      if (opts.missingCustomer) return json({ error: { code: 'resource_missing', message: 'No such customer' } }, 400);
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
  return {
    calls,
    subs,
    fetchStub,
    deletes: () => calls.filter((c) => c.method === 'DELETE').map((c) => decodeURIComponent(new URL(c.url).pathname.split('/').pop() ?? '')),
    rcCalls: () => calls.filter((c) => new URL(c.url).host === 'api.revenuecat.com'),
  };
}

/** A D1 holding one entitlements row (the customer the webhook last wrote), or throwing on read. The
 *  Play-log query (rc_events) is answered separately: no Play delivery unless `playLog` says so. */
function dbWith(customerId: string | null, opts: { throws?: boolean; source?: string; playLog?: boolean } = {}): D1LikeDatabase & { reads: number } {
  const db = {
    reads: 0,
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        async first<T>() {
          db.reads += 1;
          if (opts.throws) throw new Error('d1 down');
          if (sql.includes('rc_events')) return (opts.playLog ? { hit: 1 } : null) as T | null;
          if (!customerId && !opts.source) return null as T | null;
          return { premium: 1, status: 'active', started_at: null, current_period_end: null, cancel_at_period_end: 0, stripe_customer_id: customerId, source: opts.source ?? 'stripe' } as T;
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

const env = (db?: D1LikeDatabase, extra: Record<string, string> = {}) => ({ STRIPE_SECRET_KEY: SK, SUPABASE_URL: 'https://proj.supabase.co', DB: db, ...extra });
const RC = { RC_SECRET_KEY: 'rc-test-secret' }; // a dummy string, never a real sk_ key

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
    // A throwing D1 cannot say whether this person ever bought on Play, so RevenueCat is asked (the key
    // is always set in production); it says no Play, and the Stripe cancel goes ahead exactly as before.
    for (const [db, extra] of [[dbWith(null), {}], [undefined, {}], [dbWith('cus_1', { throws: true }), RC]] as const) {
      const stripe = fakeStripe([{ id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER }], { rc: {} });
      const res = await handleCloseBilling(post(tokenFor(USER)), env(db, extra), cors, trust);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ cancelled: 1 });
      expect(stripe.deletes()).toEqual(['sub_1']);
      vi.unstubAllGlobals();
    }
  });

  it('with D1 down AND no RevenueCat key, fails closed: it cannot tell and cannot check', async () => {
    fakeStripe([{ id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER }]);
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1', { throws: true })), cors, trust);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'close_billing_failed' });
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

describe('close-billing: the review fixes', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = (extra: Record<string, unknown> = {}) => ({ STRIPE_SECRET_KEY: SK, SUPABASE_URL: 'https://p.supabase.co', ...extra });

  it('treats a customer Stripe says does not exist as empty, and still cancels what the search finds', async () => {
    const stripe = fakeStripe([{ id: 'sub_live', status: 'active', customer: 'cus_live', userId: USER }], { missingCustomer: true });
    const res = await handleCloseBilling(post(tokenFor(USER)), { ...env(), DB: dbWith('cus_test_leftover') }, cors, trust);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 1 });
    expect(stripe.deletes()).toEqual(['sub_live']);
  });

  it('still fails closed when the customer list fails for any other reason', async () => {
    fakeStripe([{ id: 'sub_live', status: 'active', customer: 'cus_live', userId: USER }], { fail: 'list' });
    const res = await handleCloseBilling(post(tokenFor(USER)), { ...env(), DB: dbWith('cus_live') }, cors, trust);
    expect(res.status).toBe(502);
  });

  it('rate-limits per verified user before any D1 or Stripe call', async () => {
    const stripe = fakeStripe([{ id: 'sub_live', status: 'active', customer: 'cus_live', userId: USER }]);
    const keys: string[] = [];
    const limiter = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: false };
      },
    };
    const db = dbWith('cus_live');
    const res = await handleCloseBilling(post(tokenFor(USER)), { ...env(), DB: db, BILLING_LIMITER: limiter }, cors, trust);
    expect(res.status).toBe(429);
    expect(keys).toEqual([`close:${USER}`]);
    expect(stripe.calls).toHaveLength(0);
    expect(db.reads).toBe(0);
  });
});

describe('close-billing: Google Play renewals (Path A)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const FUTURE = new Date(Date.now() + 20 * 24 * 3_600_000).toISOString();
  const PAST = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const play = (over: Record<string, unknown> = {}) => ({ store: 'play_store', expires_date: FUTURE, unsubscribe_detected_at: null, refunded_at: null, store_transaction_id: 'GPA.1111-2222-3333-44444', ...over });

  it('never calls RevenueCat for someone who never bought on Play', async () => {
    const stripe = fakeStripe([{ id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER }], { rc: {} });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1'), RC), cors, trust);
    expect(await res.json()).toEqual({ cancelled: 1 });
    expect(stripe.rcCalls()).toEqual([]); // not even a lookup: the v1 GET would CREATE a customer
  });

  it('turns off a Google renewal through the v1 CANCEL (never /revoke), and counts it', async () => {
    const stripe = fakeStripe([], { rc: { subscriptions: { premium: play() } } });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), RC), cors, trust);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 1 });
    const rc = stripe.rcCalls();
    expect(rc.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      `GET /v1/subscribers/${USER}`,
      `POST /v1/subscribers/${USER}/subscriptions/GPA.1111-2222-3333-44444/cancel`,
    ]);
    expect(rc.some((c) => c.url.includes('/revoke'))).toBe(false);
    expect(rc.every((c) => c.auth === 'Bearer rc-test-secret')).toBe(true);
  });

  it('asks RevenueCat when the app says it may hold a Play subscription the server has no record of yet', async () => {
    // a fresh purchase whose webhook is still on its way: no D1 row, nothing in the log
    const stripe = fakeStripe([], { rc: { subscriptions: { premium: play() } } });
    const res = await handleCloseBilling(post(tokenFor(USER), JSON.stringify({ maybePlay: true })), env(dbWith(null), RC), cors, trust);
    expect(await res.json()).toEqual({ cancelled: 1 });
    expect(stripe.rcCalls().map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      `GET /v1/subscribers/${USER}`,
      `POST /v1/subscribers/${USER}/subscriptions/GPA.1111-2222-3333-44444/cancel`,
    ]);
  });

  it('ignores a hint that is not exactly true, and a body that is not JSON', async () => {
    for (const body of [JSON.stringify({ maybePlay: 'yes' }), JSON.stringify({ maybePlay: 1 }), 'not json', '']) {
      const stripe = fakeStripe([], { rc: {} });
      const res = await handleCloseBilling(post(tokenFor(USER), body), env(dbWith(null), RC), cors, trust);
      expect(res.status).toBe(200);
      expect(stripe.rcCalls()).toEqual([]);
      vi.unstubAllGlobals();
    }
  });

  it('asks RevenueCat when only the delivery log shows a Play purchase (the row says stripe)', async () => {
    const stripe = fakeStripe([{ id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER }], { rc: { subscriptions: { premium: play() } } });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1', { playLog: true }), RC), cors, trust);
    expect(await res.json()).toEqual({ cancelled: 2 }); // the Stripe sub AND the Play renewal
    expect(stripe.deletes()).toEqual(['sub_1']);
  });

  it('skips a Play subscription that is over or already not renewing, and other stores', async () => {
    const stripe = fakeStripe([], {
      rc: {
        subscriptions: {
          a: play({ expires_date: PAST, store_transaction_id: 'GPA.over' }),
          b: play({ unsubscribe_detected_at: PAST, store_transaction_id: 'GPA.off' }),
          d: { store: 'app_store', expires_date: FUTURE, store_transaction_id: '1000000000' },
        },
      },
    });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), RC), cors, trust);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 0 });
    expect(stripe.rcCalls().filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('still cancels a REFUNDED subscription that has not ended (a refund alone can leave it renewing)', async () => {
    const stripe = fakeStripe([], { rc: { subscriptions: { premium: play({ refunded_at: PAST, store_transaction_id: 'GPA.refunded' }) } } });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), RC), cors, trust);
    expect(await res.json()).toEqual({ cancelled: 1 });
    expect(stripe.rcCalls().some((c) => c.url.endsWith('/subscriptions/GPA.refunded/cancel'))).toBe(true);
  });

  it('cancels a HELD subscription (a billing issue in the last 60 days), whose expiry is already past', async () => {
    const recent = new Date(Date.now() - 10 * 24 * 3_600_000).toISOString();
    const stripe = fakeStripe([], { rc: { subscriptions: { premium: play({ expires_date: PAST, billing_issues_detected_at: recent, store_transaction_id: 'GPA.held' }) } } });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), RC), cors, trust);
    expect(await res.json()).toEqual({ cancelled: 1 });
    expect(stripe.rcCalls().some((c) => c.url.endsWith('/subscriptions/GPA.held/cancel'))).toBe(true);
  });

  it('treats a refused second cancel on a held, already-off subscription as done, not a wedge', async () => {
    const recent = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
    const sub = play({ expires_date: PAST, billing_issues_detected_at: recent, unsubscribe_detected_at: recent, store_transaction_id: 'GPA.heldoff' });
    fakeStripe([], { rc: { subscriptions: { premium: sub }, refuseCancel: ['GPA.heldoff'] } });
    // the double refuses with a 500, which is still a failure; a 4xx refusal is "nothing left to stop"
    const failing = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), RC), cors, trust);
    expect(failing.status).toBe(502);
    vi.unstubAllGlobals();
    fakeStripe([], { rc: { subscriptions: { premium: sub }, refuseCancel: ['GPA.heldoff'], refuseStatus: 400 } });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), RC), cors, trust);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 0 });
  });

  it('lets a billing issue older than 60 days count as over', async () => {
    const old = new Date(Date.now() - 70 * 24 * 3_600_000).toISOString();
    const stripe = fakeStripe([], { rc: { subscriptions: { premium: play({ expires_date: PAST, billing_issues_detected_at: old }) } } });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), RC), cors, trust);
    expect(await res.json()).toEqual({ cancelled: 0 });
    expect(stripe.rcCalls().filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('502s (and the app deletes nothing) when a Play subscriber cannot be reached', async () => {
    const cases: [FakeRc, Record<string, string>][] = [
      [{ subscriptions: { premium: play() } }, {}], // no key configured
      [{ getStatus: 500 }, RC], // RevenueCat down
      [{ subscriptions: { premium: play({ store_transaction_id: '' }) } }, RC], // renewing, and nothing to cancel it by
      [{ subscriptions: { premium: play() }, refuseCancel: ['GPA.1111-2222-3333-44444'] }, RC], // the cancel did not land
    ];
    for (const [rc, extra] of cases) {
      fakeStripe([], { rc });
      const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), extra), cors, trust);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'close_billing_failed' });
      vi.unstubAllGlobals();
    }
  });

  it('still cancels Stripe when the Play side fails, then says it was not all', async () => {
    const stripe = fakeStripe([{ id: 'sub_1', status: 'active', customer: 'cus_1', userId: USER }], { rc: { getStatus: 503 } });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith('cus_1', { source: 'google' }), RC), cors, trust);
    expect(res.status).toBe(502);
    expect(stripe.deletes()).toEqual(['sub_1']); // as much billing as possible stopped on this attempt
  });

  it('is idempotent across a retry: an already-cancelled renewal is not cancelled twice', async () => {
    const stripe = fakeStripe([], { rc: { subscriptions: { premium: play({ unsubscribe_detected_at: new Date().toISOString() }) } } });
    const res = await handleCloseBilling(post(tokenFor(USER)), env(dbWith(null, { source: 'google' }), RC), cors, trust);
    expect(await res.json()).toEqual({ cancelled: 0 });
    expect(stripe.rcCalls().map((c) => c.method)).toEqual(['GET']);
  });
});
