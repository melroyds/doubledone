import { describe, expect, it } from 'vitest';

import type { D1LikeDatabase } from './entitlements';
import { buildSubscriberRequest, grantFromSubscriber, handleAppleReconcile } from './revenuecat-api';

const UID = '11111111-2222-3333-4444-555555555555';
const NOW_MS = 1_800_000_000_000;
const HOUR_MS = 3_600_000;
const PRODUCT = 'app.doubledone.premium.monthly';

/** A RevenueCat v1 subscriber body. Overrides merge into the premium entitlement / its subscription. */
function subscriber(over: { ent?: Record<string, unknown> | null; sub?: Record<string, unknown> | null } = {}) {
  const ent =
    over.ent === null
      ? {}
      : { premium: { expires_date: new Date(NOW_MS + 30 * 24 * HOUR_MS).toISOString(), product_identifier: PRODUCT, ...over.ent } };
  const subs = over.sub === null ? {} : { [PRODUCT]: { is_sandbox: false, unsubscribe_detected_at: null, ...over.sub } };
  return { subscriber: { entitlements: ent, subscriptions: subs } };
}

function fakeDb(): D1LikeDatabase & { rows: Map<string, Record<string, unknown>> } {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    prepare() {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
          const [userId, premium, status, cpe, cancelAtEnd, startedAt, customerId, source] = args as never[];
          rows.set(userId as string, { premium, status, current_period_end: cpe, cancel_at_period_end: cancelAtEnd, started_at: startedAt, stripe_customer_id: customerId, source });
        },
        async first<T>() {
          return (rows.get(args[0] as string) ?? null) as T | null;
        },
        async all<T>() {
          return { results: [...rows.values()] as T[] };
        },
      };
      return stmt;
    },
  };
}

const req = (auth = `Bearer tok`) =>
  new Request('https://api.doubledone.app/apple/reconcile', { method: 'POST', headers: { Authorization: auth } });
const ok = async (_t: string, _u: string) => UID;
const fetchJson = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const envOf = (db: D1LikeDatabase) => ({ DB: db, SUPABASE_URL: 'https://p.supabase.co', RC_SECRET_KEY: 'sk_test' });

