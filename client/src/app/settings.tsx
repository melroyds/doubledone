import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { type MotionPref, type TextSize, type ThemePref } from '@/lib/settings';
import { useSettings, useThemedStyles } from '@/lib/theme-provider';

// The one deliberate Settings surface. Scoped to comfort and access (theme, text
// size, motion), never open-ended config: that is the line that keeps "remove
// friction, never add a setting" intact everywhere else. Calm by design: each
// control is a small set of clear options, the active one filled, nothing to hunt.
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, setSettings } = useSettings();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.seven }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to Today" hitSlop={8}>
          <Text style={styles.back}>‹ Today</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Make it comfortable. These follow you across the app.</Text>
        </View>

        <Choice<ThemePref>
          label="Theme"
          hint="Dark follows your device unless you choose."
          value={settings.theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => setSettings({ theme })}
        />

        <Choice<TextSize>
          label="Text size"
          value={settings.textSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'default', label: 'Default' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(textSize) => setSettings({ textSize })}
        />

        <Choice<MotionPref>
          label="Motion"
          hint="Reduce stops the gentle fades and the scrolling titles."
          value={settings.motion}
          options={[
            { value: 'system', label: 'Follow system' },
            { value: 'reduce', label: 'Reduce' },
          ]}
          onChange={(motion) => setSettings({ motion })}
        />

        <Text style={styles.footnote}>Saved to this device. Nothing here leaves it.</Text>
      </ScrollView>
    </View>
  );
}

type ChoiceProps<T extends string> = {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
};

// A calm segmented control: the options laid out as equal pills, the active one
// filled with the mauve tint. No switch to find, no hidden state.
function Choice<T extends string>({ label, hint, value, options, onChange }: ChoiceProps<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <View style={styles.segment}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => [styles.seg, active && styles.segOn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${o.label}`}
            >
              <Text style={[styles.segText, active && styles.segTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: spacing.five,
      paddingBottom: spacing.seven,
      maxWidth: 560,
      width: '100%',
      alignSelf: 'center',
      gap: spacing.five,
    },
    back: { color: t.colors.accent, fontSize: 16 * t.scale, fontWeight: '600' },
    header: { gap: spacing.two },
    title: { color: t.colors.ink, fontSize: 34 * t.scale, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.5 },
    subtitle: { color: t.colors.inkSoft, fontSize: 16 * t.scale, lineHeight: 24 },
    row: { gap: spacing.two },
    rowLabel: { color: t.colors.ink, fontSize: 18 * t.scale, fontWeight: '600' },
    rowHint: { color: t.colors.inkFaint, fontSize: 14 * t.scale, lineHeight: 19 },
    segment: { flexDirection: 'row', gap: spacing.two, marginTop: spacing.one },
    seg: {
      flex: 1,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.two,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
    },
    segOn: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
    segText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontWeight: '600' },
    segTextOn: { color: t.colors.accent },
    pressed: { opacity: 0.7 },
    footnote: { color: t.colors.inkFaint, fontSize: 13 * t.scale, textAlign: 'center', marginTop: spacing.three },
  });
