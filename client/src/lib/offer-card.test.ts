import { describe, expect, it } from 'vitest';

import { OFFER_AFTER_MS, OFFER_ANSWER_TTL_MS, type OfferCardInput, shouldShowOfferCard } from './offer-card';

const NOW = 1_800_000_000_000;
const base: OfferCardInput = {
  now: NOW,
  isClosed: false,
  premium: false,
  retired: false,
  firstSeenAt: NOW - OFFER_AFTER_MS - 1,
  cachedAnswer: { canGet: true, at: NOW - 60_000 },
  otherCardThisVisit: false,
};

describe('when the offer card may sit on Today', () => {
  it('shows when every rule holds', () => {
    expect(shouldShowOfferCard(base)).toBe(true);
  });
  it.each<[string, Partial<OfferCardInput>]>([
    ['the day is closed', { isClosed: true }],
    ['the person is Premium', { premium: true }],
    ['it was retired', { retired: true }],
    ['another one-time card is up or was dismissed this visit', { otherCardThisVisit: true }],
    ['less than a week since first open', { firstSeenAt: NOW - OFFER_AFTER_MS + 1000 }],
    ['no first-open stamp', { firstSeenAt: null }],
    ['no stored answer yet (first-paint rule)', { cachedAnswer: null }],
    ['the stored answer was no', { cachedAnswer: { canGet: false, at: NOW } }],
    ['the stored answer is stale', { cachedAnswer: { canGet: true, at: NOW - OFFER_ANSWER_TTL_MS - 1 } }],
    ['the stored answer is from the future (a moved clock)', { cachedAnswer: { canGet: true, at: NOW + 60_000 } }],
  ])('stays away when %s', (_label, patch) => {
    expect(shouldShowOfferCard({ ...base, ...patch })).toBe(false);
  });
});
