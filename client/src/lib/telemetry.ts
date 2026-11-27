// Lightweight client telemetry. Every event is prefixed so logs are greppable
// and the completion-outcome flywheel (product-spec, "the moat") has a single
// front door from day one. No PII ever.
//
// Two sinks: EVERY event goes to structured console output, and the FEW events on
// BEACON_EVENTS also leave the device as bare pseudonymous counts (a fire-and-forget
// POST the Worker checks against its own closed allowlist, server/src/events.ts).
// Settle is the first beacon resident: the room never touches the Worker on its own,
// so without this it is invisible to the Analytics Centre. settle.left is logged
// locally but deliberately NOT beaconed: enter+leave timestamps could pair into rough
// session durations at low traffic, and time in the room is not a score, anywhere.

export const TELEMETRY_PREFIX = 'doubledone';

// The events that also leave the device. Adding one here is a deliberate pair with
// the Worker's allowlist AND the privacy policy's feature-usage section.
// hold.* carries `step` (which knock, capped at 30) and nothing else: no task text, no ids.
// The completion-vs-release curve by step is the moat's first genuinely novel measurement.
// The held-card usage set (2026-08-22): the card was about to be redesigned a THIRD time on
// gut alone, so its existing local-only events now leave the device as bare counts. Which
// actions earn always-visible placement stops being taste in a data costume. card.more is the
// fold-open denominator: how often the fold hides something people actually need.
export const BEACON_EVENTS = new Set([
  'settle.opened',
  'settle.guide',
  'hold.started',
  'hold.completed',
  'hold.released',
  'breakdown.started',
  'tiny.made',
  'slices.defined',
  'task.pinned',
  'task.renamed',
  'task.reordered',
  // Drag to reorder (2026-10-25): a bare name per drop that moved a task, so the grip and the card's Move up /
  // Move down rail (task.reordered) can be read side by side before either is judged.
  'task.dragged',
  'nudge.set',
  'bulk.big',
  'card.more',
  // The telemetry review (2026-10-04). card.opened is card.more's denominator (TaskRow fires it only
  // for a card that HAS a More fold, so the two count the same cards). offplan.logged ("+ I also
  // did that") was counted only until its keep-or-remove verdict: kept on 2026-11-01, so it stays
  // on the device now. rooms.opened leaves the device only for Settings, as which of the Menu's two
  // doors was used; every other room stays local.
  'card.opened',
  'rooms.opened',
  // "Where you left off" (2026-10-04): bare names, never a word of the line. The evidence for a free
  // feature shipped without a user test, read by the rule in the decision log.
  'leftoff.saved.card',
  'leftoff.saved.focus',
  'leftoff.cleared',
  // The calm review ask (store 1.9, 2026-10-19): that the app ASKED the store for its rating card,
  // with which store. Not that a card appeared and never a rating, because neither is knowable. A gate
  // this strict can silently never open, and neither console can tell "never asked" from "asked and
  // ignored", so this count is the only proof it ever fires. review.unavailable and review.failed stay
  // on the device.
  'review.asked',
  // The gate for "Set today aside" and Away (decision-log 2026-11-01): bare names, read as how many
  // distinct days carry them. day.closed.morning is a Goodnight before noon, reentry.shown the
  // welcome-back note after four or more days away. Neither door is built until the count says so.
  'day.closed.morning',
  'reentry.shown',
  // "Today in your notifications" (2026-11-10, Android, opt-in): picked in Settings (glance.on) or left
  // for Off or the nudge (glance.off). Whether people keep it on, not one person's kind word, is what
  // decides if it goes to everyone. Bare names: never the hour, never a task.
  'glance.on',
  'glance.off',
  // A DoubleDone widget really on this phone's home screen (the launcher said so; the offer's
  // fail-closed guess is never counted), at most once a day per device (lib/widget-count). The one
  // number that best predicts demand for both glance surfaces.
  'widget.placed',
  // Active devices (2026-11-27, lib/active): the app was opened today (once a UTC day per device), this week (once a
  // UTC week), on a new install (once ever), and in that install's sixth week (once ever), each very rarely twice when
  // an answer is lost and the name is sent again. Bare names, no device id: nothing in a count says which device sent
  // it (lib/active's header says what can still be matched, and that we never try).
  'day.opened',
  'week.opened',
  'device.new',
  'week.six.opened',
]);

