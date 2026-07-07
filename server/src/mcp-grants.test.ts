import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  decryptSecret,
  deleteGrantsForUser,
  encryptSecret,
  getAccessToken,
  type GrantsEnv,
  jwtExp,
  type McpGrantRow,
  putGrant,
} from './mcp-grants';
import type { D1LikeDatabase } from './telemetry';

// A real 256-bit key, base64, like the MCP_GRANT_KEY secret.
const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');

const NOW_MS = 1_800_000_000_000; // fixed clock for the cache/staleness maths
const NOW_SEC = NOW_MS / 1000;

const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Minimal D1 double: records every executed statement with its bound params, and
 *  serves one canned row to SELECT ... first(). */
function fakeDb(row: McpGrantRow | null) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db: D1LikeDatabase = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          bound = values;
          return stmt;
        },
        async run() {
          calls.push({ sql, params: bound });
          return {};
        },
        async first<T>() {
          calls.push({ sql, params: bound });
          return row as T | null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };
      return stmt;
    },
  };
  return { db, calls };
}

function row(overrides: Partial<McpGrantRow> = {}): McpGrantRow {
  return {
    grant_id: 'g1',
    user_id: 'u1',
    email: 'a@b.co',
    refresh_enc: '{}',
    access_token: null,
    access_exp: null,
    created_at: 1,
    updated_at: 1,
    revoked_at: null,
    ...overrides,
  };
}

