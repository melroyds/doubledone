import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { friendlyDate } from '@/lib/day';
import { useThemedStyles } from '@/lib/theme-provider';

export type ReviewStep = { title: string; minutes: number; date: string | null };
export type ReviewPhase = { title: string; date: string | null };

type Props = {
  task: string;
  steps: ReviewStep[];
  laterPhases?: ReviewPhase[];
  busy: boolean;
  onAdd: (selected: ReviewStep[]) => void;
  onCancel: () => void;
  today: Date;
};

// Break it down, step 2: the steps the AI proposed for the first phase, as a
// checklist (untick any, then add the rest). For a big task it also shows the
// later phases that will wait in Later, each broken down when you reach it.
// Nothing lands on your day until you accept; the dates came from your answers.
export function BreakdownReview({ task, steps, laterPhases, busy, onAdd, onCancel, today }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState<boolean[]>(() => steps.map(() => true));
  const phaseCount = laterPhases?.length ?? 0;
  const count = selected.filter(Boolean).length + phaseCount;

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
                      <Text style={[styles.stepTitle, !on && styles.stepOff]}>{s.title}</Text>
                      <Text style={styles.meta}>
                        {s.minutes} min · {s.date == null ? 'Today' : friendlyDate(s.date, today)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {phaseCount > 0 && (
              <View style={styles.phases}>
                <Text style={styles.phasesHead}>Then, as you get there</Text>
                {laterPhases!.map((p, i) => (
                  <View key={`${p.title}-${i}`} style={styles.phaseRow}>
                    <Text style={styles.phaseTitle} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <Text style={styles.phaseDate}>{p.date == null ? 'Today' : friendlyDate(p.date, today)}</Text>
                  </View>
                ))}
                <Text style={styles.phasesNote}>These wait in Later. Break each one down when you reach it.</Text>
              </View>
            )}

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

const makeStyles = (t: Theme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43,39,34,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.five,
  },
  card: { backgroundColor: t.colors.bg, borderRadius: radius.lg, width: '100%', maxWidth: 440, maxHeight: '88%' },
  scroll: { padding: spacing.six, gap: spacing.three },
  title: { color: t.colors.ink, fontSize: 24 * t.scale, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.3 },
  sub: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
  hint: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body },
  list: { gap: spacing.two, marginTop: spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start', // titles can wrap to several lines; keep the tick at the top
    gap: spacing.three,
    paddingVertical: spacing.four,
    paddingHorizontal: spacing.four,
    backgroundColor: t.colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.line,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: t.colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: t.colors.done, borderColor: t.colors.done },
  tick: { color: '#FFFFFF', fontSize: 14 * t.scale, fontWeight: '700', lineHeight: 16, fontFamily: fonts.body },
  rowText: { flex: 1 },
  stepTitle: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 21, fontFamily: fonts.body },
  stepOff: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
  meta: { color: t.colors.inkSoft, fontSize: 13 * t.scale, marginTop: 2, fontFamily: fonts.body },
  phases: { gap: spacing.two, marginTop: spacing.three },
  phasesHead: {
    color: t.colors.inkFaint,
    fontSize: 13 * t.scale,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: fonts.body,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.three,
    paddingVertical: spacing.three,
    paddingHorizontal: spacing.four,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderStyle: 'dashed',
  },
  phaseTitle: { color: t.colors.inkSoft, fontSize: 15 * t.scale, flex: 1, fontFamily: fonts.body },
  phaseDate: { color: t.colors.repeat, fontSize: 13 * t.scale, fontWeight: '600', fontFamily: fonts.body },
  phasesNote: { color: t.colors.inkFaint, fontSize: 12 * t.scale, lineHeight: 17, fontFamily: fonts.body },
  btn: {
    backgroundColor: t.colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.four,
    alignItems: 'center',
    marginTop: spacing.three,
  },
  btnText: { color: '#FFFFFF', fontSize: 16 * t.scale, fontWeight: '600', fontFamily: fonts.body },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  dismiss: { color: t.colors.inkSoft, fontSize: 15 * t.scale, textAlign: 'center', marginTop: spacing.two, fontFamily: fonts.body },
});
