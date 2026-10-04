import { Platform } from 'react-native';

// RN-web starts a Pressable's press 50ms after the pointer goes down (PressResponder's DEFAULT_PRESS_DELAY_MS),
// which is AFTER a focused field's blur. Spread this onto a press whose onPressIn must land before that blur
// (the card's actions and Focus's buttons, which save an open line silently). React Native's own Pressable
// takes no `delayPressIn` (its typings reject it) and starts a press at once, so this is web-only.
export const PRESS_NOW: object = Platform.OS === 'web' ? { delayPressIn: 0 } : {};

// How long a press release waits before deciding the press never landed (the finger slid off). On native,
// onPress runs straight after the release, so the next tick is enough. On the web onPress rides the browser's
// own `click`, which can arrive AFTER a timer queued at pointer-up (seen in the preview: mouseup, a timer, then
// click), so it waits for that click.
export const PRESS_SETTLE_MS = Platform.OS === 'web' ? 300 : 0;
