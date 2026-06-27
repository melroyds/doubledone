// Shared (non-platform) types + copy for the daily reminder. enableDailyReminder used to return a bare
// boolean, collapsing denied / unsupported / transient-error into one silent `false`, so the toggle just
// sprang back to Off with no word. For an RSD-sensitive audience an unexplained refusal reads as the app
// rejecting them, and they will not try again. This carries the REASON so the UI can say one calm thing.

export type ReminderReason = 'denied' | 'unsupported' | 'error';
export type ReminderResult = { ok: true } | { ok: false; reason: ReminderReason };

/** A calm one-line explanation for why turning the reminder on did not work. Never an alarm, never blame. */
export function reminderReasonLine(reason: ReminderReason): string {
  switch (reason) {
    case 'denied':
      return 'Notifications are off for DoubleDone. Turn them on in your settings, then try again.';
    case 'unsupported':
      return "Reminders aren't available on this device.";
    case 'error':
      return "Couldn't set the reminder just now. Try again?";
  }
}

/** Clamp any number to a valid 0-23 hour (rounding), so a corrupt or out-of-range value never schedules nonsense. */
export function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return 9;
  return Math.max(0, Math.min(23, Math.round(hour)));
}

/** A reminder hour (0-23) as a calm 12-hour label: 9 -> "9:00 AM", 0 -> "12:00 AM", 12 -> "12:00 PM", 18 -> "6:00 PM". */
export function formatReminderHour(hour: number): string {
  const h = clampHour(hour);
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}
