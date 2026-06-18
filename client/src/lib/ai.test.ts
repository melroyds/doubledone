import { afterEach, describe, expect, it, vi } from 'vitest';

import { decompose, parsePlan, parseSteps, strategise } from './ai';

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

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(decompose('x')).rejects.toThrow();
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

    const plan = await strategise([{ id: 't1', title: 'A' }]);
    expect(plan).toEqual([{ id: 't1', dayOffset: 1, reason: 'tomorrow' }]);

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).tasks[0].id).toBe('t1');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(strategise([{ id: 'x', title: 'X' }])).rejects.toThrow();
  });
});
