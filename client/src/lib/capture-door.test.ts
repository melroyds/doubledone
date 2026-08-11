import { describe, expect, it } from 'vitest';

import { addButtonLabel, doorSummary, type DoorState, repeatLabel, whenLabel } from './capture-door';
import { friendlyDate } from './day';

// Sat 25 July 2026: a fixed anchor so 2026-08-02 (a Sunday) exercises the friendly-date path.
const TODAY = new Date(2026, 6, 25);
// The picked-date label comes from the app's own friendlyDate (Node's ICU may include a comma
// the browser omits); the door must echo it exactly, whatever the runtime renders.
const AUG2 = friendlyDate('2026-08-02', TODAY);

function state(overrides: Partial<DoorState> = {}): DoorState {
  return { when: 'today', dueDate: '2026-08-02', repeat: null, weekdays: [1], everyNDays: 2, steps: 0, ...overrides };
}

describe('whenLabel', () => {
  it('names the three whens in the app voice', () => {
    expect(whenLabel(state(), TODAY)).toBe('Today');
    expect(whenLabel(state({ when: 'tomorrow' }), TODAY)).toBe('Tomorrow');
    expect(whenLabel(state({ when: 'date' }), TODAY)).toBe(AUG2);
  });
});

describe('repeatLabel', () => {
  it('is null when the task does not repeat', () => {
    expect(repeatLabel(state())).toBeNull();
  });

  it('names each cadence', () => {
    expect(repeatLabel(state({ repeat: 'daily' }))).toBe('Daily');
    expect(repeatLabel(state({ repeat: 'weekly', weekdays: [1] }))).toBe('Weekly on Mo');
    expect(repeatLabel(state({ repeat: 'everyN', everyNDays: 3 }))).toBe('Every 3 days');
  });

  it('sorts weekly days into calendar order however they were tapped', () => {
    expect(repeatLabel(state({ repeat: 'weekly', weekdays: [3, 1] }))).toBe('Weekly on Mo, We');
  });
});

describe('doorSummary', () => {
  it('is the calm default when nothing is set', () => {
    expect(doorSummary(state(), TODAY)).toBe('Today');
  });

  it('joins everything set with middle dots', () => {
    expect(doorSummary(state({ repeat: 'weekly', weekdays: [1] }), TODAY)).toBe('Today · Weekly on Mo');
    expect(doorSummary(state({ when: 'tomorrow', steps: 3 }), TODAY)).toBe('Tomorrow · 3 steps');
    expect(doorSummary(state({ when: 'date', repeat: 'daily' }), TODAY)).toBe(`${AUG2} · Daily`);
  });
});

describe('addButtonLabel', () => {
  it('is a bare Add for the reflex path (today, no repeat)', () => {
    expect(addButtonLabel(state(), TODAY, 1)).toBe('Add');
    expect(addButtonLabel(state(), TODAY, 0)).toBe('Add');
  });

  it('repeats the consequential part before the tap', () => {
    expect(addButtonLabel(state({ when: 'tomorrow' }), TODAY, 1)).toBe('Add · Tomorrow');
    expect(addButtonLabel(state({ when: 'date' }), TODAY, 1)).toBe(`Add · ${AUG2}`);
    expect(addButtonLabel(state({ repeat: 'weekly', weekdays: [1] }), TODAY, 1)).toBe('Add · Weekly on Mo');
  });

  it('a repeat outranks the when (the when is only its start date)', () => {
    expect(addButtonLabel(state({ when: 'tomorrow', repeat: 'daily' }), TODAY, 1)).toBe('Add · Daily');
  });

  it('a multi-line dump carries its line count', () => {
    expect(addButtonLabel(state(), TODAY, 3)).toBe('Add 3');
    expect(addButtonLabel(state({ when: 'tomorrow' }), TODAY, 3)).toBe('Add 3 · Tomorrow');
  });

  it('steps stay off the Add label (they live in the door summary)', () => {
    expect(addButtonLabel(state({ steps: 3 }), TODAY, 1)).toBe('Add');
  });
});

// A DAYLESS surface: the shared list, which is a list two people keep rather than a day one person
// is getting through. The WHEN row is not rendered there, so the door's language must not mention a
// day either. If it did, the summary would read "Today" on a list that has no today, and the button
// would promise a day nothing in the room could keep.
describe('a whenless door (the shared list)', () => {
  it('says the calm default out loud rather than rendering an empty line', () => {
    expect(doorSummary(state({ whenless: true }), TODAY)).toBe('No repeat');
  });

  it('names only the cadence once one is set', () => {
    expect(doorSummary(state({ whenless: true, repeat: 'daily' }), TODAY)).toBe('Daily');
    expect(doorSummary(state({ whenless: true, repeat: 'weekly', weekdays: [1, 3] }), TODAY)).toBe('Weekly on Mo, We');
  });

  // The whole point of the flag: the same state reads differently on a surface that has days.
  it('drops the when that a day-shaped surface would show', () => {
    expect(doorSummary(state({ repeat: 'daily' }), TODAY)).toBe('Today · Daily');
    expect(doorSummary(state({ whenless: true, repeat: 'daily' }), TODAY)).toBe('Daily');
  });

  // Belt and braces. Such a surface cannot leave `when` on anything but 'today', but the button is
  // the last thing read before a tap lands, so it must be incapable of promising a day regardless.
  it('never puts a day on the Add button, even if `when` somehow moved', () => {
    expect(addButtonLabel(state({ whenless: true, when: 'tomorrow' }), TODAY, 1)).toBe('Add');
    expect(addButtonLabel(state({ whenless: true, when: 'date' }), TODAY, 1)).toBe('Add');
    expect(addButtonLabel(state({ whenless: true, when: 'tomorrow', repeat: 'daily' }), TODAY, 1)).toBe('Add · Daily');
  });

  it('still carries the line count of a dump', () => {
    expect(addButtonLabel(state({ whenless: true }), TODAY, 4)).toBe('Add 4');
  });

  // Steps are off on that surface too, but the summary is shared code and a caller could pass both.
  it('keeps steps out of the summary only when there are none', () => {
    expect(doorSummary(state({ whenless: true, steps: 3 }), TODAY)).toBe('3 steps');
  });
});
