import { describe, expect, it } from 'vitest';

import {
  countClose,
  FRESH_REVIEW_MEMORY,
  inReviewWindow,
  markAsked,
  parseReviewMemory,
  REVIEW_DELAY_MS,
  REVIEW_GAP_DAYS,
  REVIEW_MIN_CLOSED_DAYS,
  REVIEW_MIN_SPAN_DAYS,
  type ReviewMemory,
  type ReviewMoment,
  serializeReviewMemory,
  shouldAskForReview,
  stillTheNightToAsk,
} from './review';
import { restedOffer, SCRAPBOOK_OFFER_MIN } from './offers';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 20, 21, 30).getTime(); // 20 Nov 2026, 21:30 local

/** Five closes, the first one 16 days before tonight, never asked. */
const earned: ReviewMemory = {
  closedDays: 5,
  firstCloseISO: '2026-11-04',
  lastCountedISO: '2026-11-20',
  askedAt: null,
  askedVersion: null,
};

/** A good evening on which every gate holds. Each test breaks exactly one. */
const goodNight: ReviewMoment = {
  supported: true,
  memory: earned,
  todayISO: '2026-11-20',
  hour: 21,
  finishedTonight: 3,
  energy: 'normal',
  heavy: false,
  quietISO: null,
  otherOffer: null,
  givenMonth: false,
  version: '1.9.0',
  now: NOW,
};

describe('the constants Melroy decided (2026-10-19)', () => {
  it('five closes over a fortnight, 180 days apart, 1.2s after Goodnight', () => {
    expect(REVIEW_MIN_CLOSED_DAYS).toBe(5);
    expect(REVIEW_MIN_SPAN_DAYS).toBe(14);
    expect(REVIEW_GAP_DAYS).toBe(180);
    expect(REVIEW_DELAY_MS).toBe(1200);
  });
});

describe('countClose', () => {
  it('counts a first close and starts the fortnight on it', () => {
    const m = countClose(FRESH_REVIEW_MEMORY, '2026-11-04');
    expect(m).toEqual({ ...FRESH_REVIEW_MEMORY, closedDays: 1, firstCloseISO: '2026-11-04', lastCountedISO: '2026-11-04' });
  });

  it('counts each date once: a reopened and re-closed day is still one close', () => {
    const once = countClose(FRESH_REVIEW_MEMORY, '2026-11-04');
    expect(countClose(once, '2026-11-04')).toBe(once);
  });

  it('sets the first close once, and never moves it', () => {
    const m = countClose(countClose(countClose(FRESH_REVIEW_MEMORY, '2026-11-04'), '2026-11-09'), '2026-11-12');
    expect(m.closedDays).toBe(3);
    expect(m.firstCloseISO).toBe('2026-11-04');
    expect(m.lastCountedISO).toBe('2026-11-12');
  });

  it('never needs consecutive days (it is not a streak)', () => {
    const m = ['2026-11-01', '2026-11-08', '2026-11-09', '2026-11-15', '2026-11-30'].reduce(countClose, FRESH_REVIEW_MEMORY);
    expect(m.closedDays).toBe(5);
  });

  it('does not count a day earlier than the last one (a clock moved backwards)', () => {
    const m = countClose(FRESH_REVIEW_MEMORY, '2026-11-10');
    expect(countClose(m, '2026-11-09')).toBe(m);
  });

  it('ignores anything that is not a date', () => {
    expect(countClose(FRESH_REVIEW_MEMORY, 'tonight')).toBe(FRESH_REVIEW_MEMORY);
  });
});

describe('markAsked', () => {
  it('stamps the time and the version, keeping the count', () => {
    expect(markAsked(earned, NOW, '1.9.0')).toEqual({ ...earned, askedAt: NOW, askedVersion: '1.9.0' });
  });
});

