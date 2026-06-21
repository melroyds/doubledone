// Tactile cues for DoubleDone, the Android build's felt feedback. Haptics are a
// sensory channel, so they follow two rules from the spine: they fire only on earned
// moments (never on every tap, never on failure), and they go SILENT when the user has
// reduced motion (app setting or OS), since the people who turn motion down are often
// the same ones a buzz can overwhelm. Each cue takes the resolved `reduced` flag (from
// useReducedMotion at the call site) so the gate is type-enforced and never forgotten.
// Web has no equivalent and no-ops via haptics.web.ts; Metro resolves the right file.
import * as Haptics from 'expo-haptics';

// Fire-and-forget, and swallow errors: a weak or absent actuator (common on cheaper
// Android hardware) must never throw into a UI handler.
function fire(reduced: boolean, run: () => Promise<unknown>): void {
  if (reduced) return;
  void run().catch(() => {
    // no actuator / unsupported device: skip silently
  });
}

/** A finished task: the core, most-earned cue. Soft, never a thud. */
export function taskDone(reduced: boolean): void {
  fire(reduced, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/** The day closed gently: a warm, soft confirmation that it's done. */
export function dayClosed(reduced: boolean): void {
  fire(reduced, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/** The whole day cleared: a fuller success than a single task. */
export function dayCleared(reduced: boolean): void {
  fire(reduced, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** The keepsake scrapbook landed: the payoff flourish, at the reveal not the wait. */
export function scrapbookReady(reduced: boolean): void {
  fire(reduced, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A dreaded task just broke into steps: the dread got smaller. */
export function stepsLanded(reduced: boolean): void {
  fire(reduced, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}
