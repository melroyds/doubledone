// The server-side premium guard: gate a COSTED route on a TRUSTWORTHY premium entitlement, so paid
// compute (OCR vision, future premium AI) can never be unlocked by a forged token. The existing AI-route
// guard checks origin + a rate-limit only; this adds the entitlement check that a money gate needs. The
// sub is verified cryptographically (the token's signature against Supabase's JWKS), NOT just decoded, so
// a forged token with an arbitrary user id is rejected. Reuses the existing bearer extraction and the
// Stripe-fed D1 entitlement (lib/stripe). Pure-ish and unit-tested: the verifier is injectable, so the
// tests run with no network and no crypto.

import { createRemoteJWKSet, jwtVerify } from 'jose';

import { bearer, type D1LikeDatabase, readEntitlement } from './stripe';

export type PremiumOk = { ok: true; userId: string };
export type PremiumDenied = { ok: false; status: 401 | 403 | 503 };
export type PremiumResult = PremiumOk | PremiumDenied;

/** Returns the cryptographically-VERIFIED `sub` (the trusted user id), or null for a missing, forged,
 *  expired, or malformed token. Injectable so unit tests pass a stub and never touch the network. */
export type SubVerifier = (token: string, supabaseUrl: string) => Promise<string | null>;

type PremiumEnv = { DB?: D1LikeDatabase; SUPABASE_URL?: string };

// Cache the JWKS set per project URL across Worker invocations. jose fetches the keys lazily on first
// verify and keeps its own short-lived cache, so this only re-creates the set if the URL ever changes.
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
    const { payload } = await jwtVerify(token, jwksSet(supabaseUrl), { algorithms: ['ES256', 'RS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

/**
 * Gate a costed route on a premium entitlement. 401 = no / forged / expired token (re-auth), 403 = a valid
 * token but the user is not premium (upsell), 503 = the entitlement store or project URL is unbound (fail
 * closed, never serve paid compute on a config error). The caller maps the status to a JSON body + CORS,
 * exactly like the existing handlers, so this stays transport-agnostic. On ok it returns the verified
 * userId for downstream attribution (telemetry / outcome).
 */
export async function requirePremium(
  request: Request,
  env: PremiumEnv,
  verifySub: SubVerifier = defaultVerifySub,
): Promise<PremiumResult> {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401 };
  if (!env.DB || !env.SUPABASE_URL) return { ok: false, status: 503 }; // cannot decide -> fail closed
  const userId = await verifySub(token, env.SUPABASE_URL);
  if (!userId) return { ok: false, status: 401 }; // forged / malformed / expired
  const view = await readEntitlement(env.DB, userId);
  if (!view.premium) return { ok: false, status: 403 }; // signed in, not premium
  return { ok: true, userId };
}
