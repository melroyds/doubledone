import { describe, expect, it } from 'vitest';

import { buildClarifyRequest, CLARIFY_MODEL, parseClarifyResponse } from './clarify';

describe('buildClarifyRequest', () => {
  it('targets the Anthropic messages API with the questions tool forced', () => {
    const { url, init } = buildClarifyRequest('clean the garage', 'sk-test-key');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-test-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(CLARIFY_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_questions' });
    expect(body.tools[0].name).toBe('record_questions');
    expect(body.tools[0].input_schema.required).toEqual([
      'dueDateQuestion',
      'spreadQuestion',
      'customQuestion',
      'suggestedDueDate',
    ]);
    expect(body.messages[0].content).toContain('clean the garage');
  });
});

describe('parseClarifyResponse', () => {
  it('extracts the three questions and an explicit due date from a tool_use response', () => {
    const data = {
      content: [
        {
          type: 'tool_use',
          name: 'record_questions',
          input: {
            dueDateQuestion: 'By when do you want the house sold?',
            spreadQuestion: 'Spread it over months, or in intensive blocks?',
            customQuestion: 'Any repairs or clutter to handle first?',
            suggestedDueDate: '2026-07-15',
          },
        },
      ],
    };
    expect(parseClarifyResponse(data)).toEqual({
      dueDate: 'By when do you want the house sold?',
      spread: 'Spread it over months, or in intensive blocks?',
      custom: 'Any repairs or clutter to handle first?',
      suggestedDueDate: '2026-07-15',
    });
  });

  it('nulls a missing or malformed suggested date instead of trusting it', () => {
    const make = (suggestedDueDate: unknown) => ({
      content: [
        {
          type: 'tool_use',
          name: 'record_questions',
          input: { dueDateQuestion: 'a', spreadQuestion: 'b', customQuestion: 'c', suggestedDueDate },
        },
      ],
    });
    expect(parseClarifyResponse(make(''))?.suggestedDueDate).toBeNull();
    expect(parseClarifyResponse(make('next month'))?.suggestedDueDate).toBeNull();
    expect(parseClarifyResponse(make('2026-07-15'))?.suggestedDueDate).toBe('2026-07-15');
  });

  it('returns null for malformed or missing tool output', () => {
    expect(parseClarifyResponse(null)).toBeNull();
    expect(parseClarifyResponse({})).toBeNull();
    expect(parseClarifyResponse({ content: [{ type: 'text', text: 'no tool' }] })).toBeNull();
    expect(
      parseClarifyResponse({
        content: [{ type: 'tool_use', name: 'record_questions', input: { dueDateQuestion: 'only one' } }],
      }),
    ).toBeNull();
  });
});
