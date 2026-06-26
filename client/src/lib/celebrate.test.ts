import { describe, expect, it } from 'vitest';

import { celebrationTier, DONE_AFFIRMATIONS, doneAffirmation, finishContext } from './celebrate';

describe('celebrationTier', () => {
  it('floors a modest same-day whole-task finish at real, never the feeble quick tier', () => {
    expect(celebrationTier({ bigWin: false, lingerDays: 0, stepMinutes: 10 }).tier).toBe('real');
  });

  it('a real finish: a few days, or a real chunk of work', () => {
    expect(celebrationTier({ bigWin: false, lingerDays: 3, stepMinutes: 0 }).tier).toBe('real');
    expect(celebrationTier({ bigWin: false, lingerDays: 0, stepMinutes: 40 }).tier).toBe('real');
  });

  it('a long-dreaded finish: a big-win, a week of lingering, or a heavy task', () => {
    expect(celebrationTier({ bigWin: true, lingerDays: 0, stepMinutes: 0 }).tier).toBe('dreaded');
    expect(celebrationTier({ bigWin: false, lingerDays: 8, stepMinutes: 0 }).tier).toBe('dreaded');
    expect(celebrationTier({ bigWin: false, lingerDays: 0, stepMinutes: 120 }).tier).toBe('dreaded');
  });

  it('the bloom duration grows from real to dreaded', () => {
    const real = celebrationTier({ bigWin: false, lingerDays: 0, stepMinutes: 0 }).durationMs;
    const dreaded = celebrationTier({ bigWin: true, lingerDays: 0, stepMinutes: 0 }).durationMs;
    expect(dreaded).toBeGreaterThan(real);
  });
});

describe('finishContext', () => {
  it('drops the linger clause for a same-day finish', () => {
    expect(finishContext({ lingerDays: 0, stepCount: 4 })).toBe('Four small steps. All done.');
  });

  it('names the days for a short linger', () => {
    expect(finishContext({ lingerDays: 3, stepCount: 5 })).toBe(
      'Three days since you first wrote it down. Five small steps. All done.',
    );
  });

  it('rolls up to weeks', () => {
    expect(finishContext({ lingerDays: 21, stepCount: 6 })).toBe(
      'Three weeks since you first wrote it down. Six small steps. All done.',
    );
  });

  it('singularises a one-step finish', () => {
    expect(finishContext({ lingerDays: 0, stepCount: 1 })).toBe('One small step. All done.');
  });
});

describe('doneAffirmation (the rotating completion line)', () => {
  it('rotates through the pool in order and wraps', () => {
    expect(doneAffirmation(0)).toBe(DONE_AFFIRMATIONS[0]);
    expect(doneAffirmation(1)).toBe(DONE_AFFIRMATIONS[1]);
    expect(doneAffirmation(DONE_AFFIRMATIONS.length)).toBe(DONE_AFFIRMATIONS[0]); // wraps round
    expect(doneAffirmation(DONE_AFFIRMATIONS.length + 2)).toBe(DONE_AFFIRMATIONS[2]);
  });

  it('keeps every line calm: non-empty and no exclamation', () => {
    for (const line of DONE_AFFIRMATIONS) {
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain('!');
    }
  });
});
