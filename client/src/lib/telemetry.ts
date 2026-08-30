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
  'nudge.set',
  'bulk.big',
  'card.more',
]);

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
  if (typeof __DEV__ !== 'undefined' && __DEV__) return null;
  const base = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';
  return {
    url: `${base}/event`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    },
  };
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
