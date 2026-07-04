// The whole-task-finish celebration tier (the "Dusk, evolved" redesign, slice 3). Pure:
// from the existing big-win signal, how long the task lingered (the dread proxy), and its
// complexity (decomposition minutes), pick how big the bloom should be. Three calm tiers,
// no points, and no number is ever shown to the user. Reduced motion keeps the held title
// and the warm colour; only the bloom's movement is removed (handled in the component).

import { motion } from '../constants/motion';
import { activeLocale, fmt, t } from './i18n-active';

export type CelebrationTier = 'quick' | 'real' | 'dreaded';

export type CelebrationInput = {
  bigWin: boolean; // the existing isBigWin signal (a long-dreaded or chunky task)
  lingerDays: number; // days from first written down to finished (the dread proxy)
  stepMinutes: number; // total decomposition minutes (complexity), 0 if not decomposed
};

/**
 * Pick the celebration tier and its bloom duration for a finished task. Recognition of a
 * real, earned finish, scaled to the size of the thing, never a score. A quick win gets a
 * brief warm settle; a real finish a held bloom; a long-dreaded thing the warmest, longest
 * moment. Pure; the component reads `durationMs` and the tier to size the bloom.
 */
export function celebrationTier(input: CelebrationInput): { tier: CelebrationTier; durationMs: number } {
  const { bigWin, lingerDays, stepMinutes } = input;
  if (bigWin || lingerDays >= 7 || stepMinutes >= 90) {
    return { tier: 'dreaded', durationMs: motion.celebration.dreaded };
  }
  // A whole-task finish is never "quick": completing something you broke into steps is, at
  // minimum, a real finish and earns the held bloom. (It used to drop to `quick` for a
  // same-day, modest task, which read too feeble for the biggest "you did the thing"
  // moment, the B1 device-test note.) `quick` stays in the type for the component, but the
  // whole-task bloom is floored at `real`.
  return { tier: 'real', durationMs: motion.celebration.real };
}

// --- The warm context line under a whole-task-finish bloom ---

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

// The spelled-out counts are the English editorial voice only; other locales get the digit.
function countWord(n: number): string {
  if (activeLocale() !== 'en') return String(n);
  return COUNT_WORDS[n] ?? String(n);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// How long the task lingered, humanised (the dread proxy). Empty for a same-day finish.
function lingerClause(days: number): string {
  if (days < 1) return '';
  if (days === 1) return t('celebrate.linger.oneDay');
  if (days < 7) return t('celebrate.linger.days', { count: cap(countWord(days)) });
  if (days < 14) return t('celebrate.linger.oneWeek');
  if (days < 31) return t('celebrate.linger.weeks', { count: cap(countWord(Math.floor(days / 7))) });
  if (days < 62) return t('celebrate.linger.oneMonth');
  return t('celebrate.linger.months', { count: cap(countWord(Math.floor(days / 30))) });
}

/**
 * The warm one-line context under a whole-task-finish bloom: how long it lingered (the
 * dread proxy) and how many small steps it took, closing with "All done." Pure, and no
 * number is dwelt on, the tone is recognition not a stat. A same-day finish drops the
 * linger clause, and counts up to twelve are spelt out for the editorial voice.
 */
export function finishContext(input: { lingerDays: number; stepCount: number }): string {
  const { lingerDays, stepCount } = input;
  const steps =
    stepCount > 0
      ? fmt.plural(
          stepCount,
          { one: t('celebrate.finish.stepsOne'), other: t('celebrate.finish.stepsOther') },
          { count: cap(countWord(stepCount)) },
        )
      : '';
  return [lingerClause(lingerDays), steps, t('celebrate.finish.allDone')].filter(Boolean).join(' ');
}

// --- The rotating completion line (the quiet one-liner under a single-task finish) ---

// A small pool of calm, never-shame lines shown briefly when a task is completed. They rotate so the
// reassurance never feels canned, and they fold in what the separate "Good enough" button used to carry:
// the OCD release ("filed, you can stop checking") and the perfectionism release ("good enough, let it
// go"). Editorial-calm voice: no exclamation, no score, no number.
const DONE_AFFIRMATION_KEYS = [
  'celebrate.affirmations.doneIsDone',
  'celebrate.affirmations.filed',
  'celebrate.affirmations.goodEnough',
  'celebrate.affirmations.offYourPlate',
  'celebrate.affirmations.letItRest',
  'celebrate.affirmations.oneThingLighter',
  'celebrate.affirmations.didntNeedPerfect',
  'celebrate.affirmations.offTheList',
] as const;

/** The pool, resolved in the active locale. Read lazily (a getter, not a snapshot) so the locale
 *  binding at startup is honoured even if this module is imported first. */
export const DONE_AFFIRMATIONS: readonly string[] = new Proxy([] as string[], {
  get(_target, prop) {
    if (prop === 'length') return DONE_AFFIRMATION_KEYS.length;
    if (typeof prop === 'string' && /^\d+$/.test(prop)) {
      const i = Number(prop);
      return i < DONE_AFFIRMATION_KEYS.length ? t(DONE_AFFIRMATION_KEYS[i]) : undefined;
    }
    if (prop === Symbol.iterator) {
      return function* () {
        for (const key of DONE_AFFIRMATION_KEYS) yield t(key);
      };
    }
    return Reflect.get(DONE_AFFIRMATION_KEYS.map((k) => t(k)), prop);
  },
});

/** The next completion line, rotating through DONE_AFFIRMATIONS by call count, so a run of completions
 *  never repeats a line until the pool is exhausted. Pure: the caller holds the counter. */
export function doneAffirmation(n: number): string {
  const len = DONE_AFFIRMATION_KEYS.length;
  return t(DONE_AFFIRMATION_KEYS[((n % len) + len) % len]); // the double-mod keeps a negative n safe
}
