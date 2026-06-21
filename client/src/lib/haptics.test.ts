import { afterEach, describe, expect, it, vi } from 'vitest';

import { dayClosed, scrapbookReady, stepsLanded, taskDone } from './haptics';

// expo-haptics is a native module with no node implementation, so mock it and assert
// the GATE: every cue must stay silent when motion is reduced (an accessibility
// guarantee for sensory-sensitive users), and fire when it is not. We do not assert the
// physical feel, only that the right call is or is not made, the same way the AI tests
// assert the request shape rather than the model's output.
const { impactAsync, notificationAsync } = vi.hoisted(() => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('expo-haptics', () => ({
  impactAsync,
  notificationAsync,
  ImpactFeedbackStyle: { Soft: 'soft', Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

afterEach(() => {
  impactAsync.mockClear();
  notificationAsync.mockClear();
});

describe('haptics gate', () => {
  it('fires a soft impact for a finished task when motion is not reduced', () => {
    taskDone(false);
    expect(impactAsync).toHaveBeenCalledOnce();
  });

  it('stays silent for a finished task when motion is reduced', () => {
    taskDone(true);
    expect(impactAsync).not.toHaveBeenCalled();
  });

  it('fires a success notification for the scrapbook reveal, and gates it', () => {
    scrapbookReady(false);
    expect(notificationAsync).toHaveBeenCalledOnce();
    scrapbookReady(true); // reduced: must not add a second call
    expect(notificationAsync).toHaveBeenCalledOnce();
  });

  it('silences day-closed and steps-landed when motion is reduced', () => {
    dayClosed(true);
    stepsLanded(true);
    expect(impactAsync).not.toHaveBeenCalled();
  });
});
