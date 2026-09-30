import { describe, expect, it } from 'vitest';

import { spoken, translate } from './i18n';

// Soft hyphens are for the eye: a long German word breaks at a syllable at huge text sizes. A screen
// reader must never get them, so every label built from a hyphenated catalogue string goes through spoken().
describe('spoken', () => {
  it('strips every soft hyphen and leaves everything else alone', () => {
    expect(spoken('Ein­stel­lungen')).toBe('Einstellungen');
    expect(spoken('Wieder­kehrend, Menü: Premium')).toBe('Wiederkehrend, Menü: Premium');
    expect(spoken('Menu : Réglages')).toBe('Menu : Réglages'); // the French no-break space stays
    expect(spoken('')).toBe('');
  });

  it('turns the hyphenated German titles back into the plain words', () => {
    expect(spoken(translate('de', 'settings.title'))).toBe('Einstellungen');
    expect(spoken(translate('de', 'repeat.title'))).toBe('Wiederkehrend');
    expect(spoken(translate('de', 'rooms.premiumHintFreeAi'))).toBe('Erinnerungsalbum, mehr KI, deine Farbe');
    // ...and they really do carry the soft hyphens the eye needs
    expect(translate('de', 'settings.title')).toContain('­');
  });
});
