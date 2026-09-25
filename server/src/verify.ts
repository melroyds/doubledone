// The ONE place a bearer is cryptographically verified. Every route that spends money, spends AI, or
// answers over a user's data runs this before doing anything else: the Stripe routes (/checkout,
// /portal, /entitlement), the trial, the MCP tools/call path (pasted token AND OAuth custody), the public
// REST API, and the disconnect kill switch. Decoding a JWT without checking its signature is fine for
// reading a hint (an email for a comp check AFTER verification); it is never fine for deciding who is
// asking. Before 2026-09-25 the Stripe routes, the MCP header path and the REST API only decoded, so a
// hand-made three-segment string with somebody's uuid reached their billing portal and the AI spender.
// The verifier is injectable so unit tests pass a stub and never touch the network or crypto.

import { createRemoteJWKSet, jwtVerify } from 'jose';

/** Returns the cryptographically-VERIFIED `sub` (the trusted user id), or null for a missing, forged,
 *  expired, or malformed token. Injectable so unit tests pass a stub and never touch the network. */
export type SubVerifier = (token: string, supabaseUrl: string) => Promise<string | null>;

// Cache the JWKS set per project URL across Worker invocations. jose fetches the keys lazily on first
// verify and keeps its own short-lived cache (re-fetching on an unknown kid), so this only re-creates the
// set if the URL changes. supabaseUrl is trusted env (never request-derived), so the cache key cannot be
// poisoned, and a stale key after a rotation fails verification CLOSED (throw -> null -> 401), self-healing.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksFor: string | undefined;
function jwksSet(supabaseUrl: string) {
  if (!jwks || jwksFor !== supabaseUrl) {
    jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl));
    jwksFor = supabaseUrl;
  }
  return jwks;
}

/**
 * The real verifier: check the token's signature against Supabase's JWKS (asymmetric ES256/RS256) and
 * return the trusted `sub`. ANY failure (bad signature, wrong alg, expired, malformed, network) returns
 * null, so the guard fails closed. A malformed token throws on header-parse before any network fetch.
 */
export const defaultVerifySub: SubVerifier = async (token, supabaseUrl) => {
  try {
    // Pin the algorithm allow-list (blocks alg:'none' and the HS256 public-key-as-secret confusion), the
    // issuer (Supabase GoTrue: ${SUPABASE_URL}/auth/v1, confirmed against the project's OpenID config), and
    // require a sub. exp / nbf are enforced by jose by default. Any failure throws and is caught as null.
    const { payload } = await jwtVerify(token, jwksSet(supabaseUrl), {
      algorithms: ['ES256', 'RS256'],
      issuer: `${supabaseUrl}/auth/v1`,
      requiredClaims: ['sub'],
    });
    // A non-empty string sub only (match the old decodeJwtSub's strictness; an empty sub is no-auth).
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
};
