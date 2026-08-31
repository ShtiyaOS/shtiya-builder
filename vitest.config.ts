import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest config for the T4.16 end-to-end deal-lifecycle integration test.
// Route handlers are imported directly (no live `next dev`/`next start`
// server) — see tests/e2e/README.md for why that's safe here.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/e2e/**/*.spec.ts'],
    // t5-live-verification.spec.ts needs its own setup (real Gemini calls,
    // JSX-importing component tests) — it's run separately via
    // `vitest.config.live.ts` / `npm run test:e2e:live`, never under this
    // (deliberately mocked/deterministic) config.
    exclude: ['**/node_modules/**', 'tests/e2e/t5-live-verification.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['tests/e2e/helpers/vitest.setup.ts'],
    // The lifecycle spec is a single linear narrative (each step depends on
    // DB state left by the previous one) — keep execution single-threaded.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
