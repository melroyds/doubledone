import { describe, expect, it } from 'vitest';

import { de } from './catalogs/de';
import { en } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import { it as itCatalog } from './catalogs/it';
import { toISODate } from './day';
import {
  buildGlance,
  GLANCE_END,
  GLANCE_MAX_LINES,
  GLANCE_SETTLE_MS,
  GLANCE_TITLE_MAX,
  glanceAction,
  glanceDismissedToday,
  glanceEndLabel,
  glanceExpiry,
  glanceHasWindow,
  glanceHint,
  glanceTooLateLine,
  type GlanceTrail,
  glanceWindow,
  inGlanceWindow,
  nextGlanceArrival,
  parseReminderStyle,
  planGlanceArrival,
} from './glance';
import { type Recurrence } from './recurrence';
import type { Task } from './tasks';

// Local-time constructors, matching how the module reads the clock: 10 Nov 2026 unless told otherwise.
const at = (h: number, m = 0, d = 10, mo = 10, y = 2026) => new Date(y, mo, d, h, m);
const DAY = at(12);
const ISO = '2026-11-10';
const YESTERDAY = '2026-11-09';
const daily: Recurrence = { kind: 'daily' };

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, title: id, done: false, createdAt: 1, updatedAt: 1, ...over };
}
const doneToday = (id: string, over: Partial<Task> = {}) => task(id, { done: true, completedAt: at(8).getTime(), ...over });
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Run `body` with the process in `zone`, so a daylight-saving night is exercised whatever zone the machine (or
 *  CI, which is UTC) runs in. Node re-reads TZ when it is assigned. Restored by name: deleting TZ does not
 *  restore the zone the process started in. */
function inZone(zone: string, body: () => void): void {
  const original = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = zone;
  try {
    body();
  } finally {
    process.env.TZ = original;
  }
}

describe('parseReminderStyle', () => {
  it('reads the glance only when the glance was chosen, so every existing user keeps the nudge', () => {
    expect(parseReminderStyle('glance')).toBe('glance');
    for (const raw of ['nudge', null, undefined, '', 'GLANCE', 'on', '{"x":1}']) expect(parseReminderStyle(raw)).toBe('nudge');
  });
});

