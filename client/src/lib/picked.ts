import { Platform } from 'react-native';

// Which option is picked, in the word each platform's screen reader knows (the 1 Nov bug sweep, #33).
//
// The chips, segments, plan pills, theme swatches, day and weekday chips and on/off pills are all role=button,
// and each said "this one is picked" with aria-selected. React Native maps that onto accessibilityState.selected,
// which VoiceOver and TalkBack announce, so the phones were always right. The web was not: ARIA gives a button no
// selected state (aria-selected belongs to tabs, options and grid cells), so a screen reader on the web heard the
// picked chip exactly like the others. A toggle button says it with aria-pressed. react-native-web forwards it,
// React Native has no word for it and its typings reject the prop, so it rides a cast object, like PRESS_NOW.
//
// The role stays button on purpose. RN-web's PressResponder lets Space press only a role=button, and a web screen
// reader then reads "toggle button, pressed" or "not pressed". Tabs (DayHeading) keep aria-selected, which is right
// for a tab, and the Energy pills are radios, so neither uses this.

/**
 * Spread onto a toggle-like Pressable: `{...picked(on)}`. The web gets aria-pressed, iOS and Android keep
 * aria-selected, exactly what they had.
 *
 * It says the pick and nothing else, so it merges with whatever else the control already says instead of
 * replacing it: a `disabled` prop, aria-disabled, aria-expanded or aria-busy stay beside it as they are. React
 * Native folds aria-selected into accessibilityState field by field, and RN-web writes each aria-* prop as its own
 * attribute. It never returns an accessibilityState object, the one shape that could replace a control's own.
 *
 * Pass `on` for every option, false included: without aria-pressed the others would read as plain buttons rather
 * than toggles that are not pressed. `os` is there for the tests.
 */
export function picked(on: boolean, os: typeof Platform.OS = Platform.OS): object {
  return os === 'web' ? { 'aria-pressed': on } : { 'aria-selected': on };
}
