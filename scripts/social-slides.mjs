// Instagram carousel slides, 1080x1350 (4:5).
//
// WHY THIS EXISTS. A phone screenshot is roughly 0.46 wide-to-tall. Instagram's tallest feed slot
// is 4:5, or 0.8. Posting a raw screenshot therefore has only two outcomes, and both are bad: it
// letterboxes into a stamp with enormous dead margins, or it centre-crops and throws away the top
// and bottom of the screen. Square (1:1) is worse again.
//
// The fix every good app account uses: never post the raw screenshot. Put the phone on a branded
// slide and let it BLEED off the bottom edge. The frame fills, the phone reads as a phone, and the
// caption does the talking, because nothing phone-sized is legible at feed scale anyway.
//
// Sources are the App Store JPEGs (1320x2868), so this needs no dev server.
//
//   node scripts/social-slides.mjs
//
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'docs', 'appstore');
const OUT = path.join(ROOT, 'docs', 'launch', 'ours', 'instagram');

// 4:5 is Instagram's tallest feed ratio, so it occupies the most screen as somebody scrolls.
const W = 1080;
const H = 1350;

function chromePath() {
  const c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  ].filter(Boolean);
  const f = c.find((p) => existsSync(p));
  if (!f) throw new Error('Chrome not found; set CHROME=/path/to/chrome');
  return f;
}

const b64 = (p) => {
  try { return readFileSync(path.join(ROOT, p)).toString('base64'); } catch { return ''; }
};
const FONT_SERIF = b64('client/assets/fonts/Newsreader_600SemiBold.ttf');
const FONT_SANS = b64('client/assets/fonts/AtkinsonHyperlegible_400Regular.ttf');
const FONT_FACE = `
${FONT_SERIF ? `@font-face{font-family:'NR';src:url(data:font/ttf;base64,${FONT_SERIF}) format('truetype');font-weight:600}` : ''}
${FONT_SANS ? `@font-face{font-family:'AK';src:url(data:font/ttf;base64,${FONT_SANS}) format('truetype');font-weight:400}` : ''}`;
const SERIF = FONT_SERIF ? "'NR', Georgia, serif" : 'Georgia, serif';
const SANS = FONT_SANS ? "'AK', system-ui, sans-serif" : 'system-ui, sans-serif';

// Carousel order matters: slide 1 is the only one most people see, so it leads with the thing that
// is actually new and actually different. Captions carry no exclamation marks and no em-dashes.
// `paper` is the app's own background on that screen, and it is what the bottom of the slide
// dissolves into. Without it the crop severs whatever row happens to sit at the frame edge, and a
// half-cut line of text reads as a mistake rather than as a deliberate bleed.
const LIGHT = '#FAF6F1';
const DARK = '#1B1917';

// `shift` skips that fraction of the screenshot's height before the visible window starts. Most
// screens lead with their own heading and want 0, but the held card sits partway down Today, and
// cropping from the top would show an energy selector instead of the thing the slide is about.
const SETS = {
  // What the app IS. The arc of a day: the promise, the idea, too big, too much, the payoff, comfort.
  core: [
    { file: 'welcome.jpeg', caption: 'A to-do app for people\nwho find to-do apps too much.', paper: LIGHT },
    { file: 'today-light.jpeg', caption: 'The home screen is Today.\nOnly today.', paper: LIGHT },
    { file: 'held-card.jpeg', caption: 'Too big to start?\nHold it. It comes apart.', paper: LIGHT, shift: 0.215 },
    { file: 'settle-light.jpeg', caption: 'Too loud?\nA room, and a breathing guide.', paper: LIGHT },
    { file: 'lookback-light.jpeg', caption: 'Everything you finish,\nyou keep.', paper: LIGHT },
    { file: 'settings-light.jpeg', caption: 'Built to be adjusted.\nText, motion, colour.', paper: LIGHT },
  ],
  // Ours, which gets its own post because it is an argument, not a feature.
  ours: [
    { file: 'ours-room.jpeg', caption: 'One shared list.\nNever a scoreboard.', paper: LIGHT },
    { file: 'today-light.jpeg', caption: 'Only today.\nNothing is ever overdue.', paper: LIGHT },
    { file: 'settle-light.jpeg', caption: 'A quiet room,\nfor when today gets loud.', paper: LIGHT },
    { file: 'ours-when.jpeg', caption: 'A shared day,\nset from either phone.', paper: LIGHT },
    { file: 'lookback-light.jpeg', caption: 'Everything you finish,\nyou keep.', paper: LIGHT },
    { file: 'today-dark.jpeg', caption: 'It has a night face.', paper: DARK },
  ],
};

