// Composite the real Ours screen into the blank phone in the kitchen-table illustration.
//
// THE PHONE IS DRAWN IN PERSPECTIVE, not merely tilted. Measured across the white region, it is
// about 120px wide at the top and 205px at the bottom: a trapezoid. That is why the first two
// attempts looked wrong. An axis-aligned paste ignored the lean entirely, and fitting a ROTATED
// rectangle then over-rotated to -18 degrees, because the smallest rectangle enclosing a trapezoid
// is a skewed one. Neither shape can match a quad with vanishing-point convergence in it.
//
// So: find the four corners of the white quad, solve the homography that maps the screenshot's
// rectangle onto them, and hand it to CSS as a matrix3d. The screenshot then converges exactly the
// way the illustrated phone does.
//
// Diagnostic worth remembering: the blob's fill ratio (pixels / bounding-box area). A rectangle
// sitting straight fills its own box. 0.58 means tilted, skewed, or both, and it was the signal
// that got misread as "the illustration has a warm sheen" on the first pass.
//
//   node scripts/compose-social.mjs
//   TABLE=... SHOT=... OUT=... node scripts/compose-social.mjs
//
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const TABLE = process.env.TABLE ?? 'C:/Users/molte/Downloads/DoubleDone kitchen table 1200x1500 final.png';
// The App Store JPEG, not docs/screenshots/: 1320x2868 rather than 780x1688, so there is resolution
// to spare once it is scaled into a phone a quarter of the frame wide and then warped.
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

  // Measured values: table is ~240,218,185 (min 185); the screen is 250,247,242 warm-white with a
  // pure 254,254,254 sheen band across the middle; the bezel is ~50,35,27. A min-channel floor of
  // 200 separates screen from table cleanly with room either side.
  const white = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mn > 200 && mx - mn < 26;
  };

  const seen = new Uint8Array(W * H);
  const cx0 = W / 2, cy0 = H / 2;
  const blobs = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = y * W + x;
      if (seen[p] || !white(p * 4)) continue;
      let x0 = x, x1 = x, y0 = y, y1 = y, sx = 0, sy = 0;
      const pts = [];
      const stack = [p];
      seen[p] = 1;
      while (stack.length) {
        const q = stack.pop();
        const qx = q % W, qy = (q / W) | 0;
        pts.push([qx, qy]); sx += qx; sy += qy;
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
      const n = pts.length;
      if (n < 8000) continue;
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      blobs.push({ pts, n, bw: w, bh: h, fill: n / (w * h), dist: Math.hypot(sx / n - cx0, sy / n - cy0) });
    }
  }

  // The illustration has a cream BORDER, so every white pixel touching it floods into one blob the
  // size of the canvas; hence the size ceiling. Then: nearest the middle.
  const cands = blobs.filter((b) => b.bw < W * 0.6 && b.bh < H * 0.6);
  cands.sort((a, b) => a.dist - b.dist);
  const blob = cands[0];
  if (!blob) return { W, H, quad: null };

  // --- convex hull (Andrew's monotone chain) ---
  const pts = blob.pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));

  // --- the four corners: the hull quadrilateral of MAXIMUM area ---
  // Not a min-area rectangle. The shape is a trapezoid, and the largest inscribed quad picks its
  // actual corners; forcing a rectangle onto it is what produced the bogus 18-degree tilt.
  const area4 = (a, b, c, e) => Math.abs(
    (a[0] * b[1] - b[0] * a[1]) + (b[0] * c[1] - c[0] * b[1]) +
    (c[0] * e[1] - e[0] * c[1]) + (e[0] * a[1] - a[0] * e[1])) / 2;
  let best = null;
  const n = hull.length;
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1)
      for (let k = j + 1; k < n; k += 1)
        for (let l = k + 1; l < n; l += 1) {
          const a = area4(hull[i], hull[j], hull[k], hull[l]);
          if (!best || a > best.a) best = { a, q: [hull[i], hull[j], hull[k], hull[l]] };
        }
  if (!best) return { W, H, quad: null };

  // Order the corners TL, TR, BR, BL: sort by angle around the centroid, then rotate the cycle so
  // the corner nearest the top-left of the image comes first.
  const q = best.q.slice();
  const gx = q.reduce((s, p) => s + p[0], 0) / 4;
  const gy = q.reduce((s, p) => s + p[1], 0) / 4;
  q.sort((a, b) => Math.atan2(a[1] - gy, a[0] - gx) - Math.atan2(b[1] - gy, b[0] - gx));
  let start = 0, bestSum = Infinity;
  for (let i = 0; i < 4; i += 1) { const s = q[i][0] + q[i][1]; if (s < bestSum) { bestSum = s; start = i; } }
  const ordered = [q[start], q[(start + 1) % 4], q[(start + 2) % 4], q[(start + 3) % 4]];

  const edge = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  return {
    W, H,
    quad: ordered,
    blobFill: +blob.fill.toFixed(3),
    hull: hull.length,
    topWidth: +edge(ordered[0], ordered[1]).toFixed(1),
    bottomWidth: +edge(ordered[3], ordered[2]).toFixed(1),
    leftHeight: +edge(ordered[0], ordered[3]).toFixed(1),
  };
}, tableB64);

