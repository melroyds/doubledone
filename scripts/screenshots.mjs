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

import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

const BASE = process.env.SHOT_URL ?? 'http://localhost:8081';
const AI_URL = process.env.AI_URL ?? 'https://api.doubledone.app';
// IOS=1: App Store listing mode. Apple's 6.9-inch requirement is 1320x2868 portrait, produced
// here as 440x956 CSS px at a scale of 3 (exactly 1320x2868), written as JPEG because a JPEG
// carries no alpha channel (App Store Connect rejects transparency). The default (Play) mode is
// untouched: 390x844 at scale 2, PNG, docs/screenshots/. NOTE the iOS set deliberately excludes
// the Premium screen: the WEB paywall shows the Stripe line (IAP_AVAILABLE is false on web), and
// an App Store screenshot pointing at external purchase is a review flag, not a marketing shot.
const IOS = process.env.IOS === '1';
// LOCALE=es / de / it / fr: boot the app in that language (the browser context's locale is
// what expo-localization reads on web) and write to docs/screenshots-<locale>/ so the
// English set is never overwritten. Unset = English, unchanged paths.
const LOCALE = process.env.LOCALE;
const OUT = path.join(process.cwd(), 'docs', IOS ? 'appstore' : LOCALE ? `screenshots-${LOCALE}` : 'screenshots');
// The iOS size is overridable: IOS_W/IOS_H CSS px at scale 3. 440x956 -> 1320x2868 (6.9-inch);
// 428x926 -> 1284x2778 (6.5-inch, what some ASC records ask for instead).
const IOS_VP = { width: Number(process.env.IOS_W ?? 440), height: Number(process.env.IOS_H ?? 956) };
const VIEWPORT = IOS ? IOS_VP : { width: 390, height: 844 };
// SHOT_SCALE overrides the device pixel ratio. The iPhone sizes are all divisible by 3, so IOS mode
// defaults there, but the iPad ones are NOT: 2732 / 3 is 910.67, and a fractional CSS viewport
// silently rounds and lands a pixel off the size Apple demands. iPad needs scale 2
// (1024x1366 -> 2048x2732, 1032x1376 -> 2064x2752).
const SCALE = Number(process.env.SHOT_SCALE ?? (IOS ? 3 : 2));
const EXT = IOS ? 'jpeg' : 'png';

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
// `ai` matters for one shot only, and it matters a lot: on the welcome flow's capture step the
// primary button is "Sort for me" when AI is on, which would fire a real Anthropic call every time
// anybody regenerated the screenshots. With AI off the same button reads "Put on Today" and the walk
// costs nothing.
const settings = (theme, motion = 'reduce', ai = true) =>
  JSON.stringify({ theme, textSize: 'default', motion, aiEnabled: ai });

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

/**
 * OURS, without a real account.
 *
 * The room is the one screen this harness could not reach, and it is the screen the whole 1.3.0
 * release is about: no listing anywhere showed a shared list. It resisted the usual trick because a
 * pair does not come from localStorage, it comes from `loadMyPairs` over the network, so a seeded
 * run just rendered the pairing screen.
 *
 * The answer is not a real session. Playwright can answer the network itself, so every Supabase read
 * the room makes is served from the fixture below and NOTHING real is contacted. That keeps the shots
 * deterministic, localisable, and free of any credential: this repo is public, and a session token in
 * a script would be a credential in it forever.
 *
 * The one thing that must be real is the storage KEY supabase-js reads its session from, which is
 * derived from the project ref, so it is lifted from client/.env (gitignored) at run time rather
 * than written down here.
 */
const OURS_PAIR = '00000000-1111-2222-3333-444444444444';
const OURS_USER = '55555555-6666-7777-8888-999999999999';
const OURS_NAME = 'Just us';

