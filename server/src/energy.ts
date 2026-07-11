// AI energy matching: today's open tasks in plus how much the person has right now, ONE
// task out with a short warm line on why it fits. The Focus-mode question ("what should I
// even start?") answered by the AI instead of the user having to decide, which is exactly
// the decision that costs the most on a low day. Cheap (Haiku), single pick, propose-only:
// the client shows the pick and the user chooses to start it, nothing is reordered or
// added. WORDING IS A PLACEHOLDER for Melroy to tune (like strategise/decompose/sequence).
import { withLanguage } from './lang';

export const ENERGY_MODEL = 'claude-haiku-4-5-20251001';

// Bound the payload defensively: more than enough for any real day, small enough that a
// hostile payload cannot run up input tokens (the route also caps body size and rate).
const MAX_TASKS = 50;
const MAX_TITLE = 200;

export type EnergyLevel = 'low' | 'medium' | 'good';

export type EnergyTask = { id: string; title: string; big?: boolean };

const SYSTEM_PROMPT = [
  'Someone with ADHD is choosing what to do next and has told you how much energy they have right now.',
  'From their list of today\'s open tasks, pick the ONE task that best fits that energy.',
  'Low energy: the smallest, most mechanical, least decision-heavy task, an easy win to get moving.',
  'Medium energy: a solid middle-weight task, real progress without needing a deep dive.',
  'Good energy: the most demanding or most dreaded task (ones marked big count double), while the fuel is there.',
  'Return the chosen task\'s id exactly as given, plus one short warm line (under 15 words) on why it fits right now.',
  'The line must never shame, never mention what they have not done, and never mention energy levels clinically.',
  'Use the record_pick tool.',
].join(' ');

const PICK_TOOL = {
  name: 'record_pick',
  description: 'Return the one task that fits, by id, with a short warm line.',
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The chosen task id, exactly as given in the list.' },
      line: { type: 'string', description: 'One short warm line (under 15 words) on why this fits right now.' },
    },
    required: ['id', 'line'],
  },
} as const;

export type EnergyRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Sanitise the incoming energy level, defaulting junk to 'medium' (never trust the client). */
export function parseEnergyLevel(raw: unknown): EnergyLevel {
  return raw === 'low' || raw === 'medium' || raw === 'good' ? raw : 'medium';
}

/** Sanitise the incoming task list: well-formed {id, title} only, bounded, titles trimmed. */
export function parseEnergyTasks(raw: unknown): EnergyTask[] {
  if (!Array.isArray(raw)) return [];
  const out: EnergyTask[] = [];
  for (const v of raw) {
    if (v == null || typeof v !== 'object') continue;
    const { id, title, big } = v as Record<string, unknown>;
    if (typeof id !== 'string' || id.length === 0 || typeof title !== 'string' || title.trim().length === 0) continue;
    out.push({ id, title: title.trim().slice(0, MAX_TITLE), ...(big === true ? { big: true } : {}) });
    if (out.length >= MAX_TASKS) break;
  }
  return out;
}

/** Build the Anthropic Messages API request that picks the one task fitting the energy. */
export function buildEnergyRequest(tasks: EnergyTask[], energy: EnergyLevel, apiKey: string, language?: string): EnergyRequest {
  const list = tasks.map((t) => `${t.id}: ${t.title}${t.big ? ' (big)' : ''}`).join('\n');
  const body = {
    model: ENERGY_MODEL,
    max_tokens: 256,
    system: withLanguage(SYSTEM_PROMPT, language),
    tools: [PICK_TOOL],
    tool_choice: { type: 'tool', name: 'record_pick' },
    messages: [{ role: 'user', content: `My energy right now is ${energy}. Today's open tasks:\n${list}` }],
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

/**
 * Pull the pick out of Claude's tool-use response, defensively (never throws). The id must
 * be one of the ids that were actually sent, so a hallucinated id can never reach the
 * client; returns null when there is no usable pick.
 */
export function parseEnergyResponse(data: unknown, validIds: ReadonlySet<string>): { id: string; line: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_pick'
    ) {
      const input = (block as { input?: unknown }).input as { id?: unknown; line?: unknown } | undefined;
      const id = typeof input?.id === 'string' ? input.id : '';
      const line = typeof input?.line === 'string' ? input.line.trim() : '';
      if (id && validIds.has(id)) return { id, line };
    }
  }
  return null;
}
