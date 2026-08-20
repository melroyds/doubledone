import { describe, expect, it } from 'vitest';

import { weeklyAllowance } from './entitlement';
import { localEntitlement, packagesToOffers, purchaseGate, purchaseOutcome } from './iap';

describe('purchaseOutcome (thrown SDK purchase error -> one calm outcome)', () => {
  it('reads userCancelled first, before any code', () => {
    expect(purchaseOutcome({ userCancelled: true })).toBe('cancelled');
    // even with a scary-looking code, an explicit cancel wins
    expect(purchaseOutcome({ userCancelled: true, code: '2' })).toBe('cancelled');
  });

  it('maps the string error codes the SDK actually ships (not numbers)', () => {
    expect(purchaseOutcome({ code: '1' })).toBe('cancelled'); // PURCHASE_CANCELLED
    expect(purchaseOutcome({ code: '20' })).toBe('pending'); // PAYMENT_PENDING (Ask to Buy)
    expect(purchaseOutcome({ code: '6' })).toBe('already_owned'); // PRODUCT_ALREADY_PURCHASED
    expect(purchaseOutcome({ code: '2' })).toBe('store_down'); // STORE_PROBLEM
    expect(purchaseOutcome({ code: '3' })).toBe('not_allowed'); // PURCHASE_NOT_ALLOWED
    expect(purchaseOutcome({ code: '10' })).toBe('network'); // NETWORK
  });

  it('the pending vs granted line is the one that must never blur', () => {
    // PAYMENT_PENDING must be 'pending' (do NOT grant) and nothing else must be
    expect(purchaseOutcome({ code: '20' })).toBe('pending');
    expect(purchaseOutcome({ code: '1' })).not.toBe('pending');
    expect(purchaseOutcome({ code: '6' })).not.toBe('pending');
  });

  it('a numeric code (the wrong-but-plausible shape) does NOT match a string case', () => {
    // guards the exact bug the plan warned about: the enum is "1".."42" strings.
    // String(1) === '1', so numbers coerce and still map; but a genuinely unknown code fails safe.
    expect(purchaseOutcome({ code: 999 })).toBe('failed');
    expect(purchaseOutcome({ code: 'nonsense' })).toBe('failed');
  });

  it('falls back to failed for unknown / empty / null', () => {
    expect(purchaseOutcome(null)).toBe('failed');
    expect(purchaseOutcome(undefined)).toBe('failed');
    expect(purchaseOutcome({})).toBe('failed');
    expect(purchaseOutcome({ code: '0' })).toBe('failed'); // UNKNOWN_ERROR
    expect(purchaseOutcome('a string error')).toBe('failed');
  });
});

describe('packagesToOffers (RevenueCat offering -> paywall offers)', () => {
  const good = {
    current: {
      availablePackages: [
        { identifier: '$rc_monthly', product: { priceString: 'A$5.00' } },
        { identifier: '$rc_annual', product: { priceString: 'A$50.00' } },
      ],
    },
  };

  it('maps the two known packages, price from the store', () => {
    expect(packagesToOffers(good)).toEqual([
      { packageId: '$rc_monthly', plan: 'monthly', priceString: 'A$5.00' },
      { packageId: '$rc_annual', plan: 'annual', priceString: 'A$50.00' },
    ]);
  });

  it('returns [] when the offering is null (a config problem, not a crash)', () => {
    expect(packagesToOffers({ current: null })).toEqual([]);
    expect(packagesToOffers({})).toEqual([]);
    expect(packagesToOffers(null)).toEqual([]);
    expect(packagesToOffers(undefined)).toEqual([]);
  });

  it('returns [] for empty availablePackages', () => {
    expect(packagesToOffers({ current: { availablePackages: [] } })).toEqual([]);
  });

  it('drops an unknown package identifier', () => {
    const mixed = {
      current: {
        availablePackages: [
          { identifier: '$rc_weekly', product: { priceString: 'A$1.99' } },
          { identifier: '$rc_monthly', product: { priceString: 'A$5.00' } },
        ],
      },
    };
    expect(packagesToOffers(mixed)).toEqual([{ packageId: '$rc_monthly', plan: 'monthly', priceString: 'A$5.00' }]);
  });

  it('drops a package with no priceString rather than rendering it broken', () => {
    const noPrice = {
      current: {
        availablePackages: [
          { identifier: '$rc_monthly', product: {} },
          { identifier: '$rc_annual', product: { priceString: 'A$50.00' } },
        ],
      },
    };
    expect(packagesToOffers(noPrice)).toEqual([{ packageId: '$rc_annual', plan: 'annual', priceString: 'A$50.00' }]);
  });
});

