// DoubleDone store asset generator, Google Play and (STORE=ios) the App Store's captioned slides.
//
// Play (the default, STORE unset). Produces store-ready graphics from the running web app + brand assets:
//   docs/play-store/icon/icon-512.png                       512x512 hi-res icon
//   docs/play-store/feature/feature-1024x500.png            feature graphic
//   docs/play-store/phone/<locale>/01-welcome.png ..        1080x1920 framed screenshots
//   docs/play-store/tablet7/en/..                           1200x1920 framed screenshots (English only; TABLETS=all)
//   docs/play-store/tablet10/en/..                          1600x2560 framed screenshots (English only; TABLETS=all)
//
// Each Play screenshot is the real app (seeded via localStorage, like screenshots.mjs) composited onto a calm
// slide with a one-line caption, so every asset is an exact valid Play size (well within the 2:1 ratio cap).
// Since 1.10.0 (2026-10-25) both stores render every language the app ships: the app's own screens in that
// language, with the same per-language cast of tasks, and captions from docs/play-store/captions.json (Play) and
// docs/appstore/captions.json (App Store), each natively read. Files are numbered, so file order is upload order.
// Spanish is one neutral set, uploaded to both es-419 and es-ES on Play, and to Mexico and Spain on the App Store.
//
// App Store (STORE=ios). Six captioned slides, numbered so file order is upload order:
//   docs/appstore/captioned/6.9/<locale>/01-today.jpeg .. 06-ours.jpeg   1320x2868
//   docs/appstore/captioned/6.5/<locale>/...                             1284x2778
//   docs/appstore/captioned/6.3/<locale>/...                             1206x2622
// One raw capture per shot and language (440x956 at scale 3, so 1320x2868) feeds all three sizes. The captions
// live in docs/appstore/captions.json, and a gate checks them before any browser starts. It NEVER writes
// docs/appstore/*.jpeg: scripts/social-slides.mjs reads those plain screenshots as its source.
//
// Prereq: web dev server on http://localhost:8081 (npm run dev) + Google Chrome.
//   node scripts/play-assets.mjs                         # the whole Play set
//   NAMES=capture,ours-room node scripts/play-assets.mjs # just those Play slides (no icon or feature graphic)
//   STORE=ios node scripts/play-assets.mjs               # the six App Store slides, English
//   LOCALES=en,de,fr,es,it node scripts/play-assets.mjs  # any store, any languages (default: en)
//   PowerShell: $env:STORE='ios'; $env:LOCALES='en,de,fr,es,it'; node scripts/play-assets.mjs
//
// NOTHING real is contacted, in either mode (copied from scripts/landing-shots.mjs, which found each of these
// the hard way): every Supabase read is answered from a fixture, the AI host is refused outright (so a run never
// spends AI or counts as feature usage, even against a production export), the clock is pinned to Sunday
// 18 October 2026 at 14:00 in Melbourne (except Settle, where a fake clock freezes the breathing), Math.random is
// pinned, and the browser's speech recognition is deleted before the app boots, because the web build otherwise
// draws a Speak button that no phone has.
//
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const BASE = process.env.SHOT_URL ?? 'http://localhost:8081';
const ROOT = process.cwd();
const STORE = process.env.STORE === 'ios' ? 'ios' : 'play';
const NAMES = process.env.NAMES ? new Set(process.env.NAMES.split(',').map((s) => s.trim())) : null;
// A locale is only rendered once its store's captions file carries it (the gate).
const LOCALES = (process.env.LOCALES ?? 'en').split(',').map((s) => s.trim());
const OUT = path.join(ROOT, 'docs', 'play-store');
const IOS_OUT = path.join(ROOT, 'docs', 'appstore', 'captioned');
const CAPTIONS_FILE = path.join(ROOT, 'docs', 'appstore', 'captions.json');
const PLAY_CAPTIONS_FILE = path.join(ROOT, 'docs', 'play-store', 'captions.json');
// The raw captures, kept outside the repo so they can be looked at (the corner check) without being committed.
const RAW_DIR = path.join(os.tmpdir(), 'dd-store-shots');
const TZ = 'Australia/Melbourne';
const LOCALE_TAG = { en: 'en-AU', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT' };

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

function envValue(key) {
  const env = path.join(ROOT, 'client', '.env');
  if (!existsSync(env)) return null;
  const m = readFileSync(env, 'utf8').match(new RegExp(`${key}\\s*=\\s*"?([^"\\n\\r]+)`));
  return m ? m[1].trim() : null;
}
const AI_HOST = new URL(envValue('EXPO_PUBLIC_AI_URL') ?? 'https://api.doubledone.app').host;
const REF = (envValue('EXPO_PUBLIC_SUPABASE_URL') ?? '').match(/https:\/\/([a-z0-9]+)\./i)?.[1] ?? null;

// --- the catalogues, bundled so the waits and checks read exactly what the app renders ---------------------------
const bundled = await build({
  entryPoints: [path.join(ROOT, 'client', 'src', 'lib', 'i18n.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { translate } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const tr = (loc, k, p) => translate(loc, k, p);

// --- brand assets as base64 (font + icon embedded so headless Chrome is self-contained) ---
function b64(p) {
  try {
    return readFileSync(path.join(ROOT, p)).toString('base64');
  } catch {
    return '';
  }
}
const ICON = b64('client/assets/images/icon.png');
// A keepsake the scrapbook pipeline really made, seeded as this week's page on the Calendar shots, whose frame ends
// a little way into it. keepsake-store-crop.jpg is the lower-left square of docs/brand/premium-keepsake.jpg (624px
// from y=400, scaled to 768): the original's top third is bare wall, which at the fold read as an empty box. No
// caption, so it reads the same in every language (the Calendar draws a caption only if one is set).
const KEEPSAKE = b64('docs/brand/keepsake-store-crop.jpg');
const FONT_SERIF = b64('client/assets/fonts/Newsreader_600SemiBold.ttf');
const FONT_SANS = b64('client/assets/fonts/AtkinsonHyperlegible_400Regular.ttf');

const FONT_FACE = `
${FONT_SERIF ? `@font-face{font-family:'NR';src:url(data:font/ttf;base64,${FONT_SERIF}) format('truetype');font-weight:600}` : ''}
${FONT_SANS ? `@font-face{font-family:'AK';src:url(data:font/ttf;base64,${FONT_SANS}) format('truetype');font-weight:400}` : ''}`;
const SERIF = FONT_SERIF ? "'NR', Georgia, serif" : 'Georgia, serif';
const SANS = FONT_SANS ? "'AK', system-ui, sans-serif" : 'system-ui, sans-serif';

// --- time: Sunday 18 October 2026, in Melbourne (the date landing-shots.mjs pins) ---------------------------------
const DAY = 86400000;
/** Melbourne wall-clock ms for 2026-10-DD HH:00 (AEDT is UTC+11 in October). */
const at = (d, h) => Date.UTC(2026, 9, d, h - 11, 0, 0);
const TODAY_ISO = '2026-10-18';
const now = at(18, 14);
const noon = at(18, 12);
/** The Melbourne calendar day of a timestamp (every seed time sits near midday, so +11h never flips a day). */
const isoDay = (ms) => new Date(ms + 11 * 3600000).toISOString().slice(0, 10);

// --- the seed data, per language (both stores since 1.10.0), from the catalogue's landing cast and landing-shots.mjs ---
// Copied, not imported, from scripts/landing-shots.mjs (the decision log's rule against a shared scripts/ module:
// the duplication is loud and greppable, a shared import would break both at once). If one changes, check the other.
const OURS_ROWS = {
  en: ['Bin night', 'Pick up the parcel', 'Cat food, the kidney one', 'Ask about the gutter'],
  de: ['M\u00fcll rausstellen', 'Paket abholen', 'Katzenfutter, das f\u00fcr die Nieren', 'Wegen der Dachrinne fragen'],
  es: ['Sacar la basura', 'Recoger el paquete', 'Comida del gato, la de ri\u00f1\u00f3n', 'Preguntar por el canal\u00f3n'],
  fr: ['Sortir les poubelles', 'R\u00e9cup\u00e9rer le colis', 'Les croquettes du chat, celles pour les reins', 'Demander pour la goutti\u00e8re'],
  it: ['Portare fuori la spazzatura', 'Ritirare il pacco', 'Cibo del gatto, quello per i reni', 'Chiedere della grondaia'],
};
const OTHER_DAYS = {
  en: ['Water the plants', 'Sort the recycling', 'Book the dentist', 'Take a short walk'],
  de: ['Pflanzen gie\u00dfen', 'Altglas wegbringen', 'Zahnarzt anrufen', 'Kurz spazieren gehen'],
  es: ['Regar las plantas', 'Separar el reciclaje', 'Pedir cita con el dentista', 'Dar un paseo corto'],
  fr: ['Arroser les plantes', 'Trier le recyclage', 'Prendre rendez-vous chez le dentiste', 'Faire une petite marche'],
  it: ['Annaffiare le piante', 'Fare la differenziata', 'Prenotare il dentista', 'Fare una breve passeggiata'],
};
const PARTNER = { en: 'Sam', de: 'Sam', es: 'Sam', fr: 'Sam', it: 'Sam' };

const cast = (loc) => ({
  pharmacy: tr(loc, 'landing.castPharmacy'),
  bins: tr(loc, 'landing.castBins'),
  taxes: tr(loc, 'landing.castTaxes'),
  sam: tr(loc, 'landing.castSam'),
});

/** Today at 14:00: three open, one already done. The taxes are three weeks old, the held one. Four rows, not five
 *  (1.10.0): with a fifth, the longer languages could not reach the + button's own slot at the list's end without
 *  carrying the date and Menu off the top, and a list sized to be doable is the point of the shot anyway. */
const iosToday = (loc) => {
  const c = cast(loc);
  return [
    { id: 't1', title: c.pharmacy, done: false, createdAt: at(17, 9), updatedAt: at(18, 9) },
    { id: 't2', title: c.sam, done: false, createdAt: at(17, 18), updatedAt: at(18, 9) },
    { id: 't3', title: c.taxes, done: false, createdAt: at(18, 9) - 21 * DAY, updatedAt: at(18, 9) },
    { id: 't5', title: c.bins, done: true, completedAt: at(18, 9), createdAt: at(17, 9), updatedAt: at(18, 9) },
  ];
};

/** The Calendar on a finished Sunday: the three-week-old taxes as the big one, and one plain task on four other days. */
const iosCalendar = (loc) => {
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
};

/** The store shots' shared weekly chore, in place of OURS_ROWS' bin night (which stays on the landing): the slides
 *  pair this room with a Today that has already ticked its own bins, and in four languages the two read as one task
 *  left open (es, fr and it used the very same words). */
const SHARED_CHORE = {
  en: 'Change the sheets',
  de: 'Bettwäsche wechseln',
  es: 'Cambiar las sábanas',
  fr: 'Changer les draps',
  it: 'Cambiare le lenzuola',
};

/** The joined room's rows, true to the same Sunday as Today: the sheets every Saturday, the parcel tomorrow, two that
 *  wait, and the dentist later in the week. Nothing is dated today, because anything dated today would be on Today's slide
 *  too ("Anything with a day reaches both your Todays"), and nothing repeats what Today already shows. */
const iosOurs = (loc) => [
  [SHARED_CHORE[loc], { weekly: true }],
  [OURS_ROWS[loc][1], { due: isoDay(noon + DAY) }],
  [OURS_ROWS[loc][2]],
  [OURS_ROWS[loc][3]],
  [OTHER_DAYS[loc][2], { due: isoDay(noon + 3 * DAY) }], // not [0] or [1] or [3]: the capture slide types those
];

// --- the shots ---------------------------------------------------------------------------------------------------
// Play: listed in the order they should be UPLOADED to the Console, which is the order a shopper swipes. `name` is
// the docs/play-store/captions.json key. Every wait is a catalogue string or a fixture title, never English UI copy,
// so every language renders. Since 1.10.0 the screens carry the same per-language cast as the App Store set.
const PLAY_SHOTS = [
  { name: 'welcome', route: '/welcome', tasks: iosToday, theme: 'light', ready: (loc) => tr(loc, 'welcome.tagline') },
  { name: 'today-light', route: '/today', tasks: iosToday, theme: 'light', ready: (loc) => cast(loc).pharmacy, scrollEnd: true },
  // Today v3's headline: the floating + and the panel it raises, with a few lines typed in. "In one go", not
  // "One tap to add": the + opens the box and Add is a second tap, so the old caption stretched it.
  { name: 'capture', route: '/today', tasks: iosToday, theme: 'light', ready: (loc) => cast(loc).pharmacy, pill: (loc) => [OTHER_DAYS[loc][0], OTHER_DAYS[loc][1], OTHER_DAYS[loc][3]].join('\n') },
  { name: 'ours-room', route: '/ours-list', tasks: () => [], theme: 'light', ours: iosOurs, ready: (loc) => SHARED_CHORE[loc] },
  { name: 'lookback-light', route: '/lookback', tasks: iosCalendar, theme: 'light', ready: (loc) => cast(loc).sam, keepsake: true, fold: 'scrapbook-card' },
  // Held on the gutter (short in every language, so the sheet's title field never clips), and set to Tomorrow, so the
  // sheet says the day reaches both people, which is what the caption promises (Anytime "reaches nobody's day").
  { name: 'ours-when', route: '/ours-list', tasks: () => [], theme: 'light', ours: iosOurs, ready: (loc) => OURS_ROWS[loc][3], hold: (loc) => OURS_ROWS[loc][3], then: 'when-door', pick: (loc) => tr(loc, 'common.tomorrow') },
  { name: 'today-dark', route: '/today', tasks: iosToday, theme: 'dark', ready: (loc) => cast(loc).pharmacy, scrollEnd: true },
  // Settle breathes on a chained Animated loop, so it needs longer than the others to reach a frame
  // worth photographing. `motion: 'system'` on purpose: 'reduce' stops the breathing this shot is OF.
  { name: 'settle-light', route: '/settle', tasks: () => [], theme: 'light', motion: 'system', realClock: true, ready: (loc) => tr(loc, 'settle.guidePillOn'), delay: 2600 },
  // No settings-light since Path C (2026-09-27): it showed "Colour theme PREMIUM", and no Play screenshot
  // may show a Premium surface. The capture shot took its seat.
];

// The App Store six, in upload order. Apple shows the first three in search results, so those carry the pitch:
// the promise, the moment you are stuck, the payoff. `name` is the captions.json key and the file's name.
// Every wait is a catalogue string or a fixture title, never English UI copy, so another language can render.
const IOS_SHOTS = [
  { name: 'today', route: '/today', tasks: iosToday, theme: 'light', ready: (loc) => cast(loc).pharmacy, scrollEnd: true },
  // The held card, where every relief tool lives. Held on the three-week-old taxes, the honest "too big".
  // `topAnchor`, not `scrollEnd`: the card is too tall for the list's end to show the Right now card whole, and a
  // sliver of it across the top edge reads as a mistake.
  { name: 'held-card', route: '/today', tasks: iosToday, theme: 'light', ready: (loc) => cast(loc).taxes, hold: (loc) => cast(loc).taxes, topAnchor: (loc) => tr(loc, 'today.rightNow') },
  { name: 'calendar', route: '/lookback', tasks: iosCalendar, theme: 'light', ready: (loc) => cast(loc).sam, keepsake: true, fold: 'scrapbook-card' },
  // Kept focused: the box's accent edge is the point of this one. No Speak: the phones never draw it.
  { name: 'capture', route: '/today', tasks: iosToday, theme: 'light', ready: (loc) => cast(loc).pharmacy, pill: (loc) => [OTHER_DAYS[loc][0], OTHER_DAYS[loc][1], OTHER_DAYS[loc][3]].join('\n') },
  // Dark, because a cream room on a cream slide washes out, and it shows the night face without its own slot.
  // The real clock (a fake one holds the breathing on its first frame) and real motion (reduce stops it).
  { name: 'settle', route: '/settle', tasks: () => [], theme: 'dark', motion: 'system', realClock: true, ready: (loc) => tr(loc, 'settle.guidePillOn'), delay: 2600 },
  // A joined room for two, so it never reads "Waiting for your person".
  { name: 'ours', route: '/ours-list', tasks: () => [], theme: 'light', ours: iosOurs, ready: (loc) => SHARED_CHORE[loc] },
];

const PLAY_DEVICES = [
  { dir: 'phone', w: 1080, h: 1920 },
  { dir: 'tablet7', w: 1200, h: 1920, tablet: true },
  { dir: 'tablet10', w: 1600, h: 2560, tablet: true },
];
// The tablet slides are made for the default listing's language only (Melroy, 2026-10-25: 120 slides was overkill).
// A translated Play listing with no tablet shots of its own shows the default's, and almost nobody runs this app on
// a tablet, so four more tablet sets would cost 64 uploads and about 48 MB of public repo for next to nothing.
// TABLETS=all makes them anyway.
const TABLET_LOCALES = process.env.TABLETS === 'all' ? null : new Set(['en']);
// Apple's iPhone slots, all from the one 1320x2868 raw: 6.9" Dynamic Island large, 6.5" Face ID large (the slot
// App Store Connect demanded on 2026-08-17), 6.3" Dynamic Island medium (the one Apple's page now calls required).
const IOS_DEVICES = [
  { dir: '6.9', w: 1320, h: 2868 },
  { dir: '6.5', w: 1284, h: 2778 },
  { dir: '6.3', w: 1206, h: 2622 },
];

const RAW_VP = STORE === 'ios' ? { width: 440, height: 956 } : { width: 412, height: 892 };
const RAW_SCALE = STORE === 'ios' ? 3 : 2;
/** How much of a `fold` element the frame shows, in CSS px: the keepsake's heading and the top of its picture. The
 *  scroll may give back up to the gap between the two to keep whatever it cut at the top edge whole. */
const FOLD_SHOW = 200;
const FOLD_MIN = 140;
const RAW_RATIO = RAW_VP.height / RAW_VP.width;

// --- the caption gate ---------------------------------------------------------------------------------------------
/**
 * Every problem with the captions, as plain lines (an empty list passes). Each App Store shot needs a caption in
 * every language being rendered, of one or two authored lines. Nothing in a caption may be a dash, "!", a digit
 * or a currency (Apple 2.3.7, no prices), another platform (2.3.10) or a biller (the Android payments rule, if a
 * caption is ever reused there), or a feature the phones do not have. French needs its no-break space before
 * ? ! : ; as the catalogues do.
 */
function captionProblems(entries) {
  const out = [];
  const BANNED = [
    [/[\u2010-\u2015\u2212]|\s-\s|^-|-$/, 'a dash'],
    [/!/, 'an exclamation mark'],
    [/\p{Nd}/u, 'a digit'],
    [/[$\u00a2-\u00a5\u20a0-\u20cf]|\b(?:AUD|USD|EUR|GBP|dollars?|euros?)\b/i, 'a currency'],
    [/\b(?:android|google|play|stripe)\b/i, 'another platform or a biller'],
    [/\b(?:widget|speak)\b/i, 'a feature the phones do not have'],
  ];
  for (const { where, loc, lines } of entries) {
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 2) {
      out.push(`${where}: needs one or two lines, has ${Array.isArray(lines) ? lines.length : typeof lines}`);
      continue;
    }
    for (const line of lines) {
      if (typeof line !== 'string' || !line.trim()) out.push(`${where}: an empty line`);
      else if (line !== line.trim() || /\s{2}/.test(line)) out.push(`${where}: stray spaces in "${line}"`);
      for (const [re, what] of BANNED) if (re.test(line)) out.push(`${where}: "${line}" has ${what}`);
      if (loc === 'fr' && /(?:^|[^\u00a0\u202f])[?!:;]/.test(line)) out.push(`${where}: "${line}" needs a no-break space before ? ! : ;`);
    }
  }
  return out;
}

/** One store's captions, gated. The App Store's are one or two authored lines (arrays); Play's are one sentence each
 *  (a string, which may wrap on the slide). */
function loadCaptions(file, shots, store) {
  const all = JSON.parse(readFileSync(file, 'utf8'));
  const entries = [];
  const problems = [];
  for (const loc of LOCALES) {
    if (!LOCALE_TAG[loc]) problems.push(`${loc}: not a language the app ships`);
    const set = all[loc];
    if (!set) {
      problems.push(`${loc}: ${path.relative(ROOT, file)} has no "${loc}" captions`);
      continue;
    }
    for (const shot of shots) {
      if (!(shot.name in set)) problems.push(`${store}/${loc}/${shot.name}: no caption`);
      else {
        const c = set[shot.name];
        entries.push({ where: `${store}/${loc}/${shot.name}`, loc, lines: store !== 'play' ? c : [Array.isArray(c) ? c.join(' ') : c] });
      }
    }
    for (const k of Object.keys(set)) if (!shots.some((s) => s.name === k)) problems.push(`${store}/${loc}/${k}: a caption for no shot`);
  }
  problems.push(...captionProblems(entries));
  if (problems.length) throw new Error(`${path.relative(ROOT, file)} fails the caption gate:\n  ${problems.join('\n  ')}`);
  return all;
}
const iosCaptions = () => loadCaptions(CAPTIONS_FILE, IOS_SHOTS, 'ios');
const playCaptions = () => loadCaptions(PLAY_CAPTIONS_FILE, PLAY_SHOTS, 'play');

// --- the capture -------------------------------------------------------------------------------------------------
const OURS_PAIR = '00000000-1111-2222-3333-444444444444';
const OURS_USER = '55555555-6666-7777-8888-999999999999';
const OURS_PARTNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function seedLocalStorage(payload) {
  for (const [k, v] of Object.entries(payload)) localStorage.setItem(k, v);
}

/** A deterministic Math.random, so Settle's guide accent and the rotating phrases are the same every run. */
function pinRandom() {
  let s = 20261018;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** No speech recognition, so the web build draws the capture panel a phone draws: no Speak button. */
function noSpeech() {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
}

/** A session supabase-js accepts from storage without asking anybody. Not a credential: every request it could
 *  authenticate is answered by `stubNetwork` and never reaches the internet. The one real value is the storage
 *  KEY, derived from the project ref, lifted from client/.env (gitignored) so it is never written down here. */
function oursSession() {
  if (!REF) throw new Error('the Ours shots need client/.env for the project ref');
  const exp = Math.floor(at(18, 0) / 1000) + 60 * 60 * 24 * 365;
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: OURS_USER, role: 'authenticated', exp })}.stub`;
  return {
    key: `sb-${REF}-auth-token`,
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

/** The AI host refused, and (for an Ours shot) every Supabase read answered from a two-person fixture. */
async function stubNetwork(page, loc, shot, ours) {
  await page.route((url) => url.host === AI_HOST, (route) => route.abort());
  if (!ours) return;
  const iso = (ms) => new Date(ms).toISOString();
  const rows = ours.map(([title, o = {}], i) => ({
    pair_id: OURS_PAIR,
    id: `a${i + 1}`,
    title,
    done: false,
    done_at: null,
    recurrence: o.weekly ? { kind: 'weekly', weekdays: [6], start: '2026-09-05' } : null, // Saturdays, from a Saturday
    completions: null,
    due: o.due ?? null,
    created_at: iso(at(10, 9) + i * 60000),
    updated_at: iso(at(17, 9)),
    deleted_at: null,
  }));
  const pairName = tr(loc, 'ours.presetJustUs');
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.pathname.endsWith('/pair_members')) {
      // TWO members: with one, the room reads "Waiting for your person · Get a new code", which a store page
      // showed for months.
      return json([
        { pair_id: OURS_PAIR, user_id: OURS_USER, label: 'me', joined_at: iso(at(1, 9)) },
        { pair_id: OURS_PAIR, user_id: OURS_PARTNER, label: PARTNER[loc], joined_at: iso(at(1, 10)) },
      ]);
    }
    if (url.pathname.endsWith('/pairs')) return json([{ id: OURS_PAIR, name: pairName, closed_at: null, disabled_at: null }]);
    if (url.pathname.endsWith('/shared_tasks')) {
      // pullPair keyset-walks and stops on an EMPTY page, so the second call must return nothing.
      const after = url.searchParams.get('id');
      return json(after && after.startsWith('gt.') ? [] : rows);
    }
    if (url.pathname.includes('/rpc/server_now')) return json(iso(at(18, shot.hour ?? 14)));
    if (url.pathname.includes('/rpc/')) return json(true);
    return json([]);
  });
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

const val = (v, loc) => (typeof v === 'function' ? v(loc) : v);

async function captureRaw(browser, shot, loc) {
  const ctx = await browser.newContext({
    viewport: RAW_VP,
    deviceScaleFactor: RAW_SCALE,
    colorScheme: shot.theme === 'dark' ? 'dark' : 'light',
    locale: LOCALE_TAG[loc],
    timezoneId: TZ,
  });
  const ours = val(shot.ours, loc);
  const payload = {
    'doubledone.tasks.v1': JSON.stringify(val(shot.tasks, loc)),
    'doubledone.settings.v1': JSON.stringify({ theme: shot.theme, textSize: 'default', motion: shot.motion ?? 'reduce', aiEnabled: true }),
    // Seeded state must bypass EVERY render gate, not just supply data. Without `onboarded` the first-run
    // redirect eats the Today shot, without `whatsnew` the announcement card grows on it, and without `holdhint`
    // the one-time "Hold a task for more" coachmark sits on every Today shot.
    'doubledone.onboarded.v1': 'yes',
    'doubledone.whatsnew.v1': '99',
    'doubledone.holdhint.v1': 'yes',
    'doubledone.reminderoffer.v1': 'yes',
  };
  if (ours) {
    const session = oursSession();
    payload[session.key] = session.value;
  }
  if (shot.keepsake && KEEPSAKE) {
    payload['doubledone.scrapbooks.v1'] = JSON.stringify([{ weekStart: TODAY_ISO, image: `data:image/jpeg;base64,${KEEPSAKE}`, caption: '', createdAt: at(18, 13) }]);
  }
  await ctx.addInitScript(seedLocalStorage, payload);
  await ctx.addInitScript(pinRandom);
  await ctx.addInitScript(noSpeech);
  const page = await ctx.newPage();
  if (!shot.realClock) await page.clock.install({ time: new Date(at(18, shot.hour ?? 14)) });
  await stubNetwork(page, loc, shot, ours);
  await page.goto(`${BASE}${shot.route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const ready = shot.waitText ?? val(shot.ready, loc);
  if (ready) await page.getByText(ready, { exact: false }).first().waitFor({ timeout: 60000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  // The dev server's error toast (#error-toast, Expo's web LogBox) floats in the bottom-left corner whenever
  // anything logged a warning, and its fast-refresh badge (.__expo_fast_refresh, a lightning bolt) sits there for
  // the first moments of a run (it covered the capture panel's When pill in 1.10.0's first English set). Neither is
  // the app, so neither belongs in a shot. Nor does a caret caught mid-blink.
  await page.addStyleTag({ content: '#error-toast, .__expo_fast_refresh { display: none !important; } * { caret-color: transparent !important; }' });
  await page.waitForTimeout(shot.delay ?? 700); // let the calm fades settle

  // `hold`: long-press a row by its words, then tap something on the card that opens. The held card and the
  // When sheet are state rather than routes, so no amount of seeding reaches them.
  const hold = val(shot.hold, loc);
  if (hold) {
    const row = page.getByText(hold, { exact: false }).first();
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
    const pick = val(shot.pick, loc);
    if (pick) {
      // Visible only: in English the last "Tomorrow" on the page is a hidden one, and `.last()` alone waited on it
      // until the timeout (German happened to pass).
      await page.getByText(pick, { exact: true }).filter({ visible: true }).last().click({ timeout: 15000 });
      await page.waitForTimeout(500);
    }
  }

  // `pill`: open the capture panel from the floating + and type into it (the Today v3 capture is state, not a
  // route). By testID, so it works in every locale.
  const pill = val(shot.pill, loc);
  if (pill) {
    await page.locator('[data-testid="capture-pill"]').first().click({ timeout: 15000 });
    await page.waitForTimeout(700);
    await page.locator('[data-testid="capture-field"]').first().fill(pill);
    await page.waitForTimeout(500);
  }

  // Drop whatever the screen focused on arrival (the rooms focus their heading for screen readers), or the
  // browser paints its focus ring round it in a shot nobody tapped into. The capture shot keeps its focus.
  if (!pill) await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  // `scrollEnd`: bring the list to its end, where the floating + rests in its own slot below the last line.
  if (shot.scrollEnd) {
    const menu = page.getByText(tr(loc, 'today.menu'), { exact: true }).first();
    const menuTop = (await menu.count()) ? ((await menu.boundingBox())?.y ?? null) : null;
    await page.evaluate((menuTop) => {
      const els = [...document.querySelectorAll('div')].filter((d) => /auto|scroll/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 4);
      const el = els.sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (!el) return;
      // The Menu pill's top, measured unscrolled, less a little air: the furthest the list may go.
      const cap = menuTop == null ? el.scrollHeight : Math.max(0, menuTop + el.scrollTop - 12);
      el.scrollTop = Math.min(el.scrollHeight, cap);
    }, menuTop);
    await page.waitForTimeout(400);
  }
  // `fold`: scroll (down only) until that element's top sits FOLD_SHOW px above the bottom edge, so the frame ends
  // inside it. The Calendar needs it: at Play's shorter viewport, and wherever a longer language wraps the subtitle or
  // the day list, the keepsake fell below the frame and its heading read as an empty box.
  if (shot.fold) {
    await page.locator(`[data-testid="${shot.fold}"]`).first().evaluate((el, { show, min }) => {
      let s = el.parentElement;
      while (s && !(/auto|scroll/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight + 4)) s = s.parentElement;
      if (!s) return;
      const over = el.getBoundingClientRect().top - (s.getBoundingClientRect().bottom - show);
      if (over <= 0) return;
      s.scrollTop += over;
      // Never leave anything sliced at the top edge (the Calendar's title and header art read as broken strips).
      // For the topmost thing the edge cuts, step back until it is whole if the frame still shows enough of `el`,
      // else carry on until it is gone. Repeat, since a step can cut the next thing.
      const box = () => s.getBoundingClientRect();
      const cutAtTop = () => {
        const t = box().top;
        return [...s.querySelectorAll('*')]
          .filter((d) => d.tagName === 'IMG' || getComputedStyle(d).backgroundImage !== 'none' || (d.children.length === 0 && d.textContent.trim()))
          .map((d) => d.getBoundingClientRect())
          .filter((r) => r.height > 4 && r.height < box().height / 2 && r.top < t - 1 && r.bottom > t + 1) // not a backdrop
          .sort((a, b) => a.top - b.top)[0];
      };
      for (let i = 0; i < 6; i++) {
        const r = cutAtTop();
        if (!r) break;
        const t = box().top;
        const back = t - r.top + 6;
        const shownAfterBack = box().bottom - (el.getBoundingClientRect().top + back);
        s.scrollTop += shownAfterBack >= min ? -back : r.bottom - t + 6;
      }
    }, { show: FOLD_SHOW, min: FOLD_MIN });
    await page.waitForTimeout(400);
  }
  // `topAnchor`: scroll so the card holding that catalogue string sits just under the top edge.
  const anchor = val(shot.topAnchor, loc);
  if (anchor) {
    const target = page.getByText(anchor, { exact: true }).first();
    await target.waitFor({ timeout: 20000 });
    await target.evaluate((el) => {
      let n = el;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderBottomWidth) > 0) break;
        n = n.parentElement;
      }
      const card = n && n !== document.body ? n : el;
      let s = card.parentElement;
      while (s && !(/auto|scroll/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight + 4)) s = s.parentElement;
      if (!s) return;
      s.scrollTop += card.getBoundingClientRect().top - 10;
      // Whatever sits above the card must not peek in. The selected energy chip's bottom border showed as a 1px line
      // at the top edge whatever the offset (14, 10, 6), because in four languages the list was already at its
      // furthest scroll. So step BACK until each thing the edge cuts shows whole (the energy row, then its label),
      // which works at the scroll limit too. Small things only: a backdrop or a section always straddles.
      for (let i = 0; i < 4; i++) {
        const t = s.getBoundingClientRect().top;
        const cut = [...s.querySelectorAll('*')]
          .filter((d) => !d.contains(card))
          .map((d) => d.getBoundingClientRect())
          .filter((r) => r.height > 0 && r.height < 80 && r.top < t - 0.5 && r.bottom > t + 0.5);
        if (!cut.length) break;
        s.scrollTop -= t - Math.min(...cut.map((r) => r.top)) + 8;
      }
    });
    await page.waitForTimeout(400);
  }

  // Truth checks on the picture itself, both stores: a capture panel with Speak, or a room still waiting for
  // its second person, has already gone to a store page once each.
  if (pill && (await page.getByText(tr(loc, 'capture.speak'), { exact: true }).count())) {
    throw new Error(`${shot.name} ${loc}: the capture panel shows Speak, which no phone has`);
  }
  if (ours && (await page.getByText(tr(loc, 'ours.waitingTitle'), { exact: false }).count())) {
    throw new Error(`${shot.name} ${loc}: the room still reads "${tr(loc, 'ours.waitingTitle')}"`);
  }

  const buf = await page.screenshot();
  await ctx.close();
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(path.join(RAW_DIR, `${STORE}-${shot.name}-${loc}.png`), buf);
  return buf.toString('base64');
}

// --- the slides --------------------------------------------------------------------------------------------------
/** A Play caption as unbreakable pieces, so a wrap falls after a comma or a full stop rather than stranding "para",
 *  "quand" or "wenn" at a line's end (the 1.10.0 native read). A string splits itself there; an array in the json
 *  names its own pieces, for a sentence with no comma to break at. One line when it fits, either way. */
function captionPieces(c) {
  const pieces = Array.isArray(c) ? c : c.split(/(?<=[,.;:?]) +/);
  return pieces.map((p) => `<span class="seg">${escapeHTML(p)}</span>`).join(' ');
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
.cap{font-family:${SERIF};font-weight:600;color:#4a4034;font-size:${capSize}px;line-height:1.22;width:${Math.round(w * 0.82)}px;
  height:${Math.round(capSize * 1.22 * 2)}px;display:flex;align-items:flex-end;justify-content:center}
.capt{text-align:center;text-wrap:balance}
.seg{display:inline-block}
.phone{width:${phoneW}px;height:${phoneH}px;background:#2b2b2e;border-radius:${radius}px;padding:${bezel}px;
  box-shadow:0 ${Math.round(h * 0.016)}px ${Math.round(h * 0.05)}px rgba(74,52,38,.20)}
.phone img{width:100%;height:100%;display:block;border-radius:${radius - bezel}px;object-fit:cover}
.word{position:absolute;left:0;right:0;bottom:${Math.round(h * 0.028)}px;text-align:center;font-family:${SERIF};
  font-weight:600;color:#a4988388;color:rgba(120,108,90,.65);font-size:${wordSize}px;letter-spacing:.5px}
</style></head><body>
<div class="slide">
  <div class="cap"><div class="capt">${caption}</div></div>
  <div class="phone"><img src="data:image/png;base64,${rawB64}"></div>
  <div class="word">DoubleDone</div>
</div></body></html>`;
}

const escapeHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The App Store slide. Every measure is a proportion of the slide, so one template renders all three sizes.
 * A frameless screen card (no bezel: a generic dark phone body reads as another platform's device under 2.3.10,
 * and the icon and name already sit right above the shots in the listing), the caption as two authored lines
 * at about 7.5% of the slide width, and the same warm opaque gradient as Play.
 */
function iosSlideHTML({ w, h, lines, rawB64 }) {
  const capSize = Math.round(w * 0.075);
  const capTop = Math.round(h * 0.07);
  const cardH = Math.round(h * 0.76);
  const cardW = Math.round(cardH / RAW_RATIO);
  const cardTop = h - Math.round(h * 0.052) - cardH;
  const radius = Math.round(cardW * 0.055);
  const hair = Math.max(2, Math.round(w / 660));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
.slide{position:relative;width:${w}px;height:${h}px;overflow:hidden;
  background:linear-gradient(165deg,#FBF8F2 0%,#F2EADB 58%,#E8DDC8 100%)}
.cap{position:absolute;left:0;right:0;top:${capTop}px;text-align:center;font-family:${SERIF};font-weight:600;
  color:#4a4034;font-size:${capSize}px;line-height:1.18;letter-spacing:-.01em;padding:0 ${Math.round(w * 0.06)}px}
.cap span{display:block}
.card{position:absolute;left:${Math.round((w - cardW) / 2)}px;top:${cardTop}px;width:${cardW}px;height:${cardH}px;
  border-radius:${radius}px;overflow:hidden;border:${hair}px solid rgba(74,52,38,.16);
  box-shadow:0 ${Math.round(h * 0.016)}px ${Math.round(h * 0.05)}px rgba(74,52,38,.20)}
.card img{width:100%;height:100%;display:block;object-fit:cover}
</style></head><body>
<div class="slide">
  <div class="cap">${lines.map((l) => `<span>${escapeHTML(l)}</span>`).join('')}</div>
  <div class="card"><img src="data:image/png;base64,${rawB64}"></div>
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

/** The width and height a JPEG's own frame header (SOFn) declares. A file can be named right and sized wrong. */
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) throw new Error(`JPEG marker expected at byte ${i}`);
    const m = buf[i + 1];
    if (m === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
      i += 2;
      continue;
    }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no JPEG frame header');
}

async function renderExact(browser, html, w, h, outPath, check) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(250);
  if (check) await check(page);
  if (outPath.endsWith('.jpeg')) {
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 92 });
    const size = jpegSize(readFileSync(outPath));
    if (size.w !== w || size.h !== h) throw new Error(`${outPath} is ${size.w}x${size.h}, not ${w}x${h}`);
  } else {
    await page.screenshot({ path: outPath });
  }
  await ctx.close();
}

/** The App Store layout guard: each authored line renders as ONE line, and the caption clears the card. A wrapped
 *  line steals a line's height and runs into the screen, and German is the language that will trip it. */
function layoutGuard(where) {
  return async (page) => {
    const bad = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('.cap span')];
      const one = parseFloat(getComputedStyle(spans[0]).lineHeight);
      const wrapped = spans.filter((s) => s.getBoundingClientRect().height > one * 1.4).map((s) => s.textContent);
      const capBottom = document.querySelector('.cap').getBoundingClientRect().bottom;
      const cardTop = document.querySelector('.card').getBoundingClientRect().top;
      return { wrapped, gap: cardTop - capBottom, need: window.innerHeight * 0.015 };
    });
    if (bad.wrapped.length) throw new Error(`${where}: "${bad.wrapped[0]}" wraps onto two lines, shorten it`);
    if (bad.gap < bad.need) throw new Error(`${where}: the caption runs into the screen card (${Math.round(bad.gap)}px clear)`);
  };
}

async function runPlay(browser, captions) {
  const shots = PLAY_SHOTS.map((s, i) => ({ ...s, file: `${String(i + 1).padStart(2, '0')}-${s.name}.png` })).filter(
    (s) => !NAMES || NAMES.has(s.name),
  );
  if (NAMES && shots.length !== NAMES.size) throw new Error(`NAMES has a slide Play does not: ${[...NAMES].join(', ')}`);
  for (const d of NAMES ? [] : ['icon', 'feature']) await mkdir(path.join(OUT, d), { recursive: true });
  for (const loc of LOCALES) {
    console.log(`· ${loc}: capturing raw app screens (${RAW_VP.width}x${RAW_VP.height} at ${RAW_SCALE})`);
    const raws = {};
    for (const shot of shots) {
      raws[shot.name] = await captureRaw(browser, shot, loc);
      console.log(`  ✓ ${shot.name}`);
    }
    for (const dev of PLAY_DEVICES) {
      if (dev.tablet && TABLET_LOCALES && !TABLET_LOCALES.has(loc)) continue;
      const dir = path.join(OUT, dev.dir, loc);
      if (!dir.startsWith(OUT + path.sep)) throw new Error(`refusing to write outside ${OUT}`);
      await mkdir(dir, { recursive: true });
      for (const shot of shots) {
        const html = slideHTML({ w: dev.w, h: dev.h, caption: captionPieces(captions[loc][shot.name]), rawB64: raws[shot.name] });
        await renderExact(browser, html, dev.w, dev.h, path.join(dir, shot.file));
        console.log(`  ✓ ${dev.dir}/${loc}/${shot.file}`);
      }
    }
  }
  // The icon and the feature graphic only on a whole-set run: a NAMES run regenerates just the slides it names.
  if (!NAMES) {
    console.log('· icon + feature graphic');
    await renderExact(browser, iconHTML(), 512, 512, path.join(OUT, 'icon', 'icon-512.png'));
    await renderExact(browser, featureHTML(), 1024, 500, path.join(OUT, 'feature', 'feature-1024x500.png'));
    console.log('  ✓ icon-512, feature-1024x500');
  }
  console.log(`\nwrote Play assets to ${path.relative(ROOT, OUT)}/ (raw captures in ${RAW_DIR})`);
}

async function runIos(browser, captions) {
  const shots = IOS_SHOTS.map((s, i) => ({ ...s, file: `${String(i + 1).padStart(2, '0')}-${s.name}.jpeg` })).filter(
    (s) => !NAMES || NAMES.has(s.name),
  );
  if (NAMES && shots.length !== NAMES.size) throw new Error(`NAMES has a slide the App Store set does not: ${[...NAMES].join(', ')}`);
  for (const loc of LOCALES) {
    console.log(`· ${loc}: capturing raw app screens (${RAW_VP.width}x${RAW_VP.height} at ${RAW_SCALE})`);
    const raws = {};
    for (const shot of shots) {
      raws[shot.name] = await captureRaw(browser, shot, loc);
      console.log(`  ✓ ${shot.name}`);
    }
    for (const dev of IOS_DEVICES) {
      const dir = path.join(IOS_OUT, dev.dir, loc);
      if (!dir.startsWith(IOS_OUT + path.sep)) throw new Error(`refusing to write outside ${IOS_OUT}`);
      await mkdir(dir, { recursive: true });
      for (const shot of shots) {
        const where = `${dev.dir}/${loc}/${shot.file}`;
        const html = iosSlideHTML({ w: dev.w, h: dev.h, lines: captions[loc][shot.name], rawB64: raws[shot.name] });
        await renderExact(browser, html, dev.w, dev.h, path.join(dir, shot.file), layoutGuard(where));
        console.log(`  ✓ ${where} (${dev.w}x${dev.h})`);
      }
    }
  }
  console.log(`\nwrote App Store slides to ${path.relative(ROOT, IOS_OUT)}/ (raw captures in ${RAW_DIR})`);
}

async function run() {
  // The gate runs before any browser starts, so a bad caption costs nothing.
  const captions = STORE === 'ios' ? iosCaptions() : playCaptions();

  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    if (STORE === 'ios') await runIos(browser, captions);
    else await runPlay(browser, captions);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
