// The Lookback weekly summary (PREMIUM): a finished week's plain titles in, one warm, display-only
// paragraph out. It is NOT a performance review. It celebrates what got done, names a thing or two in the
// user's own words, and NEVER counts, grades, or mentions what was left undone. Pure request-builder +
// response-parser; the Worker handler does the fetch + CORS behind requirePremium. Sibling of strategise.ts.

import { withLanguage } from './lang';

// Sonnet writes a genuinely warm, specific reflection. Haiku tended to a cookie-cutter "shape of your week"
// summary (Melroy's note on the live output), and the cost is negligible for a short weekly paragraph.
export const LOOKBACK_SUMMARY_MODEL = 'claude-sonnet-4-6';

// Warm and genuine, never a review and never a creative-writing exercise. Still Melroy's to refine.
export const SYSTEM_PROMPT = [
  'You write a short, warm note to someone with ADHD, autism, or OCD about the week they just finished.',
  'You are given the plain titles of things they got done. Reflect ONLY on what they did.',
  'Sound like a kind friend who noticed, not a report and not an AI narrating their week.',
  'Say something genuine and specific about one or two of the things, in their own everyday words.',
  'Use plain, ordinary language. No metaphors, no clichés, nothing writerly or flowery. Do not reach for words like "steadiness", "rhythm", "anchors", "bookended", "journey", or "balance".',
  'Do not summarise the shape of the week or label its structure. Just notice one real thing, warmly.',
  'Never count or grade. Give no number, no score, no percentage, never say how many things they did.',
  'Never mention anything they did not do, never imply they could have done more, never compare weeks.',
  'No second-person performance framing ("you managed to", "you only", "you should have"). No pep talk.',
  'No exclamation marks, no emoji, no em-dashes, no semicolons. One or two plain sentences, no more.',
].join(' ');

export type LookbackSummaryRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

/** Build the Anthropic Messages API request for the warm weekly reflection (plain titles only). */
export function buildLookbackSummaryRequest(titles: string[], apiKey: string, language?: string): LookbackSummaryRequest {
  const list = titles.map((t) => `- ${t}`).join('\n');
  const body = {
    model: LOOKBACK_SUMMARY_MODEL,
    max_tokens: 256,
    system: withLanguage(SYSTEM_PROMPT, language),
    messages: [{ role: 'user', content: `Here is what I finished this week:\n${list}` }],
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

/** Pull the warm paragraph out of Claude's text response, defensively (never throws, '' on malformed). */
export function parseLookbackSummaryResponse(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block != null && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') return text.trim();
    }
  }
  return '';
}
