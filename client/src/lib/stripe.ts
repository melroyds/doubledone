// Client seam for Stripe Premium: talks to the Worker's /checkout and /entitlement,
// authed with the user's Supabase token. The pure gating logic lives in
// lib/entitlement; this is the thin network edge (a seam, like lib/ai).

import { type Entitlement, FREE_ENTITLEMENT } from './entitlement';
import { authHeader } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

// 'no_subscription' is portal-only (startCheckout never returns it): premium with no Stripe
// customer, so no portal exists. The UI reads it as "nothing to manage", never as a retryable failure.
// 'billing_issue' is checkout-only: the server refused a SECOND subscription because the existing
// one is in dunning (past_due/unpaid, card failing). The fix is the portal, not a new purchase.
export type CheckoutResult = { ok: true; url: string } | { ok: false; error: 'sign_in' | 'failed' | 'already' | 'no_subscription' | 'billing_issue' };

/** Ask the Worker to create a Checkout Session for the chosen plan; returns its hosted URL to open. */
export async function startCheckout(plan: 'monthly' | 'annual' = 'monthly'): Promise<CheckoutResult> {
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

/** Read the current entitlement from the server (the source of truth). Defaults to free. */
export async function loadEntitlement(): Promise<Entitlement> {
  const auth = await authHeader();
  if (!auth) return FREE_ENTITLEMENT;
  try {
    const res = await fetch(`${API_URL}/entitlement`, { headers: auth });
    if (!res.ok) return FREE_ENTITLEMENT;
    const v = (await res.json()) as Partial<Entitlement>;
    return {
      premium: Boolean(v.premium),
      status: typeof v.status === 'string' ? v.status : null,
      since: typeof v.since === 'string' ? v.since : null,
      currentPeriodEnd: typeof v.currentPeriodEnd === 'number' ? v.currentPeriodEnd : null,
      cancelAtPeriodEnd: Boolean(v.cancelAtPeriodEnd),
      source: v.source === 'stripe' || v.source === 'apple' ? v.source : null,
    };
  } catch {
    return FREE_ENTITLEMENT;
  }
}
