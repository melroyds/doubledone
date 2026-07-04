import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CheckCircle } from '@/components/CheckCircle';
import { ModalCard } from '@/components/ModalCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { friendlyDate } from '@/lib/day';
import { describePace, paceDays } from '@/lib/estimate';
import { fmt, t } from '@/lib/locale';
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
  // Propose -> EDIT -> accept: the titles are the user's to reshape before anything lands.
  // Local, per-render-session state only, like `selected`; the props stay the AI's originals
  // so accept-time telemetry can count what actually changed.
  const [titles, setTitles] = useState<string[]>(() => steps.map((s) => s.title));
  const [removed, setRemoved] = useState<boolean[]>(() => steps.map(() => false));
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const phaseCount = laterPhases?.length ?? 0;
  const count = selected.filter((on, i) => on && !removed[i]).length + phaseCount;
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

  function startEdit(i: number) {
    setDraft(titles[i]);
    setEditing(i);
  }

  // Submit and blur both commit (and can both fire on web); the editing guard makes the
  // second call a no-op. An emptied title reverts to what it was, never deletes silently.
  function commitEdit(i: number) {
    if (editing !== i) return;
    const next = draft.trim();
    if (next.length > 0) setTitles((prev) => prev.map((v, idx) => (idx === i ? next : v)));
    setEditing(null);
  }

  function removeStep(i: number) {
    if (editing === i) setEditing(null);
    setRemoved((prev) => prev.map((v, idx) => (idx === i ? true : v)));
  }

  function add() {
    if (busy || count === 0) return;
    // Moat surface: how far the AI's proposal was from what the user accepted, per offer.
    const edited = steps.filter((s, i) => !removed[i] && titles[i] !== s.title).length;
    const removedCount = removed.filter(Boolean).length;
    if (edited + removedCount > 0) {
      track('breakdown.steps.edited', { edited, removed: removedCount, total: steps.length });
    }
    onAdd(steps.map((s, i) => ({ ...s, title: titles[i] })).filter((_step, i) => selected[i] && !removed[i]));
  }

  return (
    <ModalCard visible onClose={onCancel} maxWidth={440} maxHeight="88%" scroll>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{t('breakdown.planTitle')}</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {task}
            </Text>
            <Text style={styles.hint}>{t('breakdown.tapToKeepOrSkip')}</Text>

            <View style={styles.list}>
              {steps.map((s, i) => {
                if (removed[i]) return null;
                const on = selected[i];
                const dateLabel = s.date == null ? t('common.today') : friendlyDate(s.date, today);
                return (
                  <Pressable
                    key={`${s.title}-${i}`}
                    onPress={() => toggle(i)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={fmt.plural(
                      s.minutes,
                      { one: t('breakdown.stepRowA11yOne'), other: t('breakdown.stepRowA11yOther') },
                      { title: titles[i], minutes: s.minutes, date: dateLabel },
                    )}
                  >
                    <CheckCircle done={on} />
                    <View style={styles.rowText}>
                      {editing === i ? (
                        <TextInput
                          style={styles.stepInput}
                          value={draft}
                          onChangeText={setDraft}
                          autoFocus
                          onSubmitEditing={() => commitEdit(i)}
                          onBlur={() => commitEdit(i)}
                          returnKeyType="done"
                          accessibilityLabel={t('breakdown.stepInputA11y')}
                        />
                      ) : (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation(); // don't let a title tap also toggle the row
                            startEdit(i);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('breakdown.editStepA11y', { title: titles[i] })}
                          hitSlop={4}
                        >
                          <Text style={[styles.stepTitle, !on && styles.stepOff]}>{titles[i]}</Text>
                        </Pressable>
                      )}
                      <Text style={styles.meta}>
                        {t('breakdown.stepMeta', { minutes: s.minutes, date: dateLabel })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation(); // don't let a remove tap also toggle the row
                        removeStep(i);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('breakdown.removeStepA11y', { title: titles[i] })}
                      hitSlop={8}
                      style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.removeMark}>✕</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>

            {phaseCount > 0 && (
              <View style={styles.phases}>
                <Text style={styles.phasesHead}>{t('breakdown.laterPhasesHead')}</Text>
                {laterPhases!.map((p, i) => (
                  <View key={`${p.title}-${i}`} style={styles.phaseRow}>
                    <Text style={styles.phaseTitle} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <Text style={styles.phaseDate}>{p.date == null ? t('common.today') : friendlyDate(p.date, today)}</Text>
                  </View>
                ))}
                <Text style={styles.phasesNote}>{t('breakdown.laterPhasesNote')}</Text>
              </View>
            )}

            <Text style={styles.pace} accessibilityRole="text">
              {describePace(days)}
            </Text>

            <PrimaryButton
              label={fmt.plural(count, { one: t('breakdown.addCountTasksOne'), other: t('breakdown.addCountTasksOther') })}
              onPress={add}
              loading={busy}
              disabled={count === 0}
              accessibilityLabel={fmt.plural(count, { one: t('breakdown.addCountTasksOne'), other: t('breakdown.addCountTasksOther') })}
              style={styles.btn}
            />
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.notNow')}>
              <Text style={styles.dismiss}>{t('common.notNow')}</Text>
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
  stepInput: {
    color: t.colors.ink,
    fontSize: 16 * t.scale,
    lineHeight: 21 * t.scale,
    fontFamily: fonts.body,
    padding: 0,
    borderBottomWidth: border.thin,
    borderBottomColor: t.colors.accent,
  },
  removeBtn: { paddingHorizontal: spacing.one, paddingVertical: spacing.half },
  removeMark: { color: t.colors.inkFaint, fontSize: 14 * t.scale, fontFamily: fonts.body },
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
