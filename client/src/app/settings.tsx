import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { type MotionPref, type TextSize, type ThemePref } from '@/lib/settings';
import { useSettings, useThemedStyles } from '@/lib/theme-provider';

// The one deliberate Settings surface. Scoped to comfort and access (theme, text
// size, motion), never open-ended config: that is the line that keeps "remove
// friction, never add a setting" intact everywhere else. Calm by design: an
// editorial serif header, each control a small set of clear pills (the active one
// filled mauve), and the reassurance resting at the foot of the page. Matches the
// Dusk Settings mockup in docs/design.
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, setSettings } = useSettings();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.six }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Back to Today"
          hitSlop={8}
        >
          <Text style={styles.back}>‹ Today</Text>
        </Pressable>

        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Make it comfortable. These follow you across the app.</Text>

        <View style={styles.rows}>
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
        </View>

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

// A calm segmented control: the options as equal pills, the active one filled with
// the mauve tint and a slightly bolder mauve border. No switch to find.
function Choice<T extends string>({ label, hint, value, options, onChange }: ChoiceProps<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
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
      paddingBottom: spacing.six,
      maxWidth: 560,
      width: '100%',
      alignSelf: 'center',
      flexGrow: 1, // fills the height so the footnote can sit at the bottom
    },
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '700' },
    // Editorial serif header at weight 400, the calm counterpoint to bold "Today".
    title: { color: t.colors.ink, fontSize: 42 * t.scale, fontWeight: '400', fontFamily: fonts.sans, marginTop: spacing.three },
    subtitle: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22, marginTop: spacing.two },
    rows: { marginTop: spacing.six, gap: spacing.six },
    rowLabel: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.body, fontWeight: '700' },
    rowHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, lineHeight: 20, marginTop: spacing.one },
    segment: { flexDirection: 'row', gap: spacing.two, marginTop: spacing.three },
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
    segOn: { borderWidth: 1.5, borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
    segText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '700' },
    segTextOn: { color: t.colors.accent },
    pressed: { opacity: 0.7 },
    footnote: {
      color: t.colors.inkFaint,
      fontSize: 13 * t.scale,
      fontFamily: fonts.body,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 'auto',
      paddingTop: spacing.six,
    },
  });
