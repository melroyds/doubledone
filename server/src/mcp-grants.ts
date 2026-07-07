// MCP OAuth grant custody: the bridge between a workers-oauth-provider grant and the
// user's OWN Supabase session. The provider hands /mcp requests a props.grantId; this
// module turns that id into a live Supabase access token by holding the user's ROTATING
// refresh token in D1 (mcp_grants), AES-GCM-256-encrypted under the MCP_GRANT_KEY Worker
// secret. The server still holds NO elevated key: every task call runs as the user under
// row-level security, exactly like the legacy pasted-token path.
//
// Supabase refresh tokens are SINGLE-USE: each refresh consumes the old token and issues
// a new one, so the rotated token is persisted in the SAME UPDATE that caches the new
// access token. Concurrent refreshes can race; Supabase keeps a short reuse grace window
// for exactly this, so we deliberately do NOT build distributed locking. A refresh the
// auth server REJECTS marks the row revoked_at and returns null, which /mcp surfaces as a
// 401 invalid_token so the client re-runs the OAuth flow cleanly. A merely TRANSIENT
// failure (network, 5xx, 429) returns null WITHOUT revoking, so a Supabase blip never
// burns a healthy grant.
//
// Which rejection statuses revoke: 401/403/404 are unambiguous (the token/user/family is
// gone), so they revoke. A bare 400 is NOT revoked: a 400 is exactly what the LOSER of a
// concurrent-rotation race gets when Supabase's reuse-grace window is off or short (a
// plausible operator hardening the code cannot see), and bricking a healthy grant there
// forces the user through the whole OAuth flow again for no fault of their own. A truly
// dead grant that returns 400 simply keeps returning null (the tool call 401s and the
// connector re-authorizes), so declining to revoke on 400 costs a stale row, not access.
//
// The crypto (encryptSecret/decryptSecret) is pure and unit-tested; getAccessToken's
// fetch is mocked in tests. Never log tokens, codes, or emails here.

import type { D1LikeDatabase } from './telemetry';

export interface GrantsEnv {
  DB?: D1LikeDatabase;
  /** base64 of exactly 32 random bytes: the AES-GCM-256 custody key (a Worker secret,
   *  set with `npx wrangler secret put MCP_GRANT_KEY`). Unset = custody is off and every
   *  lookup fails closed to null. */
  MCP_GRANT_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

/** One mcp_grants row (see server/d1/schema.sql). access_exp is epoch SECONDS (it mirrors
 *  the JWT exp claim); created_at / updated_at / revoked_at are epoch ms. */
export type McpGrantRow = {
  grant_id: string;
  user_id: string;
  email: string;
  refresh_enc: string;
  access_token: string | null;
  access_exp: number | null;
  created_at: number;
  updated_at: number;
  revoked_at: number | null;
};

// --- AES-GCM-256 for the refresh token at rest --------------------------------

const IV_BYTES = 12; // 96-bit IV, the AES-GCM standard size
const ACCESS_SKEW_SECONDS = 60; // treat a cached access token as stale this early

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function importGrantKey(keyB64: string): Promise<CryptoKey | null> {
  const raw = b64ToBytes(keyB64);
  if (!raw || raw.length !== 32) return null; // anything but a 256-bit key is a misconfig: fail closed
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Encrypt a secret for the refresh_enc column. A FRESH random 12-byte IV per call (an
 *  AES-GCM IV must never be reused under one key); stored as JSON {iv, ct} base64.
 *  Returns null only when the key itself is missing or malformed. */
export async function encryptSecret(keyB64: string, plaintext: string): Promise<string | null> {
  const key = await importGrantKey(keyB64);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return JSON.stringify({ iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) });
}

/** Decrypt a refresh_enc value. Null for a bad key, garbage JSON, or a tampered
 *  ciphertext (AES-GCM authenticates, so tampering fails closed, never garbles). */
export async function decryptSecret(keyB64: string, stored: string): Promise<string | null> {
  const key = await importGrantKey(keyB64);
  if (!key) return null;
  try {
    const parsed = JSON.parse(stored) as { iv?: unknown; ct?: unknown };
    const iv = typeof parsed.iv === 'string' ? b64ToBytes(parsed.iv) : null;
    const ct = typeof parsed.ct === 'string' ? b64ToBytes(parsed.ct) : null;
    if (!iv || iv.length !== IV_BYTES || !ct) return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** The `exp` (epoch seconds) from a JWT payload, unverified. Custody only uses it to
 *  time a CACHE (the token is verified by Supabase on every REST call), so a decode-only
 *  read is safe here. Mirrors decodeJwtSub's base64url handling in mcp.ts. */
export function jwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const exp = (JSON.parse(atob(b64)) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

// --- The custody store ---------------------------------------------------------

/** Persist a brand-new grant's custody row (called once, from the consent Allow step).
 *  False = could not store (no DB, no key, or a D1 hiccup); the caller must NOT redirect
 *  the client on false, or the minted grant would be a dud that 401s forever. */
export async function putGrant(
  env: GrantsEnv,
  g: { grantId: string; userId: string; email: string; refreshToken: string; accessToken: string; accessExp: number },
  nowMs = Date.now(),
): Promise<boolean> {
  if (!env.DB || !env.MCP_GRANT_KEY) return false;
  const enc = await encryptSecret(env.MCP_GRANT_KEY, g.refreshToken);
  if (!enc) return false;
  try {
    await env.DB.prepare(
      'INSERT INTO mcp_grants (grant_id, user_id, email, refresh_enc, access_token, access_exp, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
    )
      .bind(g.grantId, g.userId, g.email, enc, g.accessToken, g.accessExp, nowMs, nowMs)
      .run();
    return true;
  } catch {
    return false;
  }
}

/** Drop a custody row outright (used when a re-authorization supersedes the old grant;
 *  the provider revokes its side, this removes the now-orphaned refresh ciphertext). */
export async function deleteGrant(env: GrantsEnv, grantId: string): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare('DELETE FROM mcp_grants WHERE grant_id = ?1').bind(grantId).run();
  } catch {
    // best effort: an orphaned row is inert (encrypted, and nothing references its id)
  }
}

/** The IMMEDIATE MCP kill switch: delete every custody row for a user, so the very next
 *  getAccessToken for any of their grants returns null (row absent) with no network and no
 *  wait for a cached access token to expire. Signing out everywhere only revokes the
 *  Supabase refresh FAMILY, which the ~1h cached access token outlives; this closes that
 *  window by removing custody itself. Returns the number of rows removed (0 if custody is
 *  unconfigured or the user had none). The provider-side grants are revoked separately by
 *  the caller; this is the half that severs the token bridge at once. */
export async function deleteGrantsForUser(env: GrantsEnv, userId: string): Promise<number> {
  if (!env.DB || !userId) return 0;
  try {
    const res = (await env.DB.prepare('DELETE FROM mcp_grants WHERE user_id = ?1').bind(userId).run()) as
      | { meta?: { changes?: unknown } }
      | undefined;
    const changes = res?.meta?.changes;
    return typeof changes === 'number' ? changes : 0;
  } catch {
    return 0; // best effort: a store hiccup must not throw the disconnect handler
  }
}

async function markRevoked(env: GrantsEnv, grantId: string, nowMs: number): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare('UPDATE mcp_grants SET revoked_at = ?2, updated_at = ?2 WHERE grant_id = ?1').bind(grantId, nowMs).run();
  } catch {
    // best effort: the refresh will be rejected again next call and re-attempt the mark
  }
}

