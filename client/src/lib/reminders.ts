import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { AppState, Linking, Platform } from 'react-native';

import { coalesceRuns } from './coalesce';
import { type GlanceArrival, type GlanceContent, GLANCE_SETTLE_MS } from './glance';
import {
  emptyGlanceMemory,
  forgetUnlandedGlance,
  glanceArrivalMissed,
  glanceRequestContent,
  glanceTimeoutVerdict,
  halfDoneGlanceMemory,
  planGlanceRefresh,
  readShownGlance,
  settleGlanceMemory,
  wipedGlanceMemory,
} from './glance-refresh';
import { DAILY_FOLLOW_UP, escalationTimes, type HoldContract } from './hold';
import { t } from './i18n-active';
import { DAILY_CHANNEL, GLANCE_CHANNEL, GLANCE_ID, nextDailySlot, type ReminderResult, RHYTHM_CHANNEL, staleNudgeIdentifiers, TASK_NUDGE_CHANNEL, slotTimeoutsMs } from './reminders-types';
import { rhythmFireTimes, rhythmSlotId, rhythmSlotIdPrefix, type Routine } from './routines';
import {
  loadClosedDate,
  loadGlanceMemory,
  loadHold,
  loadReminderHour,
  loadReminderOn,
  loadReminderStyle,
  peekTasks,
  saveGlanceMemory,
  subscribeStorageChange,
} from './storage';

export type { ReminderReason, ReminderResult } from './reminders-types';

// The retention lever, kept gentle: a daily reminder that OFFERS the day, plus per-task
// "remind me in X hours" nudges (a poke, never a deadline). A thin seam over
// expo-notifications; every call is guarded so the web build (no scheduled local
// notifications) degrades quietly. Native (Android) is the home. The daily reminder and
// the nudges are each cancelled by their own id, never with a blanket cancel-all, so they
// never clobber one another.

// Notification title/body copy resolves via t() at schedule time, so it follows the device
// locale. The ids below are NOT copy: they are stable identifiers and must never localise.
const DAILY_ID = 'doubledone-daily'; // fixed id so we cancel only the daily, leaving nudges alone
const DAILY_CHANNEL_ID = DAILY_CHANNEL; // shared with the pure stale-sweep logic (reminders-types)
const ROUTINE_NUDGE_PREFIX = 'routine-'; // + routineId: one daily nudge per routine, cancellable alone
const NUDGE_CHANNEL_ID = TASK_NUDGE_CHANNEL; // v2 forces a fresh HIGH-importance channel, since Android ignores importance changes to an already-created channel
// Rhythms get their OWN channel at HIGH importance: a Rhythm is a nudge the user explicitly
// asked for ("water every 2 hours", meds at 8), and on the shared DEFAULT channel it landed
// silently in the tray and was never noticed (the launch-week "I only got one alarm" bug).
// HIGH surfaces a heads-up peek, same posture as the task nudges someone explicitly sets.
// Its own channel also means the user can tune Rhythms alone in system settings.
const RHYTHM_CHANNEL_ID = RHYTHM_CHANNEL;

// Show notifications even when the app is foregrounded. Without this, expo-notifications
// drops a notification that fires while the app is open (the default), so a reminder set
// and then watched in-app never appears. Calm: a banner in the tray, no sound, no badge,
// matching the offer-not-demand tone. Module scope so it runs once at startup (this is the
// native variant, reminders.web.ts is the web no-op).
//
// "Today in your notifications" (GLANCE_ID) is the one exception: a quiet list, never a banner, so it
// goes to the shade only, at default priority. And a glance this handler did not answer within its 3
// seconds never reached the shade at all, so handleError forgets that delivery (its absence must not
// read as a swipe) and posts it once more (onGlanceHandlerError, below).
Notifications.setNotificationHandler({
  handleNotification: async (notification) =>
    notification.request.identifier === GLANCE_ID
      ? {
          shouldShowBanner: false,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        }
      : {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        },
  handleError: (notificationId, error) => onGlanceHandlerError(notificationId, error),
});

// Android 8+ requires a notification channel; without one a scheduled notification can
// silently fail to appear. The daily reminder stays at DEFAULT importance (calm, tray-only,
// in keeping with offer-not-demand). A user-requested "remind me" nudge uses HIGH, so the
// reminder they explicitly asked for actually surfaces instead of sitting silently in the
// tray. No-op off Android.
async function ensureChannel(
  id: string,
  name: string,
  importance: Notifications.AndroidImportance = Notifications.AndroidImportance.DEFAULT,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(id, { name, importance });
}

