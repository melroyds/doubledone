// "Today in your notifications" (the glance): the native seam's pure half. Android only, opt-in.
//
// lib/glance decides what the glance says and when it may show. This file turns that into the ONE decision each
// refresh makes (post it, take it down or leave it, which single arrival to schedule next, whether the daily nudge
// must go), into what the seam keeps between refreshes, and into the quiet status line Settings shows under the
// choice (glanceStatus), by the same rules. lib/reminders only reads the phone, asks planGlanceRefresh, carries out the
// answer and stores settleGlanceMemory's result, so every judgement here is node-tested even though the phone half
// cannot be.
//
// Also here, because the Kotlin patch and the seam must agree on them: the request a glance is posted with (sticky,
// never auto-dismissed, silent, and the data the patched builder reads), and the verdict on a foreground handler
// that timed out.

import type { NotificationContentInput } from 'expo-notifications';

import { toISODate } from './day';
import {
  buildGlance,
  type GlanceAction,
  glanceAction,
  type GlanceArrival,
  type GlanceContent,
  glanceDismissedToday,
  glanceExpiry,
  glanceHasWindow,
  GLANCE_SETTLE_MS,
  type GlanceTrail,
  glanceWindow,
  inGlanceWindow,
  planGlanceArrival,
  type ReminderStyle,
  tomorrowsGlanceArrival,
} from './glance';
import { t } from './i18n-active';
import { clampHour, formatReminderTime, GLANCE_ID } from './reminders-types';
import type { Task } from './tasks';

// ---- What the seam keeps between refreshes -------------------------------------------------------------------

/**
 * Stored on the phone (lib/storage), never synced, and never task content: only moments and a day.
 * - `hour`: the reminder hour this memory was kept under. Null means nothing of the glance is set up (never chosen,
 *   or taken down cleanly), which is what lets a refresh for everyone who never chose it skip the phone entirely.
 *   A different hour starts a fresh memory, as switching the glance on does, so a new choice can show at once.
 * - `postedAt`, `seenAt` and `dismissedOn`: the kept half of lib/glance's GlanceTrail. When the app takes the glance
 *   down itself, `postedAt` and `seenAt` are forgotten (forgetGlanceSigns), so its own leave is never read as a swipe
 *   and the glance can come back the same day.
 * - `arrivalAt`: the one arrival the last refresh scheduled (every refresh cancels the old one and schedules anew). A
 *   record of what the phone holds, never a sign that the glance went up: an arrival counts only once a refresh has
 *   seen it showing (`seenAt`), because Android can lose one without a word (lib/glance's glanceDismissedToday).
 */
export type GlanceMemory = {
  hour: number | null;
  postedAt: number | null;
  seenAt: number | null;
  arrivalAt: number | null;
  dismissedOn: string | null;
};

/** A fresh, empty memory (a new object each time, so no caller can change another's). */
export function emptyGlanceMemory(): GlanceMemory {
  return { hour: null, postedAt: null, seenAt: null, arrivalAt: null, dismissedOn: null };
}

/**
 * The app took the glance down itself (the day closed, finished or emptied, the window over, an account wipe, or Off
 * when the take-down only half worked): forget every sign that it went up, the post, the sighting and the arrival,
 * so its absence can never read as a swipe and it comes back the same day once it belongs again. The hour stays, so
 * a later refresh can still find what is left of it. Forgetting leaves no stamp, so a clock moved back after a
 * take-down cannot hide later swipes. `dismissedOn` stays here (a swipe already judged today still means not today);
 * the half-done Off and the account wipe decide about it themselves (halfDoneGlanceMemory, wipedGlanceMemory).
 */
export function forgetGlanceSigns(memory: GlanceMemory): GlanceMemory {
  return { ...memory, postedAt: null, seenAt: null, arrivalAt: null };
}

/**
 * The memory after Off (or a change of style) whose take-down only half worked: the hour stays, so the next refresh
 * tries the take-down again, and every sign and any verdict go, so choosing the glance again the same day shows it at
 * once, exactly as after a clean Off (which empties the memory).
 */
export function halfDoneGlanceMemory(memory: GlanceMemory): GlanceMemory {
  return { ...forgetGlanceSigns(memory), dismissedOn: null };
}

