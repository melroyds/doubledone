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
// (b) with (c): every case the server leaves, the app takes to the same place. If either side's rules change, this
// fails until the fixture, and the other side, are brought along.

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
type EndState = { done: boolean; silentParent: boolean; openParent: boolean | null; deleted: boolean; completedAt?: number };
type SettleCase = { name: string; tasks: CaseTask[]; completed: string; serverFinishes: string[]; endState: Record<string, EndState> };
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

/** The parts of a task the end state compares. */
function stateOf(t: Task, withCompletedAt: boolean): EndState {
  const s: EndState = { done: t.done, silentParent: t.silentParent === true, openParent: t.openParent ?? null, deleted: t.deletedAt != null };
  if (withCompletedAt) s.completedAt = t.completedAt ?? undefined;
  return s;
}

function expectEndState(tasks: Task[], end: Record<string, EndState>, label: string) {
  for (const [id, want] of Object.entries(end)) {
    const t = tasks.find((x) => x.id === id);
    expect(t, `${label}: ${id} is missing`).toBeDefined();
    expect(stateOf(t as Task, want.completedAt !== undefined), `${label}: ${id}`).toEqual(want);
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
        expectEndState(healStuckParents(afterServer, now), c.endState, '(b)');
      });

      it('(c) the app alone, settle then repair: the same end state', () => {
        const settled = settleCompletions(start(), [c.completed], date, now).tasks;
        expectEndState(healStuckParents(settled, now), c.endState, '(c)');
      });
    });
  }
});
