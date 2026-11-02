// Premium without an account (2026-11-03): the store check, end to end in real SQLite (the real d1/schema.sql),
// with RevenueCat mocked. No network: every RevenueCat answer comes from the injected fetch.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { purchaserHash, refuseForAccount } from './purchaser';
import { sqliteD1 } from './sqlite-d1.test-helper';
import {
  checkStorePremium,
  PURCHASER_HEADER,
  purchaserFrom,
  purgeStorePremium,
  STORE_KNOWN_LOOKUPS_PER_MINUTE,
  STORE_LOOKUPS_PER_MINUTE,
  STORE_SANDBOX_PER_DAY,
  STORE_SANDBOX_PER_PURCHASER_PER_DAY,
  STORE_SERVED_PER_HOUR,
} from './store-premium';
import type { D1LikeDatabase } from './telemetry';

const SECRET = 'test-rc-secret';
const NOW = 1_800_000_000_000; // 2027-01-15T08:00:00Z, on a minute and an hour boundary
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const HEX = '0123456789abcdef0123456789abcdef';
const ID = `$RCAnonymousID:${HEX}`;
/** A distinct, valid anonymous id per number. */
const idN = (n: number) => `$RCAnonymousID:${n.toString(16).padStart(32, '0')}`;
const UID = '11111111-2222-3333-4444-555555555555';
const PRODUCT = 'app.doubledone.premium.monthly';

type Db = Awaited<ReturnType<typeof sqliteD1>>;

/** One rc_events row, as the webhook writes it for an anonymous production purchase unless overridden. */
function seed(db: Db, appUserId: string, over: Partial<Record<'type' | 'environment' | 'outcome' | 'product_id' | 'user_id', string | null>> = {}) {
  const r = { type: 'INITIAL_PURCHASE', environment: 'PRODUCTION', outcome: 'unresolved-user', product_id: PRODUCT, user_id: null, ...over };
  db.raw
    .prepare('INSERT INTO rc_events (event_id, type, environment, store, product_id, app_user_id, user_id, applied, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)')
    .run(crypto.randomUUID(), r.type, r.environment, 'APP_STORE', r.product_id, appUserId, r.user_id, r.outcome);
}

/** A RevenueCat v1 subscriber body. */
function subscriber(o: {
  expiresMs?: number | null;
  sandbox?: boolean;
  store?: string;
  unsubscribe?: string | null;
  billing?: string | null;
  refunded?: string | null;
  original?: string;
  entitlement?: boolean;
  row?: boolean;
} = {}) {
  const expiresMs = o.expiresMs === undefined ? NOW + 30 * DAY : o.expiresMs;
  return {
    subscriber: {
      original_app_user_id: o.original ?? ID,
      entitlements:
        o.entitlement === false ? {} : { premium: { expires_date: expiresMs === null ? null : new Date(expiresMs).toISOString(), product_identifier: PRODUCT } },
      subscriptions:
        o.row === false
          ? {}
          : {
              [PRODUCT]: {
                is_sandbox: o.sandbox ?? false,
                store: o.store ?? 'app_store',
                unsubscribe_detected_at: o.unsubscribe ?? null,
                billing_issues_detected_at: o.billing ?? null,
                refunded_at: o.refunded ?? null,
              },
            },
    },
  };
}
const EMPTY_CUSTOMER = { subscriber: { original_app_user_id: ID, entitlements: {}, subscriptions: {} } };

type Answer = { status?: number; body?: unknown } | 'reject' | 'garbled' | 'hang';
/** A RevenueCat stand-in: the nth call gets the nth answer (the last repeats), and every call is recorded. */
function rc(...answers: Answer[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const doFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers[Math.min(i++, answers.length - 1)];
    if (a === 'reject') throw new TypeError('fetch failed');
    if (a === 'hang') return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
    if (a === 'garbled') return new Response('<html>a gateway page</html>', { status: 200 });
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, doFetch };
}

const env = (db: D1LikeDatabase) => ({ DB: db, RC_SECRET_KEY: SECRET });
const check = (db: D1LikeDatabase, id: string, nowMs: number, f: { doFetch: typeof fetch }, timeoutMs?: number) =>
  checkStorePremium(id, env(db), nowMs, { doFetch: f.doFetch, timeoutMs });