/**
 * The memory to keep after an account wipe took the glance down. `before` is what the shade held just before the
 * take-down: the glance's own data (ShownGlance), null when it was not showing, or 'unknown' when the shade could not
 * be read, which counts as showing, because forgetting errs toward showing the glance again, never toward a false
 * swipe.
 * - Showing (or unknown): the app took it down, so every sign is forgotten. A verdict goes too when today's glance was
 *   positively seen showing, because the shade had already overturned it. An unknown shade keeps a verdict, so a
 *   swipe judged today still means not today.
 * - Not showing: its signs stay, so a swipe nobody has judged yet still means not today. The one exception is a post
 *   still landing (younger than GLANCE_SETTLE_MS), which nobody can have swiped: it may land just before the take-down.
 * The arrival the take-down cancelled is always forgotten, because the phone no longer holds it. A memory with nothing
 * set up (hour null) is returned as it was.
 */
export function wipedGlanceMemory(memory: GlanceMemory, before: ShownGlance | null | 'unknown', now: number): GlanceMemory {
  if (memory.hour === null) return { ...memory };
  if (before !== null) {
    const overturned = before !== 'unknown' && (before.day === null || before.day === toISODate(new Date(now)));
    return { ...forgetGlanceSigns(memory), dismissedOn: overturned ? null : memory.dismissedOn };
  }
  const landing = memory.postedAt !== null && now - memory.postedAt >= 0 && now - memory.postedAt < GLANCE_SETTLE_MS;
  return { ...memory, arrivalAt: null, postedAt: landing ? null : memory.postedAt };
}

const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isoDayOrNull = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** The stored memory, read defensively: anything unreadable is an empty memory, field by field. Losing it costs at
 *  most one glance shown again on a day it was put away, never a crash. */
export function parseGlanceMemory(raw: string | null | undefined): GlanceMemory {
  if (!raw) return emptyGlanceMemory();
  try {
    const v: unknown = JSON.parse(raw);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return emptyGlanceMemory();
    const o = v as Record<string, unknown>;
    const hour = finiteOrNull(o.hour);
    return {
      hour: hour === null ? null : clampHour(hour),
      postedAt: finiteOrNull(o.postedAt),
      seenAt: finiteOrNull(o.seenAt),
      arrivalAt: finiteOrNull(o.arrivalAt),
      dismissedOn: isoDayOrNull(o.dismissedOn),
    };
  } catch {
    return emptyGlanceMemory();
  }
}

export function serializeGlanceMemory(memory: GlanceMemory): string {
  return JSON.stringify({
    hour: memory.hour,
    postedAt: memory.postedAt,
    seenAt: memory.seenAt,
    arrivalAt: memory.arrivalAt,
    dismissedOn: memory.dismissedOn,
  });
}

// ---- What a refresh reads back from the shade ----------------------------------------------------------------

/** The glance in the shade right now, as its own data describes it: the day its content is for and its content key.
 *  Either is null when unreadable, and a null day reads as today's (lib/glance's presentedToday). */
export type ShownGlance = { day: string | null; key: string | null };

export function readShownGlance(data: unknown): ShownGlance {
  const d = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return { day: typeof d.day === 'string' ? d.day : null, key: typeof d.key === 'string' ? d.key : null };
}

// ---- The one decision per refresh ----------------------------------------------------------------------------

export type GlanceRefreshInput = {
  now: Date;
  /** The daily reminder is on (Off is reminderOn false, never a style). */
  on: boolean;
  style: ReminderStyle;
  hour: number;
  /** Notifications are allowed, from a quiet check that never prompts. Without it nothing is posted or scheduled,
   *  and nothing is counted as posted, so a refusal is never mistaken for a swipe. */
  permitted: boolean;
  /** The glance's own category is turned off in Android's settings for DoubleDone (its channel's importance is NONE).
   *  Android drops every post to it without a word, so nothing is posted and nothing is counted as posted. Its next
   *  arrival is still scheduled: while the category is off Android drops that too, an arrival nobody saw counts for
   *  nothing, and once the category is back on it comes at the hour without the app being opened first. */
  channelOff: boolean;
  tasks: Task[];
  closedISO: string | null;
  /** The held task ("Hold me to it", the stored contract's taskId), which sits under the pin on Today. */
  heldId: string | null;
  /** The glance showing now (by GLANCE_ID), or null. */
  shown: ShownGlance | null;
  /** The daily nudge is among the scheduled requests. */
  nudgeScheduled: boolean;
  memory: GlanceMemory;
};

