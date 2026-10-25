// "A month on us": when the one-time offer card may sit on Today (design_handoff_month_on_us, the card-life table).
// Pure, so every rule is a test. The card shows only when all of these hold:
//   - the day is open, and the person is not Premium;
//   - a week has passed since this device first opened Today on a build with the card;
//   - it has not been retired (Not now, or any send from it);
//   - the last SUCCESSFUL "can get a month" answer, stored before this paint, said yes (first-paint rule: a fresh
//     answer arriving after the day is on screen is saved for the next open and never inserts the card late);
//   - no other one-time card (re-entry, What's New, the hold hint) is on screen or was dismissed this visit.

export const OFFER_AFTER_MS = 7 * 86_400_000;
/** A stored answer older than this is too stale to promise a month on. */
export const OFFER_ANSWER_TTL_MS = 3 * 86_400_000;

export type OfferCardInput = {
  now: number;
  isClosed: boolean;
  premium: boolean;
  retired: boolean;
  firstSeenAt: number | null;
  cachedAnswer: { canGet: boolean; at: number } | null;
  otherCardThisVisit: boolean;
};

/** Whether a stored answer is a fresh yes: not stale, and not from the future (a clock moved backwards). */
export function answerSaysYes(cached: { canGet: boolean; at: number } | null, now: number): boolean {
  if (!cached || !cached.canGet) return false;
  return now - cached.at <= OFFER_ANSWER_TTL_MS && cached.at <= now;
}

export function shouldShowOfferCard(s: OfferCardInput): boolean {
  if (s.isClosed || s.premium || s.retired || s.otherCardThisVisit) return false;
  if (s.firstSeenAt == null || s.now - s.firstSeenAt < OFFER_AFTER_MS) return false;
  return answerSaysYes(s.cachedAnswer, s.now);
}
