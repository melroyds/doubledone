// The premium feature flag: the single switch every gated feature reads. The SERVER
// entitlement (lib/entitlement + lib/stripe, fed by Stripe) is the real source of truth;
// this adds a DEV OVERRIDE so the premium and free states can be tested locally without a live
// subscription. The override is honoured only when `devAllowed` is true (a local dev or preview
// build), never in production, so once `premium` merges to main the override is inert and a real
// user can never flip themselves to Premium. Pure and tested; the provider (premium-provider.tsx)
// supplies the live entitlement, the stored override, and the devAllowed value.

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
