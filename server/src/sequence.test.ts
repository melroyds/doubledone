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

// The day's CONTEXT (2026-07-25). "Plan my day" used to send only task titles, so it ordered the day
// knowing nothing about the person having it. These assert the SHAPE of the ask, never the model's
// answer: each fact appears only when the person actually gave it.
describe('buildSequenceRequest day context', () => {
  const tasks = [{ id: 'a', title: 'Ring the dentist' }];
  const userText = (r: ReturnType<typeof buildSequenceRequest>) =>
    (JSON.parse(r.init.body) as { messages: { content: string }[] }).messages[0].content;

  it('says nothing about the day when nothing was answered', () => {
    const text = userText(buildSequenceRequest(tasks, 'k'));
    expect(text).not.toMatch(/work day|day off|indoors|out and about/i);
  });

  it('carries a work day and a day off distinctly', () => {
    expect(userText(buildSequenceRequest(tasks, 'k', undefined, undefined, 'work'))).toContain('Today is a work day.');
    expect(userText(buildSequenceRequest(tasks, 'k', undefined, undefined, 'off'))).toContain('Today is a day off.');
  });

  it('carries each setting distinctly', () => {
    expect(userText(buildSequenceRequest(tasks, 'k', undefined, undefined, undefined, 'indoors'))).toContain('staying indoors');
    expect(userText(buildSequenceRequest(tasks, 'k', undefined, undefined, undefined, 'out'))).toContain('out and about');
    expect(userText(buildSequenceRequest(tasks, 'k', undefined, undefined, undefined, 'either'))).toContain('indoor or outdoor');
  });

  it('combines energy, day and setting without losing the task list', () => {
    const text = userText(buildSequenceRequest(tasks, 'k', 'low', undefined, 'off', 'indoors'));
    expect(text).toContain('[a] Ring the dentist');
    expect(text).toContain('energy right now is low');
    expect(text).toContain('Today is a day off.');
    expect(text).toContain('staying indoors');
  });

  it('tells the model to use the context but never to comment on how they feel', () => {
    const sys = (JSON.parse(buildSequenceRequest(tasks, 'k').init.body) as { system: string }).system;
    expect(sys).toMatch(/kind of day is given/i);
    expect(sys).toMatch(/where they are/i);
    expect(sys).toMatch(/never comment on how they feel/i);
    // It must still refuse to move anything off today: context changes the ORDER, not the day.
    expect(sys).toMatch(/Order in place only/i);
  });
});
