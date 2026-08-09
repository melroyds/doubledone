// One clock for everybody.
//
// Every timestamp this app writes drives last-write-wins, and until now every one of them was the
// DEVICE's clock. That was already a live problem: the MCP server writes rows on a Cloudflare
// Worker's clock, so a browser running a few minutes slow produced edits that lost to the copy they
// replaced and appeared to undo themselves. The shared list makes it sharper, because the other
// clock is now another person's phone, and the person watching their change revert is watching it
// in the same room as the person whose phone won.
//
// So: read the server's clock once per sync, remember the offset, and add it to every stamp. Not a
// time source of its own, a CORRECTION to the one the device already has.
//
// It fails OPEN to zero throughout. A skew we cannot establish leaves the app exactly as it was
// before this file existed, which is a known and survivable state; a skew we get WRONG would poison
// every timestamp written from then on, which is not.

/** Server time minus device time, in ms. Zero until a sync establishes otherwise. */
let skewMs = 0;

/** How far a corrected clock may land from the device's own before we refuse to believe it. Guards
 *  against a garbage server value (a null that parsed to 0, a truncated string) rather than against
 *  a genuinely wrong device clock, which is the thing we are here to fix and may be years out. */
const PLAUSIBLE_MIN = Date.UTC(2020, 0, 1);
/** The widest bracket a reading may have and still be believed. See applyServerTime. */
const MAX_ROUND_TRIP_MS = 2_000;
const PLAUSIBLE_MAX = Date.UTC(2100, 0, 1);

/**
 * Fold one reading of the server's clock into the correction.
 *
 * `deviceBefore` and `deviceAfter` bracket the request, and the midpoint is used, so the network
 * round trip is split between the two legs instead of being charged entirely to the server. That is
 * the difference between a correction good to tens of milliseconds and one quietly half a slow
 * request behind, on the one code path whose job is to make two devices agree.
 *
 * Returns whether the reading was believed, so a caller can log or retry rather than assume.
 */
export function applyServerTime(serverTime: string | number | null | undefined, deviceBefore: number, deviceAfter: number): boolean {
  if (serverTime == null) return false;
  const server = typeof serverTime === 'number' ? serverTime : Date.parse(serverTime);
  if (!Number.isFinite(server)) return false;
  if (!Number.isFinite(deviceBefore) || !Number.isFinite(deviceAfter)) return false;

  // A reply that arrives BEFORE it was sent means the two readings are not a bracket at all, so
  // there is no midpoint worth trusting.
  if (deviceAfter < deviceBefore) return false;

  // The midpoint cancels a SYMMETRIC round trip; the residual error is (uplink - downlink) / 2, so a
  // reading is only as accurate as half its own round trip and nothing else bounds it. A 40-second
  // reply on a train, or a JS thread frozen by a phone locking mid-request, would set a correction
  // tens of seconds wrong, and the 2020-2100 window cannot catch that because a twenty-second error
  // is perfectly plausible. nowMs() is the single mint point for EVERY timestamp in the app, so the
  // blast radius includes the personal list. Rejecting keeps the previous correction, which on a
  // device that has never synced is zero, which is exactly today's shipped behaviour.
  if (deviceAfter - deviceBefore > MAX_ROUND_TRIP_MS) return false;

  if (server < PLAUSIBLE_MIN || server > PLAUSIBLE_MAX) return false;

  const midpoint = deviceBefore + (deviceAfter - deviceBefore) / 2;
  const next = server - midpoint;
  if (!Number.isFinite(next)) return false;

  skewMs = next;
  return true;
}

/** The current correction, for tests and for anything that wants to report it honestly. */
export function clockSkewMs(): number {
  return skewMs;
}

/**
 * Forget the correction.
 *
 * Called on sign-out, because the next person to use this device is owed the device's own clock
 * rather than an offset established for somebody else's session, and by tests between cases.
 */
export function resetClockSkew(): void {
  skewMs = 0;
}

/** Apply the correction to a device reading. Pure, so the behaviour is testable without a clock. */
export function correctedNow(deviceNow: number): number {
  if (!Number.isFinite(deviceNow)) return deviceNow;
  const out = deviceNow + skewMs;
  return Number.isFinite(out) ? out : deviceNow;
}
