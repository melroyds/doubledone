// Pure helpers for a task done in steps, shared by both public surfaces (mcp.ts and api.ts) so an agent's
// tick and an integrator's write land the same row the same way. Two kinds, as in the app:
// - PARTS, the app's "Track in steps", stored in the `slices` jsonb column as { total, done } (a ten-episode
//   series is 10 parts);
// - LINKED STEPS, the app's "Break it down": the big task stays a row of its own, hidden behind its steps
//   (`silent_parent`), and each step is a child row (`parent_id`) that closes it when the last one is ticked.
//
// The rules are the app's own, ported rather than imported, because the server cannot import the client:
// cleanSlices is client/src/lib/tasks.ts cleanSlices, setTotal is lib/slices.ts setSliceTotal, and clearParts
// is clearSlices. Two server-only rules sit on top. Parts never go DOWN here, because the sync merge keeps the
// highest `slices.done` it has ever seen (client/src/lib/sync-merge.ts), so a lowered count springs straight
// back. And every parts write is pinned to the row as it was read (partsGuard), because the write sends the
// whole { total, done } object and would otherwise revert a resize or a tick made a moment earlier.
//
// The step rows copy what bdAccept / manualBreakdownSubmit write (client/src/app/today.tsx), and the finish walk
// ports currentRound and isDoneOn (client/src/lib/today.ts) exactly. settle-cases.json holds the cases the app's
// settleCompletions and healStuckParents are run against too (client/src/lib/settle-parity.test.ts).
//
// No fetch here: the callers do the I/O, and the one walk that needs several reads takes them as callbacks
// (WalkIo). Unit-tested in steps.test.ts.

import { asRecurrence, isValidIsoDay } from './cadence';

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

// --- Linked steps: what add_steps and POST /tasks/{id}/steps write --------------------------------------------

/** The bounds of one breakdown. Two at least, because a round of one is brought back to Today and never closes
 *  itself (client/src/lib/today.ts settleCompletions), and an agent must not be able to set that trap. Twenty at
 *  most, so one call is bounded. */
export const MIN_STEPS = 2;
export const MAX_STEPS = 20;
/** A step's estimate in minutes: a whole working day at most. */
export const MAX_STEP_MINUTES = 480;
/** The longest step title, and the longest big-task title made together with its steps. */
export const MAX_TITLE_CHARS = 500;

/** One step as the caller asked for it, cleaned: its words, its minutes (or null) and its day (or null for today). */
export type StepSpec = { title: string; minutes: number | null; due: string | null };

// The list markers the app's capture box strips (client/src/lib/tasks.ts parseDump). break_down writes "• ".
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;
// The minutes suffix the app writes into a step's title: "(5 min)", or the German "(5 Min.)".
const MINUTES_SUFFIX = /\s*\((\d{1,6})\s*(?:min|Min\.)\)$/;
const STEP_KEYS: ReadonlySet<string> = new Set(['title', 'minutes', 'due']);

/** A step's words as the person will see them, and any minutes the title carried: a leading list marker stripped,
 *  then a trailing "(5 min)" or "(5 Min.)" lifted off, so the suffix is written once, from the minutes. */
export function splitStepTitle(raw: string): { title: string; minutes: number | null } {
  // The marker comes off before the trim, so a bare "• " is an empty title, never a step called "•".
  const title = raw.replace(LIST_MARKER, '').trim();
  const m = MINUTES_SUFFIX.exec(title);
  if (!m) return { title, minutes: null };
  return { title: title.slice(0, m.index).trim(), minutes: Number(m[1]) };
}

/** The stored title of a step: "{title} ({m} min)", as the app writes it in English, Spanish, French and Italian,
 *  or the plain title when there are no minutes. German writes "Min.", and the server cannot know the language. */
export function stepTitle(title: string, minutes: number | null): string {
  return minutes == null ? title : `${title} (${minutes} min)`;
}

/** Check and clean the steps a caller sent. The error is one plain sentence, the same on both surfaces, and
 *  `tooFew` lets MCP point at the tools a single step belongs to. Minutes are rounded when not whole, and refused,
 *  never clamped, outside 1 to 480. A step with no `minutes` takes them from its title's suffix, if it has one. */
