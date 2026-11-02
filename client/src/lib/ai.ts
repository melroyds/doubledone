// Client side of Bite the Elephant: ask the AI backend to break a dreaded task
// into atomic, time-boxed steps. The Worker URL is public (no secret), so a
// hardcoded fallback keeps the deployed build working; EXPO_PUBLIC_AI_URL
// overrides it for local dev.

import { isOffline, type PremiumMiss, premiumMiss } from './connection';
import { t } from './i18n-active';
import type { DayType, Setting } from './plan-day';
import { IAP_AVAILABLE, identifyPurchaser, localPremium, purchaserProof } from './purchases';
import { keepsakeKey } from './scrapbook';
import { reconcileApple } from './stripe';
import { authHeader, sessionUserId } from './supabase';

const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

/** The header an iPhone that bought Premium without an account proves it with. The same name as
 *  server/src/store-premium.ts PURCHASER_HEADER (purchases-split.test.ts reads it there). It contains "token", so
 *  Cloudflare's request log shows its value as REDACTED, never the id. */
export const PURCHASER_HEADER = 'X-Purchaser-Token';

/** The one credential a Premium AI call carries: an account's token, or an iPhone's anonymous purchase id. */
export type PremiumCredential = { kind: 'account' | 'purchase'; headers: Record<string, string> };

/**
 * The session's bearer whenever there is one, else, on an iPhone that bought Premium without an account, its
 * anonymous purchase id (lib/purchases purchaserProof). Never both: the server reads the purchase header only when
 * a request has no Authorization header at all, and a signed-in iPhone's RevenueCat id is its Supabase uuid, which
 * purchaserProof refuses, so an account can never be lent through the header. Null when there is neither (signed out
 * on the web or on Android, or before the iPhone's store has configured). Never throws.
 */
export async function premiumHeaders(): Promise<PremiumCredential | null> {
  const auth = await authHeader();
  if (auth) return { kind: 'account', headers: auth };
  const proof = await purchaserProof();
  return proof ? { kind: 'purchase', headers: { [PURCHASER_HEADER]: proof } } : null;
}

/** What a Premium AI call came back with: the route's answer (which may be empty: an empty read is still an answer),
 *  or the reason there was none (lib/connection PremiumMiss), for the screen to say honestly. */
export type PremiumResult<T> = { ok: true; value: T } | { ok: false; miss: PremiumMiss };

/** How often a refused, signed-in Premium call may try to mend the account (healAccountPremium): once a minute per
 *  app run, so a row of taps can never hammer the reconcile, which the server also limits per account. */
export const HEAL_EVERY_MS = 60_000;
let lastHealMs = Number.NEGATIVE_INFINITY;

/**
 * A signed-in Premium call the server refused (a 403) while this phone's store still shows Premium: the purchase is
 * real, but the account was never told. A Restore while signed in, a sign-in whose logIn failed or raced the store's
 * configure, and a webhook that lags a purchase all end here, and the four features refused it until a relaunch. So
 * link the store to the account once more, and ask the server to attach what the store holds (POST /apple/reconcile,
 * which grants only a real purchase, and a sandbox one only for an account on SANDBOX_GRANT_UIDS). True only when
 * it attached something, so the caller asks once more. Never throws. Never runs on the web (no store), and never for
 * a phone without an account (premiumCall calls it only for the account's credential).
 */
async function healAccountPremium(): Promise<boolean> {
  if (!IAP_AVAILABLE) return false;
  if (!(await localPremium())) return false; // the phone does not show Premium either, so the refusal is the truth
  const now = Date.now();
  if (now - lastHealMs < HEAL_EVERY_MS) return false;
  lastHealMs = now;
  const uid = await sessionUserId();
  if (!uid || !(await identifyPurchaser(uid))) return false;
  return reconcileApple();
}

/**
 * One Premium AI call, the four of them (Scan, Reflect on this week, Chart a course, Plan my day). Never throws.
 * No credential means no request at all: 'not_confirmed', or 'unavailable' when the web can tell it is offline (a
 * session whose refresh failed offline looks the same). A refusal is read from its status (lib/connection
 * premiumMiss), after one quiet mend when an account's refusal disagrees with the phone's store (healAccountPremium).
 * A 200 counts only when it is this route's answer: `parse` returns null for a body without the route's own field,
 * and a body that is not JSON at all (the Worker answers plain text on a path it does not know, so a 200 proves
 * nothing on its own) is 'unavailable' too, never an empty answer that would blame the person's input.
 */
