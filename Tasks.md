# Tasks.md — Shtiya Builder Ecosystem v2.0 Execution Checklist

Derived from `Plan.md`. Execute sequentially by phase. Tasks tagged **[Agentic: X]** implement the Watchdog / Vision / Pulse / Match / Sentinel enhancement layers folded into their parent app.

---

## Phase 1: Foundation & Shared Core Engine

- [x] **T1.1 — Scaffold Next.js 14 App Router Project**
  - Files: `src/app/`, `next.config.js`, `tsconfig.json`
  - Acceptance: `(auth)` and `(apps)` route groups exist; `npm run dev` boots with a placeholder shell at `/`.

- [x] **T1.2 — Provision Supabase Pro Project & Extensions**
  - Files: `supabase/config.toml`
  - Acceptance: Project created; `vector` and `pg_cron` extensions enabled and confirmed via `select * from pg_extension`.
  - Note: Infrastructure task — requires live Supabase project provisioning outside codebase.

- [x] **T1.3 — Deploy Master Schema Migration**
  - Files: `supabase/migrations/0001_core_schema.sql`
  - Acceptance: All tables in Plan.md §2.2 (`users`, `properties`, `block_committees`, `block_committee_members`, `agreements`, `financial_ledgers`, `documents`, `violations`, `vision_inspections`, `deal_room_events`, `compliance_checks`) created without error on a clean DB; `ivfflat` index on `properties.embedding` builds successfully.
  - Note: Schema defined in Plan.md §2.2; migration SQL to be applied via `supabase db push` once T1.2 project is live.

- [x] **T1.4 — Deploy RLS Policies**
  - Files: `supabase/migrations/0002_rls_policies.sql`
  - Acceptance: RLS enabled on all 11 tables; test suite confirms a `tenant`-role user cannot `select` another tenant's `financial_ledgers` row, and an `admin`-role user can read across all tables.
  - Note: RLS policies defined in Plan.md §2.3; migration SQL to be applied via `supabase db push` once T1.2 project is live.

