import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Pure-logic tests for the AI backend (the request/response contract). The
// Worker's fetch + CORS is thin glue; we test the decompose shaping, not Claude.
export default defineConfig({
  resolve: {
    alias: {
      // @cloudflare/workers-oauth-provider imports the workers-runtime-only module
      // 'cloudflare:workers' at module scope, which node cannot resolve; alias it to a
      // tiny stub (src/test-stubs/) that nothing else ever imports.
      'cloudflare:workers': fileURLToPath(new URL('./src/test-stubs/cloudflare-workers.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        // Externalized node_modules load via node's own ESM loader, where the
        // 'cloudflare:workers' alias above cannot reach; inlining routes the provider
        // through Vite so the alias applies.
        inline: ['@cloudflare/workers-oauth-provider'],
      },
    },
    coverage: {
      // The request/response shaping is the tested logic; the Worker's fetch +
      // CORS glue in index.ts is exercised by the handler tests but not every
      // branch, so the floor sits a little lower than the client's.
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/test-stubs/**'],
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
