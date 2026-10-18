// The landing page's six real screens (the redesign of 2026-10-18), captured from the running web app in all five
// languages and both themes, so a German visitor sees German screens (an English screen on a German page is a trust
// leak, the handoff's rule).
//
//   npm run dev                          # the web dev server on :8081 (the doubledone-web launch config)
//   node scripts/landing-shots.mjs       # all six pictures x 5 languages x 2 themes = 60 files
//   NAMES=plan,ours LOCALES=de node scripts/landing-shots.mjs
//
// Writes client/public/landing/{name}-{light|dark}-{locale}.webp (640 px wide, the 2x of the page's 320) and
// client/src/lib/landing-pictures.ts, the size of each crop, so the page holds exactly the right space before a
// picture loads. Every crop is anchored to the real screen's elements, found by the SAME catalogue strings the app
// renders (the catalogues are bundled with esbuild, as inject-web-meta.mjs does), so the crops follow each
// language's own line lengths.
//
// NOTHING real is contacted. Every Supabase read is answered from a fixture, the AI host is stubbed for the one
// break-down plan and refused for everything else (so no shot ever spends AI or counts as feature usage), and the
// clock is pinned to Sunday 18 October 2026 so the Calendar opens on that day. Math.random is pinned too (Settle's
// guide word picks a random accent each open, and the rotating phrases pick at random).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const BASE = process.env.SHOT_URL ?? 'http://localhost:8081';
const LOCALES = (process.env.LOCALES ?? 'en,de,es,fr,it').split(',');
const NAMES = (process.env.NAMES ?? 'rested,plan,low,settle,ours,calendar').split(',');
const OUT = path.join(ROOT, 'client', 'public', 'landing');
const TMP = path.join(os.tmpdir(), 'dd-landing-shots');
const SIZES_FILE = path.join(ROOT, 'client', 'src', 'lib', 'landing-pictures.ts');
const TZ = 'Australia/Melbourne';
const LOCALE_TAG = { en: 'en-AU', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT' };

// --- the catalogues, bundled so this script reads exactly what the app renders ---------------------------------
const bundled = await build({
  entryPoints: [path.join(ROOT, 'client', 'src', 'lib', 'i18n.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { translate } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

// The handoff's per-language fixtures (strings.json _fixtures), kept here so the script needs nothing outside the repo.
const BREAKDOWN_STEPS = {
  // Short enough to sit on one line each, as a real plan's steps usually do, so the picture stays a calm height.
  en: [["Find last year's summary", 2], ['Put the receipts in one pile', 15], ['Fill in the income part', 20], ['Check it and send it', 15]],
  de: [['Letzten Bescheid suchen', 2], ['Belege auf einen Stapel legen', 15], ['Einkünfte eintragen', 20], ['Prüfen und abschicken', 15]],
  es: [['Buscar el resumen anterior', 2], ['Juntar los recibos', 15], ['Rellenar los ingresos', 20], ['Revisar y enviar', 15]],
  fr: [["Retrouver l'avis d'impôt", 2], ['Rassembler les reçus', 15], ['Remplir les revenus', 20], ['Relire et envoyer', 15]],
  it: [['Trovare il riepilogo', 2], ['Mettere insieme le ricevute', 15], ['Compilare i redditi', 20], ['Ricontrollare e inviare', 15]],
};
// Four rows: the picture ends under the fourth with room to spare, and no fifth row peeks in at the edge.
const OURS_ROWS = {
  en: ['Bin night', 'Pick up the parcel', 'Cat food, the kidney one', 'Ask about the gutter'],
  de: ['M\u00fcll rausstellen', 'Paket abholen', 'Katzenfutter, das f\u00fcr die Nieren', 'Wegen der Dachrinne fragen'],
  es: ['Sacar la basura', 'Recoger el paquete', 'Comida del gato, la de ri\u00f1\u00f3n', 'Preguntar por el canal\u00f3n'],
  fr: ['Sortir les poubelles', 'R\u00e9cup\u00e9rer le colis', 'Les croquettes du chat, celles pour les reins', 'Demander pour la goutti\u00e8re'],
  it: ['Portare fuori la spazzatura', 'Ritirare il pacco', 'Cibo del gatto, quello per i reni', 'Chiedere della grondaia'],
};
// The other finished days in the Calendar (only their dots show), one plain task each.
const OTHER_DAYS = {
  en: ['Water the plants', 'Sort the recycling', 'Book the dentist', 'Take a short walk'],
  de: ['Pflanzen gie\u00dfen', 'Altglas wegbringen', 'Zahnarzt anrufen', 'Kurz spazieren gehen'],
  es: ['Regar las plantas', 'Separar el reciclaje', 'Pedir cita con el dentista', 'Dar un paseo corto'],
  fr: ['Arroser les plantes', 'Trier le recyclage', 'Prendre rendez-vous chez le dentiste', 'Faire une petite marche'],
  it: ['Annaffiare le piante', 'Fare la differenziata', 'Prenotare il dentista', 'Fare una breve passeggiata'],
};
const PARTNER = { en: 'Sam', de: 'Sam', es: 'Sam', fr: 'Sam', it: 'Sam' };

// --- time: Sunday 18 October 2026, in Melbourne ------------------------------------------------------------------
const DAY = 86400000;
/** Melbourne wall-clock ms for 2026-10-DD HH:00 (AEDT is UTC+11 in October). */
const at = (d, h) => Date.UTC(2026, 9, d, h - 11, 0, 0);
const TODAY_ISO = '2026-10-18';

function chromePath() {
  const c = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const found = c.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found; set CHROME=/path/to/chrome');
  return found;
}

function envValue(key) {
  const env = path.join(ROOT, 'client', '.env');
  if (!existsSync(env)) return null;
  const m = readFileSync(env, 'utf8').match(new RegExp(`${key}\\s*=\\s*"?([^"\\n\\r]+)`));
  return m ? m[1].trim() : null;
}
const AI_HOST = new URL(envValue('EXPO_PUBLIC_AI_URL') ?? 'https://api.doubledone.app').host;
const REF = (envValue('EXPO_PUBLIC_SUPABASE_URL') ?? '').match(/https:\/\/([a-z0-9]+)\./i)?.[1] ?? null;

// --- the shots ---------------------------------------------------------------------------------------------------
const tr = (loc, k) => translate(loc, k);
const cast = (loc) => ({
  pharmacy: tr(loc, 'landing.castPharmacy'),
  bins: tr(loc, 'landing.castBins'),
  taxes: tr(loc, 'landing.castTaxes'),
  sam: tr(loc, 'landing.castSam'),
});

const SHOTS = {
  // P1: Close the day, at rest. Nothing finished today, so the screen says "A quiet day, and that's allowed."
  rested: {
    route: '/today',
    hour: 21,
    tasks: (loc) => [{ id: 'r1', title: cast(loc).taxes, done: false, createdAt: at(1, 9), updatedAt: at(18, 9) }],
    extra: { 'doubledone.closed.v1': TODAY_ISO },
    async crop(page, loc) {
      const art = await box(page.locator(`img[alt="${tr(loc, 'closeDay.artAlt')}"]`).first());
      const sub = await box(page.getByText(tr(loc, 'closeDay.restedSub'), { exact: true }).first());
      // The board's region (x 12, 366 wide): the screen's text runs wider than the art, so the crop follows the text.
      return { x: 12, y: art.y - 16, w: 366, h: sub.y + sub.height + 20 - (art.y - 16) };
    },
  },
  // P2: "Here's the plan" for Do my taxes (the break-down plan, served from a fixture).
  plan: {
    route: '/today',
    hour: 14,
    tasks: (loc) => [
      { id: 'p1', title: cast(loc).pharmacy, done: true, completedAt: at(18, 10), createdAt: at(17, 9), updatedAt: at(18, 10) },
      { id: 'p2', title: cast(loc).bins, done: true, completedAt: at(18, 9), createdAt: at(17, 9), updatedAt: at(18, 9) },
      { id: 'p3', title: cast(loc).taxes, done: false, createdAt: at(1, 9), updatedAt: at(18, 9) },
    ],
    async act(page, loc) {
      await hold(page, cast(loc).taxes);
      await page.getByText(tr(loc, 'breakdown.breakDown'), { exact: true }).first().click({ timeout: 15000 });
      await page.waitForTimeout(900);
      // The questions sheet (its questions are the app's own defaults, /clarify is refused): its button goes on.
      await page.getByRole('button', { name: tr(loc, 'actions.breakItDown') }).last().click({ timeout: 15000 });
      await page.getByText(tr(loc, 'breakdown.planTitle'), { exact: true }).first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(900);
    },
    async crop(page, loc) {
      const title = await box(page.getByText(tr(loc, 'breakdown.planTitle'), { exact: true }).first());
      const last = await cardOf(page.getByText(BREAKDOWN_STEPS[loc][3][0], { exact: true }).first());
      // Inside the sheet's own edges (the backdrop and its corners stay out), from above the title to below the last step.
      const x = title.x - 22;
      return { x, y: title.y - 24, w: 390 - 2 * x, h: last.y + last.height + 16 - (title.y - 24) };
    },
  },
  // P3: Today's top on a Low day.
  low: {
    route: '/today',
    hour: 10,
    tasks: (loc) => [
      { id: 'l1', title: cast(loc).pharmacy, done: false, createdAt: at(17, 9), updatedAt: at(18, 9) },
      { id: 'l2', title: cast(loc).taxes, done: false, createdAt: at(1, 9), updatedAt: at(18, 9) },
    ],
    extra: { 'doubledone.dayenergy.v1': JSON.stringify({ date: TODAY_ISO, level: 'low' }) },
    async crop(page, loc) {
      const heading = await box(page.getByText(tr(loc, 'common.today'), { exact: true }).first());
      const low = await box(page.getByText(tr(loc, 'today.energyPillLow'), { exact: true }).first());
      return { x: 0, y: heading.y - 16, w: 390, h: low.y + low.height + 30 - (heading.y - 16) };
    },
  },
  // P4: Settle, the guide on, a moment into the first breath in.
  settle: {
    route: '/settle',
    hour: 14,
    // Reduced motion: the room then shows the shape at rest with the guide's first word already in place, which is
    // what a still picture needs (with motion on, the word is still fading in at any moment a capture can catch).
    delay: 800,
    // NOT on the pinned clock: a fake clock holds the breathing animation on its first frame, where the guide word
    // is still invisible (RN-web's Animated times itself with Date.now). Settle shows no date or time, so it needs none.
    realClock: true,
    tasks: () => [],
    async crop(page, loc) {
      const word = await box(page.getByText(tr(loc, 'settle.guideIn'), { exact: true }).first());
      const bottom = word.y + word.height + 28;
      return { x: 35, y: bottom - 400, w: 320, h: 400 };
    },
  },
  // P5: Ours, a joined room for two, with bin night every Sunday and a parcel for today.
  ours: {
    route: '/ours-list',
    hour: 14,
    ours: true,
    tasks: () => [],
    async crop(page, loc) {
      // Both tab words: in French they wrap onto two rows, so the top follows whichever sits higher.
      const today = await box(page.getByText(tr(loc, 'common.today'), { exact: true }).first());
      const name = await box(page.getByText(tr(loc, 'ours.presetJustUs'), { exact: true }).first());
      const fourth = await cardOf(page.getByText(OURS_ROWS[loc][3], { exact: true }).first());
      const top = Math.min(today.y, name.y) - 16;
      return { x: 12, y: top, w: 366, h: fourth.y + fourth.height + 16 - top };
    },
  },
  // P6: the Calendar on a finished Sunday: Do my taxes, three weeks old, as the big one.
  calendar: {
    route: '/lookback',
    hour: 18,
    viewportH: 1000,
    tasks: (loc) => {
      const c = cast(loc);
      const o = OTHER_DAYS[loc];
      const done = (id, title, d, h, created) => ({ id, title, done: true, completedAt: at(d, h), createdAt: created ?? at(d, 8), updatedAt: at(d, h) });
      return [
        done('k1', c.taxes, 18, 11, at(18, 11) - 21 * DAY),
        done('k2', c.pharmacy, 18, 10),
        done('k3', c.bins, 18, 9),
        done('k4', c.sam, 18, 12),
        done('k5', o[0], 13, 10),
        done('k6', o[1], 15, 10),
        done('k7', o[2], 16, 10),
        done('k8', o[3], 17, 10),
      ];
    },
    async crop(page, loc) {
      // The weekday row sits a row above the 1st; the crop runs from it to the end of the day's list.
      const first = await box(page.getByText('1', { exact: true }).first());
      const sam = await box(page.getByText(cast(loc).sam, { exact: true }).first());
      const top = first.y - 52;
      return { x: 0, y: top, w: 390, h: sam.y + sam.height + 24 - top };
    },
  },
};

// --- helpers -----------------------------------------------------------------------------------------------------
async function box(locator) {
  await locator.waitFor({ timeout: 20000 });
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  return b;
}

/** The box of the bordered card an element sits in (its nearest ancestor with a visible border). */
async function cardOf(locator) {
  await locator.waitFor({ timeout: 20000 });
  const b = await locator.evaluate((el) => {
    let n = el;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderBottomWidth) > 0) break;
      n = n.parentElement;
    }
    const r = (n && n !== document.body ? n : el).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return b;
}

async function hold(page, words) {
  const row = page.getByText(words, { exact: true }).first();
  const b = await box(row);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(700);
}

function seedLocalStorage(payload) {
  for (const [k, v] of Object.entries(payload)) localStorage.setItem(k, v);
}

/** A deterministic Math.random, so the guide word's accent and the rotating phrases are the same every run. */
function pinRandom() {
  let s = 20261018;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const OURS_PAIR = '00000000-1111-2222-3333-444444444444';
const OURS_USER = '55555555-6666-7777-8888-999999999999';
const OURS_PARTNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function stubNetwork(page, loc, shot) {
  // The AI host: one stubbed plan for the break-down picture, and NOTHING else (no telemetry, no spend).
  await page.route((url) => url.host === AI_HOST, async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('/plan')) {
      const steps = BREAKDOWN_STEPS[loc];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plan: { phases: [{ title: cast(loc).taxes, focus: '' }], firstSteps: steps.map(([title, minutes]) => ({ title, minutes })) } }),
      });
    }
    return route.abort();
  });
  if (!shot.ours) return;
  const iso = (ms) => new Date(ms).toISOString();
  const rows = OURS_ROWS[loc].map((title, i) => ({
    pair_id: OURS_PAIR,
    id: `a${i + 1}`,
    title,
    done: false,
    done_at: null,
    recurrence: i === 0 ? { kind: 'weekly', weekdays: [0], start: '2026-09-06' } : null,
    completions: null,
    due: i === 1 ? TODAY_ISO : null,
    created_at: iso(at(10, 9) + i * 60000),
    updated_at: iso(at(17, 9)),
    deleted_at: null,
  }));
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.pathname.endsWith('/pair_members')) {
      return json([
        { pair_id: OURS_PAIR, user_id: OURS_USER, label: 'me', joined_at: iso(at(1, 9)) },
        { pair_id: OURS_PAIR, user_id: OURS_PARTNER, label: PARTNER[loc], joined_at: iso(at(1, 10)) },
      ]);
    }
    if (url.pathname.endsWith('/pairs')) return json([{ id: OURS_PAIR, name: tr(loc, 'ours.presetJustUs'), closed_at: null, disabled_at: null }]);
    if (url.pathname.endsWith('/shared_tasks')) {
      const after = url.searchParams.get('id');
      return json(after && after.startsWith('gt.') ? [] : rows);
    }
    if (url.pathname.includes('/rpc/server_now')) return json(iso(at(18, shot.hour)));
    if (url.pathname.includes('/rpc/')) return json(true);
    return json([]);
  });
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

