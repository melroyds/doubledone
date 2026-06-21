// Native stub for Talk-to-capture. v1 is web-only (the in-app mic): Android
// already offers voice dictation through the Gboard keyboard mic, so the gap is
// on web/desktop. Metro resolves speech.web.ts on web and this file on native, so
// the mic button is simply never shown on native (isDictationSupported is false).
// Same export shape as speech.web.ts so the import type-checks on both targets.

export type DictationHandlers = {
  onPhrase: (phrase: string) => void;
  onInterim?: (text: string) => void;
  onError?: () => void;
  onEnd?: () => void;
};

export type Dictation = { stop: () => void };

/** Native has no in-app dictation in v1, so the mic UI is never rendered. */
export function isDictationSupported(): boolean {
  return false;
}

/** No-op on native: the mic UI is gated on isDictationSupported, so nothing calls
 *  this. Present only so the shared import resolves on native too. */
export function startDictation(_handlers: DictationHandlers): Dictation {
  return { stop: () => {} };
}
