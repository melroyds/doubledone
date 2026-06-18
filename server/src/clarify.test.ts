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
    expect(body.tools[0].input_schema.required).toEqual(['dueDateQuestion', 'spreadQuestion', 'customQuestion']);
    expect(body.messages[0].content).toContain('clean the garage');
  });
});

describe('parseClarifyResponse', () => {
  it('extracts the three questions from a tool_use response', () => {
    const data = {
      content: [
        {
          type: 'tool_use',
          name: 'record_questions',
          input: {
            dueDateQuestion: 'By when do you want the garage cleared?',
            spreadQuestion: 'Spread it over a few days, or do it all at once?',
            customQuestion: 'Roughly how full is it right now?',
          },
        },
      ],
    };
    expect(parseClarifyResponse(data)).toEqual({
      dueDate: 'By when do you want the garage cleared?',
      spread: 'Spread it over a few days, or do it all at once?',
      custom: 'Roughly how full is it right now?',
    });
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