// What may ride WITH a beacon, per name. Everything else is stripped HERE, on the device, so the
// policy's "the feature's name" is true of the request itself and not only of what the Worker keeps
// (until 2026-10-04, nudge.set sent its preset and bulk.big its count, which the Worker then dropped).
const BEACON_PROPS: Record<string, readonly string[]> = {
  'settle.guide': ['on'],
  'hold.completed': ['step'],
  'hold.released': ['step'],
  'rooms.opened': ['room', 'door'],
  'review.asked': ['store'],
};

function beaconProps(name: string, props?: Record<string, unknown>): Record<string, unknown> | undefined {
  const keep = BEACON_PROPS[name];
  if (!keep || !props) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in props) out[k] = props[k];
  return Object.keys(out).length > 0 ? out : undefined;
}

export type TelemetryEvent = {
  name: string;
  props?: Record<string, unknown>;
};

/** Render an event to its canonical log line, e.g. `[doubledone.task.toggled] {"done":true}`. */
export function formatEvent(event: TelemetryEvent): string {
  const tag = `[${TELEMETRY_PREFIX}.${event.name}]`;
  const hasProps = event.props && Object.keys(event.props).length > 0;
  return hasProps ? `${tag} ${JSON.stringify(event.props)}` : tag;
}

/**
 * The beacon request for an event, or null when it stays on-device (not allowlisted,
 * or a dev session). Pure, so the request shape is the tested contract. The URL falls
 * back to the production Worker like every other client call. The __DEV__ gate keeps
 * Melroy's own dev iterations out of the production count: there is no staging
 * Worker, so without it a week of working on the Settle screen would inflate the
 * exact low-n signal the beacon exists to read (the adversarial review's catch).
 * keepalive lets the send survive a page navigation (leaving a screen often IS the
 * moment an event fires).
 */
export function beaconRequest(name: string, props?: Record<string, unknown>): { url: string; init: RequestInit } | null {
  if (!BEACON_EVENTS.has(name)) return null;
  if (name === 'rooms.opened' && props?.room !== 'settings') return null;
  if (name === 'review.asked' && props?.store !== 'ios' && props?.store !== 'android') return null;
  if (typeof __DEV__ !== 'undefined' && __DEV__) return null;
  const base = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';
  return {
    url: `${base}/event`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, props: beaconProps(name, props) }),
      keepalive: true,
    },
  };
}

/** How long a count waits for the Worker before it is treated as unanswered and kept to try again. */
export const SEND_TIMEOUT_MS = 15_000;

/**
 * Record an event like track, for the counts the Worker stores before it answers (lib/active's open counts, which keep
 * an unanswered name to send again). Resolves true once the Worker says it stored the count (a 2xx whose body carries
 * `stored: true`), and also when there is nothing to send (an event that stays on the device, or a dev session). False
 * when no answer came (no network, a blocked request, the timeout), when the Worker asked to be tried later (429, a 5xx),
 * and when a 2xx lacks the marker: an older Worker, after a rollback, answers these names with a plain 200 and stores
 * nothing, and the repo's rule is that a status alone never proves a route did its work. A refusal such as a 403 counts
 * as answered, because sending again would only be refused again. Never throws, and never surfaces anything.
 */
export async function trackSent(name: string): Promise<boolean> {
  console.log(formatEvent({ name }));
  const beacon = beaconRequest(name);
  if (!beacon) return true;
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), SEND_TIMEOUT_MS) : null;
  try {
    const res = await fetch(beacon.url, abort ? { ...beacon.init, signal: abort.signal } : beacon.init);
    if (res.status === 429 || res.status >= 500) return false;
    if (res.status >= 300) return true;
    const body: unknown = await res.json().catch(() => null);
    return typeof body === 'object' && body !== null && (body as { stored?: unknown }).stored === true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Record an event: always the console line, plus the beacon for the allowlisted few.
 *  The beacon is best-effort and can never throw, block, or surface a failure. */
export function track(name: string, props?: Record<string, unknown>): void {
  console.log(formatEvent({ name, props }));
  const beacon = beaconRequest(name, props);
  if (beacon) {
    try {
      void fetch(beacon.url, beacon.init).catch(() => {});
    } catch {
      // best effort, never surfaced
    }
  }
}
