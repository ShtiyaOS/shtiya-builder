import { vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';

// Live-verification setup (T5.1–T5.4 manual verification pass) — deliberately
// NOT the same setup as tests/e2e/helpers/vitest.setup.ts, which mocks
// @/lib/gemini/vision and deletes GEMINI_API_KEY for determinism. This file
// exists specifically to make REAL calls (real Postgres via the local
// Docker Supabase stack, real Gemini Vision) rather than mocked ones.
//
// .env.test is loaded first (local Docker instance: 127.0.0.1:54321) so
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY point at the isolated local stack. .env.local
// (hosted project credentials) is then loaded WITHOUT override — dotenv
// never overwrites an already-set key — purely to pick up GEMINI_API_KEY,
// which .env.test doesn't carry. This never lets the hosted project's
// Supabase URL/keys leak in, only the Gemini key.
loadDotenv({ path: '.env.test' });
loadDotenv({ path: '.env.local' });

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    'GEMINI_API_KEY is not set (checked .env.test and .env.local) — the T5.3 ' +
      'live-verification case needs a real key to make an actual Gemini Vision call.',
  );
}

// Same reasoning as tests/e2e/helpers/vitest.setup.ts: replaces the app's
// real Supabase server client factory (which reads next/headers' cookies() —
// only valid inside a live Next.js request scope) with a bare mock, so
// layouts/pages/route handlers can be imported and called directly.
// tests/e2e/helpers/route-caller.ts's actAs() sets what each call resolves to.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Deliberately NOT mocking @/lib/gemini/vision and NOT deleting
// GEMINI_API_KEY here — this is the whole point of this setup file.