describe('buildGlance: what it says', () => {
  // Stored order a, b, c, d, e, f. c and b carry an accepted manual order (0, 1), d is the pin, e is held.
  const ordered = () => [
    task('a'),
    task('b', { manualOrder: 1 }),
    task('c', { manualOrder: 0 }),
    task('d', { pinnedAt: 5 }),
    task('e'),
    task('f'),
  ];

  it("lists the open tasks in Today's own order: the pin, the held task under it, the manual order, then as stored", () => {
    const g = buildGlance(ordered(), DAY, null, 'e');
    expect(g.state).toBe('tasks');
    expect(g.lines).toEqual(['d', 'e', 'c', 'b']);
    expect(g.more).toBe(true);
    expect(g.collapsed).toBe('d, and more');
  });

  it('keeps the stored order behind the pin and the manual order when nothing is held', () => {
    expect(buildGlance(ordered(), DAY, null).lines).toEqual(['d', 'c', 'b', 'a']);
  });

  it('takes the order first and drops the finished rows after, so a done pin or held task never moves an open row', () => {
    // A finished pin recedes, as on Today, and the held task takes the top.
    const pinDone = ordered().map((x) => (x.id === 'd' ? doneToday('d', { pinnedAt: 5 }) : x));
    expect(buildGlance(pinDone, DAY, null, 'e').lines).toEqual(['e', 'c', 'b', 'a']);
    // A finished held task drops out and leaves everything else exactly where it was.
    const heldDone = ordered().map((x) => (x.id === 'e' ? doneToday('e') : x));
    expect(buildGlance(heldDone, DAY, null, 'e').lines).toEqual(buildGlance(heldDone, DAY, null, null).lines);
    // A pinned repeat ticked today stays pinned on Today but is done, so it is not a line here.
    const pinnedRepeat = [task('r', { recurrence: daily, pinnedAt: 9, completedDates: [ISO] }), task('x')];
    expect(buildGlance(pinnedRepeat, DAY, null, 'x').lines).toEqual(['x']);
  });

  it('shows only what Today shows for that day: no future one-offs, no removed or hidden tasks, no repeat that is not due', () => {
    const tasks = [
      task('soon', { due: '2026-11-12' }),
      task('gone', { deletedAt: 5 }),
      task('hidden', { silentParent: true }),
      task('weekly', { recurrence: { kind: 'weekly', weekdays: [1] } }), // Mondays; 10 Nov 2026 is a Tuesday
      task('overdue', { due: '2026-11-01' }),
      task('now'),
    ];
    expect(buildGlance(tasks, DAY, null).lines).toEqual(['overdue', 'now']);
  });

  it('collapsed is the first title alone, with ", and more" only when anything else is open', () => {
    const one = buildGlance([task('Water the plants')], DAY, null);
    expect(one.collapsed).toBe('Water the plants');
    expect(one.expanded).toBe('Water the plants');
    expect(one.more).toBe(false);
    const two = buildGlance([task('Water the plants'), task('Call the bank')], DAY, null);
    expect(two.collapsed).toBe('Water the plants, and more');
    expect(two.expanded).toBe('Water the plants\nCall the bank');
    expect(two.more).toBe(false); // both fit the expanded view, so it needs no "and more"
  });

  it('expanded shows up to four titles, one per line, then "and more" only when there are more', () => {
    const four = buildGlance(['a', 'b', 'c', 'd'].map((id) => task(id)), DAY, null);
    expect(four.lines).toHaveLength(GLANCE_MAX_LINES);
    expect(four.expanded).toBe('a\nb\nc\nd');
    const five = buildGlance(['a', 'b', 'c', 'd', 'e'].map((id) => task(id)), DAY, null);
    expect(five.lines).toEqual(['a', 'b', 'c', 'd']);
    expect(five.expanded).toBe('a\nb\nc\nd\nand more');
  });

  // A count sitting in the notifications all day reads as a debt. Titles only.
  it('never shows a number, however much is open', () => {
    const many = Array.from({ length: 14 }, (_, i) => task(`id${i}`, { title: `Task ${'abcdefghijklmn'[i]}` }));
    const g = buildGlance(many, DAY, null);
    for (const text of [g.title, g.collapsed, g.expanded, ...g.lines]) expect(text).not.toMatch(/\d/);
  });

  it('keeps every title on one line, so the expanded view stays one task per line', () => {
    const g = buildGlance([task('x', { title: '  Pack\nthe   bag ' }), task('y')], DAY, null);
    expect(g.lines).toEqual(['Pack the bag', 'y']);
    expect(g.expanded.split('\n')).toHaveLength(2);
  });

  // Every title rides in the post several times over, handed to Android in one piece after every save, and a parcel
  // too large for that crashes the app from a background thread. A pasted paragraph must stay small.
  it('cuts a very long title with an ellipsis, by code point, and leaves a normal one whole', () => {
    const exact = 'a'.repeat(GLANCE_TITLE_MAX);
    expect(buildGlance([task('x', { title: exact })], DAY, null).lines).toEqual([exact]);
    const long = buildGlance([task('x', { title: `${'word '.repeat(400)}end` }), task('y')], DAY, null);
    expect(Array.from(long.lines[0])).toHaveLength(GLANCE_TITLE_MAX);
    expect(long.lines[0]).toMatch(/^word word .*\S…$/);
    expect(long.collapsed).toBe(`${long.lines[0]}, and more`);
    // An emoji straddling the cut is kept whole or left out, never split into half a character.
    const emoji = buildGlance([task('x', { title: `${'b'.repeat(GLANCE_TITLE_MAX - 2)}😀😀😀` })], DAY, null).lines[0];
    expect(emoji).toBe(`${'b'.repeat(GLANCE_TITLE_MAX - 2)}😀…`);
    expect(emoji).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('stays small however long the titles are: the key is a short fingerprint, never the words', () => {
    const huge = ['a', 'b', 'c', 'd', 'e'].map((id) => task(id, { title: `${id} ${'x'.repeat(5000)}` }));
    const g = buildGlance(huge, DAY, null);
    expect(g.expanded.length).toBeLessThanOrEqual(GLANCE_MAX_LINES * (GLANCE_TITLE_MAX + 1) + 'and more'.length);
    expect(g.key).toMatch(/^[0-9a-z]{1,11}$/);
  });

  it('is titled Today', () => {
    expect(buildGlance([task('a')], DAY, null).title).toBe('Today');
  });

  it('is closed when the day was closed (Goodnight), whatever is still open, and says nothing', () => {
    const g = buildGlance([task('a'), task('b')], DAY, ISO);
    expect(g.state).toBe('closed');
    expect(g.lines).toEqual([]);
    expect(g.collapsed).toBe('');
    expect(g.expanded).toBe('');
  });

  it('a close only closes its own day', () => {
    expect(buildGlance([task('a')], DAY, YESTERDAY).state).toBe('tasks');
  });

  it('is done when the day had tasks and every one is ticked, repeats by the day', () => {
    const g = buildGlance([doneToday('a'), task('r', { recurrence: daily, completedDates: [ISO] })], DAY, null);
    expect(g.state).toBe('done');
    expect(g.lines).toEqual([]);
  });

  it('is empty when nothing is set for the day', () => {
    expect(buildGlance([], DAY, null).state).toBe('empty');
    expect(buildGlance([task('later', { due: '2026-11-20' })], DAY, null).state).toBe('empty');
  });

  it("tomorrow's content, worked out tonight, carries open tasks over and drops today's finished ones", () => {
    const tasks = [
      doneToday('finished'),
      task('undated'),
      task('tomorrow', { due: '2026-11-11' }),
      task('r', { recurrence: daily, completedDates: [ISO] }), // ticked today, due again tomorrow
    ];
    const g = buildGlance(tasks, at(9, 0, 11), null);
    expect(g.day).toBe('2026-11-11');
    expect(g.lines).toEqual(['undated', 'tomorrow', 'r']);
  });

  describe('the key (skip a re-post when nothing changed)', () => {
    const base = ['a', 'b', 'c', 'd', 'e'].map((id) => task(id));

    it('is stable for the same words', () => {
      expect(buildGlance(base, DAY, null).key).toBe(buildGlance(base.map((x) => ({ ...x })), at(20), null).key);
    });

    it('changes when what shows changes: the order, a title, the state', () => {
      const k = buildGlance(base, DAY, null).key;
      expect(buildGlance([...base].reverse(), DAY, null).key).not.toBe(k);
      expect(buildGlance(base.map((x) => (x.id === 'a' ? { ...x, title: 'renamed' } : x)), DAY, null).key).not.toBe(k);
      expect(buildGlance(base, DAY, ISO).key).not.toBe(k);
    });

    it('does not change for a task beyond what shows', () => {
      expect(buildGlance([...base, task('f')], DAY, null).key).toBe(buildGlance(base, DAY, null).key);
    });

    it('changes with the day, so a new day is always posted fresh with its own expiry', () => {
      expect(buildGlance(base, at(9, 0, 11), null).key).not.toBe(buildGlance(base, DAY, null).key);
    });
  });
});

describe('the window: from the hour until 21:30, the same day', () => {
  it('exists for hours up to 20, and not from 21 on', () => {
    for (let h = 0; h <= 20; h++) expect(glanceHasWindow(h)).toBe(true);
    for (const h of [21, 22, 23]) expect(glanceHasWindow(h)).toBe(false);
    expect(glanceWindow(DAY, 21)).toBeNull();
    expect(nextGlanceArrival(DAY, 22)).toBeNull();
  });

  it('opens at hour:00 and ends at 21:30 on that date', () => {
    const w = glanceWindow(DAY, 9)!;
    expect(w.start).toEqual(at(9, 0));
    expect(w.end).toEqual(at(GLANCE_END.hour, GLANCE_END.minute));
    expect(glanceExpiry(at(23, 59))).toEqual(at(21, 30));
    expect(glanceExpiry(at(0, 0, 11))).toEqual(at(21, 30, 11));
  });

  it('includes the hour itself and stops at 21:30', () => {
    expect(inGlanceWindow(at(8, 59), 9)).toBe(false);
    expect(inGlanceWindow(at(9, 0), 9)).toBe(true);
    expect(inGlanceWindow(at(21, 29), 9)).toBe(true);
    expect(inGlanceWindow(at(21, 30), 9)).toBe(false);
    expect(inGlanceWindow(at(23, 0), 9)).toBe(false);
    expect(inGlanceWindow(at(21, 10), 21)).toBe(false); // no window at all
  });

  it('a stored hour out of range is clamped like every other reminder hour', () => {
    expect(glanceWindow(DAY, -4)!.start).toEqual(at(0, 0));
    expect(glanceHasWindow(30)).toBe(false);
  });
});

describe('nextGlanceArrival', () => {
  it("is today's hour while it is still ahead, and tomorrow's once it has come", () => {
    expect(nextGlanceArrival(at(7, 15), 9)).toEqual(at(9, 0));
    expect(nextGlanceArrival(at(9, 0), 9)).toEqual(at(9, 0, 11)); // strictly after: the hour itself has come
    expect(nextGlanceArrival(at(13, 0), 9)).toEqual(at(9, 0, 11));
    expect(nextGlanceArrival(at(23, 30), 9)).toEqual(at(9, 0, 11));
  });

  it('rolls over months and years by the calendar', () => {
    expect(nextGlanceArrival(at(22, 0, 30), 8)).toEqual(new Date(2026, 11, 1, 8, 0));
    expect(nextGlanceArrival(new Date(2026, 11, 31, 22, 0), 8)).toEqual(new Date(2027, 0, 1, 8, 0));
  });
});

describe('daylight-saving nights', () => {
  // Melbourne: clocks go back at 03:00 on 5 Apr 2026 and forward at 02:00 on 4 Oct 2026.
  // New York: forward at 02:00 on 8 Mar 2026, back at 02:00 on 1 Nov 2026.
  const zones: { zone: string; forward: [number, number]; back: [number, number] }[] = [
    { zone: 'Australia/Melbourne', forward: [9, 4], back: [3, 5] },
    { zone: 'America/New_York', forward: [2, 8], back: [10, 1] },
  ];

  it.each(zones)('$zone: the zone switch really took effect (or every test below would pass vacuously)', ({ zone }) => {
    inZone(zone, () => {
      const jan = new Date(2026, 0, 15).getTimezoneOffset();
      const jul = new Date(2026, 6, 15).getTimezoneOffset();
      expect(jan).not.toBe(jul);
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
    });
  });

  it.each(zones)('$zone: every day of the year opens at the hour and ends at 21:30 local, and the next arrival is the next date', ({ zone }) => {
    inZone(zone, () => {
      for (const hour of [0, 7, 9, 20]) {
        for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
          const w = glanceWindow(d, hour)!;
          expect(toISODate(w.start)).toBe(toISODate(d));
          expect(hhmm(w.start)).toBe(`${String(hour).padStart(2, '0')}:00`);
          expect(toISODate(w.end)).toBe(toISODate(d));
          expect(hhmm(w.end)).toBe('21:30');
          const next = nextGlanceArrival(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21, 45), hour)!;
          expect(toISODate(next)).toBe(toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)));
          expect(hhmm(next)).toBe(`${String(hour).padStart(2, '0')}:00`);
        }
      }
    });
  });

  it.each(zones)('$zone: a night that loses an hour is 23 hours between arrivals, one that gains is 25, and 9:00 stays 9:00', ({ zone, forward, back }) => {
    inZone(zone, () => {
      const H = 3_600_000;
      const before = (mo: number, d: number) => new Date(2026, mo, d - 1, 9, 0);
      const springFrom = before(...forward);
      const spring = nextGlanceArrival(springFrom, 9)!;
      expect(spring.getTime() - springFrom.getTime()).toBe(23 * H);
      expect(hhmm(spring)).toBe('09:00');
      const fallFrom = before(...back);
      const fall = nextGlanceArrival(fallFrom, 9)!;
      expect(fall.getTime() - fallFrom.getTime()).toBe(25 * H);
      expect(hhmm(fall)).toBe('09:00');
      // The expiry on both nights' days is still 21:30 by the wall clock.
      expect(hhmm(glanceExpiry(spring))).toBe('21:30');
      expect(hhmm(glanceExpiry(fall))).toBe('21:30');
      expect(inGlanceWindow(new Date(spring.getFullYear(), spring.getMonth(), spring.getDate(), 21, 29), 9)).toBe(true);
      expect(inGlanceWindow(new Date(fall.getFullYear(), fall.getMonth(), fall.getDate(), 21, 30), 9)).toBe(false);
    });
  });

  it('an hour inside the spring-forward gap lands on the first moment after it, on the same date', () => {
    inZone('Australia/Melbourne', () => {
      const w = glanceWindow(new Date(2026, 9, 4), 2)!; // 02:00 does not exist that night
      expect(toISODate(w.start)).toBe('2026-10-04');
      expect(hhmm(w.start)).toBe('03:00');
    });
  });
});

