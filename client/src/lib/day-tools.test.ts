import { describe, expect, it } from 'vitest';

import { DAY_TOOL_ORDER, dayTools, occupantTool, planEnergyFromDay, toolGate } from './day-tools';

describe('dayTools', () => {
  it('is the same four, in day order, with AI on', () => {
    expect(dayTools(true)).toEqual(['plan', 'focus', 'lighten', 'close']);
    expect(dayTools(true)).toEqual([...DAY_TOOL_ORDER]);
  });

  // With AI off the AI tools are GONE, not quiet: a permanently-unavailable tool would be an ad
  // for a feature the person switched off, and the rest of the app already hides AI affordances.
  it('drops the AI tools entirely when AI is off', () => {
    expect(dayTools(false)).toEqual(['focus', 'close']);
  });
});

describe('occupantTool (clock only, never the list)', () => {
  it('starts the day with Plan until 11', () => {
    expect(occupantTool(5, true)).toBe('plan');
    expect(occupantTool(8, true)).toBe('plan');
    expect(occupantTool(10, true)).toBe('plan');
  });

  it('works the day with Focus from 11 to 17', () => {
    expect(occupantTool(11, true)).toBe('focus');
    expect(occupantTool(14, true)).toBe('focus');
    expect(occupantTool(16, true)).toBe('focus');
  });

  it('sets the day down with Close from 17, through the night', () => {
    expect(occupantTool(17, true)).toBe('close');
    expect(occupantTool(21, true)).toBe('close');
    expect(occupantTool(0, true)).toBe('close');
    expect(occupantTool(4, true)).toBe('close');
  });

  it('falls back to Focus in the morning when AI is off (Plan does not exist)', () => {
    expect(occupantTool(8, false)).toBe('focus');
    expect(occupantTool(14, false)).toBe('focus');
    expect(occupantTool(19, false)).toBe('close');
  });

  // The design's one hard rule for the slot: Lighten exists for a CONDITION, and a conditional
  // occupant is the self-reshaping this whole frame was built to kill.
  it('never seats Lighten in the slot, at any hour', () => {
    for (let h = 0; h < 24; h++) {
      expect(occupantTool(h, true)).not.toBe('lighten');
      expect(occupantTool(h, false)).not.toBe('lighten');
    }
  });
});

describe('toolGate (quiet-unavailable, never absent, never locked)', () => {
  it('Plan needs two or more open tasks, and says so as a fact about the tool', () => {
    expect(toolGate('plan', { openCount: 2, heavy: false })).toEqual({ available: true });
    expect(toolGate('plan', { openCount: 1, heavy: false })).toEqual({ available: false, hintKey: 'today.planNeedsTwo' });
    expect(toolGate('plan', { openCount: 0, heavy: false })).toEqual({ available: false, hintKey: 'today.planNeedsTwo' });
  });

  it('Focus needs one open task', () => {
    expect(toolGate('focus', { openCount: 1, heavy: false })).toEqual({ available: true });
    expect(toolGate('focus', { openCount: 0, heavy: false })).toEqual({ available: false, hintKey: 'today.focusNeedsOne' });
  });

  it('Lighten is for a full day only', () => {
    expect(toolGate('lighten', { openCount: 9, heavy: true })).toEqual({ available: true });
    expect(toolGate('lighten', { openCount: 9, heavy: false })).toEqual({ available: false, hintKey: 'today.lightenNeedsFull' });
  });

  it('Close is always available: any day can be set down, even an empty one', () => {
    expect(toolGate('close', { openCount: 0, heavy: false })).toEqual({ available: true });
    expect(toolGate('close', { openCount: 20, heavy: true })).toEqual({ available: true });
  });
});

describe('planEnergyFromDay (the pill answers the sheet, so nobody is asked twice)', () => {
  it('maps the three pills onto the /sequence dialect', () => {
    expect(planEnergyFromDay('low')).toBe('low');
    expect(planEnergyFromDay('normal')).toBe('medium');
    expect(planEnergyFromDay('high')).toBe('good');
  });
});
