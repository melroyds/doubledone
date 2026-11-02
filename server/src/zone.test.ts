import { describe, expect, it } from 'vitest';

import { localDay, localDayOf, readZoneClaim, validZone } from './zone';

const at = (iso: string) => Date.parse(iso);
const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenWith = (claims: object) => `${b64u({ alg: 'ES256' })}.${b64u(claims)}.sig`;

// The Worker's first use of Intl. Every case is a day boundary checked from both sides, so an offset that is out by
// even a quarter hour, or a daylight-saving rule that is missing, fails here.
describe('localDay (the user\'s own calendar day)', () => {
  it('is the UTC day without a zone', () => {
    expect(localDay(null, at('2026-11-01T21:30:00Z'))).toBe('2026-11-01');
    expect(localDay(undefined, at('2026-11-01T21:30:00Z'))).toBe('2026-11-01');
  });

  it('Melbourne at 21:30 UTC is already the next morning', () => {
    expect(localDay('Australia/Melbourne', at('2026-11-01T21:30:00Z'))).toBe('2026-11-02');
  });

  it('Melbourne either side of daylight saving starting on 4 Oct 2026 (UTC+10, then UTC+11)', () => {
    expect(localDay('Australia/Melbourne', at('2026-10-03T13:59:59Z'))).toBe('2026-10-03');
    expect(localDay('Australia/Melbourne', at('2026-10-03T14:00:00Z'))).toBe('2026-10-04');
    // After the change, midnight comes an hour earlier in UTC.
    expect(localDay('Australia/Melbourne', at('2026-10-04T12:59:59Z'))).toBe('2026-10-04');
    expect(localDay('Australia/Melbourne', at('2026-10-04T13:00:00Z'))).toBe('2026-10-05');
  });

  it('Melbourne either side of daylight saving ending on 4 Apr 2027 (UTC+11, then UTC+10)', () => {
    expect(localDay('Australia/Melbourne', at('2027-04-03T12:59:59Z'))).toBe('2027-04-03');
    expect(localDay('Australia/Melbourne', at('2027-04-03T13:00:00Z'))).toBe('2027-04-04');
    // 13:30 UTC would be past midnight at UTC+11. At UTC+10 it is still the 4th.
    expect(localDay('Australia/Melbourne', at('2027-04-04T13:30:00Z'))).toBe('2027-04-04');
    expect(localDay('Australia/Melbourne', at('2027-04-04T14:00:00Z'))).toBe('2027-04-05');
  });

  it('Lord Howe moves by half an hour: UTC+10:30 in winter, UTC+11 in summer', () => {
    expect(localDay('Australia/Lord_Howe', at('2026-07-01T13:29:59Z'))).toBe('2026-07-01');
    expect(localDay('Australia/Lord_Howe', at('2026-07-01T13:30:00Z'))).toBe('2026-07-02');
    expect(localDay('Australia/Lord_Howe', at('2026-11-01T12:59:59Z'))).toBe('2026-11-01');
    expect(localDay('Australia/Lord_Howe', at('2026-11-01T13:00:00Z'))).toBe('2026-11-02');
  });

  it('Kolkata (UTC+5:30) and Kathmandu (UTC+5:45)', () => {
    expect(localDay('Asia/Kolkata', at('2026-11-01T18:29:59Z'))).toBe('2026-11-01');
    expect(localDay('Asia/Kolkata', at('2026-11-01T18:30:00Z'))).toBe('2026-11-02');
    expect(localDay('Asia/Kathmandu', at('2026-11-01T18:14:59Z'))).toBe('2026-11-01');
    expect(localDay('Asia/Kathmandu', at('2026-11-01T18:15:00Z'))).toBe('2026-11-02');
  });

  it('Kiritimati (UTC+14) and Pago Pago (UTC-11) can be two calendar days apart', () => {
    expect(localDay('Pacific/Kiritimati', at('2026-11-01T09:59:59Z'))).toBe('2026-11-01');
    expect(localDay('Pacific/Kiritimati', at('2026-11-01T10:00:00Z'))).toBe('2026-11-02');
    expect(localDay('Pacific/Pago_Pago', at('2026-11-02T10:59:59Z'))).toBe('2026-11-01');
    expect(localDay('Pacific/Pago_Pago', at('2026-11-02T11:00:00Z'))).toBe('2026-11-02');
    const instant = at('2026-11-02T10:30:00Z');
    expect(localDay('Pacific/Kiritimati', instant)).toBe('2026-11-03');
    expect(localDay('Pacific/Pago_Pago', instant)).toBe('2026-11-01');
  });

  it("St John's is UTC-2:30 in summer and UTC-3:30 in winter", () => {
    expect(localDay('America/St_Johns', at('2026-07-02T02:29:59Z'))).toBe('2026-07-01');
    expect(localDay('America/St_Johns', at('2026-07-02T02:30:00Z'))).toBe('2026-07-02');
    expect(localDay('America/St_Johns', at('2026-11-02T03:29:59Z'))).toBe('2026-11-01');
    expect(localDay('America/St_Johns', at('2026-11-02T03:30:00Z'))).toBe('2026-11-02');
  });

  it('west of Greenwich an evening is still today, where UTC says tomorrow', () => {
    // 17:00 on Sunday 1 Nov in California (PST, the clocks went back that morning).
    expect(localDay('America/Los_Angeles', at('2026-11-02T01:00:00Z'))).toBe('2026-11-01');
  });

  it('falls back to the UTC day for a zone Intl refuses, and never throws', () => {
    expect(localDay('Mars/Olympus_Mons', at('2026-11-01T21:30:00Z'))).toBe('2026-11-01');
    expect(localDay('', at('2026-11-01T21:30:00Z'))).toBe('2026-11-01');
    expect(() => localDay('Australia/Melbourne', NaN)).not.toThrow();
  });

  it('pads the year, month and day', () => {
    expect(localDay('Australia/Melbourne', at('2027-01-04T22:00:00Z'))).toBe('2027-01-05');
  });
});

