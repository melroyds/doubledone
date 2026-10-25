// The end of a free month, said once (design_handoff_month_on_us §6). It covers the month given for a note and the
// card-free month alike. The line becomes due only when a SUCCESSFUL entitlement read shows the stored end has
// passed: never just because Premium reads as off, which a network or verification blip can cause, and never when
// the person went on to pay. Today then shows it at its next first paint (the first-paint rule the offer card
// keeps), so it is never inserted above a day already on screen. Pure, so every case is a test.

import type { EntitlementRead } from './entitlement';
import type { MonthEndMemory } from './storage';

export type MonthEndStep = { next: MonthEndMemory | null; showEnd: boolean };

export function stepMonthEnd(prev: MonthEndMemory | null, read: EntitlementRead, nowSec: number): MonthEndStep {
  if (!read.ok) return { next: prev, showEnd: false }; // a failed read changes nothing
  const e = read.entitlement;
  if (e.premium && (e.status === 'given' || e.status === 'trial') && e.currentPeriodEnd != null) {
    const kind = e.status;
    // A new or extended month resets the line; the same month keeps whether it was already shown.
    const same = prev != null && prev.end === e.currentPeriodEnd && prev.kind === kind;
    return { next: { end: e.currentPeriodEnd, kind, shown: same ? prev.shown : false, due: false }, showEnd: false };
  }
  if (e.premium) return { next: null, showEnd: false }; // paying now: the month did not end, it carried on
  if (!read.signedIn) return { next: prev, showEnd: false }; // signed out: nothing to tell, keep the memory
  if (prev && !prev.shown && prev.end <= nowSec) return { next: { ...prev, due: true }, showEnd: true };
  return { next: prev, showEnd: false };
}

/** Whether Today should show the end line at this first paint. */
export function monthEndDue(mem: MonthEndMemory | null): boolean {
  return mem != null && mem.due && !mem.shown;
}

/** Whether a given month is still running by the stored end, so the store's rating card stays off until it ends. */
export function givenMonthRunning(prev: MonthEndMemory | null, nowSec: number): boolean {
  return prev != null && prev.kind === 'given' && prev.end > nowSec;
}