/** The memory a judgement reads: the stored one when it was kept under this hour, else a fresh one for this hour. A
 *  different hour is a new choice, so nothing kept under the old one (a sighting, a verdict) counts against it. */
function memoryForHour(memory: GlanceMemory, hour: number): GlanceMemory {
  return memory.hour === hour ? { ...memory } : { ...emptyGlanceMemory(), hour };
}

/** lib/glance's trail, from the kept memory and what the shade shows now. */
function trailOf(memory: GlanceMemory, shown: ShownGlance | null): GlanceTrail {
  return {
    presented: shown !== null,
    presentedDay: shown?.day ?? null,
    postedAt: memory.postedAt,
    seenAt: memory.seenAt,
    dismissedOn: memory.dismissedOn,
  };
}

export type GlanceRefreshPlan = {
  /** What happens to the glance in the shade: post (or replace in place), take it down, or leave it. */
  action: GlanceAction;
  /** Today's content, posted when `action` is 'post'. */
  content: GlanceContent;
  /** The absolute expiry a post now carries: 21:30 today. */
  expiresAt: Date;
  /** The ONE future arrival to schedule once the old arrival is cancelled (every refresh cancels it), or null. */
  arrival: GlanceArrival | null;
  /** The glance is the chosen reminder, so the daily nudge must not run beside it: cancel the one scheduled. */
  cancelNudge: boolean;
  /** What to keep, BEFORE the phone is touched. settleGlanceMemory adds the post and the arrival once each lands. */
  memory: GlanceMemory;
};

/**
 * The whole judgement of one refresh. The glance belongs only when the reminder is on, its style is the glance and
 * the hour leaves a window. Otherwise anything showing comes down, nothing is scheduled and the memory empties.
 * When it belongs, lib/glance decides: whether today's was put away (a glance it knows went up and is gone: a swipe,
 * a reboot or an update, never the app's own take-down, and never an arrival nobody saw), what is showing now
 * (`seenAt`), whether to post, replace, take down or leave it (glanceAction), and the single next arrival
 * (planGlanceArrival). The seam then always cancels the old arrival, before it posts, so a late alarm can never land
 * last night's list over a fresh post. While Android will not show it (notifications off for DoubleDone, or the
 * glance's own category off), nothing is posted, and a glance gone from the shade is never judged: the switch that
 * blocked it also took it down.
 */
export function planGlanceRefresh(o: GlanceRefreshInput): GlanceRefreshPlan {
  const hour = clampHour(o.hour);
  const content = buildGlance(o.tasks, o.now, o.closedISO, o.heldId);
  const expiresAt = glanceExpiry(o.now);
  const chosen = o.on && o.style === 'glance';
  const cancelNudge = chosen && o.nudgeScheduled;
  if (!chosen || !glanceHasWindow(hour)) {
    return { action: o.shown !== null ? 'remove' : 'none', content, expiresAt, arrival: null, cancelNudge, memory: emptyGlanceMemory() };
  }

  const memory = memoryForHour(o.memory, hour);
  const today = toISODate(o.now);
  const presented = o.shown !== null;
  // Android will not show it now. Turning notifications (or the glance's category) off takes a showing glance down, so
  // a glance missing while blocked may have gone with that switch, not a swipe: forget the signs that it went up and
  // make no new verdict, so turned back on the same day it shows again. A verdict already made today stands. (Off and
  // on again with no refresh in between still reads as a swipe: the app cannot see a switch it never looked at.)
  const blocked = !o.permitted || o.channelOff;
  if (blocked && !presented) {
    memory.postedAt = null;
    memory.seenAt = null;
  }
  const dismissed = glanceDismissedToday(o.now, hour, trailOf(memory, o.shown));
  // Today's verdict sticks for the rest of today, unless today's glance is showing after all (the shade is the fact,
  // whatever the verdict was made from, lib/glance). An older day's means nothing now, so it is not kept.
  memory.dismissedOn = dismissed ? today : null;
  if (o.shown !== null && (o.shown.day === null || o.shown.day === today)) memory.seenAt = o.now.getTime();

  let action = glanceAction({ content, now: o.now, hour, dismissed, presented, presentedKey: o.shown?.key ?? null });
  if (action === 'post' && blocked) action = 'none';
  // The next arrival needs only notifications allowed for DoubleDone. With the glance's category off, Android drops it
  // unseen, which counts for nothing (lib/glance), and once the category is back on it comes at the hour by itself.
  const arrival = o.permitted
    ? planGlanceArrival({ tasks: o.tasks, now: o.now, closedISO: o.closedISO, heldId: o.heldId, hour, dismissedToday: dismissed })
    : null;
  // The old arrival is cancelled by every refresh, so it is forgotten here and the new one recorded once it lands.
  memory.arrivalAt = null;
  return { action, content, expiresAt, arrival, cancelNudge, memory };
}

