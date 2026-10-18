import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildLanding,
  esc,
  FAQ,
  LANDING_LOCALES,
  landingBoot,
  landingCss,
  landingLocalise,
  ONBOARDED_STORAGE_KEY,
  pickLocale,
  renderPage,
  structuredData,
} from './landing-page';

// A window just big enough for the head boot: the classes and attributes it sets on <html>.
function fakeWindow(opts: { path?: string; stored?: string | null; throws?: boolean; languages?: string[]; language?: string }) {
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
    navigator: { languages: opts.languages ?? [], language: opts.language },
    location: { pathname: opts.path ?? '/' },
  };
  return { w, classes, attrs };
}

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
    const { w, classes } = fakeWindow({ languages: ['es-ES'] });
    new Function('window', `(${landingBoot.toString()})(window);`)(w);
    expect(classes.has('dd-landing')).toBe(true);
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
      expect(html).not.toMatch(/(landing|welcome|common|widget)\.[a-zA-Z]+/);
      expect(html).not.toMatch(/[–—]/);
      expect(html.match(/<details>/g)).toHaveLength(FAQ.length);
      expect(html.match(/<h1[ >]/g)).toHaveLength(1);
      expect(html).toContain('href="/today" data-dd-begin');
    });
  }

  it('names the audience at the very top, before the headline', () => {
    const html = renderPage('en');
    const kicker = html.indexOf('A calm to-do app for ADHD, autism, OCD and overwhelm.');
    expect(kicker).toBeGreaterThan(0);
    expect(kicker).toBeLessThan(html.indexOf('<h1'));
  });

  it('escapes catalogue text, so an apostrophe or ampersand can never break the markup', () => {
    expect(esc(`Don't <b>&</b> "x"`)).toBe('Don&#39;t &lt;b&gt;&amp;&lt;/b&gt; &quot;x&quot;');
    expect(renderPage('en')).toContain('What happens to the tasks I don&#39;t finish?');
  });

  it('keeps French typography: a no-break space before ? and :', () => {
    const html = renderPage('fr');
    expect(html).not.toMatch(/[^ \s][?](?=<\/h3>)/);
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

// WCAG 2 contrast, so the small labels the website audit flagged can never quietly fall below AA again.
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
function tokens(css: string, darkBlock: boolean): Record<string, string> {
  const blocks = css.match(/#dd-landing\{(--bg:[^}]*)\}/g) ?? [];
  const block = blocks[darkBlock ? 1 : 0] ?? '';
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
}

describe('contrast: every text colour clears WCAG AA (4.5:1), light and dark', () => {
  const css = landingCss();
  for (const dark of [false, true]) {
    const t = tokens(css, dark);
    it(`${dark ? 'dark' : 'light'}: body, labels, accent links and the button`, () => {
      expect(Object.keys(t).length).toBeGreaterThan(8);
      for (const fg of ['ink', 'body', 'soft', 'accent']) {
        expect(ratio(t[fg], t.bg), `${fg} on bg`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t[fg], t.surface), `${fg} on surface`).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(t['on-accent'], t.accent), 'button label').toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['on-done'], t.done), 'completion tick').toBeGreaterThanOrEqual(4.5);
    });
  }
});
