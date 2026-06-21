import { describe, expect, it } from 'vitest';

import { deleteSubStatement, localHour, parsePushSub, subDueAt, upsertSubStatement } from './push';

const VALID = {
  subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'KEY', auth: 'AUTH' } },
  hour: 8,
  tzOffset: -600,
};

describe('parsePushSub', () => {
  it('pulls endpoint, keys, hour and tz from a subscribe body', () => {
    expect(parsePushSub(VALID)).toEqual({ endpoint: 'https://push.example/abc', p256dh: 'KEY', auth: 'AUTH', hour: 8, tzOffset: -600 });
  });

  it('defaults the hour to 9 and tz to 0 when missing', () => {
    const sub = parsePushSub({ subscription: VALID.subscription });
    expect(sub?.hour).toBe(9);
    expect(sub?.tzOffset).toBe(0);
  });

  it('rejects a body with no endpoint or keys', () => {
    expect(parsePushSub({ subscription: { endpoint: 'x' } })).toBeNull();
    expect(parsePushSub({})).toBeNull();
    expect(parsePushSub(null)).toBeNull();
  });
});

describe('subscription statements', () => {
  it('upserts on the endpoint primary key', () => {
    const { sql, params } = upsertSubStatement({ endpoint: 'E', p256dh: 'P', auth: 'A', hour: 7, tzOffset: 60 });
    expect(sql).toContain('ON CONFLICT(endpoint) DO UPDATE');
    expect(params).toEqual(['E', 'P', 'A', 7, 60]);
  });

  it('deletes by endpoint', () => {
    expect(deleteSubStatement('E')).toEqual({ sql: 'DELETE FROM push_subs WHERE endpoint = ?', params: ['E'] });
  });
});

describe('scheduling math', () => {
  it('computes the local hour from a UTC instant and tz offset', () => {
    // 23:00 UTC, AEST (UTC+10, offset -600) -> 09:00 local
    expect(localHour(Date.UTC(2026, 5, 21, 23, 0), -600)).toBe(9);
    // 14:00 UTC, US Eastern (UTC-5, offset +300) -> 09:00 local
    expect(localHour(Date.UTC(2026, 5, 21, 14, 0), 300)).toBe(9);
  });

  it('is due only when the local hour matches the preferred hour', () => {
    expect(subDueAt({ hour: 9, tzOffset: -600 }, Date.UTC(2026, 5, 21, 23, 0))).toBe(true);
    expect(subDueAt({ hour: 9, tzOffset: -600 }, Date.UTC(2026, 5, 21, 22, 0))).toBe(false);
  });
});
