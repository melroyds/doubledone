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
  return (
    <Text numberOfLines={3} style={[styles.title, style]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  // flex:1 so the title takes the row's remaining width, minWidth:0 so a long word wraps
  // instead of forcing the row (and the page) wider than a narrow viewport.
  title: { flex: 1, minWidth: 0 },
});
