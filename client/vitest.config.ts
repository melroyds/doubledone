import { defineConfig } from 'vitest/config';

// Risk-targeted logic tests only (date math, the telemetry/AI contract, the
// store and decomposition parser as they land). Pure TypeScript in a node
// environment — no React Native transform, no component rendering. See
// docs/testing.md for what we deliberately do not test.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
