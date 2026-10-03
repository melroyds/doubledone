import { describe, expect, it } from 'vitest';

import { de } from './catalogs/de';
import { en } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import { it as itCat } from './catalogs/it';
import { manageRoute, premiumPrimaryAction, showsCancelReassurance, storeCopyKeys, trialSlot } from './premium-ui';

// The full state -> control table for the entitled panel. Each row here is a cell that either
// shipped wrong (trial, comp) or must never drift (the live Stripe path). See premium-ui.ts for
// why this is tested pure.
describe('premiumPrimaryAction (the Premium panel primary control)', () => {
  it('a trial converts via Stripe on the web (the CTA that never rendered for three weeks)', () => {
    expect(premiumPrimaryAction('trial', false)).toBe('convert');
  });

  it('a trial on iOS renders NO control: StoreKit refuses a second purchase while premium, so a button could only fail', () => {
    expect(premiumPrimaryAction('trial', true)).toBe('none');
  });

  it('a comp gets the calm nothing-to-manage line, never a Manage button that can only 404 the portal', () => {
    expect(premiumPrimaryAction('comp', false)).toBe('nothing');
    expect(premiumPrimaryAction('comp', true)).toBe('nothing');
  });

  it('a real subscription manages, on every platform (the live Stripe path, unchanged)', () => {
    expect(premiumPrimaryAction('active', false)).toBe('manage');
    expect(premiumPrimaryAction('active', true)).toBe('manage');
    // cancel-at-period-end keeps the manage path (the portal is where you un-cancel)
    expect(premiumPrimaryAction('canceled', false)).toBe('manage');
    // Apple grace period: manage() itself routes to Apple's sheet by source
    expect(premiumPrimaryAction('past_due', true)).toBe('manage');
  });

  it('an unknown or null status falls back to manage rather than hiding the control', () => {
    expect(premiumPrimaryAction(null, false)).toBe('manage');
    expect(premiumPrimaryAction('something_new', false)).toBe('manage');
  });
});

// The free month sat twelve pixels under a button that takes real money instantly, in the same
// accent, with copy opening "Or". No evidence ties that layout to any actual charge, and it is
// still a trap worth removing on its own merits.
describe('trialSlot', () => {
  it('hides the offer when signed out, because it could only ever error there', () => {
    expect(trialSlot({ signedIn: false, iapAvailable: true })).toBe('hidden');
    expect(trialSlot({ signedIn: false, iapAvailable: false })).toBe('hidden');
  });

  // SEPARATED, not removed. Hiding it relocates a genuinely free offer to somewhere an iPhone-only
  // user would never look, and creates a platform difference we could not explain kindly.
  it('moves the offer out from under the buy button on iOS, without removing it', () => {
    expect(trialSlot({ signedIn: true, iapAvailable: true })).toBe('separated');
  });

  it('leaves web and Android exactly as they were', () => {
    expect(trialSlot({ signedIn: true, iapAvailable: false })).toBe('inline');
  });

  // It is never absent for a signed-in user on any platform: the offer survives the fix.
  it('always offers it to a signed-in user somewhere', () => {
    for (const iapAvailable of [true, false]) {
      expect(trialSlot({ signedIn: true, iapAvailable })).not.toBe('hidden');
    }
  });
});

describe('premiumPrimaryAction where this build sells nothing (the Path C rollback)', () => {
  it('never offers a checkout or a portal', () => {
    for (const status of ['active', 'trial', 'canceled', 'past_due', null]) {
      const action = premiumPrimaryAction(status, false, false);
      expect(action).not.toBe('convert');
      expect(action).not.toBe('manage');
    }
  });

  it('gives a trial no control, a paying member a plain line, and a comp its calm line', () => {
    expect(premiumPrimaryAction('trial', false, false)).toBe('none');
    expect(premiumPrimaryAction('active', false, false)).toBe('elsewhere');
    expect(premiumPrimaryAction('comp', false, false)).toBe('nothing');
  });

  it('leaves the web and iOS exactly as they were', () => {
    expect(premiumPrimaryAction('trial', false)).toBe('convert');
    expect(premiumPrimaryAction('trial', true)).toBe('none');
    expect(premiumPrimaryAction('active', false)).toBe('manage');
    expect(premiumPrimaryAction('active', true, true)).toBe('manage');
  });
});

describe('showsCancelReassurance (never "if you cancel" to someone with nothing to cancel)', () => {
  it('is said only to a member who could cancel', () => {
    expect(showsCancelReassurance('active', false)).toBe(true);
    expect(showsCancelReassurance('past_due', false)).toBe(true);
  });

  it('is never said to a trial, a comp, or a subscription already set to end', () => {
    expect(showsCancelReassurance('trial', false)).toBe(false);
    expect(showsCancelReassurance('comp', false)).toBe(false);
    expect(showsCancelReassurance('active', true)).toBe(false);
  });
});

describe('manageRoute (Manage opens the store that sold it, or says where it lives)', () => {
  it('opens Apple only on an iPhone, and says where it lives everywhere else', () => {
    expect(manageRoute('apple', 'ios')).toBe('apple-sheet');
    expect(manageRoute('apple', 'web')).toBe('apple-elsewhere');
    expect(manageRoute('apple', 'android')).toBe('apple-elsewhere');
  });

  it('opens Play only on Android, and never sends a Google subscriber to the Stripe portal', () => {
    expect(manageRoute('google', 'android')).toBe('google-play');
    expect(manageRoute('google', 'web')).toBe('google-elsewhere');
    expect(manageRoute('google', 'ios')).toBe('google-elsewhere');
  });

  it('sends Stripe, and a pre-2026-07 row, to the portal', () => {
    expect(manageRoute('stripe', 'web')).toBe('stripe-portal');
    expect(manageRoute(null, 'web')).toBe('stripe-portal');
    expect(manageRoute(null, 'ios')).toBe('stripe-portal');
  });
});