async function shoot(browser, name, loc, theme, rect) {
  const shot = SHOTS[name];
  const ctx = await browser.newContext({
    viewport: { width: 390, height: shot.viewportH ?? 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    locale: LOCALE_TAG[loc],
    timezoneId: TZ,
  });
  const payload = {
    'doubledone.tasks.v1': JSON.stringify(shot.tasks(loc)),
    'doubledone.settings.v1': JSON.stringify({ theme, textSize: 'default', motion: shot.motion ?? 'reduce', aiEnabled: true }),
    'doubledone.onboarded.v1': 'yes',
    'doubledone.whatsnew.v1': '99',
    'doubledone.holdhint.v1': 'yes',
    'doubledone.reminderoffer.v1': 'yes',
    ...(shot.extra ?? {}),
  };
  if (shot.ours) {
    if (!REF) throw new Error('the Ours shot needs client/.env for the project ref');
    const exp = Math.floor(at(18, 0) / 1000) + 60 * 60 * 24 * 365;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: OURS_USER, role: 'authenticated', exp })}.stub`;
    payload[`sb-${REF}-auth-token`] = JSON.stringify({
      access_token: jwt,
      refresh_token: 'stub',
      token_type: 'bearer',
      expires_in: 31536000,
      expires_at: exp,
      user: { id: OURS_USER, aud: 'authenticated', role: 'authenticated', email: 'you@example.invalid' },
    });
  }
  await ctx.addInitScript(seedLocalStorage, payload);
  await ctx.addInitScript(pinRandom);
  const page = await ctx.newPage();
  if (!shot.realClock) await page.clock.install({ time: new Date(at(18, shot.hour)) });
  await stubNetwork(page, loc, shot);
  await page.goto(`${BASE}${shot.route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.addStyleTag({ content: '#error-toast { display: none !important; } * { caret-color: transparent !important; }' });
  await page.waitForTimeout(1200);
  if (shot.act) await shot.act(page, loc);
  await page.waitForTimeout(shot.delay ?? 500);
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  const r = rect ?? (await shot.crop(page, loc));
  const clip = { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.round(r.w), height: Math.round(r.h) };
  const vp = page.viewportSize();
  if (clip.x + clip.width > vp.width || clip.y + clip.height > vp.height) {
    throw new Error(`${name} ${loc}: the crop runs past the ${vp.width}x${vp.height} viewport (${JSON.stringify(clip)})`);
  }
  const file = path.join(TMP, `${name}-${theme}-${loc}.png`);
  const png = await page.screenshot({ path: file, clip });
  await ctx.close();
  // The PNG's own size (IHDR, bytes 16 to 23), so the page reserves what the file really is.
  return { ...r, imgW: png.readUInt32BE(16), imgH: png.readUInt32BE(20) };
}

