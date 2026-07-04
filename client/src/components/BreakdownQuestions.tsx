import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { border, fonts, radius, spacing, type Theme } from '@/constants/theme';
import { type Questions } from '@/lib/ai';
import { fromISODate, presetDate } from '@/lib/day';
import { fmt, t } from '@/lib/locale';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { Chip } from './Chip';
import { DatePicker } from './DatePicker';
import { ModalCard } from './ModalCard';
import { PrimaryButton } from './PrimaryButton';
import { Segmented } from './Segmented';

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
    { label: t('chart.chipNoDeadline'), iso: null },
    { label: t('common.today'), iso: presetDate(today, 'today') },
    { label: t('common.tomorrow'), iso: presetDate(today, 'tomorrow') },
    { label: t('breakdown.thisWeek'), iso: presetDate(today, 'thisWeek') },
    { label: t('breakdown.twoWeeks'), iso: presetDate(today, 'twoWeeks') },
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
    <ModalCard visible onClose={onCancel} maxWidth={440} maxHeight="88%" scroll>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>{t('breakdown.questionsTitle')}</Text>
            <Text style={styles.task} numberOfLines={2}>
              {task}
            </Text>

            <Text style={styles.q}>{questions.dueDate}</Text>
            <View style={styles.chips}>
              {presets.map((o) => (
                <Chip
                  key={o.label}
                  label={o.label}
                  selected={!calOpen && o.iso === dueISO}
                  onPress={() => {
                    setDueISO(o.iso);
                    setCalOpen(false);
                  }}
                />
              ))}
              <Chip
                label={t('breakdown.pickADate')}
                selected={calOpen || isCustom}
                onPress={() => setCalOpen((v) => !v)}
              />
            </View>
            <Text style={styles.selected}>
              {dueISO == null
                ? t('chart.chipNoDeadline')
                : `${fmt.weekday(fromISODate(dueISO))} ${fmt.monthDay(fromISODate(dueISO))}`}
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
            <Segmented<'gradual' | 'sameday'>
              value={spread}
              options={[
                { value: 'gradual', label: t('breakdown.spreadGradual') },
                { value: 'sameday', label: t('breakdown.spreadSameDay') },
              ]}
              onChange={setSpread}
              accessibilityLabel={questions.spread}
            />

            <Text style={styles.q}>{questions.custom}</Text>
            <TextInput
              value={answer}
              onChangeText={setAnswer}
              editable={!busy}
              placeholder={t('breakdown.optionalPlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              multiline
              accessibilityLabel={t('breakdown.answerA11y')}
            />

            <PrimaryButton
              label={t('actions.breakItDown')}
              onPress={submit}
              loading={busy}
              accessibilityLabel={t('actions.breakItDown')}
              style={styles.btn}
            />
            {busy && (
              <Text style={styles.waitNote}>{t('breakdown.waitNote')}</Text>
            )}
            {!busy && error ? <Text style={styles.errorNote}>{error}</Text> : null}
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.notNow')}>
              <Text style={styles.dismiss}>{t('common.notNow')}</Text>
            </Pressable>

            <Text style={styles.disclosure} accessibilityRole="text">
              {t('breakdown.aiDisclosure')}
            </Text>
      </ScrollView>
    </ModalCard>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  scroll: { padding: spacing.six, gap: spacing.three },
  title: { ...t.type.heading, color: t.colors.ink, letterSpacing: -0.3 },
  task: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, marginBottom: spacing.two },
  q: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
  selected: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
  input: {
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: t.colors.surface,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
    fontSize: 16 * t.scale,
    fontFamily: fonts.body,
    color: t.colors.ink,
  },
  btn: { marginTop: spacing.three },
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
