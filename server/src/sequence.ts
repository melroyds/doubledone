// Plan my order (PREMIUM): today's existing tasks in, a calm suggested SEQUENCE out, optionally matched to
// a stated energy level for right now. DISTINCT from Strategise (which re-spreads an OVER-FULL day across
// several days): this orders today's set IN PLACE, it never moves a task to another day. Pure prompt +
// shaping; the Worker handler does fetch + CORS behind requirePremium. Sibling of strategise.ts.

import { withLanguage } from './lang';

export const SEQUENCE_MODEL = 'claude-sonnet-4-6';

export type Energy = 'low' | 'medium' | 'good';

// The day's CONTEXT, asked in one calm sheet before sorting (Melroy, 2026-07-25: "Plan my day
// should take the user's feelings into account"). Deliberately three cheap facts the person
// already knows, never anything detected: there is no weather API and no location permission
// here, because "indoors or out" is what the sort actually needs and the weather was only ever
// a proxy for it. Every field is optional; omitted means "they did not say", never a default.
export type DayType = 'work' | 'off';
export type Setting = 'indoors' | 'out' | 'either';

// Calm, never-cram, energy-aware. WORDING IS A PLACEHOLDER for Melroy to tune (like strategise/decompose).
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism wants a calm order for the tasks already on their plate today.',
  "Put today's tasks into a gentle sequence: which to do first, second, and so on.",
  'Every task you were given must appear exactly once. Never drop, merge, add, or reword a task.',
  'Order in place only. Do NOT move anything to another day; this is only the order for today.',
  'When an energy level is given, match the order to it: for low energy, start with one or two small, low-friction wins; for good energy, a meatier task can go first while momentum is high; for medium, a balanced mix.',
  'When the kind of day is given, respect it: on a work day put work-shaped tasks in the working hours and personal ones around them; on a day off do not front-load work, let the day start gently.',
  'When they say where they are, group by that: put tasks that suit the stated setting earlier, and cluster errands that need going out together so they can be done in one trip. Never drop or move a task to another day for not fitting.',
  'Say nothing about their energy, their day, or their circumstances. Give the order and the reasons only, and never comment on how they feel.',
  'Return the order with the record_order tool: each task id (copied exactly) and a short, plain reason for where it sits.',
  'Keep each reason a single short, matter-of-fact sentence. No pep talk, no shame, no exclamation marks.',
].join(' ');

const ORDER_TOOL = {
  name: 'record_order',
  description: "Return today's tasks in a suggested order.",
  input_schema: {
    type: 'object',
    properties: {
      order: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The task id, copied exactly from the input.' },
            reason: { type: 'string', description: 'A short, plain reason for this position.' },
          },
          required: ['id', 'reason'],
        },
      },
    },
    required: ['order'],
  },
} as const;

export type OrderItem = { id: string; reason: string };
export type SequenceTask = { id: string; title: string };

export type SequenceRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that orders today's tasks in place. */
export function buildSequenceRequest(
  tasks: SequenceTask[],
  apiKey: string,
  energy?: Energy,
  language?: string,
  day?: DayType,
  setting?: Setting,
): SequenceRequest {
  const list = tasks.map((t) => `- [${t.id}] ${t.title}`).join('\n');
  const energyLine = energy ? `\nMy energy right now is ${energy}.` : '';
  // Each line is added ONLY when the person actually answered, so a skipped question never becomes
  // an assumption the model then plans the day around.
  const dayLine = day === 'work' ? '\nToday is a work day.' : day === 'off' ? '\nToday is a day off.' : '';
  const settingLine =
    setting === 'indoors'
      ? '\nI am staying indoors today.'
      : setting === 'out'
        ? '\nI am out and about today.'
        : setting === 'either'
          ? '\nI can do indoor or outdoor things today.'
          : '';
  const body = {
    model: SEQUENCE_MODEL,
    max_tokens: 1024,
    system: withLanguage(SYSTEM_PROMPT, language),
    tools: [ORDER_TOOL],
    tool_choice: { type: 'tool', name: 'record_order' },
    messages: [{ role: 'user', content: `Order today's tasks:\n${list}${energyLine}${dayLine}${settingLine}` }],
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

/** Pull the order out of Claude's tool-use response, defensively (never throws). */
export function parseSequenceResponse(data: unknown): OrderItem[] {
  if (typeof data !== 'object' || data === null) return [];
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_order'
    ) {
      const order = ((block as { input?: unknown }).input as { order?: unknown })?.order;
      if (Array.isArray(order)) {
        return order
          .filter(
            (o): o is OrderItem =>
              o != null && typeof (o as OrderItem).id === 'string' && typeof (o as OrderItem).reason === 'string',
          )
          .map((o) => ({ id: o.id, reason: o.reason }));
      }
    }
  }
  return [];
}

/** Sanitise an incoming energy value to a known level or undefined (never trust the client blindly). */
export function parseEnergy(value: unknown): Energy | undefined {
  return value === 'low' || value === 'medium' || value === 'good' ? value : undefined;
}
