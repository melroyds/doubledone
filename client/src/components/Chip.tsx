import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { border, radius, spacing, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  // 'soft' (DEFAULT) is the calm treatment: a mauve tint when selected, matching the chart.tsx date chips.
  // 'solid' fills the active chip with the full accent (white-on-mauve) for the rare spot that wants louder.
  variant?: 'soft' | 'solid';
  accessibilityLabel?: string;
};

// A selectable pill, the one shared shape for the "pick one of these" chips scattered across capture and the
// breakdown flow. Default is 'soft' (the calm chart date-chip treatment): the deliberate consistency move away
// from the old solid-mauve active chips, which read louder than the rest of the Dusk palette wants. One shape,
// one set of metrics, so the chips can't drift apart again.
export function Chip({ label, selected, onPress, variant = 'soft', accessibilityLabel }: Props) {
  const styles = useThemedStyles(makeStyles);
  const fillOn = variant === 'solid' ? styles.solidOn : styles.softOn;
  const textOn = variant === 'solid' ? styles.solidTextOn : styles.softTextOn;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 8, bottom: 8 }}
      style={[styles.chip, selected && fillOn]}
    >
      <Text style={[styles.text, selected && textOn]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    chip: {
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      paddingVertical: spacing.two,
      paddingHorizontal: spacing.four,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    softOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    solidOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    text: { ...t.type.label, color: t.colors.ink },
    softTextOn: { color: t.colors.accent },
    solidTextOn: { color: t.colors.onAccent },
  });
