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

/** The local date `n` days from `d`, as `YYYY-MM-DD` (handles month/year rollover). */
export function addDaysISO(d: Date, n: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return toISODate(x);
}

/** Local Date from a `YYYY-MM-DD` string (no UTC shift). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Friendly label for a due date relative to today: "Tomorrow", else "Sat 20 Jun". */
export function friendlyDate(iso: string, today: Date, locale = 'en-AU'): string {
  if (iso === addDaysISO(today, 1)) return 'Tomorrow';
  return fromISODate(iso).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Whether opening today counts as a "return after a gap": the last open was an
 * earlier day, at least `gapDays` calendar days ago. False on a brand-new install
 * (no prior open) and on same-day reopens, so the welcome-back card never nags.
 */
export function isReentry(lastOpenISO: string | null, today: Date, gapDays: number): boolean {
  if (!lastOpenISO) return false;
  if (lastOpenISO === toISODate(today)) return false;
  return daysBetween(fromISODate(lastOpenISO), today) >= gapDays;
}

/** The next occurrence of a weekday (0=Sun .. 6=Sat), today or later. */
export function nextWeekday(today: Date, dow: number): string {
  return addDaysISO(today, (dow - today.getDay() + 7) % 7);
}

/** The Monday that starts next week (always 1..7 days out, never today). */
export function nextWeekStart(today: Date): string {
  return addDaysISO(today, ((1 - today.getDay() + 7) % 7) || 7);
}

export type DatePresetKind = 'today' | 'tomorrow' | 'thisWeek' | 'thisWeekend' | 'nextWeek' | 'twoWeeks';

/** Resolve a calendar quick-pick ("This week", "Next week", ...) to a YYYY-MM-DD,
 *  relative to today. Used by the date-picker presets and Break-it-down's due chips. */
export function presetDate(today: Date, kind: DatePresetKind): string {
  switch (kind) {
    case 'today':
      return toISODate(today);
    case 'tomorrow':
      return addDaysISO(today, 1);
    case 'thisWeek':
      return nextWeekday(today, 5); // Friday
    case 'thisWeekend':
      return nextWeekday(today, 6); // Saturday
    case 'nextWeek':
      return nextWeekStart(today); // next Monday
    case 'twoWeeks':
      return addDaysISO(today, 14);
  }
}
