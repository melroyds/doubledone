import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  chart,
  clarify,
  decompose,
  defaultQuestions,
  dropAiConnectors,
  lookbackSummary,
  makeScrapbook,
  ocr,
  parsePlan,
  parsePlanResult,
  parseQuestions,
  parseSteps,
  parseTriage,
  plan,
  premiumHeaders,
  type PremiumResult,
  PURCHASER_HEADER,
  PURGE_BATCH,
  PURGE_RETRY_MS,
  purgeScrapbookImages,
  sequence,
  split,
  strategise,
  tiny,
  triage,
} from './ai';

import { purchaserProof } from './purchases';
import { authHeader } from './supabase';

vi.mock('./supabase', () => ({ authHeader: vi.fn(), supabase: null, isSyncConfigured: false }));
const authHeaderMock = vi.mocked(authHeader);
// The device's purchase proof (lib/purchases): on an iPhone without an account, its anonymous RevenueCat id.
vi.mock('./purchases', () => ({ purchaserProof: vi.fn(async () => null) }));
const proofMock = vi.mocked(purchaserProof);

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
    expect(await clarify('x')).toEqual(defaultQuestions());
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

describe('tiny', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the task to /tiny and returns the trimmed tiny action', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        ({ ok: true, json: async () => ({ tiny: '  Find the file.  ' }) }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await tiny('Do my taxes')).toBe('Find the file.');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).task).toBe('Do my taxes');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    await expect(tiny('x')).rejects.toThrow();
  });
});

// Premium without an account (2026-11-03). The four Premium AI calls carry ONE credential: the session's bearer
// whenever there is one, else an iPhone's anonymous purchase id, and they say why they missed instead of handing the
// screen an empty value that read as the AI's answer ("Try rephrasing the goal?" to a request that never left).
const ANON = '$RCAnonymousID:0123456789abcdef0123456789abcdef';

type Init = { method: string; headers: Record<string, string>; body: string };
const reply = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init: Init) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response);

type PremiumCase = {
  name: string;
  path: string;
  run: () => Promise<PremiumResult<unknown>>;
  sent: Record<string, unknown>;
  answer: unknown;
  value: unknown;
  empty: unknown;
  emptyValue: unknown;
};

const PREMIUM_CALLS: PremiumCase[] = [
  {
    name: 'ocr (Scan)',
    path: '/ocr',
    run: () => ocr('BASE64IMG', 'image/jpeg', 'en'),
    sent: { image: 'BASE64IMG', mediaType: 'image/jpeg', language: 'en' },
    answer: { tasks: ['  Buy milk ', '', 'Call mum'] },
    value: ['Buy milk', 'Call mum'], // trimmed, blanks dropped
    empty: { tasks: [] },
    emptyValue: [],
  },
  {
    name: 'lookbackSummary (Reflect on this week)',
    path: '/lookback-summary',
    run: () => lookbackSummary(['Ran', 'Read'], 'en'),
    sent: { titles: ['Ran', 'Read'], language: 'en' },
    answer: { summary: '  A steady week.  ' },
    value: 'A steady week.',
    empty: { summary: '' },
    emptyValue: '',
  },
  {
    name: 'chart (Chart a course)',
    path: '/chart',
    run: () => chart('run a 10k', { dueDate: '2027-03-01' }, 'en'),
    sent: { goal: 'run a 10k', context: { dueDate: '2027-03-01' }, language: 'en' },
    answer: { course: { heading: 'Toward a 10k', steps: [{ title: 'Walk for 20 minutes', minutes: 20 }] } },
    value: { heading: 'Toward a 10k', steps: [{ title: 'Walk for 20 minutes', minutes: 20 }] },
    empty: { course: { heading: '', steps: [] } },
    emptyValue: { heading: '', steps: [] },
  },
  {
    name: 'sequence (Plan my day)',
    path: '/sequence',
    run: () => sequence([{ id: 'a', title: 'Email' }], 'low', 'en', 'work', 'indoors'),
    sent: { tasks: [{ id: 'a', title: 'Email' }], energy: 'low', language: 'en', day: 'work', setting: 'indoors' },
    answer: { order: [{ id: 'a', reason: 'A small one first.' }] },
    value: [{ id: 'a', reason: 'A small one first.' }],
    empty: { order: [] },
    emptyValue: [],
  },
];

