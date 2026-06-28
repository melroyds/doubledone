// DoubleDone Play Store asset generator.
//
// Produces store-ready graphics from the running web app + brand assets:
//   docs/play-store/icon/icon-512.png            512x512 hi-res icon
//   docs/play-store/feature/feature-1024x500.png feature graphic
//   docs/play-store/phone/*.png                  1080x1920 framed screenshots
//   docs/play-store/tablet7/*.png                1200x1920 framed screenshots
//   docs/play-store/tablet10/*.png               1600x2560 framed screenshots
//
// Each screenshot is the real app (seeded via localStorage, like screenshots.mjs)
// composited onto a calm dusk slide with a one-line caption, so every asset is an
// exact valid Play size (well within the 2:1 ratio cap) and on-brand.
//
// Prereq: web dev server on http://localhost:8081 (npm run dev) + Google Chrome.
//   node scripts/play-assets.mjs
//
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

const BASE = process.env.SHOT_URL ?? 'http://localhost:8081';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs', 'play-store');

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

// --- brand assets as base64 (font + icon embedded so headless Chrome is self-contained) ---
function b64(p) {
  try {
    return readFileSync(path.join(ROOT, p)).toString('base64');
  } catch {
    return '';
  }
}
const ICON = b64('client/assets/images/icon.png');
const FONT_SERIF = b64('client/assets/fonts/Newsreader_600SemiBold.ttf');
const FONT_SANS = b64('client/assets/fonts/AtkinsonHyperlegible_400Regular.ttf');

const FONT_FACE = `
${FONT_SERIF ? `@font-face{font-family:'NR';src:url(data:font/ttf;base64,${FONT_SERIF}) format('truetype');font-weight:600}` : ''}
${FONT_SANS ? `@font-face{font-family:'AK';src:url(data:font/ttf;base64,${FONT_SANS}) format('truetype');font-weight:400}` : ''}`;
const SERIF = FONT_SERIF ? "'NR', Georgia, serif" : 'Georgia, serif';
const SANS = FONT_SANS ? "'AK', system-ui, sans-serif" : 'system-ui, sans-serif';

// --- seed data (mirrors screenshots.mjs so the screens look populated and calm) ---
const DAY = 86400000;
const now = Date.now();
const noon = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
})();
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

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
  { id: 'l4', title: 'Do the tax return', done: true, completedAt: noon - DAY, complexity: 40, createdAt: noon - 12 * DAY, updatedAt: now },
  { id: 'l5', title: 'Take a short walk', done: true, completedAt: noon - 3 * DAY, createdAt: noon - 3 * DAY, updatedAt: now },
  { id: 'l6', title: 'Book the dentist', done: false, due: isoDay(noon), createdAt: noon - 3 * DAY, updatedAt: now },
];

const seedSettings = (theme, motion = 'reduce') => JSON.stringify({ theme, textSize: 'default', motion });

const RAW_VP = { width: 412, height: 892 };
const RAW_RATIO = RAW_VP.height / RAW_VP.width;

// The store screens. Captions are user-facing: no em-dashes.
const SHOTS = [
  { name: 'today-light', route: '/today', tasks: TODAY_TASKS, theme: 'light', waitText: 'Drink a glass of water', caption: 'Only today, sized to feel possible.' },
  { name: 'welcome', route: '/welcome', tasks: TODAY_TASKS, theme: 'light', waitText: 'A calmer kind of to-do', caption: 'Today is finite and achievable.' },
  { name: 'lookback-light', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'light', waitText: 'Water the plants', caption: 'Everything you finish, you keep.' },
  { name: 'settings-light', route: '/settings', tasks: TODAY_TASKS, theme: 'light', motion: 'system', waitText: 'Theme', caption: 'AI that helps. One tap turns it off.' },
  { name: 'today-dark', route: '/today', tasks: TODAY_TASKS, theme: 'dark', waitText: 'Drink a glass of water', caption: 'A calm home screen, day or night.' },
];

const DEVICES = [
  { dir: 'phone', w: 1080, h: 1920 },
  { dir: 'tablet7', w: 1200, h: 1920 },
  { dir: 'tablet10', w: 1600, h: 2560 },
];

