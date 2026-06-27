// Client seam for Stripe Premium: talks to the Worker's /checkout and /entitlement,
// authed with the user's Supabase token. The pure gating logic lives in
// lib/entitlement; this is the thin network edge (a seam, like lib/ai).

import { type Entitlement, FREE_ENTITLEMENT } from './entitlement';
import { authHeader } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: 'sign_in' | 'failed' | 'already' };

/** Ask the Worker to create a Checkout Session for the chosen plan; returns its hosted URL to open. */
export async function startCheckout(plan: 'monthly' | 'annual' = 'monthly'): Promise<CheckoutResult> {
  const auth = await authHeader();
  if (!auth) return { ok: false, error: 'sign_in' };
  try {
    const res = await fetch(`${API_URL}/checkout`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ plan }) });
    if (res.status === 409) return { ok: false, error: 'already' }; // already subscribed: the UI routes to Manage, never a second charge
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
    };
  } catch {
    return FREE_ENTITLEMENT;
  }
}
