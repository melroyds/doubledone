import * as Notifications from 'expo-notifications';

// The retention lever, kept gentle: one daily reminder that OFFERS the day, never
// demands it (demand-avoidance safe). A thin seam over expo-notifications; every
// call is guarded so the web build (where scheduled local notifications are not
// supported) degrades quietly instead of throwing. Native (Android) is the home.

const REMINDER_TITLE = 'DoubleDone';
const REMINDER_BODY = 'Your today is here when you are ready.';

/** Request permission and schedule a calm daily reminder at `hour`. Returns whether it is on. */
export async function enableDailyReminder(hour = 9): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title: REMINDER_TITLE, body: REMINDER_BODY },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 },
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancel the daily reminder. Best effort, never throws. */
export async function disableDailyReminder(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // best effort
  }
}
