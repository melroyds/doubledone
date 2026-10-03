// The in-app store seam, the INERT half (web only, since Path A).
//
// HEADS UP, this split is BACKWARDS from every other one in this folder. Everywhere else
// (haptics, share, reminders, keepsake-capture, speech) the native code lives in the base
// file and a `.web.ts` stubs it out. Here the base file is the STUB, and the real code lives
// in `purchases.ios.ts` (Apple, through RevenueCat) and `purchases.android.ts` (Google Play
// Billing, through RevenueCat). That is deliberate: `react-native-purchases` must never reach
// the web bundle, and Metro resolves `@/lib/purchases` to the `.ios.ts` or `.android.ts` file
// on those platforms and falls back to THIS file on the web, so the native import is not even
// in the web's module graph. `IAP_AVAILABLE` is therefore a compile-time false on the web, not
// a runtime check. Do not add `react-native-purchases` to this file.
//
// Every export here must exist, with the same type, in both platform files.
// `platform-split.contract.ts` fails the typecheck if they drift, because tsc only ever reads
// THIS file, so a name missing from `purchases.android.ts` would otherwise compile clean and be
// `undefined` only on a phone.

import type { Entitlement } from './entitlement';

export const IAP_AVAILABLE: boolean = false;

// Which store this build's in-app purchases go through. It is the `source` a device-local
// entitlement carries, and the `store` on the checkout telemetry. null on the web (Stripe).
export const STORE_SOURCE: 'apple' | 'google' | null = null;

// A store package flattened to what the paywall needs. The platform files build these from the
// RevenueCat offering; here the list is always empty.
export type StoreOffer = {
  packageId: string;
  plan: 'monthly' | 'annual';
  priceString: string; // already localised + currency-symboled by the store (e.g. "A$5.00")
};

// A purchase / restore outcome, deliberately plain: no SDK types leak past this seam. `heldBy` comes with
// code 'fix_billing': the store whose subscription is in account hold or billing retry (lib/iap heldSubscription).
export type BuyResult = { ok: boolean; code?: string; heldBy?: 'apple' | 'google' | null };
export type RestoreResult = { ok: boolean; premium: boolean; code?: string };

export async function configurePurchases(): Promise<void> {}
export async function identifyPurchaser(_userId: string): Promise<void> {}
export async function forgetPurchaser(): Promise<void> {}
export async function loadOffers(): Promise<StoreOffer[]> {
  return [];
}
// `uid` is the signed-in Supabase id the purchase must belong to. The Android file refuses without it
// and checks RevenueCat's own idea of who is buying against it; the iOS file ignores it (Apple allows an
// anonymous purchase, App Review 5.1.1).
export async function buy(_packageId: string, _uid?: string | null): Promise<BuyResult> {
  return { ok: false, code: 'unavailable' };
}
export async function restore(_uid?: string | null): Promise<RestoreResult> {
  return { ok: false, premium: false, code: 'unavailable' };
}
// `source` is the store that actually sold the entitlement (RevenueCat's own `store`), not the platform this
// is running on: RevenueCat entitlements are cross-store, so an Apple subscription shows on Android too.
export type LocalEntitlement = Pick<Entitlement, 'since' | 'currentPeriodEnd' | 'cancelAtPeriodEnd' | 'source'>;

/** The device's own store entitlement, or null. Always null on the web. */
export async function localPremium(): Promise<LocalEntitlement | null> {
  return null;
}

export async function openAppleSubscriptions(): Promise<void> {}

/** Open this store's own subscription screen: Apple's sheet on iOS, the Play Store's page on Android. */
export async function openStoreSubscriptions(): Promise<void> {}
