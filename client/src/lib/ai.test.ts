import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clarify,
  decompose,
  DEFAULT_QUESTIONS,
  parsePlan,
  parsePlanResult,
  parseQuestions,
  parseSteps,
  parseTriage,
  plan,
  strategise,
  split,
  triage,
} from './ai';

describe('parseSteps', () => {
  it('keeps well-formed steps', () => {
    expect(
      parseSteps({
        steps: [
          { title: 'Open the door', minutes: 2 },
          { title: 'Bin one thing', minutes: 5 },
        ],
      }),
    ).toEqual([
      { title: 'Open the door', minutes: 2 },
      { title: 'Bin one thing', minutes: 5 },
    ]);
  });

  it('returns [] for malformed data', () => {
    expect(parseSteps(null)).toEqual([]);
    expect(parseSteps({})).toEqual([]);
    expect(parseSteps({ steps: [{ title: 'no minutes' }] })).toEqual([]);
  });
});

describe('decompose', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the task to /decompose and returns parsed steps (mocked, no live call)', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        ({ ok: true, json: async () => ({ steps: [{ title: 'Open it', minutes: 2 }] }) }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const steps = await decompose('clean the garage');
    expect(steps).toEqual([{ title: 'Open it', minutes: 2 }]);

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).task).toBe('clean the garage');
  });

  it('sends the qualifying answers as context', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        ({ ok: true, json: async () => ({ steps: [] }) }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    await decompose('clean the garage', {
      dueDate: '2026-06-25',
      spread: 'gradual',
      question: 'How full is it?',
      answer: 'Very.',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.context).toEqual({
      dueDate: '2026-06-25',
      spread: 'gradual',
      question: 'How full is it?',
      answer: 'Very.',
    });
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(decompose('x')).rejects.toThrow();
  });
});

describe('parsePlanResult', () => {
  it('keeps well-formed phases and first steps', () => {
    expect(
      parsePlanResult({
        plan: {
          phases: [{ title: 'Prep', focus: 'ready it' }],
          firstSteps: [{ title: 'Photograph rooms', minutes: 15 }],
        },
      }),
    ).toEqual({
      phases: [{ title: 'Prep', focus: 'ready it' }],
      firstSteps: [{ title: 'Photograph rooms', minutes: 15 }],
    });
  });

  it('returns empty arrays for malformed data', () => {
    expect(parsePlanResult(null)).toEqual({ phases: [], firstSteps: [] });
    expect(parsePlanResult({})).toEqual({ phases: [], firstSteps: [] });
    expect(parsePlanResult({ plan: { phases: [{ title: 'no focus' }], firstSteps: [{ title: 'no minutes' }] } })).toEqual(
      { phases: [], firstSteps: [] },
    );
  });
});

describe('plan', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the task + context to /plan and returns the parsed plan (mocked, no live call)', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        ({
          ok: true,
          json: async () => ({
            plan: { phases: [{ title: 'Prep', focus: 'x' }], firstSteps: [{ title: 'Start', minutes: 2 }] },
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await plan(
      'sell the house',
      { dueDate: '2026-07-15', spread: 'gradual', question: 'q', answer: 'a' },
      'French',
    );
    expect(result.phases).toEqual([{ title: 'Prep', focus: 'x' }]);
    expect(result.firstSteps).toEqual([{ title: 'Start', minutes: 2 }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.task).toBe('sell the house');
    expect(body.context.dueDate).toBe('2026-07-15');
    expect(body.language).toBe('French');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(plan('x')).rejects.toThrow();
  });
});

describe('parseQuestions', () => {
  it('keeps a well-formed question set (no suggested date)', () => {
    expect(parseQuestions({ questions: { dueDate: 'when?', spread: 'how?', custom: 'what?' } })).toEqual({
      dueDate: 'when?',
      spread: 'how?',
      custom: 'what?',
      suggestedDueDate: null,
    });
  });

  it('keeps a valid suggested due date, ignores a malformed one', () => {
    expect(
      parseQuestions({ questions: { dueDate: 'a', spread: 'b', custom: 'c', suggestedDueDate: '2026-07-15' } })
        ?.suggestedDueDate,
    ).toBe('2026-07-15');
    expect(
      parseQuestions({ questions: { dueDate: 'a', spread: 'b', custom: 'c', suggestedDueDate: 'July 15' } })
        ?.suggestedDueDate,
    ).toBeNull();
  });

  it('returns null for malformed or missing questions', () => {
    expect(parseQuestions(null)).toBeNull();
    expect(parseQuestions({})).toBeNull();
    expect(parseQuestions({ questions: null })).toBeNull();
    expect(parseQuestions({ questions: { dueDate: 'only one' } })).toBeNull();
  });
});

