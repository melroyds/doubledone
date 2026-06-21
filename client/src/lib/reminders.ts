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
const NUDGE_CHANNEL_ID = 'task-nudge';
const NUDGE_BODY = 'Whenever you are ready.';

// Android 8+ requires a notification channel; without one a scheduled notification can
// silently fail to appear. Importance DEFAULT shows it calmly in the tray, not as a
// heads-up pop, in keeping with offer-not-demand. No-op off Android.
async function ensureChannel(id: string, name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(id, {
    name,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Request permission and schedule a calm daily reminder at `hour`. Returns whether it is on. */
export async function enableDailyReminder(hour = 9): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;
    await ensureChannel(DAILY_CHANNEL_ID, 'Daily reminder');
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
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    await ensureChannel(NUDGE_CHANNEL_ID, 'Task nudges');
    return await Notifications.scheduleNotificationAsync({
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
