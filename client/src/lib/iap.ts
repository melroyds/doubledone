// The pure, testable heart of in-app purchases (Apple on iOS, Google Play on Android, both through
// RevenueCat). NOTHING here imports react-native or the RevenueCat SDK, so it runs under the existing
// node vitest with no RN transform. The glue that does touch the SDK is the thin `purchases.ios.ts`
// and `purchases.android.ts`, which hand their raw shapes to these functions. Keep it that way:
// logic here, glue there.

import type { Entitlement, EntitlementRead } from './entitlement';
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
  | 'pending' // Ask-to-Buy / SCA / a slow Play payment: NOT granted yet, unlocks itself once the store confirms
  | 'already_owned' // this Apple ID or Google account already has it, offer Restore
  | 'owned_elsewhere' // the store's purchase belongs to a DIFFERENT DoubleDone account (RevenueCat 7 or 13)
  | 'store_down' // the store is not answering
  | 'not_allowed' // purchases disabled on the device (Screen Time, Family Link, a restriction)
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
  RECEIPT_ALREADY_IN_USE: '7',
  NETWORK: '10',
  RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER: '13',
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
    // The purchase exists, but RevenueCat keeps it with the account that made it (Restore Behaviour:
    // keep with original App User ID). A calm "sign in with that account", never a generic failure,
    // or an "already owned" purchase dead-ends at a Restore that cannot work.
    case ERR.RECEIPT_ALREADY_IN_USE:
    case ERR.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER:
      return 'owned_elsewhere';
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
//
// Google Play has no such rule, so Android REQUIRES an account to buy (`requireAccount`): signed out,
// the button is a sign-in, never a purchase. And a subscription whose payment is failing is fixed,
// never bought again (`fix_billing`): a second purchase would charge someone twice for one Premium.
export type PurchaseGate = 'buy' | 'already_premium' | 'wait' | 'hidden' | 'sign_in' | 'fix_billing';
export function purchaseGate(s: {
  iapAvailable: boolean;
  signedIn: boolean;
  loading: boolean;
  premium: boolean;
  requireAccount?: boolean; // true on Android: no anonymous purchases
  status?: string | null; // the entitlement status, for a payment that is failing
}): PurchaseGate {
  if (!s.iapAvailable) return 'hidden'; // the web sells via Stripe; no store button
  if (s.requireAccount && !s.signedIn) return 'sign_in'; // Android: sign in first, so the purchase belongs to someone
  if (s.signedIn && s.loading) return 'wait'; // entitlement still resolving after sign-in: the double-charge window, button disabled
  if (s.premium) return 'already_premium'; // already entitled (Stripe, Apple, Google, trial, or comp): never charge again
  if (needsBillingFix(s.status)) return 'fix_billing'; // a payment is failing on an existing subscription: fix it, never buy twice
  return 'buy'; // signed-in and resolved, OR anonymous on iOS: Apple requires the anonymous path (5.1.1)
}

/**
 * A subscription that exists but whose payment is failing: Stripe's past_due and unpaid, and a store's
 * account hold. The person has a subscription; what they need is to fix how they pay, so a buy button
 * here can only make a second one. `on_hold` is not written by the server today (2026-10, slice 1
 * pulled it because nothing ever cleared it), and is listed so the guard holds the day it is.
 */
export function needsBillingFix(status: string | null | undefined): boolean {
  return status === 'past_due' || status === 'unpaid' || status === 'on_hold';
}

/** What a tap on the store's buy button may do, decided from a FRESH entitlement read. */
export type BuyCheck = 'go' | 'already' | 'fix_billing' | 'cant_check';

/**
 * The last guard before a store sheet opens, and it FAILS CLOSED. The render-time gate above reads the
 * provider, which folds a failed read into "free" so the app stays calm offline. That is the right
 * default for reading and the wrong one for charging: a Stripe or Apple subscriber whose read failed
 * would look free, and the button would take their money a second time. So the tap re-reads, and:
 * - the read failed (offline, a 5xx, a 503 from a D1 hiccup): refuse, nothing is started;
 * - signed in on this screen, but the read went out with no session: refuse the same way;
 * - already Premium anywhere: no charge, the screen refreshes into the Premium panel;
 * - a payment failing on an existing subscription: fix it, never a second subscription;
 * - otherwise go.
 */
