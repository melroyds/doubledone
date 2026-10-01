// Premium entitlement + the scrapbook cadence, kept pure so the gating is
// unit-tested (storage / network live in lib/stripe.ts, a thin seam).
//
// The model (decision-log 2026-06-20): the scrapbook is the premium delight.
//  - Free: one scrapbook per calendar month (the taste).
//  - Premium (A$5/mo): one a week, scaling with TENURE, never a streak, so it
//    only ever grows: 1/week, then 2/week after two months, 4/week after six.
// The server is the source of truth for `premium`; this module only decides, from
// that plus the user's own scrapbook history, whether another one can be made now.

export type Entitlement = {
  premium: boolean;
  status: string | null;
  since: string | null; // ISO of the first premium grant (the tenure clock)
  currentPeriodEnd: number | null; // epoch seconds
  cancelAtPeriodEnd: boolean; // scheduled to cancel at the period end
  // Which store sold it: 'apple' subscriptions are managed in Apple's settings and 'google' ones in
  // the Play Store, never Stripe's portal, so the "Manage subscription" control must route by this.
  // null = a pre-2026-07 row (always Stripe).
  source: 'stripe' | 'apple' | 'google' | null;
};

export const FREE_ENTITLEMENT: Entitlement = { premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, source: null };

/**
 * An entitlement read that says whether it WORKED. A failed read is not "free": reading it as free is
 * calm for a screen and wrong for a charge (lib/iap buyCheck). `signedIn` is false when there was no
 * session to send, so there is nothing on the server to read and FREE is the true answer.
 */
export type EntitlementRead = { ok: true; entitlement: Entitlement; signedIn: boolean } | { ok: false };

/**
 * The Worker's /entitlement reply, parsed. Only a 200 with a JSON object is an answer. Everything else,
 * a 401, a 503 (the Worker could not read D1), a 5xx, a body that is not an object, reads as FAILED, so
 * the caller can tell "you are free" from "we could not tell".
 */
export function readEntitlementReply(status: number, body: unknown): EntitlementRead {
  if (status !== 200 || typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false };
  const v = body as Partial<Record<keyof Entitlement, unknown>>;
  return {
    ok: true,
    signedIn: true,
    entitlement: {
      premium: v.premium === true,
      status: typeof v.status === 'string' ? v.status : null,
      since: typeof v.since === 'string' ? v.since : null,
      currentPeriodEnd: typeof v.currentPeriodEnd === 'number' && Number.isFinite(v.currentPeriodEnd) ? v.currentPeriodEnd : null,
      cancelAtPeriodEnd: v.cancelAtPeriodEnd === true,
      source: v.source === 'stripe' || v.source === 'apple' || v.source === 'google' ? v.source : null,
    },
  };
}

const WEEK_MS = 7 * 86_400_000;
const MONTH_MS = 30 * 86_400_000;

/** Premium weekly allowance, scaled by tenure. Never shrinks. */
export function weeklyAllowance(since: string | null, now: number): number {
  if (!since) return 1;
  const months = (now - Date.parse(since)) / MONTH_MS;
  if (months >= 6) return 4;
  if (months >= 2) return 2;
  return 1;
}

export type ScrapbookGate =
  | { allowed: true; remaining: number | null } // null = effectively unmetered detail not needed
  | { allowed: false; reason: 'free_monthly' } // free user, used the month: this is the paywall moment
  | { allowed: false; reason: 'premium_weekly'; resetAt: number }; // premium, used the week's allowance: a calm wait, never a wall

/**
 * Can a scrapbook be made right now? `made` is the epoch-ms timestamps of scrapbooks
 * already made (their createdAt). Free is metered per calendar month; premium per
 * rolling 7 days against the tenure allowance.
 */
export function canMakeScrapbook(ent: Entitlement, made: number[], now: number): ScrapbookGate {
  if (!ent.premium) {
    const d = new Date(now);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const thisMonth = made.filter((t) => t >= monthStart).length;
    return thisMonth >= 1 ? { allowed: false, reason: 'free_monthly' } : { allowed: true, remaining: 1 - thisMonth };
  }
  const recent = made.filter((t) => t >= now - WEEK_MS);
  const allow = weeklyAllowance(ent.since, now);
  if (recent.length < allow) return { allowed: true, remaining: allow - recent.length };
  const resetAt = Math.min(...recent) + WEEK_MS; // when the oldest in-window keepsake ages out
  return { allowed: false, reason: 'premium_weekly', resetAt };
}
