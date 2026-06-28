import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, radius, spacing, type Theme } from '@/constants/theme';
import { triage } from '@/lib/ai';
import { loadTasks, saveOnboarded, saveTasks } from '@/lib/storage';
import { type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';
import { triageToTasks } from '@/lib/triage';

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
  welcome: 'Begin',
  capture: 'Sort for me',
  reveal: 'Looks good, next',
  safetynet: 'Got it',
  keep: 'Continue',
  premium: 'Continue',
  handoff: 'Open Today',
};

const EXAMPLE = 'call the dentist\nreply to Dana\nsort out the garage\nbuy Mum a card\ntake meds';
const TRIAGE_TIMEOUT_MS = 8000;

// The safety-net pass: the three "you're not alone with a hard task" tools, introduced once
// here and discovered in context thereafter.
const SAFETY_NET: { name: string; what: string }[] = [
  { name: 'Break it down', what: 'into small, time-boxed steps.' },
  { name: 'Make it tiny', what: 'a two-minute version, just to begin.' },
  { name: 'Lighten today', what: 'a too-full day, eased by moving a few tasks to later days.' },
];

// The Premium suite, introduced once at the end of onboarding. The calm loop is free; this is the
// "when you want more" close. Lead with the scrapbook (the emotional payoff), and never a hard sell:
// it plants the idea and points to Settings, rather than interrupting first use with a paywall.
const PREMIUM_FEATURES: { name: string; what: string }[] = [
  { name: 'A weekly scrapbook', what: 'an AI keepsake of everything you finished that week.' },
  { name: 'Chart a course', what: 'turn a goal into calm, ordered steps.' },
  { name: 'Plan my day', what: "a gentle order for today's tasks, in one tap." },
  { name: 'Your patterns', what: 'quiet stats and a warm weekly reflection.' },
  { name: 'Scan a list', what: 'a photo of a written list, straight into tasks.' },
];

