import { afterEach, describe, expect, it } from 'vitest';

import { setActiveLocale } from './i18n-active';
import { menuPillLabel } from './menu-a11y';

// The Menu pill's spoken label: every destination on the Menu page, in PAGE order, each once.
describe('menuPillLabel', () => {
  afterEach(() => setActiveLocale('en', undefined));

  it('names Settings first (second on the page, after the way back) and Premium last', () => {
    expect(menuPillLabel({ ai: true, ours: true })).toBe('Menu: Settings, Calendar, Routines, Repeating, Ours, Chart a course, Premium');
  });

  it('drops Chart a course with AI off, and Ours when its card does not show', () => {
    expect(menuPillLabel({ ai: false, ours: true })).toBe('Menu: Settings, Calendar, Routines, Repeating, Ours, Premium');
    expect(menuPillLabel({ ai: true, ours: false })).toBe('Menu: Settings, Calendar, Routines, Repeating, Chart a course, Premium');
    expect(menuPillLabel({ ai: false, ours: false })).toBe('Menu: Settings, Calendar, Routines, Repeating, Premium');
  });

  it('builds every language from its own titles, with no soft hyphens spoken', () => {
    for (const lang of ['de', 'es', 'fr', 'it'] as const) {
      setActiveLocale(lang, undefined);
      const label = menuPillLabel({ ai: true, ours: true });
      expect(label, lang).not.toMatch(/\u00AD/);
      expect(label.split(', ').length, lang).toBe(7);
    }
    setActiveLocale('de', undefined);
    expect(menuPillLabel({ ai: false, ours: false }).startsWith('Menü: Einstellungen, ')).toBe(true);
    setActiveLocale('fr', undefined);
    expect(menuPillLabel({ ai: false, ours: false }).startsWith('Menu : ')).toBe(true);
  });
});
