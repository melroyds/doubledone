// The AI scrapbook: a calm keepsake image for a finished week, shown in the
// Lookback (the emotional payoff). Pure week-math and store helpers live here;
// the image itself is generated server-side (lib/ai.makeScrapbook) and persisted
// locally (storage.ts). Bounded so the base64 images can't grow the store
// without limit. This is the first slice of the premium "scrapbook" idea, built
// as free delight first (no paywall yet); see the monetisation decision-log.

import { addDaysISO, fromISODate, toISODate } from './day';
import { fmt, t } from './i18n-active';

export type Scrapbook = {
  weekStart: string; // ISO of the week's Sunday (weeks start Sunday, like the calendar)
  image: string; // a data: URL (base64 jpeg, local-only) OR an R2-served https URL (the persisted shape); every consumer (render, share, purge) must accept BOTH — the share path once assumed data:-only and broke on device
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

export type WeekItem = { title: string; big: boolean };

/**
 * Every completed task in a week, from the Lookback's by-day completion map,
 * deduped by title (a recurring task ticked several days shows once) and marked
 * `big` if any of its completions that week was a big win. First-seen order.
 * This is what the scrapbook lists under the polaroid so you SEE what you did.
 */
export function weekCompletions(
  byDay: Map<string, { title: string; big?: boolean }[]>,
  weekStart: string,
): WeekItem[] {
  const byTitle = new Map<string, boolean>();
  for (const iso of weekDates(weekStart)) {
    for (const c of byDay.get(iso) ?? []) {
      byTitle.set(c.title, (byTitle.get(c.title) ?? false) || Boolean(c.big));
    }
  }
  return [...byTitle].map(([title, big]) => ({ title, big }));
}

/** Just the unique titles of a week's completions (what the image pipeline needs). */
export function weekTitles(byDay: Map<string, { title: string; big?: boolean }[]>, weekStart: string): string[] {
  return weekCompletions(byDay, weekStart).map((c) => c.title);
}

/**
 * Greedy word-wrap for the keepsake page's caption: break `text` into lines no wider
 * than `maxWidth` under the injected `measure` (the canvas's measureText on web). A
 * single over-wide word gets its own line rather than looping forever. Pure, so the
 * share page's typography is unit-testable without a canvas.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
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

/** A short, friendly label for a week, e.g. "week of Sun 15 June" (per locale). */
export function weekLabel(weekStart: string): string {
  const d = fromISODate(weekStart);
  return t('scrapbook.weekOf', { date: `${fmt.weekday(d)} ${fmt.monthDay(d)}` });
}