const counts = (db: Db): Record<string, number> =>
  Object.fromEntries(
    (db.raw.prepare("SELECT event, n FROM app_event_counts WHERE event LIKE 'premium.store.%'").all() as { event: string; n: number }[]).map((r) => [r.event, r.n]),
  );
const cacheRow = async (db: Db, id: string) =>
  db.raw.prepare('SELECT premium, sandbox, expires_at, checked_at FROM store_premium_cache WHERE id_hash = ?').get(await purchaserHash(id, SECRET)) as
    | { premium: number; sandbox: number; expires_at: number; checked_at: number }
    | undefined;
const cacheSize = (db: Db) => (db.raw.prepare('SELECT COUNT(*) AS n FROM store_premium_cache').get() as { n: number }).n;
const setCounter = (db: Db, kind: string, slot: number, n: number) =>
  db.raw.prepare('INSERT OR REPLACE INTO store_premium_counts (kind, slot, n) VALUES (?, ?, ?)').run(kind, slot, n);

const OK = (body: unknown = subscriber()) => ({ body });

describe('purchaserFrom: only the exact anonymous form is a proof', () => {
  const withHeader = (name: string, value: string) => new Request('https://api.doubledone.app/chart', { method: 'POST', headers: { [name]: value } });

  it('accepts the anonymous id under X-Purchaser-Token, whatever the header name casing', () => {
    expect(PURCHASER_HEADER).toBe('X-Purchaser-Token');
    expect(purchaserFrom(withHeader('X-Purchaser-Token', ID))).toBe(ID);
    expect(purchaserFrom(withHeader('x-purchaser-token', ID))).toBe(ID);
  });

  it('refuses everything else: an account, a near miss, an encoding, a duplicate, nothing', () => {
    for (const v of [
      UID, // an account's uuid, with dashes
      UID.replace(/-/g, ''), // and without
      `$RCAnonymousID:${HEX.toUpperCase()}`,
      `$RCAnonymousID:${HEX.slice(1)}`, // 31 hex
      `$RCAnonymousID:${HEX}0`, // 33 hex
      `$RCAnonymousID:${HEX.slice(0, 31)}g`, // a letter past f (RevenueCat's own pattern allows it, its SDKs never make it)
      `%24RCAnonymousID%3A${HEX}`,
      `$RCAnonymousID:${HEX}x`,
      `$rcanonymousid:${HEX}`,
      HEX,
      '',
    ]) {
      expect(purchaserFrom(withHeader(PURCHASER_HEADER, v)), v).toBeNull();
    }
    const twice = new Headers();
    twice.append(PURCHASER_HEADER, ID);
    twice.append(PURCHASER_HEADER, ID); // Fetch joins a repeated header with ", "
    expect(purchaserFrom(new Request('https://api.doubledone.app/chart', { headers: twice }))).toBeNull();
    expect(purchaserFrom(new Request('https://api.doubledone.app/chart'))).toBeNull();
  });

  it('never reads the name the design first had, which Cloudflare would log in the clear', () => {
    expect(purchaserFrom(withHeader('X-Purchaser', ID))).toBeNull();
  });
});

describe('purchaserHash: the only form of the id ever stored', () => {
  it('is 64 lowercase hex, stable for one key, and different for another key or another id', async () => {
    const h = await purchaserHash(ID, SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await purchaserHash(ID, SECRET)).toBe(h);
    expect(await purchaserHash(ID, 'test-another-secret')).not.toBe(h);
    expect(await purchaserHash(idN(1), SECRET)).not.toBe(h);
    expect(h).not.toContain(HEX);
  });
});

