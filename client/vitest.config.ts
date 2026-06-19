import { defineConfig } from 'vitest/config';

// Risk-targeted logic tests only (date math, the telemetry/AI contract, the
// store and decomposition parser as they land). Pure TypeScript in a node
// environment, no React Native transform, no component rendering. See
// docs/testing.md for what we deliberately do not test.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      // Scope the floor to the pure logic we deliberately test (lib/), not the
      // screens / components / SDK seams we deliberately do not (see docs/testing.md).
      // A whole-repo number would be coverage-theatre; this floor is real.
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // The thin I/O seams (AsyncStorage, Supabase, expo-* device APIs) are all
      // glue, no logic, and deliberately untested. Exclude them so the floor
      // measures the logic, not the seams.
      exclude: [
        '**/*.test.ts',
        'src/lib/storage.ts',
        'src/lib/supabase.ts',
        'src/lib/auth.ts',
        'src/lib/reminders.ts',
        'src/lib/locale.ts',
      ],
      reporter: ['text-summary'],
      // Measured ~98% lines / ~95% branches on the logic; floor set below that
      // with headroom so a genuinely untested new lib function trips CI.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