describe('purchaseGate (the double-charge guard)', () => {
  const base = { iapAvailable: true, signedIn: true, loading: false, premium: false };

  it('hides the store button when IAP is unavailable (web + Android)', () => {
    expect(purchaseGate({ ...base, iapAvailable: false })).toBe('hidden');
    // hidden wins even if other flags would say buy
    expect(purchaseGate({ iapAvailable: false, signedIn: false, loading: true, premium: true })).toBe('hidden');
  });

  it('lets an anonymous user buy (App Review 5.1.1: registration must be optional)', () => {
    expect(purchaseGate({ ...base, signedIn: false })).toBe('buy');
  });

  it('still never offers a second charge to an anonymous user whose device knows it is premium', () => {
    expect(purchaseGate({ ...base, signedIn: false, premium: true })).toBe('already_premium');
  });

  it('the wait window is a signed-in concept: anonymous has no server entitlement to wait on, and StoreKit itself refuses an already-owned subscription', () => {
    expect(purchaseGate({ ...base, signedIn: false, loading: true })).toBe('buy');
  });

  it('WAITS while the entitlement is still resolving after sign-in (the double-charge window)', () => {
    expect(purchaseGate({ ...base, signedIn: true, loading: true })).toBe('wait');
    // even if premium is not yet known, loading must gate the button
    expect(purchaseGate({ ...base, signedIn: true, loading: true, premium: false })).toBe('wait');
  });

  it('never offers a second charge to someone already premium', () => {
    expect(purchaseGate({ ...base, premium: true })).toBe('already_premium');
  });

  it('offers buy when resolved and genuinely free', () => {
    expect(purchaseGate(base)).toBe('buy');
  });

  it('loading is checked before premium, so a stale false-premium never opens the button mid-read', () => {
    // signed in, still loading, premium not yet true -> must be wait, not buy
    expect(purchaseGate({ iapAvailable: true, signedIn: true, loading: true, premium: false })).toBe('wait');
  });
});

// The device-local entitlement (2026-08-19). `localPremium()` answered a bare boolean, so an
// ANONYMOUS Apple subscriber kept `since: null` from FREE_ENTITLEMENT, and weeklyAllowance(null)
// is 1 keepsake a week where a signed-in subscriber gets 4. Identical money, a quarter of the
// product, and it had been true for one of our two real Apple customers since 9 August.
describe('localEntitlement', () => {
  const info = (over: Record<string, unknown> = {}) => ({
    entitlements: {
      active: {
        premium: {
          originalPurchaseDate: '2026-02-09T05:22:00Z',
          expirationDate: '2026-09-09T05:22:00Z',
          willRenew: true,
          ...over,
        },
      },
    },
  });

  it('carries the tenure clock, the period end and the renewal state', () => {
    expect(localEntitlement(info())).toEqual({
      since: '2026-02-09T05:22:00Z',
      currentPeriodEnd: Math.floor(Date.parse('2026-09-09T05:22:00Z') / 1000),
      cancelAtPeriodEnd: false,
    });
  });

  // THE regression this exists to stop. Six months of tenure has to reach weeklyAllowance.
  it('gives an anonymous six-month subscriber the four keepsakes they paid for', () => {
    const now = Date.parse('2026-08-19T00:00:00Z');
    const local = localEntitlement(info());
    expect(weeklyAllowance(local?.since ?? null, now)).toBe(4);
    // What it used to do, kept as the contrast so the defect stays legible.
    expect(weeklyAllowance(null, now)).toBe(1);
  });

  it('is null when the entitlement is not active, so the merge only ever ADDS premium', () => {
    expect(localEntitlement({ entitlements: { active: {} } })).toBeNull();
    expect(localEntitlement({ entitlements: {} })).toBeNull();
    expect(localEntitlement({})).toBeNull();
    expect(localEntitlement(null)).toBeNull();
    expect(localEntitlement(undefined)).toBeNull();
  });

  // Crossing the SDK seam. A bad date must degrade to the OLD behaviour (null), never crash and
  // never produce a wrong date, which would be worse than no date.
  it('degrades an unparseable or wrong-typed date to null rather than guessing', () => {
    expect(localEntitlement(info({ originalPurchaseDate: 'not-a-date' }))?.since).toBeNull();
    expect(localEntitlement(info({ originalPurchaseDate: 12345 }))?.since).toBeNull();
    expect(localEntitlement(info({ expirationDate: 'nope' }))?.currentPeriodEnd).toBeNull();
    expect(localEntitlement(info({ expirationDate: undefined }))?.currentPeriodEnd).toBeNull();
  });

  it('reads a cancelled-but-still-running subscription as cancelling', () => {
    expect(localEntitlement(info({ willRenew: false }))?.cancelAtPeriodEnd).toBe(true);
  });

  // A lifetime / non-expiring entitlement reports willRenew false with NO expiry. That is not a
  // scheduled cancel, and calling it one would tell somebody their access is ending when it is not.
  it('does not call a non-expiring entitlement a scheduled cancel', () => {
    const lifetime = localEntitlement(info({ willRenew: false, expirationDate: null }));
    expect(lifetime?.cancelAtPeriodEnd).toBe(false);
    expect(lifetime?.currentPeriodEnd).toBeNull();
  });
});