describe('the gate: production Premium only for an id our webhook saw buy', () => {
  it('serves a buyer the webhook logged, after ONE well-formed RevenueCat lookup, and caches the yes for an hour', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const f = rc(OK());
    expect(await check(db, ID, NOW, f)).toEqual({ ok: true, userId: null, purchaser: await purchaserHash(ID, SECRET) });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(`https://api.revenuecat.com/v1/subscribers/%24RCAnonymousID%3A${HEX}`);
    const headers = f.calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('x-platform'); // a lookup must not move last_seen
    expect(f.calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(await cacheRow(db, ID)).toEqual({ premium: 1, sandbox: 0, expires_at: NOW + HOUR, checked_at: NOW });
    expect(counts(db)).toMatchObject({ 'premium.store.lookup': 1, 'premium.store.yes': 1 });
  });

  it('counts a RENEWAL or an UNCANCELLATION as buying, like an INITIAL_PURCHASE', async () => {
    for (const type of ['RENEWAL', 'UNCANCELLATION']) {
      const db = await sqliteD1();
      seed(db, ID, { type });
      expect((await check(db, ID, NOW, rc(OK()))).ok, type).toBe(true);
    }
  });

  // THE attack the review found: mint an id, merge it into someone's account with the public SDK key, and the id
  // reads that account's subscription. Our webhook never saw THAT id buy, so its production Premium is refused.
  it('refuses an id RevenueCat calls active that our webhook never saw buy, and remembers the no for a minute', async () => {
    const db = await sqliteD1();
    const f = rc(OK(subscriber({ original: UID })));
    expect(await check(db, ID, NOW, f)).toEqual({ ok: false, status: 403 });
    expect(counts(db)).toMatchObject({ 'premium.store.lookup': 1, 'premium.store.unproven': 1 });
    expect(await cacheRow(db, ID)).toMatchObject({ premium: 0, expires_at: NOW + MIN });
    expect(await check(db, ID, NOW + 30_000, f)).toEqual({ ok: false, status: 403 });
    expect(f.calls).toHaveLength(1); // the second answer came from the minute-long no
  });

  it('does not count a delivery that is not a purchase, even one labelled unresolved-user', async () => {
    const db = await sqliteD1();
    // rcIgnoreOutcome labels EVERY delivery for an anonymous id unresolved-user first, whatever its type.
    seed(db, ID, { type: 'TEST' });
    seed(db, ID, { type: 'CANCELLATION' });
    seed(db, ID, { type: 'EXPIRATION' });
    expect(await check(db, ID, NOW, rc(OK()))).toEqual({ ok: false, status: 403 });
    expect(counts(db)['premium.store.unproven']).toBe(1);
  });

  it('does not count a purchase of some other product', async () => {
    const db = await sqliteD1();
    seed(db, ID, { product_id: 'com.example.other.monthly' });
    expect(await check(db, ID, NOW, rc(OK()))).toEqual({ ok: false, status: 403 });
  });

  it('refuses an id any delivery resolved to an account, before the cache and before RevenueCat', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const f = rc(OK());
    expect((await check(db, ID, NOW, f)).ok).toBe(true); // a live yes is now cached
    seed(db, ID, { type: 'RENEWAL', user_id: UID, outcome: 'applied' }); // then it turned up beside an account
    expect(await check(db, ID, NOW + MIN, f)).toEqual({ ok: false, status: 403 });
    expect(f.calls).toHaveLength(1);
    expect(counts(db)['premium.store.refused']).toBe(1);
  });

  it('refuses an id a delivery listed among an account\'s aliases, and one the owner blocked', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    seed(db, idN(2));
    const f = rc(OK());
    expect((await check(db, ID, NOW, f)).ok).toBe(true);
    await refuseForAccount(db, SECRET, [ID], NOW);
    db.raw.prepare("INSERT INTO store_premium_refused (id_hash, why, at) VALUES (?, 'blocked', ?)").run(await purchaserHash(idN(2), SECRET), NOW);
    expect(await check(db, ID, NOW + MIN, f)).toEqual({ ok: false, status: 403 });
    expect(await check(db, idN(2), NOW + MIN, f)).toEqual({ ok: false, status: 403 });
    expect(f.calls).toHaveLength(1);
  });

  // A reinstall or a new phone: Restore aliases the fresh id onto the old purchase, and RevenueCat names the old
  // id as the customer's original. The fresh id has no row of its own until the next renewal is logged.
  it('serves a fresh id whose RevenueCat original is a buyer our webhook saw, and nothing else', async () => {
    const db = await sqliteD1();
    seed(db, ID); // the old install's id bought
    const fresh = idN(7);
    expect(await check(db, fresh, NOW, rc(OK(subscriber({ original: ID }))))).toMatchObject({ ok: true, userId: null });
    expect(counts(db)).toMatchObject({ 'premium.store.yes': 1 });

    await refuseForAccount(db, SECRET, [ID], NOW); // the original now belongs to an account
    expect(await check(db, idN(8), NOW, rc(OK(subscriber({ original: ID }))))).toEqual({ ok: false, status: 403 });
    expect(await check(db, idN(9), NOW, rc(OK(subscriber({ original: UID }))))).toEqual({ ok: false, status: 403 });
    expect(await check(db, idN(10), NOW, rc(OK(subscriber({ original: idN(10) }))))).toEqual({ ok: false, status: 403 });
  });
});

