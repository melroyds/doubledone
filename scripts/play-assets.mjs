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

// --- Ours (the shared list), captured without a real account or a real network call ---
//
// The room only renders for a signed-in member of a pair, so a seeded shot cannot reach it the way
// Today can. Playwright answers the network itself instead: every Supabase read below is served
// from a fixture and NOTHING real is contacted. That keeps the shots deterministic and, more to the
// point, keeps a session token out of this repo, which is public. The one real value is the storage
// KEY supabase-js reads its session from, derived from the project ref, so it is lifted from
// client/.env (gitignored) at run time rather than written down here.
//
// Mirrors scripts/screenshots.mjs. If the room's queries change, both harnesses change together.
const OURS_PAIR = '00000000-1111-2222-3333-444444444444';
const OURS_USER = '55555555-6666-7777-8888-999999999999';
const OURS_NAME = 'Just us';

/** A shared list that reads like a real household's, because strangers on a store page see it. */
function oursRows() {
  const iso = (d) => new Date(d).toISOString();
  const row = (id, title, over = {}) => ({
    pair_id: OURS_PAIR,
    id,
    title,
    done: false,
    done_at: null,
    recurrence: null,
    completions: null,
    due: null,
    created_at: iso(noon - DAY),
    updated_at: iso(noon),
    deleted_at: null,
    ...over,
  });
  return [
    row('a1', 'Bin night', { recurrence: { kind: 'weekly', weekdays: [new Date(noon).getDay()], start: isoDay(noon - 30 * DAY) } }),
    row('a2', 'Pick up the parcel', { due: isoDay(noon) }),
    row('a3', 'Cat food, the kidney one'),
    row('a4', 'Ask about the gutter'),
    row('a5', 'Batteries, the small ones'),
    row('a6', 'Book the car service', { due: isoDay(noon + 3 * DAY) }),
  ];
}

/** The project ref, so the seeded session lands under the key supabase-js will look in. */
function projectRef() {
  const env = path.join(ROOT, 'client', '.env');
  if (!existsSync(env)) return null;
  const m = readFileSync(env, 'utf8').match(/EXPO_PUBLIC_SUPABASE_URL\s*=\s*"?https:\/\/([a-z0-9]+)\./i);
  return m ? m[1] : null;
}

/** Answer every Supabase read from the fixture. Nothing leaves the machine. */
async function stubSupabase(page) {
  const rows = oursRows();
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/pair_members')) {
      return json([{ pair_id: OURS_PAIR, user_id: OURS_USER, label: 'me', joined_at: new Date(noon - 40 * DAY).toISOString() }]);
    }
    if (url.pathname.endsWith('/pairs')) return json([{ id: OURS_PAIR, name: OURS_NAME, closed_at: null, disabled_at: null }]);
    if (url.pathname.endsWith('/shared_tasks')) {
      // pullPair keyset-walks and stops on an EMPTY page, so the second call must return nothing.
      const after = url.searchParams.get('id');
      return json(after && after.startsWith('gt.') ? [] : rows);
    }
    if (url.pathname.includes('/rpc/server_now')) return json(new Date(noon).toISOString());
    if (url.pathname.includes('/rpc/')) return json(true);
    return json([]);
  });
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

/** A session supabase-js accepts from storage without asking anybody. Not a credential: every
 *  request it could authenticate is answered by `stubSupabase` and never reaches the internet. */
function oursSession() {
  const ref = projectRef();
  if (!ref) throw new Error('Ours shots need client/.env for the project ref');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: OURS_USER, role: 'authenticated', exp })}.stub`;
  return {
    key: `sb-${ref}-auth-token`,
    value: JSON.stringify({
      access_token: jwt,
      refresh_token: 'stub',
      token_type: 'bearer',
      expires_in: 31536000,
      expires_at: exp,
      user: { id: OURS_USER, aud: 'authenticated', role: 'authenticated', email: 'you@example.invalid' },
    }),
  };
}

const RAW_VP = { width: 412, height: 892 };
const RAW_RATIO = RAW_VP.height / RAW_VP.width;

// The store screens. Captions are user-facing: no em-dashes.
// Listed in the order they should be UPLOADED to the Console, which is the order a shopper swipes:
// the promise, the core, then the thing this version is for.
const SHOTS = [
  { name: 'welcome', route: '/welcome', tasks: TODAY_TASKS, theme: 'light', waitText: 'A calmer kind of to-do', caption: 'Today is finite and achievable.' },
  { name: 'today-light', route: '/today', tasks: TODAY_TASKS, theme: 'light', waitText: 'Drink a glass of water', caption: 'Only today, sized to feel possible.' },
  { name: 'ours-room', route: '/ours-list', tasks: TODAY_TASKS, theme: 'light', ours: true, waitText: 'Bin night', caption: 'One shared list. Never a scoreboard.' },
  { name: 'lookback-light', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'light', waitText: 'Water the plants', caption: 'Everything you finish, you keep.' },
  { name: 'ours-when', route: '/ours-list', tasks: TODAY_TASKS, theme: 'light', ours: true, waitText: 'Cat food', hold: 'Cat food', then: 'when-door', caption: 'A shared day, set from either phone.' },
  { name: 'today-dark', route: '/today', tasks: TODAY_TASKS, theme: 'dark', waitText: 'Drink a glass of water', caption: 'A calm home screen, day or night.' },
  // Settle breathes on a chained Animated loop, so it needs longer than the others to reach a frame
  // worth photographing. `motion: 'system'` on purpose: 'reduce' stops the breathing this shot is OF.
  { name: 'settle-light', route: '/settle', tasks: TODAY_TASKS, theme: 'light', motion: 'system', waitText: 'Breathing guide', delay: 2600, caption: 'A quiet room, for when today gets loud.' },
  { name: 'settings-light', route: '/settings', tasks: TODAY_TASKS, theme: 'light', motion: 'system', waitText: 'Theme', caption: 'AI that helps. One tap turns it off.' },
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
    // Seeded state must bypass EVERY render gate, not just supply data. Without `onboarded` the
    // first-run redirect eats the Today shot; without `whatsnew` the announcement card grows on it.
    'doubledone.onboarded.v1': 'yes',
    'doubledone.whatsnew.v1': '99',
  };
  if (shot.ours) {
    const session = oursSession();
    payload[session.key] = session.value;
  }
  await ctx.addInitScript((seed) => {
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, payload);
  const page = await ctx.newPage();
  if (shot.ours) await stubSupabase(page);
  await page.goto(`${BASE}${shot.route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (shot.waitText) await page.getByText(shot.waitText, { exact: false }).first().waitFor({ timeout: 60000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(shot.delay ?? 700); // let the calm fades settle

  // `hold`: long-press a row by its words, then tap something on the card that opens. The held card
  // and the When sheet are state rather than routes, so no amount of seeding reaches them.
  if (shot.hold) {
    const row = page.getByText(shot.hold, { exact: false }).first();
    await row.waitFor({ timeout: 20000 });
    const box = await row.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(700); // longer than the press threshold, shorter than patience
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
    // By testID, never by words, so the door is found whatever it is called.
    if (shot.then) {
      await page.locator(`[data-testid="${shot.then}"]`).first().click({ timeout: 15000 });
      await page.waitForTimeout(700);
    }
  }

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