/** The memory to store after the seam carried out `plan`: the post counts only if it went out, and the arrival only
 *  if it was scheduled and will still fire (see glanceArrivalMissed). A take-down (`removed`) is the app's own leave:
 *  every sign that it went up is forgotten (forgetGlanceSigns), so its absence is never read as a swipe. A memory
 *  with nothing chosen stays empty. */
export function settleGlanceMemory(
  plan: GlanceRefreshPlan,
  now: Date,
  done: { posted: boolean; scheduled: boolean; removed?: boolean },
): GlanceMemory {
  if (plan.memory.hour === null) return { ...plan.memory };
  const kept = done.removed === true ? forgetGlanceSigns(plan.memory) : plan.memory;
  return {
    ...kept,
    postedAt: done.posted ? now.getTime() : kept.postedAt,
    arrivalAt: done.scheduled && plan.arrival !== null ? plan.arrival.at.getTime() : null,
  };
}

/**
 * Whether the arrival a refresh just scheduled had already come due by the time the phone took it (`doneAt`, epoch
 * ms, read after the schedule call). expo-notifications drops a date trigger whose moment has passed when it reaches
 * the scheduler, and the call still resolves, so an arrival planned in the last moments before the hour never fires.
 * Nothing would post it until the next open or save, so such an arrival is not recorded (the seam settles it as not
 * scheduled) and the seam asks for a refresh at once, which finds the window open and posts it itself. One that did
 * fire in time is simply seen showing by that refresh. (Recorded, it could no longer lose the day: an arrival counts
 * as having gone up only once a refresh has seen it, lib/glance's glanceDismissedToday.)
 */
export function glanceArrivalMissed(plan: GlanceRefreshPlan, doneAt: number): boolean {
  return plan.arrival !== null && plan.arrival.at.getTime() <= doneAt;
}

// ---- The request a glance is posted and scheduled with -------------------------------------------------------

/**
 * The glance's data payload. `glance: true` is the marker the patched Android builder looks for
 * (patches/expo-notifications+56.0.18.patch): only then does it set only-alert-once, hide the time, take `bigText`
 * as the expanded view and `expiresAtMs` as an absolute expiry. `day` and `key` let a later refresh tell what is
 * showing. `retry` marks the one re-post after a foreground handler timed out, so that one is never retried again.
 */
export type GlanceData = {
  glance: true;
  day: string;
  key: string;
  expiresAtMs: number;
  bigText: string;
  retry?: true;
};

export function glanceData(content: GlanceContent, expiresAt: Date, retry = false): GlanceData {
  const data: GlanceData = { glance: true, day: content.day, key: content.key, expiresAtMs: expiresAt.getTime(), bigText: content.expanded };
  if (retry) data.retry = true;
  return data;
}

/**
 * The notification content for a post or an arrival. Sticky (ongoing), so it sits there, and NOT auto-dismissed,
 * because expo-notifications defaults autoDismiss to true and a tap would then remove it: a tap opens the app and
 * the glance stays. Silent from the content's side too (sound false, no vibration pattern, default priority), on top
 * of its silent channel. The body is the collapsed line, `bigText` the expanded list.
 */
export function glanceRequestContent(content: GlanceContent, expiresAt: Date, retry = false): NotificationContentInput {
  return {
    title: content.title,
    body: content.collapsed,
    sound: false,
    sticky: true,
    autoDismiss: false,
    priority: 'default',
    data: glanceData(content, expiresAt, retry),
  };
}

// ---- A foreground handler that timed out ---------------------------------------------------------------------