async function run() {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  const sizes = existsSync(SIZES_FILE) ? JSON.parse(readFileSync(SIZES_FILE, 'utf8').match(/= (\{[\s\S]*\});/)[1]) : {};
  try {
    for (const name of NAMES) {
      for (const loc of LOCALES) {
        // Light first; dark reuses the SAME crop, so the two files are one size and the page holds one box.
        const rect = await shoot(browser, name, loc, 'light');
        await shoot(browser, name, loc, 'dark', rect);
        sizes[name] = sizes[name] ?? {};
        sizes[name][loc] = [320, Math.round((320 * rect.imgH) / rect.imgW)];
        console.log(`  ✓ ${name} ${loc} (${rect.imgW / 2} x ${rect.imgH / 2})`);
      }
    }
  } finally {
    await browser.close();
  }
  // PNG to WebP at 640 wide, with Pillow (no extra node dependency).
  execFileSync('python', [path.join(ROOT, 'scripts', 'landing-webp.py'), TMP, OUT], { stdio: 'inherit' });
  const body = JSON.stringify(sizes, null, 2);
  writeFileSync(
    SIZES_FILE,
    `// GENERATED by scripts/landing-shots.mjs: the display size (at 320 wide) of each landing picture, per language,\n` +
      `// so the page reserves exactly the right box before the picture loads. Regenerate, never hand-edit.\n` +
      `export const PICTURE_SIZES: Record<string, Record<string, [number, number]>> = ${body};\n`,
  );
  console.log(`landing-shots: ${NAMES.length * LOCALES.length * 2} pictures written to ${path.relative(ROOT, OUT)}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
