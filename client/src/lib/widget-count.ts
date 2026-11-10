// The widget.placed count (2026-11-10, with "Today in your notifications"). A paying user asked for today's list to be
// passively there when they pick up the phone, and the home-screen widget is the glance that already exists. How many
// devices carry one, day by day, is the one number that best predicts the demand for both. So: a bare name, at most
// once a day per device, and only when the launcher itself said a DoubleDone widget is on the home screen.
//
// It rides the check the app already makes (widget/presence's hasWidgetPlaced, on Today's open), and only that
// check's real yes. The offer's fail-closed answer ("unknown, so assume placed, and stay quiet") is a guess made to
// avoid an unwanted ask, and counting it would turn every error into a widget. No react-native import: node-tested.

import { toISODate } from './day';
import { claimWidgetCountDay } from './storage';
import { track } from './telemetry';

/**
 * A counter around a once-a-day claim (lib/storage's claimWidgetCountDay on the phone). The first positive check of a
 * local day claims the day and sends the count. Every later one that day stops before storage, so two checks racing on
 * a cold open can never both claim it, and a failed claim (thrown or refused) sends nothing: a missed count beats a
 * doubled one. Resolves true only when the count was sent. Never throws.
 */
export function widgetCounter(claim: (day: string) => Promise<boolean>): (now?: Date) => Promise<boolean> {
  let triedOn: string | null = null;
  return async (now = new Date()) => {
    const day = toISODate(now);
    if (triedOn === day) return false;
    triedOn = day;
    try {
      if (!(await claim(day))) return false;
    } catch {
      return false;
    }
    track('widget.placed');
    return true;
  };
}

/** Count a placed widget, at most once a day on this device. Call it only on the launcher's real yes. */
export const countWidgetPlaced = widgetCounter(claimWidgetCountDay);