export function parseSteps(raw: unknown): { steps: StepSpec[] } | { error: string; tooFew?: true } {
  if (!Array.isArray(raw)) return { error: `Give the steps as a list of ${MIN_STEPS} to ${MAX_STEPS}, each with a title.` };
  if (raw.length < MIN_STEPS) return { error: 'Give at least two steps. One step on its own never closes the big task.', tooFew: true };
  if (raw.length > MAX_STEPS) {
    return { error: `That's more than ${MAX_STEPS} steps. Keep it to ${MAX_STEPS}, and break a step down later if it needs it.` };
  }
  const steps: StepSpec[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const n = i + 1;
    const item = raw[i] as unknown;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { error: `Step ${n} needs to be an object with a title.` };
    const o = item as Record<string, unknown>;
    const unknownKey = Object.keys(o).find((k) => !STEP_KEYS.has(k));
    if (unknownKey !== undefined) {
      return { error: `Step ${n} has a field it can't take ("${unknownKey}"). A step takes a title, minutes and due.` };
    }
    if (typeof o.title !== 'string') return { error: `Step ${n} needs a title.` };
    const split = splitStepTitle(o.title);
    if (!split.title) return { error: `Step ${n} needs a title.` };
    if (split.title.length > MAX_TITLE_CHARS) return { error: `Step ${n}'s title is too long. Keep it to ${MAX_TITLE_CHARS} characters.` };
    let minutes = split.minutes;
    if (o.minutes !== undefined && o.minutes !== null) {
      minutes = typeof o.minutes === 'number' && Number.isFinite(o.minutes) ? Math.round(o.minutes) : Number.NaN;
    }
    if (minutes !== null && !(minutes >= 1 && minutes <= MAX_STEP_MINUTES)) {
      return { error: `Step ${n}'s minutes need to be a whole number from 1 to ${MAX_STEP_MINUTES}.` };
    }
    let due: string | null = null;
    if (o.due !== undefined && o.due !== null) {
      if (typeof o.due !== 'string' || !isValidIsoDay(o.due)) return { error: `Step ${n}'s due date needs to look like 'YYYY-MM-DD'.` };
      due = o.due;
    }
    steps.push({ title: split.title, minutes, due });
  }
  return { steps };
}

/** The ids one breakdown writes, from ONE base per call: `-p` for the big task and `-<i>` for each step, so they
 *  are unique within the batch by construction, not by luck (tasks.id is a global primary key, and one clash fails
 *  the whole insert). */
export function stepIds(base: string, n: number): { parent: string; steps: string[] } {
  return { parent: `${base}-p`, steps: Array.from({ length: n }, (_, i) => `${base}-${i}`) };
}

/** The steps' minutes added up, or null when none has any. It is the big task's `complexity`, which weights its
 *  celebration in the app, as the AI breakdown sets it (bdAccept). */
export function stepsMinutes(steps: StepSpec[]): number | null {
  const timed = steps.filter((s) => s.minutes != null);
  return timed.length === 0 ? null : timed.reduce((sum, s) => sum + (s.minutes as number), 0);
}

/** The rows one breakdown inserts, in ONE PostgREST POST, so it is atomic. Every row carries the SAME key set with
 *  explicit nulls: a batch with mixed keys is refused (PGRST102), the trap the client's own batch notes
 *  (client/src/lib/sync.ts). The big task (title mode only) is born hidden, `open_parent: false` because it is a
 *  breakdown and not a made-tiny task, with no due day, as the app makes one from the capture box. Each step is a
 *  one-off child carrying the big task's title, its minutes as an integer `complexity`, and its day or null for
 *  today. Order is `created_at`: the big task at T, then each step 1 ms apart, the app's `now + i`. */
export function buildStepRows(o: {
  userId: string;
  nowMs: number;
  parent: { id: string; title: string | null };
  stepIds: string[];
  steps: StepSpec[];
  /** Write the big task too, in the same insert (title mode). */
  withParent: boolean;
}): Record<string, unknown>[] {
  const at = (ms: number) => new Date(ms).toISOString();
  const rows: Record<string, unknown>[] = [];
  if (o.withParent) {
    rows.push({
      id: o.parent.id,
      user_id: o.userId,
      title: o.parent.title,
      done: false,
      created_at: at(o.nowMs),
      updated_at: at(o.nowMs),
      parent_id: null,
      parent_title: null,
      silent_parent: true,
      open_parent: false,
      complexity: stepsMinutes(o.steps),
      due: null,
    });
  }
  o.steps.forEach((s, i) => {
    rows.push({
      id: o.stepIds[i],
      user_id: o.userId,
      title: stepTitle(s.title, s.minutes),
      done: false,
      created_at: at(o.nowMs + 1 + i),
      updated_at: at(o.nowMs + 1 + i),
      parent_id: o.parent.id,
      parent_title: o.parent.title,
      silent_parent: null,
      open_parent: null,
      complexity: s.minutes,
      due: s.due,
    });
  });
  return rows;
}

