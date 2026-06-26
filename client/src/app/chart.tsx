import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PremiumButton } from '@/components/PremiumButton';
import { fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { chart, type CourseStep } from '@/lib/ai';
import { toISODate } from '@/lib/day';
import { usePremium } from '@/lib/premium-provider';
import { spreadDueDates } from '@/lib/spread';
import { loadTasks, saveTasks } from '@/lib/storage';
import { type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

// Module-scope id + clock, so the handlers stay pure for the render linter (the same reason index.tsx keeps
// makeId / nowMs at module scope).
let addCounter = 0;
function makeId(): string {
  addCounter += 1;
  return `c-${Date.now().toString(36)}-${addCounter.toString(36)}`;
}
function nowMs(): number {
  return Date.now();
}

type Proposed = CourseStep & { checked: boolean };

// Chart a course (PREMIUM): name a goal, get a calm ordered list of the next concrete steps toward it, then
// accept the ones you want. Accepted steps become FLAT one-off tasks in the single Today/backlog (the first
// on Today, the rest spread gently forward), never a project. The premium gate sits at the moment of asking
// for a plan (abundance), never on opening the screen, and nothing is added until the user accepts.
export default function ChartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { premium, loading: premiumLoading } = usePremium();
  const today = useMemo(() => new Date(), []);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState('');
  const [steps, setSteps] = useState<Proposed[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(null);
  // "By when?" relative chips. A goal is a timeframe ("within 2 months"), so chips beat a calendar here: the
  // chosen date paces the AI's steps AND spreads the accepted tasks from today to it (see addTasks).
  const dateChips = useMemo(
    () => [
      { label: 'No deadline', iso: null as string | null },
      { label: 'In 2 weeks', iso: toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)) },
      { label: 'In a month', iso: toISODate(new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())) },
      { label: 'In 2 months', iso: toISODate(new Date(today.getFullYear(), today.getMonth() + 2, today.getDate())) },
      { label: 'In 3 months', iso: toISODate(new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())) },
    ],
    [today],
  );

  async function suggest() {
    const g = goal.trim();
    if (busy || !g || premiumLoading) return;
    // The paywall sits HERE, at the moment of asking for a plan (abundance), never on opening the screen.
    if (!premium) {
      track('premium.gate_hit', { reason: 'chart' });
      router.push('/premium');
      return;
    }
    setBusy(true);
    setError(null);
    track('chart.requested');
    try {
      const course = await chart(g, dueDate ? { dueDate } : undefined);
      if (course.steps.length === 0) {
        setError("I couldn't map that out just now. Try rephrasing the goal?");
        setSteps([]);
        setHeading('');
      } else {
        setHeading(course.heading);
        setSteps(course.steps.map((s) => ({ ...s, checked: true })));
      }
    } finally {
      setBusy(false);
    }
  }

  function toggle(i: number) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, checked: !s.checked } : s)));
  }

  // Propose-then-accept: nothing is minted until here, and only the ticked steps. They become plain one-off
  // tasks (no parentId, no project field), spread gently so the first lands on Today and Today stays small.
  async function addTasks() {
    const selected = steps.filter((s) => s.checked);
    if (selected.length === 0) return;
    const tasks = await loadTasks();
    const now = nowMs();
    const dates = spreadDueDates(selected.length, today, dueDate, 'gradual');
    const minted: Task[] = selected.map((s, i) => ({
      id: makeId(),
      title: `${s.title} (${s.minutes} min)`,
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      complexity: s.minutes,
      ...(dates[i] ? { due: dates[i] } : {}),
    }));
    await saveTasks([...tasks, ...minted]);
    track('chart.added', { added: minted.length, offered: steps.length });
    router.replace('/');
  }

  const selectedCount = steps.filter((s) => s.checked).length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.three }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Chart a course</Text>
        <Text style={styles.intro}>
          Name something you are working toward. You will get a calm list of the next few steps, yours to take or leave.
        </Text>

        <TextInput
          style={styles.input}
          value={goal}
          onChangeText={setGoal}
          placeholder="e.g. get fit for a 10k, learn three easy meals"
          placeholderTextColor={theme.colors.inkFaint}
          multiline
          accessibilityLabel="Your goal"
          editable={!busy}
        />

        {steps.length === 0 && (
          <View style={styles.byWhen}>
            <Text style={styles.byWhenLabel}>By when?</Text>
            <View style={styles.chips}>
              {dateChips.map((c) => {
                const on = dueDate === c.iso;
                return (
                  <Pressable
                    key={c.label}
                    onPress={() => setDueDate(c.iso)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={c.label}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {steps.length === 0 && (
          <PremiumButton
            label={busy ? 'Charting…' : 'Suggest steps'}
            onPress={suggest}
            disabled={busy || goal.trim().length === 0}
            accessibilityLabel="Suggest steps toward this goal"
            style={styles.suggestBtn}
          />
        )}

        {busy && steps.length === 0 && <ActivityIndicator color={theme.colors.accent} style={styles.spinner} />}
        {error && <Text style={styles.error}>{error}</Text>}

        {steps.length > 0 && (
          <View style={styles.result}>
            {heading.length > 0 && <Text style={styles.heading}>{heading}</Text>}
            {steps.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => toggle(i)}
                style={styles.stepRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: s.checked }}
                accessibilityLabel={s.title}
              >
                <View style={[styles.check, s.checked && styles.checkOn]}>{s.checked && <Text style={styles.checkMark}>✓</Text>}</View>
                <Text style={[styles.stepTitle, !s.checked && styles.stepTitleOff]}>{s.title}</Text>
                <Text style={styles.stepMin}>{s.minutes} min</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={addTasks}
              disabled={selectedCount === 0}
              accessibilityRole="button"
              accessibilityLabel={`Add ${selectedCount} tasks to Today`}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed, selectedCount === 0 && styles.ctaDim]}
            >
              <Text style={styles.ctaText}>{selectedCount === 0 ? 'Pick a step to add' : `Add ${selectedCount} ${selectedCount === 1 ? 'task' : 'tasks'}`}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSteps([]);
                setHeading('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Start over with a different goal"
              hitSlop={8}
              style={styles.startOver}
            >
              <Text style={styles.startOverText}>Not these, start over</Text>
            </Pressable>
            <Text style={styles.note}>
              The first step lands on Today, the rest spread gently {dueDate ? 'toward your deadline' : 'over the next days'}. They become ordinary tasks.
            </Text>
          </View>
        )}

        <Text style={styles.egress}>Your goal is sent to an AI to suggest steps, then discarded. Nothing is added until you choose.</Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.five, paddingBottom: spacing.seven, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    title: { color: t.colors.ink, fontSize: 34 * t.scale, fontWeight: '400', fontFamily: fonts.sans, marginTop: spacing.three },
    intro: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, lineHeight: 24 * t.scale, marginTop: spacing.two },
    input: {
      marginTop: spacing.four,
      minHeight: 88,
      backgroundColor: t.colors.surface,
      borderRadius: radius.md,
      padding: spacing.four,
      color: t.colors.ink,
      fontSize: 17 * t.scale,
      fontFamily: fonts.body,
      lineHeight: 24 * t.scale,
      textAlignVertical: 'top',
    },
    cta: { backgroundColor: t.colors.accent, borderRadius: radius.lg, paddingVertical: spacing.four, alignItems: 'center', marginTop: spacing.four },
    suggestBtn: { marginTop: spacing.four },
    byWhen: { marginTop: spacing.four, gap: spacing.two },
    byWhenLabel: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
    chip: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.line, paddingHorizontal: spacing.four, paddingVertical: spacing.two },
    chipOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    chipText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    chipTextOn: { color: t.colors.accent, fontFamily: fonts.bodyBold, fontWeight: '600' },
    ctaDim: { opacity: 0.5 },
    ctaText: { color: t.colors.onAccent, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    pressed: { opacity: 0.8 },
    spinner: { marginTop: spacing.five },
    error: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, marginTop: spacing.four, lineHeight: 22 * t.scale },
    result: { marginTop: spacing.five, gap: spacing.two },
    heading: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic', lineHeight: 26 * t.scale, marginBottom: spacing.two },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, paddingVertical: spacing.three },
    check: {
      width: 24,
      height: 24,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    checkMark: { color: t.colors.onAccent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    stepTitle: { flex: 1, color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale },
    stepTitleOff: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
    stepMin: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body },
    startOver: { alignSelf: 'center', marginTop: spacing.two },
    startOverText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    note: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 19 * t.scale, marginTop: spacing.two },
    egress: { color: t.colors.inkFaint, fontSize: 12 * t.scale, fontFamily: fonts.body, lineHeight: 18 * t.scale, marginTop: spacing.six, textAlign: 'center' },
  });
