// The premium feature flag: the single switch every gated feature reads. The SERVER
// entitlement (lib/entitlement + lib/stripe, fed by Stripe) is the real source of truth;
// this adds a DEV OVERRIDE so the premium and free states can be tested locally without a live
// subscription. The override is honoured only when `devAllowed` is true (a local dev or preview
// build), never in production, so once `premium` merges to main the override is inert and a real
// user can never flip themselves to Premium. Pure and tested; the provider (premium-provider.tsx)
// supplies the live entitlement, the stored override, and the devAllowed value.

import { type Entitlement } from './entitlement';

/** The dev override: force premium on or off, or null to defer to the real entitlement. */
export type DevPremium = 'on' | 'off' | null;

/**
 * The effective premium flag. A set dev override wins when dev tooling is allowed; otherwise the
 * server entitlement decides. Keeping this pure makes the precedence unit-testable and makes the
 * production path obvious: with `devAllowed` false the result is always exactly the server truth.
 */
export function resolvePremium(serverPremium: boolean, devOverride: DevPremium, devAllowed: boolean): boolean {
  if (devAllowed && devOverride === 'on') return true;
  if (devAllowed && devOverride === 'off') return false;
  return serverPremium;
}

/**
 * The entitlement a gated feature should read: the real server entitlement (its tenure, period, and
 * status) but with `premium` replaced by the resolved flag, so the DEV OVERRIDE drives every gate,
 * not just a boolean. Tenure/period stay real, so allowance math (e.g. canMakeScrapbook's weekly
 * allowance) stays meaningful even under a dev-forced premium. Inert in production, like resolvePremium.
 */
export function gateEntitlement(entitlement: Entitlement, devOverride: DevPremium, devAllowed: boolean): Entitlement {
  return { ...entitlement, premium: resolvePremium(entitlement.premium, devOverride, devAllowed) };
}

/**
 * Whose entitlement the provider holds, as the key its load runs on: it reads again whenever this changes. Null
 * while the session is still being found out (lib/auth useSessionState's `known`), because a signed-in person reads
 * as signed out for that first moment, and a read started then is thrown away when the real session lands.
 *
 * Signing in, signing out and switching accounts all change it, so Premium follows the account at once. Until the
 * 1 Nov bug sweep (#9) the provider read once at launch and then only on refresh(): a payer who signed in from
 * Today stayed free until Settings or Premium opened, and a sign-out left Premium on. A token refresh (about
 * hourly) keeps the same id, so it costs no read. Display only, like every provider read: lib/iap buyCheck reads
 * afresh before any charge.
 */
export function entitlementOwnerKey(known: boolean, userId: string | null | undefined): string | null {
  if (!known) return null;
  return userId ? `user:${userId}` : 'signed-out';
}
