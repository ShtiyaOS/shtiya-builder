# T4.16 — End-to-End Deal Lifecycle Integration Test

`deal-lifecycle.spec.ts` walks the full deal lifecycle — Owner block
assembly → Acquisition lead → Legal PSA execution → Capital draw funding →
Contractor milestone upload → Vision approval → Escrow release → Property
handoff — asserting both business-state transitions and RLS enforcement at
every hop.

## How it invokes the app

Route handlers (`src/app/api/**/route.ts`) are **imported and called
directly** as plain functions — there is no live `next dev`/`next start`
server involved.

This works because `next/headers`' `cookies()` (which requires a live
Next.js request scope) is used in exactly one place in this codebase:
`src/lib/supabase/server.ts`. `tests/e2e/helpers/vitest.setup.ts` replaces
that module entirely with `vi.mock('@/lib/supabase/server', ...)`, so no
route handler ever touches `cookies()` during the test run.
`tests/e2e/helpers/route-caller.ts`'s `actAs(client)` sets what the next
`createClient()` call resolves to — a real, already-signed-in
`@supabase/supabase-js` client for a specific per-role test user, so
`supabase.auth.getUser()` and RLS both see the correct `auth.uid()`
end-to-end, exactly as they would in production.

`NextRequest`/`NextResponse` have no server-context dependency (they're
Fetch API wrappers), so they're constructed directly via
`jsonRequest()`/`formRequest()` in `route-caller.ts`.

## Prerequisites

1. A local Supabase stack with all migrations applied:
   ```sh
   supabase start
   supabase db reset   # applies supabase/migrations/*.sql, including
                        # 0007_write_policies.sql and 0008_milestones_bucket.sql
   ```
2. `.env.local` (see `.env.example`) with `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` — all
   three are printed by `supabase status -o env`.

## Running

```sh
npm install
npm run test:e2e
```

## Determinism / no external network calls

- `src/lib/gemini/vision.ts`'s `inspectMilestone()` is mocked
  (`vi.mock('@/lib/gemini/vision')`) so `vision_inspections.blocks_draw` is
  set deterministically per test case instead of depending on a real model
  call.
- `GEMINI_API_KEY` is deleted from `process.env` for the whole run
  (`vitest.setup.ts`), so `POST /api/leads`' embedding call short-circuits
  to `null` without making a network request (see "Known gap" below).
- `ESCROW_RPC_URL` / `ESCROW_CONTRACT_ADDRESS` / `ESCROW_PRIVATE_KEY` are
  deleted for the same reason — this is also what the app itself treats as
  "Web3 not configured," so `POST /api/escrow/release` and
  `POST /api/draws/approve` take their built-in DB-only fallback path
  (`mock-tx-<timestamp>`), which the test asserts against directly.

## Gaps this test surfaced — now fixed

Both were discovered while building this test and have since been fixed
(source changes, not test-only workarounds):

- **Anonymous lead matching (T4.15) never actually found a match under RLS.**
  `match_properties()` (0005) runs `SECURITY INVOKER`, and `properties`' only
  SELECT policy (`properties_owner_access`, 0002) requires
  `owner_id = auth.uid()` / admin / agreement-party — all false for an
  anonymous caller (`auth.uid()` is `NULL`). Fixed in `POST /api/leads` by
  routing that one lookup through `src/lib/supabase/admin.ts`'s
  `createAdminClient()` (service-role, bypasses RLS) instead of the regular
  RLS-scoped client — the lead itself is still stored via the regular
  client. See the "fix verification" test in `deal-lifecycle.spec.ts`'s
  Acquisition-lead block, which proves the bypass directly (anon client
  gets zero rows, admin client finds the seeded property) without depending
  on a real Gemini call.
- **`POST /api/escrow/release`'s final `.update()` had no `.select()` or
  row-count check.** If that update were ever blocked by RLS, the route
  would still have returned HTTP 200 with a fabricated tx hash while the
  ledger row silently stayed unchanged. Fixed by appending `.select().single()`
  so a 0-row update now throws `PGRST116`, which the route maps to a 403
  ("release was NOT recorded") instead of a false 200.
  `POST /api/draws/approve`'s equivalent update already had `.select().single()`
  and didn't have this bug — it was given the same PGRST116 → 403 status-code
  refinement for consistency.
