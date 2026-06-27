// AI scrapbook: turn a finished week into a calm, on-brand keepsake image. A
// two-step Workers AI pipeline, distil the week's tasks into ONE calm still-life
// that gently surfaces what was accomplished (a small text model), then render it
// (a fast image model). The still-life (not an abstract mood) is deliberate: the
// Lookback's whole job is to SHOW what you actually did, so the keepsake lets you
// read your week in it. Pure shaping lives here; index.ts runs the AI binding.
// No Anthropic call: the scrapbook lives entirely on Workers AI, off the budget.

export const SCENE_MODEL = '@cf/meta/llama-3.2-3b-instruct';
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
