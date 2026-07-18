import { describe, expect, it, vi } from 'vitest';

import type { D1LikeDatabase } from './entitlements';
import { appUserIdFromRcEvent, entitlementFromRcEvent, handleRcWebhook, verifyRcAuth } from './revenuecat';

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
function fakeDb(): D1LikeDatabase & { rows: Map<string, Record<string, unknown>>; seen: Set<string> } {
  const rows = new Map<string, Record<string, unknown>>();
  const seen = new Set<string>();
  return {
    rows,
    seen,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
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

describe('handleRcWebhook', () => {
  const rawReq = (body: unknown, auth = 'secret') =>
    new Request('https://api.doubledone.app/rc-webhook', { method: 'POST', headers: { Authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const env = (db: D1LikeDatabase) => ({ DB: db, RC_WEBHOOK_AUTH: 'secret' });

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