async function captureRaw(browser, shot) {
  const ctx = await browser.newContext({
    viewport: RAW_VP,
    deviceScaleFactor: 2,
    colorScheme: shot.theme === 'dark' ? 'dark' : 'light',
  });
  const payload = {
    'doubledone.tasks.v1': JSON.stringify(shot.tasks),
    'doubledone.settings.v1': seedSettings(shot.theme, shot.motion),
    'doubledone.onboarded.v1': 'yes',
  };
  await ctx.addInitScript((seed) => {
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, payload);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${shot.route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (shot.waitText) await page.getByText(shot.waitText, { exact: false }).first().waitFor({ timeout: 60000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(700);
  const buf = await page.screenshot();
  await ctx.close();
  return buf.toString('base64');
}

function slideHTML({ w, h, caption, rawB64 }) {
  const phoneH = Math.round(h * 0.67);
  const phoneW = Math.round(phoneH / RAW_RATIO);
  const bezel = Math.max(8, Math.round(phoneW * 0.018));
  const radius = Math.round(phoneW * 0.085);
  const capSize = Math.round(w * 0.046);
  const wordSize = Math.round(w * 0.026);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
.slide{width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:${Math.round(h * 0.045)}px;background:linear-gradient(165deg,#FBF8F2 0%,#F2EADB 58%,#E8DDC8 100%);position:relative}
.cap{font-family:${SERIF};font-weight:600;color:#4a4034;font-size:${capSize}px;line-height:1.22;text-align:center;max-width:${Math.round(w * 0.82)}px}
.phone{width:${phoneW}px;height:${phoneH}px;background:#2b2b2e;border-radius:${radius}px;padding:${bezel}px;
  box-shadow:0 ${Math.round(h * 0.016)}px ${Math.round(h * 0.05)}px rgba(74,52,38,.20)}
.phone img{width:100%;height:100%;display:block;border-radius:${radius - bezel}px;object-fit:cover}
.word{position:absolute;left:0;right:0;bottom:${Math.round(h * 0.028)}px;text-align:center;font-family:${SERIF};
  font-weight:600;color:#a4988388;color:rgba(120,108,90,.65);font-size:${wordSize}px;letter-spacing:.5px}
</style></head><body>
<div class="slide">
  <div class="cap">${caption}</div>
  <div class="phone"><img src="data:image/png;base64,${rawB64}"></div>
  <div class="word">DoubleDone</div>
</div></body></html>`;
}

function iconHTML() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{width:512px;height:512px;overflow:hidden;background:#F6F2E9}
img{width:512px;height:512px;display:block}
</style></head><body><img src="data:image/png;base64,${ICON}"></body></html>`;
}

function featureHTML() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1024px;height:500px;overflow:hidden}
.feat{width:1024px;height:500px;display:flex;align-items:center;gap:52px;padding:0 76px;
  background:linear-gradient(120deg,#FBF8F2 0%,#F1E7D6 68%,#E9DEC8 100%)}
.txt{flex:1}
.wm{font-family:${SERIF};font-weight:600;color:#43392d;font-size:78px;line-height:1}
.tag{font-family:${SERIF};font-weight:600;color:#6f6450;font-size:33px;margin-top:20px;line-height:1.2}
.sub{font-family:${SANS};color:#8a7f6b;font-size:21px;margin-top:16px;line-height:1.3}
.tile{width:300px;height:300px;border-radius:66px;overflow:hidden;flex:none;box-shadow:0 24px 60px rgba(74,52,38,.22)}
.tile img{width:100%;height:100%;display:block}
</style></head><body>
<div class="feat">
  <div class="txt">
    <div class="wm">DoubleDone</div>
    <div class="tag">Today is finite and achievable.</div>
    <div class="sub">A calm to-do app for ADHD and overwhelm. AI optional.</div>
  </div>
  <div class="tile"><img src="data:image/png;base64,${ICON}"></div>
</div></body></html>`;
}

async function renderExact(browser, html, w, h, outPath) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(250);
  await page.screenshot({ path: outPath });
  await ctx.close();
}

async function run() {
  for (const d of ['icon', 'feature', ...DEVICES.map((x) => x.dir)]) {
    await mkdir(path.join(OUT, d), { recursive: true });
  }

  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    console.log('· capturing raw app screens');
    for (const shot of SHOTS) {
      shot.raw = await captureRaw(browser, shot);
      console.log(`  ✓ ${shot.name}`);
    }

    for (const dev of DEVICES) {
      console.log(`· framing ${dev.dir} (${dev.w}x${dev.h})`);
      for (const shot of SHOTS) {
        const html = slideHTML({ w: dev.w, h: dev.h, caption: shot.caption, rawB64: shot.raw });
        await renderExact(browser, html, dev.w, dev.h, path.join(OUT, dev.dir, `${shot.name}.png`));
        console.log(`  ✓ ${dev.dir}/${shot.name}`);
      }
    }

    console.log('· icon + feature graphic');
    await renderExact(browser, iconHTML(), 512, 512, path.join(OUT, 'icon', 'icon-512.png'));
    await renderExact(browser, featureHTML(), 1024, 500, path.join(OUT, 'feature', 'feature-1024x500.png'));
    console.log('  ✓ icon-512, feature-1024x500');
  } finally {
    await browser.close();
  }
  console.log(`\nwrote Play assets to ${path.relative(ROOT, OUT)}/`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