describe('localDayOf (the day a timestamp column falls on)', () => {
  it('reads a timestamptz in the zone, or on UTC without one', () => {
    expect(localDayOf('2026-10-30T21:15:00+00:00', 'Australia/Melbourne')).toBe('2026-10-31');
    expect(localDayOf('2026-10-30T21:15:00+00:00', null)).toBe('2026-10-30');
  });
  it('is null for a missing or unreadable value', () => {
    expect(localDayOf(null, 'Australia/Melbourne')).toBeNull();
    expect(localDayOf('not a date', 'Australia/Melbourne')).toBeNull();
    expect(localDayOf(1730000000000, null)).toBeNull();
  });
});

describe('validZone', () => {
  it('accepts the names the tz database knows', () => {
    for (const z of ['Australia/Melbourne', 'America/Argentina/Buenos_Aires', 'Etc/GMT-14', 'UTC', 'America/Port-au-Prince']) {
      expect(validZone(z), z).toBe(z);
    }
  });
  it('refuses anything else, before Intl when the shape is wrong', () => {
    for (const z of ['GMT+11:00', '', ' Australia/Melbourne', 'Australia/Melbourne<script>', 'A'.repeat(65), 'Mars/Olympus_Mons', 42, null, undefined, {}]) {
      expect(validZone(z), String(z)).toBeNull();
    }
  });
  it('stays right past the formatter cache cap, which any casing of a name can fill', () => {
    // Intl accepts 'australia/MELBOURNE' as readily as the real name, so a person writing their own metadata could
    // grow an unbounded cache one casing at a time. 600 casings run past the cap and still read the Melbourne day.
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      let bit = 0;
      // Bit n of i sets the case of the nth letter, so every i is a different casing.
      const casing = [...'australia/melbourne'].map((c) => (c === '/' ? c : (i >> bit++) & 1 ? c.toUpperCase() : c)).join('');
      seen.add(casing);
      expect(localDay(casing, at('2026-11-01T21:30:00Z'))).toBe('2026-11-02');
    }
    expect(seen.size).toBe(600);
  });
});

describe('readZoneClaim (from a token already verified)', () => {
  it('reads user_metadata.tz', () => {
    expect(readZoneClaim(tokenWith({ sub: 'u1', user_metadata: { tz: 'Australia/Melbourne' } }))).toBe('Australia/Melbourne');
  });
  it('is null when there is none, or it is not a zone', () => {
    expect(readZoneClaim(tokenWith({ sub: 'u1' }))).toBeNull();
    expect(readZoneClaim(tokenWith({ sub: 'u1', user_metadata: null }))).toBeNull();
    expect(readZoneClaim(tokenWith({ sub: 'u1', user_metadata: { tz: 'GMT+11:00' } }))).toBeNull();
    expect(readZoneClaim(tokenWith({ sub: 'u1', user_metadata: { tz: ['Australia/Melbourne'] } }))).toBeNull();
    expect(readZoneClaim(tokenWith({ sub: 'u1', tz: 'Australia/Melbourne' }))).toBeNull(); // only user_metadata counts
  });
  it('is null for a token that does not decode', () => {
    expect(readZoneClaim('not-a-jwt')).toBeNull();
    expect(readZoneClaim('a.%%%.c')).toBeNull();
    expect(readZoneClaim('')).toBeNull();
  });
});
