import { describe, expect, it } from 'vitest';

import { de } from './catalogs/de';
import { en } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import { it as itCatalog } from './catalogs/it';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  resolveReduceMotion,
  resolveScheme,
  scaleFor,
  serializeSettings,
  type Settings,
} from './settings';

describe('resolveScheme', () => {
  it('follows the device scheme when set to system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('defaults to light when the device scheme is unknown', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });

  it('honours an explicit override regardless of the device', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
  });
});

describe('scaleFor', () => {
  it('shrinks, holds, and grows around 1', () => {
    expect(scaleFor('small')).toBeLessThan(1);
    expect(scaleFor('default')).toBe(1);
    expect(scaleFor('large')).toBeGreaterThan(1);
  });

  it('stays within a calm range that will not break layouts', () => {
    expect(scaleFor('small')).toBeGreaterThanOrEqual(0.85);
    expect(scaleFor('large')).toBeLessThanOrEqual(1.3);
  });
});

describe('resolveReduceMotion', () => {
  it('reduces whenever the preference says so', () => {
    expect(resolveReduceMotion('reduce', false)).toBe(true);
    expect(resolveReduceMotion('reduce', true)).toBe(true);
  });

  it('follows the system flag when set to system', () => {
    expect(resolveReduceMotion('system', true)).toBe(true);
    expect(resolveReduceMotion('system', false)).toBe(false);
  });
});

describe('parseSettings', () => {
  it('returns defaults for null, empty, or garbage', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
  });

  it('fills missing fields from defaults', () => {
    expect(parseSettings(JSON.stringify({ theme: 'dark' }))).toEqual({
      theme: 'dark',
      textSize: 'default',
      motion: 'system',
      themePreset: 'dusk',
      appearance: 'standard',
      aiEnabled: true,
      finishedTasks: 'keep',
    });
  });

  it('reads the finished-tasks choice and rejects anything else', () => {
    expect(parseSettings(JSON.stringify({ finishedTasks: 'tuck' })).finishedTasks).toBe('tuck');
    expect(parseSettings(JSON.stringify({ finishedTasks: 'keep' })).finishedTasks).toBe('keep');
    expect(parseSettings(JSON.stringify({ finishedTasks: 'vanish' })).finishedTasks).toBe('keep');
    expect(parseSettings(JSON.stringify({ theme: 'dark' })).finishedTasks).toBe('keep'); // an older blob, from before the choice existed
  });

  it('rejects out-of-range values per field', () => {
    expect(parseSettings(JSON.stringify({ theme: 'neon', textSize: 'huge', motion: 'always' }))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('preserves a fully valid blob', () => {
    const s: Settings = { theme: 'light', textSize: 'large', motion: 'reduce', themePreset: 'rose', appearance: 'quiet', aiEnabled: false, finishedTasks: 'tuck' };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('validates the theme preset, falling back to dusk for an unknown one', () => {
    expect(parseSettings(JSON.stringify({ themePreset: 'sage' })).themePreset).toBe('sage');
    expect(parseSettings(JSON.stringify({ themePreset: 'neon' })).themePreset).toBe('dusk');
  });

  it('validates the appearance flag, defaulting an unknown one to standard', () => {
    expect(parseSettings(JSON.stringify({ appearance: 'quiet' })).appearance).toBe('quiet');
    expect(parseSettings(JSON.stringify({ appearance: 'neon' })).appearance).toBe('standard');
  });

  it('parses aiEnabled, defaulting to on for a missing or non-boolean value', () => {
    expect(parseSettings(JSON.stringify({ aiEnabled: false })).aiEnabled).toBe(false);
    expect(parseSettings(JSON.stringify({ aiEnabled: true })).aiEnabled).toBe(true);
    expect(parseSettings(JSON.stringify({})).aiEnabled).toBe(true);
    expect(parseSettings(JSON.stringify({ aiEnabled: 'no' })).aiEnabled).toBe(true);
  });
});

// Quiet has been free for everyone since 2026-09-27. The gate only ever lived inline in the Settings
// screen, which the harness does not render, so what CAN drift is the copy: a Premium list or blurb
// that sells Quiet again would tell a free user they are using something paid, and a hint written
// for the old gate would contradict the row it sits on. The appearance itself was never gated at
// read time: parseSettings keeps a stored 'quiet' whatever the entitlement, as the tests above show.
describe('Quiet is free, and no Premium copy sells it', () => {
  const catalogs = { en, de, es, fr, it: itCatalog };

  it.each(Object.entries(catalogs))('%s: nothing under premium or the welcome Premium screen names Quiet', (_lang, c) => {
    // Case-sensitive on purpose: the English welcome's "quiet stats" is an adjective, not the look.
    const quiet = new RegExp('\\b' + c.settings.appearanceQuiet + '\\b');
    const selling = [
      ...Object.values(c.premium),
      ...Object.entries(c.welcome)
        .filter(([key]) => key.startsWith('premium'))
        .map(([, value]) => value),
    ];
    expect(selling.filter((line) => quiet.test(line))).toEqual([]);
  });

  it.each(Object.entries(catalogs))('%s: the Interface hint is one line for everyone and never says Premium', (_lang, c) => {
    expect(c.settings.appearanceHint).toContain(c.settings.appearanceQuiet);
    expect(c.settings.appearanceHint).not.toMatch(/Premium/);
  });
});