describe('the cache: a yes for an hour at most, a no for a minute, never backwards', () => {
  it('answers from the cache inside the hour and asks RevenueCat again after it', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const f = rc(OK());
    await check(db, ID, NOW, f);
    expect((await check(db, ID, NOW + HOUR - 1, f)).ok).toBe(true);
    expect(f.calls).toHaveLength(1);
    expect((await check(db, ID, NOW + HOUR, f)).ok).toBe(true);
    expect(f.calls).toHaveLength(2); // the hourly re-check
  });

  it('never keeps a yes past the store\'s own expiry', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const f = rc(OK(subscriber({ expiresMs: NOW + 10 * MIN })), OK(subscriber({ expiresMs: NOW - 1 })));
    expect((await check(db, ID, NOW, f)).ok).toBe(true);
    expect((await cacheRow(db, ID))?.expires_at).toBe(NOW + 10 * MIN);
    expect(await check(db, ID, NOW + 10 * MIN, f)).toEqual({ ok: false, status: 403 }); // lapsed: asked again, and no
    expect(f.calls).toHaveLength(2);
  });

  it('reads every kind of no as a 403 and keeps it for one minute only', async () => {
    const nos: [string, Answer][] = [
      ['no premium entitlement', OK(subscriber({ entitlement: false }))],
      ['an expired one', OK(subscriber({ expiresMs: NOW - 1 }))],
      ['a lifetime (null) expiry', OK(subscriber({ expiresMs: null }))],
      ['a brand-new empty customer (201)', { status: 201, body: EMPTY_CUSTOMER }],
      ['a 404', { status: 404, body: {} }],
      ['a promotional grant', OK(subscriber({ store: 'promotional' }))],
      ['a store we do not sell through', OK(subscriber({ store: 'stripe' }))],
      ['no product row', OK(subscriber({ row: false }))],
      ['a refund', OK(subscriber({ refunded: '2027-01-10T00:00:00Z' }))],
    ];
    for (const [label, answer] of nos) {
      const db = await sqliteD1();
      seed(db, ID);
      const f = rc(answer);
      expect(await check(db, ID, NOW, f), label).toEqual({ ok: false, status: 403 });
      expect(await check(db, ID, NOW + MIN - 1, f), label).toEqual({ ok: false, status: 403 });
      expect(f.calls, label).toHaveLength(1);
      await check(db, ID, NOW + MIN, f);
      expect(f.calls, label).toHaveLength(2); // a re-subscribe unlocks within a minute
    }
  });

  it('counts a customer RevenueCat had just created as unknown', async () => {
    const db = await sqliteD1();
    await check(db, ID, NOW, rc({ status: 201, body: EMPTY_CUSTOMER }));
    expect(counts(db)).toMatchObject({ 'premium.store.lookup': 1, 'premium.store.unknown': 1, 'premium.store.no': 1 });
  });

  // Two misses either side of a refund: the later check's answer must win whatever order the writes land in.
  it('never lets an older check overwrite a newer one', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const hash = await purchaserHash(ID, SECRET);
    // A newer check (at NOW + 5 s) already wrote a no, which has since run out from the older request's view.
    db.raw.prepare('INSERT INTO store_premium_cache (id_hash, premium, sandbox, expires_at, checked_at) VALUES (?, 0, 0, ?, ?)').run(hash, NOW, NOW + 5000);
    expect((await check(db, ID, NOW + 1000, rc(OK()))).ok).toBe(true); // this request's own answer stands
    expect(await cacheRow(db, ID)).toMatchObject({ premium: 0, checked_at: NOW + 5000 }); // the newer no is kept
  });

  it('a cache write that fails after a good answer still serves it', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const flaky: D1LikeDatabase = {
      prepare(sql: string) {
        if (sql.startsWith('INSERT INTO store_premium_cache')) throw new Error('d1 hiccup');
        return db.prepare(sql);
      },
    };
    expect((await check(flaky, ID, NOW, rc(OK()))).ok).toBe(true);
  });
});

