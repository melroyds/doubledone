// A Supabase stand-in for the handler tests (mcp.test.ts, api.test.ts): a global fetch that answers each call
// in order and records what was sent, so a test can assert the reads, the writes and their order. Lifted out
// of the two test files so MCP and REST are driven the same way, which is what lets a parity test feed both
// surfaces the same answers and compare their writes. Not a test file itself (vitest only collects *.test.ts).

import { vi } from 'vitest';

export type Call = { url: string; init: RequestInit };

/** An answer that comes back not-ok with this status (a PostgREST 401, a 500), instead of a JSON body. */
export type Failure = { readonly failWith: number };
export const failWith = (status: number): Failure => ({ failWith: status });

function isFailure(a: unknown): a is Failure {
  return typeof a === 'object' && a !== null && typeof (a as { failWith?: unknown }).failWith === 'number';
}

/** An answer where the fetch itself rejects (the network dropped, the Worker's subrequest timed out), so the code
 *  under test never sees a status at all. */
export const REJECTS = Object.freeze({ rejects: true as const });
/** An answer that is a 200 whose body is not JSON (a gateway page in front of PostgREST), so `json()` throws. */
export const GARBLED = Object.freeze({ garbled: true as const });

/** Stub the global fetch: the nth call gets the nth answer (the last repeats once they run out). Returns the
 *  recorded calls, which fill in as the code under test runs. Pair with afterEach(vi.unstubAllGlobals). */
export function sequence(...answers: unknown[]): Call[] {
  const calls: Call[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = answers[Math.min(i++, answers.length - 1)];
    if (answer === REJECTS) throw new TypeError('fetch failed');
    if (answer === GARBLED) {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response;
    }
    if (isFailure(answer)) return { ok: false, status: answer.failWith, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => answer } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return calls;
}

/** A recorded call's JSON body. */
export const bodyOf = (c: Call) => JSON.parse(c.init.body as string) as Record<string, unknown>;

/** A recorded call's query parameters, decoded (PostgREST filters such as `slices->>done=eq.2`). */
export const paramsOf = (c: Call): Record<string, string> => Object.fromEntries(new URL(c.url).searchParams);
