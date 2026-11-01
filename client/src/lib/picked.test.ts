import { afterEach, describe, expect, it, vi } from 'vitest';

import { picked } from './picked';

// react-native has no node build, so its Platform is a stub (vi.mock is hoisted above the import), and the stub
// can move, to check that the default follows Platform.OS.
const platform = vi.hoisted(() => ({ OS: 'ios' }));
vi.mock('react-native', () => ({ Platform: platform }));

afterEach(() => {
  platform.OS = 'ios';
});

const PHONES = ['ios', 'android'] as const;
const EVERYWHERE = ['web', ...PHONES] as const;

describe('picked', () => {
  it('says the pick with aria-pressed on the web, true and false, and never aria-selected', () => {
    expect(picked(true, 'web')).toEqual({ 'aria-pressed': true });
    // False is said too: without it the other options read as plain buttons, not toggles that are not pressed.
    expect(picked(false, 'web')).toEqual({ 'aria-pressed': false });
    expect(picked(true, 'web')).not.toHaveProperty('aria-selected');
    expect(picked(false, 'web')).not.toHaveProperty('aria-selected');
  });

  it('keeps aria-selected on iOS and Android, exactly as before, and never aria-pressed', () => {
    for (const os of PHONES) {
      expect(picked(true, os)).toEqual({ 'aria-selected': true });
      expect(picked(false, os)).toEqual({ 'aria-selected': false });
      expect(picked(true, os)).not.toHaveProperty('aria-pressed');
    }
  });

  it('follows Platform.OS when no platform is passed', () => {
    expect(picked(true)).toEqual({ 'aria-selected': true });
    platform.OS = 'android';
    expect(picked(false)).toEqual({ 'aria-selected': false });
    platform.OS = 'web';
    expect(picked(true)).toEqual({ 'aria-pressed': true });
  });

  it('merges with the state a control already says, in either order, and loses none of it', () => {
    // What the call sites carry beside the pick today (DatePicker's disabled day, the Speak button's busy state),
    // plus the object form React Native also reads. Spread before or after, every one of them survives.
    const own = {
      disabled: true,
      'aria-disabled': true,
      'aria-expanded': false,
      'aria-busy': false,
      'aria-checked': 'mixed',
      accessibilityState: { expanded: true, busy: true },
    };
    for (const os of EVERYWHERE) {
      const pick = os === 'web' ? 'aria-pressed' : 'aria-selected';
      expect({ ...own, ...picked(true, os) }).toEqual({ ...own, [pick]: true });
      expect({ ...picked(false, os), ...own }).toEqual({ ...own, [pick]: false });
    }
  });

  it('is one aria prop, never an accessibilityState object that would replace a control’s own', () => {
    for (const os of EVERYWHERE) {
      for (const on of [true, false]) {
        const props = picked(on, os);
        expect(Object.keys(props)).toHaveLength(1);
        expect(props).not.toHaveProperty('accessibilityState');
        expect(Object.keys(props)[0]).toMatch(/^aria-/);
      }
    }
  });
});
