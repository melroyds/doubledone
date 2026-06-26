// The user-facing surface of the completion-data moat: a calm pacing estimate
// shown when a task is broken down ("usually about N days, at a gentle pace").
// Its value for this audience is normalisation, a dreaded task taking several
// days is normal, not a personal failing, which lifts the pressure to finish it
// in one sitting and protects the never-shame spine.
//
// v1 derives the estimate transparently from the decomposition (step count, total
// minutes, and any later phases). It is deliberately NOT framed as live per-user
// crowd data, because there is not yet the anonymised cross-user volume to make
// "other people took X days" an honest claim, and a fabricated statistic would
// corrode trust. The instrumentation that WILL feed the real aggregate
// (decomposition offered + step completions) is already in place, so this can swap
// to true crowd timings at scale without a UI change. Never shown as fabricated
// live metrics.

export type EstimateStep = { minutes: number };

/**
 * A gentle whole-day pace for a decomposed task, derived from the work in the
 * breakdown: roughly 25 minutes of real effort per day on a dreaded task (task
 * initiation is the real cost, not the doing), or about two steps a day,
 * whichever is greater, plus a day for each later phase. Clamped to a calm 1..14.
 */
export function paceDays(steps: EstimateStep[], laterPhaseCount = 0): number {
  const totalMin = steps.reduce((sum, s) => sum + (s.minutes > 0 ? s.minutes : 0), 0);
  const byEffort = Math.ceil(totalMin / 25);
  const bySteps = Math.ceil(steps.length / 2);
  const base = Math.max(byEffort, bySteps, steps.length > 0 ? 1 : 0);
  const days = base + Math.max(0, laterPhaseCount);
  return Math.max(1, Math.min(14, days));
}

/** Calm, never-shame phrasing for the day count. */
export function describePace(days: number): string {
  const span =
    days <= 1
      ? 'about a day'
      : days === 2
        ? 'a couple of days'
        : days <= 6
          ? `about ${days} days`
          : days <= 10
            ? 'about a week'
            : 'a week or two';
  return `Usually ${span}, at a gentle pace. No rush.`;
}

export type DayWeight = { level: 'clear' | 'light' | 'full' | 'heavy'; label: string; fill: number };

// A big task weighs more than a normal one toward the day's load. Each big counts as BIG_WEIGHT normal
// tasks, so even one big thing is felt. One tunable const (real use will tell if 2 is the right multiplier).
export const BIG_WEIGHT = 2;

/** The day's load with big tasks counting heavier: each big adds (BIG_WEIGHT - 1) on top of its own 1. */
export function weightedLoad(count: number, bigCount = 0): number {
  return count + bigCount * (BIG_WEIGHT - 1);
}

/**
 * A calm, honest read on how full Today is, from the count of unfinished one-off
 * tasks (recurring habits are routine, not load). `fill` is 0..1 for a slim gauge;
 * the label describes the day, it never scolds, so Today can't silently overfill.
 * On a low-capacity day (Cluster C) the same load reads as fuller: capacity is
 * roughly halved and the label gives explicit permission to do little. A big task
 * (bigCount) weighs heavier via weightedLoad, and a lone big task is floored to at
 * least "full" so even one heavy thing registers, never sinking to "room to breathe".
 */
export function dayWeight(count: number, lowDay = false, bigCount = 0): DayWeight {
  if (count <= 0) return { level: 'clear', label: lowDay ? 'A clear day. Rest up.' : 'A clear day', fill: 0 };
  const load = weightedLoad(count, bigCount);
  let base: DayWeight;
  if (lowDay) {
    const fill = Math.min(load / 4, 1);
    if (load <= 2) base = { level: 'light', label: 'A low day. A couple of things is plenty.', fill };
    else if (load <= 4) base = { level: 'full', label: 'A low day. Be gentle, the rest can wait.', fill };
    else base = { level: 'heavy', label: 'A low day with a lot on. Just pick one, the rest waits.', fill: 1 };
  } else {
    const fill = Math.min(load / 8, 1);
    if (load <= 4) base = { level: 'light', label: 'A gentle day. Room to breathe.', fill };
    else if (load <= 7) base = { level: 'full', label: 'A full day, but doable.', fill };
    else base = { level: 'heavy', label: 'A lot on. Be gentle with yourself.', fill: 1 };
  }
  // A lone big task should be felt: if anything is marked big, never read lighter than "full".
  if (bigCount > 0 && base.level === 'light') {
    return {
      level: 'full',
      label: lowDay ? 'A low day. Be gentle, the rest can wait.' : 'A full day, but doable.',
      fill: Math.max(base.fill, 0.5),
    };
  }
  return base;
}
