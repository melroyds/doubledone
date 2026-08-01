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

// --- Settle, the breathing room -------------------------------------------------------
// The ONE deliberate exception to this file's reduced-motion silence: in the room, the
// haptic IS the rhythm carrier, and under reduce-motion (blob still or opacity-only) it
// carries MORE of the breath, not less (the Settle handoff's explicit design). These two
// cues therefore take no `reduced` flag at all. They also work face-down and with the
// screen dimmed, which is the point.

/** Swell onset: one light tap, the in-breath's beginning. */
export function settleBreathIn(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Settle onset: two tiny selections 300ms apart, the long out-breath's start. Then silence
 *  (the still phase is marked by nothing: stillness is the cue). */
export function settleBreathOut(): void {
  void Haptics.selectionAsync().catch(() => {});
  setTimeout(() => {
    void Haptics.selectionAsync().catch(() => {});
  }, 300);
}
