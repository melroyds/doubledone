import { describe, expect, it } from 'vitest';

import { isOptionsKey } from './row-options';

describe('isOptionsKey (the keyboard twin of a long-press)', () => {
  it('opens on the Menu key, with or without Shift', () => {
    expect(isOptionsKey({ key: 'ContextMenu' })).toBe(true);
    expect(isOptionsKey({ key: 'ContextMenu', shiftKey: true })).toBe(true);
  });

  it('opens on Shift+F10, the Menu key of a laptop without one', () => {
    expect(isOptionsKey({ key: 'F10', shiftKey: true })).toBe(true);
  });

  it('leaves F10 alone without Shift, and with another modifier on top', () => {
    expect(isOptionsKey({ key: 'F10' })).toBe(false);
    expect(isOptionsKey({ key: 'F10', shiftKey: false })).toBe(false);
    expect(isOptionsKey({ key: 'F10', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isOptionsKey({ key: 'F10', shiftKey: true, altKey: true })).toBe(false);
    expect(isOptionsKey({ key: 'F10', shiftKey: true, metaKey: true })).toBe(false);
  });

  it('never claims the keys a row already answers (Enter ticks it) or a missing key', () => {
    expect(isOptionsKey({ key: 'Enter' })).toBe(false);
    expect(isOptionsKey({ key: ' ' })).toBe(false);
    expect(isOptionsKey({ key: 'Escape' })).toBe(false);
    expect(isOptionsKey({})).toBe(false);
  });
});
