import { describe, expect, it } from 'vitest';

import { de } from './catalogs/de';
import { en } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import { it as itCat } from './catalogs/it';

// "A month on us" (design_handoff_month_on_us §9): what the thank-you may never say, in any language. It is a
// thank-you for a note, not a trial, a review, a reward or a countdown, and both stores forbid anything that reads
// as paying for a rating. Every string under feedbackMonth.* is read in all five catalogues.

const CATALOGS = { en, de, fr, es, it: itCat } as const;
type Strings = Record<string, string>;
const month = (cat: unknown): Strings => (cat as { feedbackMonth: Strings }).feedbackMonth;

// A word, not a substring of one ("earn" must not catch "learn"), in any script.
const word = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'iu');

const BANNED: Record<keyof typeof CATALOGS, string[]> = {
  en: ['trial', 'try free', 'free trial', 'review', 'rating', 'rate us', 'stars', 'limited', 'hurry', 'only today', 'last chance', 'expire', 'expired', 'claim', 'unlock now', 'reward', 'points', 'earn', 'real'],
  de: ['Testversion', 'Probeabo', 'Bewertung', 'bewerten', 'Sterne', 'begrenzt', 'abgelaufen', 'läuft ab', 'Belohnung', 'Punkte', 'verdienen', 'echte'],
  fr: ['essai', 'avis', 'évaluation', 'noter', 'étoiles', 'limité', 'expiré', 'dernière chance', 'récompense', 'points', 'gagner', 'vraie'],
  es: ['prueba', 'reseña', 'valoración', 'calificación', 'estrellas', 'limitado', 'caduca', 'expira', 'última oportunidad', 'recompensa', 'puntos', 'ganar', 'de verdad'],
  it: ['prova', 'recensione', 'valutazione', 'stelle', 'limitato', 'scade', 'scaduto', 'ultima occasione', 'ricompensa', 'punti', 'guadagnare', 'vera'],
};
// The one place "real" belongs: the egress line says Claude checks that the note is a real one.
const REAL_ALLOWED = 'noteEgressClaude';
const REAL_WORDS = new Set(['real', 'echte', 'vraie', 'de verdad', 'vera']);

describe('the thank-you never reads as a trial, a review, a reward or a countdown', () => {
  for (const [loc, cat] of Object.entries(CATALOGS) as [keyof typeof CATALOGS, unknown][]) {
    const strings = month(cat);
    it(`${loc}: no banned word`, () => {
      for (const [key, text] of Object.entries(strings)) {
        for (const w of BANNED[loc]) {
          if (key === REAL_ALLOWED && REAL_WORDS.has(w)) continue;
          expect(word(w).test(text), `${loc} feedbackMonth.${key} says "${w}"`).toBe(false);
        }
      }
    });
    it(`${loc}: no store names and no price`, () => {
      for (const [key, text] of Object.entries(strings)) {
        expect(text, `${loc} ${key}`).not.toMatch(/App Store|Google Play|Play Store/);
        expect(text, `${loc} ${key}`).not.toMatch(/(A\$|US\$|\$|€|£|\bAUD\b|\bUSD\b|\bEUR\b)\s?\d|\d\s?(€|\$|£)/);
      }
    });
  }

  it('every catalogue carries every key, and keeps each placeholder', () => {
    const keys = Object.keys(month(en)).sort();
    for (const [loc, cat] of Object.entries(CATALOGS)) {
      expect(Object.keys(month(cat)).sort(), loc).toEqual(keys);
      for (const key of keys) {
        const want = month(en)[key].match(/\{\w+\}/g) ?? [];
        expect(month(cat)[key].match(/\{\w+\}/g) ?? [], `${loc} ${key}`).toEqual(want);
      }
    }
  });
});

// The card's height budget is 240 at Large text (the first task row must end above the + pill). The real
// measurement is scripts/offer-card-height.mjs (2026-10-25: 203 tallest, French and German, both appearances).
// These character caps are calibrated on it so a string that grows is caught here, in CI: the sentence fills four
// lines at Large text around 120 characters, and five would break 240. Shorten the string, never cap the font.
describe('the offer card fits its height budget in every language', () => {
  const CAPS = { cardBody: 110, cardEyebrow: 24, cardWrite: 20, cardNotNow: 16 } as const;
  for (const [loc, cat] of Object.entries(CATALOGS)) {
    it(`${loc}: each card string is within its cap`, () => {
      for (const [key, cap] of Object.entries(CAPS)) expect([...month(cat)[key]].length, `${loc} ${key}`).toBeLessThanOrEqual(cap);
    });
  }
});
