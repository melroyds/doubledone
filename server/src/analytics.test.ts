import { describe, expect, it } from 'vitest';

import {
  activeCutoff,
  type ActiveCountRow,
  type AnalyticsData,
  type AnalyticsEnv,
  flywheelRate,
  handleAnalytics,
  mondayOf,
  mtdSpend,
  renderActive,
  renderAnalyticsHtml,
  summariseActive,
} from './analytics';
import { ACTIVE_EVENTS, APP_EVENTS } from './events';
import { sqliteD1 } from './sqlite-d1.test-helper';

// A D1 stub that answers by SQL substring, so each query's shape is pinned without a database.
function makeDb() {
  const answer = (sql: string): unknown => {
    if (sql.includes('FROM entitlements')) {
      return [
        { store: 'stripe', status: 'active', cancelling: 0, n: 1 },
        { store: 'apple', status: 'active', cancelling: 0, n: 1 },
      ];
    }
    if (sql.includes('FROM trials')) return { n: 2 };
    if (sql.includes('GROUP BY 1 ORDER BY 1 DESC')) return [{ day: '2026-08-01', calls: 12, errors: 1 }];
    if (sql.includes('SELECT endpoint')) return [{ endpoint: 'decompose', n: 7 }];
    if (sql.includes('SUM(COALESCE(input_tokens')) return [{ model: 'claude-haiku-4-5', in_tok: 1_000_000, out_tok: 200_000 }];
    if (sql.includes("endpoint = 'scrapbook'")) return { n: 14, recent: 3 };
    // Offered = rows with a flywheel id, endpoint-agnostic (the decompose->plan rename bug).
    if (sql.includes('WHERE corr_id IS NOT NULL')) return { n: 10 };
    if (sql.includes('COUNT(DISTINCT o.corr_id)')) return { n: 4 };
    if (sql.includes('SELECT COUNT(*) AS n FROM outcomes')) return { n: 9 };
    if (sql.includes('days_elapsed')) return { d: 2 };
    if (sql.includes('scrapbook_log')) return { n: 3 };
    if (sql.includes("FROM app_event_counts WHERE event = 'settle.opened'")) return { n: 21, recent: 8 };
    if (sql.includes('FROM app_event_counts')) return [{ event: 'settle.opened', n: 8 }];
    return null;
  };
  return {
    prepare: (sql: string) => {
      const runner = {
        all: async () => ({ results: answer(sql) as unknown[] }),
        first: async () => answer(sql),
        bind: (..._args: unknown[]) => runner,
      };
      return runner;
    },
  } as unknown as NonNullable<AnalyticsEnv['DB']>;
}

const DATA: AnalyticsData = {
  premium: [{ store: 'stripe', status: 'active', cancelling: 0, n: 1 }],
  trialsActive: 1,
  days: [{ day: '2026-08-01', calls: 5, errors: 0 }],
  endpoints7d: [{ endpoint: 'triage', n: 5 }],
  spendMtdUsd: 1.23,
  spendProjectedUsd: 4.56,
  capUsd: 25,
  decomposOffered: 10,
  decomposWithOutcome: 4,
  stepsReported: 9,
  medianDaysToFirstStep: 2,
  scrapbooksAllTime: 14,
  scrapbooks28d: 3,
  settleOpens: 21,
  settleOpens28d: 8,
  appEvents28d: [{ event: 'settle.opened', n: 8 }],
  active: summariseActive([], '2026-08-01', null),
  generatedAt: '2026-08-01 10:00 UTC',
};

describe('pure aggregation', () => {
  it('prices month-to-date spend off the shared model table', () => {
    // 1M Haiku in ($1) + 200k Haiku out ($1) = $2
    expect(mtdSpend([{ model: 'claude-haiku-4-5', in_tok: 1_000_000, out_tok: 200_000 }])).toBeCloseTo(2);
  });

  it('the flywheel rate never divides by zero', () => {
    expect(flywheelRate(0, 0)).toBe(0);
    expect(flywheelRate(10, 4)).toBeCloseTo(0.4);
  });
});

