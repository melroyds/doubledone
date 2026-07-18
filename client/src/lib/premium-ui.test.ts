import { describe, expect, it } from 'vitest';

import { premiumPrimaryAction } from './premium-ui';

// The full state -> control table for the entitled panel. Each row here is a cell that either
// shipped wrong (trial, comp) or must never drift (the live Stripe path). See premium-ui.ts for
// why this is tested pure.
describe('premiumPrimaryAction (the Premium panel primary control)', () => {
  it('a trial converts via Stripe on web/Android (the CTA that never rendered for three weeks)', () => {
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
