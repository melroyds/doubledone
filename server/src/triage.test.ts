import { describe, expect, it } from 'vitest';

import { buildTriageRequest, parseTriageResponse, TRIAGE_MODEL } from './triage';

describe('buildTriageRequest', () => {
  it('targets the Anthropic messages API with the right shape and the lines listed', () => {
    const { url, init } = buildTriageRequest(['Call the dentist', 'Plan the wedding'], 'sk-test-key');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-test-key');

    const body = JSON.parse(init.body);
    expect(body.model).toBe(TRIAGE_MODEL);
    expect(typeof body.system).toBe('string');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_triage' });
    expect(body.tools[0].name).toBe('record_triage');
    expect(body.messages[0].content).toContain('Call the dentist');
    expect(body.messages[0].content).toContain('Plan the wedding');
  });
});

describe('parseTriageResponse', () => {
  it('extracts the triaged items from a tool_use response', () => {
    const data = {
      content: [
        { type: 'text', text: 'ignored' },
        {
          type: 'tool_use',
          name: 'record_triage',
          input: {
            items: [
              { text: 'Call the dentist', bucket: 'today' },
              { text: 'Plan the wedding', bucket: 'decompose' },
              { text: 'Read that book', bucket: 'later' },
            ],
          },
        },
      ],
    };
    expect(parseTriageResponse(data)).toEqual([
      { text: 'Call the dentist', bucket: 'today' },
      { text: 'Plan the wedding', bucket: 'decompose' },
      { text: 'Read that book', bucket: 'later' },
    ]);
  });

  it('drops items with an unknown bucket or missing text, and handles malformed input', () => {
    expect(parseTriageResponse(null)).toEqual([]);
    expect(parseTriageResponse({})).toEqual([]);
    expect(
      parseTriageResponse({
        content: [
          {
            type: 'tool_use',
            name: 'record_triage',
            input: {
              items: [
                { text: 'Keep me', bucket: 'today' },
                { text: 'Bad bucket', bucket: 'someday' },
                { bucket: 'later' },
              ],
            },
          },
        ],
      }),
    ).toEqual([{ text: 'Keep me', bucket: 'today' }]);
  });
});
