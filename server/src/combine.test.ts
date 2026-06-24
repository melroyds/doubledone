import { describe, expect, it } from 'vitest';

import { buildCombineRequest, COMBINE_MODEL, parseCombineResponse } from './combine';

describe('buildCombineRequest', () => {
  it('targets the Anthropic messages API with the auth headers', () => {
    const { url, init } = buildCombineRequest(['buy milk', 'buy bread'], 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('forces the record_umbrella tool on the Haiku model and carries the titles', () => {
    const { init } = buildCombineRequest(['buy milk', 'buy bread'], 'sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(COMBINE_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_umbrella' });
    expect(body.tools[0].name).toBe('record_umbrella');
    expect(body.messages[0].content).toContain('buy milk');
    expect(body.messages[0].content).toContain('buy bread');
  });
});

describe('parseCombineResponse', () => {
  it('pulls the umbrella title out of the tool-use block, trimmed', () => {
    const data = {
      content: [{ type: 'tool_use', name: 'record_umbrella', input: { title: '  Do the grocery shop ' } }],
    };
    expect(parseCombineResponse(data)).toBe('Do the grocery shop');
  });

  it('returns "" for a null, malformed, empty, or wrong-tool response', () => {
    expect(parseCombineResponse(null)).toBe('');
    expect(parseCombineResponse({})).toBe('');
    expect(parseCombineResponse({ content: [{ type: 'text', text: 'hi' }] })).toBe('');
    expect(parseCombineResponse({ content: [{ type: 'tool_use', name: 'other', input: { title: 'x' } }] })).toBe('');
    expect(
      parseCombineResponse({ content: [{ type: 'tool_use', name: 'record_umbrella', input: { title: '   ' } }] }),
    ).toBe('');
  });
});
