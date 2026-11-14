// "Today in your notifications" (internal name: the glance), the pure half. Android only, opt-in, off by default.
//
// Born from a paying user (2026-11-10) who wanted today's list passively there when they pick up the phone, and
// never a sound or a buzz: an app that buzzes gets all its notifications silenced. So it is the daily reminder's
// third choice (Off / a nudge at the hour / stays from the hour until done), it replaces the nudge rather than
// joining it, and everything that decides WHAT it says and WHEN it may show lives here, pure and node-tested.
// The native seam only posts, schedules and dismisses what this decides.
//
// The rules (the decided spec):
// - It shows from the reminder hour (hour:00 local) until 21:30 local that same day, never outside it. An hour of
//   21 or later leaves no window at all, and Settings asks for an earlier time (glanceTooLateLine).
// - It says "Today" over the open tasks due today in TODAY'S OWN ORDER (openInTodaysOrder), titles only.
//   Collapsed, the first title and ", and more" when anything else is open. Expanded, up to four titles one per
//   line, then "and more". NEVER a number: a count sitting in the notifications all day reads as a debt.
// - It leaves when the day is closed (Goodnight), every task is done, or the day is empty, and it comes back the
//   same day if that changes (Reopen, an untick, a new task): the app took it down itself, so its absence is no
//   swipe. A swipe means "not today": it stays away until the next day's arrival at the hour.
// - Only a glance the app knows went up can be put away: one a refresh saw in the shade, or one the app posted
//   itself. A scheduled arrival nobody saw counts for nothing, because Android can lose one without a word, so the
//   next open inside the window posts it. The cost, accepted 2026-11-12: a swipe made before any refresh has seen the
//   glance comes back once, at the next refresh, and a second swipe sticks. In practice that is a swipe before the
//   day's first open, or, when it arrives with the app already open, one before the next save or return to the app.
// - From 21:30 its absence is the window's end (its own expiry, or a refresh taking it down), never a swipe.
// - Every post carries an absolute expiry, 21:30 that day, so a late alarm can never show it past 21:30.
//
// Date maths is local and safe across daylight-saving nights: every moment is built with the Date constructor
// from a calendar date plus a wall-clock time, never by adding 24 hours to a timestamp.

import { toISODate } from './day';
import { t } from './i18n-active';
import { clampHour, formatReminderTime } from './reminders-types';
import type { Task } from './tasks';
import { openInTodaysOrder, tasksForToday } from './today';

/** The daily reminder's style: the one gentle nudge (everyone's until they choose otherwise), or the glance. Off
 *  is the reminder being off (reminderOn false), never a style, so the glance replaces the nudge, never both. */
export type ReminderStyle = 'nudge' | 'glance';

/** A stored style, read defensively: anything but 'glance' is the nudge, so every existing user is unchanged. */
export function parseReminderStyle(raw: string | null | undefined): ReminderStyle {
  return raw === 'glance' ? 'glance' : 'nudge';
}

/** Up to this many titles in the expanded view, then "and more". */
export const GLANCE_MAX_LINES = 4;

/**
 * The most characters a title takes in the glance before it is cut with an ellipsis. The shade shows far less of it
 * (one row collapsed, a few expanded), and every title rides in the post itself several times over, which the phone
 * hands to Android in one piece after every save. A few pasted paragraphs must not make that piece large.
 */
export const GLANCE_TITLE_MAX = 120;

/** The window's fixed end, 21:30 local. Hold me to it's quiet hours start at the same minute (lib/hold), so
 *  nothing of DoubleDone's sits on a bedside screen through the night. */
export const GLANCE_END = { hour: 21, minute: 30 } as const;

/**
 * How long a post gets to land before its absence can be read as a swipe. A post made while the app is open goes
 * through the JS notification handler, which may take up to 3 seconds and be retried once, so a refresh a moment
 * later must not mistake a glance still on its way for one the user put away.
 */
export const GLANCE_SETTLE_MS = 10_000;

// ---- What it says --------------------------------------------------------------------------------------------

export type GlanceState = 'tasks' | 'done' | 'empty' | 'closed';

export type GlanceContent = {
  /** The local calendar day (YYYY-MM-DD) this content is for. */
  day: string;
  /** Only 'tasks' is ever shown. 'closed' (Goodnight), 'done' (all ticked) and 'empty' (nothing for the day)
   *  all mean it leaves. */
  state: GlanceState;
  /** "Today", the notification's title. */
  title: string;
  /** Up to GLANCE_MAX_LINES open titles in Today's order, each on one line. Empty unless the state is 'tasks'. */
  lines: string[];
  /** More open tasks than `lines` holds, so the expanded view ends with "and more". */
  more: boolean;
  /** The collapsed text: the first title, then ", and more" when anything else is open. '' unless 'tasks'. */
  collapsed: string;
  /** The expanded (big text) view: `lines` one per line, then "and more" when `more`. '' unless 'tasks'. */
  expanded: string;
  /** A short fingerprint of everything above, which changes whenever anything would read differently (the day
   *  included, so a new day's glance is always posted fresh with its own expiry). For skipping a re-post when
   *  nothing changed. Short, because it rides in every post's data: never the words themselves. */
  key: string;
};

