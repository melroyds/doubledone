import { Platform } from 'react-native';

import { isOptionsKey, type OptionsKeyEvent } from '@/lib/row-options';

// The web's keyboard and mouse twins of a row's long-press (store 1.9, slice 2, K1).
//
// RN-web never fires onLongPress from a keyboard and drops accessibilityActions, so on the web a row's
// card was out of reach for anybody without a finger. A right-click, the Menu key and Shift+F10 open it
// here, exactly as a hold does. Web only: React Native's Pressable types know none of these props, and
// native has its own doors (the hold, and the screen reader's "Options" action).

type DoorEvent = OptionsKeyEvent & {
  defaultPrevented?: boolean;
  nativeEvent?: { defaultPrevented?: boolean };
  preventDefault: () => void;
};

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
 * Spread onto the Pressable that owns a row's long-press. Right-click opens the card, unless the press
 * responder already prevented the event (a touch hold, which opens the card by itself), so one gesture
 * never opens it twice.
 */
export function rowDoor(open: (() => void) | undefined): object {
  if (Platform.OS !== 'web' || !open) return {};
  return {
    'aria-keyshortcuts': 'Shift+F10',
    onContextMenu: (e: DoorEvent) => {
      if (e.defaultPrevented || e.nativeEvent?.defaultPrevented) return;
      e.preventDefault();
      open();
    },
    onKeyDown: (e: DoorEvent) => {
      if (!isOptionsKey(e)) return;
      e.preventDefault();
      swallowNextContextMenu();
      open();
    },
  };
}
