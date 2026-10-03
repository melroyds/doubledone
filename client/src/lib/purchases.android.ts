// Google Play Billing seam, the REAL half for Android (Path A, 2026-10). Metro resolves `@/lib/purchases`
// here on Android, to `purchases.ios.ts` on iOS and to the inert `purchases.ts` on the web. See the long
// note in `purchases.ts` for why this split is inverted from every other one in this folder.
//
// All logic lives in `iap.ts` (pure, tested). This file is glue: it talks to the SDK and hands raw shapes
// to those functions. Keep it thin, and keep it un-unit-tested on purpose (it is in vitest's
// coverage.exclude), because it cannot run without the native module.
//
// It is a copy of the iOS file with three differences that are the whole point of it:
// 1. It reads the Android key, EXPO_PUBLIC_RC_ANDROID_KEY, and with no key it never configures (a
//    configure with no key throws, and a throw here is a launch crash on every phone).
// 2. Every call waits for configure to FINISH. The iOS file returns early while configure is still in
//    flight, so a sign-in in the first moments of a launch skips logIn silently, and the effect that calls
//    it only re-runs when the session changes. On Android that would let a purchase land on an anonymous
//    RevenueCat id, which our webhook drops: someone who has paid, and exists nowhere in D1.
// 3. Buying and restoring need an account, and the account is CHECKED, not assumed. Google Play has no
//    rule like Apple's 5.1.1, and a web or iPhone subscriber who opens Android signed out would otherwise
//    be one tap from a second charge. Before the store sheet opens, RevenueCat's own app user id must be
//    the signed-in Supabase id (one logIn retry, then a calm refusal), and RevenueCat must not already
//    see an active Premium on that account, which also catches an Apple subscription on it.

import { Linking } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

import { heldSubscription, localEntitlement, packagesToOffers, purchaseOutcome } from './iap';
import type { BuyResult, LocalEntitlement, RestoreResult, StoreOffer } from './purchases';
import { track } from './telemetry';

// The RevenueCat entitlement id (configured in the dashboard). A purchase counts as Premium only when this
// key is active in the returned CustomerInfo.
const ENTITLEMENT = 'premium';

// Google's own subscriptions page, filtered to this app, for when RevenueCat has no management URL yet
// (no purchase on this account, or the SDK could not be reached). Play requires a way to cancel.
const PLAY_SUBSCRIPTIONS = 'https://play.google.com/store/account/subscriptions?package=app.doubledone';

// Configure once, and remember the attempt, so every later call can WAIT for it rather than race it.
// Resolves true only when configure actually succeeded. A missing key or a failure resolves false and
// everything below degrades to "no store", never a crash.
let configuring: Promise<boolean> | null = null;
function ready(): Promise<boolean> {
  if (!configuring) {
    configuring = (async () => {
      const apiKey = process.env.EXPO_PUBLIC_RC_ANDROID_KEY;
      if (!apiKey) return false; // no key in this build: IAP silently unavailable, never a crash
      try {
        await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);
        Purchases.configure({ apiKey });
        return true;
      } catch {
        return false; // the paywall reads IAP as unavailable and shows its calm store-down state
      }
    })();
  }
  return configuring;
}

export async function configurePurchases(): Promise<void> {
  await ready();
}

// Is RevenueCat's current customer the signed-in account? One logIn retry, then no. Never throws.
async function identified(uid: string): Promise<boolean> {
  try {
    if ((await Purchases.getAppUserID()) === uid) return true;
    await Purchases.logIn(uid);
    return (await Purchases.getAppUserID()) === uid;
  } catch {
    return false;
  }
}

// Attach the RevenueCat customer to the signed-in Supabase id, so a purchase belongs to the account and
// follows it to other devices. Waits for configure. Swallows failures: a failed logIn must never block
// sign-in itself, and buy() and restore() check the identity again before anything is charged.
export async function identifyPurchaser(userId: string): Promise<void> {
  if (!(await ready())) return;
  await identified(userId);
}

// The device's own answer for the current customer, as the fields our model uses. On Android a customer
// is always a signed-in account (we never sell to an anonymous id), so this mostly bridges the moments
// between a purchase and its webhook. The SDK serves a cached CustomerInfo offline.
export async function localPremium(): Promise<LocalEntitlement | null> {
  if (!(await ready())) return null;
  try {
    return localEntitlement(await Purchases.getCustomerInfo());
  } catch {
    return null; // store unreachable and no cache: fail free, never crash the provider
  }
}

// Back to an anonymous customer on sign-out. logOut throws when already anonymous, which is not an error
// worth surfacing.
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
    // Which country and currency Play answered for, beside the price string it gave us, so a price that
    // looks wrong on someone's phone can be explained from data rather than guessed at. Diagnostic only.
    try {
      const first = offerings.current?.availablePackages?.[0]?.product;
      track('iap.offers_loaded', {
        storefront: 'play',
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

export async function buy(packageId: string, uid?: string | null): Promise<BuyResult> {
  if (!(await ready())) return { ok: false, code: 'unavailable' };
  if (!uid) return { ok: false, code: 'sign_in' }; // Android never sells to an anonymous id
  if (!(await identified(uid))) return { ok: false, code: 'identity' };
  // The store's own view of this account, before any sheet opens. Our server said "not Premium" a moment
  // ago, but a webhook can lag a purchase and an Apple subscription on the same account lives here too.
  // And an Apple subscription still in Apple's billing retry is fixed, never bought again here: Apple charges
  // the moment the card works. (Google's own hold is not refused: buying again replaces the held one.)
  try {
    const info = await Purchases.getCustomerInfo();
    if (typeof info.entitlements.active[ENTITLEMENT] !== 'undefined') return { ok: false, code: 'already_premium' };
    const held = heldSubscription(info, Date.now());
    if (held) return { ok: false, code: 'fix_billing', heldBy: held.store };
  } catch {
    return { ok: false, code: 'store_down' }; // could not check, so nothing was started
  }
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

export async function restore(uid?: string | null): Promise<RestoreResult> {
  if (!(await ready())) return { ok: false, premium: false, code: 'unavailable' };
  if (!uid) return { ok: false, premium: false, code: 'sign_in' };
  if (!(await identified(uid))) return { ok: false, premium: false, code: 'identity' };
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, premium: typeof customerInfo.entitlements.active[ENTITLEMENT] !== 'undefined' };
  } catch (e) {
    return { ok: false, premium: false, code: purchaseOutcome(e) };
  }
}

// Apple's sheet does not exist here. Kept so every platform file exports the same names
// (platform-split.contract.ts), and so a stray call is a no-op rather than a crash.
export async function openAppleSubscriptions(): Promise<void> {}

// The Play Store's subscription screen. RevenueCat's showManageSubscriptions is iOS only, so open the
// management URL it holds for this customer, or Google's own page for this app when it has none.
export async function openStoreSubscriptions(): Promise<void> {
  let url = PLAY_SUBSCRIPTIONS;
  try {
    if (await ready()) {
      const info = await Purchases.getCustomerInfo();
      if (typeof info.managementURL === 'string' && info.managementURL) url = info.managementURL;
    }
  } catch {
    // fall back to the Play page
  }
  try {
    await Linking.openURL(url);
  } catch {
    // no browser or Play Store to open: nothing to recover
  }
}

// Android resolves `@/lib/purchases` to THIS file, so the flag is true here.
export const IAP_AVAILABLE: boolean = true;
export const STORE_SOURCE: 'apple' | 'google' | null = 'google';
export type { StoreOffer, BuyResult, RestoreResult, LocalEntitlement } from './purchases';
