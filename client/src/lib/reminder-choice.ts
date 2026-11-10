// Android's daily reminder as one choice of three (2026-11-10, "Today in your notifications"): Off, a nudge at the
// hour, or the glance, which stays in the notifications from the hour until the day is done (lib/glance). Settings
// draws the three. This file decides what a pick does, in what order, so the order is node-tested: the screen hands in
// the real savers and the native seam (lib/reminders), the tests a fake that records every step.
//
// The rules (the decided spec):
// - Off is the stored switch (reminderOn false), never a style. The glance replaces the nudge, never both, and Off
//   cancels both.
// - What is STORED changes before the phone does. The glance's refresh (lib/reminders) and enableDailyReminder both
//   read the stored choice, so a refresh already on its way either reads the new one or, before a nudge is armed, has
//   finished (disableTodayGlance waits for it in the glance's one line). None can cancel the nudge armed a moment
//   later, and enableDailyReminder arms the nudge, not the glance, because 'nudge' is already stored.
// - A pick that cannot go through (permission refused, an error) leaves everything as it was, and Settings says why
//   in one calm line, as the switch always has.
// - The counts (lib/telemetry): glance.on when the glance is picked and took, glance.off when it was the reminder and
//   the pick moved away from it. Bare names, never the hour.
//
// Pure apart from track(), and no react-native import, so node-tested.

import { glanceHasWindow, glanceHint, glanceTooLateLine, type ReminderStyle } from './glance';
import { t } from './i18n-active';
import { formatReminderHour, type ReminderReason, type ReminderResult } from './reminders-types';
import { track } from './telemetry';

/** The row's one choice: Off, or on in one of the two styles. */
export type ReminderChoice = 'off' | ReminderStyle;

/** What is stored: the switch and the style (lib/storage's reminderOn and reminderStyle). */
export type ReminderState = { on: boolean; style: ReminderStyle };

/** The choice a stored state reads as. A style kept while the reminder is off reads as Off. */
export function reminderChoiceOf(state: ReminderState): ReminderChoice {
  return state.on ? state.style : 'off';
}

export type ReminderOption = { value: ReminderChoice; label: string; sub?: string };

/** The three, in the order the row reads: Off, the nudge, the glance. The hour sits in both labels, so they follow
 *  the stepper. Exactly one is ever checked, which the web's radio group needs to stay reachable by Tab. */
export function reminderOptions(hour: number): ReminderOption[] {
  const time = formatReminderHour(hour);
  return [
    { value: 'off', label: t('common.off') },
    { value: 'nudge', label: t('glance.optionNudge', { time }), sub: t('glance.optionNudgeSub') },
    { value: 'glance', label: t('glance.optionGlance', { time }), sub: t('glance.optionGlanceSub') },
  ];
}

/** The line under the hour while the glance is chosen: when it leaves and what the lock screen depends on, or, from
 *  9 pm, where it has no window at all, a calm ask for an earlier time. */
export function glanceSettingsLine(hour: number): string {
  return glanceHasWindow(hour) ? glanceHint() : glanceTooLateLine();
}

/** What a pick touches. Settings passes the real ones: the savers from lib/storage, and from lib/reminders
 *  enableDailyReminder (which reads the stored style), enableTodayGlance, disableDailyReminder and disableTodayGlance. */
export type ReminderChoiceSteps = {
  saveOn: (on: boolean) => Promise<void>;
  saveStyle: (style: ReminderStyle) => Promise<void>;
  enableNudge: (hour: number, opts?: { quiet?: boolean }) => Promise<ReminderResult>;
  enableGlance: () => Promise<ReminderResult>;
  disableNudge: () => Promise<void>;
  disableGlance: () => Promise<void>;
};

/** Where a pick left things: the state to show, and the reason it could not go through, or null. */
export type ReminderChoiceOutcome = ReminderState & { reason: ReminderReason | null };

/**
 * One pick at a time: the runner returned starts a job only when none is going through, and drops one asked for
 * meanwhile (a second tap while the first pick waits on the phone or a permission prompt), rather than queueing it to
 * run later against a choice that has moved on. It always settles and never throws: a job's failure is swallowed and
 * frees the runner. Held once per screen (useState's initialiser), as the hour stepper's re-applier is.
 */
export function onePickAtATime(): (job: () => Promise<void>) => Promise<boolean> {
  let busy = false;
  return async (job) => {
    if (busy) return false;
    busy = true;
    try {
      await job();
    } catch {
      // nothing a pick can do throws by design (every step answers or swallows); a surprise must not lock the row
    } finally {
      busy = false;
    }
    return true;
  };
}

/**
 * Carry out a pick of `next` from the stored `prev` at `hour`. Null when `next` is already the choice: a radio tapped
 * again changes nothing. The steps run one after another, in this order:
 * - Off: store the switch off, then cancel the nudge and take the glance down.
 * - The nudge: store the style, take the glance down (waiting out any refresh on its way), then arm the nudge.
 * - The glance: store the style, then turn the glance on (its channel, the permission, the nudge cancelled).
 * Then store the switch on. On a failure the style goes back to what it was, and a nudge that was the reminder is
 * re-armed quietly, because a refresh that ran while the permission prompt was up may have cancelled it. A glance that
 * was the reminder comes back by itself, through the restored style's change notice.
 */
export async function applyReminderChoice(
  prev: ReminderState,
  next: ReminderChoice,
  hour: number,
  steps: ReminderChoiceSteps,
): Promise<ReminderChoiceOutcome | null> {
  // A snapshot, taken before any step runs: whatever `prev` is a view of, the steps below change what is stored.
  const { on: wasOn, style: wasStyle } = prev;
  const was = reminderChoiceOf({ on: wasOn, style: wasStyle });
  if (next === was) return null;

  if (next === 'off') {
    await steps.saveOn(false);
    await steps.disableNudge();
    await steps.disableGlance();
    track('reminder.disabled');
    if (was === 'glance') track('glance.off');
    return { on: false, style: wasStyle, reason: null };
  }

  await steps.saveStyle(next);
  if (next === 'nudge') await steps.disableGlance();
  const result = next === 'glance' ? await steps.enableGlance() : await steps.enableNudge(hour);
  if (!wasOn) track('reminder.enabled', { granted: result.ok, style: next });
  if (!result.ok) {
    await steps.saveStyle(wasStyle);
    if (wasOn && wasStyle === 'nudge') await steps.enableNudge(hour, { quiet: true });
    return { on: wasOn, style: wasStyle, reason: result.reason };
  }
  await steps.saveOn(true);
  if (next === 'glance') track('glance.on');
  else if (was === 'glance') track('glance.off');
  return { on: true, style: next, reason: null };
}
