// MCP OAuth 2.1: the connect-by-URL path for claude.ai / Claude Cowork / ChatGPT
// connectors. @cloudflare/workers-oauth-provider does all the protocol plumbing
// (RFC 8414 + 9728 metadata, /token with PKCE, /register dynamic client registration,
// its own opaque tokens hashed into OAUTH_KV, end-to-end-encrypted props); this module
// supplies what the library deliberately leaves to the app:
//
//   - the /authorize UI: a calm three-screen sign-in (email -> 6-digit Supabase OTP ->
//     consent), existing DoubleDone accounts only, served straight from the Worker
//   - the bridge from a provider grant to the user's OWN Supabase session, held in
//     D1 grant custody (mcp-grants.ts) so the server never needs an elevated key
//   - the /mcp triage: a JWT-shaped bearer is the legacy pasted token and keeps its
//     old path byte-for-byte; anything else is the provider's business, including the
//     RFC 9728 401 challenge that kicks a connector into the OAuth flow
//
// index.ts composes this in front of the existing router so ONLY /mcp and the OAuth
// endpoints change hands; every other route is untouched.

import {
  type AuthRequest,
  type ClientInfo,
  type OAuthHelpers,
  OAuthProvider,
} from '@cloudflare/workers-oauth-provider';

import { deleteGrant, deleteGrantsForUser, getAccessToken, type GrantsEnv, jwtExp, putGrant } from './mcp-grants';
import { decodeJwtEmail, handleMcp, type McpEnv } from './mcp';
import { defaultVerifySub } from './premium';
import { bearer } from './stripe';

// --- Env -----------------------------------------------------------------------

// Typed locally (matching the house style) so we do not depend on a specific
// @cloudflare/workers-types version. The library uses OAUTH_KV at runtime; this
// interface only documents the surface it needs.
export interface KVNamespaceLike {
  get(key: string, options?: unknown): Promise<unknown>;
  put(key: string, value: string, options?: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  list(options?: unknown): Promise<unknown>;
}

interface RateLimiterLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface OAuthEnv extends McpEnv, GrantsEnv {
  /** The provider's storage (clients, grants, token hashes; see wrangler.jsonc). */
  OAUTH_KV?: KVNamespaceLike;
  /** Per-IP limiter on the authorize flow's EMAIL step (5/min, wrangler.jsonc), so the
   *  sign-in page can never be scripted into an email-spam cannon. */
  OTP_LIMITER?: RateLimiterLike;
  /** Injected by the library on every request it routes to our handlers. */
  OAUTH_PROVIDER?: OAuthHelpers;
}

// --- /mcp triage helpers ---------------------------------------------------------

// Three dot-separated base64url segments: the shape of a Supabase access-token JWT
// (RFC 7515 compact serialization), i.e. the legacy pasted token. The provider's own
// tokens are `userId:grantId:secret` (colons, no dots), so the two can never collide.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function isJwtShaped(token: string): boolean {
  return JWT_SHAPE.test(token);
}

/** The paths that change hands to the OAuth provider. Everything else stays with the
 *  existing router. The protected-resource prefix match covers RFC 9728 §3.1's
 *  path-suffixed form (/.well-known/oauth-protected-resource/mcp), which is the URL the
 *  401 challenge on /mcp points connectors at. */
export function isOAuthPath(pathname: string): boolean {
  return (
    pathname === '/authorize' ||
    pathname === '/token' ||
    pathname === '/register' ||
    pathname === AS_METADATA ||
    pathname.startsWith(AS_METADATA + '/') ||
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname.startsWith('/.well-known/oauth-protected-resource/')
  );
}

const AS_METADATA = '/.well-known/oauth-authorization-server';

// --- The /mcp API handler (valid provider token -> custody -> the MCP tools) ----

// The provider has already validated the opaque token and decrypted the grant's props
// into ctx.props before this runs. props carry ONLY { grantId, userId, email } (no
// secrets); custody turns grantId into the user's own Supabase access token lazily, at
// tools/call time, so discovery (initialize / tools/list) stays free of D1 + Supabase
// round-trips. A dead grant surfaces as 401 invalid_token from inside handleMcp.
const mcpApiHandler = {
  async fetch(request: Request, env: OAuthEnv, ctx: ExecutionContext): Promise<Response> {
    const props = (ctx as ExecutionContext & { props?: { grantId?: unknown } }).props;
    const grantId = typeof props?.grantId === 'string' ? props.grantId : '';
    return handleMcp(request, env, {
      kind: 'oauth',
      getToken: () => (grantId ? getAccessToken(env, grantId) : Promise.resolve(null)),
    });
  },
};

