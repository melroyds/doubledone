import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { PrimaryButton } from '@/components/PrimaryButton';
import { border, cardShadow, fonts, layout, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { toISODate } from '@/lib/day';
import { t } from '@/lib/locale';
import { cancelRoutineNudge, scheduleRoutineNudge } from '@/lib/reminders';
import { clampHour, formatReminderHour, reminderReasonLine } from '@/lib/reminders-types';
import { applyRoutineEdit, isStepDoneToday, type Routine, routineProgress, type RoutineWhen, toggleStep } from '@/lib/routines';
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

// A sensible first hour when the nudge turns on, matched to the routine's slot (the
// stepper adjusts from there). Module scope and pure, like makeId.
function defaultNudgeHour(when: RoutineWhen): number {
  if (when === 'morning') return 8;
  if (when === 'evening') return 20;
  return 9;
}

// Labels resolve through t() at render time (not module load), so a locale change is honoured.
const WHENS: { value: RoutineWhen; labelKey: string }[] = [
  { value: 'morning', labelKey: 'routines.whenMorning' },
  { value: 'evening', labelKey: 'routines.whenEvening' },
  { value: 'anytime', labelKey: 'routines.whenAnytime' },
];

// Routines (Cluster D): a calm screen for morning / evening rituals, reached from Today.
// A routine is a few small steps you run together; ticking a step marks it done for TODAY
// only, and tomorrow it is fresh. Deliberately no streak, no count across days, and no
// "you missed it", the never-shame spine holds. The pure model lives in lib/routines.
export default function RoutinesScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const today = useMemo(() => toISODate(new Date()), []);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // the routine the form is editing, null = creating
  const [name, setName] = useState('');
  const [when, setWhen] = useState<RoutineWhen>('morning');
  const [stepsText, setStepsText] = useState('');
  const [nudgeOn, setNudgeOn] = useState(false); // the once-a-day nudge for the routine in the form; default Off
  const [nudgeHour, setNudgeHour] = useState(9);
  const [nudgeNote, setNudgeNote] = useState<string | null>(null); // the calm line when the nudge couldn't be set
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

  // Save the form, creating or (when editingId is set) editing. The nudge reconciles FIRST,
  // so the stored hour is honest: if scheduling didn't work the routine saves with no nudge
  // and one calm line says why (never a silent bounce-back). Edits go through
  // applyRoutineEdit so a surviving step keeps its id, and with it today's tick.
  async function saveRoutine() {
    const trimmed = name.trim();
    const stepTitles = parseDump(stepsText);
    if (!trimmed || stepTitles.length === 0) return;
    const existing = editingId ? routines.find((r) => r.id === editingId) : undefined;
    if (editingId && !existing) return; // removed while the form was open; nothing to save onto
    const now = Date.now();
    const id = existing ? existing.id : makeId();
    const wanted = nudgeOn ? nudgeHour : null;
    let hour: number | null = null;
    let note: string | null = null;
    if (wanted != null) {
      const result = await scheduleRoutineNudge(id, trimmed, wanted);
      if (result.ok) {
        hour = wanted;
        track('routine.nudge.set', { hour: wanted });
      } else {
        note = reminderReasonLine(result.reason);
      }
    } else {
      void cancelRoutineNudge(id);
      if (existing?.nudgeHour != null) track('routine.nudge.cleared');
    }
    if (existing) {
      const edited = applyRoutineEdit(existing, { name: trimmed, when, stepTitles, nudgeHour: hour, now }, makeId);
      commit(routines.map((r) => (r.id === existing.id ? edited : r)));
      track('routine.edited');
    } else {
      const steps = stepTitles.map((title) => ({ id: makeId(), title }));
      commit([...routines, { id, name: trimmed, when, steps, done: {}, nudgeHour: hour, createdAt: now, updatedAt: now }]);
      track('routine.created', { steps: steps.length, when });
    }
    setNudgeNote(note);
    cancelAdd();
  }

  // Open the add form prefilled with an existing routine (name, slot, steps one per line,
  // nudge hour), so "start with 3 steps and build on it" is a tap, not a rebuild.
  function startEdit(r: Routine) {
    setEditingId(r.id);
    setName(r.name);
    setWhen(r.when);
    setStepsText(r.steps.map((s) => s.title).join('\n'));
    setNudgeOn(r.nudgeHour != null);
    setNudgeHour(r.nudgeHour ?? defaultNudgeHour(r.when));
    setNudgeNote(null);
    setAdding(true);
  }

  // A one-tap starter for the blank-slate problem: prefill a sensible Morning routine and open the form,
  // editable before save. One example beats a paragraph for a task-initiation audience.
  function startMorningExample() {
    setName(t('routines.whenMorning'));
    setWhen('morning');
    setStepsText(
      [
        t('routines.starterStepWater'),
        t('routines.starterStepMedication'),
        t('routines.starterStepMovement'),
        t('routines.starterStepOneThing'),
      ].join('\n'),
    );
    setAdding(true);
    track('routine.starter_opened');
  }

  function cancelAdd() {
    setAdding(false);
    setEditingId(null);
    setName('');
    setStepsText('');
    setWhen('morning');
    setNudgeOn(false);
  }

  // Remove is recoverable, not a confirmation gauntlet: a routine is a built object, so an
  // accidental tap offers a brief Undo rather than a heavy "are you sure?" (the friction the
  // spine forbids), matching the care a task gets.
  function removeRoutine(id: string) {
    const removed = routines.find((r) => r.id === id);
    if (!removed) return;
    commit(routines.filter((r) => r.id !== id));
    void cancelRoutineNudge(id); // no routine, no nudge
    track('routine.removed');
    setUndo(removed);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function undoRemove() {
    if (!undo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    commit([...routines, undo]);
    if (undo.nudgeHour != null) void scheduleRoutineNudge(undo.id, undo.name, undo.nudgeHour); // best effort: the routine is back, so is its nudge
    track('routine.remove.undone');
    setUndo(null);
  }

  const groups = WHENS.map((w) => ({ ...w, items: routines.filter((r) => r.when === w.value) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.six }]}>
        <BackLink label={t('common.today')} />

        <Text style={styles.title}>{t('routines.title')}</Text>
        <Text style={styles.subtitle}>{t('routines.subtitle')}</Text>

        {undo && (
          <View style={styles.undoBar}>
            <Text style={styles.undoText}>{t('routines.removed')}</Text>
            <Pressable onPress={undoRemove} accessibilityRole="button" accessibilityLabel={t('routines.undoRemoveA11y')} hitSlop={8}>
              <Text style={styles.undoAction}>{t('common.undo')}</Text>
            </Pressable>
          </View>
        )}

        {routines.length === 0 && !adding && (
          <View>
            <Text style={styles.empty}>{t('routines.empty')}</Text>
            <Pressable
              onPress={startMorningExample}
              accessibilityRole="button"
              accessibilityLabel={t('routines.starterA11y')}
              style={styles.starterBtn}
              hitSlop={6}
            >
              <Text style={styles.starterBtnText}>{t('routines.starter')}</Text>
            </Pressable>
          </View>
        )}

        {groups.map((g) => (
          <View key={g.value} style={styles.group}>
            <Text style={styles.groupHeading}>{t(g.labelKey)}</Text>
            {g.items.map((r) => {
              const p = routineProgress(r, today);
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardName}>{r.name}</Text>
                    <Text style={styles.cardProgress}>
                      {t('routines.progress', { done: p.done, total: p.total })}
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
                  <View style={styles.cardActions}>
                    <Pressable
                      onPress={() => startEdit(r)}
                      accessibilityRole="button"
                      accessibilityLabel={t('routines.editA11y', { name: r.name })}
                      hitSlop={6}
                    >
                      <Text style={styles.edit}>{t('routines.edit')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeRoutine(r.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('routines.removeA11y', { name: r.name })}
                      hitSlop={6}
                    >
                      <Text style={styles.remove}>{t('common.remove')}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {adding ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={t('routines.namePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              value={name}
              onChangeText={setName}
              accessibilityLabel={t('routines.nameA11y')}
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
                    accessibilityLabel={t(w.labelKey)}
                    hitSlop={8}
                  >
                    <Text style={[styles.whenPill, active && styles.whenPillActive]}>{t(w.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={[styles.input, styles.stepsInput]}
              placeholder={t('routines.stepsPlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              value={stepsText}
              onChangeText={setStepsText}
              multiline
              accessibilityLabel={t('routines.stepsA11y')}
            />
            {/* The once-a-day nudge, default Off: an Off pill beside a time pill, which becomes
                the Settings-style hour stepper once it is on. An offer, never a demand. */}
            <View style={styles.nudgeBlock}>
              <Text style={styles.nudgeTitle}>{t('routines.nudgeTitle')}</Text>
              <Text style={styles.nudgeHint}>{t('routines.nudgeHint')}</Text>
              <View style={styles.nudgeRow}>
                <Pressable
                  onPress={() => setNudgeOn(false)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !nudgeOn }}
                  accessibilityLabel={t('common.off')}
                  hitSlop={8}
                >
                  <Text style={[styles.whenPill, !nudgeOn && styles.whenPillActive]}>{t('common.off')}</Text>
                </Pressable>
                {nudgeOn ? (
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => setNudgeHour(clampHour(nudgeHour - 1))}
                      disabled={nudgeHour <= 0}
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.reminderEarlier')}
                      hitSlop={8}
                      style={({ pressed }) => [styles.stepBtn, nudgeHour <= 0 && styles.stepBtnOff, pressed && styles.pressed]}
                    >
                      <Text style={styles.stepGlyph}>−</Text>
                    </Pressable>
                    <Text
                      style={styles.stepValue}
                      accessibilityLabel={t('routines.nudgeAtA11y', { name: name.trim(), time: formatReminderHour(nudgeHour) })}
                    >
                      {formatReminderHour(nudgeHour)}
                    </Text>
                    <Pressable
                      onPress={() => setNudgeHour(clampHour(nudgeHour + 1))}
                      disabled={nudgeHour >= 23}
                      accessibilityRole="button"
                      accessibilityLabel={t('today.laterHeading')}
                      hitSlop={8}
                      style={({ pressed }) => [styles.stepBtn, nudgeHour >= 23 && styles.stepBtnOff, pressed && styles.pressed]}
                    >
                      <Text style={styles.stepGlyph}>+</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setNudgeHour(defaultNudgeHour(when));
                      setNudgeOn(true);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: false }}
                    accessibilityLabel={t('routines.nudgeAtA11y', { name: name.trim(), time: formatReminderHour(defaultNudgeHour(when)) })}
                    hitSlop={8}
                  >
                    <Text style={styles.whenPill}>{formatReminderHour(defaultNudgeHour(when))}</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <View style={styles.formActions}>
              <Pressable onPress={cancelAdd} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.cancel}>{t('common.cancel')}</Text>
              </Pressable>
              <PrimaryButton
                label={editingId ? t('routines.saveChanges') : t('routines.add')}
                onPress={saveRoutine}
                pill
                accessibilityLabel={editingId ? t('routines.saveChanges') : t('routines.add')}
              />
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={styles.newBtn} hitSlop={6}>
            <Text style={styles.newBtnText}>{t('routines.new')}</Text>
          </Pressable>
        )}
        {nudgeNote && <Text style={styles.nudgeNote}>{nudgeNote}</Text>}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.five, paddingBottom: spacing.seven, gap: spacing.three, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
    title: { ...t.type.title, color: t.colors.ink, marginTop: spacing.two },
    subtitle: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, marginBottom: spacing.three },
    undoBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: t.colors.surface,
      borderRadius: radius.md,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.three,
    },
    undoText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    undoAction: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold },
    empty: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale, marginTop: spacing.four },
    starterBtn: { marginTop: spacing.four, alignSelf: 'flex-start' },
    starterBtnText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    group: { gap: spacing.two, marginTop: spacing.two },
    groupHeading: { ...t.type.eyebrow, color: t.colors.inkSoft, textTransform: 'uppercase' },
    card: {
      backgroundColor: t.colors.surfaceCard,
      borderRadius: radius.lg,
      padding: spacing.four,
      gap: spacing.one,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      boxShadow: cardShadow(t),
    },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.one },
    cardName: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.sans, flex: 1 },
    cardProgress: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, marginLeft: spacing.three },
    step: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, paddingVertical: spacing.two },
    stepBox: {
      width: 22,
      height: 22,
      borderRadius: radius.sm,
      borderWidth: border.thin,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBoxDone: { backgroundColor: t.colors.done, borderColor: t.colors.done },
    stepTick: { color: t.colors.onDone, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold },
    stepTitle: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body, flex: 1 },
    stepTitleDone: { color: t.colors.inkSoft, textDecorationLine: 'line-through' },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.five, marginTop: spacing.two },
    edit: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
    remove: { color: t.colors.danger, fontSize: 13 * t.scale, fontFamily: fonts.body },
    form: {
      backgroundColor: t.colors.surface,
      borderRadius: radius.lg,
      padding: spacing.four,
      gap: spacing.three,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      marginTop: spacing.two,
    },
    input: {
      color: t.colors.ink,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      borderWidth: border.hair,
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
      paddingVertical: spacing.three,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      overflow: 'hidden',
    },
    whenPillActive: { color: t.colors.onAccent, backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    nudgeBlock: { gap: spacing.one },
    nudgeTitle: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    nudgeHint: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 18 * t.scale },
    nudgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, marginTop: spacing.two },
    // The hour stepper, one shape with the Settings daily-reminder stepper.
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
    stepBtn: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: border.hair, borderColor: t.colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface },
    stepBtnOff: { opacity: 0.4 },
    stepGlyph: { fontSize: 22 * t.scale, lineHeight: 26 * t.scale, color: t.colors.accent, fontFamily: fonts.body },
    stepValue: { ...t.type.bodyStrong, color: t.colors.ink, minWidth: 88, textAlign: 'center' },
    pressed: { opacity: PRESSED_OPACITY },
    nudgeNote: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
    formActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.four, marginTop: spacing.one },
    cancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
    newBtn: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.pill,
      paddingVertical: spacing.three,
      alignItems: 'center',
      marginTop: spacing.four,
    },
    newBtnText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.body },
  });
