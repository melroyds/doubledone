// Which lifeline, if any, to offer on the rested (closed-day) screen.
//
// The problem this exists for (post-launch feedback, 2026-07): a churned-and-returned user asked
// for four things the app ALREADY had, because every one of them is opt-in and none of them is ever
// surfaced. The app is so calm that its own lifelines are invisible. The daily reminder was already
// offered once here; the home-screen widget was offered nowhere at all, and it is now a working
// feature rather than a broken one, so it earns the same treatment.
//
// The rule that makes this calm rather than nagging: ONE ask at a time, ever, each shown once and
// then never again whatever the answer. Two asks stacked on the goodnight screen would be exactly
// the overwhelm the app exists to remove, and the close-the-day moment is for setting the day down,
// not for being sold to. The reminder keeps precedence because it is the more useful of the two and
// was already the established offer; the widget waits for a later evening.

export type RestedOffer = 'reminder' | 'widget' | 'scrapbook' | 'update' | null;

export type OfferState = {
  /** The daily reminder is already on: nothing to offer. */
  reminderOn: boolean;
  /** The one-time reminder offer has already been shown (accepted or dismissed). */
  reminderOfferMade: boolean;
  /** This build can even have a home-screen widget (Android native; false on web and iOS). */
  widgetSupported: boolean;
  /** The user already has a DoubleDone widget on their home screen: never nag someone who did it. */
  widgetPlaced: boolean;
  /** The one-time widget offer has already been shown. */
  widgetOfferMade: boolean;
  /** AI is on. The scrapbook is an AI feature; with AI off it must never even be mentioned. */
  aiEnabled: boolean;
  /** Deduped completions in the CURRENT week (the scrapbook's raw material). */
  weekFinishes: number;
  /** A scrapbook has been made before, ever: they know the feature, there is nothing to teach. */
  scrapbookMade: boolean;
  /** The one-time scrapbook mention has already been shown. */
  scrapbookOfferMade: boolean;
  /**
   * This build is far enough behind to be worth mentioning, AND it has not been mentioned in a
   * fortnight. The whole rarity test lives in updates.ts `shouldMention`, which requires BOTH a
   * major-or-two-minor gap and the fortnight brake; by the time it is true here, it is true rarely.
   */
  updateWorthMentioning: boolean;
};

/**
 * The scrapbook mention waits for the week to have real substance, not the first tick. One or two
 * finishes make a thin keepsake and an early pitch; "a few" is when the offer's own sentence
 * ("you've finished enough this week") becomes plainly true.
 */
export const SCRAPBOOK_OFFER_MIN = 3;

/**
 * The single offer to render on the rested screen, or null for a clean goodnight. Pure, so the
 * never-nag rules are testable without a device: the screen just renders whatever this returns.
 *
 * The scrapbook was the THIRD and LAST rung of this ladder (decided with Melroy, 2026-07-26):
 * the goodnight screen carries at most one ask, each ask happens once ever, and a ladder that
 * keeps growing becomes the sales pitch this screen exists to never be.
 *
 * A FOURTH rung was added 2026-08-09 for the shared-list round-two design, and it deliberately
 * reopens that decision, so the reasoning is here to be argued with rather than buried. It is not
 * an ask and it sells nothing: it is the one rung about the OTHER person, because a version gap is
 * what stops one half of a shared list reading a rhythm the other half set. It is also far rarer
 * than the three above it, which fire at the first opportunity: this one needs a major-or-two-minor
 * gap AND a fortnight since it was last said. If Melroy would rather the goodnight screen stayed
 * closed at three, deleting this branch costs nothing: Settings states the same fact plainly, and
 * the show-never-hide handling of an unreadable cadence is the real safety net either way.
 */
export function restedOffer(s: OfferState): RestedOffer {
  if (!s.reminderOn && !s.reminderOfferMade) return 'reminder';
  if (s.widgetSupported && !s.widgetPlaced && !s.widgetOfferMade) return 'widget';
  // The earned moment: the free monthly scrapbook exists and this week could already be one.
  // Someone who has made a scrapbook needs no introduction; someone with AI off must never
  // be pitched an AI feature.
  if (s.aiEnabled && !s.scrapbookMade && !s.scrapbookOfferMade && s.weekFinishes >= SCRAPBOOK_OFFER_MIN) {
    return 'scrapbook';
  }
  // LAST, and the only rung that is not about a feature of ours. See the note above the type: this
  // one reopens a closed decision on purpose, and it is framed as what the newer build can do FOR
  // the person's person, never as this one being out of date.
  if (s.updateWorthMentioning) return 'update';
  return null;
}