describe('sandbox: honoured for any id, inside a daily allowance per purchase and a ceiling for everyone', () => {
  const SANDBOX = OK(subscriber({ sandbox: true, expiresMs: NOW + 5 * MIN }));

  it('serves an active sandbox purchase even when our webhook never logged it, and marks the cached yes', async () => {
    const db = await sqliteD1();
    expect(await check(db, ID, NOW, rc(SANDBOX))).toMatchObject({ ok: true, userId: null });
    expect(await cacheRow(db, ID)).toMatchObject({ premium: 1, sandbox: 1 });
    expect(counts(db)).toMatchObject({ 'premium.store.sandbox': 1 });
  });

  it('looks up an id with a logged sandbox purchase in the known lane, out of a flood\'s way', async () => {
    const db = await sqliteD1();
    seed(db, ID, { environment: 'SANDBOX', outcome: 'sandbox' });
    setCounter(db, 'lookup', Math.floor(NOW / MIN), STORE_LOOKUPS_PER_MINUTE); // the fallback lane is full
    expect((await check(db, ID, NOW, rc(SANDBOX))).ok).toBe(true);
  });

  it('gives each purchase its own day: the 41st served request answers 503 (try again), never 403', async () => {
    const db = await sqliteD1();
    const f = rc(SANDBOX);
    for (let i = 0; i < STORE_SANDBOX_PER_PURCHASER_PER_DAY; i++) expect((await check(db, ID, NOW + i, f)).ok, `request ${i + 1}`).toBe(true);
    expect(f.calls).toHaveLength(1); // the cache hits counted too
    expect(await check(db, ID, NOW + 100, f)).toEqual({ ok: false, status: 503 });
    expect(counts(db)['premium.store.sandbox.spent']).toBe(1);
    expect((await check(db, idN(2), NOW + 200, f)).ok).toBe(true); // another tester still has their own allowance
  });

  it('stops everyone at the daily ceiling, and a new UTC day resets both', async () => {
    const db = await sqliteD1();
    setCounter(db, 'sandbox', Math.floor(NOW / DAY), STORE_SANDBOX_PER_DAY);
    expect(await check(db, ID, NOW, rc(SANDBOX))).toEqual({ ok: false, status: 503 });
    const tomorrow = (Math.floor(NOW / DAY) + 1) * DAY;
    expect((await check(db, ID, tomorrow, rc(OK(subscriber({ sandbox: true, expiresMs: tomorrow + 5 * MIN })))))).toMatchObject({ ok: true });
  });

  it('never spends the sandbox allowance on a production purchase', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    setCounter(db, 'sandbox', Math.floor(NOW / DAY), STORE_SANDBOX_PER_DAY);
    expect((await check(db, ID, NOW, rc(OK()))).ok).toBe(true);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM store_premium_counts WHERE kind LIKE 'sandbox:%'").get()).toEqual({ n: 0 });
  });

  // A sandbox month lasts five minutes and renews as it ends, so the re-check lands on the renewal.
  it('keeps a sandbox month alive ten minutes past its expiry, unless it was cancelled or its billing failed', async () => {
    const lapsed = (minutesAgo: number, extra: { unsubscribe?: string; billing?: string } = {}) =>
      OK(subscriber({ sandbox: true, expiresMs: NOW - minutesAgo * MIN, ...extra }));
    const run = async (answer: Answer) => check(await sqliteD1(), ID, NOW, rc(answer));
    expect((await run(lapsed(5))).ok).toBe(true);
    expect(await run(lapsed(11))).toEqual({ ok: false, status: 403 });
    expect(await run(lapsed(5, { unsubscribe: '2027-01-15T07:50:00Z' }))).toEqual({ ok: false, status: 403 });
    expect(await run(lapsed(5, { billing: '2027-01-15T07:50:00Z' }))).toEqual({ ok: false, status: 403 });
    // Production never gets the grace: Apple renews ahead of expiry there.
    const db = await sqliteD1();
    seed(db, ID);
    expect(await check(db, ID, NOW, rc(OK(subscriber({ expiresMs: NOW - MIN }))))).toEqual({ ok: false, status: 403 });
  });

  it('caches a sandbox yes until ten minutes past its expiry at most', async () => {
    const db = await sqliteD1();
    await check(db, ID, NOW, rc(SANDBOX));
    expect((await cacheRow(db, ID))?.expires_at).toBe(NOW + 15 * MIN);
  });

  it('does not remember a no that replaces a sandbox yes: the next tap asks again', async () => {
    const db = await sqliteD1();
    const f = rc(SANDBOX, OK(subscriber({ sandbox: true, expiresMs: NOW - HOUR })));
    expect((await check(db, ID, NOW, f)).ok).toBe(true);
    expect(await check(db, ID, NOW + 15 * MIN, f)).toEqual({ ok: false, status: 403 });
    expect(await check(db, ID, NOW + 15 * MIN + 1000, f)).toEqual({ ok: false, status: 403 });
    expect(f.calls).toHaveLength(3); // no minute-long no in between
  });
});

