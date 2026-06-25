import { describe, expect, it } from 'vitest';

import { buildSequenceRequest, parseEnergy, parseSequenceResponse, SEQUENCE_MODEL } from './sequence';

describe('buildSequenceRequest', () => {
  const tasks = [
    { id: 'a', title: 'Pay the rent' },
    { id: 'b', title: 'Call the dentist' },
  ];

  it('targets the messages API, forces the record_order tool, and lists each task id and title', () => {
    const { url, init } = buildSequenceRequest(tasks, 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(SEQUENCE_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_order' });
    expect(body.tools[0].name).toBe('record_order');
    expect(body.messages[0].content).toContain('[a] Pay the rent');
    expect(body.messages[0].content).toContain('[b] Call the dentist');
  });

  it('includes an energy line only when energy is given', () => {
    expect(JSON.parse(buildSequenceRequest(tasks, 'k', 'good').init.body).messages[0].content).toContain('energy right now is good');
    expect(JSON.parse(buildSequenceRequest(tasks, 'k').init.body).messages[0].content).not.toContain('energy right now');
  });
});

describe('parseSequenceResponse', () => {
  it('extracts [{id, reason}] from a record_order tool_use block', () => {
    const data = {
      content: [
        { type: 'tool_use', name: 'record_order', input: { order: [{ id: 'a', reason: 'a quick win first' }, { id: 'b', reason: 'then the call' }] } },
      ],
    };
    expect(parseSequenceResponse(data)).toEqual([{ id: 'a', reason: 'a quick win first' }, { id: 'b', reason: 'then the call' }]);
  });

  it('returns [] for null, {}, and a malformed item missing reason (never throws)', () => {
    expect(parseSequenceResponse(null)).toEqual([]);
    expect(parseSequenceResponse({})).toEqual([]);
    expect(parseSequenceResponse({ content: [{ type: 'tool_use', name: 'record_order', input: { order: [{ id: 'a' }] } }] })).toEqual([]);
  });
});

describe('parseEnergy', () => {
  it('passes the three known levels and rejects anything else', () => {
    expect(parseEnergy('low')).toBe('low');
    expect(parseEnergy('medium')).toBe('medium');
    expect(parseEnergy('good')).toBe('good');
    expect(parseEnergy('high')).toBeUndefined();
    expect(parseEnergy(null)).toBeUndefined();
    expect(parseEnergy(3)).toBeUndefined();
  });
});
