// The pure, testable heart of Apple IAP. NOTHING here imports react-native or the RevenueCat
// SDK, so it runs under the existing node vitest with no RN transform. The glue that does touch
// the SDK is the thin `purchases.ios.ts`, which hands its raw shapes to these functions. Keep it
// that way: logic here, glue there.

import type { Entitlement } from './entitlement';
import type { StoreOffer } from './purchases';

// RevenueCat's package identifiers for the two packages in the 'default' offering.
// The RevenueCat entitlement id, mirroring purchases.ios.ts (which cannot be imported here:
// it pulls in the native SDK).
const ENTITLEMENT_ID = 'premium';

const PKG_MONTHLY = '$rc_monthly';
const PKG_ANNUAL = '$rc_annual';

// A calm, closed set of purchase outcomes the paywall knows how to speak to. Never a raw SDK
// error or code past this seam.
export type PurchaseOutcome =
  | 'cancelled' // the user backed out (or the Apple ID already owns it, which iOS reports the same way)
  | 'pending' // Ask-to-Buy / SCA: NOT granted yet, unlocks itself when Apple approves
  | 'already_owned' // this Apple ID already has it, offer Restore
  | 'store_down' // the App Store is not answering
  | 'not_allowed' // purchases disabled on the device (Screen Time, a restriction)
  | 'network' // no connection
  | 'failed'; // anything else

// RevenueCat's PURCHASES_ERROR_CODE, transcribed as the literal STRING values the SDK actually
// ships (see node_modules/@revenuecat/purchases-typescript-internal/dist/generated/error-codes).
// They are strings ("1", "2", …), NOT numbers: comparing against numbers silently never matches.
// Transcribed rather than imported so this module stays free of the native SDK. Only the handful
// the paywall reacts to are named.
const ERR = {
  PURCHASE_CANCELLED: '1',
  STORE_PROBLEM: '2',
  PURCHASE_NOT_ALLOWED: '3',
  PRODUCT_ALREADY_PURCHASED: '6',
  NETWORK: '10',
  PAYMENT_PENDING: '20',
} as const;

// Map a thrown SDK purchase error to one calm outcome. This is the highest-stakes function in the
// client half: get `pending` wrong one way and you grant Premium for a purchase Apple has not
// approved; wrong the other and you tell a parent-approved teenager their payment failed.
// `userCancelled` is read first because it is the one the SDK still sets reliably; note that on
// iOS a plain cancel and "you already own this" both surface as PURCHASE_CANCELLED, which is why
// both route to a non-alarming outcome.
export function purchaseOutcome(error: unknown): PurchaseOutcome {
  const e = (error ?? {}) as { userCancelled?: boolean | null; code?: unknown };
  if (e.userCancelled === true) return 'cancelled';
  switch (String(e.code)) {
    case ERR.PURCHASE_CANCELLED:
      return 'cancelled';
    case ERR.PAYMENT_PENDING:
      return 'pending';
    case ERR.PRODUCT_ALREADY_PURCHASED:
      return 'already_owned';
    case ERR.STORE_PROBLEM:
      return 'store_down';
    case ERR.PURCHASE_NOT_ALLOWED:
      return 'not_allowed';
    case ERR.NETWORK:
      return 'network';
    default:
      return 'failed';
  }
}

// The minimal shape `packagesToOffers` reads off a RevenueCat offering. Kept structural (not the
// SDK's type) so this module never imports the SDK. `purchases.ios.ts` passes the real thing,
// which is a superset.
type RawPackage = { identifier?: unknown; product?: { priceString?: unknown } };
type RawOfferings = { current?: { availablePackages?: RawPackage[] } | null };

