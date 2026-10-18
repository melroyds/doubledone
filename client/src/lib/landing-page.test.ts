import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BADGES,
  buildLanding,
  esc,
  FAQ,
  LANDING_LOCALES,
  landingBoot,
  landingCss,
  landingLocalise,
  ONBOARDED_STORAGE_KEY,
  PICTURES,
  pickLocale,
  pickPlatform,
  renderPage,
  structuredData,
  TOKENS,
} from './landing-page';

const PUBLIC = join(__dirname, '..', '..', 'public');

// A window just big enough for the head boot: the classes and attributes it sets on <html>.
function fakeWindow(opts: {
  path?: string;
  stored?: string | null;
  throws?: boolean;
  languages?: string[];
  language?: string;
  userAgent?: string;
}) {
  const classes = new Set<string>();
  const attrs: Record<string, string> = {};
  const w = {
    document: {
      documentElement: {
        classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
        setAttribute: (k: string, v: string) => (attrs[k] = v),
        getAttribute: (k: string) => attrs[k] ?? null,
      },
    },
    localStorage: {
      getItem: (k: string) => {
        if (opts.throws) throw new Error('blocked');
        return k === ONBOARDED_STORAGE_KEY ? (opts.stored ?? null) : null;
      },
    },
    navigator: { languages: opts.languages ?? [], language: opts.language, userAgent: opts.userAgent },
    location: { pathname: opts.path ?? '/' },
  };
  return { w, classes, attrs };
}

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  pixel: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
  tablet: 'Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  laptop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
};

describe('pickLocale: the app’s own rule, first preferred language or English', () => {
  it('takes the first language when it is one of ours, whatever the region', () => {
    expect(pickLocale(['de-AT', 'en-GB'])).toBe('de');
    expect(pickLocale(['es-419'])).toBe('es');
    expect(pickLocale(['FR-ca'])).toBe('fr');
  });
  it('never looks past the first: a Portuguese first choice reads English, as the app does', () => {
    expect(pickLocale(['pt-BR', 'it-IT'])).toBe('en');
    expect(pickLocale([])).toBe('en');
    expect(pickLocale([undefined, null])).toBe('en');
  });
});

describe('pickPlatform: one primary action, the phone’s own store or Begin', () => {
  it('sends an iPhone to the App Store and an Android phone to Google Play', () => {
    expect(pickPlatform(UA.iphone)).toBe('ios');
    expect(pickPlatform(UA.pixel)).toBe('android');
  });
  it('gives a laptop, an iPad, an Android tablet and an unknown browser Begin', () => {
    expect(pickPlatform(UA.laptop)).toBe('desktop');
    expect(pickPlatform(UA.ipad)).toBe('desktop');
    expect(pickPlatform(UA.tablet)).toBe('desktop');
    expect(pickPlatform('')).toBe('desktop');
    expect(pickPlatform(undefined)).toBe('desktop');
  });
  it('is exactly what the inlined boot decides, for every case', () => {
    for (const ua of Object.values(UA)) {
      const { w, attrs } = fakeWindow({ userAgent: ua });
      landingBoot(w);
      expect(attrs['data-platform']).toBe(pickPlatform(ua));
    }
  });
});

