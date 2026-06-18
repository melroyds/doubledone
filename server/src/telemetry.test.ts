import { describe, expect, it } from 'vitest';

import { buildAiCallInsert, extractUsage, type AiCallLog } from './telemetry';

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

describe('buildAiCallInsert', () => {
  it('targets the Supabase REST endpoint with the anon key and insert-only headers', () => {
    const req = buildAiCallInsert(
      { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' },
      sampleLog,
    );
    expect(req).not.toBeNull();
    expect(req!.url).toBe('https://proj.supabase.co/rest/v1/ai_calls');
    const headers = req!.init.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-key');
    expect(headers.authorization).toBe('Bearer anon-key');
    expect(headers.prefer).toBe('return=minimal');
    expect(headers['content-type']).toBe('application/json');
  });

  it('maps the log to a snake_case row with no user identity', () => {
    const req = buildAiCallInsert(
      { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' },
      sampleLog,
    );
    const row = JSON.parse(req!.init.body as string);
    expect(row).toEqual({
      endpoint: 'decompose',
      model: 'claude-sonnet-4-6',
      input: { task: 'clean the garage' },
      output: { steps: [{ title: 'Open the door', minutes: 2 }] },
      input_tokens: 120,
      output_tokens: 45,
      latency_ms: 1300,
      ok: true,
      error: null,
    });
    // Pseudonymous by design: never a user identifier.
    expect(Object.keys(row)).not.toContain('user_id');
  });

  it('returns null (skips logging) when telemetry is unconfigured', () => {
    expect(buildAiCallInsert({}, sampleLog)).toBeNull();
    expect(buildAiCallInsert({ SUPABASE_URL: 'https://proj.supabase.co' }, sampleLog)).toBeNull();
    expect(buildAiCallInsert({ SUPABASE_ANON_KEY: 'anon-key' }, sampleLog)).toBeNull();
  });

  it('carries an error and null output on a failed call', () => {
    const req = buildAiCallInsert(
      { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' },
      { ...sampleLog, ok: false, output: null, inputTokens: null, outputTokens: null, error: 'upstream 502' },
    );
    const row = JSON.parse(req!.init.body as string);
    expect(row.ok).toBe(false);
    expect(row.error).toBe('upstream 502');
    expect(row.output).toBeNull();
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
