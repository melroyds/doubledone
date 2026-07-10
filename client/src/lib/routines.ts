// Routines (Cluster D): a calm morning/evening checklist you run as a ritual, never a
// streak and never a habit-tracker. A routine is a named set of small steps with a
// time-of-day; "doing" it ticks steps for TODAY only (per-day, like a recurring task's
// completion), and yesterday's ticks simply fall away with no chain to break and no
// guilt for a missed day. `done` holds only each step's LAST-ticked date, never a
// history or a count, so there is nothing to "keep up". Pure model plus serialize /
// deserialize; storage.ts persists and the screen renders. No React or storage imports,
// so this is unit-testable in node.

export type RoutineWhen = 'morning' | 'evening' | 'anytime';

export type RoutineStep = { id: string; title: string };

// A Rhythm's preset is a fixed catalog id (never free text), so copy and the future
// web-push payload can key off it without ever storing user text. 'custom' is a hand-set
// interval with no preset-specific copy.
export type RhythmPreset = 'water' | 'stand' | 'custom';

export type Routine = {
  id: string;
  name: string;
  // Absent (or 'checklist') = the original morning/evening step checklist. 'rhythm' = a
  // Rhythm: a gentle recurring nudge ("some water" every 2 hours) that is NEVER a task,
  // never ticked, never tracked. A Rhythm always carries steps:[] and done:{}.
  kind?: 'checklist' | 'rhythm';
  when: RoutineWhen; // checklist grouping only; a Rhythm pins this to 'anytime' and ignores it
  steps: RoutineStep[];
  done: Record<string, string>; // stepId -> ISO date last ticked; "done today" iff === today's ISO
  nudgeHour?: number | null; // checklist once-a-day nudge hour (0-23); null / absent = no nudge
  nudgeMinute?: number | null; // minute (0-59) for the nudge; meaningful only when nudgeHour is set; null / absent = :00
  // --- Rhythm-only (kind === 'rhythm'); a fire-and-forget nudge, never a task ---
  preset?: RhythmPreset; // fixed catalog id, drives copy
  intervalHours?: number; // fire around every N whole hours (integer >= 1) within the window
  windowStart?: number; // active-window start hour (0-23), inclusive; default 9, so it never fires at night
  windowEnd?: number; // active-window end hour (0-23), inclusive; default 21; always > windowStart
  paused?: boolean; // an honest, indefinite pause (a sick / off day); resumes only when the user resumes
  // NOTE: there is deliberately NO count / streak / lastFired / history field. A Rhythm
  // accumulates nothing, so there is nothing to "keep up" and nothing to feel behind on.
  createdAt: number;
  updatedAt: number;
};

/** Whether a step is ticked for the given day. Per-day: yesterday's tick does not count. */
export function isStepDoneToday(routine: Routine, stepId: string, todayIso: string): boolean {
  return routine.done[stepId] === todayIso;
}

/**
 * Tick or un-tick a step for today, returning a new routine. Stores only today's ISO (or
 * removes the key), so no streak or history accumulates, there is nothing to break.
 */
export function toggleStep(routine: Routine, stepId: string, todayIso: string, now: number): Routine {
  const done = { ...routine.done };
  if (done[stepId] === todayIso) delete done[stepId];
  else done[stepId] = todayIso;
  return { ...routine, done, updatedAt: now };
}

/** Today's progress for a routine: how many of its steps are ticked today, out of the total. */
export function routineProgress(routine: Routine, todayIso: string): { done: number; total: number } {
  const done = routine.steps.filter((s) => routine.done[s.id] === todayIso).length;
  return { done, total: routine.steps.length };
}

// --- Rhythms: gentle recurring nudges (kind === 'rhythm') ------------------------------
// All the "when does it fire" math is pure and lives here, so the native scheduler and the
// future web-push cron are thin layers over one source of truth and can never drift.

export const RHYTHM_WINDOW_START_DEFAULT = 9;
export const RHYTHM_WINDOW_END_DEFAULT = 21;

