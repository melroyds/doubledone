// "Chart a course" (PREMIUM): a goal in, a calm ordered list of the next concrete steps toward it out,
// plus a one-line "where this is heading". DISTINCT from Break-it-down (which decomposes ONE task): this
// plans toward a GOAL over time. The accepted steps become FLAT one-off tasks in the single Today/backlog,
// never a project or a workspace (the spine rejects multiple projects). Token-heavy (Sonnet reasons about
// sequencing). Pure prompt + shaping; the Worker handler does fetch + CORS behind requirePremium. Sibling
// of plan.ts.

import { withLanguage } from './lang';

export const CHART_MODEL = 'claude-sonnet-4-6';

// Calm, AuDHD-aware. WORDING IS A PLACEHOLDER for Melroy to tune (like plan / strategise / decompose).
export const SYSTEM_PROMPT = [
  'Someone with ADHD and autism has named a goal or outcome they want to move toward.',
  'Propose a calm, ordered list of the next 3 to 7 concrete actions that move them toward it, soonest first.',
  'These are the NEXT steps, not the whole journey: enough to start and build momentum, never an exhaustive plan.',
  'Write each step as a short command: start with a verb, keep it under about eight words, one concrete action with an obvious finish.',
  'No vague verbs like "organise", "plan", or "research"; no metaphors, no pep talk, no shame, no exclamation marks.',
  'Make the first step almost embarrassingly small, about two minutes.',
  'Give each step an honest estimate in whole minutes.',
  'Also give a short, plain one-line "heading": where this set of steps is taking them. Calm, no hype.',
  'Return everything with the record_course tool.',
].join(' ');

const COURSE_TOOL = {
  name: 'record_course',
  description: 'Return where this is heading plus the next concrete steps toward the goal.',
  input_schema: {
    type: 'object',
    properties: {
      heading: { type: 'string', description: 'One calm line on where these steps are heading.' },
      steps: {
        type: 'array',
        description: 'The next 3-7 concrete actions, soonest first.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'One short, concrete action, verb-first.' },
            minutes: { type: 'integer', description: 'Estimated minutes for this step.' },
          },
          required: ['title', 'minutes'],
        },
      },
    },
    required: ['heading', 'steps'],
  },
} as const;

export type CourseStep = { title: string; minutes: number };
export type Course = { heading: string; steps: CourseStep[] };

export type ChartContext = { dueDate?: string | null; spread?: 'gradual' | 'sameday' };

export type ChartRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

function buildUserMessage(goal: string, context?: ChartContext): string {
  const lines = [`My goal: ${goal}`];
  if (context?.dueDate) lines.push(`I would like to be there by ${context.dueDate}.`);
  return lines.join('\n');
}

/** Build the Anthropic Messages API request that charts the next steps toward a goal. */
export function buildChartRequest(goal: string, apiKey: string, context?: ChartContext, language?: string): ChartRequest {
  const body = {
    model: CHART_MODEL,
    max_tokens: 1024,
    system: withLanguage(SYSTEM_PROMPT, language),
    tools: [COURSE_TOOL],
    tool_choice: { type: 'tool', name: 'record_course' },
    messages: [{ role: 'user', content: buildUserMessage(goal, context) }],
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

/** Pull the course out of Claude's tool-use response, defensively (never throws). */
export function parseChartResponse(data: unknown): Course {
  const empty: Course = { heading: '', steps: [] };
  if (typeof data !== 'object' || data === null) return empty;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return empty;
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_course'
    ) {
      const input = (block as { input?: unknown }).input as { heading?: unknown; steps?: unknown } | undefined;
      const heading = typeof input?.heading === 'string' ? input.heading : '';
      const steps = Array.isArray(input?.steps)
        ? input.steps
            .filter(
              (s): s is CourseStep =>
                s != null && typeof (s as CourseStep).title === 'string' && typeof (s as CourseStep).minutes === 'number',
            )
            .map((s) => ({ title: s.title, minutes: s.minutes }))
        : [];
      return { heading, steps };
    }
  }
  return empty;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse the optional chart context from the request body, defensively. Keeps a valid ISO dueDate, else null. */
export function parseChartContext(value: unknown): ChartContext | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const o = value as Record<string, unknown>;
  const dueDate = typeof o.dueDate === 'string' && ISO_DATE.test(o.dueDate) ? o.dueDate : null;
  return { dueDate };
}
