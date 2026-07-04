// DoubleDone locale screenshots: the i18n twin of screenshots.mjs.
// Usage: npm run dev (8081), then: node scripts/i18n-shots.mjs
// Locale verification shots: drive the app in it-IT / es-ES / en-AU Playwright contexts
// (expo-localization on web reads navigator.language) and capture the core screens.
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:8081';
const OUT = path.join(process.cwd(), 'docs', 'screenshots', 'i18n');

function chromePath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found');
  return found;
}

const DAY = 86400000;
const now = Date.now();
const noon = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime(); })();
const TASKS = [
  { id: 's1', title: 'Drink a glass of water', done: false, createdAt: now - 2 * DAY, updatedAt: now },
  { id: 's2', title: "Reply to Sam's message", done: false, createdAt: now - DAY, updatedAt: now },
  { id: 's3', title: 'Start the laundry', done: false, createdAt: now - DAY, updatedAt: now },
  { id: 's4', title: 'Take the bins out', done: true, completedAt: noon, createdAt: now - DAY, updatedAt: now },
];
const LOOKBACK = [
  { id: 'l1', title: 'Water the plants', done: true, completedAt: noon, createdAt: noon - DAY, updatedAt: now },
  { id: 'l4', title: 'Do the tax return', done: true, completedAt: noon - DAY, complexity: 40, createdAt: noon - 12 * DAY, updatedAt: now },
];

const LOCALES = ['it-IT', 'es-ES', 'en-AU'];
const SHOTS = [
  { name: 'today', route: '/today', tasks: TASKS },
  { name: 'welcome', route: '/welcome', tasks: TASKS },
  { name: 'settings', route: '/settings', tasks: TASKS },
  { name: 'lookback', route: '/lookback', tasks: LOOKBACK },
];

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const loc of LOCALES) {
      for (const shot of SHOTS) {
        const ctx = await browser.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          locale: loc,
        });
        await ctx.addInitScript((seed) => {
          for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
        }, {
          'doubledone.tasks.v1': JSON.stringify(shot.tasks),
          'doubledone.settings.v1': JSON.stringify({ theme: 'light', textSize: 'default', motion: 'reduce' }),
          'doubledone.onboarded.v1': 'yes',
        });
        const page = await ctx.newPage();
        await page.goto(`${BASE}${shot.route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForTimeout(3500); // bundle + fonts + fades
        await page.evaluate(() => document.fonts.ready.then(() => true));
        await page.screenshot({ path: path.join(OUT, `${shot.name}-${loc}.png`) });
        await ctx.close();
        console.log(`  ✓ ${shot.name}-${loc}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log('done ->', OUT);
}
run().catch((e) => { console.error(e); process.exit(1); });