/**
 * With the app open, a post or an arrival passes through the JS notification handler, and expo-notifications drops
 * it if the handler has not answered within 3 seconds. Nothing reaches the shade, so its absence must not be read
 * as a swipe. For a glance timeout the answer is 'retry' (forget the delivery, re-post once), or 'forget' when the
 * timed-out post was itself the retry. Null for anything else: another notification, or another kind of error.
 */
export type GlanceTimeoutVerdict = 'retry' | 'forget' | null;

export function glanceTimeoutVerdict(notificationId: string, error: unknown): GlanceTimeoutVerdict {
  if (notificationId !== GLANCE_ID || error === null || typeof error !== 'object') return null;
  const e = error as { code?: unknown; info?: { notification?: { request?: { content?: { data?: unknown } } } } };
  if (e.code !== 'ERR_NOTIFICATION_TIMEOUT') return null;
  const data = e.info?.notification?.request?.content?.data;
  const wasRetry = data !== null && typeof data === 'object' && (data as { retry?: unknown }).retry === true;
  return wasRetry ? 'forget' : 'retry';
}

/**
 * Forget a delivery the handler dropped: the app's own post stops counting as "went up today", and an arrival whose
 * time has come is forgotten with it (an arrival never counts until a refresh sees it, so that changes no verdict).
 * Being SEEN showing stays, because that was a fact, and so does a future arrival. Today's verdict goes too, unless
 * today's glance was seen showing: without a sighting, a verdict can only have come from a post's absence, and a
 * dropped post never landed to be swiped. Its one retry then finds the day open, not put away.
 */
export function forgetUnlandedGlance(memory: GlanceMemory, now: number): GlanceMemory {
  const today = toISODate(new Date(now));
  const seenToday = memory.seenAt !== null && toISODate(new Date(memory.seenAt)) === today;
  return {
    ...memory,
    postedAt: memory.postedAt !== null && memory.postedAt <= now ? null : memory.postedAt,
    arrivalAt: memory.arrivalAt !== null && memory.arrivalAt <= now ? null : memory.arrivalAt,
    dismissedOn: memory.dismissedOn === today && !seenToday ? null : memory.dismissedOn,
  };
}

// ---- The quiet status line in Settings -----------------------------------------------------------------------

/**
 * What the status line under the glance choice says (Settings, Android, only while the glance is the chosen
 * reminder), so a glance that does not show is never silent. Worked out on the device from what the seam keeps and
 * what the shade shows, never sent anywhere. In the order they win:
 * - 'off': Android will not show it. Notifications are off for DoubleDone, or the glance's own category was turned
 *   off (its channel's importance is NONE). The refresh then posts nothing and counts nothing as posted.
 * - 'putAway': today's went up inside its window and is gone, a swipe as far as the app can tell (lib/glance's
 *   glanceDismissedToday), so it is back tomorrow at the hour.
 * - 'showing': inside today's window with something open. It is up, or the refresh every open and every save runs is
 *   putting it up this second, in which case `lookAgain` asks Settings to read the line once more after a post has had
 *   time to land: a post that never landed then reads as 'putAway', and one that failed is tried again by the seam's
 *   own look again, so neither keeps "Showing now." over an empty shade.
 * - 'resting': nothing is coming now. Inside today's window with the day closed, done or empty, and outside it when no
 *   arrival is planned: nothing open before the window opens and nothing for tomorrow either, or after it with nothing
 *   for tomorrow.
 * - 'today': before today's window, with something open today: it comes at the hour.
 * - 'tomorrow': after today's window, or before it with nothing to show today, when tomorrow holds something (an open
 *   task carries over, or one is dated or repeats then): it comes tomorrow at the hour. Never named for a tomorrow that
 *   holds nothing, because no arrival is planned for it (lib/glance's planGlanceArrival), and a promise that does not
 *   come is this feature's worst failure. A task added for it brings the time back at the next look.
 */
export type GlanceStatusKind = 'off' | 'putAway' | 'showing' | 'resting' | 'today' | 'tomorrow';

export type GlanceStatus = {
  kind: GlanceStatusKind;
  /** The one quiet line, in the app's language, with any time in the device's own convention. Never a count. */
  line: string;
  /** Offer the "Alarms & reminders" door under the line (the Routines screen's own, lib/reminders'
   *  openExactAlarmSettings), because the phone may not set exact alarms and the next arrival could come late. Never
   *  while it is 'off': nothing arrives then, on time or late. */
  alarmDoor: boolean;
  /** The line says 'showing' while today's glance is not in the shade yet, so it is still on its way, or it never
   *  lands: Settings reads the line once more a little after GLANCE_SETTLE_MS (once, never again from that read). */
  lookAgain: boolean;
};

