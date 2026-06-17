// Calendar-day helpers. Date math is a top risk surface: a wrong "today"
// boundary shows the user the wrong day's list, and the whole product promise
// is that Today is correct. DST and midnight-wrap are the traps, so the day
// arithmetic counts local midnights rather than fixed 24h blocks. Tested.

/** Midnight at the start of the local day containing `d`. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** True when both dates fall on the same local calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Whole calendar days from `a` to `b` (negative if `b` is before `a`).
 * Rounds across the local-midnight delta so a DST change, where the gap
 * between two midnights is 23h or 25h, still returns a clean integer.
 */
export function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Friendly header label, e.g. "Wednesday, 17 June". */
export function formatTodayLabel(d: Date, locale = 'en-AU'): string {
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Local calendar date as `YYYY-MM-DD` (the key a one-off task is scheduled by). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
