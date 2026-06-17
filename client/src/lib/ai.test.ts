import { afterEach, describe, expect, it, vi } from 'vitest';

import { decompose, parseSteps } from './ai';

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
