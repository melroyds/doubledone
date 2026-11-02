// The user's own day for an AI agent (#24, 2026-11-02). Both public surfaces used to take "today" from the UTC
// clock, so east of Greenwich an agent worked on yesterday every morning (until 11am in Melbourne) and west of it
// on tomorrow every evening. Two of those errors were saved into tasks for good: an every_n_days repeat anchored a
// day off, and "monthly" with no day took yesterday's date of the month.
//
// The zone is the device's IANA name ('Australia/Melbourne'), kept in the account's user_metadata.tz ONLY for a
// person who connects an assistant (Copy my token in the app, or a connector's sign-in page), and cleared by
// Disconnect AI connectors. Supabase puts user_metadata in every access token, so the Worker reads it from the
// SAME token it has just verified: no table, no extra read per call. Anything missing or odd falls back to the UTC
// day silently, never an error to the agent, because a wrong zone is a calm degradation and a refusal is not.
//
// This is the Worker's first use of Intl (Workers run V8 with full ICU). zone.test.ts pins it, including the zones
// with half and quarter hour offsets and the ones either side of the date line.

/** The shape a zone name must have before Intl is even asked. 64 characters is comfortably past the longest IANA
 *  name, and the character set is the tz database's own, so a value with a colon (Android can give 'GMT+11:00') or
 *  anything stranger never reaches Intl. Kept identical to the client's check in client/src/lib/account-zone.ts. */
const ZONE_MAX = 64;
const ZONE_SHAPE = /^[A-Za-z0-9_+\-/]+$/;

// One formatter per zone, built once per isolate. Only names Intl has accepted are cached, and the tz database is
// finite (a few hundred names), so the map is bounded however many accounts an isolate serves.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    // en-US with the gregorian calendar and latin digits, so the numeric parts read as plain numbers.
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'numeric', day: 'numeric' });
    formatters.set(zone, f);
  }
  return f;
}

/** A time-zone name the runtime knows, or null for anything else (not a string, too long, the wrong characters,
 *  or a name Intl refuses). Never throws. */
export function validZone(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > ZONE_MAX || !ZONE_SHAPE.test(v)) return null;
  try {
    formatterFor(v);
    return v;
  } catch {
    return null;
  }
}

/**
 * The zone in a token's `user_metadata.tz`, or null. DECODE-ONLY, like decodeJwtEmail: call it only on a token
 * that verifySub has just verified, so the claim is the one Supabase signed. The person can write their own
 * user_metadata, so the value is validated here like any other input, and it only ever moves their own day.
 */
export function readZoneClaim(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const meta = (JSON.parse(atob(b64)) as { user_metadata?: unknown }).user_metadata;
    if (!meta || typeof meta !== 'object') return null;
    return validZone((meta as { tz?: unknown }).tz);
  } catch {
    return null;
  }
}

/** The UTC calendar day of an instant. */
function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * The calendar day 'YYYY-MM-DD' at `nowMs` in `zone`, or the UTC day when there is no zone or anything fails.
 * Built from the numeric year, month and day parts of formatToParts, never from a formatted string, whose order
 * and separators belong to the locale. Never throws: an instant that is not a number reads as now.
 */
export function localDay(zone: string | null | undefined, nowMs: number): string {
  if (!Number.isFinite(nowMs)) return utcDay(Date.now());
  if (!zone) return utcDay(nowMs);
  try {
    let y = NaN;
    let m = NaN;
    let d = NaN;
    for (const p of formatterFor(zone).formatToParts(new Date(nowMs))) {
      if (p.type === 'year') y = Number(p.value);
      else if (p.type === 'month') m = Number(p.value);
      else if (p.type === 'day') d = Number(p.value);
    }
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) {
      return utcDay(nowMs);
    }
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } catch {
    return utcDay(nowMs);
  }
}

/** The calendar day a timestamp column falls on in `zone` (the UTC day without one), or null when it is missing or
 *  does not parse. PostgREST sends timestamptz as an ISO string. */
export function localDayOf(v: unknown, zone: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? localDay(zone, ms) : null;
}
