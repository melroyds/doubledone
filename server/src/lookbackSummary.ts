// The Lookback weekly summary (PREMIUM): a finished week's plain titles in, one warm, display-only
// paragraph out. It is NOT a performance review. It celebrates what got done, names a thing or two in the
// user's own words, and NEVER counts, grades, or mentions what was left undone. Pure request-builder +
// response-parser; the Worker handler does the fetch + CORS behind requirePremium. Sibling of strategise.ts.

import { withLanguage } from './lang';

// Haiku is plenty for a short warm paragraph (not reasoning). Pinned to the dated id (model ids deprecate
// on a date; see the CLAUDE.md gotcha), matching ocr.ts.
export const LOOKBACK_SUMMARY_MODEL = 'claude-haiku-4-5-20251001';

// Warm, never a review. The voice is still Melroy's to refine, like strategise/decompose.
export const SYSTEM_PROMPT = [
  'You write one short, warm reflection on a week for someone with ADHD, autism, or OCD.',
  'You are given the plain titles of things they finished this week. Reflect ONLY on what they did.',
  'Name one or two specific things gently, in their own words. Notice a theme if there is a clear one.',
  'Never count or grade. Give no number, no score, no percentage, never say how many things they did.',
  'Never mention anything not done, never imply they could have done more, never compare to other weeks.',
  'No second-person performance framing ("you managed to", "you only", "you should have"). No pep talk.',
  'No streaks, no exclamation marks, no emoji. Calm and plain, two or three sentences at most.',
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
