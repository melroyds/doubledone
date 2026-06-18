import { describe, expect, it } from 'vitest';

import { buildDecomposeRequest, DECOMPOSE_MODEL, parseDecomposeResponse } from './decompose';

describe('buildDecomposeRequest', () => {
  it('targets the Anthropic messages API with the right shape', () => {
    const { url, init } = buildDecomposeRequest('clean the garage', 'sk-test-key');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-test-key');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(init.body);
    expect(body.model).toBe(DECOMPOSE_MODEL);
    expect(typeof body.system).toBe('string');
    expect(body.system.length).toBeGreaterThan(0);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_steps' });
    expect(body.tools[0].name).toBe('record_steps');
    expect(body.messages[0].content).toContain('clean the garage');
  });

  it('folds the qualifying answers into the user message', () => {
    const { init } = buildDecomposeRequest('clean the garage', 'sk-test-key', {
      dueDate: '2026-06-25',
      spread: 'gradual',
      question: 'How full is it?',
      answer: 'Packed to the ceiling.',
    });
    const content = JSON.parse(init.body).messages[0].content as string;
    expect(content).toContain('clean the garage');
    expect(content).toContain('2026-06-25');
    expect(content).toContain('gradually');
    expect(content).toContain('Packed to the ceiling.');
  });
});

describe('parseDecomposeResponse', () => {
  it('extracts steps from a tool_use response', () => {
    const data = {
      content: [
        { type: 'text', text: 'ignored' },
        {
          type: 'tool_use',
          name: 'record_steps',
          input: {
            steps: [
              { title: 'Open the garage door', minutes: 2 },
              { title: 'Put one thing in the bin', minutes: 5 },
            ],
          },
        },
      ],
    };
    expect(parseDecomposeResponse(data)).toEqual([
      { title: 'Open the garage door', minutes: 2 },
      { title: 'Put one thing in the bin', minutes: 5 },
    ]);
  });

  it('returns an empty array for malformed or missing tool output', () => {
    expect(parseDecomposeResponse(null)).toEqual([]);
    expect(parseDecomposeResponse({})).toEqual([]);
    expect(parseDecomposeResponse({ content: [{ type: 'text', text: 'no tool here' }] })).toEqual([]);
    expect(
      parseDecomposeResponse({
        content: [{ type: 'tool_use', name: 'record_steps', input: { steps: [{ title: 'no minutes' }] } }],
      }),
    ).toEqual([]);
  });
});
