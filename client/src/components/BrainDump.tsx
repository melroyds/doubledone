import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { border, fonts, layout, PRESSED_OPACITY, radius, rgba, spacing, type Theme } from '@/constants/theme';
import { split } from '@/lib/ai';
import { addButtonLabel, type CaptureRepeat, type CaptureWhen, doorSummary, repeatLabel, whenLabel } from '@/lib/capture-door';
import { aiErrorLine } from '@/lib/connection';
import { addDaysISO, fromISODate, toISODate } from '@/lib/day';
import { ordinalDay } from '@/lib/i18n-active';
import { appendPhrase } from '@/lib/dictation';
import { t } from '@/lib/locale';
import { type CaptureSchedule } from '@/lib/recurrence';
import { MAX_SLICES, MIN_SLICES } from '@/lib/slices';
import { type Dictation, isDictationSupported, startDictation } from '@/lib/speech';
import { track } from '@/lib/telemetry';
import { useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';

import { Chip } from './Chip';
import { DatePicker } from './DatePicker';

// The iOS keyboard toolbar's id. The box is multiline, so iOS's Return key inserts a newline and
// there is NO native way to put the keyboard away, leaving it stuck over the page (Melroy, iOS,
// 2026-07-15). InputAccessoryView is the standard iOS answer: a small bar riding above the keyboard
// with an explicit Done. iOS-only by design (neither Android nor web has the problem).
const CAPTURE_ACCESSORY_ID = 'ddCaptureAccessory';

// A blur that is really the start of a tap on one of the composer's own controls (on web, pressing
// a button blurs the box a beat BEFORE the click lands) must not collapse the composer under the
// finger. The box counts as focused for this long after it loses focus.
const BLUR_GRACE_MS = 220;

// The box grows to four lines, then scrolls (the handoff's rule), measured in the body line height.
const MAX_LINES = 4;

type Props = {
  onCapture: (text: string, schedule: CaptureSchedule, slices?: number) => void;
  // The AI shapers. OPTIONAL, because the shared list does not offer them: the steps they produce
  // land on a list another person reads, and pointing a model at a shared surface is a decision
  // about somebody else's screen, not a UI tidy-up. Absent = the button is not rendered.
  onBiteElephant?: (text: string) => Promise<void>;
  onSort?: (text: string) => Promise<void>;
  /** Steps (slices). Off on the shared list, whose rows have no `slices` field to store them in. */
  allowSteps?: boolean;
  /**
   * This surface's RESTING answer to "when". 'today' everywhere except the shared list, which
   * passes 'anytime' and gains a fourth chip for it: most of what goes on a household list has no
   * day, and choosing one there means the row will appear on BOTH your Todays.
   */
  whenDefault?: CaptureWhen;
  /** Called when the composer closes (the box lets go and When is shut). Optional. */
  onClose?: () => void;
  /**
   * The composer is OPEN (the box has focus, or When or the date picker is open, or an AI shaper
   * or dictation is running). The parent shrinks its heading while it is, so the weight line and
   * the last few tasks stay in view above the keyboard, and keeps a just-added row tinted until it
   * closes (the Today v3 handoff).
   */
  onActiveChange?: (active: boolean) => void;
  /** The box took focus: the parent scrolls its list to the end so the newest rows sit just above. */
  onFocusBox?: () => void;
  today: Date;
  // OCR (premium): open the photo-capture modal. The parent premium-gates the tap; this just shows
  // the button as the upsell surface. Absent hides it.
  onCamera?: () => void;
  /** The box's resting words. Today: "Empty your head…". The shared list: "Add to {name}". */
  placeholder?: string;
  /**
   * The line beside When, where the surface needs When explained BEFORE the add (the shared list:
   * "It stays on the list. It reaches nobody's day."). Only shown on surfaces with no AI shaper,
   * which is the seat it would otherwise take.
   */
  whenNote?: (s: { when: CaptureWhen; repeating: boolean }) => string | null;
};

// What a parent can do to the box via ref: drop in text (or null to just focus) and focus the input.
// Used by the launcher "Brain dump" shortcut, shared text, and a scanned list.
export type BrainDumpHandle = {
  seed: (text: string | null) => void;
  /** Empty the box and put When back to rest. For the parent to call once words it took (Break it
   *  down's accepted steps) have really landed, so nothing is cleared on the way to a sheet you might cancel. */
  clear: () => void;
};

// index 0=Sun .. 6=Sat
const WEEKDAY_KEYS = [
  'capture.weekdayShortSun',
  'capture.weekdayShortMon',
  'capture.weekdayShortTue',
  'capture.weekdayShortWed',
  'capture.weekdayShortThu',
  'capture.weekdayShortFri',
  'capture.weekdayShortSat',
];

// 1..31. Every day is offered, including the three some months lack: a rent due on the 31st is a
// real thing people are asked to remember, and a picker that refuses to say it just sends them to a
// workaround. What a short month does with it is answered by the line under the grid.
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * The composer (the Today v3 handoff, 1a, Melroy's pick 2026-09-26): ONE message-style line at the
 * bottom of the screen replaces the half-screen capture panel, so the list you are adding to stays
 * in view while you add to it.
 *
 * At rest it is Scan, the box, and one end button that says Speak while the box is empty and Add once
 * you type. Open (the box has focus), a row above it carries the When chip and Break it down, which
 * becomes Sort for me in the same seat once there are two or more lines. When opens in the keyboard's
 * place with the same rows the shipped door had (a day, a rhythm, steps), and the Add button names the
 * consequence before the tap ("Add · Tomorrow", "Add 3").
 *
 * Everything the old panel promised still holds, because the logic below is the old panel's: the text
 * is never lost (the composer stays mounted; nothing clears it but an Add or an accepted sort), the
 * first keystroke never waits, every part stays in its place while you type, and When resets to the
 * calm default after every Add. Nothing reaches the day until you tap Add or accept the sort.
 */
export const BrainDump = forwardRef<BrainDumpHandle, Props>(function BrainDump(
  { onCapture, onBiteElephant, onSort, onClose, onActiveChange, onFocusBox, today, onCamera, allowSteps = true, whenDefault = 'today', placeholder, whenNote },
  ref,
) {
  const [value, setValue] = useState('');
  const [doorOpen, setDoorOpenState] = useState(false);
  const doorOpenRef = useRef(false);
  const [focused, setFocused] = useState(false);
  // When opens in place of the chip that opened it, so the chip (and the focus on it) is gone. Focus
  // moves to the door's header instead, for a keyboard or a screen reader; set on open, spent in an effect.
  const doorHeadRef = useRef<View>(null);
  const doorFocusPending = useRef(false);
  // What the last Add said, for web screen readers. react-native-web's announceForAccessibility is a
  // no-op, so on web the words go through a hidden polite live region instead. The count flips a
  // trailing no-break space so a second "Added." is still a change the reader hears.
  const [said, setSaid] = useState({ text: '', n: 0 });
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [when, setWhen] = useState<CaptureWhen>(whenDefault);
  const [repeat, setRepeat] = useState<CaptureRepeat>(null);
  const [weekdays, setWeekdays] = useState<number[]>([today.getDay()]);
  const [everyNDays, setEveryNDays] = useState(2);
  const [monthDay, setMonthDay] = useState(today.getDate());
  // Until the user touches the weekday chips or the day-of-month grid, the repeat follows the START
  // DATE: pick Fri 25 then Weekly, and it is weekly on Fridays (the 2026-09-21 flow audit).
  const [weekdaysTouched, setWeekdaysTouched] = useState(false);
  const [monthDayTouched, setMonthDayTouched] = useState(false);
  const [dueDate, setDueDate] = useState(() => toISODate(today)); // ISO for a picked day (due date, or a repeat's start)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sliceCount, setSliceCount] = useState(0); // 0 = whole task; >=MIN_SLICES = tracked in steps
  const [busyKind, setBusyKind] = useState<'bite' | 'sort' | 'split' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { settings } = useSettings();
  const aiEnabled = settings.aiEnabled; // false hides every gen-AI affordance here (Sort for me, Break it down, Tidy, Scan). Speak stays: it is on-device dictation, not a server AI call.
  const inputRef = useRef<TextInput>(null);
  const { height: winH } = useWindowDimensions();
  const [doorFade] = useState(() => new Animated.Value(0));

  // Talk-to-capture (the mic stays hidden where unsupported). Each spoken phrase lands as its own
  // line, then the existing Sort / Add flow takes over.
  const [canDictate] = useState(() => isDictationSupported());
  const [listening, setListening] = useState(false);
  const dictationRef = useRef<Dictation | null>(null);
  const phraseCountRef = useRef(0);

  function setDoorOpen(open: boolean) {
    doorOpenRef.current = open;
    setDoorOpenState(open);
  }

  // Expose seed() to parents: drop in text (null = just focus, so a "Brain dump" shortcut never
  // clears in-progress text) and focus the input. Imperative, so the setState runs like an event
  // handler, never during render or as a cascading effect.
  useImperativeHandle(ref, () => ({
    seed: (text: string | null) => {
      // Joined under a draft, never over it: with the composer always on screen, an unsent line in the
      // box is the normal resting state, and a Scan or a share used to replace it without a word.
      if (text !== null) setValue((v) => (v.trim() ? `${v.replace(/\s+$/, '')}\n${text}` : text));
      inputRef.current?.focus();
    },
    clear: () => reset(),
  }));

  // Stop dictation and drop a pending blur if we unmount. Only cleanups run here (no setState in the
  // effect body), so the React Compiler stays happy.
  useEffect(() => () => {
    dictationRef.current?.stop();
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  // Android's back gesture (and iOS's swipe-down) can put the keyboard away WITHOUT blurring the box,
  // which would leave the composer open, and Today's heading shrunk, over a keyboard that is gone.
  // When the keyboard goes and When is not what took its place, let go of the box too.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (!doorOpenRef.current) inputRef.current?.blur();
    });
    return () => sub.remove();
  }, []);

  const busy = busyKind !== null;
  const lineCount = value.split('\n').filter((l) => l.trim().length > 0).length;
  const hasText = value.trim().length > 0;
  // A single long line is probably several things said in one breath; offer an AI split.
  const wordCount = hasText ? value.trim().split(/\s+/).length : 0;
  const canSplit = lineCount === 1 && wordCount >= 6;
  // Steps only make sense for a single, one-off task. The row stays in place regardless (fixed
  // regions, not appearing controls); it goes quiet and says why.
  const stepsAllowed = allowSteps && lineCount <= 1 && repeat === null;
  const todayIso = toISODate(today);

  // ONE rule composes WHEN with REPEATS: the when IS a repeat's start date ("Tomorrow · Daily" starts
  // tomorrow). "Starting from" reads the same value; never two truths.
  const startIso = when === 'today' || when === 'anytime' ? todayIso : when === 'tomorrow' ? addDaysISO(today, 1) : dueDate;
  const startDate = fromISODate(startIso);
  // The effective repeat targets: the user's own chips once touched, else derived from the start date
  // so the summary, the Add label and the stored schedule all say one thing.
  const weekdaysEff = weekdaysTouched && weekdays.length > 0 ? weekdays : [startDate.getDay()];
  const monthDayEff = monthDayTouched ? monthDay : startDate.getDate();

  // The one door state the chip, the Add label, and buildSchedule all read.
  const doorState = {
    when,
    dueDate,
    repeat,
    weekdays: weekdaysEff,
    everyNDays,
    monthDay: monthDayEff,
    steps: stepsAllowed && sliceCount >= MIN_SLICES ? sliceCount : 0,
    whenDefault,
  };
  const summary = doorSummary(doorState, today);
  const addLabel = addButtonLabel(doorState, today, lineCount);
  const whenLbl = whenLabel(doorState, today);

  // OPEN = the person is here. The parent shrinks its heading and holds a just-added tint for exactly
  // this long. Text alone does not hold it open: words left in the box wait there, calmly, while the
  // full page (Right now, the tools) comes back.
  const active = focused || doorOpen || pickerOpen || busy || listening;
  // Reported on a CHANGE only. A parent's handler is usually a fresh function every render, and hearing
  // "closed" on every render let a parent that clears state on close loop itself to death (the first
  // preview of this build: "Maximum update depth exceeded").
  const lastReported = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastReported.current === active) return;
    const was = lastReported.current;
    lastReported.current = active;
    onActiveChange?.(active);
    if (was && !active) onClose?.();
  }, [active, onActiveChange, onClose]);

  // When opens with a 180ms fade and a 4px settle, like the held card; reduced motion is a 90ms fade.
  useEffect(() => {
    if (!doorOpen || !doorFocusPending.current) return;
    doorFocusPending.current = false;
    const head = doorHeadRef.current;
    if (!head) return;
    if (Platform.OS === 'web') (head as unknown as { focus?: () => void }).focus?.();
    else AccessibilityInfo.sendAccessibilityEvent(head, 'focus');
  }, [doorOpen]);

  useEffect(() => {
    if (!doorOpen) {
      doorFade.setValue(0);
      return;
    }
    const a = Animated.timing(doorFade, {
      toValue: 1,
      duration: theme.reduceMotion ? 90 : 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    });
    a.start();
    return () => a.stop();
  }, [doorOpen, doorFade, theme.reduceMotion]);

  function buildSchedule(): CaptureSchedule {
    if (repeat === 'daily') return { mode: 'daily', start: startIso };
    if (repeat === 'weekly') return { mode: 'weekly', weekdays: weekdaysEff, start: startIso };
    if (repeat === 'everyN') return { mode: 'everyN', days: everyNDays, start: startIso };
    if (repeat === 'monthly') return { mode: 'monthly', day: monthDayEff, start: startIso };
    if (when === 'date') return { mode: 'date', date: dueDate };
    // On a surface whose default is Anytime, choosing TODAY has to produce a real date, because
    // `scheduleFields` maps both 'today' and 'anytime' to "no scheduling fields" and on that surface
    // no-date means "lives in the room". Without this the chip would look chosen, the button would
    // read "Add · Today", and the row would quietly never appear on anybody's day.
    if (when === 'today' && whenDefault === 'anytime') return { mode: 'date', date: todayIso };
    return { mode: when };
  }

  // Back to the calm default: the surface's resting day, no repeat, no steps, When shut. Runs after
  // every Add. Never touches the typed text; reset() below clears that too (post-Add).
  function resetDoor() {
    setDoorOpen(false);
    setWhen(whenDefault);
    setRepeat(null);
    setWeekdays([today.getDay()]);
    setWeekdaysTouched(false);
    setMonthDayTouched(false);
    setEveryNDays(2);
    setDueDate(todayIso);
    setPickerOpen(false);
    setSliceCount(0);
  }

  function reset() {
    stopDictation();
    setValue('');
    setError(null);
    resetDoor();
  }

  function handleFocus() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setFocused(true);
    // Tap the box and the keyboard comes back: When goes back to its chip.
    if (doorOpenRef.current) setDoorOpen(false);
    onFocusBox?.();
  }

  // Focus on one of the composer's OWN controls (the When chip, Break it down / Sort for me, Tidy, the
  // door's header) keeps it open, exactly like focus in the box, without the box's side effects (closing
  // When, the scroll). Web in practice, where a click or a Tab moves focus: without it a keyboard user who
  // tabbed onto When lost it 220ms later, and a slow, deliberate click was dropped mid-press.
  function holdFocus() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setFocused(true);
  }

  function handleBlur() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      setFocused(false);
    }, BLUR_GRACE_MS);
  }

  function toggleDoor() {
    if (!doorOpen) {
      Keyboard.dismiss(); // the choices need the room; the text is untouched
      track('capture.door.opened');
      doorFocusPending.current = true;
    } else {
      // Closing goes back to the box (the handoff: tap the box and the keyboard comes back). Held open
      // through the hand-over, or with focus already gone the whole composer folded away under you.
      holdFocus();
      inputRef.current?.focus();
    }
    setDoorOpen(!doorOpen);
  }

  // The picker answers one question ("which day"), so picking today or tomorrow lands on those
  // chips, keeping them truthful; anything else becomes the picked date.
  function pickDate(iso: string) {
    if (iso === todayIso) setWhen('today');
    else if (iso === addDaysISO(today, 1)) setWhen('tomorrow');
    else {
      setWhen('date');
      setDueDate(iso);
    }
    setPickerOpen(false);
  }

  // Talk-to-capture: tap to start, tap to stop. Each final phrase becomes a line; a result arriving
  // after a stop is ignored, so a sorted or cleared box never re-fills.
  function stopDictation() {
    const live = dictationRef.current;
    if (live === null) return;
    dictationRef.current = null;
    live.stop(); // fires onEnd -> listening off + telemetry
  }

  function toggleDictation() {
    if (busy) return;
    if (dictationRef.current !== null) {
      stopDictation();
      return;
    }
    setError(null);
    phraseCountRef.current = 0;
    setListening(true);
    dictationRef.current = startDictation({
      onPhrase: (phrase) => {
        if (dictationRef.current === null) return; // a late result after stop
        phraseCountRef.current += 1;
        setValue((v) => appendPhrase(v, phrase));
      },
      onError: () => {
        dictationRef.current = null;
        setListening(false);
        setError(t('capture.dictationError'));
      },
      onEnd: () => {
        dictationRef.current = null;
        setListening(false);
        if (phraseCountRef.current > 0) track('capture.dictation.used', { lines: phraseCountRef.current });
      },
    });
  }

  function add() {
    if (!hasText || busy) return;
    // Named BEFORE the reset clears it: "Added." on the ordinary day, "Added. Tomorrow." when the
    // capture went somewhere the person has to be able to trust it went.
    const resting = whenDefault;
    const consequence = repeatLabel(doorState) ?? (when !== resting ? whenLbl : null);
    onCapture(value, buildSchedule(), stepsAllowed && sliceCount >= MIN_SLICES ? sliceCount : undefined);
    reset();
    const words = consequence ? t('capture.addedFor', { what: consequence }) : t('capture.added');
    AccessibilityInfo.announceForAccessibility(words);
    if (Platform.OS === 'web') setSaid((prev) => ({ text: words, n: prev.n + 1 }));
    // Focus stays in the box, so the next thing goes in without another tap. Held open THROUGH the add:
    // on native the focus lands a frame later, and in between nothing held the composer open (When had
    // just closed), so it reported closed and Today wiped the tint it had only just recorded.
    holdFocus();
    inputRef.current?.focus();
  }

  async function biteElephant() {
    const task = value.trim();
    if (!task || busy) return;
    stopDictation(); // a phrase spoken during the call would land in a box the result then replaces
    setError(null);
    setBusyKind('bite');
    try {
      // The words STAY in the box while the questions and the review are open: cancelling either used to
      // lose them, because this reset the moment the questions sheet opened. Today clears the box when
      // the steps are accepted (the capture iron rule: text is never lost on the way somewhere).
      await onBiteElephant?.(task);
    } catch {
      setError(aiErrorLine(t('capture.breakDownError')));
    } finally {
      setBusyKind(null);
    }
  }

  async function sortDump() {
    const text = value;
    if (!text.trim() || busy) return;
    stopDictation();
    setError(null);
    setBusyKind('sort');
    try {
      await onSort?.(text);
      reset();
    } catch {
      setError(aiErrorLine(t('capture.sortError')));
    } finally {
      setBusyKind(null);
    }
  }

  // Hand a run-on line (often a no-pause dictation) to the AI, which separates it into the distinct
  // tasks; they replace the single line so Sort for me then appears. Only splits, never sorts.
  async function splitDump() {
    const text = value.trim();
    if (!text || busy) return;
    stopDictation();
    setError(null);
    setBusyKind('split');
    try {
      const items = await split(text);
      if (items.length >= 1) {
        setValue(items.join('\n'));
        track('capture.split.used', { to: items.length });
      } else {
        setError(aiErrorLine(t('capture.splitError')));
      }
    } catch {
      setError(aiErrorLine(t('capture.splitError')));
    } finally {
      setBusyKind(null);
    }
  }

  function toggleWeekday(d: number) {
    // The first touch starts from the derived set (the start date's weekday), never from the
    // mount-time seed, so toggling Fr off a Friday start leaves nothing selected rather than Mo.
    const base = weekdaysTouched ? weekdays : weekdaysEff;
    setWeekdays(base.includes(d) ? base.filter((x) => x !== d) : [...base, d]);
    setWeekdaysTouched(true);
  }

  const hasShapers = aiEnabled && Boolean(onBiteElephant && onSort);
  // Tidy is an AI call too, so it lives only where the AI shapers do. It used to show on the shared list,
  // whose promise is no AI but Scan, and whose disclosure never named it (found mapping Today v3).
  const showTidy = hasShapers && canSplit && (busyKind === 'split' || !busy);

  /**
   * The egress disclosure, naming the affordances THIS surface actually has (Sort / Break it down,
   * Scan, both, or none). A false statement about where your data goes is a worse bug than a missing
   * one: it teaches you the disclosure is decorative.
   */
  const scanAI = aiEnabled && Boolean(onCamera);
  const aiNoteKey = hasShapers && scanAI ? 'capture.aiNoteBoth' : hasShapers ? 'capture.aiNote' : scanAI ? 'capture.aiNoteScan' : null;

  // When's overline names the rows BEHIND it, composed from the rows this surface actually has.
  const doorRows = [t('capture.rowWhen'), t('capture.rowRepeats'), ...(allowSteps ? [t('capture.rowSteps')] : [])];
  const doorOverline = doorRows.join(' · ');
  const note = !hasShapers && whenNote ? whenNote({ when, repeating: repeat !== null }) : null;

  // The one end button, in one seat: Speak on an empty box (where dictation exists), Listening while
  // it does, Add (naming the consequence) once there is something to add.
  const endMode: 'speak' | 'listening' | 'add' = listening ? 'listening' : !hasText && canDictate ? 'speak' : 'add';
  const multiline = lineCount >= 2;
  const lineH = 22 * theme.scale;

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'web' && (
        <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
          {said.text ? said.text + (said.n % 2 ? ' ' : '') : ''}
        </Text>
      )}
      {active && !doorOpen && (
        <View style={styles.chipRow}>
          <Pressable
            onPress={toggleDoor}
            onFocus={holdFocus}
            onBlur={handleBlur}
            accessibilityRole="button"
            aria-expanded={false}
            accessibilityLabel={t('capture.doorA11yComposed', { rows: doorRows.join(', '), summary })}
            hitSlop={4}
            style={({ pressed }) => [styles.whenChip, pressed && styles.pressed]}
          >
            <Text style={styles.whenOverline}>{t('capture.rowWhen')}</Text>
            <Text style={styles.whenValue}>{summary}</Text>
            <Text style={styles.whenCaret}>˅</Text>
          </Pressable>
          {hasShapers ? (
            <Pressable
              onPress={multiline ? sortDump : biteElephant}
              onFocus={holdFocus}
              onBlur={handleBlur}
              disabled={busy || !hasText}
              accessibilityRole="button"
              aria-disabled={busy || !hasText}
              accessibilityLabel={multiline ? t('capture.sortA11y') : t('capture.breakDownA11y')}
              hitSlop={4}
              style={({ pressed }) => [styles.shaper, pressed && styles.pressed, (busy || !hasText) && styles.dim]}
            >
              {busyKind === 'sort' || busyKind === 'bite' ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text style={styles.shaperText}>{busyKind === 'sort' ? t('capture.sorting') : t('capture.breakingDown')}</Text>
                </View>
              ) : (
                <Text style={styles.shaperText}>{multiline ? t('actions.sortForMe') : t('actions.breakItDown')}</Text>
              )}
            </Pressable>
          ) : note ? (
            <Text style={styles.note}>{note}</Text>
          ) : null}
        </View>
      )}

      {doorOpen && (
        <Animated.View
          style={[
            styles.door,
            { opacity: doorFade, transform: [{ translateY: doorFade.interpolate({ inputRange: [0, 1], outputRange: [theme.reduceMotion ? 0 : 4, 0] }) }] },
          ]}
        >
          <Pressable
            ref={doorHeadRef}
            onPress={toggleDoor}
            accessibilityRole="button"
            aria-expanded
            accessibilityLabel={t('capture.doorA11yComposed', { rows: doorRows.join(', '), summary })}
            style={({ pressed }) => [styles.doorHead, pressed && styles.pressed]}
          >
            <Text style={styles.zoneOverline}>{doorOverline}</Text>
            <Text style={styles.doorHeadValue}>{summary} ˄</Text>
          </Pressable>
          <ScrollView style={{ maxHeight: Math.max(220, winH * 0.5) }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.doorBody}>
            {/* A DAY. The shared list gets Anytime in FRONT, which is its resting state. A picked date
                lands IN the Pick a date chip, so the chip always says what is set. */}
            <View style={styles.zone}>
              <Text style={styles.zoneOverline}>{t('ours.whenDayZone')}</Text>
              <View style={styles.chips}>
                {whenDefault === 'anytime' && (
                  <Chip label={t('capture.anytime')} selected={when === 'anytime'} onPress={() => setWhen('anytime')} />
                )}
                <Chip label={t('common.today')} selected={when === 'today'} onPress={() => setWhen('today')} />
                <Chip label={t('common.tomorrow')} selected={when === 'tomorrow'} onPress={() => setWhen('tomorrow')} />
                <Chip
                  label={when === 'date' ? whenLbl : t('capture.pickDate')}
                  selected={when === 'date'}
                  onPress={() => setPickerOpen(true)}
                  accessibilityLabel={when === 'date' ? `${t('capture.pickDate')}: ${whenLbl}` : t('capture.pickDate')}
                />
              </View>
            </View>

            {/* OR A RHYTHM. Four toggles (tap again to clear); each cadence's one control sits under
                them, then the Starting-from read-through of the day above. */}
            <View style={styles.zone}>
              <Text style={styles.zoneOverline}>{t('ours.whenRhythmZone')}</Text>
              <View style={styles.chips}>
                <Chip label={t('capture.modeDaily')} selected={repeat === 'daily'} onPress={() => setRepeat((r) => (r === 'daily' ? null : 'daily'))} />
                <Chip label={t('capture.modeWeekly')} selected={repeat === 'weekly'} onPress={() => setRepeat((r) => (r === 'weekly' ? null : 'weekly'))} />
                <Chip label={t('capture.modeEveryN')} selected={repeat === 'everyN'} onPress={() => setRepeat((r) => (r === 'everyN' ? null : 'everyN'))} />
                <Chip label={t('capture.modeMonthly')} selected={repeat === 'monthly'} onPress={() => setRepeat((r) => (r === 'monthly' ? null : 'monthly'))} />
              </View>
              {repeat === 'weekly' && (
                <View style={styles.weekdays}>
                  {WEEKDAY_KEYS.map((key, d) => (
                    <Pressable
                      key={d}
                      onPress={() => toggleWeekday(d)}
                      style={[styles.day, weekdaysEff.includes(d) && styles.dayOn]}
                      hitSlop={8}
                      accessibilityRole="button"
                      aria-selected={weekdaysEff.includes(d)}
                      accessibilityLabel={t('capture.repeatOnDayA11y', { day: t(key) })}
                    >
                      <Text style={[styles.dayText, weekdaysEff.includes(d) && styles.dayTextOn]}>{t(key)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {repeat === 'everyN' && (
                <View style={styles.stepperRow}>
                  <Pressable
                    onPress={() => setEveryNDays((n) => Math.max(2, n - 1))}
                    style={styles.stepBtn}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t('capture.fewerDaysA11y')}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepLabel}>{t('capture.everyNDays', { count: everyNDays })}</Text>
                  <Pressable
                    onPress={() => setEveryNDays((n) => Math.min(30, n + 1))}
                    style={styles.stepBtn}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t('capture.moreDaysA11y')}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
              )}
              {repeat === 'monthly' && (
                <>
                  <View style={styles.monthDays}>
                    {MONTH_DAYS.map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => {
                          setMonthDay(d);
                          setMonthDayTouched(true);
                        }}
                        style={[styles.day, monthDayEff === d && styles.dayOn]}
                        hitSlop={4}
                        accessibilityRole="button"
                        aria-selected={monthDayEff === d}
                        accessibilityLabel={t('capture.repeatOnDayA11y', { day: ordinalDay(d) })}
                      >
                        <Text style={[styles.dayText, monthDayEff === d && styles.dayTextOn]}>{d}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {/* Only once a day some months lack is actually chosen: nowhere at all, the 31st
                      looks like a month the app silently skips. */}
                  {monthDayEff > 28 && <Text style={styles.stepsHint}>{t('capture.monthlyShortMonths')}</Text>}
                </>
              )}
              {repeat !== null && (
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('capture.startingFromA11y', { date: whenLbl })}
                  style={styles.detailRow}
                >
                  <Text style={styles.detailValue}>{t('capture.startingFrom')}</Text>
                  <Text style={styles.changeLink}>{whenLbl} ›</Text>
                </Pressable>
              )}
            </View>

            {/* STEPS. The stepper holds its place always; when steps cannot apply (a multi-line dump,
                or a repeat) it goes quiet and the line under it says why, in plain words. */}
            {allowSteps && (
              <View style={styles.zone}>
                <View style={styles.stepsRow}>
                  <Text style={styles.zoneOverline}>{t('capture.rowSteps')}</Text>
                  <View style={[styles.stepperRow, !stepsAllowed && styles.quiet]}>
                    <Pressable
                      onPress={() => setSliceCount((n) => (n <= MIN_SLICES ? 0 : n - 1))}
                      disabled={!stepsAllowed}
                      style={styles.stepBtn}
                      hitSlop={4}
                      accessibilityRole="button"
                      aria-disabled={!stepsAllowed}
                      accessibilityLabel={t('today.fewerStepsA11y')}
                    >
                      <Text style={styles.stepBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepLabel}>{sliceCount === 0 ? t('capture.noSteps') : t('today.stepsCount', { count: sliceCount })}</Text>
                    <Pressable
                      onPress={() => setSliceCount((n) => (n === 0 ? MIN_SLICES : Math.min(MAX_SLICES, n + 1)))}
                      disabled={!stepsAllowed}
                      style={styles.stepBtn}
                      hitSlop={4}
                      accessibilityRole="button"
                      aria-disabled={!stepsAllowed}
                      accessibilityLabel={t('today.moreStepsA11y')}
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                {!stepsAllowed && (
                  <Text style={styles.stepsHint}>{lineCount > 1 ? t('capture.stepsOneThing') : t('capture.stepsOneOff')}</Text>
                )}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      )}

      {/* One fixed hint line while the composer is open: an error, the Tidy offer, or the AI egress
          note, in that priority. Its seat exists whenever it has anything to say, so the first
          keystroke never shifts the box. An ERROR also shows at rest: on web the click that started
          Sort or Tidy had already let go of the box, so a failure used to land with the composer
          folded and say nothing. It clears on the next keystroke, or with the next Add. */}
      {(error || (active && (showTidy || aiNoteKey))) && (
        <View style={styles.hintRegion}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : showTidy ? (
            <Pressable
              onPress={splitDump}
              onFocus={holdFocus}
              onBlur={handleBlur}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('capture.tidyA11y')}
              style={({ pressed }) => [pressed && styles.pressed, busy && styles.dim]}
            >
              {busyKind === 'split' ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text style={styles.tidyText}>{t('capture.tidying')}</Text>
                </View>
              ) : (
                <Text style={styles.tidyText}>{t('capture.tidy')}</Text>
              )}
            </Pressable>
          ) : aiNoteKey ? (
            <Text style={styles.aiNote}>{t(aiNoteKey)}</Text>
          ) : null}
        </View>
      )}

      <View style={styles.inputRow}>
        {onCamera && aiEnabled && (
          <Pressable
            onPress={onCamera}
            disabled={busy}
            hitSlop={4}
            style={({ pressed }) => [styles.scan, pressed && styles.pressed, busy && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel={t('capture.scanA11y')}
          >
            <Text style={styles.scanText}>{t('capture.scan')}</Text>
          </Pressable>
        )}
        <View style={[styles.box, multiline && styles.boxMulti, active && styles.boxFocused]}>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={(v) => {
              setValue(v);
              if (error) setError(null);
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            editable={!busy}
            placeholder={placeholder ?? t('capture.placeholderShort')}
            placeholderTextColor={theme.colors.inkFaint}
            style={[styles.input, { maxHeight: lineH * MAX_LINES + spacing.five }]}
            multiline
            textAlignVertical="top"
            accessibilityLabel={t('capture.inputA11y')}
            inputAccessoryViewID={Platform.OS === 'ios' ? CAPTURE_ACCESSORY_ID : undefined}
          />
          {endMode === 'add' ? (
            <Pressable
              onPress={add}
              disabled={busy || !hasText}
              accessibilityRole="button"
              aria-disabled={busy || !hasText}
              accessibilityLabel={addLabel}
              hitSlop={4}
              style={({ pressed }) => [styles.addBtn, pressed && styles.pressed, (busy || !hasText) && styles.dim]}
            >
              <Text style={styles.addText}>{addLabel}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={toggleDictation}
              disabled={busy}
              accessibilityRole="button"
              aria-selected={listening}
              accessibilityLabel={listening ? t('capture.speakListeningA11y') : t('capture.speakA11y')}
              hitSlop={4}
              style={({ pressed }) => [styles.speak, pressed && styles.pressed, busy && styles.dim]}
            >
              {listening && <View style={styles.liveDot} />}
              <Text style={styles.speakText}>{listening ? t('capture.listening') : t('capture.speak')}</Text>
            </Pressable>
          )}
        </View>
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={CAPTURE_ACCESSORY_ID}>
            <View style={styles.kbBar}>
              <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel={t('common.done')} hitSlop={10}>
                <Text style={styles.kbDone}>{t('common.done')}</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        )}
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerRoot}>
          {/* The scrim is a SIBLING of the card (an absolute-fill dismiss layer behind it), so the picker's
              day buttons are never nested inside the scrim <button> (invalid HTML on web). */}
          <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.dismiss')} />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{repeat !== null ? t('capture.startingFrom') : t('capture.pickerTitleDue')}</Text>
            <DatePicker value={when === 'date' ? dueDate : startIso} today={today} onChange={pickDate} />
          </View>
        </View>
      </Modal>
    </View>
  );
});

