import { type SupabaseClient } from '@supabase/supabase-js';

import { type Entitlement } from './entitlement';

// Account deletion (the right to erasure), billing FIRST.
//
// The SECURITY DEFINER `delete_account` RPC removes the caller's auth.users row and their tasks cascade.
// It never reached Stripe, so a paying person who deleted their account went on being charged with no
// account left to cancel from. Now the Worker's POST /account/close-billing runs first and cancels every
// Stripe subscription that can still charge them, and the RPC runs only once that has answered 200 with
// a count. If billing cannot be closed, NOTHING is deleted: a calm line says so, and trying again is safe.
//
// Deliberately NOT gated by SELLS_HERE (lib/storefront), unlike the Stripe seams in lib/stripe: it cancels
// billing and sells nothing, and an Android user may well hold a subscription bought on the web. It
// shows no Stripe link on any platform.
//
// A seam (it touches Supabase and the Worker), but its contract is unit-tested with a mock client and a
// fetch stub: billing before the RPC, no RPC on any billing failure, sign out only on success.

const API_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

export type CloseBillingResult = { ok: true; cancelled: number } | { ok: false; error: 'sign_in' | 'failed' };

/**
 * Ask the Worker to cancel every Stripe subscription that can still charge this account. Success is ONLY a
 * 200 whose JSON carries a numeric `cancelled`: a Worker that predates the route answers an unknown path
 * with a plain-text 200, and reading that as success would delete a paying account with billing still on.
 */
export async function closeBilling(token: string, fetchImpl: typeof fetch = fetch): Promise<CloseBillingResult> {
  try {
    const res = await fetchImpl(`${API_URL}/account/close-billing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    if (res.status === 401) return { ok: false, error: 'sign_in' };
    if (res.status !== 200) return { ok: false, error: 'failed' };
    const { cancelled } = (await res.json()) as { cancelled?: unknown };
    return typeof cancelled === 'number' && Number.isFinite(cancelled) ? { ok: true, cancelled } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

// 'sign_in': the session could not be read or the Worker refused it; sign in again, nothing was deleted.
// 'billing': billing could not be closed, so nothing was deleted.
// 'delete': billing IS closed, but the delete itself failed; the account is intact and a retry is safe.
// A 'delete' failure carries how many subscriptions WERE cancelled, so the screen can say so honestly.
export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: 'sign_in' }
  | { ok: false; error: 'billing' }
  | { ok: false; error: 'delete'; cancelled: number };

/** Close billing, then delete the account, then sign out. Each step runs only if the one before it worked. */
export async function deleteAccount(client: SupabaseClient, fetchImpl: typeof fetch = fetch): Promise<DeleteAccountResult> {
  let token: string | undefined;
  try {
    const { data } = await client.auth.getSession();
    token = data.session?.access_token;
  } catch {
    token = undefined;
  }
  if (!token) return { ok: false, error: 'sign_in' };

  const billing = await closeBilling(token, fetchImpl);
  if (!billing.ok) return { ok: false, error: billing.error === 'sign_in' ? 'sign_in' : 'billing' };

  const { error } = await client.rpc('delete_account');
  if (error) return { ok: false, error: 'delete', cancelled: billing.cancelled };
  try {
    await client.auth.signOut();
  } catch {
    // The account is already gone. Reporting a failure here would invite a retry that cannot succeed,
    // and the caller wipes this device next either way.
  }
  return { ok: true };
}

/**
 * True when this person's Premium is billed by Apple, which deleting the account cannot stop: only they can
 * cancel it, in their iPhone's Settings. Read from the RAW entitlement, so the dev override (which bends only
 * `premium`) can never invent an Apple bill. Requires premium, because an expired Apple row still carries
 * source 'apple' and telling that person "your Premium is billed by Apple" would be untrue. Apple's billing
 * retry is still covered: a BILLING_ISSUE keeps premium on (server/src/revenuecat.ts).
 */
export function billedByApple(ent: Entitlement): boolean {
  return ent.premium && ent.source === 'apple';
}
