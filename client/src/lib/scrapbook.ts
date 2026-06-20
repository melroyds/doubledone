// The AI scrapbook: a calm keepsake image for a finished week, shown in the
// Lookback (the emotional payoff). Pure week-math and store helpers live here;
// the image itself is generated server-side (lib/ai.makeScrapbook) and persisted
// locally (storage.ts). Bounded so the base64 images can't grow the store
// without limit. This is the first slice of the premium "scrapbook" idea, built
// as free delight first (no paywall yet); see the monetisation decision-log.

import { addDaysISO, fromISODate, toISODate } from './day';

export type Scrapbook = {
  weekStart: string; // ISO of the week's Sunday (weeks start Sunday, like the calendar)
  image: string; // a data: URL (base64 jpeg) from the Worker
  caption: string; // the calm scene the image was made from
  createdAt: number; // epoch ms
};

// Keep the local store bounded: base64 images are large, so we hold only the most
// recent few weeks on-device. (Cross-device sync via Supabase Storage is a later slice.)
export const MAX_SCRAPBOOKS = 16;

/** The week containing `date`, as the ISO of its Sunday. Pure, so it's testable. */
export function weekStartISO(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // back up to Sunday
  return toISODate(d);
}

/** The seven ISO dates of the week starting at `weekStart` (Sun..Sat). */
export function weekDates(weekStart: string): string[] {
  const start = fromISODate(weekStart);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

/** Every completed title in a week, from the Lookback's by-day completion map. */
export function weekTitles(byDay: Map<string, { title: string }[]>, weekStart: string): string[] {
  return weekDates(weekStart).flatMap((iso) => (byDay.get(iso) ?? []).map((c) => c.title));
}

/** The scrapbook for a given week, if one has been made. */
export function findScrapbook(books: Scrapbook[], weekStart: string): Scrapbook | undefined {
  return books.find((b) => b.weekStart === weekStart);
}

/** Add or replace the scrapbook for its week (newest first), capped. */
export function upsertScrapbook(books: Scrapbook[], entry: Scrapbook): Scrapbook[] {
  const rest = books.filter((b) => b.weekStart !== entry.weekStart);
  return [entry, ...rest].slice(0, MAX_SCRAPBOOKS);
}

/** A short, friendly label for a week, e.g. "week of Sun 15 June". */
export function weekLabel(weekStart: string): string {
  const d = fromISODate(weekStart);
  return `week of ${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long' })}`;
}
