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
