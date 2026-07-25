import { describe, expect, it } from 'vitest';

import { type OfferState, restedOffer } from './offers';

// The default state: everything already handled, so a clean goodnight screen.
const quiet: OfferState = {
  reminderOn: true,
  reminderOfferMade: true,
  widgetSupported: true,
  widgetPlaced: true,
  widgetOfferMade: true,
};

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
});
