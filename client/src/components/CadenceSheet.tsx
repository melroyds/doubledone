import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { border, fonts, radius, spacing, type Theme } from '@/constants/theme';
import { friendlyDate, toISODate } from '@/lib/day';
import { t } from '@/lib/locale';
import { describeRecurrence, scheduleFields, type CaptureSchedule, type Recurrence } from '@/lib/recurrence';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { Chip } from './Chip';
import { DatePicker } from './DatePicker';
import { ModalCard } from './ModalCard';
import { PrimaryButton } from './PrimaryButton';

// THE cadence surface. One in the whole app, which is the point: this was lifted out of
// RepeatingDrawer so the shared list could use the identical controls rather than grow a second,
// slightly-different picker that drifts a fortnight later. A repeat set here, set on Ours, set by
// the REST API or by an agent over MCP, all end up the same shape, because they all end up in
// `scheduleFields`.
//
// It owns the cadence and nothing else: no series list, no removal, no undo. The caller says what
// the title and cadence start as and what to do with the answer.

type EditMode = 'daily' | 'weekly' | 'everyN';

const EDIT_MODES: { mode: EditMode; labelKey: string }[] = [
  { mode: 'daily', labelKey: 'capture.modeDaily' },
  { mode: 'weekly', labelKey: 'capture.modeWeekly' },
  { mode: 'everyN', labelKey: 'capture.modeEveryN' },
];

// index 0=Sun .. 6=Sat (the same table BrainDump renders)
const WEEKDAY_KEYS = [
  'capture.weekdayShortSun',
  'capture.weekdayShortMon',
  'capture.weekdayShortTue',
  'capture.weekdayShortWed',
  'capture.weekdayShortThu',
  'capture.weekdayShortFri',
  'capture.weekdayShortSat',
];

type Props = {
  visible: boolean;
  onClose: () => void;
  today: Date;
  sheetTitle: string;
  /** The starting title. Editable here, because on both surfaces you arrive at this sheet from a
   *  task whose wording you may want to fix in the same breath as its rhythm. */
  title: string;
  /** The current cadence, prefilled so saving without touching anything is a no-op edit and never a
   *  surprise re-cadence. */
  recurrence?: Recurrence;
  /** A line under the controls, for anything true only on this surface (Ours: "You'll both see it
   *  on its day."). Absent on the personal drawer, which needs no such promise. */
  note?: string;
  onSave: (title: string, recurrence: Recurrence) => void;
};

