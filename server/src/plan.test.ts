import { describe, expect, it } from 'vitest';

import { buildPlanRequest, parsePlanResponse, PLAN_MODEL } from './plan';

describe('buildPlanRequest', () => {
  it('targets the Anthropic messages API with the plan tool forced', () => {
    const { url, init } = buildPlanRequest('sell the house', 'sk-test-key');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-test-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(PLAN_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_plan' });
    expect(body.tools[0].input_schema.required).toEqual(['phases', 'firstSteps']);
    expect(body.messages[0].content).toContain('sell the house');
  });

  it('folds the qualifying answers into the user message', () => {
    const { init } = buildPlanRequest('sell the house', 'k', {
      dueDate: '2026-07-15',
      spread: 'gradual',
      question: 'Any repairs?',
      answer: 'New roof needed.',
    });
    const content = JSON.parse(init.body).messages[0].content as string;
    expect(content).toContain('2026-07-15');
    expect(content).toContain('gradually');
    expect(content).toContain('New roof needed.');
  });
});

describe('parsePlanResponse', () => {
  it('extracts phases and the first phase steps', () => {
    const data = {
      content: [
        {
          type: 'tool_use',
          name: 'record_plan',
          input: {
            phases: [
              { title: 'Prepare to sell', focus: 'Get the house ready' },
              { title: 'List and market', focus: 'Get it in front of buyers' },
            ],
            firstSteps: [
              { title: 'Photograph every room', minutes: 15 },
              { title: 'Book three valuations', minutes: 20 },
            ],
          },
        },
      ],
    };
    expect(parsePlanResponse(data)).toEqual({
      phases: [
        { title: 'Prepare to sell', focus: 'Get the house ready' },
        { title: 'List and market', focus: 'Get it in front of buyers' },
      ],
      firstSteps: [
        { title: 'Photograph every room', minutes: 15 },
        { title: 'Book three valuations', minutes: 20 },
      ],
    });
  });

  it('drops malformed phases and steps, never throws', () => {
    expect(parsePlanResponse(null)).toEqual({ phases: [], firstSteps: [] });
    expect(parsePlanResponse({})).toEqual({ phases: [], firstSteps: [] });
    const data = {
      content: [
        {
          type: 'tool_use',
          name: 'record_plan',
          input: {
            phases: [{ title: 'Keep', focus: 'ok' }, { title: 'no focus' }],
            firstSteps: [{ title: 'Keep', minutes: 5 }, { title: 'no minutes' }],
          },
        },
      ],
    };
    expect(parsePlanResponse(data)).toEqual({
      phases: [{ title: 'Keep', focus: 'ok' }],
      firstSteps: [{ title: 'Keep', minutes: 5 }],
    });
  });
});
