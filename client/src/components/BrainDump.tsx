import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { friendlyDate, toISODate } from '@/lib/day';
import { type CaptureSchedule } from '@/lib/recurrence';
import { MAX_SLICES, MIN_SLICES } from '@/lib/slices';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { DatePicker } from './DatePicker';

type Props = {
  onCapture: (text: string, schedule: CaptureSchedule, slices?: number) => void;
  onBiteElephant: (text: string) => Promise<void>;
  onSort: (text: string) => Promise<void>;
  today: Date;
};

type Mode = 'today' | 'tomorrow' | 'date' | 'daily' | 'weekly' | 'everyN';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'today', label: 'Today' },
  { mode: 'tomorrow', label: 'Tomorrow' },
  { mode: 'date', label: 'Date…' },
  { mode: 'daily', label: 'Daily' },
  { mode: 'weekly', label: 'Weekly' },
  { mode: 'everyN', label: 'Custom' },
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // index 0=Sun .. 6=Sat

const ADD_LABEL: Record<Mode, string> = {
  today: 'Add to today',
  tomorrow: 'Add for tomorrow',
  date: 'Add for that day',
  daily: 'Add daily',
  weekly: 'Add weekly',
  everyN: 'Add repeating',
};

// Capture, with a calm "when" (the chips, for adding) and a "break it down" path
// (hand a dreaded task to the AI and get small steps into Today). Default is one
// gesture; everything else is there only when wanted.
export function BrainDump({ onCapture, onBiteElephant, onSort, today }: Props) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>('today');
  const [weekdays, setWeekdays] = useState<number[]>([today.getDay()]);
  const [everyNDays, setEveryNDays] = useState(2);
  const [start, setStart] = useState(() => toISODate(today)); // ISO start for a recurring task
  const [dueDate, setDueDate] = useState(() => toISODate(today)); // ISO due for a one-off "Date…" task
  const [pickerFor, setPickerFor] = useState<'start' | 'due' | null>(null); // which date the modal edits
  const [sliceCount, setSliceCount] = useState(0); // 0 = whole task; >=MIN_SLICES = tracked in steps
  const [busyKind, setBusyKind] = useState<'bite' | 'sort' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const busy = busyKind !== null;
  const lineCount = value.split('\n').filter((l) => l.trim().length > 0).length;
  // Steps only make sense for a single, one-off task (a thing with parts). Hidden
  // for a multi-line dump or a repeating task, so it never clutters those.
  const canSlice = lineCount <= 1 && (mode === 'today' || mode === 'tomorrow' || mode === 'date');
  const isRecurringMode = mode === 'daily' || mode === 'weekly' || mode === 'everyN';
  const todayIso = toISODate(today);
  const addLabel = mode === 'date' ? `Add for ${friendlyDate(dueDate, today)}` : ADD_LABEL[mode];

  function buildSchedule(): CaptureSchedule {
    if (mode === 'daily') {
      return { mode: 'daily', start };
    }
    if (mode === 'weekly') {
      return { mode: 'weekly', weekdays: weekdays.length > 0 ? weekdays : [today.getDay()], start };
    }
    if (mode === 'everyN') {
      return { mode: 'everyN', days: everyNDays, start };
    }
    if (mode === 'date') {
      return { mode: 'date', date: dueDate };
    }
    return { mode };
  }

  function reset() {
    setValue('');
    setMode('today');
    setWeekdays([today.getDay()]);
    setStart(todayIso);
    setDueDate(todayIso);
    setPickerFor(null);
    setSliceCount(0);
  }

  function add() {
    if (!value.trim() || busy) return;
    onCapture(value, buildSchedule(), canSlice && sliceCount >= MIN_SLICES ? sliceCount : undefined);
    reset();
  }

  async function biteElephant() {
    const task = value.trim();
    if (!task || busy) return;
    setError(null);
    setBusyKind('bite');
    try {
      await onBiteElephant(task);
      reset();
    } catch {
      setError('Could not break that down just now. Try again.');
    } finally {
      setBusyKind(null);
    }
  }

  async function sortDump() {
    const text = value;
    if (!text.trim() || busy) return;
    setError(null);
    setBusyKind('sort');
    try {
      await onSort(text);
      reset();
    } catch {
      setError('Could not sort just now. Try again.');
    } finally {
      setBusyKind(null);
    }
  }

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={setValue}
        editable={!busy}
        placeholder="Empty your head. One line per thing."
        placeholderTextColor={theme.colors.inkFaint}
        style={styles.input}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Brain-dump. Add one or more things, one per line"
      />

      <View style={styles.chips}>
        {MODES.map(({ mode: m, label }) => (
          <Pressable
            key={m}
            onPress={() => {
              setMode(m);
              if (m === 'date') setPickerFor('due');
            }}
            style={[styles.chip, mode === m && styles.chipOn]}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
            accessibilityLabel={label}
          >
            <Text style={[styles.chipText, mode === m && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'weekly' && (
        <View style={styles.weekdays}>
          {WEEKDAYS.map((label, d) => (
            <Pressable
              key={d}
              onPress={() => toggleWeekday(d)}
              style={[styles.day, weekdays.includes(d) && styles.dayOn]}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityState={{ selected: weekdays.includes(d) }}
              accessibilityLabel={`Repeat on ${label}`}
            >
              <Text style={[styles.dayText, weekdays.includes(d) && styles.dayTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {mode === 'everyN' && (
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => setEveryNDays((n) => Math.max(2, n - 1))}
            style={styles.stepBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Fewer days"
          >
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepLabel}>Every {everyNDays} days</Text>
          <Pressable
            onPress={() => setEveryNDays((n) => Math.min(30, n + 1))}
            style={styles.stepBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="More days"
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      )}

      {mode === 'date' && (
        <View style={styles.startRow}>
          <Text style={styles.startLabel}>On</Text>
          <Pressable
            onPress={() => setPickerFor('due')}
            style={styles.startBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`On ${friendlyDate(dueDate, today)}`}
          >
            <Text style={styles.startBtnText}>{friendlyDate(dueDate, today)}</Text>
          </Pressable>
        </View>
      )}

      {isRecurringMode && (
        <View style={styles.startRow}>
          <Text style={styles.startLabel}>Starting from</Text>
          <Pressable
            onPress={() => setPickerFor('start')}
            style={styles.startBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Starting from ${start === todayIso ? 'today' : start}`}
          >
            <Text style={styles.startBtnText}>{start === todayIso ? 'Today' : friendlyDate(start, today)}</Text>
          </Pressable>
        </View>
      )}

      {canSlice && (
        <View style={styles.sliceField}>
          <Text style={styles.sliceHint}>
            {sliceCount === 0 ? 'Has parts? Track it in steps.' : 'Tap it on Today to advance a step.'}
          </Text>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => setSliceCount((n) => (n <= MIN_SLICES ? 0 : n - 1))}
              style={styles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel="Fewer steps"
            >
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepLabel}>{sliceCount === 0 ? 'No steps' : `${sliceCount} steps`}</Text>
            <Pressable
              onPress={() => setSliceCount((n) => (n === 0 ? MIN_SLICES : Math.min(MAX_SLICES, n + 1)))}
              style={styles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel="More steps"
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
      )}

      {lineCount === 1 && !busy && (
        <Text style={styles.sortHint}>{"More than one? Put each on its own line and I'll sort them for you."}</Text>
      )}

      <View style={styles.actions}>
        {lineCount >= 2 ? (
          <Pressable
            onPress={sortDump}
            disabled={busy}
            style={({ pressed }) => [styles.bite, pressed && styles.pressed, busy && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Sort with AI"
          >
            {busyKind === 'sort' ? (
              <View style={styles.biteBusy}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={styles.biteText}>Sorting…</Text>
              </View>
            ) : (
              <Text style={styles.biteText}>Sort for me</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={biteElephant}
            disabled={busy}
            style={({ pressed }) => [styles.bite, pressed && styles.pressed, busy && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Break it down with AI"
          >
            {busyKind === 'bite' ? (
              <View style={styles.biteBusy}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={styles.biteText}>Breaking it down…</Text>
              </View>
            ) : (
              <Text style={styles.biteText}>Break it down</Text>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={add}
          disabled={busy}
          style={({ pressed }) => [styles.add, pressed && styles.pressed, busy && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
        >
          <Text style={styles.addText}>{addLabel}</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={pickerFor !== null} transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerFor(null)} accessibilityLabel="Dismiss">
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>{pickerFor === 'due' ? 'On which day' : 'Starting from'}</Text>
            <DatePicker
              value={pickerFor === 'due' ? dueDate : start}
              today={today}
              onChange={(iso) => {
                if (pickerFor === 'due') setDueDate(iso);
                else setStart(iso);
                setPickerFor(null);
              }}
            />
            {pickerFor === 'start' && (
              <Pressable
                onPress={() => {
                  setStart(todayIso);
                  setPickerFor(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Start today"
              >
                <Text style={styles.pickerToday}>Start today</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  wrap: { gap: spacing.three },
  input: {
    minHeight: 64,
    maxHeight: 160,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
    fontSize: 16 * t.scale,
    fontFamily: fonts.body,
    lineHeight: 22,
    color: t.colors.ink,
  },
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
  chipTextOn: { color: '#FFFFFF' },
  weekdays: { flexDirection: 'row', gap: spacing.two },
  day: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
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
    borderWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: t.colors.accent, fontSize: 20 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  stepLabel: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '500', minWidth: 110, textAlign: 'center' },
  sliceField: { gap: spacing.two },
  sliceHint: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body },
  sortHint: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.one },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  startLabel: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
  startBtn: {
    paddingHorizontal: spacing.three,
    paddingVertical: spacing.one,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.colors.accent,
    backgroundColor: t.colors.accentSoft,
  },
  startBtnText: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43,39,34,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.five,
  },
  pickerCard: {
    backgroundColor: t.colors.bg,
    borderRadius: radius.lg,
    padding: spacing.five,
    width: '100%',
    maxWidth: 360,
    gap: spacing.three,
  },
  pickerTitle: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.sans, fontWeight: '700' },
  pickerToday: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three },
  bite: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.accent,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
  },
  biteBusy: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  biteText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  add: {
    backgroundColor: t.colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.five,
    paddingVertical: spacing.three,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  addText: { color: '#FFFFFF', fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body },
});
