import { Platform } from 'react-native';
import { getWidgetInfo } from 'react-native-android-widget';

import { countWidgetPlaced } from '@/lib/widget-count';

import { WIDGET_NAMES } from './names';

/** Home-screen widgets exist on ANDROID only: this library ships no iOS widget, and web has none.
 *  Gates the offer, so an iPhone is never told to long-press a home screen that has no picker. */
export const WIDGETS_SUPPORTED = Platform.OS === 'android';

// Is there already a DoubleDone widget on this home screen?
//
// Used only to decide whether the rested screen should ever OFFER the widget: someone who has
// already put one there must never be asked to. Android gives us no way to place a widget for the
// user (there is no pin API in this library), so the offer can only teach the gesture, which makes
// it doubly important not to aim it at people who have already done it.
//
// Fails CLOSED on any error: an unknown answer is treated as "they have one", so a hiccup produces
// silence rather than an unwanted ask. Web has no widgets at all (see presence.web.ts).
//
// The launcher's real yes, and only that, also feeds the widget.placed count (lib/widget-count, at
// most once a day on this device, 2026-11-10). The fail-closed "placed" is a guess made for the
// offer's sake, so it is never counted, and neither is iOS's early "placed".
export async function hasWidgetPlaced(): Promise<boolean> {
  if (!WIDGETS_SUPPORTED) return true; // iOS: nothing to place, so nothing to offer
  try {
    const found = await Promise.all(WIDGET_NAMES.map((name) => getWidgetInfo(name)));
    const placed = found.some((list) => list.length > 0);
    if (placed) void countWidgetPlaced();
    return placed;
  } catch {
    return true;
  }
}
