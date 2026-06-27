import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CheckCircle } from '@/components/CheckCircle';
import { ModalCard } from '@/components/ModalCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { friendlyDate } from '@/lib/day';
import { describePace, paceDays } from '@/lib/estimate';
import { track } from '@/lib/telemetry';
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
  const days = paceDays(steps, phaseCount);

  // Moat surface: log that a pace estimate was shown, with its day count (pairs
  // with the decomposition.offered + step-completion telemetry that will, at
  // scale, turn this into a real anonymised cross-user estimate).
  useEffect(() => {
    track('estimate.shown', { days });
  }, [days]);

  function toggle(i: number) {
    setSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function add() {
    if (busy || count === 0) return;
    onAdd(steps.filter((_step, i) => selected[i]));
  }

  return (
    <ModalCard visible onClose={onCancel} maxWidth={440} maxHeight="88%" scroll>
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
                    <CheckCircle done={on} />
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

            <Text style={styles.pace} accessibilityRole="text">
              {describePace(days)}
            </Text>

            <PrimaryButton
              label={`Add ${count} ${count === 1 ? 'task' : 'tasks'}`}
              onPress={add}
              loading={busy}
              disabled={count === 0}
              accessibilityLabel={`Add ${count} ${count === 1 ? 'task' : 'tasks'}`}
              style={styles.btn}
            />
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={styles.dismiss}>Not now</Text>
            </Pressable>
      </ScrollView>
    </ModalCard>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  scroll: { padding: spacing.six, gap: spacing.three },
  title: { ...t.type.heading, color: t.colors.ink, letterSpacing: -0.3 },
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
    borderWidth: border.hair,
    borderColor: t.colors.line,
  },
  rowText: { flex: 1 },
  stepTitle: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 21 * t.scale, fontFamily: fonts.body },
  stepOff: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
  meta: { color: t.colors.inkSoft, fontSize: 13 * t.scale, marginTop: spacing.half, fontFamily: fonts.body },
  phases: { gap: spacing.two, marginTop: spacing.three },
  phasesHead: {
    ...t.type.eyebrow,
    color: t.colors.inkFaint,
    textTransform: 'uppercase',
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.three,
    paddingVertical: spacing.three,
    paddingHorizontal: spacing.four,
    borderRadius: radius.md,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    borderStyle: 'dashed',
  },
  phaseTitle: { color: t.colors.inkSoft, fontSize: 15 * t.scale, flex: 1, fontFamily: fonts.body },
  phaseDate: { color: t.colors.repeat, fontSize: 13 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
  phasesNote: { color: t.colors.inkFaint, fontSize: 12 * t.scale, lineHeight: 17 * t.scale, fontFamily: fonts.body },
  pace: {
    color: t.colors.inkSoft,
    fontSize: 14 * t.scale,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 20 * t.scale,
    marginTop: spacing.three,
    backgroundColor: t.colors.accentSoft,
    paddingVertical: spacing.three,
    paddingHorizontal: spacing.four,
    borderRadius: radius.md,
  },
  btn: { marginTop: spacing.three },
  pressed: { opacity: PRESSED_OPACITY },
  dismiss: { color: t.colors.inkSoft, fontSize: 15 * t.scale, textAlign: 'center', marginTop: spacing.two, fontFamily: fonts.body },
});
