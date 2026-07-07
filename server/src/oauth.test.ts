import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import worker, { type Env } from './index';
import { handleMcp } from './mcp';
import { decryptSecret } from './mcp-grants';
import { isJwtShaped, isOAuthPath } from './oauth';
import type { D1LikeDatabase } from './telemetry';

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
// A legacy pasted token is a Supabase JWT: three dot-separated base64url segments.
const LEGACY_JWT = `${b64u({ alg: 'ES256' })}.${b64u({ sub: 'user-1' })}.sig`;

// ONE shared signing key for every genuinely-signed token in this file. defaultVerifySub
// caches jose's remote JWKS set module-globally per Supabase URL, and jose refuses to
// re-fetch for an unknown kid inside its cooldown window; so all signed-token tests must use
// the SAME kid + key material or later ones fail against the first fetch's cached key. Minted
// once in beforeAll. The served JWKS (jwksResponse) always carries this one public key.
const SIGN_KID = 'k1';
let signPrivateKey: CryptoKey;
let signPublicJwk: JWK;
beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  signPrivateKey = privateKey as CryptoKey;
  signPublicJwk = { ...(await exportJWK(publicKey)), kid: SIGN_KID, alg: 'ES256', use: 'sig' } as JWK;
});
/** A genuinely ES256-signed Supabase-shaped access token for the shared key. */
async function signAccess(claims: { sub?: string; email?: string } = {}): Promise<string> {
  return new SignJWT({ email: claims.email ?? 'mel@example.com' })
    .setProtectedHeader({ alg: 'ES256', kid: SIGN_KID })
    .setIssuer('https://proj.supabase.co/auth/v1')
    .setSubject(claims.sub ?? 'user-77')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(signPrivateKey);
}
/** A fetch stub that serves the shared JWKS for the jose verifier, throwing on any other URL. */
function jwksOnlyFetch() {
  return vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('/.well-known/jwks.json')) {
      return new Response(JSON.stringify({ keys: [signPublicJwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${String(url)}`);
  });
}

/** In-memory OAUTH_KV double. The provider stores JSON strings; get returns them
 *  parsed (it always reads with { type: 'json' }). */
function kvMock(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    async get(key: string) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key: string, value: string) {
      store.set(key, JSON.parse(value));
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };
}

// A registered public client, seeded straight into the provider's KV shape.
const CLIENT = {
  clientId: 'client-1',
  redirectUris: ['https://ai.example/cb'],
  clientName: 'Claude',
  tokenEndpointAuthMethod: 'none',
};

const AUTH_QS =
  '?response_type=code&client_id=client-1&redirect_uri=' +
  encodeURIComponent('https://ai.example/cb') +
  '&state=st1&scope=tasks&code_challenge=abc123&code_challenge_method=S256';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ANTHROPIC_API_KEY: 'test-key',
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    ...overrides,
  } as Env;
}

function mcpPost(payload: object, auth?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers.Authorization = auth;
  return new Request('https://doubledone-ai.example.dev/mcp', { method: 'POST', headers, body: JSON.stringify(payload) });
}

function formPost(path: string, fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request('https://doubledone-ai.example.dev' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

describe('isJwtShaped (the /mcp triage predicate)', () => {
  it('matches three dot-separated base64url segments (a pasted Supabase JWT)', () => {
    expect(isJwtShaped(LEGACY_JWT)).toBe(true);
  });
  it('rejects provider tokens (colon format), plain opaque strings, and junk', () => {
    expect(isJwtShaped('user-1:grant-1:s3cr3tS3cr3t')).toBe(false);
    expect(isJwtShaped('some-opaque-token')).toBe(false);
    expect(isJwtShaped('a.b')).toBe(false);
    expect(isJwtShaped('')).toBe(false);
    expect(isJwtShaped('a.b.c.d')).toBe(false);
  });
});

describe('isOAuthPath', () => {
  it('claims only the OAuth surface, never the app routes', () => {
    for (const p of [
      '/authorize',
      '/token',
      '/register',
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-authorization-server/mcp',
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      expect(isOAuthPath(p), p).toBe(true);
    }
    for (const p of ['/mcp', '/health', '/clarify', '/api/v1/tasks', '/stripe-webhook', '/.well-known/other']) {
      expect(isOAuthPath(p), p).toBe(false);
    }
  });
});

describe('/mcp triage through the worker', () => {
  it('routes a JWT-shaped bearer to the LEGACY path (open discovery, legacy CORS, no provider involved)', async () => {
    // No OAUTH_KV bound: if this reached the provider it could not validate anything.
    const res = await worker.fetch(mcpPost({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, `Bearer ${LEGACY_JWT}`), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('doubledone');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('keeps the legacy OPTIONS preflight byte-for-byte', async () => {
    const res = await worker.fetch(new Request('https://doubledone-ai.example.dev/mcp', { method: 'OPTIONS' }), makeEnv(), ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('mcp-protocol-version');
  });

  it('sends an opaque (non-JWT) bearer to the provider, which 401s an unknown token', async () => {
    const res = await worker.fetch(mcpPost({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} }, 'Bearer some-opaque-token'), makeEnv(), ctx);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('error="invalid_token"');
  });

  it('401s a provider-format token that is not in the store', async () => {
    const env = makeEnv({ OAUTH_KV: kvMock() } as Partial<Env>);
    const res = await worker.fetch(mcpPost({ jsonrpc: '2.0', id: 3, method: 'initialize', params: {} }, 'Bearer u1:g1:secretsecret'), env, ctx);
    expect(res.status).toBe(401);
  });

  it('401s POST /mcp with NO auth, with a WWW-Authenticate challenge naming the resource metadata URL (the OAuth trigger; open discovery is deliberately over)', async () => {
    const res = await worker.fetch(mcpPost({ jsonrpc: '2.0', id: 4, method: 'initialize', params: {} }), makeEnv(), ctx);
    expect(res.status).toBe(401);
    const challenge = res.headers.get('WWW-Authenticate') ?? '';
    expect(challenge).toContain('Bearer ');
    expect(challenge).toContain('resource_metadata="https://doubledone-ai.example.dev/.well-known/oauth-protected-resource/mcp"');
  });
});

describe('OAuth discovery metadata through the worker', () => {
  it('serves RFC 9728 protected-resource metadata at the path-suffixed well-known URL', async () => {
    const res = await worker.fetch(new Request('https://doubledone-ai.example.dev/.well-known/oauth-protected-resource/mcp'), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { resource: string; authorization_servers: string[]; scopes_supported: string[] };
    expect(meta.resource).toBe('https://doubledone-ai.example.dev/mcp');
    expect(meta.authorization_servers).toEqual(['https://doubledone-ai.example.dev']);
    expect(meta.scopes_supported).toEqual(['tasks']);
  });

  it('serves RFC 8414 authorization-server metadata, S256-only, with the register endpoint', async () => {
    const res = await worker.fetch(new Request('https://doubledone-ai.example.dev/.well-known/oauth-authorization-server'), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const meta = (await res.json()) as {
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint: string;
      code_challenge_methods_supported: string[];
    };
    expect(meta.authorization_endpoint).toBe('https://doubledone-ai.example.dev/authorize');
    expect(meta.token_endpoint).toBe('https://doubledone-ai.example.dev/token');
    expect(meta.registration_endpoint).toBe('https://doubledone-ai.example.dev/register');
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('folds the path-inserted AS metadata form onto the root document', async () => {
    const res = await worker.fetch(new Request('https://doubledone-ai.example.dev/.well-known/oauth-authorization-server/mcp'), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { token_endpoint: string };
    expect(meta.token_endpoint).toBe('https://doubledone-ai.example.dev/token');
  });
});

describe('handleMcp with an injected (custody) token source', () => {
  afterEach(() => vi.unstubAllGlobals());

  const env = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
  const CUSTODY_JWT = `${b64u({ alg: 'ES256' })}.${b64u({ sub: 'user-1' })}.sig`;

  it('surfaces a dead grant as HTTP 401 invalid_token with the RFC 9728 challenge (so the client re-authorizes)', async () => {
    const req = mcpPost({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_today', arguments: {} } });
    const res = await handleMcp(req, env, { kind: 'oauth', getToken: async () => null });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('WWW-Authenticate') ?? '';
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain('/.well-known/oauth-protected-resource/mcp');
  });

  it('runs the tool with the injected Supabase token (it reaches the REST call as the bearer)', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ url: String(url), auth: (init?.headers as Record<string, string>).authorization ?? null });
        return new Response(JSON.stringify([]), { status: 200 });
      }),
    );
    const req = mcpPost({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_today', arguments: {} } });
    const res = await handleMcp(req, env, { kind: 'oauth', getToken: async () => CUSTODY_JWT });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { content: { text: string }[] } };
    expect(body.result.content[0].text).toMatch(/Nothing on today/);
    expect(seen[0].url).toContain('/rest/v1/tasks');
    expect(seen[0].auth).toBe(`Bearer ${CUSTODY_JWT}`);
  });
});

describe('the /authorize flow (email step)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function authorizeEnv(overrides: Partial<Env> = {}): Env {
    return makeEnv({ OAUTH_KV: kvMock({ 'client-1': null, 'client:client-1': CLIENT }), ...overrides } as Partial<Env>);
  }

  it('GET renders the calm email page for a registered client', async () => {
    const res = await worker.fetch(new Request('https://doubledone-ai.example.dev/authorize' + AUTH_QS), authorizeEnv(), ctx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Connect Claude to DoubleDone');
    expect(html).toContain('name="step" value="email"');
    expect(html).toContain('Existing DoubleDone accounts only');
  });

  it('HTML-escapes the client name (registration data is untrusted)', async () => {
    const evil = { ...CLIENT, clientName: 'Cl<audi>o & "Co"' };
    const env = makeEnv({ OAUTH_KV: kvMock({ 'client:client-1': evil }) } as Partial<Env>);
    const html = await (await worker.fetch(new Request('https://doubledone-ai.example.dev/authorize' + AUTH_QS), env, ctx)).text();
    expect(html).not.toContain('<audi>');
    expect(html).toContain('Cl&lt;audi&gt;o &amp; &quot;Co&quot;');
  });

  it('400s a link with an unregistered client instead of rendering a sign-in', async () => {
    const env = makeEnv({ OAUTH_KV: kvMock() } as Partial<Env>);
    const res = await worker.fetch(new Request('https://doubledone-ai.example.dev/authorize' + AUTH_QS), env, ctx);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('not valid');
  });

  it('sends the OTP with create_user:false (existing users only) and moves to the code step', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const limit = vi.fn(async () => ({ success: true }));
    const env = authorizeEnv({ OTP_LIMITER: { limit } } as Partial<Env>);

    const res = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'email', email: 'mel@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
      env,
      ctx,
    );

    // The limiter was consulted, keyed by the client IP, BEFORE any email left.
    expect(limit).toHaveBeenCalledWith({ key: '1.2.3.4' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [otpUrl, otpInit] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(otpUrl)).toBe('https://proj.supabase.co/auth/v1/otp');
    expect((otpInit.headers as Record<string, string>).apikey).toBe('anon-key');
    expect(JSON.parse(otpInit.body as string)).toEqual({ email: 'mel@example.com', create_user: false });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="step" value="code"');
    expect(html).toContain('6-digit');
  });

  it('does NOT leak membership: an unknown email gets the SAME code page as a known one (no enumeration oracle)', async () => {
    // Supabase refuses an unknown account under create_user:false; the step must still land
    // on the identical code page, never a distinct "No DoubleDone account" reply, so a probe
    // cannot tell a member from a non-member. Only proving inbox control advances further.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error_code: 'otp_disabled' }), { status: 422 })));
    const res = await worker.fetch(formPost('/authorize' + AUTH_QS, { step: 'email', email: 'nobody@example.com' }), authorizeEnv(), ctx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('No DoubleDone account');
    expect(html).toContain('name="step" value="code"');
    expect(html).toContain('6-digit');
  });

  it('gives the same code page whether or not the account exists (known vs unknown are indistinguishable)', async () => {
    // Known account: OTP returns 200.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const known = await (
      await worker.fetch(formPost('/authorize' + AUTH_QS, { step: 'email', email: 'mel@example.com' }), authorizeEnv(), ctx)
    ).text();
    vi.unstubAllGlobals();
    // Unknown account: OTP refuses (422). The membership-bearing part of the page must match.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error_code: 'otp_disabled' }), { status: 422 })));
    const unknown = await (
      await worker.fetch(formPost('/authorize' + AUTH_QS, { step: 'email', email: 'ghost@example.com' }), authorizeEnv(), ctx)
    ).text();
    // Strip the (necessarily different) echoed email, then the pages must be byte-identical.
    const strip = (h: string) => h.replace(/mel@example\.com|ghost@example\.com/g, 'X@example.com');
    expect(strip(known)).toEqual(strip(unknown));
  });

  it('swallows an OTP network throw into the same code page (no distinguishable error branch)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const res = await worker.fetch(formPost('/authorize' + AUTH_QS, { step: 'email', email: 'someone@example.com' }), authorizeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('name="step" value="code"');
  });

  it('429s calmly when the per-IP limiter says no, without sending anything', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const env = authorizeEnv({ OTP_LIMITER: { limit: async () => ({ success: false }) } } as Partial<Env>);
    const res = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'email', email: 'mel@example.com' }, { 'CF-Connecting-IP': '1.2.3.4' }),
      env,
      ctx,
    );
    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await res.text()).toContain('Wait a minute');
  });
});

describe('the /authorize flow (PKCE enforcement)', () => {
  function authorizeEnv(overrides: Partial<Env> = {}): Env {
    // The verify->consent session carry is a stateless AES-GCM blob (no KV); the encrypted-carry
    // path needs MCP_GRANT_KEY, else the flow falls back to plaintext hidden fields.
    const carryKey = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
    return makeEnv({ OAUTH_KV: kvMock({ 'client:client-1': CLIENT }), MCP_GRANT_KEY: carryKey, ...overrides } as Partial<Env>);
  }
  // The OAuth params WITHOUT any PKCE, and with S256-method-but-no-challenge (the gap that
  // slips past the library's allowPlainPKCE:false, then skips the /token PKCE check).
  const NO_PKCE_QS =
    '?response_type=code&client_id=client-1&redirect_uri=' + encodeURIComponent('https://ai.example/cb') + '&state=st1&scope=tasks';
  const S256_NO_CHALLENGE_QS = NO_PKCE_QS + '&code_challenge_method=S256';

  it('GET without a code_challenge is refused (redirects an OAuth invalid_request to the validated redirect_uri), rendering no sign-in', async () => {
    const res = await worker.fetch(new Request('https://doubledone-ai.example.dev/authorize' + S256_NO_CHALLENGE_QS), authorizeEnv(), ctx);
    expect(res.status).toBe(302);
    const back = new URL(res.headers.get('Location') ?? '');
    expect(back.origin + back.pathname).toBe('https://ai.example/cb');
    expect(back.searchParams.get('error')).toBe('invalid_request');
    expect(back.searchParams.get('state')).toBe('st1');
  });

  it('a POST email step without PKCE never sends an OTP (the gate precedes every step)', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await worker.fetch(
      formPost('/authorize' + S256_NO_CHALLENGE_QS, { step: 'email', email: 'mel@example.com' }),
      authorizeEnv(),
      ctx,
    );
    expect(res.status).toBe(302); // bounced to redirect_uri with invalid_request, no code page
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('still accepts a proper S256 challenge (the real connectors are unaffected)', async () => {
    // AUTH_QS carries code_challenge=abc123&code_challenge_method=S256.
    const res = await worker.fetch(new Request('https://doubledone-ai.example.dev/authorize' + AUTH_QS), authorizeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Connect Claude to DoubleDone');
  });
});

describe('the /authorize flow (code + consent steps)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Minimal D1 double for the custody INSERT on Allow. */
  function fakeDb() {
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

  function authorizeEnv(overrides: Partial<Env> = {}): Env {
    // The verify->consent session carry is a stateless AES-GCM blob (no KV); the encrypted-carry
    // path needs MCP_GRANT_KEY, else the flow falls back to plaintext hidden fields.
    const carryKey = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
    return makeEnv({ OAUTH_KV: kvMock({ 'client:client-1': CLIENT }), MCP_GRANT_KEY: carryKey, ...overrides } as Partial<Env>);
  }

  it('verifies the code against Supabase and renders consent with the exact promise copy, the redirect host, and a NONCE (no raw refresh token in the HTML)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        expect(String(url)).toBe('https://proj.supabase.co/auth/v1/verify');
        return new Response(JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', user: { id: 'user-77' } }), { status: 200 });
      }),
    );
    const res = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'code', email: 'mel@example.com', code: '123456' }),
      authorizeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Allow Claude?');
    expect(html).toContain('will be able to add, list, and complete YOUR DoubleDone tasks. Nothing else. It acts as you, and only you.');
    // The redirect host is disclosed so the user sees where the grant goes (anti-spoofing).
    expect(html).toContain('Access will be sent to <strong>ai.example</strong>');
    // With OAUTH_KV bound, the session is held by a single-use nonce; the rotating refresh
    // token must NOT appear in the page HTML at all.
    expect(html).toContain('name="sb_nonce"');
    expect(html).not.toContain('rt-1');
    expect(html).not.toContain('name="sb_refresh"');
  });

  it('completes the FULL nonce round-trip: the nonce from consent is traded back on Allow and mints the grant', async () => {
    // Verify the code (which stashes the session under a nonce and renders it), then post the
    // returned nonce to the Allow step. The refresh token, never in any page, comes back out
    // of the KV stash and lands in custody, encrypted.
    const sbAccess = await signAccess({ sub: 'user-77' });

    const kv = kvMock({ 'client:client-1': CLIENT });
    const { db, calls } = fakeDb();
    const KEY = Buffer.from(new Uint8Array(32).fill(9)).toString('base64');
    const env = makeEnv({ OAUTH_KV: kv, DB: db, MCP_GRANT_KEY: KEY } as Partial<Env>);

    // Step: code -> consent. Returns the nonce in the HTML; the refresh rides the KV stash.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ access_token: sbAccess, refresh_token: 'rt-rotating-1' }), { status: 200 })),
    );
    const codeRes = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'code', email: 'mel@example.com', code: '123456' }),
      env,
      ctx,
    );
    const codeHtml = await codeRes.text();
    const nonce = /name="sb_nonce" value="([^"]+)"/.exec(codeHtml)?.[1];
    expect(nonce).toBeTruthy();
    expect(codeHtml).not.toContain('rt-rotating-1');
    vi.unstubAllGlobals();

    // Step: consent (Allow) with the nonce (NO sb_refresh field). JWKS is served for verify.
    vi.stubGlobal('fetch', jwksOnlyFetch());
    const allowRes = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'consent', decision: 'allow', email: 'mel@example.com', sb_nonce: nonce as string }),
      env,
      ctx,
    );
    expect(allowRes.status).toBe(302);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO mcp_grants'));
    expect(insert).toBeDefined();
    const params = insert?.params as [string, string, string, string, string, number];
    expect(await decryptSecret(KEY, params[3])).toBe('rt-rotating-1');

    // The carry is a stateless AES-GCM blob (no KV to miss), so the security property to hold
    // is that a FORGED/TAMPERED carry will not decrypt and mints nothing (400). A verbatim
    // replay within the TTL would succeed by design; that is the accepted trade-off for a carry
    // that never fails on KV read-after-write (which is what broke real connections).
    const tampered = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'consent', decision: 'allow', email: 'mel@example.com', sb_nonce: 'not-a-real-ciphertext' }),
      env,
      ctx,
    );
    expect(tampered.status).toBe(400);
  });

  it('re-renders the code page calmly on a wrong code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error_code: 'otp_expired' }), { status: 403 })));
    const res = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'code', email: 'mel@example.com', code: '999999' }),
      authorizeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('didn&#39;t match');
    expect(html).toContain('name="step" value="code"');
  });

  it('Cancel tidies away the just-minted session (scope=local only) and redirects with access_denied', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        seen.push(String(url));
        return new Response(null, { status: 204 });
      }),
    );
    const res = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'consent', decision: 'cancel', email: 'mel@example.com', sb_access: 'at-1', sb_refresh: 'rt-1' }),
      authorizeEnv(),
      ctx,
    );
    expect(seen).toEqual(['https://proj.supabase.co/auth/v1/logout?scope=local']);
    expect(res.status).toBe(302);
    const back = new URL(res.headers.get('Location') ?? '');
    expect(back.origin + back.pathname).toBe('https://ai.example/cb');
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('state')).toBe('st1');
  });

  it('Allow via the hidden-field fallback (no nonce posted) still verifies the token, stores custody ENCRYPTED, and redirects with a code', async () => {
    // The consent token is genuinely signed by the shared key; the shared JWKS is served, so
    // defaultVerifySub does full cryptographic work here. This posts sb_access/sb_refresh with
    // NO nonce, exercising the KV-unbound hidden-field fallback branch of stepConsent.
    const sbAccess = await signAccess({ sub: 'user-77' });
    vi.stubGlobal('fetch', jwksOnlyFetch());
    const { db, calls } = fakeDb();
    const KEY = Buffer.from(new Uint8Array(32).fill(9)).toString('base64');
    const env = authorizeEnv({ DB: db, MCP_GRANT_KEY: KEY } as Partial<Env>);

    const res = await worker.fetch(
      formPost('/authorize' + AUTH_QS, {
        step: 'consent',
        decision: 'allow',
        email: 'mel@example.com',
        sb_access: sbAccess,
        sb_refresh: 'rt-rotating-1',
      }),
      env,
      ctx,
    );

    expect(res.status).toBe(302);
    const back = new URL(res.headers.get('Location') ?? '');
    expect(back.origin + back.pathname).toBe('https://ai.example/cb');
    expect(back.searchParams.get('code')).toBeTruthy();
    expect(back.searchParams.get('state')).toBe('st1');

    // Custody landed: the VERIFIED sub, the refresh token encrypted (never plaintext).
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO mcp_grants'));
    expect(insert).toBeDefined();
    const params = insert?.params as [string, string, string, string, string, number];
    expect(params[1]).toBe('user-77');
    expect(params[2]).toBe('mel@example.com');
    expect(params[3]).not.toContain('rt-rotating-1');
    expect(await decryptSecret(KEY, params[3])).toBe('rt-rotating-1');
    expect(params[4]).toBe(sbAccess);
  });

  it('refuses Allow with a forged (unverifiable) token, minting nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/.well-known/jwks.json')) {
          return new Response(JSON.stringify({ keys: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        throw new Error(`unexpected fetch: ${String(url)}`);
      }),
    );
    const { db, calls } = fakeDb();
    const env = authorizeEnv({ DB: db, MCP_GRANT_KEY: Buffer.from(new Uint8Array(32)).toString('base64') } as Partial<Env>);
    const forged = `${b64u({ alg: 'ES256', kid: 'k1' })}.${b64u({ sub: 'victim', iss: 'https://proj.supabase.co/auth/v1' })}.sig`;
    const res = await worker.fetch(
      formPost('/authorize' + AUTH_QS, { step: 'consent', decision: 'allow', email: 'x@y.co', sb_access: forged, sb_refresh: 'rt' }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    expect(calls.find((c) => c.sql.startsWith('INSERT INTO mcp_grants'))).toBeUndefined();
  });
});

describe('POST /mcp/disconnect (the immediate kill switch)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** D1 double whose user-scoped DELETE reports a changes count (like real D1 run() meta). */
  function killDb(changes: number) {
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

  function disconnectReq(token?: string, origin = 'https://doubledone.app'): Request {
    const headers: Record<string, string> = { 'content-type': 'application/json', Origin: origin };
    if (token) headers.Authorization = `Bearer ${token}`;
    return new Request('https://doubledone-ai.example.dev/mcp/disconnect', { method: 'POST', headers, body: '{}' });
  }

  it('deletes the caller\'s custody rows by their VERIFIED user id, returning the count', async () => {
    const token = await signAccess({ sub: 'user-77' });
    vi.stubGlobal('fetch', jwksOnlyFetch());
    const { db, calls } = killDb(3);
    const res = await worker.fetch(disconnectReq(token), makeEnv({ DB: db } as Partial<Env>), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, disconnected: 3 });
    const del = calls.find((c) => c.sql.startsWith('DELETE FROM mcp_grants WHERE user_id'));
    expect(del).toBeDefined();
    expect(del?.params).toEqual(['user-77']); // the VERIFIED sub, not anything client-supplied
  });

  it('401s with no token and deletes nothing', async () => {
    const { db, calls } = killDb(0);
    const res = await worker.fetch(disconnectReq(undefined), makeEnv({ DB: db } as Partial<Env>), ctx);
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it('401s a forged (unverifiable) token, deleting nothing (no elevated trust)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/.well-known/jwks.json')) {
          return new Response(JSON.stringify({ keys: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        throw new Error(`unexpected fetch: ${String(url)}`);
      }),
    );
    const { db, calls } = killDb(0);
    const forged = `${b64u({ alg: 'ES256', kid: 'k1' })}.${b64u({ sub: 'victim', iss: 'https://proj.supabase.co/auth/v1' })}.sig`;
    const res = await worker.fetch(disconnectReq(forged), makeEnv({ DB: db } as Partial<Env>), ctx);
    expect(res.status).toBe(401);
    expect(calls.find((c) => c.sql.startsWith('DELETE FROM mcp_grants'))).toBeUndefined();
  });

  it('refuses a disallowed browser origin before doing anything', async () => {
    const { db, calls } = killDb(0);
    const res = await worker.fetch(disconnectReq('any', 'https://evil.example'), makeEnv({ DB: db } as Partial<Env>), ctx);
    expect(res.status).toBe(403);
    expect(calls.length).toBe(0);
  });

  it('answers the CORS preflight (OPTIONS) without auth', async () => {
    const res = await worker.fetch(
      new Request('https://doubledone-ai.example.dev/mcp/disconnect', {
        method: 'OPTIONS',
        headers: { Origin: 'https://doubledone.app' },
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://doubledone.app');
  });
});
