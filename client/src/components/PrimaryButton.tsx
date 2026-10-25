import { ActivityIndicator, Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

import { fonts, ON_PREMIUM, PREMIUM_GRADIENT, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { PRESS_NOW } from './press-now';

type Props = {
  label: string;
  onPress: () => void;
  /** Fires as the press begins, before a focused field's blur (Focus's slip uses it to save silently). */
  onPressIn?: () => void;
  onPressOut?: () => void;
  /** Start the press on pointer-down, before a focused field's blur (the web's default is 50ms later). */
  pressNow?: boolean;
  disabled?: boolean;
  loading?: boolean;
  pill?: boolean;
  /** 'inverse' is white with a mauve label, for a button sitting ON the Premium gradient, where the accent fill
   *  (mauve on mauve) and a PremiumButton (gradient on gradient) would both disappear. */
  tone?: 'accent' | 'inverse';
  /** 'compact' is 12 x 20 with a 16/20 label and a 44 minimum height, for a card with a height budget. */
  size?: 'default' | 'compact';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** RN-web renders this as data-testid. Used only by the screenshot harness, to hold onto the
   *  primary while it walks the welcome flow to a step that has no route of its own. */
  testID?: string;
};

// The primary action button: the solid mauve-accent CTA, the one shared shape for "this is the main thing to
// do here". The single source of truth for the radius (md), the on-accent label (bodyStrong, the correct
// foreground colour in both light and dark), and the pressed/disabled feel, so the dozen hand-rolled accent
// buttons can't drift apart again. The gradient premium action is a different component (PremiumButton).
export function PrimaryButton({
  label,
  onPress,
  onPressIn,
  onPressOut,
  pressNow = false,
  disabled = false,
  loading = false,
  pill = false,
  tone = 'accent',
  size = 'default',
  accessibilityLabel,
  style,
  testID,
}: Props) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isInert = disabled || loading;
  const labelColor = tone === 'inverse' ? PREMIUM_GRADIENT[0] : t.colors.onAccent; // 5.52:1 on white
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      {...(pressNow ? PRESS_NOW : {})}
      disabled={isInert}
      accessibilityRole="button"
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.btn,
        tone === 'inverse' && styles.inverse,
        size === 'compact' && styles.compact,
        pill && styles.pill,
        style,
        pressed && styles.pressed,
        isInert && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[t.type.bodyStrong, size === 'compact' && styles.compactLabel, { color: labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    btn: {
      backgroundColor: t.colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.four,
      paddingHorizontal: spacing.five,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inverse: { backgroundColor: ON_PREMIUM },
    compact: { paddingVertical: spacing.three, paddingHorizontal: 20, minHeight: 44, alignSelf: 'flex-start' },
    compactLabel: { fontSize: 16 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.bodyBold },
    pill: { borderRadius: radius.pill },
    pressed: { opacity: PRESSED_OPACITY },
    disabled: { opacity: 0.5 },
  });
