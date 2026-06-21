// The moat's completion half (client side): build the anonymised outcome payload for a
// finished decomposition step. The offered half (the decomposition itself) is logged
// server-side at /plan; this is the "did it actually get finished, and when" signal.
// Pure + unit-tested; the screen does the fetch (lib/ai reportOutcome).

import { daysBetween } from './day';
import { type Task } from './tasks';

export type OutcomePayload = { id: string; steps_total: number | null; days_elapsed: number };

/**
 * The anonymised completion-outcome ping for a finished step that came from a
 * breakdown, or null if the task is not part of one. Carries only the pseudonymous
 * decomposition id, its step total, and whole days from when the step was offered
 * (its createdAt) to completion. Never the title, never any identity.
 */
export function buildOutcome(task: Task, now: number): OutcomePayload | null {
  if (!task.decompositionId) return null;
  return {
    id: task.decompositionId,
    steps_total: task.decompositionSteps ?? null,
    days_elapsed: Math.max(0, daysBetween(new Date(task.createdAt), new Date(now))),
  };
}
