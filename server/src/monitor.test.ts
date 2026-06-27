import { describe, it, expect } from 'vitest';
import {
  modelCostUsd,
  spendUsd,
  projectMonthEnd,
  evaluateAlarms,
  suppressed,
  buildAlertBody,
  buildDigestBody,
  buildOwnerEmail,
  type Metric,
} from './monitor';

const baseMetric = (over: Partial<Metric> = {}): Metric => ({
  capUsd: 25,
  mtdUsd: 0,
  projectedUsd: 0,
  callsLastHour: 0,
  errorsLastHour: 0,
  errorByEndpoint: [],
  recentErrors: [],
  topEndpointsLastHour: [],
  scrapbookToday: 0,
  scrapbookMaxPerIp: 0,
  ...over,
});

describe('pricing', () => {
  it('costs Haiku / Sonnet / Opus by family, unknown models = 0', () => {
    expect(modelCostUsd('claude-haiku-4-5', 1_000_000, 1_000_000)).toBeCloseTo(6); // $1 in + $5 out
    expect(modelCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000)).toBeCloseTo(18); // $3 + $15
    expect(modelCostUsd('claude-opus-4-8', 1_000_000, 1_000_000)).toBeCloseTo(90); // $15 + $75
    expect(modelCostUsd('some-future-model', 1_000_000, 1_000_000)).toBe(0);
  });
  it('sums spend across per-model token rows', () => {
    expect(
      spendUsd([
        { model: 'claude-haiku-4-5', in_tok: 1_000_000, out_tok: 0 }, // $1
        { model: 'claude-sonnet-4-6', in_tok: 0, out_tok: 1_000_000 }, // $15
      ]),
    ).toBeCloseTo(16);
  });
});

describe('projectMonthEnd', () => {
  it('linearly projects month-to-date to the full month', () => {
    expect(projectMonthEnd(10, 10, 30)).toBeCloseTo(30); // $10 over 10 days -> $30 over 30
  });
  it('guards day 0 (no division)', () => {
    expect(projectMonthEnd(5, 0, 30)).toBe(5);
  });
});

describe('evaluateAlarms', () => {
  it('is silent when everything is calm', () => {
    expect(evaluateAlarms(baseMetric())).toEqual([]);
  });
  it('trips spend at 50% of the cap', () => {
    expect(evaluateAlarms(baseMetric({ mtdUsd: 13, projectedUsd: 13 })).map((a) => a.kind)).toContain('spend');
  });
  it('trips spend on the projection even when the absolute is still low', () => {
    expect(evaluateAlarms(baseMetric({ mtdUsd: 2, projectedUsd: 40 })).map((a) => a.kind)).toContain('spend');
  });
  it('needs both a floor AND a ratio for errors (a 2-of-2 blip is not an outage)', () => {
    expect(evaluateAlarms(baseMetric({ callsLastHour: 2, errorsLastHour: 2 })).map((a) => a.kind)).not.toContain('error');
    expect(
      evaluateAlarms(baseMetric({ callsLastHour: 10, errorsLastHour: 6, errorByEndpoint: [{ endpoint: 'decompose', errors: 6 }] })).map((a) => a.kind),
    ).toContain('error');
  });
  it('trips errors on the hard absolute floor regardless of rate', () => {
    expect(evaluateAlarms(baseMetric({ callsLastHour: 1000, errorsLastHour: 10 })).map((a) => a.kind)).toContain('error');
  });
  it('trips the scrapbook budget, the per-source abuse, and the volume guards', () => {
    expect(evaluateAlarms(baseMetric({ scrapbookToday: 30 })).map((a) => a.kind)).toContain('scrapbook-budget');
    expect(evaluateAlarms(baseMetric({ scrapbookMaxPerIp: 16 })).map((a) => a.kind)).toContain('scrapbook-abuse');
    expect(evaluateAlarms(baseMetric({ callsLastHour: 150 })).map((a) => a.kind)).toContain('volume');
  });
});

describe('suppressed (dedup window)', () => {
  const now = 1000 * 3_600_000;
  it('never suppresses a first-ever alert', () => {
    expect(suppressed(null, now, 6)).toBe(false);
  });
  it('suppresses within the window, allows after it', () => {
    expect(suppressed(now - 1 * 3_600_000, now, 6)).toBe(true); // 1h ago, 6h window
    expect(suppressed(now - 7 * 3_600_000, now, 6)).toBe(false); // 7h ago
  });
});

describe('alert body is information-poor by construction', () => {
  it('carries counts, endpoints and error strings, never task text or an IP', () => {
    const m = baseMetric({
      callsLastHour: 20,
      errorsLastHour: 10,
      errorByEndpoint: [{ endpoint: 'decompose', errors: 10 }],
      recentErrors: ['upstream 529'],
    });
    const body = buildAlertBody(evaluateAlarms(m), '2026-06-27T20:00:00.000Z');
    expect(body).toContain('decompose');
    expect(body).toContain('upstream 529');
    expect(body).toContain('Information-poor by design');
    expect(body).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/); // no IPv4 can appear
  });
});

describe('digest body', () => {
  it('summarises the pulse with the spend percent and the top endpoint', () => {
    const body = buildDigestBody(
      { capUsd: 25, mtdUsd: 5, callsToday: 40, errorsToday: 0, premiumNow: 2, trialsActive: 1, newPremiumToday: 1, scrapbookToday: 3, reminders: 4, topEndpoints: [{ endpoint: 'split', calls: 20 }] },
      '2026-06-27T20:00:00.000Z',
    );
    expect(body).toContain('daily pulse');
    expect(body).toContain('$5.00 of $25.00 (20%)');
    expect(body).toContain('split: 20');
  });
});

describe('buildOwnerEmail', () => {
  it('is a well-formed message with the subject and a base64 body', () => {
    const raw = buildOwnerEmail({
      from: 'feedback@doubledone.app',
      to: 'me@example.com',
      subject: '[DoubleDone] test',
      body: 'hello',
      uuid: 'u-1',
      date: 'Sat, 27 Jun 2026 20:00:00 GMT',
    });
    expect(raw).toContain('Subject: [DoubleDone] test');
    expect(raw).toContain('To: me@example.com');
    expect(raw).toContain('Content-Transfer-Encoding: base64');
    expect(raw.split('\r\n\r\n')[1].trim()).toBe(btoa('hello'));
  });
  it('keeps the subject a single header line (no injection from a code-built subject)', () => {
    const raw = buildOwnerEmail({ from: 'a@b', to: 'c@d', subject: 'one line', body: 'x', uuid: 'u', date: 'd' });
    expect(raw.split('\r\n').filter((l) => l.startsWith('Subject:')).length).toBe(1);
  });
});
