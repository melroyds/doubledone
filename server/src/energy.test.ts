import { describe, expect, it } from 'vitest';

import { buildEnergyRequest, ENERGY_MODEL, parseEnergyLevel, parseEnergyResponse, parseEnergyTasks } from './energy';

const TASKS = [
  { id: 'a', title: 'Reply to Dana' },
  { id: 'b', title: 'Draft the proposal', big: true },
];

describe('buildEnergyRequest', () => {
  it('targets the Anthropic API with the auth headers', () => {
    const { url, init } = buildEnergyRequest(TASKS, 'low', 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('forces the record_pick tool on the Haiku model, carries the energy and the list with big marks', () => {
    const { init } = buildEnergyRequest(TASKS, 'good', 'sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(ENERGY_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_pick' });
    expect(body.messages[0].content).toContain('My energy right now is good');
    expect(body.messages[0].content).toContain('a: Reply to Dana');
    expect(body.messages[0].content).toContain('b: Draft the proposal (big)');
  });

  it('asks for the reply in the given language', () => {
    const { init } = buildEnergyRequest(TASKS, 'low', 'sk-test', 'Italian');
    expect(JSON.parse(init.body).system).toContain('Italian');
  });
});

describe('parseEnergyLevel', () => {
  it('accepts the three levels and defaults junk to medium', () => {
    expect(parseEnergyLevel('low')).toBe('low');
    expect(parseEnergyLevel('good')).toBe('good');
    expect(parseEnergyLevel('turbo')).toBe('medium');
    expect(parseEnergyLevel(undefined)).toBe('medium');
  });
});

describe('parseEnergyTasks (defensive)', () => {
  it('keeps well-formed tasks, trims titles, preserves big', () => {
    expect(parseEnergyTasks([{ id: 'a', title: '  Water plants  ', big: true }])).toEqual([{ id: 'a', title: 'Water plants', big: true }]);
  });
  it('drops junk rows and non-arrays', () => {
    expect(parseEnergyTasks([{ id: '', title: 'x' }, { id: 'a' }, null, 'nope', { id: 'b', title: 'ok' }])).toEqual([
      { id: 'b', title: 'ok' },
    ]);
    expect(parseEnergyTasks('all of it')).toEqual([]);
  });
  it('caps the list at 50 so a hostile payload cannot run up input tokens', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}` }));
    expect(parseEnergyTasks(many)).toHaveLength(50);
  });
});

describe('parseEnergyResponse', () => {
  const valid = new Set(['a', 'b']);

  it('returns the pick when the id was actually sent', () => {
    const data = { content: [{ type: 'tool_use', name: 'record_pick', input: { id: 'a', line: ' A small easy win. ' } }] };
    expect(parseEnergyResponse(data, valid)).toEqual({ id: 'a', line: 'A small easy win.' });
  });

  it('rejects a hallucinated id (never reaches the client)', () => {
    const data = { content: [{ type: 'tool_use', name: 'record_pick', input: { id: 'zzz', line: 'Made up.' } }] };
    expect(parseEnergyResponse(data, valid)).toBeNull();
  });

  it('returns null for a null, malformed, or wrong-tool response', () => {
    expect(parseEnergyResponse(null, valid)).toBeNull();
    expect(parseEnergyResponse({}, valid)).toBeNull();
    expect(parseEnergyResponse({ content: [{ type: 'text', text: 'hi' }] }, valid)).toBeNull();
    expect(parseEnergyResponse({ content: [{ type: 'tool_use', name: 'other', input: { id: 'a', line: 'x' } }] }, valid)).toBeNull();
  });
});
