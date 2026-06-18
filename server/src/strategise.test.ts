import { describe, expect, it } from 'vitest';

import { buildStrategiseRequest, parseStrategiseResponse, STRATEGISE_MODEL } from './strategise';

describe('buildStrategiseRequest', () => {
  it('targets the Anthropic messages API with the right shape and the tasks listed', () => {
    const { url, init } = buildStrategiseRequest(
      [
        { id: 't1', title: 'File the report' },
        { id: 't2', title: 'Call the dentist' },
      ],
      'sk-test-key',
    );
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-test-key');

    const body = JSON.parse(init.body);
    expect(body.model).toBe(STRATEGISE_MODEL);
    expect(typeof body.system).toBe('string');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_plan' });
    expect(body.tools[0].name).toBe('record_plan');
    expect(body.messages[0].content).toContain('t1');
    expect(body.messages[0].content).toContain('File the report');
  });
});

describe('parseStrategiseResponse', () => {
  it('extracts the plan from a tool_use response', () => {
    const data = {
      content: [
        { type: 'text', text: 'ignored' },
        {
          type: 'tool_use',
          name: 'record_plan',
          input: {
            plan: [
              { id: 't1', dayOffset: 0, reason: 'quick and worth keeping today' },
              { id: 't2', dayOffset: 2, reason: 'no rush, move it on' },
            ],
          },
        },
      ],
    };
    expect(parseStrategiseResponse(data)).toEqual([
      { id: 't1', dayOffset: 0, reason: 'quick and worth keeping today' },
      { id: 't2', dayOffset: 2, reason: 'no rush, move it on' },
    ]);
  });

  it('returns an empty array for malformed or missing tool output', () => {
    expect(parseStrategiseResponse(null)).toEqual([]);
    expect(parseStrategiseResponse({})).toEqual([]);
    expect(
      parseStrategiseResponse({
        content: [{ type: 'tool_use', name: 'record_plan', input: { plan: [{ id: 'x' }] } }],
      }),
    ).toEqual([]);
  });
});