describe('clarify', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the task to /clarify and returns the parsed questions (mocked, no live call)', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        ({
          ok: true,
          json: async () => ({ questions: { dueDate: 'when?', spread: 'how?', custom: 'what?' } }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const q = await clarify('clean the garage', 'Italian');
    expect(q).toEqual({ dueDate: 'when?', spread: 'how?', custom: 'what?', suggestedDueDate: null });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.task).toBe('clean the garage');
    expect(body.language).toBe('Italian');
  });

  it('falls back to default questions when the backend returns none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ questions: null }) }) as unknown as Response),
    );
    expect(await clarify('x')).toEqual(DEFAULT_QUESTIONS);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(clarify('x')).rejects.toThrow();
  });
});

describe('parsePlan', () => {
  it('keeps well-formed plan items', () => {
    expect(
      parsePlan({
        plan: [
          { id: 'a', dayOffset: 0, reason: 'keep today' },
          { id: 'b', dayOffset: 2, reason: 'can wait' },
        ],
      }),
    ).toEqual([
      { id: 'a', dayOffset: 0, reason: 'keep today' },
      { id: 'b', dayOffset: 2, reason: 'can wait' },
    ]);
  });

  it('returns [] for malformed data', () => {
    expect(parsePlan(null)).toEqual([]);
    expect(parsePlan({})).toEqual([]);
    expect(parsePlan({ plan: [{ id: 'a' }] })).toEqual([]);
  });
});

describe('strategise', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the tasks to /strategise and returns the parsed plan (mocked, no live call)', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        ({ ok: true, json: async () => ({ plan: [{ id: 't1', dayOffset: 1, reason: 'tomorrow' }] }) }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await strategise([{ id: 't1', title: 'A' }], 'Spanish');
    expect(result).toEqual([{ id: 't1', dayOffset: 1, reason: 'tomorrow' }]);

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).tasks[0].id).toBe('t1');
    expect(JSON.parse(init.body).language).toBe('Spanish');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(strategise([{ id: 'x', title: 'X' }])).rejects.toThrow();
  });
});

describe('parseTriage', () => {
  it('keeps items with a valid bucket, drops the rest', () => {
    expect(
      parseTriage({
        items: [
          { text: 'A', bucket: 'today' },
          { text: 'B', bucket: 'later' },
          { text: 'C', bucket: 'decompose' },
          { text: 'D', bucket: 'someday' },
          { bucket: 'today' },
        ],
      }),
    ).toEqual([
      { text: 'A', bucket: 'today' },
      { text: 'B', bucket: 'later' },
      { text: 'C', bucket: 'decompose' },
    ]);
  });

  it('returns [] for malformed data', () => {
    expect(parseTriage(null)).toEqual([]);
    expect(parseTriage({})).toEqual([]);
  });
});

describe('triage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the lines to /triage and returns the parsed items (mocked, no live call)', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        ({ ok: true, json: async () => ({ items: [{ text: 'Call mum', bucket: 'today' }] }) }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const items = await triage(['Call mum']);
    expect(items).toEqual([{ text: 'Call mum', bucket: 'today' }]);

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).lines[0]).toBe('Call mum');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(triage(['x'])).rejects.toThrow();
  });
});

describe('split', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the text to /split and returns the parsed items (mocked, no live call)', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        ({ ok: true, json: async () => ({ items: ['buy milk', 'walk the dog'] }) }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const items = await split('buy milk and walk the dog');
    expect(items).toEqual(['buy milk', 'walk the dog']);

    const url = fetchMock.mock.calls[0][0];
    const init = fetchMock.mock.calls[0][1];
    expect(url).toContain('/split');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).text).toBe('buy milk and walk the dog');
  });

  it('trims and drops empty items, then throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: ['  a ', '', 'b'] }) }) as unknown as Response));
    expect(await split('a and b')).toEqual(['a', 'b']);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(split('x')).rejects.toThrow();
  });
});
