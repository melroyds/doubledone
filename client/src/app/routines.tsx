import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { toISODate } from '@/lib/day';
import { isStepDoneToday, type Routine, routineProgress, type RoutineWhen, toggleStep } from '@/lib/routines';
import { loadRoutines, saveRoutines } from '@/lib/storage';
import { parseDump } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

// A module-scope id counter keeps the handlers pure for the render linter (the same
// reason index.tsx's makeId lives at module scope).
let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `r-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

const WHENS: { value: RoutineWhen; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'anytime', label: 'Anytime' },
];

// Routines (Cluster D): a calm screen for morning / evening rituals, reached from Today.
// A routine is a few small steps you run together; ticking a step marks it done for TODAY
// only, and tomorrow it is fresh. Deliberately no streak, no count across days, and no
// "you missed it", the never-shame spine holds. The pure model lives in lib/routines.
export default function RoutinesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const today = useMemo(() => toISODate(new Date()), []);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [when, setWhen] = useState<RoutineWhen>('morning');
  const [stepsText, setStepsText] = useState('');
  const [undo, setUndo] = useState<Routine | null>(null); // the just-removed routine, for a brief undo
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadRoutines().then((r) => {
        if (active) setRoutines(r);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  function commit(next: Routine[]) {
    setRoutines(next);
    void saveRoutines(next);
  }

  function tick(routineId: string, stepId: string) {
    commit(routines.map((r) => (r.id === routineId ? toggleStep(r, stepId, today, Date.now()) : r)));
    track('routine.step.toggled');
  }

  function addRoutine() {
    const trimmed = name.trim();
    const steps = parseDump(stepsText).map((title) => ({ id: makeId(), title }));
    if (!trimmed || steps.length === 0) return;
    const now = Date.now();
    commit([...routines, { id: makeId(), name: trimmed, when, steps, done: {}, createdAt: now, updatedAt: now }]);
    track('routine.created', { steps: steps.length, when });
    cancelAdd();
  }

  function cancelAdd() {
    setAdding(false);
    setName('');
    setStepsText('');
    setWhen('morning');
  }

  // Remove is recoverable, not a confirmation gauntlet: a routine is a built object, so an
  // accidental tap offers a brief Undo rather than a heavy "are you sure?" (the friction the
  // spine forbids), matching the care a task gets.
  function removeRoutine(id: string) {
    const removed = routines.find((r) => r.id === id);
    if (!removed) return;
    commit(routines.filter((r) => r.id !== id));
    track('routine.removed');
    setUndo(removed);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function undoRemove() {
    if (!undo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    commit([...routines, undo]);
    track('routine.remove.undone');
    setUndo(null);
  }

  const groups = WHENS.map((w) => ({ ...w, items: routines.filter((r) => r.when === w.value) })).filter(
    (g) => g.items.length > 0,
  );

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

        <Text style={styles.title}>Routines</Text>
        <Text style={styles.subtitle}>Gentle rituals. No streaks, no pressure, just today.</Text>

        {undo && (
          <View style={styles.undoBar}>
            <Text style={styles.undoText}>Routine removed.</Text>
            <Pressable onPress={undoRemove} accessibilityRole="button" accessibilityLabel="Undo removing the routine" hitSlop={8}>
              <Text style={styles.undoAction}>Undo</Text>
            </Pressable>
          </View>
        )}

        {routines.length === 0 && !adding && (
          <Text style={styles.empty}>
            {'No routines yet. A routine is a few small steps you do together, like a morning start or an evening wind-down.'}
          </Text>
        )}

        {groups.map((g) => (
          <View key={g.value} style={styles.group}>
            <Text style={styles.groupHeading}>{g.label}</Text>
            {g.items.map((r) => {
              const p = routineProgress(r, today);
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardName}>{r.name}</Text>
                    <Text style={styles.cardProgress}>
                      {p.done} of {p.total}
                    </Text>
                  </View>
                  {r.steps.map((s) => {
                    const done = isStepDoneToday(r, s.id, today);
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => tick(r.id, s.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: done }}
                        accessibilityLabel={s.title}
                        style={styles.step}
                        hitSlop={4}
                      >
                        <View style={[styles.stepBox, done && styles.stepBoxDone]}>{done && <Text style={styles.stepTick}>✓</Text>}</View>
                        <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>{s.title}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => removeRoutine(r.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${r.name}`}
                    hitSlop={6}
                  >
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}

        {adding ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Name, like Morning"
              placeholderTextColor={theme.colors.inkFaint}
              value={name}
              onChangeText={setName}
              accessibilityLabel="Routine name"
            />
            <View style={styles.whenPills}>
              {WHENS.map((w) => {
                const active = w.value === when;
                return (
                  <Pressable
                    key={w.value}
                    onPress={() => setWhen(w.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    hitSlop={4}
                  >
                    <Text style={[styles.whenPill, active && styles.whenPillActive]}>{w.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={[styles.input, styles.stepsInput]}
              placeholder={'Steps, one per line'}
              placeholderTextColor={theme.colors.inkFaint}
              value={stepsText}
              onChangeText={setStepsText}
              multiline
              accessibilityLabel="Routine steps, one per line"
            />
            <View style={styles.formActions}>
              <Pressable onPress={cancelAdd} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addRoutine} accessibilityRole="button" style={styles.addBtn} hitSlop={6}>
                <Text style={styles.addBtnText}>Add routine</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={styles.newBtn} hitSlop={6}>
            <Text style={styles.newBtnText}>+ New routine</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.five, paddingBottom: spacing.seven, gap: spacing.three },
    back: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, marginBottom: spacing.two },
    title: { color: t.colors.ink, fontSize: 30 * t.scale, fontFamily: fonts.sans, marginTop: spacing.two },
    subtitle: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, marginBottom: spacing.three },
    undoBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: t.colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.line,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.three,
    },
    undoText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    undoAction: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold },
    empty: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale, marginTop: spacing.four },
    group: { gap: spacing.two, marginTop: spacing.two },
    groupHeading: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, textTransform: 'uppercase', letterSpacing: 1 },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: radius.lg,
      padding: spacing.four,
      gap: spacing.one,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.one },
    cardName: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.sans, flex: 1 },
    cardProgress: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, marginLeft: spacing.three },
    step: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, paddingVertical: spacing.two },
    stepBox: {
      width: 22,
      height: 22,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBoxDone: { backgroundColor: t.colors.done, borderColor: t.colors.done },
    stepTick: { color: t.colors.surface, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold },
    stepTitle: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body, flex: 1 },
    stepTitleDone: { color: t.colors.inkSoft, textDecorationLine: 'line-through' },
    remove: { color: t.colors.danger, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    form: {
      backgroundColor: t.colors.surface,
      borderRadius: radius.lg,
      padding: spacing.four,
      gap: spacing.three,
      borderWidth: 1,
      borderColor: t.colors.line,
      marginTop: spacing.two,
    },
    input: {
      color: t.colors.ink,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingHorizontal: spacing.three,
      paddingVertical: spacing.three,
      backgroundColor: t.colors.bg,
    },
    stepsInput: { minHeight: 90, textAlignVertical: 'top' },
    whenPills: { flexDirection: 'row', gap: spacing.two },
    whenPill: {
      color: t.colors.inkSoft,
      fontSize: 14 * t.scale,
      fontFamily: fonts.body,
      paddingHorizontal: spacing.three,
      paddingVertical: spacing.two,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.colors.line,
      overflow: 'hidden',
    },
    whenPillActive: { color: t.colors.surface, backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    formActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.four, marginTop: spacing.one },
    cancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
    addBtn: { backgroundColor: t.colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.five, paddingVertical: spacing.three },
    addBtnText: { color: t.colors.surface, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold },
    newBtn: {
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: radius.pill,
      paddingVertical: spacing.three,
      alignItems: 'center',
      marginTop: spacing.four,
    },
    newBtnText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.body },
  });
