import { describe, expect, it } from 'vitest';

import { compareVersions, MENTION_GAP_MS, shouldMention, STORE_URLS, updateStatus, updateUrl } from './updates';

describe('compareVersions', () => {
  it('orders ordinary versions', () => {
    expect(compareVersions('1.2.0', '1.3.0')).toBeLessThan(0);
    expect(compareVersions('1.3.0', '1.2.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
  });

  it('compares numerically, not as text', () => {
    // The bug every hand-rolled version compare has: '1.10.0' sorts before '1.9.0' as a string.
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('treats a missing part as zero, so 1.2 and 1.2.0 are the same build', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBeLessThan(0);
  });

  // This runs on a reply from the network. The worst acceptable outcome is "we could not tell",
  // never a crash on a screen someone opened to write down one thing.
  it('never throws on junk', () => {
    for (const junk of ['', 'x.y.z', '..', 'v1.2.0', null, undefined]) {
      expect(() => compareVersions(junk as never, '1.2.0')).not.toThrow();
    }
  });
});

describe('updateStatus', () => {
  it('says nothing when the build is current or ahead', () => {
    expect(updateStatus('1.2.0', '1.2.0', 'web').behind).toBe(false);
    expect(updateStatus('1.3.0', '1.2.0', 'web').behind).toBe(false); // a dev build, not a problem
  });

  // Failing quiet is the whole posture: a build that cannot reach the server is not a build that
  // should start telling its user things.
  it('says nothing when the server cannot be believed', () => {
    for (const bad of [null, undefined, '', 42, {}]) {
      const s = updateStatus('1.2.0', bad as never, 'web');
      expect(s.behind).toBe(false);
      expect(s.route).toBe('none');
    }
  });

  // Web can genuinely update itself. The stores are the only path on iOS and Android: there is no
  // in-app update API on iOS at all. So the honest offer differs, and so must the copy.
  it('routes web to a reload and the phones to their store', () => {
    expect(updateStatus('1.2.0', '1.3.0', 'web').route).toBe('reload');
    expect(updateStatus('1.2.0', '1.3.0', 'ios').route).toBe('store');
    expect(updateStatus('1.2.0', '1.3.0', 'android').route).toBe('store');
  });

  it('separates a patch behind from properly behind', () => {
    expect(updateStatus('1.2.0', '1.2.1', 'web')).toMatchObject({ behind: true, majorBehind: false });
    expect(updateStatus('1.2.0', '1.4.0', 'web')).toMatchObject({ behind: true, majorBehind: true });
    expect(updateStatus('1.2.0', '2.0.0', 'web')).toMatchObject({ behind: true, majorBehind: true });
  });
});

// The rule that keeps this from becoming a nag. This is a to-do app for people already carrying
// more demands than they can hold, and the standing rule is remove friction, never add a setting.
describe('shouldMention, outside Settings', () => {
  const NOW = Date.UTC(2026, 7, 9);

  it('never mentions a build that is merely one patch behind', () => {
    expect(shouldMention(updateStatus('1.2.0', '1.2.1', 'web'), null, NOW)).toBe(false);
  });

  it('never mentions a current build', () => {
    expect(shouldMention(updateStatus('1.2.0', '1.2.0', 'web'), null, NOW)).toBe(false);
  });

  it('mentions a properly old build once', () => {
    expect(shouldMention(updateStatus('1.2.0', '1.5.0', 'web'), null, NOW)).toBe(true);
  });

  // A message that repeats is a nag no matter how gently it is worded.
  it('will not say it again for a fortnight, however far behind', () => {
    const old = updateStatus('1.0.0', '3.0.0', 'web');
    expect(shouldMention(old, NOW - 1000, NOW)).toBe(false);
    expect(shouldMention(old, NOW - MENTION_GAP_MS + 1, NOW)).toBe(false);
    expect(shouldMention(old, NOW - MENTION_GAP_MS, NOW)).toBe(true);
  });

  it('treats a corrupt or absent last-mention as never mentioned', () => {
    const old = updateStatus('1.0.0', '3.0.0', 'web');
    expect(shouldMention(old, null, NOW)).toBe(true);
    expect(shouldMention(old, Number.NaN, NOW)).toBe(true);
  });

  it('says nothing rather than something when the clock is unreadable', () => {
    expect(shouldMention(updateStatus('1.0.0', '3.0.0', 'web'), null, Number.NaN)).toBe(false);
  });
});

describe('updateUrl', () => {
  it('points each phone at its own store', () => {
    expect(updateUrl('ios')).toBe(STORE_URLS.ios);
    expect(updateUrl('android')).toBe(STORE_URLS.android);
  });

  it('has nowhere to send a web user, because the web updates itself', () => {
    expect(updateUrl('web')).toBeNull();
  });

  it('uses the real store identifiers, not placeholders', () => {
    expect(STORE_URLS.ios).toContain('6790136615');
    expect(STORE_URLS.android).toContain('app.doubledone');
  });
});
