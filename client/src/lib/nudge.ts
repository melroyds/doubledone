// Pure scheduling logic for "nudge me in X hours", the today-task re-surface. A nudge is a
// gentle poke, never a deadline, so it is capped to never fire in the small hours and only
// makes sense for today: a target past the evening cutoff (or already passed) yields null,
// and that preset is simply not offered. No side effects here; reminders.ts does the actual
// scheduling. Pure and tested.

import { fmt, t } from './i18n-active';

export type NudgePreset = { id: string; label: string };

export const NUDGE_CUTOFF_HOUR = 21; // never fire a nudge after 9pm
export const EVENING_HOUR = 18; // "this evening" means 6pm

// The presets offered, in order (labels resolve per-locale at call time, in
// availableNudgePresets). One that resolves to null for the current time (would fire
// too late, or already passed) is hidden, so the chooser only ever shows valid options.
const PRESET_DEFS = [
  { id: '1h', labelKey: 'reminders.presetOneHour' },
  { id: '3h', labelKey: 'reminders.presetThreeHours' },
  { id: 'evening', labelKey: 'reminders.presetEvening' },
];

const HOUR_MS = 3_600_000;

/** Cap a target to the evening cutoff, and require it to still be in the future today. */
function clamp(target: Date, now: Date): Date | null {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), NUDGE_CUTOFF_HOUR, 0, 0, 0);
  const capped = target.getTime() > cutoff.getTime() ? cutoff : target;
  if (capped.getTime() <= now.getTime()) return null; // already passed (e.g. it is late)
  if (capped.getDate() !== now.getDate() || capped.getMonth() !== now.getMonth()) return null; // a poke is a today thing
  return capped;
}

/** The target fire-time for a preset, or null if it cannot sensibly fire today. */
export function nudgeTargetFor(presetId: string, now: Date): Date | null {
  if (presetId === '1h') return clamp(new Date(now.getTime() + HOUR_MS), now);
  if (presetId === '3h') return clamp(new Date(now.getTime() + 3 * HOUR_MS), now);
  if (presetId === 'evening') {
    return clamp(new Date(now.getFullYear(), now.getMonth(), now.getDate(), EVENING_HOUR, 0, 0, 0), now);
  }
  return null;
}

/** Which presets can fire right now (the rest are hidden so the chooser stays honest). */
export function availableNudgePresets(now: Date): NudgePreset[] {
  return PRESET_DEFS.filter((p) => nudgeTargetFor(p.id, now) !== null).map((p) => ({
    id: p.id,
    label: t(p.labelKey),
  }));
}

/** Format a nudge time for the row indicator, per locale: "6:00 pm", "9:30 am". */
export function formatNudgeTime(ms: number): string {
  return fmt.time(new Date(ms));
}

/** The evening wind-down window: 6pm onward, the calm time to close the day. Drives an
 *  in-app nudge toward the close-the-day ritual (never a notification, no new setting).
 *  Pure; the screen gates a gentle line on it. */
export function isWindDownTime(now: Date): boolean {
  return now.getHours() >= EVENING_HOUR;
}
