// The keyboard's own way to ask a thing for its options (store 1.9, slice 2, K1).
//
// A held task's card is the door to half the app, and RN-web never fires onLongPress from a keyboard
// (PressResponder: "Long press is not supported for keyboards"). The platform already has a keyboard
// twin for a long-press, the one every desktop menu answers: the Menu key, and Shift+F10, which is the
// same thing on a laptop with no Menu key. Pure, so it is tested; the web wiring is in TaskRow.

/** The fields of a keydown this reads. A React synthetic keyboard event satisfies it. */
export type OptionsKeyEvent = {
  key?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

/** The Menu key, or Shift+F10 with no other modifier (Ctrl+Shift+F10 and friends belong to the browser). */
export function isOptionsKey(e: OptionsKeyEvent): boolean {
  if (e.key === 'ContextMenu') return true;
  return e.key === 'F10' && e.shiftKey === true && !e.ctrlKey && !e.altKey && !e.metaKey;
}