/** True for a Rhythm (a nudge-only routine), false for a step checklist. */
export function isRhythm(r: Pick<Routine, 'kind'>): boolean {
  return r.kind === 'rhythm';
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 0;
  return Math.min(23, Math.max(0, Math.trunc(h)));
}

/**
 * The discrete local hours an interval Rhythm fires, INCLUSIVE of both window ends.
 * e.g. rhythmFireHours(9, 21, 2) -> [9, 11, 13, 15, 17, 19, 21]. Always includes
 * windowStart; includes windowEnd only when it lands on the interval. Defensive: an
 * inverted or empty window collapses to a single nudge at windowStart, and a junk interval
 * falls back to hourly, so a corrupt config can never produce a night-time or empty schedule.
 */
export function rhythmFireHours(windowStart: number, windowEnd: number, intervalHours: number): number[] {
  const start = clampHour(windowStart);
  const end = clampHour(windowEnd);
  const step = Number.isInteger(intervalHours) && intervalHours >= 1 ? intervalHours : 1;
  if (end <= start) return [start];
  const hours: number[] = [];
  for (let h = start; h <= end; h += step) hours.push(h);
  return hours;
}

/** The firing hours for a Rhythm, or [] for a checklist / a Rhythm with no interval. */
export function rhythmSlotHours(r: Routine): number[] {
  if (r.kind !== 'rhythm' || typeof r.intervalHours !== 'number') return [];
  return rhythmFireHours(r.windowStart ?? RHYTHM_WINDOW_START_DEFAULT, r.windowEnd ?? RHYTHM_WINDOW_END_DEFAULT, r.intervalHours);
}

/**
 * The stable notification identifier for one firing slot, and the prefix that enumerates
 * ALL of a Rhythm's slots. Cancel matches by this prefix so it also sweeps slots orphaned
 * by a later edit that shrank the window (the "it kept nagging after I deleted it" failure).
 * makeId emits `r-<t>-<n>` (three hyphen-parts), so no id can be a `rhythm-<id>-` prefix of
 * another and the sweep can never over-cancel a sibling Rhythm (asserted in the tests).
 */
export function rhythmSlotId(routineId: string, hour: number): string {
  return `rhythm-${routineId}-${hour}`;
}

export function rhythmSlotIdPrefix(routineId: string): string {
  return `rhythm-${routineId}-`;
}

/**
 * The canonical due-rule, defined in terms of rhythmSlotHours so the (future) web-push path
 * cannot drift from the native schedule: true iff the Rhythm is active and this local hour
 * is one of its firing hours. A paused Rhythm is never due.
 */
export function rhythmDueAtHour(r: Routine, localHour: number): boolean {
  if (r.kind !== 'rhythm' || r.paused) return false;
  return rhythmSlotHours(r).includes(clampHour(localHour));
}

export type RoutineEdit = {
  name: string;
  when: RoutineWhen;
  stepTitles: string[]; // the edited steps, one title each, in their new order
  nudgeHour?: number | null; // the edited nudge hour, or null / absent for no nudge
  nudgeMinute?: number | null; // the edited nudge minute (0-59), riding with nudgeHour; null / absent = :00
  now: number;
};

/**
 * Apply an edit (from the prefilled form) to a routine, returning a new routine. The
 * critical rule: TODAY'S TICKS SURVIVE. A step whose title still appears keeps its
 * existing id (each existing step is consumed at most once, in order, so duplicate
 * titles map one-to-one), which keeps its `done` entry alive; a new title gets a new
 * id, and a renamed step is a new step by design (its old tick falls away). `done`
 * entries for removed steps are stripped so a removed tick can never resurrect.
 */
export function applyRoutineEdit(routine: Routine, edit: RoutineEdit, makeId: () => string): Routine {
  const pool = [...routine.steps]; // each existing step is reusable once
  const steps = edit.stepTitles.map((title) => {
    const i = pool.findIndex((s) => s.title === title);
    if (i >= 0) return pool.splice(i, 1)[0];
    return { id: makeId(), title };
  });
  const keptIds = new Set(steps.map((s) => s.id));
  const done: Record<string, string> = {};
  for (const [stepId, date] of Object.entries(routine.done)) {
    if (keptIds.has(stepId)) done[stepId] = date;
  }
  return {
    ...routine,
    name: edit.name,
    when: edit.when,
    steps,
    done,
    nudgeHour: edit.nudgeHour ?? null,
    nudgeMinute: edit.nudgeMinute ?? null,
    updatedAt: edit.now,
  };
}