export function CadenceSheet({ visible, onClose, today, sheetTitle, title, recurrence, note, onSave }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const todayIso = toISODate(today);

  // Seeded from the props on each open. The `key` on the caller's side is what re-mounts this, so
  // the fields are initialised once per opening rather than resynced by an effect.
  const [draft, setDraft] = useState(title);
  const [mode, setMode] = useState<EditMode>(recurrence?.kind === 'weekly' ? 'weekly' : recurrence?.kind === 'interval' ? 'everyN' : 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(
    recurrence?.kind === 'weekly' && recurrence.weekdays.length > 0 ? recurrence.weekdays : [today.getDay()],
  );
  const [everyN, setEveryN] = useState(recurrence?.kind === 'interval' ? Math.max(2, recurrence.days) : 2);
  const [start, setStart] = useState(
    recurrence?.kind === 'interval' ? recurrence.anchor : (recurrence?.kind === 'weekly' ? recurrence.start : recurrence?.kind === 'daily' ? recurrence.start : undefined) ?? todayIso,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  function schedule(): CaptureSchedule {
    if (mode === 'weekly') return { mode: 'weekly', weekdays: weekdays.length > 0 ? weekdays : [today.getDay()], start };
    if (mode === 'everyN') return { mode: 'everyN', days: everyN, start };
    return { mode: 'daily', start };
  }

  // The commit button NAMES the cadence rather than saying "Save": on a shared list especially, the
  // last thing you read before committing should be the thing you are committing your person to.
  const pending = scheduleFields(schedule(), today).recurrence;
  const commitLabel = pending ? describeRecurrence(pending) : t('routines.saveChanges');

  function save() {
    const trimmed = draft.trim();
    if (!trimmed || !pending) return;
    onSave(trimmed, pending);
    onClose();
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));
  }

  return (
    <ModalCard visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>{sheetTitle}</Text>
      <TextInput
        style={styles.sheetInput}
        value={draft}
        onChangeText={setDraft}
        placeholderTextColor={theme.colors.inkFaint}
        returnKeyType="done"
        accessibilityLabel={t('repeat.titleInputA11y')}
      />
      <View style={styles.chips}>
        {EDIT_MODES.map(({ mode: m, labelKey }) => (
          <Chip key={m} label={t(labelKey)} selected={mode === m} onPress={() => setMode(m)} />
        ))}
      </View>
      {mode === 'weekly' && (
        <View style={styles.weekdays}>
          {WEEKDAY_KEYS.map((key, d) => (
            <Pressable
              key={d}
              onPress={() => toggleWeekday(d)}
              style={[styles.day, weekdays.includes(d) && styles.dayOn]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: weekdays.includes(d) }}
              accessibilityLabel={t('capture.repeatOnDayA11y', { day: t(key) })}
            >
              <Text style={[styles.dayText, weekdays.includes(d) && styles.dayTextOn]}>{t(key)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {mode === 'everyN' && (
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => setEveryN((n) => Math.max(2, n - 1))}
            style={styles.stepBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('capture.fewerDaysA11y')}
          >
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepLabel}>{t('capture.everyNDays', { count: everyN })}</Text>
          <Pressable
            onPress={() => setEveryN((n) => Math.min(30, n + 1))}
            style={styles.stepBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('capture.moreDaysA11y')}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.startRow}>
        <Text style={styles.startLabel}>{t('capture.startingFrom')}</Text>
        <Pressable
          onPress={() => setPickerOpen((v) => !v)}
          style={styles.startBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('capture.startingFromA11y', { date: start === todayIso ? t('common.today') : friendlyDate(start, today) })}
        >
          <Text style={styles.startBtnText}>{start === todayIso ? t('common.today') : friendlyDate(start, today)}</Text>
        </Pressable>
      </View>
      {/* The picker inlines below the start row (a Modal nested in the ModalCard's Modal is
          unreliable on Android), collapsing again once a day is chosen. */}
      {pickerOpen && (
        <DatePicker
          value={start >= todayIso ? start : null}
          today={today}
          onChange={(iso) => {
            setStart(iso);
            setPickerOpen(false);
          }}
        />
      )}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.sheetActions}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={8}>
          <Text style={styles.sheetCancel}>{t('common.cancel')}</Text>
        </Pressable>
        <PrimaryButton label={commitLabel} onPress={save} disabled={draft.trim().length === 0} accessibilityLabel={commitLabel} style={styles.commit} />
      </View>
    </ModalCard>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    sheetTitle: { ...t.type.heading, color: t.colors.ink, marginBottom: spacing.three },
    sheetInput: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.three,
      color: t.colors.ink,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      marginBottom: spacing.three,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
    weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two, marginTop: spacing.three },
    day: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    dayText: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
    dayTextOn: { color: t.colors.accent, fontFamily: fonts.bodyBold, fontWeight: '700' },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.four, marginTop: spacing.three },
    stepBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: { color: t.colors.ink, fontSize: 20 * t.scale, fontFamily: fonts.body },
    stepLabel: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body, minWidth: 110, textAlign: 'center' },
    startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, marginTop: spacing.four },
    startLabel: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    startBtn: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.three,
      paddingVertical: spacing.one,
    },
    startBtnText: { color: t.colors.ink, fontSize: 14 * t.scale, fontFamily: fonts.body },
    // The surface-specific promise (Ours). A fact, in the quiet voice, never a warning.
    note: { color: t.colors.inkFaint, fontSize: 13 * t.scale, lineHeight: 19 * t.scale, fontFamily: fonts.body, marginTop: spacing.four },
    // Wraps rather than overflowing. The commit button names the cadence, so it grows with the
    // wording (German runs long), and unbounded it pushed Cancel off the screen edge: the way OUT of
    // the sheet, gone. Cancel never shrinks; the naming button gives way instead.
    sheetActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: spacing.four,
      marginTop: spacing.five,
    },
    sheetCancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, flexShrink: 0 },
    commit: { flexShrink: 1 },
  });
