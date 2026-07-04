import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { addMonths, monthLabel, monthMatrix, WEEKDAY_LABELS } from '@/lib/calendar';
import { fromISODate, toISODate } from '@/lib/day';
import { t } from '@/lib/locale';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  value: string | null; // selected ISO date, or null
  onChange: (iso: string) => void;
  today: Date;
  minIso?: string; // earliest selectable day (inclusive); defaults to today, so existing callers stay future-only
  maxIso?: string; // latest selectable day (inclusive); absent = open-ended (the default future behaviour)
};

// A calm month-grid date picker. Pure React Native views (reusing the Lookback's
// monthMatrix), so it works identically on web and Android with no native module.
// By default past days are disabled, since a due date is always today or later;
// a caller picking a PAST day ("Done on…") passes minIso/maxIso to move the window.
export function DatePicker({ value, onChange, today, minIso, maxIso }: Props) {
  const styles = useThemedStyles(makeStyles);
  const todayIso = toISODate(today);
  const min = minIso ?? todayIso; // unset keeps the original contract: today or later
  const [ym, setYm] = useState(() => {
    // Open on the selection's month; with no selection and an all-past window, open on the
    // latest selectable month, so a past-mode picker never starts on all-disabled days.
    const base = value ? fromISODate(value) : maxIso != null && maxIso < todayIso ? fromISODate(maxIso) : today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const weeks = monthMatrix(ym.year, ym.month);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setYm((p) => addMonths(p.year, p.month, -1))}
          style={styles.nav}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.previousMonth')}
        >
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.label}>{monthLabel(ym.year, ym.month)}</Text>
        <Pressable
          onPress={() => setYm((p) => addMonths(p.year, p.month, 1))}
          style={styles.nav}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.nextMonth')}
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
            const off = iso < min || (maxIso != null && iso > maxIso); // outside the selectable window
            const selected = iso === value;
            return (
              <Pressable
                key={di}
                onPress={() => !off && onChange(iso)}
                disabled={off}
                style={[styles.cell, selected && styles.cellOn]}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: off }}
                accessibilityLabel={fromISODate(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              >
                <Text style={[styles.day, off && styles.dayPast, selected && styles.dayOn]}>
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
    borderWidth: border.hair,
    borderColor: t.colors.line,
    borderRadius: radius.md,
    padding: spacing.three,
    gap: spacing.one,
    backgroundColor: t.colors.surface,
    // The day-cells are flex:1 / aspectRatio:1, so a wider host card would stretch them and the whole
    // picker would grow taller. Cap the picker and centre it so the grid stays a fixed comfortable size.
    maxWidth: layout.maxCalendarWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  navText: { color: t.colors.accent, fontFamily: fonts.bodyBold, fontSize: 22 * t.scale, fontWeight: '700', lineHeight: 24 * t.scale },
  label: { color: t.colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 * t.scale, fontWeight: '600' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: t.colors.inkFaint, fontFamily: fonts.body, fontSize: 12 * t.scale, paddingVertical: spacing.one },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  cellOn: { backgroundColor: t.colors.accent },
  day: { color: t.colors.ink, fontFamily: fonts.body, fontSize: 14 * t.scale },
  dayPast: { color: t.colors.inkFaint, opacity: 0.5 },
  dayOn: { color: t.colors.onAccent, fontWeight: '700' },
});