console.log('image', found.W + 'x' + found.H);
if (!found.quad) { await browser.close(); throw new Error('could not find the phone screen'); }
console.log('corners TL,TR,BR,BL:', JSON.stringify(found.quad));
console.log(`top ${found.topWidth}px  bottom ${found.bottomWidth}px  side ${found.leftHeight}px  (bbox fill ${found.blobFill}, hull ${found.hull}pts)`);
const taper = found.bottomWidth / found.topWidth;
console.log(`taper ${taper.toFixed(2)}x  ->  ${taper > 1.15 || taper < 0.87 ? 'genuine perspective, a rotation could never fit this' : 'near-parallel, rotation alone would have been close'}`);

// --- solve the homography mapping the screenshot rect onto those four corners -----------------
// Standard DLT: eight unknowns, four point correspondences, Gaussian elimination.
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let i = 0; i < 8; i += 1) {
    let piv = i;
    for (let r = i + 1; r < 8; r += 1) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
    for (let r = 0; r < 8; r += 1) {
      if (r === i || A[r][i] === 0) continue;
      const f = A[r][i] / A[i][i];
      for (let c2 = i; c2 < 8; c2 += 1) A[r][c2] -= f * A[i][c2];
      b[r] -= f * b[i];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// The element is laid out at BASE wide, its own aspect tall, at the origin; the homography carries
// its corners onto the phone. A generous BASE keeps the warp from softening the text.
const BASE = 600;
const SHOT_AR = 1320 / 2868; // the App Store screenshot's aspect
const baseH = BASE / SHOT_AR;
// A whisker of outward bleed so the screenshot tucks under the drawn bezel instead of leaving a seam.
const BLEED = 3;
const g = found.quad;
const cx = g.reduce((s, p) => s + p[0], 0) / 4;
const cy = g.reduce((s, p) => s + p[1], 0) / 4;
const grown = g.map(([x, y]) => {
  const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1;
  return [x + (dx / len) * BLEED, y + (dy / len) * BLEED];
});
const h = homography([[0, 0], [BASE, 0], [BASE, baseH], [0, baseH]], grown);
const m3d = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]]
  .map((v) => (Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(10))).join(',');

// The clip path follows the quad in the element's own pre-transform space, so the corners stay
// rounded-ish and nothing spills past the illustrated bezel.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${found.W}px;height:${found.H}px;overflow:hidden}
.wrap{position:relative;width:${found.W}px;height:${found.H}px}
.wrap>img.bg{width:${found.W}px;height:${found.H}px;display:block}
.screen{position:absolute;left:0;top:0;width:${BASE}px;height:${baseH.toFixed(2)}px;
  transform-origin:0 0;transform:matrix3d(${m3d});overflow:hidden;border-radius:26px}
.screen img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
/* Lit from the upper left, so the glass carries a soft diagonal sheen and sits a touch below paper
   white. It rides the same transform, because it is a reflection ON the glass. */
.screen::after{content:'';position:absolute;inset:0;border-radius:26px;pointer-events:none;
  background:linear-gradient(148deg, rgba(255,255,255,.30) 0%, rgba(255,255,255,.08) 26%,
    rgba(255,255,255,0) 46%, rgba(43,39,34,.05) 100%);
  box-shadow:inset 0 0 22px rgba(43,39,34,.10)}
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