// Android since Path A: it sells through Google Play only, and Stripe may not appear at all.
describe('premiumPrimaryAction on Android (Path A: STRIPE_HERE false)', () => {
  const android = (status: string | null, source: 'stripe' | 'apple' | 'google' | null) => premiumPrimaryAction(status, true, true, false, source);

  it('a Google Play subscriber manages it in the Play Store', () => {
    expect(android('active', 'google')).toBe('manage');
    expect(android('past_due', 'google')).toBe('manage'); // grace period: the fix is in the Play Store
    expect(android('canceled', 'google')).toBe('manage');
  });

  it('a Stripe or Apple subscriber gets a plain line, never a button to another biller', () => {
    for (const source of ['stripe', 'apple', null] as const) {
      expect(android('active', source)).toBe('elsewhere');
      expect(android('canceled', source)).toBe('elsewhere');
    }
  });

  it('never offers the Stripe convert, so the fixed-A$ convert panel cannot render on Android', () => {
    for (const source of ['stripe', 'apple', 'google', null] as const) {
      expect(android('trial', source)).toBe('none');
      // and even if the store were not available, Stripe still is not here
      expect(premiumPrimaryAction('trial', false, true, false, source)).not.toBe('convert');
    }
  });

  it('keeps the calm comp line', () => {
    expect(android('comp', null)).toBe('nothing');
  });

  it('leaves the web and iOS exactly as they were', () => {
    expect(premiumPrimaryAction('active', false, true, true, 'stripe')).toBe('manage');
    expect(premiumPrimaryAction('active', true, true, true, 'apple')).toBe('manage');
    expect(premiumPrimaryAction('active', true, true, true, 'google')).toBe('manage'); // manage() then says where it lives
    expect(premiumPrimaryAction('trial', false, true, true, null)).toBe('convert');
  });
});

// The words Android may show or SPEAK. Play rejected 1.5.1 for an A$ price shown to a reviewer abroad, and
// its Payments policy forbids naming another biller. Every store line the paywall can render on Android is
// chosen by storeCopyKeys(true), so reading every key it returns, in every catalogue, covers them all.
describe('storeCopyKeys: what Android may say', () => {
  const CATALOGS = { en, de, es, fr, it: itCat } as Record<string, unknown>;
  const lookup = (cat: unknown, key: string): unknown =>
    key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), cat);
  const FORBIDDEN: [string, RegExp][] = [
    ['a currency figure', /A\$|US\$|\$\s?\d|\d\s?\$|€|£|\bAUD\b|\bUSD\b/],
    ['a dollar word', /dollar|dólar|dolar/i],
    ['a worked-out discount', /\d\s?%|17/],
    ['Apple', /apple|app store|screen time|temps d.écran|bildschirmzeit|tiempo de uso|tempo di utilizzo/i],
    ['Stripe', /stripe/i],
    ['a free trial pitch', /try premium free|essaie premium gratuitement|prueba premium gratis|prova premium gratis|teste premium kostenlos/i],
  ];
  const android = storeCopyKeys(true);

  it('every Android key exists in every catalogue (a missing one would fall back to English, or to Apple)', () => {
    for (const [loc, cat] of Object.entries(CATALOGS)) {
      for (const key of Object.values(android)) expect(typeof lookup(cat, key), `${loc} ${key}`).toBe('string');
    }
  });

  for (const [what, re] of FORBIDDEN) {
    it(`no Android line carries ${what}, in any language`, () => {
      for (const [loc, cat] of Object.entries(CATALOGS)) {
        for (const key of Object.values(android)) {
          const text = String(lookup(cat, key));
          expect(re.test(text), `${loc} ${key}: ${text}`).toBe(false);
        }
      }
    });
  }

  it('the spoken price comes only from the store, through {price}', () => {
    for (const key of [android.planMonthlyA11y, android.planAnnualA11y, android.subscribeMonthlyA11y, android.subscribeAnnualA11y, android.perMonth, android.perYear]) {
      for (const [loc, cat] of Object.entries(CATALOGS)) expect(String(lookup(cat, key)), `${loc} ${key}`).toContain('{price}');
    }
  });

  it('names Google Play where it names a store, and never the App Store', () => {
    for (const key of [android.unavailable, android.storeDown, android.renewsMonthly, android.renewsAnnual, android.storeNote]) {
      expect(String(lookup(en, key)), key).toMatch(/Google Play|Play Store/);
    }
  });

  it('the renewal line says it is charged every period, and how to cancel', () => {
    expect(String(lookup(en, android.renewsMonthly))).toMatch(/every month until you cancel/);
    expect(String(lookup(en, android.renewsAnnual))).toMatch(/every year until you cancel/);
    for (const key of [android.renewsMonthly, android.renewsAnnual]) expect(String(lookup(en, key))).toMatch(/Cancel any time/);
  });

  it('leaves the web and iOS keys as they were', () => {
    const apple = storeCopyKeys(false);
    expect(apple.planAnnual).toBe('premium.planAnnual');
    expect(apple.unavailable).toBe('premium.iapUnavailable');
    expect(apple.renewsMonthly).toBe('premium.appleRenewalTerms');
    expect(apple.trialLink).toBe('premium.trialLink');
    for (const key of Object.values(apple)) expect(typeof lookup(en, key), key).toBe('string');
  });
});
