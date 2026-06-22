// The whole-task-finish celebration tier (the "Dusk, evolved" redesign, slice 3). Pure:
// from the existing big-win signal, how long the task lingered (the dread proxy), and its
// complexity (decomposition minutes), pick how big the bloom should be. Three calm tiers,
// no points, and no number is ever shown to the user. Reduced motion keeps the held title
// and the warm colour; only the bloom's movement is removed (handled in the component).

import { motion } from '../constants/motion';

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
  if (lingerDays >= 2 || stepMinutes >= 30) {
    return { tier: 'real', durationMs: motion.celebration.real };
  }
  return { tier: 'quick', durationMs: motion.celebration.quick };
}

// --- The warm context line under a whole-task-finish bloom ---

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// How long the task lingered, humanised (the dread proxy). Empty for a same-day finish.
function lingerClause(days: number): string {
  if (days < 1) return '';
  if (days === 1) return 'A day since you first wrote it down.';
  if (days < 7) return `${cap(countWord(days))} days since you first wrote it down.`;
  if (days < 14) return 'A week since you first wrote it down.';
  if (days < 31) return `${cap(countWord(Math.floor(days / 7)))} weeks since you first wrote it down.`;
  if (days < 62) return 'A month since you first wrote it down.';
  return `${cap(countWord(Math.floor(days / 30)))} months since you first wrote it down.`;
}

/**
 * The warm one-line context under a whole-task-finish bloom: how long it lingered (the
 * dread proxy) and how many small steps it took, closing with "All done." Pure, and no
 * number is dwelt on, the tone is recognition not a stat. A same-day finish drops the
 * linger clause, and counts up to twelve are spelt out for the editorial voice.
 */
export function finishContext(input: { lingerDays: number; stepCount: number }): string {
  const { lingerDays, stepCount } = input;
  const steps = stepCount > 0 ? `${cap(countWord(stepCount))} small ${stepCount === 1 ? 'step' : 'steps'}.` : '';
  return [lingerClause(lingerDays), steps, 'All done.'].filter(Boolean).join(' ');
}
