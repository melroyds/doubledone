import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { makeScrapbook } from '@/lib/ai';
import { addMonths, completionsByDay, monthLabel, monthMatrix, WEEKDAY_LABELS } from '@/lib/calendar';
import { formatTodayLabel, fromISODate, toISODate } from '@/lib/day';
import { findScrapbook, type Scrapbook, upsertScrapbook, weekLabel, weekStartISO, weekTitles } from '@/lib/scrapbook';
import { loadScrapbooks, loadTasks, saveScrapbooks } from '@/lib/storage';
import { type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

// The Lookback: an interactive Gregorian calendar of what you actually finished,
// browsable by day. The emotional payoff, never a stats page, never a streak.
// Reads the local store (synced tasks are already merged in).
export default function LookbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useMemo(() => new Date(), []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(toISODate(today));
  const [scrapbooks, setScrapbooks] = useState<Scrapbook[]>([]);
  const [bookBusy, setBookBusy] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();

  // Re-read the local store every time the screen regains focus, not only on first
  // mount, so the calendar always reflects the current data, including after an
  // account deletion clears it on this device. A remount is not guaranteed on
  // native (router.replace keeps a mounted screen alive); web reloads. This is what
  // stops a stale Lookback from lingering after a delete.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadTasks().then((stored) => {
        if (active) setTasks(stored);
      });
      void loadScrapbooks().then((books) => {
        if (active) setScrapbooks(books);
      });
      track('lookback.viewed');
      return () => {
        active = false;
      };
    }, []),
  );

  const byDay = useMemo(() => completionsByDay(tasks), [tasks]);
  const weeks = useMemo(() => monthMatrix(view.year, view.month), [view]);
  const todayIso = toISODate(today);
  const selectedItems = byDay.get(selected) ?? [];

  // The scrapbook is per-week: the week of the selected day. Its image is made
  // from that week's finished titles, distilled into a calm, abstract scene.
  const weekStart = weekStartISO(fromISODate(selected));
  const weekTitleList = useMemo(() => weekTitles(byDay, weekStart), [byDay, weekStart]);
  const existingBook = findScrapbook(scrapbooks, weekStart);

  async function makeWeekScrapbook() {
    if (bookBusy || weekTitleList.length === 0) return;
    setBookBusy(true);
    setBookError(null);
    try {
      const { image, caption } = await makeScrapbook(weekTitleList);
      const next = upsertScrapbook(scrapbooks, { weekStart, image, caption, createdAt: Date.now() });
      setScrapbooks(next);
      void saveScrapbooks(next);
      track('scrapbook.made', { titles: weekTitleList.length });
    } catch {
      setBookError('Could not make a scrapbook just now. Try again.');
    } finally {
      setBookBusy(false);
    }
  }

  function step(delta: number) {
    setView((v) => addMonths(v.year, v.month, delta));
  }

  function openDay(iso: string) {
    setSelected(iso);
    track('lookback.day_opened', { count: byDay.get(iso)?.length ?? 0 });
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.six, paddingBottom: insets.bottom + spacing.six }]}
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to today" hitSlop={8}>
        <Text style={styles.back}>Today</Text>
      </Pressable>

      <Text style={styles.title}>Lookback</Text>
      <Text style={styles.sub}>Everything you have actually finished.</Text>

      <View style={styles.monthBar}>
        <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(view.year, view.month)}</Text>
        <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((iso, di) => {
            if (iso == null) return <View key={di} style={styles.cell} />;
            const items = byDay.get(iso);
            const count = items?.length ?? 0;
            const bigDay = items?.some((c) => c.big) ?? false;
            const isToday = iso === todayIso;
            const isSelected = iso === selected;
            return (
              <Pressable
                key={di}
                onPress={() => openDay(iso)}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityLabel={`${iso}, ${count} finished${bigDay ? ', a big one' : ''}`}
              >
                <View style={[styles.dayBlob, isToday && styles.dayToday, isSelected && styles.daySelected]}>
                  <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
                    {fromISODate(iso).getDate()}
                  </Text>
                </View>
                {count > 0 ? <View style={bigDay ? styles.dotBig : styles.dot} /> : <View style={styles.dotSpacer} />}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.detail}>
        <Text style={styles.detailDate}>{formatTodayLabel(fromISODate(selected))}</Text>
        {selectedItems.length > 0 ? (
          selectedItems.map((c) => (
            <View key={c.id} style={styles.item}>
              <Text style={styles.itemMark}>✓</Text>
              <Text style={styles.itemTitle}>{c.title}</Text>
              {c.big && <Text style={styles.itemBig}>a big one</Text>}
            </View>
          ))
        ) : (
          <Text style={styles.detailEmpty}>Nothing logged this day.</Text>
        )}
      </View>

      <View style={styles.scrapbook}>
        <Text style={styles.scrapbookHead}>Scrapbook</Text>
        {existingBook ? (
          <View style={styles.scrapbookCard}>
            <Image
              source={{ uri: existingBook.image }}
              style={styles.scrapbookImage}
              resizeMode="cover"
              accessible
              accessibilityLabel={`A calm keepsake image for the ${weekLabel(weekStart)}: ${existingBook.caption}`}
            />
            {existingBook.caption.length > 0 && <Text style={styles.scrapbookCaption}>{existingBook.caption}</Text>}
            <Text style={styles.scrapbookNote}>Made with AI from the {weekLabel(weekStart)}.</Text>
          </View>
        ) : weekTitleList.length > 0 ? (
          <View style={styles.scrapbookCard}>
            <Text style={styles.scrapbookHint}>Turn the {weekLabel(weekStart)} into a calm keepsake image.</Text>
            <Pressable
              onPress={makeWeekScrapbook}
              disabled={bookBusy}
              style={({ pressed }) => [styles.scrapbookBtn, pressed && styles.pressed, bookBusy && styles.dim]}
              accessibilityRole="button"
              accessibilityLabel={`Make a scrapbook of the ${weekLabel(weekStart)}`}
            >
              {bookBusy ? (
                <View style={styles.scrapbookBtnBusy}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text style={styles.scrapbookBtnText}>Making it…</Text>
                </View>
              ) : (
                <Text style={styles.scrapbookBtnText}>Make a scrapbook</Text>
              )}
            </Pressable>
            {bookError && <Text style={styles.scrapbookError}>{bookError}</Text>}
            <Text style={styles.scrapbookNote}>
              Your week&apos;s titles are sent to an AI to imagine a calm scene. No names are kept.
            </Text>
          </View>
        ) : (
          <Text style={styles.detailEmpty}>Finish a few things this week to make a scrapbook.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingHorizontal: spacing.five, maxWidth: 560, width: '100%', alignSelf: 'center' },
  back: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, marginBottom: spacing.five },
  title: { color: t.colors.ink, fontSize: 34 * t.scale, fontWeight: '700', fontFamily: fonts.sans, letterSpacing: -0.5 },
  sub: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, marginTop: spacing.two, marginBottom: spacing.six },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.four,
  },
  monthLabel: { color: t.colors.ink, fontSize: 18 * t.scale, fontWeight: '600', fontFamily: fonts.sans },
  arrow: { color: t.colors.accent, fontSize: 28 * t.scale, fontFamily: fonts.body, paddingHorizontal: spacing.three },
  weekRow: { flexDirection: 'row' },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    color: t.colors.inkFaint,
    fontSize: 12 * t.scale,
    fontFamily: fonts.bodyBold,
    fontWeight: '600',
    marginBottom: spacing.two,
  },
  cell: { flex: 1, alignItems: 'center', paddingVertical: spacing.one },
  dayBlob: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1, borderColor: t.colors.line },
  daySelected: { backgroundColor: t.colors.accent },
  dayNum: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body },
  dayNumSelected: { color: '#FFFFFF', fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: t.colors.done, marginTop: 3 },
  dotBig: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: t.colors.done, marginTop: 1 },
  dotSpacer: { width: 5, height: 5, marginTop: 3 },
  detail: { marginTop: spacing.six, gap: spacing.two },
  detailDate: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginBottom: spacing.one },
  detailEmpty: { color: t.colors.inkFaint, fontSize: 15 * t.scale, fontFamily: fonts.body },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  itemMark: { color: t.colors.done, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  itemTitle: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, flexShrink: 1 },
  itemBig: { color: t.colors.done, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  scrapbook: { marginTop: spacing.six, gap: spacing.three },
  scrapbookHead: { color: t.colors.ink, fontSize: 20 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
  scrapbookCard: { gap: spacing.two },
  scrapbookImage: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: t.colors.surface },
  scrapbookCaption: {
    color: t.colors.ink,
    fontSize: 15 * t.scale,
    fontFamily: fonts.sans,
    fontStyle: 'italic',
    lineHeight: 21,
    marginTop: spacing.one,
  },
  scrapbookHint: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
  scrapbookBtn: {
    alignSelf: 'flex-start',
    backgroundColor: t.colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.five,
    paddingVertical: spacing.three,
  },
  scrapbookBtnBusy: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  scrapbookBtnText: { color: '#FFFFFF', fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  scrapbookError: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body },
  scrapbookNote: { color: t.colors.inkFaint, fontSize: 12 * t.scale, fontFamily: fonts.body, lineHeight: 17 },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.6 },
});
