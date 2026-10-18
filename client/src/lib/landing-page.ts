// The static, crawlable landing page (an external website audit, October 2026: "search can't see it").
//
// WHY THIS EXISTS: the web app is an SPA (output:'single'), so doubledone.app/ shipped an empty <div id="root">
// and the real landing page only existed after the JavaScript bundle ran. Google indexes JavaScript pages late
// and unreliably, link unfurlers and most other crawlers never run it, and searching "DoubleDone" mostly found
// other apps. This module renders the SAME landing page as plain HTML, from the SAME catalogue strings the app
// uses, and scripts/inject-web-meta.mjs writes it into the exported index.html at build time.
//
// How it shows only when it should (the whole contract, kept in this file so it cannot drift):
//   - landingBoot() runs inline in <head>, before first paint. A fresh visitor at "/" gets html.dd-landing (the
//     static page shows, the app's #root is hidden). Anyone else, a returning visitor or any app route the SPA
//     fallback serves this same index.html for, gets html.dd-app (the static page is hidden, the app shows).
//     A returning visitor therefore never sees a flash of the marketing page.
//   - Without JavaScript nothing is hidden: the static page is the visible default, which is what crawlers need.
//   - The app's own index route (app/index.tsx) takes over once the bundle runs, via lib/landing-dom.ts: Begin
//     becomes a client-side navigation, and leaving "/" swaps the classes back.
//   - English is in the DOM. The other four languages ride in <template> elements, which are inert and not page
//     text, so a crawler reads one clean English page. A visitor whose browser language is one of ours gets theirs
//     swapped in by a tiny inline script before the page is shown (the boot hides the English until then).
//   - No email collection here, by Melroy's rule (2026-10-18): email is only ever used to sign in.
//
// Pure: no React Native, no DOM. landingBoot is inlined by toString(), so it must stay self-contained (no imports,
// no module constants inside it) and plain enough for any browser that runs the app.

import { translate } from './i18n';

export const LANDING_LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
export type LandingLocale = (typeof LANDING_LOCALES)[number];

export const LANDING_ID = 'dd-landing';
export const SITE = 'https://doubledone.app';
export const APP_STORE_URL = 'https://apps.apple.com/app/doubledone/id6790136615';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.doubledone';
/** The app's first-run flag (lib/storage.ts ONBOARDED_KEY). landingBoot repeats it as a literal; a test holds them equal. */
export const ONBOARDED_STORAGE_KEY = 'doubledone.onboarded.v1';

/** The landing language for a browser: the FIRST preferred language if it is one of ours, else English. This is the
 *  app's own rule (lib/locale reads only the first device locale), so the page and the app always agree. */
export function pickLocale(languages: readonly (string | null | undefined)[]): LandingLocale {
  const first = String(languages[0] ?? '').slice(0, 2).toLowerCase();
  return (LANDING_LOCALES as readonly string[]).includes(first) ? (first as LandingLocale) : 'en';
}

/** Runs inline in <head> before first paint (see the header). Mirrors pickLocale and loadOnboarded exactly,
 *  including loadOnboarded's choice to treat unreadable storage as "already onboarded" (straight to the app). */
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

/** The FAQ, in display order: [question key, answer key]. Also feeds the FAQPage structured data. */
export const FAQ: readonly (readonly [string, string])[] = [
  ['landing.faqWhoQ', 'landing.faqWhoA'],
  ['landing.faqFreeQ', 'landing.faqFreeA'],
  ['landing.faqAccountQ', 'landing.faqAccountA'],
  ['landing.faqUnfinishedQ', 'landing.faqUnfinishedA'],
  ['landing.faqAiQ', 'landing.faqAiA'],
  ['landing.faqShareQ', 'landing.faqShareA'],
  ['landing.faqWhereQ', 'landing.faqWhereA'],
  ['landing.faqMedicalQ', 'landing.faqMedicalA'],
  ['landing.faqDeleteQ', 'landing.faqDeleteA'],
];

const MARK = '<span class="ddl-mark" aria-hidden="true"><span class="ddl-c1">✓</span><span class="ddl-c2">✓</span></span>';

function stores(tr: (k: string) => string): string {
  return `<div class="ddl-stores">
        <a href="${APP_STORE_URL}" class="ddl-badge"><img src="/img/app-store-badge.svg" alt="${esc(tr('welcome.appStoreBadgeA11y'))}" width="144" height="48" loading="lazy"></a>
        <a href="${PLAY_URL}" class="ddl-badge"><img src="/img/google-play-badge.png" alt="${esc(tr('welcome.playBadgeA11y'))}" width="140" height="54" loading="lazy"></a>
      </div>`;
}

