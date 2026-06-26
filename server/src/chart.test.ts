import { describe, expect, it } from 'vitest';

import { buildChartRequest, CHART_MODEL, parseChartContext, parseChartResponse } from './chart';

describe('buildChartRequest', () => {
  it('targets the messages API, forces the record_course tool, and includes the goal', () => {
    const { url, init } = buildChartRequest('run a half marathon', 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(CHART_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_course' });
    expect(body.tools[0].name).toBe('record_course');
    expect(body.messages[0].content).toContain('run a half marathon');
  });

  it('folds a target date into the user message when given', () => {
    const { init } = buildChartRequest('learn guitar', 'k', { dueDate: '2026-12-01' });
    expect(JSON.parse(init.body).messages[0].content).toContain('2026-12-01');
  });
});

describe('parseChartResponse', () => {
  it('extracts heading + steps from a record_course tool_use block', () => {
    const data = {
      content: [
        {
          type: 'tool_use',
          name: 'record_course',
          input: { heading: 'Toward your 10k', steps: [{ title: 'Lace up shoes', minutes: 2 }, { title: 'Walk ten minutes', minutes: 10 }] },
        },
      ],
    };
    expect(parseChartResponse(data)).toEqual({
      heading: 'Toward your 10k',
      steps: [{ title: 'Lace up shoes', minutes: 2 }, { title: 'Walk ten minutes', minutes: 10 }],
    });
  });

  it('drops malformed steps and never throws on null, {}, or a no-tool response', () => {
    expect(parseChartResponse(null)).toEqual({ heading: '', steps: [] });
    expect(parseChartResponse({})).toEqual({ heading: '', steps: [] });
    expect(
      parseChartResponse({
        content: [{ type: 'tool_use', name: 'record_course', input: { heading: 'x', steps: [{ title: 'ok', minutes: 5 }, { title: 'no minutes' }] } }],
      }),
    ).toEqual({ heading: 'x', steps: [{ title: 'ok', minutes: 5 }] });
  });
});

describe('parseChartContext', () => {
  it('keeps a valid ISO dueDate and rejects anything else', () => {
    expect(parseChartContext({ dueDate: '2026-08-01' })).toEqual({ dueDate: '2026-08-01' });
    expect(parseChartContext({ dueDate: 'soon' })).toEqual({ dueDate: null });
    expect(parseChartContext({})).toEqual({ dueDate: null });
    expect(parseChartContext(null)).toBeUndefined();
    expect(parseChartContext('x')).toBeUndefined();
  });
});
