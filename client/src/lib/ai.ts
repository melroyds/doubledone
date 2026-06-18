// Client side of Bite the Elephant: ask the AI backend to break a dreaded task
// into atomic, time-boxed steps. The Worker URL is public (no secret), so a
// hardcoded fallback keeps the deployed build working; EXPO_PUBLIC_AI_URL
// overrides it for local dev.

const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://doubledone-ai.melroy-a02.workers.dev';

export type DecomposedStep = { title: string; minutes: number };

/** Pull steps out of the backend response, defensively (never throws). */
export function parseSteps(data: unknown): DecomposedStep[] {
  const steps = (data as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return [];
  return steps
    .filter(
      (s): s is DecomposedStep =>
        s != null &&
        typeof (s as DecomposedStep).title === 'string' &&
        typeof (s as DecomposedStep).minutes === 'number',
    )
    .map((s) => ({ title: s.title, minutes: s.minutes }));
}

// Break it down, call 1: the three qualifying questions the AI phrases for the
// task, plus any explicit due date it spotted in the task text (pre-fills the
// date picker). The client renders the right control for each (date / spread / text).
export type Questions = { dueDate: string; spread: string; custom: string; suggestedDueDate: string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Shown if the clarify call fails or returns nothing, so the questions flow never
// blocks on the AI. Plain, calm fallbacks.
export const DEFAULT_QUESTIONS: Questions = {
  dueDate: 'By when do you want this done?',
  spread: 'Spread the steps over a few days, or do them all in one go?',
  custom: 'Anything about this that would change how to break it down?',
  suggestedDueDate: null,
};

/** Pull the questions out of the backend response, or null (never throws). */
export function parseQuestions(data: unknown): Questions | null {
  const q = (data as { questions?: unknown } | null)?.questions;
  if (q == null || typeof q !== 'object') return null;
  const o = q as Record<string, unknown>;
  if (typeof o.dueDate === 'string' && typeof o.spread === 'string' && typeof o.custom === 'string') {
    const suggested = typeof o.suggestedDueDate === 'string' && ISO_DATE.test(o.suggestedDueDate)
      ? o.suggestedDueDate
      : null;
    return { dueDate: o.dueDate, spread: o.spread, custom: o.custom, suggestedDueDate: suggested };
  }
  return null;
}

/** Ask the AI for the qualifying questions. Throws on a failed call; the caller
 *  falls back to DEFAULT_QUESTIONS so the flow always continues. */
export async function clarify(task: string): Promise<Questions> {
  const res = await fetch(`${AI_URL}/clarify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) throw new Error(`clarify failed (${res.status})`);
  return parseQuestions(await res.json()) ?? DEFAULT_QUESTIONS;
}

// The answers from the questions, passed back so the AI tailors the breakdown.
export type DecomposeContext = {
  dueDate: string | null; // ISO 'YYYY-MM-DD' or null = no deadline
  spread: 'gradual' | 'sameday';
  question: string; // the custom question that was asked
  answer: string; // the user's answer to it
};

/** Break a dreaded task into steps via the AI backend, optionally with the
 *  qualifying answers as context. Throws on a failed call. */
export async function decompose(task: string, context?: DecomposeContext): Promise<DecomposedStep[]> {
  const res = await fetch(`${AI_URL}/decompose`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task, context }),
  });
  if (!res.ok) throw new Error(`decompose failed (${res.status})`);
  return parseSteps(await res.json());
}

export type PlanItem = { id: string; dayOffset: number; reason: string };

/** Pull the re-spread plan out of the backend response, defensively (never throws). */
export function parsePlan(data: unknown): PlanItem[] {
  const plan = (data as { plan?: unknown } | null)?.plan;
  if (!Array.isArray(plan)) return [];
  return plan
    .filter(
      (p): p is PlanItem =>
        p != null &&
        typeof (p as PlanItem).id === 'string' &&
        typeof (p as PlanItem).dayOffset === 'number' &&
        typeof (p as PlanItem).reason === 'string',
    )
    .map((p) => ({ id: p.id, dayOffset: p.dayOffset, reason: p.reason }));
}

/** Ask the AI to re-spread an over-full day across the next few days. Throws on failure. */
export async function strategise(tasks: { id: string; title: string }[]): Promise<PlanItem[]> {
  const res = await fetch(`${AI_URL}/strategise`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });
  if (!res.ok) throw new Error(`strategise failed (${res.status})`);
  return parsePlan(await res.json());
}

export type Bucket = 'today' | 'later' | 'decompose';
export type TriagedItem = { text: string; bucket: Bucket };

const BUCKETS: Bucket[] = ['today', 'later', 'decompose'];

/** Pull the triaged items out of the backend response, defensively (never throws). */
export function parseTriage(data: unknown): TriagedItem[] {
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (it): it is TriagedItem =>
        it != null &&
        typeof (it as TriagedItem).text === 'string' &&
        BUCKETS.includes((it as TriagedItem).bucket),
    )
    .map((it) => ({ text: it.text, bucket: it.bucket }));
}

/** Sort a brain-dump into today / later / decompose via the AI backend. Throws on failure. */
export async function triage(lines: string[]): Promise<TriagedItem[]> {
  const res = await fetch(`${AI_URL}/triage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines }),
  });
  if (!res.ok) throw new Error(`triage failed (${res.status})`);
  return parseTriage(await res.json());
}
