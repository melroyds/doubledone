import { describe, expect, it } from 'vitest';

import { shouldShowWhatsNew, WHATS_NEW } from './whats-new';

describe('shouldShowWhatsNew', () => {
  it('never shows to a fresh install (their whole app is new)', () => {
    expect(shouldShowWhatsNew(null, false)).toBe(false);
    expect(shouldShowWhatsNew(0, false)).toBe(false);
  });

  it('shows the current announcement once to a device that predates the feature', () => {
    expect(shouldShowWhatsNew(null, true)).toBe(true);
  });

  it('shows when the device last saw an older announcement', () => {
    expect(shouldShowWhatsNew(WHATS_NEW.id - 1, true)).toBe(true);
  });

  it('never shows the same announcement twice', () => {
    expect(shouldShowWhatsNew(WHATS_NEW.id, true)).toBe(false);
    expect(shouldShowWhatsNew(WHATS_NEW.id + 1, true)).toBe(false); // a future stamp never re-triggers
  });
});
