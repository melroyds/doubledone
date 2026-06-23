import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { deleteAccount } from '@/lib/account';
import { useSession } from '@/lib/auth';
import { toISODate } from '@/lib/day';
import { buildExport } from '@/lib/export';
import { disableDailyReminder, enableDailyReminder } from '@/lib/reminders';
import { type MotionPref, type TextSize, type ThemePref } from '@/lib/settings';
import { loadReminderOn, loadTasks, saveReminderOn, wipeLocalData } from '@/lib/storage';
import { loadEntitlement } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';
import { useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';

// The MCP server endpoint (the AI backend's /mcp route). Same origin as the AI
// Worker; falls back to the deployed Worker when EXPO_PUBLIC_AI_URL is unset.
const MCP_URL = `${process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app'}/mcp`;

// A warm, "flowery" mauve → rose → honey gradient for the one decorative cell, the
// Premium card. The Dusk spine stays calm everywhere else; this is the deliberate
// exception: the special, paid surface gets to glow a little.
const PREMIUM_GRADIENT = ['#8E5E72', '#B5798F', '#D6A77E'] as const;

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
  const theme = useTheme();
  const session = useSession();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [mcpCopied, setMcpCopied] = useState(false);
  const [premium, setPremium] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Reflect the live entitlement so Settings shows a calm "Active" marker on
  // Premium. Re-checks on focus, e.g. after returning from checkout.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadEntitlement().then((e) => {
        if (active) setPremium(e.premium);
      });
      void loadReminderOn().then((on) => {
        if (active) setReminderOn(on);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // Toggle the opt-in daily reminder from Settings. Mirrors the Today footer and shares the
  // same lib + persisted flag, so the two stay in sync.
  async function setReminder(on: boolean) {
    if (on) {
      const ok = await enableDailyReminder();
      setReminderOn(ok);
      void saveReminderOn(ok);
      track('reminder.enabled', { granted: ok });
    } else {
      await disableDailyReminder();
      setReminderOn(false);
      void saveReminderOn(false);
      track('reminder.disabled');
    }
  }

  // "Your stuff is yours": download (web) or share (native) a JSON of the user's
  // tasks + completions. Works with no account, the data is local.
  async function runExport() {
    setExporting(true);
    setExportNote(null);
    try {
      const tasks = await loadTasks();
      const json = buildExport(tasks, Date.now());
      const name = `doubledone-export-${toISODate(new Date())}.json`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setExportNote('Downloaded.');
      } else {
        await Share.share({ message: json, title: name });
      }
      track('data.exported', { count: tasks.length });
    } catch {
      setExportNote('Could not export just now.');
    } finally {
      setExporting(false);
    }
  }

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
    await wipeLocalData(); // leave nothing of the account on this device
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign('/'); // a clean reload to an empty, signed-out Today
    } else {
      router.replace('/');
    }
  }

  // Reveal (and on web, copy) the user's MCP token: their Supabase access token.
  // An AI agent pastes it into its MCP client to act on this account's tasks under
  // RLS. Selectable so native users can copy it too; the token refreshes ~hourly.
  async function revealMcpToken() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) return;
    setMcpToken(token);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(token);
        setMcpCopied(true);
      } catch {
        // the selectable field below is the fallback
      }
    }
  }

  // Send the user's typed feedback in-app: POST it to the AI Worker, which emails it to
  // the support inbox (no mail client, no leaving the app). Calm states, never a wall.
  async function sendFeedback() {
    const text = feedbackText.trim();
    if (!text || feedbackState === 'sending') return;
    setFeedbackState('sending');
    try {
      const base = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';
      const res = await fetch(`${base}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, context: Platform.OS }),
      });
      // Demand a real { ok: true }: a catch-all 200 from an undeployed route must not
      // read as success.
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || data?.ok !== true) throw new Error(String(res.status));
      setFeedbackText('');
      setFeedbackState('sent');
      track('feedback.sent');
    } catch {
      setFeedbackState('error');
      track('feedback.error');
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

        <Text style={styles.band}>Comfort</Text>
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
            hint="Reduce stops the gentle fades, the scrolling titles, and the buzz of haptics."
            value={settings.motion}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'reduce', label: 'Reduce' },
            ]}
            onChange={(motion) => setSettings({ motion })}
          />
          <Choice<'off' | 'on'>
            label="Daily reminder"
            hint="One gentle nudge a day to come back to your day. Nothing more."
            value={reminderOn ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
            ]}
            onChange={(v) => setReminder(v === 'on')}
          />
        </View>

        <Text style={styles.band}>Access & data</Text>
        <Pressable
          onPress={() => router.push('/privacy')}
          accessibilityRole="button"
          accessibilityLabel="Privacy and data"
          style={styles.privacyLink}
        >
          <Text style={styles.privacyLinkText}>Privacy & data ›</Text>
        </Pressable>

        <View style={styles.account}>
          <Text style={styles.accountLabel}>Your data</Text>
          <Text style={styles.exportHint}>{"Your tasks and what you've finished, as a file you keep. No account needed."}</Text>
          <Pressable
            onPress={runExport}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityLabel="Export your data"
            hitSlop={6}
          >
            <Text style={styles.exportLink}>{exporting ? 'Exporting…' : 'Export your data'}</Text>
          </Pressable>
          {exportNote ? <Text style={styles.exportNote}>{exportNote}</Text> : null}
        </View>

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

        {session ? (
          <View style={styles.account}>
            <Text style={styles.accountLabel}>AI agent access (MCP)</Text>
            <Text style={styles.mcpHint}>
              Let an AI agent add and finish your tasks. Add this server to your MCP client, then paste your token.
            </Text>
            <Text style={styles.mcpUrl} selectable>
              {MCP_URL}
            </Text>
            <Pressable
              onPress={revealMcpToken}
              accessibilityRole="button"
              accessibilityLabel="Copy my MCP token"
              hitSlop={6}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.mcpAction}>{mcpCopied ? 'Token copied ✓' : 'Copy my token'}</Text>
            </Pressable>
            {mcpToken ? (
              <Text style={styles.mcpToken} selectable numberOfLines={3}>
                {mcpToken}
              </Text>
            ) : null}
            <Text style={styles.mcpFoot}>The token refreshes about hourly. Re-copy it if your agent stops connecting.</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push('/premium')}
          accessibilityRole="button"
          accessibilityLabel={premium ? 'DoubleDone Premium, active' : 'DoubleDone Premium, see plans'}
          style={({ pressed }) => [styles.premiumCardWrap, pressed && styles.pressed]}
        >
          <LinearGradient colors={PREMIUM_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.premiumCard}>
            <View style={styles.premiumCardText}>
              <Text style={styles.premiumCardTitle}>DoubleDone Premium</Text>
              <Text style={styles.premiumCardSub}>
                {premium ? 'Active. Your week, kept.' : 'Keep every finished week as a calm AI keepsake.'}
              </Text>
            </View>
            <Text style={styles.premiumCardCue}>{premium ? 'Active ✓' : '›'}</Text>
          </LinearGradient>
        </Pressable>

        {feedbackState === 'sent' ? (
          <Text style={styles.feedbackThanks}>Thank you. It is on its way.</Text>
        ) : feedbackOpen ? (
          <View style={styles.feedbackForm}>
            <TextInput
              style={styles.feedbackInput}
              value={feedbackText}
              onChangeText={(t) => {
                setFeedbackText(t);
                if (feedbackState === 'error') setFeedbackState('idle');
              }}
              placeholder="What is working, what is not, what you wish it did…"
              placeholderTextColor={theme.colors.inkFaint}
              multiline
              editable={feedbackState !== 'sending'}
              accessibilityLabel="Your feedback"
            />
            {feedbackState === 'error' && <Text style={styles.feedbackError}>Could not send just now. Please try again.</Text>}
            <View style={styles.feedbackActions}>
              <Pressable
                onPress={() => {
                  setFeedbackOpen(false);
                  setFeedbackText('');
                  setFeedbackState('idle');
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel feedback"
                hitSlop={8}
              >
                <Text style={styles.feedbackCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={sendFeedback}
                disabled={!feedbackText.trim() || feedbackState === 'sending'}
                accessibilityRole="button"
                accessibilityLabel="Send feedback"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.feedbackSend,
                  pressed && { opacity: 0.85 },
                  (!feedbackText.trim() || feedbackState === 'sending') && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.feedbackSendText}>{feedbackState === 'sending' ? 'Sending…' : 'Send'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setFeedbackOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
            hitSlop={8}
            style={styles.welcomeAgain}
          >
            <Text style={styles.welcomeAgainText}>Send feedback</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push({ pathname: '/welcome', params: { replay: '1' } })}
          accessibilityRole="button"
          accessibilityLabel="See the welcome again"
          hitSlop={8}
          style={styles.welcomeAgain}
        >
          <Text style={styles.welcomeAgainText}>See the welcome again</Text>
        </Pressable>
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
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    // Editorial serif header at weight 400, the calm counterpoint to bold "Today".
    title: { color: t.colors.ink, fontSize: 42 * t.scale, fontWeight: '400', fontFamily: fonts.sans, marginTop: spacing.three },
    subtitle: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale, marginTop: spacing.two },
    band: {
      color: t.colors.inkFaint,
      fontSize: 12 * t.scale,
      fontFamily: fonts.bodyBold,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: spacing.six,
      marginBottom: spacing.two,
    },
    rows: { marginTop: spacing.two, gap: spacing.six },
    rowLabel: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    rowHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, lineHeight: 20 * t.scale, marginTop: spacing.one },
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
    segText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    segTextOn: { color: t.colors.accent },
    pressed: { opacity: 0.7 },
    privacyLink: { marginTop: spacing.two },
    privacyLinkText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    premiumCardWrap: { marginTop: 'auto', paddingTop: spacing.six }, // pin to the bottom of the page
    premiumCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.three,
      borderRadius: radius.lg,
      paddingVertical: spacing.five,
      paddingHorizontal: spacing.five,
      shadowColor: '#6E4A59',
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    premiumCardText: { flex: 1, gap: spacing.one },
    premiumCardTitle: { color: '#FFFFFF', fontSize: 22 * t.scale, fontFamily: fonts.sans, fontWeight: '400' },
    premiumCardSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14 * t.scale, fontFamily: fonts.body, lineHeight: 20 * t.scale },
    premiumCardCue: { color: '#FFFFFF', fontSize: 18 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    account: { marginTop: spacing.six, gap: spacing.two },
    accountLabel: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    accountEmail: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    exportHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
    exportLink: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.one },
    exportNote: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.one },
    deleteLink: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.one },
    confirmBox: {
      marginTop: spacing.two,
      gap: spacing.three,
      padding: spacing.four,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
    },
    confirmText: { color: t.colors.ink, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
    confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    keep: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    deleteConfirm: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    deleteErr: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
    mcpHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, lineHeight: 20 * t.scale },
    mcpUrl: {
      color: t.colors.ink,
      fontSize: 13 * t.scale,
      fontFamily: fonts.body,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingVertical: spacing.two,
      paddingHorizontal: spacing.three,
      marginTop: spacing.one,
    },
    mcpAction: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.one },
    mcpToken: {
      color: t.colors.inkSoft,
      fontSize: 12 * t.scale,
      fontFamily: fonts.body,
      backgroundColor: t.colors.accentSoft,
      borderRadius: radius.md,
      padding: spacing.three,
      marginTop: spacing.one,
    },
    mcpFoot: { color: t.colors.inkFaint, fontSize: 12 * t.scale, fontFamily: fonts.body, lineHeight: 18 * t.scale, marginTop: spacing.one },
    welcomeAgain: { alignItems: 'center', paddingTop: spacing.six },
    welcomeAgainText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    feedbackForm: { paddingTop: spacing.six, gap: spacing.three },
    feedbackInput: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      padding: spacing.three,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
      backgroundColor: t.colors.surface,
      textAlignVertical: 'top',
    },
    feedbackError: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
    feedbackActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.five },
    feedbackCancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
    feedbackSend: { backgroundColor: t.colors.accent, borderRadius: radius.md, paddingVertical: spacing.three, paddingHorizontal: spacing.five },
    feedbackSendText: { color: '#FFFFFF', fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    feedbackThanks: { color: t.colors.done, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center', paddingTop: spacing.six },
    footnote: {
      color: t.colors.inkFaint,
      fontSize: 13 * t.scale,
      fontFamily: fonts.body,
      lineHeight: 20 * t.scale,
      textAlign: 'center',
      paddingTop: spacing.four,
    },
  });
