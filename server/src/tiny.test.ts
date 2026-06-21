import { describe, expect, it } from 'vitest';

import { buildTinyRequest, parseTinyResponse, TINY_MODEL } from './tiny';

describe('buildTinyRequest', () => {
  it('targets the Anthropic API with the auth headers', () => {
    const { url, init } = buildTinyRequest('Do my taxes', 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('forces the record_tiny tool on the Haiku model and carries the task', () => {
    const { init } = buildTinyRequest('Do my taxes', 'sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(TINY_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_tiny' });
    expect(body.tools[0].name).toBe('record_tiny');
    expect(body.messages[0].content).toContain('Do my taxes');
  });
});

describe('parseTinyResponse', () => {
  it('pulls the tiny action out of the tool block, trimmed', () => {
    const data = { content: [{ type: 'tool_use', name: 'record_tiny', input: { tiny: "  Find last year's tax file.  " } }] };
    expect(parseTinyResponse(data)).toBe("Find last year's tax file.");
  });

  it('returns empty for a null, malformed, empty, or wrong-tool response', () => {
    expect(parseTinyResponse(null)).toBe('');
    expect(parseTinyResponse({})).toBe('');
    expect(parseTinyResponse({ content: [{ type: 'text', text: 'hi' }] })).toBe('');
    expect(parseTinyResponse({ content: [{ type: 'tool_use', name: 'record_tiny', input: { tiny: '   ' } }] })).toBe('');
    expect(parseTinyResponse({ content: [{ type: 'tool_use', name: 'other', input: { tiny: 'x' } }] })).toBe('');
  });
});
