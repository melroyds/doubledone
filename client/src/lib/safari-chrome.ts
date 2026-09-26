// Browser chrome over the keyboard on an iPhone, where the page has to know about it.
//
// In a browser tab, with the keyboard up, Safari floats a small address label over the foot of the page
// (Melroy's iPhone, 2026-09-27: it sat right on the capture panel's When and Add). The page cannot measure
// it: it is drawn inside the visual viewport and appears in no safe-area inset. So a control anchored to
// the bottom keeps clear of it by its height instead.
//
// Every iPhone browser gets the room, not only Safari, so nothing hangs on reading which browser this is:
// room kept where no label floats is a calm gap, while a label over Add is a broken capture. The
// home-screen app has no browser chrome at all, and the store app measures its keyboard exactly, so
// neither needs it. Android's Chrome resizes the page around the keyboard (interactive-widget).

/** Room kept below a bottom-anchored control for a browser's floating chrome over the keyboard (points). */
export const SAFARI_KEYBOARD_ADDRESS_CLEAR = 44;

/** Whether this page is in an iPhone browser tab, where browser chrome can float over the keyboard's edge. */
export function hasSafariKeyboardAddressBar(userAgent: string, standalone: boolean): boolean {
  if (standalone) return false;
  return /iPhone|iPod/.test(userAgent);
}
