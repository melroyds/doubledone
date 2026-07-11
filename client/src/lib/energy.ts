// Energy matching's freemium meter: 15 free picks a calendar month, unlimited on Premium,
// with calm reminders when 10 and then 5 remain. Metered locally against the user's own
// use history (the scrapbook-gate precedent: the count is the user's own local record,
// no server bookkeeping and no account required). Pure and unit-tested; storage.ts
// persists the timestamps and the Today screen renders the lines.

export const ENERGY_FREE_MONTHLY = 15;

// Keep the stored history bounded: everything before last month is irrelevant to the
// meter, and a hard cap means the blob can never grow unbounded.
const MAX_STORED_USES = 60;

export type EnergyGate = {
  allowed: boolean;
  // Picks left this month for a free user; null for premium (unlimited, nothing to count).
  remaining: number | null;
};

function monthStart(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Can an energy match run right now? Free is 15 per calendar month; premium is unlimited. */
export function canMatchEnergy(premium: boolean, used: number[], now: number): EnergyGate {
  if (premium) return { allowed: true, remaining: null };
  const start = monthStart(now);
  const thisMonth = used.filter((t) => t >= start).length;
  const remaining = Math.max(0, ENERGY_FREE_MONTHLY - thisMonth);
  return { allowed: remaining > 0, remaining };
}

/**
 * Whether to show the calm "n of your 15 free picks left" line after a use: exactly at
 * 10 and at 5 remaining (Melroy's spec), never for premium (remaining is null there).
 */
export function shouldWarnEnergy(remaining: number | null): boolean {
  return remaining === 10 || remaining === 5;
}

/** Record a use, keeping only what the meter can ever need (this month + a bounded tail). */
export function recordEnergyUse(used: number[], now: number): number[] {
  const next = [...used, now].filter((t) => Number.isFinite(t));
  next.sort((a, b) => a - b);
  return next.slice(-MAX_STORED_USES);
}
