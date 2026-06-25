// Client side of Bite the Elephant: ask the AI backend to break a dreaded task
// into atomic, time-boxed steps. The Worker URL is public (no secret), so a
// hardcoded fallback keeps the deployed build working; EXPO_PUBLIC_AI_URL
// overrides it for local dev.

import { authHeader } from './supabase';

const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

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

/** OCR photo capture (PREMIUM): send a base64 photo of a list to the backend and get back the task
 *  titles it read, for the brain-dump box to review. The first client AI call that sends the user's
 *  token (the /ocr route is premium-gated server-side). Returns [] on any failure, an empty read, or
 *  when signed out, so the caller shows one calm line and never a raw error. */
export async function ocr(imageBase64: string, mediaType?: string, language?: string): Promise<string[]> {
  const auth = await authHeader();
  if (!auth) return []; // signed out: no token to gate with, so nothing to send
  try {
    const res = await fetch(`${AI_URL}/ocr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ image: imageBase64, mediaType, language }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { tasks?: unknown };
    return Array.isArray(data.tasks)
      ? data.tasks.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
      : [];
  } catch {
    return [];
  }
}

/** Lookback weekly summary (PREMIUM): a finished week's titles in, one warm paragraph out, for the
 *  Lookback to display. Sends the user's token (the /lookback-summary route is premium-gated). Returns
 *  '' on any failure, an empty read, or when signed out, so the caller shows one calm line. */
export async function lookbackSummary(titles: string[], language?: string): Promise<string> {
  const auth = await authHeader();
  if (!auth) return ''; // signed out: no token to gate with
  try {
    const res = await fetch(`${AI_URL}/lookback-summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ titles, language }),
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { summary?: unknown };
    return typeof data.summary === 'string' ? data.summary.trim() : '';
  } catch {
    return '';
  }
}

export type CourseStep = { title: string; minutes: number };
export type Course = { heading: string; steps: CourseStep[] };

/** Pull the course out of the backend response, defensively (never throws). */
export function parseCourse(data: unknown): Course {
  const course = (data as { course?: unknown } | null)?.course as { heading?: unknown; steps?: unknown } | undefined;
  const heading = typeof course?.heading === 'string' ? course.heading : '';
  const steps = Array.isArray(course?.steps)
    ? course.steps
        .filter(
          (s): s is CourseStep =>
            s != null && typeof (s as CourseStep).title === 'string' && typeof (s as CourseStep).minutes === 'number',
        )
        .map((s) => ({ title: s.title, minutes: s.minutes }))
    : [];
  return { heading, steps };
}

/** Chart a course (PREMIUM): a goal in, a calm ordered list of next steps toward it out, for the user to
 *  review and accept. Sends the user's token (the /chart route is premium-gated). Returns an empty course on
 *  any failure or when signed out, so the screen shows one calm line and never a raw error. */
export async function chart(goal: string, language?: string): Promise<Course> {
  const auth = await authHeader();
  if (!auth) return { heading: '', steps: [] };
  try {
    const res = await fetch(`${AI_URL}/chart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ goal, language }),
    });
    if (!res.ok) return { heading: '', steps: [] };
    return parseCourse(await res.json());
  } catch {
    return { heading: '', steps: [] };
  }
}

export type Energy = 'low' | 'medium' | 'good';
export type OrderItem = { id: string; reason: string };

/** Pull the suggested order out of the backend response, defensively (never throws). */
export function parseOrder(data: unknown): OrderItem[] {
  const order = (data as { order?: unknown } | null)?.order;
  if (!Array.isArray(order)) return [];
  return order
    .filter((o): o is OrderItem => o != null && typeof (o as OrderItem).id === 'string' && typeof (o as OrderItem).reason === 'string')
    .map((o) => ({ id: o.id, reason: o.reason }));
}

/** Plan my order (PREMIUM): today's tasks in, a calm suggested order out, optionally matched to an energy
 *  level. Sends the user's token (the /sequence route is premium-gated). Returns [] on any failure or when
 *  signed out, so the caller shows one calm line and never reorders on an error. */
export async function sequence(tasks: { id: string; title: string }[], energy?: Energy, language?: string): Promise<OrderItem[]> {
  const auth = await authHeader();
  if (!auth) return [];
  try {
    const res = await fetch(`${AI_URL}/sequence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ tasks, energy, language }),
    });
    if (!res.ok) return [];
    return parseOrder(await res.json());
  } catch {
    return [];
  }
}

/** Shrink a dreaded task to its 2-minute version via the AI backend (the wall of awful,
 *  lowered). Throws on a failed call; the caller shows a calm error. */
export async function tiny(task: string): Promise<string> {
  const res = await fetch(`${AI_URL}/tiny`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) throw new Error(`tiny failed (${res.status})`);
  const data = (await res.json()) as { tiny?: unknown };
  return typeof data.tiny === 'string' ? data.tiny.trim() : '';
}

/** Combine several task titles into one umbrella title via the AI backend (the inverse
 *  of Break-it-down). Throws on a failed call; the caller shows a calm error and lets the
 *  user type a title instead, so the flow never blocks on the AI. */
export async function combine(titles: string[], language?: string): Promise<string> {
  const res = await fetch(`${AI_URL}/combine`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ titles, language }),
  });
  if (!res.ok) throw new Error(`combine failed (${res.status})`);
  const data = (await res.json()) as { title?: unknown };
  return typeof data.title === 'string' ? data.title.trim() : '';
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

// Delete a user's scrapbook keepsake images from R2 on account deletion. Takes the stored
// image values, keeps only the R2-served ones (data: URLs are local-only and need no purge),
// and asks the Worker to delete those keys. Best-effort: cleanup must never block a delete.
export async function purgeScrapbookImages(imageValues: string[]): Promise<void> {
  const keys = imageValues
    .map((v) => {
      const m = v.match(/\/scrapbook-img\/(.+)$/);
      return m ? decodeURIComponent(m[1]) : null;
    })
    .filter((k): k is string => k !== null);
  if (keys.length === 0) return;
  try {
    await fetch(`${AI_URL}/scrapbook/purge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keys }),
    });
  } catch {
    // best effort; the local data is wiped regardless
  }
}
