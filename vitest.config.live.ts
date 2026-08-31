import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest config for the T5.1–T5.4 live-session verification pass. Separate
// from vitest.config.ts (the T4.16 deal-lifecycle suite) because that
// suite's setup deliberately mocks @/lib/gemini/vision and deletes
// GEMINI_API_KEY for determinism — this suite needs the opposite: a real
// Gemini Vision call to verify T5.3's prompt hardening actually round-trips.
// Everything else (local Docker Supabase, direct handler/layout/page
// imports, actAs()) is identical — see tests/e2e/helpers/vitest.setup.live.ts.
export default defineConfig({
  // This suite is the first to import actual .tsx components/pages (not
  // just route handlers), which need JSX transformed. Next.js's own SWC
  // build already does this correctly (automatic runtime — confirmed via
  // `next build`); esbuild (what Vite/Vitest uses) needs the same told to
  // it explicitly, or JSX like `<ShieldCheck />` in module-scope object
  // literals (e.g. SentinelPanel.tsx's STATUS_STYLE) throws
  // "ReferenceError: React is not defined" at import time.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/e2e/t5-live-verification.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['tests/e2e/helpers/vitest.setup.live.ts'],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
