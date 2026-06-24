// Combine: the inverse of Bite-the-Elephant. Several task titles in, one umbrella title
// out, via a cheap Haiku call. Pure request/response shaping; the Worker handler
// (index.ts) does the fetch, CORS, and telemetry.

import { withLanguage } from './lang';

export const COMBINE_MODEL = 'claude-haiku-4-5-20251001';

// Calm, AuDHD-aware: literal, concrete, no shame. The job is to name the shared goal of
// several tasks in one short title, not to list them joined by "and". Wording is Melroy's
// to tune.
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism wants to treat several of their tasks as one thing.',
  'Write a single umbrella title that names what they all add up to.',
  'Make it short and concrete: start with a verb, keep it under about eight words, name ONE obvious outcome.',
  'Good: "buy milk", "buy bread", "buy eggs" becomes "Do the grocery shop".',
  'Do not just join the tasks with "and"; name the shared goal.',
  'No metaphors, idioms, pep talk, shame, or exclamation marks.',
  'Return the umbrella title with the record_umbrella tool.',
].join(' ');

const UMBRELLA_TOOL = {
  name: 'record_umbrella',
  description: 'Return the single umbrella title for the combined tasks.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The umbrella title.' },
    },
    required: ['title'],
  },
} as const;

export type CombineRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that combines task titles into one umbrella title. */
export function buildCombineRequest(titles: string[], apiKey: string, language?: string): CombineRequest {
  const body = {
    model: COMBINE_MODEL,
    max_tokens: 128,
    system: withLanguage(SYSTEM_PROMPT, language),
    tools: [UMBRELLA_TOOL],
    tool_choice: { type: 'tool', name: 'record_umbrella' },
    messages: [{ role: 'user', content: `Combine these tasks into one umbrella title:\n${titles.join('\n')}` }],
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

/** Pull the umbrella title out of Claude's tool-use response, defensively (never throws). */
export function parseCombineResponse(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_umbrella'
    ) {
      const title = ((block as { input?: unknown }).input as { title?: unknown })?.title;
      if (typeof title === 'string' && title.trim().length > 0) return title.trim();
    }
  }
  return '';
}
