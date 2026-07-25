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
