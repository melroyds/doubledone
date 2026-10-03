// The Android build (Path A, 2026-10): it sells Premium through Google Play Billing only. No Stripe and none
// of our own fixed figures, and Google Play's wording. See lib/storefront.ts for the why of each switch.
// Path C rollback, decided in advance: SELLS_HERE = false here, then one Android build.
export const SELLS_HERE: boolean = true;
export const STRIPE_HERE: boolean = false;
export const PLAY_COPY: boolean = true;
