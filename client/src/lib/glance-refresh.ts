// "Today in your notifications" (the glance): the native seam's pure half. Android only, opt-in.
//
// lib/glance decides what the glance says and when it may show. This file turns that into the ONE decision each
// refresh makes (post it, take it down or leave it, which single arrival to schedule next, whether the daily nudge
// must go) and into what the seam keeps between refreshes. lib/reminders only reads the phone, asks planGlanceRefresh,
// carries out the answer and stores settleGlanceMemory's result, so every judgement here is node-tested even though
// the phone half cannot be.
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
  planGlanceArrival,
  type ReminderStyle,
} from './glance';
import { clampHour, GLANCE_ID } from './reminders-types';
import type { Task } from './tasks';

// ---- What the seam keeps between refreshes -------------------------------------------------------------------

/**
 * Stored on the phone (lib/storage), never synced, and never task content: only moments and a day.
 * - `hour`: the reminder hour this memory was kept under. Null means nothing of the glance is set up (never chosen,
 *   or taken down cleanly), which is what lets a refresh for everyone who never chose it skip the phone entirely.
 *   A different hour starts a fresh memory, as switching the glance on does, so a new choice can show at once.
 * - `postedAt`, `seenAt`, `arrivalAt` and `dismissedOn`: the kept half of lib/glance's GlanceTrail. `arrivalAt` is
 *   the one arrival the last refresh scheduled (every refresh cancels the old one and schedules anew). When the app
 *   takes the glance down itself, `postedAt`, `seenAt` and `arrivalAt` are forgotten (forgetGlanceSigns), so its own
 *   leave is never read as a swipe and the glance can come back the same day.
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
 * The arrival the take-down cancelled is always forgotten, so it can never read as fired and missing. A memory with
 * nothing set up (hour null) is returned as it was.
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
  tasks: Task[];
  closedISO: string | null;
  /** The held task ("Hold me to it", the stored contract's taskId), which sits under the pin on Today. */
  heldId: string | null;
  /** The glance showing now (by GLANCE_ID), or null. */
  shown: ShownGlance | null;
  /** The scheduled arrival is still waiting to fire (still among the scheduled requests). */
  arrivalPending: boolean;
  /** The daily nudge is among the scheduled requests. */
  nudgeScheduled: boolean;
  memory: GlanceMemory;
};

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
 * When it belongs, lib/glance decides: whether today's was put away (a swipe, a reboot or an update, never the app's
 * own take-down), what is showing now (`seenAt`), whether to post, replace, take down or leave it
 * (glanceAction), and the single next arrival (planGlanceArrival). The seam then always cancels the old arrival,
 * before it posts, so a late alarm can never land last night's list over a fresh post.
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

  const memory: GlanceMemory = o.memory.hour === hour ? { ...o.memory } : { ...emptyGlanceMemory(), hour };
  const today = toISODate(o.now);
  const presented = o.shown !== null;
  const dismissed = glanceDismissedToday(o.now, hour, {
    presented,
    presentedDay: o.shown?.day ?? null,
    postedAt: memory.postedAt,
    seenAt: memory.seenAt,
    arrival: memory.arrivalAt === null ? null : { at: memory.arrivalAt, pending: o.arrivalPending },
    dismissedOn: memory.dismissedOn,
  });
  // Today's verdict sticks for the rest of today, unless today's glance is showing after all (a delivery that was
  // still on its way when it was judged, lib/glance). An older day's means nothing now, so it is not kept.
  memory.dismissedOn = dismissed ? today : null;
  if (o.shown !== null && (o.shown.day === null || o.shown.day === today)) memory.seenAt = o.now.getTime();

  let action = glanceAction({ content, now: o.now, hour, dismissed, presented, presentedKey: o.shown?.key ?? null });
  if (action === 'post' && !o.permitted) action = 'none';
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
 * Recorded anyway, the next refresh would read it as fired and missing, a swipe, and lose the day. So such an arrival
 * is not recorded (the seam settles it as not scheduled) and the seam asks for a refresh, which finds the window open
 * and posts it itself. One that did fire in time is simply seen showing by that refresh.
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
 * Forget a delivery the handler dropped: the post and the fired arrival both stop counting as "went up today". Being
 * SEEN showing stays, because that was a fact, and so does a future arrival. Today's verdict goes too, unless today's
 * glance was seen showing: nothing posts after a verdict, so a delivery still in the handler when one was made can
 * only have been judged by its own absence. That is the late, inexact arrival that fires as the app opens: the cold
 * open's refresh reads it as fired and missing, and without this its one retry would find the day already put away.
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

// ---- The glance replaces the nudge ---------------------------------------------------------------------------

/**
 * The hour the daily NUDGE should be scheduled at, or null when it must not be: the reminder is off, or the glance
 * is the chosen style and replaces it (never both). For every path that re-arms the nudge from storage: the
 * cold-open sweep in the root layout and the Routines screen's re-arm after "Alarms & reminders".
 */
export function dailyNudgeHour(on: boolean, style: ReminderStyle, hour: number): number | null {
  return on && style === 'nudge' ? clampHour(hour) : null;
}