describe('planGlanceArrival: the one future arrival', () => {
  const tasks = [task('a'), task('b', { due: '2026-11-11' })];
  const plan = (now: Date, over: Partial<Parameters<typeof planGlanceArrival>[0]> = {}) =>
    planGlanceArrival({ tasks, now, closedISO: null, heldId: null, hour: 9, ...over });

  it("before the hour: today's arrival, with today's content and today's 21:30 expiry", () => {
    const p = plan(at(7, 0))!;
    expect(p.at).toEqual(at(9, 0));
    expect(p.expiresAt).toEqual(at(21, 30));
    expect(p.content.day).toBe(ISO);
    expect(p.content.lines).toEqual(['a']);
  });

  it("from the hour on: tomorrow's arrival, with tomorrow's content and expiry", () => {
    const p = plan(at(15, 0))!;
    expect(p.at).toEqual(at(9, 0, 11));
    expect(p.expiresAt).toEqual(at(21, 30, 11));
    expect(p.content.day).toBe('2026-11-11');
    expect(p.content.lines).toEqual(['a', 'b']);
  });

  it('passes over a day with nothing to show: closed, done or empty today means tomorrow', () => {
    expect(plan(at(7, 0), { closedISO: ISO })!.at).toEqual(at(9, 0, 11));
    expect(planGlanceArrival({ tasks: [doneToday('x'), task('y', { due: '2026-11-11' })], now: at(7, 0), closedISO: null, heldId: null, hour: 9 })!.at).toEqual(at(9, 0, 11));
  });

  it('passes over today once today was put away, even before the hour', () => {
    expect(plan(at(7, 0), { dismissedToday: true })!.at).toEqual(at(9, 0, 11));
  });

  it('never plans beyond tomorrow, and plans nothing when tomorrow has nothing', () => {
    const later = [task('friday', { due: '2026-11-13' })];
    expect(planGlanceArrival({ tasks: later, now: at(15, 0), closedISO: null, heldId: null, hour: 9 })).toBeNull();
    expect(planGlanceArrival({ tasks: [], now: at(7, 0), closedISO: null, heldId: null, hour: 9 })).toBeNull();
  });

  it('plans nothing when the hour leaves no window', () => {
    expect(plan(at(7, 0), { hour: 21 })).toBeNull();
  });

  it("works tomorrow's order out from the pin and the held task as well", () => {
    const ordered = [task('x'), task('y'), task('held'), task('pin', { pinnedAt: 3 })];
    expect(planGlanceArrival({ tasks: ordered, now: at(15, 0), closedISO: null, heldId: 'held', hour: 9 })!.content.lines).toEqual(['pin', 'held', 'x', 'y']);
  });
});