/** A shared list that reads like a real household's, because strangers will see it. */
function oursRows(noon) {
  const iso = (d) => new Date(d).toISOString();
  const day = (d) => isoDay(new Date(d));
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
    row('a1', 'Bin night', { recurrence: { kind: 'weekly', weekdays: [new Date(noon).getDay()], start: day(noon - 30 * DAY) } }),
    row('a2', 'Pick up the parcel', { due: day(noon) }),
    row('a3', 'Cat food, the kidney one'),
    row('a4', 'Ask about the gutter'),
    row('a5', 'Batteries, the small ones'),
    row('a6', 'Book the car service', { due: day(noon + 3 * DAY) }),
  ];
}

/** The project ref, so the seeded session lands under the key supabase-js will look in. */
function projectRef() {
  const env = path.join(process.cwd(), 'client', '.env');
  if (!existsSync(env)) return null;
  const text = readFileSync(env, 'utf8');
  const m = text.match(/EXPO_PUBLIC_SUPABASE_URL\s*=\s*"?https:\/\/([a-z0-9]+)\./i);
  return m ? m[1] : null;
}

/** Answer every Supabase read from the fixture. Nothing leaves the machine. */
async function stubSupabase(page, noon) {
  const rows = oursRows(noon);
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/pair_members')) {
      return json([{ pair_id: OURS_PAIR, user_id: OURS_USER, label: 'me', joined_at: new Date(noon - 40 * DAY).toISOString() }]);
    }
    if (url.pathname.endsWith('/pairs')) {
      return json([{ id: OURS_PAIR, name: OURS_NAME, closed_at: null, disabled_at: null }]);
    }
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

async function capture(browser, shot) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: shot.theme === 'dark' ? 'dark' : 'light',
    ...(LOCALE ? { locale: LOCALE } : {}),
  });
  const payload = {
    'doubledone.tasks.v1': JSON.stringify(shot.tasks),
    'doubledone.settings.v1': settings(shot.theme, shot.motion, shot.ai !== false),
    // Returning-user app: skip the first-run redirect (Today -> /welcome) so the
    // Today/Lookback/Settings shots capture the real screen, not onboarding. The
    // welcome shot uses /welcome directly, which renders regardless of this flag.
    'doubledone.onboarded.v1': 'yes',
    // ... and stamp What's New as seen (the gotcha rule: seeded state must bypass
    // EVERY render gate), or every Today shot silently grows the announcement card.
    'doubledone.whatsnew.v1': '99',
  };
  if (shot.scrapbooks) payload['doubledone.scrapbooks.v1'] = JSON.stringify(shot.scrapbooks);
  // A session that supabase-js will accept from storage without asking anybody. Not a credential:
  // every request it could authenticate is answered by `stubSupabase` and never leaves the machine.
  if (shot.ours) {
    const ref = projectRef();
    if (!ref) throw new Error('OURS shots need client/.env for the project ref');
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: OURS_USER, role: 'authenticated', exp })}.stub`;
    payload[`sb-${ref}-auth-token`] = JSON.stringify({
      access_token: jwt,
      refresh_token: 'stub',
      token_type: 'bearer',
      expires_in: 31536000,
      expires_at: exp,
      user: { id: OURS_USER, aud: 'authenticated', role: 'authenticated', email: 'you@example.invalid' },
    });
  }
  await ctx.addInitScript(seedLocalStorage, payload);

  const page = await ctx.newPage();
  if (shot.ours) await stubSupabase(page, noon);
  await page.goto(`${BASE}${shot.route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // The waitText anchors are ENGLISH UI copy, so under LOCALE they would never appear:
  // localized runs wait for network idle + a longer settle instead (the app is seeded, so
  // render is deterministic once the bundle hydrates).
  if (shot.waitText && !LOCALE) await page.getByText(shot.waitText, { exact: false }).first().waitFor({ timeout: 20000 });
  if (LOCALE) await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(shot.delay ?? (LOCALE ? 1500 : 700)); // let the calm fades settle

  // `advance`: press the primary button N times before shooting. The ONLY interaction this harness
  // performs, and it exists for one reason: the welcome flow's steps are internal state rather than
  // routes, so a seeded shot can never reach step six. Ours got its own onboarding screen and
  // nobody could look at it without stepping the whole flow by hand.
  //
  // Clicks the LAST role=button rather than a label, because the primary's words change per step
  // (Begin, Sort for me, Looks good, Got it, Continue) and again in every locale.
  if (shot.advance) {
    // The capture step shows NO primary until the box holds something, so the walk would stall
    // there. Typing is part of the walk, not a nicety.
    const box = page.locator('textarea, input[type="text"]').first();
    for (let i = 0; i < shot.advance; i += 1) {
      if (await box.isVisible().catch(() => false)) await box.fill(shot.type ?? 'Book the dentist');
      await page.waitForTimeout(200);
      // By testID, never by position: with AI off the LAST button on the capture step is
      // "Change AI in Settings", which navigates away and derailed the whole walk.
      await page.locator('[data-testid="welcome-primary"]').click({ timeout: 10000 });
      await page.waitForTimeout(600);
    }
  }
  if (shot.advance) {
    if (shot.afterText && !LOCALE) {
      await page.getByText(shot.afterText, { exact: false }).first().waitFor({ timeout: 15000 });
    }
    await page.waitForTimeout(500);
  }

  // `hold`: long-press a row by its words, then optionally tap something on the card that opens.
  // The held card and the When sheet are state, not routes, so no amount of seeding reaches them.
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
    // By testID, never by words: this runs in five locales, where the door reads Wann, Cuándo,
    // Quand and Quando. Clicking by English text worked in English and nowhere else.
    if (shot.then) {
      await page.locator(`[data-testid="${shot.then}"]`).first().click({ timeout: 15000 });
      await page.waitForTimeout(700);
    }
  }

  const file = path.join(OUT, `${shot.name}.${EXT}`);
  const opts = EXT === 'jpeg' ? { path: file, type: 'jpeg', quality: 92 } : { path: file };
  if (shot.testid) {
    const el = page.locator(`[data-testid="${shot.testid}"]`);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await el.screenshot(opts);
  } else {
    await page.screenshot(opts);
  }
  await ctx.close();
  console.log(`  ✓ ${shot.name}`);
}

