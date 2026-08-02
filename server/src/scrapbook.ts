// AI scrapbook: turn a finished week into a calm, on-brand keepsake image. Two
// steps: distil the week's tasks into ONE calm still-life that surfaces what was
// accomplished (a text model), then render it (a fast Workers AI image model).
// The still-life (not an abstract mood) is deliberate: the Lookback's whole job
// is to SHOW what you actually did, so the keepsake lets you read your week in it.
//
// The scene writer is Claude Haiku FIRST (2026-08-02): the original all-Workers-AI
// pipeline used a 3B Llama, which kept retreating to its comfort objects (laundry
// basket, teacup, wilted plant) instead of grounding the actual week; Melroy's own
// keepsake showed one hit (his sold laptop) among generics, and a keepsake you
// cannot read your week in has no payoff. The 3B model stays as the FALLBACK so an
// Anthropic hiccup never costs anyone their keepsake. ~a tenth of a cent per scene.
// Pure shaping lives here; index.ts runs the fetch + the AI binding.

export const SCENE_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
export const SCENE_MODEL = '@cf/meta/llama-3.2-3b-instruct'; // the fallback scene writer
export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

export type ChatMessage = { role: 'system' | 'user'; content: string };

// Distil finished tasks into ONE calm still-life whose soft objects gently evoke
// what was accomplished, so the person can SEE their week. Recognisable but never
// busy, and no text in the scene (image models can't render words cleanly anyway).
export function sceneMessages(titles: string[]): ChatMessage[] {
  const list = titles.slice(0, 14).map((t) => `- ${t}`).join('\n');
  return [
    {
      role: 'system',
      content:
        'You turn a week of finished to-do items into ONE calm, warm still-life scene for a gentle keepsake image, ' +
        'so the person can SEE what they accomplished. ' +
        'Choose a few soft, recognisable objects that gently evoke the finished things (for example: folded linen for laundry, ' +
        'a teacup and a phone for a message returned, keys by the door for an errand, a watered plant for a bit of care). ' +
        'Arrange them in soft light. No people, and no text, words or letters anywhere in the scene. ' +
        'Keep it peaceful and uncluttered, never busy. Reply with the scene only, one sentence, under 30 words.',
    },
    { role: 'user', content: `This week's finished things:\n${list}\n\nThe still-life that evokes them:` },
  ];
}

// The Claude scene writer: same calm rules, but with the grounding requirement the
// 3B model could not honour: one recognisable object PER finished item, so the
// person can genuinely read their week in the picture.
const SCENE_SYSTEM = [
  'You turn a week of finished to-do items into ONE calm, warm still-life scene for a gentle keepsake image.',
  'The person must be able to READ their week in it: include one small, concrete, recognisable object for EACH finished item',
  '(up to six; if there are more, choose the six most picturable).',
  "Ground every object in the actual item: a cat's water bowl freshly filled for changing the cat's water,",
  'a paid bill tucked under a fridge magnet for a bill, a closed laptop with a tied-on sale tag for selling a laptop.',
  'For abstract or administrative items, choose a homely physical stand-in rather than leaving them out.',
  'Never invent objects for things that are not on the list.',
  'Arrange everything together in soft light. No people, and no text, words, letters or numbers anywhere in the scene.',
  'Peaceful and uncluttered, never busy. Return the scene via the record_scene tool as one sentence, under 45 words.',
].join(' ');

const SCENE_TOOL = {
  name: 'record_scene',
  description: 'Return the one-sentence still-life scene for the keepsake image.',
  input_schema: {
    type: 'object',
    properties: { scene: { type: 'string', description: 'The still-life scene, one sentence, under 45 words.' } },
    required: ['scene'],
  },
} as const;

export type SceneRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request that writes the grounded scene. */
export function buildSceneRequest(titles: string[], apiKey: string): SceneRequest {
  const list = titles.slice(0, 14).map((t) => `- ${t}`).join('\n');
  const body = {
    model: SCENE_CLAUDE_MODEL,
    max_tokens: 300,
    system: SCENE_SYSTEM,
    tools: [SCENE_TOOL],
    tool_choice: { type: 'tool', name: 'record_scene' },
    messages: [{ role: 'user', content: `This week's finished things:\n${list}\n\nThe still-life that shows them:` }],
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

/** Pull the scene out of Claude's tool-use response, defensively (never throws).
 *  Returns '' when unusable, so the caller falls back to the Workers AI scene. */
export function parseSceneResponse(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'record_scene'
    ) {
      const scene = ((block as { input?: unknown }).input as { scene?: unknown })?.scene;
      if (typeof scene === 'string' && scene.trim().length >= 4) return scene.trim().slice(0, 200);
    }
  }
  return '';
}

// Used if the text model returns nothing usable, so the image step always has a
// calm, on-brand prompt to work from.
export const FALLBACK_SCENE =
  'soft morning light across a calm, tidy desk with a warm cup and a few quiet objects at rest';

/** Pull the distilled scene out of the text-model result, defensively. */
export function parseScene(result: unknown): string {
  const text = (result as { response?: unknown } | null)?.response;
  const scene = typeof text === 'string' ? text.trim().replace(/^["']+|["']+$/g, '').trim() : '';
  // Clamp the length: a runaway model string would bloat the stored blob and distort the polaroid caption
  // layout. Not a security issue (RN <Text> renders no HTML), purely a size/layout bound.
  return scene.length >= 4 ? scene.slice(0, 200) : FALLBACK_SCENE;
}

/** The full image prompt: the scene rendered in the Dusk palette and a calm style. */
export function imagePrompt(scene: string): string {
  return (
    `${scene}. ` +
    'Soft minimalist watercolour illustration, warm dusk palette of dusty mauve, sage green and cream, ' +
    'gentle and peaceful, soft natural light, no text, no words, no letters.'
  );
}

/** Pull the base64 image out of the image-model result, or null. */
export function parseImage(result: unknown): string | null {
  const img = (result as { image?: unknown } | null)?.image;
  return typeof img === 'string' && img.length > 0 ? img : null;
}

/** Wrap a base64 JPEG as a data URL the client can render and persist directly. */
export function dataUrl(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

// Abuse backstop for the costed image route. Generous enough that no legitimate user (free 1/month, premium up
// to 4/week) ever comes close; tight enough that a scripted caller cannot mint unlimited keepsakes off one IP
// and drain the shared Workers AI budget. The per-user cadence stays the client's job (and the paywall); this
// is only the server-side ceiling on raw abuse. Tunable.
export const SCRAPBOOK_DAILY_CAP = 20;

/** Whether a client (by its rolling-24h scrapbook count) is over the per-IP daily ceiling. */
export function overDailyCap(recentCount: number, cap = SCRAPBOOK_DAILY_CAP): boolean {
  return recentCount >= cap;
}
