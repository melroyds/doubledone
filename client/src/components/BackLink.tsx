import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { fonts, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

// The one back link, lifted out of the six sub-screens that each hand-rolled it.
// Renders the calm "‹ Label" affordance in the dominant accent style, and routes
// safely: it pops the stack when there is one, and otherwise replaces to a
// fallback route, so a deep-linked screen (opened with no back stack) returns to
// Today instead of dead-ending. Label and fallback are overridable per screen
// (Settings/Routines/Lookback read "Today", Privacy falls back to /settings).
export function BackLink({ label = 'Back', fallback = '/' }: { label?: string; fallback?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as any))}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
    >
      <Text style={styles.back}>‹ {label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  });
