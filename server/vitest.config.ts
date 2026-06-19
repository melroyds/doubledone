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
      // Measured ~71% lines (the Worker's fetch / CORS / Supabase glue in index.ts
      // is hard to unit-test without live calls; the request/response shaping it
      // routes to is ~100%). Floor set below the real number, with headroom.
      thresholds: { lines: 65, functions: 85, statements: 65, branches: 78 },
    },
  },
});
