import { ActivityIndicator, Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

import { PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
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
  accessibilityLabel,
  style,
  testID,
}: Props) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isInert = disabled || loading;
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
        pill && styles.pill,
        style,
        pressed && styles.pressed,
        isInert && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.colors.onAccent} />
      ) : (
        <Text style={[t.type.bodyStrong, { color: t.colors.onAccent }]}>{label}</Text>
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
    pill: { borderRadius: radius.pill },
    pressed: { opacity: PRESSED_OPACITY },
    disabled: { opacity: 0.5 },
  });