// With AI off, the premium pitch drops the AI features (scrapbook, Chart, Plan my day, patterns, Scan) and shows
// only the non-AI premium value, so a user who just opted out is never sold what they have turned off.
const PREMIUM_FEATURES_NOAI: { name: string; what: string }[] = [
  { name: 'Your colour', what: 'seven calm palettes for the whole app, yours to choose.' },
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
        tasks = triageToTasks(lines, items, today, now, makeId);
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

  const todayTasks = revealed.filter((t) => !t.due);
  const laterCount = revealed.length - todayTasks.length;
  // On capture, hold back the primary until there's something to sort, so an empty tap can
  // never bail out of onboarding. Skip (top-right) stays the deliberate way to leave.
  const captureEmpty = step === 'capture' && dump.trim().length === 0;
  // The capture primary's label tracks the AI choice, so a user who opted out never sees a button that
  // still says "Sort for me". Derived from the same aiEnabled read that makeDay branches on, so they can't desync.
  const primaryLabel = step === 'capture' ? (aiEnabled ? 'Sort for me' : 'Put them on today') : PRIMARY[step];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.three, paddingBottom: insets.bottom + spacing.four }]}>
      <View style={styles.topBar}>
        {stepIndex > 0 ? (
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back one screen" hitSlop={10}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {step !== 'handoff' ? (
          <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip the introduction" hitSlop={10}>
            <Text style={styles.skip}>Skip</Text>
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
                accessibilityLabel="A warm coffee beside an open notebook in morning light"
              />
            </View>
            <Text style={styles.brand}>DoubleDone</Text>
            <Text style={styles.tagline}>A calmer kind of to-do.</Text>
            <Text style={styles.lead}>It shows you only what today needs, and quietly keeps everything you finish.</Text>
            <Text style={styles.lead}>Nothing is ever overdue. It just waits.</Text>
            <Text style={styles.lead}>Made for ADHD, autism, OCD, and anyone whose list has ever felt like too much. Nothing here will ever shame you for a task just existing.</Text>
          </View>
        )}

        {step === 'capture' && (
          <View style={styles.block}>
            <Text style={styles.h1}>{"What's on your mind?"}</Text>
            <Text style={styles.lead}>
              {"Type whatever you're carrying. One thing per line. Don't worry about the order, that's our job."}
            </Text>
            <TextInput
              value={dump}
              onChangeText={setDump}
              editable={!busy}
              placeholder={EXAMPLE}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              multiline
              autoFocus
              accessibilityLabel="Your brain-dump, one thing per line"
            />
            <Text style={styles.speak}>
              {aiEnabled
                ? "Sort for me sends these lines to Claude to order your day. I'll sort it myself keeps everything on this device."
                : 'On this device only. Nothing here is sent anywhere.'}
            </Text>
            <Text style={styles.speak}>Prefer to talk? On web, tap Speak and say them out loud.</Text>
          </View>
        )}

        {step === 'reveal' && (
          <View style={styles.block}>
            <Text style={styles.h1}>Here&apos;s today, sized to be doable.</Text>
            <Text style={styles.lead}>
              {todayTasks.length} for today.{laterCount > 0 ? ' The rest is waiting calmly for later.' : ''}
            </Text>
            {!aiEnabled ? (
              <Text style={styles.lead}>Sorted on your device, all on today for now. Open any task later to break it down yourself.</Text>
            ) : null}
            <View style={styles.revealList}>
              {todayTasks.map((task) => (
                <View key={task.id} style={styles.revealRow}>
                  <View style={styles.revealCheck} />
                  <View style={styles.revealText}>
                    <Text style={styles.revealTitle}>{task.title}</Text>
                    {task.suggestBreakdown ? <Text style={styles.revealHint}>Looks big, break it down?</Text> : null}
                  </View>
                </View>
              ))}
            </View>
            {laterCount > 0 ? <Text style={styles.laterLine}>Later · {laterCount} waiting</Text> : null}
            <Text style={styles.speak}>A few tasks that go together? Hold one, pick the rest, then combine them.</Text>
          </View>
        )}

        {step === 'safetynet' && (
          <View style={styles.block}>
            <Text style={styles.h1}>When something feels too big, you&apos;re not alone with it.</Text>
            <Text style={styles.lead}>Hand a dreaded task to DoubleDone, and it helps you start:</Text>
            <View style={styles.netList}>
              {SAFETY_NET.filter((row) => aiEnabled || row.name === 'Break it down').map((row) => (
                <View key={row.name} style={styles.netRow}>
                  <Text style={styles.netName}>{row.name}</Text>
                  <Text style={styles.netWhat}>{row.what}</Text>
                </View>
              ))}
            </View>
            <View style={styles.inscriptionRule} />
            <Text style={styles.inscription}>you&apos;re allowed to go slowly</Text>
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
                accessibilityLabel="A calm dusk sky settling over a closed notebook"
              />
            </View>
            <Text style={styles.h1}>What you finish, you keep.</Text>
            <Text style={styles.lead}>
              Everything you complete, even a task you dreaded for weeks, is saved in your Lookback. Your brain can&apos;t
              tell you that you did nothing.
            </Text>
            <Text style={styles.lead}>Each evening, close the day. It honours what you did, never what you didn&apos;t.</Text>
            <Text style={styles.lead}>Did something that was never on your list? Log it too. It still counts.</Text>
          </View>
        )}

        {step === 'premium' && (
          <View style={styles.block}>
            <Text style={styles.h1}>And when you want a little more.</Text>
            <Text style={styles.lead}>
              Everything you&apos;ve just seen is free, forever. Premium adds a few extras, never anything you need.
            </Text>
            <View style={styles.netList}>
              {(aiEnabled ? PREMIUM_FEATURES : PREMIUM_FEATURES_NOAI).map((row) => (
                <View key={row.name} style={styles.netRow}>
                  <Text style={styles.netName}>{row.name}</Text>
                  <Text style={styles.netWhat}>{row.what}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.fine}>A$5 a month, cancel anytime. It&apos;s in Settings whenever you&apos;re curious. No ads, ever.</Text>
          </View>
        )}

        {step === 'handoff' && (
          <View style={styles.block}>
            <View style={styles.check}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <Text style={styles.h1}>{"That's it. No setup."}</Text>
            <Text style={styles.lead}>
              {"It's out of your head now, and it's all here. Tomorrow it opens ready, without you arranging a thing."}
            </Text>
            <Text style={styles.lead}>Your Lookback, routines and repeating tasks all live in the Menu, top right.</Text>
            <Text style={styles.ethos}>today is finite and achievable</Text>
            <Text style={styles.fine}>
              {aiEnabled
                ? 'On your device by default. The AI features send the text you choose to Claude to do their work, nothing else. Want it on your phone and your laptop too? Sign in to sync, always optional.'
                : 'Private by default, nothing leaves your device. Want it on your phone and your laptop too? Sign in to sync, always optional.'}
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
              <Pressable onPress={sortItMyself} accessibilityRole="button" accessibilityLabel="Sort it myself, keep everything on this device" hitSlop={8}>
                <Text style={styles.optOut}>I&apos;ll sort it myself</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Change AI in Settings" hitSlop={8}>
                <Text style={styles.optOut}>Change in Settings</Text>
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
