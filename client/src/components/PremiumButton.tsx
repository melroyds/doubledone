import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

import { fonts, PREMIUM_GRADIENT, radius, spacing, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// The premium action button: the DoubleDone Premium gradient (mauve -> rose -> honey), the shared visual
// signal that an action is premium. Used for the premium AI actions (Plan my order, Chart a course, Reflect
// on this week), so the gradient that glows on the Settings premium card reads as "premium" everywhere.
export function PremiumButton({ label, onPress, disabled = false, accessibilityLabel, style }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.wrap, style, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <LinearGradient colors={PREMIUM_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.grad}>
        <Text style={styles.text}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { borderRadius: radius.lg, overflow: 'hidden' },
    grad: { paddingVertical: spacing.four, paddingHorizontal: spacing.five, alignItems: 'center' },
    text: { color: '#FFFFFF', fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    // The one documented exception to PRESSED_OPACITY (0.7): the premium gradient dims to 0.9 on press,
    // a gentler dim that reads right against the gradient fill rather than the canonical flat-fill value.
    pressed: { opacity: 0.9 },
    disabled: { opacity: 0.5 },
  });
