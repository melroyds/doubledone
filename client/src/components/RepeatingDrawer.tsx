import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { border, fonts, motion, radius, spacing, type Theme } from '@/constants/theme';
import { friendlyDate, toISODate } from '@/lib/day';
import { t } from '@/lib/locale';
import { describeRecurrence, scheduleFields, type CaptureSchedule, type Recurrence } from '@/lib/recurrence';
import { type Task } from '@/lib/tasks';
import { useReducedMotion, useTheme, useThemedStyles } from '@/lib/theme-provider';
import { isDoneOn, isRecurring } from '@/lib/today';

import { Chip } from './Chip';
import { DatePicker } from './DatePicker';
import { ModalCard } from './ModalCard';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  today: Date;
  onToggle: (id: string) => void;
  // The drawer manages the series (Today manages days): the parent owns the commit.
  onEditSeries: (id: string, title: string, recurrence: Recurrence) => void;
  onRemoveSeries: (id: string) => void; // tombstones the whole series
  onRestoreSeries: (id: string) => void; // the undo: clears the tombstone
};

// The cadences a series can be edited to, mirroring BrainDump's recurring capture
// modes (daily / weekly / every N days). One-off modes don't belong here: a series
// stays a series, and un-repeating a task is Remove + recapture.
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

// The repeating-tasks home: a panel that slides in from the right. Daily and
// repeating tasks get their own respected space here; today's due ones still
// appear on Today so habits don't fall out of sight. Calm, no streaks or grids.
// This is where the SERIES is managed (edit its title and cadence, or remove it
// whole, with an undo); removing from Today only skips a day. Always mounted
// (off-screen when closed) so the slide animates both ways without a ref or a
// mount-time setState, both of which the render rules forbid.
export function RepeatingDrawer({ open, onClose, tasks, today, onToggle, onEditSeries, onRemoveSeries, onRestoreSeries }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(open ? 1 : 0));
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(360, width * 0.86);
  const todayIso = toISODate(today);

  // Removing a series is recoverable, not a confirmation gauntlet: a brief undo bar
  // (matching routines.tsx) instead of a heavy "are you sure?".
  const [undoId, setUndoId] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The edit sheet: a ModalCard (the drawer is too cramped to edit in place) holding
  // the title plus the same cadence controls BrainDump captures with.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMode, setEditMode] = useState<EditMode>('daily');
  const [editWeekdays, setEditWeekdays] = useState<number[]>([]);
  const [editEveryN, setEditEveryN] = useState(2);
  const [editStart, setEditStart] = useState(todayIso);
  const [startPickerOpen, setStartPickerOpen] = useState(false);

  // Reduced motion shows the drawer (and its backdrop) snap to the open/closed end
  // state instantly, never sliding or fading, mirroring how index.tsx settles its
  // close-the-day card for users who opt out of motion.
  useEffect(() => {
    if (reduced) {
      anim.setValue(open ? 1 : 0);
      return;
    }
    const animation = Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : motion.standard,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [open, reduced, anim]);

  // Never leave the undo timer running past unmount.
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  // Prefill the edit sheet from the task's current recurrence, so Save-without-touching
  // is a no-op edit, never a surprise re-cadence.
  function startEdit(task: Task) {
    const r = task.recurrence;
    setEditingId(task.id);
    setEditTitle(task.title);
    if (r?.kind === 'weekly') {
      setEditMode('weekly');
      setEditWeekdays(r.weekdays.length > 0 ? r.weekdays : [today.getDay()]);
      setEditStart(r.start ?? todayIso);
      setEditEveryN(2);
    } else if (r?.kind === 'interval') {
      setEditMode('everyN');
      setEditEveryN(Math.max(2, r.days));
      setEditStart(r.anchor);
      setEditWeekdays([today.getDay()]);
    } else {
      setEditMode('daily');
      setEditStart((r?.kind === 'daily' ? r.start : undefined) ?? todayIso);
      setEditWeekdays([today.getDay()]);
      setEditEveryN(2);
    }
    setStartPickerOpen(false);
  }

  function closeEdit() {
    setEditingId(null);
    setStartPickerOpen(false);
  }

  // Build the new Recurrence exactly the way capture does (scheduleFields), so an
  // edited series and a captured one can never drift apart in shape.
  function saveEdit() {
    const id = editingId;
    const title = editTitle.trim();
    if (!id || !title) return;
    const schedule: CaptureSchedule =
      editMode === 'weekly'
        ? { mode: 'weekly', weekdays: editWeekdays.length > 0 ? editWeekdays : [today.getDay()], start: editStart }
        : editMode === 'everyN'
          ? { mode: 'everyN', days: editEveryN, start: editStart }
          : { mode: 'daily', start: editStart };
    const recurrence = scheduleFields(schedule, today).recurrence;
    if (!recurrence) return;
    onEditSeries(id, title, recurrence);
    closeEdit();
  }

  function removeSeries(task: Task) {
    onRemoveSeries(task.id);
    setUndoId(task.id);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoId(null), 6000);
  }

  function undoRemove() {
    const id = undoId;
    if (!id) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoId(null);
    onRestoreSeries(id);
  }

  function toggleWeekday(d: number) {
    setEditWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  const recurring = tasks.filter((task) => !task.deletedAt && isRecurring(task));
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', pointerEvents: open ? 'auto' : 'none' }]}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('repeat.closeDrawerA11y')} />
      </Animated.View>
      <Animated.View style={[styles.panel, { width: panelWidth, transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('repeat.title')}</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.done}>{t('common.close')}</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>{t('repeat.subtitle')}</Text>
        {/* The naming fix. A repeating TASK and a NOTIFICATION are two different things, and the app
            calls both of them a kind of "reminder", so a person who sets a task to repeat can
            reasonably expect to be told when it is due, and then is not. That confusion is ours to
            fix, not theirs to work out. Said once here, where the expectation is actually formed,
            rather than renaming anything: "Repeating" is the right word, it just needed its limit
            stated, and it points at the two real ways to be notified. */}
        <Text style={styles.notNotify}>{t('repeat.notANotification')}</Text>
        {undoId != null && (
          <View style={styles.undoBar}>
            <Text style={styles.undoText}>{t('repeat.removed')}</Text>
            <Pressable onPress={undoRemove} accessibilityRole="button" accessibilityLabel={t('repeat.undoRemoveA11y')} hitSlop={8}>
              <Text style={styles.undoAction}>{t('common.undo')}</Text>
            </Pressable>
          </View>
        )}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {recurring.length === 0 ? (
            <Text style={styles.empty}>
              {t('repeat.empty')}
            </Text>
          ) : (
            recurring.map((task) => {
              const done = isDoneOn(task, today);
              return (
                <View key={task.id} style={styles.item}>
                  <Pressable
                    onPress={() => onToggle(task.id)}
                    style={styles.row}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={task.title}
                  >
                    <View style={[styles.box, done && styles.boxDone]}>
                      {done && <Text style={styles.tick}>{t('common.tick')}</Text>}
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, done && styles.rowTitleDone]}>{task.title}</Text>
                      <Text style={styles.cadence}>{task.recurrence ? describeRecurrence(task.recurrence, today) : ''}</Text>
                    </View>
                  </Pressable>
                  {/* Quiet series actions, siblings of the checkbox row (never nested Pressables).
                      Remove here means the WHOLE series, hence the undo; Today's remove only skips a day. */}
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => startEdit(task)}
                      accessibilityRole="button"
                      accessibilityLabel={t('repeat.editA11y', { title: task.title })}
                      hitSlop={6}
                    >
                      <Text style={styles.editAction}>{t('routines.edit')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeSeries(task)}
                      accessibilityRole="button"
                      accessibilityLabel={t('repeat.removeSeriesA11y', { title: task.title })}
                      hitSlop={6}
                    >
                      <Text style={styles.removeAction}>{t('common.remove')}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>

      <ModalCard visible={editingId != null} onClose={closeEdit}>
        <Text style={styles.sheetTitle}>{t('repeat.editSheetTitle')}</Text>
        <TextInput
          style={styles.sheetInput}
          value={editTitle}
          onChangeText={setEditTitle}
          placeholderTextColor={theme.colors.inkFaint}
          returnKeyType="done"
          accessibilityLabel={t('repeat.titleInputA11y')}
        />
        <View style={styles.chips}>
          {EDIT_MODES.map(({ mode, labelKey }) => (
            <Chip key={mode} label={t(labelKey)} selected={editMode === mode} onPress={() => setEditMode(mode)} />
          ))}
        </View>
        {editMode === 'weekly' && (
          <View style={styles.weekdays}>
            {WEEKDAY_KEYS.map((key, d) => (
              <Pressable
                key={d}
                onPress={() => toggleWeekday(d)}
                style={[styles.day, editWeekdays.includes(d) && styles.dayOn]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: editWeekdays.includes(d) }}
                accessibilityLabel={t('capture.repeatOnDayA11y', { day: t(key) })}
              >
                <Text style={[styles.dayText, editWeekdays.includes(d) && styles.dayTextOn]}>{t(key)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {editMode === 'everyN' && (
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => setEditEveryN((n) => Math.max(2, n - 1))}
              style={styles.stepBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('capture.fewerDaysA11y')}
            >
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepLabel}>{t('capture.everyNDays', { count: editEveryN })}</Text>
            <Pressable
              onPress={() => setEditEveryN((n) => Math.min(30, n + 1))}
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
            onPress={() => setStartPickerOpen((v) => !v)}
            style={styles.startBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('capture.startingFromA11y', { date: editStart === todayIso ? t('common.today') : friendlyDate(editStart, today) })}
          >
            <Text style={styles.startBtnText}>{editStart === todayIso ? t('common.today') : friendlyDate(editStart, today)}</Text>
          </Pressable>
        </View>
        {/* The picker inlines below the start row (a Modal nested in the ModalCard's Modal is
            unreliable on Android), collapsing again once a day is chosen. */}
        {startPickerOpen && (
          <DatePicker
            value={editStart >= todayIso ? editStart : null}
            today={today}
            onChange={(iso) => {
              setEditStart(iso);
              setStartPickerOpen(false);
            }}
          />
        )}
        <View style={styles.sheetActions}>
          <Pressable onPress={closeEdit} accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={8}>
            <Text style={styles.sheetCancel}>{t('common.cancel')}</Text>
          </Pressable>
          <PrimaryButton
            label={t('routines.saveChanges')}
            onPress={saveEdit}
            disabled={editTitle.trim().length === 0}
            accessibilityLabel={t('routines.saveChanges')}
          />
        </View>
      </ModalCard>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.scrim },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: t.colors.bg,
    paddingHorizontal: spacing.five,
    paddingTop: spacing.seven,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    gap: spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...t.type.heading, color: t.colors.ink, letterSpacing: -0.3 },
  done: { color: t.colors.accent, fontSize: 16 * t.scale, fontWeight: '600', fontFamily: fonts.bodyBold },
  sub: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
  // Fainter than the subtitle: it is a clarification, not a warning, and nothing here is wrong.
  notNotify: { color: t.colors.inkFaint, fontSize: 13 * t.scale, lineHeight: 19 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
  // The brief undo bar after removing a series, one shape with routines.tsx's.
  undoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: t.colors.surface,
    borderRadius: radius.md,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
  },
  undoText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
  undoAction: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold },
  list: { marginTop: spacing.two },
  listContent: { gap: spacing.four, paddingBottom: spacing.six },
  empty: { color: t.colors.inkFaint, fontSize: 15 * t.scale, lineHeight: 22 * t.scale, marginTop: spacing.three, fontFamily: fonts.body },
  item: { gap: spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDone: { backgroundColor: t.colors.doneSoft, borderColor: t.colors.done },
  tick: { color: t.colors.doneText, fontSize: 14 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
  rowText: { flexShrink: 1 },
  rowTitle: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body },
  rowTitleDone: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
  cadence: { color: t.colors.inkSoft, fontSize: 13 * t.scale, marginTop: 1, fontFamily: fonts.body },
  // The quiet per-series actions, indented under the row text (24 box + the row gap).
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.five, paddingLeft: 24 + spacing.three },
  editAction: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
  removeAction: { color: t.colors.danger, fontSize: 13 * t.scale, fontFamily: fonts.body },
  // The edit sheet (a ModalCard, since the drawer itself is too cramped to edit in).
  sheetTitle: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
  sheetInput: {
    color: t.colors.ink,
    fontSize: 16 * t.scale,
    fontFamily: fonts.body,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.three,
    paddingVertical: spacing.three,
    backgroundColor: t.colors.surface,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
  weekdays: { flexDirection: 'row', gap: spacing.two },
  day: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
  dayText: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
  dayTextOn: { color: t.colors.accent, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: t.colors.accent, fontSize: 20 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  stepLabel: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '500', minWidth: 110, textAlign: 'center' },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  startLabel: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
  startBtn: {
    paddingHorizontal: spacing.three,
    paddingVertical: spacing.one,
    borderRadius: radius.pill,
    borderWidth: border.hair,
    borderColor: t.colors.accent,
    backgroundColor: t.colors.accentSoft,
  },
  startBtnText: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.four, marginTop: spacing.one },
  sheetCancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
});
