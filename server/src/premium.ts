// The server-side premium guard: gate a COSTED route on a TRUSTWORTHY premium entitlement, so paid
// compute (OCR vision, future premium AI) can never be unlocked by a forged token. The existing AI-route
// guard checks origin + a rate-limit only; this adds the entitlement check that a money gate needs. The
// sub is verified cryptographically (the token's signature against Supabase's JWKS), NOT just decoded, so
// a forged token with an arbitrary user id is rejected. Reuses the existing bearer extraction and the
// Stripe-fed D1 entitlement (lib/stripe). Pure-ish and unit-tested: the verifier is injectable, so the
// tests run with no network and no crypto.

import { isCompEmail } from './comp';
import { decodeJwtEmail } from './mcp';
import { bearer, type D1LikeDatabase, type EntitlementView, readEntitlement } from './stripe';
import { activeTrial, startTrial } from './trials';
import { defaultVerifySub, type SubVerifier } from './verify';

export type PremiumOk = { ok: true; userId: string };
export type PremiumDenied = { ok: false; status: 401 | 403 | 503 };
export type PremiumResult = PremiumOk | PremiumDenied;

// The verifier itself lives in verify.ts (it guards money, AI spend and both public surfaces now, not only
// this gate); re-exported here so existing imports keep resolving.
export { defaultVerifySub } from './verify';
export type { SubVerifier } from './verify';

type PremiumEnv = { DB?: D1LikeDatabase; SUPABASE_URL?: string; COMP_EMAILS?: string };


/**
 * Gate a costed route on a premium entitlement. 401 = no / forged / expired token (re-auth), 403 = a valid
 * token but the user is not premium (upsell), 503 = the entitlement store or project URL is unbound (fail
 * closed, never serve paid compute on a config error). The caller maps the status to a JSON body + CORS,
 * exactly like the existing handlers, so this stays transport-agnostic. The caller MUST attach CORS to ALL
 * of 401 / 403 / 503 (a CORS-less error reads as a network failure in the browser, hiding the upsell vs
 * re-auth vs retry distinction). On ok it returns the verified userId for downstream attribution.
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
  // Owner / comp: an allowlisted email is always premium, no Stripe sub. Reading the email here is safe
  // because the token's signature was just verified (userId is non-null), so the email claim is trustworthy.
  if (isCompEmail(decodeJwtEmail(token), env.COMP_EMAILS)) return { ok: true, userId };
  let view: EntitlementView;
  try {
    view = await readEntitlement(env.DB, userId);
  } catch {
    return { ok: false, status: 503 }; // a store error fails CLOSED here; never serve paid compute on a throw
  }
  if (view.premium) return { ok: true, userId };
  // Not premium via Stripe: an active card-free trial also unlocks the costed features. activeTrial fails
  // closed (any store error -> inactive -> 403), so a trials-table hiccup never serves paid compute for free.
  const trial = await activeTrial(env.DB, userId, Math.floor(Date.now() / 1000));
  return trial.active ? { ok: true, userId } : { ok: false, status: 403 };
}

/**
 * POST /trial/start — authed and CRYPTOGRAPHICALLY verified (it grants Premium, so a decode-only check would
 * let a forged token claim a trial). Starts the one-time, card-free 30-day trial for this account, and is
 * gated on a real synced account by construction (a verified sub). Returns { result: 'started' | 'already',
 * expiresAt }.
 */
export async function handleTrial(
  request: Request,
  env: PremiumEnv,
  cors: Record<string, string>,
  verifySub: SubVerifier = defaultVerifySub,
): Promise<Response> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
  const token = bearer(request);
  if (!token) return json({ error: 'sign_in_required' }, 401);
  if (!env.DB || !env.SUPABASE_URL) return json({ error: 'not_configured' }, 503);
  const userId = await verifySub(token, env.SUPABASE_URL);
  if (!userId) return json({ error: 'sign_in_required' }, 401); // forged / expired / malformed
  const { result, expiresAt } = await startTrial(env.DB, userId, Math.floor(Date.now() / 1000));
  if (result === 'error') return json({ error: 'store_error' }, 503);
  return json({ result, expiresAt }, 200);
}
