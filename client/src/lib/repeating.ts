// The Repeating room's grouping, pure so it is testable in node.
//
// The room groups its series the way Routines groups its cards: one card per kind of rhythm, headed
// in plain words, and a kind with nothing in it is simply not drawn (an empty "Each month" heading
// would be a list of nothing to look at). The order runs from the most frequent to the least, which
// is also the order the cadence chips sit in when you make one.

import { type Recurrence } from './recurrence';
import { type Task } from './tasks';
import { isRecurring } from './today';

export type RepeatGroupKind = Exclude<Recurrence['kind'], 'none'>;

export type RepeatGroup = { kind: RepeatGroupKind; labelKey: string; items: Task[] };

// Labels resolve through t() at render time, so a locale change is honoured.
export const REPEAT_GROUPS: readonly { kind: RepeatGroupKind; labelKey: string }[] = [
  { kind: 'daily', labelKey: 'repeat.groupDaily' },
  { kind: 'weekly', labelKey: 'repeat.groupWeekly' },
  { kind: 'interval', labelKey: 'repeat.groupInterval' },
  // The handoff named three groups and the app has four kinds. A monthly repeat (the rent, a bill) is
  // exactly the kind this room is for, so it gets its own card rather than going missing.
  { kind: 'monthly', labelKey: 'repeat.groupMonthly' },
];

/**
 * The live series (not removed, actually repeating), grouped by the kind of their rhythm, in list
 * order within each group. Groups with nothing in them are left out.
 */
export function groupRepeating(tasks: readonly Task[]): RepeatGroup[] {
  const live = tasks.filter((task) => !task.deletedAt && isRecurring(task));
  return REPEAT_GROUPS.map((group) => ({ ...group, items: live.filter((task) => task.recurrence?.kind === group.kind) })).filter(
    (group) => group.items.length > 0,
  );
}
