// Web has no scheduled local notifications, so the daily reminder is a no-op here.
// This platform-specific module exists so the web bundle never imports
// expo-notifications at all: importing it on web initialises a push-token listener
// that logs a benign but noisy "not yet fully supported on web" warning. Native uses
// reminders.ts (the real implementation); Metro resolves this .web.ts on web. The
// export signatures mirror reminders.ts so callers are platform-agnostic.

/** No-op on web: scheduled local reminders are native-only. Always "off". */
export async function enableDailyReminder(): Promise<boolean> {
  return false;
}

/** No-op on web. */
export async function disableDailyReminder(): Promise<void> {
  // nothing to cancel on web
}

/** No-op on web: per-task nudges are native-only (web has no local scheduling). */
export async function scheduleNudge(taskId: string, title: string, at: Date): Promise<string | null> {
  return null;
}

/** No-op on web. */
export async function cancelNudge(id: string): Promise<void> {
  // nothing scheduled on web
}
