import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { radius, spacing, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

type Option<T> = { value: T; label: string };

type Props<T> = {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  accessibilityLabel?: string;
};

// A small segmented toggle: a row of two-or-more mutually-exclusive pills, one active. The one shared shape for
// "pick exactly one", unifying the settings Choice control and the breakdown gradual/same-day toggle, which had
// drifted apart on border width and label weight. ONE active treatment: a 1.5 mauve border, the mauve tint, and
// the label at weight 600 (settings used 1.5/700, breakdown 1/600; unified here to 1.5/600).
export function Segmented<T extends string>({ value, options, onChange, accessibilityLabel }: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={({ pressed }) => [styles.seg, active && styles.segOn, pressed && styles.pressed]}
          >
            <Text style={[styles.segText, active && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.two },
    seg: {
      flex: 1,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.two,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    // The one active treatment: border lifts to 1.5, the mauve tint fills, the label goes mauve at weight 600.
    segOn: { borderWidth: 1.5, borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
    pressed: { opacity: 0.7 },
    segText: { ...t.type.label, color: t.colors.inkSoft },
    segTextOn: { color: t.colors.accent },
  });
