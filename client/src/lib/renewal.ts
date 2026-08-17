// The annual renewal notice: one task, once, a fortnight before a yearly subscription renews.
//
// WHY IT EXISTS. A$50 arriving once a year is the kind of charge people forget they agreed to, and
// the emails Stripe and Apple send about it go unread. Telling someone in the one place they
// actually look, their own list, is the honest thing. It is also the ONLY thing in this app that
// writes a task nobody typed, so the rules below are deliberately narrow.
//
// WHY IT IS ONLY ANNUAL. A monthly renewal needs no warning: it is A$5 and it happens twelve times a
// year, so a task every month would be nagging, which this app does not do.
//
// HOW "ANNUAL" IS KNOWN, given the entitlement does not say. The server sends `currentPeriodEnd` but
// no interval, and adding one is a Worker change. It is not needed: a MONTHLY period end is never
// more than ~31 days away, so the first time a period is seen ending 40+ days out, it is annual.
// That judgement is remembered against the specific period end, so a later look at the same period
// (by which time it is close) still knows what it is.
//
// The one gap that leaves, stated plainly: someone installing fresh inside the last 40 days of their
// year never sees the long period, so gets no notice that year. It self-corrects the year after,
// and the alternative is a server change for a case that resolves itself.

import type { Entitlement } from './entitlement';

/** Longer than any monthly period, comfortably shorter than a yearly one. */
const ANNUAL_DAYS = 40;
/** How far out the notice is WRITTEN. It then waits in the Calendar until NOTICE_DAYS. */
export const LEAD_DAYS = 14;
/**
 * How many days before the charge the task actually LANDS ON TODAY.
 *
 * Not zero, which was the first attempt and was wrong: a task dated the renewal day arrives on the
 * morning the money leaves, which is a receipt, not a warning. A week is enough to cancel without
 * hurrying, and short enough that it still feels connected to the thing it is about.
 */
export const NOTICE_DAYS = 7;
const DAY_MS = 86_400_000;

/** What this device remembers about the subscription's shape. Both are epoch SECONDS, matching
 *  `Entitlement.currentPeriodEnd`, so they compare without conversion. */
export type RenewalMemory = {
  /** A period end already judged to be a year long. null = no annual period has been seen. */
  annualPeriodEnd: number | null;
  /** A period end already told about, so the notice happens once and not once per app open. */
  noticedPeriodEnd: number | null;
};

export const NO_RENEWAL_MEMORY: RenewalMemory = { annualPeriodEnd: null, noticedPeriodEnd: null };

export type RenewalDecision = {
  /** The memory to persist. Always returned, so the caller writes it unconditionally. */
  memory: RenewalMemory;
  /** The ISO day to DATE the task, so it reaches Today a week before the charge. Null = say nothing. */
  noticeOn: string | null;
  /** The ISO day the money actually moves, for the wording. Null whenever `noticeOn` is. */
  renewsOn: string | null;
};

const isoDay = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Decide whether to write the renewal notice, and remember what was learned.
 *
 * Pure, so the whole decision is testable without a clock, a store or a device. The caller persists
 * `memory` every time and creates a task only when `noticeOn` is non-null.
 *
 * It stays quiet when:
 *  - there is no premium, or no period end to talk about
 *  - the subscription is set to CANCEL at the period end. Nothing is renewing, so a notice saying it
 *    is would be a lie, and a distressing one to somebody who has already decided to leave.
 *  - this period has never been seen as long, so it is monthly (or was joined too late to tell)
 *  - this period has already been noticed
 */
export function decideRenewalNotice(prev: RenewalMemory, ent: Entitlement, now: number): RenewalDecision {
  const quiet = (memory: RenewalMemory): RenewalDecision => ({ memory, noticeOn: null, renewsOn: null });

  const end = ent.currentPeriodEnd;
  if (!ent.premium || typeof end !== 'number' || !Number.isFinite(end)) return quiet(prev);

  const endMs = end * 1000;
  const daysOut = (endMs - now) / DAY_MS;

  // Learn first, and learn even when cancelling: if they resubscribe, the shape is already known.
  const memory: RenewalMemory = daysOut > ANNUAL_DAYS ? { ...prev, annualPeriodEnd: end } : prev;

  if (ent.cancelAtPeriodEnd) return quiet(memory);
  if (memory.annualPeriodEnd !== end) return quiet(memory); // not a period we judged annual
  if (memory.noticedPeriodEnd === end) return quiet(memory); // said once already
  if (daysOut > LEAD_DAYS) return quiet(memory); // too early to be useful
  if (daysOut < 0) return quiet(memory); // already past; the charge has happened

  // Land it NOTICE_DAYS before the charge, but never in the past: a device that first looks with
  // five days left gets it today rather than a task dated backwards, which would arrive already
  // overdue on the one screen whose promise is that nothing ever is.
  const landOn = Math.max(endMs - NOTICE_DAYS * DAY_MS, now);
  return { memory: { ...memory, noticedPeriodEnd: end }, noticeOn: isoDay(landOn), renewsOn: isoDay(endMs) };
}
