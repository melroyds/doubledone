// Generate the Open Graph social card: client/public/og.png (1200x630).
//
// Direction 2 ("editorial, with a quiet checkmark"): the DoubleDone wordmark + an
// italic tagline on the Dusk paper, a short mauve rule above, and a soft mauve disc
// with a checkmark (the product's whole point, things get done here) to the right.
//
// One-off asset generator, like scripts/gen-test-suite.py. The PNG it writes is the
// committed artifact; this script + the brand .ttf files in client/assets/fonts make
// it reproducible. Needs @resvg/resvg-js (not a committed dependency):
//   npm i @resvg/resvg-js        (or: npm i @resvg/resvg-js --no-save)
//   node scripts/gen-og-image.mjs
//
// resvg renders SVG -> PNG with the real brand fonts loaded from disk (no browser),
// so the wordmark is the true Newsreader serif, not a fallback.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = join(ROOT, 'client', 'assets', 'fonts');
const OUT = join(ROOT, 'client', 'public', 'og.png');

// Dusk palette (matches constants/theme light scheme).
const PAPER = '#FAF6F1';
const INK = '#2B2722';
const INK_SOFT = '#6E655C';
const DOMAIN = '#8A7F73';
const ACCENT = '#9B6A7D';
const ACCENT_SOFT = '#F1E7EC';

// Left column at x=108; the check disc centred on the right. All text is left-aligned.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="108" y="185" width="108" height="8" rx="4" fill="${ACCENT}" fill-opacity="0.85"/>
  <text x="108" y="300" font-family="Newsreader" font-weight="600" font-size="96" letter-spacing="-1" fill="${INK}">DoubleDone</text>
  <text x="108" y="378" font-family="Newsreader" font-style="italic" font-weight="400" font-size="36" fill="${INK_SOFT}">Today, finite and achievable.</text>
  <text x="108" y="458" font-family="Atkinson Hyperlegible" font-weight="400" font-size="20" letter-spacing="2" fill="${DOMAIN}">doubledone.app</text>
  <circle cx="972" cy="315" r="120" fill="${ACCENT_SOFT}"/>
  <g transform="translate(900,243) scale(6)" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></g>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: {
    fontFiles: [
      join(FONTS, 'Newsreader_600SemiBold.ttf'),
      join(FONTS, 'Newsreader_400Regular_Italic.ttf'),
      join(FONTS, 'AtkinsonHyperlegible_400Regular.ttf'),
    ],
    loadSystemFonts: false,
    defaultFontFamily: 'Newsreader',
  },
});

mkdirSync(dirname(OUT), { recursive: true });
const png = resvg.render().asPng();
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${(png.length / 1024).toFixed(1)} KB)`);
