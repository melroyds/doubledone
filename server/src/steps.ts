// Pure helpers for a task done in steps, shared by both public surfaces (mcp.ts and api.ts) so an agent's
// tick and an integrator's write land the same row the same way. Today that is PARTS: the app's "Track in
// steps", stored in the `slices` jsonb column as { total, done } (a ten-episode series is 10 parts). Linked
// steps (a hidden big task and the child rows that close it) are the next half and join this file.
//
// The rules are the app's own, ported rather than imported, because the server cannot import the client:
// cleanSlices is client/src/lib/tasks.ts cleanSlices, setTotal is lib/slices.ts setSliceTotal, and clearParts
// is clearSlices. Two server-only rules sit on top. Parts never go DOWN here, because the sync merge keeps the
// highest `slices.done` it has ever seen (client/src/lib/sync-merge.ts), so a lowered count springs straight
// back. And every parts write is pinned to the row as it was read (partsGuard), because the write sends the
// whole { total, done } object and would otherwise revert a resize or a tick made a moment earlier.
//
// No I/O: the callers fetch, these decide. Unit-tested in steps.test.ts.

/** A task's parts, as the app stores them: `done` of `total` ticked. */
export type Slices = { total: number; done: number };

/** The bounds the app's parts editor allows (client/src/lib/slices.ts MIN_SLICES / MAX_SLICES). */
export const MIN_PARTS = 2;
export const MAX_PARTS = 50;

/** What a parts write would leave on the row, and whether it differs from what was read. */
export type PartsChange = {
  slices: Slices;
  /** Every part is ticked, so the task itself is done. */
  complete: boolean;
  /** The counts differ from the ones read. */
  changed: boolean;
};

/** A stored `slices` value as well-formed parts, or null for a whole task. The client's cleanSlices rule exactly:
 *  both counts must be numbers, `total` is floored and must be at least 1, `done` is floored and clamped to
 *  0..total. Sync copies the jsonb through unchecked (client/src/lib/sync.ts rowToTask), so nothing a device
 *  wrote is trusted until it passes here. */
export function cleanSlices(value: unknown): Slices | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  if (typeof s.total !== 'number' || typeof s.done !== 'number') return null;
  if (!Number.isFinite(s.total) || !Number.isFinite(s.done)) return null;
  const total = Math.max(0, Math.floor(s.total));
  if (total < 1) return null;
  const done = Math.min(total, Math.max(0, Math.floor(s.done)));
  return { total, done };
}

/** `v` when it is a whole number from `min` to `max`, else null. The one shape check every parts input uses
 *  (a part count, a tick count, an absolute partsDone), so "5" or 5.5 is refused, never rounded. */
export function wholeIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

/** Move parts FORWARD to `target`, clamped to the total. Never lowers: a target at or below what is already
 *  ticked changes nothing. MCP passes `done + count` (a model reasons best with "tick one more") and REST passes
 *  its absolute partsDone (an HTTP retry must be idempotent); both land here. */
export function advanceParts(s: Slices, target: number): PartsChange {
  const done = Math.min(s.total, Math.max(s.done, Math.floor(target)));
  return { slices: { total: s.total, done }, complete: done >= s.total, changed: done !== s.done };
}

/** Set (or change) the number of parts: the app's setSliceTotal. The total is rounded and clamped to 2..50,
 *  progress carries over, and a total at or below the parts already ticked finishes the task. `s` is null for
 *  a whole task, which starts at 0. */
export function setTotal(s: Slices | null, total: number): PartsChange {
  const t = Math.min(MAX_PARTS, Math.max(MIN_PARTS, Math.round(total)));
  const done = Math.min(t, Math.max(0, s?.done ?? 0));
  return { slices: { total: t, done }, complete: done >= t, changed: s == null || s.total !== t || s.done !== done };
}

/** Whether a parts change needs a write: the counts moved, or every part is ticked on a row still open (a
 *  merge can leave "5 of 5" next to done:false, and a tap in the app is a no-op at the limit, so the server is
 *  the one place that can still close it). */
export function needsWrite(change: PartsChange, rowDone: boolean): boolean {
  return change.changed || (change.complete && !rowDone);
}

/** The columns a parts write sets, before `updated_at`: the new counts, and, when that ticks the last part,
 *  `done` with its stamp. Never `done: false`: a parts write only ever moves forward. */
export function partsPatch(change: PartsChange, now: string): Record<string, unknown> {
  return change.complete ? { slices: change.slices, done: true, completed_at: now } : { slices: change.slices };
}

/** The patch that makes a task in parts one whole task again (the app's clearSlices: the done flag is left
 *  alone), or null when it was not in parts, so there is nothing to clear. */
export function clearParts(raw: unknown): { slices: null } | null {
  return cleanSlices(raw) ? { slices: null } : null;
}

/** The text PostgREST's `->>` would give for one stored jsonb value, or null when the key is absent. */
function rawText(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** The PostgREST filters that pin a parts write to the row exactly as it was read: `slices->>done` and
 *  `slices->>total`, each equal to the STORED text (never the cleaned value), or `is.null` where the key is
 *  absent. Both keys, because the write sends the whole object: pinning only `done` let a resize made a moment
 *  earlier be reverted. The stored text, because a malformed value (2.7, or 7 of 5) never equals its cleaned
 *  form, and a guard that can never match would send the agent round "try again" for good.
 *
 *  The text is rebuilt from the value as JSON parsed it. Every writer (the app, this Worker) stores plain counts
 *  through JSON.stringify, and those read back as the same text. Only a hand-typed 3.0 would read "3" here
 *  against "3.0" in Postgres, and that costs a calm "it changed just now", never a wrong write. Decided against
 *  selecting the text itself (an aliased `slices->>done` in the read): exact, but it puts a new PostgREST form
 *  under every tick to cover a row no client writes. */
export function partsGuard(raw: unknown): Record<string, string> {
  const o = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const guard: Record<string, string> = {};
  for (const key of ['done', 'total'] as const) {
    const text = rawText(o[key]);
    guard[`slices->>${key}`] = text === null ? 'is.null' : `eq.${text}`;
  }
  return guard;
}
