// POST /apple/reconcile — attach an ANONYMOUS Apple purchase to the account that owns it.
//
// WHY THIS EXISTS. App Review 5.1.1(v) forbids requiring registration before purchase, so iOS users
// can and do buy while signed out. RevenueCat gives them an `$RCAnonymousID:` app_user_id, and
// `appUserIdFromRcEvent` refuses anything that is not a UUID, so every webhook for that purchase is
// dropped. On 2026-08-19 that was not hypothetical: one of our two real Apple subscribers had been
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
import { defaultVerifySub, type SubVerifier } from './premium';

export type ReconcileEnv = {
  DB?: D1LikeDatabase;
  SUPABASE_URL?: string;
  /** A RevenueCat **v1 secret** API key (`sk_…`). Server-only; never the public SDK key. */
  RC_SECRET_KEY?: string;
};

/** The RevenueCat entitlement id, mirroring revenuecat.ts and the client. */
const ENTITLEMENT = 'premium';

const bearer = (request: Request): string => {
  const h = request.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

/**
 * The v1 subscriber lookup. Built as data so the request shape is a tested contract rather than
 * something only a live call can confirm.
 *
 * v1 and NOT v2 deliberately: `GET /v1/subscribers/{id}` returns `subscriptions` keyed by product
 * with a per-subscription `is_sandbox`, which the sandbox check below depends on. The v2 customer
 * endpoints need a project id, a different shape and pagination to answer the same question.
 */
export function buildSubscriberRequest(userId: string, secret: string): { url: string; init: RequestInit } {
  return {
    url: `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    init: { method: 'GET', headers: { Authorization: `Bearer ${secret}`, accept: 'application/json' } },
  };
}

/**
 * Read a subscriber body into an entitlement, or null.
 *
 * FAILS CLOSED, in every direction. No premium entitlement, no expiry, an unparseable expiry, an
 * expiry in the past, no matching subscription row, or a sandbox subscription: all null. This route
 * GRANTS premium, so "not sure" has to mean "no".
 *
 * The sandbox check is the one worth reading twice. The entitlement object alone does not say which
 * environment it came from; only the per-product `subscriptions` row carries `is_sandbox`. So we
 * look the product up and refuse when the row is MISSING as well as when it is sandbox, because a
 * missing row means we cannot prove it is production. Without that, an entitlement with no
 * `product_identifier` would skip the check entirely and a TestFlight tester could reconcile
 * themselves a real Premium, which is precisely the hole the sandbox webhook guard just closed.
 */
export function grantFromSubscriber(body: unknown, userId: string, nowMs: number): Entitlement | null {
  const sub = (body as { subscriber?: Record<string, unknown> } | null)?.subscriber;
  if (!sub || typeof sub !== 'object') return null;

  const ent = (sub.entitlements as Record<string, unknown> | undefined)?.[ENTITLEMENT] as
    | { expires_date?: unknown; product_identifier?: unknown }
    | undefined;
  if (!ent || typeof ent !== 'object') return null;

  const expMs = typeof ent.expires_date === 'string' ? Date.parse(ent.expires_date) : NaN;
  if (!Number.isFinite(expMs) || expMs <= nowMs) return null; // absent, unreadable, or already over

  const productId = typeof ent.product_identifier === 'string' ? ent.product_identifier : '';
  const row = productId
    ? ((sub.subscriptions as Record<string, unknown> | undefined)?.[productId] as
        | { is_sandbox?: unknown; unsubscribe_detected_at?: unknown }
        | undefined)
    : undefined;
  if (!row || typeof row !== 'object') return null; // cannot prove production -> do not grant
  if (row.is_sandbox === true) return null; // TestFlight money is not money

  return {
    userId,
    customerId: null, // Apple rows never carry a Stripe customer; the portal correctly 404s
    source: 'apple',
    premium: true,
    status: 'active',
    currentPeriodEnd: Math.floor(expMs / 1000),
    // Auto-renew already turned off. Access still runs to the period end, exactly as the webhook's
    // CANCELLATION branch treats it: this is not a revoke.
    cancelAtPeriodEnd: typeof row.unsubscribe_detected_at === 'string' && row.unsubscribe_detected_at !== '',
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

  const ent = grantFromSubscriber(body, userId, nowMs);
  if (!ent) return json({ attached: false });

  try {
    await writeEntitlement(env.DB, ent, nowISO);
  } catch {
    return json({ error: 'upstream' }, 502); // could not persist: say so rather than claim success
  }
  return json({ attached: true, currentPeriodEnd: ent.currentPeriodEnd });
}
