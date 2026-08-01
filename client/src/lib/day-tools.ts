// The constant frame: the pure rules behind Today's fixed action layer (Claude Design "1b,
// developed", chosen by Melroy 2026-07-25; the full board is docs/design-source's turn-2 frames).
//
// The problem this kills: every day tool used to render CONDITIONALLY (Focus needed a task, Plan
// needed AI + two, Lighten additionally needed a heavy day), so the action layer reshaped itself as
// the task count changed and muscle memory could never form. On an app whose stated guardrail is
// "autism needs predictability", the action layer was the least predictable thing on the screen.
//
// The frame: ONE slot ("Right now") holding the tool that suits the hour, plus a caret opening the
// SAME tools in the SAME order, always. An unavailable tool keeps its place at lowered contrast and
// explains itself when tapped; it is never absent and never locked. Nothing here reads the task
// list to decide WHAT to show, only whether a tool is currently actionable.

export type DayTool = 'plan' | 'focus' | 'lighten' | 'settle' | 'close';

/** The day's own order, fixed forever: start it, work it, relieve it, settle the body, end it.
 *  Settle (the breathing room, added 2026-08-01) sits between Lighten and Close per its design:
 *  shape the day, then the body, then the day's end. */
export const DAY_TOOL_ORDER: readonly DayTool[] = ['plan', 'focus', 'lighten', 'settle', 'close'];

/** The user's stated energy for TODAY: a day-state, not a setting. Resets each morning. */
export type DayEnergy = 'low' | 'normal' | 'high';

/**
 * Which tools exist at all. With AI off, Plan and Lighten are not "quiet", they are GONE: the
 * product rule everywhere else (E2E: "every AI affordance disappears") is that AI-off hides AI,
 * and a permanently-unavailable tool would be an ad for a feature the person switched off. That
 * rule outranks the design's "always the same four": within a configuration the set is constant,
 * which is what predictability actually needs.
 */
export function dayTools(aiEnabled: boolean): DayTool[] {
  return DAY_TOOL_ORDER.filter((tool) => aiEnabled || (tool !== 'plan' && tool !== 'lighten'));
}

/**
 * The slot's occupant for the hour the screen was OPENED at. Clock only, never the list: condition-
 * based swaps are exactly the self-reshaping this design exists to kill. Resolved once per screen
 * open and held (the caller captures the hour in state), so the slot never changes mid-session.
 *
 * Boundaries: before 11 the day is still being started (Plan); 11 to 17 it is being worked (Focus);
 * from 17, dusk in the living background's own phases, it is being set down (Close). Lighten is
 * NEVER the occupant: it exists for a condition (a heavy day), and putting it in the slot would
 * make the slot conditional again. It waits in the panel.
 */
export function occupantTool(hour: number, aiEnabled: boolean): DayTool {
  if (hour >= 17 || hour < 5) return 'close';
  if (hour >= 11) return 'focus';
  return aiEnabled ? 'plan' : 'focus';
}

export type ToolHintKey = 'today.planNeedsTwo' | 'today.focusNeedsOne' | 'today.lightenNeedsFull';

export type ToolGate = { available: boolean; hintKey?: ToolHintKey };

/**
 * Whether a tool is actionable right now, and the one plain line that explains when it is not.
 * The hint states what the tool NEEDS, never what the person lacks: "Plan my day needs two or more
 * tasks" is a fact about the tool, "you don't have enough tasks" would be a fact about them.
 */
export function toolGate(tool: DayTool, state: { openCount: number; heavy: boolean }): ToolGate {
  switch (tool) {
    case 'plan':
      return state.openCount >= 2 ? { available: true } : { available: false, hintKey: 'today.planNeedsTwo' };
    case 'focus':
      return state.openCount >= 1 ? { available: true } : { available: false, hintKey: 'today.focusNeedsOne' };
    case 'lighten':
      return state.heavy ? { available: true } : { available: false, hintKey: 'today.lightenNeedsFull' };
    case 'settle':
      // The room never gates: no task count, no premium, no condition. A regulation tool
      // that can be unavailable would be unavailable at exactly the moment it exists for.
      return { available: true };
    case 'close':
      return { available: true };
  }
}

/**
 * The pill's answer, translated for the Plan-my-day sheet, which speaks the /sequence dialect
 * ('low' | 'medium' | 'good'). This is what lets the sheet SKIP its energy question when the pill
 * was touched today: energy is read, never asked twice (Melroy's rule from the plan-day build,
 * reaffirmed for this design 2026-07-25).
 */
export function planEnergyFromDay(level: DayEnergy): 'low' | 'medium' | 'good' {
  return level === 'low' ? 'low' : level === 'high' ? 'good' : 'medium';
}