describe.each(PREMIUM_CALLS)('$name, a Premium AI call', (c) => {
  afterEach(() => {
    vi.unstubAllGlobals();
    authHeaderMock.mockReset();
    proofMock.mockReset();
  });

  it('signed in: sends the bearer and never the purchase header, even when the phone holds a proof', async () => {
    authHeaderMock.mockResolvedValue({ Authorization: 'Bearer test-token' });
    proofMock.mockResolvedValue(ANON);
    const f = reply(200, c.answer);
    vi.stubGlobal('fetch', f);
    expect(await c.run()).toEqual({ ok: true, value: c.value });
    const [url, init] = f.mock.calls[0];
    expect(url.endsWith(c.path)).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json', Authorization: 'Bearer test-token' });
    expect(JSON.parse(init.body)).toEqual(c.sent);
    expect(proofMock).not.toHaveBeenCalled(); // a session decides before the proof is even read
  });

  it('signed out on an iPhone with a purchase: sends the purchase header and no Authorization', async () => {
    authHeaderMock.mockResolvedValue(null);
    proofMock.mockResolvedValue(ANON);
    const f = reply(200, c.answer);
    vi.stubGlobal('fetch', f);
    expect(await c.run()).toEqual({ ok: true, value: c.value });
    const init = f.mock.calls[0][1];
    expect(init.headers).toEqual({ 'content-type': 'application/json', [PURCHASER_HEADER]: ANON });
    expect(JSON.parse(init.body)).toEqual(c.sent); // the id rides the header only, never the body
  });

  it('neither: no request at all, and not_confirmed', async () => {
    authHeaderMock.mockResolvedValue(null);
    proofMock.mockResolvedValue(null);
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await c.run()).toEqual({ ok: false, miss: 'not_confirmed' });
    expect(f).not.toHaveBeenCalled();
  });

  it('neither, in a browser that is offline: unavailable, so the screen can say offline', async () => {
    authHeaderMock.mockResolvedValue(null);
    proofMock.mockResolvedValue(null);
    vi.stubGlobal('navigator', { onLine: false });
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await c.run()).toEqual({ ok: false, miss: 'unavailable' });
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'not_confirmed'],
    [403, 'not_active'],
    [429, 'unavailable'],
    [500, 'unavailable'],
    [502, 'unavailable'],
    [503, 'unavailable'],
  ])('a %i says %s, whichever credential it carried', async (status, miss) => {
    for (const signedIn of [true, false]) {
      authHeaderMock.mockResolvedValue(signedIn ? { Authorization: 'Bearer t' } : null);
      proofMock.mockResolvedValue(ANON);
      vi.stubGlobal('fetch', reply(status, { error: 'premium required' }));
      expect(await c.run()).toEqual({ ok: false, miss });
    }
  });

  it('a network throw is unavailable, never a throw', async () => {
    authHeaderMock.mockResolvedValue(null);
    proofMock.mockResolvedValue(ANON);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    expect(await c.run()).toEqual({ ok: false, miss: 'unavailable' });
  });

  it('a 200 that is not JSON (the Worker answers plain text on a path it does not know) is unavailable, not an empty answer', async () => {
    authHeaderMock.mockResolvedValue({ Authorization: 'Bearer t' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token d in JSON');
        },
      }) as unknown as Response),
    );
    expect(await c.run()).toEqual({ ok: false, miss: 'unavailable' });
  });

  it("a 200 without the route's own field is unavailable too", async () => {
    authHeaderMock.mockResolvedValue({ Authorization: 'Bearer t' });
    for (const body of [{}, null, 'doubledone-ai', { error: 'x' }]) {
      vi.stubGlobal('fetch', reply(200, body));
      expect(await c.run()).toEqual({ ok: false, miss: 'unavailable' });
    }
  });

  it("the AI's own empty answer is an answer, for the screen's own empty line (Chart's is the only rephrase)", async () => {
    authHeaderMock.mockResolvedValue({ Authorization: 'Bearer t' });
    vi.stubGlobal('fetch', reply(200, c.empty));
    expect(await c.run()).toEqual({ ok: true, value: c.emptyValue });
  });
});

