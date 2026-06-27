// Inject the SEO + social meta into the exported SPA index.html.
//
// WHY THIS EXISTS: web.output is "single" (an SPA), and Expo Router does NOT apply client/src/app/+html.tsx
// in that mode. `expo export` writes a default <head> with a bare <title>DoubleDone</title> and zero og /
// description / twitter tags. Crawlers (LinkedIn, Slack, X, iMessage) read static HTML and run no JS, so
// without this patch a shared doubledone.app link unfurls title-only, no description, no card.
//
// This rewrites the bare <title> and drops the meta block into client/dist/index.html AFTER export. It runs
// in deploy-web.yml (before the Pages deploy) and in ci.yml (so a broken patch fails the build, not the
// deploy). Keep the values below in sync with client/src/app/+html.tsx (the head used IF we ever move to
// static rendering). Idempotent: a second run is a no-op once og:image is present.
//
//   node scripts/inject-web-meta.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'client', 'dist', 'index.html');

const TITLE = 'DoubleDone · a calmer kind of to-do';
const DESCRIPTION =
  'A calm, never-shame daily to-do app. It shows you only what today needs and quietly keeps everything you finish. Made for ADHD, autism, and OCD. Nothing is ever overdue.';
const SITE = 'https://doubledone.app';
const IMAGE = `${SITE}/og.png`;
const IMAGE_ALT = 'DoubleDone · Today, finite and achievable';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const META = `
    <meta name="description" content="${esc(DESCRIPTION)}" />
    <meta name="theme-color" content="#FAF6F1" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE}" />
    <meta property="og:site_name" content="DoubleDone" />
    <meta property="og:title" content="${esc(TITLE)}" />
    <meta property="og:description" content="${esc(DESCRIPTION)}" />
    <meta property="og:image" content="${IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(IMAGE_ALT)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(TITLE)}" />
    <meta name="twitter:description" content="${esc(DESCRIPTION)}" />
    <meta name="twitter:image" content="${IMAGE}" />`;

let html = readFileSync(HTML, 'utf8');

if (html.includes('property="og:image"')) {
  console.log('inject-web-meta: og:image already present, nothing to do');
  process.exit(0);
}

if (!/<title>[^<]*<\/title>/.test(html)) {
  console.error('inject-web-meta: no <title> found in', HTML, '— refusing to guess. Did the export change?');
  process.exit(1);
}

html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>${META}`);
writeFileSync(HTML, html);
console.log(`inject-web-meta: title + ${META.match(/<meta/g).length} meta tags injected into ${HTML}`);