/**
 * The heart of custody: a provider grantId in, a live Supabase access token out (or null,
 * which the /mcp path surfaces as 401 invalid_token so the client re-authorizes).
 *
 *   row absent or revoked  -> null, no network
 *   cached access fresh    -> return it, no network (fresh = access_exp minus 60s skew)
 *   else                   -> refresh against Supabase; persist the ROTATED refresh token
 *                             + the new cached access + exp in ONE update, return the token
 *   refresh REJECTED (400/401/403/404: the family is dead) -> set revoked_at, null
 *   refresh TRANSIENTLY failing (network / 5xx / 429)      -> null, row untouched
 */
export async function getAccessToken(env: GrantsEnv, grantId: string, nowMs = Date.now()): Promise<string | null> {
  if (!env.DB || !env.MCP_GRANT_KEY || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  let row: McpGrantRow | null;
  try {
    row = await env.DB.prepare('SELECT * FROM mcp_grants WHERE grant_id = ?1').bind(grantId).first<McpGrantRow>();
  } catch {
    return null;
  }
  if (!row || row.revoked_at != null) return null;

  const nowSec = Math.floor(nowMs / 1000);
  if (row.access_token && typeof row.access_exp === 'number' && row.access_exp - ACCESS_SKEW_SECONDS > nowSec) {
    return row.access_token;
  }

  const refresh = await decryptSecret(env.MCP_GRANT_KEY, row.refresh_enc);
  if (!refresh) {
    // Undecryptable = the row can never refresh again (key rotated, or the column was
    // tampered with). Dead either way; mark it so future calls short-circuit.
    console.warn('[mcp-grants] undecryptable refresh token; revoking grant');
    await markRevoked(env, grantId, nowMs);
    return null;
  }

  let res: Response;
  try {
    res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch {
    return null; // transient network failure: never revoke a healthy grant over a blip
  }

  if (!res.ok) {
    // An UNAMBIGUOUS rejection (401 token invalid, 403 forbidden, 404 user/token gone) =
    // the grant is dead: revoke so future calls short-circuit. A bare 400 is deliberately
    // NOT revoked (see the header note): it is the concurrent-rotation race's losing
    // response, and a false revoke there would brick a healthy grant. Everything else
    // (5xx / 429) is Supabase having a moment; leave the row for the next attempt.
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      console.warn(`[mcp-grants] refresh rejected (${res.status}); revoking grant`);
      await markRevoked(env, grantId, nowMs);
    }
    return null;
  }

  let session: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; expires_at?: unknown };
  try {
    session = (await res.json()) as typeof session;
  } catch {
    return null;
  }
  const access = typeof session.access_token === 'string' ? session.access_token : '';
  const rotated = typeof session.refresh_token === 'string' ? session.refresh_token : '';
  if (!access || !rotated) return null;

  const accessExp =
    typeof session.expires_at === 'number'
      ? session.expires_at
      : typeof session.expires_in === 'number'
        ? nowSec + session.expires_in
        : (jwtExp(access) ?? nowSec + 3600);

  const enc = await encryptSecret(env.MCP_GRANT_KEY, rotated);
  if (enc) {
    try {
      // One UPDATE for the rotated refresh token AND the new cached access: the old
      // refresh token is already consumed upstream, so these must land together.
      await env.DB.prepare('UPDATE mcp_grants SET refresh_enc = ?2, access_token = ?3, access_exp = ?4, updated_at = ?5 WHERE grant_id = ?1')
        .bind(grantId, enc, access, accessExp, nowMs)
        .run();
    } catch {
      // The refresh succeeded but the persist did not: return the working access token
      // anyway. The stored (already-used) refresh token gets one more chance inside
      // Supabase's reuse grace window; past it, the next refresh revokes cleanly.
    }
  }
  return access;
}
