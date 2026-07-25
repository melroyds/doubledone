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

export type RestedOffer = 'reminder' | 'widget' | null;

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
};

/**
 * The single offer to render on the rested screen, or null for a clean goodnight. Pure, so the
 * never-nag rules are testable without a device: the screen just renders whatever this returns.
 */
export function restedOffer(s: OfferState): RestedOffer {
  if (!s.reminderOn && !s.reminderOfferMade) return 'reminder';
  if (s.widgetSupported && !s.widgetPlaced && !s.widgetOfferMade) return 'widget';
  return null;
}
