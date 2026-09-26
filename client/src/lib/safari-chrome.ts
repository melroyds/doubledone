// iPhone Safari's own chrome, where the page has to know about it.
//
// In a browser tab, with the keyboard up, Safari floats a small address label over the foot of the page
// (Melroy's iPhone, 2026-09-27: it sat right on the capture panel's When and Add). The page cannot measure
// it: it is drawn inside the visual viewport and appears in no safe-area inset. So a control anchored to
// the bottom keeps clear of it by its height instead. The home-screen app has no browser chrome at all,
// and the other iPhone browsers (Chrome, Firefox, Edge, Opera, the Google app, in-app web views) draw
// theirs elsewhere or not at all, so only Safari in a tab needs the room.

/** Room kept below a bottom-anchored control for Safari's floating address label (points). */
export const SAFARI_KEYBOARD_ADDRESS_CLEAR = 44;

/** Whether this is iPhone Safari in a tab, the one browser that floats its address over the keyboard's edge. */
export function hasSafariKeyboardAddressBar(userAgent: string, standalone: boolean): boolean {
  if (standalone) return false;
  if (!/iPhone|iPod/.test(userAgent)) return false;
  // Real Safari says "Version/… Safari/…". In-app web views usually drop both, and the other browsers
  // add their own token while keeping "Safari/", so they are ruled out by name.
  if (!/Version\/[\d.]+.*Safari\//.test(userAgent)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo/.test(userAgent);
}
