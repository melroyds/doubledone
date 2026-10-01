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
// Deliberately NOT gated by STRIPE_HERE (lib/storefront), unlike the Stripe seams in lib/stripe: it cancels
// billing and sells nothing, and an Android user may well hold a subscription bought on the web. It
// shows no Stripe link on any platform. Since Path A it also turns off a Google Play renewal (the Worker
// asks RevenueCat to), which is counted in `cancelled` like a Stripe one.
//
// A seam (it touches Supabase and the Worker), but its contract is unit-tested with a mock client and a
// fetch stub: billing before the RPC, no RPC on any billing failure, sign out only on success.

const API_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

export type CloseBillingResult = { ok: true; cancelled: number } | { ok: false; error: 'sign_in' | 'failed' };

/**
 * Ask the Worker to cancel every Stripe subscription that can still charge this account, and turn off any
 * Google Play renewal. Success is ONLY a 200 whose JSON carries a numeric `cancelled`: a Worker that predates
 * the route answers an unknown path with a plain-text 200, and reading that as success would delete a paying
 * account with billing still on.
 *
 * `maybePlay` says the DEVICE may know of a Play subscription the server has not heard about yet (a webhook
 * still on its way). The server only asks RevenueCat about Play for someone it has a Play record of, so
 * without the hint a person who deletes in the minutes after buying is told renewal is off while it is not
 * (the 2026-10-01 review). It only ever makes the server look harder, never less.
 */
export async function closeBilling(token: string, fetchImpl: typeof fetch = fetch, opts: { maybePlay?: boolean } = {}): Promise<CloseBillingResult> {
  try {
    const res = await fetchImpl(`${API_URL}/account/close-billing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: opts.maybePlay ? JSON.stringify({ maybePlay: true }) : '{}',
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
export async function deleteAccount(client: SupabaseClient, fetchImpl: typeof fetch = fetch, opts: { maybePlay?: boolean } = {}): Promise<DeleteAccountResult> {
  let token: string | undefined;
  try {
    const { data } = await client.auth.getSession();
    token = data.session?.access_token;
  } catch {
    token = undefined;
  }
  if (!token) return { ok: false, error: 'sign_in' };

  const billing = await closeBilling(token, fetchImpl, opts);
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
 * Which app store bills this person's Premium, for the line on the delete confirmation, or null.
 * - 'apple': deleting the account CANNOT stop it. Only they can cancel it, in their iPhone's Settings.
 * - 'google': deleting the account turns off its renewal (the Worker's close-billing asks RevenueCat to),
 *   so nothing more is charged. Said before they confirm, because the paid period is not refunded by it.
 * Read from the RAW entitlement, so the dev override (which bends only `premium`) can never invent a bill.
 * Requires premium, because an expired store row still carries its source and telling that person "your
 * Premium is billed by Apple" would be untrue. A store's billing retry is still covered: a BILLING_ISSUE
 * keeps premium on (server/src/revenuecat.ts). Stripe is null: close-billing simply cancels it.
 */
export function billedByStore(ent: Entitlement): 'apple' | 'google' | null {
  if (!ent.premium) return null;
  return ent.source === 'apple' || ent.source === 'google' ? ent.source : null;
}