describe('landingBoot: who sees the static page, decided before first paint', () => {
  it('shows it to a fresh visitor at the root, in their language', () => {
    const { w, classes, attrs } = fakeWindow({ languages: ['it-IT'] });
    landingBoot(w);
    expect([...classes]).toEqual(['dd-landing']);
    expect(attrs['data-dd-lang']).toBe('it');
    expect(attrs.lang).toBe('it');
  });

  it('hides it from a returning visitor, who goes straight to the app with no flash', () => {
    const { w, classes, attrs } = fakeWindow({ stored: 'yes', languages: ['de'] });
    landingBoot(w);
    expect([...classes]).toEqual(['dd-app']);
    expect(attrs.lang).toBeUndefined();
  });

  it('hides it on every app route, which the SPA fallback serves this same HTML for', () => {
    for (const path of ['/today', '/settings', '/share-target', '/welcome']) {
      const { w, classes } = fakeWindow({ path });
      landingBoot(w);
      expect([...classes]).toEqual(['dd-app']);
    }
  });

  it('treats unreadable storage as onboarded, exactly as loadOnboarded does', () => {
    const { w, classes } = fakeWindow({ throws: true });
    landingBoot(w);
    expect([...classes]).toEqual(['dd-app']);
  });

  it('falls back to navigator.language, then English', () => {
    const a = fakeWindow({ languages: [], language: 'fr-FR' });
    landingBoot(a.w);
    expect(a.attrs['data-dd-lang']).toBe('fr');
    const b = fakeWindow({ languages: ['ja-JP'] });
    landingBoot(b.w);
    expect(b.attrs['data-dd-lang']).toBe('en');
  });

  it('survives being inlined: the toString() that ships runs on its own', () => {
    const { w, classes, attrs } = fakeWindow({ languages: ['es-ES'], userAgent: UA.pixel });
    new Function('window', `(${landingBoot.toString()})(window);`)(w);
    expect(classes.has('dd-landing')).toBe(true);
    expect(attrs['data-platform']).toBe('android');
  });

  it('reads the same storage key and value the app writes', () => {
    const storage = readFileSync(join(__dirname, 'storage.ts'), 'utf8');
    expect(storage).toContain(`const ONBOARDED_KEY = '${ONBOARDED_STORAGE_KEY}';`);
    expect(storage).toContain("AsyncStorage.setItem(ONBOARDED_KEY, 'yes')");
    // The compiled source may carry either quote style. What matters is the exact key, compared to 'yes'.
    const src = landingBoot.toString().replace(/"/g, "'");
    expect(src).toContain(`getItem('${ONBOARDED_STORAGE_KEY}') === 'yes'`);
  });
});

describe('renderPage: one whole page per language, from the catalogues', () => {
  for (const loc of LANDING_LOCALES) {
    it(`${loc}: every string resolves, nothing raw, no dashes`, () => {
      const html = renderPage(loc);
      expect(html).toContain(`lang="${loc}"`);
      expect(html).not.toMatch(/(landing|welcome|common|widget|today|phase|estimate)\.[a-zA-Z]+[.a-zA-Z]*/);
      expect(html).not.toMatch(/[–—]/);
      // No control characters (a botched regex once turned French "?" into U+0001 across seventeen lines).
      expect(html).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
      expect(html.match(/<details>/g)).toHaveLength(FAQ.length);
      expect(html.match(/<h1[ >]/g)).toHaveLength(1);
      expect(html).toContain('href="/today" data-dd-begin');
    });

    it(`${loc}: the headings run h1, then h2s, with h3s only under steps and moments`, () => {
      const html = renderPage(loc);
      const order = [...html.matchAll(/<(h[123])[ >]/g)].map((m) => m[1]).join(',');
      expect(order).toBe('h1,h2,h2,h3,h3,h3,h2,h3,h3,h3,h3,h2,h2,h2,h2,h2');
    });

    it(`${loc}: one action per screen, three versions in the HTML, the trust line only in the hero`, () => {
      const html = renderPage(loc);
      for (const k of ['act-ios', 'act-android', 'act-desktop']) expect(html.match(new RegExp(`class="${k}"`, 'g'))).toHaveLength(2);
      expect(html.match(/class="ddl-trust"/g)).toHaveLength(3);
      expect(html.match(/class="ddl-also"/g)).toHaveLength(1);
      // Begin twice (hero, closing) and the browser link on both phone versions, twice.
      expect(html.match(/data-dd-begin/g)).toHaveLength(6);
    });

    it(`${loc}: every picture is this language’s own screen, lazy, with words for a screen reader`, () => {
      const html = renderPage(loc);
      for (const name of Object.keys(PICTURES)) {
        expect(html).toContain(`/landing/${name}-light-${loc}.webp`);
        expect(html).toContain(`/landing/${name}-dark-${loc}.webp`);
      }
      const imgs = [...html.matchAll(/<img src="\/landing\/[^"]+" width="\d+" height="\d+" alt="([^"]*)" loading="lazy"/g)];
      expect(imgs).toHaveLength(Object.keys(PICTURES).length);
      for (const m of imgs) expect(m[1].length).toBeGreaterThan(10);
    });

    it(`${loc}: the trademark lines stay English, as legal statements (decision 2026-08-01)`, () => {
      expect(renderPage(loc)).toMatch(/<p class="ddl-tm" lang="en">Apple, the Apple logo and iPhone are trademarks of Apple Inc\.[^<]*Google LLC\.<\/p>/);
    });
  }

  it('names the audience inside the one heading, before the belief', () => {
    const html = renderPage('en');
    expect(html).toContain(
      '<h1 id="ddl-h1"><span class="ddl-kicker">A calm to-do list for adults with ADHD, autism, OCD and overwhelm.</span> <span class="ddl-belief">Today is finite and achievable.</span></h1>',
    );
  });

  it('never says "Private by default": the app keeps that phrase for AI-off, and AI starts on', () => {
    const html = renderPage('en');
    expect(html).not.toMatch(/Private by default/i);
    expect(html).toContain('On your device by default');
  });

  it('draws the card the way the app does: done rows not struck through, one step of eight filled', () => {
    const css = landingCss();
    expect(css).not.toContain('line-through');
    expect(css).toContain('width:12.5%');
  });

  it('escapes catalogue text, so an apostrophe or ampersand can never break the markup', () => {
    expect(esc(`Don't <b>&</b> "x"`)).toBe('Don&#39;t &lt;b&gt;&amp;&lt;/b&gt; &quot;x&quot;');
    expect(renderPage('en')).toContain('It&#39;s there for when your brain says you did nothing.');
  });

  it('keeps French typography: a no-break space before ? and :', () => {
    const html = renderPage('fr');
    expect(html).not.toMatch(/[^ \s][?:](?=<\/(summary|p)>)/);
  });

  it('marks the English-only developer docs as English for the other four languages', () => {
    expect(renderPage('en')).not.toContain('hreflang');
    for (const l of ['de', 'es', 'fr', 'it'] as const) expect(renderPage(l)).toContain('/api/v1/docs" hreflang="en"');
  });
});

describe('the files the page points at are really there', () => {
  it('every picture, both themes, all five languages', () => {
    const missing: string[] = [];
    for (const loc of LANDING_LOCALES)
      for (const name of Object.keys(PICTURES))
        for (const theme of ['light', 'dark'])
          if (!existsSync(join(PUBLIC, 'landing', `${name}-${theme}-${loc}.webp`))) missing.push(`${name}-${theme}-${loc}`);
    expect(missing).toEqual([]);
  });
  it('every badge', () => {
    for (const b of Object.values(BADGES)) {
      expect(existsSync(join(PUBLIC, b.appStore)), b.appStore).toBe(true);
      expect(existsSync(join(PUBLIC, b.play)), b.play).toBe(true);
    }
  });
});

describe('structuredData: the site’s name, and nothing Google would flag', () => {
  it('is one valid WebSite object, with no app, FAQ or ratings markup', () => {
    const data = JSON.parse(structuredData());
    expect(data['@type']).toBe('WebSite');
    expect(data.name).toBe('DoubleDone');
    expect(data.url).toBe('https://doubledone.app/');
    expect(JSON.stringify(data)).not.toMatch(/SoftwareApplication|FAQPage|aggregateRating|review/i);
  });
  it('can never close its own <script> early', () => {
    expect(structuredData()).not.toContain('<');
  });
});

describe('the page without JavaScript, and by voice', () => {
  it('scrolls and hides the app shell unless the boot said "app" (a no-JS visitor gets neither class)', () => {
    const css = landingCss();
    expect(css).toContain('html:not(.dd-app) #root{display:none!important}');
    expect(css).toContain('html:not(.dd-app),html:not(.dd-app) body{height:auto!important');
    expect(css).not.toMatch(/html\.dd-landing[ ,]/);
  });
  it('shows the laptop version unless the boot named a phone, so a no-JS visitor still gets Begin', () => {
    const css = landingCss();
    expect(css).toContain('#dd-landing .act-ios,#dd-landing .act-android{display:none}');
    // Begin is hidden ONLY under a phone's data-platform, never by a rule of its own.
    expect(css).toContain('html[data-platform="ios"] #dd-landing .act-desktop,html[data-platform="android"] #dd-landing .act-desktop{display:none}');
    expect(css).not.toMatch(/(^|\})#dd-landing \.act-desktop\{display:none\}/);
  });
  for (const loc of LANDING_LOCALES) {
    it(`${loc}: Begin's spoken name starts with the word on the button (WCAG 2.5.3)`, () => {
      const html = renderPage(loc);
      const m = html.match(/aria-label="([^"]+)">([^<]+)<\/a>/);
      expect(m).not.toBeNull();
      expect(m![1].toLowerCase().startsWith(m![2].toLowerCase())).toBe(true);
    });
  }
});

describe('buildLanding: what the build writes into index.html', () => {
  const { head, body } = buildLanding();
  it('puts the canonical, the data, the style and the boot in the head', () => {
    expect(head).toContain('<link rel="canonical" href="https://doubledone.app/" />');
    expect(head).toContain('application/ld+json');
    expect(head).toContain('id="dd-landing-css"');
    expect(head).toContain('id="dd-landing-boot"');
    expect(head).toContain('href="/fonts/newsreader-600.woff2" as="font"');
  });
  it('loads nothing from Google: the fonts are self-hosted', () => {
    expect(head + body).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    const css = readFileSync(join(__dirname, '..', 'global.css'), 'utf8');
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(css).toContain("url('/fonts/newsreader-600.woff2')");
  });
  it('ships English as the page and the other four as inert templates', () => {
    expect(body.startsWith('<div id="dd-landing">')).toBe(true);
    const outside = body.replace(/<template[\s\S]*?<\/template>/g, '');
    expect(outside.match(/id="ddl-page"/g)).toHaveLength(1);
    expect(outside).toContain('lang="en"');
    for (const l of ['de', 'es', 'fr', 'it']) expect(body).toContain(`<template id="ddl-t-${l}" lang="${l}">`);
  });
});

describe('no email collection on the landing page (email is only ever used to sign in)', () => {
  for (const loc of LANDING_LOCALES) {
    it(`${loc}: no form, no email field, nothing posted anywhere`, () => {
      const html = renderPage(loc);
      expect(html).not.toMatch(/<form|type="email"|\/subscribe/);
    });
  }
});

describe('landingLocalise: the visitor’s language swapped in before the page shows', () => {
  function fakeDoc(lang: string | null, withTemplate = true) {
    const classes = new Set<string>();
    let current = 'en-page';
    const page = { parentNode: { replaceChild: (next: string) => (current = next) } };
    const doc = {
      documentElement: {
        getAttribute: () => lang,
        classList: { add: (c: string) => classes.add(c) },
      },
      getElementById: (id: string) => {
        if (id === 'ddl-page') return page;
        if (withTemplate && id === `ddl-t-${lang}`) return { content: { cloneNode: () => `${lang}-page` } };
        return null;
      },
    };
    return { w: { document: doc }, classes, now: () => current };
  }
  it('swaps German in for a German browser, then marks the page ready', () => {
    const f = fakeDoc('de');
    landingLocalise(f.w);
    expect(f.now()).toBe('de-page');
    expect(f.classes.has('ddl-ready')).toBe(true);
  });
  it('leaves English alone, and still reveals the page if a template is missing', () => {
    const en = fakeDoc('en');
    landingLocalise(en.w);
    expect(en.now()).toBe('en-page');
    const missing = fakeDoc('it', false);
    landingLocalise(missing.w);
    expect(missing.now()).toBe('en-page');
    expect(missing.classes.has('ddl-ready')).toBe(true);
  });
});

// WCAG 2 contrast, so no text on the page can ever quietly fall below AA.
function lum(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('contrast: every text colour clears WCAG AA (4.5:1), light and dark', () => {
  for (const theme of ['light', 'dark'] as const) {
    const p = TOKENS[theme];
    it(`${theme}: page text, links and the button`, () => {
      for (const fg of [p.ink, p.body, p.soft, p.mauve]) {
        expect(ratio(fg, p.paper)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(fg, p.surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(p.onMauve, p.mauve), 'Begin label').toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: the drawn card, on every stop of its sky and on its rows`, () => {
      for (const bg of [p.skyTop, p.skyMid, p.skyEnd]) {
        expect(ratio(p.ink, bg)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(p.cardSoft, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(p.mauve, p.tint), 'the selected Energy word').toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.ink, p.row)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.cardSoft, p.row), 'done rows').toBeGreaterThanOrEqual(4.5);
    });
  }
  it('the stylesheet uses exactly these tokens', () => {
    const css = landingCss();
    expect(css).toContain(`--mauve:${TOKENS.light.mauve}`);
    expect(css).toContain(`--mauve:${TOKENS.dark.mauve}`);
  });
});