// Permission for a scheduling call. The interactive path (a user just tapped "add") may
// PROMPT; the quiet path (the app-open resilience sweep) only CHECKS, so an app launch can
// never surprise someone with a permission dialog they did not ask for.
async function hasNotifPermission(quiet: boolean): Promise<boolean> {
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && !quiet) ({ status } = await Notifications.requestPermissionsAsync());
  return status === 'granted';
}

/**
 * Turn the daily reminder on at `hour`, in its stored style. Returns ok, or a reason it didn't.
 *
 * The nudge (everyone's style until they choose otherwise): request permission and schedule one calm notification a
 * day. "Today in your notifications" (the glance, Android only) replaces the nudge, never both, so in that style this
 * brings the glance instead and never arms the nudge. This is the ONE place the nudge is scheduled, so every door that
 * turns the reminder on follows the style without knowing about it: Today's footer link, the rested-screen offer, the
 * welcome, Settings' hour stepper and the cold-open sweep. Settings saves a new style BEFORE it calls this.
 */
export async function enableDailyReminder(hour = 9, opts: { quiet?: boolean } = {}): Promise<ReminderResult> {
  if (GLANCE_AVAILABLE && (await loadReminderStyle()) === 'glance') return enableTodayGlance(opts);
  try {
    // Channel first: on Android 13 the permission prompt does not appear until a channel
    // exists, so creating it before requesting is what lets a first-time user grant.
    // The channel NAME follows the app's language: creating an existing channel again
    // renames it (only its importance, sound and vibration are fixed at first creation),
    // so the id never needs bumping just to rename it.
    await ensureChannel(DAILY_CHANNEL_ID, t('settings.reminderLabel'));
    if (!(await hasNotifPermission(opts.quiet === true))) return { ok: false, reason: 'denied' };
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_ID,
      // The nudge carries its own shelf life (see slotTimeoutsMs): if the phone never opens the
      // app, the notification removes itself from the tray instead of waiting to become guilt.
      content: { title: t('reminders.dailyTitle'), body: t('reminders.dailyBody'), data: { timeoutAfterMs: slotTimeoutsMs([{ hour, minute: 0 }])[0] } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
        channelId: DAILY_CHANNEL_ID,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** No-op on native: local notifications fire by the phone's own clock, so a time zone change needs nothing.
 *  The web half re-sends its push subscription's offset (reminders.web.ts). */
export async function refreshReminderOffset(_hour: number): Promise<void> {}

/** Cancel the daily reminder (only it, never the per-task nudges). Best effort, never throws. */
export async function disableDailyReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
  } catch {
    // best effort
  }
}

/**
 * Request permission and schedule a calm daily nudge for a routine at `hour`:`minute` (the
 * title is the routine's own name, user data, never translated; the body a gentle "when
 * you're ready"). One per routine, keyed by `routine-` + routineId, so re-scheduling
 * replaces and cancelling touches only this routine's nudge. Shares the daily-reminder
 * channel (DEFAULT importance, calm): a routine nudge is an offer, not an alarm. Android
 * delivers these inexactly (see scheduleNudge on exact alarms), so the UI copy says
 * "around", never a to-the-minute promise. Returns ok, or a reason it didn't.
 */
export async function scheduleRoutineNudge(routineId: string, name: string, hour: number, minute = 0, opts: { quiet?: boolean } = {}): Promise<ReminderResult> {
  try {
    // Channel first (see enableDailyReminder): the Android 13 permission prompt needs a
    // channel to exist before it will appear.
    await ensureChannel(DAILY_CHANNEL_ID, t('settings.reminderLabel'));
    if (!(await hasNotifPermission(opts.quiet === true))) return { ok: false, reason: 'denied' };
    await Notifications.cancelScheduledNotificationAsync(ROUTINE_NUDGE_PREFIX + routineId);
    await Notifications.scheduleNotificationAsync({
      identifier: ROUTINE_NUDGE_PREFIX + routineId,
      content: { title: name, body: t('reminders.routineNudgeBody'), data: { timeoutAfterMs: slotTimeoutsMs([{ hour, minute }])[0] } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: DAILY_CHANNEL_ID,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Cancel a routine's daily nudge (only its own, by its stable id). Best effort, never throws. */
export async function cancelRoutineNudge(routineId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ROUTINE_NUDGE_PREFIX + routineId);
  } catch {
    // best effort
  }
}

/**
 * Schedule a Rhythm's gentle recurring nudges: one calm DAILY notification per firing time
 * (from the pure `rhythmFireTimes`: window hours at :00 for an interval Rhythm, exact clock
 * times for a fixed-time / meds Rhythm), each keyed under the `rhythm-{id}-` prefix
 * so cancel can sweep every slot. Title is the Rhythm's own name (user data, never
 * translated), body a gentle "when you're ready". It uses its OWN channel at HIGH importance
 * (a heads-up peek): a Rhythm is a nudge the user explicitly asked for, and at DEFAULT it
 * sat silently in the tray and was never noticed. Android still delivers it INEXACTLY (no
 * USE_EXACT_ALARM, same posture as the other nudges), which is why the copy says "around",
 * never a to-the-minute time. Discrete DAILY triggers, never a raw
 * TIME_INTERVAL, so it can only fire inside the waking window and never overnight. Always
 * cancels first, so a re-save or a shrunk window leaves no orphaned slot firing; a paused
 * Rhythm schedules nothing (honestly silent until resumed). The notification carries NO
 * task-shaped `data`, so a tap just opens the app and can never be misrouted into creating a
 * task. Returns ok, or a reason it didn't.
 */
export async function scheduleRhythm(r: Routine, opts: { quiet?: boolean } = {}): Promise<ReminderResult> {
  try {
    await ensureChannel(RHYTHM_CHANNEL_ID, t('routines.rhythmChannelLabel'), Notifications.AndroidImportance.HIGH);
    if (!(await hasNotifPermission(opts.quiet === true))) return { ok: false, reason: 'denied' };
    await cancelRhythm(r.id); // clear any stale slots first (including ones orphaned by a shrunk window)
    if (r.paused) return { ok: true };
    // rhythmFireTimes is the unified schedule: interval Rhythms yield their window hours at
    // :00 (identical to before), fixed-time Rhythms their exact clock times (the meds shape).
    // Each slot expires the moment its successor fires (slotTimeoutsMs), so a 30-minute water
    // Rhythm can never pile notifications into the tray while the phone sits untouched. This is
    // the closed-app half of "missed nudges never stack"; the app-open sweep is the other.
    const fireTimes = rhythmFireTimes(r);
    const slotTimeouts = slotTimeoutsMs(fireTimes);
    for (const [slotIndex, { hour, minute }] of fireTimes.entries()) {
      await Notifications.scheduleNotificationAsync({
        identifier: rhythmSlotId(r.id, hour, minute),
        content: { title: r.name, body: t('reminders.routineNudgeBody'), data: { timeoutAfterMs: slotTimeouts[slotIndex] } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: RHYTHM_CHANNEL_ID,
        },
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Cancel ALL of a Rhythm's scheduled slots by enumerating the tray and matching the
 * `rhythm-{id}-` prefix. Enumerate-and-cancel (not a single id) so it also removes slots
 * orphaned by an earlier edit that shrank the window, the exact "it kept nagging after I
 * deleted it" failure. Best effort, never throws.
 */
export async function cancelRhythm(routineId: string): Promise<void> {
  try {
    const prefix = rhythmSlotIdPrefix(routineId);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled.filter((n) => n.identifier.startsWith(prefix)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best effort
  }
}

/**
 * Schedule a one-time gentle nudge for a today task at `at` (the title is the task itself,
 * the body a calm "whenever you are ready"). Requests permission if needed. Returns the
 * scheduled-notification id (to cancel later when the task is done / removed / deferred),
 * or null if permission is denied or scheduling fails.
 */
export async function scheduleNudge(taskId: string, title: string, at: Date): Promise<string | null> {
  try {
    // Channel first (see enableDailyReminder): the Android 13 permission prompt needs a
    // channel to exist before it will appear. HIGH importance so a requested reminder pops.
    await ensureChannel(NUDGE_CHANNEL_ID, t('reminders.nudgeChannelName'), Notifications.AndroidImportance.HIGH);
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    // A stable identifier (one nudge per task). The nudge schedules as an INEXACT alarm:
    // USE_EXACT_ALARM is reserved by Play for alarm-clock / calendar apps, which a to-do app is
    // not, so we don't request it (declaring otherwise risks suspension). On aggressive OEMs
    // (Samsung Doze) an inexact nudge can be delayed, acceptable for an offer-not-deadline poke.
    // If reliability ever proves a real problem, the fix is SCHEDULE_EXACT_ALARM behind a one-time
    // user grant, never the ineligible USE_EXACT_ALARM.
    return await Notifications.scheduleNotificationAsync({
      identifier: `nudge-${taskId}`,
      content: { title, body: t('reminders.nudgeBody'), data: { taskId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: NUDGE_CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

/** "Hold me to it" gets its OWN Android channel, so a user can tune the contract's loudness
 *  separately from ordinary nudges without losing either. */
const HOLD_CHANNEL_ID = 'hold-v1';
const HOLD_ID_PREFIX = 'hold-';

/**
 * Schedule the whole contract up front: every same-day step plus the daily 09:30 follow-up.
 * Pre-scheduled rather than chained, because a chain needs the app running at fire time and the
 * point is reaching someone who has not opened it. Idempotent: any previous hold ids are cancelled
 * first, so re-holding (or the resilience sweep) can call this blind. Returns the scheduled ids,
 * or null when permission is denied ({quiet:true} never prompts, for the sweep).
 */
export async function scheduleHold(taskId: string, title: string, heldAt: Date, opts: { quiet?: boolean } = {}): Promise<string[] | null> {
  try {
    await ensureChannel(HOLD_CHANNEL_ID, t('reminders.holdChannelName'), Notifications.AndroidImportance.HIGH);
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && !opts.quiet) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    await cancelHold();
    const ids: string[] = [];
    const steps = escalationTimes(heldAt).filter((d) => d.getTime() > Date.now());
    for (let i = 0; i < steps.length; i++) {
      // The same calm words on every knock (escalation of delivery, never of judgment): the
      // content is IDENTICAL across the ladder, only the arrival repeats.
      ids.push(
        await Notifications.scheduleNotificationAsync({
          identifier: `${HOLD_ID_PREFIX}step-${i}`,
          content: { title, body: t('reminders.holdBody'), data: { taskId } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: steps[i], channelId: HOLD_CHANNEL_ID },
        }),
      );
    }
    ids.push(
      await Notifications.scheduleNotificationAsync({
        identifier: `${HOLD_ID_PREFIX}daily`,
        content: { title, body: t('reminders.holdBody'), data: { taskId } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: DAILY_FOLLOW_UP.hour,
          minute: DAILY_FOLLOW_UP.minute,
          channelId: HOLD_CHANNEL_ID,
        },
      }),
    );
    return ids;
  } catch {
    return null;
  }
}

/** End the contract's notifications, every one of them, by prefix rather than by stored id, so an
 *  id list lost to a storage hiccup can never leave an orphaned daily knock running forever. */
export async function cancelHold(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled.filter((n) => n.identifier.startsWith(HOLD_ID_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // best effort
  }
}

/**
 * The resilience half: re-assert the stored contract against the OS, quietly, once per app open
 * (called beside rescheduleAllNudges). Heals OEM alarm wipes exactly as the sweep does for
 * Rhythms. A null contract still cancels, so a cleared contract can never leave stale knocks.
 */
export async function resyncHold(contract: HoldContract | null): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    if (contract === null) {
      await cancelHold();
      return;
    }
    await scheduleHold(contract.taskId, contract.title, new Date(contract.heldAt), { quiet: true });
  } catch {
    // best effort
  }
}

/** Cancel a scheduled nudge by id. Best effort, never throws. */
export async function cancelNudge(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // best effort
  }
}

/**
 * The nudge resilience sweep, run once per app open (from the root layout): quietly
 * re-schedule every active Rhythm, every checklist nudge, and the daily reminder from
 * their stored config. The OS is supposed to keep schedules alive across reboots and app
 * updates, but aggressive OEM battery managers wipe alarms, and this sweep also migrates
 * existing Rhythms onto their new HIGH-importance channel (Android fixes a channel's
 * importance at creation, so only a re-schedule onto a new channel id can raise it).
 * QUIET throughout: it never prompts for permission, so an app launch can never surprise
 * anyone with a dialog; if permission is missing it simply does nothing. Idempotent
 * (every schedule call cancels its own ids first). Best effort, never throws.
 */
/**
 * Dismiss the stale nudge pile: every DELIVERED Rhythm / daily / routine notification still
 * sitting in the tray when the app opens. They are offers to open the app, and the app is open;
 * left behind they read as a guilt-heap of missed reminders (the never-shame violation a power
 * user reported, 2026-07-24). Per-task nudges are deliberately kept (see staleNudgeIdentifiers).
 * Best effort, never throws; the decision of WHAT to dismiss is pure and tested.
 */
export async function dismissStaleNudges(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const presented = await Notifications.getPresentedNotificationsAsync();
    const shaped = presented.map((n) => ({
      identifier: n.request.identifier,
      channelId: ((n.request.trigger as { channelId?: string } | null)?.channelId ?? (n.request.content as { channelId?: string }).channelId) || null,
    }));
    for (const id of staleNudgeIdentifiers(shaped)) await Notifications.dismissNotificationAsync(id);
  } catch {
    // best effort: a failed sweep just leaves the tray as it was
  }
}

export async function rescheduleAllNudges(routines: Routine[], dailyReminderHour: number | null): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await dismissStaleNudges(); // clear the missed pile FIRST, so re-scheduling never races the sweep
    for (const r of routines) {
      if (r.kind === 'rhythm') {
        if (!r.paused) await scheduleRhythm(r, { quiet: true });
      } else if (r.nudgeHour != null) {
        await scheduleRoutineNudge(r.id, r.name, r.nudgeHour, r.nudgeMinute ?? 0, { quiet: true });
      }
    }
    if (dailyReminderHour != null) await enableDailyReminder(dailyReminderHour, { quiet: true });
  } catch {
    // best effort
  }
}

/**
 * Ground truth for the Routines screen's nudge health line: how many notifications the OS
 * actually has scheduled for this app on THIS device, and the soonest daily slot. This is
 * the debug surface for "the nudge never came": if the count is zero while Rhythms exist,
 * scheduling is the problem; if the count is right and nothing arrives, the OS (battery
 * management) is. Returns zeros on web / on any failure.
 *
 * The glance's next arrival (GLANCE_ID) is not a nudge and is left out: counted, it would hide the
 * Routines "nothing scheduled" warning for anyone who has the glance on.
 */
export async function getNudgeHealth(): Promise<{ count: number; next: { hour: number; minute: number } | null }> {
  try {
    if (Platform.OS === 'web') return { count: 0, next: null };
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier !== GLANCE_ID);
    const slots: { hour: number; minute: number }[] = [];
    for (const n of scheduled) {
      const trig = n.trigger as { hour?: unknown; minute?: unknown } | null;
      if (trig && typeof trig.hour === 'number' && typeof trig.minute === 'number') {
        slots.push({ hour: trig.hour, minute: trig.minute });
      }
    }
    return { count: scheduled.length, next: nextDailySlot(slots, new Date()) };
  } catch {
    return { count: 0, next: null };
  }
}

/**
 * Whether this device gates on-the-dot delivery behind the "Alarms & reminders" special
 * access (Android 12+). expo-notifications arms an alarm EXACTLY only when the OS says
 * canScheduleExactAlarms() (ExpoSchedulingDelegate.setupAlarm); without the grant every
 * trigger is an INEXACT alarm, which Doze defers and releases when the app process wakes,
 * i.e. the field bug "nudges only arrive when I open the app", on battery-unrestricted
 * phones too. Android 12-13 pre-grant the declared permission; 14+ ship it OFF until the
 * user flips the toggle. The grant state is not readable from JS, so the Routines screen
 * offers the door whenever it could matter instead of pretending to know.
 */
export function exactAlarmDoorRelevant(): boolean {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 31;
}

/**
 * Open THIS app's "Alarms & reminders" toggle (the SCHEDULE_EXACT_ALARM special access),
 * falling back to the all-apps list, then plain app settings, so the tap always lands
 * somewhere useful. The returned promise resolves when the user comes BACK from settings
 * (OnActivityResult), which is the caller's hook to re-arm: the cold-start resilience
 * sweep alone would leave alarms inexact until the next full app kill, because granting
 * the access resumes the same process. (Per-task one-off nudges stay outside the sweep by
 * design: they are single-shot and short-lived; the user re-sets one if it mattered.)
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const action = 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM';
  const pkg = Constants.expoConfig?.android?.package;
  try {
    await IntentLauncher.startActivityAsync(action, pkg ? { data: `package:${pkg}` } : undefined);
  } catch {
    try {
      await IntentLauncher.startActivityAsync(action);
    } catch {
      await Linking.openSettings().catch(() => {});
    }
  }
}

// ---- "Today in your notifications" (the glance), Android only --------------------------------------------------
//
// The daily reminder's third choice: today's open tasks, titles only, sitting quietly in the shade from the reminder
// hour until 21:30, never a sound or a buzz, gone when the day is closed, done or empty, and back the next day at the
// hour. It replaces the nudge, never both. lib/glance decides what it says and when, lib/glance-refresh what one
// refresh does; this seam only reads the phone, asks planGlanceRefresh, and carries out the answer.
//
// ONE fixed id (GLANCE_ID) for the posted glance and its scheduled next arrival, so an arrival that fires replaces
// what is showing in place. Refreshes come from the storage change notice (every write of the day, and the
// reminder's own settings), the cold open and the return to the foreground (watchTodayGlance), debounced to one a
// second, never two at once, and in one line with the account wipe's take-down, so nothing they do can interleave.
// Nothing here writes tasks, the closed day, the hold or the reminder settings, so no refresh can set off another.

/**
 * The glance exists on Android 8 (API 26) and later. Below that Android has no notification channels and ignores a
 * notification's expiry, so it could neither be kept silent by its channel nor leave by 9:30 pm on its own, and an
 * arrival with the app never opened would stay up overnight. Those phones, iOS and the web keep exactly the daily
 * reminder they have: wherever this is false, Settings shows the two-way switch and nothing of the glance runs.
 */
export const GLANCE_AVAILABLE: boolean = Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 26;

/** A burst of saves (a cold open's sweeps, a sync merge) makes one refresh, a second after the last. */
const GLANCE_DEBOUNCE_MS = 1000;

// The glance's own channel: DEFAULT importance, because LOW is kept off the lock screen by default on stock Android
// and MIN never shows, with no sound, no vibration, no lights and no badge, so it is silent and never puts a dot on
// the icon. Android fixes importance, sound, vibration and badge when it first creates a channel, so these can only
// change under a new channel id. Created before every post and every schedule: a notification whose channel is
// missing falls back to expo-notifications' own HIGH channel, which pops up and buzzes. Creating it again does rename
// it, so its name follows the app's language from the next refresh, with no new id.
async function ensureGlanceChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(GLANCE_CHANNEL, {
    name: t('glance.channelName'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
    vibrationPattern: null,
    enableLights: false,
    showBadge: false,
  });
}

// One step that may fail without stopping the rest: the next refresh judges again from what it can read.
async function quietly(step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch {
    // best effort
  }
}

/** Post (or replace in place) today's glance now. True once handed to the phone. */
async function postGlance(content: GlanceContent, expiresAt: Date, retry: boolean): Promise<boolean> {
  try {
    await ensureGlanceChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: GLANCE_ID,
      content: glanceRequestContent(content, expiresAt, retry),
      // Presented at once on its own channel. Never a null trigger: with no channel, expo-notifications uses its
      // own HIGH-importance one, which pops up a banner and vibrates.
      trigger: { channelId: GLANCE_CHANNEL },
    });
    return true;
  } catch {
    return false;
  }
}

/** Schedule the one next arrival, its content worked out now for its day, with that day's absolute expiry. */
async function scheduleGlanceArrival(arrival: GlanceArrival): Promise<boolean> {
  try {
    await ensureGlanceChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: GLANCE_ID,
      content: glanceRequestContent(arrival.content, arrival.expiresAt),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: arrival.at, channelId: GLANCE_CHANNEL },
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancel the next arrival and take down what is showing, each tried even if the other fails. True if both went. */
async function takeDownGlance(): Promise<boolean> {
  let ok = true;
  try {
    await Notifications.cancelScheduledNotificationAsync(GLANCE_ID);
  } catch {
    ok = false;
  }
  try {
    await Notifications.dismissNotificationAsync(GLANCE_ID);
  } catch {
    ok = false;
  }
  return ok;
}

// The one line every glance job runs in, so a refresh, the wipe's take-down and a timed-out delivery's forgetting
// never interleave: each reads what the one before it left.
let glanceLine: Promise<void> = Promise.resolve();
function inGlanceLine(job: () => Promise<void>): Promise<void> {
  const run = glanceLine.then(job).catch(() => undefined);
  glanceLine = run;
  return run;
}

let glanceTimer: ReturnType<typeof setTimeout> | null = null;
// Set by a foreground handler timeout, taken by the next refresh: that refresh's post is the one retry.
let glanceRetryNext = false;

// Look again a little later, after anything that changed the shade (a post, a take-down). A post made with the app
// open is still in the JS handler when its refresh ends, and can land after a take-down that came next (Goodnight a
// moment after a change, Off just after picking the glance, an account wipe), which would leave an old list up until
// 9:30 pm, or a deleted account's titles. One more refresh GLANCE_SETTLE_MS later sees what really landed and puts it
// right. A look again books none of its own, so it can never turn into a loop.
let glanceLookAgainTimer: ReturnType<typeof setTimeout> | null = null;
let glanceLookingAgain = false;
function lookAgainLater(): void {
  if (glanceLookAgainTimer !== null) clearTimeout(glanceLookAgainTimer);
  glanceLookAgainTimer = setTimeout(() => {
    glanceLookAgainTimer = null;
    glanceLookingAgain = true;
    refreshTodayGlance();
  }, GLANCE_SETTLE_MS);
}

/**
 * One refresh: read what is stored and what the phone shows, ask planGlanceRefresh, carry it out, remember the
 * result. Reads never write, and the only write is the glance's own memory, which tells no change notice.
 */
async function runGlanceRefresh(): Promise<void> {
  if (!GLANCE_AVAILABLE) return;
  const retry = glanceRetryNext;
  glanceRetryNext = false;
  const lookingAgain = glanceLookingAgain;
  glanceLookingAgain = false;
  const [on, style, hour, memory] = await Promise.all([loadReminderOn(), loadReminderStyle(), loadReminderHour(), loadGlanceMemory()]);
  if (!(on && style === 'glance')) {
    // Not the chosen reminder. If nothing of it was ever set up, or it was taken down cleanly, there is nothing to
    // touch: that is every Android user who never chose it, on every save. Otherwise take it down, and forget it
    // only once that worked, so a failed take-down is tried again next time. A look again takes it down even when it
    // was forgotten, because a post still in the handler can land after the take-down that forgot it.
    if (memory.hour === null && !lookingAgain) return;
    if (await takeDownGlance()) await saveGlanceMemory(emptyGlanceMemory());
    // Half done: keep the hour, so the next refresh tries the take-down again, but forget every sign it went up and
    // any verdict, so choosing it again today shows it at once rather than reading the old sighting as a swipe.
    else if (memory.hour !== null) await saveGlanceMemory(halfDoneGlanceMemory(memory));
    if (!lookingAgain) lookAgainLater();
    return;
  }
  const tasks = await peekTasks();
  if (tasks === null) return; // a failed read keeps what is showing, rather than drawing a day it does not know
  const [closedISO, hold, permission, presented, scheduled] = await Promise.all([
    loadClosedDate(),
    loadHold(),
    Notifications.getPermissionsAsync(),
    Notifications.getPresentedNotificationsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const now = new Date();
  const showing = presented.find((n) => n.request.identifier === GLANCE_ID);
  const plan = planGlanceRefresh({
    now,
    on,
    style,
    hour,
    permitted: permission.status === 'granted',
    tasks,
    closedISO,
    heldId: hold?.taskId ?? null,
    shown: showing ? readShownGlance(showing.request.content.data) : null,
    arrivalPending: scheduled.some((n) => n.identifier === GLANCE_ID),
    nudgeScheduled: scheduled.some((n) => n.identifier === DAILY_ID),
    memory,
  });
  // The first time anything of it is set up, its marker (memory.hour) is stored BEFORE anything is posted, so a
  // refresh cut off half way still leaves what a later Off needs to find it and take it down.
  if (memory.hour === null && plan.memory.hour !== null) await saveGlanceMemory(plan.memory);
  if (plan.cancelNudge) await quietly(() => Notifications.cancelScheduledNotificationAsync(DAILY_ID));
  // Every refresh replaces the one arrival, and cancels the old one FIRST, before anything is posted, so a late
  // alarm can never land last night's list over the post below.
  await quietly(() => Notifications.cancelScheduledNotificationAsync(GLANCE_ID));
  let posted = false;
  // A take-down is the app's own leave (the day closed, finished or emptied, the window over), never a swipe: settling
  // it forgets every sign the glance went up, so it comes back the same day once it belongs again.
  const removed = plan.action === 'remove';
  if (removed) await quietly(() => Notifications.dismissNotificationAsync(GLANCE_ID));
  else if (plan.action === 'post') posted = await postGlance(plan.content, plan.expiresAt, retry);
  const scheduledNext = plan.arrival !== null && (await scheduleGlanceArrival(plan.arrival));
  // An arrival planned in the last moments before the hour can reach the phone after it, and is then dropped unfired
  // while the call still succeeds (glanceArrivalMissed): never record it, and refresh, so the app posts it itself.
  const missed = scheduledNext && glanceArrivalMissed(plan, Date.now());
  await saveGlanceMemory(settleGlanceMemory(plan, now, { posted, scheduled: scheduledNext && !missed, removed }));
  if (missed) refreshTodayGlance();
  if ((posted || plan.action === 'remove') && !lookingAgain) lookAgainLater();
}

// Runs never overlap and a burst books exactly one more (lib/coalesce), inside the one line.
const refreshGlanceInLine = coalesceRuns(() => inGlanceLine(runGlanceRefresh));

/** Ask for a refresh of the glance: one runs a second after the last ask. Safe to call from anywhere, any number of
 *  times. Does nothing wherever the glance is not available (GLANCE_AVAILABLE). */
export function refreshTodayGlance(): void {
  if (!GLANCE_AVAILABLE) return;
  if (glanceTimer !== null) clearTimeout(glanceTimer);
  glanceTimer = setTimeout(() => {
    glanceTimer = null;
    void refreshGlanceInLine();
  }, GLANCE_DEBOUNCE_MS);
}

/**
 * Keep the glance true for the life of the app: a refresh now (the cold open), on every storage change notice (every
 * write path of the day, and the reminder's own settings), and each time the app returns to the foreground. An
 * account wipe takes it down explicitly, the arrival that holds task titles included, and looks again a little later
 * for a post that was still on its way. For the root layout, once. Returns the unsubscribe. A no-op wherever the
 * glance is not available (GLANCE_AVAILABLE).
 */
export function watchTodayGlance(): () => void {
  if (!GLANCE_AVAILABLE) return () => {};
  refreshTodayGlance();
  const unsubscribe = subscribeStorageChange((change) => {
    if (change === 'wipe') {
      void inGlanceLine(async () => {
        // What the shade held just before the take-down decides what is forgotten (lib/glance-refresh's
        // wipedGlanceMemory): a showing glance, or an unreadable shade, loses its signs; a swiped one, not yet judged,
        // keeps them; the arrival just cancelled always goes.
        const before = await Notifications.getPresentedNotificationsAsync().then(
          (all) => {
            const showing = all.find((n) => n.request.identifier === GLANCE_ID);
            return showing ? readShownGlance(showing.request.content.data) : null;
          },
          () => 'unknown' as const,
        );
        await takeDownGlance();
        const memory = await loadGlanceMemory();
        if (memory.hour !== null) await saveGlanceMemory(wipedGlanceMemory(memory, before, Date.now()));
        lookAgainLater();
      });
    } else {
      refreshTodayGlance();
    }
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') refreshTodayGlance();
  });
  return () => {
    unsubscribe();
    appState.remove();
  };
}

/**
 * Turn the glance on, from Settings' "Stays from {time} until done", and from enableDailyReminder whenever the glance is
 * the stored style (Today's footer link, the offers, the hour stepper): create its channel first (Android 13 shows the
 * permission prompt only once a channel exists), ask for permission (never with `quiet`), and cancel the nudge, which
 * the glance replaces. The caller saves the style ('glance') and the switch (on) as with the nudge, and those saves
 * bring the glance up through the change notice. Returns ok, or the reason it could not.
 */
export async function enableTodayGlance(opts: { quiet?: boolean } = {}): Promise<ReminderResult> {
  if (!GLANCE_AVAILABLE) return { ok: false, reason: 'unsupported' };
  try {
    await ensureGlanceChannel();
    if (!(await hasNotifPermission(opts.quiet === true))) return { ok: false, reason: 'denied' };
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
    refreshTodayGlance();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Take the glance down at once (what is showing, and the next arrival) and forget its memory, then look again a
 *  little later for a post that was still on its way. Saving the style or the switch does this too, a second later,
 *  through the change notice. Never throws. */
export async function disableTodayGlance(): Promise<void> {
  if (!GLANCE_AVAILABLE) return;
  await inGlanceLine(async () => {
    if (await takeDownGlance()) await saveGlanceMemory(emptyGlanceMemory());
    else {
      // Half done: as in the refresh, keep the hour for a retry, forget the signs and any verdict.
      const memory = await loadGlanceMemory();
      if (memory.hour !== null) await saveGlanceMemory(halfDoneGlanceMemory(memory));
    }
    lookAgainLater();
  });
}

/**
 * The foreground handler's error hook (setNotificationHandler, at the top). A glance it did not answer in time was
 * dropped before reaching the shade: forget that delivery, in line, so its absence is never read as a swipe, then
 * post once more, unless the one dropped was already that retry.
 */
function onGlanceHandlerError(notificationId: string, error: unknown): void {
  if (!GLANCE_AVAILABLE) return;
  const verdict = glanceTimeoutVerdict(notificationId, error);
  if (verdict === null) return;
  void inGlanceLine(async () => {
    await saveGlanceMemory(forgetUnlandedGlance(await loadGlanceMemory(), Date.now()));
  });
  if (verdict === 'retry') {
    glanceRetryNext = true;
    refreshTodayGlance();
  }
}
