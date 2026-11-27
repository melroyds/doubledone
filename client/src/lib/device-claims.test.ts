import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { de } from './catalogs/de';
import { en } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import { it as italian } from './catalogs/it';
import { type Locale, SUPPORTED, translate } from './i18n';

// What the app may say about where your words go (2026-11-27). Android's own backup to the person's Google account
// copies the app's data, tasks included, because app.json leaves allowBackup at Expo's default (true) and sets no
// backup rules. So "what you write never leaves the device" was untrue on Android, in both privacy copies, on the
// front page and in the welcome. The line drawn: a sentence may say where your tasks are KEPT ("live on your device",
// "stay on this device"), because a backup is a copy, but never that nothing goes anywhere else. What stays true
// everywhere is that what you write is never sent to us unless you choose an AI feature or sync.

const CLIENT = join(__dirname, '..', '..');

/** The copy with JSX's apostrophe entity read and every run of whitespace made one space, so a sentence reads the
 * same in the in-app copy and the public one, however each is wrapped. */
function prose(src: string): string {
  return src.replace(/&apos;/g, "'").replace(/\s+/g, ' ');
}

describe('the privacy copies say what you write is never sent to us, and name Android’s own backup', () => {
  const COPIES: [string, string][] = [
    ['privacy.html', join(CLIENT, 'public', 'privacy.html')],
    ['privacy.tsx', join(CLIENT, 'src', 'app', 'privacy.tsx')],
  ];
  const SAID = [
    'with no account, and what you write is never sent to us unless you choose an AI feature or sync.',
    "On Android, your phone's own backup to your Google account can include the app's data, your tasks with it, which " +
      'is how a new phone can bring them back.',
    'That backup is kept by Google for you, and we never see it.',
  ];

  for (const [name, file] of COPIES) {
    it(`${name} says it word for word, and no longer says it never leaves the device`, () => {
      const copy = prose(readFileSync(file, 'utf8'));
      for (const sentence of SAID) expect(copy, name).toContain(sentence);
      expect(copy, name).not.toContain('never leaves the device');
    });
  }

  it('they hold only while Android backs the app up: app.json leaves allowBackup at Expo’s default', () => {
    // Turning the backup off (allowBackup false, or backup rules that leave the tasks out) makes the backup sentence
    // untrue in the other direction. Change both privacy copies in the same commit as the config.
    const app = JSON.parse(readFileSync(join(CLIENT, 'app.json'), 'utf8')) as { expo: { android?: Record<string, unknown> } };
    expect(app.expo.android?.allowBackup).toBeUndefined();
    expect(JSON.stringify(app)).not.toMatch(/fullBackupContent|dataExtractionRules/);
  });
});

describe('the front page’s privacy line', () => {
  it('says what you write is never sent to us, and that an Android phone’s own Google backup can include it', () => {
    expect(translate('en', 'landing.priv1')).toContain(
      "What you write is never sent to us unless you choose an AI feature or sync, though an Android phone's own Google " +
        'backup can include it.',
    );
  });

  it('names Android in every language', () => {
    for (const loc of SUPPORTED) expect(translate(loc, 'landing.priv1'), loc).toContain('Android');
  });
});

describe('no line in any language says what you write goes nowhere else', () => {
  // Each language's own words for "never leaves", "sent anywhere" and "only on this device", the shapes the old lines
  // took (landing.priv1, welcome.capturePrivacyNoAi). Every string in the catalogue is read, so a new line cannot
  // bring the claim back somewhere else.
  const NOWHERE_ELSE: Record<Locale, RegExp> = {
    en: /never leaves|sent anywhere|on this device only|only on this device/i,
    de: /verlässt es nie|irgendwohin|nirgendwohin|nur auf diesem Gerät/i,
    fr: /n[’']en sort jamais|nulle part|uniquement sur cet appareil|sur cet appareil uniquement/i,
    it: /non ne esce|esce da qui|da nessuna parte|solo su questo dispositivo/i,
    es: /nunca sale de|a ningún sitio|a ninguna parte|solo en este dispositivo/i,
  };
  const CATALOGS: Record<Locale, unknown> = { en, de, fr, it: italian, es };

  function strings(node: unknown, path: string, out: [string, string][] = []): [string, string][] {
    if (typeof node === 'string') out.push([path, node]);
    else if (Array.isArray(node)) node.forEach((value, i) => strings(value, `${path}[${i}]`, out));
    else if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) strings(value, path ? `${path}.${key}` : key, out);
    }
    return out;
  }

  for (const loc of SUPPORTED) {
    it(`${loc}: none`, () => {
      const lines = strings(CATALOGS[loc], '');
      expect(lines.length, loc).toBeGreaterThan(500);
      const said = lines.filter(([, line]) => NOWHERE_ELSE[loc].test(line)).map(([key, line]) => `${key}: ${line}`);
      expect(said, loc).toEqual([]);
    });
  }

  it('the welcome’s capture note, with AI off and signed out, says nothing is sent to us or to an AI', () => {
    expect(translate('en', 'welcome.capturePrivacyNoAi')).toBe('Kept on this device. Nothing here is sent to us or to an AI.');
  });
});
