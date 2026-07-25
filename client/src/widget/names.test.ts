import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LIGHT_WIDGET, TODAY_WIDGET, WIDGET_NAMES } from './names';

// The widget names live in TWO places by necessity: these constants (which the headless handler uses
// to tell the two widgets apart, and the updater uses to fan out) and app.json's plugin config (from
// which the native providers are generated). A drift between them breaks NOTHING loudly: the widget
// still renders, but the handler stops recognising it and updates stop arriving, which is exactly
// the kind of silent failure that cost a month on this feature already. So the match is a test.
describe('widget names', () => {
  const appJson = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8'));
  const plugin = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'react-native-android-widget');
  const configured: string[] = plugin[1].widgets.map((w: { name: string }) => w.name);

  it('are exactly the widgets configured in app.json', () => {
    expect([...WIDGET_NAMES].sort()).toEqual([...configured].sort());
  });

  it('includes the system-following default and the always-light variant', () => {
    expect(WIDGET_NAMES).toContain(TODAY_WIDGET);
    expect(WIDGET_NAMES).toContain(LIGHT_WIDGET);
    expect(TODAY_WIDGET).not.toBe(LIGHT_WIDGET);
  });

  it('every configured widget declares the label and sizing the picker needs', () => {
    for (const w of plugin[1].widgets) {
      expect(w.label, `${w.name} needs a picker label`).toBeTruthy();
      expect(w.resizeMode, `${w.name} must be resizable`).toBe('horizontal|vertical');
      expect(w.minWidth, `${w.name} needs a minWidth`).toMatch(/dp$/);
      expect(w.minHeight, `${w.name} needs a minHeight`).toMatch(/dp$/);
    }
  });
});
