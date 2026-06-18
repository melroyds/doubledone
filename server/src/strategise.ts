// Strategise: an over-full day in, a calm re-spread across the next few days out.
// Pure prompt + request/response shaping; the Worker handler does the fetch + CORS.
// Sibling of decompose.ts.

export const STRATEGISE_MODEL = 'claude-sonnet-4-6';

// Calm, never-cram. WORDING IS A PLACEHOLDER for Melroy to tune (like decompose's).
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism has put too much on today and feels underwater.',
  'Re-spread their tasks across the next several days so today becomes doable, not a wall.',
  'Keep only a calm handful on today; move the rest to the soonest sensible later day.',
  'Keep anything genuinely time-sensitive early.',
  'Return a plan with the record_plan tool: for each task, the day offset from today (0 = today, 1 = tomorrow, and so on) and a short, plain reason.',
  'No pep talk, no shame, no exclamation marks.',
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
export type StrategiseTask = { id: string; title: string };

export type StrategiseRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that re-spreads an over-full day. */
export function buildStrategiseRequest(tasks: StrategiseTask[], apiKey: string): StrategiseRequest {
  const list = tasks.map((t) => `- [${t.id}] ${t.title}`).join('\n');
  const body = {
    model: STRATEGISE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
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
