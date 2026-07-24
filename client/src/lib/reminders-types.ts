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

// The notification channel ids, shared here so the pure stale-sweep logic and the native
// scheduling seam agree on them by construction (a drifted string would silently stop the sweep).
export const DAILY_CHANNEL = 'daily-reminder';
export const RHYTHM_CHANNEL = 'rhythm-nudge';
export const TASK_NUDGE_CHANNEL = 'task-nudge-v2';

/**
 * Which delivered (visible-in-the-tray) notifications to dismiss when the app opens.
 * The never-shame rule behind it: a pile of missed reminders reads as a guilt-heap, the exact
 * opposite of what a nudge is for (reported in the wild, 2026-07-24). A Rhythm ("some water")
 * and the daily / routine reminders are OFFERS TO OPEN THE APP, so the moment the app is open
 * they are either honoured or moot; both ways they should vanish quietly. Per-TASK nudges are
 * kept: they point at one specific task and stay actionable while it does.
 * Matched by channel (Android) OR by the stable identifier families (iOS has no channels):
 * `rhythm-*` slots, `routine-*` checklist nudges, and the fixed daily id. Anything
 * unrecognised is kept, never over-dismissed.
 */
export function staleNudgeIdentifiers(presented: { identifier: string; channelId: string | null }[]): string[] {
  return presented
    .filter(
      (n) =>
        n.channelId === RHYTHM_CHANNEL ||
        n.channelId === DAILY_CHANNEL ||
        n.identifier === 'doubledone-daily' ||
        n.identifier.startsWith('rhythm-') ||
        n.identifier.startsWith('routine-'),
    )
    .map((n) => n.identifier);
}

/** Clamp any number to a valid 0-23 hour (rounding), so a corrupt or out-of-range value never schedules nonsense. */
export function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return 9;
  return Math.max(0, Math.min(23, Math.round(hour)));
}

/** Clamp any number to a valid 0-59 minute (rounding), so a corrupt or out-of-range value never schedules nonsense. */
export function clampMinute(minute: number): number {
  if (!Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(59, Math.round(minute)));
}

/** A reminder hour (0-23) as a calm time label in the device's own convention: 9 -> "9:00 am"
 *  (en-AU), "09:00" (fr/it). Matches the nudge chips, which use the same Intl path. */
export function formatReminderHour(hour: number): string {
  const h = clampHour(hour);
  return fmt.time(new Date(2000, 0, 1, h, 0));
}

/** An hour + minute as a calm time label in the device's own convention: (20, 47) -> "8:47 pm"
 *  (en-AU), "20:47" (fr/it). The minute-level sibling of formatReminderHour, same Intl path. */
export function formatReminderTime(hour: number, minute: number): string {
  return fmt.time(new Date(2000, 0, 1, clampHour(hour), clampMinute(minute)));
}

/**
 * Of the given daily slots, the one that fires SOONEST after `now` (a slot exactly at `now`
 * counts as tomorrow, matching a DAILY trigger that has just fired). Pure, for the nudge
 * health line ("next around 7:00 pm"): the OS holds the real schedule, this only picks
 * which slot to name. Returns null for no slots.
 */
export function nextDailySlot(slots: { hour: number; minute: number }[], now: Date): { hour: number; minute: number } | null {
  if (slots.length === 0) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best: { hour: number; minute: number } | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const s of slots) {
    const slotMin = clampHour(s.hour) * 60 + clampMinute(s.minute);
    let delta = (slotMin - nowMin + 1440) % 1440;
    if (delta === 0) delta = 1440;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = { hour: clampHour(s.hour), minute: clampMinute(s.minute) };
    }
  }
  return best;
}
