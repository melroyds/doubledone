import { describe, expect, it } from 'vitest';

import { panelFloor } from './capture-panel';

// The rows as Chrome measured them at 360 pt wide in Atkinson Hyperlegible, 2 Nov 2026 (bug sweep #26), each rounded
// to the whole pixel the web's onLayout reports:
// - the heading: 48 at both text sizes.
// - the hint seat: 36 for a two-line AI note, 54 for the three-line German, French and Spanish ones, 42 and 64 at Large.
// - the tools: 44, and 92 once the German tools wrap to a second row at Large.
// - When and Add: 48 for a one- or two-line label, then 20 a line from the third (23.2 at Large).
const KEYBOARD_PAD = 12; // the web's foot padding with the keyboard up (Chrome resizes the page around it)

describe('panelFloor', () => {
  it('is the design budget while the rows fit it, or before they are measured', () => {
    expect(panelFloor(KEYBOARD_PAD, 1, 0)).toBe(276);
    expect(panelFloor(KEYBOARD_PAD, 1, 48 + 36 + 44 + 48)).toBe(276);
    // English at Large text: 182 against a budget of 207.68, so the floor does not move.
    expect(panelFloor(KEYBOARD_PAD, 1.18, 48 + 42 + 44 + 48)).toBeCloseTo(307.68, 5);
  });

  it('follows the rows when they wrap past it, so When and Add stay inside the panel', () => {
    // German at default text, weekly on Mo and Mi: the note at three lines, Add at three.
    expect(panelFloor(KEYBOARD_PAD, 1, 48 + 54 + 44 + 60)).toBe(306);
    // German at Large text: the note at three lines, the tools on two rows, Add at three.
    expect(panelFloor(KEYBOARD_PAD, 1.18, 48 + 64 + 92 + 70)).toBe(374);
    // French at Large text, weekly on Lun and Mer: Add at four lines.
    expect(panelFloor(KEYBOARD_PAD, 1.18, 48 + 64 + 44 + 93)).toBe(349);
  });

  it('carries the foot padding on top, whichever rows it follows', () => {
    expect(panelFloor(8, 1, 0) - panelFloor(KEYBOARD_PAD, 1, 0)).toBe(-4);
    expect(panelFloor(8, 1.18, 274) - panelFloor(KEYBOARD_PAD, 1.18, 274)).toBe(-4);
  });
});
