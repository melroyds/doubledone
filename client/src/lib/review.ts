// The calm review ask (store 1.9, item #5; Melroy's call 2026-10-19, decision log the same day).
//
// One request, made to the STORE, at the end of a good day: the system rating card, about 1.2s after
// Goodnight lands the rested screen. Zero words of ours, before the card or after it. Apple 5.6.1
// disallows a custom pre-prompt, Google bans anything said before or during its card, and "if it is
// helping" would be sentiment filtering. Neither store says whether the card appeared, or what anybody
// did with it, so nothing here reacts to an answer, and nothing pretends to.
//
// The gates time the ask by BEHAVIOUR, never by opinion. Every one has to hold:
//   - earned: five closed days, the first of them a fortnight or more ago. Never consecutive, never
//     shown, never reset, so it is not a streak. It starts at zero on this build for everyone, which
//     makes a loyal user wait two weeks after updating, on purpose;
//   - something was finished tonight;
//   - not a tender day: not Low, and not a day Settle, Lighten or a return after time away marked quiet;
//   - nothing else is asked tonight (the rested screen's one-offer rule, lib/offers.ts);
//   - not a heavy day, and the evening (17:00 to 01:59, so a night owl's 00:30 close still counts);
//   - the caps: never twice on one app version, and 180 days apart, so at most two a year, under
//     Apple's three. A last ask stamped in the future (the clock went backwards) means no.
// Pure, so every gate is a test (review.test.ts). The screen supplies the facts and the timer.

import { daysBetween, fromISODate } from './day';
import { type DayEnergy } from './day-tools';
import { type RestedOffer } from './offers';

export const REVIEW_MIN_CLOSED_DAYS = 5;
export const REVIEW_MIN_SPAN_DAYS = 14;
export const REVIEW_GAP_DAYS = 180;
/** How long after Goodnight the store is asked: the rested screen settles first, then the card. */
export const REVIEW_DELAY_MS = 1200;
/** The evening window, by the hour Goodnight was pressed: 17:00 up to and including 01:59. */
export const REVIEW_WINDOW_FROM_HOUR = 17;
export const REVIEW_WINDOW_TO_HOUR = 1;

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What this device remembers about asking. Device state, not personal data (see storage.ts). */
export type ReviewMemory = {
  /** Distinct closed days counted since this build. Never shown to anybody. */
  closedDays: number;
  /** The first counted close, which starts the fortnight. Set once. */
  firstCloseISO: string | null;
  /** The last counted close, so a reopened and re-closed day counts once. */
  lastCountedISO: string | null;
  /** When the store was last asked (ms), stamped BEFORE the call so a throw can never retry. */
  askedAt: number | null;
  /** The app version that last asked: never twice on one version. */
  askedVersion: string | null;
};

export const FRESH_REVIEW_MEMORY: ReviewMemory = {
  closedDays: 0,
  firstCloseISO: null,
  lastCountedISO: null,
  askedAt: null,
  askedVersion: null,
};

/**
 * Count tonight's close. Only a day LATER than the last counted one counts, so a reopened and
 * re-closed day counts once, and a clock moved backwards cannot count the same days twice.
 */
export function countClose(memory: ReviewMemory, iso: string): ReviewMemory {
  if (!ISO_DATE.test(iso)) return memory;
  if (memory.lastCountedISO != null && iso <= memory.lastCountedISO) return memory;
  return {
    ...memory,
    closedDays: memory.closedDays + 1,
    firstCloseISO: memory.firstCloseISO ?? iso,
    lastCountedISO: iso,
  };
}

/** Stamp an ask. Called before the store is asked, never after. */
export function markAsked(memory: ReviewMemory, now: number, version: string): ReviewMemory {
  return { ...memory, askedAt: now, askedVersion: version };
}

const isoOrNull = (v: unknown): v is string | null => v === null || (typeof v === 'string' && ISO_DATE.test(v));

/** Read the stored memory. Missing, corrupt or wrongly shaped data reads as fresh defaults. */
export function parseReviewMemory(raw: string | null): ReviewMemory {
  if (raw == null) return FRESH_REVIEW_MEMORY;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return FRESH_REVIEW_MEMORY;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return FRESH_REVIEW_MEMORY;
  const { closedDays, firstCloseISO, lastCountedISO, askedAt, askedVersion } = v as Record<string, unknown>;
  if (typeof closedDays !== 'number' || !Number.isInteger(closedDays) || closedDays < 0) return FRESH_REVIEW_MEMORY;
  if (!isoOrNull(firstCloseISO) || !isoOrNull(lastCountedISO)) return FRESH_REVIEW_MEMORY;
  if (askedAt !== null && (typeof askedAt !== 'number' || !Number.isFinite(askedAt))) return FRESH_REVIEW_MEMORY;
  if (askedVersion !== null && typeof askedVersion !== 'string') return FRESH_REVIEW_MEMORY;
  return { closedDays, firstCloseISO, lastCountedISO, askedAt, askedVersion };
}

export function serializeReviewMemory(memory: ReviewMemory): string {
  return JSON.stringify(memory);
}

/** Goodnight pressed between 17:00 and 01:59. */
export function inReviewWindow(hour: number): boolean {
  return hour >= REVIEW_WINDOW_FROM_HOUR || hour <= REVIEW_WINDOW_TO_HOUR;
}

export type ReviewMoment = {
  /** This build can ask at all (false on the web, by the platform split). */
  supported: boolean;
  /** The memory AFTER tonight's close was counted. */
  memory: ReviewMemory;
  /** The day that was just closed. */
  todayISO: string;
  /** The local hour Goodnight was pressed. */
  hour: number;
  /** Today's finished tasks plus the Goodnight note, if one was written. */
  finishedTonight: number;
  energy: DayEnergy;
  /** The day's weight at close (today.tsx `dayIsHeavy`). */
  heavy: boolean;
  /** The "keep quiet today" date, written by Settle, Lighten, Low and a return after time away. */
  quietISO: string | null;
  /** What the rested screen offers tonight. Anything but null means the evening is already taken. */
  otherOffer: RestedOffer;
  /** The running app version. */
  version: string;
  now: number;
};

/** Whether tonight is the night to hand the store its one request. Every gate must hold. */
export function shouldAskForReview(x: ReviewMoment): boolean {
  if (!x.supported) return false;
  const m = x.memory;
  if (m.closedDays < REVIEW_MIN_CLOSED_DAYS) return false;
  if (m.firstCloseISO == null || !ISO_DATE.test(x.todayISO)) return false;
  if (daysBetween(fromISODate(m.firstCloseISO), fromISODate(x.todayISO)) < REVIEW_MIN_SPAN_DAYS) return false;
  if (x.finishedTonight < 1) return false;
  if (x.energy === 'low') return false;
  if (x.quietISO === x.todayISO) return false;
  if (x.otherOffer !== null) return false;
  if (x.heavy) return false;
  if (!inReviewWindow(x.hour)) return false;
  if (m.askedVersion === x.version) return false;
  if (m.askedAt != null && (m.askedAt > x.now || x.now - m.askedAt < REVIEW_GAP_DAYS * DAY_MS)) return false;
  return true;
}
