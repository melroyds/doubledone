// The static, crawlable landing page (an external website audit, October 2026: "search can't see it"), rebuilt to
// the Claude Design handoff of 18 October 2026 ("show what it does, calmly": one column, eleven sections, the drawn
// Today card, six real screens), with every line checked against the app before it shipped.
//
// WHY THIS EXISTS: the web app is an SPA (output:'single'), so doubledone.app/ shipped an empty <div id="root">
// and the real landing page only existed after the JavaScript bundle ran. Google indexes JavaScript pages late
// and unreliably, link unfurlers and most other crawlers never run it, and searching "DoubleDone" mostly found
// other apps. This module renders the landing page as plain HTML, from the SAME catalogue strings the app uses,
// and scripts/inject-web-meta.mjs writes it into the exported index.html at build time.
//
// How it shows only when it should (the whole contract, kept in this file so it cannot drift):
//   - landingBoot() runs inline in <head>, before first paint. A fresh visitor at "/" gets html.dd-landing (the
//     static page shows, the app's #root is hidden). Anyone else, a returning visitor or any app route the SPA
//     fallback serves this same index.html for, gets html.dd-app (the static page is hidden, the app shows).
//     A returning visitor therefore never sees a flash of the marketing page.
//   - The same boot stamps data-platform (ios / android / desktop) so CSS shows ONE primary action: the phone's
//     own store badge with "Or start in your browser" under it, or Begin on a laptop or tablet. All three are in
//     the HTML (crawlable); a browser it cannot place gets the laptop version. Without JavaScript the laptop
//     version shows too, and its store badges are the way in: the browser app itself needs JavaScript, which a
//     one-line note under Begin says (Begin would only bring the visitor back here).
//   - Without JavaScript nothing is hidden: the static page is the visible default, which is what crawlers need.
//   - The app's own index route (app/index.tsx) takes over once the bundle runs, via lib/landing-dom.ts: Begin
//     (and the browser link) become a client-side navigation, and leaving "/" swaps the classes back.
//   - English is in the DOM. The other four languages ride in <template> elements, which are inert and not page
//     text, so a crawler reads one clean English page. A visitor whose browser language is one of ours gets theirs
//     swapped in by a tiny inline script before the page is shown (the boot hides the English until then).
//   - No email collection here, by Melroy's rule (2026-10-18): email is only ever used to sign in.
//   - No price figure, no social proof, no motion (decided for the redesign, 2026-10-18).
//
// Pure: no React Native, no DOM. landingBoot is inlined by toString(), so it must stay self-contained (no imports,
// no module constants inside it) and plain enough for any browser that runs the app.

import { translate } from './i18n';
import { PICTURE_SIZES } from './landing-pictures';
import { APP_STORE_URL, PLAY_URL } from './store-links';

export const LANDING_LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
export type LandingLocale = (typeof LANDING_LOCALES)[number];

export const LANDING_ID = 'dd-landing';
export const SITE = 'https://doubledone.app';
export { APP_STORE_URL, PLAY_URL };
export const API_DOCS_URL = 'https://api.doubledone.app/api/v1/docs';
/** The app's first-run flag (lib/storage.ts ONBOARDED_KEY). landingBoot repeats it as a literal; a test holds them equal. */
export const ONBOARDED_STORAGE_KEY = 'doubledone.onboarded.v1';

/** The landing language for a browser: the FIRST preferred language if it is one of ours, else English. This is the
 *  app's own rule (lib/locale reads only the first device locale), so the page and the app always agree. */
export function pickLocale(languages: readonly (string | null | undefined)[]): LandingLocale {
  const first = String(languages[0] ?? '').slice(0, 2).toLowerCase();
  return (LANDING_LOCALES as readonly string[]).includes(first) ? (first as LandingLocale) : 'en';
}

/** The platform for the one primary action. An iPhone gets the App Store, an Android PHONE gets Google Play, and
 *  everything else (a laptop, an iPad, an Android tablet, a browser we cannot place) gets Begin. landingBoot
 *  repeats this as literals; a test holds the two equal. */
export function pickPlatform(userAgent: string | null | undefined): 'ios' | 'android' | 'desktop' {
  const ua = String(userAgent ?? '');
  if (/iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua) && /Mobile/.test(ua)) return 'android';
  return 'desktop';
}

/** Runs inline in <head> before first paint (see the header). Mirrors pickLocale, pickPlatform and loadOnboarded
 *  exactly, including loadOnboarded's choice to treat unreadable storage as "already onboarded" (straight to the app). */