describe('glanceDismissedToday: posted today and not showing means not today', () => {
  const trail = (over: Partial<GlanceTrail> = {}): GlanceTrail => ({ presented: false, postedAt: null, arrival: null, ...over });
  const now = at(11, 0);

  it('a glance the app posted today that is no longer showing was put away (a swipe, a reboot, an update)', () => {
    expect(glanceDismissedToday(now, 9, trail({ postedAt: at(10, 0).getTime() }))).toBe(true);
  });

  // The app's own leave (the day closed, finished or emptied) is not a swipe: it remembers taking it down, so Reopen,
  // an untick or a new task brings it back the same day.
  it('the app taking it down itself is not put away: every sign from before the take-down is explained by it', () => {
    const down = at(14, 0).getTime();
    expect(glanceDismissedToday(at(15, 0), 9, trail({ seenAt: down, postedAt: at(10, 0).getTime(), takenDownAt: down }))).toBe(false);
    expect(glanceDismissedToday(at(15, 0), 9, trail({ arrival: { at: at(9, 0).getTime(), pending: false }, takenDownAt: down }))).toBe(false);
  });

  it('a sign from after the take-down counts as usual: re-posted, then swiped, is put away', () => {
    const down = at(14, 0).getTime();
    expect(glanceDismissedToday(at(16, 0), 9, trail({ postedAt: at(15, 0).getTime(), takenDownAt: down }))).toBe(true);
    expect(glanceDismissedToday(at(16, 0), 9, trail({ seenAt: at(15, 30).getTime(), takenDownAt: down }))).toBe(true);
  });

  it("a take-down from an earlier day changes nothing about today's signs", () => {
    expect(glanceDismissedToday(now, 9, trail({ postedAt: at(10, 0).getTime(), takenDownAt: at(20, 0, 9).getTime() }))).toBe(true);
  });

  it('one that is showing is not put away', () => {
    expect(glanceDismissedToday(now, 9, trail({ presented: true, postedAt: at(10, 0).getTime() }))).toBe(false);
    expect(glanceDismissedToday(now, 9, trail({ presented: true, presentedDay: ISO, seenAt: at(10, 0).getTime() }))).toBe(false);
  });

  it('a post still landing (the handler can take seconds) is not a swipe', () => {
    expect(glanceDismissedToday(now, 9, trail({ postedAt: now.getTime() - 3_000 }))).toBe(false);
    expect(glanceDismissedToday(now, 9, trail({ postedAt: now.getTime() - GLANCE_SETTLE_MS }))).toBe(true);
  });

  // A refresh that SAW it showing knows it was up, so a swipe straight after an open still counts at once.
  it('one seen showing and now gone counts at once, with no time to land', () => {
    expect(glanceDismissedToday(now, 9, trail({ seenAt: now.getTime() - 2_000 }))).toBe(true);
  });

  it("today's arrival that has fired counts as posted today", () => {
    expect(glanceDismissedToday(now, 9, trail({ arrival: { at: at(9, 0).getTime(), pending: false } }))).toBe(true);
  });

  it('an arrival still waiting to fire posted nothing yet (a late, inexact alarm), so the app may post on open', () => {
    expect(glanceDismissedToday(at(9, 10), 9, trail({ arrival: { at: at(9, 0).getTime(), pending: true } }))).toBe(false);
  });

  it("yesterday's glance does not count today, and neither does tomorrow's arrival or a time not yet come", () => {
    expect(glanceDismissedToday(now, 9, trail({ postedAt: at(20, 0, 9).getTime(), seenAt: at(20, 5, 9).getTime() }))).toBe(false);
    expect(glanceDismissedToday(now, 9, trail({ arrival: { at: at(9, 0, 11).getTime(), pending: true } }))).toBe(false);
    expect(glanceDismissedToday(now, 9, trail({ seenAt: at(12, 0).getTime() }))).toBe(false);
    expect(glanceDismissedToday(now, 9, trail({ postedAt: Number.NaN, seenAt: Number.NaN }))).toBe(false);
  });

  it('a moment up from before the window opened does not count, so a later window can still open today', () => {
    // The hour moved from 9 to 16 at 15:00: the glance seen at 15:00 was taken down, and 16:00 must still come.
    expect(glanceDismissedToday(at(17, 0), 16, trail({ postedAt: at(10, 0).getTime(), seenAt: at(15, 0).getTime() }))).toBe(false);
  });

  it('once judged put away, it stays put away for the rest of that day, whatever is rescheduled meanwhile', () => {
    // The fired arrival was judged at 10:00 and then replaced by tomorrow's: the verdict must not be lost with it.
    const later = trail({ dismissedOn: ISO, arrival: { at: at(9, 0, 11).getTime(), pending: true } });
    expect(glanceDismissedToday(at(13, 0), 9, later)).toBe(true);
    expect(glanceDismissedToday(at(9, 30, 11), 9, later)).toBe(false); // the next day is a new day
  });

  // A late, inexact arrival can fire as the app opens and still be in the foreground handler when the cold open's
  // refresh reads the shade: judged by its own absence, then landing a moment later. The shade is the fact.
  it("today's glance showing outranks a verdict made while it was still on its way", () => {
    expect(glanceDismissedToday(at(9, 41), 9, trail({ presented: true, presentedDay: ISO, dismissedOn: ISO }))).toBe(false);
    expect(glanceDismissedToday(at(9, 41), 9, trail({ presented: true, presentedDay: null, dismissedOn: ISO }))).toBe(false);
    // Yesterday's left showing does not: today's verdict stands.
    expect(glanceDismissedToday(at(9, 41), 9, trail({ presented: true, presentedDay: YESTERDAY, dismissedOn: ISO }))).toBe(true);
  });

  it('a glance left showing from an earlier day is not today’s', () => {
    expect(glanceDismissedToday(now, 9, trail({ presented: true, presentedDay: YESTERDAY, postedAt: at(20, 0, 9).getTime() }))).toBe(false);
    // ...and it does not shield today's verdict either: today's was seen, and what shows now is yesterday's.
    expect(glanceDismissedToday(now, 9, trail({ presented: true, presentedDay: YESTERDAY, seenAt: at(10, 0).getTime() }))).toBe(true);
  });

  it('an empty trail (the glance just switched on) counts nothing, so it can show at once', () => {
    expect(glanceDismissedToday(now, 9, trail())).toBe(false);
  });

  it('gives no verdict when the hour leaves no window', () => {
    expect(glanceDismissedToday(at(21, 50), 21, trail({ postedAt: at(21, 5).getTime() }))).toBe(false);
  });
});

