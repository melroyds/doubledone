// Lightweight client telemetry. Every event is prefixed so logs are greppable
// and the completion-outcome flywheel (product-spec, "the moat") has a single
// front door from day one. This is the contract, wired before the features it
// measures — telemetry before traffic. No PII, no network yet.

export const TELEMETRY_PREFIX = 'doubledone';

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
 * Record an event. For now it is structured console output; swap the sink for a
 * real pipeline (a Supabase table, a batched POST) when sync lands and the call
 * sites never change.
 */
export function track(name: string, props?: Record<string, unknown>): void {
  console.log(formatEvent({ name, props }));
}
