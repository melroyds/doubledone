import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrainDump } from '@/components/BrainDump';
import { type BreakdownAnswers, BreakdownQuestions } from '@/components/BreakdownQuestions';
import { BreakdownReview, type ReviewPhase, type ReviewStep } from '@/components/BreakdownReview';
import { RepeatingDrawer } from '@/components/RepeatingDrawer';
import { RotatingPhrase } from '@/components/RotatingPhrase';
import { TaskRow } from '@/components/TaskRow';
import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import {
  clarify,
  DEFAULT_QUESTIONS,
  plan as planBreakdown,
  strategise,
  triage,
  type PlanItem,
  type Questions,
} from '@/lib/ai';
import { useSession } from '@/lib/auth';
import { completionsByDay } from '@/lib/calendar';
import { addDaysISO, formatTodayLabel, friendlyDate, isReentry, toISODate } from '@/lib/day';
import { aiLanguage } from '@/lib/locale';
import { scheduleFields, type CaptureSchedule } from '@/lib/recurrence';
import { disableDailyReminder, enableDailyReminder } from '@/lib/reminders';
import { applySliceDelta } from '@/lib/slices';
import { spreadDueDates } from '@/lib/spread';
import { loadClosedDate, loadLastOpen, loadReminderOn, loadTasks, saveClosedDate, saveLastOpen, saveReminderOn, saveTasks } from '@/lib/storage';
import { isSyncConfigured, supabase } from '@/lib/supabase';
import { syncOnce } from '@/lib/sync';
import { parseDump, type Task } from '@/lib/tasks';
import { summarizeAdded, summaryLine, triageToTasks } from '@/lib/triage';
import { track } from '@/lib/telemetry';
import { useReducedMotion, useTheme, useThemedStyles } from '@/lib/theme-provider';
import { deferToTomorrow, isDoneOn, isRecurring, tasksForToday, toggleDoneOn, upcomingTasks } from '@/lib/today';

import closeDayArt from '../../assets/images/closeday.jpg';
import emptyArt from '../../assets/images/empty.jpg';

let addCounter = 0;
const REENTRY_GAP_DAYS = 4; // a calm "welcome back" shows on the first open after this many days away

function makeId(): string {
  addCounter += 1;
  return `t-${Date.now().toString(36)}-${addCounter.toString(36)}`;
}

