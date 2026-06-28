import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Segmented } from '@/components/Segmented';
import { border, fonts, layout, PREMIUM_GRADIENT, PRESSED_OPACITY, radius, spacing, THEME_PRESETS, type Theme } from '@/constants/theme';
import { deleteAccount } from '@/lib/account';
import { purgeScrapbookImages } from '@/lib/ai';
import { useSession } from '@/lib/auth';
import { toISODate } from '@/lib/day';
import { buildExport } from '@/lib/export';
import { usePremium } from '@/lib/premium-provider';
import { disableDailyReminder, enableDailyReminder } from '@/lib/reminders';
import { clampHour, formatReminderHour, reminderReasonLine } from '@/lib/reminders-types';
import { type MotionPref, type TextSize, THEME_NAMES, type ThemePref } from '@/lib/settings';
import { loadLastSyncOk, loadReminderHour, loadReminderOn, loadScrapbooks, loadTasks, saveReminderHour, saveReminderOn, wipeLocalData } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';
import { useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';

// The MCP server endpoint (the AI backend's /mcp route). Same origin as the AI
// Worker; falls back to the deployed Worker when EXPO_PUBLIC_AI_URL is unset.
const MCP_URL = `${process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app'}/mcp`;

// The DoubleDone Premium gradient now lives in constants/theme (PREMIUM_GRADIENT), shared with the
// PremiumButton so the same glow signals "premium" on the Settings card and on every premium action.

// The dev premium override exposed as a 3-way Choice; 'auto' defers to the real entitlement.
type DevPremiumChoice = 'auto' | 'on' | 'off';

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
  const [mcpExpired, setMcpExpired] = useState(false); // the access token couldn't be fetched (expired session)
  const { premium, devOverride, setDevOverride, devAllowed, refresh } = usePremium();
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [reminderHour, setReminderHour] = useState(9); // the hour the daily nudge fires (free for all, an access need)
  const reminderHourTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce the re-subscribe on +/-
  const [syncOk, setSyncOk] = useState<boolean | null>(null); // last sync result; false = saved local-only
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [confirmingAi, setConfirmingAi] = useState(false); // showing the "turn AI on" informed-consent card
  const [aiNote, setAiNote] = useState<string | null>(null); // the calm line after turning AI off

  // Re-check the entitlement on focus (e.g. after returning from checkout) so the Premium card's
  // "Active" marker is current, and reflect the persisted daily-reminder toggle. The premium flag
  // itself comes from usePremium (the provider), so the dev override is reflected here too.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      refresh();
      void loadReminderOn().then((on) => {
        if (active) setReminderOn(on);
      });
      void loadReminderHour().then((h) => {
        if (active) setReminderHour(h);
      });
      void loadLastSyncOk().then((v) => {
        if (active) setSyncOk(v);
      });
      return () => {
        active = false;
      };
    }, [refresh]),
  );

  // Toggle the opt-in daily reminder from Settings. Mirrors the Today footer and shares the
  // same lib + persisted flag, so the two stay in sync.
  async function setReminder(on: boolean) {
    if (on) {
      const result = await enableDailyReminder(reminderHour);
      setReminderOn(result.ok);
      void saveReminderOn(result.ok);
      track('reminder.enabled', { granted: result.ok });
      setReminderNote(result.ok ? null : reminderReasonLine(result.reason)); // never a silent bounce-back
    } else {
      await disableDailyReminder();
      setReminderOn(false);
      void saveReminderOn(false);
      setReminderNote(null);
      track('reminder.disabled');
    }
  }

  // Change the hour the daily reminder fires. The displayed time and the saved value update instantly; the
  // actual re-subscribe (web push) / re-schedule (native) is debounced so a flurry of +/- taps makes ONE
  // re-apply at the final hour, never a burst, and the last write is the one that lands.
  function changeReminderHour(next: number) {
    const h = clampHour(next);
    if (h === reminderHour) return;
    setReminderHour(h);
    void saveReminderHour(h);
    if (reminderHourTimer.current) clearTimeout(reminderHourTimer.current);
    reminderHourTimer.current = setTimeout(() => {
      void enableDailyReminder(h);
    }, 600);
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
        setExportNote("Downloaded. It's yours to keep.");
      } else {
        await Share.share({ message: json, title: name });
      }
      track('data.exported', { count: tasks.length });
    } catch {
      setExportNote('Could not export just now. Try again?');
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
    const books = await loadScrapbooks();
    await purgeScrapbookImages(books.map((b) => b.image)); // delete the R2 images first
    await wipeLocalData(); // leave nothing of the account on this device
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign('/'); // a clean reload to an empty, signed-out Today
    } else {
      router.replace('/today');
    }
  }

  // Reveal (and on web, copy) the user's MCP token: their Supabase access token.
  // An AI agent pastes it into its MCP client to act on this account's tasks under
  // RLS. Selectable so native users can copy it too; the token refreshes ~hourly.
  async function revealMcpToken() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) {
      // The access token expired and could not refresh: point at re-sign-in instead of dead-ending silently
      // (the footnote tells users to re-copy when their agent stops, so the expired case is the common one).
      setMcpExpired(true);
      return;
    }
    setMcpExpired(false);
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

  // AI on/off is asymmetric on purpose: turning it OFF is the safe, private direction, so it is
  // instant. Turning it ON is when text leaves the device, so it asks for a clear, informed tap first.
  function turnAiOff() {
    setSettings({ aiEnabled: false });
    setConfirmingAi(false);
    setAiNote('AI is off. Everything stays on your device.');
    track('ai.disabled');
  }

  function confirmAiOn() {
    setSettings({ aiEnabled: true });
    setConfirmingAi(false);
    setAiNote(null);
    track('ai.enabled');
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.six }]}>
        <BackLink label="Today" />

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
          {reminderNote && <Text style={styles.rowHint}>{reminderNote}</Text>}
          {reminderOn && (
            <View style={styles.reminderTimeRow}>
              <Text style={styles.reminderTimeLabel}>Remind me at</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => changeReminderHour(reminderHour - 1)}
                  disabled={reminderHour <= 0}
                  accessibilityRole="button"
                  accessibilityLabel="Earlier"
                  hitSlop={8}
                  style={({ pressed }) => [styles.stepBtn, reminderHour <= 0 && styles.stepBtnOff, pressed && styles.pressed]}
                >
                  <Text style={styles.stepGlyph}>−</Text>
                </Pressable>
                <Text
                  style={styles.stepValue}
                  accessibilityLabel={`Daily reminder at ${formatReminderHour(reminderHour)}`}
                >
                  {formatReminderHour(reminderHour)}
                </Text>
                <Pressable
                  onPress={() => changeReminderHour(reminderHour + 1)}
                  disabled={reminderHour >= 23}
                  accessibilityRole="button"
                  accessibilityLabel="Later"
                  hitSlop={8}
                  style={({ pressed }) => [styles.stepBtn, reminderHour >= 23 && styles.stepBtnOff, pressed && styles.pressed]}
                >
                  <Text style={styles.stepGlyph}>+</Text>
                </Pressable>
              </View>
            </View>
          )}
          <View style={styles.accentBlock}>
            <View style={styles.accentHead}>
              <Text style={styles.accentLabel}>Colour theme</Text>
              {!premium && <Text style={styles.accentTag}>Premium</Text>}
            </View>
            <Text style={styles.rowHint}>
              {premium ? 'A calm palette for the whole app. Dusk is the default.' : 'Seven calm palettes. Dusk is always free. Premium unlocks the others.'}
            </Text>
            <View style={styles.swatchRow}>
              {THEME_NAMES.map((name) => {
                const selected = settings.themePreset === name;
                const preset = THEME_PRESETS[name];
                return (
                  <Pressable
                    key={name}
                    onPress={() => {
                      if (premium) {
                        setSettings({ themePreset: name });
                        track('theme.set', { theme: name });
                      } else {
                        track('theme.locked');
                        router.push('/premium');
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${preset.name}${selected ? ', selected' : ''}${premium ? '' : ', Premium'}`}
                    style={styles.swatchHit}
                    hitSlop={6}
                  >
                    <View style={[styles.swatchRing, selected && styles.swatchRingOn]}>
                      <View style={[styles.swatch, { backgroundColor: preset[theme.scheme].accent }]} />
                    </View>
                    <Text style={styles.swatchName}>{preset.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <Text style={styles.band}>AI</Text>
        <View style={styles.account}>
          <Text style={styles.rowHint}>
            {settings.aiEnabled
              ? 'On. Break it down, Sort for me, and the keepsake scrapbook use AI, sending the text you choose to Claude to do its work.'
              : 'Off. DoubleDone works fully without AI, entirely on your device. Built that way on purpose.'}
          </Text>
          {settings.aiEnabled ? (
            <Pressable onPress={turnAiOff} accessibilityRole="button" accessibilityLabel="Turn AI off" hitSlop={6}>
              <Text style={styles.exportLink}>Turn AI off ›</Text>
            </Pressable>
          ) : confirmingAi ? (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>
                Turning on AI sends the text you choose, a task to break down, a day to sort, to Anthropic&apos;s Claude
                to do its work. Nothing else ever leaves your device.
              </Text>
              <View style={styles.confirmRow}>
                <Pressable onPress={() => setConfirmingAi(false)} accessibilityRole="button" accessibilityLabel="Not now" hitSlop={6}>
                  <Text style={styles.keep}>Not now</Text>
                </Pressable>
                <Pressable onPress={confirmAiOn} accessibilityRole="button" accessibilityLabel="Turn on AI" hitSlop={6}>
                  <Text style={styles.exportLink}>Turn on AI</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmingAi(true)} accessibilityRole="button" accessibilityLabel="Turn AI on" hitSlop={6}>
              <Text style={styles.exportLink}>Turn AI on ›</Text>
            </Pressable>
          )}
          {aiNote ? <Text style={styles.exportNote}>{aiNote}</Text> : null}
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
        <Pressable
          onPress={() => router.push('/terms')}
          accessibilityRole="button"
          accessibilityLabel="Terms of service"
          style={styles.privacyLink}
        >
          <Text style={styles.privacyLinkText}>Terms ›</Text>
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
            <Text style={styles.accountEmail} numberOfLines={syncOk === false ? 2 : 1}>
              {syncOk === false
                ? "Saved on this device. It'll sync when it can reach your account."
                : `Synced to ${session.user.email ?? 'your account'}`}
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
            {mcpExpired && (
              <Pressable
                onPress={() => router.push('/sign-in')}
                accessibilityRole="button"
                accessibilityLabel="Sign in again to get a fresh token"
                hitSlop={6}
              >
                <Text style={styles.mcpExpired}>Your session expired. Sign in again to get a fresh token.</Text>
              </Pressable>
            )}
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
                {premium
                  ? 'Active. Every extra is yours.'
                  : `More of what you love: ${settings.aiEnabled ? 'Scan a list, Chart a course, weekly scrapbooks, and more.' : 'your colour theme, and more.'}`}
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
              <PrimaryButton
                label={feedbackState === 'sending' ? 'Sending…' : 'Send'}
                onPress={sendFeedback}
                disabled={!feedbackText.trim() || feedbackState === 'sending'}
                accessibilityLabel="Send feedback"
              />
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
        {devAllowed ? (
          <View>
            <Text style={styles.band}>Developer</Text>
            <View style={styles.rows}>
              <Choice<DevPremiumChoice>
                label="Premium override"
                hint="Local testing only. Forces the Premium or Free state without a live subscription. Never ships to production."
                value={devOverride ?? 'auto'}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'on', label: 'Premium' },
                  { value: 'off', label: 'Free' },
                ]}
                onChange={(v) => setDevOverride(v === 'auto' ? null : v)}
              />
            </View>
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

// A calm settings row: the label and optional hint, then a shared Segmented toggle
// (the active option filled with the mauve tint and a bolder mauve border). No
// switch to find. The segmented row is the shared Segmented component, so the
// settings toggles and the breakdown gradual/same-day toggle stay one shape.
function Choice<T extends string>({ label, hint, value, options, onChange }: ChoiceProps<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <View style={styles.segment}>
        <Segmented value={value} options={options} onChange={onChange} accessibilityLabel={label} />
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
      maxWidth: layout.maxContentWidth,
      width: '100%',
      alignSelf: 'center',
      flexGrow: 1, // fills the height so the footnote can sit at the bottom
    },
    // Editorial serif header at weight 400, the calm counterpoint to bold "Today".
    title: { ...t.type.title, color: t.colors.ink, marginTop: spacing.three },
    subtitle: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale, marginTop: spacing.two },
    band: {
      ...t.type.eyebrow,
      color: t.colors.inkFaint,
      textTransform: 'uppercase',
      marginTop: spacing.six,
      marginBottom: spacing.two,
    },
    rows: { marginTop: spacing.two, gap: spacing.six },
    rowLabel: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    rowHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, lineHeight: 20 * t.scale, marginTop: spacing.one },
    accentBlock: {},
    accentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
    accentLabel: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    accentTag: {
      color: t.colors.accent,
      fontSize: 11 * t.scale,
      fontFamily: fonts.sans,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.four, marginTop: spacing.three },
    swatchHit: { alignItems: 'center', gap: spacing.one },
    swatchRing: { padding: 3, borderRadius: radius.pill, borderWidth: 2, borderColor: 'transparent' },
    swatchRingOn: { borderColor: t.colors.ink },
    swatch: { width: 30 * t.scale, height: 30 * t.scale, borderRadius: radius.pill },
    swatchName: { color: t.colors.inkSoft, fontSize: 12 * t.scale, fontFamily: fonts.sans },
    reminderTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.three, gap: spacing.three },
    reminderTimeLabel: { ...t.type.body, color: t.colors.ink },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
    stepBtn: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: border.hair, borderColor: t.colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface },
    stepBtnOff: { opacity: 0.4 },
    stepGlyph: { fontSize: 22 * t.scale, lineHeight: 26 * t.scale, color: t.colors.accent, fontFamily: fonts.body },
    stepValue: { ...t.type.bodyStrong, color: t.colors.ink, minWidth: 88, textAlign: 'center' },
    segment: { marginTop: spacing.three },
    pressed: { opacity: PRESSED_OPACITY },
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
    premiumCardTitle: { ...t.type.heading, color: '#FFFFFF' },
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
      borderWidth: border.hair,
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
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingVertical: spacing.two,
      paddingHorizontal: spacing.three,
      marginTop: spacing.one,
    },
    mcpAction: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.one },
    mcpExpired: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
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
      borderWidth: border.hair,
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
    feedbackThanks: { color: t.colors.doneText, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center', paddingTop: spacing.six },
    footnote: {
      color: t.colors.inkFaint,
      fontSize: 13 * t.scale,
      fontFamily: fonts.body,
      lineHeight: 20 * t.scale,
      textAlign: 'center',
      paddingTop: spacing.four,
    },
  });
