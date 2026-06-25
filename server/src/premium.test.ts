import { SignJWT } from 'jose';
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

// A bound-but-erroring D1: the read throws, so the gate must fail CLOSED itself, not reject the promise.
function throwingDb(): D1LikeDatabase {
  const stmt = {
    bind() {
      return stmt;
    },
    async first() {
      throw new Error('D1 unavailable');
    },
    async run() {},
    async all() {
      return { results: [] };
    },
  };
  return { prepare: () => stmt } as unknown as D1LikeDatabase;
}

const SUPA = 'https://x.supabase.co';
const req = (token?: string) =>
  new Request('https://api.doubledone.app/ocr', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
const env = (db?: D1LikeDatabase) => ({ DB: db, SUPABASE_URL: SUPA });

// A stub verifier: pretends the token verified and resolves to a fixed sub, so cases that are not about
// crypto run with no network. The defaultVerifySub block below exercises the real verifier.
const verifiesTo = (sub: string | null): SubVerifier => async () => sub;

// The comp allowlist is keyed on the token's email claim. Build a token carrying sub + email; the comp
// path reads the email only AFTER verifySub returns non-null, so these pair such a token with a stub.
const COMP_EMAIL = 'melroyvivekdsouza@gmail.com';
const tokenWith = (claims: object) => `h.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.s`;

describe('requirePremium', () => {
  it('401 when there is no token', async () => {
    expect(await requirePremium(req(), env(fakeDb()), verifiesTo('user-1'))).toEqual({ ok: false, status: 401 });
  });

  it('503 (fail closed) when the entitlement store is unbound', async () => {
    expect(await requirePremium(req('t'), { SUPABASE_URL: SUPA }, verifiesTo('user-1'))).toEqual({ ok: false, status: 503 });
  });

  it('503 (fail closed) when the entitlement read throws (a bound but erroring store)', async () => {
    expect(await requirePremium(req('t'), env(throwingDb()), verifiesTo('user-1'))).toEqual({ ok: false, status: 503 });
  });

  it('401 when the verifier rejects the token (forged / bad signature)', async () => {
    expect(await requirePremium(req('forged'), env(fakeDb()), verifiesTo(null))).toEqual({ ok: false, status: 401 });
  });

  it('treats an empty-string sub as no-auth (401), never a valid user', async () => {
    expect(await requirePremium(req('t'), env(fakeDb()), verifiesTo(''))).toEqual({ ok: false, status: 401 });
  });

  it('never reads the entitlement store for a forged token (verify before read)', async () => {
    const db = fakeDb();
    let reads = 0;
    const spied = { ...db, prepare: (sql: string) => (reads++, db.prepare(sql)) } as unknown as D1LikeDatabase;
    await requirePremium(req('forged'), env(spied), verifiesTo(null));
    expect(reads).toBe(0);
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

  it('ok for an allowlisted comp email, even with no entitlement row (always premium)', async () => {
    const token = tokenWith({ sub: 'comp-1', email: COMP_EMAIL });
    expect(await requirePremium(req(token), env(fakeDb()), verifiesTo('comp-1'))).toEqual({ ok: true, userId: 'comp-1' });
  });

  it('the comp bypass short-circuits BEFORE the entitlement store is read', async () => {
    const db = fakeDb();
    let reads = 0;
    const spied = { ...db, prepare: (sql: string) => (reads++, db.prepare(sql)) } as unknown as D1LikeDatabase;
    await requirePremium(req(tokenWith({ sub: 'comp-1', email: COMP_EMAIL })), env(spied), verifiesTo('comp-1'));
    expect(reads).toBe(0);
  });

  it('does NOT comp a non-allowlisted email (still 403 with no row)', async () => {
    const token = tokenWith({ sub: 'user-1', email: 'someone@else.com' });
    expect(await requirePremium(req(token), env(fakeDb()), verifiesTo('user-1'))).toEqual({ ok: false, status: 403 });
  });

  it('rejects a FORGED comp-email token (the comp check runs only after the signature verifies)', async () => {
    const token = tokenWith({ sub: 'attacker', email: COMP_EMAIL });
    expect(await requirePremium(req(token), env(fakeDb()), verifiesTo(null))).toEqual({ ok: false, status: 401 });
  });
});

describe('defaultVerifySub (the real verifier)', () => {
  // These inputs fail at JWS parse or the algorithm allow-list, BEFORE any JWKS fetch, so they stay
  // offline. A structurally-valid wrong-KEY forgery would instead reach the network
  // (ERR_JWKS_NO_MATCHING_KEY) and must NOT be added here; cover that via requirePremium's injected stub.
  it('rejects a malformed token (not decode-and-trust like the old decodeJwtSub)', async () => {
    expect(await defaultVerifySub('not-a-real-jwt', SUPA)).toBeNull();
    expect(await defaultVerifySub('aGVhZGVy.cGF5bG9hZA.sig', SUPA)).toBeNull();
  });

  it('rejects the classic forgeries via the algorithm allow-list (alg:none and HS256)', async () => {
    const noneToken =
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify({ sub: 'attacker', iss: `${SUPA}/auth/v1` })).toString('base64url') +
      '.';
    expect(await defaultVerifySub(noneToken, SUPA)).toBeNull();

    const hsToken = await new SignJWT({ sub: 'attacker' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(`${SUPA}/auth/v1`)
      .sign(new TextEncoder().encode('attacker-secret'));
    expect(await defaultVerifySub(hsToken, SUPA)).toBeNull();
  });
});
