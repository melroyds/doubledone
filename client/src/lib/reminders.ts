import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// The retention lever, kept gentle: a daily reminder that OFFERS the day, plus per-task
// "remind me in X hours" nudges (a poke, never a deadline). A thin seam over
// expo-notifications; every call is guarded so the web build (no scheduled local
// notifications) degrades quietly. Native (Android) is the home. The daily reminder and
// the nudges are each cancelled by their own id, never with a blanket cancel-all, so they
// never clobber one another.

const REMINDER_TITLE = 'DoubleDone';
const REMINDER_BODY = 'Your today is here when you are ready.';
const DAILY_ID = 'doubledone-daily'; // fixed id so we cancel only the daily, leaving nudges alone
const DAILY_CHANNEL_ID = 'daily-reminder';
const NUDGE_CHANNEL_ID = 'task-nudge-v2'; // v2 forces a fresh HIGH-importance channel, since Android ignores importance changes to an already-created channel
const NUDGE_BODY = 'Whenever you are ready.';

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

/** Request permission and schedule a calm daily reminder at `hour`. Returns whether it is on. */
export async function enableDailyReminder(hour = 9): Promise<boolean> {
  try {
    // Channel first: on Android 13 the permission prompt does not appear until a channel
    // exists, so creating it before requesting is what lets a first-time user grant.
    await ensureChannel(DAILY_CHANNEL_ID, 'Daily reminder');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_ID,
      content: { title: REMINDER_TITLE, body: REMINDER_BODY },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
        channelId: DAILY_CHANNEL_ID,
      },
    });
    return true;
  } catch {
    return false;
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
 * Schedule a one-time gentle nudge for a today task at `at` (the title is the task itself,
 * the body a calm "whenever you are ready"). Requests permission if needed. Returns the
 * scheduled-notification id (to cancel later when the task is done / removed / deferred),
 * or null if permission is denied or scheduling fails.
 */
export async function scheduleNudge(taskId: string, title: string, at: Date): Promise<string | null> {
  try {
    // Channel first (see enableDailyReminder): the Android 13 permission prompt needs a
    // channel to exist before it will appear. HIGH importance so a requested reminder pops.
    await ensureChannel(NUDGE_CHANNEL_ID, 'Task nudges', Notifications.AndroidImportance.HIGH);
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    // A stable identifier (one nudge per task) plus the SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM
    // permissions from the with-exact-alarm config plugin let expo-notifications use an EXACT
    // alarm. Without them Android 12+ falls back to an inexact alarm that Samsung's Doze can
    // throttle into never firing.
    return await Notifications.scheduleNotificationAsync({
      identifier: `nudge-${taskId}`,
      content: { title, body: NUDGE_BODY, data: { taskId } },
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
