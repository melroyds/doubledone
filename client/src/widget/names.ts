// The widget names, in one place. These strings MUST match the `name` of each entry in app.json's
// react-native-android-widget plugin config: the native provider is generated from that name, and a
// drift would silently stop the headless handler from recognising a placed widget (it identifies
// which widget it is rendering by `props.widgetInfo.widgetName`) and stop updates reaching it.
// Kept free of any widget-library import so the web build can reference them safely.

/** Follows the phone's light/dark setting. The default. */
export const TODAY_WIDGET = 'Today';

/** Always the light card, for a dark wallpaper (where a dark card vanishes into the background). */
export const LIGHT_WIDGET = 'TodayLight';

/** Every widget this app registers, for fan-out on update. */
export const WIDGET_NAMES = [TODAY_WIDGET, LIGHT_WIDGET] as const;
