import { describe, expect, it } from 'vitest';

import { APP_STORE_URL, APPLE_PROVIDER_TOKEN, PLAY_URL, WEB_CAMPAIGN } from './store-links';
import { STORE_URLS } from './updates';

describe('store links', () => {
  it('the App Store link is a campaign link Apple can count: a numeric provider token, the campaign, mt=8', () => {
    expect(APPLE_PROVIDER_TOKEN).toMatch(/^\d+$/);
    const url = new URL(APP_STORE_URL);
    expect(url.host).toBe('apps.apple.com');
    expect(url.pathname).toBe('/app/doubledone/id6790136615');
    expect(url.searchParams.get('pt')).toBe(APPLE_PROVIDER_TOKEN);
    expect(url.searchParams.get('ct')).toBe(WEB_CAMPAIGN);
    expect(url.searchParams.get('mt')).toBe('8');
  });

  it("Apple's campaign token rule: at most 30 characters, no space at either end", () => {
    expect(WEB_CAMPAIGN.length).toBeLessThanOrEqual(30);
    expect(WEB_CAMPAIGN).toBe(WEB_CAMPAIGN.trim());
  });

  it('the Play link carries its utm tags inside one encoded referrer, so Play keeps them together', () => {
    const url = new URL(PLAY_URL);
    expect(url.host).toBe('play.google.com');
    expect(url.searchParams.get('id')).toBe('app.doubledone');
    expect([...url.searchParams.keys()]).toEqual(['id', 'referrer']);
    const tags = new URLSearchParams(url.searchParams.get('referrer') ?? '');
    expect(Object.fromEntries(tags)).toEqual({
      utm_source: 'doubledone.app',
      utm_medium: 'website',
      utm_campaign: WEB_CAMPAIGN,
    });
  });

  it('names a channel, never a person: nothing but the fixed labels rides either link', () => {
    for (const link of [APP_STORE_URL, PLAY_URL]) expect(decodeURIComponent(link)).not.toMatch(/uid|user|email|session|token=/i);
  });

  it('the update nudge stays untagged, so someone updating is never counted as a new install', () => {
    for (const link of Object.values(STORE_URLS)) {
      expect(link).not.toMatch(/[?&](pt|ct|referrer)=/);
      expect(link).not.toContain('utm_');
    }
  });
});