describe('parseReviewMemory', () => {
  it('reads nothing stored as fresh defaults', () => {
    expect(parseReviewMemory(null)).toEqual(FRESH_REVIEW_MEMORY);
  });

  it('round-trips what it writes', () => {
    const m = markAsked(earned, NOW, '1.9.0');
    expect(parseReviewMemory(serializeReviewMemory(m))).toEqual(m);
    expect(parseReviewMemory(serializeReviewMemory(FRESH_REVIEW_MEMORY))).toEqual(FRESH_REVIEW_MEMORY);
  });

  it('reads corrupt data as fresh defaults, never a crash', () => {
    for (const raw of ['{', 'null', '[]', '"5"', '42', '{}']) expect(parseReviewMemory(raw)).toEqual(FRESH_REVIEW_MEMORY);
  });

  it('reads a wrongly shaped field as fresh defaults', () => {
    const bad: Record<string, unknown>[] = [
      { ...earned, closedDays: -1 },
      { ...earned, closedDays: 2.5 },
      { ...earned, closedDays: '5' },
      { ...earned, firstCloseISO: 'last week' },
      { ...earned, lastCountedISO: 20261120 },
      { ...earned, askedAt: 'yesterday' },
      { ...earned, askedAt: null, askedVersion: 190 },
    ];
    for (const b of bad) expect(parseReviewMemory(JSON.stringify(b))).toEqual(FRESH_REVIEW_MEMORY);
  });
});

describe('inReviewWindow (17:00 to 01:59)', () => {
  it('holds through the evening and past midnight to 01:59', () => {
    for (const h of [17, 18, 21, 23, 0, 1]) expect(inReviewWindow(h)).toBe(true);
  });

  it('keeps the small hours and the daytime out', () => {
    for (const h of [2, 3, 5, 9, 12, 16]) expect(inReviewWindow(h)).toBe(false);
  });
});

describe('shouldAskForReview: every gate, one test each', () => {
  it('asks on a good night when every gate holds', () => {
    expect(shouldAskForReview(goodNight)).toBe(true);
  });

  it('1. never where the build cannot ask (the web)', () => {
    expect(shouldAskForReview({ ...goodNight, supported: false })).toBe(false);
  });

  it('2. needs five closed days', () => {
    expect(shouldAskForReview({ ...goodNight, memory: { ...earned, closedDays: 4 } })).toBe(false);
  });

  it('2. needs the first counted close at least 14 days ago', () => {
    expect(shouldAskForReview({ ...goodNight, memory: { ...earned, firstCloseISO: '2026-11-07' } })).toBe(false);
    expect(shouldAskForReview({ ...goodNight, memory: { ...earned, firstCloseISO: '2026-11-06' } })).toBe(true);
    expect(shouldAskForReview({ ...goodNight, memory: { ...earned, firstCloseISO: null } })).toBe(false);
  });

  it('2. never on a fortnight that is really a clock moved backwards', () => {
    expect(shouldAskForReview({ ...goodNight, memory: { ...earned, firstCloseISO: '2026-12-25' } })).toBe(false);
  });

  it('3. needs something finished tonight (a Goodnight note counts as one)', () => {
    expect(shouldAskForReview({ ...goodNight, finishedTonight: 0 })).toBe(false);
    expect(shouldAskForReview({ ...goodNight, finishedTonight: 1 })).toBe(true);
  });

  it('4. never on a Low day', () => {
    expect(shouldAskForReview({ ...goodNight, energy: 'low' })).toBe(false);
    expect(shouldAskForReview({ ...goodNight, energy: 'high' })).toBe(true);
  });

  it('4. never on a day marked quiet (Settle, Lighten, Low, a return after time away)', () => {
    expect(shouldAskForReview({ ...goodNight, quietISO: '2026-11-20' })).toBe(false);
    // Yesterday's quiet day has expired by comparison, like the low-day flag.
    expect(shouldAskForReview({ ...goodNight, quietISO: '2026-11-19' })).toBe(true);
  });

  it('5. never stacks with a goodnight offer', () => {
    for (const offer of ['reminder', 'widget', 'scrapbook', 'update'] as const) {
      expect(shouldAskForReview({ ...goodNight, otherOffer: offer })).toBe(false);
    }
  });

  it('never while a month given for a note is running: a rating must never read as the price of a thank-you', () => {
    expect(shouldAskForReview({ ...goodNight, givenMonth: true })).toBe(false);
  });

  it('6. never twice on the same app version', () => {
    const asked = markAsked(earned, NOW - 200 * DAY, '1.9.0');
    expect(shouldAskForReview({ ...goodNight, memory: asked })).toBe(false);
  });

  it('6. a new version within 180 days still waits', () => {
    const asked = markAsked(earned, NOW - 179 * DAY, '1.9.0');
    expect(shouldAskForReview({ ...goodNight, memory: asked, version: '1.10.0' })).toBe(false);
  });

  it('6. a new version after 180 days may ask again', () => {
    const asked = markAsked(earned, NOW - 180 * DAY, '1.9.0');
    expect(shouldAskForReview({ ...goodNight, memory: asked, version: '1.10.0' })).toBe(true);
  });

  it('6. a last ask stamped in the future (the clock went backwards) means no', () => {
    const asked = markAsked(earned, NOW + DAY, '1.8.0');
    expect(shouldAskForReview({ ...goodNight, memory: asked })).toBe(false);
  });

  it('9. never on a heavy day', () => {
    expect(shouldAskForReview({ ...goodNight, heavy: true })).toBe(false);
  });

  it('10. only in the evening window', () => {
    expect(shouldAskForReview({ ...goodNight, hour: 16 })).toBe(false);
    expect(shouldAskForReview({ ...goodNight, hour: 3 })).toBe(false);
    expect(shouldAskForReview({ ...goodNight, hour: 0 })).toBe(true);
  });

  it('never on a malformed date for tonight', () => {
    expect(shouldAskForReview({ ...goodNight, todayISO: 'tonight' })).toBe(false);
  });
});

