// Drag to reorder on Today (Melroy's call, 2026-10-25, after field reports that a hold no longer moved a task): a grip
// on the row's right edge picks it up, so a hold still means "open the card" and a drag on the grip means "move it".
// The Move up / Move down rail on the held card stays, as the path for screen readers, keyboards and shaky hands.
// The geometry lives here, pure, so every case is a test; Today owns the gesture and the animation.
//
// A slot is a row as the list laid it out: its top (y, relative to the list) and its height. Rows can differ in
// height (a note line, a hold line, an open card), so nothing here assumes a fixed row height.

export type Slot = { y: number; h: number };

const DEFAULT_GAP = 8;

/** The space between rows, read from the layout itself (the list's own gap), so a style change cannot break it. */
export function rowGap(slots: Slot[]): number {
  for (let i = 1; i < slots.length; i++) {
    const g = slots[i].y - (slots[i - 1].y + slots[i - 1].h);
    if (g >= 0) return g;
  }
  return DEFAULT_GAP;
}

/**
 * Where the dragged row would land, given how far it has moved. It lands below every other row whose middle its
 * own middle has passed, and never above `minIndex` (the pinned task and the held one stay where they float), nor
 * past the last row.
 */
export function dragTargetIndex(slots: Slot[], from: number, dy: number, minIndex = 0): number {
  if (from < 0 || from >= slots.length) return from;
  const centre = slots[from].y + slots[from].h / 2 + dy;
  let to = 0;
  for (let i = 0; i < slots.length; i++) {
    if (i === from) continue;
    if (slots[i].y + slots[i].h / 2 < centre) to++;
  }
  return Math.min(Math.max(to, Math.max(0, minIndex)), slots.length - 1);
}

/**
 * How far a row that is NOT being dragged moves to make room: up by the dragged row's height plus the gap when the
 * dragged row passes it going down, down by the same when it passes going up, otherwise nowhere.
 */
export function shiftFor(index: number, from: number, to: number, span: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -span;
  if (from > to && index >= to && index < from) return span;
  return 0;
}

/** The dragged row's height plus one gap: how much room it takes, and gives back. */
export function dragSpan(slots: Slot[], from: number): number {
  return (slots[from]?.h ?? 0) + rowGap(slots);
}

/**
 * The offset that sits the dragged row exactly in its new slot, so the drop settles into place before the order is
 * written, instead of jumping. Going down, its bottom meets the old bottom of the row it lands on; going up, its top
 * meets that row's old top.
 */
export function settleOffset(slots: Slot[], from: number, to: number): number {
  if (from === to || !slots[from] || !slots[to]) return 0;
  return to > from ? slots[to].y + slots[to].h - (slots[from].y + slots[from].h) : slots[to].y - slots[from].y;
}

/** Move one id from `from` to `to`. A no-op (the same index, or out of range) returns the SAME array, so nothing commits. */
export function moveToIndex<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
