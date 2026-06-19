import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { addMonths, monthLabel, monthMatrix, WEEKDAY_LABELS } from '@/lib/calendar';
import { fromISODate, toISODate } from '@/lib/day';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  value: string | null; // selected ISO date, or null
  onChange: (iso: string) => void;
  today: Date;
};

// A calm month-grid date picker. Pure React Native views (reusing the Lookback's
// monthMatrix), so it works identically on web and Android with no native module.
// Past days are disabled, since a due date is always today or later.
export function DatePicker({ value, onChange, today }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [ym, setYm] = useState(() => {
    const base = value ? fromISODate(value) : today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const todayIso = toISODate(today);
  const weeks = monthMatrix(ym.year, ym.month);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setYm((p) => addMonths(p.year, p.month, -1))}
          style={styles.nav}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.label}>{monthLabel(ym.year, ym.month)}</Text>
        <Pressable
          onPress={() => setYm((p) => addMonths(p.year, p.month, 1))}
          style={styles.nav}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((iso, di) => {
            if (!iso) return <View key={di} style={styles.cell} />;
            const past = iso < todayIso;
            const selected = iso === value;
            return (
              <Pressable
                key={di}
                onPress={() => !past && onChange(iso)}
                disabled={past}
                style={[styles.cell, selected && styles.cellOn]}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: past }}
                accessibilityLabel={iso}
              >
                <Text style={[styles.day, past && styles.dayPast, selected && styles.dayOn]}>
                  {Number(iso.slice(8, 10))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: radius.md,
    padding: spacing.three,
    gap: spacing.one,
    backgroundColor: t.colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  navText: { color: t.colors.accent, fontFamily: fonts.body, fontSize: 22 * t.scale, fontWeight: '700', lineHeight: 24 },
  label: { color: t.colors.ink, fontFamily: fonts.body, fontSize: 15 * t.scale, fontWeight: '600' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: t.colors.inkFaint, fontFamily: fonts.body, fontSize: 12 * t.scale, paddingVertical: spacing.one },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  cellOn: { backgroundColor: t.colors.accent },
  day: { color: t.colors.ink, fontFamily: fonts.body, fontSize: 14 * t.scale },
  dayPast: { color: t.colors.inkFaint, opacity: 0.5 },
  dayOn: { color: '#FFFFFF', fontWeight: '700' },
});
