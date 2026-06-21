// AI split: one run-on brain-dump (often dictated in a single breath, no pauses)
// in, the separate tasks out. Cheap (Haiku) because it runs on the friction-free
// capture path. It ONLY splits: it never sorts, reorders, or invents. /triage then
// sorts the resulting lines. Pure prompt + request/response shaping; the Worker
// handler does the fetch + CORS.

export const SPLIT_MODEL = 'claude-haiku-4-5-20251001';

// Calm, AuDHD-aware. The load-bearing rule: separate, do not invent. A spoken
// brain-dump runs several things together ("buy milk and then email Sarah and I
// need to book the dentist"); pull them apart into short tasks, in the person's
// own words, without adding anything they did not say.
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism spoke or typed a run-on brain-dump: one breath, several things in it.',
  'Split it into the separate things, one entry per distinct task.',
  "Keep each entry in the person's own words, lightly tidied (drop filler like \"um\", \"and then\", \"I need to\"), so it reads as a short task.",
  'Do not reorder, do not merge two distinct things, and never invent anything that was not said.',
  'If it is genuinely a single thing, return just that one entry.',
  'No commentary, no pep talk, no shame. Return the entries with the record_split tool.',
].join(' ');

const SPLIT_TOOL = {
  name: 'record_split',
  description: 'Return the run-on brain-dump separated into its distinct tasks.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { type: 'string', description: "One distinct task, in the person's own words, lightly tidied." },
      },
    },
    required: ['items'],
  },
} as const;

export type SplitRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that splits a run-on brain-dump. */
export function buildSplitRequest(text: string, apiKey: string): SplitRequest {
  const body = {
    model: SPLIT_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [SPLIT_TOOL],
    tool_choice: { type: 'tool', name: 'record_split' },
    messages: [{ role: 'user', content: `Split this into separate tasks:\n${text}` }],
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

/** Pull the split items out of Claude's tool-use response, defensively (never throws). */
export function parseSplitResponse(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_split'
    ) {
      const items = ((block as { input?: unknown }).input as { items?: unknown })?.items;
      if (Array.isArray(items)) {
        return items
          .filter((it): it is string => typeof it === 'string' && it.trim().length > 0)
          .map((it) => it.trim());
      }
    }
  }
  return [];
}
