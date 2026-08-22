// "Hold me to it" — the contract engine, pure and fully tested.
//
// BORN FROM USER FEEDBACK (2026-08-22): some ADHD / AuDHD folks told us the calm energy reads as
// ignorable at the exact moment they need the opposite. Their word for what they wanted was a
// "contract", and that word is the whole design: consensual firmness, agreed in a calm moment,
// executed in the weak one. The app never nags uninvited; it enforces agreements you explicitly
// made with it.
//
// HOW THIS STAYS INSIDE THE NEVER-SHAME SPINE. Shame is judgment; force is delivery. The rule
// "never shame the backlog" governs how the app treats the PAST. A held task is about the FUTURE,
// and the intensity was chosen by the user, per task, in advance. Three invariants keep it honest:
//
//   1. ONE CONTRACT AT A TIME. If everything is loud, nothing is, and notification fatigue ends
//      with every notification switched off, which is worse than where the user started. Scarcity
//      is what keeps the force meaningful. (The same instinct as "Just this one".)
//   2. ESCALATION OF DELIVERY, NEVER OF JUDGMENT. The fifth reminder says exactly the same calm
//      words as the first. No counters, no "3rd reminder", no guilt inflection. It just arrives
//      again.
//   3. THE EXIT IS ONE TAP AND NEVER QUESTIONED. Ticking the task ends it. "Let it go" ends it.
//      Neither is ever met with a confirm dialog or a comment.
//
// The OCD caveat, written where the cadence lives: for a checking-loop brain a relentless reminder
// can become an anxiety machine, which is why this is opt-in per task, visibly bounded (you can
// read the whole ladder below), and never system-wide. The autistic side needs the escalation to
// be PREDICTABLE: you chose it, you know exactly what it will do and when.
//
// WHY THE LADDER IS PRE-SCHEDULED RATHER THAN CHAINED. A chained "reschedule on fire" needs the
// app to run at fire time, and the whole point is reaching someone who has not opened the app. So
// the day's steps are all scheduled up front (four ids plus one daily repeat, far under iOS's 64
// pending-notification cap), and cancelling the contract cancels every id.

/** Minutes after the hold when each same-day step fires, before quiet-hours shifting.
 *  Half an hour, then roughly doubling: present without being a metronome. */
export const LADDER_OFFSETS_MIN = [30, 90, 180, 360] as const;

/** Quiet hours: nothing fires between 21:30 and 08:30 local. A reminder at 3am is not
 *  accountability, and this audience already sleeps badly. */
const QUIET_START_MIN = 21 * 60 + 30; // 21:30
const QUIET_END_MIN = 8 * 60 + 30; // 08:30

/** Steps that land closer together than this after quiet-hour shifting collapse into one.
 *  Two notifications twenty minutes apart is a metronome, not a hand on the shoulder. */
const MIN_GAP_MIN = 20;

/** The day-after follow-up fires here daily until the contract ends. 09:30, deliberately NOT
 *  9:00: the daily reminder defaults to 9, and stacking two notifications in the same minute
 *  reads as the app malfunctioning. */
export const DAILY_FOLLOW_UP = { hour: 9, minute: 30 } as const;

/** The one live contract, or null. Persisted (storage key doubledone.hold.v1) so it survives
 *  restarts and the resilience sweep can re-schedule it after an OEM alarm wipe. */
export type HoldContract = {
  taskId: string;
  title: string;
  heldAt: number; // epoch ms the contract was made
  /** Every scheduled-notification id belonging to this contract, so ending it cancels ALL. */
  notifIds: string[];
};

const minutesIntoDay = (d: Date): number => d.getHours() * 60 + d.getMinutes();

/** Shift a time out of quiet hours: anything from 21:30 lands on the NEXT 08:30. */
export function shiftOutOfQuiet(d: Date): Date {
  const m = minutesIntoDay(d);
  if (m >= QUIET_START_MIN) {
    const out = new Date(d);
    out.setDate(out.getDate() + 1);
    out.setHours(8, 30, 0, 0);
    return out;
  }
  if (m < QUIET_END_MIN) {
    const out = new Date(d);
    out.setHours(8, 30, 0, 0);
    return out;
  }
  return d;
}

/**
 * The same-day escalation: when each step actually fires, given when the hold was made.
 *
 * Quiet-hour shifting can pile several steps onto the same 08:30, so shifted steps that land
 * within MIN_GAP_MIN of the previous one are dropped rather than queued: an evening hold becomes
 * ONE morning knock plus the daily follow-up, not four notifications in a row at breakfast.
 * Always in ascending order, always strictly after the hold moment.
 */
export function escalationTimes(heldAt: Date): Date[] {
  const out: Date[] = [];
  for (const offset of LADDER_OFFSETS_MIN) {
    const raw = new Date(heldAt.getTime() + offset * 60_000);
    const shifted = shiftOutOfQuiet(raw);
    const prev = out[out.length - 1];
    if (prev && shifted.getTime() - prev.getTime() < MIN_GAP_MIN * 60_000) continue;
    out.push(shifted);
  }
  return out;
}

/**
 * Whether taking a new contract requires releasing an old one first: the one-at-a-time rule as a
 * question the UI can ask. Holding the SAME task again is not a swap, it is a no-op refresh.
 */
export function holdRequiresSwap(current: HoldContract | null, taskId: string): boolean {
  return current !== null && current.taskId !== taskId;
}

/**
 * Which knock the contract is up to at `now`: 0 before the first, 1..N through the same-day
 * ladder, then one more per elapsed day of the 09:30 follow-up. Capped at 30 so telemetry can
 * never carry an unbounded number. This is the moat's resolution: "held tasks finish at step 2"
 * versus "holds get released at step 7" is the difference between a feature that works and one
 * that nags, and nobody else in the space has that curve.
 */
export function holdStepAt(heldAt: Date, now: Date): number {
  const steps = escalationTimes(heldAt);
  const sameDay = steps.filter((d) => d.getTime() <= now.getTime()).length;
  const lastStep = steps[steps.length - 1];
  let daily = 0;
  if (now.getTime() > lastStep.getTime()) {
    const probe = new Date(lastStep);
    probe.setDate(probe.getDate() + 1);
    probe.setHours(DAILY_FOLLOW_UP.hour, DAILY_FOLLOW_UP.minute, 0, 0);
    while (probe.getTime() <= now.getTime() && daily < 30) {
      daily += 1;
      probe.setDate(probe.getDate() + 1);
    }
  }
  return Math.min(sameDay + daily, 30);
}
