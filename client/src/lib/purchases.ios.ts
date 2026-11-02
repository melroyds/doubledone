// Apple IAP seam, the REAL half (iOS only). This is the ONLY file in the repo that imports
// `react-native-purchases`. Metro resolves `@/lib/purchases` here on iOS and to the inert
// `purchases.ts` on web + Android, so the native module never enters those bundles. See the long
// note in `purchases.ts` for why this split is inverted from every other one in this folder.
//
// All logic lives in `iap.ts` (pure, tested). This file is glue: it talks to the SDK and hands raw
// shapes to those functions. Keep it thin. It stays out of the coverage floor (vitest's
// coverage.exclude) because it cannot run without the native module, and purchases-split.test.ts
// checks only its configure wait, its identity, its purchase proof and localPremium's cached and
// fresh reads, against a stubbed SDK.

import Purchases, { LOG_LEVEL } from 'react-native-purchases';

import { anonymousPurchaserId, localEntitlement, packagesToOffers, purchaseOutcome } from './iap';
import type { BuyResult, LocalEntitlement, RestoreResult, StoreOffer } from './purchases';
import { track } from './telemetry';

// The RevenueCat entitlement id (configured in the dashboard). A purchase counts as Premium only
// when this key is active in the returned CustomerInfo.
const ENTITLEMENT = 'premium';

// Configure once, and remember the attempt, so every later call WAITS for it rather than racing it (the
// Android file's pattern, adopted here 2026-11-03). Until then this file kept a flag and returned early
// from every call while configure was still in flight, so a session found in the first moments of a
// launch skipped logIn silently, and the reconcile behind it asked RevenueCat about an account it had
// never linked. That lookup creates a bare customer with no anonymous alias, which is the shape RevenueCat
// merges a stranger's made-up id into (the server refuses that, but the app should never make one), and it
// left a signed-in buyer whose purchase still sat on the anonymous id refused by the server while the
// phone said Premium. Resolves true only when configure actually succeeded. A missing key or a failure
// resolves false, and everything below degrades to "no store", never a crash.
let configuring: Promise<boolean> | null = null;
function ready(): Promise<boolean> {
  if (!configuring) {
    configuring = (async () => {
      // Reads the public RevenueCat iOS SDK key from the build env. If the key is missing or empty we DO
      // NOT call configure: `Purchases.configure({ apiKey: undefined })` throws, and a throw on this path is
      // a launch crash on every device, on a code path the web preview can never exercise (the same shape
      // as the Hermes/Intl gotcha in CLAUDE.md). The whole body is wrapped anyway.
      const apiKey = process.env.EXPO_PUBLIC_RC_IOS_KEY;
      if (!apiKey) return false; // no key in this build: IAP silently unavailable, never a crash
      try {
        await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);
        Purchases.configure({ apiKey });
      } catch {
        return false; // the paywall reads IAP as unavailable and shows a calm store-down state
      }
      try {
        // A deferred (Ask to Buy) approval that lands WHILE the app is open reaches the SDK in-process
        // via StoreKit, so this listener lets Premium unlock without a relaunch. Honest caveat:
        // RevenueCat does not push CustomerInfo from its backend, so if the app is killed when a parent
        // approves, the unlock arrives on the next foreground instead (the webhook is the real source
        // of truth either way). We only nudge a re-read. The entitlement itself comes from our Worker.
        Purchases.addCustomerInfoUpdateListener(() => {
          // no-op body: the paywall's focus effect + the success poll already re-read /entitlement.
          // Registering the listener keeps the SDK's own cache warm for showManageSubscriptions etc.
        });
      } catch {
        // configure itself succeeded, so the store works without the listener, as it always did
      }
      return true;
    })();
  }
  return configuring;
}

// Configure once, as early as possible (the root layout calls it at launch). Every call below waits for it.
export async function configurePurchases(): Promise<void> {
  await ready();
}