/** Why a task on the list cannot be broken into steps, or null when it can: a done task, a repeating one (the shared
 *  classifier), one tracked in parts, or one already hidden behind steps (a breakdown, or a task made tiny, which
 *  look the same from here). Checked in this order. */
export function stepsRefusal(row: { done?: unknown; recurrence?: unknown; slices?: unknown; silent_parent?: unknown }): 'done' | 'repeats' | 'parts' | 'hidden' | null {
  if (row.done === true) return 'done';
  if (asRecurrence(row.recurrence) != null) return 'repeats';
  if (cleanSlices(row.slices)) return 'parts';
  if (row.silent_parent === true) return 'hidden';
  return null;
}

/** The columns that tuck an existing task away behind its new steps, before `updated_at`: the app's bdAccept flags,
 *  plus `complexity` only when a step has minutes (the AI path sets it, the manual path leaves it alone). The title,
 *  due day, creation time, pin, "a lot" mark, left_off line and Ours link are never touched. */
export function hidePatch(steps: StepSpec[]): Record<string, unknown> {
  const minutes = stepsMinutes(steps);
  return minutes == null ? { silent_parent: true, open_parent: false } : { silent_parent: true, open_parent: false, complexity: minutes };
}

/** The filters that pin the hiding write to the task as it was read: still open, not already hidden, and still not
 *  repeating or in parts, which closes the window between the read and the write for free. The last two only when
 *  the column read empty: a value the shared classifier reads as no repeat (`{kind: 'none'}`) or as no parts (a
 *  malformed count) would never match `is.null`, and every retry would fail the same way. */
export function hideGuard(row: { recurrence?: unknown; slices?: unknown }): Record<string, string> {
  const guard: Record<string, string> = { done: 'is.false', silent_parent: 'not.is.true' };
  if (row.recurrence == null) guard.recurrence = 'is.null';
  if (row.slices == null) guard.slices = 'is.null';
  return guard;
}

/** The filter for exactly the rows one breakdown inserted, for the compensating tombstone when the hiding write
 *  misses (steps left beside a task that is not hidden would never close it). The ids are minted here, letters,
 *  digits and dashes only, so the `in.(...)` list needs no quoting. */
export function insertedRowsFilter(ids: string[]): Record<string, string> {
  return { id: `in.(${ids.join(',')})` };
}

// --- The finish walk: what ticking a step does to the big task ------------------------------------------------

/** A row as the walk reads it. Every field is unknown until checked: devices write these columns. */
export type WalkRow = {
  id?: unknown;
  title?: unknown;
  done?: unknown;
  recurrence?: unknown;
  completed_dates?: unknown;
  completed_at?: unknown;
  created_at?: unknown;
  silent_parent?: unknown;
  open_parent?: unknown;
  parent_id?: unknown;
  deleted_at?: unknown;
};

/** The columns the walk reads, for a parent and its children alike. Never `left_off`. */
export const WALK_SELECT = 'id,title,done,recurrence,completed_dates,completed_at,created_at,silent_parent,open_parent,parent_id,deleted_at';

/** The read of one parent. No `deleted_at` filter: a removed parent stops the walk, and the walk must see that. */
export function walkParentQuery(id: string): Record<string, string> {
  return { select: WALK_SELECT, id: `eq.${id}`, limit: '1' };
}

/** The read of one parent's children, removed ones included, as the app's own currentRound sees them. */
export function walkChildrenQuery(id: string): Record<string, string> {
  return { select: WALK_SELECT, parent_id: `eq.${id}` };
}

/** The filters on the finishing write (beside `deleted_at=is.null`, which every row write carries): still open,
 *  still hidden, and not a made-tiny task. A device that brought it back or finished it in the meantime wins. */
export const FINISH_GUARD: Readonly<Record<string, string>> = { done: 'is.false', silent_parent: 'is.true', open_parent: 'not.is.true' };

/** The finishing write: done, dated to the step that finished it so the whole task lands on that step's day in the
 *  Lookback, and no longer hidden. Never `open_parent`, never `left_off`, never `shared_ref`. */
export function finishBody(completedAt: string, now: string): Record<string, unknown> {
  return { done: true, completed_at: completedAt, silent_parent: false, updated_at: now };
}

