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
import { t } from '@/lib/locale';
import { usePremium } from '@/lib/premium-provider';
import { disableDailyReminder, enableDailyReminder } from '@/lib/reminders';
import { clampHour, formatReminderHour, reminderReasonLine } from '@/lib/reminders-types';
import { type Appearance, type MotionPref, type TextSize, THEME_NAMES, type ThemePref } from '@/lib/settings';
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
  const [mcpDisconnecting, setMcpDisconnecting] = useState(false);
  const [mcpDisconnectNote, setMcpDisconnectNote] = useState<string | null>(null); // calm line after a disconnect
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
        setExportNote(t('settings.exportDone'));
      } else {
        await Share.share({ message: json, title: name });
      }
      track('data.exported', { count: tasks.length });
    } catch {
      setExportNote(t('settings.exportError'));
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
      setDeleteError(t('settings.deleteError'));
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

  // The immediate kill switch for URL-connected (OAuth) agents: POST /mcp/disconnect with
  // the user's own verified token, which deletes the server's custody of this account's
  // session so the next tool call from any connector fails and it must sign in again. The
  // pasted-token path expires on its own, so this is about the OAuth connectors. Best
  // effort, always calm: a failure explains, never blames.
  async function disconnectMcp() {
    if (!supabase || mcpDisconnecting) return;
    setMcpDisconnecting(true);
    setMcpDisconnectNote(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        setMcpExpired(true);
        return;
      }
      const base = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';
      const res = await fetch(`${base}/mcp/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setMcpDisconnectNote(res.ok ? t('settings.mcpDisconnectDone') : t('settings.mcpDisconnectError'));
    } catch {
      setMcpDisconnectNote(t('settings.mcpDisconnectError'));
    } finally {
      setMcpDisconnecting(false);
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
    setAiNote(t('settings.aiOffNote'));
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
        <BackLink label={t('common.today')} />

        <Text style={styles.title}>{t('settings.title')}</Text>
        <Text style={styles.subtitle}>{t('settings.subtitle')}</Text>

        <Text style={styles.band}>{t('settings.bandComfort')}</Text>
        <View style={styles.rows}>
          <Choice<ThemePref>
            label={t('settings.themeLabel')}
            hint={t('settings.themeHint')}
            value={settings.theme}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
            onChange={(theme) => setSettings({ theme })}
          />
          <Choice<TextSize>
            label={t('settings.textSizeLabel')}
            value={settings.textSize}
            options={[
              { value: 'small', label: t('settings.textSizeSmall') },
              { value: 'default', label: t('settings.textSizeDefault') },
              { value: 'large', label: t('settings.textSizeLarge') },
            ]}
            onChange={(textSize) => setSettings({ textSize })}
          />
          <Choice<MotionPref>
            label={t('settings.motionLabel')}
            hint={t('settings.motionHint')}
            value={settings.motion}
            options={[
              { value: 'system', label: t('settings.motionFollowSystem') },
              { value: 'reduce', label: t('settings.motionReduce') },
            ]}
            onChange={(motion) => setSettings({ motion })}
          />
          <Choice<'off' | 'on'>
            label={t('settings.reminderLabel')}
            hint={t('settings.reminderHint')}
            value={reminderOn ? 'on' : 'off'}
            options={[
              { value: 'off', label: t('common.off') },
              { value: 'on', label: t('common.on') },
            ]}
            onChange={(v) => setReminder(v === 'on')}
          />
          {reminderNote && <Text style={styles.rowHint}>{reminderNote}</Text>}
          {reminderOn && (
            <View style={styles.reminderTimeRow}>
              <Text style={styles.reminderTimeLabel}>{t('settings.remindMeAt')}</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => changeReminderHour(reminderHour - 1)}
                  disabled={reminderHour <= 0}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.reminderEarlier')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.stepBtn, reminderHour <= 0 && styles.stepBtnOff, pressed && styles.pressed]}
                >
                  <Text style={styles.stepGlyph}>−</Text>
                </Pressable>
                <Text
                  style={styles.stepValue}
                  accessibilityLabel={t('settings.reminderAtA11y', { time: formatReminderHour(reminderHour) })}
                >
                  {formatReminderHour(reminderHour)}
                </Text>
                <Pressable
                  onPress={() => changeReminderHour(reminderHour + 1)}
                  disabled={reminderHour >= 23}
                  accessibilityRole="button"
                  accessibilityLabel={t('today.laterHeading')}
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
              <Text style={styles.accentLabel}>{t('settings.colourThemeLabel')}</Text>
              {!premium && <Text style={styles.accentTag}>{t('common.premium')}</Text>}
            </View>
            <Text style={styles.rowHint}>
              {premium ? t('settings.colourThemeHintPremium') : t('settings.colourThemeHintFree')}
            </Text>
            <View style={styles.swatchRow}>
              {THEME_NAMES.map((name) => {
                const selected = settings.themePreset === name;
                const preset = THEME_PRESETS[name];
                const presetLabel = t(`themes.${name}`);
                // The full "name, selected, Premium" reading lives in the catalog; the partial
                // combinations compose from the name + the localised suffix keys.
                const swatchA11y =
                  selected && !premium
                    ? t('settings.swatchA11y', { presetName: presetLabel })
                    : `${presetLabel}${selected ? t('settings.swatchSelectedSuffix') : ''}${premium ? '' : t('settings.swatchPremiumSuffix')}`;
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
                    accessibilityLabel={swatchA11y}
                    style={styles.swatchHit}
                    hitSlop={6}
                  >
                    <View style={[styles.swatchRing, selected && styles.swatchRingOn]}>
                      <View style={[styles.swatch, { backgroundColor: preset[theme.scheme].accent }]} />
                    </View>
                    <Text style={styles.swatchName}>{presetLabel}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {/* The Quiet interface appearance, beside the colour themes: same Premium gate, the shared
              Segmented toggle. Switching re-paints the whole app live and layout-stable. */}
          <View style={styles.accentBlock}>
            <View style={styles.accentHead}>
              <Text style={styles.accentLabel}>{t('settings.appearanceLabel')}</Text>
              {!premium && <Text style={styles.accentTag}>{t('common.premium')}</Text>}
            </View>
            <Text style={styles.rowHint}>{premium ? t('settings.appearanceHintPremium') : t('settings.appearanceHintFree')}</Text>
            <View style={styles.segment}>
              <Segmented<Appearance>
                value={settings.appearance}
                options={[
                  { value: 'standard', label: t('settings.appearanceStandard') },
                  { value: 'quiet', label: t('settings.appearanceQuiet') },
                ]}
                onChange={(ap) => {
                  if (premium) {
                    setSettings({ appearance: ap });
                    track('appearance.set', { appearance: ap });
                  } else {
                    track('appearance.locked');
                    router.push('/premium');
                  }
                }}
                accessibilityLabel={t('settings.appearanceLabel')}
              />
            </View>
          </View>
        </View>

        <Text style={styles.band}>{t('settings.bandAi')}</Text>
        <View style={styles.account}>
          <Text style={styles.rowHint}>
            {settings.aiEnabled ? t('settings.aiStatusOn') : t('settings.aiStatusOff')}
          </Text>
          {settings.aiEnabled ? (
            <Pressable onPress={turnAiOff} accessibilityRole="button" accessibilityLabel={t('settings.turnAiOffA11y')} hitSlop={6}>
              <Text style={styles.exportLink}>{t('settings.turnAiOffLink')}</Text>
            </Pressable>
          ) : confirmingAi ? (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>{t('settings.aiConsentBody')}</Text>
              <View style={styles.confirmRow}>
                <Pressable onPress={() => setConfirmingAi(false)} accessibilityRole="button" accessibilityLabel={t('common.notNow')} hitSlop={6}>
                  <Text style={styles.keep}>{t('common.notNow')}</Text>
                </Pressable>
                <Pressable onPress={confirmAiOn} accessibilityRole="button" accessibilityLabel={t('settings.aiConsentTurnOn')} hitSlop={6}>
                  <Text style={styles.exportLink}>{t('settings.aiConsentTurnOn')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmingAi(true)} accessibilityRole="button" accessibilityLabel={t('settings.turnAiOnA11y')} hitSlop={6}>
              <Text style={styles.exportLink}>{t('settings.turnAiOnLink')}</Text>
            </Pressable>
          )}
          {aiNote ? <Text style={styles.exportNote}>{aiNote}</Text> : null}
        </View>

        <Text style={styles.band}>{t('settings.bandAccessData')}</Text>
        <Pressable
          onPress={() => router.push('/privacy')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.privacyLinkA11y')}
          style={styles.privacyLink}
        >
          <Text style={styles.privacyLinkText}>{t('settings.privacyLink')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/terms')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.termsLinkA11y')}
          style={styles.privacyLink}
        >
          <Text style={styles.privacyLinkText}>{t('settings.termsLink')}</Text>
        </Pressable>

        <View style={styles.account}>
          <Text style={styles.accountLabel}>{t('settings.yourDataLabel')}</Text>
          <Text style={styles.exportHint}>{t('settings.exportHint')}</Text>
          <Pressable
            onPress={runExport}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityLabel={t('settings.exportAction')}
            hitSlop={6}
          >
            <Text style={styles.exportLink}>{exporting ? t('settings.exporting') : t('settings.exportAction')}</Text>
          </Pressable>
          {exportNote ? <Text style={styles.exportNote}>{exportNote}</Text> : null}
        </View>

        {session ? (
          <View style={styles.account}>
            <Text style={styles.accountLabel}>{t('settings.accountLabel')}</Text>
            <Text style={styles.accountEmail} numberOfLines={syncOk === false ? 2 : 1}>
              {syncOk === false
                ? t('today.syncPending')
                : t('settings.syncedTo', { email: session.user.email ?? t('today.syncedFallbackAccount') })}
            </Text>
            {confirming ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>{t('settings.deleteConfirmBody')}</Text>
                <View style={styles.confirmRow}>
                  <Pressable
                    onPress={() => setConfirming(false)}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.keepMyAccount')}
                    hitSlop={6}
                  >
                    <Text style={styles.keep}>{t('settings.keepMyAccount')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={runDelete}
                    disabled={deleting}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.confirmDeleteA11y')}
                    hitSlop={6}
                  >
                    <Text style={styles.deleteConfirm}>{deleting ? t('settings.deleting') : t('settings.deleteAction')}</Text>
                  </Pressable>
                </View>
                {deleteError ? <Text style={styles.deleteErr}>{deleteError}</Text> : null}
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirming(true)}
                accessibilityRole="button"
                accessibilityLabel={t('settings.deleteAccountLink')}
                hitSlop={6}
              >
                <Text style={styles.deleteLink}>{t('settings.deleteAccountLink')}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {session ? (
          <View style={styles.account}>
            <Text style={styles.accountLabel}>{t('settings.mcpLabel')}</Text>
            <Text style={styles.mcpHint}>{t('settings.mcpHint')}</Text>
            <Text style={styles.mcpUrl} selectable>
              {MCP_URL}
            </Text>
            <Pressable
              onPress={revealMcpToken}
              accessibilityRole="button"
              accessibilityLabel={t('settings.copyMcpTokenA11y')}
              hitSlop={6}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.mcpAction}>{mcpCopied ? t('settings.tokenCopied') : t('settings.copyMyToken')}</Text>
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
                accessibilityLabel={t('settings.mcpExpiredA11y')}
                hitSlop={6}
              >
                <Text style={styles.mcpExpired}>{t('settings.mcpExpired')}</Text>
              </Pressable>
            )}
            <Text style={styles.mcpFoot}>{t('settings.mcpFootnote')}</Text>
            <Pressable
              onPress={disconnectMcp}
              disabled={mcpDisconnecting}
              accessibilityRole="button"
              accessibilityLabel={t('settings.mcpDisconnectA11y')}
              hitSlop={6}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.mcpDisconnect}>{t('settings.mcpDisconnect')}</Text>
            </Pressable>
            {mcpDisconnectNote ? <Text style={styles.mcpFoot}>{mcpDisconnectNote}</Text> : null}
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push('/premium')}
          accessibilityRole="button"
          accessibilityLabel={premium ? t('settings.premiumCardActiveA11y') : t('settings.premiumCardSeePlansA11y')}
          style={({ pressed }) => [styles.premiumCardWrap, pressed && styles.pressed]}
        >
          <LinearGradient colors={PREMIUM_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.premiumCard}>
            <View style={styles.premiumCardText}>
              <Text style={styles.premiumCardTitle}>{t('premium.brandName')}</Text>
              <Text style={styles.premiumCardSub}>
                {premium
                  ? t('settings.premiumCardActiveSub')
                  : settings.aiEnabled
                    ? t('settings.premiumCardSubAi')
                    : t('settings.premiumCardSubNoAi')}
              </Text>
            </View>
            <Text style={styles.premiumCardCue}>{premium ? t('settings.premiumCardActiveCue') : '›'}</Text>
          </LinearGradient>
        </Pressable>

        {feedbackState === 'sent' ? (
          <Text style={styles.feedbackThanks}>{t('settings.feedbackThanks')}</Text>
        ) : feedbackOpen ? (
          <View style={styles.feedbackForm}>
            <TextInput
              style={styles.feedbackInput}
              value={feedbackText}
              onChangeText={(t) => {
                setFeedbackText(t);
                if (feedbackState === 'error') setFeedbackState('idle');
              }}
              placeholder={t('settings.feedbackPlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              multiline
              editable={feedbackState !== 'sending'}
              accessibilityLabel={t('settings.feedbackInputA11y')}
            />
            {feedbackState === 'error' && <Text style={styles.feedbackError}>{t('settings.feedbackError')}</Text>}
            <View style={styles.feedbackActions}>
              <Pressable
                onPress={() => {
                  setFeedbackOpen(false);
                  setFeedbackText('');
                  setFeedbackState('idle');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('settings.feedbackCancelA11y')}
                hitSlop={8}
              >
                <Text style={styles.feedbackCancel}>{t('common.cancel')}</Text>
              </Pressable>
              <PrimaryButton
                label={feedbackState === 'sending' ? t('settings.feedbackSending') : t('common.send')}
                onPress={sendFeedback}
                disabled={!feedbackText.trim() || feedbackState === 'sending'}
                accessibilityLabel={t('settings.sendFeedback')}
              />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setFeedbackOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('settings.sendFeedback')}
            hitSlop={8}
            style={styles.welcomeAgain}
          >
            <Text style={styles.welcomeAgainText}>{t('settings.sendFeedback')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push({ pathname: '/welcome', params: { replay: '1' } })}
          accessibilityRole="button"
          accessibilityLabel={t('settings.seeWelcomeAgain')}
          hitSlop={8}
          style={styles.welcomeAgain}
        >
          <Text style={styles.welcomeAgainText}>{t('settings.seeWelcomeAgain')}</Text>
        </Pressable>
        {devAllowed ? (
          <View>
            <Text style={styles.band}>{t('settings.bandDeveloper')}</Text>
            <View style={styles.rows}>
              <Choice<DevPremiumChoice>
                label={t('settings.devPremiumOverrideLabel')}
                hint={t('settings.devPremiumOverrideHint')}
                value={devOverride ?? 'auto'}
                options={[
                  { value: 'auto', label: t('settings.devOverrideAuto') },
                  { value: 'on', label: t('common.premium') },
                  { value: 'off', label: t('settings.devOverrideFree') },
                ]}
                onChange={(v) => setDevOverride(v === 'auto' ? null : v)}
              />
            </View>
          </View>
        ) : null}
        <Text style={styles.footnote}>{t('settings.footnote')}</Text>
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
    mcpDisconnect: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.three },
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
