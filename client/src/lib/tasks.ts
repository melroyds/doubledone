// Pure task helpers: the data model plus serialize / deserialize / dump parsing.
// No React Native or storage imports, so this is unit-testable in a node env
// (see tasks.test.ts). The AsyncStorage wrapper lives in storage.ts and stays a
// thin, untested SDK seam.

import { type Recurrence } from './recurrence';

// A task with parts: a thing done in N steps (10 TV episodes, a 3-step chore).
// `done` is the slices completed (0..total); the task is finished exactly when
// done >= total. See lib/slices for the (pure) progress arithmetic.
export type Slices = { total: number; done: number };

export type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number; // epoch ms; stable identity + sort
  updatedAt: number; // epoch ms; bumped on every change, drives last-write-wins sync
  deletedAt?: number | null; // epoch ms tombstone; set = soft-deleted, hidden from views, synced as a delete
  completedAt?: number | null; // epoch ms a one-off was finished (the calendar/Lookback record); recurring uses completedDates
  complexity?: number | null; // effort signal (decomposition minutes); weights the celebration, never shown as a score
  due?: string | null; // 'YYYY-MM-DD' for a one-off; null/undefined = someday
  recurrence?: Recurrence; // absent = one-off (see lib/recurrence)
  completedDates?: string[]; // ISO dates a recurring task was ticked (per-day completion)
  slices?: Slices | null; // absent = whole task; present = track progress across parts (see lib/slices)
};

// Shown once on a brand-new install so the first open is not an empty void.
// These are real, deletable tasks, persisted like any other. The third previews
// the Bite-the-Elephant ethos: shrink the dreaded thing to a startable step.
export const SEED: Task[] = [
  { id: 'seed-water', title: 'Drink a glass of water', done: false, createdAt: 0, updatedAt: 0 },
  { id: 'seed-reply', title: "Reply to Sam's message", done: false, createdAt: 1, updatedAt: 1 },
  { id: 'seed-laundry', title: 'Start the laundry, just sort the pile', done: false, createdAt: 2, updatedAt: 2 },
];

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.done === 'boolean' &&
    typeof t.createdAt === 'number'
  );
}

/** Serialize tasks for storage. */
export function serialize(tasks: Task[]): string {
  return JSON.stringify(tasks);
}

/**
 * Parse stored tasks defensively. A corrupt or partial blob must never crash the
 * app or throw away a load: anything unreadable yields an empty list, and any
 * entry that is not a well-formed Task is dropped rather than trusted.
 */
export function deserialize(raw: string | null): Task[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isTask).map(withDefaults);
}

// Older stored blobs predate updatedAt; backfill it from createdAt so last-write-wins
// always has a value to compare, without dropping the task. A malformed `slices`
// (hand-edited storage, a future shape) is dropped rather than trusted, never crashing.
function withDefaults(t: Task): Task {
  const out: Task = { ...t, updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : t.createdAt };
  const slices = cleanSlices((t as Record<string, unknown>).slices);
  if (slices) out.slices = slices;
  else delete out.slices;
  return out;
}

/** Coerce an unknown into a well-formed Slices, or undefined. Clamps done to 0..total. */
function cleanSlices(value: unknown): Slices | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const s = value as Record<string, unknown>;
  if (typeof s.total !== 'number' || typeof s.done !== 'number') return undefined;
  const total = Math.max(0, Math.floor(s.total));
  if (total < 1) return undefined;
  const done = Math.min(total, Math.max(0, Math.floor(s.done)));
  return { total, done };
}

/**
 * Split a brain-dump blob into task titles: one per line, trimmed, blanks
 * dropped. This is the friction-free capture, type freely and let the lines
 * become tasks. Leading list markers (-, *, bullets, numbers) are stripped so
 * pasting an existing list just works.
 */
export function parseDump(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0);
}
