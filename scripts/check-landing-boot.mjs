// CI check: run the landing's pre-paint boot exactly as it SHIPS in client/dist/index.html (esbuild's output, which
// the unit test never executes) against fake browsers, and fail if any decision is wrong. A grep for
// "data-platform" proves nothing: the inlined stylesheet's selectors contain that string whether or not the boot
// sets it.
//
//   node scripts/check-landing-boot.mjs        (after expo export + inject-web-meta)

import { readFileSync } from 'node:fs';
import path from 'node:path';

const html = readFileSync(path.join(process.cwd(), 'client', 'dist', 'index.html'), 'utf8');
const m = html.match(/<script id="dd-landing-boot">([\s\S]*?)<\/script>/);
if (!m) {
  console.error('check-landing-boot: no <script id="dd-landing-boot"> in client/dist/index.html');
  process.exit(1);
}

function run({ ua, path: pathname = '/', stored = null, throws = false, languages = ['en-AU'] }) {
  const attrs = {};
  const classes = new Set();
  const window = {
    document: { documentElement: { setAttribute: (k, v) => (attrs[k] = v), getAttribute: (k) => attrs[k] ?? null, classList: { add: (c) => classes.add(c) } } },
    localStorage: { getItem: () => { if (throws) throw new Error('blocked'); return stored; } },
    navigator: { userAgent: ua, languages },
    location: { pathname },
  };
  new Function('window', m[1])(window);
  return { attrs, classes };
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const TABLET = 'Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const LAPTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const cases = [
  ['iPhone, fresh, at /', run({ ua: IPHONE }), (r) => r.classes.has('dd-landing') && r.attrs['data-platform'] === 'ios'],
  ['Android phone, fresh, at /', run({ ua: ANDROID }), (r) => r.classes.has('dd-landing') && r.attrs['data-platform'] === 'android'],
  ['Android tablet gets Begin', run({ ua: TABLET }), (r) => r.attrs['data-platform'] === 'desktop'],
  ['laptop, fresh, at /', run({ ua: LAPTOP }), (r) => r.classes.has('dd-landing') && r.attrs['data-platform'] === 'desktop'],
  ['returning visitor goes to the app', run({ ua: IPHONE, stored: 'yes' }), (r) => r.classes.has('dd-app') && !r.classes.has('dd-landing')],
  ['an app route never shows the landing', run({ ua: LAPTOP, path: '/today' }), (r) => r.classes.has('dd-app')],
  ['unreadable storage counts as onboarded', run({ ua: LAPTOP, throws: true }), (r) => r.classes.has('dd-app')],
  ['German browser', run({ ua: LAPTOP, languages: ['de-DE'] }), (r) => r.attrs['data-dd-lang'] === 'de' && r.attrs.lang === 'de'],
];
let failed = 0;
for (const [name, result, ok] of cases) {
  if (!ok(result)) {
    failed += 1;
    console.error(`check-landing-boot: FAILED ${name}: ${JSON.stringify({ attrs: result.attrs, classes: [...result.classes] })}`);
  }
}

// The channel label (doubledone.app/?ref=instagram), run as it SHIPS against the export's own badge links: a channel
// on the list relabels every store link, anything else leaves the `website` label alone.
const c = html.match(/<script id="dd-landing-campaign">([\s\S]*?)<\/script>/);
if (!c) {
  console.error('check-landing-boot: no <script id="dd-landing-campaign"> in client/dist/index.html');
  process.exit(1);
}
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const storeLinks = [...new Set([...html.matchAll(/href="(https:\/\/(?:apps\.apple\.com|play\.google\.com)[^"]+)"/g)].map((x) => decode(x[1])))];
if (storeLinks.length < 2 || !storeLinks.every((h) => h.includes('ct=website') || h.includes('utm_campaign%3Dwebsite'))) {
  console.error(`check-landing-boot: the export's store links do not all carry the website label: ${JSON.stringify(storeLinks)}`);
  process.exit(1);
}
function relabel(search) {
  const anchors = storeLinks.map((href) => ({ href, getAttribute() { return this.href; }, setAttribute(k, v) { this.href = v; } }));
  const window = {
    URLSearchParams,
    location: { search },
    document: { querySelectorAll: () => anchors.filter((a) => a.href.includes('ct=website') || a.href.includes('utm_campaign%3Dwebsite')) },
  };
  new Function('window', c[1])(window);
  return anchors.map((a) => a.href);
}
const campaignCases = [
  ['?ref=instagram relabels every store link', relabel('?ref=instagram'), (hrefs) => hrefs.every((h) => h.includes('ct=instagram') || h.includes('utm_campaign%3Dinstagram')) && !hrefs.some((h) => h.includes('ct=website') || h.includes('utm_campaign%3Dwebsite'))],
  ['?ref=facebook relabels every store link', relabel('?ref=facebook'), (hrefs) => hrefs.every((h) => h.includes('ct=facebook') || h.includes('utm_campaign%3Dfacebook'))],
  ['an unknown ref leaves the website label', relabel('?ref=tiktok'), (hrefs) => hrefs.every((h, i) => h === storeLinks[i])],
  ['no ref leaves the website label', relabel(''), (hrefs) => hrefs.every((h, i) => h === storeLinks[i])],
];
for (const [name, hrefs, ok] of campaignCases) {
  if (!ok(hrefs)) {
    failed += 1;
    console.error(`check-landing-boot: FAILED ${name}: ${JSON.stringify(hrefs)}`);
  }
}
if (failed) process.exit(1);
console.log(`check-landing-boot: the shipped boot decides all ${cases.length} cases correctly, and the channel label all ${campaignCases.length}`);
