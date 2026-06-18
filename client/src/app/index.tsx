import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrainDump } from '@/components/BrainDump';
import { RepeatingDrawer } from '@/components/RepeatingDrawer';
import { TaskRow } from '@/components/TaskRow';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { decompose, strategise, triage, type PlanItem } from '@/lib/ai';
import { useSession } from '@/lib/auth';
import { completionsByDay } from '@/lib/calendar';
import { addDaysISO, formatTodayLabel, friendlyDate, toISODate } from '@/lib/day';
import { scheduleFields, type CaptureSchedule } from '@/lib/recurrence';
import { loadTasks, saveTasks } from '@/lib/storage';
import { isSyncConfigured, supabase } from '@/lib/supabase';
import { syncOnce } from '@/lib/sync';
import { parseDump, type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { isDoneOn, isRecurring, tasksForToday, toggleDoneOn, upcomingTasks } from '@/lib/today';

let addCounter = 0;
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
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [strategising, setStrategising] = useState(false);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [strategiseError, setStrategiseError] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);
  const router = useRouter();
  const session = useSession();
  const tasksRef = useRef<Task[]>(tasks);

  // Load the persisted list once. Until it arrives we hold off on the empty and
  // all-done copy so neither flashes before the real tasks land.
  useEffect(() => {
    let active = true;
    void loadTasks().then((stored) => {
      if (!active) return;
      setTasks(stored);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Keep the latest tasks reachable from the sync effect without making it re-run
  // on every edit (which would re-sync constantly).
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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

  const visible = tasksForToday(tasks, today);
  const upcoming = upcomingTasks(tasks, today);
  const allDone = loaded && visible.length > 0 && visible.every((t) => isDoneOn(t, today));
  const todayDone = useMemo(() => completionsByDay(tasks).get(toISODate(today)) ?? [], [tasks, today]);
  // One-off, undone tasks on Today: the ones Strategise can re-spread (recurring stay by cadence).
  const spreadable = visible.filter((t) => !isRecurring(t) && !isDoneOn(t, today));

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

  function openDrawer() {
    setDrawerOpen(true);
    track('repeating.opened');
  }

  // Strategise: hand today's one-offs to the AI, get a calm re-spread, then PROPOSE
  // it (the user accepts). Never rearranges the day on its own.
  async function runStrategise() {
    if (strategising) return;
    setStrategiseError(null);
    setStrategising(true);
    try {
      const result = await strategise(spreadable.map((t) => ({ id: t.id, title: t.title })));
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

  function capture(text: string, schedule: CaptureSchedule) {
    const titles = parseDump(text);
    if (titles.length === 0) return;
    const now = nowMs();
    const fields = scheduleFields(schedule, today); // due / recurrence for the chosen when
    const added: Task[] = titles.map((title, i) => ({
      id: makeId(),
      title,
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      ...fields,
    }));
    commit([...tasks, ...added]);
    // One line is a quick add; several is a genuine brain-dump. Log the shape and
    // the chosen schedule so the moat can learn how this audience really captures.
    track(titles.length > 1 ? 'brain_dump.captured' : 'task.added', {
      count: titles.length,
      schedule: schedule.mode,
    });
  }

  // Bite the Elephant: hand a dreaded task to the AI, drop the steps into Today.
  async function biteElephant(text: string) {
    const steps = await decompose(text);
    if (steps.length === 0) throw new Error('no steps');
    const now = nowMs();
    const added: Task[] = steps.map((s, i) => ({
      id: makeId(),
      title: `${s.title} (${s.minutes} min)`,
      done: false,
      createdAt: now + i,
      updatedAt: now + i,
      complexity: s.minutes, // the step's effort, used to weight its completion
    }));
    commit([...tasks, ...added]);
    track('decomposition.offered', { steps: steps.length });
  }

  // AI triage: sort a brain-dump into buckets, then apply (later -> tomorrow; today
  // and decompose stay on Today). Opt-in via "Sort for me", so a direct apply is calm.
  // Lines the AI drops fall back to Today.
  async function sortDump(text: string) {
    const lines = parseDump(text);
    if (lines.length === 0) return;
    const items = await triage(lines);
    const bucketOf = new Map(items.map((it) => [it.text, it.bucket]));
    const now = nowMs();
    const added: Task[] = lines.map((title, i) => {
      const base = { id: makeId(), title, done: false, createdAt: now + i, updatedAt: now + i };
      return bucketOf.get(title) === 'later' ? { ...base, due: addDaysISO(today, 1) } : base;
    });
    commit([...tasks, ...added]);
    track('triage.applied', {
      total: lines.length,
      today: items.filter((it) => it.bucket === 'today').length,
      later: items.filter((it) => it.bucket === 'later').length,
      decompose: items.filter((it) => it.bucket === 'decompose').length,
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
          </View>
        </View>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.spine}>Just today. The rest can wait.</Text>

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
            />
          ))}
        </View>

        {loaded && visible.length === 0 && (
          <Text style={styles.calmNote}>Nothing here yet. Add one thing, or enjoy the quiet.</Text>
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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.four }]}>
        <BrainDump onCapture={capture} onBiteElephant={biteElephant} onSort={sortDump} today={today} />
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
        <Text style={styles.ethos}>today is finite and achievable</Text>
      </View>

      <Modal visible={closing} transparent animationType="fade" onRequestClose={() => setClosing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setClosing(false)} accessibilityLabel="Dismiss">
          <Pressable style={styles.wrapCard} onPress={() => {}}>
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
              onPress={() => setClosing(false)}
              style={({ pressed }) => [styles.wrapBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Goodnight"
            >
              <Text style={styles.wrapBtnText}>Goodnight</Text>
            </Pressable>
          </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.five,
    paddingBottom: spacing.six,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.one },
  date: { color: colors.inkSoft, fontSize: 15 },
  lookbackLink: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  topLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '700',
    fontFamily: fonts.sans,
    letterSpacing: -0.5,
  },
  spine: { color: colors.inkSoft, fontSize: 16, marginTop: spacing.two, marginBottom: spacing.six },
  list: { gap: spacing.two },
  calmNote: { color: colors.inkSoft, fontSize: 16, marginTop: spacing.five, lineHeight: 24 },
  later: { marginTop: spacing.seven, gap: spacing.two },
  laterHeading: {
    color: colors.inkFaint,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.one,
  },
  laterItem: { gap: spacing.two },
  laterDate: { color: colors.inkSoft, fontSize: 13, marginTop: spacing.two },
  footer: {
    paddingHorizontal: spacing.five,
    paddingTop: spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  sync: {
    color: colors.inkFaint,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.three,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.three,
    marginTop: spacing.three,
  },
  syncText: { color: colors.inkFaint, fontSize: 13, flexShrink: 1 },
  syncAction: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  ethos: {
    color: colors.inkFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.three,
    letterSpacing: 0.3,
  },
  dayActions: { marginTop: spacing.seven, alignItems: 'center', gap: spacing.three },
  closeDay: {
    paddingVertical: spacing.three,
    paddingHorizontal: spacing.five,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  closeDayText: { color: colors.inkSoft, fontSize: 15, fontWeight: '600' },
  strategiseNudge: { color: colors.inkSoft, fontSize: 14 },
  strategiseBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: spacing.three,
    paddingHorizontal: spacing.five,
  },
  strategiseBtnText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  strategiseErr: { color: colors.accent, fontSize: 13 },
  disabledBtn: { opacity: 0.5 },
  planItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three },
  planTitle: { color: colors.ink, fontSize: 16, flexShrink: 1 },
  planWhen: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  planDismiss: { color: colors.inkSoft, fontSize: 15, textAlign: 'center', marginTop: spacing.two },
  pressed: { opacity: 0.85 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43,39,34,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.five,
  },
  wrapCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.six,
    width: '100%',
    maxWidth: 420,
    gap: spacing.three,
  },
  wrapTitle: { color: colors.ink, fontSize: 26, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.3 },
  wrapLine: { color: colors.ink, fontSize: 17, lineHeight: 24 },
  wrapList: { gap: spacing.two, marginTop: spacing.one },
  wrapItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  wrapCheck: { color: colors.done, fontSize: 16, fontWeight: '700' },
  wrapItemText: { color: colors.inkSoft, fontSize: 16, flexShrink: 1 },
  wrapRoll: { color: colors.inkFaint, fontSize: 14, lineHeight: 20, marginTop: spacing.two },
  wrapBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.four, alignItems: 'center', marginTop: spacing.three },
  wrapBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
