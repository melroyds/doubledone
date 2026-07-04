import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from './i18n-active';
import { type ReminderResult } from './reminders-types';

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
const DAILY_CHANNEL_ID = 'daily-reminder';
const ROUTINE_NUDGE_PREFIX = 'routine-'; // + routineId: one daily nudge per routine, cancellable alone
const NUDGE_CHANNEL_ID = 'task-nudge-v2'; // v2 forces a fresh HIGH-importance channel, since Android ignores importance changes to an already-created channel

// Show notifications even when the app is foregrounded. Without this, expo-notifications
// drops a notification that fires while the app is open (the default), so a reminder set
// and then watched in-app never appears. Calm: a banner in the tray, no sound, no badge,
// matching the offer-not-demand tone. Module scope so it runs once at startup (this is the
// native variant, reminders.web.ts is the web no-op).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
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

/** Request permission and schedule a calm daily reminder at `hour`. Returns ok, or a reason it didn't. */
export async function enableDailyReminder(hour = 9): Promise<ReminderResult> {
  try {
    // Channel first: on Android 13 the permission prompt does not appear until a channel
    // exists, so creating it before requesting is what lets a first-time user grant.
    // The channel NAME localises for new installs only: Android fixes it at creation,
    // and we never bump the channel id just to rename it.
    await ensureChannel(DAILY_CHANNEL_ID, t('settings.reminderLabel'));
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return { ok: false, reason: 'denied' };
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_ID,
      content: { title: t('reminders.dailyTitle'), body: t('reminders.dailyBody') },
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
export async function scheduleRoutineNudge(routineId: string, name: string, hour: number, minute = 0): Promise<ReminderResult> {
  try {
    // Channel first (see enableDailyReminder): the Android 13 permission prompt needs a
    // channel to exist before it will appear.
    await ensureChannel(DAILY_CHANNEL_ID, t('settings.reminderLabel'));
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return { ok: false, reason: 'denied' };
    await Notifications.cancelScheduledNotificationAsync(ROUTINE_NUDGE_PREFIX + routineId);
    await Notifications.scheduleNotificationAsync({
      identifier: ROUTINE_NUDGE_PREFIX + routineId,
      content: { title: name, body: t('reminders.routineNudgeBody') },
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

/** Cancel a scheduled nudge by id. Best effort, never throws. */
export async function cancelNudge(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // best effort
  }
}
