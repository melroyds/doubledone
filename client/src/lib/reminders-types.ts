// Shared (non-platform) types + copy for the daily reminder. enableDailyReminder used to return a bare
// boolean, collapsing denied / unsupported / transient-error into one silent `false`, so the toggle just
// sprang back to Off with no word. For an RSD-sensitive audience an unexplained refusal reads as the app
// rejecting them, and they will not try again. This carries the REASON so the UI can say one calm thing.

import { fmt, t } from './i18n-active';

export type ReminderReason = 'denied' | 'unsupported' | 'error';
export type ReminderResult = { ok: true } | { ok: false; reason: ReminderReason };

/** A calm one-line explanation for why turning the reminder on did not work. Never an alarm, never blame. */
export function reminderReasonLine(reason: ReminderReason): string {
  switch (reason) {
    case 'denied':
      return t('reminders.reason.denied');
    case 'unsupported':
      return t('reminders.reason.unsupported');
    case 'error':
      return t('reminders.reason.error');
  }
}

/** Clamp any number to a valid 0-23 hour (rounding), so a corrupt or out-of-range value never schedules nonsense. */
export function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return 9;
  return Math.max(0, Math.min(23, Math.round(hour)));
}

/** A reminder hour (0-23) as a calm time label in the device's own convention: 9 -> "9:00 am"
 *  (en-AU), "09:00" (fr/it). Matches the nudge chips, which use the same Intl path. */
export function formatReminderHour(hour: number): string {
  const h = clampHour(hour);
  return fmt.time(new Date(2000, 0, 1, h, 0));
}
