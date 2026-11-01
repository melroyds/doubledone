import { describe, expect, it } from 'vitest';

import { SUPPORTED, translate } from './i18n';
import { welcomePrivacyKeys } from './welcome-privacy';

// The welcome's privacy lines (bug sweep 2026-11-01, #13). A replay from Settings while signed in read "keeps
// everything on this device" and "Sign in to sync", both false for someone whose tasks already sync.

describe('welcomePrivacyKeys: the signed-out lines only for someone known to be signed out', () => {
  it('signed out, the lines are what they always were', () => {
    expect(welcomePrivacyKeys(true, true)).toEqual({ capture: 'welcome.capturePrivacyAi', handoff: 'welcome.handoffFineAi' });
    expect(welcomePrivacyKeys(false, true)).toEqual({ capture: 'welcome.capturePrivacyNoAi', handoff: 'welcome.handoffFineNoAi' });
  });

  it('signed in, or not known yet, the lines make no device or account claim', () => {
    expect(welcomePrivacyKeys(true, false)).toEqual({ capture: 'welcome.capturePrivacyAiSignedIn', handoff: 'welcome.handoffFineAiSignedIn' });
    expect(welcomePrivacyKeys(false, false)).toEqual({ capture: 'welcome.capturePrivacyNoAiSignedIn', handoff: 'welcome.handoffFineNoAiSignedIn' });
  });

  it('every line it can show exists in all five languages, in that language', () => {
    for (const ai of [true, false]) {
      for (const signedOut of [true, false]) {
        for (const key of Object.values(welcomePrivacyKeys(ai, signedOut))) {
          const english = translate('en', key);
          expect(english, key).not.toBe(key);
          for (const loc of SUPPORTED) {
            if (loc === 'en') continue;
            expect(translate(loc, key), `${loc} ${key}`).not.toBe(key);
            expect(translate(loc, key), `${loc} ${key}`).not.toBe(english);
          }
        }
      }
    }
  });

  // What a signed-in reader must never be told, in each language's own words: that it all stays on this device, or
  // to sign in. "Sign in" and its four translations are exactly the welcome's own invite (welcome.handoffFineAi).
  const DEVICE: Record<string, RegExp> = {
    en: /this device/i,
    de: /diesem Gerät/i,
    fr: /cet appareil/i,
    es: /este dispositivo/i,
    it: /questo dispositivo/i,
  };
  const SIGN_IN: Record<string, RegExp> = {
    en: /sign in|sync/i,
    de: /meld dich an|synchronisier/i,
    fr: /connecte-toi|synchronis/i,
    es: /inicia sesión|sincroniz/i,
    it: /accedi|sincronizz/i,
  };

  for (const loc of SUPPORTED) {
    it(`${loc}: no line a signed-in reader can see claims this device, or invites a sign-in`, () => {
      for (const ai of [true, false]) {
        for (const key of Object.values(welcomePrivacyKeys(ai, false))) {
          const line = translate(loc, key);
          expect(DEVICE[loc].test(line), `${key}: ${line}`).toBe(false);
          expect(SIGN_IN[loc].test(line), `${key}: ${line}`).toBe(false);
        }
      }
    });

    it(`${loc}: the guards above can see the claims they guard against, in the signed-out lines`, () => {
      // If these stop matching, the test above proves nothing.
      expect(DEVICE[loc].test(translate(loc, 'welcome.capturePrivacyAi'))).toBe(true);
      expect(SIGN_IN[loc].test(translate(loc, 'welcome.handoffFineAi'))).toBe(true);
    });
  }

  it('the AI lines say text OR photo, since Scan sends a photo', () => {
    expect(translate('en', 'welcome.handoffFineAi')).toContain('text or photo');
    expect(translate('en', 'welcome.handoffFineAiSignedIn')).toContain('text or photo');
  });
});