describe('renderAnalyticsHtml', () => {
  it('carries the four questions: money, spend vs cap, the moat, scrapbooks', () => {
    const html = renderAnalyticsHtml(DATA);
    expect(html).toContain('1 premium');
    expect(html).toContain('$1.23 this month');
    expect(html).toContain('$25.00 cap');
    expect(html).toContain('40%'); // 4 of 10 decompositions
    expect(html).toContain('median 2 days to the first one');
    // Scrapbooks count from ai_calls (always recorded), never the late-created abuse log:
    // the launch-day bug was a page reading 0 for a user with 14 keepsakes.
    expect(html).toContain('keepsakes ever made');
    expect(html).toContain('3 in the last 28 days');
    // The room (the app-event beacon): counts only, and the page SAYS so.
    expect(html).toContain('times Settle was entered');
    expect(html).toContain('never durations');
    expect(html).toContain('noindex'); // never crawlable
  });

  it('renders the room at zero without an events table (a beaconless deploy never breaks the page)', () => {
    const html = renderAnalyticsHtml({ ...DATA, settleOpens: 0, settleOpens28d: 0, appEvents28d: [] });
    expect(html).toContain('times Settle was entered');
    expect(html).not.toContain('event (28 days)'); // the empty table stays hidden
  });

  it('flags a projection that exceeds the cap, calmly', () => {
    const html = renderAnalyticsHtml({ ...DATA, spendProjectedUsd: 30 });
    expect(html).toContain('projection exceeds the cap');
  });
});

describe('handleAnalytics auth', () => {
  const req = (url: string, headers?: Record<string, string>) => new Request(url, { headers });

  it('503s when no token is configured (an undeployed secret is never an open page)', async () => {
    const res = await handleAnalytics(req('https://x/admin/analytics'), { DB: makeDb() }, Date.now());
    expect(res.status).toBe(503);
  });

  it('401s a wrong or missing token', async () => {
    const env = { ANALYTICS_TOKEN: 's3cret', DB: makeDb() };
    expect((await handleAnalytics(req('https://x/admin/analytics'), env, Date.now())).status).toBe(401);
    expect((await handleAnalytics(req('https://x/admin/analytics?token=nope'), env, Date.now())).status).toBe(401);
  });

  it('serves the page for the right token, via query param or bearer header, uncached', async () => {
    const env = { ANALYTICS_TOKEN: 's3cret', DB: makeDb() };
    const byParam = await handleAnalytics(req('https://x/admin/analytics?token=s3cret'), env, Date.now());
    expect(byParam.status).toBe(200);
    expect(byParam.headers.get('cache-control')).toBe('no-store');
    const html = await byParam.text();
    expect(html).toContain('2 premium'); // 1 stripe + 1 apple from the stub
    expect(html).toContain('decompose');
    const byHeader = await handleAnalytics(
      req('https://x/admin/analytics', { Authorization: 'Bearer s3cret' }),
      env,
      Date.now(),
    );
    expect(byHeader.status).toBe(200);
  });
});

// Active devices (2026-11-27). Friday 27 November 2026 is "today" throughout.
const TODAY = '2026-11-27';
const WEEK_ROWS: ActiveCountRow[] = [
  { day: '2026-11-27', event: 'day.opened', n: 5 },
  { day: '2026-11-27', event: 'week.opened', n: 2 },
  { day: '2026-11-27', event: 'device.new', n: 1 },
  { day: '2026-11-26', event: 'day.opened', n: 7 },
  { day: '2026-11-26', event: 'week.opened', n: 1 },
  { day: '2026-11-23', event: 'day.opened', n: 6 }, // this week's Monday
  { day: '2026-11-23', event: 'week.opened', n: 6 },
  { day: '2026-11-22', event: 'day.opened', n: 4 }, // last week's Sunday
  { day: '2026-11-22', event: 'week.opened', n: 4 },
  { day: '2026-11-25', event: 'settle.opened', n: 9 }, // not an active count: ignored
];