async function premiumCall<T>(path: string, body: unknown, parse: (data: unknown) => T | null): Promise<PremiumResult<T>> {
  const cred = await premiumHeaders();
  if (!cred) return { ok: false, miss: isOffline() ? 'unavailable' : 'not_confirmed' };
  const post = async (): Promise<Response | null> => {
    try {
      return await fetch(`${AI_URL}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...cred.headers },
        body: JSON.stringify(body),
      });
    } catch {
      return null;
    }
  };
  let res = await post();
  if (res?.status === 403 && cred.kind === 'account' && (await healAccountPremium())) res = await post();
  if (!res) return { ok: false, miss: 'unavailable' };
  if (!res.ok) return { ok: false, miss: premiumMiss(res.status) };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, miss: 'unavailable' };
  }
  const value = parse(data);
  return value === null ? { ok: false, miss: 'unavailable' } : { ok: true, value };
}

/** The route's own field, or undefined when the body is not an object or lacks it. */
function field(data: unknown, name: string): unknown {
  return data !== null && typeof data === 'object' ? (data as Record<string, unknown>)[name] : undefined;
}

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
// blocks on the AI. Read from the catalogs at call time so the fallback speaks the
// user's language (the translated breakdown.defaultQuestion keys sat unwired since
// the i18n sweep, so an offline es/fr/it user got English questions).
export const defaultQuestions = (): Questions => ({
  dueDate: t('breakdown.defaultQuestion.dueDate'),
  spread: t('breakdown.defaultQuestion.spread'),
  custom: t('breakdown.defaultQuestion.custom'),
  suggestedDueDate: null,
});

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
 *  falls back to defaultQuestions() so the flow always continues. */
export async function clarify(task: string, language?: string): Promise<Questions> {
  const res = await fetch(`${AI_URL}/clarify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task, language }),
  });
  if (!res.ok) throw new Error(`clarify failed (${res.status})`);
  return parseQuestions(await res.json()) ?? defaultQuestions();
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
export async function strategise(tasks: { id: string; title: string; big?: boolean }[], language?: string): Promise<PlanItem[]> {
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

/** OCR photo capture (PREMIUM): send a base64 photo of a list to the backend and get back the task titles it read,
 *  for the brain-dump box to review. /ocr is Premium-gated on the server, so the call carries the session's token, or
 *  an iPhone's purchase proof when there is no account (premiumHeaders). An empty read is `{ ok: true, value: [] }`,
 *  and anything that is not an answer says why, so the caller never blames a photo for a refusal. Never throws. */
export async function ocr(imageBase64: string, mediaType?: string, language?: string): Promise<PremiumResult<string[]>> {
  return premiumCall('/ocr', { image: imageBase64, mediaType, language }, (data) => {
    const tasks = field(data, 'tasks');
    return Array.isArray(tasks)
      ? tasks.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
      : null;
  });
}

/** Lookback weekly summary (PREMIUM): a finished week's titles in, one warm paragraph out, for the Lookback to
 *  display. Premium-gated on the server like /ocr (premiumCall). An empty paragraph is `{ ok: true, value: '' }`.
 *  Never throws. */
export async function lookbackSummary(titles: string[], language?: string): Promise<PremiumResult<string>> {
  return premiumCall('/lookback-summary', { titles, language }, (data) => {
    const summary = field(data, 'summary');
    return typeof summary === 'string' ? summary.trim() : null;
  });
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

/** Chart a course (PREMIUM): a goal in, a calm ordered list of next steps toward it out, for the user to review and
 *  accept. Premium-gated on the server (premiumCall). A course with no steps is the AI's own empty answer, the one
 *  case where the screen may suggest rephrasing the goal. A refusal or a dropped call says why instead. Never throws. */
export async function chart(goal: string, context?: { dueDate?: string | null }, language?: string): Promise<PremiumResult<Course>> {
  return premiumCall('/chart', { goal, context, language }, (data) => (field(data, 'course') === undefined ? null : parseCourse(data)));
}

export type Energy = 'low' | 'medium' | 'good';
export type OrderItem = { id: string; reason: string };
// The day's context travels with a sequence request. Defined in lib/plan-day (pure, tested) and
// re-exported here so callers of `sequence` get the whole contract from one import.
export type { DayContext, DayType, Setting } from './plan-day';

/** Pull the suggested order out of the backend response, defensively (never throws). */
export function parseOrder(data: unknown): OrderItem[] {
  const order = (data as { order?: unknown } | null)?.order;
  if (!Array.isArray(order)) return [];
  return order
    .filter((o): o is OrderItem => o != null && typeof (o as OrderItem).id === 'string' && typeof (o as OrderItem).reason === 'string')
    .map((o) => ({ id: o.id, reason: o.reason }));
}

/** Plan my order (PREMIUM): today's tasks in, a calm suggested order out, optionally matched to an energy level.
 *  Premium-gated on the server (premiumCall). An empty order is `{ ok: true, value: [] }`, and a miss says why, so the
 *  caller shows one calm line and never reorders on an error. Never throws. */
export async function sequence(
  tasks: { id: string; title: string }[],
  energy?: Energy,
  language?: string,
  day?: DayType,
  setting?: Setting,
): Promise<PremiumResult<OrderItem[]>> {
  return premiumCall('/sequence', { tasks, energy, language, day, setting }, (data) =>
    Array.isArray(field(data, 'order')) ? parseOrder(data) : null,
  );
}

/** Energy matching: today's open tasks plus how much the person has right now, ONE pick back
 *  with a warm line on why it fits. Propose-only (the user chooses to start it). Returns null
 *  on any failure so the caller shows one calm line. The freemium meter lives in lib/energy.ts
 *  and is the caller's job BEFORE calling, so a refused gate never spends a network call. */
export async function matchEnergy(
  tasks: { id: string; title: string; big?: boolean }[],
  energy: Energy,
  language?: string,
): Promise<{ id: string; line: string } | null> {
  try {
    const res = await fetch(`${AI_URL}/energy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tasks, energy, language }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: unknown; line?: unknown };
    if (typeof data.id !== 'string' || !tasks.some((t) => t.id === data.id)) return null;
    return { id: data.id, line: typeof data.line === 'string' ? data.line : '' };
  } catch {
    return null;
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
  // Signed in, the token rides along so the Worker tags the keepsake as this person's: only they can then
  // purge it (server/src/scrapbook-purge.ts). Signed out, the keepsake is made exactly as before.
  const auth = await authHeader();
  const res = await fetch(`${AI_URL}/scrapbook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ?? {}) },
    body: JSON.stringify({ titles }),
  });
  if (!res.ok) throw new Error(`scrapbook failed (${res.status})`);
  const data = (await res.json()) as { image?: unknown; caption?: unknown };
  if (typeof data.image !== 'string' || data.image.length === 0) throw new Error('no image');
  return { image: data.image, caption: typeof data.caption === 'string' ? data.caption : '' };
}

