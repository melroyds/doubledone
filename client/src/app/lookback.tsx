import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { PremiumButton } from '@/components/PremiumButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, layout, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { lookbackSummary, makeScrapbook } from '@/lib/ai';
import { addMonths, canAddToDay, completionsByDay, monthLabel, monthMatrix, scheduledByDay, WEEKDAY_LABELS } from '@/lib/calendar';
import { aiErrorLine } from '@/lib/connection';
import { formatTodayLabel, fromISODate, toISODate } from '@/lib/day';
import { canMakeScrapbook } from '@/lib/entitlement';
import { scrapbookReady } from '@/lib/haptics';
import { captureKeepsakeCard } from '@/lib/keepsake-capture';
import { lookbackStats } from '@/lib/insights';
import { fmt, t } from '@/lib/locale';
import { usePremium } from '@/lib/premium-provider';
import { findScrapbook, type Scrapbook, upsertScrapbook, weekCompletions, weekLabel, weekStartISO } from '@/lib/scrapbook';
import { shareScrapbook } from '@/lib/share';
import { loadScrapbooks, loadTasks, saveScrapbooks, saveTasks } from '@/lib/storage';
import { makeId, nowMs, type Task, withMonotonicStamps } from '@/lib/tasks';
import { updateWidget } from '@/widget/update';
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
  // Adding into a future day (Tier 1, the promise the "Calendar" rename made). `addedNote` is a
  // quiet confirmation that the thing landed on the day the person chose, since after adding they
  // are still looking at the calendar rather than at Today where it will appear.
  const [addingForDay, setAddingForDay] = useState(false);
  const [addText, setAddText] = useState('');
  const [addedNote, setAddedNote] = useState<string | null>(null);
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
  const weeks = useMemo(() => monthMatrix(view.year, view.month), [view]);
  // Planned marks for the visible month: one-off dues plus each repeat's projected occurrences
  // (the "wash hair every 4 days shows on the calendar" ask), skip-today'd instances excluded.
  const scheduled = useMemo(() => scheduledByDay(tasks, today, weeks.flat()), [tasks, today, weeks]);
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
  // The one calm line the share action ever shows (web download / no share path); shared = quiet.
  const [shareNote, setShareNote] = useState<string | null>(null);
  // The offscreen keepsake PAGE (image + caption band) view-shot captures for sharing (native).
  const shareCardRef = useRef<View>(null);

  // Share the keepsake PAGE: the image with its caption baked into the pixels (Melroy,
  // device round 2026-07-12: a bare image with no context is half a keepsake). In pixels,
  // not as attached message text, because receiving apps (WhatsApp foremost) freely drop
  // text sent beside an image, while nobody can strip what is part of the picture. Still
  // never a link, and never raw task titles: the caption is the user-visible scene line
  // already shown under the keepsake. Native captures the hidden card; web composites the
  // same page on a canvas; if either fails, the bare image shares exactly as before.
  async function shareWeekScrapbook() {
    if (!existingBook) return;
    const page = Platform.OS === 'web' ? null : await captureKeepsakeCard(shareCardRef);
    const how = await shareScrapbook(page ?? existingBook.image, existingBook.caption, `DoubleDone · ${weekLabel(weekStart)}`);
    track('scrapbook.shared', { how });
    setShareNote(how === 'saved' ? t('lookback.keepsakeSaved') : how === 'unavailable' ? t('lookback.shareUnavailable') : null);
  }

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
      setBookError(fmt.plural(days, { one: t('lookback.scrapbookWeeklyGateOne'), other: t('lookback.scrapbookWeeklyGateOther') }, { days }));
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
      setBookError(aiErrorLine(t('lookback.scrapbookError')));
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
        setSummaryError(aiErrorLine(t('lookback.reflectError')));
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
    // Moving to a different day abandons any half-typed add: the input is bound to the day the
    // person opened it on, and silently re-pointing it at a new date is how a task lands somewhere
    // nobody asked for.
    setAddingForDay(false);
    setAddText('');
    setAddedNote(null);
    track('lookback.day_opened', { count: byDay.get(iso)?.length ?? 0 });
  }

  /**
   * Drop a one-off dated task onto the selected FUTURE day. Same shape the Today capture builds, so
   * the task is ordinary in every respect and syncs, exports and appears on Today when the day comes.
   *
   * `canAddToDay` is re-checked here rather than trusted from the render: the button cannot be shown
   * for a past day, but a day can be re-selected while the input is open, and a guard that only lives
   * in JSX is one state change away from being wrong.
   */
  function addForSelectedDay() {
    const title = addText.trim();
    if (!title || !canAddToDay(selected, todayIso)) return;
    const now = nowMs();
    const added: Task = { id: makeId(), title, done: false, createdAt: now, updatedAt: now, due: selected };
    const next = withMonotonicStamps([...tasks, added], tasks);
    setTasks(next);
    void saveTasks(next);
    void updateWidget(next, null); // the widget shows TODAY, so a future add cannot change it; kept for store parity
    setAddText('');
    setAddingForDay(false);
    setAddedNote(t('lookback.addedForDay', { date: formatTodayLabel(fromISODate(selected)) }));
    track('task.added', { count: 1, schedule: 'calendar_day' });
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.six, paddingBottom: insets.bottom + spacing.six }]}
    >
      <BackLink label={t('common.today')} />

      <Text style={styles.title}>{t('lookback.title')}</Text>
      <Text style={styles.sub}>{t('lookback.subtitle')}</Text>

      <View style={styles.monthBar}>
        <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel={t('common.previousMonth')} hitSlop={10}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(view.year, view.month)}</Text>
        <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel={t('common.nextMonth')} hitSlop={10}>
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
                accessibilityLabel={t('lookback.dayCellA11y', {
                  iso,
                  count,
                  bigPart: bigDay ? t('lookback.dayCellBig') : '',
                  schedPart: sched > 0 ? t('lookback.dayCellSched', { sched }) : '',
                })}
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
          <Text style={styles.legendText}>{t('lookback.legendFinished')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDotBig} />
          <Text style={styles.legendText}>{t('lookback.aBigOne')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDotScheduled} />
          <Text style={styles.legendText}>{t('lookback.legendScheduled')}</Text>
        </View>
      </View>

      {isFirstRun ? (
        // First run: one warm line in place of the stacked month-empty + day-empty, so the payoff screen
        // never greets a brand-new user with "you have done nothing".
        <Text style={styles.monthEmpty}>{t('lookback.firstRunEmpty')}</Text>
      ) : (
        !monthHasCompletions && <Text style={styles.monthEmpty}>{t('lookback.monthEmpty')}</Text>
      )}

      <View style={styles.detail}>
        <Text style={styles.detailDate}>{formatTodayLabel(fromISODate(selected))}</Text>
        {selectedItems.length > 0 ? (
          selectedItems.map((c) => (
            <View key={c.id} style={styles.item}>
              <Text style={styles.itemMark}>✓</Text>
              <Text style={styles.itemTitle}>{c.title}</Text>
              {c.big && <Text style={styles.itemBig}>{t('lookback.aBigOne')}</Text>}
            </View>
          ))
        ) : selectedScheduled.length > 0 ? (
          <>
            <Text style={styles.detailScheduledHead}>{t('lookback.scheduledHeading')}</Text>
            {selectedScheduled.map((s) => (
              <View key={s.id} style={styles.item}>
                <Text style={styles.itemMarkScheduled}>○</Text>
                <Text style={styles.itemTitle}>{s.title}</Text>
                {s.recurring && <Text style={styles.itemRepeat} accessible={false} importantForAccessibility="no">↻</Text>}
              </View>
            ))}
          </>
        ) : isFirstRun ? null : (
          <Text style={styles.detailEmpty}>{t('lookback.dayEmpty')}</Text>
        )}

        {/* Adding INTO a future day. Renaming Lookback to "Calendar" made the screen promise this:
            a person taps a day ahead expecting to put something there. Future days only (canAddToDay);
            the past is a shame-free record, and today already has capture permanently docked.
            One line, one tap, no date picker: the day IS the date, which is the whole point of
            arriving here by tapping it. */}
        {canAddToDay(selected, todayIso) && (
          addingForDay ? (
            <View style={styles.addDayBox}>
              <TextInput
                value={addText}
                onChangeText={setAddText}
                placeholder={t('lookback.addForDayPlaceholder')}
                placeholderTextColor={theme.colors.inkSoft}
                style={styles.addDayInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={addForSelectedDay}
                accessibilityLabel={t('lookback.addForDayA11y', { date: formatTodayLabel(fromISODate(selected)) })}
              />
              <View style={styles.addDayRow}>
                <Pressable
                  onPress={() => { setAddingForDay(false); setAddText(''); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                  hitSlop={8}
                >
                  <Text style={styles.addDayCancel}>{t('common.cancel')}</Text>
                </Pressable>
                <PrimaryButton
                  label={t('capture.add')}
                  onPress={addForSelectedDay}
                  disabled={addText.trim().length === 0}
                />
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setAddingForDay(true)}
              accessibilityRole="button"
              accessibilityLabel={t('lookback.addForDayA11y', { date: formatTodayLabel(fromISODate(selected)) })}
              style={({ pressed }) => [styles.addDayEntry, pressed && styles.pressed]}
              hitSlop={6}
            >
              <Text style={styles.addDayEntryText}>{t('lookback.addForDay')}</Text>
            </Pressable>
          )
        )}
        {addedNote != null && <Text style={styles.addDayDone}>{addedNote}</Text>}
      </View>

      {aiEnabled && (
        <View style={styles.scrapbook} testID="scrapbook-card">
        <Text style={styles.scrapbookHead}>{t('lookback.scrapbookHeading')}</Text>

        {bookBusy ? (
          <View style={styles.polaroid}>
            <View style={styles.scrapbookImagePlaceholder}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
            </View>
            <Text style={styles.scrapbookCaption}>{t('lookback.makingScrapbook')}</Text>
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
                accessibilityLabel={t('lookback.scrapbookImageA11y', { week: weekLabel(weekStart), caption: existingBook.caption })}
              />
              {existingBook.caption.length > 0 && <Text style={styles.scrapbookCaption}>{existingBook.caption}</Text>}
            </View>
            <Text style={styles.scrapbookMeta}>{t('lookback.madeWithAi', { week: weekLabel(weekStart) })}</Text>
            <Pressable
              onPress={() => void shareWeekScrapbook()}
              accessibilityRole="button"
              accessibilityLabel={t('lookback.shareKeepsakeA11y')}
              hitSlop={8}
            >
              <Text style={styles.shareKeepsake}>{t('lookback.shareKeepsake')}</Text>
            </Pressable>
            {shareNote != null && <Text style={styles.scrapbookMeta}>{shareNote}</Text>}
            {/* The offscreen keepsake PAGE the share captures (native only; web composites the
                same page on a canvas). Parked far off-screen, never interactive, and rendered
                whenever the visible card is, so its image rides the warm cache and view-shot
                can snapshot it on demand at full 1080 width. Fixed cream palette on purpose:
                a keepsake page is the same artifact whatever theme the sender was in. */}
            {Platform.OS !== 'web' && (
              <View ref={shareCardRef} collapsable={false} pointerEvents="none" style={styles.shareCard}>
                <Image source={{ uri: existingBook.image }} style={styles.shareCardImage} resizeMode="cover" />
                <View style={styles.shareCardBand}>
                  {existingBook.caption.length > 0 && <Text style={styles.shareCardCaption}>{existingBook.caption}</Text>}
                  <Text style={styles.shareCardMeta}>{`DoubleDone · ${weekLabel(weekStart)}`}</Text>
                </View>
              </View>
            )}
          </>
        ) : weekList.length > 0 ? (
          <View style={styles.inviteWrap}>
            <View style={styles.inviteFrame}>
              <View style={styles.invitePlus}>
                <Text style={styles.invitePlusText}>+</Text>
              </View>
            </View>
            <Text style={styles.scrapbookHint}>
              {existingBook ? t('lookback.scrapbookImageGone') : t('lookback.scrapbookInvite')}
            </Text>
            {/* State the free cadence up front, so a free user knows the keepsake is monthly before they tap,
                rather than meeting the cap as a surprise bounce at the emotional-payoff moment. */}
            {!premium && <Text style={styles.scrapbookCadence}>{t('lookback.freeKeepsakeNote')}</Text>}
            <PrimaryButton
              label={t('lookback.makeScrapbook')}
              onPress={makeWeekScrapbook}
              disabled={bookBusy}
              pill
              accessibilityLabel={t('lookback.makeScrapbookA11y', { week: weekLabel(weekStart) })}
              style={styles.scrapbookBtn}
            />
            {bookError && <Text style={styles.scrapbookError}>{bookError}</Text>}
            <Text style={styles.scrapbookNote}>{t('lookback.scrapbookPrivacyNote')}</Text>
          </View>
        ) : (
          <Text style={styles.detailEmpty}>{t('lookback.scrapbookNeedsFinishes')}</Text>
        )}

        {weekList.length > 0 && (
          <View style={styles.weekList}>
            <Text style={styles.weekListHead}>{t('lookback.weekListHeading')}</Text>
            {weekList.map((c, i) => (
              <View key={`${c.title}-${i}`} style={styles.item}>
                <Text style={styles.itemMark}>✓</Text>
                <Text style={styles.itemTitle}>{c.title}</Text>
                {c.big && <Text style={styles.itemBig}>{t('lookback.aBigOne')}</Text>}
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
            <Text style={styles.insightsHead}>{t('welcome.premiumPatternsName')}</Text>
            {stats.finishedThisMonth === 0 ? (
              <Text style={styles.insightsStat}>{t('lookback.patternsEmpty')}</Text>
            ) : (
              <>
                {stats.finishedThisWeek > 0 && (
                  <Text style={styles.insightsStat}>{t('lookback.statFinishedThisWeek', { count: stats.finishedThisWeek })}</Text>
                )}
                <Text style={styles.insightsStat}>
                  {fmt.plural(stats.activeDaysThisMonth, { one: t('lookback.statActiveDaysOne'), other: t('lookback.statActiveDaysOther') })}
                </Text>
                {stats.bigWinsThisMonth > 0 && (
                  <Text style={styles.insightsStat}>
                    {fmt.plural(
                      stats.bigWinsThisMonth,
                      { one: t('lookback.statBigWinsOne'), other: t('lookback.statBigWinsOther') },
                      { like: stats.bigWinTitle ? t('lookback.statBigWinsLike', { title: stats.bigWinTitle }) : '' },
                    )}
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
                    <Text style={styles.insightsStat}>{t('lookback.reflectingBusy')}</Text>
                  </View>
                ) : (
                  <>
                    <PremiumButton
                      label={t('lookback.reflectOnWeek')}
                      onPress={reflectOnWeek}
                      disabled={summaryBusy}
                      accessibilityLabel={t('lookback.reflectOnWeekA11y')}
                      style={styles.summaryBtn}
                    />
                    <Text style={styles.scrapbookNote}>{t('lookback.reflectPrivacyNote')}</Text>
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
            accessibilityLabel={t('lookback.patternsUpsellA11y')}
          >
            <Text style={styles.insightsHead}>{t('welcome.premiumPatternsName')}</Text>
            <Text style={styles.insightsUpsell}>{t('lookback.patternsUpsell')}</Text>
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
  // "Add for this day": plain accent text, never a filled button. This is an offer on a screen whose
  // job is reflection, so it should be findable and quiet, not the loudest thing in view.
  pressed: { opacity: PRESSED_OPACITY },
  addDayEntry: { marginTop: spacing.three, alignSelf: 'flex-start' },
  addDayEntryText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  addDayBox: { marginTop: spacing.three, gap: spacing.two },
  addDayInput: {
    borderWidth: border.hair,
    borderColor: t.colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.three,
    paddingVertical: spacing.two,
    color: t.colors.ink,
    fontSize: 15 * t.scale,
    fontFamily: fonts.body,
    backgroundColor: t.colors.surface,
  },
  addDayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three },
  addDayCancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
  addDayDone: { marginTop: spacing.two, color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  itemMark: { color: t.colors.doneText, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  itemMarkScheduled: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  itemRepeat: { color: t.appearance === 'quiet' ? t.quiet.secondary : t.colors.repeat, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
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
  // The offscreen share page (see the render comment). Fixed cream artifact palette and
  // fixed 1080 metrics: deliberately NOT theme- or text-scale-dependent, matching the web
  // canvas composite in share.web.ts so both platforms produce the same keepsake page.
  shareCard: { position: 'absolute', left: -4000, top: 0, width: 1080, backgroundColor: '#F6F2E9' },
  shareCardImage: { width: 1080, height: 1080 },
  shareCardBand: { paddingVertical: 56, paddingHorizontal: 72, gap: 24, alignItems: 'center' },
  shareCardCaption: { color: '#2F2A23', fontSize: 44, lineHeight: 62, fontFamily: fonts.sans, fontStyle: 'italic', textAlign: 'center' },
  shareCardMeta: { color: '#8A8172', fontSize: 30, lineHeight: 40, fontFamily: fonts.body, textAlign: 'center' },
  shareKeepsake: {
    color: t.colors.accent,
    fontSize: 15 * t.scale,
    fontFamily: fonts.bodyBold,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.two,
    paddingVertical: spacing.two,
  },
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
