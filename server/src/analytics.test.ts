import { describe, expect, it } from 'vitest';

import { type AnalyticsData, type AnalyticsEnv, flywheelRate, handleAnalytics, mtdSpend, renderAnalyticsHtml } from './analytics';

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
    if (sql.includes("endpoint = 'decompose'")) return { n: 10 };
    if (sql.includes('COUNT(DISTINCT o.corr_id)')) return { n: 4 };
    if (sql.includes('SELECT COUNT(*) AS n FROM outcomes')) return { n: 9 };
    if (sql.includes('days_elapsed')) return { d: 2 };
    if (sql.includes('scrapbook_log')) return { n: 3 };
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
  scrapbooks28d: 3,
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
    expect(html).toContain('keepsakes made in the last 28 days');
    expect(html).toContain('noindex'); // never crawlable
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
