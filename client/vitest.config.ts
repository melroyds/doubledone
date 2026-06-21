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
      // The thin I/O seams (AsyncStorage, Supabase, the Stripe + entitlement fetch
      // client, expo-* device APIs) are all glue, no logic, and deliberately
      // untested. Exclude them so the floor measures the logic, not the seams.
      exclude: [
        '**/*.test.ts',
        'src/lib/storage.ts',
        'src/lib/supabase.ts',
        'src/lib/auth.ts',
        'src/lib/locale.ts',
        'src/lib/stripe.ts',
        // Platform / device / browser seams: pure glue around an OS or browser API,
        // no logic to test (the logic is extracted to tested pure modules, e.g.
        // nudge.ts, dictation.ts, inbound.ts). Each is a native .ts and/or a web
        // .web.ts half. Excluded so the floor measures real logic, not the seams.
        'src/lib/reminders.ts',
        'src/lib/reminders.web.ts',
        'src/lib/haptics.web.ts',
        'src/lib/share-intent.ts',
        'src/lib/share-intent.web.ts',
        'src/lib/speech.ts',
        'src/lib/speech.web.ts',
      ],
      reporter: ['text-summary'],
      // Measured ~98% lines / ~95% branches on the logic; floor set below that
      // with headroom so a genuinely untested new lib function trips CI.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
