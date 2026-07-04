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
import { clampHour, clampMinute, formatReminderTime, reminderReasonLine } from '@/lib/reminders-types';
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
  const [nudgeMinute, setNudgeMinute] = useState(0);
  const [nudgeNote, setNudgeNote] = useState<string | null>(null); // the calm line when the nudge couldn't be set
  // The precise time entry, opened by tapping the time: two small 24h inputs holding the
  // typed text (the clamped VALUE lives in nudgeHour/nudgeMinute, narrated live below).
  const [timeEntryOpen, setTimeEntryOpen] = useState(false);
  const [hourText, setHourText] = useState('9');
  const [minuteText, setMinuteText] = useState('00');
  // Which save requirement the form is quietly pointing at, so a save tap is never silent.
  // Clears the moment the user types in the field the hint names.
  const [formHint, setFormHint] = useState<'name' | 'steps' | null>(null);
  const nameInput = useRef<TextInput>(null);
  const stepsInput = useRef<TextInput>(null);
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

  // Save the form, creating or (when editingId is set) editing. Every tap gets an answer:
  // a missing name or missing steps points the user there with a quiet hint and focus,
  // never a silent nothing and never a disabled button. The nudge reconciles FIRST, so the
  // stored time is honest: if scheduling didn't work the routine saves with no nudge and
  // one calm line says why (never a silent bounce-back). Edits go through applyRoutineEdit
  // so a surviving step keeps its id, and with it today's tick.
  async function saveRoutine() {
    const trimmed = name.trim();
    const stepTitles = parseDump(stepsText);
    if (!trimmed) {
      setFormHint('name');
      nameInput.current?.focus();
      return;
    }
    if (stepTitles.length === 0) {
      setFormHint('steps');
      stepsInput.current?.focus();
      return;
    }
    const existing = editingId ? routines.find((r) => r.id === editingId) : undefined;
    if (editingId && !existing) return; // removed while the form was open; nothing to save onto
    const now = Date.now();
    const id = existing ? existing.id : makeId();
    const wanted = nudgeOn ? nudgeHour : null;
    const wantedMinute = clampMinute(nudgeMinute);
    let hour: number | null = null;
    let minute: number | null = null;
    let note: string | null = null;
    if (wanted != null) {
      const result = await scheduleRoutineNudge(id, trimmed, wanted, wantedMinute);
      if (result.ok) {
        hour = wanted;
        minute = wantedMinute;
        track('routine.nudge.set', { hour: wanted, minute: wantedMinute });
      } else {
        note = reminderReasonLine(result.reason);
      }
    } else {
      void cancelRoutineNudge(id);
      if (existing?.nudgeHour != null) track('routine.nudge.cleared');
    }
    if (existing) {
      const edited = applyRoutineEdit(existing, { name: trimmed, when, stepTitles, nudgeHour: hour, nudgeMinute: minute, now }, makeId);
      commit(routines.map((r) => (r.id === existing.id ? edited : r)));
      track('routine.edited');
    } else {
      const steps = stepTitles.map((title) => ({ id: makeId(), title }));
      commit([
        ...routines,
        { id, name: trimmed, when, steps, done: {}, nudgeHour: hour, nudgeMinute: minute, createdAt: now, updatedAt: now },
      ]);
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
    setNudgeMinute(r.nudgeHour != null ? (r.nudgeMinute ?? 0) : 0);
    setNudgeNote(null);
    setTimeEntryOpen(false);
    setFormHint(null);
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
    setFormHint(null);
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
    setNudgeMinute(0);
    setTimeEntryOpen(false);
    setFormHint(null);
  }

  // Tapping the time toggles the precise entry, seeding the inputs from the current value
  // so what the user sees is what they are editing.
  function toggleTimeEntry() {
    setHourText(String(nudgeHour));
    setMinuteText(String(nudgeMinute).padStart(2, '0'));
    setTimeEntryOpen((open) => !open);
  }

  // The precise inputs stay in 24h (0-23 / 0-59, digits only, clamped), and the line below
  // narrates the RESULT in the device's own 12/24h convention, so an Italian sees 20:47 and
  // an Australian sees 8:47 pm without anyone juggling am/pm in a two-character box.
  function onHourText(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 2);
    setHourText(digits);
    if (digits !== '') setNudgeHour(clampHour(Number(digits)));
  }

  function onMinuteText(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 2);
    setMinuteText(digits);
    if (digits !== '') setNudgeMinute(clampMinute(Number(digits)));
  }

  // On blur the typed text settles to the clamped value ("77" becomes "59"), so the box
  // never disagrees with the narrated time.
  function settleTimeText() {
    setHourText(String(nudgeHour));
    setMinuteText(String(nudgeMinute).padStart(2, '0'));
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
    if (undo.nudgeHour != null) void scheduleRoutineNudge(undo.id, undo.name, undo.nudgeHour, undo.nudgeMinute ?? 0); // best effort: the routine is back, so is its nudge
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
                  {/* The nudge, visible where it was set: "around" is deliberate, Android
                      delivers these inexactly and the copy never promises the minute. */}
                  {r.nudgeHour != null && (
                    <Text style={styles.cardNudge}>
                      {t('routines.nudgeAt', { time: formatReminderTime(r.nudgeHour, r.nudgeMinute ?? 0) })}
                    </Text>
                  )}
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
              ref={nameInput}
              style={styles.input}
              placeholder={t('routines.namePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (formHint === 'name') setFormHint(null);
              }}
              accessibilityLabel={t('routines.nameA11y')}
            />
            {formHint === 'name' && <Text style={styles.formHint}>{t('routines.nameFirstHint')}</Text>}
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
              ref={stepsInput}
              style={[styles.input, styles.stepsInput]}
              placeholder={t('routines.stepsPlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              value={stepsText}
              onChangeText={(v) => {
                setStepsText(v);
                if (formHint === 'steps') setFormHint(null);
              }}
              multiline
              accessibilityLabel={t('routines.stepsA11y')}
            />
            {formHint === 'steps' && <Text style={styles.formHint}>{t('routines.stepsFirstHint')}</Text>}
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
                      onPress={() => {
                        const h = clampHour(nudgeHour - 1);
                        setNudgeHour(h);
                        setHourText(String(h));
                      }}
                      disabled={nudgeHour <= 0}
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.reminderEarlier')}
                      hitSlop={8}
                      style={({ pressed }) => [styles.stepBtn, nudgeHour <= 0 && styles.stepBtnOff, pressed && styles.pressed]}
                    >
                      <Text style={styles.stepGlyph}>−</Text>
                    </Pressable>
                    {/* Tapping the time opens the precise entry below; the steppers stay for
                        coarse hour moves, the inputs give the meticulous fine control. */}
                    <Pressable
                      onPress={toggleTimeEntry}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: timeEntryOpen }}
                      accessibilityLabel={t('routines.timeEntryA11y')}
                      hitSlop={8}
                    >
                      <Text style={styles.stepValue}>{formatReminderTime(nudgeHour, nudgeMinute)}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const h = clampHour(nudgeHour + 1);
                        setNudgeHour(h);
                        setHourText(String(h));
                      }}
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
                      setNudgeMinute(0);
                      setNudgeOn(true);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: false }}
                    accessibilityLabel={t('routines.nudgeAtA11y', { name: name.trim(), time: formatReminderTime(defaultNudgeHour(when), 0) })}
                    hitSlop={8}
                  >
                    <Text style={styles.whenPill}>{formatReminderTime(defaultNudgeHour(when), 0)}</Text>
                  </Pressable>
                )}
              </View>
              {/* The precise entry: 24h hour and minute, digits only. The line underneath
                  narrates the result in the device's own 12/24h convention, "around" because
                  Android delivers inexactly, never a to-the-minute promise. */}
              {nudgeOn && timeEntryOpen && (
                <View>
                  <View style={styles.timeEntryRow}>
                    <TextInput
                      style={[styles.input, styles.timeInput]}
                      value={hourText}
                      onChangeText={onHourText}
                      onBlur={settleTimeText}
                      keyboardType="number-pad"
                      maxLength={2}
                      accessibilityLabel={t('routines.timeHourA11y')}
                    />
                    <Text style={styles.timeColon}>:</Text>
                    <TextInput
                      style={[styles.input, styles.timeInput]}
                      value={minuteText}
                      onChangeText={onMinuteText}
                      onBlur={settleTimeText}
                      keyboardType="number-pad"
                      maxLength={2}
                      accessibilityLabel={t('routines.timeMinuteA11y')}
                    />
                  </View>
                  <Text style={styles.timeResult}>
                    {t('routines.nudgeAt', { time: formatReminderTime(nudgeHour, nudgeMinute) })}
                  </Text>
                  {/* The entry is 24-hour; one static line spares a 12h-convention user typing "8"
                      for 8 pm and quietly getting 8 am. The live line above shows the real result. */}
                  <Text style={styles.timeResult}>{t('routines.timeEntry24hHint')}</Text>
                </View>
              )}
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
    cardNudge: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, marginBottom: spacing.one },
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
    // The quiet save hint: the form's own accent, never a red shout.
    formHint: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 18 * t.scale },
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
    // The precise 24h time entry, opened by tapping the time.
    timeEntryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, marginTop: spacing.three },
    timeInput: { width: 56, textAlign: 'center' },
    timeColon: { ...t.type.bodyStrong, color: t.colors.inkSoft },
    timeResult: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
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