/** client/src/lib/today.ts isRecurring, exactly: any recurrence that is not `{kind: 'none'}`. */
function isRecurringRow(row: WalkRow): boolean {
  return row.recurrence != null && (row.recurrence as { kind?: unknown }).kind !== 'none';
}

/** client/src/lib/today.ts isDoneOn, ported: a repeat is done on a day it was ticked for, a one-off when `done`. */
export function isDoneOn(row: WalkRow, day: string): boolean {
  if (isRecurringRow(row)) return Array.isArray(row.completed_dates) && row.completed_dates.includes(day);
  return row.done === true;
}

/** A timestamp in epoch ms, parsed the way the app's rowToTask parses one (client/src/lib/sync.ts): Date.parse,
 *  with `fallback` when that is not finite. */
function msOf(v: unknown, fallback: number): number {
  const ms = typeof v === 'string' ? Date.parse(v) : Number.NaN;
  return Number.isFinite(ms) ? ms : fallback;
}

/** A child in the shape the app's currentRound reads, parsed as rowToTask parses it. */
type RoundChild = { row: WalkRow; done: boolean; completedAt?: number; createdAt: number; deletedAt?: number };

function roundChild(row: WalkRow, nowMs: number): RoundChild {
  const createdAt = msOf(row.created_at, nowMs);
  const c: RoundChild = { row, done: row.done === true, createdAt };
  if (row.completed_at != null) c.completedAt = msOf(row.completed_at, createdAt);
  if (row.deleted_at != null) c.deletedAt = msOf(row.deleted_at, createdAt);
  return c;
}

/** client/src/lib/today.ts currentRound, exactly: the live children, less any finished before the newest live one
 *  was created (an earlier round's spent pebble must not make a task look like a two-step breakdown). */
export function currentRound<C extends { done: boolean; completedAt?: number | null; createdAt?: number; deletedAt?: number | null }>(children: C[]): C[] {
  const live = children.filter((c) => !c.deletedAt);
  const newest = Math.max(-Infinity, ...live.map((c) => (typeof c.createdAt === 'number' ? c.createdAt : -Infinity)));
  return live.filter((c) => !(c.done && typeof c.completedAt === 'number' && c.completedAt < newest));
}

/** What one level of the walk found. `finish`: certain, so the server closes it. `gone`: nothing hidden waits here
 *  (not found, removed, done, or on the list already). `waiting`: some of its steps are still open, `done` of `of`
 *  in its round. `app`: the app's repair decides on its next open (a made-tiny task, a round under two, a stale tiny
 *  flag), because each of those either brings the task back, which moves the child's left_off line onto it, or
 *  needs the flag cleared first. */
export type LevelVerdict =
  | { kind: 'finish' }
  | { kind: 'gone' }
  | { kind: 'waiting'; title: string | null; done: number; of: number }
  | { kind: 'app'; title: string | null };

/** The ONE rule, the same at every level: finish a parent only when it is hidden, open, not removed, not a made-tiny
 *  task, has two or more children in its round, and every live child is done on `day`. Each finish is one the app's
 *  own settleCompletions would make, and every case left alone is one its healStuckParents finishes or brings back
 *  on the next open, to the same end state on done, hidden and deleted (settle-cases.json holds the proof, run on
 *  both sides). The one field the paths can differ on is `open_parent`: a stale tiny flag on a task with steps still
 *  open is cleared by the app's own tick of a step, never by this one, because the server never writes it, and the
 *  two agree again at the last step. Cosmetic (the open steps keep the app's "a tiny step toward" eyebrow). */
export function judgeLevel(parent: WalkRow | null, children: WalkRow[], day: string, nowMs: number): LevelVerdict {
  if (!parent || parent.deleted_at != null || isDoneOn(parent, day) || parent.silent_parent !== true) return { kind: 'gone' };
  const title = typeof parent.title === 'string' ? parent.title : null;
  const kids = children.map((c) => roundChild(c, nowMs));
  const round = currentRound(kids);
  const live = kids.filter((c) => !c.deletedAt);
  const allDone = live.length > 0 && live.every((c) => isDoneOn(c.row, day));
  if (!allDone && round.length >= 2) {
    return { kind: 'waiting', title, done: round.filter((c) => isDoneOn(c.row, day)).length, of: round.length };
  }
  if (parent.open_parent === true || round.length < 2 || !allDone) return { kind: 'app', title };
  return { kind: 'finish' };
}