function makeEnv(db: D1LikeDatabase, overrides: Partial<GrantsEnv> = {}): GrantsEnv {
  return { DB: db, MCP_GRANT_KEY: KEY, SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key', ...overrides };
}

describe('refresh-token crypto (AES-GCM-256)', () => {
  it('roundtrips a secret, and the ciphertext never contains the plaintext', async () => {
    const enc = await encryptSecret(KEY, 'refresh-token-1');
    expect(enc).not.toBeNull();
    expect(enc).not.toContain('refresh-token-1');
    expect(await decryptSecret(KEY, enc as string)).toBe('refresh-token-1');
  });

  it('uses a FRESH IV per encryption (same plaintext, distinct iv and ciphertext)', async () => {
    const a = (await encryptSecret(KEY, 'same-secret')) as string;
    const b = (await encryptSecret(KEY, 'same-secret')) as string;
    expect(a).not.toEqual(b);
    const ivA = (JSON.parse(a) as { iv: string }).iv;
    const ivB = (JSON.parse(b) as { iv: string }).iv;
    expect(ivA).not.toEqual(ivB);
  });

  it('rejects tampered ciphertext (GCM authentication fails closed to null)', async () => {
    const enc = (await encryptSecret(KEY, 'secret')) as string;
    const parsed = JSON.parse(enc) as { iv: string; ct: string };
    const bytes = Buffer.from(parsed.ct, 'base64');
    bytes[0] ^= 0xff;
    const tampered = JSON.stringify({ iv: parsed.iv, ct: bytes.toString('base64') });
    expect(await decryptSecret(KEY, tampered)).toBeNull();
  });

  it('fails closed on a key that is not 32 bytes, and on garbage stored values', async () => {
    expect(await encryptSecret(btoa('short'), 'x')).toBeNull();
    expect(await decryptSecret(btoa('short'), '{}')).toBeNull();
    expect(await decryptSecret(KEY, 'not-json')).toBeNull();
    expect(await decryptSecret(KEY, '{"iv":"AAAA","ct":""}')).toBeNull();
  });
});

describe('jwtExp', () => {
  it('reads exp from a JWT payload and nulls anything else', () => {
    expect(jwtExp(`${b64u({ alg: 'ES256' })}.${b64u({ exp: 1234 })}.sig`)).toBe(1234);
    expect(jwtExp('not-a-jwt')).toBeNull();
    expect(jwtExp(`${b64u({})}.${b64u({ exp: 'soon' })}.sig`)).toBeNull();
  });
});

describe('putGrant', () => {
  it('stores the refresh token ENCRYPTED (decryptable, never plaintext) with the cached access', async () => {
    const { db, calls } = fakeDb(null);
    const ok = await putGrant(
      makeEnv(db),
      { grantId: 'g1', userId: 'u1', email: 'a@b.co', refreshToken: 'refresh-1', accessToken: 'access-1', accessExp: NOW_SEC + 3600 },
      NOW_MS,
    );
    expect(ok).toBe(true);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO mcp_grants'));
    expect(insert).toBeDefined();
    const params = insert?.params as [string, string, string, string, string, number, number, number];
    expect(params[0]).toBe('g1');
    expect(params[3]).not.toContain('refresh-1');
    expect(await decryptSecret(KEY, params[3])).toBe('refresh-1');
    expect(params[4]).toBe('access-1');
  });

  it('returns false when custody is unconfigured, so the caller never redirects on a dud', async () => {
    const { db } = fakeDb(null);
    const ok = await putGrant(
      makeEnv(db, { MCP_GRANT_KEY: undefined }),
      { grantId: 'g1', userId: 'u1', email: 'a@b.co', refreshToken: 'r', accessToken: 'a', accessExp: 1 },
      NOW_MS,
    );
    expect(ok).toBe(false);
  });
});

describe('getAccessToken', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a fresh cached access token without touching the network', async () => {
    const enc = (await encryptSecret(KEY, 'test-refresh-old')) as string;
    const { db } = fakeDb(row({ refresh_enc: enc, access_token: 'test-cached-token', access_exp: NOW_SEC + 600 }));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getAccessToken(makeEnv(db), 'g1', NOW_MS)).toBe('test-cached-token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats a token inside the 60s skew as stale (it refreshes rather than returning it)', async () => {
    const enc = (await encryptSecret(KEY, 'test-refresh-old')) as string;
    const { db } = fakeDb(row({ refresh_enc: enc, access_token: 'test-nearly-dead', access_exp: NOW_SEC + 30 }));
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ access_token: 'test-new-access', refresh_token: 'test-refresh-new', expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getAccessToken(makeEnv(db), 'g1', NOW_MS)).toBe('test-new-access');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refreshes a stale token with the DECRYPTED refresh token and persists the ROTATED one in a single update', async () => {
    const encOld = (await encryptSecret(KEY, 'test-refresh-old')) as string;
    const { db, calls } = fakeDb(row({ refresh_enc: encOld, access_token: 'stale', access_exp: NOW_SEC - 10 }));
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ access_token: 'test-new-access', refresh_token: 'test-refresh-new', expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const token = await getAccessToken(makeEnv(db), 'g1', NOW_MS);
    expect(token).toBe('test-new-access');

    // The refresh call carried the decrypted CURRENT token to the rotating endpoint.
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(calledUrl)).toBe('https://proj.supabase.co/auth/v1/token?grant_type=refresh_token');
    expect(JSON.parse(calledInit.body as string)).toEqual({ refresh_token: 'test-refresh-old' });

    // One UPDATE persisted the ROTATED refresh token (ciphertext changed, decrypts to
    // the new token) together with the new cached access + exp.
    const update = calls.find((c) => c.sql.includes('SET refresh_enc'));
    expect(update).toBeDefined();
    const [gid, encNew, access, exp, updatedAt] = update?.params as [string, string, string, number, number];
    expect(gid).toBe('g1');
    expect(encNew).not.toEqual(encOld);
    expect(await decryptSecret(KEY, encNew)).toBe('test-refresh-new');
    expect(access).toBe('test-new-access');
    expect(exp).toBe(NOW_SEC + 3600);
    expect(updatedAt).toBe(NOW_MS);
  });

  it('marks the grant revoked and returns null when the refresh is REJECTED with an unambiguous status (401)', async () => {
    const enc = (await encryptSecret(KEY, 'refresh-burned')) as string;
    const { db, calls } = fakeDb(row({ refresh_enc: enc, access_exp: NOW_SEC - 10, access_token: 'stale' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 })));
    expect(await getAccessToken(makeEnv(db), 'g1', NOW_MS)).toBeNull();
    const revoke = calls.find((c) => c.sql.includes('SET revoked_at'));
    expect(revoke).toBeDefined();
    expect(revoke?.params).toEqual(['g1', NOW_MS]);
  });

  it('also revokes on 403 and 404 (forbidden / user or token gone)', async () => {
    for (const status of [403, 404]) {
      const enc = (await encryptSecret(KEY, 'refresh-x')) as string;
      const { db, calls } = fakeDb(row({ refresh_enc: enc, access_exp: NOW_SEC - 10, access_token: 'stale' }));
      vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status })));
      expect(await getAccessToken(makeEnv(db), 'g1', NOW_MS)).toBeNull();
      expect(calls.find((c) => c.sql.includes('SET revoked_at')), `status ${status}`).toBeDefined();
    }
  });

  it('does NOT revoke on a bare 400 (the concurrent-rotation race loser), returning null but leaving the grant', async () => {
    // A 400 is what the loser of two overlapping refreshes gets if Supabase reuse-grace is
    // off/short. Revoking there would brick a healthy grant, so 400 returns null WITHOUT
    // revoking; a genuinely dead 400 grant simply keeps 401-ing the tool call.
    const enc = (await encryptSecret(KEY, 'refresh-raced')) as string;
    const { db, calls } = fakeDb(row({ refresh_enc: enc, access_exp: NOW_SEC - 10, access_token: 'stale' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })));
    expect(await getAccessToken(makeEnv(db), 'g1', NOW_MS)).toBeNull();
    expect(calls.find((c) => c.sql.includes('SET revoked_at'))).toBeUndefined();
  });

  it('returns null WITHOUT revoking on a transient failure (5xx), so a blip never burns a grant', async () => {
    const enc = (await encryptSecret(KEY, 'refresh-fine')) as string;
    const { db, calls } = fakeDb(row({ refresh_enc: enc, access_exp: NOW_SEC - 10, access_token: 'stale' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 503 })));
    expect(await getAccessToken(makeEnv(db), 'g1', NOW_MS)).toBeNull();
    expect(calls.find((c) => c.sql.includes('SET revoked_at'))).toBeUndefined();
  });

  it('returns null for a revoked row without any fetch', async () => {
    const { db } = fakeDb(row({ revoked_at: 123 }));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getAccessToken(makeEnv(db), 'g1', NOW_MS)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null for an absent row, and fails closed when custody is unconfigured', async () => {
    const { db } = fakeDb(null);
    vi.stubGlobal('fetch', vi.fn());
    expect(await getAccessToken(makeEnv(db), 'missing', NOW_MS)).toBeNull();
    const { db: db2 } = fakeDb(row({}));
    expect(await getAccessToken(makeEnv(db2, { MCP_GRANT_KEY: undefined }), 'g1', NOW_MS)).toBeNull();
  });
});

