import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { de } from './catalogs/de';
import { en } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import { it as itCatalog } from './catalogs/it';

// client/public/sw.js, the web reminder's service worker, run as it SHIPS (a plain script, no bundler) inside a fake
// service-worker global, so these tests read what the browser would show. It cannot import the catalogues, so it
// carries its own copy of the daily line, and the first block holds every copy equal to its catalogue.
const SW = readFileSync(join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');

type Shown = { title: string; options: { body?: string; tag?: string; renotify?: boolean } };
type Nav = { language?: string; languages?: readonly string[] } | undefined;

function boot(nav: Nav = {}, windows: { focus: () => Promise<unknown> }[] = []) {
  const listeners: Record<string, (event: any) => void> = {};
  const shown: Shown[] = [];
  const calls = { skipWaiting: 0, claim: 0, closed: 0, focused: 0, opened: [] as string[] };
  const self = {
    navigator: nav,
    addEventListener: (type: string, fn: (event: any) => void) => {
      listeners[type] = fn;
    },
    registration: {
      showNotification: (title: string, options: Shown['options']) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    skipWaiting: () => {
      calls.skipWaiting += 1;
      return Promise.resolve();
    },
    clients: {
      claim: () => {
        calls.claim += 1;
        return Promise.resolve();
      },
      matchAll: () => Promise.resolve(windows),
      openWindow: (url: string) => {
        calls.opened.push(url);
        return Promise.resolve(null);
      },
    },
  };
  new Function('self', SW)(self);
  /** Dispatch one event, as the browser would, and wait for everything it handed to waitUntil. */
  async function fire(type: string, extra: Record<string, unknown> = {}) {
    const waited: Promise<unknown>[] = [];
    listeners[type]?.({ waitUntil: (p: Promise<unknown>) => waited.push(p), ...extra });
    await Promise.all(waited);
  }
  return { listeners, shown, calls, fire };
}

const CATALOGS = { en, de, es, fr, it: itCatalog } as const;
/** A real browser tag per language, region and all: only the first two letters may decide. */
const TAGS: Record<keyof typeof CATALOGS, string> = { en: 'en-AU', de: 'de-AT', es: 'es-419', fr: 'fr-CA', it: 'it-IT' };

describe('sw.js: the daily reminder speaks the app’s language', () => {
  for (const loc of Object.keys(CATALOGS) as (keyof typeof CATALOGS)[]) {
    it(`${loc}: shows the catalogue’s own title and daily line, word for word`, async () => {
      const sw = boot({ languages: [TAGS[loc], 'en-GB'], language: TAGS[loc] });
      await sw.fire('push');
      expect(sw.shown).toHaveLength(1);
      expect(sw.shown[0].title).toBe(CATALOGS[loc].reminders.dailyTitle);
      expect(sw.shown[0].options.body).toBe(CATALOGS[loc].reminders.dailyBody);
    });
  }

  it('follows only the first preferred language, as the app does: Portuguese then Italian reads English', async () => {
    const sw = boot({ languages: ['pt-BR', 'it-IT'], language: 'pt-BR' });
    await sw.fire('push');
    expect(sw.shown[0].options.body).toBe(en.reminders.dailyBody);
  });

  it('falls back to navigator.language, then English, and never throws on a missing or odd navigator', async () => {
    const cases: [Nav, string][] = [
      [{ languages: [], language: 'fr-FR' }, fr.reminders.dailyBody],
      [{ language: 'ES' }, es.reminders.dailyBody],
      [{}, en.reminders.dailyBody],
      [undefined, en.reminders.dailyBody],
      [{ languages: ['__proto__'] }, en.reminders.dailyBody],
    ];
    for (const [nav, body] of cases) {
      const sw = boot(nav);
      await sw.fire('push');
      expect(sw.shown[0].options.body).toBe(body);
    }
  });

  it('reads the language at each push, so a language changed after the reminder was turned on is followed', async () => {
    const nav = { languages: ['en-AU'] as string[] };
    const sw = boot(nav);
    await sw.fire('push');
    nav.languages = ['de-DE'];
    await sw.fire('push');
    expect(sw.shown.map((s) => s.options.body)).toEqual([en.reminders.dailyBody, de.reminders.dailyBody]);
  });

  it('never shows words from the push itself: the server sends none, and any it sent would be ignored', async () => {
    const sw = boot({ languages: ['en-AU'] });
    await sw.fire('push', { data: { text: () => 'Call the bank about the loan', json: () => ({ body: 'x' }) } });
    expect(sw.shown[0].options.body).toBe(en.reminders.dailyBody);
  });
});

describe('sw.js: a day’s reminder still sounds when yesterday’s is unread', () => {
  it('replaces the unread one (one tag) and alerts again (renotify), so day two is never a silent swap', async () => {
    const sw = boot({ languages: ['en-AU'] });
    await sw.fire('push');
    await sw.fire('push');
    for (const s of sw.shown) {
      expect(s.options.tag).toBe('doubledone-daily');
      expect(s.options.renotify).toBe(true);
    }
  });
});

describe('sw.js: a new version takes over without waiting for every tab to close', () => {
  it('skips waiting on install and claims the open pages on activate', async () => {
    const sw = boot();
    await sw.fire('install');
    expect(sw.calls.skipWaiting).toBe(1);
    await sw.fire('activate');
    expect(sw.calls.claim).toBe(1);
  });

  it('still has no fetch handler, so taking over changes no request any page makes', () => {
    expect(Object.keys(boot().listeners).sort()).toEqual(['activate', 'install', 'notificationclick', 'push']);
  });
});

describe('sw.js: tapping the reminder', () => {
  const tap = (sw: ReturnType<typeof boot>) => sw.fire('notificationclick', { notification: { close: () => (sw.calls.closed += 1) } });

  it('closes it and brings an open DoubleDone to the front', async () => {
    let focused = 0;
    const sw = boot({}, [{ focus: () => Promise.resolve((focused += 1)) }]);
    await tap(sw);
    expect(sw.calls.closed).toBe(1);
    expect(focused).toBe(1);
    expect(sw.calls.opened).toEqual([]);
  });

  it('opens the app when none is open', async () => {
    const sw = boot();
    await tap(sw);
    expect(sw.calls.opened).toEqual(['/']);
  });
});
