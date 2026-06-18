import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/constants/theme';
import { type Questions } from '@/lib/ai';
import { addDaysISO } from '@/lib/day';

export type BreakdownAnswers = {
  dueDate: string | null; // ISO or null = no deadline
  spread: 'gradual' | 'sameday';
  customAnswer: string;
};

type Props = {
  task: string;
  questions: Questions;
  busy: boolean;
  onSubmit: (answers: BreakdownAnswers) => void;
  onCancel: () => void;
  today: Date;
};

// Day offsets the due-date question offers. null = no deadline.
const DUE_OPTIONS: { label: string; off: number | null }[] = [
  { label: 'No deadline', off: null },
  { label: 'Today', off: 0 },
  { label: 'Tomorrow', off: 1 },
  { label: 'This week', off: 7 },
  { label: 'Two weeks', off: 14 },
];

// Break it down, step 1: the AI's three qualifying questions, with the right
// control for each (date chips, a gradual/same-day toggle, a short text box).
// Everything is pre-filled, so the fast path is just "Break it down".
export function BreakdownQuestions({ task, questions, busy, onSubmit, onCancel, today }: Props) {
  const [dueOff, setDueOff] = useState<number | null>(7); // default "This week"
  const [spread, setSpread] = useState<'gradual' | 'sameday'>('gradual');
  const [answer, setAnswer] = useState('');

  function submit() {
    if (busy) return;
    onSubmit({
      dueDate: dueOff == null ? null : addDaysISO(today, dueOff),
      spread,
      customAnswer: answer.trim(),
    });
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
              {DUE_OPTIONS.map((o) => {
                const on = o.off === dueOff;
                return (
                  <Pressable
                    key={o.label}
                    onPress={() => setDueOff(o.off)}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={o.label}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

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
              placeholderTextColor={colors.inkFaint}
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
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.btnText}>Breaking it down…</Text>
                </View>
              ) : (
                <Text style={styles.btnText}>Break it down</Text>
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
  task: { color: colors.inkSoft, fontSize: 15, marginBottom: spacing.two },
  q: { color: colors.ink, fontSize: 16, fontWeight: '600', marginTop: spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
  chip: {
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.two,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.inkSoft, fontSize: 14, fontWeight: '500' },
  chipTextOn: { color: '#FFFFFF' },
  toggle: { flexDirection: 'row', gap: spacing.two },
  seg: {
    flex: 1,
    paddingVertical: spacing.three,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  segOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  segText: { color: colors.inkSoft, fontSize: 15, fontWeight: '600' },
  segTextOn: { color: colors.accent },
  input: {
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
    fontSize: 16,
    color: colors.ink,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.four,
    alignItems: 'center',
    marginTop: spacing.three,
  },
  btnBusy: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  dismiss: { color: colors.inkSoft, fontSize: 15, textAlign: 'center', marginTop: spacing.two },
});
