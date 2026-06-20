// AI scrapbook: turn a finished week into a calm, on-brand keepsake image. A
// two-step Workers AI pipeline, distil the week's tasks into ONE abstract Dusk
// scene (a small text model), then render it (a fast image model). Pure shaping
// lives here; index.ts runs the AI binding. No Anthropic call: the scrapbook
// lives entirely on Workers AI, so it does not touch the $25/mo Anthropic budget.

export const SCENE_MODEL = '@cf/meta/llama-3.2-3b-instruct';
export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

export type ChatMessage = { role: 'system' | 'user'; content: string };

// Distil finished tasks into ONE short, calm, ABSTRACT scene, never literal: the
// image is a gentle mood of the week, not a depiction of the chores.
export function sceneMessages(titles: string[]): ChatMessage[] {
  const list = titles.slice(0, 14).map((t) => `- ${t}`).join('\n');
  return [
    {
      role: 'system',
      content:
        'You turn a week of finished to-do items into ONE short, calm, abstract visual scene for a gentle keepsake image. ' +
        'Never depict the tasks literally and never name them. No people, no text, no words, no letters in the scene. ' +
        'Evoke a peaceful mood of small things quietly accomplished: soft light, warmth, calm nature or a gentle still life. ' +
        'Reply with the scene only, one sentence, under 25 words.',
    },
    { role: 'user', content: `This week's finished things:\n${list}\n\nThe calm scene:` },
  ];
}

// Used if the text model returns nothing usable, so the image step always has a
// calm, on-brand prompt to work from.
export const FALLBACK_SCENE =
  'soft morning light across a calm, tidy desk with a warm cup and a few quiet objects at rest';

/** Pull the distilled scene out of the text-model result, defensively. */
export function parseScene(result: unknown): string {
  const text = (result as { response?: unknown } | null)?.response;
  const scene = typeof text === 'string' ? text.trim().replace(/^["']+|["']+$/g, '').trim() : '';
  return scene.length >= 4 ? scene : FALLBACK_SCENE;
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
