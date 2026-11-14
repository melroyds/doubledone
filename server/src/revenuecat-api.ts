// POST /apple/reconcile: attach an ANONYMOUS store purchase to the account that owns it. The path says
// Apple because that is where it began, and live iOS clients call it, so it keeps the name. Since Path A
// it also answers for Google Play: it reads which store sold the subscription off RevenueCat's own row.
//
// WHY THIS EXISTS. App Review 5.1.1(v) forbids requiring registration before purchase, so iOS users
// can and do buy while signed out. RevenueCat gives them an `$RCAnonymousID:` app_user_id, and
// `appUserIdFromRcEvent` refuses anything that is not a UUID, so every webhook for that purchase is
// dropped. On 2026-08-19 that was not hypothetical: one of our real Apple subscribers had been
// paying since 9 August and existed nowhere in our database. They lose their renewal date, their
// tenure-scaled keepsake allowance on any other device, a working Premium on web or Android, and
// any chance of us answering a support question about their own money.
//
// Signing in calls `Purchases.logIn(supabaseId)`, which puts the UUID in RevenueCat's alias group
// for that customer. From that moment RevenueCat can answer for the UUID, but no NEW webhook fires,
// so without this route the account stays empty until the next renewal, which can be a month away
// and may arrive as a TRANSFER we deliberately do not act on.
//
// THE TRUST MODEL, which is the whole design. The client asserts NOTHING: no receipt, no product,
// no customer id, no claim of being premium. The server takes the cryptographically verified `sub`
// from the caller's own Supabase JWT and asks RevenueCat about exactly that App User ID. A caller
// can therefore only ever reconcile themselves, and only into a purchase RevenueCat already agrees
// is theirs. There is no request body at all.

import { type D1LikeDatabase, type Entitlement, writeEntitlement } from './entitlements';
import { buildSubscriberRequest, premiumFromSubscriber, sourceForV1Store } from './rc-v1';
import { sandboxAllowlist } from './revenuecat';
// Straight from verify.ts, where the verifier lives: importing it through premium.ts would close a cycle now
// that premium.ts imports the store check.
import { defaultVerifySub, type SubVerifier } from './verify';

export type ReconcileEnv = {
  DB?: D1LikeDatabase;
  SUPABASE_URL?: string;
  /** A RevenueCat **v1 secret** API key (`sk_…`). Server-only; never the public SDK key. */
  RC_SECRET_KEY?: string;
  /** The same named sandbox allowlist the webhook reads (review and tester accounts only). */
  SANDBOX_GRANT_UIDS?: string;
  /** The per-user limiter account deletion uses. Reconcile spends the same RevenueCat key, so it is
   *  limited too, under its own key prefix, or a scripted caller could starve deletions of it. */
  BILLING_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
};

const bearer = (request: Request): string => {
  const h = request.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

// The v1 subscriber lookup and the store spelling live in rc-v1.ts, shared with account deletion and the
// store check, and are re-exported so the existing tests and callers keep importing them from here.
export { buildSubscriberRequest, sourceForV1Store };

/**
 * Read a subscriber body into an entitlement, or null.
 *
 * FAILS CLOSED, in every direction. No premium entitlement, no expiry, an unparseable expiry, an
 * expiry in the past, no matching subscription row, a refund, or a sandbox subscription: all null. This
 * route GRANTS premium, so "not sure" has to mean "no". The reading itself is premiumFromSubscriber
 * (rc-v1.ts), shared with the store check, so this and that can never disagree. A body it cannot read
 * at all ('malformed') is null here too, so the reconcile answers exactly as it always did.
 *
 * The sandbox check is the one worth reading twice. The entitlement object alone does not say which
 * environment it came from; only the per-product `subscriptions` row carries `is_sandbox`. So the
 * reader refuses when the row is MISSING as well as when it is sandbox, because a missing row means we
 * cannot prove it is production. Without that, an entitlement with no `product_identifier` would skip
 * the check entirely and a TestFlight tester could reconcile themselves a real Premium, which is
 * precisely the hole the sandbox webhook guard just closed. No sandbox grace here: this writes a
 * durable row.
 */
export function grantFromSubscriber(body: unknown, userId: string, nowMs: number, sandboxOk = false): Entitlement | null {
  const p = premiumFromSubscriber(body, nowMs);
  if (p.kind !== 'active') return null;
  if (p.sandbox && !sandboxOk) return null; // test money is not money, bar the named few
  return {
    userId,
    customerId: null, // store rows never carry a Stripe customer; the portal correctly 404s
    source: p.source,
    premium: true,
    status: 'active',
    currentPeriodEnd: Math.floor(p.expiresMs / 1000),
    // Auto-renew already turned off. Access still runs to the period end, exactly as the webhook's
    // CANCELLATION branch treats it: this is not a revoke.
    cancelAtPeriodEnd: p.cancelAtPeriodEnd,
  };
}

/**
 * The route. Answers `{ attached: boolean }` and never leaks RevenueCat's body or status.
 *
 * Deliberately NOT an error when there is nothing to attach: a signed-in user with no Apple
 * purchase is the ordinary case (every web and Android user, every free iOS user), and the client
 * calls this on every sign-in. `attached: false` is a normal answer, not a failure.
 *
 * 401 for a missing or forged token. 503 when unconfigured, so a missing secret reads as "cannot
 * decide" rather than "you have nothing".
 */
export async function handleAppleReconcile(
  request: Request,
  env: ReconcileEnv,
  cors: Record<string, string>,
  nowISO: string,
  nowMs: number,
  verifySub: SubVerifier = defaultVerifySub,
  doFetch: typeof fetch = fetch,
): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

  const token = bearer(request);
  if (!token) return json({ error: 'unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.DB || !env.RC_SECRET_KEY) return json({ error: 'not_configured' }, 503);

  const userId = await verifySub(token, env.SUPABASE_URL);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  if (env.BILLING_LIMITER && !(await env.BILLING_LIMITER.limit({ key: `reconcile:${userId}` })).success) {
    return json({ error: 'rate_limited' }, 429);
  }

  let body: unknown;
  try {
    const { url, init } = buildSubscriberRequest(userId, env.RC_SECRET_KEY);
    const res = await doFetch(url, init);
    // A 404 means RevenueCat has never heard of this id, which is the ordinary "nothing to attach".
    // Any other non-2xx is THEIR problem and must not be reported as "you have no subscription":
    // 502 tells the client to leave the user's state alone rather than concluding anything.
    if (res.status === 404) return json({ attached: false });
    if (!res.ok) return json({ error: 'upstream' }, 502);
    body = await res.json();
  } catch {
    return json({ error: 'upstream' }, 502);
  }

  const ent = grantFromSubscriber(body, userId, nowMs, sandboxAllowlist(env.SANDBOX_GRANT_UIDS).has(userId.toLowerCase()));
  if (!ent) return json({ attached: false });

  // ATTACH ONLY: a purchase the webhook never delivered (an anonymous Apple buyer who has just signed in,
  // a missed Play delivery). An account that already has a live Premium row keeps it exactly as the webhook
  // wrote it, because this view of RevenueCat cannot tell "active" from "in grace, payment failing".
  let wrote: boolean | null;
  try {
    wrote = await writeEntitlement(env.DB, ent, nowISO, { attachOnly: true });
  } catch {
    return json({ error: 'upstream' }, 502); // could not persist: say so rather than claim success
  }
  if (wrote === false) return json({ attached: false }); // already Premium: nothing to attach
  return json({ attached: true, currentPeriodEnd: ent.currentPeriodEnd });
}
