import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { type CaptureSchedule } from '@/lib/recurrence';

type Props = {
  onCapture: (text: string, schedule: CaptureSchedule) => void;
  onBiteElephant: (text: string) => Promise<void>;
  today: Date;
};

type Mode = 'today' | 'tomorrow' | 'daily' | 'weekly' | 'everyN';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'today', label: 'Today' },
  { mode: 'tomorrow', label: 'Tomorrow' },
  { mode: 'daily', label: 'Daily' },
  { mode: 'weekly', label: 'Weekly' },
  { mode: 'everyN', label: 'Custom' },
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // index 0=Sun .. 6=Sat

const ADD_LABEL: Record<Mode, string> = {
  today: 'Add to today',
  tomorrow: 'Add for tomorrow',
  daily: 'Add daily',
  weekly: 'Add weekly',
  everyN: 'Add repeating',
};

// Capture, with a calm "when" (the chips, for adding) and a "break it down" path
// (hand a dreaded task to the AI and get small steps into Today). Default is one
// gesture; everything else is there only when wanted.
export function BrainDump({ onCapture, onBiteElephant, today }: Props) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>('today');
  const [weekdays, setWeekdays] = useState<number[]>([today.getDay()]);
  const [everyNDays, setEveryNDays] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildSchedule(): CaptureSchedule {
    if (mode === 'weekly') {
      return { mode: 'weekly', weekdays: weekdays.length > 0 ? weekdays : [today.getDay()] };
    }
    if (mode === 'everyN') {
      return { mode: 'everyN', days: everyNDays };
    }
    return { mode };
  }

  function reset() {
    setValue('');
    setMode('today');
    setWeekdays([today.getDay()]);
  }

  function add() {
    if (!value.trim() || busy) return;
    onCapture(value, buildSchedule());
    reset();
  }

  async function biteElephant() {
    const task = value.trim();
    if (!task || busy) return;
    setError(null);
    setBusy(true);
    try {
      await onBiteElephant(task);
      reset();
    } catch {
      setError('Could not break that down just now. Try again.');
    } finally {
      setBusy(false);
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
        placeholderTextColor={colors.inkFaint}
        style={styles.input}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Brain-dump. Add one or more things, one per line"
      />

      <View style={styles.chips}>
        {MODES.map(({ mode: m, label }) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.chip, mode === m && styles.chipOn]}
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
            accessibilityRole="button"
            accessibilityLabel="Fewer days"
          >
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepLabel}>Every {everyNDays} days</Text>
          <Pressable
            onPress={() => setEveryNDays((n) => Math.min(30, n + 1))}
            style={styles.stepBtn}
            accessibilityRole="button"
            accessibilityLabel="More days"
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          onPress={biteElephant}
          disabled={busy}
          style={({ pressed }) => [styles.bite, pressed && styles.pressed, busy && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Break it down with AI"
        >
          {busy ? (
            <View style={styles.biteBusy}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.biteText}>Breaking it down…</Text>
            </View>
          ) : (
            <Text style={styles.biteText}>Break it down</Text>
          )}
        </Pressable>

        <Pressable
          onPress={add}
          disabled={busy}
          style={({ pressed }) => [styles.add, pressed && styles.pressed, busy && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={ADD_LABEL[mode]}
        >
          <Text style={styles.addText}>{ADD_LABEL[mode]}</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.three },
  input: {
    minHeight: 64,
    maxHeight: 160,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
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
  weekdays: { flexDirection: 'row', gap: spacing.two },
  day: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  dayText: { color: colors.inkSoft, fontSize: 13 },
  dayTextOn: { color: colors.accent, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.accent, fontSize: 20, fontWeight: '600' },
  stepLabel: { color: colors.ink, fontSize: 15, fontWeight: '500', minWidth: 110, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three },
  bite: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
  },
  biteBusy: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  biteText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  add: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.five,
    paddingVertical: spacing.three,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  addText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  error: { color: colors.accent, fontSize: 14 },
});