describe('the whole earn, as a person would live it', () => {
  it('the fifth close across 16 days is the first night that can ask', () => {
    const closes = ['2026-11-04', '2026-11-08', '2026-11-12', '2026-11-16', '2026-11-20'];
    let m = FRESH_REVIEW_MEMORY;
    const asks = closes.map((iso) => {
      m = countClose(m, iso);
      return shouldAskForReview({ ...goodNight, memory: m, todayISO: iso });
    });
    expect(asks).toEqual([false, false, false, false, true]);
  });

  it('five closes inside one fortnight are not yet enough', () => {
    const m = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-20'].reduce(countClose, FRESH_REVIEW_MEMORY);
    expect(shouldAskForReview({ ...goodNight, memory: m })).toBe(false);
  });
});

describe("stillTheNightToAsk: the timer's last word, on a fresh read", () => {
  const fresh = { offerShown: false, memory: earned, version: '1.9.0', now: NOW };

  it('asks when nothing changed in the 1.2s', () => {
    expect(stillTheNightToAsk(fresh)).toBe(true);
  });

  it('never once an offer has reached the rested screen since Goodnight', () => {
    expect(stillTheNightToAsk({ ...fresh, offerShown: true })).toBe(false);
  });

  it("a Goodnight note that is the week's third finish opens the scrapbook rung the gates never saw", () => {
    // The 2026-10-19 review's case: AI on, the reminder answered, no scrapbook yet, two finishes this week.
    const evening = {
      reminderOn: true,
      reminderOfferMade: true,
      widgetSupported: false,
      widgetPlaced: false,
      widgetOfferMade: true,
      aiEnabled: true,
      scrapbookMade: false,
      scrapbookOfferMade: false,
      updateWorthMentioning: false,
      hasSharedList: false,
    };
    const beforeThePress = restedOffer({ ...evening, weekFinishes: SCRAPBOOK_OFFER_MIN - 1 });
    const withTheNote = restedOffer({ ...evening, weekFinishes: SCRAPBOOK_OFFER_MIN });
    expect(beforeThePress).toBeNull();
    expect(shouldAskForReview({ ...goodNight, otherOffer: beforeThePress })).toBe(true); // the gates pass
    expect(withTheNote).toBe('scrapbook'); // and the rested screen shows the offer
    expect(stillTheNightToAsk({ ...fresh, offerShown: withTheNote !== null })).toBe(false); // so the timer stops
  });

  it('never when another Goodnight tap already asked on this version', () => {
    expect(stillTheNightToAsk({ ...fresh, memory: markAsked(earned, NOW - 1000, '1.9.0') })).toBe(false);
  });

  it('keeps the caps: 180 days apart, and a future stamp means no', () => {
    expect(stillTheNightToAsk({ ...fresh, memory: markAsked(earned, NOW - 179 * DAY, '1.8.0') })).toBe(false);
    expect(stillTheNightToAsk({ ...fresh, memory: markAsked(earned, NOW + DAY, '1.8.0') })).toBe(false);
    expect(stillTheNightToAsk({ ...fresh, memory: markAsked(earned, NOW - 180 * DAY, '1.8.0') })).toBe(true);
  });
});
