// Talk-to-capture: turn a stream of spoken phrases into clean capture lines.
// Pure + unit-tested. The web speech adapter (speech.web.ts) feeds final phrases
// in here; the result drops straight into the brain-dump box, where the existing
// "Sort for me" / Add flow takes over. Nothing leaves the device in this module.

/** Tidy one recognized phrase: collapse runs of whitespace and trim the ends. */
export function cleanPhrase(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Append a freshly recognized phrase to the capture text as its own line.
 * - An empty / whitespace phrase is ignored (the text is returned unchanged).
 * - The first phrase becomes the text; each later one is added after a newline,
 *   so every spoken thing lands on its own line (the "one line per thing" model
 *   the brain-dump and Sort-for-me already use).
 * - A phrase identical to the current last line is skipped: the speech API can
 *   double-fire a final result, and dictation must never duplicate a line.
 * The user's existing text is preserved exactly, so dictation can extend a
 * half-typed dump rather than replace it.
 */
export function appendPhrase(existing: string, phrase: string): string {
  const clean = cleanPhrase(phrase);
  if (clean === '') return existing;
  if (existing.trim() === '') return clean;
  const lastNonEmpty = existing
    .split('\n')
    .reverse()
    .find((l) => l.trim() !== '');
  if (lastNonEmpty != null && cleanPhrase(lastNonEmpty) === clean) return existing;
  return existing.endsWith('\n') ? `${existing}${clean}` : `${existing}\n${clean}`;
}
