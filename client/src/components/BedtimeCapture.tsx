import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { border, fonts, layout, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { friendlyDate, toISODate } from '@/lib/day';
import { t } from '@/lib/locale';
import { type CaptureSchedule } from '@/lib/recurrence';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { DatePicker } from './DatePicker';

type Props = {
  // The parent's capture(). We only ever pass a tomorrow / date schedule, never today.
  onCapture: (text: string, schedule: CaptureSchedule) => void;
  today: Date;
};

// After the day is closed, a calm place to catch a bedtime thought WITHOUT reopening the day.
// Anything added lands on TOMORROW (or a later day you pick), never today, so the closed day
// stays rested. This is the app's real promise, get it out of your head, at the moment the head
// is loudest. Deliberately plain: no AI, no sort, no slices; type it, park it, sleep. Nothing
// leaves the device.
export function BedtimeCapture({ onCapture, today }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [dueIso, setDueIso] = useState<string | null>(null); // null = tomorrow (default); an ISO = a picked "later" day
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // Tomorrow, month/year rollover handled by Date's normalisation. Used only for the picker's default.
  const tomorrowIso = toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const whenLabel = dueIso === null ? t('closeDay.tomorrowWord') : friendlyDate(dueIso, today);

  function add() {
    const text = value.trim();
    if (!text) return;
    const schedule: CaptureSchedule = dueIso === null ? { mode: 'tomorrow' } : { mode: 'date', date: dueIso };
    onCapture(text, schedule);
    setSaved(t('closeDay.bedtimeSavedConfirm', { when: whenLabel }));
    setValue('');
    setDueIso(null); // the next thought defaults back to tomorrow
  }

  function onType(t: string) {
    setValue(t);
    if (saved) setSaved(null); // a new thought clears the last confirmation
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>{t('closeDay.bedtimePrompt')}</Text>
      <TextInput
        value={value}
        onChangeText={onType}
        placeholder={t('closeDay.bedtimePlaceholder')}
        placeholderTextColor={theme.colors.inkFaint}
        style={styles.input}
        multiline
        textAlignVertical="top"
        accessibilityLabel={t('closeDay.bedtimeInputLabel')}
      />
      <View style={styles.actions}>
        <Pressable
          onPress={add}
          disabled={!value.trim()}
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed, !value.trim() && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={t('closeDay.addForWhen', { when: whenLabel })}
        >
          <Text style={styles.addText}>{t('closeDay.addForWhen', { when: whenLabel })}</Text>
        </Pressable>
        <Pressable
          onPress={() => setPickerOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('closeDay.addDifferentDayLabel')}
        >
          <Text style={styles.later}>{dueIso === null ? t('closeDay.notTomorrow') : t('closeDay.changeDay')}</Text>
        </Pressable>
      </View>
      {saved && (
        <Text style={styles.saved} accessibilityLiveRegion="polite">
          {saved}
        </Text>
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerRoot}>
          {/* Scrim is a SIBLING of the card (an absolute-fill dismiss layer), so the day buttons are never
              nested inside the scrim <button> (invalid HTML on web). Mirrors BrainDump's picker. */}
          <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.dismiss')} />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{t('closeDay.pickDayTitle')}</Text>
            <DatePicker
              value={dueIso ?? tomorrowIso}
              today={today}
              onChange={(iso) => {
                setDueIso(iso);
                setPickerOpen(false);
              }}
            />
            <Pressable
              onPress={() => {
                setDueIso(null);
                setPickerOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('closeDay.tomorrowInstead')}
            >
              <Text style={styles.pickerTomorrow}>{t('closeDay.tomorrowInstead')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { width: '100%', maxWidth: layout.cardMediaWidth, gap: spacing.three, marginTop: spacing.two },
    prompt: {
      color: t.colors.inkSoft,
      fontSize: 15 * t.scale,
      lineHeight: 21 * t.scale,
      fontFamily: fonts.body,
      textAlign: 'center',
    },
    input: {
      minHeight: 52,
      maxHeight: 128,
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.three,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      lineHeight: 22 * t.scale,
      color: t.colors.ink,
    },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.four },
    addBtn: {
      backgroundColor: t.colors.accentSoft,
      borderWidth: border.hair,
      borderColor: t.colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.three,
    },
    addText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    later: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, fontWeight: '500' },
    saved: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    pressed: { opacity: PRESSED_OPACITY },
    disabled: { opacity: 0.5 },
    pickerRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.five },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.scrim },
    pickerCard: {
      backgroundColor: t.colors.bg,
      borderRadius: radius.lg,
      padding: spacing.five,
      width: '100%',
      maxWidth: layout.cardMediaWidth,
      gap: spacing.three,
    },
    pickerTitle: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    pickerTomorrow: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center' },
  });
