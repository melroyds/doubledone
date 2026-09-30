import { describe, expect, it, vi } from 'vitest';

import type { D1LikeDatabase } from './entitlements';
import {
  appUserIdFromRcEvent,
  entitlementFromRcEvent,
  EXPIRY_SKEW_MS,
  handleRcWebhook,
  isSandboxEvent,
  rcEventRow,
  rcIgnoreOutcome,
  sandboxAllowlist,
  sourceForStore,
  verifyRcAuth,
} from './revenuecat';
import { readEntitlement, writeEntitlement } from './entitlements';
import { sqliteD1 } from './sqlite-d1.test-helper';

const UID = '11111111-2222-3333-4444-555555555555';
const NOW_MS = 1_800_000_000_000; // fixed "now" for the stale-expiration guard
const HOUR_MS = 3_600_000;

// A RevenueCat v1 webhook event (the inner `event` object). Overridable per test.
function rcEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'INITIAL_PURCHASE',
    id: 'rc-evt-1',
    app_user_id: UID,
    aliases: [UID],
    entitlement_ids: ['premium'],
    expiration_at_ms: NOW_MS + 30 * 24 * HOUR_MS,
    environment: 'PRODUCTION',
    event_timestamp_ms: NOW_MS,
    ...over,
  };
}

// The same in-memory D1 double the Stripe tests use, trimmed to what the webhook touches.
function fakeDb(): D1LikeDatabase & { rows: Map<string, Record<string, unknown>>; seen: Set<string>; events: unknown[][] } {
  const rows = new Map<string, Record<string, unknown>>();
  const seen = new Set<string>();
  const events: unknown[][] = [];
  return {
    rows,
    seen,
    events,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
          // rc_events FIRST. Without this branch the audit INSERT (and its bare DDL) would fall
          // through to the entitlements upsert below, silently corrupting `rows` and breaking most
          // of the tests in this file for reasons that would look nothing like the cause.
          if (sql.includes('rc_events')) {
            if (sql.startsWith('INSERT')) events.push(args);
            return;
          }
          if (sql.includes('processed_events')) {
            seen.add(args[0] as string);
            return;
          }
          // entitlements upsert (positional, mirrors writeEntitlement's bind order)
          const [userId, premium, status, cpe, cancelAtEnd, startedAt, customerId, source, updatedAt] = args as never[];
          const existing = rows.get(userId as string);
          rows.set(userId as string, {
            user_id: userId,
            premium,
            status,
            current_period_end: (cpe as number | null) ?? (existing?.current_period_end as number | null) ?? null,
            cancel_at_period_end: cancelAtEnd,
            started_at: (existing?.started_at as string | null) ?? startedAt,
            stripe_customer_id: (customerId as string | null) ?? (existing?.stripe_customer_id as string | null) ?? null,
            source,
            updated_at: updatedAt,
          });
        },
        async first<T>() {
          if (sql.includes('processed_events')) return (seen.has(args[0] as string) ? ({ 1: 1 } as T) : null);
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

describe('verifyRcAuth', () => {
  const req = (auth?: string) => new Request('https://api.doubledone.app/rc-webhook', auth ? { headers: { Authorization: auth } } : undefined);
  it('accepts the exact configured secret', () => {
    expect(verifyRcAuth(req('super-secret'), 'super-secret')).toBe(true);
  });
  it('rejects a mismatch, a missing header, and an empty secret', () => {
    expect(verifyRcAuth(req('wrong'), 'super-secret')).toBe(false);
    expect(verifyRcAuth(req(), 'super-secret')).toBe(false);
    expect(verifyRcAuth(req('anything'), '')).toBe(false);
  });
});

describe('appUserIdFromRcEvent', () => {
  it('returns a UUID app_user_id', () => {
    expect(appUserIdFromRcEvent(rcEvent())).toBe(UID);
  });
  it('falls back to a UUID in aliases when app_user_id is anonymous', () => {
    expect(appUserIdFromRcEvent(rcEvent({ app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', UID] }))).toBe(UID);
  });
  it('returns null for an anonymous id with no UUID alias (never writes a garbage row)', () => {
    expect(appUserIdFromRcEvent(rcEvent({ app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc'] }))).toBeNull();
  });
  it('returns null for junk', () => {
    expect(appUserIdFromRcEvent(rcEvent({ app_user_id: 'not-a-uuid', aliases: [] }))).toBeNull();
    expect(appUserIdFromRcEvent({})).toBeNull();
  });
});

describe('entitlementFromRcEvent', () => {
  // THE assertion this whole file exists for. CANCELLATION means auto-renew was turned off,
  // NOT loss of access. Access runs to the period end. Getting this wrong revokes a paying
  // customer at the exact moment they exercised a choice.
  it('CANCELLATION keeps premium ON, flags the pending cancel', () => {
    const ent = entitlementFromRcEvent(rcEvent({ type: 'CANCELLATION' }), NOW_MS);
    expect(ent).not.toBeNull();
    expect(ent!.premium).toBe(true);
    expect(ent!.status).toBe('canceled');
    expect(ent!.cancelAtPeriodEnd).toBe(true);
    expect(ent!.source).toBe('apple');
  });

  it('a CUSTOMER_SUPPORT cancellation is a refund and DOES revoke', () => {
    const ent = entitlementFromRcEvent(rcEvent({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }), NOW_MS);
    expect(ent!.premium).toBe(false);
  });

  it('BILLING_ISSUE keeps premium ON (Apple runs a grace period)', () => {
    const ent = entitlementFromRcEvent(rcEvent({ type: 'BILLING_ISSUE' }), NOW_MS);
    expect(ent!.premium).toBe(true);
    expect(ent!.status).toBe('past_due');
  });

  it('grants on the whole purchase/renewal family, period end from expiration_at_ms in SECONDS', () => {
    for (const type of ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']) {
      const exp = NOW_MS + 10 * 24 * HOUR_MS;
      const ent = entitlementFromRcEvent(rcEvent({ type, expiration_at_ms: exp }), NOW_MS);
      expect(ent!.premium, type).toBe(true);
      expect(ent!.status, type).toBe('active');
      expect(ent!.cancelAtPeriodEnd, type).toBe(false);
      expect(ent!.currentPeriodEnd, type).toBe(Math.floor(exp / 1000));
    }
  });

  it('NON_RENEWING_PURCHASE grants but flags it will not renew', () => {
    const ent = entitlementFromRcEvent(rcEvent({ type: 'NON_RENEWING_PURCHASE' }), NOW_MS);
    expect(ent!.premium).toBe(true);
    expect(ent!.cancelAtPeriodEnd).toBe(true);
  });

  it('EXPIRATION in the PAST revokes', () => {
    const ent = entitlementFromRcEvent(rcEvent({ type: 'EXPIRATION', expiration_at_ms: NOW_MS - HOUR_MS }), NOW_MS);
    expect(ent!.premium).toBe(false);
    expect(ent!.status).toBe('expired');
  });

  it('EXPIRATION in the FUTURE does NOT revoke (out-of-order delivery guard)', () => {
    // an EXPIRATION overtaking a RENEWAL must not kill a live subscriber
    expect(entitlementFromRcEvent(rcEvent({ type: 'EXPIRATION', expiration_at_ms: NOW_MS + HOUR_MS }), NOW_MS)).toBeNull();
  });

  it('an event whose entitlement_ids lacks premium is ignored', () => {
    expect(entitlementFromRcEvent(rcEvent({ entitlement_ids: ['some_other'] }), NOW_MS)).toBeNull();
    expect(entitlementFromRcEvent(rcEvent({ type: 'EXPIRATION', entitlement_ids: [] }), NOW_MS)).toBeNull();
  });

  it('TEST, SUBSCRIPTION_PAUSED and unknown types are ignored (null)', () => {
    expect(entitlementFromRcEvent(rcEvent({ type: 'TEST' }), NOW_MS)).toBeNull();
    expect(entitlementFromRcEvent(rcEvent({ type: 'SUBSCRIPTION_PAUSED' }), NOW_MS)).toBeNull();
    expect(entitlementFromRcEvent(rcEvent({ type: 'WHATEVER_NEW_THING' }), NOW_MS)).toBeNull();
  });

  it('an anonymous-only event resolves to no user and is ignored', () => {
    expect(entitlementFromRcEvent(rcEvent({ app_user_id: '$RCAnonymousID:x', aliases: [] }), NOW_MS)).toBeNull();
  });
});

// Module scope, so the delivery-log suite at the bottom of this file shares them rather than
// keeping a second, slightly-different copy that could drift.
const rawReq = (body: unknown, auth = 'secret') =>
  new Request('https://api.doubledone.app/rc-webhook', { method: 'POST', headers: { Authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const env = (db: D1LikeDatabase) => ({ DB: db, RC_WEBHOOK_AUTH: 'secret' });

describe('handleRcWebhook', () => {
  it('503s when no secret is configured', async () => {
    const res = await handleRcWebhook(rawReq({ event: rcEvent() }), { DB: fakeDb() }, '2026-07-18T00:00:00Z', NOW_MS);
    expect(res.status).toBe(503);
  });

  it('401s a wrong Authorization header and writes nothing', async () => {
    const db = fakeDb();
    const res = await handleRcWebhook(rawReq({ event: rcEvent() }, 'wrong'), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(res.status).toBe(401);
    expect(db.rows.size).toBe(0);
  });

  it('grants premium on INITIAL_PURCHASE', async () => {
    const db = fakeDb();
    const res = await handleRcWebhook(rawReq({ event: rcEvent() }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(res.status).toBe(200);
    expect(db.rows.get(UID)?.premium).toBe(1);
    expect(db.rows.get(UID)?.source).toBe('apple');
  });

  it('a redelivered event (same rc: id) is a no-op the second time', async () => {
    const db = fakeDb();
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'dup-1' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    // flip the row to prove the second delivery does not re-write
    db.rows.set(UID, { ...db.rows.get(UID), premium: 0 });
    const res = await handleRcWebhook(rawReq({ event: rcEvent({ id: 'dup-1' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(res.status).toBe(200);
    expect(db.rows.get(UID)?.premium).toBe(0); // untouched: the duplicate was skipped
  });

  it('200s and writes nothing for an ignored (TEST) event', async () => {
    const db = fakeDb();
    const res = await handleRcWebhook(rawReq({ event: rcEvent({ type: 'TEST' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(res.status).toBe(200);
    expect(db.rows.size).toBe(0);
  });

  it('TRANSFER writes nothing and alerts the owner (should-never-happen under keep-with-original)', async () => {
    const db = fakeDb();
    const send = vi.fn().mockResolvedValue(undefined);
    const res = await handleRcWebhook(
      rawReq({ event: rcEvent({ type: 'TRANSFER' }) }),
      { DB: db, RC_WEBHOOK_AUTH: 'secret', SEND_EMAIL: { send }, FEEDBACK_TO: 'owner@x.com' },
      '2026-07-18T00:00:00Z',
      NOW_MS,
    );
    expect(res.status).toBe(200);
    expect(db.rows.size).toBe(0);
  });

  it('still writes when the dedup store throws (fail open on a billing event)', async () => {
    const db = fakeDb();
    const throwingSeen: D1LikeDatabase = {
      prepare(sql: string) {
        if (sql.includes('SELECT 1 FROM processed_events')) {
          return { bind: () => ({ first: async () => { throw new Error('dedup down'); } }) } as never;
        }
        return db.prepare(sql);
      },
    };
    const res = await handleRcWebhook(rawReq({ event: rcEvent() }), { DB: throwingSeen, RC_WEBHOOK_AUTH: 'secret' }, '2026-07-18T00:00:00Z', NOW_MS);
    expect(res.status).toBe(200);
    expect(db.rows.get(UID)?.premium).toBe(1);
  });
});

// The audit log (2026-08-19). A customer asked why Apple had billed them, and answering it took a
// full day across two third-party dashboards, because this webhook read past `period_type` and
// `environment` and kept no history at all. These tests exist so that can never be true again.
describe('the RevenueCat delivery log', () => {
  // The bind order of the INSERT in logRcEvent, so a test can read a logged row by name.
  const COLS = [
    'event_id', 'type', 'period_type', 'environment', 'store', 'product_id', 'app_user_id',
    'original_transaction_id', 'user_id', 'price', 'price_in_purchased_currency', 'currency',
    'is_trial_conversion', 'applied', 'outcome', 'event_timestamp_ms', 'created_at',
  ] as const;
  const logged = (db: { events: unknown[][] }, i = 0): Record<string, unknown> =>
    Object.fromEntries(COLS.map((c, n) => [c, db.events[i]?.[n]]));

  // THE defect, named. Both fields were present on every event and thrown away.
  it('captures the two fields the old code discarded', () => {
    const row = rcEventRow(rcEvent({ period_type: 'TRIAL', environment: 'SANDBOX' }), 'applied');
    expect(row.periodType).toBe('TRIAL');
    expect(row.environment).toBe('SANDBOX');
  });

  it('is total: junk never throws, and a wrong-typed field lands as null rather than as itself', () => {
    expect(rcEventRow({}, 'no-op').type).toBe('');
    expect(rcEventRow(null, 'no-op').eventId).toBeNull();
    expect(rcEventRow(undefined, 'no-op').userId).toBeNull();
    // A string price must never reach a REAL column, nor an integer a text one.
    const odd = rcEventRow(rcEvent({ price: '4.99', environment: 42, currency: '' }), 'applied');
    expect(odd.price).toBeNull();
    expect(odd.environment).toBeNull();
    expect(odd.currency).toBeNull(); // an empty string is not a value worth keeping
  });

  // The invisible paying customer this table exists for.
  it('preserves an anonymous app_user_id while resolving no user at all', () => {
    const row = rcEventRow(rcEvent({ app_user_id: '$RCAnonymousID:abc', aliases: [] }), 'unresolved-user');
    expect(row.appUserId).toBe('$RCAnonymousID:abc');
    expect(row.userId).toBeNull();
  });

  // Three-valued on purpose: "not stated" and "not a conversion" are different billing answers.
  it('keeps is_trial_conversion three-valued, never collapsing missing to 0', () => {
    expect(rcEventRow(rcEvent({ is_trial_conversion: true }), 'applied').isTrialConversion).toBe(1);
    expect(rcEventRow(rcEvent({ is_trial_conversion: false }), 'applied').isTrialConversion).toBe(0);
    expect(rcEventRow(rcEvent(), 'applied').isTrialConversion).toBeNull();
  });

  it('sets applied only for the one outcome that means the write actually happened', () => {
    expect(rcEventRow(rcEvent(), 'applied').applied).toBe(1);
    for (const o of ['duplicate', 'transfer', 'unresolved-user', 'other-entitlement', 'stale-expiration', 'sandbox', 'no-op'] as const) {
      expect(rcEventRow(rcEvent(), o).applied).toBe(0);
    }
  });

  it('names WHY an event was ignored, in the same precedence the mapper uses', () => {
    expect(rcIgnoreOutcome(rcEvent({ app_user_id: '$RCAnonymousID:x', aliases: [] }), NOW_MS)).toBe('unresolved-user');
    expect(rcIgnoreOutcome(rcEvent({ entitlement_ids: ['some_other'] }), NOW_MS)).toBe('other-entitlement');
    expect(rcIgnoreOutcome(rcEvent({ type: 'EXPIRATION', expiration_at_ms: NOW_MS + HOUR_MS }), NOW_MS)).toBe('stale-expiration');
    expect(rcIgnoreOutcome(rcEvent({ type: 'TEST' }), NOW_MS)).toBe('no-op');
    // User FIRST, matching entitlementFromRcEvent: an anonymous event that ALSO lacks premium
    // reports the user problem, because that is the branch the mapper actually hit.
    expect(rcIgnoreOutcome(rcEvent({ app_user_id: '$RCAnonymousID:x', aliases: [], entitlement_ids: ['other'] }), NOW_MS)).toBe('unresolved-user');
  });

  // The mirror invariant. If these two drift, the log starts explaining events with the wrong
  // reason, which is worse than not explaining them.
  it('never reports an ignore reason for an event the mapper actually accepts', () => {
    for (const e of [rcEvent(), rcEvent({ type: 'RENEWAL' }), rcEvent({ type: 'CANCELLATION' })]) {
      expect(entitlementFromRcEvent(e, NOW_MS)).not.toBeNull();
    }
    for (const e of [
      rcEvent({ app_user_id: '$RCAnonymousID:x', aliases: [] }),
      rcEvent({ entitlement_ids: ['other'] }),
      rcEvent({ type: 'TEST' }),
    ]) {
      expect(entitlementFromRcEvent(e, NOW_MS)).toBeNull();
      expect(rcIgnoreOutcome(e, NOW_MS)).not.toBe('applied');
    }
  });

  it('logs one applied row alongside the entitlement write', async () => {
    const db = fakeDb();
    await handleRcWebhook(rawReq({ event: rcEvent() }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(db.events).toHaveLength(1);
    expect(logged(db)).toMatchObject({ outcome: 'applied', applied: 1, environment: 'PRODUCTION', user_id: UID });
  });

  // THE ONE THAT MATTERS. The anonymous payer still writes no entitlement and still 200s, and is
  // now visible instead of vanishing without trace.
  it('logs the anonymous purchase that writes no entitlement row', async () => {
    const db = fakeDb();
    const res = await handleRcWebhook(
      rawReq({ event: rcEvent({ app_user_id: '$RCAnonymousID:x', aliases: [] }) }),
      env(db), '2026-07-18T00:00:00Z', NOW_MS,
    );
    expect(res.status).toBe(200);
    expect(db.rows.size).toBe(0);
    expect(logged(db)).toMatchObject({ outcome: 'unresolved-user', applied: 0, app_user_id: '$RCAnonymousID:x', user_id: null });
  });

  it('logs a TRANSFER, which still writes no entitlement', async () => {
    const db = fakeDb();
    await handleRcWebhook(rawReq({ event: rcEvent({ type: 'TRANSFER' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(db.rows.size).toBe(0);
    expect(logged(db)).toMatchObject({ outcome: 'transfer', type: 'TRANSFER' });
  });

  it('logs the second delivery of a duplicate as such', async () => {
    const db = fakeDb();
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'dup-2' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'dup-2' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(db.events).toHaveLength(2);
    expect(logged(db, 1)).toMatchObject({ outcome: 'duplicate', applied: 0 });
  });

  // FAIL OPEN. Observability that can break a billing path is worse than no observability.
  it('still grants premium when the log store is broken', async () => {
    const db = fakeDb();
    const broken: D1LikeDatabase = {
      prepare(sql: string) {
        if (sql.includes('rc_events')) throw new Error('no such table: rc_events');
        return db.prepare(sql);
      },
    };
    const res = await handleRcWebhook(rawReq({ event: rcEvent() }), env(broken), '2026-07-18T00:00:00Z', NOW_MS);
    expect(res.status).toBe(200);
    expect(db.rows.get(UID)?.premium).toBe(1);
  });
});

// Sandbox contamination (found 2026-08-19). Nothing here read `environment`, so StoreKit sandbox
// and TestFlight events, running on Apple's accelerated fake clock with no money moving, were
// processed identically to real charges and wrote the PRODUCTION entitlements table.
describe('sandbox deliveries never reach the store of record', () => {
  it('recognises SANDBOX, case-insensitively, and nothing else', () => {
    expect(isSandboxEvent(rcEvent({ environment: 'SANDBOX' }))).toBe(true);
    expect(isSandboxEvent(rcEvent({ environment: 'sandbox' }))).toBe(true);
    expect(isSandboxEvent(rcEvent({ environment: 'PRODUCTION' }))).toBe(false);
  });

  // FAILS OPEN on purpose. "We were not told" must never be read as sandbox, because dropping a
  // real purchase costs a paying customer their access, which is far worse than a stray test row.
  it('fails OPEN when environment is missing or not a string', () => {
    expect(isSandboxEvent(rcEvent({ environment: undefined }))).toBe(false);
    expect(isSandboxEvent(rcEvent({ environment: 42 }))).toBe(false);
    expect(isSandboxEvent({})).toBe(false);
    expect(isSandboxEvent(null)).toBe(false);
  });

  it('acknowledges a sandbox purchase and writes no entitlement', async () => {
    const db = fakeDb();
    const res = await handleRcWebhook(
      rawReq({ event: rcEvent({ environment: 'SANDBOX' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, sandbox: true });
    expect(db.rows.size).toBe(0);
  });

  // Still logged, so testing remains visible rather than becoming a blind spot.
  it('logs the sandbox delivery it refused to apply', async () => {
    const db = fakeDb();
    await handleRcWebhook(rawReq({ event: rcEvent({ environment: 'SANDBOX' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(db.events).toHaveLength(1);
    expect(db.events[0]?.[14]).toBe('sandbox'); // outcome
    expect(db.events[0]?.[13]).toBe(0); // applied
  });

  // THE ONE THAT MATTERS FOR SAFETY. A sandbox event for a user who is ALREADY a real paying
  // subscriber must leave them exactly as they were. Ignoring is what makes that true; writing
  // premium=0 (the "record but non-granting" idea) would BE the revoke this guard exists to prevent.
  it('cannot revoke a real subscriber who also has sandbox traffic', async () => {
    const db = fakeDb();
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'real-1' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(db.rows.get(UID)?.premium).toBe(1);

    await handleRcWebhook(
      rawReq({ event: rcEvent({ id: 'sbx-1', type: 'EXPIRATION', environment: 'SANDBOX', expiration_at_ms: NOW_MS - HOUR_MS }) }),
      env(db), '2026-07-19T00:00:00Z', NOW_MS,
    );
    expect(db.rows.get(UID)?.premium).toBe(1); // untouched
    expect(db.rows.get(UID)?.status).toBe('active');
  });

  it('still applies a PRODUCTION event, so the guard is not just an off switch', async () => {
    const db = fakeDb();
    await handleRcWebhook(rawReq({ event: rcEvent({ environment: 'PRODUCTION' }) }), env(db), '2026-07-18T00:00:00Z', NOW_MS);
    expect(db.rows.get(UID)?.premium).toBe(1);
  });
});

// ---- Path A (2026-09-30): the real store, payment-failure states, clock skew, the sandbox allowlist,
// and the cross-store guard seen from the webhook.
describe('Path A: which store sold it', () => {
  it('maps every store: missing is Apple (as before), Play is google, the rest are never written', () => {
    expect(sourceForStore(undefined)).toBe('apple');
    expect(sourceForStore(null)).toBe('apple');
    expect(sourceForStore('')).toBe('apple');
    expect(sourceForStore('APP_STORE')).toBe('apple');
    expect(sourceForStore('MAC_APP_STORE')).toBe('apple');
    expect(sourceForStore('PLAY_STORE')).toBe('google');
    for (const other of ['PROMOTIONAL', 'STRIPE', 'RC_BILLING', 'TEST_STORE', 'AMAZON', 'play_store', 42]) {
      expect(sourceForStore(other), String(other)).toBeNull();
    }
  });

  it('writes a Play purchase as google, an App Store one as apple, and a promotional grant not at all', () => {
    expect(entitlementFromRcEvent(rcEvent({ store: 'PLAY_STORE', product_id: 'premium:monthly' }), NOW_MS)).toMatchObject({ premium: true, source: 'google' });
    expect(entitlementFromRcEvent(rcEvent({ store: 'APP_STORE' }), NOW_MS)).toMatchObject({ premium: true, source: 'apple' });
    expect(entitlementFromRcEvent(rcEvent(), NOW_MS)).toMatchObject({ source: 'apple' }); // no store field: unchanged
    expect(entitlementFromRcEvent(rcEvent({ store: 'PROMOTIONAL' }), NOW_MS)).toBeNull();
    expect(rcIgnoreOutcome(rcEvent({ store: 'PROMOTIONAL' }), NOW_MS)).toBe('other-store');
  });

  it('keeps the precedence: the user, then the entitlement, then the store', () => {
    expect(rcIgnoreOutcome(rcEvent({ store: 'PROMOTIONAL', entitlement_ids: ['other'] }), NOW_MS)).toBe('other-entitlement');
    expect(rcIgnoreOutcome(rcEvent({ store: 'PROMOTIONAL', app_user_id: '$RCAnonymousID:x', aliases: [] }), NOW_MS)).toBe('unresolved-user');
  });
});

describe('Path A: a failed card is not a person leaving', () => {
  it('CANCELLATION for a BILLING_ERROR keeps premium on, past_due, with no scheduled cancel', () => {
    expect(entitlementFromRcEvent(rcEvent({ type: 'CANCELLATION', cancel_reason: 'BILLING_ERROR', store: 'PLAY_STORE' }), NOW_MS)).toMatchObject({
      premium: true, status: 'past_due', cancelAtPeriodEnd: false, currentPeriodEnd: null, source: 'google',
    });
  });

  it('leaves the other cancel reasons exactly as they were', () => {
    expect(entitlementFromRcEvent(rcEvent({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }), NOW_MS)).toMatchObject({ premium: true, status: 'canceled', cancelAtPeriodEnd: true });
    expect(entitlementFromRcEvent(rcEvent({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }), NOW_MS)).toMatchObject({ premium: false, status: 'canceled' });
  });

  it('an EXPIRATION is expired whatever its reason: no on_hold state yet (it never cleared, review 2026-09-30)', () => {
    const past = NOW_MS - HOUR_MS;
    for (const reason of ['BILLING_ERROR', 'UNSUBSCRIBE', undefined]) {
      expect(entitlementFromRcEvent(rcEvent({ type: 'EXPIRATION', expiration_reason: reason, expiration_at_ms: past }), NOW_MS), String(reason)).toMatchObject({ premium: false, status: 'expired' });
    }
  });
});

describe('Path A: a minute of clock skew', () => {
  it('lands a revoke stamped a few seconds ahead of our clock, still refuses one far ahead', () => {
    expect(EXPIRY_SKEW_MS).toBe(60_000);
    const soon = rcEvent({ type: 'EXPIRATION', expiration_at_ms: NOW_MS + 5_000 });
    expect(entitlementFromRcEvent(soon, NOW_MS)).toMatchObject({ premium: false, status: 'expired' });
    const edge = rcEvent({ type: 'EXPIRATION', expiration_at_ms: NOW_MS + EXPIRY_SKEW_MS });
    expect(entitlementFromRcEvent(edge, NOW_MS)).toMatchObject({ premium: false });
    const far = rcEvent({ type: 'EXPIRATION', expiration_at_ms: NOW_MS + EXPIRY_SKEW_MS + 1 });
    expect(entitlementFromRcEvent(far, NOW_MS)).toBeNull();
    expect(rcIgnoreOutcome(far, NOW_MS)).toBe('stale-expiration');
    expect(rcIgnoreOutcome(soon, NOW_MS)).toBe('no-op'); // the mirror agrees: accepted, not ignored
  });
});

describe('Path A: the named sandbox allowlist', () => {
  const OTHER = '99999999-8888-4777-8666-555555555555';
  it('parses commas and spaces, lowercases, and ignores anything that is not a UUID', () => {
    const set = sandboxAllowlist(` ${UID.toUpperCase()}, not-a-uuid ,${OTHER}\n`);
    expect([...set].sort()).toEqual([UID, OTHER].sort());
    expect(sandboxAllowlist(undefined).size).toBe(0);
    expect(sandboxAllowlist('').size).toBe(0);
  });

  it('writes an allowlisted sandbox purchase and logs it as sandbox-allowlisted (applied)', async () => {
    const db = fakeDb();
    const res = await handleRcWebhook(rawReq({ event: rcEvent({ environment: 'SANDBOX', store: 'PLAY_STORE' }) }), { ...env(db), SANDBOX_GRANT_UIDS: UID.toUpperCase() }, '2026-09-30T00:00:00Z', NOW_MS);
    expect(res.status).toBe(200);
    expect(db.rows.get(UID)).toMatchObject({ premium: 1, source: 'google' });
    expect(db.events[0]?.[14]).toBe('sandbox-allowlisted');
    expect(db.events[0]?.[13]).toBe(1);
  });

  it('still refuses everyone else\'s sandbox purchase, allowlist or not', async () => {
    for (const list of [undefined, '', '99999999-8888-4777-8666-555555555555']) {
      const db = fakeDb();
      const res = await handleRcWebhook(rawReq({ event: rcEvent({ environment: 'SANDBOX' }) }), { ...env(db), SANDBOX_GRANT_UIDS: list }, '2026-09-30T00:00:00Z', NOW_MS);
      expect(await res.json()).toEqual({ received: true, sandbox: true });
      expect(db.rows.size).toBe(0);
      expect(db.events[0]?.[14]).toBe('sandbox');
    }
  });

  it('refuses an anonymous sandbox purchase even with an allowlist (nobody to allow)', async () => {
    const db = fakeDb();
    await handleRcWebhook(rawReq({ event: rcEvent({ environment: 'SANDBOX', app_user_id: '$RCAnonymousID:x', aliases: [] }) }), { ...env(db), SANDBOX_GRANT_UIDS: UID }, '2026-09-30T00:00:00Z', NOW_MS);
    expect(db.rows.size).toBe(0);
  });

  it('counts sandbox-allowlisted as applied, and the new ignore outcomes as not', () => {
    expect(rcEventRow(rcEvent(), 'sandbox-allowlisted').applied).toBe(1);
    expect(rcEventRow(rcEvent(), 'other-store').applied).toBe(0);
    expect(rcEventRow(rcEvent(), 'kept').applied).toBe(0);
  });
});

describe('Path A: one store can never switch off another, seen from the webhook (real SQLite)', () => {
  const SQL_NOW = '2026-09-30T00:00:00.000Z';

  it('keeps a live Stripe subscriber when a Play EXPIRATION arrives, logs why, and marks it processed', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, { userId: UID, premium: true, status: 'active', currentPeriodEnd: 1_900_000_000, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe' }, SQL_NOW);
    const evt = rcEvent({ id: 'rc-play-exp', type: 'EXPIRATION', store: 'PLAY_STORE', expiration_at_ms: NOW_MS - HOUR_MS });
    const res = await handleRcWebhook(rawReq({ event: evt }), env(db), SQL_NOW, NOW_MS);
    expect(await res.json()).toEqual({ received: true, kept: true });
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, source: 'stripe', customerId: 'cus_1' });
    expect(db.raw.prepare('SELECT outcome, applied, store FROM rc_events').get()).toMatchObject({ outcome: 'kept', applied: 0, store: 'PLAY_STORE' });
    expect(db.raw.prepare("SELECT 1 AS hit FROM processed_events WHERE event_id = 'rc:rc-play-exp'").get()).toBeTruthy();
  });

  it('still lets Play switch off a Play subscription it sold', async () => {
    const db = await sqliteD1();
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'buy', store: 'PLAY_STORE' }) }), env(db), SQL_NOW, NOW_MS);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, source: 'google' });
    const res = await handleRcWebhook(rawReq({ event: rcEvent({ id: 'end', type: 'EXPIRATION', store: 'PLAY_STORE', expiration_at_ms: NOW_MS - HOUR_MS }) }), env(db), SQL_NOW, NOW_MS);
    expect(await res.json()).toEqual({ received: true });
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'expired', source: 'google' });
  });
});

describe('Path A review: a late cancel or billing issue never switches Premium back on', () => {
  const past = NOW_MS - HOUR_MS;
  const future = NOW_MS + 5 * 24 * HOUR_MS;

  it('drops a CANCELLATION or BILLING_ISSUE whose moment has passed, and names it stale-on', () => {
    for (const over of [
      { type: 'CANCELLATION', cancel_reason: 'BILLING_ERROR', expiration_at_ms: past },
      { type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: past },
      { type: 'BILLING_ISSUE', expiration_at_ms: past },
      { type: 'BILLING_ISSUE', expiration_at_ms: future, grace_period_expiration_at_ms: past },
    ]) {
      expect(entitlementFromRcEvent(rcEvent(over), NOW_MS), JSON.stringify(over)).toBeNull();
      expect(rcIgnoreOutcome(rcEvent(over), NOW_MS), JSON.stringify(over)).toBe('stale-on');
    }
  });

  it('still writes them while they are true: a grace period that has not ended keeps premium on', () => {
    expect(entitlementFromRcEvent(rcEvent({ type: 'BILLING_ISSUE', expiration_at_ms: past, grace_period_expiration_at_ms: future }), NOW_MS)).toMatchObject({ premium: true, status: 'past_due' });
    expect(entitlementFromRcEvent(rcEvent({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: future }), NOW_MS)).toMatchObject({ premium: true, status: 'canceled', cancelAtPeriodEnd: true });
    // No timestamps at all: behaves exactly as before.
    expect(entitlementFromRcEvent(rcEvent({ type: 'BILLING_ISSUE', expiration_at_ms: undefined }), NOW_MS)).toMatchObject({ premium: true, status: 'past_due' });
  });

  it('never applies to a refund: a support cancel still revokes at once, however late', () => {
    expect(entitlementFromRcEvent(rcEvent({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: past }), NOW_MS)).toMatchObject({ premium: false });
  });

  it('in every arrival order, an EXPIRATION that landed stays landed (real SQLite, the replayed race)', async () => {
    const db = await sqliteD1();
    const T = '2026-09-30T00:00:00.000Z';
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'buy' }) }), env(db), T, NOW_MS);
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'exp', type: 'EXPIRATION', expiration_reason: 'BILLING_ERROR', expiration_at_ms: past }) }), env(db), T, NOW_MS);
    // the retried CANCELLATION arrives minutes later, after the EXPIRATION
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'late', type: 'CANCELLATION', cancel_reason: 'BILLING_ERROR', expiration_at_ms: past }) }), env(db), T, NOW_MS);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'expired' });
  });
});

describe('Path A review: only a real sale takes a row over from another store (real SQLite)', () => {
  const T = '2026-09-30T00:00:00.000Z';
  const stripeLive = { userId: UID, premium: true, status: 'active', currentPeriodEnd: 1_900_000_000, cancelAtPeriodEnd: false, customerId: 'cus_1', source: 'stripe' as const };

  it('a web subscriber who turns off a doubled Apple plan keeps Premium when the Apple one ends', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, stripeLive, T);
    const cancel = await handleRcWebhook(rawReq({ event: rcEvent({ id: 'c', type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', store: 'APP_STORE' }) }), env(db), T, NOW_MS);
    expect(await cancel.json()).toEqual({ received: true, kept: true }); // the winding-down store did not take the row
    const end = await handleRcWebhook(rawReq({ event: rcEvent({ id: 'e', type: 'EXPIRATION', store: 'APP_STORE', expiration_at_ms: NOW_MS - HOUR_MS }) }), env(db), T, NOW_MS);
    expect(await end.json()).toEqual({ received: true, kept: true });
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', source: 'stripe' });
  });

  it('a Play billing issue cannot take a live Stripe row over either', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, stripeLive, T);
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'b', type: 'BILLING_ISSUE', store: 'PLAY_STORE' }) }), env(db), T, NOW_MS);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', source: 'stripe' });
  });

  it('a real sale from another store still takes it over (the store that last SOLD owns the row)', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, stripeLive, T);
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'buy', store: 'PLAY_STORE' }) }), env(db), T, NOW_MS);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, source: 'google' });
  });

  it("the row's own store may still wind it down", async () => {
    const db = await sqliteD1();
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'buy', store: 'PLAY_STORE' }) }), env(db), T, NOW_MS);
    await handleRcWebhook(rawReq({ event: rcEvent({ id: 'c', type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', store: 'PLAY_STORE' }) }), env(db), T, NOW_MS);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'canceled', cancelAtPeriodEnd: true, source: 'google' });
  });
});
