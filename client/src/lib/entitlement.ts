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
};

export const FREE_ENTITLEMENT: Entitlement = { premium: false, status: null, since: null, currentPeriodEnd: null };

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