describe('fails closed, and never caches what it could not read', () => {
  const cases: [string, Answer][] = [
    ['a 500', { status: 500 }],
    ['a 401 for our own key', { status: 401 }],
    ['a network failure', 'reject'],
    ['a 200 that is not JSON', 'garbled'],
    ['JSON with no subscriber', OK({ request_date: 'x' })],
  ];
  for (const [label, answer] of cases) {
    it(`answers 503 for ${label}, caching nothing`, async () => {
      const db = await sqliteD1();
      seed(db, ID);
      expect(await check(db, ID, NOW, rc(answer))).toEqual({ ok: false, status: 503 });
      expect(cacheSize(db)).toBe(0);
      expect(counts(db)['premium.store.error']).toBe(1);
    });
  }

  it('answers 503 once RevenueCat takes longer than the timeout', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    expect(await check(db, ID, NOW, rc('hang'), 20)).toEqual({ ok: false, status: 503 });
    expect(cacheSize(db)).toBe(0);
  });

  it('stops asking for the rest of the minute after RevenueCat answers 429, in both lanes', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const f = rc({ status: 429 }, OK());
    expect(await check(db, ID, NOW, f)).toEqual({ ok: false, status: 503 });
    expect(await check(db, ID, NOW + 30_000, f)).toEqual({ ok: false, status: 503 });
    expect(await check(db, idN(3), NOW + 30_000, f)).toEqual({ ok: false, status: 503 });
    expect(f.calls).toHaveLength(1);
    expect(counts(db)['premium.store.throttled']).toBe(1);
    expect((await check(db, ID, NOW + MIN, f)).ok).toBe(true); // the next minute asks again
  });

  it('answers 503 without asking anybody when D1 or the secret is missing, or D1 throws', async () => {
    const f = rc(OK());
    expect(await checkStorePremium(ID, { RC_SECRET_KEY: SECRET }, NOW, { doFetch: f.doFetch })).toEqual({ ok: false, status: 503 });
    expect(await checkStorePremium(ID, { DB: await sqliteD1() }, NOW, { doFetch: f.doFetch })).toEqual({ ok: false, status: 503 });
    const broken: D1LikeDatabase = {
      prepare() {
        throw new Error('D1 unavailable');
      },
    };
    expect(await check(broken, ID, NOW, f)).toEqual({ ok: false, status: 503 });
    expect(f.calls).toHaveLength(0);
  });

  it('answers 503 when a counter cannot be written, rather than serve without its cap', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const noCounts: D1LikeDatabase = {
      prepare(sql: string) {
        if (sql.startsWith('INSERT INTO store_premium_counts')) throw new Error('d1 hiccup');
        return db.prepare(sql);
      },
    };
    expect(await check(noCounts, ID, NOW, rc(OK()))).toEqual({ ok: false, status: 503 });
  });
});