/** Serialize routines for storage. */
export function serializeRoutines(routines: Routine[]): string {
  return JSON.stringify(routines);
}

/**
 * Parse stored routines defensively: anything unreadable yields [], and any entry that is
 * not a well-formed routine is dropped rather than trusted, so a corrupt or hand-edited
 * blob never crashes the app.
 */
export function deserializeRoutines(raw: string | null): Routine[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRoutine).map(cleanRoutine);
}

function isRoutine(v: unknown): v is Routine {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string' && Array.isArray(r.steps);
}

// Coerce a parsed routine into a well-formed shape: valid steps only, a `done` object, a
// `when` from the allowed set, and backfilled timestamps. Defensive against old blobs.
function cleanRoutine(r: Routine): Routine {
  const raw = r as unknown as Record<string, unknown>;
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : 0;
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;

  if (raw.kind === 'rhythm') {
    // A Rhythm is a nudge-only recurring cue: NEVER a task, never ticked, never tracked. We
    // FORCE steps:[] and done:{} on parse so a corrupt or hand-edited blob can never
    // resurrect a tick, and pin `when` to 'anytime' so a Rhythm can never fall into a
    // morning/evening checklist group. With no count/streak/lastFired field in the type,
    // scorekeeping is structurally impossible.
    const preset: RhythmPreset = raw.preset === 'water' || raw.preset === 'stand' ? raw.preset : 'custom';
    const intervalHours =
      typeof raw.intervalHours === 'number' && Number.isInteger(raw.intervalHours) && raw.intervalHours >= 1 ? raw.intervalHours : 1;
    let windowStart = clampHour(typeof raw.windowStart === 'number' ? raw.windowStart : RHYTHM_WINDOW_START_DEFAULT);
    let windowEnd = clampHour(typeof raw.windowEnd === 'number' ? raw.windowEnd : RHYTHM_WINDOW_END_DEFAULT);
    if (windowEnd <= windowStart) {
      windowStart = RHYTHM_WINDOW_START_DEFAULT;
      windowEnd = RHYTHM_WINDOW_END_DEFAULT;
    }
    return {
      id: r.id,
      name: r.name,
      kind: 'rhythm',
      when: 'anytime',
      steps: [],
      done: {},
      preset,
      intervalHours,
      windowStart,
      windowEnd,
      paused: raw.paused === true,
      createdAt,
      updatedAt,
    };
  }

  const steps = (Array.isArray(raw.steps) ? raw.steps : []).filter(
    (s): s is RoutineStep =>
      s != null && typeof s === 'object' && typeof (s as RoutineStep).id === 'string' && typeof (s as RoutineStep).title === 'string',
  );
  const when: RoutineWhen = raw.when === 'morning' || raw.when === 'evening' ? raw.when : 'anytime';
  const done = raw.done != null && typeof raw.done === 'object' ? (raw.done as Record<string, string>) : {};
  // A valid nudge hour (a 0-23 integer) is preserved; anything else (absent, null, junk) means no nudge.
  const nudgeHour =
    typeof raw.nudgeHour === 'number' && Number.isInteger(raw.nudgeHour) && raw.nudgeHour >= 0 && raw.nudgeHour <= 23
      ? raw.nudgeHour
      : undefined;
  // Same for the minute (a 0-59 integer); anything else (absent, null, junk) means :00.
  const nudgeMinute =
    typeof raw.nudgeMinute === 'number' && Number.isInteger(raw.nudgeMinute) && raw.nudgeMinute >= 0 && raw.nudgeMinute <= 59
      ? raw.nudgeMinute
      : undefined;
  return { id: r.id, name: r.name, when, steps, done, nudgeHour, nudgeMinute, createdAt, updatedAt };
}