describe('deleteGrantsForUser (the immediate kill switch)', () => {
  /** A D1 double whose DELETE reports a changes count, like real D1's run() meta. */
  function killDb(changes: number, opts: { throwOnRun?: boolean } = {}) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db: D1LikeDatabase = {
      prepare(sql: string) {
        let bound: unknown[] = [];
        const stmt = {
          bind(...values: unknown[]) {
            bound = values;
            return stmt;
          },
          async run() {
            calls.push({ sql, params: bound });
            if (opts.throwOnRun) throw new Error('d1 down');
            return { meta: { changes } };
          },
          async first<T>() {
            return null as T | null;
          },
          async all<T>() {
            return { results: [] as T[] };
          },
        };
        return stmt;
      },
    };
    return { db, calls };
  }

  it('deletes by user_id and returns the rows removed', async () => {
    const { db, calls } = killDb(2);
    const n = await deleteGrantsForUser({ DB: db, MCP_GRANT_KEY: KEY }, 'u1');
    expect(n).toBe(2);
    const del = calls.find((c) => c.sql.startsWith('DELETE FROM mcp_grants WHERE user_id'));
    expect(del).toBeDefined();
    expect(del?.params).toEqual(['u1']);
  });

  it('returns 0 (never throws) when the store hiccups, and does nothing without a user id or DB', async () => {
    const { db } = killDb(0, { throwOnRun: true });
    expect(await deleteGrantsForUser({ DB: db }, 'u1')).toBe(0);
    expect(await deleteGrantsForUser({ DB: db }, '')).toBe(0);
    expect(await deleteGrantsForUser({}, 'u1')).toBe(0);
  });
});
