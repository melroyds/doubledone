// The offer card's height budget ("A month on us", design_handoff_month_on_us §2): at most 240 at Large text,
// in every locale and both appearances, so the first task row still ends above the floating + pill. Enforced by
// shortening a string, never by clipping or capping the font. And the gold corner: white text measures 4.6:1 or
// better only up to the gradient's 0.88 stop (2.2:1 on the honey), so in Standard every line of text must sit
// at or below that stop. Run against the dev server (npm run dev):
//   node scripts/offer-card-height.mjs            (exit 1 if any frame is over budget or any text is in the gold)
// Measures the rendered card (data-testid="offer-card", minus its 12px fold gap) at 390 x 844, the board's frame.
// client/src/lib/offer-card-copy.test.ts holds a character budget calibrated on these numbers, so CI catches a
// string that grows; this script is the real measurement behind it.

import { existsSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const MAX = 240;
const GOLD_STOP = 0.88; // PREMIUM_GRADIENT_LOCATIONS[1]
const GAP = 12; // the card's own paddingBottom, which the fold animation takes with it

function chromePath() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found; set CHROME=/path/to/chrome');
  return found;
}

function seed(payload) {
  for (const [k, v] of Object.entries(payload)) localStorage.setItem(k, v);
}

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
let worst = 0;
let failed = false;
for (const locale of ['en', 'de', 'fr', 'es', 'it']) {
  for (const appearance of ['standard', 'quiet']) {
    for (const textSize of ['default', 'large']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale });
      const now = Date.now();
      await ctx.addInitScript(seed, {
        'doubledone.onboarded.v1': 'yes',
        'doubledone.whatsnew.v1': '99',
        'doubledone.holdhint.v1': 'yes',
        'doubledone.firstseen.v1': String(now - 8 * 86_400_000),
        'doubledone.giftoffer.v1': JSON.stringify({ canGet: true, at: now - 60_000 }),
        'doubledone.settings.v1': JSON.stringify({ theme: 'light', textSize, motion: 'reduce', appearance, aiEnabled: true }),
      });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/today`);
      const card = page.getByTestId('offer-card');
      await card.waitFor({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      const box = await card.boundingBox();
      const h = Math.round((box?.height ?? 0) - GAP);
      worst = Math.max(worst, h);
      const over = textSize === 'large' && h > MAX;
      // Where each line of text reaches along the gradient. start {0,0} end {1,1} in the box's own unit space, so
      // a point's stop is (x/W + y/H) / 2: the same on the phones (CAGradientLayer, Android's shader) as here.
      const reach =
        appearance === 'standard'
          ? await card.evaluate((el) => {
              const grad = el.firstElementChild.getBoundingClientRect();
              const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              let most = 0;
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!n.textContent.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(n);
                for (const r of range.getClientRects()) {
                  for (const [x, y] of [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]]) {
                    most = Math.max(most, ((x - grad.left) / grad.width + (y - grad.top) / grad.height) / 2);
                  }
                }
              }
              return most;
            })
          : null;
      const gold = reach != null && reach > GOLD_STOP;
      if (over || gold) failed = true;
      console.log(
        `${locale} ${appearance.padEnd(8)} ${textSize.padEnd(7)} ${h}${reach != null ? `  text reaches ${reach.toFixed(2)}` : ''}` +
          `${over ? `  OVER ${MAX}` : ''}${gold ? `  IN THE GOLD (> ${GOLD_STOP})` : ''}`,
      );
      await ctx.close();
    }
  }
}
await browser.close();
console.log(`tallest ${worst} (budget ${MAX} at Large text)`);
process.exit(failed ? 1 : 0);
