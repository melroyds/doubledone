// One-off: composite the real Ours screenshot into the blank phone in the kitchen-table
// illustration, so the launch image shows the actual app rather than an empty rectangle.
// Detects the screen rather than trusting eyeballed coordinates, then renders at 1200x1500.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const TABLE = process.env.TABLE ?? 'C:/Users/molte/Downloads/DoubleDone kitchen table 1200x1500 final.png';
// The App Store JPEG, not docs/screenshots/: it is 1320x2868 rather than 780x1688, so there is
// resolution to spare when it is scaled down into a phone that is a quarter of the frame wide.
const SHOT = process.env.SHOT ?? path.join(process.cwd(), 'docs', 'appstore', 'ours-room.jpeg');
const OUT = process.env.OUT ?? path.join(process.cwd(), 'docs', 'launch', 'ours', '05-kitchen-table.png');

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

for (const f of [TABLE, SHOT]) if (!existsSync(f)) throw new Error(`missing: ${f}`);
const tableB64 = readFileSync(TABLE).toString('base64');
const shotB64 = readFileSync(SHOT).toString('base64');

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });

// --- 1. find the blank screen ---------------------------------------------------------------
const probe = await browser.newPage();
const found = await probe.evaluate(async (data) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;

  // Near-white AND near-neutral. The plate and tea towel are white too, so the discriminator
  // is shape (taller than wide, phone-ish aspect) plus nearness to the image centre.
  const white = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mn > 200 && mx - mn < 26;
  };

  const seen = new Uint8Array(W * H);
  const cx = W / 2, cy = H / 2;
  const blobs = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = y * W + x;
      if (seen[p] || !white(p * 4)) continue;
      let x0 = x, x1 = x, y0 = y, y1 = y, n = 0, sx = 0, sy = 0;
      const stack = [p];
      seen[p] = 1;
      while (stack.length) {
        const q = stack.pop();
        const qx = q % W, qy = (q / W) | 0;
        n += 1; sx += qx; sy += qy;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
        if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const np = ny * W + nx;
          if (seen[np] || !white(np * 4)) continue;
          seen[np] = 1; stack.push(np);
        }
      }
      if (n < 8000) continue;
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      blobs.push({ x: x0, y: y0, w, h, n, ar: +(w / h).toFixed(3), fill: +(n / (w * h)).toFixed(3), dist: Math.round(Math.hypot(sx / n - cx, sy / n - cy)) });
    }
  }
  // A phone screen: portrait, contained well inside the frame, and near the middle.
  //
  // Two things bit the first attempt. The illustration has a cream BORDER, so everything white
  // touching it floods into one blob the size of the whole image; hence the size ceiling. And the
  // drawn screen carries a warm diagonal sheen, so it is not uniformly neutral-white and the fill
  // ratio lands nearer 0.6 than the 0.95 a flat rectangle would give; hence the loose fill floor.
  const phones = blobs.filter((b) =>
    b.w < W * 0.6 && b.h < H * 0.6 && b.h > b.w && b.ar > 0.40 && b.ar < 0.80 && b.fill > 0.35);
  phones.sort((a, b) => a.dist - b.dist);
  return { W, H, pick: phones[0] ?? null, all: blobs.sort((a, b) => b.n - a.n).slice(0, 6) };
}, tableB64);

console.log('image', found.W + 'x' + found.H);
console.log('candidates:', JSON.stringify(found.all));
if (!found.pick) { await browser.close(); throw new Error('could not find the phone screen'); }
const s = found.pick;
console.log('screen at', JSON.stringify(s));

// --- 2. composite ---------------------------------------------------------------------------
// NEGATIVE inset: the white-pixel detection stops at the antialiased edge where the screen meets
// the drawn bezel, so the true screen is a few pixels larger than the blob. Insetting leaves a dark
// rim of illustrated bezel visible around the composite, which reads as a sticker sitting on top of
// the phone rather than a screen inside it. Bleeding outward hides the seam under the bezel.
const INSET = -1;
// The phone is about a quarter of the frame wide, so nothing on it will be READABLE at feed size
// and chasing that is a waste. What matters is that it reads as a calm list at a glance, so the
// screenshot is scaled up slightly and anchored to the top: the title and the first rows carry it,
// and the empty lower half of the screen would say nothing.
const ZOOM = 1.0;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${found.W}px;height:${found.H}px;overflow:hidden}
.wrap{position:relative;width:${found.W}px;height:${found.H}px}
.wrap>img.bg{width:${found.W}px;height:${found.H}px;display:block}
.screen{position:absolute;left:${s.x + INSET}px;top:${s.y + INSET}px;
  width:${s.w - INSET * 2}px;height:${s.h - INSET * 2}px;overflow:hidden;border-radius:19px}
.screen img{width:${(ZOOM * 100).toFixed(1)}%;height:${(ZOOM * 100).toFixed(1)}%;
  margin-left:${(-(ZOOM - 1) * 50).toFixed(1)}%;object-fit:cover;object-position:top center;display:block}
/* The illustration is lit from the upper left, so the glass carries a soft diagonal sheen and
   the screen sits very slightly darker than paper white. Without this it reads as a sticker. */
.screen::after{content:'';position:absolute;inset:0;border-radius:19px;pointer-events:none;
  background:linear-gradient(148deg, rgba(255,255,255,.34) 0%, rgba(255,255,255,.10) 26%,
    rgba(255,255,255,0) 46%, rgba(43,39,34,.05) 100%);
  box-shadow:inset 0 0 10px rgba(43,39,34,.13)}
</style></head><body>
<div class="wrap">
  <img class="bg" src="data:image/png;base64,${tableB64}">
  <div class="screen"><img src="data:image/png;base64,${shotB64}"></div>
</div></body></html>`;

const ctx = await browser.newContext({ viewport: { width: found.W, height: found.H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT });
await browser.close();
console.log('wrote', OUT);
