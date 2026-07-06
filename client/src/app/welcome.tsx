import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, radius, spacing, type Theme } from '@/constants/theme';
import { triage } from '@/lib/ai';
import { t } from '@/lib/locale';
import { loadTasks, saveOnboarded, saveTasks } from '@/lib/storage';
import { type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';
import { allOnToday, triageToTasks } from '@/lib/triage';

import closeDayArt from '../../assets/images/closeday.jpg';
import emptyArt from '../../assets/images/empty.jpg';

// Module scope so the id generator stays pure for the render linter (same as Today's makeId).
let seq = 0;
function makeId(): string {
  seq += 1;
  return `t-${Date.now().toString(36)}-${seq.toString(36)}`;
}

// The six onboarding screens, in order (the "Dusk, evolved" Introduction). It teaches the
// core loop by DOING it (the user's own dump runs through the real triage), then makes one
// calm pass at the AI safety net and what-you-keep, then hands off to Today. Skippable on
// every screen but the last; the rest of the app's features are left for in-context discovery
// (curate, don't catalogue). The Today screen redirects here once, when onboarded is unset.
const STEPS = ['welcome', 'capture', 'reveal', 'safetynet', 'keep', 'premium', 'handoff'] as const;
type Step = (typeof STEPS)[number];

const PRIMARY: Record<Step, string> = {
  welcome: t('common.begin'),
  capture: t('actions.sortForMe'),
  reveal: t('welcome.primaryLooksGood'),
  safetynet: t('common.gotIt'),
  keep: t('common.continue'),
  premium: t('common.continue'),
  handoff: t('welcome.primaryOpenToday'),
};

const TRIAGE_TIMEOUT_MS = 8000;

// The safety-net pass: the three "you're not alone with a hard task" tools, introduced once
// here and discovered in context thereafter.
const SAFETY_NET: { name: string; what: string }[] = [
  { name: t('actions.breakItDown'), what: t('welcome.safetyNetBreakWhat') },
  { name: t('actions.makeItTiny'), what: t('welcome.safetyNetTinyWhat') },
  { name: t('actions.lightenToday'), what: t('welcome.safetyNetLightenWhat') },
];

// With AI off, the safety net swaps the AI tools (Make it tiny, Lighten today) for the on-device ones that serve
// the same "you're not alone when it feels too big" purpose, so the screen stays full and all three really work.
const SAFETY_NET_NOAI: { name: string; what: string }[] = [
  { name: t('actions.breakItDown'), what: t('welcome.safetyNetNoAiBreakWhat') },
  { name: t('today.focusOne'), what: t('welcome.safetyNetFocusWhat') },
  { name: t('welcome.safetyNetLowDayName'), what: t('welcome.safetyNetLowDayWhat') },
];

// The Premium suite, introduced once at the end of onboarding. The calm loop is free; this is the
// "when you want more" close. Lead with the scrapbook (the emotional payoff), and never a hard sell:
// it plants the idea and points to Settings, rather than interrupting first use with a paywall.
const PREMIUM_FEATURES: { name: string; what: string }[] = [
  { name: t('welcome.premiumScrapbookName'), what: t('welcome.premiumScrapbookWhat') },
  { name: t('actions.chartACourse'), what: t('welcome.premiumChartWhat') },
  { name: t('actions.planMyDay'), what: t('welcome.premiumPlanWhat') },
  { name: t('welcome.premiumPatternsName'), what: t('welcome.premiumPatternsWhat') },
  { name: t('welcome.premiumScanName'), what: t('welcome.premiumScanWhat') },
];

// With AI off, the premium pitch drops the AI features (scrapbook, Chart, Plan my day, patterns, Scan) and shows
// only the non-AI premium value, so a user who just opted out is never sold what they have turned off.
const PREMIUM_FEATURES_NOAI: { name: string; what: string }[] = [
  { name: t('welcome.premiumColourName'), what: t('welcome.premiumColourWhat') },
  { name: t('welcome.premiumPinName'), what: t('welcome.premiumPinWhat') },
];

export default function WelcomeScreen() {
  const router = useRouter();
  // Replayable from Settings (?replay=1). A replay must never overwrite an existing list, so
  // its capture merges in rather than replacing, and it leaves the onboarded flag alone.
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const isReplay = replay === '1';
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { settings, setSettings } = useSettings();
  const aiEnabled = settings.aiEnabled;
  const [step, setStep] = useState<Step>('welcome');
  const [dump, setDump] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Task[]>([]);
  const committed = useRef(false); // save the triaged tasks exactly once, on exit

  const stepIndex = STEPS.indexOf(step);

  // Persist what was captured exactly once, then leave. Replay merges (never overwrites);
  // first-run replaces and sets onboarded. Idempotent, so going back then forward, or
  // skipping after the reveal, never double-saves.
  async function commit() {
    if (committed.current) return;
    committed.current = true;
    if (isReplay) {
      const existing = await loadTasks();
      await saveTasks([...existing, ...revealed]);
    } else {
      await saveTasks(revealed);
      await saveOnboarded(true);
    }
    track('welcome.completed', { total: revealed.length, replay: isReplay });
  }

  async function leave() {
    await commit();
    router.replace('/today');
  }

  async function skip() {
    track('welcome.skipped', { step });
    await leave();
  }

  function back() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  }

  // "Sort it for me": run the captured lines through the real triage (the same one the app's
  // Sort for me uses), then reveal. A timeout AND a catch both fall back to "everything on
  // today", so a slow or failed call never stalls or breaks the first impression.
  async function makeDay(useAi: boolean) {
    if (busy) return;
    const lines = dump
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return; // nothing to sort; the hidden primary makes this just a guard
    setBusy(true);
    const today = new Date();
    const now = Date.now();
    let tasks: Task[];
    if (!useAi) {
      // AI off: skip the triage call entirely; everything lands on today, no server call.
      tasks = triageToTasks(lines, [], today, now, makeId);
    } else {
      try {
        const items = await Promise.race([
          triage(lines),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('triage timeout')), TRIAGE_TIMEOUT_MS)),
        ]);
        // The AI's ordering and break-down flags are kept, but EVERYTHING lands on Today:
        // before trust exists, a line vanishing into Later reads as data loss (Melroy,
        // 2026-07-05). The reveal teaches the move-it-later affordance instead.
        tasks = allOnToday(triageToTasks(lines, items, today, now, makeId));
      } catch {
        tasks = triageToTasks(lines, [], today, now, makeId); // all on today, nothing lost
      }
    }
    setRevealed(tasks);
    setBusy(false);
    setStep('reveal');
    track('welcome.triaged', { total: lines.length });
  }

  // The onboarding opt-out: choose AI-free BEFORE any triage runs. Writes the same aiEnabled flag the
  // whole app reads, logs where in the funnel the choice was made, then sorts locally. We pass the chosen
  // value straight into makeDay rather than reading the just-set hook value (stale within the same tick).
  // The reverse direction (back to AI) is deliberately NOT inline; it goes through Settings' consent card.
  function sortItMyself() {
    setSettings({ aiEnabled: false });
    track('ai.disabled', { from: 'welcome' });
    void makeDay(false);
  }

  function onPrimary() {
    switch (step) {
      case 'welcome':
        setStep('capture');
        break;
      case 'capture':
        void makeDay(aiEnabled);
        break;
      case 'reveal':
        setStep('safetynet');
        break;
      case 'safetynet':
        setStep('keep');
        break;
      case 'keep':
        setStep('premium');
        break;
      case 'premium':
        setStep('handoff');
        break;
      case 'handoff':
        void leave();
        break;
    }
  }

  // Every path now lands the whole dump on Today (allOnToday), so this filter is a
  // belt-and-braces guard rather than a bucket split, and there is no Later count.
  const todayTasks = revealed.filter((t) => !t.due);
  // On capture, hold back the primary until there's something to sort, so an empty tap can
  // never bail out of onboarding. Skip (top-right) stays the deliberate way to leave.
  const captureEmpty = step === 'capture' && dump.trim().length === 0;
  // The capture primary's label tracks the AI choice, so a user who opted out never sees a button that
  // still says "Sort for me". Derived from the same aiEnabled read that makeDay branches on, so they can't desync.
  const primaryLabel = step === 'capture' ? (aiEnabled ? t('actions.sortForMe') : t('welcome.primaryPutOnToday')) : PRIMARY[step];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.three, paddingBottom: insets.bottom + spacing.four }]}>
      <View style={styles.topBar}>
        {stepIndex > 0 ? (
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t('welcome.backA11y')} hitSlop={10}>
            <Text style={styles.back}>{t('welcome.back')}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {step !== 'handoff' ? (
          <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel={t('welcome.skipA11y')} hitSlop={10}>
            <Text style={styles.skip}>{t('common.skip')}</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'welcome' && (
          <View style={styles.block}>
            <View style={styles.banner}>
              <Image
                source={emptyArt}
                style={styles.bannerImg}
                resizeMode="cover"
                accessible
                accessibilityIgnoresInvertColors
                accessibilityLabel={t('today.emptyArtAlt')}
              />
            </View>
            <Text style={styles.brand}>DoubleDone</Text>
            <Text style={styles.tagline}>{t('welcome.tagline')}</Text>
            <Text style={styles.lead}>{t('welcome.lead1')}</Text>
            <Text style={styles.lead}>{t('welcome.lead2')}</Text>
            <Text style={styles.lead}>{t('welcome.lead3')}</Text>
          </View>
        )}

        {step === 'capture' && (
          <View style={styles.block}>
            <Text style={styles.h1}>{t('welcome.captureHeading')}</Text>
            <Text style={styles.lead}>
              {t('welcome.captureLead')}
            </Text>
            <TextInput
              value={dump}
              onChangeText={setDump}
              editable={!busy}
              placeholder={t('welcome.capturePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              multiline
              autoFocus
              accessibilityLabel={t('welcome.captureInputA11y')}
            />
            <Text style={styles.speak}>
              {aiEnabled ? t('welcome.capturePrivacyAi') : t('welcome.capturePrivacyNoAi')}
            </Text>
            <Text style={styles.speak}>{t('capture.speakHint')}</Text>
          </View>
        )}

        {step === 'reveal' && (
          <View style={styles.block}>
            <Text style={styles.h1}>{t('welcome.revealHeading')}</Text>
            <Text style={styles.lead}>
              {t('welcome.revealCount', { count: todayTasks.length })}
            </Text>
            <Text style={styles.lead}>
              {aiEnabled ? t('welcome.revealAllTodayNote') : t('welcome.revealNoAiNote')}
            </Text>
            <View style={styles.revealList}>
              {todayTasks.map((task) => (
                <View key={task.id} style={styles.revealRow}>
                  <View style={styles.revealCheck} />
                  <View style={styles.revealText}>
                    <Text style={styles.revealTitle}>{task.title}</Text>
                    {task.suggestBreakdown ? <Text style={styles.revealHint}>{t('welcome.revealBreakdownHint')}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.speak}>{t('welcome.revealCombineHint')}</Text>
          </View>
        )}

        {step === 'safetynet' && (
          <View style={styles.block}>
            <Text style={styles.h1}>{t('welcome.safetyNetHeading')}</Text>
            <Text style={styles.lead}>{t('welcome.safetyNetLead')}</Text>
            <View style={styles.netList}>
              {(aiEnabled ? SAFETY_NET : SAFETY_NET_NOAI).map((row) => (
                <View key={row.name} style={styles.netRow}>
                  <Text style={styles.netName}>{row.name}</Text>
                  <Text style={styles.netWhat}>{row.what}</Text>
                </View>
              ))}
            </View>
            <View style={styles.inscriptionRule} />
            <Text style={styles.inscription}>{t('welcome.safetyNetInscription')}</Text>
          </View>
        )}

        {step === 'keep' && (
          <View style={styles.block}>
            <View style={styles.banner}>
              <Image
                source={closeDayArt}
                style={styles.bannerImg}
                resizeMode="cover"
                accessible
                accessibilityIgnoresInvertColors
                accessibilityLabel={t('closeDay.artAlt')}
              />
            </View>
            <Text style={styles.h1}>{t('welcome.keepHeading')}</Text>
            <Text style={styles.lead}>
              {t('welcome.keepLead1')}
            </Text>
            <Text style={styles.lead}>{t('welcome.keepLead2')}</Text>
            <Text style={styles.lead}>{t('welcome.keepLead3')}</Text>
          </View>
        )}

        {step === 'premium' && (
          <View style={styles.block}>
            <Text style={styles.h1}>{t('welcome.premiumHeading')}</Text>
            <Text style={styles.lead}>
              {t('welcome.premiumLead')}
            </Text>
            <View style={styles.netList}>
              {(aiEnabled ? PREMIUM_FEATURES : PREMIUM_FEATURES_NOAI).map((row) => (
                <View key={row.name} style={styles.netRow}>
                  <Text style={styles.netName}>{row.name}</Text>
                  <Text style={styles.netWhat}>{row.what}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.fine}>{t('welcome.premiumFine')}</Text>
          </View>
        )}

        {step === 'handoff' && (
          <View style={styles.block}>
            <View style={styles.check}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <Text style={styles.h1}>{t('welcome.handoffHeading')}</Text>
            <Text style={styles.lead}>
              {t('welcome.handoffLead1')}
            </Text>
            <Text style={styles.lead}>{t('welcome.handoffLead2')}</Text>
            <Text style={styles.ethos}>{t('welcome.handoffEthos')}</Text>
            <Text style={styles.fine}>
              {aiEnabled ? t('welcome.handoffFineAi') : t('welcome.handoffFineNoAi')}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.dots}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.dot, i === stepIndex && styles.dotOn]} />
            ))}
          </View>
          {!captureEmpty && (
            <PrimaryButton label={primaryLabel} onPress={onPrimary} loading={busy} accessibilityLabel={primaryLabel} />
          )}
          {step === 'capture' && !captureEmpty && !busy ? (
            aiEnabled ? (
              <Pressable onPress={sortItMyself} accessibilityRole="button" accessibilityLabel={t('welcome.sortMyselfA11y')} hitSlop={8}>
                <Text style={styles.optOut}>{t('welcome.sortMyself')}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('welcome.changeInSettingsA11y')} hitSlop={8}>
                <Text style={styles.optOut}>{t('welcome.changeInSettings')}</Text>
              </Pressable>
            )
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg, paddingHorizontal: spacing.five },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 26 },
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    skip: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
    content: { flexGrow: 1, justifyContent: 'space-between', maxWidth: 480, width: '100%', alignSelf: 'center', paddingVertical: spacing.four },
    block: { gap: spacing.three },
    banner: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.two },
    bannerImg: { position: 'absolute', width: '100%', height: '100%' },
    brand: { ...t.type.display, color: t.colors.ink, letterSpacing: -0.5 },
    tagline: { color: t.colors.accent, fontSize: 20 * t.scale, fontFamily: fonts.sans, fontWeight: '400' },
    h1: { color: t.colors.ink, fontSize: 30 * t.scale, fontFamily: fonts.sans, fontWeight: '400', letterSpacing: -0.3, lineHeight: 36 * t.scale },
    lead: { color: t.colors.inkSoft, fontSize: 17 * t.scale, fontFamily: fonts.body, lineHeight: 26 * t.scale },
    speak: { color: t.colors.inkFaint, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.one },
    optOut: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center' },
    fine: { color: t.colors.inkSoft, fontSize: 17 * t.scale, fontFamily: fonts.body, lineHeight: 26 * t.scale, marginTop: spacing.two },
    input: {
      minHeight: 150,
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      padding: spacing.four,
      fontSize: 17 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
      textAlignVertical: 'top',
      lineHeight: 26 * t.scale,
      marginTop: spacing.two,
    },
    revealList: { gap: spacing.three, marginTop: spacing.two },
    revealRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.three,
      borderWidth: border.thin,
      borderColor: t.colors.repeat,
      borderRadius: radius.md,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.four,
      backgroundColor: t.colors.surface,
    },
    revealCheck: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: border.thick, borderColor: t.colors.inkFaint, marginTop: 1 },
    revealText: { flexShrink: 1 },
    revealTitle: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.body, lineHeight: 24 * t.scale },
    revealHint: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.half },
    laterLine: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.three },
    netList: { marginTop: spacing.two },
    netRow: {
      // Column, not a wrapping row: the name on its own line, the description beneath, so every item is
      // laid out identically (no "this one fits on the line, that one wraps" asymmetry). Used by the
      // safety-net list and the Premium-suite list.
      gap: spacing.one,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.line,
      paddingVertical: spacing.three,
    },
    netName: { color: t.colors.accent, fontSize: 17 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic' },
    netWhat: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, flexShrink: 1 },
    // The closing benediction: lifted out of the list with real breathing room and a small centred accent
    // rule, then the line itself centred and at the tagline's 20px (no longer the smallest thing on the page).
    inscriptionRule: { width: 32, height: 2, borderRadius: radius.pill, backgroundColor: t.colors.accent, opacity: 0.5, alignSelf: 'center', marginTop: spacing.six },
    inscription: {
      color: t.colors.accent,
      fontSize: 20 * t.scale,
      lineHeight: 28 * t.scale,
      fontFamily: fonts.sans,
      fontStyle: 'italic',
      textAlign: 'center',
      alignSelf: 'center',
      marginBottom: spacing.two,
    },
    check: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: t.colors.done, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.one },
    checkMark: { color: t.colors.onDone, fontSize: 24 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    ethos: { color: t.colors.accent, fontSize: 17 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic', marginTop: spacing.two },
    footer: { marginTop: spacing.five, gap: spacing.four },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.two },
    dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: t.scheme === 'dark' ? '#4A443C' : '#D8CFC4' },
    dotOn: { backgroundColor: t.colors.accent },
  });
