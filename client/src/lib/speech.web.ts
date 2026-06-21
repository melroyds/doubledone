// Web Speech API adapter for Talk-to-capture. Browser-only: Metro resolves this
// .web.ts on web and speech.ts (a no-op) on native. The browser does the
// speech-to-text and hands back only the recognized TEXT, never audio. Nothing
// here reaches our servers: the recognized lines land in the capture box, and only
// reach the Worker if the user runs "Sort for me", exactly like typed text.
//
// Honest caveat (recorded in the decision-log + the privacy copy): Chrome routes
// recognition through Google's speech service; Safari runs it on-device. It is a
// browser feature the user invokes explicitly, per use, never in the background.

type Alt = { transcript: string };
type Res = { isFinal: boolean } & ArrayLike<Alt>;
type ResultEvent = { resultIndex: number; results: ArrayLike<Res> };

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether this browser can dictate (Chrome / Edge / Safari yes, Firefox no). */
export function isDictationSupported(): boolean {
  return getCtor() !== null;
}

export type DictationHandlers = {
  onPhrase: (phrase: string) => void; // a final recognized phrase
  onInterim?: (text: string) => void; // a live partial, for a "listening…" hint
  onError?: () => void;
  onEnd?: () => void;
};

export type Dictation = { stop: () => void };

/** Start listening. Returns a handle whose stop() ends the session; onEnd fires
 *  when recognition actually ends. The caller owns the lifecycle (tap to start,
 *  tap to stop). Continuous + interim so natural pauses split phrases into lines. */
export function startDictation(handlers: DictationHandlers): Dictation {
  const Ctor = getCtor();
  if (Ctor === null) {
    handlers.onEnd?.();
    return { stop: () => {} };
  }
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-AU';
  rec.onresult = (e: ResultEvent) => {
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const result = e.results[i];
      const text = result[0]?.transcript ?? '';
      if (result.isFinal) handlers.onPhrase(text);
      else handlers.onInterim?.(text);
    }
  };
  rec.onerror = () => handlers.onError?.();
  rec.onend = () => handlers.onEnd?.();
  rec.start();
  return { stop: () => rec.stop() };
}
