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
export async function clarify(task: string, language?: string): Promise<Questions> {
  const res = await fetch(`${AI_URL}/clarify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task, language }),
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
export async function decompose(task: string, context?: DecomposeContext, language?: string): Promise<DecomposedStep[]> {
  const res = await fetch(`${AI_URL}/decompose`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task, context, language }),
  });
  if (!res.ok) throw new Error(`decompose failed (${res.status})`);
  return parseSteps(await res.json());
}

// Break it down, phased: a roadmap of phases (milestones) plus the actionable
// steps for phase one only. A small task comes back as a single phase (so the
// flow behaves like a flat decompose); a big one comes back as several.
export type Phase = { title: string; focus: string };
export type PlanResult = { phases: Phase[]; firstSteps: DecomposedStep[] };

/** Pull the plan out of the backend response, defensively (never throws). */
export function parsePlanResult(data: unknown): PlanResult {
  const plan = (data as { plan?: unknown } | null)?.plan as { phases?: unknown; firstSteps?: unknown } | undefined;
  const phases = Array.isArray(plan?.phases)
    ? plan.phases
        .filter(
          (p): p is Phase =>
            p != null && typeof (p as Phase).title === 'string' && typeof (p as Phase).focus === 'string',
        )
        .map((p) => ({ title: p.title, focus: p.focus }))
    : [];
  const firstSteps = Array.isArray(plan?.firstSteps)
    ? plan.firstSteps
        .filter(
          (s): s is DecomposedStep =>
            s != null && typeof (s as DecomposedStep).title === 'string' && typeof (s as DecomposedStep).minutes === 'number',
        )
        .map((s) => ({ title: s.title, minutes: s.minutes }))
    : [];
  return { phases, firstSteps };
}

/** Plan a breakdown into phases plus phase-one steps. Throws on a failed call. */
export async function plan(
  task: string,
  context?: DecomposeContext,
  language?: string,
  decompositionId?: string,
): Promise<PlanResult> {
  const res = await fetch(`${AI_URL}/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task, context, language, decompositionId }),
  });
  if (!res.ok) throw new Error(`plan failed (${res.status})`);
  return parsePlanResult(await res.json());
}

/** Report an anonymised completion outcome (the moat's completion half) to the Worker.
 *  Fire-and-forget: never throws, never blocks the UI. No identity, just the
 *  decomposition id and timing. */
export async function reportOutcome(payload: { id: string; steps_total: number | null; days_elapsed: number }): Promise<void> {
  try {
    await fetch(`${AI_URL}/outcome`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // best effort, never surfaced
  }
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
export async function strategise(tasks: { id: string; title: string }[], language?: string): Promise<PlanItem[]> {
  const res = await fetch(`${AI_URL}/strategise`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tasks, language }),
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

/** Split a run-on brain-dump (often dictated in one breath) into separate task
 *  strings via the AI backend. It only splits, never sorts; /triage sorts after.
 *  Throws on a failed call. Returns the trimmed, non-empty items. */
export async function split(text: string): Promise<string[]> {
  const res = await fetch(`${AI_URL}/split`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`split failed (${res.status})`);
  const data = (await res.json()) as { items?: unknown };
  return Array.isArray(data.items)
    ? data.items.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
    : [];
}

// The AI scrapbook: a finished week's titles in, a calm keepsake image (a base64
// data URL) plus the scene caption out. Generated entirely on Workers AI; see the
// Worker's /scrapbook route. Throws on a failed call; the caller shows a calm error.
export type ScrapbookResult = { image: string; caption: string };

export async function makeScrapbook(titles: string[]): Promise<ScrapbookResult> {
  const res = await fetch(`${AI_URL}/scrapbook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ titles }),
  });
  if (!res.ok) throw new Error(`scrapbook failed (${res.status})`);
  const data = (await res.json()) as { image?: unknown; caption?: unknown };
  if (typeof data.image !== 'string' || data.image.length === 0) throw new Error('no image');
  return { image: data.image, caption: typeof data.caption === 'string' ? data.caption : '' };
}
