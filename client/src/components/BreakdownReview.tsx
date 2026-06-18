import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/constants/theme';
import { friendlyDate } from '@/lib/day';

export type ReviewStep = { title: string; minutes: number; date: string | null };

type Props = {
  task: string;
  steps: ReviewStep[];
  busy: boolean;
  onAdd: (selected: ReviewStep[]) => void;
  onCancel: () => void;
  today: Date;
};

// Break it down, step 2: the steps the AI proposed, as a checklist. All ticked by
// default; untick the ones you do not want, then add the rest. Nothing lands on
// your day until you accept, and the dates were worked out from your answers.
export function BreakdownReview({ task, steps, busy, onAdd, onCancel, today }: Props) {
  const [selected, setSelected] = useState<boolean[]>(() => steps.map(() => true));
  const count = selected.filter(Boolean).length;

  function toggle(i: number) {
    setSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function add() {
    if (busy || count === 0) return;
    onAdd(steps.filter((_step, i) => selected[i]));
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss">
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>{"Here's the plan"}</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {task}
            </Text>
            <Text style={styles.hint}>Tap to keep or skip any step.</Text>

            <View style={styles.list}>
              {steps.map((s, i) => {
                const on = selected[i];
                return (
                  <Pressable
                    key={`${s.title}-${i}`}
                    onPress={() => toggle(i)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${s.title}, ${s.minutes} minutes, ${s.date == null ? 'Today' : friendlyDate(s.date, today)}`}
                  >
                    <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
                    <View style={styles.rowText}>
                      <Text style={[styles.stepTitle, !on && styles.stepOff]} numberOfLines={2}>
                        {s.title}
                      </Text>
                      <Text style={styles.meta}>
                        {s.minutes} min · {s.date == null ? 'Today' : friendlyDate(s.date, today)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={add}
              disabled={busy || count === 0}
              style={({ pressed }) => [styles.btn, pressed && styles.pressed, (busy || count === 0) && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel={`Add ${count} ${count === 1 ? 'task' : 'tasks'}`}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.btnText}>
                  Add {count} {count === 1 ? 'task' : 'tasks'}
                </Text>
              )}
            </Pressable>
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={styles.dismiss}>Not now</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43,39,34,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.five,
  },
  card: { backgroundColor: colors.bg, borderRadius: radius.lg, width: '100%', maxWidth: 440, maxHeight: '88%' },
  scroll: { padding: spacing.six, gap: spacing.three },
  title: { color: colors.ink, fontSize: 24, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.3 },
  sub: { color: colors.inkSoft, fontSize: 15 },
  hint: { color: colors.inkFaint, fontSize: 13 },
  list: { gap: spacing.two, marginTop: spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.three,
    paddingVertical: spacing.three,
    paddingHorizontal: spacing.three,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.done, borderColor: colors.done },
  tick: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  rowText: { flex: 1 },
  stepTitle: { color: colors.ink, fontSize: 16, lineHeight: 21 },
  stepOff: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  meta: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.four,
    alignItems: 'center',
    marginTop: spacing.three,
  },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  dismiss: { color: colors.inkSoft, fontSize: 15, textAlign: 'center', marginTop: spacing.two },
});
