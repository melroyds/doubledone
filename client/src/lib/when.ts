import { addDaysISO, friendlyDate, toISODate } from './day';
import { t } from './i18n-active';
import { describeRecurrence, type CaptureSchedule, type Recurrence, scheduleFields } from './recurrence';

// The WHEN answer for a shared row, as fields.
//
// `scheduleFields` already maps a capture choice to scheduling fields and is the one place cadences
// are built, so this does not replace it. It corrects it for two things that only matter when you
// are EDITING a row that already exists, on a list two people read.
//
// 1. IT ALWAYS RETURNS BOTH KEYS. `scheduleFields` OMITS the half you did not choose, which is right
//    for creation (absent means absent) and wrong for an edit, where the whole point is to clear the
//    other half. A row that carried a rhythm and now carries a date has to be TOLD the rhythm is
//    over; leaving `recurrence` out of the patch leaves the old one in place, and the row ends up
//    both dated and repeating, which is the one state the model says cannot exist.
//
// 2. TODAY WRITES A REAL DATE. `scheduleFields` maps BOTH 'today' and 'anytime' to "no fields",
//    which is correct for a personal task (undated means today) and silently wrong here, because on
//    a shared row no date means "lives in the room, reaches nobody's day". This app has already
//    shipped that bug once, on the shared capture bar directly above this sheet: the chip looked
//    chosen, the button read "Add · Today", and the row quietly appeared on nobody's day. The fix
//    lives inline in `BrainDump`; this is the same rule, extracted, so the sheet cannot repeat it.

/** One of `due` and a readable `recurrence`, never both, with the other explicitly cleared. */
export type WhenAnswer = { due: string | null; recurrence: Recurrence };

/**
 * What to write for a WHEN answer on a surface whose resting state is Anytime.
 *
 * Total: every `CaptureSchedule` maps to exactly one answer, and never-both holds by construction
 * rather than by the caller remembering. `{ kind: 'none' }` is the recurrence type's own way of
 * saying a row does not repeat, so clearing a rhythm is a value here and not an absence.
 */
export function whenFields(schedule: CaptureSchedule, today: Date): WhenAnswer {
  const fields = scheduleFields(schedule, today);
  if (fields.recurrence) return { due: null, recurrence: fields.recurrence };
  if (typeof fields.due === 'string') return { due: fields.due, recurrence: { kind: 'none' } };
  // Both 'today' and 'anytime' arrive with nothing, and they mean opposite things here.
  return { due: schedule.mode === 'today' ? toISODate(today) : null, recurrence: { kind: 'none' } };
}

/**
 * Whether an answer would actually change the row, so an idle Set can decline to write.
 *
 * Every mutator on the shared list ends in a commit with a fresh stamp, and a fresh stamp is what
 * the other person's screen reads as "changed since you looked". So a Set that alters nothing would
 * still wash the row on their next visit, and they would go looking for a change that never
 * happened. On a surface built so that nothing moves because the other person acted, a no-op that
 * announces itself is worse than a wasted write.
 */
export function whenChanges(answer: WhenAnswer, current: { due?: string | null; recurrence?: Recurrence }): boolean {
  const wasRepeating = current.recurrence !== undefined && current.recurrence.kind !== 'none';
  const nowRepeating = answer.recurrence.kind !== 'none';
  if (wasRepeating !== nowRepeating) return true;
  if (nowRepeating) return cadenceKey(answer.recurrence) !== cadenceKey(current.recurrence as Recurrence);
  return (answer.due ?? null) !== (current.due ?? null);
}

/**
 * A cadence's identity, for comparing two of them.
 *
 * Two things it must survive, and a plain `JSON.stringify` survives neither. A shared row's cadence
 * carries a `summary` for readers whose build cannot compute the rhythm itself, so the copy that
 * came back from the server has a key the copy built locally does not, and comparing them raw
 * reports a change nobody made: the idle-Set guard stops guarding and the other person's row gets
 * washed for nothing. Key ORDER is the second: two objects with the same fields written in a
 * different order stringify differently. Sorting the entries settles both.
 */
