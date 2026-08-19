import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { border, fonts, radius, spacing, type Theme } from '@/constants/theme';
import { addDaysISO, friendlyDate, toISODate } from '@/lib/day';
import { ordinalDay } from '@/lib/i18n-active';
import { t } from '@/lib/locale';
import { describeRecurrence, scheduleFields, type CaptureSchedule, type Recurrence } from '@/lib/recurrence';
import { startOf, whenChanges, whenFields, whenSummary, type WhenAnswer } from '@/lib/when';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { Chip } from './Chip';
import { DatePicker } from './DatePicker';
import { ModalCard } from './ModalCard';
import { PrimaryButton } from './PrimaryButton';

// THE cadence surface. One in the whole app, which is the point: this was lifted out of
// RepeatingDrawer so the shared list could use the identical controls rather than grow a second,
// slightly-different picker that drifts a fortnight later. A repeat set here, set on Ours, set by
// the REST API or by an agent over MCP, all end up the same shape, because they all end up in
// `scheduleFields`.
//
// It owns the cadence and nothing else: no series list, no removal, no undo. The caller says what
// the title and cadence start as and what to do with the answer.

type EditMode = 'daily' | 'weekly' | 'everyN' | 'monthly';

const EDIT_MODES: { mode: EditMode; labelKey: string }[] = [
  { mode: 'daily', labelKey: 'capture.modeDaily' },
  { mode: 'weekly', labelKey: 'capture.modeWeekly' },
  { mode: 'everyN', labelKey: 'capture.modeEveryN' },
  { mode: 'monthly', labelKey: 'capture.modeMonthly' },
];

// 1..31, laid out as a grid. Every day of every month is offered, including the three that some
// months do not have: a rent due on the 31st is a real thing people are asked to remember, and the
// picker refusing to say it would send them to a workaround. What a short month does with it is
// answered by the line under the grid, not by taking the choice away.
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

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

type Props = {
  visible: boolean;
  onClose: () => void;
  today: Date;
  sheetTitle: string;
  /** The starting title. Editable here, because on both surfaces you arrive at this sheet from a
   *  task whose wording you may want to fix in the same breath as its rhythm. */
  title: string;
  /** The current cadence, prefilled so saving without touching anything is a no-op edit and never a
   *  surprise re-cadence. */
  recurrence?: Recurrence;
  /** A line under the controls, for anything true only on this surface (Ours: "You'll both see it
   *  on its day."). Absent on the personal drawer, which needs no such promise, and absent on Ours
   *  too once `allowNone` is on, because the state-aware summary says it better and per state. */
  note?: string;
  /**
   * The row's CURRENT date, so the day zone's fourth chip can be seeded.
   *
   * Without it the sheet cannot see the value the door beside it already names, and B2's "Thu 20
   * Aug" chip has nothing to fill it from. Seeding happens once per open (the caller's `key`
   * remounts this), so it has to arrive as a prop.
   */
  due?: string | null;
  /**
   * Whether this surface can answer with NO rhythm, which is the whole of the When editor.
   *
   * The room passes true: a shared row may be plain, dated, or repeating, and getting back to plain
   * was the gap this build exists to close. The personal Repeating drawer passes false (the
   * default), because there "no rhythm" means the entry should not exist, and offering it as a
   * choice would be a delete wearing a chip's clothes. Removal stays in the drawer, deliberately
   * outside this sheet, which is what keeps the header comment above true.
   */
  allowNone?: boolean;
  /**
   * The answer, once the sheet can give more than a cadence.
   *
   * BOTH keys, always, and never both set: `whenFields` guarantees it. A caller on the drawer
   * (`allowNone` false) only ever receives a readable recurrence with a null due, so its own code
   * path is unchanged in practice while the type stays honest about what a shared caller can get.
   */
  onSave: (title: string, answer: WhenAnswer) => void;
};

