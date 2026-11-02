import { Platform } from 'react-native';

// Relative, not '@/lib/…': vitest does not read tsconfig's paths, and row-door.test.ts loads this file.
import { isOptionsKey, rowSpace, rowSpaceUp, type SpaceKeyEvent } from '../lib/row-options';

// The web's keyboard and mouse twins of a row's long-press (store 1.9, slice 2, K1), and its Space (#37).
//
// RN-web never fires onLongPress from a keyboard and drops accessibilityActions, so on the web a row's
// card was out of reach for anybody without a finger. A right-click, the Menu key and Shift+F10 open it
// here, exactly as a hold does. Web only: React Native's Pressable types know none of these props, and
// native has its own doors (the hold, and the screen reader's "Options" action).
//
// Space ticks the row, exactly as a tap does (the 1 Nov bug sweep, #37). RN-web's press responder lets
// Space press only a button, and a row is a checkbox, so Space did nothing and scrolled the page. Enter
// was always the press responder's, and still is. Space ticks when the key comes up, as a native checkbox
// does, so a held Space can never go on to press whatever Today moves the focus to after the tick.

type DoorEvent = SpaceKeyEvent & {
  preventDefault: () => void;
};

// The row a Space went down on, until that Space comes up or the row loses focus. A module value, not a
// ref: the row may render again while the key is down, and its DOM node, which this holds, stays the same.
// One at a time, as there is one Space bar.
let armed: unknown = null;

// Chrome and Firefox also turn the Menu key and Shift+F10 into a contextmenu event. By then the row has
// become its card, so the event would land on the page and open the browser's own menu over it. The one
// that follows a key open is swallowed, and the listener goes either way.
function swallowNextContextMenu() {
  if (typeof window === 'undefined') return;
  const stop = (e: Event) => {
    e.preventDefault();
    window.removeEventListener('contextmenu', stop, true);
  };
  window.addEventListener('contextmenu', stop, true);
  setTimeout(() => window.removeEventListener('contextmenu', stop, true), 500);
}

/**
 * Spread onto the Pressable that owns a row's tap and long-press: `{...rowDoor(onLongPress, tap)}`. Any other
 * Pressable that is not a button and should answer Space (a checkbox in a list, a tab) takes it the same way,
 * with no card to open: `{...rowDoor(undefined, tap)}`. A button needs none: RN-web presses it on Space itself.
 *
 * `open` opens the row's card. Right-click opens it, unless the press responder already prevented the
 * event (a touch hold, which opens the card by itself), so one gesture never opens it twice.
 *
 * `tap` is the very handler the Pressable's onPress runs, so Space does exactly what a tap does there:
 * it ticks, advances a step or picks the row in select mode. Pass undefined where a tap does nothing
 * (an inert row, which says why it cannot be ticked), and Space does nothing there either: no tick,
 * and no page scrolling out from under the row.
 */
export function rowDoor(open: (() => void) | undefined, tap: (() => void) | undefined): object {
  if (Platform.OS !== 'web') return {};
  const onKeyDown = (e: DoorEvent) => {
    if (open && isOptionsKey(e)) {
      e.preventDefault();
      swallowNextContextMenu();
      open();
      return;
    }
    const space = rowSpace(e);
    if (space === 'pass') return;
    e.preventDefault(); // a row answers Space, an inert one with nothing, so the page stays still under it
    if (space === 'arm') armed = e.currentTarget ?? null;
  };
  // The tap runs here, from this render's handler, so it is always the row's current one.
  const onKeyUp = (e: DoorEvent) => {
    const up = rowSpaceUp(e, armed);
    if (up === 'pass') return;
    armed = null;
    if (up === 'tap') tap?.();
  };
  // RN-web's Pressable calls this for the row's own blur only, never a child's.
  const onBlur = (e: { currentTarget?: unknown }) => {
    if (armed != null && armed === e.currentTarget) armed = null;
  };
  const keys = { onKeyDown, onKeyUp, onBlur };
  if (!open) return keys;
  return {
    'aria-keyshortcuts': 'Shift+F10',
    onContextMenu: (e: DoorEvent) => {
      if (e.defaultPrevented || e.nativeEvent?.defaultPrevented) return;
      e.preventDefault();
      open();
    },
    ...keys,
  };
}