// Attach the RevenueCat customer to the signed-in Supabase id, so a purchase belongs to the account
// (and follows them across devices). Waits for configure, and says whether RevenueCat's customer IS
// that account afterwards: the root layout asks the server to attach an anonymous purchase only when it
// is. Swallows failures: a failed logIn must never block the sign-in flow itself.
export async function identifyPurchaser(userId: string): Promise<boolean> {
  if (!(await ready())) return false;
  try {
    if ((await Purchases.getAppUserID()) === userId) return true;
    await Purchases.logIn(userId);
    return (await Purchases.getAppUserID()) === userId;
  } catch {
    return false; // best effort: tried again on the next session change, and before a refused Premium call
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
//
// `fresh` (2026-11-03) is for the moment the server has just refused a Premium call (lib/premium-provider
// recheck): ask RevenueCat itself, because its cache on the device can hold an active Premium long after a
// refund or a lapse, and the screen then keeps offering what the server keeps refusing. The cached answer is
// read first and stands when the store cannot be reached, so a fresh read never turns a dead connection into
// "free" on this call (invalidating does clear the SDK's cache until its next successful read).
export async function localPremium(opts?: { fresh?: boolean }): Promise<LocalEntitlement | null> {
  if (!(await ready())) return null;
  try {
    const cached = await Purchases.getCustomerInfo();
    if (!opts?.fresh) return localEntitlement(cached);
    try {
      await Purchases.invalidateCustomerInfoCache();
      return localEntitlement(await Purchases.getCustomerInfo());
    } catch {
      return localEntitlement(cached); // the store did not answer: the last answer stands
    }
  } catch {
    return null; // store unreachable and no cache: fail free, never crash the provider
  }
}

// Return the SDK to an anonymous customer on sign-out. Guarded: logOut throws if the current user
// is already anonymous, which is not an error worth surfacing.
export async function forgetPurchaser(): Promise<void> {
  if (!(await ready())) return;
  try {
    await Purchases.logOut();
  } catch {
    // already anonymous: nothing to do
  }
}

export async function loadOffers(): Promise<StoreOffer[]> {
  if (!(await ready())) return [];
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
  if (!(await ready())) return { ok: false, code: 'unavailable' };
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
  if (!(await ready())) return { ok: false, premium: false, code: 'unavailable' };
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, premium: typeof customerInfo.entitlements.active[ENTITLEMENT] !== 'undefined' };
  } catch (e) {
    return { ok: false, premium: false, code: purchaseOutcome(e) };
  }
}

export async function openAppleSubscriptions(): Promise<void> {
  if (!(await ready())) return;
  try {
    await Purchases.showManageSubscriptions();
  } catch {
    // bounces to Settings on some iOS versions; nothing to recover
  }
}

// iOS resolves `@/lib/purchases` to THIS file, so re-export the compile-time flag as true here.
export const IAP_AVAILABLE = true;
export type { StoreOffer, BuyResult, RestoreResult } from './purchases';

// Added with Path A (2026-10), additive only: nothing above this line changed with Path A, so the iOS money
// path stayed the same code. The shared seam names the store and opens its own subscription screen on every
// platform; on iOS that is Apple and Apple's sheet.
export const STORE_SOURCE: 'apple' | 'google' | null = 'apple';
export async function openStoreSubscriptions(): Promise<void> {
  return openAppleSubscriptions();
}

// Added with Premium without an account (2026-11-03), beside localPremium's fresh read above. The one proof of
// Premium an iPhone without an account has: its anonymous RevenueCat App User ID, sent by lib/ai with a Premium AI
// call when there is no session, and checked by the Worker against our webhook log and RevenueCat
// (server/src/store-premium.ts). Waits for configure, like every call here. Null once signed in (the id is then the
// Supabase uuid, which anonymousPurchaserId refuses, so a phone can never lend an account), when the store never
// configured, and on any error. Never logged, never stored by the app: it lives in RevenueCat's own cache on the
// device, which only a reinstall, or signing in and out again, replaces.
export async function purchaserProof(): Promise<string | null> {
  if (!(await ready())) return null;
  try {
    return anonymousPurchaserId(await Purchases.getAppUserID());
  } catch {
    return null;
  }
}