// --- The /authorize UI -----------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The shared page shell: DoubleDone's warm paper, inline CSS only, no external
 *  assets (an auth page must not phone anywhere). */
function page(status: number, body: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect to DoubleDone</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #FAF6F1; color: #2B2722;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; }
  .card { width: min(420px, calc(100vw - 32px)); background: #FFFFFF; border: 1px solid #EAE2D8;
          border-radius: 16px; padding: 28px; margin: 24px 0; box-shadow: 0 2px 14px rgba(43,39,34,0.07); }
  .brand { font-weight: 700; letter-spacing: 0.2px; color: #946475; margin-bottom: 18px; }
  h1 { font-size: 18px; margin: 0 0 8px; font-weight: 650; }
  p { font-size: 14px; line-height: 1.5; margin: 0 0 16px; color: #55504A; }
  label { display: block; font-size: 13px; margin-bottom: 6px; color: #55504A; }
  input[type="email"], input[type="text"] { width: 100%; font-size: 16px; padding: 10px 12px;
          border: 1px solid #D9D0C5; border-radius: 10px; background: #FDFBF8; color: #2B2722; }
  input:focus { outline: 2px solid #946475; outline-offset: 1px; border-color: #946475; }
  button { width: 100%; margin-top: 14px; padding: 11px 14px; font-size: 15px; font-weight: 600;
           border: 0; border-radius: 10px; background: #946475; color: #FFFFFF; cursor: pointer; }
  button.quiet { background: transparent; color: #55504A; font-weight: 500; margin-top: 6px; }
  .err { background: #F7EDEA; border: 1px solid #E5CCC4; color: #7A4638; border-radius: 10px;
         padding: 10px 12px; font-size: 13px; line-height: 1.45; margin-bottom: 14px; }
  .fine { font-size: 12px; color: #8A837B; margin-top: 14px; margin-bottom: 0; }
</style>
</head>
<body><main class="card"><div class="brand">DoubleDone</div>
${body}
</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// --- The verify->consent session stash (a single-use KV nonce, not a page field) -------
//
// Between the code-verify step and the Allow click, the user's OWN Supabase access +
// refresh tokens must survive one HTTP round-trip. Carrying them in hidden form fields
// puts a long-lived ROTATING refresh token into the rendered consent HTML, where an
// extension, "view source", autofill, or an HTML-logging proxy could lift it. Instead we
// stash the pair server-side in OAUTH_KV under a random single-use nonce with a short TTL,
// and only the opaque nonce rides the page. Allow trades the nonce back for the pair and
// deletes it (single-use). Keys are namespaced 'mcp:sess:' so they never collide with the
// provider library's own OAUTH_KV keys. If KV is unbound (tests / local dev), the flow
// falls back to the hidden-field carry so nothing breaks.

const SESSION_STASH_PREFIX = 'mcp:sess:';
const SESSION_STASH_TTL_SECONDS = 600; // 10 min: comfortably longer than a consent click, short enough to age out fast

type StashedSession = { email: string; access: string; refresh: string };

/** Stash the verified session under a fresh random nonce, returning the nonce (or null if
 *  KV is unbound or the write fails, so the caller can fall back to the hidden-field carry). */
async function stashSession(env: OAuthEnv, s: StashedSession): Promise<string | null> {
  if (!env.OAUTH_KV) return null;
  const nonce = crypto.randomUUID();
  try {
    await env.OAUTH_KV.put(SESSION_STASH_PREFIX + nonce, JSON.stringify(s), { expirationTtl: SESSION_STASH_TTL_SECONDS });
    return nonce;
  } catch {
    return null;
  }
}

/** Trade a nonce back for the stashed session, deleting it so it cannot be replayed
 *  (single-use). Null for an unknown / expired / already-consumed nonce, or malformed data. */
async function takeSession(env: OAuthEnv, nonce: string): Promise<StashedSession | null> {
  if (!env.OAUTH_KV || !nonce) return null;
  const key = SESSION_STASH_PREFIX + nonce;
  let raw: unknown;
  try {
    raw = await env.OAUTH_KV.get(key, { type: 'json' });
  } catch {
    return null;
  }
  // Consume it regardless of shape: a nonce is one-shot even on a malformed read.
  try {
    await env.OAUTH_KV.delete(key);
  } catch {
    // best effort: the TTL still ages it out
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const email = typeof o.email === 'string' ? o.email : '';
  const access = typeof o.access === 'string' ? o.access : '';
  const refresh = typeof o.refresh === 'string' ? o.refresh : '';
  if (!access || !refresh) return null;
  return { email, access, refresh };
}

type View = { search: string; clientName: string };

function errorBlock(error?: string): string {
  return error ? `<div class="err">${esc(error)}</div>\n` : '';
}

/** Step 1: which email. Existing accounts only; the page says so plainly. */
function emailPage(view: View, opts: { error?: string; email?: string; status?: number } = {}): Response {
  return page(
    opts.status ?? 200,
    `<h1>Connect ${esc(view.clientName)} to DoubleDone</h1>
<p>Sign in with the email you use in the DoubleDone app. We&#39;ll send a 6-digit code. No password needed.</p>
${errorBlock(opts.error)}<form method="post" action="/authorize${esc(view.search)}">
  <input type="hidden" name="step" value="email">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required autocomplete="email" autofocus value="${esc(opts.email ?? '')}">
  <button type="submit">Send code</button>
</form>
<p class="fine">Existing DoubleDone accounts only. Nothing new is created here.</p>`,
  );
}

/** Step 2: the 6-digit code from the OTP email. */
function codePage(view: View, email: string, opts: { error?: string } = {}): Response {
  return page(
    200,
    `<h1>Enter your code</h1>
<p>We sent a 6-digit code to <strong>${esc(email)}</strong>. It can take a moment to arrive.</p>
${errorBlock(opts.error)}<form method="post" action="/authorize${esc(view.search)}">
  <input type="hidden" name="step" value="code">
  <input type="hidden" name="email" value="${esc(email)}">
  <label for="code">6-digit code</label>
  <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required autofocus>
  <button type="submit">Continue</button>
</form>
<p class="fine">Wrong email? <a href="/authorize${esc(view.search)}">Start over</a>.</p>`,
  );
}

/** The carry that survives the verify->Allow round-trip: a single-use KV nonce (preferred)
 *  or, when KV is unbound, the raw session tokens on hidden fields (the fallback). */
type ConsentCarry = { nonce: string } | { access: string; refresh: string };

/** Step 3: consent. The session is held by a single-use KV nonce between verify and Allow
 *  (or, if KV is unbound, the user's OWN tokens ride hidden fields on their own HTTPS page);
 *  either way the Allow step re-verifies the access token's signature before anything is
 *  minted. The registered redirect host is shown so the user sees exactly WHERE their grant
 *  will be sent -- an unverified display name (e.g. "Claude") cannot by itself send a grant
 *  to an attacker's host without that host being visible here. */
function consentPage(view: View, s: { email: string; redirectHost: string; carry: ConsentCarry }): Response {
  const carryFields =
    'nonce' in s.carry
      ? `<input type="hidden" name="sb_nonce" value="${esc(s.carry.nonce)}">`
      : `<input type="hidden" name="sb_access" value="${esc(s.carry.access)}">
  <input type="hidden" name="sb_refresh" value="${esc(s.carry.refresh)}">`;
  return page(
    200,
    `<h1>Allow ${esc(view.clientName)}?</h1>
<p><strong>${esc(view.clientName)}</strong> will be able to add, list, and complete YOUR DoubleDone tasks. Nothing else. It acts as you, and only you.</p>
<p class="fine">Access will be sent to <strong>${esc(s.redirectHost)}</strong>. Only continue if you recognise it.</p>
<form method="post" action="/authorize${esc(view.search)}">
  <input type="hidden" name="step" value="consent">
  <input type="hidden" name="email" value="${esc(s.email)}">
  ${carryFields}
  <button type="submit" name="decision" value="allow">Allow</button>
  <button type="submit" name="decision" value="cancel" class="quiet">Cancel</button>
</form>
<p class="fine">Signed in as ${esc(s.email)}. To disconnect later, use Disconnect AI connectors in DoubleDone settings.</p>`,
  );
}

/** The host of a validated redirect_uri, for the consent disclosure. Falls back to the raw
 *  string if it will not parse (it already passed the library's validation, so this is only
 *  defensive). */
function redirectHostOf(redirectUri: string): string {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}

function plainErrorPage(status: number, message: string): Response {
  return page(status, `<h1>Hmm, that didn&#39;t work</h1><p>${esc(message)}</p>`);
}

/** A rejected authorization (here: missing/invalid PKCE) returned the RFC 6749 §4.1.2.1
 *  way -- redirect the OAuth error back to the client's validated redirect_uri so its SDK
 *  surfaces it -- with a plain-page fallback if that URL cannot be built. redirectUri has
 *  already been validated against the registered client by parseAuthRequest, so this never
 *  redirects to an attacker-chosen location. */
function pkceRequiredResponse(authReq: AuthRequest): Response {
  try {
    const back = new URL(authReq.redirectUri);
    back.searchParams.set('error', 'invalid_request');
    back.searchParams.set('error_description', 'code_challenge with S256 is required (PKCE)');
    if (authReq.state) back.searchParams.set('state', authReq.state);
    return Response.redirect(back.toString(), 302);
  } catch {
    return plainErrorPage(400, 'This connection needs a newer, more secure sign-in. Update your AI assistant, then connect again.');
  }
}

// --- The /authorize steps ----------------------------------------------------------

async function stepEmail(request: Request, env: OAuthEnv, form: FormData, view: View): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return plainErrorPage(500, 'Sign-in is not configured on this server.');
  const email = String(form.get('email') ?? '').trim();
  if (!email || !email.includes('@')) {
    return emailPage(view, { error: 'Enter the email you use in DoubleDone.' });
  }
  // Rate-limit BEFORE any email leaves the building. Skipped cleanly when the binding
  // is absent (tests / local dev), same convention as AI_LIMITER in index.ts.
  if (env.OTP_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'anon';
    const { success } = await env.OTP_LIMITER.limit({ key: ip });
    if (!success) {
      return emailPage(view, {
        status: 429,
        email,
        error: 'A few codes went out just now. Wait a minute, then try again. Your place is safe.',
      });
    }
  }
  // create_user:false is the whole point: a connector is not a place to create accounts.
  // Fire the OTP but DISCARD the outcome: we advance to the code page with the SAME response
  // whatever Supabase said (OK, a 429, or a refusal for an unknown account). The branches
  // used to be visibly different, which turned this pre-auth step into a membership oracle
  // -- a distinct "No DoubleDone account" reply confirms whether a given person uses
  // DoubleDone. For an audience where that (a neurodivergence-support tool) is sensitive, we
  // refuse to disclose it: an unknown email simply never receives a code, so the code step
  // fails for them at verify. Only proving inbox control advances further. A network throw
  // is swallowed for the same reason -- it must not become a distinguishable branch either.
  try {
    await fetch(`${env.SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, create_user: false }),
    });
  } catch {
    // swallow: the response must be identical whether or not the send succeeded
  }
  return codePage(view, email);
}

async function stepCode(env: OAuthEnv, form: FormData, view: View, authReq: AuthRequest): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return plainErrorPage(500, 'Sign-in is not configured on this server.');
  const email = String(form.get('email') ?? '').trim();
  if (!email) return emailPage(view, { error: 'Start again with your email.' });
  const code = String(form.get('code') ?? '').trim();
  if (!/^[0-9]{6,8}$/.test(code)) {
    return codePage(view, email, { error: 'Enter the 6-digit code from the email.' });
  }
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'email', email, token: code }),
  });
  if (!res.ok) {
    return codePage(view, email, { error: "That code didn't match (they expire quickly). Check the newest email, or start over for a fresh one." });
  }
  let session: { access_token?: unknown; refresh_token?: unknown } | null = null;
  try {
    session = (await res.json()) as { access_token?: unknown; refresh_token?: unknown };
  } catch {
    session = null;
  }
  const access = typeof session?.access_token === 'string' ? session.access_token : '';
  const refresh = typeof session?.refresh_token === 'string' ? session.refresh_token : '';
  if (!access || !refresh) {
    return codePage(view, email, { error: 'Something went sideways signing you in. Try the code again.' });
  }
  // Prefer the single-use KV nonce stash so the rotating refresh token never enters the
  // consent HTML; fall back to the hidden-field carry only when KV is unbound.
  const redirectHost = redirectHostOf(authReq.redirectUri);
  const nonce = await stashSession(env, { email, access, refresh });
  const carry: ConsentCarry = nonce ? { nonce } : { access, refresh };
  return consentPage(view, { email, redirectHost, carry });
}

/** Custody rows belonging to grants this re-authorization is about to replace get
 *  removed, so superseded refresh ciphertexts do not pile up in D1 AND the old connection
 *  goes dead (its token resolves to a missing custody row and 401s). We do NOT revoke the
 *  provider-side grants here (completeAuthorization runs with revokeExistingGrants:false, on
 *  purpose, see there): revoking mid-connect is what caused the "Grant not found" loop. The
 *  old provider grant records simply age out via KV TTL, harmless once custody is gone. The
 *  custodyGrantId lives in the grant's unencrypted metadata for exactly this lookup, and it
 *  is only a random uuid, never a secret. */
async function retireReplacedGrants(helpers: OAuthHelpers, env: GrantsEnv, userId: string, clientId: string): Promise<void> {
  try {
    let cursor: string | undefined;
    do {
      const pageResult = await helpers.listUserGrants(userId, { cursor });
      for (const g of pageResult.items) {
        if (g.clientId !== clientId) continue;
        const custodyId = (g.metadata as { custodyGrantId?: unknown } | null)?.custodyGrantId;
        if (typeof custodyId === 'string' && custodyId) await deleteGrant(env, custodyId);
      }
      cursor = pageResult.cursor;
    } while (cursor);
  } catch {
    // best effort: an orphaned custody row is inert (encrypted, and nothing references it)
  }
}

async function stepConsent(env: OAuthEnv, helpers: OAuthHelpers, authReq: AuthRequest, form: FormData): Promise<Response> {
  const decision = String(form.get('decision') ?? '');

  // Resolve the session: the single-use nonce (preferred) is traded back and consumed here;
  // the hidden-field carry is the KV-unbound fallback. Either way the tokens are the user's
  // own, and the access token's signature is re-verified below before anything is minted.
  const nonce = String(form.get('sb_nonce') ?? '');
  let access: string;
  let refresh: string;
  if (nonce) {
    const stashed = await takeSession(env, nonce);
    access = stashed?.access ?? '';
    refresh = stashed?.refresh ?? '';
  } else {
    access = String(form.get('sb_access') ?? '');
    refresh = String(form.get('sb_refresh') ?? '');
  }

  if (decision !== 'allow') {
    // Cancel: tidy away the session the code step just minted -- scope=local ONLY (the
    // default scope is global, which would sign the user out of their own app
    // everywhere), best-effort -- then hand the client a clean access_denied. The
    // redirect target is safe: parseAuthRequest validated it against the registered client.
    if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY && access) {
      try {
        await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
          method: 'POST',
          headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${access}` },
        });
      } catch {
        // best effort; an abandoned session simply ages out
      }
    }
    const back = new URL(authReq.redirectUri);
    back.searchParams.set('error', 'access_denied');
    if (authReq.state) back.searchParams.set('state', authReq.state);
    return Response.redirect(back.toString(), 302);
  }

  if (!env.SUPABASE_URL) return plainErrorPage(500, 'Sign-in is not configured on this server.');
  if (!access || !refresh) return plainErrorPage(400, 'That sign-in went stale. Go back to your AI assistant and connect again.');

  // The token, not the form, is the identity: verify the access token's signature
  // against Supabase's JWKS (the same verifier the money gate uses) and take sub/email
  // from its claims. A forged or expired consent POST dies here, minting nothing.
  const userId = await defaultVerifySub(access, env.SUPABASE_URL);
  if (!userId) return plainErrorPage(400, 'That sign-in went stale. Go back to your AI assistant and connect again.');
  const email = decodeJwtEmail(access) ?? String(form.get('email') ?? '');

  const grantId = crypto.randomUUID();
  await retireReplacedGrants(helpers, env, userId, authReq.clientId);

  let redirectTo: string;
  try {
    ({ redirectTo } = await helpers.completeAuthorization({
      request: authReq,
      userId,
      metadata: { custodyGrantId: grantId },
      scope: ['tasks'],
      // props are encrypted end-to-end by the library, but still: identifiers ONLY,
      // never session tokens. The tokens live in custody, under our own key.
      props: { grantId, userId, email },
      // revokeExistingGrants MUST stay false. A connector (claude.ai was the repro) makes
      // several /authorize attempts while wiring up; with the library default (revoke ON),
      // a later attempt revokes an earlier attempt's grant WHILE the connector is still
      // exchanging that earlier code at /token, which then 400s "Grant not found" and the
      // connector loops forever. Old grants do not need revoking here anyway:
      // retireReplacedGrants already deletes their custody (so their tokens 401 and they are
      // effectively dead), the explicit /mcp/disconnect hard-revokes, and the rest age out
      // via KV TTL. Turning this off is what makes a fresh connection reliable, not a dice roll.
      revokeExistingGrants: false,
    }));
  } catch {
    return plainErrorPage(400, 'This connection request is not valid any more. Go back to your AI assistant and connect again.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ok = await putGrant(env, {
    grantId,
    userId,
    email,
    refreshToken: refresh,
    accessToken: access,
    accessExp: jwtExp(access) ?? nowSec + 3600,
  });
  if (!ok) {
    // Without custody the minted grant would 401 on every tool call forever. Better a
    // clean retry now than a wedged connector later, so no redirect on failure.
    console.warn('[mcp-oauth] custody write failed; authorization not delivered');
    return plainErrorPage(500, 'Could not finish connecting just now. Go back to your AI assistant and try once more.');
  }
  console.log(`[mcp-oauth] grant created: client=${authReq.clientId} custody=${grantId}`);
  return Response.redirect(redirectTo, 302);
}

// The defaultHandler: everything the provider does not handle itself lands here, which
// (given the composition in index.ts) is exactly the /authorize UI.
const authorizeHandler = {
  async fetch(request: Request, env: OAuthEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/authorize') return new Response('not found', { status: 404 });
    const helpers = env.OAUTH_PROVIDER;
    if (!helpers) return plainErrorPage(500, 'Sign-in is not available right now.');

    // Every step re-parses the OAuth params from the URL (the forms carry the original
    // query string in their action), so redirect_uri / PKCE / state handling stays
    // entirely the library's, on every request, with its client + redirect validation.
    let authReq: AuthRequest;
    let client: ClientInfo | null;
    try {
      authReq = await helpers.parseAuthRequest(request);
      client = await helpers.lookupClient(authReq.clientId);
    } catch {
      return plainErrorPage(400, 'This connection link is not valid. Go back to your AI assistant and try connecting again.');
    }
    if (!client || !authReq.clientId || !authReq.redirectUri) {
      return plainErrorPage(400, 'This connection link is not valid. Go back to your AI assistant and try connecting again.');
    }

    // Enforce S256 PKCE at the door, before any UI renders or any session is minted. The
    // library (v0.8.1) treats code_challenge as OPTIONAL: allowPlainPKCE:false only rejects
    // the plain METHOD when a challenge is present, and a request with
    // code_challenge_method=S256 but NO code_challenge slips through parseAuthRequest, then
    // at /token isPkceEnabled = !!codeChallenge is false, so the whole PKCE check is skipped
    // and the code exchanges with no verifier. PKCE is the exact control that binds the code
    // to the initiating client (the wall that makes a leaked code useless), and every target
    // connector sends S256, so a request without it is not a real connector: refuse it as an
    // OAuth invalid_request. The redirect_uri was validated against the registered client by
    // parseAuthRequest above, so redirecting the error back to it is safe (and is what an
    // OAuth client expects); fall back to a plain page only if that URL will not build.
    if (!authReq.codeChallenge || authReq.codeChallengeMethod !== 'S256') {
      return pkceRequiredResponse(authReq);
    }

    const view: View = { search: url.search, clientName: client.clientName?.trim() || 'This app' };

    if (request.method === 'GET') return emailPage(view);
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return plainErrorPage(400, 'That did not come through right. Go back and try again.');
    }
    const step = String(form.get('step') ?? '');
    if (step === 'email') return stepEmail(request, env, form, view);
    if (step === 'code') return stepCode(env, form, view, authReq);
    if (step === 'consent') return stepConsent(env, helpers, authReq, form);
    return plainErrorPage(400, 'That did not come through right. Go back and try again.');
  },
};

// --- The provider ---------------------------------------------------------------

// One instance, module scope (its options are static; construction validates them).
// It serves /.well-known/*, /token and /register itself, guards /mcp (the apiRoute)
// with its token validation + the RFC 9728 401 challenge, and hands /authorize to the
// handler above. S256-only PKCE: OAuth 2.1 discourages plain, and every target
// connector (claude.ai, Cowork, ChatGPT) speaks S256.
const provider = new OAuthProvider<OAuthEnv>({
  apiRoute: '/mcp',
  apiHandler: mcpApiHandler,
  defaultHandler: authorizeHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  scopesSupported: ['tasks'],
  allowImplicitFlow: false,
  allowPlainPKCE: false,
  resourceMetadata: { resource_name: 'DoubleDone' },
});

/** The single entry point index.ts routes OAuth paths and non-legacy /mcp traffic to.
 *  Also folds RFC 8414's path-inserted form (/.well-known/oauth-authorization-server/mcp,
 *  which some MCP clients try first) onto the root path the library serves, for GET-ish
 *  requests only, so first-try discovery works without a fallback round-trip. */
export function oauthFetch(request: Request, env: OAuthEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.pathname.startsWith(AS_METADATA + '/') &&
    (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS')
  ) {
    url.pathname = AS_METADATA;
    request = new Request(url.toString(), request);
  }
  return provider.fetch(request, env, ctx);
}

/** POST /mcp/disconnect -- the IMMEDIATE, user-driven MCP kill switch, authed by the user's
 *  OWN Supabase token (verified against JWKS, so a forged token severs nothing). It DELETES
 *  every custody row for the user, which makes the very next getAccessToken for any of their
 *  connectors return null with no network -- closing the up-to-an-hour window where a cached
 *  access token would otherwise keep a distrusted connector alive after the user cut it off.
 *  (Signing out everywhere only revokes the Supabase refresh FAMILY; the cached access token
 *  outlives it. Removing custody is what makes revocation instant.) No elevated key is used:
 *  the user proves their own identity, and deletes only their own rows. If the provider
 *  helpers are in scope it also best-effort revokes the provider-side grants; the custody
 *  delete alone already severs access (a live opaque token resolves through custody to null
 *  -> 401 invalid_token -> the connector re-authorizes). The caller supplies origin-gated
 *  CORS, exactly like the Stripe handlers. */
export async function handleMcpDisconnect(request: Request, env: OAuthEnv, cors: Record<string, string>): Promise<Response> {
  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

  const token = bearer(request);
  if (!token) return json(401, { error: 'sign_in_required' });
  if (!env.SUPABASE_URL) return json(503, { error: 'not configured' });
  const userId = await defaultVerifySub(token, env.SUPABASE_URL);
  if (!userId) return json(401, { error: 'sign_in_required' });

  // The guaranteed half: sever the token bridge immediately.
  const removed = await deleteGrantsForUser(env, userId);

  // Best-effort provider-side cleanup, only if the library helpers are in scope (they are
  // injected on provider-routed requests; absent here, the custody delete above is already
  // sufficient to cut off access). Never let a revoke hiccup fail the disconnect.
  const helpers = env.OAUTH_PROVIDER;
  if (helpers) {
    try {
      let cursor: string | undefined;
      do {
        const pageResult = await helpers.listUserGrants(userId, { cursor });
        for (const g of pageResult.items) {
          try {
            await helpers.revokeGrant(g.id, userId);
          } catch {
            // best effort per grant
          }
        }
        cursor = pageResult.cursor;
      } while (cursor);
    } catch {
      // best effort: custody is already gone, which is what severs access
    }
  }

  return json(200, { ok: true, disconnected: removed });
}
