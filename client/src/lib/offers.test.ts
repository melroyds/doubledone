import { describe, expect, it } from 'vitest';

import { type OfferState, restedOffer, SCRAPBOOK_OFFER_MIN } from './offers';

// The default state: everything already handled, so a clean goodnight screen.
const quiet: OfferState = {
  reminderOn: true,
  reminderOfferMade: true,
  widgetSupported: true,
  widgetPlaced: true,
  widgetOfferMade: true,
  aiEnabled: true,
  weekFinishes: 0,
  scrapbookMade: true,
  scrapbookOfferMade: true,
};

// A week with enough finishes that the scrapbook mention would be plainly true.
const earned = { ...quiet, weekFinishes: SCRAPBOOK_OFFER_MIN, scrapbookMade: false, scrapbookOfferMade: false };

describe('restedOffer', () => {
  it('offers nothing when every lifeline is already in place', () => {
    expect(restedOffer(quiet)).toBeNull();
  });

  it('offers the reminder when it is off and has never been offered (the existing behaviour)', () => {
    expect(restedOffer({ ...quiet, reminderOn: false, reminderOfferMade: false })).toBe('reminder');
  });

  it('offers the widget when there is no widget and no reminder ask pending', () => {
    expect(restedOffer({ ...quiet, widgetPlaced: false, widgetOfferMade: false })).toBe('widget');
  });

  // The never-nag rules. Each of these is a way the screen could turn into a sales pitch.
  it('never stacks two asks: the reminder takes the evening, the widget waits for another', () => {
    const both = { ...quiet, reminderOn: false, reminderOfferMade: false, widgetPlaced: false, widgetOfferMade: false };
    expect(restedOffer(both)).toBe('reminder');
  });

  it('never offers a widget to someone who already put one on their home screen', () => {
    expect(restedOffer({ ...quiet, widgetPlaced: true, widgetOfferMade: false })).toBeNull();
  });

  it('never offers a widget where widgets do not exist (web, iOS)', () => {
    expect(restedOffer({ ...quiet, widgetSupported: false, widgetPlaced: false, widgetOfferMade: false })).toBeNull();
  });

  it('never repeats an offer once it has been made, whatever the answer was', () => {
    expect(restedOffer({ ...quiet, reminderOn: false, reminderOfferMade: true })).toBeNull();
    expect(restedOffer({ ...quiet, widgetPlaced: false, widgetOfferMade: true })).toBeNull();
  });

  it('drops the reminder ask the moment the reminder is on, even if never formally offered', () => {
    expect(restedOffer({ ...quiet, reminderOn: true, reminderOfferMade: false })).toBeNull();
  });

  it('moves on to the widget once the reminder ask is spent', () => {
    const after = { ...quiet, reminderOn: false, reminderOfferMade: true, widgetPlaced: false, widgetOfferMade: false };
    expect(restedOffer(after)).toBe('widget');
  });

  // The third and last rung: the earned-moment scrapbook mention.
  it('mentions the scrapbook once the week has enough finishes and the earlier rungs are spent', () => {
    expect(restedOffer(earned)).toBe('scrapbook');
  });

  it('waits until the week has real substance, not the first tick', () => {
    expect(restedOffer({ ...earned, weekFinishes: SCRAPBOOK_OFFER_MIN - 1 })).toBeNull();
  });

  it('never pitches an AI feature to someone with AI off', () => {
    expect(restedOffer({ ...earned, aiEnabled: false })).toBeNull();
  });

  it('never introduces the scrapbook to someone who already made one', () => {
    expect(restedOffer({ ...earned, scrapbookMade: true })).toBeNull();
  });

  it('mentions the scrapbook once ever, whatever the answer was', () => {
    expect(restedOffer({ ...earned, scrapbookOfferMade: true })).toBeNull();
  });

  it('yields the evening to an earlier rung: one ask at a time, always', () => {
    expect(restedOffer({ ...earned, reminderOn: false, reminderOfferMade: false })).toBe('reminder');
    expect(restedOffer({ ...earned, widgetPlaced: false, widgetOfferMade: false })).toBe('widget');
  });
});
