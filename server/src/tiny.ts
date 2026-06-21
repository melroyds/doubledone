// AI "make it tiny": one dreaded task in, a single 2-minute starter version out, so the
// wall of awful drops below the line to begin. Cheap (Haiku), on the friction-free path.
// It only reframes to a tiny first action; the real task is kept client-side as the
// silent parent (Cluster B). Pure prompt + request/response shaping; the Worker does I/O.

export const TINY_MODEL = 'claude-haiku-4-5-20251001';

export const SYSTEM_PROMPT = [
  'Someone with ADHD is frozen at the start of a task: it feels too big or too vague to begin.',
  'Shrink it to a single 2-minute version, the smallest concrete first action that gets them moving.',
  'It must be doable in about two minutes, concrete, and obviously a starting point, not the whole task.',
  'For example, "Do my taxes" becomes "Find last year\'s tax file and open it", and "Clean the kitchen" becomes "Put one dish in the dishwasher".',
  'Return just the tiny action, plainly, with no preamble, using the record_tiny tool.',
].join(' ');

const TINY_TOOL = {
  name: 'record_tiny',
  description: 'Return the 2-minute starter version of the task.',
  input_schema: {
    type: 'object',
    properties: { tiny: { type: 'string', description: 'The 2-minute first action, in plain words.' } },
    required: ['tiny'],
  },
} as const;

export type TinyRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that shrinks a task to its 2-minute version. */
export function buildTinyRequest(task: string, apiKey: string): TinyRequest {
  const body = {
    model: TINY_MODEL,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    tools: [TINY_TOOL],
    tool_choice: { type: 'tool', name: 'record_tiny' },
    messages: [{ role: 'user', content: `Shrink this to a 2-minute first step:\n${task}` }],
  };
  return {
    url: 'https://api.anthropic.com/v1/messages',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    },
  };
}

/** Pull the tiny action out of Claude's tool-use response, defensively (never throws). */
export function parseTinyResponse(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_tiny'
    ) {
      const tiny = ((block as { input?: unknown }).input as { tiny?: unknown })?.tiny;
      if (typeof tiny === 'string' && tiny.trim().length > 0) return tiny.trim();
    }
  }
  return '';
}
