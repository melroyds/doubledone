// Plan my day: the pure bits. The day's CONTEXT (what the person tells the app before it sorts),
// and editing the order it proposes back.
//
// Why the context exists (Melroy, 2026-07-25): "Plan my day should take the user's feelings into
// account". It used to send task titles and nothing else, so it ordered the day knowing nothing
// about the person having it. Three cheap facts they already know, asked once, in one sheet.
//
// Why there is no weather here: a language model has no live weather data, and a real forecast
// needs a weather API plus a location permission, which is a new data source and a new permission
// on an app whose spine is remove-friction. "Indoors or out" is what the sort actually needs, and
// the weather was only ever a proxy for it. The person knows their own sky.

export type Energy = 'low' | 'medium' | 'good';
export type DayType = 'work' | 'off';
export type Setting = 'indoors' | 'out' | 'either';

/** What the person said about today. Every field is optional: skipping a question must never
 *  become an assumption, so an unanswered one is simply not sent. */
export type DayContext = { energy?: Energy; day?: DayType; setting?: Setting };

/** True when they answered at least one question, so the caller can tell a considered plan from a
 *  plain one (used for the telemetry shape and for whether to say the plan was tailored). */
export function hasContext(c: DayContext): boolean {
  return c.energy != null || c.day != null || c.setting != null;
}

/**
 * Move the item at `index` one place up (-1) or down (+1), returning a NEW array. Out-of-range
 * moves (the top item up, the bottom item down, a bad index) return the SAME array reference, so a
 * no-op never re-renders or marks the plan edited.
 *
 * Up/down rather than drag-and-drop on purpose: dragging is fiddly for shaky hands and impossible
 * to operate with a screen reader, and this audience should never have to be dextrous to disagree
 * with a suggestion.
 */
export function moveInOrder<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Drop the item at `index`, returning a NEW array. An out-of-range index returns the SAME array.
 * Removing a task from the PLAN never touches the task itself: it stays on Today exactly as it was,
 * it just is not given a position by this plan. Nothing is deleted, nothing is moved to another day.
 */
export function dropFromOrder<T>(items: T[], index: number): T[] {
  if (index < 0 || index >= items.length) return items;
  return items.slice(0, index).concat(items.slice(index + 1));
}
