import { describe, expect, it } from 'vitest';

import { packagesToOffers, purchaseGate, purchaseOutcome } from './iap';

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

  it('asks an anonymous user to sign in first', () => {
    expect(purchaseGate({ ...base, signedIn: false })).toBe('sign_in');
  });

  it('WAITS while the entitlement is still resolving after sign-in (the double-charge window)', () => {
    expect(purchaseGate({ ...base, signedIn: true, loading: true })).toBe('wait');
    // even if premium is not yet known, loading must gate the button
    expect(purchaseGate({ ...base, signedIn: true, loading: true, premium: false })).toBe('wait');
  });

  it('never offers a second charge to someone already premium', () => {
    expect(purchaseGate({ ...base, premium: true })).toBe('already_premium');
  });

  it('offers buy only when signed in, resolved, and genuinely free', () => {
    expect(purchaseGate(base)).toBe('buy');
  });

  it('loading is checked before premium, so a stale false-premium never opens the button mid-read', () => {
    // signed in, still loading, premium not yet true -> must be wait, not buy
    expect(purchaseGate({ iapAvailable: true, signedIn: true, loading: true, premium: false })).toBe('wait');
  });
});
