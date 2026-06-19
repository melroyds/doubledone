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
