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
    expect(repeatLabel(state({ repeat: 'monthly', monthDay: 15 }))).toBe('Monthly on the 15th');
  });

  // The door line sits beside two or three other pieces, so it takes the SHORT monthly wording.
  // The drawer's full sentence ("Every month on the 15th") belongs where it is the only thing said.
  it('inflects the day of the month the way English writes it', () => {
    const day = (d: number) => repeatLabel(state({ repeat: 'monthly', monthDay: d }));
    expect(day(1)).toBe('Monthly on the 1st');
    expect(day(2)).toBe('Monthly on the 2nd');
    expect(day(3)).toBe('Monthly on the 3rd');
    expect(day(4)).toBe('Monthly on the 4th');
    // The teens are the trap every hand-rolled ordinal falls into: 11th, not 11st.
    expect([day(11), day(12), day(13)]).toEqual(['Monthly on the 11th', 'Monthly on the 12th', 'Monthly on the 13th']);
    expect([day(21), day(22), day(23), day(31)]).toEqual([
      'Monthly on the 21st',
      'Monthly on the 22nd',
      'Monthly on the 23rd',
      'Monthly on the 31st',
    ]);
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

// THE SHARED LIST, whose resting answer to "when" is Anytime rather than Today. Most of a household
// list has no day (milk, batteries, ask about the gutter) and must never become somebody's morning;
// picking a day there is the deliberate exception and means the row appears on BOTH your Todays.
describe('an anytime-default door (the shared list)', () => {
  const shared = (over: Partial<DoorState> = {}) => state({ whenDefault: 'anytime', when: 'anytime', ...over });

  it('names the dayless answer in the app voice', () => {
    expect(whenLabel(shared(), TODAY)).toBe('Anytime');
    expect(doorSummary(shared(), TODAY)).toBe('Anytime');
  });

  // "Anytime · Daily" is a contradiction read aloud: a thing with a rhythm is not a thing without a
  // day, and the rhythm is the more useful half.
  it('lets a repeat SUPERSEDE the dayless answer rather than joining it', () => {
    expect(doorSummary(shared({ repeat: 'daily' }), TODAY)).toBe('Daily');
    expect(doorSummary(shared({ repeat: 'weekly', weekdays: [2] }), TODAY)).toBe('Weekly on Tu');
  });

  // Elsewhere the when IS the repeat's start, which is worth saying, so the rule must stay local to
  // the dayless case and not quietly change the other screen.
  it('still joins when and repeat on a day-shaped surface', () => {
    expect(doorSummary(state({ repeat: 'daily' }), TODAY)).toBe('Today · Daily');
    expect(doorSummary(state({ when: 'tomorrow', repeat: 'daily' }), TODAY)).toBe('Tomorrow · Daily');
  });

  it('picks a real day out when one is chosen', () => {
    expect(doorSummary(shared({ when: 'today' }), TODAY)).toBe('Today');
    expect(doorSummary(shared({ when: 'date' }), TODAY)).toBe(AUG2);
  });

  // The button names what is UNUSUAL about this capture, measured against the surface's own resting
  // answer. Comparing against a hard-coded 'today' would make every ordinary shared add read
  // "Add · Anytime", which is a label shouting about the absence of a choice.
  it('stays quiet for the resting answer and speaks up for a chosen day', () => {
    expect(addButtonLabel(shared(), TODAY, 1)).toBe('Add');
    expect(addButtonLabel(shared({ when: 'today' }), TODAY, 1)).toBe('Add · Today');
    expect(addButtonLabel(shared({ when: 'tomorrow' }), TODAY, 1)).toBe('Add · Tomorrow');
    expect(addButtonLabel(shared({ repeat: 'daily' }), TODAY, 1)).toBe('Add · Daily');
  });

  it('leaves the day-shaped surface reading exactly as before', () => {
    expect(addButtonLabel(state(), TODAY, 1)).toBe('Add');
    expect(addButtonLabel(state({ when: 'tomorrow' }), TODAY, 1)).toBe('Add · Tomorrow');
  });

  it('still carries the line count of a dump', () => {
    expect(addButtonLabel(shared(), TODAY, 4)).toBe('Add 4');
  });
});
