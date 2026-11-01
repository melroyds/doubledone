import { describe, expect, it } from 'vitest';

import { type Locale, SUPPORTED, translate } from './i18n';

// The add panel's Tidy offer names its AI on its face (bug sweep 2026-11-01 #4, Melroy's call 2026-11-02). Tidy is an
// AI call, and while it is offered it takes the panel's one hint seat, where the AI note otherwise sits. With AI on by
// default, nothing else on screen then says these words go to an AI, so the button has to. The words on the button
// are also its spoken name (one key, capture.tidy), so a voice command can say what it sees. Until this fix the German
// name started with different words from the button.

const NAMES_AI: Record<Locale, RegExp> = {
  en: /\bAI\b/,
  de: /\bKI\b/,
  fr: /\bIA\b/,
  es: /\bIA\b/,
  it: /\bAI\b/,
};

describe('the Tidy offer says it is AI on the button', () => {
  for (const loc of SUPPORTED) {
    it(`${loc}: the label names the AI, in its own language`, () => {
      const label = translate(loc, 'capture.tidy');
      expect(label).not.toBe('capture.tidy');
      expect(label).toMatch(NAMES_AI[loc]);
      // A missing translation falls back to English, which would pass for Italian, so it must be its own words.
      if (loc !== 'en') expect(label).not.toBe(translate('en', 'capture.tidy'));
    });
  }
});