export function CadenceSheet({ visible, onClose, today, sheetTitle, title, recurrence, note, due, allowNone = false, onSave }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const todayIso = toISODate(today);

  // Seeded from the props on each open. The `key` on the caller's side is what re-mounts this, so
  // the fields are initialised once per opening rather than resynced by an effect.
  const [draft, setDraft] = useState(title);
  const [mode, setMode] = useState<EditMode>(
    recurrence?.kind === 'weekly'
      ? 'weekly'
      : recurrence?.kind === 'interval'
        ? 'everyN'
        : recurrence?.kind === 'monthly'
          ? 'monthly'
          : 'daily',
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    recurrence?.kind === 'weekly' && recurrence.weekdays.length > 0 ? recurrence.weekdays : [today.getDay()],
  );
  const [everyN, setEveryN] = useState(recurrence?.kind === 'interval' ? Math.max(2, recurrence.days) : 2);
  // Defaults to TODAY's day of the month, which is what somebody reaching for Monthly nearly always
  // means and saves them a second decision at the moment they are already deciding something.
  const [monthDay, setMonthDay] = useState(recurrence?.kind === 'monthly' ? recurrence.day : today.getDate());
  const [start, setStart] = useState(
    recurrence?.kind === 'interval'
      ? recurrence.anchor
      : (recurrence?.kind === 'weekly' || recurrence?.kind === 'daily' || recurrence?.kind === 'monthly' ? recurrence.start : undefined) ?? todayIso,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  /**
   * Whether a rhythm is RUNNING, kept BESIDE `mode` rather than folded into it as a null.
   *
   * `mode` has to survive the rhythm being released: release Weekly, change your mind, tap Weekly
   * again, and it must come back with the weekdays you had. A `EditMode | null` loses that, so the
   * user re-picks days they already picked. On the drawer this is always on and cannot be turned
   * off: an entry there IS a rhythm.
   */
  const [rhythmOn, setRhythmOn] = useState(!allowNone || (recurrence !== undefined && recurrence.kind !== 'none'));
  /** The day zone's answer, only meaningful when no rhythm is running. Seeded from the row's date. */
  const [day, setDay] = useState<CaptureSchedule>(
    typeof due === 'string' ? { mode: 'date', date: due } : { mode: 'anytime' },
  );

  /**
   * The row's own current day, offered as a chip so its value is readable without tapping.
   *
   * WITHHELD when a named chip already IS that day. A row starting today rendered both "Today" and
   * "Sun, 16 Aug", side by side, both lit, for one date: two controls for one answer, which reads as
   * a bug even when it behaves correctly. Melroy: "I'm seeing today twice and the pills are both
   * selected." The named chip wins, because a person reads "Today" faster than they read a date.
   * A seeded day that is neither today nor tomorrow still earns its own chip, which is the case
   * this exists for: a January anchor you would otherwise have to open the grid to discover.
   */
  const seededDay = rhythmOn ? (startOf(recurrence) ?? null) : (typeof due === 'string' ? due : null);
  const seededChip =
    seededDay !== null && seededDay !== todayIso && seededDay !== addDaysISO(today, 1) ? seededDay : null;

  /**
   * THE chosen day, wherever the zone happens to be keeping it.
   *
   * The zone answers two different questions depending on whether a rhythm is alive: the day this
   * happens, or the day it starts from. Those live in two different pieces of state, and the chips
   * were comparing against only one of them, so with a rhythm running nothing highlighted: tapping
   * Today moved the start and lit nothing up. Melroy: "Clicking Today doesn't highlight the cell."
   * One derived value, one comparison, and the zone's two moods cannot disagree about what is
   * selected.
   */
  const chosenDay = rhythmOn ? start : day.mode === 'date' ? day.date : null;
  const pickDay = (iso: string) => (rhythmOn ? setStart(iso) : setDay({ mode: 'date', date: iso }));

  function schedule(): CaptureSchedule {
    if (!rhythmOn) return day;
    if (mode === 'weekly') return { mode: 'weekly', weekdays: weekdays.length > 0 ? weekdays : [today.getDay()], start };
    if (mode === 'everyN') return { mode: 'everyN', days: everyN, start };
    if (mode === 'monthly') return { mode: 'monthly', day: monthDay, start };
    return { mode: 'daily', start };
  }

  /**
   * Release a running rhythm, or pick a different one.
   *
   * Tapping the SELECTED chip releases it, which is the design's "ending is its own act": the zone
   * above relabels from Starting back to A day, and the summary says the rhythm ends before
   * anything commits. The old anchor is deliberately NOT carried over as the offered day. It is
   * usually in the past (bin night set in January), a past date renders as a bare "Mon 6 Jan" with
   * no marker because this app refuses overdue rendering, and a shared row with a past date lands
   * on both Todays from that day onward with no end. Anytime costs nothing and is undoable; a stale
   * date costs two people their mornings. The defaults are not symmetric, so this picks the safe one.
   */
  function tapRhythm(m: EditMode) {
    if (!allowNone) return setMode(m);
    if (rhythmOn && mode === m) {
      setRhythmOn(false);
      setDay({ mode: 'anytime' });
      return;
    }
    setMode(m);
    setRhythmOn(true);
  }

  // The commit button NAMES the outcome rather than saying "Save": on a shared list especially, the
  // last thing you read before committing should be the thing you are committing your person to.
  //
  // Two paths, because the two surfaces answer different questions. The DRAWER still commits a
  // cadence and nothing else, so its label is the cadence, exactly as before. The ROOM commits a
  // WHEN, which may be a day, a rhythm, or neither, so its label comes from the same builder that
  // writes the summary and they can never drift apart.
  const answer = whenFields(schedule(), today);
  const summary = allowNone ? whenSummary(answer, today, { recurrence }) : undefined;
  const legacy = scheduleFields(schedule(), today).recurrence;
  const commitLabel = summary ? summary.commit : legacy ? describeRecurrence(legacy) : t('routines.saveChanges');

  // An idle Set must not write. Every mutator on the shared list commits with a fresh stamp, and a
  // fresh stamp is what the OTHER person's screen reads as "changed since you looked", so a Set that
  // altered nothing would still wash the row on their next visit and send them looking for a change
  // nobody made. A retitle counts, which is why the title is compared too.
  const titleMoved = draft.trim() !== title.trim();
  const idle = allowNone && !titleMoved && !whenChanges(answer, { due, recurrence });

  function save() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!allowNone && !legacy) return; // the drawer cannot commit "no rhythm"
    if (idle) return onClose(); // nothing to say, so say nothing, and do not wash their row
    onSave(trimmed, answer);
    onClose();
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));
  }

  return (
    // The sheet SCROLLS now. It was a bare ModalCard with neither `scroll` nor `maxHeight`, which
    // was survivable at three chips and a date row and is not once a whole day zone, a month grid
    // and a two-line summary arrive: the content simply ran past the bottom of the screen with no
    // way to reach the commit button. Capped at 82% of the viewport so the card still reads as a
    // card rather than a page, with the same scaffold BreakdownQuestions uses.
    <ModalCard visible={visible} onClose={onClose} scroll maxHeight="82%">
      <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
      <Text style={styles.sheetTitle}>{sheetTitle}</Text>
      <TextInput
        style={styles.sheetInput}
        value={draft}
        onChangeText={setDraft}
        placeholderTextColor={theme.colors.inkFaint}
        returnKeyType="done"
        accessibilityLabel={t('repeat.titleInputA11y')}
      />
      {/* THE DAY ZONE LEADS. It read "OR A RHYTHM" as the very first label under the title, with
          nothing for the "or" to refer back to, which is nonsense on first sight. The question is
          "when does this happen: a day, or a rhythm", and it has to be asked in that order. */}
      {/* THE relabel, and the resolution the third design round settled on: the same zone asks a
          different question depending on whether a rhythm is alive. No rhythm and it is "A day",
          meaning the day this happens. A rhythm, and it is "Starting", meaning from when. The words
          change in front of you rather than being a rule somebody has to learn. */}
      {allowNone && (
        <>
          <Text style={[styles.zone, rhythmOn && styles.zoneLive]}>
            {rhythmOn ? t('ours.whenStarting') : t('ours.whenDayZone')}
          </Text>
          <View style={styles.chips}>
            {/* ALWAYS here, including while a rhythm runs, and tapping it ends that rhythm in ONE
                tap. The design hid it behind releasing the cadence chip first, on the tidy logic
                that "a rhythm has no anytime". True, and backwards in practice: Anytime is where
                you go to STOP, so hiding the exit while the thing you want to leave is running is
                the wrong way round. Melroy, first run: "unticking weekly to get Anytime was
                unintuitive." He is right. It stays a state among states, never a destructive Clear,
                and the summary still narrates the ending before anything commits. */}
            <Chip
              label={t('capture.anytime')}
              selected={!rhythmOn && day.mode === 'anytime'}
              onPress={() => {
                setRhythmOn(false);
                setDay({ mode: 'anytime' });
              }}
            />
            <Chip label={t('common.today')} selected={chosenDay === todayIso} onPress={() => pickDay(todayIso)} />
            <Chip
              label={t('common.tomorrow')}
              selected={chosenDay === addDaysISO(today, 1)}
              onPress={() => pickDay(addDaysISO(today, 1))}
            />
            {/* The seeded value keeps a chip of its own, SELECTED, so the row's current answer is
                always readable without tapping anything. For an "every 3 days" rhythm the anchor IS
                the schedule, so a sheet that hid it would make reading the start cost a re-phase. */}
            {seededChip !== null && (
              <Chip
                label={friendlyDate(seededChip, today)}
                selected={chosenDay === seededChip}
                onPress={() => pickDay(seededChip)}
              />
            )}
            <Chip label={t('capture.pickDate')} selected={pickerOpen} onPress={() => setPickerOpen((v) => !v)} />
          </View>
          {/* The grid unfolds INSIDE this zone, directly under the chip that asked for it. It used
              to render further down beside the drawer's own start row, which on a sheet this tall
              put it below the fold with nothing to scroll, so tapping Pick a date looked like it did
              nothing at all. */}
          {pickerOpen && (
            <DatePicker
              value={chosenDay !== null && chosenDay >= todayIso ? chosenDay : null}
              today={today}
              onChange={(iso) => {
                pickDay(iso);
                setPickerOpen(false);
              }}
            />
          )}
        </>
      )}
      {allowNone && <Text style={styles.zone}>{t('ours.whenRhythmZone')}</Text>}
      <View style={styles.chips}>
        {EDIT_MODES.map(({ mode: m, labelKey }) => (
          <Chip
            key={m}
            label={t(labelKey)}
            selected={rhythmOn && mode === m}
            onPress={() => tapRhythm(m)}
          />
        ))}
      </View>
      {rhythmOn && mode === 'weekly' && (
        <View style={styles.weekdays}>
          {WEEKDAY_KEYS.map((key, d) => (
            <Pressable
              key={d}
              onPress={() => toggleWeekday(d)}
              style={[styles.day, weekdays.includes(d) && styles.dayOn]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: weekdays.includes(d) }}
              accessibilityLabel={t('capture.repeatOnDayA11y', { day: t(key) })}
            >
              <Text style={[styles.dayText, weekdays.includes(d) && styles.dayTextOn]}>{t(key)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {rhythmOn && mode === 'everyN' && (
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => setEveryN((n) => Math.max(2, n - 1))}
            style={styles.stepBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('capture.fewerDaysA11y')}
          >
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepLabel}>{t('capture.everyNDays', { count: everyN })}</Text>
          <Pressable
            onPress={() => setEveryN((n) => Math.min(30, n + 1))}
            style={styles.stepBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('capture.moreDaysA11y')}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      )}
      {rhythmOn && mode === 'monthly' && (
        <>
          <View style={styles.monthDays}>
            {MONTH_DAYS.map((d) => (
              <Pressable
                key={d}
                onPress={() => setMonthDay(d)}
                style={[styles.monthDay, monthDay === d && styles.dayOn]}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityState={{ selected: monthDay === d }}
                accessibilityLabel={t('capture.repeatOnDayA11y', { day: ordinalDay(d) })}
              >
                <Text style={[styles.monthDayText, monthDay === d && styles.dayTextOn]}>{d}</Text>
              </Pressable>
            ))}
          </View>
          {/* Said ONLY once a short-month day is actually chosen. Standing under every choice it
              would be noise on the 3rd, and this app does not explain things nobody asked about.
              Standing nowhere, the 31st would look like a month it silently skips. */}
          {monthDay > 28 && <Text style={styles.note}>{t('capture.monthlyShortMonths')}</Text>}
        </>
      )}
      <View style={[styles.startRow, allowNone && styles.hidden]}>
        <Text style={styles.startLabel}>{t('capture.startingFrom')}</Text>
        <Pressable
          onPress={() => setPickerOpen((v) => !v)}
          style={styles.startBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('capture.startingFromA11y', { date: start === todayIso ? t('common.today') : friendlyDate(start, today) })}
        >
          <Text style={styles.startBtnText}>{start === todayIso ? t('common.today') : friendlyDate(start, today)}</Text>
        </Pressable>
      </View>
      {/* The picker inlines below the start row (a Modal nested in the ModalCard's Modal is
          unreliable on Android), collapsing again once a day is chosen. */}
      {pickerOpen && (
        <DatePicker
          value={start >= todayIso ? start : null}
          today={today}
          onChange={(iso) => {
            setStart(iso);
            setPickerOpen(false);
          }}
        />
      )}
      {summary ? (
        <View style={styles.summary}>
          {summary.ends && <Text style={styles.ends}>{t('ours.whenEnds')}</Text>}
          <Text style={styles.fragment}>{summary.fragment}</Text>
          <Text style={styles.note}>{summary.sentence}</Text>
        </View>
      ) : note ? (
        <Text style={styles.note}>{note}</Text>
      ) : null}
      <View style={styles.sheetActions}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={8}>
          <Text style={styles.sheetCancel}>{t('common.cancel')}</Text>
        </Pressable>
        <PrimaryButton label={commitLabel} onPress={save} disabled={draft.trim().length === 0} accessibilityLabel={commitLabel} style={styles.commit} />
      </View>
      </ScrollView>
    </ModalCard>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // A scroll-host ModalCard drops its own padding and gap, so the content container takes both.
    scrollBody: { padding: spacing.six, gap: spacing.three },
    sheetTitle: { ...t.type.heading, color: t.colors.ink, marginBottom: spacing.three },
    // The zone labels. `zoneLive` is the sheet's ONE accent label, marking the moment the day zone
    // stopped asking "which day" and started asking "from when".
    zone: { ...t.type.caption, color: t.colors.inkSoft, marginTop: spacing.two, textTransform: 'uppercase', letterSpacing: 0.8 },
    zoneLive: { color: t.colors.accent },
    // The start row survives for the drawer and is hidden (not unmounted) on the shared surface,
    // whose day zone above already owns the same value. Unmounting it would drop the inline picker.
    hidden: { display: 'none' },
    summary: { gap: spacing.one, marginTop: spacing.two },
    ends: { ...t.type.body, color: t.colors.ink, fontWeight: '600' },
    fragment: { ...t.type.body, color: t.colors.ink },
    sheetInput: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.three,
      color: t.colors.ink,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      marginBottom: spacing.three,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
    weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two, marginTop: spacing.three },
    day: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    dayText: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
    dayTextOn: { color: t.colors.accent, fontFamily: fonts.bodyBold, fontWeight: '700' },
    // A calendar-shaped grid rather than a stepper: reaching the 28th by tapping + twenty-six times
    // is not a picker, it is a punishment. Seven across on a phone, so it reads as a month.
    monthDays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two, marginTop: spacing.three },
    monthDay: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthDayText: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.four, marginTop: spacing.three },
    stepBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: { color: t.colors.ink, fontSize: 20 * t.scale, fontFamily: fonts.body },
    stepLabel: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body, minWidth: 110, textAlign: 'center' },
    startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three, marginTop: spacing.four },
    startLabel: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    startBtn: {
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.three,
      paddingVertical: spacing.one,
    },
    startBtnText: { color: t.colors.ink, fontSize: 14 * t.scale, fontFamily: fonts.body },
    // The surface-specific promise (Ours). A fact, in the quiet voice, never a warning.
    note: { color: t.colors.inkFaint, fontSize: 13 * t.scale, lineHeight: 19 * t.scale, fontFamily: fonts.body, marginTop: spacing.four },
    // Wraps rather than overflowing. The commit button names the cadence, so it grows with the
    // wording (German runs long), and unbounded it pushed Cancel off the screen edge: the way OUT of
    // the sheet, gone. Cancel never shrinks; the naming button gives way instead.
    sheetActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: spacing.four,
      marginTop: spacing.five,
    },
    sheetCancel: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, flexShrink: 0 },
    commit: { flexShrink: 1 },
  });
