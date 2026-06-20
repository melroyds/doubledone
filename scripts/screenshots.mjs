// DoubleDone screenshot engine.
//
// Drives the running web app in headless Google Chrome, seeds each screen's state
// via localStorage (deterministic, no clicking through flows), and writes
// docs/screenshots/<name>.png. No browser download: uses playwright-core with the
// system Chrome.
//
// Prereqs: the web dev server running (`npm run dev` → http://localhost:8081) and
// Google Chrome installed.
//
//   npm run shots                 # capture everything
//   AI_OFF=1 npm run shots        # skip the one live scrapbook image (invite state)
//
// Env:  SHOT_URL  base url (default http://localhost:8081)
//       CHROME    chrome executable (auto-detected on win/mac/linux)
//       AI_URL    scrapbook endpoint base (default the deployed Worker)
//       AI_OFF=1  do not call the AI; the scrapbook shows its invite state
//
// Add a screen by adding a SHOTS entry below. State is seeded, so no live AI is
// needed except the optional scrapbook image (one free Workers-AI call).

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

const BASE = process.env.SHOT_URL ?? 'http://localhost:8081';
const AI_URL = process.env.AI_URL ?? 'https://doubledone-ai.melroy-a02.workers.dev';
const OUT = path.join(process.cwd(), 'docs', 'screenshots');
const VIEWPORT = { width: 390, height: 844 };

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

// --- seed data (anchored to "now" so the calendar shows a populated week) ---
const DAY = 86400000;
const now = Date.now();
const noon = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
})();
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function weekStartISO(ms) {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to the Sunday of that week
  return d.toISOString().slice(0, 10);
}

const TODAY_TASKS = [
  { id: 's1', title: 'Drink a glass of water', done: false, createdAt: now - 2 * DAY, updatedAt: now },
  { id: 's2', title: "Reply to Sam's message", done: false, createdAt: now - DAY, updatedAt: now },
  { id: 's3', title: 'Start the laundry, just sort the pile', done: false, createdAt: now - DAY, updatedAt: now },
  { id: 's4', title: 'Book the dentist', done: false, due: isoDay(noon), createdAt: now - 3 * DAY, updatedAt: now },
  { id: 's5', title: 'Take the bins out', done: true, completedAt: noon, createdAt: now - DAY, updatedAt: now },
];

const LOOKBACK_TASKS = [
  { id: 'l1', title: 'Water the plants', done: true, completedAt: noon, createdAt: noon - DAY, updatedAt: now },
  { id: 'l2', title: "Reply to Sam's message", done: true, completedAt: noon - DAY, createdAt: noon - 2 * DAY, updatedAt: now },
  { id: 'l3', title: 'Sort the recycling', done: true, completedAt: noon - 2 * DAY, createdAt: noon - 2 * DAY, updatedAt: now },
  // a long-dreaded, chunky task finally closed: the "a big one" celebration
  { id: 'l4', title: 'Do the tax return', done: true, completedAt: noon - DAY, complexity: 40, createdAt: noon - 12 * DAY, updatedAt: now },
  { id: 'l5', title: 'Take a short walk', done: true, completedAt: noon - 3 * DAY, createdAt: noon - 3 * DAY, updatedAt: now },
  { id: 'l6', title: 'Book the dentist', done: false, due: isoDay(noon), createdAt: noon - 3 * DAY, updatedAt: now },
];

// Default to reduce-motion so the gentle fades / scrolling titles are frozen for a
// clean capture; a shot can override (e.g. Settings shows the honest "Follow system").
const settings = (theme, motion = 'reduce') => JSON.stringify({ theme, textSize: 'default', motion });

// One free Workers-AI call so the scrapbook shot shows a real keepsake. On any
// failure (or AI_OFF) the shot falls back to the honest invite state.
async function liveScrapbook() {
  if (process.env.AI_OFF) return null;
  try {
    const res = await fetch(`${AI_URL}/scrapbook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titles: ['Do the tax return', 'Water the plants', "Reply to Sam's message", 'Sort the recycling'] }),
    });
    if (!res.ok) return null;
    const { image, caption } = await res.json();
    if (typeof image !== 'string') return null;
    return [{ weekStart: weekStartISO(noon), image, caption: caption ?? '', createdAt: now }];
  } catch {
    return null;
  }
}

// Runs in the page before any app script, so the first render already has data.
function seedLocalStorage(payload) {
  for (const [k, v] of Object.entries(payload)) localStorage.setItem(k, v);
}

async function capture(browser, shot) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: shot.theme === 'dark' ? 'dark' : 'light',
  });
  const payload = {
    'doubledone.tasks.v1': JSON.stringify(shot.tasks),
    'doubledone.settings.v1': settings(shot.theme, shot.motion),
    // Returning-user app: skip the first-run redirect (Today -> /welcome) so the
    // Today/Lookback/Settings shots capture the real screen, not onboarding. The
    // welcome shot uses /welcome directly, which renders regardless of this flag.
    'doubledone.onboarded.v1': 'yes',
  };
  if (shot.scrapbooks) payload['doubledone.scrapbooks.v1'] = JSON.stringify(shot.scrapbooks);
  await ctx.addInitScript(seedLocalStorage, payload);

  const page = await ctx.newPage();
  await page.goto(`${BASE}${shot.route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (shot.waitText) await page.getByText(shot.waitText, { exact: false }).first().waitFor({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(700); // let the calm fades settle

  const file = path.join(OUT, `${shot.name}.png`);
  if (shot.testid) {
    const el = page.locator(`[data-testid="${shot.testid}"]`);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await el.screenshot({ path: file });
  } else {
    await page.screenshot({ path: file });
  }
  await ctx.close();
  console.log(`  ✓ ${shot.name}`);
}

async function run() {
  await mkdir(OUT, { recursive: true });
  // Capture a subset with SHOTS=name1,name2 (handy while iterating on one screen).
  const only = process.env.SHOTS ? new Set(process.env.SHOTS.split(',').map((s) => s.trim())) : null;

  const shots = [
    { name: 'today-light', route: '/', tasks: TODAY_TASKS, theme: 'light', waitText: 'Drink a glass of water' },
    { name: 'today-dark', route: '/', tasks: TODAY_TASKS, theme: 'dark', waitText: 'Drink a glass of water' },
    { name: 'lookback-light', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'light', waitText: 'Water the plants' },
    { name: 'lookback-dark', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'dark', waitText: 'Water the plants' },
    { name: 'scrapbook-light', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'light', testid: 'scrapbook-card', waitText: 'Scrapbook' },
    { name: 'settings-light', route: '/settings', tasks: TODAY_TASKS, theme: 'light', motion: 'system', waitText: 'Theme' },
    { name: 'settings-dark', route: '/settings', tasks: TODAY_TASKS, theme: 'dark', motion: 'system', waitText: 'Theme' },
    { name: 'welcome', route: '/welcome', tasks: TODAY_TASKS, theme: 'light', waitText: 'A calmer kind of to-do' },
  ].filter((s) => !only || only.has(s.name));

  // The scrapbook image is the only thing that needs the network; fetch it only if
  // that shot is in the set.
  const bookShot = shots.find((s) => s.name === 'scrapbook-light');
  if (bookShot) {
    bookShot.scrapbooks = await liveScrapbook();
    console.log(bookShot.scrapbooks ? '· live scrapbook image fetched' : '· scrapbook: invite state (no live image)');
  }

  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const shot of shots) await capture(browser, shot);
  } finally {
    await browser.close();
  }
  console.log(`\nwrote ${shots.length} screenshot(s) to docs/screenshots/`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
