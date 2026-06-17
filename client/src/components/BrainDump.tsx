import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { type CaptureSchedule } from '@/lib/recurrence';

type Props = {
  onCapture: (text: string, schedule: CaptureSchedule) => void;
  today: Date;
};

type Mode = 'today' | 'tomorrow' | 'daily' | 'weekly';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'today', label: 'Today' },
  { mode: 'tomorrow', label: 'Tomorrow' },
  { mode: 'daily', label: 'Daily' },
  { mode: 'weekly', label: 'Weekly' },
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // index 0=Sun .. 6=Sat

const ADD_LABEL: Record<Mode, string> = {
  today: 'Add to today',
  tomorrow: 'Add for tomorrow',
  daily: 'Add daily',
  weekly: 'Add weekly',
};

// The friction-free relief valve, now with a calm "when". Default is Today, so
// the common case stays one gesture; the chips are there when you want them.
export function BrainDump({ onCapture, today }: Props) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>('today');
  const [weekdays, setWeekdays] = useState<number[]>([today.getDay()]);

  function buildSchedule(): CaptureSchedule {
    if (mode === 'weekly') {
      return { mode: 'weekly', weekdays: weekdays.length > 0 ? weekdays : [today.getDay()] };
    }
    return { mode };
  }

  function submit() {
    if (!value.trim()) return;
    onCapture(value, buildSchedule());
    setValue('');
    setMode('today');
    setWeekdays([today.getDay()]);
  }

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={setValue}
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

      <Pressable
        onPress={submit}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={ADD_LABEL[mode]}
      >
        <Text style={styles.addText}>{ADD_LABEL[mode]}</Text>
      </Pressable>
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
  add: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.five,
    paddingVertical: spacing.three,
  },
  pressed: { opacity: 0.8 },
  addText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
