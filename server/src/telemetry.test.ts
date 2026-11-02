import { describe, expect, it } from 'vitest';

import { AI_TEXT_DAYS, aiCallStatement, aiTextCutoff, extractUsage, outcomeStatement, purgeOldAiText, type AiCallLog, type D1LikeDatabase } from './telemetry';

describe('the AI-call log keeps text for 90 days (the privacy policy, 2026-11-03)', () => {
  const NOW = Date.UTC(2026, 10, 3, 5, 0, 0); // 2026-11-03 05:00:00 UTC

  it('cuts off exactly 90 days back, in the created_at form SQLite writes', () => {
    expect(AI_TEXT_DAYS).toBe(90);
    expect(aiTextCutoff(NOW)).toBe('2026-08-05 05:00:00');
  });

  it('clears only the text and the reply of older rows, and binds the cut-off', async () => {
    const calls: { sql: string; args: unknown[] }[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            calls.push({ sql, args });
            return {};
          },
        }),
      }),
    } as unknown as D1LikeDatabase;
    await purgeOldAiText(db, NOW);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe('UPDATE ai_calls SET input = NULL, output = NULL WHERE created_at < ?1 AND (input IS NOT NULL OR output IS NOT NULL)');
    expect(calls[0].args).toEqual(['2026-08-05 05:00:00']);
  });

  it('never throws, with no database or a failing one', async () => {
    await expect(purgeOldAiText(undefined, NOW)).resolves.toBeUndefined();
    const broken = { prepare: () => { throw new Error('d1 down'); } } as unknown as D1LikeDatabase;
    await expect(purgeOldAiText(broken, NOW)).resolves.toBeUndefined();
  });
});

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