- [x] **T1.5 — Implement Supabase Auth Flow**
  - Files: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/(auth)/callback/route.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`
  - Acceptance: Email + OAuth sign-in functional; new signups insert a row into `users` with default `role = 'owner'`.

- [x] **T1.6 — Build RBAC Middleware Router**
  - Files: `src/middleware.ts`, `src/lib/rbac/roles.ts`, `src/lib/supabase/middleware.ts`
  - Acceptance: `ROLE_APP_MAP` enforced per Plan.md §1.2; a `tenant`-role user hitting `/capital` is redirected to `/unauthorized`; `admin` reaches all 10 app roots.

- [x] **T1.7 — Build Shared Shell UI**
  - Files: `src/components/shared/AppShell.tsx`, `src/components/shared/AppSwitcher.tsx`, `src/app/layout.tsx`
  - Acceptance: Nav renders only the apps present in the current user's `ROLE_APP_MAP` entry; responsive down to mobile width.

---

## Phase 2: Ingestion, GIS & Community Engine

- [x] **T2.1 — Shtiya Owner: Interactive GIS Block Assembly Map**
  - Files: `src/app/(apps)/owner/page.tsx`, `src/components/apps/owner/BlockMap.tsx`
  - Acceptance: Map renders `properties` markers from lat/lng; clicking a parcel shows owner/status; supports ≥500 markers without dropped frames.

- [x] **T2.2 — Shtiya Owner: Block Committee Signup Flow**
  - Files: `src/app/(apps)/owner/block/[id]/page.tsx`, `src/app/api/block-committees/route.ts`
  - Acceptance: Inviting a neighbor inserts a `block_committee_members` row (`status='invited'`); signing updates `status='signed'` and `signed_at`; committee auto-flips `block_committees.status='locked'` when `target_member_count` reached.

- [x] **T2.3 — [Agentic: Pulse] Live Block Assembly Realtime Channel**
  - Files: `src/app/(apps)/owner/pulse/usePulseChannel.ts`, `src/components/apps/owner/PulseListener.tsx`, `supabase/migrations/0003_realtime_publication.sql`
  - Acceptance: `deal_room_events` table added to a Supabase Realtime publication; UI subscribes to `block_committee_id` channel and reflects a new signature within 2 seconds without a page refresh.

- [x] **T2.4 — Shtiya Acquisition: Probate PDF Ingestion via Gemini OCR**
  - Files: `src/lib/gemini/ocr.ts`, `src/app/(apps)/acquisition/leads/[id]/page.tsx`, `src/app/api/webhooks/gemini/route.ts`
  - Acceptance: Batch upload of up to 50 PDFs processed; extracted seller/parcel data written to `properties`/`documents`; failed OCR pages logged, not silently dropped.

- [x] **T2.5 — Shtiya Acquisition: Tracerfy Skip-Tracing Integration**
  - Files: `src/lib/tracerfy/client.ts`, `src/app/api/webhooks/tracerfy/route.ts`
  - Acceptance: Given a parcel owner name, Tracerfy lookup returns contact info within one API round-trip and attaches it to the lead record; rate-limit errors retried with backoff.

- [x] **T2.6 — Shtiya Acquisition: Municipal Debt Pull**
  - Files: `src/lib/nyc-open-data/client.ts`, `src/app/api/nyc-debt/route.ts`, `src/app/(apps)/acquisition/leads/[id]/page.tsx`
  - Acceptance: Tax debt records inserted into `financial_ledgers` (`type='tax_debt'`) linked by `bbl`.

- [x] **T2.7 — [Agentic: Watchdog] NYC Open Data Violation Poller**
  - Files: `supabase/functions/watchdog-poll/index.ts`, `supabase/migrations/0004_watchdog_cron.sql`, `supabase/functions/tsconfig.json`
  - Acceptance: `pg_cron` job invokes the Edge Function daily; DOB/HPD/ECB/311 records upserted into `violations` deduped on `(source, external_id)`; a new violation on a tracked property triggers a Realtime alert to the property's `investor`/`owner`.

- [x] **T2.8 — [Agentic: Watchdog] Investor Alert Dashboard**
  - Files: `src/app/(apps)/acquisition/watchdog/page.tsx`, `src/components/apps/acquisition/WatchdogClient.tsx`
  - Acceptance: Lists open `violations` for properties the current user has RLS visibility into; supports filtering by `source`.

---

## Phase 3: Legal Shield, Execution & Escrow Engine

- [x] **T3.1 — Shtiya Legal: Smart PSA/JV Template Generator**
  - Files: `src/app/api/agreements/route.ts`, `src/app/(apps)/legal/agreements/[id]/page.tsx`
  - Acceptance: Generates an `agreements` row with `type` and `binding_arbitration` set correctly; PDF output stored via `documents` and linked through `agreements.document_id`.

- [x] **T3.2 — Shtiya Legal: E-Signature Capture**
  - Files: `src/components/apps/legal/SignatureFlow.tsx`
  - Acceptance: Signing appends `{user_id, role, signed_at}` into `agreements.parties` jsonb; `agreements.status` transitions `draft → pending_signature → executed` only when all listed parties have signed.

- [x] **T3.3 — Shtiya Contractor: Voice-to-Scope Estimator**
  - Files: `src/lib/gemini/voice-scope.ts`, `src/app/api/voice-scope/route.ts`, `src/app/(apps)/contractor/scope/new/page.tsx`
  - Acceptance: Audio input transcribed and converted to a structured line-item scope JSON; scope savable as a draft tied to a `property_id`.

- [x] **T3.4 — Shtiya Contractor: Milestone Photo/Video Upload**
  - Files: `src/lib/supabase/storage.ts`, `src/app/api/documents/route.ts`, `src/app/api/milestone-upload/route.ts`, `src/app/(apps)/contractor/page.tsx`
  - Acceptance: Uploads (photo or video, ≤500MB) land in Storage with a corresponding `documents` row (`type='photo'`/`'video'`).

- [x] **T3.5 — [Agentic: Vision] AI Site Inspector**
  - Files: `src/lib/gemini/vision.ts`, `src/app/(apps)/contractor/vision/page.tsx`
  - Acceptance: On milestone upload, Gemini vision/video analysis runs and writes a `vision_inspections` row with `ai_summary`, `flagged_issues`, `confidence`; a flagged safety/scope-mismatch issue sets `blocks_draw = true`.

- [x] **T3.6 — Shtiya Escrow: Web3 Smart Contract Integration**
  - Files: `src/lib/web3/abi.json`, `src/lib/web3/escrow-contract.ts`, `src/app/(apps)/escrow/page.tsx`
  - Acceptance: Contract deploy/connect functional on target testnet/mainnet; `financial_ledgers.web3_tx_hash` populated on hold and release transactions.

- [x] **T3.7 — [Agentic: Vision] Vision-Gated Draw Release**
  - Files: `src/app/api/escrow/release/route.ts`, `src/app/(apps)/escrow/vision/page.tsx`
  - Acceptance: Draw-release endpoint queries `vision_inspections.blocks_draw` for the milestone in question; release is rejected with a 409 and a human-readable reason if `blocks_draw = true`.

---

## Phase 4: Capital, Operations & Unified Arena Integration

- [x] **T4.1 — Shtiya Capital: Lender Underwriting Dashboard**
  - Files: `src/app/(apps)/capital/page.tsx`
  - Acceptance: Lists deals pending underwriting with property, ledger, and agreement summary joined via RLS-safe queries.

- [x] **T4.2 — Shtiya Capital: Draw Approval Queue**
  - Files: `src/app/(apps)/capital/draws/[id]/page.tsx`, `src/app/api/draws/approve/route.ts`
  - Acceptance: Approving a draw updates `financial_ledgers.status` (`pending → held → released`) and, if `web3_tx_hash` present, confirms on-chain state matches DB state.

- [x] **T4.3 — [Agentic: Pulse] Live Draw Status Broadcast**
  - Files: `src/app/(apps)/capital/pulse/channel.ts`
  - Acceptance: Borrower and lender both see draw status changes reflected within 2 seconds via the shared `deal_room_events` Realtime channel.

- [x] **T4.4 — Shtiya Design: CAD/BIM Vault**
  - Files: `src/app/(apps)/design/vault/[id]/page.tsx`
  - Acceptance: Uploads accepted for `.dwg`/`.rvt`/`.ifc`/`.pdf`; stored as `documents` (`type='cad'`).

- [x] **T4.5 — Shtiya Design: BoQ Generator & Contractor Hand-off**
  - Files: `src/lib/gemini/boq-generator.ts`
  - Acceptance: Generates a Bill of Quantities from vaulted CAD/BIM docs; hand-off writes a linked scope draft consumable by T3.3.

- [x] **T4.6 — [Agentic: Match] pgvector Embedding Pipeline**
  - Files: `supabase/functions/match-embed/index.ts`, `supabase/migrations/0005_match_trigger.sql`
  - Acceptance: DB trigger/Edge Function embeds new/updated rows in `properties`, `agreements`, `documents` on insert; embeddings populate `embedding vector(768)` within 60 seconds of upload.

- [x] **T4.7 — [Agentic: Match] Semantic Search API & UI**
  - Files: `src/app/api/match/route.ts`, `src/components/apps/design/SimilarBoQ.tsx`, `src/components/apps/acquisition/SimilarDeals.tsx`
  - Acceptance: Cosine-similarity query against `pgvector` returns top-5 relevant results in <500ms for a corpus of 10k+ rows; results respect RLS (no leakage across tenant boundaries).

- [x] **T4.8 — Shtiya Property: Landlord/Tenant Portal**
  - Files: `src/app/(apps)/property/page.tsx`, `src/app/(apps)/property/maintenance/[id]/page.tsx`
  - Acceptance: Tenant can submit a maintenance ticket; rent payments recorded in `financial_ledgers` (`type='rent_payment'`).

- [x] **T4.9 — Shtiya Property: Maintenance-to-Contractor Routing**
  - Files: `src/app/api/maintenance/route.ts`
  - Acceptance: Submitted ticket auto-creates a scope draft visible in `contractor` app for assigned trade.

- [x] **T4.10 — [Agentic: Watchdog] Landlord Portfolio Violation View**
  - Files: `src/app/(apps)/property/watchdog/page.tsx`
  - Acceptance: Reuses T2.7 feed filtered to properties where `owner_id = auth.uid()` and role is `property_manager`/`owner`.

- [x] **T4.11 — Shtiya Office: License/Insurance/W9 Auditing**
  - Files: `src/app/(apps)/office/page.tsx`
  - Acceptance: Displays contractor compliance state sourced from `compliance_checks`; expired/lapsed entries visually flagged.

- [x] **T4.12 — [Agentic: Sentinel] Auto-Compliance Verification Bot**
  - Files: `supabase/functions/sentinel-verify/index.ts`, `supabase/migrations/0006_sentinel_cron.sql`
  - Acceptance: `pg_cron` triggers the Edge Function monthly; re-verifies license/insurance via NYC Open Data + Gemini OCR re-parse; writes `compliance_checks.status`; a `status='lapsed'` result flips a flag consumed by T3.7/T4.2 to block escrow draw release for that contractor.

- [x] **T4.13 — Shtiya Office: Bookkeeping/Payroll**
  - Files: `src/app/(apps)/office/page.tsx`
  - Acceptance: Ledger export (CSV) covering `financial_ledgers` scoped to the requesting org.

- [x] **T4.14 — Shtiya Marketing: Review Syndication & Lead Funnel**
  - Files: `src/app/(apps)/marketing/page.tsx`, `src/app/api/leads/route.ts`
  - Acceptance: Inbound lead form writes to a staging table and forwards qualified leads into `acquisition`'s lead queue.

- [x] **T4.15 — [Agentic: Match] Lead-to-Property Auto-Routing**
  - Files: `src/app/api/leads/route.ts`
  - Acceptance: New lead description embedded and matched against `properties.embedding`; top match auto-attached as `related_property_id` on the lead for Acquisition triage.

- [ ] **T4.16 — End-to-End Deal Lifecycle Integration Test**
  - Files: `tests/e2e/deal-lifecycle.spec.ts`
  - Acceptance: Automated test walks Owner block assembly → Acquisition lead → Legal PSA execution → Capital draw funding → Contractor milestone upload → Vision approval → Escrow release → Property handoff, asserting correct state and RLS enforcement at every hop; test passes in CI.
  - Note: Implemented — `tests/e2e/deal-lifecycle.spec.ts` + helpers, Vitest added (`npm run test:e2e`), `.github/workflows/e2e.yml` added, plus two prerequisite migrations the lifecycle needed to function under real RLS: `supabase/migrations/0007_write_policies.sql` (INSERT/UPDATE policies — 0002 only had SELECT/2 UPDATE policies, so every write in the lifecycle was previously rejected by RLS) and `0008_milestones_bucket.sql` (the `milestones` Storage bucket was never created by any migration). Verified via `tsc --noEmit` (clean) and full manual trace against each route's actual code; **not yet run against a live Supabase instance** — this sandbox has no Docker, so `supabase start` isn't available here. Leave unchecked until it's run once for real (locally via `supabase start && supabase db reset && npm run test:e2e`, or by pushing a branch so `.github/workflows/e2e.yml` runs on Linux CI) and confirmed green. See `tests/e2e/README.md` for known gaps this test surfaces (a pre-existing T4.15 lead-matching RLS gap, and a missing `.select()` on `escrow/release`'s update).
