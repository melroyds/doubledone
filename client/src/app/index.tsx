import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddTaskBar } from '@/components/AddTaskBar';
import { TaskRow } from '@/components/TaskRow';
import { colors, fonts, spacing } from '@/constants/theme';
import { formatTodayLabel } from '@/lib/day';
import { track } from '@/lib/telemetry';

type Task = { id: string; title: string; done: boolean };

// Seed tasks make the shell feel alive on first open. They live in memory only
// (a real on-device store lands next, BUILD-PLAN steps 2-3), so a reload resets
// them. The third one previews the Bite-the-Elephant ethos: shrink the dreaded
// thing to a first step you can actually start.
const SEED: Task[] = [
  { id: 's1', title: 'Drink a glass of water', done: false },
  { id: 's2', title: "Reply to Sam's message", done: false },
  { id: 's3', title: 'Start the laundry, just sort the pile', done: false },
];

let nextId = 0;

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>(SEED);
  const today = useMemo(() => new Date(), []);

  const remaining = tasks.filter((t) => !t.done).length;
  const allDone = tasks.length > 0 && remaining === 0;

  function toggle(id: string) {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      const justToggled = next.find((t) => t.id === id);
      // The moat starts at the call site: log the outcome, not just "done".
      track('task.toggled', { done: justToggled?.done ?? false });
      if (next.length > 0 && next.every((t) => t.done)) {
        track('day.cleared', { count: next.length });
      }
      return next;
    });
  }

  function add(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    nextId += 1;
    setTasks((prev) => [...prev, { id: `t${nextId}`, title: trimmed, done: false }]);
    track('task.added');
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
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              done={task.done}
              onToggle={() => toggle(task.id)}
            />
          ))}
        </View>

        {tasks.length === 0 && (
          <Text style={styles.calmNote}>Nothing here yet. Add one thing, or enjoy the quiet.</Text>
        )}
        {allDone && <Text style={styles.calmNote}>{"That's the list. Nicely done."}</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.four }]}>
        <AddTaskBar onAdd={add} />
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
