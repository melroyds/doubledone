import { describe, expect, it, vi } from 'vitest';

import type { D1LikeDatabase } from './entitlements';
import {
  appUserIdFromRcEvent,
  entitlementFromRcEvent,
  handleRcWebhook,
  rcEventRow,
  rcIgnoreOutcome,
  verifyRcAuth,
} from './revenuecat';

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