export function buyCheck(read: EntitlementRead, expectSignedIn: boolean): BuyCheck {
  if (!read.ok) return 'cant_check';
  if (expectSignedIn && !read.signedIn) return 'cant_check';
  if (read.entitlement.premium) return 'already';
  if (needsBillingFix(read.entitlement.status)) return 'fix_billing';
  return 'go';
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
export function localEntitlement(info: unknown): Pick<Entitlement, 'since' | 'currentPeriodEnd' | 'cancelAtPeriodEnd' | 'source'> | null {
  const active = (info as { entitlements?: { active?: Record<string, unknown> } } | null)?.entitlements?.active;
  const ent = active?.[ENTITLEMENT_ID] as
    | { originalPurchaseDate?: unknown; expirationDate?: unknown; willRenew?: unknown; store?: unknown }
    | undefined;
  if (!ent) return null;
  const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
  const expires = iso(ent.expirationDate);
  return {
    // The TENURE clock. The store's originalPurchaseDate is the first purchase in the subscription's
    // whole history (Apple and Google alike), which is precisely what `since` means to weeklyAllowance.
    since: iso(ent.originalPurchaseDate),
    currentPeriodEnd: expires ? Math.floor(Date.parse(expires) / 1000) : null,
    // A lifetime / non-expiring entitlement reports willRenew false with no expiry. That is not a
    // scheduled cancel, so only treat false as "cancelling" when there is a period to cancel AT.
    cancelAtPeriodEnd: ent.willRenew === false && expires !== null,
    // The store that SOLD it, never the platform this runs on. RevenueCat entitlements are cross-store, so
    // an Apple subscriber who signs in on Android has an active 'premium' here too, and stamping it
    // 'google' told them deleting the account would stop their billing (it cannot touch Apple) and sent
    // Manage to the wrong store (the 2026-10-01 review). PROMOTIONAL and anything unknown: no store.
    source: storeOf(ent.store),
  };
}

/** RevenueCat's `store` as our entitlement source: Apple, Google Play, or no store we bill through. */
export function storeOf(store: unknown): 'apple' | 'google' | null {
  if (store === 'APP_STORE' || store === 'MAC_APP_STORE') return 'apple';
  if (store === 'PLAY_STORE') return 'google';
  return null;
}

// How long after a billing issue a subscription may still come back and charge: Apple's billing retry and
// Google's grace plus account hold both top out at 60 days.
const HELD_WINDOW_MS = 60 * 24 * 3_600_000;

/**
 * A subscription that is OFF only because a payment failed, and can still come back and charge: Google's
 * account hold, or Apple's billing retry after its grace. Our server reads it as 'expired' (slice 1 pulled
 * 'on_hold' because nothing ever cleared it), so without this a buy button would sell a SECOND
 * subscription to someone whose first one recovers, and charges again, the moment they fix their card.
 * Read from the device's RevenueCat CustomerInfo, before any store sheet opens.
 *
 * Held = the 'premium' entitlement is inactive, a billing issue was detected in the last 60 days, and it is
 * still set to renew. `willRenew` is what tells a hold from a subscription that is truly over: once the
 * store gives up, it stops renewing, and buying again is the right thing. (`unsubscribeDetectedAt` is NOT
 * used: RevenueCat sets it for a billing-error cancellation too, exactly the case this exists for.)
 * Returns which store holds it, or null when nothing is held.
 */
export function heldSubscription(info: unknown, nowMs: number): { store: 'apple' | 'google' | null } | null {
  const all = (info as { entitlements?: { all?: Record<string, unknown> } } | null)?.entitlements?.all;
  const ent = all?.[ENTITLEMENT_ID] as
    | { isActive?: unknown; billingIssueDetectedAt?: unknown; willRenew?: unknown; store?: unknown }
    | undefined;
  if (!ent || ent.isActive === true || ent.willRenew !== true) return null;
  const issue = typeof ent.billingIssueDetectedAt === 'string' ? Date.parse(ent.billingIssueDetectedAt) : Number.NaN;
  if (!Number.isFinite(issue) || nowMs - issue > HELD_WINDOW_MS || issue - nowMs > HELD_WINDOW_MS) return null;
  return { store: storeOf(ent.store) };
}