describe('premiumHeaders: one credential, never both', () => {
  afterEach(() => {
    authHeaderMock.mockReset();
    proofMock.mockReset();
  });

  it('is the account whenever there is a session, the purchase only without one, and null with neither', async () => {
    authHeaderMock.mockResolvedValue({ Authorization: 'Bearer me' });
    proofMock.mockResolvedValue(ANON);
    expect(await premiumHeaders()).toEqual({ kind: 'account', headers: { Authorization: 'Bearer me' } });
    authHeaderMock.mockResolvedValue(null);
    expect(await premiumHeaders()).toEqual({ kind: 'purchase', headers: { 'X-Purchaser-Token': ANON } });
    proofMock.mockResolvedValue(null);
    expect(await premiumHeaders()).toBeNull();
  });

  it('names the header so that Cloudflare logs its value as REDACTED (the name contains "token")', () => {
    expect(PURCHASER_HEADER).toBe('X-Purchaser-Token');
    expect(PURCHASER_HEADER.toLowerCase()).toContain('token');
  });

  it('never sends the purchase id from a call that is not one of the four Premium routes', async () => {
    authHeaderMock.mockResolvedValue(null);
    proofMock.mockResolvedValue(ANON);
    const f = reply(200, { image: 'data:image/jpeg;base64,AA', caption: '' });
    vi.stubGlobal('fetch', f);
    await makeScrapbook(['Did the thing']);
    expect(f.mock.calls[0][1].headers).toEqual({ 'content-type': 'application/json' });
    expect(proofMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

// 2026-10-05: a signed-in keepsake is tagged with its owner, and only the owner can purge it, so both calls
// carry the token when there is one (server/src/scrapbook-purge.ts).
describe('scrapbook keepsake ownership', () => {
  const IMAGE_ID = '0b9a7c3e-1f2d-4c5b-8a6e-9d0f1e2a3b4c.jpg';
  afterEach(() => {
    vi.unstubAllGlobals();
    authHeaderMock.mockReset();
  });
  const fetchOk = (body: unknown) =>
    vi.fn(async (_url: string, _init: { headers: Record<string, string>; body: string }) => ({ ok: true, json: async () => body }) as unknown as Response);

  it('makes a keepsake with the token when signed in, and without one when signed out', async () => {
    authHeaderMock.mockResolvedValue({ Authorization: 'Bearer me' });
    let f = fetchOk({ image: 'https://api.doubledone.app/scrapbook-img/' + IMAGE_ID, caption: 'c' });
    vi.stubGlobal('fetch', f);
    await makeScrapbook(['Did the thing']);
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer me');
    authHeaderMock.mockResolvedValue(null);
    f = fetchOk({ image: 'data:image/jpeg;base64,AA', caption: '' });
    vi.stubGlobal('fetch', f);
    await makeScrapbook(['Did the thing']);
    expect(f.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('purges with the token captured before the delete, never asking the (signed-out) session', async () => {
    authHeaderMock.mockResolvedValue(null); // the session is already gone
    const f = fetchOk({ ok: true });
    vi.stubGlobal('fetch', f);
    await purgeScrapbookImages(['https://api.doubledone.app/scrapbook-img/' + IMAGE_ID, 'data:image/jpeg;base64,AA'], { Authorization: 'Bearer before' });
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer before');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ keys: [IMAGE_ID] });
    expect(authHeaderMock).not.toHaveBeenCalled();
  });

  it('retries once, with the same token, when the Worker refused anything (a verifier blip)', async () => {
    vi.useFakeTimers();
    try {
      const f = vi
        .fn(async (_url: string, _init: { headers: Record<string, string>; body: string }) => ({ ok: true, json: async () => ({ ok: true, deleted: 0, refused: 1 }) }) as unknown as Response)
        .mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ok: true, deleted: 0, refused: 1 }) }) as unknown as Response);
      vi.stubGlobal('fetch', f);
      const done = purgeScrapbookImages(['https://api.doubledone.app/scrapbook-img/' + IMAGE_ID], { Authorization: 'Bearer before' });
      await vi.advanceTimersByTimeAsync(PURGE_RETRY_MS);
      await done;
      expect(f).toHaveBeenCalledTimes(2);
      expect(f.mock.calls[1][1].headers.Authorization).toBe('Bearer before');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry when nothing was refused', async () => {
    const f = fetchOk({ ok: true, deleted: 1, refused: 0 });
    vi.stubGlobal('fetch', f);
    await purgeScrapbookImages(['https://api.doubledone.app/scrapbook-img/' + IMAGE_ID], { Authorization: 'Bearer before' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  // #3: the account delete now purges what the device holds AND what the account's rows name, which overlap.
  it('asks once per picture, however many times it is named', async () => {
    const f = fetchOk({ ok: true, deleted: 1, refused: 0 });
    vi.stubGlobal('fetch', f);
    const url = 'https://api.doubledone.app/scrapbook-img/' + IMAGE_ID;
    await purgeScrapbookImages([url, url, url], { Authorization: 'Bearer before' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ keys: [IMAGE_ID] });
  });

  // The Worker deletes at most PURGE_BATCH keys a call and silently drops the rest; the account's rows can name more.
  it('sends a long list in batches the Worker accepts, so nothing past the cap is left behind', async () => {
    const f = fetchOk({ ok: true, deleted: 1, refused: 0 });
    vi.stubGlobal('fetch', f);
    const many = Array.from({ length: PURGE_BATCH + 3 }, (_, i) => `https://api.doubledone.app/scrapbook-img/k${i}.jpg`);
    await purgeScrapbookImages(many, { Authorization: 'Bearer before' });
    expect(f).toHaveBeenCalledTimes(2);
    const sent = f.mock.calls.map((c) => (JSON.parse(c[1].body) as { keys: string[] }).keys);
    expect(sent[0]).toHaveLength(PURGE_BATCH);
    expect(sent[1]).toEqual([`k${PURGE_BATCH}.jpg`, `k${PURGE_BATCH + 1}.jpg`, `k${PURGE_BATCH + 2}.jpg`]);
    expect(f.mock.calls.every((c) => c[1].headers.Authorization === 'Bearer before')).toBe(true);
  });

  it('a malformed address is skipped, never thrown, so the wipe after it still runs', async () => {
    const f = fetchOk({ ok: true, deleted: 1, refused: 0 });
    vi.stubGlobal('fetch', f);
    await expect(
      purgeScrapbookImages(['https://api.doubledone.app/scrapbook-img/%E0%A4%A', 'https://api.doubledone.app/scrapbook-img/' + IMAGE_ID], { Authorization: 'Bearer before' }),
    ).resolves.toBeUndefined();
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ keys: [IMAGE_ID] });
  });

  it('falls back to the current session when no token is handed in, and to none at all', async () => {
    authHeaderMock.mockResolvedValue({ Authorization: 'Bearer now' });
    let f = fetchOk({ ok: true });
    vi.stubGlobal('fetch', f);
    await purgeScrapbookImages(['https://api.doubledone.app/scrapbook-img/' + IMAGE_ID]);
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer now');
    f = fetchOk({ ok: true });
    vi.stubGlobal('fetch', f);
    await purgeScrapbookImages(['https://api.doubledone.app/scrapbook-img/' + IMAGE_ID], null);
    expect(f.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});

describe('dropAiConnectors (account deletion)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the kill switch with the token captured before the delete', async () => {
    const f = vi.fn(async (_url: string, _init: { method: string; headers: Record<string, string> }) => ({ ok: true }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    await dropAiConnectors({ Authorization: 'Bearer before' });
    expect(f.mock.calls[0][0]).toContain('/mcp/disconnect');
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer before' } });
  });

  it('does nothing without a token, and never throws', async () => {
    const f = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', f);
    await dropAiConnectors(null);
    expect(f).not.toHaveBeenCalled();
    await expect(dropAiConnectors({ Authorization: 'Bearer x' })).resolves.toBeUndefined();
  });
});
