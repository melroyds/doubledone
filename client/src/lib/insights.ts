// Premium Lookback insights: a small set of CALM, spine-safe stats computed from the user's local
// completion history (no server cost, no identity). Pure, so it is fully tested. The stat set is
// deliberately celebratory only: things finished this week and month, how many distinct DAYS something
// got finished ("on N days", never N-of-30, never a denominator), big/dreaded tasks reclaimed, and one
// reclaimed title to name warmly. DELIBERATELY ABSENT (the spine forbids them): streaks, percent-complete,
// productivity scores, overdue or "missed" counts, any target or comparison.

import { type Completion } from './calendar';
import { weekDates, weekStartISO } from './scrapbook';

export type LookbackStats = {
  finishedThisWeek: number; // completions in the current Sun-Sat week
  finishedThisMonth: number; // completions in the calendar month of `now`
  activeDaysThisMonth: number; // distinct days this month with at least one finish ("on N days")
  bigWinsThisMonth: number; // dreaded/old tasks reclaimed this month (the existing big-win signal)
  bigWinTitle: string | null; // one reclaimed title (the most recent this month) to name warmly, or null
};

/**
 * Compute the calm stat set from the Lookback's by-day completion map. `now` is injected (pure, testable).
 * Counts are over the per-day completion entries already in `byDay`; a recurring task legitimately
 * contributes one entry per day it was ticked.
 */
export function lookbackStats(byDay: Map<string, Completion[]>, now: Date): LookbackStats {
  const weekSet = new Set(weekDates(weekStartISO(now)));
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
  let finishedThisWeek = 0;
  let finishedThisMonth = 0;
  let bigWinsThisMonth = 0;
  const activeDays = new Set<string>();
  let bigWinTitle: string | null = null;
  let bigWinIso = '';
  for (const [iso, comps] of byDay) {
    if (comps.length === 0) continue;
    if (weekSet.has(iso)) finishedThisWeek += comps.length;
    if (iso.startsWith(monthPrefix)) {
      finishedThisMonth += comps.length;
      activeDays.add(iso);
      for (const c of comps) {
        if (c.big) {
          bigWinsThisMonth += 1;
          if (iso >= bigWinIso) {
            bigWinIso = iso;
            bigWinTitle = c.title;
          }
        }
      }
    }
  }
  return { finishedThisWeek, finishedThisMonth, activeDaysThisMonth: activeDays.size, bigWinsThisMonth, bigWinTitle };
}
