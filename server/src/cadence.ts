// Server-side cadence check for the MCP `list_today` tool. A recurring task's "is it due
// today" needs day-of-week / interval math that PostgREST can't express, so v1 of the MCP
// server excluded recurring tasks entirely. This ports the CLIENT's isDueOn logic (see
// client/src/lib/recurrence.ts + today.ts) to the Worker so an agent sees the same Today
// the user does: a recurring task appears when it is due today AND not yet done today AND
// not skipped today. Pure and unit-tested; the tool does the fetch and formatting.
//
// Dates are ISO 'YYYY-MM-DD' strings, compared as UTC calendar days (the MCP server derives
// "today" from `new Date().toISOString().slice(0,10)`, also UTC, so the two agree). This is
// the same simplification the one-off `due` filter already uses.

export type Recurrence =
  | { kind: 'none' }
  | { kind: 'daily'; start?: string }
  | { kind: 'weekly'; weekdays: number[]; start?: string } // 0=Sun .. 6=Sat
  | { kind: 'interval'; days: number; anchor: string };

/** Milliseconds at UTC midnight of an ISO date, or NaN if unparseable. */
function isoToUtcMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Whole days from `aIso` to `bIso` (b - a). NaN if either is unparseable. */
export function daysBetween(aIso: string, bIso: string): number {
  const a = isoToUtcMs(aIso);
  const b = isoToUtcMs(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** Day of week for an ISO date, 0=Sun .. 6=Sat (UTC), or -1 if unparseable. */
export function dayOfWeek(iso: string): number {
  const ms = isoToUtcMs(iso);
  return Number.isNaN(ms) ? -1 : new Date(ms).getUTCDay();
}

// A daily/weekly recurrence can start in the future; before its start the task is not yet
// tracked. No start = tracked from creation (mirrors the client's startedBy).
function startedBy(start: string | undefined, todayIso: string): boolean {
  if (start == null) return true;
  const diff = daysBetween(start, todayIso);
  return !Number.isNaN(diff) && diff >= 0;
}

/** Is a recurrence due on `todayIso`? Mirrors client/src/lib/recurrence.ts isDueOn for the
 *  recurring kinds (the MCP list is recurring-only; one-offs are handled by the SQL query). */
export function isDueOn(r: Recurrence, todayIso: string): boolean {
  switch (r.kind) {
    case 'daily':
      return startedBy(r.start, todayIso);
    case 'weekly':
      return r.weekdays.includes(dayOfWeek(todayIso)) && startedBy(r.start, todayIso);
    case 'interval': {
      if (!(r.days > 0)) return false;
      const diff = daysBetween(r.anchor, todayIso);
      return !Number.isNaN(diff) && diff >= 0 && diff % r.days === 0;
    }
    case 'none':
      return false;
  }
}

/** Narrow an unknown value (a JSONB column) to a Recurrence, or null. Defensive: a
 *  malformed row must never throw or wrongly surface a task. */
export function asRecurrence(v: unknown): Recurrence | null {
  if (v == null || typeof v !== 'object') return null;
  const r = v as { kind?: unknown; weekdays?: unknown; days?: unknown; anchor?: unknown; start?: unknown };
  if (r.kind === 'daily') return { kind: 'daily', start: typeof r.start === 'string' ? r.start : undefined };
  if (r.kind === 'weekly' && Array.isArray(r.weekdays) && r.weekdays.every((d) => typeof d === 'number')) {
    return { kind: 'weekly', weekdays: r.weekdays as number[], start: typeof r.start === 'string' ? r.start : undefined };
  }
  if (r.kind === 'interval' && typeof r.days === 'number' && typeof r.anchor === 'string') {
    return { kind: 'interval', days: r.days, anchor: r.anchor };
  }
  return null; // 'none' or anything unrecognised is not a recurring task
}

/** The whole rule for the MCP list: a recurring task belongs on today's list when it is due
 *  today, not already ticked today, and not skipped today. `completed`/`skipped` are the
 *  task's completed_dates / skipped_dates JSONB arrays (ISO days). */
export function recurringDueToday(
  recurrence: unknown,
  completed: unknown,
  skipped: unknown,
  todayIso: string,
): boolean {
  const r = asRecurrence(recurrence);
  if (!r) return false;
  if (!isDueOn(r, todayIso)) return false;
  const done = Array.isArray(completed) && completed.includes(todayIso);
  const skip = Array.isArray(skipped) && skipped.includes(todayIso);
  return !done && !skip;
}

// The `repeat` object an MCP agent sends on add_task / update_task. Its own vocabulary
// (agent-facing, stable) is looser than the internal Recurrence: 'every_n_days' instead of
// 'interval', a `days` count instead of an anchor, an optional `start`. buildRecurrence is
// the one place that translates it, mirroring the client's scheduleFields so a task an agent
// makes and a task the app makes can never drift in shape.
export type RepeatSpec = {
  kind?: unknown;
  weekdays?: unknown;
  days?: unknown;
  start?: unknown;
};

/** ISO 'YYYY-MM-DD' shape check (a real calendar day, parseable by isoToUtcMs). */
function isIsoDay(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(daysBetween(v, v));
}

/** Map an agent's `repeat` object to an internal Recurrence, relative to `todayIso`, or null
 *  if it is malformed. Mirrors client/src/lib/recurrence.ts scheduleFields exactly:
 *  daily/weekly carry a `start` (defaulting to today), every_n_days becomes an interval
 *  anchored at `start ?? today`. Returning null (never throwing) lets the tool answer with a
 *  calm error instead of a 500. Validation lives here so both add_task and update_task share it. */
export function buildRecurrence(repeat: RepeatSpec | null | undefined, todayIso: string): Recurrence | null {
  if (repeat == null || typeof repeat !== 'object') return null;
  const start = repeat.start === undefined ? undefined : isIsoDay(repeat.start) ? repeat.start : null;
  if (start === null) return null; // a start was given but is not a valid ISO day
  const anchor = start ?? todayIso;

  switch (repeat.kind) {
    case 'daily':
      return { kind: 'daily', start: anchor };
    case 'weekly': {
      // weekdays required, non-empty, each an integer 0..6 (0=Sun..6=Sat).
      if (!Array.isArray(repeat.weekdays) || repeat.weekdays.length === 0) return null;
      const wd = repeat.weekdays;
      if (!wd.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)) return null;
      return { kind: 'weekly', weekdays: wd as number[], start: anchor };
    }
    case 'every_n_days': {
      // days required, an integer >= 1.
      if (typeof repeat.days !== 'number' || !Number.isInteger(repeat.days) || repeat.days < 1) return null;
      return { kind: 'interval', days: repeat.days, anchor };
    }
    default:
      return null;
  }
}
