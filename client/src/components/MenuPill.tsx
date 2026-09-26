import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, fonts, PRESSED_OPACITY, radius, rgba, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';

/**
 * The Menu pill: the same pill, in the same place, with the same label, on Today and on Ours (the Today
 * v3 handoff). It opens the contents page, "The rest of the house". Quiet drops the chrome and the dots
 * and keeps the word.
 */
export function MenuPill({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const aiEnabled = useSettings().settings.aiEnabled;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={aiEnabled ? t('today.menuA11y') : t('today.menuNoAiA11y')}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      {theme.appearance !== 'quiet' && (
        <View style={styles.dots}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      )}
      <Text style={styles.label}>{t('today.menu')}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    pill:
      t.appearance === 'quiet'
        ? { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.two, paddingHorizontal: 6 }
        : {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.two,
            borderWidth: border.hair,
            borderColor: rgba(t.colors.ink, t.scheme === 'dark' ? 0.14 : 0.1), // derived so the pill follows the active theme
            backgroundColor: rgba(t.colors.surface, 0.6),
            borderRadius: radius.pill,
            paddingVertical: spacing.two,
            paddingHorizontal: 13,
          },
    dots: { flexDirection: 'row', gap: 3 },
    dot: { width: 4, height: 4, borderRadius: radius.pill, backgroundColor: t.colors.accent },
    label: { color: t.colors.accent, fontSize: 13 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
    pressed: { opacity: PRESSED_OPACITY },
  });
