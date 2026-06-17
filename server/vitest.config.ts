import { defineConfig } from 'vitest/config';

// Pure-logic tests for the AI backend (the request/response contract). The
// Worker's fetch + CORS is thin glue; we test the decompose shaping, not Claude.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
