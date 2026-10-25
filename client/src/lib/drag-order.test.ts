import { describe, expect, it } from 'vitest';

import { dragSpan, dragTargetIndex, moveToIndex, rowGap, settleOffset, shiftFor, type Slot } from './drag-order';

// Five rows, 56 tall with an 8 gap, the third one taller (a note line).
const SLOTS: Slot[] = [
  { y: 0, h: 56 },
  { y: 64, h: 56 },
  { y: 128, h: 80 },
  { y: 216, h: 56 },
  { y: 280, h: 56 },
];

describe('where a dragged row lands', () => {
  it('stays put until its middle passes a neighbour’s middle', () => {
    expect(dragTargetIndex(SLOTS, 1, 0)).toBe(1);
    expect(dragTargetIndex(SLOTS, 1, 40)).toBe(1); // centre 132, row 2's middle is 168
    expect(dragTargetIndex(SLOTS, 1, 80)).toBe(2); // centre 172, past 168
    expect(dragTargetIndex(SLOTS, 1, -40)).toBe(1); // centre 52, still below row 0's middle (28)
  });
  it('moves up past a neighbour once its middle is above that neighbour’s', () => {
    expect(dragTargetIndex(SLOTS, 1, -70)).toBe(0); // centre 22, above 28
    expect(dragTargetIndex(SLOTS, 4, -200)).toBe(2); // centre 108: rows 0 (28) and 1 (92) stay above it
  });
  it('clamps to the list, and never above the pinned or held block', () => {
    expect(dragTargetIndex(SLOTS, 2, 10_000)).toBe(4);
    expect(dragTargetIndex(SLOTS, 2, -10_000)).toBe(0);
    expect(dragTargetIndex(SLOTS, 3, -10_000, 1)).toBe(1);
    expect(dragTargetIndex(SLOTS, 9, 0)).toBe(9); // a stale index changes nothing
  });
});

describe('how the other rows make room', () => {
  const span = dragSpan(SLOTS, 1); // 56 + 8
  it('reads the gap from the layout', () => {
    expect(rowGap(SLOTS)).toBe(8);
    expect(rowGap([{ y: 0, h: 10 }])).toBe(8); // one row: the default
    expect(span).toBe(64);
  });
  it('rows the dragged one passes going down move up by its span', () => {
    expect([0, 1, 2, 3, 4].map((i) => shiftFor(i, 1, 3, span))).toEqual([0, 0, -64, -64, 0]);
  });
  it('rows it passes going up move down by its span', () => {
    expect([0, 1, 2, 3, 4].map((i) => shiftFor(i, 3, 1, span))).toEqual([0, 64, 64, 0, 0]);
  });
  it('nothing moves when it has not left its slot', () => {
    expect([0, 1, 2, 3, 4].map((i) => shiftFor(i, 2, 2, span))).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('the drop settles into its slot', () => {
  it('going down, its bottom meets the old bottom of the row it lands on', () => {
    expect(settleOffset(SLOTS, 1, 3)).toBe(272 - 120); // row 3 ends at 272, row 1 at 120
  });
  it('going up, its top meets that row’s old top, even past a taller row', () => {
    expect(settleOffset(SLOTS, 3, 1)).toBe(64 - 216);
  });
  it('no move, no offset', () => {
    expect(settleOffset(SLOTS, 2, 2)).toBe(0);
  });
});

describe('the new order', () => {
  it('moves one id, and a no-op returns the same array so nothing is written', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(moveToIndex(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveToIndex(ids, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveToIndex(ids, 1, 1)).toBe(ids);
    expect(moveToIndex(ids, 1, 7)).toBe(ids);
  });
});
