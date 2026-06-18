// Break it down, call 1 of 2: before decomposing a dreaded task, ask three short
// qualifying questions so the breakdown fits the person. Cheap (Haiku). Pure
// prompt + request/response shaping; the Worker handler does the fetch + CORS.
// Sibling of decompose.ts. (Call 2 is decompose.ts, given these answers.)

export const CLARIFY_MODEL = 'claude-haiku-4-5-20251001';

// Calm, ADHD/autism-aware. WORDING IS A PLACEHOLDER for Melroy to tune (like the
// other prompts). Two of the three questions are required by product (the due
// date and the gradual/same-day spread); the third is the model's own best
// task-specific clarifier.
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism wants to break down a task they have been avoiding.',
  'Before breaking it down, ask three short qualifying questions whose answers make the breakdown fit them.',
  'Question one asks by when they want it done (the due date).',
  'Question two asks whether to spread the steps gradually across several days or do them all in one sitting.',
  'Question three is the single most useful question about THIS specific task, the one whose answer most changes how you would break it down.',
  'Keep every question short, plain and literal: no pep talk, no shame, no exclamation marks.',
  'Return all three with the record_questions tool.',
].join(' ');

const QUESTIONS_TOOL = {
  name: 'record_questions',
  description: 'Return the three qualifying questions for the task.',
  input_schema: {
    type: 'object',
    properties: {
      dueDateQuestion: { type: 'string', description: 'Asks by when they want it done.' },
      spreadQuestion: { type: 'string', description: 'Asks gradual across days vs all in one sitting.' },
      customQuestion: { type: 'string', description: 'The most useful task-specific clarifier.' },
    },
    required: ['dueDateQuestion', 'spreadQuestion', 'customQuestion'],
  },
} as const;

export type Questions = { dueDate: string; spread: string; custom: string };

export type ClarifyRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that asks the qualifying questions. */
export function buildClarifyRequest(task: string, apiKey: string): ClarifyRequest {
  const body = {
    model: CLARIFY_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [QUESTIONS_TOOL],
    tool_choice: { type: 'tool', name: 'record_questions' },
    messages: [{ role: 'user', content: `The task I want to break down: ${task}` }],
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

/** Pull the three questions out of Claude's tool-use response, or null (never throws). */
export function parseClarifyResponse(data: unknown): Questions | null {
  if (typeof data !== 'object' || data === null) return null;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_questions'
    ) {
      const input = (block as { input?: unknown }).input as Record<string, unknown> | undefined;
      if (
        input &&
        typeof input.dueDateQuestion === 'string' &&
        typeof input.spreadQuestion === 'string' &&
        typeof input.customQuestion === 'string'
      ) {
        return { dueDate: input.dueDateQuestion, spread: input.spreadQuestion, custom: input.customQuestion };
      }
    }
  }
  return null;
}