/** #RRGGBB to "r,g,b", so the dissolve can fade its own paper colour to transparent. */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

// The phone is 78% of the slide width and starts below the caption, so it runs off the bottom of
// the frame. Bleeding is the whole point: a phone fully INSIDE a 4:5 box is a stamp with margins.
const PHONE_W = Math.round(W * 0.78);
const SHOT_AR = 1320 / 2868;
const PHONE_H = Math.round(PHONE_W / SHOT_AR);
const PHONE_TOP = Math.round(H * 0.255);
const BEZEL = Math.max(8, Math.round(PHONE_W * 0.016));
const RADIUS = Math.round(PHONE_W * 0.082);

function slideHTML(caption, shotB64, paper, shift = 0) {
  const lines = caption.split('\n').map((l) => `<span>${l}</span>`).join('');
  const p = rgb(paper);
  const up = Math.round(shift * PHONE_H);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
.slide{position:relative;width:${W}px;height:${H}px;overflow:hidden;
  background:linear-gradient(165deg,#FBF8F2 0%,#F2EADB 58%,#E8DDC8 100%)}
.cap{position:absolute;left:0;right:0;top:${Math.round(H * 0.072)}px;text-align:center;
  font-family:${SERIF};font-weight:600;color:#4a4034;font-size:${Math.round(W * 0.062)}px;
  line-height:1.22;letter-spacing:-.01em;padding:0 ${Math.round(W * 0.09)}px}
.cap span{display:block}
.phone{position:absolute;left:50%;top:${PHONE_TOP}px;transform:translateX(-50%);
  width:${PHONE_W}px;height:${PHONE_H}px;background:#2b2b2e;
  border-radius:${RADIUS}px ${RADIUS}px 0 0;padding:${BEZEL}px ${BEZEL}px 0;
  box-shadow:0 ${Math.round(H * 0.014)}px ${Math.round(H * 0.05)}px rgba(74,52,38,.22)}
.phone .glass{position:relative;width:100%;height:100%;overflow:hidden;
  border-radius:${RADIUS - BEZEL}px ${RADIUS - BEZEL}px 0 0}
.phone img{width:100%;display:block;margin-top:-${up}px}
/* Dissolve the last stretch of screen into the app's OWN paper colour, so whatever row happens to
   land at the frame edge fades out instead of being sliced through its letterforms. Anchored to the
   slide's bottom edge, not the phone's, because the phone runs far past it. */
.fade{position:absolute;bottom:0;height:${Math.round(H * 0.16)}px;pointer-events:none;
  left:${Math.round((W - PHONE_W) / 2) + BEZEL}px;right:${Math.round((W - PHONE_W) / 2) + BEZEL}px;
  background:linear-gradient(to bottom, rgba(${p},0) 0%, rgba(${p},.75) 58%, rgba(${p},1) 100%)}
</style></head><body>
<div class="slide">
  <div class="cap">${lines}</div>
  <div class="phone"><div class="glass"><img src="data:image/jpeg;base64,${shotB64}"></div></div>
  <div class="fade"></div>
</div></body></html>`;
}

async function run() {
  const only = process.env.SET;
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    for (const [set, slides] of Object.entries(SETS)) {
      if (only && only !== set) continue;
      const dir = path.join(OUT, set);
      await mkdir(dir, { recursive: true });
      console.log(`· ${set}`);
      let i = 0;
      for (const s of slides) {
        const src = path.join(SRC, s.file);
        if (!existsSync(src)) { console.log(`  ! skipped, missing ${s.file}`); continue; }
        i += 1;
        const shot = readFileSync(src).toString('base64');
        const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        await page.setContent(slideHTML(s.caption, shot, s.paper ?? LIGHT, s.shift ?? 0), { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready.then(() => true));
        await page.waitForTimeout(220);
        const name = `${String(i).padStart(2, '0')}-${s.file.replace(/\.jpe?g$/, '')}.png`;
        await page.screenshot({ path: path.join(dir, name) });
        await ctx.close();
        console.log(`  ✓ ${set}/${name}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${W}x${H} (4:5) slides in ${path.relative(ROOT, OUT)}/`);
}

run().catch((e) => { console.error(e); process.exit(1); });
