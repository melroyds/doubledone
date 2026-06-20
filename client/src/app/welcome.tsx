import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { triage } from '@/lib/ai';
import { loadTasks, saveOnboarded, saveTasks } from '@/lib/storage';
import { type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';
import { triageToTasks } from '@/lib/triage';

// Module scope so the id generator stays pure for the render linter (same reason as
// the Today screen's makeId).
let seq = 0;
function makeId(): string {
  seq += 1;
  return `t-${Date.now().toString(36)}-${seq.toString(36)}`;
}

type Step = 'welcome' | 'capture' | 'reveal' | 'handoff';

const EXAMPLE = 'call the dentist\nreply to Dana\nsort out the garage\nbuy Mum a card\ntake meds';

// The one-time welcome. Learn-by-doing rather than a tutorial wall: a calm pitch,
// then the user's own first brain-dump runs through the real triage, so the very
// first thing they see is the product working, a doable Today with the rest waiting
// calmly. Skippable at every step. On finish or skip it sets the onboarded flag and
// hands off to Today; the Today screen redirects here once, when that flag is unset.
export default function WelcomeScreen() {
  const router = useRouter();
  // Replayable from Settings (?replay=1). A replay must never overwrite an existing
  // list, so its capture merges in rather than replacing, and it leaves the
  // onboarded flag alone.
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const isReplay = replay === '1';
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [step, setStep] = useState<Step>('welcome');
  const [dump, setDump] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Task[]>([]);

  async function skip() {
    track('welcome.skipped', { step });
    await saveOnboarded(true);
    router.replace('/');
  }

  // "Make my day": run the captured lines through the real triage (the same one
  // "Sort for me" uses), then show the result. If the AI is unreachable, everything
  // lands on Today, nothing is ever lost to a network blip.
  async function makeDay() {
    if (busy) return;
    const lines = dump
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      void skip();
      return;
    }
    setBusy(true);
    const today = new Date();
    const now = Date.now();
    let tasks: Task[];
    try {
      const items = await triage(lines);
      tasks = triageToTasks(lines, items, today, now, makeId);
    } catch {
      tasks = triageToTasks(lines, [], today, now, makeId);
    }
    setRevealed(tasks);
    setBusy(false);
    setStep('reveal');
    track('welcome.triaged', { total: lines.length });
  }

  async function confirm() {
    if (isReplay) {
      const existing = await loadTasks();
      await saveTasks([...existing, ...revealed]);
    } else {
      await saveTasks(revealed);
      await saveOnboarded(true);
    }
    track('welcome.completed', { total: revealed.length, replay: isReplay });
    setStep('handoff');
  }

  const todayTasks = revealed.filter((t) => !t.due);
  const laterCount = revealed.length - todayTasks.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.six, paddingBottom: insets.bottom + spacing.five }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'welcome' && (
          <View style={styles.block}>
            <Text style={styles.brand}>DoubleDone</Text>
            <Text style={styles.tagline}>A calmer kind of to-do.</Text>
            <Text style={styles.lead}>It shows you only what today needs, and quietly remembers everything you finish.</Text>
            <Text style={styles.lead}>No streaks, no nagging, no guilt. Nothing is ever overdue. It just waits.</Text>
            <Text style={styles.fine}>Works straight away. No account needed.</Text>
            <Pressable
              onPress={() => setStep('capture')}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Begin"
            >
              <Text style={styles.primaryText}>Begin</Text>
            </Pressable>
            <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip for now" hitSlop={8}>
              <Text style={styles.skip}>Skip for now</Text>
            </Pressable>
          </View>
        )}

        {step === 'capture' && (
          <View style={styles.block}>
            <Text style={styles.kicker}>Step 1 of 2</Text>
            <Text style={styles.h1}>{"What's on your mind?"}</Text>
            <Text style={styles.lead}>{"Type a few things you'd like out of your head. One per line. Don't worry about order, that's our job."}</Text>
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
            <Pressable
              onPress={makeDay}
              disabled={busy}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed, busy && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Make my day"
            >
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryText}>Make my day</Text>}
            </Pressable>
            <Pressable onPress={skip} disabled={busy} accessibilityRole="button" accessibilityLabel="I'll add things later" hitSlop={8}>
              <Text style={styles.skip}>{"I'll add things later"}</Text>
            </Pressable>
          </View>
        )}

        {step === 'reveal' && (
          <View style={styles.block}>
            <Text style={styles.kicker}>Step 2 of 2</Text>
            <Text style={styles.h1}>Here&apos;s today, sized to be doable.</Text>
            <Text style={styles.lead}>
              {todayTasks.length} for today.{laterCount > 0 ? ' The rest is waiting calmly for later.' : ''}
            </Text>
            <View style={styles.revealList}>
              {todayTasks.map((t) => (
                <View key={t.id} style={styles.revealRow}>
                  <View style={styles.revealDot} />
                  <View style={styles.revealText}>
                    <Text style={styles.revealTitle}>{t.title}</Text>
                    {t.suggestBreakdown ? <Text style={styles.revealHint}>Looks big, break it down?</Text> : null}
                  </View>
                </View>
              ))}
            </View>
            {laterCount > 0 ? <Text style={styles.laterLine}>Later · {laterCount} waiting</Text> : null}
            <Pressable
              onPress={confirm}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="This looks right"
            >
              <Text style={styles.primaryText}>This looks right</Text>
            </Pressable>
          </View>
        )}

        {step === 'handoff' && (
          <View style={styles.block}>
            <Text style={styles.h1}>{"That's it. No setup."}</Text>
            <Text style={styles.lead}>
              {"It's already out of your head and onto today. Tomorrow it opens here, ready, without you arranging a thing."}
            </Text>
            <Pressable
              onPress={() => router.replace('/')}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Open Today"
            >
              <Text style={styles.primaryText}>Open Today</Text>
            </Pressable>
            <Text style={styles.ethos}>today is finite and achievable</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg, paddingHorizontal: spacing.five },
    content: { flexGrow: 1, justifyContent: 'center', maxWidth: 480, width: '100%', alignSelf: 'center' },
    block: { gap: spacing.three },
    brand: { color: t.colors.ink, fontSize: 40 * t.scale, fontFamily: fonts.sans, fontWeight: '400', letterSpacing: -0.5 },
    tagline: { color: t.colors.accent, fontSize: 20 * t.scale, fontFamily: fonts.sans, fontWeight: '400' },
    lead: { color: t.colors.inkSoft, fontSize: 17 * t.scale, fontFamily: fonts.body, lineHeight: 26 },
    fine: { color: t.colors.inkFaint, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.one },
    kicker: {
      color: t.colors.inkFaint,
      fontSize: 13 * t.scale,
      fontFamily: fonts.bodyBold,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    h1: { color: t.colors.ink, fontSize: 30 * t.scale, fontFamily: fonts.sans, fontWeight: '400', letterSpacing: -0.3 },
    input: {
      minHeight: 140,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      padding: spacing.four,
      fontSize: 17 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
      textAlignVertical: 'top',
      marginTop: spacing.two,
      lineHeight: 26,
    },
    primary: { backgroundColor: t.colors.accent, borderRadius: radius.md, paddingVertical: spacing.four, alignItems: 'center', marginTop: spacing.three },
    primaryText: { color: '#FFFFFF', fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    disabled: { opacity: 0.6 },
    skip: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.one },
    revealList: { gap: spacing.three, marginTop: spacing.two },
    revealRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.three },
    revealDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: t.colors.accent, marginTop: 9 },
    revealText: { flexShrink: 1 },
    revealTitle: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.body, lineHeight: 25 },
    revealHint: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: 2 },
    laterLine: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.three },
    ethos: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.four, fontStyle: 'italic' },
    pressed: { opacity: 0.85 },
  });
