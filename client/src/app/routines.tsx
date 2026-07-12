import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Segmented } from '@/components/Segmented';
import { border, cardShadow, fonts, layout, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { toISODate } from '@/lib/day';
import { t } from '@/lib/locale';
import { cancelRhythm, cancelRoutineNudge, exactAlarmDoorRelevant, getNudgeHealth, openExactAlarmSettings, rescheduleAllNudges, scheduleRhythm, scheduleRoutineNudge } from '@/lib/reminders';
import { clampHour, clampMinute, formatReminderTime, reminderReasonLine } from '@/lib/reminders-types';
import {
  applyRoutineEdit,
  cleanRhythmTimes,
  isFixedTimeRhythm,
  isStepDoneToday,
  RHYTHM_AT_TIMES_MAX,
  RHYTHM_INTERVAL_MAX,
  RHYTHM_INTERVAL_MIN,
  RHYTHM_MEDS_DEFAULT_TIMES,
  RHYTHM_WINDOW_END_DEFAULT,
  RHYTHM_WINDOW_START_DEFAULT,
  type RhythmTime,
  type Routine,
  routineProgress,
  type RoutineWhen,
  toggleStep,
} from '@/lib/routines';
import { loadReminderHour, loadReminderOn, loadRoutines, saveRoutines } from '@/lib/storage';
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

// The curated rungs the interval stepper walks, in minutes: dense at the short end where
// granularity matters (Melroy's ask: 30 or 90 minutes, not only whole hours), sparser past
// 3 hours. A migrated legacy value off the ladder (say 7 h) still displays as-is; stepping
// from it snaps to the nearest rung in that direction, so the stepper never dead-ends.
const INTERVAL_LADDER = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 720];
function stepInterval(current: number, dir: 1 | -1): number {
  if (dir === 1) return INTERVAL_LADDER.find((v) => v > current) ?? RHYTHM_INTERVAL_MAX;
  return [...INTERVAL_LADDER].reverse().find((v) => v < current) ?? RHYTHM_INTERVAL_MIN;
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
  // The custom-rhythm form (separate from the checklist form): name + interval + active window,
  // so a Rhythm is anything you want, not just the two presets. editingRhythmId set = editing.
  const [rhythmFormOpen, setRhythmFormOpen] = useState(false);
  const [editingRhythmId, setEditingRhythmId] = useState<string | null>(null);
  const [rhythmName, setRhythmName] = useState('');
  const [rhythmInterval, setRhythmInterval] = useState(120); // minutes, walked along INTERVAL_LADDER
  const [rhythmWinStart, setRhythmWinStart] = useState(RHYTHM_WINDOW_START_DEFAULT);
  const [rhythmWinEnd, setRhythmWinEnd] = useState(RHYTHM_WINDOW_END_DEFAULT);
  const [rhythmHint, setRhythmHint] = useState<'name' | 'times' | null>(null);
  const rhythmNameInput = useRef<TextInput>(null);
  // Fixed-time mode (the meds shape): the form is EITHER every-N-hours OR at set clock
  // times. Times are held as raw 24h text pairs (like the checklist's precise entry) and
  // clamped / deduped / sorted by cleanRhythmTimes at save, so junk rows just drop out.
  const [rhythmMode, setRhythmMode] = useState<'interval' | 'times'>('interval');
  const [rhythmTimeTexts, setRhythmTimeTexts] = useState<{ h: string; m: string }[]>([]);
  // The OS's scheduled-notification truth for this phone (the nudge health line, native only).
  const [nudgeHealth, setNudgeHealth] = useState<{ count: number; next: { hour: number; minute: number } | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadRoutines().then((r) => {
        if (active) setRoutines(r);
      });
      // The nudge health line (native): what the OS actually has scheduled on this phone.
      void getNudgeHealth().then((h) => {
        if (active) setNudgeHealth(h);
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

  // Re-read the OS's scheduled truth after anything (re)schedules or cancels, so the
  // "Next nudge around ..." line updates in place rather than waiting for the next screen
  // focus (Melroy's catch: edit a rhythm, the line sat stale). Cheap: one OS list read.
  // Callers chain it AFTER the scheduling promise settles, or the read races the write.
  function refreshNudgeHealth() {
    void getNudgeHealth().then(setNudgeHealth);
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
      await cancelRoutineNudge(id); // awaited so the health refresh below reads the post-cancel truth
      if (existing?.nudgeHour != null) track('routine.nudge.cleared');
    }
    refreshNudgeHealth();
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
    if (removed.kind === 'rhythm') void cancelRhythm(id).then(refreshNudgeHealth); // sweep every scheduled slot
    else void cancelRoutineNudge(id).then(refreshNudgeHealth); // no routine, no nudge
    track(removed.kind === 'rhythm' ? 'rhythm.removed' : 'routine.removed');
    setUndo(removed);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function undoRemove() {
    if (!undo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    commit([...routines, undo]);
    // Best effort: the thing is back, so is its nudge / its Rhythm slots.
    if (undo.kind === 'rhythm') void scheduleRhythm(undo).then(refreshNudgeHealth);
    else if (undo.nudgeHour != null) void scheduleRoutineNudge(undo.id, undo.name, undo.nudgeHour, undo.nudgeMinute ?? 0).then(refreshNudgeHealth);
    track(undo.kind === 'rhythm' ? 'rhythm.remove.undone' : 'routine.remove.undone');
    setUndo(null);
  }

  // Add a Rhythm from a preset: one tap creates AND activates it, never a form to fill.
  // Presets are complete on their own (water every 2h 9-21; meds at 8:00 + 20:00), keeping
  // setup near-zero; Edit opens the form to reshape any of them.
  function addRhythm(preset: 'water' | 'stand' | 'meds') {
    const now = Date.now();
    const name =
      preset === 'water' ? t('routines.rhythmNameWater') : preset === 'stand' ? t('routines.rhythmNameStand') : t('routines.rhythmNameMeds');
    const shape: Partial<Routine> =
      preset === 'meds'
        ? { atTimes: RHYTHM_MEDS_DEFAULT_TIMES }
        : { intervalMinutes: preset === 'water' ? 120 : 60, windowStart: RHYTHM_WINDOW_START_DEFAULT, windowEnd: RHYTHM_WINDOW_END_DEFAULT };
    const rhythm: Routine = {
      id: makeId(),
      name,
      kind: 'rhythm',
      when: 'anytime',
      steps: [],
      done: {},
      preset,
      ...shape,
      paused: false,
      createdAt: now,
      updatedAt: now,
    };
    commit([...routines, rhythm]);
    // Schedule on device; on web this is a no-op ('unsupported') and the section already says
    // reminders arrive on the phone, so only a real native failure (denied) surfaces a line.
    void scheduleRhythm(rhythm).then((res) => {
      if (!res.ok && res.reason !== 'unsupported') setNudgeNote(reminderReasonLine(res.reason));
      refreshNudgeHealth();
    });
    track('rhythm.created', { preset });
  }

  // Pause / resume a Rhythm: an honest, indefinite pause (a sick or off day). Paused cancels
  // every slot and schedules nothing; resume reschedules from the stored config. No telemetry
  // on the pause itself, a nudge-only feature stays uninstrumented on behaviour.
  function toggleRhythmPause(id: string) {
    const target = routines.find((r) => r.id === id);
    if (!target) return;
    const updated: Routine = { ...target, paused: !target.paused, updatedAt: Date.now() };
    commit(routines.map((r) => (r.id === id ? updated : r)));
    void scheduleRhythm(updated).then(refreshNudgeHealth);
  }

  // The exact-alarm door, and the re-arm on return. The resilience sweep runs on COLD start
  // only, and granting "Alarms & reminders" resumes the SAME process, so without this re-arm
  // every alarm would stay inexact until the app was fully killed (the adversarial review's
  // blocker, 2026-07-12). startActivityAsync resolves exactly when the user returns
  // (OnActivityResult), so the await below IS the "they came back" hook: re-schedule
  // everything from stored config (now armed exact if they granted) and refresh the health line.
  async function grantExactAlarms() {
    await openExactAlarmSettings();
    try {
      const [rts, reminderOn, reminderHour] = await Promise.all([loadRoutines(), loadReminderOn(), loadReminderHour()]);
      await rescheduleAllNudges(rts, reminderOn ? reminderHour : null);
      setNudgeHealth(await getNudgeHealth());
    } catch {
      // best effort; the cold-start sweep remains the backstop
    }
  }

  // The plain-language cadence line ("Around every 90 minutes, 9 am to 9 pm") in the device's
  // own time convention. "Around" is deliberate: Android delivers inexactly. Accepts just the
  // fields it reads, so the live form preview can pass its in-progress values without a full
  // Routine. A fixed-time Rhythm reads "At 8:00 am · 8:30 pm" instead (a locale-neutral dot join).
  function cadenceLine(r: Pick<Routine, 'intervalMinutes' | 'windowStart' | 'windowEnd' | 'atTimes'>): string {
    if (r.atTimes && r.atTimes.length > 0) return fixedTimesLine(r.atTimes);
    const start = formatReminderTime(r.windowStart ?? RHYTHM_WINDOW_START_DEFAULT, 0);
    const end = formatReminderTime(r.windowEnd ?? RHYTHM_WINDOW_END_DEFAULT, 0);
    const minutes = r.intervalMinutes ?? 60;
    if (minutes < 60) return t('routines.rhythmEveryMinutesLine', { minutes, start, end });
    if (minutes === 60) return t('routines.rhythmHourly', { start, end });
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0
      ? t('routines.rhythmEvery', { hours, start, end })
      : t('routines.rhythmEveryMixedLine', { hours, minutes: rest, start, end });
  }

  function fixedTimesLine(times: RhythmTime[]): string {
    return t('routines.rhythmAtTimes', { times: times.map((x) => formatReminderTime(x.hour, x.minute)).join(' · ') });
  }

  // Parse the form's raw 24h text pairs into clamped, deduped, clock-sorted times. An empty
  // minute box reads as :00 (typed "8" and moved on); a row with no hour just drops out.
  function parsedRhythmTimes(rows: { h: string; m: string }[]): RhythmTime[] {
    return cleanRhythmTimes(
      rows.map((row) => ({
        hour: Number.parseInt(row.h, 10),
        minute: row.m.trim() === '' ? 0 : Number.parseInt(row.m, 10),
      })),
    );
  }

  // The "every …" label for the interval stepper: minutes under the hour, whole hours on
  // the hour (singular-aware), a mixed "1 h 30 min" shape between.
  function intervalLabel(minutes: number): string {
    if (minutes < 60) return t('routines.rhythmEveryMinutes', { minutes });
    if (minutes === 60) return t('routines.rhythmEveryOne');
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? t('routines.rhythmEveryN', { hours }) : t('routines.rhythmEveryMixed', { hours, minutes: rest });
  }

  // Open a blank custom-rhythm form (closing the checklist form if it was open).
  function openNewRhythm() {
    cancelAdd();
    setEditingRhythmId(null);
    setRhythmName('');
    setRhythmMode('interval');
    setRhythmInterval(120);
    setRhythmWinStart(RHYTHM_WINDOW_START_DEFAULT);
    setRhythmWinEnd(RHYTHM_WINDOW_END_DEFAULT);
    setRhythmTimeTexts([{ h: '8', m: '00' }]);
    setRhythmHint(null);
    setRhythmFormOpen(true);
  }

  // Open the custom form prefilled from an existing Rhythm, so a preset is a starting point,
  // not a fixed thing: its name, shape (interval or set times), and values are all editable.
  function startEditRhythm(r: Routine) {
    cancelAdd();
    setEditingRhythmId(r.id);
    setRhythmName(r.name);
    setRhythmMode(isFixedTimeRhythm(r) ? 'times' : 'interval');
    setRhythmInterval(r.intervalMinutes ?? 120);
    setRhythmWinStart(r.windowStart ?? RHYTHM_WINDOW_START_DEFAULT);
    setRhythmWinEnd(r.windowEnd ?? RHYTHM_WINDOW_END_DEFAULT);
    setRhythmTimeTexts(
      (r.atTimes ?? []).length > 0
        ? (r.atTimes ?? []).map((x) => ({ h: String(x.hour), m: String(x.minute).padStart(2, '0') }))
        : [{ h: '8', m: '00' }],
    );
    setRhythmHint(null);
    setRhythmFormOpen(true);
  }

  // The times-list editors: raw digits only, clamped later by parsedRhythmTimes at save.
  function setRhythmTimeText(i: number, field: 'h' | 'm', v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 2);
    setRhythmTimeTexts((rows) => rows.map((row, j) => (j === i ? { ...row, [field]: digits } : row)));
    if (rhythmHint === 'times') setRhythmHint(null);
  }
  function addRhythmTimeRow() {
    setRhythmTimeTexts((rows) => (rows.length >= RHYTHM_AT_TIMES_MAX ? rows : [...rows, { h: '', m: '00' }]));
  }
  function removeRhythmTimeRow(i: number) {
    setRhythmTimeTexts((rows) => rows.filter((_, j) => j !== i));
  }

  function cancelRhythmForm() {
    setRhythmFormOpen(false);
    setEditingRhythmId(null);
    setRhythmName('');
    setRhythmHint(null);
  }

  // Save the custom form, creating or editing. A missing name points there with a quiet hint
  // and focus, never a silent bounce. The stored Rhythm is always nudge-only (steps:[], done:{})
  // and reschedules on save so a changed interval or window takes effect immediately.
  function saveRhythmForm() {
    const trimmed = rhythmName.trim();
    if (!trimmed) {
      setRhythmHint('name');
      rhythmNameInput.current?.focus();
      return;
    }
    // Fixed-time mode must yield at least one real time; a quiet hint, never a silent nothing.
    const times = rhythmMode === 'times' ? parsedRhythmTimes(rhythmTimeTexts) : [];
    if (rhythmMode === 'times' && times.length === 0) {
      setRhythmHint('times');
      return;
    }
    const now = Date.now();
    const existing = editingRhythmId ? routines.find((r) => r.id === editingRhythmId) : undefined;
    if (editingRhythmId && !existing) {
      cancelRhythmForm();
      return;
    }
    const id = existing ? existing.id : makeId();
    // One shape or the other, mirroring the parser's rule: set-times carries atTimes only,
    // interval carries interval + window only, so an edit that switches mode fully sheds the
    // old shape (no stale window fields riding along).
    const shape: Partial<Routine> =
      rhythmMode === 'times' ? { atTimes: times } : { intervalMinutes: rhythmInterval, windowStart: rhythmWinStart, windowEnd: rhythmWinEnd };
    const rhythm: Routine = {
      id,
      name: trimmed,
      kind: 'rhythm',
      when: 'anytime',
      steps: [],
      done: {},
      preset: existing?.preset ?? 'custom',
      ...shape,
      paused: existing?.paused ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    commit(existing ? routines.map((r) => (r.id === id ? rhythm : r)) : [...routines, rhythm]);
    void scheduleRhythm(rhythm).then((res) => {
      if (!res.ok && res.reason !== 'unsupported') setNudgeNote(reminderReasonLine(res.reason));
      refreshNudgeHealth();
    });
    track(existing ? 'rhythm.edited' : 'rhythm.created', { preset: rhythm.preset, mode: rhythmMode });
    cancelRhythmForm();
  }

  // Rhythms are nudge-only and must NEVER flow through the checklist group/progress path (that
  // path renders a "0 of 0" tick counter, the exact scorekeeping the spine forbids), so they
  // are excluded here and rendered in their own section below.
  const groups = WHENS.map((w) => ({ ...w, items: routines.filter((r) => r.when === w.value && r.kind !== 'rhythm') })).filter(
    (g) => g.items.length > 0,
  );
  const rhythms = routines.filter((r) => r.kind === 'rhythm');

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

        {/* Rhythms: gentle recurring nudges, in their OWN section (never the checklist group
            path), with no checkboxes, no progress, no streak. Presets create-and-activate in
            one tap. On web scheduling is a no-op, so a calm line says reminders arrive on the phone. */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>{t('routines.rhythmSection')}</Text>
          <Text style={styles.rhythmIntro}>{t('routines.rhythmIntro')}</Text>
          {Platform.OS === 'web' && <Text style={styles.rhythmWebNote}>{t('routines.rhythmWebNote')}</Text>}
          {rhythms.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardName}>{r.name}</Text>
                {r.paused && <Text style={styles.cardProgress}>{t('routines.rhythmPaused')}</Text>}
              </View>
              <Text style={styles.cardNudge}>{cadenceLine(r)}</Text>
              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => startEditRhythm(r)}
                  accessibilityRole="button"
                  accessibilityLabel={t('routines.editA11y', { name: r.name })}
                  hitSlop={6}
                >
                  <Text style={styles.edit}>{t('routines.edit')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => toggleRhythmPause(r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={r.paused ? t('routines.rhythmResumeA11y', { name: r.name }) : t('routines.rhythmPauseA11y', { name: r.name })}
                  hitSlop={6}
                >
                  <Text style={styles.edit}>{r.paused ? t('routines.rhythmResume') : t('routines.rhythmPause')}</Text>
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
          ))}
          {rhythmFormOpen ? (
            <View style={styles.form}>
              <TextInput
                ref={rhythmNameInput}
                style={styles.input}
                placeholder={t('routines.rhythmNamePlaceholder')}
                placeholderTextColor={theme.colors.inkFaint}
                value={rhythmName}
                onChangeText={(v) => {
                  setRhythmName(v);
                  if (rhythmHint === 'name') setRhythmHint(null);
                }}
                accessibilityLabel={t('routines.nameA11y')}
              />
              {rhythmHint === 'name' && <Text style={styles.formHint}>{t('routines.nameFirstHint')}</Text>}

              <Text style={styles.nudgeTitle}>{t('routines.rhythmHowOften')}</Text>
              <Segmented
                value={rhythmMode}
                options={[
                  { value: 'interval', label: t('routines.rhythmModeInterval') },
                  { value: 'times', label: t('routines.rhythmModeTimes') },
                ]}
                onChange={setRhythmMode}
                accessibilityLabel={t('routines.rhythmHowOften')}
              />

              {rhythmMode === 'interval' && (
              <>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setRhythmInterval((n) => stepInterval(n, -1))}
                  disabled={rhythmInterval <= RHYTHM_INTERVAL_MIN}
                  accessibilityRole="button"
                  accessibilityLabel={t('routines.rhythmLessOftenA11y')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.stepBtn, rhythmInterval <= RHYTHM_INTERVAL_MIN && styles.stepBtnOff, pressed && styles.pressed]}
                >
                  <Text style={styles.stepGlyph}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{intervalLabel(rhythmInterval)}</Text>
                <Pressable
                  onPress={() => setRhythmInterval((n) => stepInterval(n, 1))}
                  disabled={rhythmInterval >= RHYTHM_INTERVAL_MAX}
                  accessibilityRole="button"
                  accessibilityLabel={t('routines.rhythmMoreOftenA11y')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.stepBtn, rhythmInterval >= RHYTHM_INTERVAL_MAX && styles.stepBtnOff, pressed && styles.pressed]}
                >
                  <Text style={styles.stepGlyph}>+</Text>
                </Pressable>
              </View>

              <Text style={styles.nudgeTitle}>{t('routines.rhythmActiveHours')}</Text>
              <View style={styles.windowRow}>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setRhythmWinStart((h) => Math.max(0, h - 1))}
                    disabled={rhythmWinStart <= 0}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.reminderEarlier')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.stepBtn, rhythmWinStart <= 0 && styles.stepBtnOff, pressed && styles.pressed]}
                  >
                    <Text style={styles.stepGlyph}>−</Text>
                  </Pressable>
                  <Text style={styles.windowValue}>{formatReminderTime(rhythmWinStart, 0)}</Text>
                  <Pressable
                    onPress={() => setRhythmWinStart((h) => Math.min(rhythmWinEnd - 1, h + 1))}
                    disabled={rhythmWinStart >= rhythmWinEnd - 1}
                    accessibilityRole="button"
                    accessibilityLabel={t('today.laterHeading')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.stepBtn, rhythmWinStart >= rhythmWinEnd - 1 && styles.stepBtnOff, pressed && styles.pressed]}
                  >
                    <Text style={styles.stepGlyph}>+</Text>
                  </Pressable>
                </View>
                <Text style={styles.windowTo}>{t('routines.rhythmTo')}</Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setRhythmWinEnd((h) => Math.max(rhythmWinStart + 1, h - 1))}
                    disabled={rhythmWinEnd <= rhythmWinStart + 1}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.reminderEarlier')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.stepBtn, rhythmWinEnd <= rhythmWinStart + 1 && styles.stepBtnOff, pressed && styles.pressed]}
                  >
                    <Text style={styles.stepGlyph}>−</Text>
                  </Pressable>
                  <Text style={styles.windowValue}>{formatReminderTime(rhythmWinEnd, 0)}</Text>
                  <Pressable
                    onPress={() => setRhythmWinEnd((h) => Math.min(23, h + 1))}
                    disabled={rhythmWinEnd >= 23}
                    accessibilityRole="button"
                    accessibilityLabel={t('today.laterHeading')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.stepBtn, rhythmWinEnd >= 23 && styles.stepBtnOff, pressed && styles.pressed]}
                  >
                    <Text style={styles.stepGlyph}>+</Text>
                  </Pressable>
                </View>
              </View>
              </>
              )}

              {rhythmMode === 'times' && (
                <View>
                  <Text style={styles.nudgeTitle}>{t('routines.rhythmTimesTitle')}</Text>
                  {rhythmTimeTexts.map((row, i) => (
                    <View key={i} style={styles.timeEntryRow}>
                      <TextInput
                        style={[styles.input, styles.timeInput]}
                        value={row.h}
                        onChangeText={(v) => setRhythmTimeText(i, 'h', v)}
                        keyboardType="number-pad"
                        maxLength={2}
                        accessibilityLabel={t('routines.timeHourA11y')}
                      />
                      <Text style={styles.timeColon}>:</Text>
                      <TextInput
                        style={[styles.input, styles.timeInput]}
                        value={row.m}
                        onChangeText={(v) => setRhythmTimeText(i, 'm', v)}
                        keyboardType="number-pad"
                        maxLength={2}
                        accessibilityLabel={t('routines.timeMinuteA11y')}
                      />
                      {rhythmTimeTexts.length > 1 && (
                        <Pressable
                          onPress={() => removeRhythmTimeRow(i)}
                          accessibilityRole="button"
                          accessibilityLabel={t('routines.rhythmRemoveTimeA11y')}
                          hitSlop={8}
                        >
                          <Text style={styles.remove}>{t('common.remove')}</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {rhythmTimeTexts.length < RHYTHM_AT_TIMES_MAX && (
                    <Pressable onPress={addRhythmTimeRow} accessibilityRole="button" accessibilityLabel={t('routines.rhythmAddTime')} hitSlop={6}>
                      <Text style={styles.addTimeText}>{t('routines.rhythmAddTime')}</Text>
                    </Pressable>
                  )}
                  <Text style={styles.timeResult}>{t('routines.timeEntry24hHint')}</Text>
                  {rhythmHint === 'times' && <Text style={styles.formHint}>{t('routines.rhythmTimesHint')}</Text>}
                </View>
              )}

              <Text style={styles.timeResult}>
                {rhythmMode === 'times'
                  ? (() => {
                      const parsed = parsedRhythmTimes(rhythmTimeTexts);
                      return parsed.length > 0 ? fixedTimesLine(parsed) : t('routines.rhythmTimesHint');
                    })()
                  : cadenceLine({ intervalMinutes: rhythmInterval, windowStart: rhythmWinStart, windowEnd: rhythmWinEnd })}
              </Text>

              <View style={styles.formActions}>
                <Pressable onPress={cancelRhythmForm} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.cancel}>{t('common.cancel')}</Text>
                </Pressable>
                <PrimaryButton
                  label={editingRhythmId ? t('routines.saveChanges') : t('routines.rhythmSave')}
                  onPress={saveRhythmForm}
                  pill
                  accessibilityLabel={editingRhythmId ? t('routines.saveChanges') : t('routines.rhythmSave')}
                />
              </View>
            </View>
          ) : (
            <View style={styles.rhythmPresets}>
              <Pressable
                onPress={() => addRhythm('water')}
                accessibilityRole="button"
                accessibilityLabel={t('routines.rhythmAddWater')}
                style={styles.presetBtn}
                hitSlop={6}
              >
                <Text style={styles.presetBtnText}>{t('routines.rhythmAddWater')}</Text>
              </Pressable>
              <Pressable
                onPress={() => addRhythm('stand')}
                accessibilityRole="button"
                accessibilityLabel={t('routines.rhythmAddStand')}
                style={styles.presetBtn}
                hitSlop={6}
              >
                <Text style={styles.presetBtnText}>{t('routines.rhythmAddStand')}</Text>
              </Pressable>
              <Pressable
                onPress={() => addRhythm('meds')}
                accessibilityRole="button"
                accessibilityLabel={t('routines.rhythmAddMeds')}
                style={styles.presetBtn}
                hitSlop={6}
              >
                <Text style={styles.presetBtnText}>{t('routines.rhythmAddMeds')}</Text>
              </Pressable>
              <Pressable
                onPress={openNewRhythm}
                accessibilityRole="button"
                accessibilityLabel={t('routines.rhythmNew')}
                style={styles.presetBtn}
                hitSlop={6}
              >
                <Text style={styles.presetBtnText}>{t('routines.rhythmNew')}</Text>
              </Pressable>
            </View>
          )}
          {/* Nudge health (native): the OS's own ground truth for this phone, the debug line
              for "the nudge never came". Zero scheduled while Rhythms exist = scheduling is
              broken; a right count with nothing arriving = the OS (battery management) is
              holding them, hence the battery hint and the door to the app's system settings. */}
          {Platform.OS !== 'web' && rhythms.length > 0 && (
            <View style={styles.nudgeHealth}>
              {/* One calm line, never a count: "Next nudge around 3:00 pm." The raw scheduled-
                  notification number (39!) was honest but overwhelming for exactly this
                  audience (Melroy, 2026-07-12), so it is gone. The ZERO state stays: nothing-
                  scheduled-while-Rhythms-exist is the one red flag this line exists to surface,
                  and getNudgeHealth still returns the count for that check alone. */}
              <Text style={styles.nudgeHealthText}>
                {nudgeHealth == null
                  ? ' '
                  : nudgeHealth.count === 0
                    ? t('routines.nudgeHealthNone')
                    : nudgeHealth.next
                      ? t('routines.nudgeHealthNext', { time: formatReminderTime(nudgeHealth.next.hour, nudgeHealth.next.minute) })
                      : ' '}
              </Text>
              {/* The exact-alarm door (Android 12+): without the "Alarms & reminders" special
                  access every trigger is an INEXACT alarm that Doze holds until the app next
                  wakes, i.e. nudges only arrive when the app is opened, battery settings
                  notwithstanding. Android 14+ ships the toggle OFF, so this is the fix door. */}
              {exactAlarmDoorRelevant() && (
                <>
                  <Text style={styles.nudgeHealthText}>{t('routines.exactHint')}</Text>
                  <Pressable
                    onPress={() => void grantExactAlarms()}
                    accessibilityRole="button"
                    accessibilityLabel={t('routines.exactOpen')}
                    hitSlop={6}
                  >
                    <Text style={styles.batteryLink}>{t('routines.exactOpen')}</Text>
                  </Pressable>
                </>
              )}
              <Text style={styles.nudgeHealthText}>{t('routines.batteryHint')}</Text>
              <Pressable
                onPress={() => void Linking.openSettings()}
                accessibilityRole="button"
                accessibilityLabel={t('routines.batteryOpen')}
                hitSlop={6}
              >
                <Text style={styles.batteryLink}>{t('routines.batteryOpen')}</Text>
              </Pressable>
            </View>
          )}
        </View>

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
    rhythmIntro: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 18 * t.scale, marginBottom: spacing.one },
    rhythmWebNote: { color: t.colors.inkSoft, fontSize: 12 * t.scale, fontFamily: fonts.body, marginBottom: spacing.two, fontStyle: 'italic' },
    rhythmPresets: { gap: spacing.two, marginTop: spacing.one },
    nudgeHealth: { gap: spacing.one, marginTop: spacing.four },
    nudgeHealthText: { color: t.colors.inkFaint, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body },
    batteryLink: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    presetBtn: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.pill,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.four,
      alignItems: 'center',
    },
    presetBtnText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body },
    addTimeText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    windowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, flexWrap: 'wrap', marginTop: spacing.two },
    windowValue: { ...t.type.bodyStrong, color: t.colors.ink, minWidth: 52, textAlign: 'center' },
    windowTo: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
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