export function landingBoot(w: any): void {
  const h = w.document.documentElement;
  let onboarded = false;
  try {
    onboarded = w.localStorage.getItem('doubledone.onboarded.v1') === 'yes';
  } catch {
    onboarded = true;
  }
  const nav = w.navigator || {};
  const langs = nav.languages && nav.languages.length ? nav.languages : [nav.language];
  const first = String(langs[0] || '').slice(0, 2).toLowerCase();
  const lang = ['en', 'de', 'es', 'fr', 'it'].indexOf(first) >= 0 ? first : 'en';
  h.setAttribute('data-dd-lang', lang);
  const ua = String(nav.userAgent || '');
  let platform = 'desktop';
  if (/iPhone|iPod/.test(ua)) platform = 'ios';
  else if (/Android/.test(ua) && /Mobile/.test(ua)) platform = 'android';
  h.setAttribute('data-platform', platform);
  const path = w.location.pathname;
  if ((path === '/' || path === '/index.html') && !onboarded) {
    h.classList.add('dd-landing');
    h.setAttribute('lang', lang);
  } else {
    h.classList.add('dd-app');
  }
}

/** Swaps the visitor's language in from its <template>, then marks the page ready. Inlined right after the
 *  templates, so it runs during parsing, before the page is revealed. Self-contained for the same reason. */