describe('the active-device counts', () => {
  it('the page reads exactly the names the Worker stores', () => {
    for (const e of ACTIVE_EVENTS) expect(APP_EVENTS.has(e), e).toBe(true);
  });

  it('weeks start on Monday, in UTC', () => {
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
    expect(mondayOf('2026-11-30')).toBe('2026-11-30');
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
  });

  it('shows fourteen days, today first, and a quiet day as zeros rather than a gap', () => {
    const { days } = summariseActive(WEEK_ROWS, TODAY, null);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ key: '2026-11-27', opened: 5, fresh: 1, six: 0 });
    expect(days[1]).toEqual({ key: '2026-11-26', opened: 7, fresh: 0, six: 0 });
    expect(days[2]).toEqual({ key: '2026-11-25', opened: 0, fresh: 0, six: 0 });
    expect(days[13].key).toBe('2026-11-14');
  });

  it("counts a week from week.opened, never from its days added up (that would count a device once per day)", () => {
    const { weeks } = summariseActive(WEEK_ROWS, TODAY, null);
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toEqual({ key: '2026-11-23', opened: 9, fresh: 1, six: 0 }); // 2 + 1 + 6, not 5 + 7 + 6
    expect(weeks[1]).toEqual({ key: '2026-11-16', opened: 4, fresh: 0, six: 0 });
    expect(weeks[7].key).toBe('2026-10-05');
  });

  it('sets the last 28 days of week-six returns against the new devices of the 28 days 35 days earlier', () => {
    // Returns window: 30 Oct to 26 Nov. Cohort window: 25 Sep to 22 Oct.
    const rows: ActiveCountRow[] = [
      { day: '2026-09-24', event: 'device.new', n: 40 }, // a day before the cohort window
      { day: '2026-09-25', event: 'device.new', n: 3 },
      { day: '2026-10-22', event: 'device.new', n: 2 },
      { day: '2026-10-23', event: 'device.new', n: 50 }, // a day after it
      { day: '2026-10-29', event: 'week.six.opened', n: 7 }, // a day before the returns window
      { day: '2026-10-30', event: 'week.six.opened', n: 1 },
      { day: '2026-11-26', event: 'week.six.opened', n: 2 },
      { day: '2026-11-27', event: 'week.six.opened', n: 9 }, // today is not complete
    ];
    expect(summariseActive(rows, TODAY, '2026-09-19', '2026-09-19').weekSix).toEqual({ returns: 3, cohort: 5 });
  });

  it('holds the estimate back until the counts reach back 69 days, to the earliest start a return in the window can have', () => {
    // A return on 30 Oct (the window's first day) can come from a first open as early as 19 Sep (41 days before). Opened
    // any sooner, the estimate would miss the returns of devices that started just before the count and read low.
    const FROM = '2026-09-01'; // every platform counting well before
    expect(summariseActive(WEEK_ROWS, TODAY, null, FROM).weekSix).toBeNull();
    expect(summariseActive(WEEK_ROWS, TODAY, '2026-09-25', FROM)).toMatchObject({ weekSix: null, weekSixWait: 'history' });
    expect(summariseActive(WEEK_ROWS, TODAY, '2026-09-20', FROM).weekSix).toBeNull();
    expect(summariseActive(WEEK_ROWS, TODAY, '2026-09-19', FROM)).toMatchObject({ weekSix: { returns: 0, cohort: 0 }, weekSixWait: null });
  });

  it('waits for ACTIVE_COUNT_FROM, and counts its 69 days from the later of that and the first count', () => {
    // The web began on 1 September; the phones' builds went live on 1 October, so the estimate waits until 9 December.
    expect(summariseActive(WEEK_ROWS, TODAY, '2026-09-01', null)).toMatchObject({ weekSix: null, weekSixWait: 'from' });
    expect(summariseActive(WEEK_ROWS, TODAY, '2026-09-01', 'soon')).toMatchObject({ weekSix: null, weekSixWait: 'from' });
    expect(summariseActive(WEEK_ROWS, TODAY, '2026-09-01', '2026-10-01')).toMatchObject({ weekSix: null, weekSixWait: 'history' });
    expect(summariseActive(WEEK_ROWS, '2026-12-08', '2026-09-01', '2026-10-01').weekSixWait).toBe('history');
    expect(summariseActive(WEEK_ROWS, '2026-12-09', '2026-09-01', '2026-10-01').weekSixWait).toBeNull();
  });

  it('reads close to the true rate from its first day when new devices hold steady', () => {
    // Ten new devices a day from the day the count began, three in ten returning in their sixth week, spread evenly
    // over days 35 to 41. Devices from before the count never send a return.
    const first = '2026-09-19';
    const rows: ActiveCountRow[] = [];
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const startMs = Date.parse(`${first}T00:00:00Z`);
    const todayMs = Date.parse(`${TODAY}T00:00:00Z`);
    const returns = new Map<string, number>();
    for (let s = startMs; s < todayMs; s += 86_400_000) {
      rows.push({ day: day(s), event: 'device.new', n: 10 });
      for (let k = 35; k <= 41; k++) {
        const r = day(s + k * 86_400_000);
        returns.set(r, (returns.get(r) ?? 0) + 3 / 7);
      }
    }
    for (const [d, n] of returns) rows.push({ day: d, event: 'week.six.opened', n });
    const est = summariseActive(rows, TODAY, first, first).weekSix!;
    expect(est.returns / est.cohort).toBeCloseTo(0.3, 5);
  });

  it('reads back far enough for both the weeks table and the estimate', () => {
    expect(activeCutoff(TODAY)).toBe('2026-09-25');
  });

  it('draws the section: yesterday as the headline, and devices, not people, said plainly', () => {
    const html = renderActive(summariseActive(WEEK_ROWS, TODAY, null, '2026-09-01'));
    expect(html).toContain('<h2>Active devices</h2>');
    expect(html).toContain('7 yesterday');
    expect(html).toContain('5 so far today · 9 this week so far · 4 last week');
    expect(html).toContain('Devices, not people');
    expect(html).toContain('not enough history yet');
  });

  it('states the estimate with its counts, and says when there is nothing to estimate from', () => {
    const base = summariseActive([], TODAY, null);
    expect(renderActive({ ...base, weekSix: { returns: 3, cohort: 5 } })).toContain('Week six: about 60% (3 of 5).');
    expect(renderActive({ ...base, weekSix: { returns: 0, cohort: 0 } })).toContain('no new devices in the matching four weeks yet');
    expect(renderActive(null)).toContain('could not be read');
    expect(renderActive(base)).toContain('Week six: waiting for ACTIVE_COUNT_FROM');
    expect(renderActive(summariseActive([], TODAY, '2026-11-01', '2026-11-01'))).toContain('not enough history yet');
  });

  it('keeps the four names out of the general events table, which reads as feature use', () => {
    const html = renderAnalyticsHtml({
      ...DATA,
      appEvents28d: [
        { event: 'day.opened', n: 40 },
        { event: 'settle.opened', n: 8 },
      ],
    });
    expect(html).toContain('<td>settle.opened</td>');
    expect(html).not.toContain('<td>day.opened</td>');
  });

  it('reads the real table with the real SQL, and puts the section after Money', async () => {
    const db = await sqliteD1();
    const put = db.raw.prepare('INSERT INTO app_event_counts (day, event, n) VALUES (?, ?, ?)');
    for (const r of WEEK_ROWS) put.run(r.day, r.event, r.n);
    put.run('2026-09-01', 'day.opened', 1); // older than the cutoff: read only as the count's first day
    const res = await handleAnalytics(
      new Request('https://x/admin/analytics?token=t'),
      { ANALYTICS_TOKEN: 't', DB: db as unknown as NonNullable<AnalyticsEnv['DB']>, ACTIVE_COUNT_FROM: '2026-09-01' },
      Date.UTC(2026, 10, 27, 10),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('7 yesterday');
    expect(html).toContain('5 so far today · 9 this week so far · 4 last week');
    // The count began on 1 September and every platform was counting from then (ACTIVE_COUNT_FROM), more than 69 days
    // back, so the estimate is drawn (from nothing yet).
    expect(html).toContain('no new devices in the matching four weeks yet');
    expect(html.indexOf('<h2>Money</h2>')).toBeLessThan(html.indexOf('<h2>Active devices</h2>'));
    expect(html.indexOf('<h2>Active devices</h2>')).toBeLessThan(html.indexOf('<h2>AI spend</h2>'));
  });

  it('a failed read blanks only this section', async () => {
    const base = makeDb();
    const failing = {
      prepare: (sql: string) =>
        sql.includes("event IN ('day.opened'")
          ? {
              bind: () => {
                throw new Error('no such table: app_event_counts');
              },
            }
          : base.prepare(sql),
    } as unknown as NonNullable<AnalyticsEnv['DB']>;
    const res = await handleAnalytics(new Request('https://x/admin/analytics?token=t'), { ANALYTICS_TOKEN: 't', DB: failing }, Date.UTC(2026, 10, 27, 10));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('The counts could not be read just now.');
    expect(html).toContain('2 premium');
    expect(html).toContain('<h2>AI spend</h2>');
  });
});
