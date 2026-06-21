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
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : 0;
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;
  return { id: r.id, name: r.name, when, steps, done, createdAt, updatedAt };
}
