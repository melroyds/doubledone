// A one-shot bridge for inbound launch intents (a launcher quick-action shortcut today,
// shared text next), captured at the app root and consumed once by the Today screen.
// Module-level and synchronous so the root can stash an intent before Today mounts;
// Today drains it on mount (for a cold launch) and subscribes for any that arrive while
// it is already open. A native concept; inert on web, where the sources never fire.

export type Inbound =
  | { kind: 'dump' } // open the capture box, ready to type
  | { kind: 'focus' } // open Focus mode
  | { kind: 'capture'; text: string }; // prefill the capture box with shared text

let pending: Inbound | null = null;
const listeners = new Set<() => void>();

/** Stash an inbound intent and notify any subscriber. Last one wins. */
export function setInbound(intent: Inbound): void {
  pending = intent;
  listeners.forEach((l) => l());
}

/** Take the pending intent, clearing it, so it is acted on exactly once. */
export function takeInbound(): Inbound | null {
  const intent = pending;
  pending = null;
  return intent;
}

/** Subscribe to inbound arrivals; returns an unsubscribe. */
export function subscribeInbound(listener: () => void): () => void {
  listeners.add(listener);
  // Fire immediately for an intent that arrived before this listener subscribed (a cold
  // launch via shortcut, where the root stashes the intent before Today mounts).
  if (pending) listener();
  return () => {
    listeners.delete(listener);
  };
}

const URL_RE = /https?:\/\/\S+/gi;

/**
 * Turn a raw shared blob into ONE calm capture line. Browsers share a selection as
 * `"Quoted Title"\n https://site/page#:~:text=...`, and dumping that into the capture
 * ruins it (Melroy, launch week): a task is words, a link is reference noise. The rule:
 * when the share contains words beyond its links, keep the words and drop the links
 * (and the browser's wrapping quotes); when it is a bare link, keep just the first URL
 * with any `#:~:text=` highlight fragment stripped. Whitespace collapses to one line.
 * Pure and shared by BOTH intake paths (the Android intent and the web share_target),
 * so the two sheets land identically. Returns null when nothing usable remains.
 */
export function cleanSharedText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // The #:~:text= highlight fragment is always the tail of a shared selection, and once
  // URL-decoded it can contain spaces, so cut it to END OF BLOB before touching URLs
  // (a \S+ URL match would stop at the first space and leak fragment residue as "words").
  const text = raw.trim().replace(/#:~:text=[\s\S]*$/i, '');
  if (!text) return null;
  const urls = text.match(URL_RE) ?? [];
  const words = text
    .replace(URL_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“‘]+/, '')
    .replace(/["'”’]+$/, '')
    .trim();
  if (words) return words;
  const firstUrl = urls[0];
  if (firstUrl) return firstUrl.replace(/[.,;)#]+$/, '');
  return null;
}

/**
 * Normalise a web share_target's GET params (title / text / url) into the shared text,
 * mirroring the native rule so a share from the web sheet and a share from the Android
 * sheet land in the capture identically: text wins, then the url, then the title, each
 * cleaned by cleanSharedText. One string, one capture line, the user edits from there.
 * Returns null when nothing usable was shared. Router params can arrive as arrays; the
 * first value wins.
 */
export function shareTextFromParams(params: { title?: string | string[]; text?: string | string[]; url?: string | string[] }): string | null {
  const first = (v?: string | string[]): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim();
  return cleanSharedText(first(params.text)) ?? cleanSharedText(first(params.url)) ?? cleanSharedText(first(params.title));
}
