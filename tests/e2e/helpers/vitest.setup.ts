import { vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';

// Loads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY from .env.test for local runs. No-op in CI,
// where the workflow exports these into the job environment directly.
//
// Deliberately .env.test (local Docker instance: 127.0.0.1:54321), NOT
// .env.local — .env.local carries credentials for the hosted Supabase
// project. This suite inserts/updates/deletes real rows as part of the
// lifecycle narrative; pointing it at .env.local would run those mutations
// against live project data on every test run.
loadDotenv({ path: '.env.test' });

// Deliberately unset for the whole test run — this is what makes external
// calls deterministic and network-free:
//   - src/lib/gemini/vision.ts's inspectMilestone() is mocked directly
//     (below), so GEMINI_API_KEY doesn't affect it either way.
//   - src/app/api/leads/route.ts's private embedText() reads
//     GEMINI_API_KEY at module load time and short-circuits to `null`
//     when it's falsy (`if (!GEMINI_API_KEY) return null;`), so clearing
//     it here guarantees POST /api/leads never makes a real network call.
delete process.env.GEMINI_API_KEY;

// Also deliberately left unset (do not set these in CI either): with all
// three absent, src/lib/web3/escrow-contract.ts's getContract() is never
// reachable — both POST /api/draws/approve and POST /api/escrow/release
// skip their on-chain paths and take their built-in DB-only fallback.
delete process.env.ESCROW_RPC_URL;
delete process.env.ESCROW_CONTRACT_ADDRESS;
delete process.env.ESCROW_PRIVATE_KEY;

// Replaces the app's real Supabase server client factory (which reads
// next/headers' cookies() — only valid inside a live Next.js request scope)
// with a bare mock. tests/e2e/helpers/route-caller.ts's actAs() sets what
// each call resolves to. This is what makes importing route handlers
// directly (no live `next dev`/`next start` server) safe.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Replaces Gemini Vision inspection with a controllable mock so
// vision_inspections.blocks_draw is deterministic in tests instead of
// depending on a real model call. Individual tests set per-call behavior
// via vi.mocked(inspectMilestone).mockResolvedValueOnce(...).
vi.mock('@/lib/gemini/vision', () => ({
  inspectMilestone: vi.fn(),
}));
