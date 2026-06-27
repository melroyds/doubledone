import { describe, expect, it } from 'vitest';

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
      accent: 'mauve',
    });
  });

  it('rejects out-of-range values per field', () => {
    expect(parseSettings(JSON.stringify({ theme: 'neon', textSize: 'huge', motion: 'always' }))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('preserves a fully valid blob', () => {
    const s: Settings = { theme: 'light', textSize: 'large', motion: 'reduce', accent: 'rose' };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('validates the accent, falling back to mauve for an unknown one', () => {
    expect(parseSettings(JSON.stringify({ accent: 'teal' })).accent).toBe('teal');
    expect(parseSettings(JSON.stringify({ accent: 'neon' })).accent).toBe('mauve');
  });
});
