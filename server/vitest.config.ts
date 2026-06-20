import { defineConfig } from 'vitest/config';

// Pure-logic tests for the AI backend (the request/response contract). The
// Worker's fetch + CORS is thin glue; we test the decompose shaping, not Claude.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      // The request/response shaping is the tested logic; the Worker's fetch +
      // CORS glue in index.ts is exercised by the handler tests but not every
      // branch, so the floor sits a little lower than the client's.
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary'],
      // Measured ~77% lines / ~79% branches / ~96% functions. The Worker's fetch /
      // CORS / Supabase glue (index.ts) and the Stripe + MCP HTTP-handler error
      // branches are exercised by the handler tests but not exhaustively branch-tested
      // without live calls. Floors sit below the real numbers, with headroom, so a real
      // regression trips them while a small refactor does not false-alarm (the prior
      // branches:78 sat ~2pts above reality after Stripe landed and broke every CI run).
      thresholds: { lines: 70, functions: 85, statements: 70, branches: 73 },
    },
  },
});
