import { describe, expect, it } from 'vitest';

import { buildLookbackSummaryRequest, LOOKBACK_SUMMARY_MODEL, parseLookbackSummaryResponse } from './lookbackSummary';

describe('buildLookbackSummaryRequest', () => {
  it('targets the Anthropic messages API with the model, a system prompt, and the titles', () => {
    const { url, init } = buildLookbackSummaryRequest(['Pay the rent', 'Call the dentist'], 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(LOOKBACK_SUMMARY_MODEL);
    expect(typeof body.system).toBe('string');
    expect(body.messages[0].content).toContain('Pay the rent');
    expect(body.messages[0].content).toContain('Call the dentist');
  });

  it('sends no tools (a free-text paragraph, not a structured tool call)', () => {
    const { init } = buildLookbackSummaryRequest(['x'], 'k');
    expect(JSON.parse(init.body).tools).toBeUndefined();
  });
});

describe('parseLookbackSummaryResponse', () => {
  it('extracts and trims the paragraph from a text block', () => {
    expect(parseLookbackSummaryResponse({ content: [{ type: 'text', text: '  A calm, steady week.  ' }] })).toBe(
      'A calm, steady week.',
    );
  });

  it("returns '' for null, {}, and a no-text response (never throws)", () => {
    expect(parseLookbackSummaryResponse(null)).toBe('');
    expect(parseLookbackSummaryResponse({})).toBe('');
    expect(parseLookbackSummaryResponse({ content: [{ type: 'tool_use', name: 'x' }] })).toBe('');
  });
});