const makeStyles = (t: Theme) => {
  const quiet = t.appearance === 'quiet';
  const overline = {
    color: t.colors.inkSoft,
    fontSize: 10 * t.scale,
    fontFamily: fonts.bodyBold,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  };
  return StyleSheet.create({
    wrap: { gap: spacing.two },
    // Present to a screen reader, invisible and zero-footprint for everyone else.
    srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
    // The row above the box while it is open: the When chip on the left, the one AI shaper (or, on
    // the shared list, the line that explains When) on the right. Wraps rather than truncates at the
    // largest text sizes.
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.two },
    whenChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.two,
      minHeight: 44,
      paddingHorizontal: 15,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      backgroundColor: quiet ? 'transparent' : t.colors.surface,
      flexShrink: 1,
    },
    whenOverline: overline,
    whenValue: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', flexShrink: 1 },
    whenCaret: { color: t.colors.inkSoft, fontSize: 11 * t.scale, fontFamily: fonts.body },
    shaper: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 15,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.accent,
    },
    shaperText: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    busyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
    note: { flex: 1, minWidth: 140, color: t.colors.inkSoft, fontSize: 12.5 * t.scale, lineHeight: 17.5 * t.scale, fontFamily: fonts.body },
    // When, opened: the same rows the shipped door had, in the keyboard's place.
    door: { gap: spacing.one },
    doorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.three, minHeight: 44 },
    doorHeadValue: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
    doorBody: { gap: spacing.three, paddingBottom: spacing.two },
    zone: { gap: 6 },
    zoneOverline: overline,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
    detailValue: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    changeLink: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two, marginTop: spacing.one },
    // Thirty-one cells never fit on one line; the row wraps rather than squashing every cell.
    monthDays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two, marginTop: spacing.one },
    day: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    dayText: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
    dayTextOn: { color: t.colors.accent, fontWeight: '700' },
    stepsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.two },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: { color: t.colors.inkSoft, fontSize: 18 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    stepLabel: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, minWidth: 72, textAlign: 'center' },
    // Quiet-unavailable (the constant-frame treatment): the control keeps its place at lowered
    // contrast; the line below says why. Never absent, never locked.
    quiet: { opacity: 0.45 },
    stepsHint: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body },
    hintRegion: { minHeight: 20, justifyContent: 'center', paddingHorizontal: spacing.one },
    aiNote: { color: t.colors.inkFaint, fontSize: 12.5 * t.scale, fontFamily: fonts.body },
    tidyText: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    error: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.body },
    // The line itself: Scan, the box, and the box's one end button.
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.one },
    scan: { minHeight: 50, justifyContent: 'center', paddingHorizontal: spacing.two },
    scanText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    // Quiet turns the rounded box into a capture line: a 1px underline, no fill, no radius.
    box: quiet
      ? {
          flex: 1,
          minHeight: 50,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.two,
          borderBottomWidth: border.hair,
          borderColor: t.quiet.captureUnderline,
          paddingLeft: 2,
          paddingVertical: spacing.one,
        }
      : {
          flex: 1,
          minHeight: 50,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.two,
          backgroundColor: t.colors.surface,
          // A resting edge a shade firmer than the hairline, so the box reads as the place to type
          // on a paper-coloured footer. An alpha of ink, no new colour.
          borderWidth: border.hair,
          borderColor: rgba(t.colors.ink, t.scheme === 'dark' ? 0.22 : 0.14),
          borderRadius: 25,
          paddingLeft: 18,
          paddingRight: spacing.one,
          paddingVertical: spacing.one,
        },
    boxMulti: quiet ? {} : { borderRadius: 22 },
    // Open: the edge firms to the accent, which is also the box's visible focus state.
    boxFocused: quiet ? { borderColor: t.colors.accent } : { borderWidth: border.thin, borderColor: t.colors.accent },
    input: {
      flex: 1,
      // A floor, so a long consequence on the button ("Add · Weekly on Mo, We") can never squeeze the box
      // to a few characters; the button's label wraps instead.
      minWidth: 120 * t.scale,
      minHeight: 40,
      fontSize: 16 * t.scale,
      lineHeight: 22 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
      paddingTop: 10,
      paddingBottom: 10,
      paddingHorizontal: 0,
      // The box's accent edge is the focus indicator; the browser's own rectangle inside a pill is noise.
      // SOLID at zero width, not a bare zero width: Chrome's default focus style is `auto`, which ignores
      // the width and drew a yellow rectangle inside the pill in the first preview.
      ...(Platform.OS === 'web' ? { outlineStyle: 'solid' as const, outlineWidth: 0 } : null),
    },
    speak: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.two, paddingHorizontal: 14 },
    speakText: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent },
    addBtn: {
      minHeight: 42,
      maxWidth: '62%',
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderRadius: radius.pill,
      backgroundColor: t.colors.accent,
    },
    addText: { color: t.colors.onAccent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', textAlign: 'center' },
    pressed: { opacity: PRESSED_OPACITY },
    dim: { opacity: 0.45 },
    pickerRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.five },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.scrim },
    pickerCard: {
      backgroundColor: t.colors.bg,
      borderRadius: radius.lg,
      padding: spacing.five,
      width: '100%',
      maxWidth: layout.cardMediaWidth,
      gap: spacing.three,
    },
    pickerTitle: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    // The iOS keyboard toolbar (see CAPTURE_ACCESSORY_ID): Done right-aligned where an iOS thumb
    // expects it. Never a "cancel": it only lowers the keyboard, it keeps the text.
    kbBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      backgroundColor: t.colors.surface,
      borderTopWidth: border.hair,
      borderTopColor: t.colors.line,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.two,
    },
    kbDone: { color: t.colors.accent, fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  });
};
