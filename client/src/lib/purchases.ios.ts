// Apple IAP seam, the REAL half (iOS only). This is the ONLY file in the repo that imports
// `react-native-purchases`. Metro resolves `@/lib/purchases` here on iOS and to the inert
// `purchases.ts` on web + Android, so the native module never enters those bundles. See the long
// note in `purchases.ts` for why this split is inverted from every other one in this folder.
//
// All logic lives in `iap.ts` (pure, tested). This file is glue: it talks to the SDK and hands raw
// shapes to those functions. Keep it thin, and keep it un-unit-tested on purpose (it is in
// vitest's coverage.exclude), because it cannot run without the native module.

import Purchases, { LOG_LEVEL } from 'react-native-purchases';

import { localEntitlement, packagesToOffers, purchaseOutcome } from './iap';
import type { BuyResult, LocalEntitlement, RestoreResult, StoreOffer } from './purchases';
import { track } from './telemetry';

// The RevenueCat entitlement id (configured in the dashboard). A purchase counts as Premium only
// when this key is active in the returned CustomerInfo.
const ENTITLEMENT = 'premium';

// True once configure has actually succeeded. Everything else no-ops until then, so a missing key
// or a configure failure degrades to "no store" rather than a crash on a later call.
let configured = false;

// Configure once, as early as possible. Reads the public RevenueCat iOS SDK key from the build
// env. If the key is missing or empty we DO NOT call configure: `Purchases.configure({ apiKey:
// undefined })` throws, and a throw on this path is a launch crash on every device, on a code path
// the web preview can never exercise (the same shape as the Hermes/Intl gotcha in CLAUDE.md). The
// whole body is wrapped anyway.
export async function configurePurchases(): Promise<void> {
  if (configured) return;
  const apiKey = process.env.EXPO_PUBLIC_RC_IOS_KEY;
  if (!apiKey) return; // no key in this build -> stay unconfigured, IAP silently unavailable, never a crash
  try {
    await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    configured = true;
    // A deferred (Ask to Buy) approval that lands WHILE the app is open reaches the SDK in-process
    // via StoreKit, so this listener lets Premium unlock without a relaunch. Honest caveat:
    // RevenueCat does not push CustomerInfo from its backend, so if the app is killed when a parent
    // approves, the unlock arrives on the next foreground instead (the webhook is the real source
    // of truth either way). We only nudge a re-read; the entitlement itself comes from our Worker.
    Purchases.addCustomerInfoUpdateListener(() => {
      // no-op body: the paywall's focus effect + the success poll already re-read /entitlement.
      // Registering the listener keeps the SDK's own cache warm for showManageSubscriptions etc.
    });
  } catch {
    // leave configured=false; the paywall reads IAP as unavailable and shows a calm store-down state
  }
}

// Attach the anonymous RevenueCat customer to the signed-in Supabase id, so a purchase belongs to
// the account (and follows them across devices). Skips the call if already identified, and swallows
// failures: a failed logIn must never block the sign-in flow itself.
export async function identifyPurchaser(userId: string): Promise<void> {
  if (!configured) return;
  try {
    const current = await Purchases.getAppUserID();
    if (current === userId) return;
    await Purchases.logIn(userId);
  } catch {
    // best-effort: identity also gets re-attempted on the next session change
  }
}

// The device's own answer for the CURRENT customer, anonymous included: the 'premium' entitlement
// as FIELDS (tenure, period end, whether it renews), not merely a boolean. It used to be a boolean,
// which left an anonymous subscriber with `since: null` and therefore one keepsake a week instead
// of four. This is the truth an ANONYMOUS Apple purchaser runs on
// (App Review 5.1.1: registration before purchase must be optional): they have no server
// entitlement row until they sign in and the alias lands, so the provider merges this local
// read over the server's answer. The SDK serves a cached CustomerInfo when offline, so a
// paid-up user is never locked out by a dead connection.
export async function localPremium(): Promise<LocalEntitlement | null> {
  if (!configured) return null;
  try {
    return localEntitlement(await Purchases.getCustomerInfo());
  } catch {
    return null; // store unreachable and no cache: fail free, never crash the provider
  }
}

// Return the SDK to an anonymous customer on sign-out. Guarded: logOut throws if the current user
// is already anonymous, which is not an error worth surfacing.
export async function forgetPurchaser(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // already anonymous, or not configured: nothing to do
  }
}

export async function loadOffers(): Promise<StoreOffer[]> {
  if (!configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const offers = packagesToOffers(offerings);
    // Record WHICH storefront Apple answered for, alongside the price string it gave us. Sandbox and
    // TestFlight are known to answer for the US storefront regardless of the account's real region,
    // which makes the displayed price disagree with the price Apple actually charges. That is
    // environmental, not ours, but it is invisible without this line, so measure instead of infer.
    // Diagnostic only: no user-facing surface, and it never blocks the offers returning.
    try {
      const storefront = await Purchases.getStorefront();
      const first = offerings.current?.availablePackages?.[0]?.product;
      track('iap.offers_loaded', {
        storefront: storefront?.countryCode ?? 'unknown',
        currency: first?.currencyCode ?? 'unknown',
        price: first?.priceString ?? 'none',
        count: offers.length,
      });
    } catch {
      // a diagnostic must never break the paywall
    }
    return offers;
  } catch {
    return []; // treated as "store not answering" by the caller, never a crash
  }
}

export async function buy(packageId: string): Promise<BuyResult> {
  if (!configured) return { ok: false, code: 'unavailable' };
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find((p) => p.identifier === packageId);
    if (!pkg) return { ok: false, code: 'failed' };
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: typeof customerInfo.entitlements.active[ENTITLEMENT] !== 'undefined' };
  } catch (e) {
    return { ok: false, code: purchaseOutcome(e) };
  }
}

export async function restore(): Promise<RestoreResult> {
  if (!configured) return { ok: false, premium: false, code: 'unavailable' };
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, premium: typeof customerInfo.entitlements.active[ENTITLEMENT] !== 'undefined' };
  } catch (e) {
    return { ok: false, premium: false, code: purchaseOutcome(e) };
  }
}

export async function openAppleSubscriptions(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.showManageSubscriptions();
  } catch {
    // bounces to Settings on some iOS versions; nothing to recover
  }
}

// iOS resolves `@/lib/purchases` to THIS file, so re-export the compile-time flag as true here.
export const IAP_AVAILABLE = true;
export type { StoreOffer, BuyResult, RestoreResult } from './purchases';
