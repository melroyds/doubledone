// A tiny on-screen log, for the things a phone cannot show you.
//
// WHY THIS EXISTS: the shared-list dogfood happened on two devices, one of them a phone, and every
// failure looked the same from the outside ("it didn't highlight", "it didn't propagate"). The
// console holds the answer and a phone will not show you the console without a cable and a laptop.
// Several hours went into guessing at things one visible line would have settled.
//
// It is OPT-IN by URL (`?debug=1`) and holds a fixed number of lines in memory. Nothing is
// persisted, nothing is sent anywhere, and a normal user can never reach it by accident.
//
// Task TEXT never goes in here. These lines are read out loud, screenshotted and pasted into chats,
// and a shared list is two people's words. Counts, ids and timestamps only.

const MAX_LINES = 12;

type Line = { at: number; tag: string; detail: string };

let lines: Line[] = [];
const listeners = new Set<() => void>();

/** Record one decision. `detail` must be counts and flags, NEVER anything a person typed. */
export function debugLog(tag: string, fields: Record<string, string | number | boolean | null | undefined>): void {
  const detail = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  lines = [...lines, { at: Date.now(), tag, detail }].slice(-MAX_LINES);
  for (const l of listeners) l();
}

export function debugLines(): Line[] {
  return lines;
}

export function subscribeDebug(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Wall-clock time of day, which is what you need when comparing two devices side by side. */
export function debugStamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
