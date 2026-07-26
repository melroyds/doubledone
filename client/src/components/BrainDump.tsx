import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, InputAccessoryView, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { border, fonts, layout, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { split } from '@/lib/ai';
import { addButtonLabel, type CaptureRepeat, type CaptureWhen, doorSummary, whenLabel } from '@/lib/capture-door';
import { aiErrorLine } from '@/lib/connection';
import { addDaysISO, toISODate } from '@/lib/day';
import { appendPhrase } from '@/lib/dictation';
import { t } from '@/lib/locale';
import { type CaptureSchedule } from '@/lib/recurrence';
import { MAX_SLICES, MIN_SLICES } from '@/lib/slices';
import { type Dictation, isDictationSupported, startDictation } from '@/lib/speech';
import { track } from '@/lib/telemetry';
import { useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';

import { Chip } from './Chip';
import { DatePicker } from './DatePicker';
import { Mark } from './Mark';
import { PrimaryButton } from './PrimaryButton';

// The iOS keyboard toolbar's id. The capture is multiline, so iOS's Return key inserts a
// newline and there is NO native way to put the keyboard away, leaving it stuck over the page
// (Melroy, iOS, 2026-07-15). InputAccessoryView is the standard iOS answer: a small bar riding
// above the keyboard with an explicit Done. iOS-only by design (the component does not exist on
// Android/web, and neither platform has the problem: Android has its back gesture, web a click out).
const CAPTURE_ACCESSORY_ID = 'ddCaptureAccessory';

type Props = {
  onCapture: (text: string, schedule: CaptureSchedule, slices?: number) => void;
  onBiteElephant: (text: string) => Promise<void>;
  onSort: (text: string) => Promise<void>;
  // Close the panel (the parent owns visibility). The panel's own Close resets the door
  // (back to Today · no repeat · no steps) but NEVER the typed text: text is never lost.
  onClose: () => void;
  today: Date;
  // OCR (premium): open the photo-capture modal. The parent premium-gates the tap; this just shows the
  // button as the upsell surface. Absent (undefined) hides the button entirely.
  onCamera?: () => void;
};

// What a parent can do to the capture box via ref: drop in text (or null to just focus)
// and focus the input. Used by the launcher "Brain dump" shortcut and by shared text.
export type BrainDumpHandle = { seed: (text: string | null) => void };

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

// Capture, rebuilt to "Reflex first, one door" (Claude Design capture handoff, Melroy's pick
// 2026-07-26). The reflex path is input + Add and nothing else demanding attention. Every
// shaping power (when, repeating, steps) lives behind ONE constant, labelled door whose value
// line always says what is currently set, and the Add button repeats the consequential part
// ("Add · Weekly on Mo") so nothing surprising ever lands. The composer inside the door is a
// FIXED set of rows (When / Repeats / Steps, always in that order): content changes in place,
// controls never appear from nowhere. Iron rules: the first keystroke never waits, typed text
// survives every tap and collapse, and the door resets to Today · no repeat · no steps after
// every Add and every Close.
export const BrainDump = forwardRef<BrainDumpHandle, Props>(function BrainDump({ onCapture, onBiteElephant, onSort, onClose, today, onCamera }, ref) {
  const [value, setValue] = useState('');
  const [doorOpen, setDoorOpen] = useState(false);
  const [when, setWhen] = useState<CaptureWhen>('today');
  const [repeat, setRepeat] = useState<CaptureRepeat>(null);
  const [weekdays, setWeekdays] = useState<number[]>([today.getDay()]);
  const [everyNDays, setEveryNDays] = useState(2);
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

  // Talk-to-capture (web only; the mic stays hidden where unsupported). Each spoken
  // phrase lands as its own line, then the existing Sort / Add flow takes over.
  const [canDictate] = useState(() => isDictationSupported());
  const [listening, setListening] = useState(false);
  const dictationRef = useRef<Dictation | null>(null);
  const phraseCountRef = useRef(0);

  // Expose seed() to parents: drop in text (null = just focus, so a "Brain dump" shortcut
  // never clears in-progress text) and focus the input. Imperative, so the setState runs
  // like an event handler, never during render or as a cascading effect.
  useImperativeHandle(ref, () => ({
    seed: (text: string | null) => {
      if (text !== null) setValue(text);
      inputRef.current?.focus();
    },
  }), []);

  // Stop dictation if we unmount mid-listen. Only a cleanup runs here (no setState
  // in the effect body), so the React Compiler stays happy.
  useEffect(() => () => { dictationRef.current?.stop(); }, []);

  const busy = busyKind !== null;
  const lineCount = value.split('\n').filter((l) => l.trim().length > 0).length;
  // A single long line is probably several things said in one breath; offer an AI split.
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const canSplit = lineCount === 1 && wordCount >= 6;
  // Steps only make sense for a single, one-off task (a thing with parts). The row stays in
  // place regardless (fixed regions, not appearing controls); it goes quiet and says why.
  const stepsAllowed = lineCount <= 1 && repeat === null;
  const todayIso = toISODate(today);

  // The one door state the summary, the Add label, and buildSchedule all read. The weekday
  // fallback mirrors buildSchedule, so an all-untoggled Weekly still names today's day.
  const doorState = {
    when,
    dueDate,
    repeat,
    weekdays: weekdays.length > 0 ? weekdays : [today.getDay()],
    everyNDays,
    steps: stepsAllowed && sliceCount >= MIN_SLICES ? sliceCount : 0,
  };
  const summary = doorSummary(doorState, today);
  const addLabel = addButtonLabel(doorState, today, lineCount);
  const whenLbl = whenLabel(doorState, today);

  // ONE rule composes WHEN with REPEATS: the when IS a repeat's start date ("Tomorrow · Daily"
  // starts tomorrow). "Starting from" in the Repeats row reads the same value; never two truths.
  const startIso = when === 'today' ? todayIso : when === 'tomorrow' ? addDaysISO(today, 1) : dueDate;

  function buildSchedule(): CaptureSchedule {
    if (repeat === 'daily') {
      return { mode: 'daily', start: startIso };
    }
    if (repeat === 'weekly') {
      return { mode: 'weekly', weekdays: weekdays.length > 0 ? weekdays : [today.getDay()], start: startIso };
    }
    if (repeat === 'everyN') {
      return { mode: 'everyN', days: everyNDays, start: startIso };
    }
    if (when === 'date') {
      return { mode: 'date', date: dueDate };
    }
    return { mode: when };
  }

  // Back to the calm default: Today, no repeat, no steps, door shut. Runs after every Add
  // and every Close. Never touches the typed text; reset() below clears that too (post-Add).
  function resetDoor() {
    setDoorOpen(false);
    setWhen('today');
    setRepeat(null);
    setWeekdays([today.getDay()]);
    setEveryNDays(2);
    setDueDate(todayIso);
    setPickerOpen(false);
    setSliceCount(0);
  }

  function reset() {
    stopDictation();
    setValue('');
    resetDoor();
  }

  function close() {
    stopDictation();
    resetDoor();
    setError(null);
    onClose();
  }

  function toggleDoor() {
    if (!doorOpen) {
      Keyboard.dismiss(); // the composer needs the room; the text is untouched
      track('capture.door.opened');
    }
    setDoorOpen((o) => !o);
  }

  // The picker answers one question ("which day"), so picking today or tomorrow lands on
  // those chips, keeping them truthful; anything else becomes the picked date.
  function pickDate(iso: string) {
    if (iso === todayIso) {
      setWhen('today');
    } else if (iso === addDaysISO(today, 1)) {
      setWhen('tomorrow');
    } else {
      setWhen('date');
      setDueDate(iso);
    }
    setPickerOpen(false);
  }

  // Talk-to-capture: tap to start, tap to stop. Each final phrase becomes a line;
  // a result arriving after a stop is ignored, so a sorted or cleared box never
  // re-fills. Web only (the mic is gated on isDictationSupported).
  function stopDictation() {
    const active = dictationRef.current;
    if (active === null) return;
    dictationRef.current = null;
    active.stop(); // fires onEnd -> listening off + telemetry
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
    if (!value.trim() || busy) return;
    onCapture(value, buildSchedule(), stepsAllowed && sliceCount >= MIN_SLICES ? sliceCount : undefined);
    reset();
  }

  async function biteElephant() {
    const task = value.trim();
    if (!task || busy) return;
    setError(null);
    setBusyKind('bite');
    try {
      await onBiteElephant(task);
      reset();
    } catch {
      setError(aiErrorLine(t('capture.breakDownError')));
    } finally {
      setBusyKind(null);
    }
  }

  async function sortDump() {
    const text = value;
    if (!text.trim() || busy) return;
    setError(null);
    setBusyKind('sort');
    try {
      await onSort(text);
      reset();
    } catch {
      setError(aiErrorLine(t('capture.sortError')));
    } finally {
      setBusyKind(null);
    }
  }

  // Hand a run-on line (often a no-pause dictation) to the AI, which separates it
  // into the distinct tasks; they replace the single line so "Sort for me" then
  // appears. Only splits, never sorts (the user stays in control). Works on web
  // and native (it is an AI call, not voice).
  async function splitDump() {
    const text = value.trim();
    if (!text || busy) return;
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
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  // The one fixed hint line under the actions: content swaps in place, position never moves.
  // Priority: an error > the Tidy offer (a run-on line) > the AI egress disclosure (any text).
  const showTidy = aiEnabled && canSplit && (busyKind === 'split' || !busy);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.headerOverline}>{t('capture.add')}</Text>
        <Pressable
          onPress={close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('capture.collapseA11y')}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>{t('common.close')}</Text>
        </Pressable>
      </View>

      <View style={styles.captureRow}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={setValue}
          editable={!busy}
          placeholder={t('capture.placeholder')}
          placeholderTextColor={theme.colors.inkFaint}
          style={[styles.input, styles.inputFlex]}
          multiline
          textAlignVertical="top"
          accessibilityLabel={t('capture.inputA11y')}
          inputAccessoryViewID={Platform.OS === 'ios' ? CAPTURE_ACCESSORY_ID : undefined}
        />
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={CAPTURE_ACCESSORY_ID}>
            <View style={styles.kbBar}>
              <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel={t('common.done')} hitSlop={10}>
                <Text style={styles.kbDone}>{t('common.done')}</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        )}
        {(canDictate || (onCamera && aiEnabled)) && (
          <View style={styles.sideCol}>
            {canDictate && (
              <Pressable
                onPress={toggleDictation}
                disabled={busy}
                style={({ pressed }) => [styles.speak, listening && styles.speakOn, pressed && styles.pressed, busy && styles.disabled]}
                accessibilityRole="button"
                accessibilityState={{ selected: listening }}
                accessibilityLabel={listening ? t('capture.speakListeningA11y') : t('capture.speakA11y')}
              >
                {listening ? <View style={styles.liveDot} /> : <Mark name="mic" size={16} color={theme.colors.inkSoft} />}
                <Text style={[styles.speakText, listening && styles.speakTextOn]}>
                  {listening ? t('capture.listening') : t('capture.speak')}
                </Text>
              </Pressable>
            )}
            {onCamera && aiEnabled && (
              <Pressable
                onPress={onCamera}
                disabled={busy}
                style={({ pressed }) => [styles.speak, pressed && styles.pressed, busy && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel={t('capture.scanA11y')}
              >
                <Mark name="camera" size={16} color={theme.colors.inkSoft} />
                <Text style={styles.speakText}>{t('capture.scan')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* THE DOOR. One constant, bordered row: the overline names the three powers, the value
          line says what is currently set (wraps, never truncates), the caret opens the composer
          below it. User-initiated disclosure in a fixed place; the door itself never moves. */}
      <View style={styles.doorWrap}>
        <Pressable
          onPress={toggleDoor}
          accessibilityRole="button"
          accessibilityState={{ expanded: doorOpen }}
          accessibilityLabel={t('capture.doorA11y', { summary })}
          style={({ pressed }) => [styles.doorRow, pressed && styles.pressed]}
        >
          <View style={styles.doorTextCol}>
            <Text style={styles.doorOverline}>{t('capture.doorOverline')}</Text>
            <Text style={styles.doorValue}>{summary}</Text>
          </View>
          <Text style={styles.doorCaret}>{doorOpen ? '⌄' : '›'}</Text>
        </Pressable>

        {doorOpen && (
          <View style={styles.composer}>
            {/* WHEN. Three chips and a fixed detail line: the resolved day plus one Change
                link into the date picker (the held card's Move-to picker component). */}
            <View style={styles.compRow}>
              <Text style={styles.compOverline}>{t('capture.rowWhen')}</Text>
              <View style={styles.chips}>
                <Chip label={t('common.today')} selected={when === 'today'} onPress={() => setWhen('today')} />
                <Chip label={t('common.tomorrow')} selected={when === 'tomorrow'} onPress={() => setWhen('tomorrow')} />
                <Chip
                  label={t('capture.pickDate')}
                  selected={when === 'date'}
                  onPress={() => setPickerOpen(true)}
                />
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailValue}>{whenLbl}</Text>
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('capture.pickDate')}
                >
                  <Text style={styles.changeLink}>{t('capture.change')} ›</Text>
                </Pressable>
              </View>
            </View>

            {/* REPEATS. Three toggles (tap again to clear); the detail region holds each
                cadence's one control plus the Starting-from read-through of the WHEN. */}
            <View style={styles.compRow}>
              <Text style={styles.compOverline}>{t('capture.rowRepeats')}</Text>
              <View style={styles.chips}>
                <Chip label={t('capture.modeDaily')} selected={repeat === 'daily'} onPress={() => setRepeat((r) => (r === 'daily' ? null : 'daily'))} />
                <Chip label={t('capture.modeWeekly')} selected={repeat === 'weekly'} onPress={() => setRepeat((r) => (r === 'weekly' ? null : 'weekly'))} />
                <Chip label={t('capture.modeEveryN')} selected={repeat === 'everyN'} onPress={() => setRepeat((r) => (r === 'everyN' ? null : 'everyN'))} />
              </View>
              {repeat === 'weekly' && (
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
              {repeat === 'everyN' && (
                <View style={styles.stepperRow}>
                  <Pressable
                    onPress={() => setEveryNDays((n) => Math.max(2, n - 1))}
                    style={styles.stepBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('capture.fewerDaysA11y')}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepLabel}>{t('capture.everyNDays', { count: everyNDays })}</Text>
                  <Pressable
                    onPress={() => setEveryNDays((n) => Math.min(30, n + 1))}
                    style={styles.stepBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('capture.moreDaysA11y')}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
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

            {/* STEPS. The stepper holds its place always; when steps cannot apply (a multi-line
                dump, or a repeat) it goes quiet and the hint line says why, in plain words. */}
            <View style={styles.compRow}>
              <Text style={styles.compOverline}>{t('capture.rowSteps')}</Text>
              <View style={[styles.stepperRow, !stepsAllowed && styles.quiet]}>
                <Pressable
                  onPress={() => setSliceCount((n) => (n <= MIN_SLICES ? 0 : n - 1))}
                  disabled={!stepsAllowed}
                  style={styles.stepBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !stepsAllowed }}
                  accessibilityLabel={t('today.fewerStepsA11y')}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepLabel}>{sliceCount === 0 ? t('capture.noSteps') : t('today.stepsCount', { count: sliceCount })}</Text>
                <Pressable
                  onPress={() => setSliceCount((n) => (n === 0 ? MIN_SLICES : Math.min(MAX_SLICES, n + 1)))}
                  disabled={!stepsAllowed}
                  style={styles.stepBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !stepsAllowed }}
                  accessibilityLabel={t('today.moreStepsA11y')}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.stepsHint}>
                {!stepsAllowed
                  ? lineCount > 1
                    ? t('capture.stepsOneThing')
                    : t('capture.stepsOneOff')
                  : sliceCount === 0
                    ? t('capture.stepsHintOff')
                    : t('capture.stepsHintOn')}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* The action row. The AI slot swaps its label by line count (one thing -> Break it
          down, a dump -> Sort for me) but keeps its position, size and role; Add carries the
          consequence. With AI off the slot is absent and Add takes the full row. */}
      <View style={styles.actions}>
        {aiEnabled &&
          (lineCount >= 2 ? (
            <Pressable
              onPress={sortDump}
              disabled={busy}
              style={({ pressed }) => [styles.bite, pressed && styles.pressed, busy && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel={t('capture.sortA11y')}
            >
              {busyKind === 'sort' ? (
                <View style={styles.biteBusy}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text style={styles.biteText}>{t('capture.sorting')}</Text>
                </View>
              ) : (
                <Text style={styles.biteText}>{t('actions.sortForMe')}</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={biteElephant}
              disabled={busy}
              style={({ pressed }) => [styles.bite, pressed && styles.pressed, busy && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel={t('capture.breakDownA11y')}
            >
              {busyKind === 'bite' ? (
                <View style={styles.biteBusy}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text style={styles.biteText}>{t('capture.breakingDown')}</Text>
                </View>
              ) : (
                <Text style={styles.biteText}>{t('actions.breakItDown')}</Text>
              )}
            </Pressable>
          ))}

        <PrimaryButton label={addLabel} onPress={add} disabled={busy} accessibilityLabel={addLabel} style={styles.addFlex} />
      </View>

      <View style={styles.hintRegion}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : showTidy ? (
          <Pressable
            onPress={splitDump}
            disabled={busy}
            style={({ pressed }) => [styles.split, pressed && styles.pressed, busy && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel={t('capture.tidyA11y')}
          >
            {busyKind === 'split' ? (
              <View style={styles.biteBusy}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={styles.splitText}>{t('capture.tidying')}</Text>
              </View>
            ) : (
              <Text style={styles.splitText}>{t('capture.tidy')}</Text>
            )}
          </Pressable>
        ) : aiEnabled && value.trim().length > 0 ? (
          <Text style={styles.aiNote}>{t('capture.aiNote')}</Text>
        ) : null}
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

const makeStyles = (t: Theme) => StyleSheet.create({
  wrap: { gap: spacing.three },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerOverline: {
    color: t.colors.inkFaint,
    fontSize: 11 * t.scale,
    fontFamily: fonts.body,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  // A generous close target (44px rule) that still reads as a quiet link.
  closeBtn: { minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.two },
  closeText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  // Quiet turns the bordered box into a capture line: a 1px underline, no fill/border/radius,
  // content near the margin. The faint placeholder (set via placeholderTextColor) is unchanged.
  input: {
    minHeight: 64,
    maxHeight: 160,
    fontSize: 16 * t.scale,
    fontFamily: fonts.body,
    lineHeight: 22 * t.scale,
    color: t.colors.ink,
    ...(t.appearance === 'quiet'
      ? { borderBottomWidth: border.hair, borderColor: t.quiet.captureUnderline, paddingHorizontal: 2, paddingVertical: spacing.three }
      : {
          backgroundColor: t.colors.surface,
          borderWidth: border.hair,
          borderColor: t.colors.line,
          borderRadius: radius.md,
          paddingHorizontal: spacing.four,
          paddingVertical: spacing.three,
        }),
  },
  // 'stretch' (not flex-start): at rest the input stretches to the Speak+Scan column's
  // height, so the box's bottom edge sits flush with Scan's (Melroy, 2026-07-26, the
  // misaligned edges read as visual noise). A growing multiline still wins the height.
  captureRow: { flexDirection: 'row', gap: spacing.two, alignItems: 'stretch' },
  inputFlex: { flex: 1 },
  sideCol: { gap: spacing.two, alignItems: 'stretch' },
  // The door: one bordered group holding the summary row and, when open, the composer.
  // The touch of extra top margin keeps it visually clear of the taller input block.
  doorWrap: {
    marginTop: spacing.one,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    borderRadius: radius.md,
    backgroundColor: t.colors.surface,
  },
  doorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.three,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
    minHeight: 44,
  },
  doorTextCol: { flex: 1, gap: 2 },
  doorOverline: {
    color: t.colors.inkFaint,
    fontSize: 10 * t.scale,
    fontFamily: fonts.body,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  doorValue: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '500' },
  doorCaret: { color: t.colors.inkSoft, fontSize: 18 * t.scale, fontFamily: fonts.body },
  composer: {
    borderTopWidth: border.hair,
    borderTopColor: t.colors.line,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.four,
    gap: spacing.five,
  },
  compRow: { gap: spacing.two },
  compOverline: {
    color: t.colors.inkFaint,
    fontSize: 10 * t.scale,
    fontFamily: fonts.body,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.one },
  detailValue: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
  changeLink: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  weekdays: { flexDirection: 'row', gap: spacing.two, marginTop: spacing.one },
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
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: t.colors.accent, fontSize: 20 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  stepLabel: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body, fontWeight: '500', minWidth: 110, textAlign: 'center' },
  // Quiet-unavailable (the constant-frame treatment): the control keeps its place at lowered
  // contrast; the line below says why. Never absent, never locked.
  quiet: { opacity: 0.45 },
  stepsHint: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  addFlex: { flex: 1 },
  bite: {
    borderRadius: radius.md,
    borderWidth: border.hair,
    borderColor: t.colors.accent,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
  },
  biteBusy: { flexDirection: 'row', alignItems: 'center', gap: spacing.two },
  biteText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  // One fixed hint region: an error, the Tidy offer, or the AI egress note, in that priority.
  hintRegion: { minHeight: 20, justifyContent: 'center' },
  aiNote: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
  split: { alignSelf: 'center', alignItems: 'center', paddingVertical: spacing.one, paddingHorizontal: spacing.three },
  splitText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textAlign: 'center' },
  error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body },
  pressed: { opacity: PRESSED_OPACITY },
  disabled: { opacity: 0.5 },
  pickerRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.five,
  },
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
  // The iOS keyboard toolbar (see CAPTURE_ACCESSORY_ID): a calm surface strip, Done right-aligned
  // where an iOS thumb expects it. Never a "cancel", it only lowers the keyboard, it keeps the text.
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
  speak: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.two,
    paddingHorizontal: spacing.three,
    paddingVertical: spacing.two,
    borderRadius: radius.pill,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
  },
  speakOn: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
  speakText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, fontWeight: '500' },
  speakTextOn: { color: t.colors.accent },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent },
});
