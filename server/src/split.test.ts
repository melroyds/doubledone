import { describe, expect, it } from 'vitest';

import { buildSplitRequest, parseSplitResponse, SPLIT_MODEL } from './split';

describe('buildSplitRequest', () => {
  it('targets the Anthropic messages API with the auth headers', () => {
    const { url, init } = buildSplitRequest('buy milk and walk the dog', 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('forces the record_split tool on the Haiku model and carries the text', () => {
    const { init } = buildSplitRequest('buy milk and walk the dog', 'sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(SPLIT_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_split' });
    expect(body.tools[0].name).toBe('record_split');
    expect(body.messages[0].content).toContain('buy milk and walk the dog');
  });
});

describe('parseSplitResponse', () => {
  it('pulls the items out of the tool-use block, trimmed', () => {
    const data = {
      content: [{ type: 'tool_use', name: 'record_split', input: { items: ['buy milk', '  walk the dog '] } }],
    };
    expect(parseSplitResponse(data)).toEqual(['buy milk', 'walk the dog']);
  });

  it('drops empty / whitespace entries', () => {
    const data = { content: [{ type: 'tool_use', name: 'record_split', input: { items: ['buy milk', '', '   '] } }] };
    expect(parseSplitResponse(data)).toEqual(['buy milk']);
  });

  it('returns a single entry when there is only one thing', () => {
    const data = { content: [{ type: 'tool_use', name: 'record_split', input: { items: ['call the dentist'] } }] };
    expect(parseSplitResponse(data)).toEqual(['call the dentist']);
  });

  it('returns [] for a null, malformed, or wrong-tool response', () => {
    expect(parseSplitResponse(null)).toEqual([]);
    expect(parseSplitResponse({})).toEqual([]);
    expect(parseSplitResponse({ content: [{ type: 'text', text: 'hi' }] })).toEqual([]);
    expect(parseSplitResponse({ content: [{ type: 'tool_use', name: 'other', input: { items: ['x'] } }] })).toEqual([]);
  });
});
