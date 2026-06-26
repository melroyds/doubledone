import { describe, expect, it } from 'vitest';

import { type ReminderReason, reminderReasonLine } from './reminders-types';

describe('reminderReasonLine', () => {
  it('gives a distinct, non-empty, never-alarming line for each reason', () => {
    const reasons: ReminderReason[] = ['denied', 'unsupported', 'error'];
    const lines = reasons.map(reminderReasonLine);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain('!'); // calm, never an alarm
    }
    expect(new Set(lines).size).toBe(reasons.length); // each case reads differently
  });

  it('points a denied user at the fix, not at themselves', () => {
    expect(reminderReasonLine('denied')).toMatch(/settings/i);
  });
});
