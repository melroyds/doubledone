// Client seam for Stripe Premium: talks to the Worker's /checkout and /entitlement,
// authed with the user's Supabase token. The pure gating logic lives in
// lib/entitlement; this is the thin network edge (a seam, like lib/ai).

import { type Entitlement, type EntitlementRead, FREE_ENTITLEMENT, readEntitlementReply } from './entitlement';
import { STRIPE_HERE } from './storefront';
import { authHeader } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

// 'no_subscription' is portal-only (startCheckout never returns it): premium with no Stripe
// customer, so no portal exists. The UI reads it as "nothing to manage", never as a retryable failure.
// 'billing_issue' is checkout-only: the server refused a SECOND subscription because the existing
// one is in dunning (past_due/unpaid, card failing). The fix is the portal, not a new purchase.
export type CheckoutResult = { ok: true; url: string } | { ok: false; error: 'sign_in' | 'failed' | 'already' | 'no_subscription' | 'billing_issue' };

/** Ask the Worker to create a Checkout Session for the chosen plan; returns its hosted URL to open. */
export async function startCheckout(plan: 'monthly' | 'annual' = 'monthly'): Promise<CheckoutResult> {
  // Android sells only through Google Play (lib/storefront): no screen offers this there, and this seam
  // refuses too, so a future call site can never reopen Stripe checkout from the Android app.
  if (!STRIPE_HERE) return { ok: false, error: 'failed' };
  const auth = await authHeader();
  if (!auth) return { ok: false, error: 'sign_in' };
  try {
    const res = await fetch(`${API_URL}/checkout`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ plan }) });
    if (res.status === 409) {
      // Two different refusals share the status: already subscribed (route to Manage) vs a
      // subscription in dunning (route to the portal to fix the card). The body says which,
      // and telling the second user "you're already on Premium" would be false, so read it.
      try {
        const { error } = (await res.json()) as { error?: unknown };
        return { ok: false, error: error === 'billing_issue' ? 'billing_issue' : 'already' };
      } catch {
        return { ok: false, error: 'already' };
      }
    }
    if (!res.ok) return { ok: false, error: 'failed' };
    const { url } = (await res.json()) as { url?: unknown };
    return typeof url === 'string' ? { ok: true, url } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/** Open the Stripe Billing Portal (manage / cancel the subscription). */
export async function startPortal(): Promise<CheckoutResult> {
  if (!STRIPE_HERE) return { ok: false, error: 'failed' }; // the Stripe portal takes card changes: not from Android
  const auth = await authHeader();
  if (!auth) return { ok: false, error: 'sign_in' };
  try {
    const res = await fetch(`${API_URL}/portal`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: '{}' });
    if (res.status === 404) return { ok: false, error: 'no_subscription' }; // premium but no Stripe customer (comp / dev override): nothing to manage, not a failure to retry
    if (!res.ok) return { ok: false, error: 'failed' };
    const { url } = (await res.json()) as { url?: unknown };
    return typeof url === 'string' ? { ok: true, url } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

export type TrialResult = { ok: true; result: 'started' | 'already' } | { ok: false; error: 'sign_in' | 'failed' };

/** Start the one-time, card-free 30-day trial. 'started' = now Premium; 'already' = this account used it. */
export async function startTrial(): Promise<TrialResult> {
  const auth = await authHeader();
  if (!auth) return { ok: false, error: 'sign_in' };
  try {
    const res = await fetch(`${API_URL}/trial/start`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: '{}' });
    if (!res.ok) return { ok: false, error: 'failed' };
    const { result } = (await res.json()) as { result?: unknown };
    return result === 'started' || result === 'already' ? { ok: true, result } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/**
 * Attach an ANONYMOUS Apple purchase to this account, once signing in has aliased it.
 *
 * App Review 5.1.1(v) forbids requiring registration before purchase, so an iOS user can buy while
 * signed out. RevenueCat gives them an `$RCAnonymousID:` and our webhook drops every event for it,
 * so they pay and appear nowhere in our data: no renewal date, no tenure-scaled keepsakes on any
 * other device, no working Premium on web or Android. One of our two real Apple subscribers was in
 * exactly that state for ten days.
 *
 * Signing in calls `Purchases.logIn`, which puts the Supabase id in RevenueCat's alias group, but no
 * NEW webhook fires. So this asks the server to look, once, at that moment. It sends NO body: the
 * server uses the verified `sub` from the token, so this call cannot assert anything about anybody.
 *
 * Best effort and silent. `attached: false` is the ordinary answer for almost everyone, and a
 * failure must never block or complicate a sign-in.
 */
export async function reconcileApple(): Promise<boolean> {
  const auth = await authHeader();
  if (!auth) return false;
  try {
    const res = await fetch(`${API_URL}/apple/reconcile`, { method: 'POST', headers: auth });
    if (!res.ok) return false;
    const { attached } = (await res.json()) as { attached?: unknown };
    return attached === true;
  } catch {
    return false;
  }
}

/**
 * Read the current entitlement from the server, and SAY whether the read worked. This is the one a
 * purchase must use (lib/iap buyCheck): an unreadable entitlement refuses the charge, never reads as free.
 * Signed out, there is nothing on the server to read, so FREE is the true answer and `signedIn` is false.
 * The reply is parsed by the pure, tested readEntitlementReply.
 */
export async function loadEntitlementChecked(): Promise<EntitlementRead> {
  const auth = await authHeader();
  if (!auth) return { ok: true, entitlement: FREE_ENTITLEMENT, signedIn: false };
  try {
    const res = await fetch(`${API_URL}/entitlement`, { headers: auth });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return readEntitlementReply(res.status, body);
  } catch {
    return { ok: false };
  }
}

/**
 * Read the current entitlement for DISPLAY. A failed read shows the calm free state rather than an
 * error, which is right for a screen and wrong for a charge: anything that spends money calls
 * loadEntitlementChecked instead.
 */
export async function loadEntitlement(): Promise<Entitlement> {
  const read = await loadEntitlementChecked();
  return read.ok ? read.entitlement : FREE_ENTITLEMENT;
}