// Flatten the RevenueCat 'default' offering to the two offers the paywall renders, taking the
// price STRING from the store (already localised and currency-correct) rather than the catalog.
// Anything unrecognised or missing a price is dropped rather than rendered broken. An empty result
// means an App Store Connect config problem (both products show "Missing Metadata" until review),
// never a code bug, so the caller shows a calm "store not answering" state, not a crash.
export function packagesToOffers(offerings: unknown): StoreOffer[] {
  const o = (offerings ?? {}) as RawOfferings;
  const packages = o.current?.availablePackages;
  if (!Array.isArray(packages)) return [];
  const out: StoreOffer[] = [];
  for (const pkg of packages) {
    const id = typeof pkg?.identifier === 'string' ? pkg.identifier : null;
    const price = typeof pkg?.product?.priceString === 'string' ? pkg.product.priceString : null;
    if (!price) continue;
    if (id === PKG_MONTHLY) out.push({ packageId: id, plan: 'monthly', priceString: price });
    else if (id === PKG_ANNUAL) out.push({ packageId: id, plan: 'annual', priceString: price });
  }
  return out;
}

// What the Buy control should do, given the four things that decide it. This is the guard that
// stops a DOUBLE CHARGE: a user who bought Premium on the web via Stripe, then opens iOS
// anonymously, reads as free (an anonymous client has no entitlement), and Apple cannot know about
// the Stripe subscription. So a fresh sign-in must re-read the entitlement BEFORE the button is
// live again, and while that read is in flight the answer is 'wait', not 'buy'.
// Registration is OPTIONAL before an Apple purchase (App Review, Guideline 5.1.1(v), 2026-07-28:
// the original signed-in-only gate was rejected). An anonymous buyer's Premium lives with their
// Apple ID via the on-device entitlement (localPremium in the purchases seam); signing in later
// aliases the purchase onto their account and extends it to other devices. The double-charge
// guard survives where it can be honest: a SIGNED-IN user's entitlement is still read before the
// button goes live, and for anonymous users the paywall says in words what the wall used to.
export type PurchaseGate = 'buy' | 'already_premium' | 'wait' | 'hidden';
export function purchaseGate(s: {
  iapAvailable: boolean;
  signedIn: boolean;
  loading: boolean;
  premium: boolean;
}): PurchaseGate {
  if (!s.iapAvailable) return 'hidden'; // web + Android sell via Stripe; the store button never shows
  if (s.signedIn && s.loading) return 'wait'; // entitlement still resolving after sign-in: the double-charge window, button disabled
  if (s.premium) return 'already_premium'; // already entitled (Stripe, Apple, trial, or comp): never charge again
  return 'buy'; // signed-in and resolved, OR anonymous: Apple requires the anonymous path (5.1.1)
}

/**
 * The DEVICE's own entitlement, read from a RevenueCat CustomerInfo, as the fields our model uses.
 *
 * WHY IT IS MORE THAN A BOOLEAN NOW. `localPremium()` used to answer yes/no, and the provider merged
 * only that, so an ANONYMOUS Apple subscriber (the path App Review 5.1.1(v) forces) kept
 * `since: null` from FREE_ENTITLEMENT. `weeklyAllowance(null, now)` returns 1, so a six-month
 * anonymous subscriber got ONE keepsake a week where a signed-in one gets four: identical money,
 * a quarter of the product. `currentPeriodEnd` stayed null too, so our app never told them when
 * they would next be charged.
 *
 * Every field is read defensively, because this crosses the SDK seam. A missing or unparseable
 * date degrades to null, which is exactly the old behaviour, never a crash and never a wrong date.
 * Returns null when the entitlement is not active, so the caller's merge stays "only ever ADDS".
 */
export function localEntitlement(info: unknown): Pick<Entitlement, 'since' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'> | null {
  const active = (info as { entitlements?: { active?: Record<string, unknown> } } | null)?.entitlements?.active;
  const ent = active?.[ENTITLEMENT_ID] as
    | { originalPurchaseDate?: unknown; expirationDate?: unknown; willRenew?: unknown }
    | undefined;
  if (!ent) return null;
  const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
  const expires = iso(ent.expirationDate);
  return {
    // The TENURE clock. Apple's originalPurchaseDate is the first purchase in the subscription's
    // whole history, which is precisely what `since` means to weeklyAllowance.
    since: iso(ent.originalPurchaseDate),
    currentPeriodEnd: expires ? Math.floor(Date.parse(expires) / 1000) : null,
    // A lifetime / non-expiring entitlement reports willRenew false with no expiry. That is not a
    // scheduled cancel, so only treat false as "cancelling" when there is a period to cancel AT.
    cancelAtPeriodEnd: ent.willRenew === false && expires !== null,
  };
}
