// Web has no first-class scheduled haptics and DoubleDone's tactile cues live in the
// Android build, so every cue is a no-op here. Signatures mirror haptics.ts so call
// sites stay platform-agnostic; Metro resolves this file on web. See haptics.ts for the
// real cues and the reduced-motion gate.

/** No-op on web. */
export function taskDone(reduced: boolean): void {}
/** No-op on web. */
export function dayClosed(reduced: boolean): void {}
/** No-op on web. */
export function dayCleared(reduced: boolean): void {}
/** No-op on web. */
export function scrapbookReady(reduced: boolean): void {}
/** No-op on web. */
export function stepsLanded(reduced: boolean): void {}
/** The Settle room's haptic breath, the ONE web cue that is not a no-op: Android Chrome
 *  supports navigator.vibrate (iOS Safari ignores it, harmlessly), and the first device
 *  test was a phone browser where the silence read as a bug. A light pulse at the swell. */
export function settleBreathIn(): void {
  try {
    navigator.vibrate?.(15);
  } catch {
    // unsupported: the visual breath carries it
  }
}
/** Two tiny pulses ~300ms apart at the settle, mirroring the native pattern. */
export function settleBreathOut(): void {
  try {
    navigator.vibrate?.([12, 280, 12]);
  } catch {
    // unsupported: the visual breath carries it
  }
}
