// AI triage: a brain-dump of lines in, each sorted into today / later / decompose.
// Cheap (Haiku) because it runs on the friction-free capture path. Pure prompt +
// request/response shaping; the Worker handler does the fetch + CORS.

export const TRIAGE_MODEL = 'claude-haiku-4-5-20251001';

// Calm, ADHD/autism-aware. WORDING IS A PLACEHOLDER for Melroy to tune.
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism just brain-dumped a list of things on their mind.',
  'Sort each item into one bucket so today stays small and doable:',
  '"today" for quick or time-sensitive things worth doing today,',
  '"later" for things that can wait and should move off today,',
  '"decompose" for big or vague things that need breaking down before they are doable.',
  'Keep each item text exactly as given. Return every item with the record_triage tool.',
  'No pep talk, no shame.',
].join(' ');

const TRIAGE_TOOL = {
  name: 'record_triage',
  description: 'Return each brain-dump item sorted into a bucket.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The item text, copied exactly from the input.' },
            bucket: {
              type: 'string',
              enum: ['today', 'later', 'decompose'],
              description: 'today = do it today; later = can wait; decompose = needs breaking down.',
            },
          },
          required: ['text', 'bucket'],
        },
      },
    },
    required: ['items'],
  },
} as const;

export type Bucket = 'today' | 'later' | 'decompose';
export type TriageItem = { text: string; bucket: Bucket };

export type TriageRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that triages a brain-dump. */
export function buildTriageRequest(lines: string[], apiKey: string): TriageRequest {
  const list = lines.map((l) => `- ${l}`).join('\n');
  const body = {
    model: TRIAGE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TRIAGE_TOOL],
    tool_choice: { type: 'tool', name: 'record_triage' },
    messages: [{ role: 'user', content: `Sort these brain-dump items:\n${list}` }],
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

const BUCKETS: Bucket[] = ['today', 'later', 'decompose'];

/** Pull the triaged items out of Claude's tool-use response, defensively (never throws). */
export function parseTriageResponse(data: unknown): TriageItem[] {
  if (typeof data !== 'object' || data === null) return [];
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_triage'
    ) {
      const items = ((block as { input?: unknown }).input as { items?: unknown })?.items;
      if (Array.isArray(items)) {
        return items
          .filter(
            (it): it is TriageItem =>
              it != null &&
              typeof (it as TriageItem).text === 'string' &&
              BUCKETS.includes((it as TriageItem).bucket),
          )
          .map((it) => ({ text: it.text, bucket: it.bucket }));
      }
    }
  }
  return [];
}
