// Break it down, call 1 of 2: before decomposing a dreaded task, ask three short
// qualifying questions so the breakdown fits the person. Cheap (Haiku). Pure
// prompt + request/response shaping; the Worker handler does the fetch + CORS.
// Sibling of decompose.ts. (Call 2 is decompose.ts, given these answers.)

import { withLanguage } from './lang';

export const CLARIFY_MODEL = 'claude-haiku-4-5-20251001';

// Calm, ADHD/autism-aware. WORDING IS A PLACEHOLDER for Melroy to tune (like the
// other prompts). Two of the three questions are required by product (the due
// date and the gradual/same-day spread); the third is the model's own best
// task-specific clarifier.
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism wants to break down a task they have been avoiding.',
  'Before breaking it down, ask three short qualifying questions whose answers make the breakdown fit them.',
  'Question one asks only by when they want it done, as a single plain deadline question a date picker can answer, for example "When do you need this done by?". The only control under question one is a date picker, so it must never be an either/or or ask them to clarify a date already in the task; it just asks for the one deadline (or none).',
  'Question two asks whether to spread the steps gradually across several days or do them all in one sitting.',
  'Question three is the single most useful question about THIS specific task, the one whose answer most changes how you would break it down.',
  'Keep every question short, plain and literal: no pep talk, no shame, no exclamation marks.',
  'Also, if the task text names an explicit calendar date (for example "by July 15 2026"), return it as suggestedDueDate in YYYY-MM-DD form; otherwise return an empty string.',
  'Return everything with the record_questions tool.',
].join(' ');

const QUESTIONS_TOOL = {
  name: 'record_questions',
  description: 'Return the three qualifying questions for the task, plus any explicit due date found in it.',
  input_schema: {
    type: 'object',
    properties: {
      dueDateQuestion: { type: 'string', description: 'A single plain "by when?" deadline question, answerable by picking one date (or none). No either/or, no clarifying sub-questions.' },
      spreadQuestion: { type: 'string', description: 'Asks gradual across days vs all in one sitting.' },
      customQuestion: { type: 'string', description: 'The most useful task-specific clarifier.' },
      suggestedDueDate: {
        type: 'string',
        description: 'An explicit calendar date named in the task as YYYY-MM-DD, or an empty string if none.',
      },
    },
    required: ['dueDateQuestion', 'spreadQuestion', 'customQuestion', 'suggestedDueDate'],
  },
} as const;

export type Questions = { dueDate: string; spread: string; custom: string; suggestedDueDate: string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ClarifyRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that asks the qualifying questions. */
export function buildClarifyRequest(task: string, apiKey: string, language?: string): ClarifyRequest {
  const body = {
    model: CLARIFY_MODEL,
    max_tokens: 512,
    system: withLanguage(SYSTEM_PROMPT, language),
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
        const suggested = typeof input.suggestedDueDate === 'string' && ISO_DATE.test(input.suggestedDueDate)
          ? input.suggestedDueDate
          : null;
        return {
          dueDate: input.dueDateQuestion,
          spread: input.spreadQuestion,
          custom: input.customQuestion,
          suggestedDueDate: suggested,
        };
      }
    }
  }
  return null;
}