describe('the caps', () => {
  it('lets 10 lookups a minute through for ids our webhook never saw buy, then 503 with no call, and a known buyer is never held up by it', async () => {
    const db = await sqliteD1();
    const f = rc({ status: 201, body: EMPTY_CUSTOMER });
    for (let i = 1; i <= STORE_LOOKUPS_PER_MINUTE; i++) expect(await check(db, idN(i), NOW + i, f)).toEqual({ ok: false, status: 403 });
    expect(f.calls).toHaveLength(STORE_LOOKUPS_PER_MINUTE);
    expect(await check(db, idN(99), NOW + 100, f)).toEqual({ ok: false, status: 503 });
    expect(await check(db, idN(98), NOW + 200, f)).toEqual({ ok: false, status: 503 });
    expect(f.calls).toHaveLength(STORE_LOOKUPS_PER_MINUTE);
    expect(counts(db)['premium.store.capped']).toBe(1); // once a minute, not once a request

    seed(db, ID); // a real buyer, in the same full minute
    expect((await check(db, ID, NOW + 300, rc(OK()))).ok).toBe(true);
    expect(await check(db, idN(97), NOW + MIN, f)).toEqual({ ok: false, status: 403 }); // and the next minute opens again
    expect(f.calls).toHaveLength(STORE_LOOKUPS_PER_MINUTE + 1);
  });

  it('caps lookups for known buyers at 60 a minute', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    setCounter(db, 'lookup.known', Math.floor(NOW / MIN), STORE_KNOWN_LOOKUPS_PER_MINUTE);
    const f = rc(OK());
    expect(await check(db, ID, NOW, f)).toEqual({ ok: false, status: 503 });
    expect(f.calls).toHaveLength(0);
    expect(counts(db)['premium.store.capped.known']).toBe(1);
  });

  it('always serves a cached yes, however full the lookup caps are', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    await check(db, ID, NOW, rc(OK()));
    setCounter(db, 'lookup.known', Math.floor((NOW + MIN) / MIN), STORE_KNOWN_LOOKUPS_PER_MINUTE);
    setCounter(db, 'lookup', Math.floor((NOW + MIN) / MIN), STORE_LOOKUPS_PER_MINUTE);
    expect((await check(db, ID, NOW + MIN, rc(OK()))).ok).toBe(true);
  });

  it('holds one purchase to 60 requests an hour (429), and opens again the next hour', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    await check(db, ID, NOW, rc(OK()));
    setCounter(db, `served:${await purchaserHash(ID, SECRET)}`, Math.floor(NOW / HOUR), STORE_SERVED_PER_HOUR);
    expect(await check(db, ID, NOW + 1000, rc(OK()))).toEqual({ ok: false, status: 429 });
    expect(await check(db, ID, NOW + 2000, rc(OK()))).toEqual({ ok: false, status: 429 });
    expect(counts(db)['premium.store.overused']).toBe(1);
    expect((await check(db, ID, NOW + HOUR, rc(OK()))).ok).toBe(true);
  });
});

