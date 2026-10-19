// The App Store product page header (3840x1646, text-free) and search results card (3840x2560), in the six slides'
// style. Run `STORE=ios node scripts/play-assets.mjs` first (it leaves the raw captures in the system temp folder),
// then: node scripts/appstore-creative.mjs . "$TEMP/dd-store-shots" docs/appstore/creative
// Apple takes .png or .jpg here (the header slot refused .jpeg), with no alpha channel: Chrome's opaque PNG is RGB.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [ROOT, RAW, OUT] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'playwright-core', 'index.mjs')).href);
const b64 = (p) => readFileSync(p).toString('base64');
const FONTS = `@font-face{font-family:'NR';src:url(data:font/ttf;base64,${b64(path.join(ROOT, 'client/assets/fonts/Newsreader_600SemiBold.ttf'))}) format('truetype');font-weight:600}`;
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')].filter(Boolean).find((p) => existsSync(p));

// The six slides' ground, and the app's own light pools (lib/phase.ts PHASE_POOLS.light).
const GROUND = 'linear-gradient(165deg,#FBF8F2 0%,#F2EADB 58%,#E8DDC8 100%)';
const GLOW = 'rgba(245,178,116,0.42)';
const ROSE = 'rgba(214,148,172,0.24)';

const tick = (d) => `<svg viewBox="0 0 100 100" width="${d}" height="${d}"><circle cx="50" cy="50" r="50" fill="#946475"/><path d="M29 51 L44 66 L72 36" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ring = (d) => `<svg viewBox="0 0 100 100" width="${d}" height="${d}"><circle cx="50" cy="50" r="46" fill="none" stroke="#8A7F73" stroke-width="6"/></svg>`;
const plus = (d) => `<svg viewBox="0 0 100 100" width="${d}" height="${d}"><circle cx="50" cy="50" r="50" fill="#946475"/><path d="M50 30 V70 M30 50 H70" stroke="#fff" stroke-width="9" stroke-linecap="round"/></svg>`;

// Header: Apple's art-safe area is the centre 1646x661 (x 1097-2743, y 493-1154). The card sits inside it.
function headerHTML({ sky = true, card = true, H = 1646, dy = 0 } = {}) {
  const W = 3840, rowW = 1260, rowH = 168, gap = 30, d = 84;
  const rows = [{ done: true, w: 0.55 }, { done: true, w: 0.4 }, { done: false, w: 0.64 }];
  const stackH = rows.length * rowH + (rows.length - 1) * gap, left = (W - rowW) / 2, top = (1646 - stackH) / 2 + dy;
  const p = Math.round(d * 1.55);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden}
.s{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${sky ? GROUND : 'transparent'}}
.g{position:absolute;border-radius:50%;display:${sky ? 'block' : 'none'}}
.row{position:absolute;left:${left}px;width:${rowW}px;height:${rowH}px;background:rgba(255,255,255,0.95);border-radius:40px;
  border:6px solid #6B6F9B;box-shadow:0 18px 50px rgba(74,52,38,.12);display:flex;align-items:center;gap:44px;padding:0 54px}
.bar{height:32px;border-radius:16px;background:#E2D7C8}
.done .bar{background:#EEE7DD}
.p{position:absolute;left:${left + rowW - Math.round(p * 0.55)}px;top:${top + stackH - Math.round(p * 0.66)}px;filter:drop-shadow(0 14px 26px rgba(148,100,117,.35))}
</style></head><body><div class="s">
<div class="g" style="left:${W / 2 - 1700}px;top:${-1500 + dy}px;width:3400px;height:2300px;background:radial-gradient(closest-side,${GLOW},rgba(245,178,116,0))"></div>
<div class="g" style="left:${W * 0.62}px;top:${1646 * 0.38 + dy}px;width:1900px;height:1500px;background:radial-gradient(closest-side,${ROSE},rgba(214,148,172,0))"></div>
<div class="g" style="left:-500px;top:${1646 * 0.45 + dy}px;width:1700px;height:1300px;background:radial-gradient(closest-side,rgba(214,148,172,0.14),rgba(214,148,172,0))"></div>
${!card ? '' : rows.map((r, i) => `<div class="row${r.done ? ' done' : ''}" style="top:${top + i * (rowH + gap)}px">${r.done ? tick(d) : ring(d)}<div class="bar" style="width:${Math.round((rowW - 108 - d - 44) * r.w)}px"></div></div>`).join('')}
${card ? `<div class="p">${plus(p)}</div>` : ''}
</div></body></html>`;
}

