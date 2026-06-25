import { describe, expect, it } from 'vitest';

import { defaultVerifySub, requirePremium, type SubVerifier } from './premium';
import { type D1LikeDatabase, writeEntitlement } from './stripe';

// A minimal in-memory D1, the same shape as stripe.test.ts's fakeDb (it honours the upsert + read).
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
            current_period_end: cpe ?? (existing?.current_period_end as number | null) ?? null,
            cancel_at_period_end: cancelAtEnd,
            started_at: (existing?.started_at as string | null) ?? startedAt,
            stripe_customer_id: customerId ?? (existing?.stripe_customer_id as string | null) ?? null,
            updated_at: updatedAt,
          });
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

const SUPA = 'https://x.supabase.co';
const req = (token?: string) =>
  new Request('https://api.doubledone.app/ocr', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
const env = (db?: D1LikeDatabase) => ({ DB: db, SUPABASE_URL: SUPA });

// A stub verifier: pretends the token is valid and resolves to a fixed user, so cases 1-6 never touch
// the network or crypto. Case 7 exercises the REAL verifier.
const verifiesTo = (sub: string | null): SubVerifier => async () => sub;

describe('requirePremium', () => {
  it('401 when there is no token', async () => {
    expect(await requirePremium(req(), env(fakeDb()), verifiesTo('user-1'))).toEqual({ ok: false, status: 401 });
  });

  it('503 (fail closed) when the entitlement store is unbound', async () => {
    expect(await requirePremium(req('t'), { SUPABASE_URL: SUPA }, verifiesTo('user-1'))).toEqual({ ok: false, status: 503 });
  });

  it('401 when the verifier rejects the token (forged / bad signature)', async () => {
    expect(await requirePremium(req('forged'), env(fakeDb()), verifiesTo(null))).toEqual({ ok: false, status: 401 });
  });

  it('403 when the user is verified but has no entitlement row', async () => {
    expect(await requirePremium(req('t'), env(fakeDb()), verifiesTo('user-1'))).toEqual({ ok: false, status: 403 });
  });

  it('403 when the user is verified but premium is false (lapsed / cancelled)', async () => {
    const db = fakeDb();
    await writeEntitlement(db, { userId: 'user-1', premium: false, status: 'canceled', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null }, '2026-06-20T00:00:00Z');
    expect(await requirePremium(req('t'), env(db), verifiesTo('user-1'))).toEqual({ ok: false, status: 403 });
  });

  it('ok with the verified userId when the user is premium', async () => {
    const db = fakeDb();
    await writeEntitlement(db, { userId: 'user-1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1' }, '2026-06-20T00:00:00Z');
    expect(await requirePremium(req('t'), env(db), verifiesTo('user-1'))).toEqual({ ok: true, userId: 'user-1' });
  });

  // THE LOAD-BEARING ONE: the real verifier must reject a forged / malformed token, not decode-and-trust
  // it the way the old decodeJwtSub did. Both inputs fail before any JWKS fetch (not a JWS / bad header).
  it('the real verifier rejects a forged or malformed token', async () => {
    expect(await defaultVerifySub('not-a-real-jwt', SUPA)).toBeNull();
    expect(await defaultVerifySub('aGVhZGVy.cGF5bG9hZA.sig', SUPA)).toBeNull();
  });
});