export function landingLocalise(w: any): void {
  const d = w.document;
  const h = d.documentElement;
  const lang = h.getAttribute('data-dd-lang');
  if (lang && lang !== 'en') {
    const tpl = d.getElementById('ddl-t-' + lang);
    const page = d.getElementById('ddl-page');
    if (tpl && page && tpl.content) page.parentNode.replaceChild(tpl.content.cloneNode(true), page);
  }
  h.classList.add('ddl-ready');
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** HTML-escape text or an attribute value. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

/** The questions, in display order: [question key, answer key]. Seven, and the list never grows: a new question
 *  replaces one (the handoff's rule). "What happens to unfinished tasks" and "Can I share a list" were retired in the
 *  redesign because sections 3 and 5 now answer them on the page. */
export const FAQ: readonly (readonly [string, string])[] = [
  ['landing.faqWhoQ', 'landing.faqWhoA'],
  ['landing.faqFreeQ', 'landing.faqFreeA'],
  ['landing.faqAccountQ', 'landing.faqAccountA'],
  ['landing.faqAiQ', 'landing.faqAiA'],
  ['landing.faqWhereQ', 'landing.faqWhereA'],
  ['landing.faqMedicalQ', 'landing.faqMedicalA'],
  ['landing.faqDeleteQ', 'landing.faqDeleteA'],
];

/** The six real screens. Files are /landing/{name}-{light|dark}-{locale}.webp, captured by
 *  scripts/landing-shots.mjs from the app itself with the cast seeded in each language (an English screen on a
 *  German page is a trust leak). Each crop follows its language's own line lengths, so its size comes from the
 *  generated PICTURE_SIZES and the page holds exactly that box before the file loads. */
export const PICTURES = {
  rested: { alt: 'landing.altRested' },
  plan: { alt: 'landing.altPlan' },
  low: { alt: 'landing.altLow' },
  settle: { alt: 'landing.altSettle' },
  ours: { alt: 'landing.altOurs' },
  calendar: { alt: 'landing.altCal' },
} as const;
export type PictureName = keyof typeof PICTURES;

/** The display box of a picture at 320 wide: the captured size, else a 4:5 placeholder (only before a first capture). */
export function pictureSize(name: PictureName, loc: LandingLocale): readonly [number, number] {
  return PICTURE_SIZES[name]?.[loc] ?? [320, 400];
}

/** The store badges per language: Apple's and Google's OFFICIAL localised badges (downloaded 2026-10-18 from
 *  tools.applemediaservices.com and play.google.com/intl/en_us/badges, Melroy's yes), so a German page says
 *  "Laden im App Store". Google's PNGs are trimmed of their built-in clear space, because the layout gives each
 *  badge its own room. Each carries its own proportions (the French App Store badge is wider). */
export const BADGES: Record<LandingLocale, { appStore: string; appStoreRatio: number; play: string; playRatio: number }> = {
  en: { appStore: '/img/badges/app-store-en.svg', appStoreRatio: 119.66407 / 40, play: '/img/badges/google-play-en.png', playRatio: 564 / 168 },
  de: { appStore: '/img/badges/app-store-de.svg', appStoreRatio: 119.66407 / 40, play: '/img/badges/google-play-de.png', playRatio: 646 / 192 },
  es: { appStore: '/img/badges/app-store-es.svg', appStoreRatio: 119.66407 / 40, play: '/img/badges/google-play-es.png', playRatio: 646 / 192 },
  fr: { appStore: '/img/badges/app-store-fr.svg', appStoreRatio: 126.50751 / 40, play: '/img/badges/google-play-fr.png', playRatio: 646 / 192 },
  it: { appStore: '/img/badges/app-store-it.svg', appStoreRatio: 119.66407 / 40, play: '/img/badges/google-play-it.png', playRatio: 646 / 192 },
};

const MARK =
  '<span class="ddl-mark" aria-hidden="true"><span class="ddl-c1">✓</span><span class="ddl-c2">✓</span></span>';

/** One complete page in one language. Only one is ever in the DOM (id="ddl-page"). */
export function renderPage(loc: LandingLocale): string {
  const tr = (k: string) => translate(loc, k);
  const t = (k: string) => esc(tr(k));
  const badges = BADGES[loc];

  const badge = (store: 'appStore' | 'play', height: number) => {
    const ratio = store === 'appStore' ? badges.appStoreRatio : badges.playRatio;
    const href = store === 'appStore' ? APP_STORE_URL : PLAY_URL;
    // The name starts with the words printed on the badge in this language (WCAG 2.5.3, label in name).
    const alt = t(store === 'appStore' ? 'landing.appStoreBadgeA11y' : 'landing.playBadgeA11y');
    return `<a class="ddl-badge" href="${esc(href)}"><img src="${badges[store]}" alt="${alt}" width="${Math.round(height * ratio)}" height="${height}"></a>`;
  };
  // The visible word is inside the accessible name (WCAG 2.5.3): "Begin" -> "Begin, open DoubleDone".
  const begin = `<a class="ddl-btn" href="/today" data-dd-begin aria-label="${t('welcome.beginA11y')}">${t('common.begin')}</a>`;
  const browser = `<a class="ddl-browser" href="/today" data-dd-begin>${t('landing.browser')}</a>`;
  const trust = `<p class="ddl-trust">${t('welcome.trustLine')}</p>`;
  /** The one action, by the same rule in the hero and the closing; only the hero carries the trust line and the
   *  laptop's "Also on" row. */
  // Apple asks for one App Store badge per layout, so on an iPhone the closing repeats the action as a plain link.
  const iosClosing = `<a class="ddl-browser" href="${esc(APP_STORE_URL)}">${t('welcome.appStoreBadgeA11y')}</a>`;
  const action = (hero: boolean) => `<div class="ddl-act">
      <div class="act-ios">${hero ? badge('appStore', 56) : iosClosing}${browser}${hero ? trust : ''}</div>
      <div class="act-android">${badge('play', 56)}${browser}${hero ? trust : ''}</div>
      <div class="act-desktop">${begin}${
        hero
          ? `<noscript><p class="ddl-trust ddl-noscript">${t('landing.noScript')}</p></noscript>${trust}<p class="ddl-also">${t('landing.alsoOn')}</p><div class="ddl-stores">${badge('appStore', 40)}${badge('play', 40)}</div>`
          : ''
      }</div>
    </div>`;

  const picture = (name: PictureName) => {
    const [w, h] = pictureSize(name, loc);
    return `<picture class="ddl-pic">
        <source srcset="/landing/${name}-dark-${loc}.webp" media="(prefers-color-scheme: dark)">
        <img src="/landing/${name}-light-${loc}.webp" width="${w}" height="${h}" alt="${t(PICTURES[name].alt)}" loading="lazy" decoding="async">
      </picture>`;
  };

  // The drawn Today card: HTML, not a picture, so it is sharp, themed and in every language. One spoken label;
  // everything inside is presentational. Two rows done, one open: the weight bar fills one step of eight (12.5%),
  // exactly what the app draws for one open task on a Normal day.
  const row = (k: string, done: boolean) =>
    `<li class="${done ? 'ddl-row ddl-row-done' : 'ddl-row'}"><span class="ddl-circle"></span><span>${t(k)}</span></li>`;
  const card = `<div class="ddl-card" role="img" aria-label="${t('landing.cardA11y')}">
        <div aria-hidden="true">
          <p class="ddl-card-title"><span>${t('common.today')}</span></p>
          <p class="ddl-card-greet">${t('phase.greeting.morning')}</p>
          <div class="ddl-weight"><span></span></div>
          <p class="ddl-card-weight">${t('estimate.weight.light')}</p>
          <p class="ddl-energy"><span class="ddl-energy-label">${t('today.energyOverline')}</span><span>${t('today.energyPillLow')}</span><span class="ddl-energy-on">${t('today.energyPillNormal')}</span><span>${t('today.energyPillHigh')}</span></p>
          <ul class="ddl-rows">
            ${row('landing.castPharmacy', true)}
            ${row('landing.castBins', true)}
            ${row('landing.castTaxes', false)}
          </ul>
        </div>
      </div>`;

  const steps = [
    ['1', 'landing.s1Title', 'landing.s1Body'],
    ['2', 'landing.s2Title', 'landing.s2Body'],
    ['3', 'landing.s3Title', 'landing.s3Body'],
  ]
    .map(([n, h, b]) => `<li><span class="ddl-n" aria-hidden="true">${n}</span><div><h3>${t(h)}</h3><p>${t(b)}</p></div></li>`)
    .join('\n        ');

  const moment = (n: 1 | 2 | 3 | 4, pic: PictureName) => `<div class="ddl-moment">
        <p class="ddl-kicker">${t(`landing.m${n}Kicker`)}</p>
        <h3>${t(`landing.m${n}Title`)}</h3>
        <p>${t(`landing.m${n}Body`)}</p>
        ${picture(pic)}
      </div>`;

  const small = [
    ['landing.focusName', 'landing.focusLine'],
    ['landing.repeatName', 'landing.repeatLine'],
    ['landing.leftOffName', 'landing.leftOffLine'],
  ]
    .map(([n, l]) => `<li><b>${t(n)}</b> ${t(l)}</li>`)
    .join('\n        ');
  const priv = ['priv1', 'priv2', 'priv3', 'priv4', 'priv5'].map((k) => `<li>${t(`landing.${k}`)}</li>`).join('\n        ');
  const faq = FAQ.map(([q, a]) => `<details><summary>${t(q)}</summary><p>${t(a)}</p></details>`).join('\n        ');
  // The API docs are English only, so the link says so to a reader in another language.
  const devLang = loc === 'en' ? '' : ' hreflang="en"';

  return `<div class="ddl-page" id="ddl-page" lang="${loc}">
  <a class="ddl-skip" href="#ddl-main">${t('landing.skipToContent')}</a>
  <header class="ddl-top">${MARK}<span class="ddl-word">DoubleDone</span></header>
  <main id="ddl-main">
    <section class="ddl-hero" aria-labelledby="ddl-h1">
      <h1 id="ddl-h1"><span class="ddl-kicker">${t('landing.kicker')}</span> <span class="ddl-belief">${t('welcome.heroHeadline')}</span></h1>
      <p class="ddl-sub">${t('landing.sub')}</p>
      ${card}
      <p class="ddl-caption">${t('landing.caption')}</p>
      ${action(true)}
    </section>
    <section aria-labelledby="ddl-promise-h">
      <p class="ddl-kicker">${t('landing.promiseKicker')}</p>
      <h2 id="ddl-promise-h">${t('welcome.lead2')}</h2>
      <p>${t('landing.promiseBody')}</p>
      <p>${t('landing.promiseLead')}</p>
      <blockquote class="ddl-quote"><p>${t('today.reentryBody')}</p></blockquote>
    </section>
    <section aria-labelledby="ddl-day-h">
      <p class="ddl-kicker">${t('welcome.howLabel')}</p>
      <h2 id="ddl-day-h">${t('welcome.howHeadline')}</h2>
      <ol class="ddl-steps" role="list">
        ${steps}
      </ol>
      ${picture('rested')}
    </section>
    <section aria-labelledby="ddl-hard-h">
      <h2 id="ddl-hard-h">${t('landing.hardTitle')}</h2>
      <p>${t('landing.hardIntro')}</p>
      ${moment(1, 'plan')}
      ${moment(2, 'low')}
      ${moment(3, 'settle')}
      ${moment(4, 'ours')}
    </section>
    <section aria-labelledby="ddl-keep-h">
      <p class="ddl-kicker">${t('landing.keepKicker')}</p>
      <h2 id="ddl-keep-h">${t('welcome.keepHeading')}</h2>
      <p>${t('landing.keepBody')}</p>
      ${picture('calendar')}
    </section>
    <section aria-labelledby="ddl-small-h">
      <h2 id="ddl-small-h">${t('landing.smallTitle')}</h2>
      <ul class="ddl-list ddl-small" role="list">
        ${small}
      </ul>
    </section>
    <section aria-labelledby="ddl-priv-h">
      <h2 id="ddl-priv-h">${t('landing.privTitle')}</h2>
      <ul class="ddl-list" role="list">
        ${priv}
      </ul>
    </section>
    <section aria-labelledby="ddl-faq-h">
      <h2 id="ddl-faq-h">${t('landing.faqLabel')}</h2>
      <div class="ddl-qs">
        ${faq}
      </div>
    </section>
    <section class="ddl-closing" aria-labelledby="ddl-close-h">
      <h2 id="ddl-close-h">${t('welcome.closingLine')}</h2>
      ${action(false)}
      <p class="ddl-founder">${t('landing.founder')}</p>
    </section>
  </main>
  <footer class="ddl-foot">
    <nav class="ddl-links" aria-label="DoubleDone">
      <a href="/privacy">${t('landing.footerPrivacy')}</a>
      <a href="/terms">${t('landing.footerTerms')}</a>
      <a href="/support">${t('landing.footerSupport')}</a>
      <a href="${API_DOCS_URL}"${devLang}>${t('landing.footerDevelopers')}</a>
    </nav>
    <p>${t('landing.footerLanguages')}</p>
    <p>${t('landing.footerMedical')}</p>
    <p class="ddl-tm" lang="en">Apple, the Apple logo and iPhone are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc., registered in the U.S. and other countries. Google Play, the Google Play logo and Android are trademarks of Google LLC.</p>
  </footer>
</div>`;
}

/** Structured data: the site's name, so a search for "DoubleDone" knows this site is DoubleDone (the audit found
 *  other apps answering that search). Only WebSite. Decided against SoftwareApplication (Google treats it as invalid
 *  without a rating or review, and there are none to give, never faked) and FAQPage (Google retired the FAQ result
 *  in 2026; the visible questions are what count). */
export function structuredData(): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'DoubleDone',
    alternateName: 'Double Done',
    url: `${SITE}/`,
    inLanguage: 'en',
  };
  // "<" escaped so no string can ever close the <script> early.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** The palette, light then dark, exactly the handoff's tokens. Every text pair clears WCAG AA (the test computes
 *  them). The app accent (#946475) is a hair under AA as TEXT on paper, so the page deepens it to #8D5D6F. */
export const TOKENS = {
  light: {
    paper: '#FAF6F1', surface: '#FFFFFF', line: '#ECE4D8', ink: '#2B2722', body: '#5F564C', soft: '#6B6259',
    mauve: '#8D5D6F', onMauve: '#FFFFFF', sage: '#7E9B6B', tint: '#F6EFF2', row: '#FFFFFF', repeat: '#6E72A0',
    check: '#8C8279', skyTop: '#FBE4D1', skyMid: '#FAECE3', skyEnd: '#F7EEEC', cardSoft: '#5F564C',
  },
  dark: {
    paper: '#1B1917', surface: '#252119', line: '#34302A', ink: '#F2EBE0', body: '#D8CEC0', soft: '#C9C0B4',
    mauve: '#C68BA0', onMauve: '#2B2722', sage: '#9DB98A', tint: '#3A2E35', row: '#2A2521', repeat: '#8E97C8',
    check: '#7E756C', skyTop: '#3A2D27', skyMid: '#2C2522', skyEnd: '#262120', cardSoft: '#C9C0B4',
  },
} as const;

const vars = (p: (typeof TOKENS)['light'] | (typeof TOKENS)['dark']) =>
  `--paper:${p.paper};--surface:${p.surface};--line:${p.line};--ink:${p.ink};--body:${p.body};--soft:${p.soft};--mauve:${p.mauve};--on-mauve:${p.onMauve};--sage:${p.sage};--tint:${p.tint};--row:${p.row};--repeat:${p.repeat};--check:${p.check};--card-soft:${p.cardSoft};--sky:linear-gradient(180deg,${p.skyTop} 0%,${p.skyMid} 55%,${p.skyEnd} 100%)`;

const SERIF = "'Newsreader',Georgia,'Times New Roman',serif";
const SANS = "'Atkinson Hyperlegible',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

const CSS = `
html.dd-app #dd-landing{display:none!important}
/* Keyed off "not the app", not "is the landing": with no JavaScript the boot never runs, and the page must still scroll. */
html:not(.dd-app) #root{display:none!important}
html:not(.dd-app),html:not(.dd-app) body{height:auto!important;min-height:100%;margin:0;overflow:auto!important;overscroll-behavior-y:auto!important;background:${TOKENS.light.paper}}
html:not(.dd-app){-webkit-text-size-adjust:100%;text-size-adjust:100%}
html:not(.ddl-ready)[data-dd-lang]:not([data-dd-lang="en"]) #ddl-page{visibility:hidden}
#dd-landing{${vars(TOKENS.light)};
  background:var(--paper);color:var(--ink);font-family:${SANS};font-size:18px;line-height:27px;-webkit-font-smoothing:antialiased;-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;min-height:100vh}
@media (prefers-color-scheme:dark){
  html:not(.dd-app),html:not(.dd-app) body{background:${TOKENS.dark.paper}}
  #dd-landing{${vars(TOKENS.dark)};color-scheme:dark}
}
#dd-landing *{box-sizing:border-box}
#dd-landing .ddl-page{max-width:688px;margin:0 auto;padding:0 24px 48px}
#dd-landing p,#dd-landing h1,#dd-landing h2,#dd-landing h3,#dd-landing ul,#dd-landing ol,#dd-landing blockquote{margin:0;padding:0}
#dd-landing h1,#dd-landing h2,#dd-landing h3{font-family:${SERIF};color:var(--ink);text-wrap:balance}
#dd-landing p{text-wrap:pretty}
#dd-landing a{color:var(--mauve);font-weight:700;text-decoration:underline;text-underline-offset:3px}
#dd-landing :focus-visible{outline:3px solid var(--mauve);outline-offset:3px;border-radius:6px}
#dd-landing .ddl-skip{position:absolute;left:-9999px;top:8px;background:var(--surface);color:var(--ink);padding:10px 14px;border-radius:8px;border:1px solid var(--line);z-index:10}
#dd-landing .ddl-skip:focus{left:12px}
#dd-landing .ddl-top{display:flex;align-items:center;gap:10px;padding:12px 0}
#dd-landing .ddl-mark{width:32px;height:32px;border-radius:8px;background:var(--surface);border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;line-height:1}
#dd-landing .ddl-c1{color:var(--sage)}
#dd-landing .ddl-c2{color:var(--mauve);margin-left:-5px}
#dd-landing .ddl-word{color:var(--ink);font-weight:700;font-size:15px}
#dd-landing section{padding:48px 0;border-top:1px solid var(--line)}
#dd-landing section.ddl-hero{border-top:0;padding-top:24px}
#dd-landing section>p,#dd-landing .ddl-moment>p:not(.ddl-kicker){color:var(--body);max-width:36em}
#dd-landing .ddl-kicker{display:block;font-family:${SERIF};font-style:italic;font-weight:400;font-size:19px;line-height:27px;color:var(--mauve)}
#dd-landing h1 .ddl-belief{display:block;margin-top:8px;font-weight:600;font-size:34px;line-height:39px;letter-spacing:-.01em}
#dd-landing h2{font-weight:500;font-size:28px;line-height:34px}
#dd-landing h3{font-weight:600;font-size:23px;line-height:29px}
#dd-landing .ddl-kicker+h2,#dd-landing .ddl-kicker+h3{margin-top:8px}
#dd-landing h2+p,#dd-landing h2+ol,#dd-landing h2+ul,#dd-landing h2+.ddl-qs{margin-top:16px}
#dd-landing h3+p{margin-top:12px}
#dd-landing section>p+p{margin-top:16px}
#dd-landing .ddl-sub{margin-top:12px;color:var(--body)}
/* The drawn Today card (handoff section 4). */
#dd-landing .ddl-card{margin-top:24px;width:100%;max-width:420px;border-radius:20px;border:1px solid var(--line);background:var(--sky);padding:16px}
#dd-landing .ddl-card-title span{display:inline-block;font-family:${SERIF};font-weight:500;font-size:28px;line-height:34px;color:var(--ink);border-bottom:2px solid var(--mauve);padding-bottom:3px}
#dd-landing .ddl-card-greet{margin-top:8px;font-size:15px;line-height:21px;color:var(--card-soft)}
#dd-landing .ddl-weight{margin-top:12px;height:5px;border-radius:3px;background:var(--line);background:color-mix(in srgb,var(--ink) 10%,transparent);overflow:hidden}
#dd-landing .ddl-weight span{display:block;height:100%;width:12.5%;background:var(--mauve);border-radius:3px}
#dd-landing .ddl-card-weight{margin-top:6px;font-size:13px;line-height:18px;color:var(--card-soft)}
#dd-landing .ddl-energy{margin-top:12px;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:13px;line-height:18px;color:var(--card-soft)}
#dd-landing .ddl-energy span{padding:4px 8px;border-radius:999px}
#dd-landing .ddl-energy .ddl-energy-label{padding-left:0;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink)}
#dd-landing .ddl-energy .ddl-energy-on{background:var(--tint);color:var(--mauve);font-weight:700}
#dd-landing .ddl-rows{list-style:none;margin-top:12px;display:flex;flex-direction:column;gap:6px}
#dd-landing .ddl-row{display:flex;align-items:center;gap:10px;min-height:42px;padding:8px 12px;border-radius:12px;background:var(--row);border:1.5px solid var(--repeat);font-size:15px;line-height:21px;color:var(--ink)}
#dd-landing .ddl-row-done{color:var(--card-soft)}
#dd-landing .ddl-circle{flex:none;width:22px;height:22px;border-radius:999px;border:2px solid var(--check);display:inline-flex;align-items:center;justify-content:center}
#dd-landing .ddl-row-done .ddl-circle{border:0;background:var(--mauve)}
#dd-landing .ddl-row-done .ddl-circle::after{content:'';width:6px;height:10px;border:solid var(--on-mauve);border-width:0 2px 2px 0;transform:translateY(-1px) rotate(45deg)}
#dd-landing .ddl-caption{margin-top:12px;font-family:${SERIF};font-style:italic;font-size:16px;line-height:24px;color:var(--soft)}
/* The one action (handoff section 3): CSS shows one of three. No JavaScript, or a browser we cannot place, is desktop. */
#dd-landing .ddl-act{margin-top:24px}
#dd-landing .act-ios,#dd-landing .act-android{display:none}
html[data-platform="ios"] #dd-landing .act-ios,html[data-platform="android"] #dd-landing .act-android{display:block}
html[data-platform="ios"] #dd-landing .act-desktop,html[data-platform="android"] #dd-landing .act-desktop{display:none}
#dd-landing .ddl-badge{display:inline-flex;border-radius:10px;text-decoration:none}
#dd-landing .ddl-badge img{display:block;height:auto;max-width:100%}
#dd-landing .ddl-browser{display:flex;align-items:center;width:max-content;max-width:100%;min-height:44px;margin-top:6px;font-size:16px;line-height:22px}
#dd-landing .ddl-trust{margin-top:8px;font-size:16px;line-height:24px;color:var(--body)}
#dd-landing .ddl-btn{display:flex;align-items:center;justify-content:center;height:52px;width:100%;max-width:400px;border-radius:14px;background:var(--mauve);color:var(--on-mauve);font-size:17px;font-weight:700;text-decoration:none;padding:0 24px}
#dd-landing .ddl-btn:hover{filter:brightness(1.05)}
#dd-landing .act-desktop .ddl-trust{margin-top:16px}
#dd-landing .ddl-also{margin-top:24px;font-size:15px;line-height:22px;color:var(--soft)}
#dd-landing .ddl-stores{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px}
#dd-landing .ddl-stores .ddl-badge{padding:2px 0}
/* The promise card: the app's own welcome-back line. */
#dd-landing .ddl-quote{margin-top:16px;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:24px}
#dd-landing .ddl-quote p{font-family:${SERIF};font-style:italic;font-size:20px;line-height:30px;color:var(--ink)}
/* Steps. */
#dd-landing .ddl-steps{list-style:none;display:flex;flex-direction:column;gap:24px}
#dd-landing .ddl-steps li{display:grid;grid-template-columns:32px 1fr}
#dd-landing .ddl-n{font-family:${SERIF};font-weight:500;font-size:23px;line-height:29px;color:var(--soft)}
#dd-landing .ddl-steps p{margin-top:8px;color:var(--body)}
/* Pictures: the real screens, never framed, left-aligned with the text. */
#dd-landing .ddl-pic{display:block;margin-top:24px}
#dd-landing .ddl-steps+.ddl-pic{margin-top:32px}
#dd-landing .ddl-pic img{display:block;width:100%;max-width:320px;height:auto;border-radius:20px;border:1px solid var(--line);background:var(--surface)}
#dd-landing .ddl-moment{margin-top:48px}
#dd-landing h2+p+.ddl-moment{margin-top:32px}
/* Lists (small things, privacy). */
#dd-landing .ddl-list{list-style:none;display:flex;flex-direction:column;gap:16px;color:var(--body)}
#dd-landing .ddl-list li{position:relative;padding-left:18px}
#dd-landing .ddl-list li::before{content:'';position:absolute;left:0;top:11px;width:6px;height:6px;border-radius:999px;background:var(--soft)}
#dd-landing .ddl-small b{font-weight:700;color:var(--ink)}
/* Questions. */
#dd-landing .ddl-qs details{border-top:1px solid var(--line)}
#dd-landing .ddl-qs details:last-child{border-bottom:1px solid var(--line)}
#dd-landing summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;padding:12px 0;font-weight:700;font-size:17px;line-height:24px;color:var(--ink)}
#dd-landing summary::-webkit-details-marker{display:none}
#dd-landing summary::after{content:'+';content:'+' / '';color:var(--soft);font-size:24px;line-height:1;flex:none;font-weight:400}
#dd-landing details[open] summary::after{content:'\\2212';content:'\\2212' / ''}
#dd-landing details p{color:var(--body);padding:0 0 20px;max-width:36em}
/* Closing and footer. */
#dd-landing .ddl-closing h2+.ddl-act{margin-top:24px}
#dd-landing .ddl-founder{margin-top:24px;font-size:15px;line-height:22px;color:var(--soft)}
#dd-landing .ddl-foot{border-top:1px solid var(--line);padding-top:32px;display:flex;flex-direction:column;gap:8px;font-size:15px;line-height:22px;color:var(--body)}
#dd-landing .ddl-links{display:flex;flex-wrap:wrap;gap:0 20px}
#dd-landing .ddl-links a{display:inline-flex;align-items:center;min-height:44px;font-size:15px}
#dd-landing .ddl-tm{margin-top:8px;font-size:13px;line-height:20px;color:var(--soft)}
@media (min-width:640px){
  #dd-landing .ddl-kicker{font-size:21px;line-height:30px}
  #dd-landing h1 .ddl-belief{font-size:48px;line-height:54px}
  #dd-landing h2{font-size:34px;line-height:41px}
  #dd-landing h3{font-size:25px;line-height:31px}
}
`;

/** Collapse the stylesheet's whitespace (it ships inline in every page load of the app shell). */
export function landingCss(): string {
  return CSS.replace(/\s*\n\s*/g, '').trim();
}

export interface LandingParts {
  /** For the end of <head>: canonical, fonts, structured data, the stylesheet, and the boot. */
  head: string;
  /** For the very start of <body>, before the app's #root. */
  body: string;
}

/** Everything inject-web-meta.mjs writes into the exported index.html. */
export function buildLanding(): LandingParts {
  const templates = LANDING_LOCALES.filter((l) => l !== 'en')
    .map((l) => `<template id="ddl-t-${l}" lang="${l}">${renderPage(l)}</template>`)
    .join('\n');
  // The fonts are self-hosted (global.css @font-face, client/public/fonts). Preload the faces the first screen draws:
  // the kicker's italic, the headline's 600, the body's 400, and the 700 of the wordmark, the Energy label and every
  // action. The card title's Newsreader 500 (also every h2, below the fold) may swap in.
  const head = [
    `<link rel="canonical" href="${SITE}/" />`,
    '<link rel="preload" href="/fonts/newsreader-600.woff2" as="font" type="font/woff2" crossorigin />',
    '<link rel="preload" href="/fonts/newsreader-400-italic.woff2" as="font" type="font/woff2" crossorigin />',
    '<link rel="preload" href="/fonts/atkinson-400.woff2" as="font" type="font/woff2" crossorigin />',
    '<link rel="preload" href="/fonts/atkinson-700.woff2" as="font" type="font/woff2" crossorigin />',
    `<script type="application/ld+json">${structuredData()}</script>`,
    `<style id="dd-landing-css">${landingCss()}</style>`,
    `<script id="dd-landing-boot">(${landingBoot.toString()})(window);</script>`,
  ].join('\n    ');
  const body = `<div id="${LANDING_ID}">
${renderPage('en')}
${templates}
<script>(${landingLocalise.toString()})(window);</script>
</div>`;
  return { head, body };
}