describe('the id is never stored or logged', () => {
  afterEach(() => vi.restoreAllMocks());

  it('leaves no raw id in any table but the webhook\'s own log, and none in the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const db = await sqliteD1();
    const ids = [ID, idN(2), idN(3), idN(4), idN(5)];
    seed(db, ID);
    seed(db, idN(5));
    await check(db, ID, NOW, rc(OK())); // a production yes
    await check(db, ID, NOW + 1, rc(OK())); // served from the cache
    await check(db, idN(2), NOW, rc(OK(subscriber({ sandbox: true, expiresMs: NOW + 5 * MIN })))); // a sandbox yes
    await check(db, idN(3), NOW, rc(OK(subscriber({ original: UID })))); // unproven
    await check(db, idN(4), NOW, rc({ status: 500 })); // an error
    await refuseForAccount(db, SECRET, [idN(5)], NOW);
    await check(db, idN(5), NOW, rc(OK())); // refused

    const tables = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'rc_events'").all() as { name: string }[]).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['store_premium_cache', 'store_premium_counts', 'store_premium_refused', 'app_event_counts']));
    for (const table of tables) {
      const dump = JSON.stringify(db.raw.prepare(`SELECT * FROM ${table}`).all());
      expect(dump, table).not.toContain('RCAnonymousID');
      for (const id of ids) expect(dump, table).not.toContain(id.slice(15));
    }
    for (const r of db.raw.prepare('SELECT id_hash FROM store_premium_cache UNION ALL SELECT id_hash FROM store_premium_refused').all() as { id_hash: string }[]) {
      expect(r.id_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const r of db.raw.prepare('SELECT kind FROM store_premium_counts').all() as { kind: string }[]) {
      expect(r.kind).toMatch(/^(lookup|lookup\.known|sandbox|served:[0-9a-f]{64}|sandbox:[0-9a-f]{64})$/);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('purgeStorePremium (the :00 tick)', () => {
  it('deletes answers past their expiry and every counter whose minute, hour or day is over, and keeps the rest', async () => {
    const db = await sqliteD1();
    const put = (hash: string, expiresAt: number) =>
      db.raw.prepare('INSERT INTO store_premium_cache (id_hash, premium, sandbox, expires_at, checked_at) VALUES (?, 1, 0, ?, ?)').run(hash, expiresAt, NOW - HOUR);
    put('a'.repeat(64), NOW - 1);
    put('b'.repeat(64), NOW + MIN);
    const minute = Math.floor(NOW / MIN);
    const hour = Math.floor(NOW / HOUR);
    const day = Math.floor(NOW / DAY);
    for (const [kind, slot] of [
      ['lookup', minute - 1], ['lookup', minute], ['lookup.known', minute - 1], ['lookup.known', minute],
      [`served:${'c'.repeat(64)}`, hour - 1], [`served:${'c'.repeat(64)}`, hour],
      ['sandbox', day - 1], ['sandbox', day], [`sandbox:${'d'.repeat(64)}`, day - 1], [`sandbox:${'d'.repeat(64)}`, day],
    ] as [string, number][]) setCounter(db, kind, slot, 3);
    db.raw.prepare("INSERT INTO store_premium_refused (id_hash, why, at) VALUES (?, 'account', ?)").run('e'.repeat(64), NOW - 400 * DAY);

    await purgeStorePremium(db, NOW);

    expect(db.raw.prepare('SELECT id_hash FROM store_premium_cache').all()).toEqual([{ id_hash: 'b'.repeat(64) }]);
    const left = (db.raw.prepare('SELECT kind, slot FROM store_premium_counts ORDER BY kind').all() as { kind: string; slot: number }[]).map((r) => `${r.kind.slice(0, 12)}@${r.slot}`);
    expect(left.sort()).toEqual([`lookup.known@${minute}`, `lookup@${minute}`, `sandbox:dddd@${day}`, `sandbox@${day}`, `served:ccccc@${hour}`].sort());
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM store_premium_refused').get()).toEqual({ n: 1 }); // refusals are kept
  });

  it('never throws: no binding, or tables that do not exist yet', async () => {
    await expect(purgeStorePremium(undefined, NOW)).resolves.toBeUndefined();
    const db = await sqliteD1();
    db.raw.exec('DROP TABLE store_premium_cache; DROP TABLE store_premium_counts;');
    await expect(purgeStorePremium(db, NOW)).resolves.toBeUndefined();
  });
});

describe('the tables the check needs', () => {
  it('creates them, and the rc_events index, when a database does not have them yet', async () => {
    const db = await sqliteD1();
    db.raw.exec('DROP TABLE store_premium_cache; DROP TABLE store_premium_counts; DROP TABLE store_premium_refused; DROP INDEX rc_events_app_user;');
    seed(db, ID);
    expect((await check(db, ID, NOW, rc(OK()))).ok).toBe(true);
    const names = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')").all() as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['store_premium_cache', 'store_premium_counts', 'store_premium_refused', 'rc_events_app_user']));
  });

  it('creates them in one round trip where the binding can batch, once per binding', async () => {
    const db = await sqliteD1();
    seed(db, ID);
    const batches: number[] = [];
    const batching = {
      prepare: (sql: string) => db.prepare(sql),
      async batch(statements: { run(): Promise<unknown> }[]) {
        batches.push(statements.length);
        for (const s of statements) await s.run();
        return [];
      },
    } as unknown as D1LikeDatabase;
    await check(batching, ID, NOW, rc(OK()));
    await check(batching, ID, NOW + HOUR, rc(OK()));
    expect(batches).toEqual([6]);
  });
});
