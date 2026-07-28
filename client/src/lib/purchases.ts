// Apple IAP seam, the INERT half (web + Android).
//
// HEADS UP, this split is BACKWARDS from every other one in this folder. Everywhere else
// (haptics, share, reminders, keepsake-capture, speech) the native code lives in the base
// file and a `.web.ts` stubs it out. Here the base file is the STUB, and the real code lives
// in `purchases.ios.ts`. That is deliberate: `react-native-purchases` sells only through
// Apple, so it must reach iOS and NOWHERE else. A `.web.ts` split would leave the base file
// serving iOS AND Android, and Android (live on Google Play, selling via Stripe) is exactly
// what must never import this native module. Metro resolves `@/lib/purchases` to
// `purchases.ios.ts` on iOS and falls back to THIS file on web and Android, so the native
// import is not even in their module graph. `IAP_AVAILABLE` is therefore a compile-time
// false on those platforms, not a runtime check, which is what lets `premium.tsx` fold its
// new IAP branches away by construction on the platforms that already carry paying
// customers. Do not add `react-native-purchases` to this file.

export const IAP_AVAILABLE = false;

// A store package flattened to what the paywall needs. The iOS file builds these from the
// RevenueCat offering; here the list is always empty.
export type StoreOffer = {
  packageId: string;
  plan: 'monthly' | 'annual';
  priceString: string; // already localised + currency-symboled by the store (e.g. "A$5.00")
};

// A purchase / restore outcome, deliberately plain: no SDK types leak past this seam.
export type BuyResult = { ok: boolean; code?: string };
export type RestoreResult = { ok: boolean; premium: boolean; code?: string };

export async function configurePurchases(): Promise<void> {}
export async function identifyPurchaser(_userId: string): Promise<void> {}
export async function forgetPurchaser(): Promise<void> {}
export async function loadOffers(): Promise<StoreOffer[]> {
  return [];
}
export async function buy(_packageId: string): Promise<BuyResult> {
  return { ok: false, code: 'unavailable' };
}
export async function restore(): Promise<RestoreResult> {
  return { ok: false, premium: false, code: 'unavailable' };
}
export async function localPremium(): Promise<boolean> {
  return false; // no store on web/Android: local Apple entitlement can never exist here
}
export async function openAppleSubscriptions(): Promise<void> {}
