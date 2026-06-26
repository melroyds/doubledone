import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { type Questions } from '@/lib/ai';
import { fromISODate, presetDate } from '@/lib/day';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { DatePicker } from './DatePicker';

export type BreakdownAnswers = {
  dueDate: string | null; // ISO or null = no deadline
  spread: 'gradual' | 'sameday';
  customAnswer: string;
};

type Props = {
  task: string;
  questions: Questions;
  busy: boolean;
  error?: string | null;
  onSubmit: (answers: BreakdownAnswers) => void;
  onCancel: () => void;
  today: Date;
};

// Break it down, step 1: the AI's three qualifying questions, with the right
// control for each. The due date offers quick chips plus a full date picker (so a
// far deadline like "by July 15" works), pre-filled with any date the AI spotted
// in the task. Everything is pre-set, so the fast path is just "Break it down".
export function BreakdownQuestions({ task, questions, busy, error, onSubmit, onCancel, today }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const presets: { label: string; iso: string | null }[] = [
    { label: 'No deadline', iso: null },
    { label: 'Today', iso: presetDate(today, 'today') },
    { label: 'Tomorrow', iso: presetDate(today, 'tomorrow') },
    { label: 'This week', iso: presetDate(today, 'thisWeek') },
    { label: 'Two weeks', iso: presetDate(today, 'twoWeeks') },
  ];
  // Default to the date the AI found in the task, else the end of this week.
  const [dueISO, setDueISO] = useState<string | null>(() => questions.suggestedDueDate ?? presetDate(today, 'thisWeek'));
  const [calOpen, setCalOpen] = useState(false);
  const [spread, setSpread] = useState<'gradual' | 'sameday'>('gradual');
  const [answer, setAnswer] = useState('');

  const isCustom = dueISO != null && !presets.some((p) => p.iso === dueISO);

  function submit() {
    if (busy) return;
    onSubmit({ dueDate: dueISO, spread, customAnswer: answer.trim() });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss">
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>A few quick questions</Text>
            <Text style={styles.task} numberOfLines={2}>
              {task}
            </Text>

            <Text style={styles.q}>{questions.dueDate}</Text>
            <View style={styles.chips}>
              {presets.map((o) => {
                const on = !calOpen && o.iso === dueISO;
                return (
                  <Pressable
                    key={o.label}
                    onPress={() => {
                      setDueISO(o.iso);
                      setCalOpen(false);
                    }}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={o.label}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setCalOpen((v) => !v)}
                style={[styles.chip, (calOpen || isCustom) && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: calOpen || isCustom }}
                accessibilityLabel="Pick a date"
              >
                <Text style={[styles.chipText, (calOpen || isCustom) && styles.chipTextOn]}>Pick a date</Text>
              </Pressable>
            </View>
            <Text style={styles.selected}>
              {dueISO == null
                ? 'No deadline'
                : fromISODate(dueISO).toLocaleDateString('en-AU', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
            </Text>
            {calOpen && (
              <DatePicker
                value={dueISO}
                today={today}
                onChange={(iso) => {
                  setDueISO(iso);
                  setCalOpen(false);
                }}
              />
            )}

            <Text style={styles.q}>{questions.spread}</Text>
            <View style={styles.toggle}>
              {(['gradual', 'sameday'] as const).map((s) => {
                const on = spread === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSpread(s)}
                    style={[styles.seg, on && styles.segOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={s === 'gradual' ? 'Gradual' : 'Same day'}
                  >
                    <Text style={[styles.segText, on && styles.segTextOn]}>
                      {s === 'gradual' ? 'Gradual' : 'Same day'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.q}>{questions.custom}</Text>
            <TextInput
              value={answer}
              onChangeText={setAnswer}
              editable={!busy}
              placeholder="Optional"
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              multiline
              accessibilityLabel="Answer to the question"
            />

            <Pressable
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [styles.btn, pressed && styles.pressed, busy && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Break it down"
            >
              {busy ? (
                <View style={styles.btnBusy}>
                  <ActivityIndicator size="small" color={theme.colors.onAccent} />
                  <Text style={styles.btnText}>Breaking it down…</Text>
                </View>
              ) : (
                <Text style={styles.btnText}>Break it down</Text>
              )}
            </Pressable>
            {busy && (
              <Text style={styles.waitNote}>Working out a few small steps. This takes a moment, no need to wait here.</Text>
            )}
            {!busy && error ? <Text style={styles.errorNote}>{error}</Text> : null}
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={styles.dismiss}>Not now</Text>
            </Pressable>

            <Text style={styles.disclosure} accessibilityRole="text">
              Your task is sent to an AI to suggest the steps, and kept anonymously (no name, no account) to improve them.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: t.colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.five,
  },
  card: { backgroundColor: t.colors.bg, borderRadius: radius.lg, width: '100%', maxWidth: 440, maxHeight: '88%' },
  scroll: { padding: spacing.six, gap: spacing.three },
  title: { ...t.type.heading, color: t.colors.ink, letterSpacing: -0.3 },
  task: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, marginBottom: spacing.two },
  q: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
  chip: {
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.two,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
  },
  chipOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  chipText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, fontWeight: '500' },
  chipTextOn: { color: t.colors.onAccent },
  selected: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
  toggle: { flexDirection: 'row', gap: spacing.two },
  seg: {
    flex: 1,
    paddingVertical: spacing.three,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
  },
  segOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
  segText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  segTextOn: { color: t.colors.accent },
  input: {
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
    fontSize: 16 * t.scale,
    fontFamily: fonts.body,
    color: t.colors.ink,
  },
  btn: {
    backgroundColor: t.colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.four,
    alignItems: 'center',
    marginTop: spacing.three,
  },
  btnBusy: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  btnText: { color: t.colors.onAccent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  dismiss: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.two },
  waitNote: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center', lineHeight: 20 * t.scale, marginTop: spacing.two },
  errorNote: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center', lineHeight: 20 * t.scale, marginTop: spacing.two },
  disclosure: {
    color: t.colors.inkFaint,
    fontSize: 12 * t.scale,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 17 * t.scale,
    marginTop: spacing.two,
  },
});
