// Sharing the scrapbook keepsake (web): composite the keepsake PAGE (image + caption
// band) on a canvas, then the Web Share API with the page as a file where the browser
// supports it (Chrome/Edge/Android, Safari), otherwise a plain download so the user
// still walks away with the jpeg. The caption rides IN THE PIXELS, mirroring native's
// view-shot page: text attached beside an image is freely dropped by receiving apps,
// while nobody can strip what is part of the picture. Still never raw task titles, and
// never a link. A share-sheet cancel is the user changing their mind, not an error, so
// it reports 'shared' and the screen stays quiet. If compositing fails (an old browser,
// a CORS hiccup on the image fetch), the bare image shares exactly as before.
import { wrapLines } from './scrapbook';

export type ShareOutcome = 'shared' | 'saved' | 'unavailable';

// The keepsake page's fixed palette and metrics (the artifact is cream regardless of the
// viewer's theme, like a physical scrapbook page). Widths in canvas px at a 1080 page.
const PAGE_W = 1080;
const PAGE_BG = '#F6F2E9';
const CAPTION_INK = '#2F2A23';
const META_INK = '#8A8172';
const CAPTION_FONT = 'italic 44px Newsreader, Georgia, serif';
const CAPTION_LINE = 62;
const META_FONT = '30px "Atkinson Hyperlegible", system-ui, sans-serif';
const META_LINE = 40;
const PAD_V = 56;
const PAD_H = 72;
const GAP = 24;

async function composeKeepsakePage(image: string, caption: string, weekMeta: string): Promise<Blob> {
  const src = await (await fetch(image)).blob();
  const bmp = await createImageBitmap(src);
  // Make sure the page fonts are actually loaded before measuring/drawing with them.
  await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  const imgH = Math.round((bmp.height / bmp.width) * PAGE_W);
  ctx.font = CAPTION_FONT;
  const lines = caption ? wrapLines(caption, PAGE_W - PAD_H * 2, (s) => ctx.measureText(s).width) : [];
  const bandH = PAD_V * 2 + (lines.length > 0 ? lines.length * CAPTION_LINE + GAP : 0) + (weekMeta ? META_LINE : 0);
  // Sizing the canvas RESETS the 2d state, so every style below is set after this line.
  canvas.width = PAGE_W;
  canvas.height = imgH + bandH;
  ctx.fillStyle = PAGE_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, PAGE_W, imgH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = imgH + PAD_V + CAPTION_LINE - 14;
  ctx.fillStyle = CAPTION_INK;
  ctx.font = CAPTION_FONT;
  for (const line of lines) {
    ctx.fillText(line, PAGE_W / 2, y);
    y += CAPTION_LINE;
  }
  if (weekMeta) {
    ctx.fillStyle = META_INK;
    ctx.font = META_FONT;
    ctx.fillText(weekMeta, PAGE_W / 2, (lines.length > 0 ? y + GAP : imgH + PAD_V + META_LINE) - 6);
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no blob'))), 'image/jpeg', 0.92);
  });
}

export async function shareScrapbook(image: string, caption?: string, weekMeta?: string): Promise<ShareOutcome> {
  try {
    const composed = await composeKeepsakePage(image, caption ?? '', weekMeta ?? '').catch(() => null);
    const blob = composed ?? (await (await fetch(image)).blob());
    const file = new File([blob], 'doubledone-week.jpg', { type: blob.type || 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'shared';
        // A real share failure falls through to the download path below.
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'doubledone-week.jpg';
    a.click();
    URL.revokeObjectURL(a.href);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}
