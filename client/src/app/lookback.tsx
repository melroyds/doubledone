import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { makeScrapbook } from '@/lib/ai';
import { addMonths, completionsByDay, monthLabel, monthMatrix, scheduledByDay, WEEKDAY_LABELS } from '@/lib/calendar';
import { formatTodayLabel, fromISODate, toISODate } from '@/lib/day';
import { canMakeScrapbook, type Entitlement, FREE_ENTITLEMENT } from '@/lib/entitlement';
import { findScrapbook, type Scrapbook, upsertScrapbook, weekCompletions, weekLabel, weekStartISO } from '@/lib/scrapbook';
import { loadScrapbooks, loadTasks, saveScrapbooks } from '@/lib/storage';
import { loadEntitlement } from '@/lib/stripe';
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
  const [ent, setEnt] = useState<Entitlement>(FREE_ENTITLEMENT);
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
      void loadEntitlement().then((e) => {
        if (active) setEnt(e);
      });
      track('lookback.viewed');
      return () => {
        active = false;
      };
    }, []),
  );

  const byDay = useMemo(() => completionsByDay(tasks), [tasks]);
  const scheduled = useMemo(() => scheduledByDay(tasks, today), [tasks, today]);
  const weeks = useMemo(() => monthMatrix(view.year, view.month), [view]);
  const todayIso = toISODate(today);
  const selectedItems = byDay.get(selected) ?? [];
  const selectedScheduled = scheduled.get(selected) ?? [];

  // The scrapbook is per-week: the week of the selected day. Its image is made
  // from that week's finished titles, distilled into a calm, abstract scene.
  const weekStart = weekStartISO(fromISODate(selected));
  const weekList = useMemo(() => weekCompletions(byDay, weekStart), [byDay, weekStart]);
  const existingBook = findScrapbook(scrapbooks, weekStart);

  async function makeWeekScrapbook() {
    const titles = weekList.map((c) => c.title);
    if (bookBusy || titles.length === 0) return;
    // Cadence gate: free is one a month (tapping past it is the paywall moment);
    // premium is the weekly allowance (a calm wait, never a wall). Entitlement is
    // server-verified; the count is the user's own local scrapbook history.
    const gate = canMakeScrapbook(
      ent,
      scrapbooks.map((b) => b.createdAt),
      Date.now(),
    );
    if (!gate.allowed) {
      if (gate.reason === 'free_monthly') {
        track('premium.gate_hit', { reason: 'free_monthly' });
        router.push('/premium');
        return;
      }
      const days = Math.max(1, Math.ceil((gate.resetAt - Date.now()) / 86_400_000));
      setBookError(`That's this week's keepsakes. The next is ready in ${days} day${days === 1 ? '' : 's'}.`);
      return;
    }
    setBookBusy(true);
    setBookError(null);
    try {
      const { image, caption } = await makeScrapbook(titles);
      const next = upsertScrapbook(scrapbooks, { weekStart, image, caption, createdAt: Date.now() });
      setScrapbooks(next);
      void saveScrapbooks(next);
      track('scrapbook.made', { titles: titles.length });
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
            const sched = scheduled.get(iso)?.length ?? 0;
            const isToday = iso === todayIso;
            const isSelected = iso === selected;
            return (
              <Pressable
                key={di}
                onPress={() => openDay(iso)}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityLabel={`${iso}, ${count} finished${bigDay ? ', a big one' : ''}${sched > 0 ? `, ${sched} scheduled` : ''}`}
              >
                <View style={[styles.dayBlob, isToday && styles.dayToday, isSelected && styles.daySelected]}>
                  <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
                    {fromISODate(iso).getDate()}
                  </Text>
                </View>
                {count > 0 ? (
                  <View style={bigDay ? styles.dotBig : styles.dot} />
                ) : sched > 0 ? (
                  <View style={styles.dotScheduled} />
                ) : (
                  <View style={styles.dotSpacer} />
                )}
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
        ) : selectedScheduled.length > 0 ? (
          <>
            <Text style={styles.detailScheduledHead}>Scheduled</Text>
            {selectedScheduled.map((s) => (
              <View key={s.id} style={styles.item}>
                <Text style={styles.itemMarkScheduled}>○</Text>
                <Text style={styles.itemTitle}>{s.title}</Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.detailEmpty}>Nothing logged this day.</Text>
        )}
      </View>

      <View style={styles.scrapbook} testID="scrapbook-card">
        <Text style={styles.scrapbookHead}>Scrapbook</Text>

        {bookBusy ? (
          <View style={styles.polaroid}>
            <View style={styles.scrapbookImagePlaceholder}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
            </View>
            <Text style={styles.scrapbookCaption}>Making your scrapbook…</Text>
          </View>
        ) : existingBook ? (
          <>
            <View style={styles.polaroid}>
              <Image
                source={{ uri: existingBook.image }}
                style={styles.scrapbookImage}
                resizeMode="cover"
                accessible
                accessibilityLabel={`A keepsake still-life for the ${weekLabel(weekStart)}: ${existingBook.caption}`}
              />
              {existingBook.caption.length > 0 && <Text style={styles.scrapbookCaption}>{existingBook.caption}</Text>}
            </View>
            <Text style={styles.scrapbookMeta}>Made with AI · {weekLabel(weekStart)}</Text>
          </>
        ) : weekList.length > 0 ? (
          <View style={styles.inviteWrap}>
            <View style={styles.inviteFrame}>
              <View style={styles.invitePlus}>
                <Text style={styles.invitePlusText}>+</Text>
              </View>
            </View>
            <Text style={styles.scrapbookHint}>Turn this week into a keepsake</Text>
            <Pressable
              onPress={makeWeekScrapbook}
              style={({ pressed }) => [styles.scrapbookBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Make a scrapbook of the ${weekLabel(weekStart)}`}
            >
              <Text style={styles.scrapbookBtnText}>Make a scrapbook</Text>
            </Pressable>
            {bookError && <Text style={styles.scrapbookError}>{bookError}</Text>}
            <Text style={styles.scrapbookNote}>
              Your week&apos;s finished tasks are sent to an AI to imagine the still-life. No names are kept.
            </Text>
          </View>
        ) : (
          <Text style={styles.detailEmpty}>Finish a few things this week to make a scrapbook.</Text>
        )}

        {weekList.length > 0 && (
          <View style={styles.weekList}>
            <Text style={styles.weekListHead}>This week you finished</Text>
            {weekList.map((c) => (
              <View key={c.title} style={styles.item}>
                <Text style={styles.itemMark}>✓</Text>
                <Text style={styles.itemTitle}>{c.title}</Text>
                {c.big && <Text style={styles.itemBig}>a big one</Text>}
              </View>
            ))}
          </View>
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
  dotScheduled: { width: 6, height: 6, borderRadius: radius.pill, borderWidth: 1.5, borderColor: t.colors.accent, marginTop: 2 },
  detail: { marginTop: spacing.six, gap: spacing.two },
  detailDate: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginBottom: spacing.one },
  detailEmpty: { color: t.colors.inkFaint, fontSize: 15 * t.scale, fontFamily: fonts.body },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  itemMark: { color: t.colors.done, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  itemMarkScheduled: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  detailScheduledHead: {
    color: t.colors.accent,
    fontSize: 12 * t.scale,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.one,
  },
  itemTitle: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, flexShrink: 1 },
  itemBig: { color: t.colors.done, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  scrapbook: { marginTop: spacing.six, gap: spacing.three },
  scrapbookHead: { color: t.colors.ink, fontSize: 20 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
  // The keepsake polaroid: a soft mat around the square image with a gentle
  // shadow, the caption resting on the lip below.
  polaroid: {
    backgroundColor: t.colors.surface,
    borderRadius: radius.md,
    padding: spacing.three,
    paddingBottom: spacing.four,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  scrapbookImage: { width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: t.colors.accentSoft },
  scrapbookImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrapbookCaption: {
    color: t.colors.ink,
    fontSize: 15 * t.scale,
    fontFamily: fonts.sans,
    fontStyle: 'italic',
    lineHeight: 21,
    textAlign: 'center',
    marginTop: spacing.three,
    paddingHorizontal: spacing.two,
  },
  scrapbookMeta: { color: t.colors.inkFaint, fontSize: 12 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
  inviteWrap: { gap: spacing.three, alignItems: 'center' },
  inviteFrame: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: t.colors.line,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitePlus: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitePlusText: { color: t.colors.accent, fontSize: 28 * t.scale, fontFamily: fonts.body, lineHeight: 32 },
  scrapbookHint: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
  scrapbookBtn: {
    alignSelf: 'center',
    backgroundColor: t.colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.six,
    paddingVertical: spacing.three,
  },
  scrapbookBtnText: { color: '#FFFFFF', fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  scrapbookError: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
  scrapbookNote: { color: t.colors.inkFaint, fontSize: 12 * t.scale, fontFamily: fonts.body, lineHeight: 17, textAlign: 'center' },
  weekList: { marginTop: spacing.four, gap: spacing.two },
  weekListHead: {
    color: t.colors.inkSoft,
    fontSize: 13 * t.scale,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: spacing.one,
  },
  pressed: { opacity: 0.85 },
});