describe('glanceAction: what one refresh does', () => {
  const content = buildGlance([task('a'), task('b')], at(11, 0), null);
  const act = (over: Partial<Parameters<typeof glanceAction>[0]> = {}) =>
    glanceAction({ content, now: at(11, 0), hour: 9, dismissed: false, presented: false, presentedKey: null, ...over });

  it('posts when it belongs up and is not showing', () => {
    expect(act()).toBe('post');
  });

  it('does nothing when exactly this is already showing (skip-unchanged)', () => {
    expect(act({ presented: true, presentedKey: content.key })).toBe('none');
  });

  it('re-posts in place when what is showing says something else, or cannot say what it says', () => {
    const changed = buildGlance([task('b'), task('a')], at(11, 0), null);
    expect(act({ content: changed, presented: true, presentedKey: content.key })).toBe('post');
    expect(act({ presented: true, presentedKey: null })).toBe('post');
  });

  it('takes it down when the day closed, finished or emptied, and leaves nothing to take down alone', () => {
    for (const c of [buildGlance([task('a')], at(11, 0), ISO), buildGlance([doneToday('a')], at(11, 0), null), buildGlance([], at(11, 0), null)]) {
      expect(act({ content: c, presented: true, presentedKey: c.key })).toBe('remove');
      expect(act({ content: c })).toBe('none');
    }
  });

  it('never posts outside the window, and takes down one that is showing there', () => {
    expect(act({ now: at(8, 0) })).toBe('none');
    expect(act({ now: at(8, 0), presented: true })).toBe('remove');
    expect(act({ now: at(21, 30) })).toBe('none');
    expect(act({ hour: 21, now: at(21, 10) })).toBe('none');
  });

  it('never posts again once today was put away', () => {
    expect(act({ dismissed: true })).toBe('none');
  });

  it("never posts content worked out for another day as today's", () => {
    const tomorrow = buildGlance([task('a')], at(9, 0, 11), null);
    expect(act({ content: tomorrow })).toBe('none');
    expect(act({ content: tomorrow, presented: true })).toBe('remove');
  });
});