export type GlanceStatusInput = {
  now: Date;
  /** The reminder hour: the glance's window opens at hour:00. */
  hour: number;
  /** The seam's stored memory (lib/storage's loadGlanceMemory). */
  memory: GlanceMemory;
  /** The glance in the shade now (found by GLANCE_ID, read with readShownGlance), or null. */
  shown: ShownGlance | null;
  /** The stored tasks and the closed day, as the refresh reads them. */
  tasks: Task[];
  closedISO: string | null;
  /** Notifications are allowed for DoubleDone, from a quiet check that never prompts. */
  permitted: boolean;
  /** The glance's own channel (GLANCE_CHANNEL) has importance NONE: turned off in Android's settings. */
  channelOff: boolean;
  /** Whether the phone lets DoubleDone set exact alarms: true (always below Android 12, and from 12 on once "Alarms &
   *  reminders" is allowed), false when it does not, or null when that cannot be read, which offers the door, as the
   *  Routines screen does wherever it could matter. */
  exactAlarms: boolean | null;
};

/**
 * The status line, by the same rules the refresh runs (the memory kept under this hour, the same put-away verdict,
 * the same window), so it says what the refresh does, even when Settings looks a moment before the refresh has run.
 * Null when the hour leaves no window: the late-hour line (lib/glance's glanceTooLateLine) is the one that speaks then.
 */
export function glanceStatus(o: GlanceStatusInput): GlanceStatus | null {
  const hour = clampHour(o.hour);
  const todays = glanceWindow(o.now, hour);
  if (todays === null) return null;
  if (!o.permitted || o.channelOff) return { kind: 'off', line: t('glance.statusOff'), alarmDoor: false, lookAgain: false };
  const alarmDoor = o.exactAlarms !== true;
  const say = (kind: GlanceStatusKind, line: string, lookAgain = false): GlanceStatus => ({ kind, line, alarmDoor, lookAgain });
  const timeOf = (at: Date) => formatReminderTime(at.getHours(), at.getMinutes());
  const tomorrowAt = tomorrowsGlanceArrival(o.now, hour);
  // Tomorrow's arrival is planned only when tomorrow holds something, so "back tomorrow" is promised only then.
  const tomorrowHasSome = buildGlance(o.tasks, tomorrowAt, o.closedISO).state === 'tasks';
  if (glanceDismissedToday(o.now, hour, trailOf(memoryForHour(o.memory, hour), o.shown))) {
    return tomorrowHasSome
      ? say('putAway', t('glance.statusPutAway', { time: timeOf(tomorrowAt) }))
      : say('putAway', t('glance.statusPutAwayOnly'));
  }
  const somethingOpen = buildGlance(o.tasks, o.now, o.closedISO).state === 'tasks';
  if (inGlanceWindow(o.now, hour)) {
    if (!somethingOpen) return say('resting', t('glance.statusResting'));
    const todaysShowing = o.shown !== null && (o.shown.day === null || o.shown.day === toISODate(o.now));
    return say('showing', t('glance.statusShowing'), !todaysShowing);
  }
  if (somethingOpen && o.now.getTime() < todays.start.getTime()) {
    return say('today', t('glance.statusToday', { time: timeOf(todays.start) }));
  }
  // Tomorrow's arrival is planned only when tomorrow holds something, so its time is named only then.
  if (tomorrowHasSome) {
    return say('tomorrow', t('glance.statusTomorrow', { time: timeOf(tomorrowAt) }));
  }
  return say('resting', t('glance.statusResting'));
}

// ---- The glance replaces the nudge ---------------------------------------------------------------------------

/**
 * The hour the daily NUDGE should be scheduled at, or null when it must not be: the reminder is off, or the glance
 * is the chosen style and replaces it (never both). For every path that re-arms the nudge from storage: the
 * cold-open sweep in the root layout and the Routines screen's re-arm after "Alarms & reminders".
 */
export function dailyNudgeHour(on: boolean, style: ReminderStyle, hour: number): number | null {
  return on && style === 'nudge' ? clampHour(hour) : null;
}