/** One complete page in one language. Only one is ever in the DOM (id="ddl-page"). */
export function renderPage(loc: LandingLocale): string {
  const tr = (k: string) => translate(loc, k);
  const t = (k: string) => esc(tr(k));
  const begin = `<a class="ddl-btn" href="/today" data-dd-begin aria-label="${t('welcome.beginA11y')}">${t('common.begin')}</a>`;
  const steps = [
    ['1', 'widget.quickActionDumpSubtitle', 'welcome.step1Body'],
    ['2', 'welcome.step2Title', 'welcome.step2Body'],
    ['3', 'welcome.step3Title', 'welcome.step3Body'],
  ]
    .map(
      ([n, title, body]) =>
        `<li><span class="ddl-n" aria-hidden="true">${n}</span><div><h3>${t(title)}</h3><p>${t(body)}</p></div></li>`,
    )
    .join('\n          ');
  const faq = FAQ.map(
    ([q, a]) => `<details><summary><h3>${t(q)}</h3></summary><p>${t(a)}</p></details>`,
  ).join('\n        ');

  return `<div class="ddl-page" id="ddl-page" lang="${loc}">
  <a class="ddl-skip" href="#ddl-main">${t('landing.skipToContent')}</a>
  <header class="ddl-top">${MARK}<span class="ddl-word">DoubleDone</span></header>
  <main id="ddl-main">
    <section class="ddl-hero" aria-labelledby="ddl-h1">
      <p class="ddl-kicker">${t('landing.kicker')}</p>
      <h1 id="ddl-h1">${t('welcome.heroHeadline')}</h1>
      <p class="ddl-sub">${t('welcome.heroSub')}</p>
      ${begin}
      <p class="ddl-trust">${t('welcome.trustLine')}</p>
      <p class="ddl-also">${t('landing.alsoOn')}</p>
      ${stores(tr)}
      <div class="ddl-today" role="img" aria-label="${t('welcome.todayMockA11y')}">
        <div class="ddl-today-head" aria-hidden="true"><span class="ddl-today-title">${t('common.today')}</span><span class="ddl-today-date">${t('welcome.mockTodayDate')}</span></div>
        <ul aria-hidden="true">
          <li class="ddl-done"><span class="ddl-check">✓</span>${t('welcome.mockTask1')}</li>
          <li class="ddl-done"><span class="ddl-check">✓</span>${t('welcome.mockTask2')}</li>
          <li><span class="ddl-check ddl-open"></span>${t('welcome.mockTask3')}</li>
        </ul>
        <p class="ddl-today-foot" aria-hidden="true">${t('welcome.revealRestWaiting')}</p>
      </div>
      <div class="ddl-promise"><h2>${t('welcome.lead2')}</h2><p>${t('welcome.promiseBody')}</p></div>
    </section>
    <section class="ddl-how" aria-labelledby="ddl-how-h">
      <p class="ddl-label">${t('welcome.howLabel')}</p>
      <h2 id="ddl-how-h">${t('welcome.howHeadline')}</h2>
      <ol class="ddl-steps" role="list">
          ${steps}
      </ol>
    </section>
    <section class="ddl-payoff" aria-labelledby="ddl-pay-h">
      <span class="ddl-dot" aria-hidden="true">✓</span>
      <h2 id="ddl-pay-h">${t('welcome.keepHeading')}</h2>
      <p>${t('welcome.payoffBody')}</p>
    </section>
    <section class="ddl-faq" aria-labelledby="ddl-faq-h">
      <p class="ddl-label">${t('landing.faqLabel')}</p>
      <h2 id="ddl-faq-h">${t('landing.faqHeading')}</h2>
      <div class="ddl-qs">
        ${faq}
      </div>
    </section>
    <section class="ddl-closing">
      <p class="ddl-closing-line">${t('welcome.closingLine')}</p>
      ${begin}
      <p class="ddl-trust">${t('welcome.trustLine')}</p>
      ${stores(tr)}
      <p class="ddl-store-fine" lang="en">Google Play and the Google Play logo are trademarks of Google LLC.</p>
    </section>
  </main>
  <footer class="ddl-foot">
    <p>${t('welcome.footerWho')}</p>
    <nav class="ddl-links" aria-label="DoubleDone">
      <a href="/privacy">${t('landing.footerPrivacy')}</a>
      <a href="/terms">${t('landing.footerTerms')}</a>
      <a href="/support">${t('landing.footerSupport')}</a>
    </nav>
    <p class="ddl-foot-meta">${MARK}<span class="ddl-word">DoubleDone</span></p>
    <p class="ddl-fine">${t('landing.footerMedical')} ${t('welcome.footerFine')}</p>
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

const CSS = `
html.dd-app #dd-landing{display:none!important}
/* Keyed off "not the app", not "is the landing": with no JavaScript the boot never runs, and the page must still scroll. */
html:not(.dd-app) #root{display:none!important}
html:not(.dd-app),html:not(.dd-app) body{height:auto!important;min-height:100%;overflow:auto!important;overscroll-behavior-y:auto!important;background:#FAF6F1}
html:not(.ddl-ready)[data-dd-lang]:not([data-dd-lang="en"]) #ddl-page{visibility:hidden}
/* The app accent (#946475) is a hair under AA as TEXT on paper (4.498:1), so the page deepens it a touch. */
#dd-landing{--bg:#FAF6F1;--surface:#FFFFFF;--ink:#2B2722;--body:#5F564C;--soft:#6B6259;--line:#ECE4D8;--accent:#8D5D6F;--on-accent:#FFFFFF;--done:#7E9B6B;--on-done:#21261F;--shadow:0 24px 50px -28px rgba(43,39,34,.30);
  background:var(--bg);color:var(--ink);font-family:'Atkinson Hyperlegible',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased;-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;min-height:100vh}
@media (prefers-color-scheme:dark){
  html:not(.dd-app),html:not(.dd-app) body{background:#1B1917}
  #dd-landing{--bg:#1B1917;--surface:#252119;--ink:#F2EBE0;--body:#D8CEC0;--soft:#C9C0B4;--line:#34302A;--accent:#C68BA0;--on-accent:#2B2722;--done:#9DB98A;--on-done:#2B2722;--shadow:0 24px 50px -28px rgba(0,0,0,.55);color-scheme:dark}
}
#dd-landing *{box-sizing:border-box}
#dd-landing .ddl-page{max-width:640px;margin:0 auto;padding:40px 22px 64px}
#dd-landing h1,#dd-landing h2,#dd-landing h3,#dd-landing .ddl-today-title,#dd-landing .ddl-kicker,#dd-landing .ddl-closing-line,#dd-landing .ddl-today-foot{font-family:'Newsreader',Georgia,'Times New Roman',serif;color:var(--ink);font-weight:600;margin:0;text-wrap:balance}
#dd-landing p{margin:0}
#dd-landing a{color:var(--accent);text-underline-offset:3px}
#dd-landing :focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:6px}
#dd-landing .ddl-skip{position:absolute;left:-9999px;top:8px;background:var(--surface);color:var(--ink);padding:10px 14px;border-radius:8px;border:1px solid var(--line);z-index:10}
#dd-landing .ddl-skip:focus{left:12px}
#dd-landing .ddl-top{display:flex;align-items:center;gap:10px;margin-bottom:36px}
#dd-landing .ddl-mark{width:30px;height:30px;border-radius:9px;background:var(--surface);border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;line-height:1}
#dd-landing .ddl-c1{color:var(--done)}
#dd-landing .ddl-c2{color:var(--accent);margin-left:-5px}
#dd-landing .ddl-word{color:var(--soft);font-weight:700;font-size:14px;letter-spacing:.3px}
#dd-landing .ddl-kicker{color:var(--accent);font-style:italic;font-weight:500;font-size:20px;line-height:1.3;margin-bottom:14px}
#dd-landing h1{font-size:clamp(34px,8vw,44px);line-height:1.08;letter-spacing:-.6px}
#dd-landing .ddl-sub{color:var(--body);font-size:19px;line-height:1.6;margin-top:18px;max-width:30em}
#dd-landing .ddl-btn{display:flex;align-items:center;justify-content:center;min-height:52px;margin-top:28px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:17px;text-decoration:none;padding:0 28px}
#dd-landing .ddl-btn:hover{filter:brightness(1.05)}
#dd-landing .ddl-trust{color:var(--soft);font-size:15px;text-align:center;margin-top:12px}
#dd-landing .ddl-also{color:var(--soft);font-size:15px;text-align:center;margin-top:22px}
#dd-landing .ddl-stores{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;margin-top:12px}
#dd-landing .ddl-badge{display:inline-flex;min-height:48px;align-items:center;border-radius:10px}
#dd-landing .ddl-badge img{display:block;height:auto;max-width:100%}
#dd-landing .ddl-today{margin-top:40px;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:var(--shadow)}
#dd-landing .ddl-today-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
#dd-landing .ddl-today-title{font-size:26px}
#dd-landing .ddl-today-date{color:var(--soft);font-size:14px}
#dd-landing .ddl-today ul{list-style:none;margin:14px 0 0;padding:0}
#dd-landing .ddl-today li{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--line);font-size:16px}
#dd-landing .ddl-today li.ddl-done{color:var(--soft);text-decoration:line-through}
#dd-landing .ddl-check{width:24px;height:24px;flex:none;border-radius:999px;background:var(--done);color:var(--on-done);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;text-decoration:none}
#dd-landing .ddl-check.ddl-open{background:transparent;border:2px solid var(--soft)}
#dd-landing .ddl-today-foot{color:var(--accent);font-style:italic;font-weight:500;font-size:17px;margin-top:16px}
#dd-landing .ddl-promise{margin-top:40px;border-top:1px solid var(--line);padding-top:28px}
#dd-landing .ddl-promise h2,#dd-landing section>h2{font-size:clamp(27px,6vw,32px);line-height:1.2;letter-spacing:-.3px}
#dd-landing .ddl-promise p,#dd-landing section>p:not(.ddl-label){color:var(--body);font-size:18px;line-height:1.6;margin-top:16px;max-width:30em}
#dd-landing section{margin-top:56px}
#dd-landing .ddl-hero{margin-top:0}
#dd-landing .ddl-label{color:var(--soft);font-size:13px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:8px}
#dd-landing .ddl-steps{list-style:none;margin:20px 0 0;padding:0}
#dd-landing .ddl-steps li{display:flex;gap:18px;padding:24px 0;border-top:1px solid var(--line)}
#dd-landing .ddl-steps li:first-child{border-top:0}
#dd-landing .ddl-n{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:40px;line-height:1;color:var(--soft);min-width:28px}
#dd-landing .ddl-steps h3{font-size:23px;line-height:1.25}
#dd-landing .ddl-steps p{color:var(--body);font-size:17px;margin-top:8px}
#dd-landing .ddl-payoff{text-align:center}
#dd-landing .ddl-payoff p{margin-left:auto;margin-right:auto}
#dd-landing .ddl-dot{width:28px;height:28px;border-radius:999px;background:var(--done);color:var(--on-done);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;margin-bottom:16px}
#dd-landing .ddl-payoff h2{font-size:clamp(30px,7vw,38px)}
#dd-landing .ddl-qs{margin-top:20px;border-top:1px solid var(--line)}
#dd-landing details{border-bottom:1px solid var(--line)}
#dd-landing summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0;min-height:48px}
#dd-landing summary::-webkit-details-marker{display:none}
#dd-landing summary::after{content:'+';content:'+' / '';color:var(--accent);font-size:24px;line-height:1;flex:none}
#dd-landing details[open] summary::after{content:'\\2212';content:'\\2212' / ''}
#dd-landing summary h3{font-family:'Atkinson Hyperlegible',ui-sans-serif,system-ui,sans-serif;font-size:18px;font-weight:700;line-height:1.4}
#dd-landing details p{color:var(--body);font-size:17px;padding:0 0 20px;max-width:34em}
#dd-landing .ddl-fine{color:var(--soft);font-size:14px;line-height:1.55;margin-top:14px}
#dd-landing .ddl-closing{text-align:center}
#dd-landing .ddl-closing-line{font-size:clamp(26px,6vw,30px);line-height:1.2}
#dd-landing .ddl-store-fine{color:var(--soft);font-size:12px;margin-top:12px}
#dd-landing .ddl-foot{border-top:1px solid var(--line);margin-top:48px;padding-top:28px;color:var(--soft);font-size:15px}
#dd-landing .ddl-links{display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:14px}
#dd-landing .ddl-links a{display:inline-flex;min-height:44px;align-items:center;font-weight:700}
#dd-landing .ddl-foot-meta{display:flex;align-items:center;gap:10px;margin-top:18px}
@media (prefers-reduced-motion:reduce){#dd-landing *{transition:none!important;animation:none!important}}
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
  // The fonts are self-hosted (global.css @font-face, client/public/fonts). Preload only the two the first screen
  // needs, the headline's and the body's, so the hero does not repaint from the fallback.
  const head = [
    `<link rel="canonical" href="${SITE}/" />`,
    '<link rel="preload" href="/fonts/newsreader-600.woff2" as="font" type="font/woff2" crossorigin />',
    '<link rel="preload" href="/fonts/atkinson-400.woff2" as="font" type="font/woff2" crossorigin />',
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
