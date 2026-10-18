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

const TITLE = 'DoubleDone · A calm to-do list for ADHD, autism and OCD';
// The search result and link card (2026-10-18, Melroy's yes): the audience and the promise sit in the first
// ~116 characters, so a phone result that cuts off near 120 still lands. Retires "a calmer kind of to-do",
// which named nothing anyone searches for.
const DESCRIPTION =
  'A calm to-do list for adults with ADHD, autism and OCD. It shows only what today needs, and nothing is ever overdue. Free, no account needed.';
const SITE = 'https://doubledone.app';
const IMAGE = `${SITE}/og.png`;
const IMAGE_ALT = 'DoubleDone · Today, finite and achievable';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const META = `
    <meta name="description" content="${esc(DESCRIPTION)}" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF6F1" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1B1917" />
    <link rel="manifest" href="/manifest.json" />
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

// The keyboard viewport fix (2026-07-26, tester screenshots): Chrome 108+ on Android OVERLAYS
// the keyboard by default, burying the bottom-anchored capture panel. interactive-widget=
// resizes-content opts the layout viewport back into resizing. This must live HERE, not only
// in +html.tsx, for the same reason as everything else in this file: output:'single' ignores
// +html.tsx, and this rewrite is what actually ships. Runs before the og:image idempotency
// gate so it applies even on a re-run.
html = html.replace(
  /(<meta name="viewport" content="[^"]*?)(, interactive-widget=[^",]*)?(" \/>)/,
  '$1, interactive-widget=resizes-content$3',
);
if (!html.includes('interactive-widget=resizes-content')) {
  console.error('inject-web-meta: could not patch the viewport meta — did the export template change?');
  process.exit(1);
}

// The page's own scroller (2026-09-26, Melroy's Android screenshot). Once the capture footer became a
// floating pill, Today's list filled the whole screen, and Chrome on Android PROMOTES a scroller that
// fills the viewport to be the page's own (the implicit root scroller, Android-only): scrolling it slid
// the address bar away. The app is `height: 100%` (Expo's reset), which stays at the small viewport, so
// the freed 56px showed the bare page (white) and the top of the shut capture panel parked below the
// app. The same promotion also handed the list Chrome's pull-to-refresh, which reloads the app.
//
// - `#root { overflow: hidden }` is the fix. Chromium never promotes a scroller that has an ancestor
//   clipping overflow (root_scroller_controller IsValidImplicit), so the address bar stays put while the
//   list scrolls, exactly as before v3 and as the installed app already looks. No strip, no pill jump,
//   no pull-to-refresh on the list.
// - `overscroll-behavior-y: contain` on html and body is the backstop for pull-to-refresh if a Chrome
//   ever promotes anyway (the viewport reads it from the root element, older Chrome from body).
// - `100dvh` is the backstop for the strip. It is NOT live: Chrome switches it between the small and the
//   large viewport only once the address bar is idle, so on its own it would still leave a brief band
//   and a 56px jump. It plays no part in the keyboard, which interactive-widget above already handles.
//
// Browsers without dvh keep the 100% they had. Placed last in the head so it wins over the reset.
const VIEWPORT_STYLE = '<style id="dd-viewport">#root { overflow: hidden; } html, body { overscroll-behavior-y: contain; } @supports (height: 100dvh) { html, body, #root { height: 100dvh; } }</style>';
// Function replacers throughout: a plain replacement string would expand $& or $' if a value ever carried one.
if (!html.includes('id="dd-viewport"')) html = html.replace('</head>', () => `  ${VIEWPORT_STYLE}\n  </head>`);
if (!html.includes('id="dd-viewport"')) {
  console.error('inject-web-meta: could not add the dynamic-viewport style — no </head> in the export?');
  process.exit(1);
}

// The static, crawlable landing page (2026-10-18, an external website audit: "search can't see it"). The SPA's "/"
// was an empty <div id="root"> until the bundle ran, so Google and every link preview read nothing. This writes the
// same landing page, built from the app's own catalogues by client/src/lib/landing-page.ts, into the HTML itself:
// canonical + structured data (the site's name) + its stylesheet + a tiny pre-paint boot in <head>, the page at the start of
// <body>. The boot shows it only to a fresh visitor at "/", so a returning user and every app route are untouched;
// the contract is in that file's header. The TS module is bundled on the fly with esbuild (already in the tree,
// via vitest), because node cannot import the catalogues' extensionless TS imports directly. Idempotent by its id.
if (!html.includes('id="dd-landing"')) {
  const { build } = await import('esbuild');
  const out = await build({
    entryPoints: [join(ROOT, 'client', 'src', 'lib', 'landing-page.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  const { head, body } = mod.buildLanding();
  if (!/<body[^>]*>/.test(html)) {
    console.error('inject-web-meta: no <body> in the export, cannot place the landing page');
    process.exit(1);
  }
  html = html.replace('</head>', () => `  ${head}\n  </head>`).replace(/<body[^>]*>/, (tag) => `${tag}\n${body}\n`);
  // Expo's template ends the page with a bare "You need to enable JavaScript to run this app." for no-JS visitors.
  // The landing is the no-JS page now (with its own calm note under Begin), so the template's line would sit
  // unstyled under the footer and be a crawler's last words. Remove it, loudly if the template ever changes.
  const NOSCRIPT = /<noscript>\s*You need to enable JavaScript to run this app\.\s*<\/noscript>\s*/;
  if (!NOSCRIPT.test(html)) {
    console.error("inject-web-meta: the export template's <noscript> line was not found; check the export");
    process.exit(1);
  }
  html = html.replace(NOSCRIPT, () => '');
  if (!html.includes('id="dd-landing"') || !html.includes('id="dd-landing-boot"')) {
    console.error('inject-web-meta: the landing page did not land in the export');
    process.exit(1);
  }
  console.log(`inject-web-meta: static landing page injected (${Math.round(body.length / 1024)} KB of markup, 5 languages)`);
}

if (html.includes('property="og:image"')) {
  writeFileSync(HTML, html);
  console.log('inject-web-meta: og:image already present; viewport and landing ensured, nothing else to do');
  process.exit(0);
}

if (!/<title>[^<]*<\/title>/.test(html)) {
  console.error('inject-web-meta: no <title> found in', HTML, '— refusing to guess. Did the export change?');
  process.exit(1);
}

html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(TITLE)}</title>${META}`);
writeFileSync(HTML, html);
console.log(`inject-web-meta: title + ${META.match(/<meta/g).length} meta tags + viewport injected into ${HTML}`);
