// OCR photo capture: the prompt plus the request/response shaping for Claude vision.
// Pure and tested. The Worker handler (index.ts) does the fetch, the premium gate, and CORS.
// Reads a photo of a to-do list (a sticky note, a whiteboard, a notebook, a printed or
// handwritten list) and returns the task titles, for the user to review and edit in the
// brain-dump box before anything is committed. Nothing here is auto-added to Today.

import { withLanguage } from './lang';

// Haiku, not Sonnet: OCR is transcription, not reasoning, so Haiku reads a list as well at about
// a third the cost (~$0.0025 a capture, well under the shared $25/mo Anthropic cap). Sonnet is a
// one-line bump later, on data, if quality disappoints. Verify the id before deploy: model ids
// deprecate on a date (see the Workers-AI gotcha in CLAUDE.md for the same lesson).
export const OCR_MODEL = 'claude-haiku-4-5-20251001';

// Calm, AuDHD-aware. The rule that matters most here: extract what is written, never invent. A
// hallucinated task on someone's list is worse than a missed one. It erodes trust, and for a
// rejection-sensitive audience a phantom chore reads as shame. Skip the illegible, do not guess.
export const SYSTEM_PROMPT = [
  'You read a photo of a to-do list and extract the tasks written on it.',
  'The photo may be a sticky note, a whiteboard, a notebook, or a printed or handwritten list.',
  'Return each distinct task as a short, clear title, in the order it appears.',
  'Copy what is written. Do NOT invent, infer, merge, or add tasks that are not on the list.',
  'Tidy obvious transcription noise (a leading bullet, a checkbox, a trailing full stop), but keep the words the person used.',
  'Skip anything you cannot read, rather than guessing. Skip headings, dates, and doodles that are not tasks.',
  'If the image has no legible tasks, return an empty list.',
  'No commentary, no encouragement, no shame. Return the tasks with the record_tasks tool.',
].join(' ');

const TASKS_TOOL = {
  name: 'record_tasks',
  description: 'Return the task titles read from the photo, in the order they appear.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: { type: 'string', description: 'One task title, copied from the list.' },
      },
    },
    required: ['tasks'],
  },
} as const;

// The image media types Anthropic accepts. The client normalises to JPEG, but we accept the
// common ones so a PNG or WebP screenshot of a list still works.
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
const MEDIA_TYPES: readonly ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Narrow an untrusted mediaType to one Anthropic accepts, defaulting to JPEG (what the client sends). */
export function parseMediaType(value: unknown): ImageMediaType {
  return typeof value === 'string' && (MEDIA_TYPES as readonly string[]).includes(value)
    ? (value as ImageMediaType)
    : 'image/jpeg';
}

export type OcrRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that reads tasks from a photo. `imageBase64` is raw
 *  base64 with no `data:` prefix. */
export function buildOcrRequest(
  imageBase64: string,
  mediaType: ImageMediaType,
  apiKey: string,
  language?: string,
): OcrRequest {
  const body = {
    model: OCR_MODEL,
    max_tokens: 1024,
    system: withLanguage(SYSTEM_PROMPT, language),
    tools: [TASKS_TOOL],
    tool_choice: { type: 'tool', name: 'record_tasks' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Read the tasks from this list.' },
        ],
      },
    ],
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

/** Pull the task titles out of Claude's tool-use response, defensively (never throws). Trims,
 *  drops blanks and non-strings, and caps the count so a pathological response cannot flood Today. */
export function parseOcrResponse(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_tasks'
    ) {
      const tasks = ((block as { input?: unknown }).input as { tasks?: unknown })?.tasks;
      if (Array.isArray(tasks)) {
        return tasks
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
          .slice(0, 50);
      }
    }
  }
  return [];
}