// Search results: one big phone and one line. Art-safe area about the centre 2168x1030 (x 836-3004, y 765-1795):
// the line sits wholly inside it; the phone's top, the date and the day's gauge, sits inside it, and its foot bleeds off.
function searchHTML(rawB64, lines) {
  const W = 3840, H = 2560, ratio = 2868 / 1320;
  const cardW = 1040, cardH = Math.round(cardW * ratio), cardL = 1960, cardT = 772;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden}
.s{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${GROUND}}
.g{position:absolute;border-radius:50%}
.cap{position:absolute;left:870px;width:1000px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;
  font-family:'NR',Georgia,serif;font-weight:600;color:#4a4034;font-size:184px;line-height:1.12;letter-spacing:-.01em;text-wrap:balance}
.cap span{display:block}
.card{position:absolute;left:${cardL}px;top:${cardT}px;width:${cardW}px;height:${cardH}px;border-radius:66px;overflow:hidden;
  border:5px solid rgba(74,52,38,.16);box-shadow:0 40px 128px rgba(74,52,38,.22)}
.card img{width:100%;height:100%;display:block;object-fit:cover}
</style></head><body><div class="s">
<div class="g" style="left:${W * 0.18}px;top:-1300px;width:3600px;height:2600px;background:radial-gradient(closest-side,${GLOW},rgba(245,178,116,0))"></div>
<div class="g" style="left:-600px;top:${H * 0.5}px;width:2200px;height:1800px;background:radial-gradient(closest-side,${ROSE},rgba(214,148,172,0))"></div>
<div class="cap">${lines.map((l) => `<span>${l}</span>`).join('')}</div>
<div class="card"><img src="data:image/png;base64,${rawB64}"></div>
</div></body></html>`;
}

const captions = JSON.parse(readFileSync(path.join(ROOT, 'docs/appstore/captions.json'), 'utf8'));
const lines = (captions.en ?? captions)['today'];
if (!Array.isArray(lines) || lines.length !== 2) throw new Error('could not read the today caption from captions.json');
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const shots = [
  { name: 'header-3840x1646.png', w: 3840, h: 1646, html: headerHTML(), png: true, opaque: true },
  { name: 'header-3840x1646.jpg', w: 3840, h: 1646, html: headerHTML() },
  { name: 'search-en-3840x2560.png', w: 3840, h: 2560, html: searchHTML(b64(path.join(RAW, 'ios-today-en.png')), lines), png: true, opaque: true },
  { name: 'search-en-3840x2560.jpg', w: 3840, h: 2560, html: searchHTML(b64(path.join(RAW, 'ios-today-en.png')), lines) },
];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  await page.setContent(s.html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const buf = s.png ? await page.screenshot({ type: 'png', omitBackground: !s.opaque, clip: { x: 0, y: 0, width: s.w, height: s.h } }) : await page.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: s.w, height: s.h } });
  writeFileSync(path.join(OUT, s.name), buf);
  // Preview copies at phone-ish width, to judge how it reads at the size Apple shows it.
  await page.setViewportSize({ width: s.w, height: s.h });
  await page.close();
  console.log('wrote', s.name, buf.length, 'bytes');
}
await browser.close();
console.log('caption lines:', JSON.stringify(lines));
