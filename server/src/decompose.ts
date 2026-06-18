// Bite the Elephant: the prompt plus the request/response shaping for Claude.
// Pure and tested. The Worker handler (index.ts) does the actual fetch and CORS.

export const DECOMPOSE_MODEL = 'claude-sonnet-4-6';

// Calm, AuDHD-aware (ADHD + autism, often both): literal, concrete, no shame.
// Tuned by Melroy from the original placeholder (see decision-log).
export const SYSTEM_PROMPT = [
  'You help someone with ADHD and autism, often both, start a task they have been avoiding.',
  'Break the task into 3 to 6 concrete, physical steps, in the order you would actually do them.',
  'Each step is one observable action with an obvious finish.',
  'Never use vague steps like "organise" or "plan"; say the exact thing to do.',
  'Write literally and plainly: no metaphors, idioms, pep talk, shame, or exclamation marks.',
  'The first step must be almost embarrassingly small, about two minutes, usually getting the thing or the tools physically in front of you, to beat task-initiation paralysis.',
  'Give each step an honest estimate in whole minutes.',
  'Do not comment on why the task was not done. Just give the steps.',
  'Return the steps with the record_steps tool.',
].join(' ');

const STEPS_TOOL = {
  name: 'record_steps',
  description: 'Return the ordered, time-boxed steps for the dreaded task.',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'One concrete action.' },
            minutes: { type: 'integer', description: 'Estimated minutes for this step.' },
          },
          required: ['title', 'minutes'],
        },
      },
    },
    required: ['steps'],
  },
} as const;

export type Step = { title: string; minutes: number };

// The answers from the qualifying questions (clarify.ts), used to shape the
// breakdown. All optional: the endpoint still works with just a task.
export type DecomposeContext = {
  dueDate?: string | null; // ISO 'YYYY-MM-DD' or null = no deadline
  spread?: 'gradual' | 'sameday';
  question?: string; // the task-specific question that was asked
  answer?: string; // the user's answer to it
};

export type DecomposeRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

// Fold the qualifying answers into the user message so the model tailors the
// steps (granularity, what the answer reveals). Dates themselves are computed
// client-side (lib/spread); this is only to improve the breakdown.
function buildUserMessage(task: string, context?: DecomposeContext): string {
  const lines = [`The task I am dreading: ${task}`];
  if (context) {
    if (context.dueDate) lines.push(`I want it done by ${context.dueDate}.`);
    else lines.push('There is no hard deadline.');
    if (context.spread === 'gradual') lines.push('Pace the steps gradually across the days available.');
    else if (context.spread === 'sameday') lines.push('I plan to do all the steps in one sitting.');
    if (context.question && context.answer) lines.push(`${context.question} ${context.answer}`);
  }
  return lines.join('\n');
}

/** Build the Anthropic Messages API request that decomposes a dreaded task. */
export function buildDecomposeRequest(task: string, apiKey: string, context?: DecomposeContext): DecomposeRequest {
  const body = {
    model: DECOMPOSE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [STEPS_TOOL],
    tool_choice: { type: 'tool', name: 'record_steps' },
    messages: [{ role: 'user', content: buildUserMessage(task, context) }],
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

/** Pull the steps out of Claude's tool-use response, defensively (never throws). */
export function parseDecomposeResponse(data: unknown): Step[] {
  if (typeof data !== 'object' || data === null) return [];
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_steps'
    ) {
      const steps = ((block as { input?: unknown }).input as { steps?: unknown })?.steps;
      if (Array.isArray(steps)) {
        return steps
          .filter(
            (s): s is Step =>
              s != null &&
              typeof (s as Step).title === 'string' &&
              typeof (s as Step).minutes === 'number',
          )
          .map((s) => ({ title: s.title, minutes: s.minutes }));
      }
    }
  }
  return [];
}