/**
 * A title on one line, and never longer than GLANCE_TITLE_MAX: the expanded view gives each task its own line, so a
 * title's own breaks must not split it. Cut by code point, so an emoji is never broken in half.
 */
function oneLine(title: string): string {
  const flat = title.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  if (chars.length <= GLANCE_TITLE_MAX) return flat;
  const cut = chars.slice(0, GLANCE_TITLE_MAX - 1).join('').trimEnd();
  return `${cut}…`;
}

/** cyrb53, a small well-mixed 53-bit string hash, in base 36. Two different glances sharing one is vanishingly
 *  unlikely, and the cost if they ever did is one re-post skipped until the next change. */
function fingerprint(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function withKey(c: Omit<GlanceContent, 'key'>): GlanceContent {
  return { ...c, key: fingerprint(JSON.stringify([c.day, c.state, c.title, c.collapsed, c.expanded])) };
}

/**
 * What the glance says on `day`, from the stored tasks, the closed-day date and the held task ("Hold me to it",
 * the stored contract's taskId, or null). The lines are Today's own rows, in Today's own order, less the finished
 * ones. Shared rows from Ours are not among them (they live outside the task list), which is one reason the copy
 * never calls this "what Today shows". Pure, and `day` may be any moment of that day.
 */
export function buildGlance(tasks: Task[], day: Date, closedISO: string | null, heldId: string | null = null): GlanceContent {
  const iso = toISODate(day);
  const title = t('common.today');
  const open = openInTodaysOrder(tasks, day, heldId);
  const state: GlanceState =
    closedISO === iso ? 'closed' : tasksForToday(tasks, day).length === 0 ? 'empty' : open.length === 0 ? 'done' : 'tasks';
  if (state !== 'tasks') return withKey({ day: iso, state, title, lines: [], more: false, collapsed: '', expanded: '' });
  const titles = open.map((task) => oneLine(task.title));
  const lines = titles.slice(0, GLANCE_MAX_LINES);
  const more = titles.length > lines.length;
  const collapsed = titles.length > 1 ? t('glance.firstAndMore', { title: titles[0] }) : titles[0];
  const expanded = (more ? [...lines, t('glance.andMore')] : lines).join('\n');
  return withKey({ day: iso, state, title, lines, more, collapsed, expanded });
}

// ---- When it may show ----------------------------------------------------------------------------------------

/** The moment at `h`:`m` local on `day`'s calendar date. The Date constructor works from the date and the wall
 *  clock, so a daylight-saving night never shifts it by an hour (a wall time inside a spring-forward gap lands on
 *  the first moment after the gap, on the same date). */
function wallClock(day: Date, h: number, m: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

/** Whether a reminder hour leaves the glance any window at all. The window opens at hour:00 and ends at 21:30,
 *  so an hour of 21 or later leaves none: nothing posts, and Settings shows glanceTooLateLine. */
export function glanceHasWindow(hour: number): boolean {
  return clampHour(hour) < GLANCE_END.hour;
}

/** 21:30 local on `day`: the absolute expiry every glance for that day carries (its data.expiresAtMs). */
export function glanceExpiry(day: Date): Date {
  return wallClock(day, GLANCE_END.hour, GLANCE_END.minute);
}

/** The window on `day`'s date: from hour:00 to 21:30, or null when the hour leaves none. */
export function glanceWindow(day: Date, hour: number): { start: Date; end: Date } | null {
  if (!glanceHasWindow(hour)) return null;
  return { start: wallClock(day, clampHour(hour), 0), end: glanceExpiry(day) };
}

/** Whether `now` is inside its own day's window: from hour:00 (inclusive) to 21:30 (exclusive). */
export function inGlanceWindow(now: Date, hour: number): boolean {
  const w = glanceWindow(now, hour);
  return w !== null && now.getTime() >= w.start.getTime() && now.getTime() < w.end.getTime();
}

/** The first arrival strictly after `after`: today's hour:00 while it is still ahead, else tomorrow's. Null when
 *  the hour leaves no window. Tomorrow is the next calendar date, never `after` plus 24 hours. */
export function nextGlanceArrival(after: Date, hour: number): Date | null {
  const today = glanceWindow(after, hour);
  if (!today) return null;
  if (today.start.getTime() > after.getTime()) return today.start;
  return tomorrowsGlanceArrival(after, hour);
}

/** Hour:00 local on the calendar date after `day`'s: tomorrow's arrival, whether or not the hour leaves a window
 *  (callers check that first). By the calendar, never `day` plus 24 hours. */
export function tomorrowsGlanceArrival(day: Date, hour: number): Date {
  return wallClock(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1), clampHour(hour), 0);
}

export type GlanceArrival = {
  /** When it should arrive: hour:00 local on its day. */
  at: Date;
  /** Its absolute expiry, 21:30 that day (data.expiresAtMs), so a late alarm can never show it past then. */
  expiresAt: Date;
  /** What it will say, worked out now for its day from what is stored. */
  content: GlanceContent;
};

/**
 * The ONE future arrival worth scheduling, worked out on every refresh (the native seam cancels the old arrival,
 * then schedules this): today's hour:00 while it is still ahead, else tomorrow's, each with its own day's content
 * computed now. A day with nothing to show is passed over, because an arrival could only say "nothing". Today's
 * is passed over once today was put away (`dismissedToday`: a swipe, a reboot or an update). Nothing beyond
 * tomorrow is ever planned, because content computed days early is a guess. Null when there is nothing to
 * schedule, which leaves the next app open or write to plan again.
 */
export function planGlanceArrival(o: {
  tasks: Task[];
  now: Date;
  closedISO: string | null;
  heldId: string | null;
  hour: number;
  dismissedToday?: boolean;
}): GlanceArrival | null {
  const first = nextGlanceArrival(o.now, o.hour);
  if (!first) return null;
  const todayIso = toISODate(o.now);
  const candidates = toISODate(first) === todayIso ? [first, nextGlanceArrival(first, o.hour)] : [first];
  for (const at of candidates) {
    if (!at || (o.dismissedToday === true && toISODate(at) === todayIso)) continue;
    const content = buildGlance(o.tasks, at, o.closedISO, o.heldId);
    if (content.state === 'tasks') return { at, expiresAt: glanceExpiry(at), content };
  }
  return null;
}

// ---- Whether today's was put away ----------------------------------------------------------------------------

/**
 * What the native seam knows when it asks whether today's glance was put away. The app cannot see a swipe
 * (Android 14+ lets an unlocked phone swipe even an ongoing notification), a reboot, an app update or a force
 * stop. It can only see that a glance it knows went up is no longer there. On every refresh the seam reads
 * `presented` fresh, keeps the rest between refreshes, and then, in this order: sets `dismissedOn` to today when
 * this says put away, sets `seenAt` to now when today's glance is showing, and sets `postedAt` when it posts.
 * While Android will not show it (notifications or its category off) and nothing is in the shade, the seam forgets
 * `postedAt` and `seenAt` before asking, because the switch that blocked it took it down (lib/glance-refresh).
 * The scheduled arrival is not part of it: an arrival is only ever known to have gone up once a refresh sees it
 * showing (glanceDismissedToday). Switching the glance on, or changing its hour, starts from an empty trail, so the
 * new choice can show at once.
 */
export type GlanceTrail = {
  /** A glance is in the shade right now (getPresentedNotificationsAsync, by GLANCE_ID). */
  presented: boolean;
  /** The day (YYYY-MM-DD) the showing glance's content is for, from its data, when known. One left showing from
   *  an earlier day is not today's, so it counts as not presented here (and glanceAction replaces or removes it). */
  presentedDay?: string | null;
  /** When the app itself last posted it (epoch ms), or null. A post gets GLANCE_SETTLE_MS to land before its
   *  absence counts, because one made with the app open passes through the JS handler first. */
  postedAt: number | null;
  /** The last time a refresh found today's glance showing (epoch ms), or null. It was certainly up then, so its
   *  absence counts at once. This is the only way an arrival counts as having gone up. */
  seenAt?: number | null;
  /** The day (YYYY-MM-DD) a refresh already judged put away. It stays put away until that day ends, whatever is
   *  rescheduled meanwhile: "do not post it again until the next day's arrival". Two things undo it: today's glance
   *  showing after all, because what is in the shade is fact, whatever the verdict was made from, and a post the
   *  foreground handler dropped (lib/glance-refresh's forgetUnlandedGlance), unless today's glance had been seen
   *  showing. */
  dismissedOn?: string | null;
};

function presentedToday(now: Date, trail: GlanceTrail): boolean {
  return trail.presented && (trail.presentedDay == null || trail.presentedDay === toISODate(now));
}

/**
 * Whether today's glance was put away: it went up today, inside today's window, and it is not showing now. That
 * covers a swipe, a reboot, an update or a force stop (for a glance the app knows went up, missing beats wrong), and
 * it stays away until the next day's arrival: once judged (`dismissedOn`) the answer holds for the rest of the day
 * while it stays away. The app's own leave (the day closed, finished or emptied) is NOT put away: when the app takes
 * the glance down it forgets every sign that it went up (lib/glance-refresh's forgetGlanceSigns), so Reopen, an
 * untick or a new task brings it back the same day. Forgetting leaves no stamp, so a clock moved back after a
 * take-down cannot hide later swipes. Today's glance showing always reads as not put away, a verdict included: the
 * shade is the fact, whatever the verdict was made from.
 *
 * "Went up" is only what the app knows reached the shade: seen showing by a refresh (`seenAt`, which counts at once),
 * or posted by the app itself at least GLANCE_SETTLE_MS ago (`postedAt`; a post still landing is not a swipe). A
 * scheduled arrival NEVER counts on its own, whether or not its time has passed and whether or not it is still
 * waiting: an arrival can leave the schedule without ever reaching the shade. Android holds an inexact alarm and can
 * release it during the app's cold start, before anything is listening, and expo-notifications then drops it without
 * a word; a restart can discard one that came due while the phone was off. Read as a swipe, that silence kept the
 * glance away for a whole day (found 2026-11-12: chosen the night before, nothing at the hour, nothing on opening).
 * So an arrival nobody saw counts for nothing, and the next refresh inside the window posts it. The cost, accepted on
 * 2026-11-12: a swipe made before any refresh has seen the glance cannot be told from a lost arrival, so that glance
 * comes back once, at the next refresh, and a second swipe sticks, because by then a refresh has seen it. In practice
 * that is a swipe before the day's first open, or, for one that arrives while the app is already open (no refresh runs
 * for an arrival), a swipe before the next save or return to the app.
 *
 * From 21:30 the answer is no, unless a verdict was already made inside the window: the window's end takes the glance
 * down (its own expiry at 21:30, or a refresh after it), so a glance seen in the evening and gone after 21:30 left with
 * the window, and reading that as a swipe would say "put away" over an ordinary evening. A moment from outside today's
 * window does not count either (a glance left from yesterday, or an hour moved later mid-day), so the window can still
 * open today. An empty trail counts nothing.
 */
export function glanceDismissedToday(now: Date, hour: number, trail: GlanceTrail): boolean {
  if (presentedToday(now, trail)) return false;
  if (trail.dismissedOn != null && trail.dismissedOn === toISODate(now)) return true;
  const w = glanceWindow(now, hour);
  if (w === null) return false;
  const ms = now.getTime();
  if (ms >= w.end.getTime()) return false; // the window's end took it down: a verdict made inside it stands (above)
  const upToday = (at: number | null | undefined, settle: number) =>
    at != null && Number.isFinite(at) && at >= w.start.getTime() && at < w.end.getTime() && at <= ms && ms - at >= settle;
  return upToday(trail.seenAt, 0) || upToday(trail.postedAt, GLANCE_SETTLE_MS);
}

export type GlanceAction = 'post' | 'remove' | 'none';

/**
 * What one refresh does with the glance in the shade, from today's content (buildGlance for `now`), the window,
 * whether today was put away (glanceDismissedToday) and what is showing:
 * - 'post' when it belongs up and is missing or says something else (a re-post replaces it in place).
 * - 'none' when it belongs up and already says exactly this (skip-unchanged), or belongs down and is gone.
 * - 'remove' when something is showing that should not be: the day closed, done or empty, outside the window,
 *   put away for today, or a glance left from another day.
 * `presentedKey` is the key (GlanceContent.key) the showing glance was posted with, from its data, or null.
 */
export function glanceAction(o: {
  content: GlanceContent;
  now: Date;
  hour: number;
  dismissed: boolean;
  presented: boolean;
  presentedKey: string | null;
}): GlanceAction {
  const belongsUp = o.content.state === 'tasks' && o.content.day === toISODate(o.now) && !o.dismissed && inGlanceWindow(o.now, o.hour);
  if (belongsUp) return o.presented && o.presentedKey === o.content.key ? 'none' : 'post';
  return o.presented ? 'remove' : 'none';
}

// ---- Settings copy -------------------------------------------------------------------------------------------

/** 21:30 the way the device writes a time ("9:30 pm" in en-AU, "21:30" in de, fr and it). */
export function glanceEndLabel(): string {
  return formatReminderTime(GLANCE_END.hour, GLANCE_END.minute);
}

/** Settings' hint under the glance choice. Never says "live" and never promises the lock screen. */
export function glanceHint(): string {
  return t('glance.hint', { time: glanceEndLabel() });
}

/** Settings' calm line when the reminder hour leaves the glance no window (21:00 or later). It names the first hour
 *  that is too late (21:00, "9:00 pm"), so the line never reads oddly under "Stays from 9:00 pm". */
export function glanceTooLateLine(): string {
  return t('glance.tooLate', { time: formatReminderTime(GLANCE_END.hour, 0) });
}