function cadenceKey(r: Recurrence): string {
  const { summary: _summary, ...rest } = r as Recurrence & { summary?: string };
  return JSON.stringify(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
}

/** Tomorrow, as this surface means it. Exported so a caller never re-derives the offset by hand. */
export function tomorrowISO(today: Date): string {
  return addDaysISO(today, 1);
}

/** A rhythm's start, wherever that rhythm happens to keep it. An interval calls it an anchor. */
export function startOf(r: Recurrence | undefined): string | undefined {
  if (r === undefined) return undefined;
  if (r.kind === 'daily' || r.kind === 'weekly' || r.kind === 'monthly') return r.start;
  if (r.kind === 'interval') return r.anchor;
  return undefined;
}

/** What the sheet says about an answer, before anything commits. */
export type WhenSummary = {
  /** The detail line: dot-joined pieces naming the state. */
  fragment: string;
  /** A whole fixed sentence stating the consequence. Never assembled around a mid-clause slot, so
   *  five locales translate it entire rather than in pieces that fight their own grammar. */
  sentence: string;
  /** The commit button. Names the outcome; never "Save". */
  commit: string;
  /** Whether this answer ends a rhythm that is currently running, which is said first and plainly. */
  ends: boolean;
};

/**
 * The words for an answer.
 *
 * TWO STRINGS, not one, and the split is deliberate. The FRAGMENT carries detail and is built from
 * dot-joined pieces, so a locale can reorder them without grammar. The SENTENCE is whole and fixed
 * per case, because a sentence assembled around a slot in the middle cannot survive German word
 * order. Nothing here interpolates into the body of a clause.
 *
 * The rhythm's start is ALWAYS shown, and that is why this does not reach for `describeRecurrence`
 * with a date. That helper surfaces a start only when it is in the FUTURE, which is right for the
 * Repeating drawer (a not-yet-active habit is the interesting case) and wrong here: on a live
 * series the anchor would then appear nowhere, and for "every 3 days" the anchor IS the schedule.
 * A builder reaching for the obvious helper reintroduces exactly the gap this sheet exists to close,
 * and it would look correct in every test written afterwards. So: `describeRecurrence(r)` with no
 * date for the bare words, and `repeat.fromDate` to attach the start ourselves.
 */
export function whenSummary(answer: WhenAnswer, today: Date, was?: { recurrence?: Recurrence }): WhenSummary {
  const wasRepeating = was?.recurrence !== undefined && was.recurrence.kind !== 'none';
  const repeating = answer.recurrence.kind !== 'none';
  const ends = wasRepeating && !repeating;

  if (repeating) {
    const base = describeRecurrence(answer.recurrence); // no date: the bare words, on purpose
    const start = startOf(answer.recurrence);
    return {
      fragment: start ? t('repeat.fromDate', { base, date: friendlyDate(start, today) }) : base,
      sentence: t('ours.whenRhythm'),
      commit: t('ours.whenSet', { what: base }),
      ends: false,
    };
  }

  if (answer.due === null) {
    const anytime = t('capture.anytime');
    return { fragment: anytime, sentence: t('ours.whenPlain'), commit: t('ours.whenSet', { what: anytime }), ends };
  }

  // Today is the one answer whose encoding is invisible, so the fragment SAYS which date it became.
  // The button stays short: the date is already on the chip and in the line above it.
  const isToday = answer.due === toISODate(today);
  const day = friendlyDate(answer.due, today);
  const short = isToday ? t('common.today') : day;
  return {
    fragment: isToday ? `${t('common.today')}  ·  ${day}` : day,
    sentence: isToday ? t('ours.whenToday') : t('ours.whenDay'),
    commit: t('ours.whenSet', { what: short }),
    ends,
  };
}

/**
 * The value beside the door on a held card, which must never be blank.
 *
 * A door named after only one of two possible answers is what let dates ship without an editor in
 * the first place, so this one names whatever the row actually carries.
 */
export function whenValue(row: { due?: string | null; recurrence?: Recurrence }, today: Date): string {
  if (row.recurrence !== undefined && row.recurrence.kind !== 'none') return describeRecurrence(row.recurrence);
  return typeof row.due === 'string' ? friendlyDate(row.due, today) : t('capture.anytime');
}
