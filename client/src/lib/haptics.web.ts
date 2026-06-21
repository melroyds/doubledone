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
