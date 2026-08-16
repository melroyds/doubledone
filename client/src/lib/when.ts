import { addDaysISO, toISODate } from './day';
import { type CaptureSchedule, type Recurrence, scheduleFields } from './recurrence';

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
  if (nowRepeating) return JSON.stringify(answer.recurrence) !== JSON.stringify(current.recurrence);
  return (answer.due ?? null) !== (current.due ?? null);
}

/** Tomorrow, as this surface means it. Exported so a caller never re-derives the offset by hand. */
export function tomorrowISO(today: Date): string {
  return addDaysISO(today, 1);
}
