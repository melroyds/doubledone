// "Where you left off": one free line of the user's own words per task, the handhold for coming back to
// it (who you spoke to, the reference number, what you are waiting on), with the calendar day it was last
// written. Overwritten, never added to: not a log, a trail or a history. Pure and tested; the screens
// render it and today.ts writes it. Spec: docs/design-source/where-you-left-off/handoff/README.md.

import type { LeftOff } from './tasks';

/** The cap. The field just stops taking input here: no counter, no error, no colour change. */
export const LEFT_OFF_MAX = 280;

// One line means one line: pasted breaks become spaces. Deliberately NOT \s, which would also eat the
// no-break spaces a French writer types before ':' and ';'.
const BREAKS = /[\r\n\t\v\f\u2028\u2029]+/g;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The text as it is stored: breaks collapsed to single spaces, trimmed, capped at LEFT_OFF_MAX without
 *  ever splitting a surrogate pair (TextInput's maxLength counts UTF-16 units). '' means no line. */
export function normalizeLeftOffText(raw: string): string {
  const one = raw.replace(BREAKS, ' ').trim();
  if (one.length <= LEFT_OFF_MAX) return one;
  let cut = one.slice(0, LEFT_OFF_MAX);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trim();
}

/** A well-formed line, or undefined. For anything read back from storage or a sync pull: a malformed
 *  value is dropped rather than trusted, so it can never crash a render (an invalid date throws). */
export function cleanLeftOff(value: unknown): LeftOff | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.text !== 'string' || typeof v.writtenOn !== 'string' || !ISO_DAY.test(v.writtenOn)) return undefined;
  const text = normalizeLeftOffText(v.text);
  return text ? { text, writtenOn: v.writtenOn } : undefined;
}

/** The newer of two lines (by the day written), `incoming` winning a tie, because a same-day line arriving
 *  through a move (a tiny step's, a combined task's) was written after the one it lands on. */
export function newerLeftOff(current: LeftOff | null | undefined, incoming: LeftOff | null | undefined): LeftOff | undefined {
  if (!incoming) return current ?? undefined;
  if (!current) return incoming;
  return incoming.writtenOn >= current.writtenOn ? incoming : current;
}

/** The most recently written line among several tasks (Combine keeps one, never merges text): by the day
 *  written, then by the task's own updatedAt, then by order. Undefined when none has a line. */
export function newestLeftOff(candidates: { leftOff?: LeftOff | null; updatedAt: number }[]): LeftOff | undefined {
  let best: { leftOff: LeftOff; updatedAt: number } | null = null;
  for (const c of candidates) {
    if (!c.leftOff) continue;
    if (!best || c.leftOff.writtenOn > best.leftOff.writtenOn || (c.leftOff.writtenOn === best.leftOff.writtenOn && c.updatedAt > best.updatedAt)) {
      best = { leftOff: c.leftOff, updatedAt: c.updatedAt };
    }
  }
  return best ? best.leftOff : undefined;
}

/** The line for a spoken template that ends it with its own full stop: one trailing '.' dropped, so a
 *  screen reader never hears "ring back Thu.. Wednesday". */
export function forSpeech(text: string): string {
  return text.replace(/\.\s*$/, '');
}
