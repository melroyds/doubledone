import { beforeEach, describe, expect, it } from 'vitest';

import { applyServerTime, clockSkewMs, correctedNow, resetClockSkew } from './clock';

const AUG_2026 = Date.UTC(2026, 7, 9, 12, 0, 0);

describe('applyServerTime', () => {
  beforeEach(() => resetClockSkew());

  it('starts at zero, so a device that has never synced behaves exactly as before this file', () => {
    expect(clockSkewMs()).toBe(0);
    expect(correctedNow(AUG_2026)).toBe(AUG_2026);
  });

  it('learns the offset of a device running slow, and corrects it', () => {
    // The device thinks it is 12:00:00. The server says 12:05:00. Every stamp this device writes
    // was five minutes behind rows written by the MCP Worker, or by a partner's phone.
    const device = AUG_2026;
    expect(applyServerTime(new Date(AUG_2026 + 300_000).toISOString(), device, device)).toBe(true);
    expect(clockSkewMs()).toBe(300_000);
    expect(correctedNow(device)).toBe(AUG_2026 + 300_000);
  });

  it('corrects a device running FAST in the other direction', () => {
    const device = AUG_2026;
    applyServerTime(new Date(AUG_2026 - 90_000).toISOString(), device, device);
    expect(correctedNow(device)).toBe(AUG_2026 - 90_000);
  });

  // The round trip is split between the two legs rather than charged entirely to the server. Without
  // this, a slow request quietly biases every corrected stamp by its whole duration, on the one code
  // path whose job is making two devices agree.
  it('splits the round trip, taking the MIDPOINT of the two device readings', () => {
    const before = AUG_2026;
    const after = AUG_2026 + 400; // a 400ms request
    applyServerTime(new Date(AUG_2026 + 200).toISOString(), before, after);
    // Server matched the midpoint exactly, so there is no real skew to learn.
    expect(clockSkewMs()).toBe(0);
  });

  it('accepts an epoch number as well as an ISO string', () => {
    applyServerTime(AUG_2026 + 1000, AUG_2026, AUG_2026);
    expect(clockSkewMs()).toBe(1000);
  });
});

describe('applyServerTime fails OPEN, leaving the app as it was', () => {
  beforeEach(() => resetClockSkew());

  // The whole safety argument of this file. A skew we cannot establish leaves every stamp exactly
  // where it was, which is a survivable known state. A skew we get WRONG poisons every timestamp
  // written from then on, which is not.
  it('ignores a missing, unparseable or non-finite reading', () => {
    for (const bad of [null, undefined, '', 'not a date', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyServerTime(bad as never, AUG_2026, AUG_2026)).toBe(false);
      expect(clockSkewMs()).toBe(0);
    }
  });

  it('ignores a server value outside any plausible epoch, which is a garbage reply and not a clock', () => {
    // A null that became 0, or a truncated string. Believing either would rewrite the app's whole
    // sense of time off one bad response.
    expect(applyServerTime(0, AUG_2026, AUG_2026)).toBe(false);
    expect(applyServerTime('1970-01-01T00:00:00Z', AUG_2026, AUG_2026)).toBe(false);
    expect(applyServerTime(Date.UTC(2200, 0, 1), AUG_2026, AUG_2026)).toBe(false);
    expect(clockSkewMs()).toBe(0);
  });

  // The DEVICE being years out is the thing this exists to fix, so it must NOT be rejected: it is
  // the server reading that has to be plausible, never the device one.
  it('fully corrects a device whose own clock is years wrong', () => {
    const wrongDevice = Date.UTC(2019, 0, 1);
    expect(applyServerTime(new Date(AUG_2026).toISOString(), wrongDevice, wrongDevice)).toBe(true);
    expect(correctedNow(wrongDevice)).toBe(AUG_2026);
  });

  it('ignores a bracket that is not one, where the reply arrived before it was sent', () => {
    expect(applyServerTime(new Date(AUG_2026).toISOString(), AUG_2026 + 500, AUG_2026)).toBe(false);
    expect(clockSkewMs()).toBe(0);
  });

  it('ignores non-finite device readings', () => {
    expect(applyServerTime(new Date(AUG_2026).toISOString(), Number.NaN, AUG_2026)).toBe(false);
    expect(applyServerTime(new Date(AUG_2026).toISOString(), AUG_2026, Number.NaN)).toBe(false);
    expect(clockSkewMs()).toBe(0);
  });
});

describe('correctedNow', () => {
  beforeEach(() => resetClockSkew());

  it('passes a non-finite device reading straight through rather than making it worse', () => {
    applyServerTime(new Date(AUG_2026 + 1000).toISOString(), AUG_2026, AUG_2026);
    expect(correctedNow(Number.NaN)).toBeNaN();
  });
});

describe('resetClockSkew', () => {
  it('forgets the correction, because the next person on this device is owed their own clock', () => {
    applyServerTime(new Date(AUG_2026 + 60_000).toISOString(), AUG_2026, AUG_2026);
    expect(clockSkewMs()).toBe(60_000);

    resetClockSkew();
    expect(clockSkewMs()).toBe(0);
    expect(correctedNow(AUG_2026)).toBe(AUG_2026);
  });
});


// The midpoint cancels a SYMMETRIC round trip; the residual is (uplink - downlink) / 2, so a
// reading is only as accurate as half its own round trip and nothing else bounded it. nowMs() is
// the single mint point for every timestamp in the app, including the personal list.
describe('a reading is only believed if its round trip was short', () => {
  beforeEach(() => resetClockSkew());

  it('rejects a forty-second bracket and keeps the correction it already had', () => {
    applyServerTime(new Date(AUG_2026 + 60_000).toISOString(), AUG_2026, AUG_2026);
    expect(clockSkewMs()).toBe(60_000);

    // A reply from a train, or a JS thread frozen by the phone locking mid-request.
    expect(applyServerTime(new Date(AUG_2026 + 5_000).toISOString(), AUG_2026, AUG_2026 + 40_000)).toBe(false);
    expect(clockSkewMs()).toBe(60_000);
  });

  it('is not sticky: a fast reading straight afterwards still applies', () => {
    applyServerTime(new Date(AUG_2026).toISOString(), AUG_2026, AUG_2026 + 40_000);
    expect(applyServerTime(new Date(AUG_2026 + 7_000).toISOString(), AUG_2026, AUG_2026 + 300)).toBe(true);
    expect(clockSkewMs()).toBe(7_000 - 150);
  });

  // Phone clocks jump (an OS NTP resync, someone changing the date), so latching the best sample
  // ever seen would apply a stale offset to an already-correct clock and refuse the fresh reading
  // that would fix it. Newest-believable is the retention rule; the RTT gate makes it mean something.
  it('lets a newer believable reading overwrite an older one, even a wider one', () => {
    applyServerTime(new Date(AUG_2026 + 1_000).toISOString(), AUG_2026, AUG_2026 + 10);
    applyServerTime(new Date(AUG_2026 + 3_000).toISOString(), AUG_2026, AUG_2026 + 1_500);
    expect(clockSkewMs()).toBe(3_000 - 750);
  });
});
