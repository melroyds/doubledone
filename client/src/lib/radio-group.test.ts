import { describe, expect, it } from 'vitest';

import { radioKey } from './radio-group';

// Today's Energy pills: Low, Normal, High.
const LOW = 0;
const NORMAL = 1;
const HIGH = 2;
const N = 3;

describe('radioKey (a radio group, the WAI-ARIA way)', () => {
  it('picks the focused radio on Space, and on Spacebar from an older browser', () => {
    expect(radioKey({ key: ' ' }, NORMAL, N)).toBe(NORMAL);
    expect(radioKey({ key: 'Spacebar' }, HIGH, N)).toBe(HIGH);
    // Shift is not a browser chord here, so a Shift+Space or a Shift+arrow is still the group's.
    const shifted = { key: ' ', shiftKey: true };
    expect(radioKey(shifted, LOW, N)).toBe(LOW);
    const shiftedRight = { key: 'ArrowRight', shiftKey: true };
    expect(radioKey(shiftedRight, LOW, N)).toBe(NORMAL);
  });

  it('moves the choice on with Right and Down, wrapping from the last to the first', () => {
    expect(radioKey({ key: 'ArrowRight' }, LOW, N)).toBe(NORMAL);
    expect(radioKey({ key: 'ArrowRight' }, NORMAL, N)).toBe(HIGH);
    expect(radioKey({ key: 'ArrowRight' }, HIGH, N)).toBe(LOW);
    expect(radioKey({ key: 'ArrowDown' }, NORMAL, N)).toBe(HIGH);
    expect(radioKey({ key: 'ArrowDown' }, HIGH, N)).toBe(LOW);
  });

  it('moves the choice back with Left and Up, wrapping from the first to the last', () => {
    expect(radioKey({ key: 'ArrowLeft' }, HIGH, N)).toBe(NORMAL);
    expect(radioKey({ key: 'ArrowLeft' }, NORMAL, N)).toBe(LOW);
    expect(radioKey({ key: 'ArrowLeft' }, LOW, N)).toBe(HIGH);
    expect(radioKey({ key: 'ArrowUp' }, NORMAL, N)).toBe(LOW);
    expect(radioKey({ key: 'ArrowUp' }, LOW, N)).toBe(HIGH);
  });

  it('goes to the first on Home and the last on End, from anywhere', () => {
    for (const from of [LOW, NORMAL, HIGH]) {
      expect(radioKey({ key: 'Home' }, from, N)).toBe(LOW);
      expect(radioKey({ key: 'End' }, from, N)).toBe(HIGH);
    }
  });

  it('never answers Enter, which the press responder already presses, or any key that is not the group’s', () => {
    for (const key of ['Enter', 'Tab', 'Escape', 'a', 'PageDown', 'ContextMenu', 'F10']) {
      expect(radioKey({ key }, NORMAL, N)).toBeNull();
    }
    expect(radioKey({}, NORMAL, N)).toBeNull();
  });

  it('leaves every key held with Ctrl, Alt or Meta to the browser and the system (Alt+Left is Back)', () => {
    for (const key of [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      expect(radioKey({ key, ctrlKey: true }, NORMAL, N)).toBeNull();
      expect(radioKey({ key, altKey: true }, NORMAL, N)).toBeNull();
      expect(radioKey({ key, metaKey: true }, NORMAL, N)).toBeNull();
    }
  });

  it('keeps a group of one on its only radio', () => {
    for (const key of [' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(radioKey({ key }, 0, 1)).toBe(0);
    }
  });

  it('answers nothing for a radio that is not in the group, or a group with none', () => {
    expect(radioKey({ key: 'ArrowRight' }, -1, N)).toBeNull();
    expect(radioKey({ key: 'ArrowRight' }, N, N)).toBeNull();
    expect(radioKey({ key: ' ' }, 0, 0)).toBeNull();
    expect(radioKey({ key: 'Home' }, 0.5, N)).toBeNull();
    expect(radioKey({ key: 'End' }, 0, Number.NaN)).toBeNull();
  });
});
