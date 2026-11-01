import { describe, expect, it } from 'vitest';

import {
  deleteSubStatement,
  isHourTick,
  localHour,
  localMinuteOfDay,
  NUDGE_TICK_MIN,
  parsePushSub,
  saveSub,
  subDueAt,
  upsertSubStatement,
} from './push';
import type { D1LikeDatabase } from './telemetry';

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

// #18 (2026-11-01): the cron ran on UTC's hour and this compared hours, so an 8 a.m. reminder reached Adelaide at
// 8:30, India at 8:30 and Nepal at 8:45. Now the cron runs every quarter hour and a sub is due in the first quarter
// hour of its chosen hour, which one tick hits exactly.
describe('quarter-hour scheduling (#18)', () => {
  /** Every cron tick of one UTC day, 15 minutes apart, starting at midnight. */
  const ticksOfDay = (y: number, m: number, d: number) => Array.from({ length: (24 * 60) / NUDGE_TICK_MIN }, (_, i) => Date.UTC(y, m, d) + i * NUDGE_TICK_MIN * 60_000);
  const at = (h: number, min: number) => Date.UTC(2026, 10, 1, h, min);

  it('reads the local minute of the day', () => {
    expect(localMinuteOfDay(at(21, 30), -630)).toBe(8 * 60); // Adelaide (ACDT, UTC+10:30): 08:00
    expect(localMinuteOfDay(at(2, 15), -345)).toBe(8 * 60); // Nepal (UTC+5:45): 08:00
    expect(localMinuteOfDay(at(11, 30), 210)).toBe(8 * 60); // Newfoundland (UTC-3:30): 08:00
  });

  for (const [place, tzOffset, onTheHour, hourlyTickWas] of [
    ['Adelaide (UTC+10:30, offset -630)', -630, at(21, 30), at(22, 0)],
    ['Nepal (UTC+5:45, offset -345)', -345, at(2, 15), at(3, 0)],
    ['Newfoundland (UTC-3:30, offset +210)', 210, at(11, 30), at(12, 0)],
  ] as const) {
    it(`${place}: due on the tick at 08:00 local, and not on the hourly tick it used to wait for`, () => {
      const sub = { hour: 8, tzOffset };
      expect(subDueAt(sub, onTheHour)).toBe(true);
      expect(subDueAt(sub, hourlyTickWas)).toBe(false);
      // The ticks either side are someone else's quarter hour.
      expect(subDueAt(sub, onTheHour - NUDGE_TICK_MIN * 60_000)).toBe(false);
      expect(subDueAt(sub, onTheHour + NUDGE_TICK_MIN * 60_000)).toBe(false);
    });

    it(`${place}: exactly one tick a day is due, for every hour of the day`, () => {
      for (let hour = 0; hour < 24; hour += 1) {
        const due = ticksOfDay(2026, 10, 1).filter((t) => subDueAt({ hour, tzOffset }, t));
        // The local day spans two UTC days, so a sub can fall on either; one day of ticks holds it exactly once.
        expect(due, `hour ${hour}`).toHaveLength(1);
        expect(localMinuteOfDay(due[0], tzOffset), `hour ${hour}`).toBe(hour * 60);
      }
    });
  }

  it('whole-hour zones keep landing on the hour, as before', () => {
    expect(subDueAt({ hour: 9, tzOffset: -600 }, at(23, 0))).toBe(true); // UTC+10: 09:00 local
    expect(subDueAt({ hour: 9, tzOffset: -600 }, at(23, 15))).toBe(false);
    expect(subDueAt({ hour: 9, tzOffset: 0 }, at(9, 0))).toBe(true);
  });

  it('isHourTick: only the :00 tick of each hour carries the hourly work', () => {
    expect(isHourTick(at(20, 0))).toBe(true);
    expect([at(20, 15), at(20, 30), at(20, 45)].map(isHourTick)).toEqual([false, false, false]);
    expect(isHourTick(at(20, 0) + 30_000)).toBe(true); // a manual trigger a little off the minute still counts
    expect(ticksOfDay(2026, 10, 1).filter(isHourTick)).toHaveLength(24);
  });
});

// #17 (2026-11-01): /push/subscribe answered ok before the write ran, so a failed save was never retried.
describe('saveSub says whether it stored the subscription (#17)', () => {
  const SUB = { endpoint: 'E', p256dh: 'P', auth: 'A', hour: 8, tzOffset: -600 };
  const db = (run: () => Promise<unknown>, seen: string[] = []): D1LikeDatabase => ({
    prepare(sql: string) {
      seen.push(sql);
      const stmt = { bind: () => stmt, run, first: async () => null, all: async () => ({ results: [] }) };
      return stmt;
    },
  });

  it('true once the upsert ran', async () => {
    const seen: string[] = [];
    expect(await saveSub({ DB: db(async () => ({}), seen) }, SUB)).toBe(true);
    expect(seen[0]).toContain('INSERT INTO push_subs');
  });

  it('false when the store throws, and false with no D1 bound (nothing was saved)', async () => {
    expect(
      await saveSub(
        {
          DB: db(async () => {
            throw new Error('d1 down');
          }),
        },
        SUB,
      ),
    ).toBe(false);
    expect(await saveSub({}, SUB)).toBe(false);
  });
});
