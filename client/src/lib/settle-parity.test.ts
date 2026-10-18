import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type Recurrence } from './recurrence';
import { type Task } from './tasks';
import { healStuckParents, settleCompletions } from './today';

// The server's finish walk (server/src/steps.ts planFinish) and the app's own rules must agree, and nothing in
// either codebase makes them. The server finishes a big task only when the answer is certain, and leaves every
// other case to the app's repair. This test is what proves that loses nothing. It reads the SAME cases the server
// test runs (server/src/settle-cases.json, the schema-drift.test.ts precedent for reading across folders) and
// checks, for each:
//   (a) the server never finishes a task the app's settleCompletions would not;
//   (b) the server's finishes, then the app's healStuckParents (what a phone does on its next open), reach endState;
//   (c) the app on its own, settleCompletions then healStuckParents, reaches endState too.
// (b) with (c): every case the server leaves, the app takes to the same place on done, hidden and deleted. The one
// field they can differ on is openParent: a stale tiny flag on a task with steps still open is cleared by the app's
// own tick of a step, never by an agent's (the server never writes open_parent), and both paths agree again at the
// last step. A case where that happens leaves openParent out of its endState, with a note. If either side's rules
// change, this fails until the fixture, and the other side, are brought along.

type CaseTask = {
  id: string;
  title?: string;
  done?: boolean;
  createdAt: number;
  completedAt?: number;
  deletedAt?: number;
  parentId?: string;
  parentTitle?: string;
  silentParent?: boolean;
  openParent?: boolean;
  recurrence?: Recurrence;
  completedDates?: string[];
  combinedFrom?: { id: string; title: string }[];
};
/** `openParent` is left out where the two paths can differ on it alone (see the comment at the top). */
type EndState = { done: boolean; silentParent: boolean; openParent?: boolean | null; deleted: boolean; completedAt?: number };
/** Where the two paths leave a different openParent: what the server path (an agent's tick, then the repair) and the
 *  app alone each leave on that task. */
type Differs = Record<string, { server: boolean | null; app: boolean | null }>;
type SettleCase = {
  name: string;
  note?: string;
  tasks: CaseTask[];
  completed: string;
  serverFinishes: string[];
  openParentDiffers?: Differs;
  endState: Record<string, EndState>;
};
type SettleCases = { day: string; now: number; cases: SettleCase[] };

const FIXTURE = join(__dirname, '..', '..', '..', 'server', 'src', 'settle-cases.json');
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as SettleCases;

/** A fixture task as the app holds it after a sync (rowToTask's shape: absent fields stay absent). */
function toTask(t: CaseTask): Task {
  const task: Task = { id: t.id, title: t.title ?? t.id, done: t.done ?? false, createdAt: t.createdAt, updatedAt: t.createdAt };
  if (t.completedAt !== undefined) task.completedAt = t.completedAt;
  if (t.deletedAt !== undefined) task.deletedAt = t.deletedAt;
  if (t.parentId !== undefined) task.parentId = t.parentId;
  if (t.parentTitle !== undefined) task.parentTitle = t.parentTitle;
  if (t.silentParent) task.silentParent = true;
  if (t.openParent !== undefined) task.openParent = t.openParent;
  if (t.recurrence !== undefined) task.recurrence = t.recurrence;
  if (t.completedDates !== undefined) task.completedDates = t.completedDates;
  if (t.combinedFrom !== undefined) task.combinedFrom = t.combinedFrom;
  return task;
}

/** The parts of a task the end state compares: openParent and completedAt only where the fixture names them. */
function stateOf(t: Task, want: EndState): EndState {
  const s: EndState = { done: t.done, silentParent: t.silentParent === true, deleted: t.deletedAt != null };
  if ('openParent' in want) s.openParent = t.openParent ?? null;
  if (want.completedAt !== undefined) s.completedAt = t.completedAt ?? undefined;
  return s;
}

function expectEndState(tasks: Task[], c: SettleCase, path: 'server' | 'app') {
  const label = path === 'server' ? '(b)' : '(c)';
  for (const [id, want] of Object.entries(c.endState)) {
    const t = tasks.find((x) => x.id === id);
    expect(t, `${label}: ${id} is missing`).toBeDefined();
    expect(stateOf(t as Task, want), `${label}: ${id}`).toEqual(want);
  }
  // A known difference is pinned, not just skipped, so a change to either side's flag handling is seen here.
  for (const [id, each] of Object.entries(c.openParentDiffers ?? {})) {
    expect('openParent' in (c.endState[id] ?? {}), `${id}: a differing openParent is left out of endState`).toBe(false);
    expect(tasks.find((x) => x.id === id)?.openParent ?? null, `${label}: ${id}.openParent`).toBe(each[path]);
  }
}

// The fixture's day, as a local noon, so the app's local-day isDoneOn reads the same calendar day the server does.
const [y, m, d] = fixture.day.split('-').map(Number);
const date = new Date(y, m - 1, d, 12);
const now = fixture.now;

describe('settle-cases.json: the server walk and the app settle and repair agree', () => {
  it('holds the cases the design asks for', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(13);
  });

  for (const c of fixture.cases) {
    describe(c.name, () => {
      const start = () => c.tasks.map(toTask);

      it('(a) the server finishes nothing the app would not', () => {
        const before = start();
        const settled = settleCompletions(before, [c.completed], date, now).tasks;
        const appFinishes = settled.filter((t) => t.done && !before.find((b) => b.id === t.id)?.done).map((t) => t.id);
        for (const id of c.serverFinishes) expect(appFinishes, `the server finished ${id}`).toContain(id);
      });

      it('(b) the server finishes, then the app repairs: the end state', () => {
        const step = c.tasks.find((t) => t.id === c.completed) as CaseTask;
        const afterServer = start().map((t) =>
          c.serverFinishes.includes(t.id) ? { ...t, done: true, completedAt: step.completedAt, silentParent: false, updatedAt: now } : t,
        );
        expectEndState(healStuckParents(afterServer, now), c, 'server');
      });

      it('(c) the app alone, settle then repair: the same end state', () => {
        const settled = settleCompletions(start(), [c.completed], date, now).tasks;
        expectEndState(healStuckParents(settled, now), c, 'app');
      });
    });
  }
});