async function run() {
  await mkdir(OUT, { recursive: true });
  // Capture a subset with SHOTS=name1,name2 (handy while iterating on one screen).
  const only = process.env.SHOTS ? new Set(process.env.SHOTS.split(',').map((s) => s.trim())) : null;

  // The iOS (App Store) set is FULL-PAGE shots only: an element crop (the scrapbook card) would
  // not be 1320x2868, and App Store Connect enforces exact dimensions.
  const shots = (IOS
    ? [
        { name: 'today-light', route: '/today', tasks: TODAY_TASKS, theme: 'light', waitText: 'Drink a glass of water' },
        { name: 'today-dark', route: '/today', tasks: TODAY_TASKS, theme: 'dark', waitText: 'Drink a glass of water' },
        { name: 'lookback-light', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'light', waitText: 'Water the plants' },
        // The release's headline, and until now absent from every listing.
        { name: 'ours-room', route: '/ours-list', tasks: TODAY_TASKS, theme: 'light', ours: true, waitText: 'Bin night' },
        { name: 'ours-when', route: '/ours-list', tasks: TODAY_TASKS, theme: 'light', ours: true, waitText: 'Cat food', hold: 'Cat food', then: 'when-door' },
        // TRIED AND ABANDONED, 2026-08-17: Today WITH the shared strip, which would be the single
        // best Ours frame (your day, the shared day, no scoreboard). Seeding `ours: true` on /today
        // renders a signed-in Today but NO strip: the Ours-to-Today bridge needs a sync cycle the
        // network stub never completes, so the shared rows never reach local state. The footer also
        // renders "Synced to <address>", which is the original reason this shot was ruled out. Both
        // would have to be solved. It remains a phone job, exactly as docs/launch/ours/README says.
        { name: 'welcome', route: '/welcome', tasks: TODAY_TASKS, theme: 'light', waitText: 'A calmer kind of to-do' },
        // The held card, which is where every relief tool actually lives. Screenshots of a to-do app
        // otherwise only ever show a list, and a list is the least interesting thing here.
        { name: 'held-card', route: '/today', tasks: TODAY_TASKS, theme: 'light', waitText: 'Book the dentist', hold: 'Book the dentist' },
        // `motion: 'system'` on purpose. The other shots seed 'reduce', which is right for a still
        // photograph of a static screen and exactly wrong for the one screen whose subject IS the
        // motion: reduce stops the breathing and this becomes a picture of an empty room.
        { name: 'settle-light', route: '/settle', tasks: TODAY_TASKS, theme: 'light', motion: 'system', waitText: 'Breathing guide', delay: 2600 },
        { name: 'settings-light', route: '/settings', tasks: TODAY_TASKS, theme: 'light', motion: 'system', waitText: 'Theme' },
      ]
    : [
        { name: 'today-light', route: '/today', tasks: TODAY_TASKS, theme: 'light', waitText: 'Drink a glass of water' },
        { name: 'today-dark', route: '/today', tasks: TODAY_TASKS, theme: 'dark', waitText: 'Drink a glass of water' },
        { name: 'lookback-light', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'light', waitText: 'Water the plants' },
        { name: 'lookback-dark', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'dark', waitText: 'Water the plants' },
        { name: 'scrapbook-light', route: '/lookback', tasks: LOOKBACK_TASKS, theme: 'light', testid: 'scrapbook-card', waitText: 'Scrapbook' },
        { name: 'settings-light', route: '/settings', tasks: TODAY_TASKS, theme: 'light', motion: 'system', waitText: 'Theme' },
        { name: 'settings-dark', route: '/settings', tasks: TODAY_TASKS, theme: 'dark', motion: 'system', waitText: 'Theme' },
        { name: 'welcome', route: '/welcome', tasks: TODAY_TASKS, theme: 'light', waitText: 'A calmer kind of to-do' },
        // The shared-list step, five presses in (welcome, capture, reveal, safetynet, keep). It is the
        // one onboarding screen that cannot be reached by a route, so without this nobody can look at it.
        {
          name: 'welcome-shared',
          route: '/welcome',
          tasks: TODAY_TASKS,
          theme: 'light',
          waitText: 'A calmer kind of to-do',
          advance: 5,
          ai: false,
          afterText: 'A list the two of you keep',
        },
        // The breathing room, caught ~2.5s into the swell so the blob is risen and the
        // guide word fully faded in (real headless Chrome runs the animation normally).
        // OURS. The screens the whole 1.3.0 release is about, and the ones no listing showed.
        // Every Supabase read is answered by the fixture in `stubSupabase`; nothing real is touched.
        { name: 'ours-room', route: '/ours-list', tasks: TODAY_TASKS, theme: 'light', ours: true, waitText: 'Bin night' },
        { name: 'ours-room-dark', route: '/ours-list', tasks: TODAY_TASKS, theme: 'dark', ours: true, waitText: 'Bin night' },
        // Held on a PLAIN row, not the repeat. A repeating row adds seven weekday toggles and a
        // third line of chips, and at 390px the commit button then falls below the fold, so the
        // shot shows a sheet with no visible way to finish. The plain state is also the honest one
        // for a listing: it is the move the release exists for, giving a shared row a day.
        //
        // There is deliberately NO Today-with-the-strip shot. Any Ours-enabled Today renders
        // "Synced to <address>" in its footer, and a fabricated address in a store listing is not
        // something to ship. That one stays a real device's job.
        { name: 'ours-when', route: '/ours-list', tasks: TODAY_TASKS, theme: 'light', ours: true, waitText: 'Cat food', hold: 'Cat food', then: 'when-door' },
        { name: 'settle-light', route: '/settle', tasks: TODAY_TASKS, theme: 'light', waitText: 'Breathing guide', delay: 2000 },
        { name: 'settle-dark', route: '/settle', tasks: TODAY_TASKS, theme: 'dark', waitText: 'Breathing guide', delay: 2000 },
      ]
  ).filter((s) => !only || only.has(s.name));

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
  console.log(`\nwrote ${shots.length} screenshot(s) to ${path.relative(process.cwd(), OUT)}/`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
