// Break it down, the phased planner. For a small task it returns a single phase
// with its steps (so the flow behaves like a flat decompose). For a big, long-
// horizon task it returns a short roadmap of phases (milestones) PLUS the
// actionable steps for phase one only, so Today stays small while the deadline is
// honoured; later phases are broken down as they approach. Sonnet (it reasons
// about staging). Pure prompt + shaping; the Worker handler does fetch + CORS.

import { withLanguage } from './lang';

export const PLAN_MODEL = 'claude-sonnet-4-6';

// Calm, AuDHD-aware. WORDING IS A PLACEHOLDER for Melroy to tune (like the others).
export const SYSTEM_PROMPT = [
  'You help someone with ADHD and autism break down a task they have been avoiding.',
  'First decide how many phases it needs.',
  'Use ONE phase for a task that can be finished in a sitting or a few days.',
  'Use two to five phases ONLY for a big, multi-stage task with a distant deadline; each phase is a milestone on the way there, in order.',
  'For each phase give a short title (verb-first, the milestone) and a one-line focus.',
  'Then give the concrete first steps for PHASE ONE ONLY: the actions to start now.',
  'Write each step as a short command: start with a verb, keep it under about eight words, name one concrete action with an obvious finish.',
  'Be specific but brief. No vague verbs like "organise", "plan", or "deal with"; no metaphors, pep talk, shame, or exclamation marks.',
  'Make the first step almost embarrassingly small, about two minutes.',
  'Give each step an honest estimate in whole minutes.',
  'Return everything with the record_plan tool.',
].join(' ');

const PLAN_TOOL = {
  name: 'record_plan',
  description: 'Return the phases (a roadmap) and the first phase\'s concrete steps.',
  input_schema: {
    type: 'object',
    properties: {
      phases: {
        type: 'array',
        description: 'Ordered phases (1 for a small task, 2-5 for a big one).',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short milestone title, verb-first.' },
            focus: { type: 'string', description: 'One line on what this phase is about.' },
          },
          required: ['title', 'focus'],
        },
      },
      firstSteps: {
        type: 'array',
        description: "Concrete steps for phase one only.",
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'One short, concrete action.' },
            minutes: { type: 'integer', description: 'Estimated minutes for this step.' },
          },
          required: ['title', 'minutes'],
        },
      },
    },
    required: ['phases', 'firstSteps'],
  },
} as const;

export type Phase = { title: string; focus: string };
export type Step = { title: string; minutes: number };
export type Plan = { phases: Phase[]; firstSteps: Step[] };

// Reuse the decompose context shape (the qualifying answers).
export type PlanContext = {
  dueDate?: string | null;
  spread?: 'gradual' | 'sameday';
  question?: string;
  answer?: string;
};

export type PlanRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

function buildUserMessage(task: string, context?: PlanContext): string {
  const lines = [`The task I am dreading: ${task}`];
  if (context) {
    if (context.dueDate) lines.push(`I want it done by ${context.dueDate}.`);
    else lines.push('There is no hard deadline.');
    if (context.spread === 'gradual') lines.push('Pace it gradually across the time available.');
    else if (context.spread === 'sameday') lines.push('I plan to work in intensive blocks.');
    if (context.question && context.answer) lines.push(`${context.question} ${context.answer}`);
  }
  return lines.join('\n');
}

/** Build the Anthropic Messages API request that plans the phases + phase-one steps. */
export function buildPlanRequest(
  task: string,
  apiKey: string,
  context?: PlanContext,
  language?: string,
): PlanRequest {
  const body = {
    model: PLAN_MODEL,
    max_tokens: 1024,
    system: withLanguage(SYSTEM_PROMPT, language),
    tools: [PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'record_plan' },
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

/** Pull the plan out of Claude's tool-use response, defensively (never throws). */
export function parsePlanResponse(data: unknown): Plan {
  const empty: Plan = { phases: [], firstSteps: [] };
  if (typeof data !== 'object' || data === null) return empty;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return empty;
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_plan'
    ) {
      const input = (block as { input?: unknown }).input as { phases?: unknown; firstSteps?: unknown } | undefined;
      const phases = Array.isArray(input?.phases)
        ? input.phases
            .filter(
              (p): p is Phase =>
                p != null && typeof (p as Phase).title === 'string' && typeof (p as Phase).focus === 'string',
            )
            .map((p) => ({ title: p.title, focus: p.focus }))
        : [];
      const firstSteps = Array.isArray(input?.firstSteps)
        ? input.firstSteps
            .filter(
              (s): s is Step =>
                s != null && typeof (s as Step).title === 'string' && typeof (s as Step).minutes === 'number',
            )
            .map((s) => ({ title: s.title, minutes: s.minutes }))
        : [];
      return { phases, firstSteps };
    }
  }
  return empty;
}
