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
const PLAUSIBLE_MAX = Date.UTC(2100, 0, 1);

/**
 * Fold one reading of the server's clock into the correction.
 *
 * `deviceBefore` and `deviceAfter` bracket the request, and the midpoint is used, so the network
 * round trip is split between the two legs instead of being charged entirely to the server. That is
 * the difference between a correction accurate to milliseconds and one that is quietly half a slow
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
