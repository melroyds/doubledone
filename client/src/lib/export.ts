// "Your stuff is yours": a plain-JSON export of the user's tasks (their todos and
// what they have finished). Pure + tested; the Settings screen does the download on
// web / share on native. Tombstoned (soft-deleted) tasks are an internal sync detail
// and are left out, so the file only holds what the user would recognise as theirs.

import { type Task } from './tasks';

export function buildExport(tasks: Task[], exportedAt: number): string {
  const live = tasks.filter((t) => !t.deletedAt);
  return JSON.stringify(
    {
      app: 'DoubleDone',
      schema: 1,
      exportedAt: new Date(exportedAt).toISOString(),
      taskCount: live.length,
      tasks: live,
    },
    null,
    2,
  );
}
