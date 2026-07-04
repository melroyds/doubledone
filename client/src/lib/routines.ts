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

export type Routine = {
  id: string;
  name: string;
  when: RoutineWhen;
  steps: RoutineStep[];
  done: Record<string, string>; // stepId -> ISO date last ticked; "done today" iff === today's ISO
  nudgeHour?: number | null; // optional once-a-day nudge hour (0-23); null / absent = no nudge
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

export type RoutineEdit = {
  name: string;
  when: RoutineWhen;
  stepTitles: string[]; // the edited steps, one title each, in their new order
  nudgeHour?: number | null; // the edited nudge hour, or null / absent for no nudge
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
  return { ...routine, name: edit.name, when: edit.when, steps, done, nudgeHour: edit.nudgeHour ?? null, updatedAt: edit.now };
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
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : 0;
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;
  return { id: r.id, name: r.name, when, steps, done, nudgeHour, createdAt, updatedAt };
}
