import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { PremiumButton } from '@/components/PremiumButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { lookbackSummary, makeScrapbook } from '@/lib/ai';
import { addMonths, completionsByDay, monthLabel, monthMatrix, scheduledByDay, WEEKDAY_LABELS } from '@/lib/calendar';
import { aiErrorLine } from '@/lib/connection';
import { formatTodayLabel, fromISODate, toISODate } from '@/lib/day';
import { canMakeScrapbook } from '@/lib/entitlement';
import { scrapbookReady } from '@/lib/haptics';
import { lookbackStats } from '@/lib/insights';
import { usePremium } from '@/lib/premium-provider';
import { findScrapbook, type Scrapbook, upsertScrapbook, weekCompletions, weekLabel, weekStartISO } from '@/lib/scrapbook';
import { loadScrapbooks, loadTasks, saveScrapbooks } from '@/lib/storage';
import { type Task } from '@/lib/tasks';
import { track } from '@/lib/telemetry';
import { useReducedMotion, useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';

// The Lookback: an interactive Gregorian calendar of what you actually finished,
// browsable by day. The emotional payoff, never a stats page, never a streak.
// Reads the local store (synced tasks are already merged in).
export default function LookbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const today = useMemo(() => new Date(), []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(toISODate(today));
  const [scrapbooks, setScrapbooks] = useState<Scrapbook[]>([]);
  const [bookBusy, setBookBusy] = useState(false);
  // A synchronous mirror of bookBusy: each Workers-AI image is ~the whole daily neuron budget, so a
  // same-frame double-tap must be rejected before the React re-render lands. The state drives the UI
  // (and the button's disabled), the ref is the real concurrency guard checked at the top of the call.
  const bookBusyRef = useRef(false);
  const [bookError, setBookError] = useState<string | null>(null);
  // Week-starts whose stored keepsake image failed to load (e.g. the R2 object was purged on an account
  // delete, leaving a local entry that points at a now-missing image). Such a week falls back to the calm
  // "make one" invite instead of a blank polaroid.
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState('');
  const [summaryWeek, setSummaryWeek] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // The premium flag's gate-ready entitlement: real tenure, premium resolved through the dev
  // override, so the scrapbook cadence below is exactly what the Settings override drives.
  const { effectiveEntitlement, premium, loading: premiumLoading } = usePremium();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const aiEnabled = useSettings().settings.aiEnabled; // the scrapbook + weekly reflection are AI; hidden when off

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
  const isFirstRun = byDay.size === 0; // no completion ever recorded: a fresh account, show one warm line, not stacked empties
  const scheduled = useMemo(() => scheduledByDay(tasks, today), [tasks, today]);
  const weeks = useMemo(() => monthMatrix(view.year, view.month), [view]);
  const todayIso = toISODate(today);
  const selectedItems = byDay.get(selected) ?? [];
  const selectedScheduled = scheduled.get(selected) ?? [];
  const monthHasCompletions = useMemo(() => {
    const prefix = `${view.year}-${String(view.month + 1).padStart(2, '0')}-`;
    for (const iso of byDay.keys()) if (iso.startsWith(prefix)) return true;
    return false;
  }, [byDay, view]);

  // The scrapbook is per-week: the week of the selected day. Its image is made
  // from that week's finished titles, distilled into a calm, abstract scene.
  const weekStart = weekStartISO(fromISODate(selected));
  const weekList = useMemo(() => weekCompletions(byDay, weekStart), [byDay, weekStart]);
  const existingBook = findScrapbook(scrapbooks, weekStart);
  // Premium insights: calm current-period stats (from `today`). The per-week AI reflection is tagged with
  // the week it belongs to (summaryWeek), so it shows only on its own week and never lingers on another.
  const stats = useMemo(() => lookbackStats(byDay, today), [byDay, today]);

  async function makeWeekScrapbook() {
    const titles = weekList.map((c) => c.title);
    // Synchronous re-entry guard: reject a same-frame second tap before any re-render, then mirror
    // into state for the UI. bookBusy alone would let two taps both read false in the same frame.
    if (bookBusyRef.current || titles.length === 0) return;
    bookBusyRef.current = true;
    // Cadence gate: free is one a month (tapping past it is the paywall moment);
    // premium is the weekly allowance (a calm wait, never a wall). Entitlement is
    // server-verified; the count is the user's own local scrapbook history.
    const gate = canMakeScrapbook(
      effectiveEntitlement,
      scrapbooks.map((b) => b.createdAt),
      Date.now(),
    );
    if (!gate.allowed) {
      bookBusyRef.current = false; // gate blocked, no billable call: free the guard so the user can retry
      if (gate.reason === 'free_monthly') {
        track('premium.gate_hit', { reason: 'free_monthly' });
        router.push('/premium');
        return;
      }
      const days = Math.max(1, Math.ceil((gate.resetAt - Date.now()) / 86_400_000));
      setBookError(`That's this week's scrapbook. The next is ready in ${days} day${days === 1 ? '' : 's'}.`);
      return;
    }
    setBookBusy(true);
    setBookError(null);
    try {
      const { image, caption } = await makeScrapbook(titles);
      const next = upsertScrapbook(scrapbooks, { weekStart, image, caption, createdAt: Date.now() });
      setScrapbooks(next);
      void saveScrapbooks(next);
      // A remade week has a fresh image, so clear any stale broken-image flag for it.
      setBrokenImages((prev) => {
        if (!prev.has(weekStart)) return prev;
        const cleared = new Set(prev);
        cleared.delete(weekStart);
        return cleared;
      });
      scrapbookReady(reduced); // the keepsake landed: the payoff flourish, at the reveal
      track('scrapbook.made', { titles: titles.length });
    } catch {
      setBookError(aiErrorLine('Could not make a scrapbook just now. Try again.'));
    } finally {
      setBookBusy(false);
      bookBusyRef.current = false;
    }
  }

  // The premium weekly reflection: the selected week's finished titles in, one warm paragraph out.
  // Display-only, it changes no tasks, so there is no propose-then-accept. lookbackSummary never throws
  // (returns '' on any failure), so an empty result is the one calm error path.
  async function reflectOnWeek() {
    const titles = weekList.map((c) => c.title);
    if (summaryBusy || titles.length === 0) return;
    setSummaryBusy(true);
    setSummaryError(null);
    setSummaryWeek(weekStart);
    try {
      const text = await lookbackSummary(titles);
      if (text) {
        setSummary(text);
        track('lookback.summary.made', { titles: titles.length });
      } else {
        setSummaryError(aiErrorLine('Could not reflect on the week just now. Try again.'));
      }
    } finally {
      setSummaryBusy(false);
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
      <BackLink label="Today" />

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

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>finished</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDotBig} />
          <Text style={styles.legendText}>a big one</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDotScheduled} />
          <Text style={styles.legendText}>scheduled</Text>
        </View>
      </View>

      {isFirstRun ? (
        // First run: one warm line in place of the stacked month-empty + day-empty, so the payoff screen
        // never greets a brand-new user with "you have done nothing".
        <Text style={styles.monthEmpty}>This is where everything you finish will gather. Nothing yet, and that&apos;s a fine place to start.</Text>
      ) : (
        !monthHasCompletions && <Text style={styles.monthEmpty}>A quiet month so far. What you finish will appear here.</Text>
      )}

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
        ) : isFirstRun ? null : (
          <Text style={styles.detailEmpty}>Nothing logged this day.</Text>
        )}
      </View>

      {aiEnabled && (
        <View style={styles.scrapbook} testID="scrapbook-card">
        <Text style={styles.scrapbookHead}>Scrapbook</Text>

        {bookBusy ? (
          <View style={styles.polaroid}>
            <View style={styles.scrapbookImagePlaceholder}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
            </View>
            <Text style={styles.scrapbookCaption}>Making your scrapbook…</Text>
          </View>
        ) : existingBook && !brokenImages.has(weekStart) ? (
          <>
            <View style={styles.polaroid}>
              <Image
                source={{ uri: existingBook.image }}
                style={styles.scrapbookImage}
                resizeMode="cover"
                onError={() => setBrokenImages((prev) => new Set(prev).add(weekStart))}
                accessible
                accessibilityLabel={`A scrapbook still-life for the ${weekLabel(weekStart)}: ${existingBook.caption}`}
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
            <Text style={styles.scrapbookHint}>
              {existingBook ? "That scrapbook's picture isn't available anymore. Make a new one?" : 'Turn this week into a scrapbook'}
            </Text>
            {/* State the free cadence up front, so a free user knows the keepsake is monthly before they tap,
                rather than meeting the cap as a surprise bounce at the emotional-payoff moment. */}
            {!premium && <Text style={styles.scrapbookCadence}>Your free keepsake for this month.</Text>}
            <PrimaryButton
              label="Make a scrapbook"
              onPress={makeWeekScrapbook}
              disabled={bookBusy}
              pill
              accessibilityLabel={`Make a scrapbook of the ${weekLabel(weekStart)}`}
              style={styles.scrapbookBtn}
            />
            {bookError && <Text style={styles.scrapbookError}>{bookError}</Text>}
            <Text style={styles.scrapbookNote}>
              Your week&apos;s finished things are sent to an AI to imagine the still-life. No names are kept.
            </Text>
          </View>
        ) : (
          <Text style={styles.detailEmpty}>Finish a few things this week to make a scrapbook.</Text>
        )}

        {weekList.length > 0 && (
          <View style={styles.weekList}>
            <Text style={styles.weekListHead}>This week you finished</Text>
            {weekList.map((c, i) => (
              <View key={`${c.title}-${i}`} style={styles.item}>
                <Text style={styles.itemMark}>✓</Text>
                <Text style={styles.itemTitle}>{c.title}</Text>
                {c.big && <Text style={styles.itemBig}>a big one</Text>}
              </View>
            ))}
          </View>
        )}
      </View>
      )}

      {/* Premium "Your patterns": pure additive abundance BELOW the always-free calendar and scrapbook.
          Free users see a calm one-line invite (never a teased-then-locked number). Premium users see
          calm celebratory stats and an optional display-only AI weekly reflection. */}
      {!premiumLoading &&
        (premium ? (
          <View style={styles.insightsCard}>
            <Text style={styles.insightsHead}>Your patterns</Text>
            {stats.finishedThisMonth === 0 ? (
              <Text style={styles.insightsStat}>As you finish things, your weeks and months will gather here.</Text>
            ) : (
              <>
                {stats.finishedThisWeek > 0 && (
                  <Text style={styles.insightsStat}>This week you finished {stats.finishedThisWeek}.</Text>
                )}
                <Text style={styles.insightsStat}>
                  This month, you finished things on {stats.activeDaysThisMonth} {stats.activeDaysThisMonth === 1 ? 'day' : 'days'}.
                </Text>
                {stats.bigWinsThisMonth > 0 && (
                  <Text style={styles.insightsStat}>
                    You reclaimed {stats.bigWinsThisMonth} {stats.bigWinsThisMonth === 1 ? 'thing' : 'things'} that had been waiting
                    {stats.bigWinTitle ? `, like ${stats.bigWinTitle}` : ''}.
                  </Text>
                )}
              </>
            )}
            {aiEnabled && weekList.length > 0 && (
              <View style={styles.summarySection}>
                {summaryWeek === weekStart && summary ? (
                  <Text style={styles.summaryText}>{summary}</Text>
                ) : summaryWeek === weekStart && summaryBusy ? (
                  <View style={styles.summaryBusyRow}>
                    <ActivityIndicator size="small" color={theme.colors.accent} />
                    <Text style={styles.insightsStat}>Looking back over your week…</Text>
                  </View>
                ) : (
                  <>
                    <PremiumButton
                      label="Reflect on this week"
                      onPress={reflectOnWeek}
                      disabled={summaryBusy}
                      accessibilityLabel="Reflect on this week with AI"
                      style={styles.summaryBtn}
                    />
                    <Text style={styles.scrapbookNote}>
                      Your week&apos;s finished things are sent to an AI to write this, then discarded. No names are kept.
                    </Text>
                  </>
                )}
                {summaryWeek === weekStart && summaryError && <Text style={styles.scrapbookError}>{summaryError}</Text>}
              </View>
            )}
          </View>
        ) : (
          <Pressable
            style={styles.insightsCard}
            onPress={() => {
              track('premium.gate_hit', { reason: 'insights' });
              router.push('/premium');
            }}
            accessibilityRole="button"
            accessibilityLabel="See your patterns with Premium"
          >
            <Text style={styles.insightsHead}>Your patterns</Text>
            <Text style={styles.insightsUpsell}>See what your weeks and months add up to, with Premium.</Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingHorizontal: spacing.five, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
  title: { color: t.colors.ink, fontSize: 34 * t.scale, fontWeight: '600', fontFamily: fonts.sans, letterSpacing: -0.5, marginTop: spacing.five },
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
  dayToday: { borderWidth: border.hair, borderColor: t.colors.line },
  daySelected: { backgroundColor: t.colors.accent },
  dayNum: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body },
  dayNumSelected: { color: t.colors.onAccent, fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: t.colors.done, marginTop: 3 },
  dotBig: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: t.colors.done, marginTop: 1 },
  dotSpacer: { width: 5, height: 5, marginTop: 3 },
  dotScheduled: { width: 6, height: 6, borderRadius: radius.pill, borderWidth: border.thin, borderColor: t.colors.accent, marginTop: spacing.half },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.four, marginTop: spacing.four },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.one },
  legendDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: t.colors.done },
  legendDotBig: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: t.colors.done },
  legendDotScheduled: { width: 7, height: 7, borderRadius: radius.pill, borderWidth: border.thin, borderColor: t.colors.accent },
  legendText: { color: t.colors.inkFaint, fontSize: 12 * t.scale, fontFamily: fonts.body },
  monthEmpty: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.five },
  detail: { marginTop: spacing.six, gap: spacing.two },
  detailDate: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginBottom: spacing.one },
  detailEmpty: { color: t.colors.inkFaint, fontSize: 15 * t.scale, fontFamily: fonts.body },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  itemMark: { color: t.colors.doneText, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
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
  itemBig: { color: t.colors.doneText, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
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
    maxWidth: layout.cardMediaWidth,
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
    lineHeight: 21 * t.scale,
    textAlign: 'center',
    marginTop: spacing.three,
    paddingHorizontal: spacing.two,
  },
  scrapbookMeta: { color: t.colors.inkFaint, fontSize: 12 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
  inviteWrap: { gap: spacing.three, alignItems: 'center' },
  inviteFrame: {
    width: '100%',
    maxWidth: layout.cardMediaWidth,
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: border.thin,
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
  invitePlusText: { color: t.colors.accent, fontSize: 28 * t.scale, fontFamily: fonts.body, lineHeight: 32 * t.scale },
  scrapbookHint: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
  scrapbookBtn: { alignSelf: 'center' },
  scrapbookError: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
  scrapbookNote: { color: t.colors.inkFaint, fontSize: 12 * t.scale, fontFamily: fonts.body, lineHeight: 17 * t.scale, textAlign: 'center' },
  scrapbookCadence: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.one },
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
  insightsCard: { marginTop: spacing.six, backgroundColor: t.colors.surface, borderRadius: radius.md, padding: spacing.four, gap: spacing.two },
  insightsHead: { color: t.colors.ink, fontSize: 20 * t.scale, fontFamily: fonts.sans, fontWeight: '600', marginBottom: spacing.one },
  insightsStat: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, lineHeight: 23 * t.scale },
  insightsUpsell: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale },
  summarySection: { marginTop: spacing.three, gap: spacing.two },
  summaryBusyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  summaryText: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic', lineHeight: 22 * t.scale },
  summaryBtn: { alignSelf: 'flex-start' },
});
