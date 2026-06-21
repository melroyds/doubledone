// Pure scheduling logic for "nudge me in X hours", the today-task re-surface. A nudge is a
// gentle poke, never a deadline, so it is capped to never fire in the small hours and only
// makes sense for today: a target past the evening cutoff (or already passed) yields null,
// and that preset is simply not offered. No side effects here; reminders.ts does the actual
// scheduling. Pure and tested.

export type NudgePreset = { id: string; label: string };

export const NUDGE_CUTOFF_HOUR = 21; // never fire a nudge after 9pm
export const EVENING_HOUR = 18; // "this evening" means 6pm

// The presets offered, in order. One that resolves to null for the current time (would fire
// too late, or already passed) is hidden, so the chooser only ever shows valid options.
export const NUDGE_PRESETS: NudgePreset[] = [
  { id: '1h', label: 'In 1 hour' },
  { id: '3h', label: 'In 3 hours' },
  { id: 'evening', label: 'This evening' },
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
  return NUDGE_PRESETS.filter((p) => nudgeTargetFor(p.id, now) !== null);
}

/** Format a nudge time for the row indicator: "6pm", "9pm", "9:30am". */
export function formatNudgeTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}