export const PURGE_RETRY_MS = 1500;
// The most keys the Worker deletes in one call (server/src/scrapbook-purge.ts MAX_KEYS); it drops the rest silently.
export const PURGE_BATCH = 200;

// On account deletion: delete the server's custody of any AI connector (MCP over OAuth) for this account,
// the encrypted refresh token and the sign-in email it was kept with, through the same POST /mcp/disconnect
// Settings' kill switch uses. `auth` is the token captured BEFORE the delete (it signs out at its end).
// Best-effort and silent, like the image purge: cleanup must never block or undo a delete.
export async function dropAiConnectors(auth: Record<string, string> | null): Promise<void> {
  if (!auth) return;
  try {
    await fetch(`${AI_URL}/mcp/disconnect`, { method: 'POST', headers: auth });
  } catch {
    // best effort
  }
}

// Delete a user's scrapbook keepsake images from R2 on account deletion. Takes the stored
// image values, keeps only the R2-served ones (data: URLs are local-only and need no purge),
// and asks the Worker to delete those keys. Best-effort: cleanup must never block a delete.
// `auth` is the token captured BEFORE the account went (deleteAccount signs out at its end); a tagged
// image is deleted only for its verified owner. Omitted, the current session's is used.
// Each picture is asked for once (the device's list and the account's rows overlap), in batches the Worker
// accepts, and a malformed address is skipped rather than thrown, so the wipe that follows always runs.
export async function purgeScrapbookImages(imageValues: string[], auth?: Record<string, string> | null): Promise<void> {
  const keys = [...new Set(imageValues.map(keepsakeKey).filter((k): k is string => k !== null))];
  if (keys.length === 0) return;
  try {
    const headers = auth === undefined ? await authHeader() : auth;
    for (let i = 0; i < keys.length; i += PURGE_BATCH) {
      const batch = keys.slice(i, i + PURGE_BATCH);
      const send = () =>
        fetch(`${AI_URL}/scrapbook/purge`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(headers ?? {}) },
          body: JSON.stringify({ keys: batch }),
        });
      const res = await send();
      // A refusal can be a verifier blip on the Worker (it reads every failure as "not you"): one retry with
      // the same captured token, since the keys are wiped from this device straight after.
      const reply = res.ok ? ((await res.json().catch(() => null)) as { refused?: unknown } | null) : null;
      if (typeof reply?.refused === 'number' && reply.refused > 0) {
        await new Promise((r) => setTimeout(r, PURGE_RETRY_MS));
        await send();
      }
    }
  } catch {
    // best effort; the local data is wiped regardless
  }
}
