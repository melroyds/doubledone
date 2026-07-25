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

import { t } from './i18n-active';

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
      ? t('estimate.pace.aboutADay')
      : days === 2
        ? t('estimate.pace.coupleOfDays')
        : days <= 6
          ? t('estimate.pace.aboutNDays', { days })
          : days <= 10
            ? t('estimate.pace.aboutAWeek')
            : t('estimate.pace.weekOrTwo');
  return t('estimate.pace.line', { span });
}

export type DayWeight = { level: 'clear' | 'light' | 'full' | 'heavy'; label: string; fill: number };

// A big task weighs more than a normal one toward the day's load. Each big counts as BIG_WEIGHT normal
// tasks, so even one big thing is felt. One tunable const (real use will tell if 2 is the right multiplier).
export const BIG_WEIGHT = 2;

/** The day's load with big tasks counting heavier: each big adds (BIG_WEIGHT - 1) on top of its own 1. */
export function weightedLoad(count: number, bigCount = 0): number {
  return count + bigCount * (BIG_WEIGHT - 1);
}

// The day's stated energy scales what "full" MEANS: the gauge denominator, the label thresholds,
// and the heavy-day gate all move together, so the same six tasks read heavy on a low day, full on
// a normal one, and light-ish on a high one. High is more ROOM, never a target: it reuses the
// normal-day labels and simply reaches them later, because "you could fit more" is exactly the
// sentence this app must never say. The boolean form is the legacy low-day flag (true = 'low'),
// kept so existing call sites and tests read unchanged.
export type WeightEnergy = 'low' | 'normal' | 'high';

const ENERGY_TUNING: Record<WeightEnergy, { denom: number; light: number; full: number; heavy: number }> = {
  low: { denom: 4, light: 2, full: 4, heavy: 4 }, // the original low-capacity day, unchanged
  normal: { denom: 8, light: 4, full: 7, heavy: 6 }, // the original defaults, unchanged
  high: { denom: 12, light: 6, full: 10, heavy: 9 }, // 1.5x the room of normal, same words
};

function asEnergy(e: WeightEnergy | boolean): WeightEnergy {
  return e === true ? 'low' : e === false ? 'normal' : e;
}

/** The weighted load at which a day counts as HEAVY (gates the Lighten tool and the defer offer). */
export function heavyAt(weighted: number, energy: WeightEnergy | boolean = 'normal'): boolean {
  return weighted >= ENERGY_TUNING[asEnergy(energy)].heavy;
}

/**
 * A calm, honest read on how full Today is, from the count of unfinished one-off
 * tasks (recurring habits are routine, not load). `fill` is 0..1 for a slim gauge;
 * the label describes the day, it never scolds, so Today can't silently overfill.
 * On a low-energy day (Cluster C) the same load reads as fuller: capacity is
 * roughly halved and the label gives explicit permission to do little. A big task
 * (bigCount) weighs heavier via weightedLoad, and a lone big task is floored to at
 * least "full" so even one heavy thing registers, never sinking to "room to breathe".
 */
export function dayWeight(count: number, energy: WeightEnergy | boolean = 'normal', bigCount = 0): DayWeight {
  const level = asEnergy(energy);
  const lowDay = level === 'low';
  if (count <= 0) return { level: 'clear', label: lowDay ? t('estimate.weight.clearLow') : t('estimate.weight.clear'), fill: 0 };
  const load = weightedLoad(count, bigCount);
  const tune = ENERGY_TUNING[level];
  const fill = Math.min(load / tune.denom, 1);
  let base: DayWeight;
  if (load <= tune.light) base = { level: 'light', label: t(lowDay ? 'estimate.weight.lowLight' : 'estimate.weight.light'), fill };
  else if (load <= tune.full) base = { level: 'full', label: t(lowDay ? 'estimate.weight.lowFull' : 'estimate.weight.full'), fill };
  else base = { level: 'heavy', label: t(lowDay ? 'estimate.weight.lowHeavy' : 'estimate.weight.heavy'), fill: 1 };
  // A lone big task should be felt: if anything is marked big, never read lighter than "full".
  if (bigCount > 0 && base.level === 'light') {
    return {
      level: 'full',
      label: lowDay ? t('estimate.weight.lowFull') : t('estimate.weight.full'),
      fill: Math.max(base.fill, 0.5),
    };
  }
  return base;
}
