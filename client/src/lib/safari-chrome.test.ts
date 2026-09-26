import { describe, expect, it } from 'vitest';

import { hasSafariKeyboardAddressBar } from './safari-chrome';

const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1';
const IN_APP_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0';
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

describe('hasSafariKeyboardAddressBar', () => {
  it('keeps the room in every iPhone browser tab, whichever browser it is', () => {
    expect(hasSafariKeyboardAddressBar(SAFARI_IPHONE, false)).toBe(true);
    expect(hasSafariKeyboardAddressBar(CHROME_IPHONE, false)).toBe(true);
    expect(hasSafariKeyboardAddressBar(IN_APP_IPHONE, false)).toBe(true);
  });

  it('keeps none in the home-screen app, which has no browser chrome', () => {
    expect(hasSafariKeyboardAddressBar(SAFARI_IPHONE, true)).toBe(false);
  });

  it('keeps none off the iPhone (an iPad asks for the desktop site, Android resizes the page)', () => {
    expect(hasSafariKeyboardAddressBar(IPAD_DESKTOP_MODE, false)).toBe(false);
    expect(hasSafariKeyboardAddressBar(ANDROID_CHROME, false)).toBe(false);
  });
});
