// Strategise: an over-full day in, a calm re-spread across the next few days out.
// Pure prompt + request/response shaping; the Worker handler does the fetch + CORS.
// Sibling of decompose.ts.

import { withLanguage } from './lang';

export const STRATEGISE_MODEL = 'claude-sonnet-4-6';

// Calm, never-cram. Tuned 2026-06-19; the voice is still Melroy's to refine.
// The load-bearing ideas: keep only a small handful on today, and do not pile the
// rest onto one day, or you have only moved the wall, not removed it.
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism has put far too much on today and feels underwater.',
  'Re-spread their tasks across the next several days so today becomes a calm, doable handful instead of a wall.',
  'Keep only a small handful on today (day offset 0), the few things most worth doing now.',
  'Move everything else to the soonest sensible later day, but do not pile it all onto one day. Spread it so no later day becomes the new wall.',
  'Keep anything genuinely time-sensitive as early as it needs to be.',
  'A task marked "(a big one, weighs heavily)" is a lot for this person: give it room, prefer it land on a day with little else, and never stack two big ones on the same day.',
  'Every task you were given must appear in the plan exactly once. Do not drop, merge, or invent tasks.',
  'Return the plan with the record_plan tool: for each task, its day offset from today (0 = today, 1 = tomorrow, and so on) and a short, plain reason for where it landed.',
  'Keep reasons calm and matter-of-fact. No pep talk, no shame, no exclamation marks.',
].join(' ');

const PLAN_TOOL = {
  name: 'record_plan',
  description: 'Return the re-spread plan: which day each task should land on.',
  input_schema: {
    type: 'object',
    properties: {
      plan: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The task id, copied exactly from the input.' },
            dayOffset: { type: 'integer', description: 'Days from today: 0 = today, 1 = tomorrow.' },
            reason: { type: 'string', description: 'A short, plain reason for the placement.' },
          },
          required: ['id', 'dayOffset', 'reason'],
        },
      },
    },
    required: ['plan'],
  },
} as const;

export type PlanItem = { id: string; dayOffset: number; reason: string };
export type StrategiseTask = { id: string; title: string; big?: boolean };

export type StrategiseRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that re-spreads an over-full day. */
export function buildStrategiseRequest(
  tasks: StrategiseTask[],
  apiKey: string,
  language?: string,
): StrategiseRequest {
  const list = tasks.map((t) => `- [${t.id}] ${t.title}${t.big ? ' (a big one, weighs heavily)' : ''}`).join('\n');
  const body = {
    model: STRATEGISE_MODEL,
    max_tokens: 1024,
    system: withLanguage(SYSTEM_PROMPT, language),
    tools: [PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'record_plan' },
    messages: [{ role: 'user', content: `Today is over-full. Re-spread these tasks:\n${list}` }],
  };
  return {
    url: 'https://api.anthropic.com/v1/messages',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
  };
}

/** Pull the plan out of Claude's tool-use response, defensively (never throws). */
export function parseStrategiseResponse(data: unknown): PlanItem[] {
  if (typeof data !== 'object' || data === null) return [];
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_plan'
    ) {
      const plan = ((block as { input?: unknown }).input as { plan?: unknown })?.plan;
      if (Array.isArray(plan)) {
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
    }
  }
  return [];
}