// Clock read, kept at module scope so handlers stay pure for the render linter
// (same reason makeId lives here). Bumps updatedAt / stamps tombstones.
function nowMs(): number {
  return Date.now();
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [closedDate, setClosedDate] = useState<string | null>(null);
  const [sortSummary, setSortSummary] = useState<string | null>(null);
  const [reentry, setReentry] = useState(false);
  const [didOpen, setDidOpen] = useState(false);
  const [didText, setDidText] = useState('');
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusSkips, setFocusSkips] = useState<string[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [strategising, setStrategising] = useState(false);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [strategiseError, setStrategiseError] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  // Break it down, the two-call flow: qualify (questions) -> decompose (review).
  const [bdPhase, setBdPhase] = useState<'off' | 'questions' | 'review'>('off');
  const [bdTask, setBdTask] = useState('');
  const [bdQuestions, setBdQuestions] = useState<Questions | null>(null);
  const [bdSteps, setBdSteps] = useState<ReviewStep[] | null>(null);
  const [bdPhases, setBdPhases] = useState<ReviewPhase[] | null>(null);
  const [bdAnswers, setBdAnswers] = useState<BreakdownAnswers | null>(null);
  const [bdBusy, setBdBusy] = useState(false);
  const today = useMemo(() => new Date(), []);
  const router = useRouter();
  const session = useSession();
  const tasksRef = useRef<Task[]>(tasks);
  const reduced = useReducedMotion();
  // The close-the-day card's gentle entrance (0 = below + transparent, 1 = settled).
  // useState, not useRef: reading a ref in render trips the React Compiler lint.
  const [closeRise] = useState(() => new Animated.Value(0));
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();

  // Re-read the persisted list on every focus, not only first mount, so returning
  // to Today always reflects the current store, including after an account deletion
  // wipes it (native keeps a mounted screen alive on router.replace; web reloads).
  // The `loaded` gate still holds the empty / all-done copy until the first load
  // lands so neither flashes.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadTasks().then((stored) => {
        if (!active) return;
        setTasks(stored);
        setLoaded(true);
      });
      void loadClosedDate().then((d) => {
        if (active) setClosedDate(d);
      });
      void loadLastOpen().then((last) => {
        if (!active) return;
        if (isReentry(last, today, REENTRY_GAP_DAYS)) {
          setReentry(true);
          track('reentry.shown');
        }
        void saveLastOpen(toISODate(today));
      });
      return () => {
        active = false;
      };
    }, [today]),
  );

  // Keep the latest tasks reachable from the sync effect without making it re-run
  // on every edit (which would re-sync constantly).
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Reflect the persisted daily-reminder toggle (the schedule itself survives restarts).
  useEffect(() => {
    let active = true;
    void loadReminderOn().then((on) => {
      if (active) setReminderOn(on);
    });
    return () => {
      active = false;
    };
  }, []);

  // Opt-in cloud sync: when signed in (and configured), reconcile once with the
  // account and persist the merged result. Runs on sign-in and on open. Realtime
  // and push-on-change are deferred (see BUILD-PLAN backlog). Failures are silent
  // and logged, the app stays usable offline regardless.
  useEffect(() => {
    if (!supabase || !session) return;
    let active = true;
    void syncOnce(supabase, tasksRef.current, session.user.id)
      .then((merged) => {
        if (!active) return;
        setTasks(merged);
        void saveTasks(merged);
        track('sync.completed', { count: merged.length });
      })
      .catch((e) => track('sync.failed', { error: e instanceof Error ? e.message : e }));
    return () => {
      active = false;
    };
  }, [session]);

  // Drive the close-the-day card's soft fade-and-rise on open. Reduced motion
  // shows it settled instantly, never moving for users who opt out of motion.
  useEffect(() => {
    if (!closing) {
      closeRise.setValue(0);
      return;
    }
    if (reduced) {
      closeRise.setValue(1);
      return;
    }
    const anim = Animated.timing(closeRise, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [closing, reduced, closeRise]);

  const visible = tasksForToday(tasks, today);
  const upcoming = upcomingTasks(tasks, today);
  const allDone = loaded && visible.length > 0 && visible.every((t) => isDoneOn(t, today));
  // Closed when the stored close-date is today's; it self-clears when the date rolls over.
  const isClosed = closedDate === toISODate(today);
  const todayDone = useMemo(() => completionsByDay(tasks).get(toISODate(today)) ?? [], [tasks, today]);
  // One-off, undone tasks on Today: the ones Strategise can re-spread (recurring stay by cadence).
  const spreadable = visible.filter((t) => !isRecurring(t) && !isDoneOn(t, today));
  // Focus mode shows one unfinished one-off at a time (recurring habits are not the
  // wall-of-awful). The first not-yet-skipped one; completing or skipping advances it.
  const focusTask = focusOpen ? (spreadable.find((t) => !focusSkips.includes(t.id)) ?? null) : null;

  function commit(next: Task[]) {
    setTasks(next);
    void saveTasks(next);
  }

  // Soft-delete: tombstone the task (hidden from every view) rather than dropping
  // it, so the deletion can sync to other devices instead of resurrecting on pull.
  function removeTask(id: string) {
    const now = nowMs();
    commit(tasks.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t)));
    setConfirmingId(null);
    track('task.removed');
  }

  // Push a one-off to tomorrow: a calm "not today" that moves a single task
  // forward a day (it returns tomorrow), the single-task sibling of close-the-day's
  // roll forward. Never-shame: no counter, no penalty, just a date move.
  function deferTask(id: string) {
    const now = nowMs();
    commit(tasks.map((t) => (t.id === id ? { ...deferToTomorrow(t, today), updatedAt: now } : t)));
    setConfirmingId(null);
    track('task.deferred');
  }

  // "Just this one" focus mode: complete the focused task fully (slices included) by
  // the same done/completedAt path, then the next unfinished one surfaces on its own.
  function focusComplete(id: string) {
    const now = nowMs();
    commit(
      tasks.map((t) => {
        if (t.id !== id) return t;
        const slices = t.slices ? { total: t.slices.total, done: t.slices.total } : t.slices;
        return { ...t, done: true, completedAt: now, updatedAt: now, ...(slices ? { slices } : {}) };
      }),
    );
    track('focus.completed');
  }

  function focusSkip(id: string) {
    setFocusSkips((s) => [...s, id]);
  }

  function openFocus() {
    setFocusSkips([]);
    setFocusOpen(true);
    track('focus.opened');
  }

  function closeFocus() {
    setFocusOpen(false);
    setFocusSkips([]);
  }

  function signOut() {
    if (supabase) void supabase.auth.signOut();
    track('auth.signed_out');
  }

  // Close the day: a calm wrap, not a mechanical reset. Undone tasks already roll
  // forward on their own, so this is purely the closing ritual.
  function openClose() {
    setClosing(true);
    track('day.closed', { finished: todayDone.length });
  }

  function reopenDay() {
    setClosedDate(null);
    void saveClosedDate(null);
    track('day.reopened');
  }

  function openDrawer() {
    setDrawerOpen(true);
    track('repeating.opened');
  }

  // A calm daily reminder, opt-in. Native only (web cannot schedule local ones).
  async function toggleReminder() {
    if (reminderOn) {
      await disableDailyReminder();
      setReminderOn(false);
      void saveReminderOn(false);
      track('reminder.disabled');
    } else {
      const ok = await enableDailyReminder();
      setReminderOn(ok);
      void saveReminderOn(ok);
      track('reminder.enabled', { granted: ok });
    }
  }

  // Strategise: hand today's one-offs to the AI, get a calm re-spread, then PROPOSE
  // it (the user accepts). Never rearranges the day on its own.
  async function runStrategise() {
    if (strategising) return;
    setStrategiseError(null);
    setStrategising(true);
    try {
      const result = await strategise(spreadable.map((t) => ({ id: t.id, title: t.title })), aiLanguage);
      track('strategise.requested', { count: spreadable.length });
      setPlan(result);
    } catch {
      setStrategiseError('Could not strategise just now. Try again.');
    } finally {
      setStrategising(false);
    }
  }

  function acceptPlan() {
    if (!plan) return;
    const byId = new Map(plan.map((p) => [p.id, p.dayOffset]));
    const now = nowMs();
    const next = tasks.map((t) => {
      const off = byId.get(t.id);
      if (off == null) return t;
      // dayOffset 0 keeps it on Today (undated); >0 sets a future due date.
      return { ...t, due: off <= 0 ? null : addDaysISO(today, off), updatedAt: now };
    });
    commit(next);
    track('strategise.accepted', { moved: plan.filter((p) => p.dayOffset > 0).length });
    setPlan(null);
  }

  function toggle(id: string) {
    const next = tasks.map((t) => {
      if (t.id !== id) return t;
      const toggled = { ...toggleDoneOn(t, today), updatedAt: nowMs() };
      // Stamp the completion time for one-offs so the calendar can place them on the
      // right day. Recurring tasks carry their own dated completedDates instead.
      if (!isRecurring(toggled)) toggled.completedAt = toggled.done ? nowMs() : null;
      return toggled;
    });
    const justToggled = next.find((t) => t.id === id);
    // The moat starts at the call site: log the outcome, not just "done".
    track('task.toggled', { done: justToggled ? isDoneOn(justToggled, today) : false });
    const todays = tasksForToday(next, today);
    if (todays.length > 0 && todays.every((t) => isDoneOn(t, today))) {
      track('day.cleared', { count: todays.length });
    }
    commit(next);
  }

  function capture(text: string, schedule: CaptureSchedule, sliceCount?: number) {
    const titles = parseDump(text);
    if (titles.length === 0) return;
    setSortSummary(null);
    const now = nowMs();
    const fields = scheduleFields(schedule, today); // due / recurrence for the chosen when
    // Slices are a single one-off concept; BrainDump only offers them for a lone
    // line, but guard here too so a multi-line dump never inherits a slice count.
    const useSlices = sliceCount != null && sliceCount >= 2 && titles.length === 1;
    const added: Task[] = titles.map((title, i) => ({
      id: makeId(),
      title,
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      ...fields,
      ...(useSlices && i === 0 ? { slices: { total: sliceCount, done: 0 } } : {}),
    }));
    commit([...tasks, ...added]);
    // One line is a quick add; several is a genuine brain-dump. Log the shape and
    // the chosen schedule so the moat can learn how this audience really captures.
    track(titles.length > 1 ? 'brain_dump.captured' : 'task.added', {
      count: titles.length,
      schedule: schedule.mode,
    });
    if (useSlices) track('slices.defined', { total: sliceCount });
  }

  // "I also did that": log something already done that was never on the list, so the
  // Lookback reflects what you actually did, not just what you ticked. A completed
  // task stamped now (shows checked on Today and in the Lookback). Feeds the moat.
  function logDidIt(text: string) {
    const title = text.trim();
    if (!title) return;
    const now = nowMs();
    const did: Task = { id: makeId(), title, done: true, createdAt: now, updatedAt: now, completedAt: now };
    commit([...tasks, did]);
    track('offplan.logged');
    setDidText('');
    setDidOpen(false);
  }

  // Advance (or step back) one slice of a sliced task. Crossing to all-slices-done
  // completes it through the same path as a tap-to-complete (done + completedAt),
  // so the calendar, Close-the-day and the celebration treat it like any finish.
  function step(id: string, delta: number) {
    const before = tasks.find((t) => t.id === id);
    const next = tasks.map((t) => {
      if (t.id !== id) return t;
      const moved = applySliceDelta(t, delta);
      if (moved === t) return t; // clamped at a bound: nothing changed, no resync
      const now = nowMs();
      const stamped: Task = { ...moved, updatedAt: now };
      if (moved.done && !t.done) stamped.completedAt = now;
      else if (!moved.done && t.done) stamped.completedAt = null;
      return stamped;
    });
    const after = next.find((t) => t.id === id);
    if (after === before) return; // no-op
    // The moat: how people slice and pace multi-part work, not just "done".
    track('slices.progressed', {
      done: after?.slices?.done ?? 0,
      total: after?.slices?.total ?? 0,
      complete: after?.done ?? false,
    });
    if (after?.done && !before?.done) {
      const todays = tasksForToday(next, today);
      if (todays.length > 0 && todays.every((t) => isDoneOn(t, today))) {
        track('day.cleared', { count: todays.length });
      }
    }
    commit(next);
  }

  // Break it down, call 1: ask the AI for the qualifying questions, then show
  // them. Clarify is best-effort, so a failure falls back to default questions
  // and the flow never blocks.
  async function biteElephant(text: string) {
    const task = text.trim();
    if (!task) return;
    setBdTask(task);
    setBdBusy(true);
    try {
      setBdQuestions(await clarify(task, aiLanguage));
    } catch {
      setBdQuestions(DEFAULT_QUESTIONS);
    } finally {
      setBdBusy(false);
      setBdPhase('questions');
    }
    track('breakdown.started');
  }

  // Break it down, call 2: plan the phases + phase-one steps, work out each
  // date from the chosen spread, and show it for review (accept / deselect).
  // A small task comes back as one phase (so this behaves like a flat decompose);
  // a big one comes back as several, only the first of which is broken into steps.
  async function bdSubmitQuestions(answers: BreakdownAnswers) {
    if (bdBusy) return;
    setBdAnswers(answers);
    setBdBusy(true);
    try {
      const { phases, firstSteps } = await planBreakdown(
        bdTask,
        {
          dueDate: answers.dueDate,
          spread: answers.spread,
          question: bdQuestions?.custom ?? '',
          answer: answers.customAnswer,
        },
        aiLanguage,
      );
      if (firstSteps.length === 0) throw new Error('no steps');
      // Distribute the phase starts across the runway (phase 1 starts Today).
      const phaseStarts = spreadDueDates(Math.max(1, phases.length), today, answers.dueDate, 'gradual');
      const phase1End = phases.length > 1 ? (phaseStarts[1] ?? answers.dueDate) : answers.dueDate;
      // Phase one's steps spread within phase one's window.
      const stepDates = spreadDueDates(firstSteps.length, today, phase1End, answers.spread);
      setBdSteps(firstSteps.map((s, i) => ({ title: s.title, minutes: s.minutes, date: stepDates[i] ?? null })));
      setBdPhases(phases.slice(1).map((p, i) => ({ title: p.title, date: phaseStarts[i + 1] ?? null })));
      setBdPhase('review');
      track('decomposition.offered', {
        steps: firstSteps.length,
        phases: phases.length,
        spread: answers.spread,
        hasDueDate: answers.dueDate != null,
      });
    } catch {
      setBdPhase('questions'); // stay put; the user can retry or dismiss
    } finally {
      setBdBusy(false);
    }
  }

  // Accept the chosen phase-one steps onto Today, plus a dated milestone task for
  // each later phase (each broken down later, when you reach it).
  function bdAccept(selected: ReviewStep[]) {
    const now = nowMs();
    const stepTasks: Task[] = selected.map((s, i) => ({
      id: makeId(),
      title: `${s.title} (${s.minutes} min)`,
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      complexity: s.minutes, // the step's effort, used to weight its completion
      ...(s.date ? { due: s.date } : {}),
    }));
    const phaseTasks: Task[] = (bdPhases ?? []).map((p, i) => ({
      id: makeId(),
      title: p.title,
      done: false,
      createdAt: now + selected.length + i,
      updatedAt: now + selected.length + i,
      ...(p.date ? { due: p.date } : {}),
    }));
    commit([...tasks, ...stepTasks, ...phaseTasks]);
    // The moat: how many of the offered steps the user kept, and how many phases.
    track('breakdown.added', {
      added: selected.length,
      offered: bdSteps?.length ?? selected.length,
      phases: phaseTasks.length,
      spread: bdAnswers?.spread ?? 'gradual',
    });
    resetBreakdown();
  }

  // Break down an existing task (e.g. a later-phase milestone when you reach it):
  // feed its title into the same flow. The task itself stays; the user can tick or
  // remove it once its steps are on the board.
  function breakdownExisting(title: string) {
    setConfirmingId(null);
    void biteElephant(title);
  }

  function resetBreakdown() {
    setBdPhase('off');
    setBdTask('');
    setBdQuestions(null);
    setBdSteps(null);
    setBdPhases(null);
    setBdAnswers(null);
    setBdBusy(false);
  }

  // AI triage: sort a brain-dump into buckets, then apply (later -> tomorrow; today
  // and decompose stay on Today). Opt-in via "Sort for me", so a direct apply is calm.
  // Lines the AI drops fall back to Today.
  async function sortDump(text: string) {
    const lines = parseDump(text);
    if (lines.length === 0) return;
    const items = await triage(lines);
    const added = triageToTasks(lines, items, today, nowMs(), makeId);
    commit([...tasks, ...added]);
    const summary = summarizeAdded(added);
    setSortSummary(summaryLine(summary));
    track('triage.applied', {
      total: lines.length,
      today: summary.today,
      later: summary.later,
      decompose: summary.decompose,
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.seven }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <Text style={styles.date}>{formatTodayLabel(today)}</Text>
          <View style={styles.topLinks}>
            <Pressable
              onPress={openDrawer}
              accessibilityRole="button"
              accessibilityLabel="Open repeating tasks"
              hitSlop={8}
            >
              <Text style={styles.lookbackLink}>Repeating</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/lookback')}
              accessibilityRole="button"
              accessibilityLabel="Open the Lookback calendar"
              hitSlop={8}
            >
              <Text style={styles.lookbackLink}>Lookback ›</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Open Settings"
              hitSlop={8}
            >
              <Text style={styles.gear}>⚙</Text>
            </Pressable>
          </View>
        </View>
        {reentry && !isClosed && (
          <View style={styles.reentry}>
            <Text style={styles.reentryTitle}>Welcome back.</Text>
            <Text style={styles.reentryBody}>
              {"However long it's been, the past is fine. Nothing's overdue, nothing's lost. Here's just today, when you're ready."}
            </Text>
            <Pressable
              onPress={() => setReentry(false)}
              accessibilityRole="button"
              accessibilityLabel="Start fresh"
              hitSlop={8}
              style={({ pressed }) => [styles.reentryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.reentryBtnText}>Start fresh</Text>
            </Pressable>
          </View>
        )}
        <Text style={styles.title}>Today</Text>
        <Text style={styles.spine}>Just today. The rest can wait.</Text>

        {isClosed && (
          <View style={styles.rested}>
            <View style={styles.restedArt}>
              <Image
                source={closeDayArt}
                style={styles.artFill}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessible
                accessibilityLabel="A calm dusk sky settling over a closed notebook"
              />
            </View>
            <Text style={styles.restedTitle}>{"You've closed today."}</Text>
            <Text style={styles.restedLine}>
              {todayDone.length > 0
                ? `You finished ${todayDone.length} ${todayDone.length === 1 ? 'thing' : 'things'} today. Rest well.`
                : "A quiet day, and that's allowed. Rest well."}
            </Text>
            <Text style={styles.restedSub}>{"It's all here tomorrow."}</Text>
            <Pressable
              onPress={reopenDay}
              accessibilityRole="button"
              accessibilityLabel="Reopen today"
              hitSlop={8}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.restedReopen}>Reopen today</Text>
            </Pressable>
          </View>
        )}

        {!isClosed && (
          <>
        <View style={styles.list}>
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              done={isDoneOn(task, today)}
              onToggle={() => toggle(task.id)}
              onLongPress={() => setConfirmingId(task.id)}
              confirming={confirmingId === task.id}
              onRemove={() => removeTask(task.id)}
              onKeep={() => setConfirmingId(null)}
              recurring={isRecurring(task)}
              slices={task.slices ?? undefined}
              onAdvance={() => step(task.id, 1)}
              onRetreat={() => step(task.id, -1)}
              onBreakdown={() => breakdownExisting(task.title)}
              onDefer={() => deferTask(task.id)}
              suggestBreakdown={task.suggestBreakdown}
            />
          ))}
        </View>

        {loaded && visible.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyArt}>
              <Image
                source={emptyArt}
                style={styles.artFill}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessible
                accessibilityLabel="A warm coffee beside an open notebook in morning light"
              />
            </View>
            <Text style={[styles.calmNote, styles.emptyNote]}>Nothing here yet. Add one thing, or enjoy the quiet.</Text>
          </View>
        )}
        {allDone && <Text style={styles.calmNote}>{"That's the list. Nicely done."}</Text>}

        {upcoming.length > 0 && (
          <View style={styles.later}>
            <Text style={styles.laterHeading}>Later</Text>
            {upcoming.map((task, i) => (
              <View key={task.id} style={styles.laterItem}>
                {(i === 0 || upcoming[i - 1].due !== task.due) && task.due && (
                  <Text style={styles.laterDate}>{friendlyDate(task.due, today)}</Text>
                )}
                <TaskRow
                  title={task.title}
                  done={isDoneOn(task, today)}
                  onToggle={() => toggle(task.id)}
                  onLongPress={() => setConfirmingId(task.id)}
                  confirming={confirmingId === task.id}
                  onRemove={() => removeTask(task.id)}
                  onKeep={() => setConfirmingId(null)}
                  recurring={isRecurring(task)}
                  slices={task.slices ?? undefined}
                  onAdvance={() => step(task.id, 1)}
                  onRetreat={() => step(task.id, -1)}
                  onBreakdown={() => breakdownExisting(task.title)}
                />
              </View>
            ))}
          </View>
        )}
        {loaded && (
          <View style={styles.dayActions}>
            {spreadable.length >= 2 && (
              <>
                {spreadable.length >= 6 && <Text style={styles.strategiseNudge}>{"Today's looking full."}</Text>}
                <Pressable
                  onPress={runStrategise}
                  disabled={strategising}
                  style={({ pressed }) => [styles.strategiseBtn, pressed && styles.pressed, strategising && styles.disabledBtn]}
                  accessibilityRole="button"
                  accessibilityLabel="Strategise the day"
                >
                  <Text style={styles.strategiseBtnText}>{strategising ? 'Strategising…' : 'Strategise'}</Text>
                </Pressable>
                {strategiseError && <Text style={styles.strategiseErr}>{strategiseError}</Text>}
              </>
            )}
            {spreadable.length > 0 && (
              <Pressable
                onPress={openFocus}
                accessibilityRole="button"
                accessibilityLabel="Focus on one thing"
                hitSlop={6}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.focusLink}>Focus on one thing</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setDidOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Log something you also did"
              hitSlop={6}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.alsoDidLink}>+ I also did that</Text>
            </Pressable>
            <Pressable
              onPress={openClose}
              style={({ pressed }) => [styles.closeDay, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close the day"
            >
              <Text style={styles.closeDayText}>Close the day</Text>
            </Pressable>
          </View>
        )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.four }]}>
        {!isClosed && sortSummary && <Text style={styles.sortSummary}>{sortSummary}</Text>}
        {!isClosed && <BrainDump onCapture={capture} onBiteElephant={biteElephant} onSort={sortDump} today={today} />}
        {isSyncConfigured &&
          (session ? (
            <View style={styles.syncRow}>
              <Text style={styles.syncText} numberOfLines={1}>
                Synced to {session.user.email ?? 'your account'}
              </Text>
              <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={8}>
                <Text style={styles.syncAction}>Sign out</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/sign-in')}
              accessibilityRole="button"
              accessibilityLabel="Sync across devices"
            >
              <Text style={styles.sync}>Sync across devices</Text>
            </Pressable>
          ))}
        {Platform.OS !== 'web' && (
          <Pressable
            onPress={toggleReminder}
            accessibilityRole="button"
            accessibilityLabel="Toggle daily reminder"
            hitSlop={6}
          >
            <Text style={styles.sync}>Daily reminder · {reminderOn ? 'On' : 'Off'}</Text>
          </Pressable>
        )}
        <View style={styles.ethos}>
          <RotatingPhrase />
        </View>
      </View>

      <Modal visible={focusOpen} animationType="fade" onRequestClose={closeFocus}>
        <View style={styles.focusScreen}>
          <Pressable
            onPress={closeFocus}
            accessibilityRole="button"
            accessibilityLabel="Exit focus"
            hitSlop={10}
            style={({ pressed }) => [styles.focusExit, pressed && styles.pressed]}
          >
            <Text style={styles.focusExitText}>Exit</Text>
          </Pressable>
          {focusTask ? (
            <View style={styles.focusBody}>
              <Text style={styles.focusLabel}>Just this one</Text>
              <Text style={styles.focusTitle}>{focusTask.title}</Text>
              {focusTask.slices ? (
                <Text style={styles.focusStep}>
                  Step {Math.min(focusTask.slices.done + 1, focusTask.slices.total)} of {focusTask.slices.total}
                </Text>
              ) : null}
              <View style={styles.focusActions}>
                <Pressable
                  onPress={() => focusSkip(focusTask.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Not this one"
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Text style={styles.focusSkipText}>Not this one</Text>
                </Pressable>
                <Pressable
                  onPress={() => focusComplete(focusTask.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Done with ${focusTask.title}`}
                  style={({ pressed }) => [styles.focusDoneBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.focusDoneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.focusBody}>
              <Text style={styles.focusTitle}>{"That's everything for now."}</Text>
              <Text style={styles.focusEmptyNote}>{"Nothing left to focus on. Rest, or add something when you're ready."}</Text>
              <Pressable
                onPress={closeFocus}
                accessibilityRole="button"
                accessibilityLabel="Back to Today"
                style={({ pressed }) => [styles.focusDoneBtn, pressed && styles.pressed]}
              >
                <Text style={styles.focusDoneText}>Back to Today</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={didOpen} transparent animationType="fade" onRequestClose={() => setDidOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDidOpen(false)} accessibilityLabel="Dismiss">
          <Pressable style={styles.wrapCard} onPress={() => {}}>
            <Text style={styles.didTitle}>What did you do?</Text>
            <Text style={styles.didHint}>{"Something you got done that was never on the list. It still counts."}</Text>
            <TextInput
              style={styles.didInput}
              value={didText}
              onChangeText={setDidText}
              placeholder="Made the call, took a walk…"
              placeholderTextColor={theme.colors.inkFaint}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => logDidIt(didText)}
              accessibilityLabel="What did you do"
            />
            <View style={styles.didActions}>
              <Pressable
                onPress={() => {
                  setDidText('');
                  setDidOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                hitSlop={8}
              >
                <Text style={styles.didCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => logDidIt(didText)}
                accessibilityRole="button"
                accessibilityLabel="Add it"
                style={({ pressed }) => [styles.didAddBtn, pressed && styles.pressed]}
              >
                <Text style={styles.didAddText}>Add it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={closing} transparent animationType="fade" onRequestClose={() => setClosing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setClosing(false)} accessibilityLabel="Dismiss">
          <Animated.View
            style={[
              styles.wrapAnim,
              {
                opacity: closeRise,
                transform: [{ translateY: closeRise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              },
            ]}
          >
            <Pressable style={styles.wrapCard} onPress={() => {}}>
              <View style={styles.wrapArt}>
                <Image
                  source={closeDayArt}
                  style={styles.artFill}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  accessible
                  accessibilityLabel="A calm dusk sky settling over a closed notebook"
                />
              </View>
              <Text style={styles.wrapTitle}>{"That's the day"}</Text>
              {todayDone.length > 0 ? (
                <>
                  <Text style={styles.wrapLine}>
                    You finished {todayDone.length} {todayDone.length === 1 ? 'thing' : 'things'} today
                    {todayDone.some((c) => c.big) ? ', one a big one' : ''}.
                  </Text>
                  <View style={styles.wrapList}>
                    {todayDone.map((c) => (
                      <View key={c.id} style={styles.wrapItem}>
                        <Text style={styles.wrapCheck}>✓</Text>
                        <Text style={styles.wrapItemText}>{c.title}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.wrapLine}>A quiet day. That is allowed.</Text>
              )}
              <Text style={styles.wrapRoll}>Anything left rolls to tomorrow. Nothing is lost.</Text>
              <Pressable
                onPress={() => {
                  setClosing(false);
                  setClosedDate(toISODate(today));
                  void saveClosedDate(toISODate(today));
                }}
                style={({ pressed }) => [styles.wrapBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Goodnight"
              >
                <Text style={styles.wrapBtnText}>Goodnight</Text>
              </Pressable>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={plan != null} transparent animationType="fade" onRequestClose={() => setPlan(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPlan(null)} accessibilityLabel="Dismiss">
          <Pressable style={styles.wrapCard} onPress={() => {}}>
            <Text style={styles.wrapTitle}>A calmer spread</Text>
            <Text style={styles.wrapLine}>{"Keep today lighter. Here's where the rest could go."}</Text>
            <View style={styles.wrapList}>
              {(plan ?? []).map((p) => {
                const t = tasks.find((x) => x.id === p.id);
                if (!t) return null;
                const when = p.dayOffset <= 0 ? 'Today' : p.dayOffset === 1 ? 'Tomorrow' : `In ${p.dayOffset} days`;
                return (
                  <View key={p.id} style={styles.planItem}>
                    <Text style={styles.planTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.planWhen}>{when}</Text>
                  </View>
                );
              })}
            </View>
            <Pressable
              onPress={acceptPlan}
              style={({ pressed }) => [styles.wrapBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Use this spread"
            >
              <Text style={styles.wrapBtnText}>Use this spread</Text>
            </Pressable>
            <Pressable onPress={() => setPlan(null)} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={styles.planDismiss}>Not now</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <RepeatingDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        tasks={tasks}
        today={today}
        onToggle={toggle}
      />

      {bdPhase === 'questions' && bdQuestions && (
        <BreakdownQuestions
          key={bdTask}
          task={bdTask}
          questions={bdQuestions}
          busy={bdBusy}
          onSubmit={bdSubmitQuestions}
          onCancel={resetBreakdown}
          today={today}
        />
      )}
      {bdPhase === 'review' && bdSteps && (
        <BreakdownReview
          key={bdTask}
          task={bdTask}
          steps={bdSteps}
          laterPhases={bdPhases ?? undefined}
          busy={bdBusy}
          onAdd={bdAccept}
          onCancel={resetBreakdown}
          today={today}
        />
      )}
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
      maxWidth: 560,
      width: '100%',
      alignSelf: 'center',
    },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.one },
    date: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
    lookbackLink: { color: t.colors.accent, fontSize: 15 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    gear: { color: t.colors.accent, fontSize: 22 * t.scale, fontFamily: fonts.body },
    topLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
    title: {
      color: t.colors.ink,
      fontSize: 34 * t.scale,
      fontWeight: '700',
      fontFamily: fonts.sans,
      letterSpacing: -0.5,
    },
    spine: { color: t.colors.inkSoft, fontSize: 16 * t.scale, marginTop: spacing.two, marginBottom: spacing.six, fontFamily: fonts.body },
    list: { gap: spacing.two },
    calmNote: { color: t.colors.inkSoft, fontSize: 16 * t.scale, marginTop: spacing.five, lineHeight: 24, fontFamily: fonts.body },
    emptyState: { alignItems: 'center' },
    emptyArt: { width: '100%', maxWidth: 420, aspectRatio: 16 / 9, borderRadius: radius.lg, marginTop: spacing.five, overflow: 'hidden' },
    emptyNote: { textAlign: 'center' },
    artFill: { position: 'absolute', width: '100%', height: '100%' },
    later: { marginTop: spacing.seven, gap: spacing.two },
    laterHeading: {
      color: t.colors.inkFaint,
      fontSize: 13 * t.scale,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: spacing.one,
      fontFamily: fonts.bodyBold,
    },
    laterItem: { gap: spacing.two },
    laterDate: { color: t.colors.inkSoft, fontSize: 13 * t.scale, marginTop: spacing.two, fontFamily: fonts.body },
    footer: {
      paddingHorizontal: spacing.five,
      paddingTop: spacing.three,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.line,
      backgroundColor: t.colors.bg,
      maxWidth: 560,
      width: '100%',
      alignSelf: 'center',
    },
    sync: {
      color: t.colors.inkFaint,
      fontSize: 13 * t.scale,
      textAlign: 'center',
      marginTop: spacing.three,
      fontFamily: fonts.body,
    },
    syncRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.three,
      marginTop: spacing.three,
    },
    syncText: { color: t.colors.inkFaint, fontSize: 13 * t.scale, flexShrink: 1, fontFamily: fonts.body },
    syncAction: { color: t.colors.accent, fontSize: 13 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    ethos: { marginTop: spacing.three, alignItems: 'center' },
    sortSummary: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginBottom: spacing.two },
    reentry: {
      backgroundColor: t.colors.accentSoft,
      borderRadius: radius.lg,
      paddingVertical: spacing.five,
      paddingHorizontal: spacing.five,
      gap: spacing.three,
      marginBottom: spacing.five,
    },
    reentryTitle: { color: t.colors.ink, fontSize: 22 * t.scale, fontFamily: fonts.sans, fontWeight: '700', letterSpacing: -0.3 },
    reentryBody: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 24, fontFamily: fonts.body },
    reentryBtn: {
      alignSelf: 'flex-start',
      paddingVertical: spacing.two,
      paddingHorizontal: spacing.five,
      borderRadius: radius.md,
      backgroundColor: t.colors.accent,
      marginTop: spacing.one,
    },
    reentryBtnText: { color: '#FFFFFF', fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    dayActions: { marginTop: spacing.seven, alignItems: 'center', gap: spacing.three },
    closeDay: {
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.five,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    closeDayText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    rested: { alignItems: 'center', gap: spacing.three, paddingTop: spacing.five, paddingBottom: spacing.four },
    restedArt: {
      width: '100%',
      maxWidth: 300,
      aspectRatio: 3 / 2,
      borderRadius: radius.lg,
      overflow: 'hidden',
      marginBottom: spacing.two,
    },
    restedTitle: { color: t.colors.ink, fontSize: 26 * t.scale, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.3, textAlign: 'center' },
    restedLine: { color: t.colors.ink, fontSize: 17 * t.scale, lineHeight: 24, fontFamily: fonts.body, textAlign: 'center' },
    restedSub: { color: t.colors.inkFaint, fontSize: 14 * t.scale, lineHeight: 20, fontFamily: fonts.body, textAlign: 'center' },
    restedReopen: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.three },
    strategiseNudge: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    strategiseBtn: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.accent,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.five,
    },
    strategiseBtnText: { color: t.colors.accent, fontSize: 16 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    strategiseErr: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
    disabledBtn: { opacity: 0.5 },
    planItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three },
    planTitle: { color: t.colors.ink, fontSize: 16 * t.scale, flexShrink: 1, fontFamily: fonts.body },
    planWhen: { color: t.colors.accent, fontSize: 14 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
    planDismiss: { color: t.colors.inkSoft, fontSize: 15 * t.scale, textAlign: 'center', marginTop: spacing.two, fontFamily: fonts.body },
    pressed: { opacity: 0.85 },
    alsoDidLink: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    didTitle: { color: t.colors.ink, fontSize: 21 * t.scale, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.3 },
    didHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 20, fontFamily: fonts.body },
    didInput: {
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingVertical: spacing.three,
      paddingHorizontal: spacing.four,
      fontSize: 17 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
      backgroundColor: t.colors.surface,
      marginTop: spacing.one,
    },
    didActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.five, marginTop: spacing.two },
    didCancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    didAddBtn: { paddingVertical: spacing.two, paddingHorizontal: spacing.five, borderRadius: radius.md, backgroundColor: t.colors.accent },
    didAddText: { color: '#FFFFFF', fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    focusLink: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    focusScreen: { flex: 1, backgroundColor: t.colors.bg, padding: spacing.six, justifyContent: 'center', alignItems: 'center' },
    focusExit: { position: 'absolute', top: spacing.seven, left: spacing.five },
    focusExitText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    focusBody: { alignItems: 'center', gap: spacing.four, maxWidth: 440, width: '100%' },
    focusLabel: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    focusTitle: { color: t.colors.ink, fontSize: 30 * t.scale, lineHeight: 38, fontFamily: fonts.sans, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
    focusStep: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body },
    focusEmptyNote: { color: t.colors.inkSoft, fontSize: 16 * t.scale, lineHeight: 24, fontFamily: fonts.body, textAlign: 'center' },
    focusActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.six, marginTop: spacing.four },
    focusSkipText: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    focusDoneBtn: { paddingVertical: spacing.three, paddingHorizontal: spacing.seven, borderRadius: radius.md, backgroundColor: t.colors.accent },
    focusDoneText: { color: '#FFFFFF', fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(43,39,34,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.five,
    },
    wrapAnim: { width: '100%', maxWidth: 420 },
    wrapCard: {
      backgroundColor: t.colors.bg,
      borderRadius: radius.lg,
      padding: spacing.six,
      width: '100%',
      maxWidth: 420,
      gap: spacing.three,
    },
    wrapArt: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, marginBottom: spacing.one, overflow: 'hidden' },
    wrapTitle: { color: t.colors.ink, fontSize: 26 * t.scale, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.3 },
    wrapLine: { color: t.colors.ink, fontSize: 17 * t.scale, lineHeight: 24, fontFamily: fonts.body },
    wrapList: { gap: spacing.two, marginTop: spacing.one },
    wrapItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
    wrapCheck: { color: t.colors.done, fontSize: 16 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
    wrapItemText: { color: t.colors.inkSoft, fontSize: 16 * t.scale, flexShrink: 1, fontFamily: fonts.body },
    wrapRoll: { color: t.colors.inkFaint, fontSize: 14 * t.scale, lineHeight: 20, marginTop: spacing.two, fontFamily: fonts.body },
    wrapBtn: { backgroundColor: t.colors.accent, borderRadius: radius.md, paddingVertical: spacing.four, alignItems: 'center', marginTop: spacing.three },
    wrapBtnText: { color: '#FFFFFF', fontSize: 16 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
  });
