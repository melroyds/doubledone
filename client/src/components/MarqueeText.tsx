import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
};

// A task title that wraps to at most three lines. This used to be a scrolling marquee.
// Across three rounds the scroll was a recurring source of Android layout bugs, for motion
// that a calm-first, often motion-averse audience does not really want anyway. A static wrap
// shows the whole title with zero measurement, zero animation, and no platform quirks. The
// name is kept to avoid churn, it simply no longer scrolls.
export function MarqueeText({ text, style }: Props) {
  // selectable={false} + userSelect:'none': a tap-and-hold on a task (the row's held-state
  // gesture) otherwise let iOS start a text selection on the title, on the NATIVE app too,
  // not just iOS Safari (Melroy, TestFlight, 2026-07-15). userSelect is honoured on native
  // in this RN version, so it forces the title non-selectable on every platform.
  return (
    <Text numberOfLines={3} selectable={false} style={[styles.title, style]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  // flex:1 so the title takes the row's remaining width, minWidth:0 so a long word wraps
  // instead of forcing the row (and the page) wider than a narrow viewport.
  title: { flex: 1, minWidth: 0, userSelect: 'none' },
});
