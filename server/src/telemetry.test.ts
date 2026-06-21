import { describe, expect, it } from 'vitest';

import { aiCallStatement, extractUsage, outcomeStatement, type AiCallLog } from './telemetry';

const sampleLog: AiCallLog = {
  endpoint: 'decompose',
  model: 'claude-sonnet-4-6',
  input: { task: 'clean the garage' },
  output: { steps: [{ title: 'Open the door', minutes: 2 }] },
  inputTokens: 120,
  outputTokens: 45,
  latencyMs: 1300,
  ok: true,
};

describe('aiCallStatement', () => {
  it('builds a parameterised ai_calls insert, JSON-encoding input/output, with no user identity', () => {
    const { sql, params } = aiCallStatement(sampleLog);
    expect(sql).toMatch(/^INSERT INTO ai_calls/);
    expect(sql).not.toMatch(/user_id/); // pseudonymous by design
    expect(params).toEqual([
      'decompose',
      'claude-sonnet-4-6',
      JSON.stringify({ task: 'clean the garage' }),
      JSON.stringify({ steps: [{ title: 'Open the door', minutes: 2 }] }),
      120,
      45,
      1300,
      1, // ok -> 1 for SQLite
      null, // no error
      null, // no corr_id (only /plan sets it)
    ]);
  });

  it('carries an error, null output, and ok=0 on a failed call', () => {
    const { params } = aiCallStatement({
      ...sampleLog,
      ok: false,
      output: null,
      inputTokens: null,
      outputTokens: null,
      error: 'upstream 502',
    });
    expect(params[3]).toBeNull(); // output
    expect(params[7]).toBe(0); // ok -> 0
    expect(params[8]).toBe('upstream 502'); // error
  });

  it('has one placeholder per bound param', () => {
    const { sql, params } = aiCallStatement(sampleLog);
    expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
  });
});

describe('outcomeStatement', () => {
  it('builds a parameterised outcomes insert with no identity, just id + timing', () => {
    const { sql, params } = outcomeStatement({ corrId: 'd-abc', stepsTotal: 4, daysElapsed: 3 });
    expect(sql).toMatch(/^INSERT INTO outcomes/);
    expect(sql).not.toMatch(/user_id/); // pseudonymous by design
    expect(params).toEqual(['d-abc', 4, 3]);
    expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
  });

  it('allows a null step total', () => {
    expect(outcomeStatement({ corrId: 'd-x', stepsTotal: null, daysElapsed: 0 }).params).toEqual(['d-x', null, 0]);
  });
});

describe('extractUsage', () => {
  it('pulls input/output token counts from an Anthropic response', () => {
    expect(extractUsage({ usage: { input_tokens: 120, output_tokens: 45 } })).toEqual({ input: 120, output: 45 });
  });

  it('returns nulls for missing or malformed usage instead of throwing', () => {
    expect(extractUsage(null)).toEqual({ input: null, output: null });
    expect(extractUsage({})).toEqual({ input: null, output: null });
    expect(extractUsage({ usage: { input_tokens: 'lots' } })).toEqual({ input: null, output: null });
  });
});
