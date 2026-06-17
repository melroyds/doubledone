import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrainDump } from '@/components/BrainDump';
import { TaskRow } from '@/components/TaskRow';
import { colors, fonts, spacing } from '@/constants/theme';
import { formatTodayLabel, friendlyDate } from '@/lib/day';
import { scheduleFields, type CaptureSchedule } from '@/lib/recurrence';
import { loadTasks, saveTasks } from '@/lib/storage';
import { parseDump, type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { isDoneOn, tasksForToday, toggleDoneOn, upcomingTasks } from '@/lib/today';

let addCounter = 0;
function makeId(): string {
  addCounter += 1;
  return `t-${Date.now().toString(36)}-${addCounter.toString(36)}`;
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const today = useMemo(() => new Date(), []);

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

  const visible = tasksForToday(tasks, today);
  const upcoming = upcomingTasks(tasks, today);
  const allDone = loaded && visible.length > 0 && visible.every((t) => isDoneOn(t, today));

  function commit(next: Task[]) {
    setTasks(next);
    void saveTasks(next);
  }

  function toggle(id: string) {
    const next = tasks.map((t) => (t.id === id ? toggleDoneOn(t, today) : t));
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
    const now = Date.now();
    const fields = scheduleFields(schedule, today); // due / recurrence for the chosen when
    const added: Task[] = titles.map((title, i) => ({
      id: makeId(),
      title,
      done: false,
      createdAt: now + i,
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

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.seven }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.date}>{formatTodayLabel(today)}</Text>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.spine}>Just today. The rest can wait.</Text>

        <View style={styles.list}>
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              done={isDoneOn(task, today)}
              onToggle={() => toggle(task.id)}
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
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.four }]}>
        <BrainDump onCapture={capture} today={today} />
        <Text style={styles.ethos}>today is finite and achievable</Text>
      </View>
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
  date: { color: colors.inkSoft, fontSize: 15, marginBottom: spacing.one },
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
  ethos: {
    color: colors.inkFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.three,
    letterSpacing: 0.3,
  },
});
