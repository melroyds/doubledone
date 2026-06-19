import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { deleteAccount } from '@/lib/account';
import { useSession } from '@/lib/auth';
import { type MotionPref, type TextSize, type ThemePref } from '@/lib/settings';
import { saveTasks } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';
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
  const session = useSession();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Delete the account + all synced data (the RPC removes the auth row; tasks
  // cascade), then wipe local tasks and reset to a clean, signed-out Today.
  async function runDelete() {
    if (!supabase || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteAccount(supabase);
    if (!res.ok) {
      setDeleteError('Could not delete just now. Please try again.');
      setDeleting(false);
      return;
    }
    track('account.deleted');
    await saveTasks([]); // leave nothing of the account on this device
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign('/'); // a clean reload to an empty, signed-out Today
    } else {
      router.replace('/');
    }
  }

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

        <Pressable
          onPress={() => router.push('/privacy')}
          accessibilityRole="button"
          accessibilityLabel="Privacy and data"
          style={styles.privacyLink}
        >
          <Text style={styles.privacyLinkText}>Privacy & data ›</Text>
        </Pressable>

        {session ? (
          <View style={styles.account}>
            <Text style={styles.accountLabel}>Account</Text>
            <Text style={styles.accountEmail} numberOfLines={1}>
              Synced to {session.user.email ?? 'your account'}
            </Text>
            {confirming ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>
                  This permanently deletes your account and everything synced to it. It cannot be undone.
                </Text>
                <View style={styles.confirmRow}>
                  <Pressable
                    onPress={() => setConfirming(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Keep my account"
                    hitSlop={6}
                  >
                    <Text style={styles.keep}>Keep my account</Text>
                  </Pressable>
                  <Pressable
                    onPress={runDelete}
                    disabled={deleting}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm delete account"
                    hitSlop={6}
                  >
                    <Text style={styles.deleteConfirm}>{deleting ? 'Deleting…' : 'Delete'}</Text>
                  </Pressable>
                </View>
                {deleteError ? <Text style={styles.deleteErr}>{deleteError}</Text> : null}
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirming(true)}
                accessibilityRole="button"
                accessibilityLabel="Delete account and data"
                hitSlop={6}
              >
                <Text style={styles.deleteLink}>Delete account and data</Text>
              </Pressable>
            )}
          </View>
        ) : null}

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
    privacyLink: { marginTop: spacing.six },
    privacyLinkText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.body, fontWeight: '600' },
    account: { marginTop: spacing.six, gap: spacing.two },
    accountLabel: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.body, fontWeight: '700' },
    accountEmail: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    deleteLink: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '600', marginTop: spacing.one },
    confirmBox: {
      marginTop: spacing.two,
      gap: spacing.three,
      padding: spacing.four,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
    },
    confirmText: { color: t.colors.ink, fontSize: 14 * t.scale, lineHeight: 20, fontFamily: fonts.body },
    confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    keep: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '600' },
    deleteConfirm: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '700' },
    deleteErr: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
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