describe('buildSubscriberRequest', () => {
  // v1 and not v2 on purpose: only v1 returns per-subscription is_sandbox in one call.
  it('asks the v1 subscriber endpoint with the secret key as a bearer', () => {
    const { url, init } = buildSubscriberRequest(UID, 'sk_live_x');
    expect(url).toBe(`https://api.revenuecat.com/v1/subscribers/${UID}`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_live_x');
  });

  it('encodes an id that would otherwise escape the path', () => {
    expect(buildSubscriberRequest('$RCAnonymousID:a/b', 'sk').url).toContain('%24RCAnonymousID%3Aa%2Fb');
  });
});

describe('grantFromSubscriber', () => {
  it('grants from a live production subscription', () => {
    expect(grantFromSubscriber(subscriber(), UID, NOW_MS)).toEqual({
      userId: UID,
      customerId: null,
      source: 'apple',
      premium: true,
      status: 'active',
      currentPeriodEnd: Math.floor((NOW_MS + 30 * 24 * HOUR_MS) / 1000),
      cancelAtPeriodEnd: false,
    });
  });

  // THE guard. Only the per-product subscription row carries is_sandbox, so a missing row means we
  // cannot PROVE production, and this route grants premium, so "not sure" has to mean "no".
  it('refuses sandbox, and refuses anything it cannot prove is production', () => {
    expect(grantFromSubscriber(subscriber({ sub: { is_sandbox: true } }), UID, NOW_MS)).toBeNull();
    expect(grantFromSubscriber(subscriber({ sub: null }), UID, NOW_MS)).toBeNull(); // no subscriptions at all
    // An entitlement with no product_identifier cannot be looked up, so it cannot be proven either.
    expect(grantFromSubscriber(subscriber({ ent: { product_identifier: undefined } }), UID, NOW_MS)).toBeNull();
  });

  it('refuses an expired, unreadable or absent expiry', () => {
    expect(grantFromSubscriber(subscriber({ ent: { expires_date: new Date(NOW_MS - HOUR_MS).toISOString() } }), UID, NOW_MS)).toBeNull();
    expect(grantFromSubscriber(subscriber({ ent: { expires_date: 'not-a-date' } }), UID, NOW_MS)).toBeNull();
    expect(grantFromSubscriber(subscriber({ ent: { expires_date: undefined } }), UID, NOW_MS)).toBeNull();
    expect(grantFromSubscriber(subscriber({ ent: null }), UID, NOW_MS)).toBeNull(); // no premium entitlement
  });

  it('never throws on junk, whatever shape it arrives in', () => {
    for (const junk of [null, undefined, {}, { subscriber: null }, { subscriber: 'nope' }, { subscriber: { entitlements: 7 } }]) {
      expect(grantFromSubscriber(junk, UID, NOW_MS)).toBeNull();
    }
  });

  // Auto-renew off is NOT a revoke: access runs to the period end, exactly as the webhook's
  // CANCELLATION branch treats it.
  it('reads auto-renew-off as cancelling, while still granting to the period end', () => {
    const g = grantFromSubscriber(subscriber({ sub: { unsubscribe_detected_at: '2026-08-18T00:00:00Z' } }), UID, NOW_MS);
    expect(g?.premium).toBe(true);
    expect(g?.cancelAtPeriodEnd).toBe(true);
  });
});

describe('handleAppleReconcile', () => {
  it('attaches a real Apple purchase to the verified account', async () => {
    const db = fakeDb();
    const res = await handleAppleReconcile(req(), envOf(db), {}, '2026-08-19T00:00:00Z', NOW_MS, ok, fetchJson(subscriber()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attached: true });
    expect(db.rows.get(UID)).toMatchObject({ premium: 1, status: 'active', source: 'apple' });
  });

  // THE trust model. The client sends no body at all, so the only id ever looked up is the one the
  // token proves. A caller cannot reconcile somebody else's purchase onto themselves.
  it('looks up the id from the TOKEN, never anything the caller sent', async () => {
    let asked = '';
    const spy = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify(subscriber()), { status: 200 });
    }) as unknown as typeof fetch;
    await handleAppleReconcile(req(), envOf(fakeDb()), {}, '2026-08-19T00:00:00Z', NOW_MS, async () => UID, spy);
    expect(asked).toContain(UID);
  });

  it('401s a missing or forged token and writes nothing', async () => {
    const db = fakeDb();
    expect((await handleAppleReconcile(new Request('https://x/apple/reconcile', { method: 'POST' }), envOf(db), {}, 'n', NOW_MS, ok, fetchJson({}))).status).toBe(401);
    expect((await handleAppleReconcile(req(), envOf(db), {}, 'n', NOW_MS, async () => null, fetchJson({}))).status).toBe(401);
    expect(db.rows.size).toBe(0);
  });

  it('503s rather than answering when the secret is not configured', async () => {
    const res = await handleAppleReconcile(req(), { DB: fakeDb(), SUPABASE_URL: 'https://p.supabase.co' }, {}, 'n', NOW_MS, ok, fetchJson({}));
    expect(res.status).toBe(503);
  });

  // The ordinary case, and deliberately not an error: every web user, every Android user and every
  // free iOS user hits this on sign-in.
  it('answers a calm attached:false when there is nothing to attach', async () => {
    const db = fakeDb();
    const res = await handleAppleReconcile(req(), envOf(db), {}, 'n', NOW_MS, ok, fetchJson({}, 404));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ attached: false });
    expect(db.rows.size).toBe(0);
  });

  // A RevenueCat outage must never be reported as "you have no subscription", which would be a lie
  // that reads as a downgrade. 502 tells the client to leave the user's state alone.
  it('502s an upstream failure instead of concluding the user has nothing', async () => {
    const boom = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    expect((await handleAppleReconcile(req(), envOf(fakeDb()), {}, 'n', NOW_MS, ok, boom)).status).toBe(502);

    const thrown = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect((await handleAppleReconcile(req(), envOf(fakeDb()), {}, 'n', NOW_MS, ok, thrown)).status).toBe(502);
  });

  it('does not claim success when the write fails', async () => {
    const broken: D1LikeDatabase = {
      prepare() {
        throw new Error('d1 down');
      },
    };
    const res = await handleAppleReconcile(req(), { ...envOf(fakeDb()), DB: broken }, {}, 'n', NOW_MS, ok, fetchJson(subscriber()));
    expect(res.status).toBe(502);
  });

  it('refuses to attach a sandbox purchase, so TestFlight cannot mint real Premium', async () => {
    const db = fakeDb();
    const res = await handleAppleReconcile(req(), envOf(db), {}, 'n', NOW_MS, ok, fetchJson(subscriber({ sub: { is_sandbox: true } })));
    expect(await res.json()).toEqual({ attached: false });
    expect(db.rows.size).toBe(0);
  });

  it('carries CORS on every answer, including the errors', async () => {
    const cors = { 'access-control-allow-origin': 'https://doubledone.app' };
    for (const res of [
      await handleAppleReconcile(req(), envOf(fakeDb()), cors, 'n', NOW_MS, ok, fetchJson(subscriber())),
      await handleAppleReconcile(req(), envOf(fakeDb()), cors, 'n', NOW_MS, async () => null, fetchJson({})),
      await handleAppleReconcile(req(), { DB: fakeDb() }, cors, 'n', NOW_MS, ok, fetchJson({})),
    ]) {
      expect(res.headers.get('access-control-allow-origin')).toBe('https://doubledone.app');
    }
  });
});