/** What removing a big task's steps would leave the app's repair (client/src/lib/today.ts healStuckParents) to do, for
 *  the refusal when a task waiting on its steps is asked to be removed on its own. An agent sees only OPEN steps (every
 *  list reads `done=is.false`), so "remove its steps" means the open ones, and the done ones stay:
 *  - `open`: none or one of its live steps is done, so removing the open ones brings it back to Today, as promised;
 *  - `cleared`: it has no live steps left, so the repair brings it back on its own;
 *  - `finishes`: two or more done steps would still make its round, and the repair FINISHES a hidden task whose live
 *    steps are all done, the opposite of removing it. `ids` is every live step, done ones too: removing all of them
 *    is the way to bring it back.
 *  `children` is the walk's read of them (walkChildrenQuery), removed ones included. A big task that never had a step
 *  reads `open`: the repair never touches one, but nothing writes one either. */
export type RemovalAdvice = { kind: 'open'; ids: string[] } | { kind: 'cleared' } | { kind: 'finishes'; done: number; ids: string[] };

export function removalAdvice(children: WalkRow[], nowMs: number): RemovalAdvice {
  const live = children.filter((c) => c.deleted_at == null);
  const ids = live.flatMap((c) => (typeof c.id === 'string' && c.id ? [c.id] : []));
  if (live.length === 0 && children.length > 0) return { kind: 'cleared' };
  const done = live.filter((c) => c.done === true);
  // What is left once the open ones go: the repair's own round over exactly those.
  if (currentRound(done.map((c) => roundChild(c, nowMs))).length >= 2) return { kind: 'finishes', done: done.length, ids };
  return { kind: 'open', ids };
}

/** The walk's reads and its one kind of write, supplied by the surface (mcp.ts, api.ts) so this file stays free of
 *  fetch. `read` answers null when a read failed. `finish` sends one guarded PATCH and answers the row written,
 *  'miss' when the guard matched nothing, or null when the write failed. */
export type WalkIo = {
  read(id: string): Promise<{ parent: WalkRow | null; children: WalkRow[] } | null>;
  finish(id: string, body: Record<string, unknown>, guard: Record<string, string>): Promise<WalkRow | 'miss' | null>;
};

/** What the walk did: every big task it finished, the lowest first and the topmost last, and where it stopped. */
export type WalkOutcome = {
  finished: { id: string; title: string | null; row: WalkRow }[];
  stop: Exclude<LevelVerdict, { kind: 'finish' }>;
};

/** How far up a chain the walk goes. A breakdown of a breakdown is rare, eight deep is never. */
export const MAX_WALK_DEPTH = 8;

/** The finish walk, run once a step has closed: from its parent up, finish each level the one rule finds certain,
 *  dated to the step (`completedAt`), and stop at the first that is not. It only ever FINISHES. Bringing a task
 *  back, retiring a made-tiny pebble and clearing a stale tiny flag stay with the app's repair, because each of
 *  them moves the child's left_off line onto the parent, and the server never reads or writes left_off. A read or a
 *  write that fails, or a write a device beat to it, stops the walk as `app`, so a reply never claims a close that
 *  did not land. A `seen` set and a depth cap end a malformed cycle. */
export async function planFinish(
  io: WalkIo,
  start: { parentId: string; parentTitle: string | null; completedAt: string },
  day: string,
  now: string,
): Promise<WalkOutcome> {
  const nowMs = msOf(now, 0);
  const finished: WalkOutcome['finished'] = [];
  const seen = new Set<string>();
  let cursor: string | null = start.parentId;
  for (let depth = 0; cursor !== null; depth += 1) {
    if (seen.has(cursor)) return { finished, stop: { kind: 'gone' } };
    if (depth >= MAX_WALK_DEPTH) return { finished, stop: { kind: 'app', title: null } };
    seen.add(cursor);
    const level = await io.read(cursor);
    if (!level) return { finished, stop: { kind: 'app', title: depth === 0 ? start.parentTitle : null } };
    const verdict = judgeLevel(level.parent, level.children, day, nowMs);
    if (verdict.kind !== 'finish') return { finished, stop: verdict };
    const parent = level.parent as WalkRow;
    const title = typeof parent.title === 'string' ? parent.title : null;
    const written = await io.finish(cursor, finishBody(start.completedAt, now), { ...FINISH_GUARD });
    if (written === null || written === 'miss') return { finished, stop: { kind: 'app', title } };
    finished.push({ id: cursor, title, row: written });
    cursor = typeof parent.parent_id === 'string' && parent.parent_id ? parent.parent_id : null;
  }
  return { finished, stop: { kind: 'gone' } };
}