describe('the copy', () => {
  const catalogs = { en, de, es, fr, it: itCatalog };
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('names 21:30 in the device convention in the hint, and 21:00 (the first hour too late) in the late-hour line', () => {
    const label = glanceEndLabel().replace(/\u202f/g, ' ');
    expect(label).toBe('9:30 pm');
    expect(glanceHint()).toContain(glanceEndLabel());
    expect(glanceHint()).toBe(`It leaves when the day's done, or by ${glanceEndLabel()}. Your lock screen shows it if your phone allows.`);
    // Under "Stays from 9:00 pm" the line must not name 9:30 pm, which reads as if 9:00 pm were still in time.
    expect(glanceTooLateLine().replace(/\u202f/g, ' ')).toBe('Pick a time before 9:00 pm for this one.');
    expect(glanceTooLateLine()).not.toContain(glanceEndLabel());
  });

  it.each(Object.entries(catalogs))('%s: keeps every placeholder, and has no em dash, no semicolon and no digit', (_lang, c) => {
    for (const [key, value] of Object.entries(c.glance)) {
      expect(placeholders(value), key).toEqual(placeholders(en.glance[key as keyof typeof en.glance]));
      expect(value, key).not.toMatch(/[\u2014;\d]/);
    }
  });

  it.each(Object.entries(catalogs))('%s: never calls it live', (_lang, c) => {
    for (const value of Object.values(c.glance)) expect(value).not.toMatch(/\blive\b|en direct|en vivo|en directo|tiempo real|temps réel|tempo reale|echtzeit/i);
  });

  it('never promises the lock screen: the phone decides', () => {
    expect(en.glance.hint).toMatch(/if your phone allows/);
  });
});
