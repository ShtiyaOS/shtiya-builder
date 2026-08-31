# Shtiya Builder Ecosystem v3.0 — Execution Checklist
## Tasks.md — Part 1 of 2: Infrastructure, Database & CI Foundations

**Document class:** Execution Checklist — Micro-Sprint Methodology
**Produced by:** IBM Bob, Lead Architect & Project Manager
**Version:** 3.0
**Anchored to:** `Plan_v3_Part1.md` (invariants) · `Plan_v3_Part2.md` (schemas) · `Plan_v3_Part3.md` (routes & CI)
**Companion:** `Tasks_v3_Part2.md` — API Routes, UI, Multi-Agent Pipelines

---

## Micro-Sprint Rules (READ FIRST)

> These rules apply to **every task** in this checklist. The executing developer AI
> (Claude) has strict output token limits. Violating these rules causes tool crashes.

1. **Max 3 files per task.** Never write more than 3 files in a single assistant turn.
2. **Max 500 lines per file.** If a migration exceeds 500 lines, split it into `_part_a.sql` and `_part_b.sql`.
3. **Validate before proceeding.** Run the stated validation command after each task. Do not start the next task until validation passes.
4. **No speculative work.** Only write what the current task explicitly requires. Do not add tables, columns, or functions that belong to a later task.
5. **Idempotent migrations.** Every migration must use `if not exists` and `or replace` guards so it can be re-run safely during development.
6. **Invariant traceability.** Every SQL object that enforces an invariant must carry an inline comment citing the invariant ID (e.g., `-- I-2`, `-- I-L1`).

---

## Phase 0 — Pre-Flight: Environment & CI Scaffold

> **Goal:** Stand up the project skeleton, CI pipeline, and all 17 lint rule stubs
> before any application code is written. Exit criteria: `npm run lint` and
> `npm run typecheck` both pass with zero errors on an empty `src/` directory.

---

### Task 0.1 — Repository & Toolchain Bootstrap

**Files to create (max 3):**
1. `package.json`
2. `tsconfig.json`
3. `.eslintrc.cjs`

**Instructions:**
- Initialize a Next.js 14 project with App Router, TypeScript strict mode, and Tailwind CSS.
- Add dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `openai`, `zod`.
- Add dev dependencies: `eslint`, `@typescript-eslint/eslint-plugin`, `jest`, `@types/jest`, `ts-jest`.
- `tsconfig.json`: set `"strict": true`, `"noUncheckedIndexedAccess": true`, `"paths": { "@/*": ["./src/*"] }`.
- `.eslintrc.cjs`: extend `next/core-web-vitals` + `@typescript-eslint/recommended`. Add placeholder `rules: {}` — custom rules added in Task 0.4.

**Validation:**
```bash
npm install
npm run typecheck   # must exit 0
npm run lint        # must exit 0
```

---

### Task 0.2 — Supabase Project Initialization

**Files to create (max 3):**
1. `supabase/config.toml`
2. `.env.local.example`
3. `supabase/.gitignore`

**Instructions:**
- Run `supabase init` to generate `supabase/config.toml`.
- Enable `pgvector` extension in `config.toml` under `[db.extensions]`.
- Enable `pg_cron` extension in `config.toml`.
- `.env.local.example`: document all required env vars:
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  OPENAI_API_KEY=
  MICROVM_PROVIDER_KEY=
  MICROVM_PROVIDER=firecracker
  ```
- `supabase/.gitignore`: add `.branches/`, `seed.sql` (seed goes in a separate tracked file).

**Validation:**
```bash
supabase start          # local Supabase stack must start clean
supabase status         # all services must show "running"
```

---

### Task 0.3 — CI Pipeline Configuration

**Files to create (max 3):**
1. `.github/workflows/ci.yml`
2. `.github/workflows/migration-check.yml`
3. `scripts/lint-all.sh`

**Instructions:**

`ci.yml` — runs on every PR to `main` and `staging`:
```yaml
jobs:
  typecheck:
    steps: [checkout, setup-node, npm-install, npm-run-typecheck]
  lint:
    steps: [checkout, setup-node, npm-install, npm-run-lint]
  test:
    steps: [checkout, setup-node, npm-install, npm-run-test]
  migration-dry-run:
    uses: ./.github/workflows/migration-check.yml
```

`migration-check.yml` — runs `supabase db diff --use-migra` against the `staging` Supabase project. Fails the PR if any unapplied migration is detected in `staging` that is not in the PR's migration set.

`scripts/lint-all.sh` — sequentially invokes all 17 custom lint rules (stubs for now; rules added in Task 0.4). Each rule exits 0 (pass) or 1 (fail).

**Validation:**
```bash
bash scripts/lint-all.sh   # all 17 rules must exit 0 (stubs pass vacuously)
```

---

### Task 0.4 — CI Lint Rule Stubs (17 Rules)

**Files to create (max 3):**
1. `scripts/lint/index.ts` — rule registry and runner
2. `scripts/lint/rules/group-auth.ts` — stubs for: `wall-lint`, `definer-lint`, `privilege-lint`, `class-lint`
3. `scripts/lint/rules/group-agent.ts` — stubs for: `param-lint`, `prompt-lint`, `tools-lint`, `plan-lint`, `filter-lint`, `fallback-lint`, `citation-lint`

**Then in a second turn (separate task invocation), create:**
4. `scripts/lint/rules/group-vault.ts` — stubs for: `vault-pii-lint`, `claim-lint`, `currency-lint`, `embedding-lint`
5. `scripts/lint/rules/group-ops.ts` — stubs for: `log-lint`, `servicerole-lint`

> **Note to executor:** Tasks 0.4a (files 1–3) and 0.4b (files 4–5) are split into
> two micro-sprints. Do 0.4a first, validate, then do 0.4b.

**Stub pattern (each rule):**
```typescript
// Each rule exports: { id: string, check: () => LintResult }
// Stub returns: { passed: true, violations: [] }
// Real implementation added in Tasks 0.5–0.7.
export const wallLint = {
  id: 'wall-lint',
  check: (): LintResult => ({ passed: true, violations: [] }),
};
```

**Validation:**
```bash
npx ts-node scripts/lint/index.ts   # all 17 rules must report PASS
```

---

### Task 0.5 — Implement `wall-lint` & `definer-lint`

**Files to modify (max 2):**
1. `scripts/lint/rules/group-auth.ts` — implement `wall-lint`
2. `scripts/lint/rules/group-auth.ts` — implement `definer-lint` (same file, second edit)

**`wall-lint` implementation:**
- Glob all `supabase/migrations/**/*.sql`.
- For each `.sql` file, extract table names whose DDL contains `matter_id` as a foreign key column.
- For each such table, assert that the same file (or a subsequent migration file) contains a `CREATE POLICY` statement on that table that includes the string `wall_blocks_user`.
- Violation format: `wall-lint: table {table} in {file} has matter_id FK but no wall_blocks_user() in its SELECT policy`

**`definer-lint` implementation:**
- Glob all `supabase/migrations/**/*.sql`.
- Find all `CREATE [OR REPLACE] FUNCTION` blocks with `SECURITY DEFINER`.
- Assert each such function body contains `SET search_path = ''` (case-insensitive).
- Separately, find functions named `match_hrag_chunks`, `match_tenant_chunks`, `match_af_chunks` — assert they are `SECURITY INVOKER` (i.e., NOT `SECURITY DEFINER`).
- Violation format: `definer-lint: {function_name} in {file} is DEFINER but missing SET search_path`

**Validation:**
```bash
npx ts-node scripts/lint/index.ts wall-lint    # must PASS (no migrations yet)
npx ts-node scripts/lint/index.ts definer-lint  # must PASS
```

---

### Task 0.6 — Implement `privilege-lint` & `class-lint`

**Files to modify (max 1):**
1. `scripts/lint/rules/group-auth.ts`

**`privilege-lint` implementation:**
- For each authorization table (`property_role_bindings`, `deal_memberships`, `facility_parties`, `matter_parties`, `wp_parties`, `dp_parties`, `broker_seats`):
  - Assert that the migration file creating that table also contains a `CREATE TRIGGER` statement matching `trg_%_billing_guard`.
- Violation: `privilege-lint: {table} in {file} missing billing guard trigger`

**`class-lint` implementation:**
- Find all tables whose DDL contains a column named `data_class`.
- Assert each such table's RLS SELECT policy (in the same or any later migration) includes `has_data_class_grant`.
- Violation: `class-lint: {table} has data_class column but RLS missing has_data_class_grant()`

**Validation:**
```bash
npx ts-node scripts/lint/index.ts privilege-lint
npx ts-node scripts/lint/index.ts class-lint
```

---

### Task 0.7 — Implement Agent Factory Lint Rules

**Files to modify (max 2):**
1. `scripts/lint/rules/group-agent.ts` — implement `param-lint`, `prompt-lint`, `fallback-lint`, `citation-lint`
2. `scripts/lint/rules/group-agent.ts` — implement `plan-lint`, `filter-lint`, `tools-lint` (same file, second edit pass)

**`param-lint`:** Parse TypeScript AST in `src/` for calls to `openai.chat.completions.create` (or equivalent). Flag any `role: 'system'` message whose `content` value is a template literal or string concatenation containing a variable (not a compile-time constant). Also flag any route handler containing a parameter named `context` that is passed into a system message.

**`prompt-lint`:** Assert all `role: 'system'` content strings in LLM call sites reference an import from `src/lib/agent/prompts/`. Dynamic construction in the system role is a violation.

**`fallback-lint`:** Read `src/lib/agent/fallback-templates.ts` (created in Task 4.3). Assert: FL-1 all 3 keys present, FL-2 no empty string, FL-3 all strings unique, FL-4 no code path returns `undefined` where fallback expected.

**`citation-lint`:** Find all `return NextResponse.json(...)` calls in `src/app/api/copilot/`. Assert no response object has `citations: []` without a companion non-null `fallback` field.

**`plan-lint`:** Assert `src/lib/agent/supervisor.ts` contains a loop over `plan.tasks` that checks `target_paths` against `scopeSet.allowedPaths` before any `executeWorkerTask` call.

**`filter-lint`:** Find all calls to `supabase.rpc('match_hrag_chunks'`, `match_tenant_chunks`, `match_af_chunks`. Assert each call passes a non-empty `p_vault_paths` argument.

**`tools-lint`:** Find all exported objects in `src/lib/agent/tools/`. Assert any tool function containing a `supabase.from(...).insert/update/delete` call is annotated with `requires_human_gate: true`.

**Validation:**
```bash
npx ts-node scripts/lint/index.ts param-lint prompt-lint fallback-lint
npx ts-node scripts/lint/index.ts citation-lint plan-lint filter-lint tools-lint
# All must PASS (no src/ files yet — vacuous pass)
```

---

### Task 0.8 — Implement Vault & Ops Lint Rules

**Files to modify (max 2):**
1. `scripts/lint/rules/group-vault.ts` — implement `vault-pii-lint`, `claim-lint`, `currency-lint`, `embedding-lint`
2. `scripts/lint/rules/group-ops.ts` — implement `log-lint`, `servicerole-lint`

**`vault-pii-lint`:** Scan `hrag_ingestion_queue` DDL for columns named `name`, `address`, `ssn`, `email`, `phone`. Also scan `/api/vault/tenant-corpus/route.ts` for any `supabase.from(...).insert` call that precedes a `verifyMicrovmProof` call.

**`claim-lint`:** Find all `INSERT INTO authority_corpus` statements in migration files and ingestion pipeline code. Assert each has a non-null `jurisdiction` value.

**`currency-lint`:** Find all `supabase.rpc('match_hrag_chunks'`, `match_tenant_chunks`, `match_af_chunks` call sites. Assert each passes `p_as_of`. Also parse the RPC SQL definition for a `WHERE effective_to > p_as_of` (or `IS NULL`) filter.

**`embedding-lint`:** Find all route files in `src/app/api/`. Assert no route returns a JSON response containing a key whose value type is `number[]` (raw embedding vector). Also assert no SELECT on `authority_corpus` or `tenant_corpus` fetches the `embedding` column without an enclosing RLS-enforced RPC.

**`log-lint`:** Parse `src/app/api/copilot/route.ts`. Find every `return NextResponse.json(...)` statement. Assert each is preceded (in the same code path) by an `await emitObservation(...)` call.

**`servicerole-lint`:** Find all `createClient(...)` calls in `src/app/api/`. Assert any call that is followed (in the same function scope) by a `.rpc('match_hrag_chunks'`, `.rpc('match_tenant_chunks'`, or any `.from('matter_parties')` etc. uses `SUPABASE_SERVICE_ROLE_KEY`, not `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Validation:**
```bash
npx ts-node scripts/lint/index.ts vault-pii-lint claim-lint currency-lint embedding-lint
npx ts-node scripts/lint/index.ts log-lint servicerole-lint
npm run lint    # full lint suite must still pass
```

---

### Task 0.9 — Object Storage & Secrets Scaffold

**Files to create (max 3):**
1. `supabase/storage.sql` — storage bucket definitions
2. `src/lib/storage.ts` — typed bucket client helpers
3. `scripts/seed-coverage-assertions.sql` — initial coverage assertions seed

**`storage.sql`:**
```sql
-- Three physically separate buckets; no cross-bucket policy
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents',      'documents',      false, 52428800,  -- 50 MB
   array['application/pdf','image/jpeg','image/png','image/webp']),
  ('vault-raw',      'vault-raw',      false, 20971520,  -- 20 MB — tenant corpus ingest
   array['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('gig-affidavits', 'gig-affidavits', false, 10485760,  -- 10 MB
   array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
```

**`seed-coverage-assertions.sql`:** Seed the initial 12 coverage assertions (US.NY CPLR, RPAPL, RPL, UCC Art. 9, NY Real Property Tax Law, US.Federal FAA, US.Federal BSA, US.Federal FCRA, IBC 2021, FannieMae.SEL, ABA.ModelRules, ASTM.E2018).

**Validation:**
```bash
supabase db reset                         # apply all migrations + seed
supabase db diff --use-migra              # must return zero diff
```

---

### ✅ Phase 0 Exit Criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npx ts-node scripts/lint/index.ts` — all 17 rules report `PASS`
- [ ] `supabase start` succeeds
- [ ] `supabase status` shows all services running
- [ ] CI pipeline runs on a test PR and all jobs pass

---

## Phase 1 — Database Foundation (Migrations 0001–0059)

> **Goal:** Apply the full Core Ecosystem baseline schema. Every migration is a
> separate `.sql` file. Migrations are applied in order. The Phase 1 exit criterion
> is that migration `0059` runs to completion and all its validation DO blocks pass
> without raising an exception.

---

### Task 1.1 — Migration 0001 Part A: Extensions, Users & Properties

**Files to create (max 2):**
1. `supabase/migrations/0001_foundation_part_a.sql`

> This is the first of two files splitting migration 0001 (which exceeds 500 lines).
> Part A covers: extensions, `users`, `properties`, `entitlements`,
> shared cross-group tables, `property_role_bindings`, billing-guard trigger,
> and the 27-role constraint.

**Content boundary:**
- `CREATE EXTENSION` block
- `CREATE TABLE users` + 27-role `ALTER TABLE users ADD CONSTRAINT`
- `CREATE TABLE properties` (with `co_owned` generated column)
- `CREATE TABLE entitlements`
- `CREATE TABLE agreements`
- `CREATE TABLE documents`
- `CREATE TABLE financial_ledgers`
- `CREATE TABLE escrow_intents`
- `CREATE TABLE disclosures`
- `CREATE TABLE property_role_bindings`
- `CREATE FUNCTION assert_not_billing_actor()`
- `CREATE TRIGGER trg_prb_billing_guard`
- `REVOKE` statements for `property_role_bindings` and `entitlements`

**Invariant comments required:**
- `-- I-2` on `assert_not_billing_actor()` and the trigger
- `-- I-4` on the `owner_distressed` capacity in the `property_role_bindings` check

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "\dt" | grep -E "users|properties|entitlements"
# Must show all 3 tables
```

---

### Task 1.2 — Migration 0001 Part B: Auth Functions, RLS & Materialized View

**Files to create (max 1):**
1. `supabase/migrations/0001_foundation_part_b.sql`

**Content boundary (continues from Part A):**
- `CREATE FUNCTION current_user_role_group()` — nav routing helper, NOT data-scope
- `CREATE FUNCTION has_property_capacity()`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for all Part A tables
- All RLS policies for Part A tables (`properties_owner_read`, `prb_self_read`, `entitlements_self_read`, `ledgers_party_read`, `disclosures_self_read`)
- `CREATE MATERIALIZED VIEW discovery_feed`
- `CREATE INDEX` on `discovery_feed(borough)`

**Invariant comments required:**
- `-- I-A7` on `current_user_role_group()` — nav routing ONLY
- Comment block above `discovery_feed`: `-- k-anonymity enforced in API layer: < 5 parcels → 0 rows returned`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT * FROM discovery_feed LIMIT 1;"
# Must execute without error (empty result is fine)
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname IN ('current_user_role_group','has_property_capacity');"
# Must return 2 rows
```

---

### Task 1.3 — Migration 0001 Part C: Institutions, Facilities & Group 3 Primitives

**Files to create (max 1):**
1. `supabase/migrations/0001_foundation_part_c.sql`

**Content boundary:**
- `CREATE TABLE institutions`
- `CREATE TABLE institution_members`
- `CREATE TABLE facilities`
- `CREATE TABLE facility_parties` + `CREATE TRIGGER trg_fp_billing_guard` — `-- I-2`
- `CREATE FUNCTION is_facility_party()`
- RLS on all four tables
- `CREATE TABLE firms`
- `CREATE TABLE firm_members`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "\dt" | grep -E "institutions|facilities|firms"
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'is_facility_party';"
```

---

### Task 1.4 — Migration 0001 Part D: Matters, Matter Parties & Ethical Walls

**Files to create (max 1):**
1. `supabase/migrations/0001_foundation_part_d.sql`

**Content boundary:**
- `CREATE TABLE matters` — all 8 `matter_type` values with inline comments mapping each to its data class
- `CREATE TABLE matter_parties` + `CREATE TRIGGER trg_mp_billing_guard` — `-- I-2`
- `CREATE TABLE representations`
- `CREATE TABLE ethical_walls` — comment: `-- wall_epoch increments on every erection/modification (I-L12)`
- `CREATE TABLE conflict_checks`
- `CREATE FUNCTION is_matter_party()`
- `CREATE FUNCTION wall_blocks_user()` — comment: `-- I-L12: wall overrides all other access`
- RLS on all tables
- Existence-protection comment on `matters_party_read` policy: `-- I-L11: denied matter is byte-identical to non-existent`

**Invariant comments required:**
- `-- I-L11` on `matters_party_read` policy
- `-- I-L12` on `wall_blocks_user()` function and `matters_party_read` policy

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname IN ('is_matter_party','wall_blocks_user');"
# Must return 2 rows
npx ts-node scripts/lint/index.ts wall-lint privilege-lint
# Both must PASS
```

---

### Task 1.5 — Migration 0001 Part E: Trust Accounts, Ledger & Group 4 Baseline

**Files to create (max 1):**
1. `supabase/migrations/0001_foundation_part_e.sql`

**Content boundary:**
- `CREATE TABLE trust_accounts` — with `debit_block_attested` column comment: `-- I-L5: re-attest quarterly`
- `CREATE TABLE trust_ledger` — with `constraint trust_ledger_no_dual_same_person` comment: `-- I-L1 baseline: full identity check in 0060`
- RLS for both tables
- `CREATE INDEX` on `trust_ledger(trust_account_id, created_at desc)`
- `CREATE INDEX` on `trust_ledger(client_user_id)`

**Invariant comments required:**
- `-- I-L1` on `trust_ledger_no_dual_same_person` constraint
- `-- I-L3` on the `debit_kind` CHECK constraint
- `-- I-L4` comment block: `-- Ledger is append-only: no UPDATE, no DELETE permitted`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "\d trust_ledger" | grep "debit_kind\|maker_id\|checker_id"
npx ts-node scripts/lint/index.ts wall-lint definer-lint
```

---

### Task 1.6 — Migration 0001 Part F: Contractors, Architects, Managers, Brokers

**Files to create (max 2):**
1. `supabase/migrations/0001_foundation_part_f.sql` — Companies through Design Packages
2. `supabase/migrations/0001_foundation_part_g.sql` — Management Engagements through Brokerages + final indexes + `workspace_manifest()`

> Two files here because the combined content would exceed 500 lines.

**Part F content boundary:**
- `CREATE TABLE companies` + `crew_members`
- `CREATE TABLE work_packages` + `wp_parties` + billing trigger — `-- I-2`
- `CREATE TABLE boq_items`
- `CREATE FUNCTION is_work_package_party()`
- `CREATE TABLE practices` + `seal_holders` + `professional_licences`
- `CREATE TABLE design_packages` + `dp_parties` + billing trigger — `-- I-2`
- `CREATE TABLE design_licences`
- `CREATE FUNCTION is_design_package_party()`
- RLS for all above tables

**Part G content boundary:**
- `CREATE TABLE management_engagements`
- `CREATE TABLE tenancies` — with comment `-- I-22: Access Floor — status column is legal state only; never gates physical access`
- `CREATE TABLE rent_trust` + `deposit_trust` + `screening_reports`
- Comment on `screening_reports`: `-- I-25: 'denied' status deliberately absent — auto-deny prohibited`
- `CREATE TABLE brokerages` + `broker_seats` + `agency_representations`
- Comment on `agency_representations`: `-- I-31: commission_rate deliberately absent`
- RLS for all above tables
- All performance indexes from the 0001 index block
- `CREATE FUNCTION workspace_manifest()`
- `CREATE FUNCTION subject_party()`
- `CREATE FUNCTION on_restricted_list()` — stub returning `false` with comment `-- Stub: full implementation in 0060`
- All `REVOKE` statements for authorization tables

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname IN ('workspace_manifest','subject_party','on_restricted_list');"
# Must return 3 rows
npx ts-node scripts/lint/index.ts wall-lint definer-lint privilege-lint class-lint
# All must PASS
```

---

### Task 1.7 — Migration 0001 Part H: Deals & Deal Memberships

> **Note:** `deals` and `deal_memberships` were referenced by other 0001 tables
> (e.g., `assembly_intents`) but must be created before those references.
> This migration is inserted logically into the 0001 sequence even though
> it's a separate file for size management.

**Files to create (max 1):**
1. `supabase/migrations/0001_foundation_part_h.sql`

**Content boundary:**
- `CREATE TABLE deals`
- `CREATE TABLE deal_memberships` + `CREATE TRIGGER trg_dm_billing_guard` — `-- I-2`
- `CREATE FUNCTION is_deal_member()`
- RLS for both tables
- `REVOKE` for `deal_memberships`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'is_deal_member';"
# 1 row
```

---

### Task 1.8 — Migration 0020: Group 1 & 2 Extensions

**Files to create (max 1):**
1. `supabase/migrations/0020_group1_2_extensions.sql`

**Content boundary (from Plan Part 2 — 0020–0029 range):**
- `CREATE TABLE avm_snapshots`
- `CREATE TABLE municipal_records`
- `CREATE TABLE assembly_intents`
- RLS for all three
- `CREATE TABLE deal_documents`
- `CREATE TABLE title_diligence`
- `CREATE TABLE contract_assignments`
- RLS for all three

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "\dt" | grep -E "avm_snapshots|assembly_intents|deal_documents"
npx ts-node scripts/lint/index.ts wall-lint
```

---

### Task 1.9 — Migration 0030: Group 3 Extensions (Draw Requests & Loan Covenants)

**Files to create (max 1):**
1. `supabase/migrations/0030_group3_extensions.sql`

**Content boundary:**
- `CREATE TABLE draw_requests`
- `CREATE FUNCTION enforce_draw_dual_control()` — comment `-- G3 §II.4 dual control`
- `CREATE TRIGGER trg_draw_dual_control`
- `CREATE TABLE field_inspections` — comment on `vision_model_result`: `-- ADVISORY only; human sign-off required (I-A3)`
- `CREATE TABLE loan_covenants`
- RLS for all three

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'enforce_draw_dual_control';"
npx ts-node scripts/lint/index.ts privilege-lint
```

---

### Task 1.10 — Migration 0040: Group 4 Extensions (Arbitration & Privilege Successions)

**Files to create (max 1):**
1. `supabase/migrations/0040_group4_extensions.sql`

**Content boundary:**
- `CREATE TABLE privilege_successions`
- `CREATE TABLE arbitration_cases` — comment `-- G4-01: FAA-consistent; faa_review_preserved must be true`
- `CREATE TABLE arbitration_awards` — comment `-- G4-02: no self-execution; staged release requires custodian action`
- RLS for all three + `wall_blocks_user()` in policies — `-- I-L11`, `-- I-L12`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts wall-lint
# Must PASS — all new matter-scoped tables have wall_blocks_user in RLS
```

---

### Task 1.11 — Migration 0041: Practice-Area Workbench Tables

**Files to create (max 1):**
1. `supabase/migrations/0041_practice_workbenches.sql`

**Content boundary:**
- `CREATE TABLE pi_medical_records` — `data_class = 'class_phi'` comment `-- I-L8`
- `CREATE TABLE pi_liens` — `data_class = 'class_phi'`
- `CREATE TABLE bk_schedules` — `data_class = 'class_insolvency'`
- `CREATE TABLE corp_transaction_records` — `data_class = 'class_mnpi'` + `on_restricted_list()` in RLS — `-- I-L10`
- `CREATE TABLE family_asset_inventories` — `data_class = 'class_family'`
- `CREATE FUNCTION has_data_class_grant()` — stub returning `false` with comment `-- Stub: full implementation in 0060`
- RLS for all five tables — all using `has_data_class_grant()` + `wall_blocks_user()`
- Comment block: `-- NOTE: has_data_class_grant() returns false until 0060. Workbench tables are read-blocked by design until Legal Workspace is deployed.`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts wall-lint class-lint
# Both must PASS — all data_class tables have has_data_class_grant in RLS
```

---

### Task 1.12 — Migration 0050: Groups 5–7 Extensions

**Files to create (max 2):**
1. `supabase/migrations/0050_group5_6_extensions.sql` — Milestone Events, Safety Incidents, Material Deliveries, Design Files, RFIs, Seal Events
2. `supabase/migrations/0051_group7_extensions.sql` — Maintenance Tickets, Rent Ledger, Adverse Action Notices, Lease Documents

**0050 content boundary:**
- `CREATE TABLE milestone_events` — `vision_model_result` comment `-- ADVISORY; human sign-off required (I-A3)`
- `CREATE TABLE safety_incidents`
- `CREATE TABLE material_deliveries`
- `CREATE TABLE design_files`
- `CREATE TABLE rfis`
- `CREATE TABLE seal_events`
- RLS for all (routed through `is_work_package_party()` or `is_design_package_party()`)

**0051 content boundary:**
- `CREATE TABLE maintenance_tickets` — comment `-- I-22: Access Floor — no action from this table may gate physical access`
- `CREATE TABLE rent_ledger`
- `CREATE TABLE adverse_action_notices` — comment `-- I-25: documented_basis must be human-authored`
- `CREATE TABLE lease_documents`
- RLS for all four

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "\dt" | grep -E "milestone_events|maintenance_tickets|rent_ledger"
npx ts-node scripts/lint/index.ts wall-lint class-lint
```

---

### Task 1.13 — Migration 0052: Group 9 Extensions

**Files to create (max 1):**
1. `supabase/migrations/0052_group9_extensions.sql`

**Content boundary:**
- `CREATE TABLE listings` — comment `-- I-31: list_price_cents entered by agent only; never auto-populated`
- `CREATE TABLE showings`
- `CREATE TABLE representation_disclosures`
- `CREATE TABLE commission_records` — comment `-- I-31: no benchmark rate, no platform-suggested rate, no cross-brokerage aggregation`
- RLS for all four

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "\dt" | grep -E "listings|commission_records"
npx ts-node scripts/lint/index.ts wall-lint
```

---

### Task 1.14 — Migration 0054: Gig Rail Baseline

**Files to create (max 1):**
1. `supabase/migrations/0054_gig_rail_baseline.sql`

**Content boundary:**
- `CREATE TABLE gig_jobs`
- `CREATE TABLE gig_assignments` — comments on `geofence_verified`, `attestation_verified`, `timestamp_verified`: `-- Server-computed only; REVOKE UPDATE added in 0060 (I-L18)`
- `CREATE TABLE gig_submissions` — comment `-- I-L16: provenance gates acceptance, never money`
- `CREATE TABLE gig_escrow` — comment `-- I-L21: never funded from trust_ledger`
- RLS for all four — all using `wall_blocks_user()` via `gig_jobs.matter_id`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts wall-lint
# gig_jobs is matter-scoped; must have wall_blocks_user in RLS
```

---

### Task 1.15 — Migration 0055: Platform Notifications & Audit Log

**Files to create (max 1):**
1. `supabase/migrations/0055_platform_infra.sql`

**Content boundary:**
- `CREATE TABLE notifications` — comment `-- I-L11: delivery service filters via subject_party() before writing`
- `CREATE TABLE audit_log` — comment `-- Append-only: corrections via new entries only`
- `CREATE TABLE wall_prior_access` — comment `-- I-L15: preserves access history for disclosure, not concealment`
- RLS for all three (audit_log: admin-only read; wall_prior_access: screened user + admin)

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "\dt" | grep -E "notifications|audit_log|wall_prior_access"
```

---

### Task 1.16 — Migration 0056: Coverage Assertions Stub

**Files to create (max 1):**
1. `supabase/migrations/0056_coverage_assertions_stub.sql`

**Content boundary:**
- `CREATE TABLE coverage_assertions` — exact schema from Plan Part 2 §0056
- `ALTER TABLE coverage_assertions ENABLE ROW LEVEL SECURITY`
- `CREATE POLICY "coverage_assertions_authenticated_read"` — authenticated users
- Comment block explaining this is the pre-HRAG stub; `satisfied` is updated by the HRAG pipeline (0080+)

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT * FROM coverage_assertions LIMIT 1;"
```

---

### Task 1.17 — Migration 0057: Corpus Stubs

**Files to create (max 1):**
1. `supabase/migrations/0057_corpus_stubs.sql`

**Content boundary:**
- `CREATE TABLE authority_corpus` — with `constraint authority_corpus_no_org check (owner_org_id is null)` — `-- I-A4`
- `CREATE TABLE tenant_corpus` — with `constraint tenant_corpus_requires_org check (owner_org_id is not null)` — `-- I-A5`
- RLS for both — authority corpus visibility-gated; tenant corpus org-membership only — `-- I-A5`
- Comment: `-- I-A10: embeddings (added in 0070) inherit these same RLS policies`
- Comment: `-- I-19: no embeddings-only export path exists or will be created`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts definer-lint servicerole-lint
```

---

### Task 1.18 — Migration 0058: Final Index Pass & Grant Locks

**Files to create (max 1):**
1. `supabase/migrations/0058_indexes_and_grants.sql`

**Content boundary:** All `CREATE INDEX` statements from the 0058 block in Plan Part 2, covering `matters`, `trust_ledger`, `ethical_walls`, `gig_jobs`, `gig_assignments`, `listings`, `agency_representations`, `deal_memberships`, `facility_parties`, `draw_requests`, `milestone_events`, `maintenance_tickets`, `notifications`, `audit_log`, `authority_corpus`, `tenant_corpus`, `coverage_assertions`.

All `REVOKE ALL ON {table} FROM public` statements for every table added in 0020–0057.

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;" | wc -l
# Should be > 30 indexes
npx ts-node scripts/lint/index.ts wall-lint definer-lint privilege-lint class-lint
# All 4 must PASS
```

---

### Task 1.19 — Migration 0059: Baseline Validation Assertions

**Files to create (max 1):**
1. `supabase/migrations/0059_baseline_validation.sql`

**Content boundary:** All 6 `DO $$ ... $$` validation blocks from Plan Part 2 §0059:
1. I-2: billing guard triggers exist on all 6 authorization tables
2. I-L3: `trust_ledger.debit_kind` constraint covers all permitted values
3. I-L4: `trust_ledger` has no UPDATE/DELETE triggers
4. I-4: `users_role_check` constraint contains `owner_investor`
5. I-A5: `tenant_corpus.owner_org_id` is NOT NULL
6. I-25: `screening_reports` has no `denied` status value
7. I-31: no platform-suggested commission rate column in G9 tables

Final `COMMENT ON SCHEMA public` recording the validated range.

**Validation:**
```bash
supabase db reset
# If migration 0059 runs without exception, all 7 assertions passed.
echo "0059 passed — baseline schema 0001–0059 is invariant-clean"
npx ts-node scripts/lint/index.ts   # all 17 rules must PASS
```

---

### ✅ Phase 1 Exit Criteria

- [x] `supabase db reset` completes without error on all 33 migrations (10 legacy + 23 v3: 1000–1059)
- [x] Migration 1059 runs all 7 validation DO blocks without raising an exception — all 7 negative-tested
- [x] CI lint: 14/17 PASS — 3 intentional failures (param-lint, prompt-lint, log-lint) on `src/app/api/copilot/route.ts`, cleared by Task 3.18
- [x] `psql $DATABASE_URL -c "\dt" | wc -l` returns ≥ 55 tables — validated on full 33-migration chain
- [x] `psql $DATABASE_URL -c "SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;"` returns ≥ 12 functions — 15 DEFINER functions confirmed present before 1058 GRANT EXECUTE

**Completed:** Tasks 1.10–1.19 (migrations 1040–1059). All migrations re-runnable (DROP TRIGGER IF EXISTS
applied to all 8 plain-CREATE TRIGGER sites). Full grant stack live (1058). 7/7 invariant guards
negative-tested and passing (1059). Phase 2 (Legal Workspace 1060–1066) is next.

---

## Phase 2 — Hardened Infrastructure DB (Migrations 0060–0086)

> **Goal:** Layer the three new infrastructure systems on top of the v2.0 baseline:
> Legal Workspace (0060–0066), Agent Factory (0070–0076), HRAG Vault Network
> (0080–0086). Every migration in this range depends on 0001–0059 being present.

---

### Task 2.1 — Migration 0060: Identity Subjects & Data Classes

**Files to create (max 1):**
1. `supabase/migrations/0060_lw_identity_and_classes.sql`

**Content boundary:**
- `CREATE TABLE identity_subjects`
- `ALTER TABLE users ADD COLUMN identity_subject_id`
- `CREATE INDEX users_identity_subject`
- `CREATE TYPE data_class AS ENUM (...)` — all 7 class values
- `CREATE TABLE matter_class_grants` — `-- I-L8`
- `CREATE INDEX mcg_lookup`
- `CREATE FUNCTION guard_class_grant()` — with `SET search_path = ''` — `-- I-L8`
- `CREATE TRIGGER matter_class_grants_guard`
- `CREATE TABLE matter_class_grant_log`
- `CREATE RULE mcgl_no_update` + `mcgl_no_delete` — `-- I-L4 analogue: grant log is append-only`
- RLS for `identity_subjects` and `matter_class_grants`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT enum_range(NULL::data_class);"
# Must return 7 values
npx ts-node scripts/lint/index.ts definer-lint class-lint
```

---

### Task 2.2 — Migration 0061: Trust Hardening

**Files to create (max 1):**
1. `supabase/migrations/0061_lw_trust_hardening.sql`

**Content boundary:**
- `CREATE FUNCTION guard_identity_dual_control()` — `-- I-L1: checks identity_subjects, not user_ids`
- `CREATE TRIGGER trust_ledger_dual_control`
- `CREATE FUNCTION per_client_solvency_check()` — `-- I-L6`
- `CREATE FUNCTION compute_trust_row_hash()` — `-- I-L4: hash chain`
- `CREATE TRIGGER trust_ledger_hash_chain`
- `CREATE TABLE per_client_trust_balance` — materialized running balance per client/trust account
- `CREATE FUNCTION trust_ledger_append_only_guard()` — prevents UPDATE and DELETE — `-- I-L4`
- `CREATE TRIGGER trust_ledger_append_only` on UPDATE and DELETE

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname IN ('guard_identity_dual_control','per_client_solvency_check','compute_trust_row_hash');"
# 3 rows
npx ts-node scripts/lint/index.ts definer-lint
```

---

### Task 2.3 — Migration 0062: Wall Hardening & Retroactive Epoch

**Files to create (max 1):**
1. `supabase/migrations/0062_lw_wall_hardening.sql`

**Content boundary:**
- `DROP FUNCTION IF EXISTS wall_blocks_user(...)` — drop the 0001 stub
- `CREATE FUNCTION wall_blocks_user(...)` — hardened version with `SET search_path = ''`, cluster-scope support — `-- I-L12`
- `CREATE FUNCTION increment_wall_epoch()` — trigger function that auto-increments `wall_epoch` on ethical_walls INSERT/UPDATE — `-- I-L15`
- `CREATE TRIGGER ethical_walls_epoch_increment`
- `CREATE FUNCTION schedule_retroactive_index_invalidation()` — enqueues a background job to purge retrieval index rows for the screened user — `-- I-L15`
- `CREATE TRIGGER ethical_walls_retroactive_purge` — fires `schedule_retroactive_index_invalidation()` after wall erection

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts wall-lint definer-lint
psql $DATABASE_URL -c "SELECT prosecdef FROM pg_proc WHERE proname = 'wall_blocks_user';"
# Must return 'f' (false = SECURITY INVOKER)... actually wall_blocks_user is DEFINER
# Verify: wall_blocks_user is DEFINER but has SET search_path = ''
psql $DATABASE_URL -c "SELECT prosrc FROM pg_proc WHERE proname = 'wall_blocks_user';" | grep "search_path"
```

---

### Task 2.4 — Migration 0063: `has_data_class_grant()` Full Implementation

**Files to create (max 1):**
1. `supabase/migrations/0063_lw_data_class_grant_impl.sql`

**Content boundary:**
- `DROP FUNCTION IF EXISTS has_data_class_grant(...)` — drop the 0041 stub
- `CREATE FUNCTION has_data_class_grant(p_matter_id uuid, p_class data_class)` — full implementation: checks `matter_class_grants` table, respects `revoked_at`, `expires_at` — `-- I-L8`
- `DROP FUNCTION IF EXISTS on_restricted_list(...)` — drop the 0001 stub
- `CREATE FUNCTION on_restricted_list(p_counterparty_id uuid)` — full implementation: checks `identity_subjects` cross-reference against MNPI-designated users — `-- I-L10`
- Re-issue all practice-workbench RLS policies now that `has_data_class_grant()` is live

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts class-lint definer-lint
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname IN ('has_data_class_grant','on_restricted_list');"
# 2 rows — real implementations, not stubs
```

---

### Task 2.5 — Migration 0064: Gig Rail Hardening

**Files to create (max 1):**
1. `supabase/migrations/0064_lw_gig_rail_hardening.sql`

**Content boundary:**
- `REVOKE UPDATE (geofence_verified, attestation_verified, timestamp_verified) ON gig_assignments FROM public` — `-- I-L18`
- `REVOKE UPDATE (geofence_verified, attestation_verified, timestamp_verified) ON gig_assignments FROM authenticated`
- `CREATE FUNCTION issue_capture_nonce()` — server-side nonce generation, stored as hash — `-- I-L17`
- `CREATE FUNCTION verify_capture_nonce()` — compare submitted nonce against stored hash; mark consumed — `-- I-L17`
- `CREATE TABLE nonce_ledger` — append-only record of issued/consumed nonces; `-- I-L17`
- `ALTER TABLE matter_parties ADD CONSTRAINT mp_perdiem_expiry_required CHECK (...)` — `expires_at NOT NULL` for `per_diem` and `process_server` roles — `-- I-L20`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname IN ('issue_capture_nonce','verify_capture_nonce');"
# 2 rows
npx ts-node scripts/lint/index.ts definer-lint
```

---

### Task 2.6 — Migration 0065: Legal Workspace RLS Hardening & Column Grants

**Files to create (max 1):**
1. `supabase/migrations/0065_lw_rls_and_grants.sql`

**Content boundary:**
- Re-issue all matter-scoped RLS policies with hardened `search_path` in any embedded function calls
- `GRANT SELECT (id, matter_type, status, firm_id, created_at) ON matters TO authenticated` — column-level grant (no full-row grant) — `-- I-L8: class_general only by default`
- `REVOKE SELECT ON matters FROM authenticated` — then re-grant column by column to enforce class scoping
- All `REVOKE ALL ON {trust_ledger, trust_accounts, matter_class_grants, gig_assignments, nonce_ledger} FROM public`
- `GRANT EXECUTE ON FUNCTION has_data_class_grant TO authenticated`
- `GRANT EXECUTE ON FUNCTION wall_blocks_user TO authenticated`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts wall-lint class-lint definer-lint privilege-lint
# All 4 must PASS
```

---

### Task 2.7 — Migration 0066: Legal Workspace Validation Assertions

**Files to create (max 1):**
1. `supabase/migrations/0066_lw_validation.sql`

**Content boundary:** All DO-block validation assertions from Plan Part 2 §0066:
1. I-L1: `guard_identity_dual_control` trigger exists on `trust_ledger`
2. I-L4: `trust_ledger_append_only` trigger exists for UPDATE and DELETE
3. I-L5: `trust_accounts.debit_block_attested` column exists
4. I-L8: `has_data_class_grant()` is a real implementation (not stub returning false)
5. I-L12: `wall_blocks_user()` exists and is SECURITY DEFINER with `search_path = ''`
6. I-L17: `nonce_ledger` table exists
7. I-L18: UPDATE on `geofence_verified` revoked from `authenticated` role
8. I-L20: `mp_perdiem_expiry_required` CHECK constraint exists on `matter_parties`

Final `COMMENT ON SCHEMA public` recording Legal Workspace as validated.

**Validation:**
```bash
supabase db reset
# 0066 must complete without exception
echo "Legal Workspace (0060–0066) validated"
npx ts-node scripts/lint/index.ts   # all 17 rules
```

---

### Task 2.8 — Migration 0070: Agent Factory — Corpora & Typed Agents

**Files to create (max 1):**
1. `supabase/migrations/0070_af_corpora_and_agents.sql`

**Content boundary:**
- `CREATE EXTENSION IF NOT EXISTS vector` — pgvector (required for embeddings)
- Alter `authority_corpus`: add `embedding vector(1536)` column — `-- I-A10: same RLS as content`
- Alter `tenant_corpus`: add `embedding vector(1536)` column
- `CREATE INDEX` HNSW on `authority_corpus(embedding vector_cosine_ops)` — `-- I-A9: used with pre-filter`
- `CREATE INDEX` HNSW on `tenant_corpus(embedding vector_cosine_ops)`
- `CREATE TABLE typed_agents` — with `system_prompt_hash` column, no raw prompt storage — `-- I-A2`
- `CREATE TABLE agent_assignments`
- `CREATE FUNCTION guard_cross_corpus_assignment()` — prevents assigning one agent to both corpora — `-- I-A4`
- `CREATE TRIGGER agent_assignments_corpus_guard`
- RLS for `typed_agents` and `agent_assignments`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT typname FROM pg_type WHERE typname = 'vector';"
# Must return 1 row (pgvector installed)
npx ts-node scripts/lint/index.ts definer-lint embedding-lint
```

---

### Task 2.9 — Migration 0071: Agent Factory — Ingestion Screening

**Files to create (max 1):**
1. `supabase/migrations/0071_af_ingestion_screening.sql`

**Content boundary:**
- `CREATE TABLE af_ingestion_queue` — Agent Factory ingest queue (separate from HRAG queue)
- `CREATE FUNCTION guard_tenant_corpus_org()` — prevents cross-tenant writes — `-- I-A5`
- `CREATE TRIGGER tenant_corpus_org_guard`
- `CREATE FUNCTION guard_authority_corpus_no_org()` — prevents org_id on authority corpus — `-- I-A4`
- `CREATE TRIGGER authority_corpus_no_org_guard`
- RLS on `af_ingestion_queue`
- `REVOKE ALL ON af_ingestion_queue FROM public`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts definer-lint vault-pii-lint
```

---

### Task 2.10 — Migration 0072: Agent Factory — Retrieval RPCs

**Files to create (max 1):**
1. `supabase/migrations/0072_af_retrieval_rpcs.sql`

**Content boundary:**
- `CREATE FUNCTION match_af_chunks(...)` — **SECURITY INVOKER** — `-- AF-12: never DEFINER`
  - Parameters: `p_query_embedding`, `p_vault_paths`, `p_as_of`, `p_match_count`, `p_caller_id`
  - Pre-filter: `WHERE path <@ ANY(p_vault_paths) AND (effective_to IS NULL OR effective_to > p_as_of) AND superseded_by IS NULL`
  - ANN: `ORDER BY embedding <=> p_query_embedding`
  - `-- I-A9: pre-filter before ANN — never post-filter`
- `GRANT EXECUTE ON FUNCTION match_af_chunks TO authenticated`
- Comment: `-- AF-12 / I-H14: SECURITY INVOKER ensures RLS is enforced as the calling user`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT prosecdef FROM pg_proc WHERE proname = 'match_af_chunks';"
# Must return 'f' — SECURITY INVOKER confirmed
npx ts-node scripts/lint/index.ts definer-lint filter-lint currency-lint
```

---

### Task 2.11 — Migration 0073: Agent Factory — Observability

**Files to create (max 1):**
1. `supabase/migrations/0073_af_observability.sql`

**Content boundary:**
- `CREATE TABLE agent_observations` — full schema from Plan Part 2 §0073 (all `observation_kind` enum values listed in comments)
- `ALTER TABLE agent_observations ENABLE ROW LEVEL SECURITY`
- `CREATE POLICY "agent_observations_self_read"` — user sees their own observations; admin sees all
- `CREATE INDEX` on `agent_observations(request_id)`
- `CREATE INDEX` on `agent_observations(user_id, created_at DESC)`
- `CREATE INDEX` on `agent_observations(observation_kind, created_at DESC)`
- `REVOKE ALL ON agent_observations FROM public`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "\d agent_observations" | grep "observation_kind\|request_id\|latency_ms"
```

---

### Task 2.12 — Migration 0074: Agent Factory — RLS & `search_path` Hardening

**Files to create (max 1):**
1. `supabase/migrations/0074_af_rls_hardening.sql`

**Content boundary:**
- Re-issue `current_user_role_group()` with `SET search_path = ''` — `-- AF-13`
- Re-issue `has_property_capacity()` with `SET search_path = ''`
- Re-issue `is_matter_party()` with `SET search_path = ''`
- Re-issue `is_facility_party()`, `is_work_package_party()`, `is_design_package_party()` with `SET search_path = ''`
- Re-issue `subject_party()` with `SET search_path = ''`
- Add `SET search_path = ''` to all DEFINER functions added in 0060–0072 that are missing it

**Note to executor:** This migration only contains `CREATE OR REPLACE FUNCTION` statements. No new tables. Each function body must be identical to the original except for the added `SET search_path = ''` and fully-qualified object names (e.g., `public.matter_parties`, `public.ethical_walls`).

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts definer-lint
# definer-lint must PASS — no DEFINER function missing search_path
```

---

### Task 2.13 — Migration 0075: Agent Factory — Grants

**Files to create (max 1):**
1. `supabase/migrations/0075_af_grants.sql`

**Content boundary:**
- `GRANT EXECUTE ON FUNCTION match_af_chunks TO authenticated`
- `GRANT EXECUTE ON FUNCTION subject_party TO authenticated`
- `GRANT SELECT ON typed_agents TO authenticated`
- `GRANT SELECT ON agent_assignments TO authenticated`
- `REVOKE ALL ON typed_agents FROM public`
- `REVOKE ALL ON agent_assignments FROM public`
- `REVOKE ALL ON agent_observations FROM public`
- Comment: `-- I-19: no SELECT on embedding column granted to authenticated role directly`
- `REVOKE SELECT (embedding) ON authority_corpus FROM authenticated`
- `REVOKE SELECT (embedding) ON tenant_corpus FROM authenticated`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts embedding-lint servicerole-lint
```

---

### Task 2.14 — Migration 0076: Agent Factory — Validation Assertions

**Files to create (max 1):**
1. `supabase/migrations/0076_af_validation.sql`

**Content boundary:** All DO-block validation assertions from Plan Part 2 §0076:
1. I-A2: `typed_agents` has no `system_prompt` text column (only `system_prompt_hash`)
2. I-A4: `authority_corpus.owner_org_id` NOT NULL constraint does not exist (it IS null)
3. I-A5: `tenant_corpus.owner_org_id` IS NOT NULL
4. I-A10: `embedding` column grant revoked from `authenticated` on both corpus tables
5. AF-12: `match_af_chunks()` is SECURITY INVOKER
6. AF-13: `current_user_role_group()` body contains `search_path`

Final `COMMENT ON SCHEMA public` recording Agent Factory as validated.

**Validation:**
```bash
supabase db reset
echo "Agent Factory (0070–0076) validated"
npx ts-node scripts/lint/index.ts definer-lint embedding-lint
```

---

### Task 2.15 — Migration 0080: HRAG Vault — ltree Nodes & Authority DAG

**Files to create (max 1):**
1. `supabase/migrations/0080_hrag_nodes_and_dag.sql`

**Content boundary:**
- `CREATE EXTENSION IF NOT EXISTS ltree`
- `CREATE TABLE vault_nodes` — with `ltree` path column — `-- I-H1: every path must be registered here before use`
- `CREATE TABLE authority_edges` — DAG for hierarchical authority precedence
- `CREATE FUNCTION guard_no_authority_cycle()` — cycle detection in DAG — `-- I-H2`
- `CREATE TRIGGER authority_edges_cycle_guard`
- `CREATE FUNCTION guard_corpus_path_registration()` — prevents corpus inserts with unregistered paths — `-- I-H1`
- `CREATE TRIGGER authority_corpus_path_guard` on `authority_corpus`
- `CREATE TRIGGER tenant_corpus_path_guard` on `tenant_corpus`
- `CREATE INDEX` on `vault_nodes(path)` using GiST
- RLS on `vault_nodes` and `authority_edges`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT typname FROM pg_type WHERE typname = 'ltree';"
# 1 row
npx ts-node scripts/lint/index.ts definer-lint claim-lint
```

---

### Task 2.16 — Migration 0081: HRAG Vault — Corpus Path Integration

**Files to create (max 1):**
1. `supabase/migrations/0081_hrag_corpus_paths.sql`

**Content boundary:**
- Alter `authority_corpus.path` column type from `text` to `ltree` (with cast)
- Alter `tenant_corpus.path` column type from `text` to `ltree`
- Add `jurisdiction text NOT NULL` to `authority_corpus` — `-- I-H22, claim-lint`
- Add `jurisdiction text` to `tenant_corpus`
- `CREATE INDEX` on `authority_corpus(path)` using GiST
- `CREATE INDEX` on `tenant_corpus(path)` using GiST
- Seed the canonical jurisdiction tree in `vault_nodes` (US, US.Federal, US.NY, US.CA, US.FL, US.TX, US.NJ, US.CT, INTL.Standards)

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT path FROM vault_nodes ORDER BY path;" | wc -l
# Must be ≥ 9 rows (seeded jurisdiction nodes)
npx ts-node scripts/lint/index.ts claim-lint
```

---

### Task 2.17 — Migration 0082: HRAG Vault — Cross-Party Disclosures

**Files to create (max 1):**
1. `supabase/migrations/0082_hrag_disclosures.sql`

**Content boundary:**
- `CREATE TABLE hrag_cross_party_disclosures` — `-- I-H7: consent required before cross-party corpus sharing`
- `CREATE FUNCTION guard_disclosure_consent()` — verifies disclosure record exists before cross-party chunk retrieval — `-- I-H7`
- `CREATE TRIGGER hrag_disclosure_consent_guard`
- `CREATE FUNCTION guard_shared_branch_write()` — prevents tenant publishers from writing to shared authority branches — `-- I-H21`
- `CREATE TRIGGER ac_publisher_only` on `authority_corpus` — `-- I-H21`
- RLS on `hrag_cross_party_disclosures`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname IN ('guard_disclosure_consent','guard_shared_branch_write');"
# 2 rows
npx ts-node scripts/lint/index.ts definer-lint
```

---

### Task 2.18 — Migration 0083: HRAG Vault — Ingestion Queue

**Files to create (max 1):**
1. `supabase/migrations/0083_hrag_ingestion_queue.sql`

**Content boundary:**
- `CREATE TABLE hrag_ingestion_queue` — full schema: `org_id`, `submitted_by`, `path ltree`, `effective_from`, `effective_to`, `raw_storage_path`, `microvm_proof`, `microvm_provider`, `pii_scan_status`, `status` — `-- I-H3, I-H6, I-H7`
- Comment on every PII-adjacent column name that intentionally does NOT exist (name, address, ssn, email, phone) — `-- vault-pii-lint: these columns are deliberately absent (I-H3)`
- `CREATE FUNCTION guard_hrag_queue_org()` — prevents cross-org queue insertion — `-- I-A5`
- `CREATE TRIGGER hrag_queue_org_guard`
- RLS on `hrag_ingestion_queue`
- `REVOKE ALL ON hrag_ingestion_queue FROM public`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts vault-pii-lint
# Must PASS — no PII column names in hrag_ingestion_queue
psql $DATABASE_URL -c "\d hrag_ingestion_queue"
```

---

### Task 2.19 — Migration 0084: HRAG Vault — Retrieval RPCs

**Files to create (max 1):**
1. `supabase/migrations/0084_hrag_retrieval_rpcs.sql`

**Content boundary:**
- `CREATE FUNCTION match_hrag_chunks(...)` — **SECURITY INVOKER** — `-- I-H14, AF-12`
  - Parameters: `p_query_embedding vector`, `p_vault_paths ltree[]`, `p_jurisdiction text`, `p_as_of date`, `p_match_count int`, `p_caller_id uuid`
  - Pre-filter: `WHERE path <@ ANY(p_vault_paths) AND jurisdiction = p_jurisdiction AND (effective_to IS NULL OR effective_to > p_as_of) AND superseded_by IS NULL`
  - Wall check embedded: exclude chunks whose `matter_id` (if any) is walled for the caller
  - ANN: `ORDER BY embedding <=> p_query_embedding LIMIT p_match_count`
  - `-- I-A9: pre-filter before ANN operator`
- `CREATE FUNCTION match_tenant_chunks(...)` — **SECURITY INVOKER** — `-- I-A5`
  - Parameters: `p_query_embedding vector`, `p_org_id uuid`, `p_vault_paths ltree[]`, `p_as_of date`, `p_match_count int`, `p_caller_id uuid`
  - Pre-filter: `WHERE owner_org_id = p_org_id AND path <@ ANY(p_vault_paths) AND (effective_to IS NULL OR effective_to > p_as_of)`
- `CREATE FUNCTION resolve_scope_set(...)` — returns `jsonb` of allowed paths for a user/subject pair — `-- I-H14`
- `GRANT EXECUTE ON FUNCTION match_hrag_chunks TO authenticated`
- `GRANT EXECUTE ON FUNCTION match_tenant_chunks TO authenticated`
- `GRANT EXECUTE ON FUNCTION resolve_scope_set TO authenticated`

**Validation:**
```bash
supabase db reset
psql $DATABASE_URL -c "SELECT prosecdef FROM pg_proc WHERE proname IN ('match_hrag_chunks','match_tenant_chunks');"
# Both must return 'f' (SECURITY INVOKER)
npx ts-node scripts/lint/index.ts definer-lint filter-lint currency-lint
```

---

### Task 2.20 — Migration 0085: HRAG Vault — RLS Hardening

**Files to create (max 1):**
1. `supabase/migrations/0085_hrag_rls_hardening.sql`

**Content boundary:**
- Re-issue `authority_corpus` RLS policies with `path` using ltree operators (`@>`, `<@`)
- Re-issue `tenant_corpus` RLS SELECT policy with explicit org isolation — `-- I-A5`
- `CREATE POLICY "vault_nodes_authenticated_read"` — any authenticated user may read vault node labels (not corpus content) — enables client-side jurisdiction picker
- `CREATE POLICY "authority_edges_authenticated_read"` — same
- `REVOKE ALL ON hrag_cross_party_disclosures FROM public`
- `REVOKE ALL ON hrag_ingestion_queue FROM public`
- `REVOKE ALL ON vault_nodes FROM public`
- `GRANT SELECT ON vault_nodes TO authenticated`

**Validation:**
```bash
supabase db reset
npx ts-node scripts/lint/index.ts wall-lint definer-lint embedding-lint servicerole-lint
```

---

### Task 2.21 — Migration 0086: HRAG Vault — Final Validation Assertions

**Files to create (max 1):**
1. `supabase/migrations/0086_hrag_validation.sql`

**Content boundary:** All DO-block validation assertions from Plan Part 2 §0086:
1. I-H1: `guard_corpus_path_registration()` trigger exists on both corpus tables
2. I-H2: `guard_no_authority_cycle()` trigger exists on `authority_edges`
3. I-H3: `hrag_ingestion_queue` has none of the forbidden PII column names
4. I-H14: `match_hrag_chunks()` is SECURITY INVOKER
5. I-H14: `match_tenant_chunks()` is SECURITY INVOKER
6. I-H14: `resolve_scope_set()` function exists
7. I-H21: `ac_publisher_only` trigger exists on `authority_corpus`
8. `coverage_assertions` table has ≥ 1 row
9. `subject_party()` and `subject_party_for()` functions exist
10. `match_hrag_chunks()` is NOT SECURITY DEFINER (belt-and-suspenders check)

Final `COMMENT ON SCHEMA public` recording the complete v3.0 migration range `0001–0086`.

**Validation:**
```bash
supabase db reset
# 0086 must complete without exception
echo "HRAG Vault Network (0080–0086) validated"
npx ts-node scripts/lint/index.ts   # all 17 rules must PASS
supabase db diff --use-migra        # must return zero diff against staging
```

---

### ✅ Phase 2 Exit Criteria

- [ ] `supabase db reset` completes without error on migrations 0001–0086
- [ ] Migration 0066 validation assertions all pass (Legal Workspace clean)
- [ ] Migration 0076 validation assertions all pass (Agent Factory clean)
- [ ] Migration 0086 validation assertions all pass (HRAG Vault clean)
- [ ] All 17 CI lint rules pass: `npx ts-node scripts/lint/index.ts`
- [ ] `supabase db diff --use-migra` returns zero diff on `staging`
- [ ] `psql $DATABASE_URL -c "SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;"` returns ≥ 35 functions
- [ ] `psql $DATABASE_URL -c "SELECT prosecdef FROM pg_proc WHERE proname IN ('match_hrag_chunks','match_tenant_chunks','match_af_chunks');"` — all return `f` (INVOKER)

---

## Overall Tasks Part 1 Summary

| Phase | Tasks | Migrations | Status |
|---|---|---|---|
| Phase 0 — Pre-Flight | 0.1 – 0.9 | — | 9 tasks |
| Phase 1 — Foundation DB | 1.1 – 1.19 | 0001–0059 | 19 tasks |
| Phase 2 — Hardened Infrastructure | 2.1 – 2.21 | 0060–0086 | 21 tasks |
| **Total Part 1** | **49 tasks** | **86 migrations** | |

---

*End of Tasks_v3_Part1.md*

# Shtiya Builder Ecosystem v3.0 — Execution Checklist
## Tasks.md — Part 2 of 2: API Routes, UI, Agentic Pipelines & Final Sign-off

**Document class:** Execution Checklist — Micro-Sprint Methodology
**Produced by:** IBM Bob, Lead Architect & Project Manager
**Version:** 3.0
**Anchored to:** `Plan_v3_Part1.md` · `Plan_v3_Part2.md` · `Plan_v3_Part3.md`
**Predecessor:** `Tasks_v3_Part1.md` (Phase 0–2 complete; 49 tasks)
**Task numbering continues from Part 1:** Tasks begin at Phase 3.

---

## Micro-Sprint Rules (Reminder)

1. **Max 3 files per task.** Never write more than 3 files in a single assistant turn.
2. **Max 500 lines per file.** Split into `_part_a` / `_part_b` if needed.
3. **Validate before proceeding.** Run the stated validation command. Do not start the next task until it passes.
4. **No speculative work.** Only write what the current task requires.
5. **Invariant traceability.** Every function, route handler, or component that enforces an invariant carries an inline comment citing its ID.

---

## Phase 3 — Backend API Routes

> **Goal:** Implement all server-side route handlers. No UI yet — these routes
> are consumed by tests and eventually by the UI built in Phase 4.
> Every route is covered by an integration test before Phase 3 exits.
> `npm run test` must pass green after each task.

---

### Task 3.1 — Supabase Server Client Helpers

**Files to create (max 2):**
1. `src/lib/supabase/server.ts` — server-side Supabase client (service-role)
2. `src/lib/supabase/types.ts` — generated Database type (from `supabase gen types typescript`)

**`server.ts` requirements:**
- Export `createServiceClient()` — uses `SUPABASE_SERVICE_ROLE_KEY`. This is the ONLY place the service-role key is instantiated. All API routes import from here.
- Export `getAuthenticatedUser(req: NextRequest)` — extracts the JWT from `Authorization: Bearer` header, calls `supabase.auth.getUser()`, returns `User | null`.
- Export `getCallerOrgId(userId: string)` — queries `org_members` to return the caller's `org_id`. Returns `null` if no org membership.
- Comment on `createServiceClient`: `-- servicerole-lint: this is the only authorized instantiation of the service-role client`

**Validation:**
```bash
npm run typecheck   # must exit 0
npx ts-node scripts/lint/index.ts servicerole-lint
```

---

### Task 3.2 — Shared Route Utilities

**Files to create (max 2):**
1. `src/lib/api/guards.ts` — reusable auth + authorization guards
2. `src/lib/api/existence-protection.ts` — existence-protected 404 helper

**`guards.ts` requirements:**
- `requireAuth(req)` — calls `getAuthenticatedUser`; returns 401 if null
- `requireMatterParty(userId, matterId, supabase)` — calls `is_matter_party()` RPC; returns 403 if false
- `requireWallClear(userId, matterId, supabase)` — calls `wall_blocks_user()` RPC; returns existence-protected 404 if true — `-- I-L11, I-L12`
- `requireFacilityParty(userId, facilityId, supabase)` — calls `is_facility_party()`

**`existence-protection.ts` requirements:**
- Export `existenceProtectedNotFound(requestId: string): NextResponse`
- Pads response body to 512 bytes (p50 byte length) — `-- I-L11`
- Returns `404` with `Content-Type: application/json` and `X-Request-Id` header
- Comment: `-- I-L11: walled matter is byte-identical to non-existent matter`

**Validation:**
```bash
npm run typecheck
```

---

### Task 3.3 — `POST /api/legal/trust/disburse`

**Files to create (max 2):**
1. `src/app/api/legal/trust/disburse/route.ts`
2. `src/app/api/legal/trust/disburse/route.test.ts`

**Route handler requirements (from Plan Part 3 §I.5.1):**
- Parse and validate `TrustDisburseRequest` with Zod
- `requireAuth` + `requireMatterParty` + `requireWallClear`
- Check `trust_accounts.debit_block_attested = true` and `debit_block_attested_at` within 90 days → `403 DEBIT_BLOCK_NOT_ATTESTED` — `-- I-L5`
- Validate `debit_kind` against the closed enum → `400 INVALID_DEBIT_KIND` — `-- I-L3`
- Call `per_client_solvency_check()` RPC → `422 SOLVENCY_CHECK_FAILED` — `-- I-L6`
- Insert into `trust_ledger` with `status = 'pending'`, `maker_id = user.id`, `checker_id = null`
- Return `202` with `{ ledger_entry_id, status: 'pending', dual_control_url, expires_at }`

**Test cases (minimum 5):**
1. Valid request → `202` returned
2. Same-person dual control (maker = checker) → `422` (tested via the DB constraint, not route logic)
3. `debit_block_attested = false` → `403 DEBIT_BLOCK_NOT_ATTESTED`
4. Invalid `debit_kind` value → `400 INVALID_DEBIT_KIND`
5. Walled matter → `404` with body length = 512 bytes

**Validation:**
```bash
npm test src/app/api/legal/trust/disburse/route.test.ts
npx ts-node scripts/lint/index.ts log-lint servicerole-lint wall-lint
```

---

### Task 3.4 — `POST /api/legal/trust/check`

**Files to create (max 2):**
1. `src/app/api/legal/trust/check/route.ts`
2. `src/app/api/legal/trust/check/route.test.ts`

**Route handler requirements (from Plan Part 3 §I.5.2):**
- Parse `TrustCheckRequest` with Zod
- `requireAuth`
- Fetch the pending `trust_ledger` row by `ledger_entry_id`
- Call `guard_identity_dual_control()` RPC — verify checker's `identity_subject_id` differs from maker's — `-- I-L1`
- Verify checker holds `firm_role` in `('partner', 'associate', 'of_counsel')` — `-- I-L2`
- On `approve`: UPDATE `trust_ledger` SET `status = 'posted'`, `checker_id = user.id` → `200 { status: 'posted' }`
- On `reject`: INSERT contra entry, set original row `status = 'reversed'` → `200 { status: 'rejected' }`

**Test cases (minimum 4):**
1. Valid approval by a different identity subject → `200 posted`
2. Same natural person as maker (same `identity_subject_id`) → `422`
3. Checker is a paralegal (not partner/associate/of_counsel) → `403`
4. Ledger entry already posted → `409 ALREADY_PROCESSED`

**Validation:**
```bash
npm test src/app/api/legal/trust/check/route.test.ts
npx ts-node scripts/lint/index.ts log-lint
```

---

### Task 3.5 — `POST /api/legal/gig/assign`

**Files to create (max 2):**
1. `src/app/api/legal/gig/assign/route.ts`
2. `src/app/api/legal/gig/assign/route.test.ts`

**Route handler requirements (from Plan Part 3 §I.5.3):**
- Parse `GigAssignRequest` with Zod
- `requireAuth` + `requireMatterParty` + `requireWallClear` (via gig_job's `matter_id`)
- Verify `professional_licences` row: `standing = 'active'` and `jurisdiction` matches gig job's `jurisdiction` → `422 LICENCE_MISMATCH` — `-- I-L19`
- Verify `matter_parties` row for provider has `expires_at IS NOT NULL` → `422 EXPIRY_REQUIRED` — `-- I-L20`
- Call `issue_capture_nonce()` RPC → returns plaintext nonce
- Store HMAC-SHA256 hash of nonce in `gig_assignments.capture_nonce`
- Return `201 { assignment_id, capture_nonce (plaintext — returned ONCE only), nonce_expires_at }` — `-- I-L17`

**Test cases (minimum 4):**
1. Valid assignment → `201` + nonce present
2. Expired licence → `422 LICENCE_MISMATCH`
3. Provider `matter_parties` row has `expires_at = null` → `422 EXPIRY_REQUIRED`
4. Non-counsel-of-record caller → `403`

**Validation:**
```bash
npm test src/app/api/legal/gig/assign/route.test.ts
npx ts-node scripts/lint/index.ts log-lint wall-lint
```

---

### Task 3.6 — `POST /api/legal/gig/submit` & `POST /api/legal/gig/accept`

**Files to create (max 3):**
1. `src/app/api/legal/gig/submit/route.ts`
2. `src/app/api/legal/gig/accept/route.ts`
3. `src/app/api/legal/gig/submit/route.test.ts`

**`submit` route requirements (Plan Part 3 §I.5.4):**
- Parse `GigSubmitRequest` with Zod
- `requireAuth`
- Call `verify_capture_nonce()` RPC with submitted nonce:
  - Mismatch → `403 NONCE_INVALID` — `-- I-L17`
  - Already consumed → `403 NONCE_CONSUMED`
  - Expired → `403 NONCE_EXPIRED`
- Insert into `gig_submissions` with `accepted_by = null`
- Return `202 { submission_id, status: 'submission_pending', acceptance_url }` — `-- I-L16`
- Comment: `-- I-L16: provenance gates acceptance, never money. No gig_escrow touch here.`

**`accept` route requirements (Plan Part 3 §I.5.5):**
- Parse `GigAcceptRequest` with Zod
- `requireAuth` + `requireMatterParty` + `requireWallClear`
- Verify caller is `matter_role = 'lead_counsel'` — `-- I-L16`
- Verify `gig_submissions.affidavit_verified = true`
- On `accept`: UPDATE `gig_escrow SET status = 'released'` only if `affidavit_verified = true`
- On `reject`: UPDATE `gig_escrow SET status = 'returned'`
- Verify `gig_escrow.source_type != 'trust_ledger'` before any release — `-- I-L21`

**Test cases for `submit` (minimum 3):**
1. Valid nonce → `202 submission_pending`
2. Consumed nonce → `403 NONCE_CONSUMED`
3. Expired nonce → `403 NONCE_EXPIRED`

**Validation:**
```bash
npm test src/app/api/legal/gig/submit/route.test.ts
npx ts-node scripts/lint/index.ts log-lint wall-lint
```

---

### Task 3.7 — `POST /api/vault/tenant-corpus`

**Files to create (max 2):**
1. `src/app/api/vault/tenant-corpus/route.ts`
2. `src/app/api/vault/tenant-corpus/route.test.ts`

**Route handler requirements (from Plan Part 3 §I.6):**
- Parse `multipart/form-data`
- `requireAuth` + `getCallerOrgId` (403 if no org) — `-- I-A5`
- File size guard: > 20 MB → `413 FILE_TOO_LARGE`
- Call `verifyMicrovmProof()` with `{ proof, provider, fileHash }` → `422 MICROVM_PROOF_INVALID` on fail — `-- I-H6`
- Call `assertPathWithinOrg()` → `403 PATH_OUT_OF_SCOPE` on fail
- Call `proofIncludesPiiScan()` → `422 PII_SCAN_NOT_ATTESTED` on fail — `-- I-H3`
- Store raw file in `vault-raw` bucket
- Insert into `hrag_ingestion_queue` with `status = 'queued'`
- Comment: `-- vault-pii-lint: DB write follows proof validation, never precedes it`
- Return `202 { ingest_id, status: 'queued', path }`

**Test cases (minimum 5):**
1. Valid upload + proof → `202 queued`
2. File > 20 MB → `413`
3. Invalid MicroVM proof → `422 MICROVM_PROOF_INVALID`
4. Proof missing PII scan attestation → `422 PII_SCAN_NOT_ATTESTED`
5. Path outside org scope → `403 PATH_OUT_OF_SCOPE`

**Validation:**
```bash
npm test src/app/api/vault/tenant-corpus/route.test.ts
npx ts-node scripts/lint/index.ts vault-pii-lint log-lint servicerole-lint
```

---

### Task 3.8 — MicroVM Proof Utilities

**Files to create (max 2):**
1. `src/lib/vault/microvm.ts` — proof verification functions
2. `src/lib/vault/microvm.test.ts`

**`microvm.ts` requirements:**
- `verifyMicrovmProof({ proof, provider, fileHash })` — decodes the base64 proof, verifies the provider's signature using the provider's public key (stored in env), asserts `proof.file_sha256 === fileHash`
- `proofIncludesPiiScan(proof: string): boolean` — decodes proof, checks that `proof.steps` includes a step with `type = 'pii_scan'` and `status = 'passed'`
- `assertPathWithinOrg({ path, orgId }: { path: string, orgId: string }): Promise<boolean>` — queries `vault_nodes` to verify the given ltree path is within the org's registered scope
- `sha256(buffer: ArrayBuffer): Promise<string>` — returns hex SHA-256
- Support three providers: `firecracker`, `gvisor`, `kata` — each has a distinct public key env var (`MICROVM_PUBKEY_FIRECRACKER`, etc.)

**Test cases (minimum 4):**
1. Valid Firecracker proof → `verifyMicrovmProof` returns `true`
2. Tampered proof (wrong file hash) → returns `false`
3. Proof without PII scan step → `proofIncludesPiiScan` returns `false`
4. Path within org scope → `assertPathWithinOrg` returns `true`

**Validation:**
```bash
npm test src/lib/vault/microvm.test.ts
```

---

### Task 3.9 — Agent Scope Set Builder

**Files to create (max 2):**
1. `src/lib/agent/scope-set.ts`
2. `src/lib/agent/scope-set.test.ts`

**`scope-set.ts` requirements:**
- `buildScopeSet({ userId, subjectKind, subjectId, supabase })` — calls `resolve_scope_set()` RPC (installed in migration 0084)
- Returns `ScopeSet`:
  ```typescript
  interface ScopeSet {
    denied:       boolean;        // true if subject_party() returns false or wall blocks
    allowedPaths: string[];       // ltree path strings from vault_nodes
    jurisdiction: string;         // primary jurisdiction for the subject
    orgId:        string | null;  // org for tenant corpus access
    subjectKind:  string;
    subjectId:    string;
  }
  ```
- If `subject_party()` returns false → `{ denied: true, ... }`
- If `wall_blocks_user()` returns true (for matter subjects) → `{ denied: true, ... }` — `-- I-L11, I-L12`
- Comment: `-- I-A8: scope_set is always server-computed; never client-supplied`
- Comment: `-- I-H16: out-of-scope paths will be caught in supervisorRoute()`

**Test cases (minimum 4):**
1. Valid property subject → returns non-denied scope with allowed paths
2. User not a party → `denied: true`
3. Matter subject where wall blocks user → `denied: true`
4. Valid matter subject → returns jurisdiction and allowed paths

**Validation:**
```bash
npm test src/lib/agent/scope-set.test.ts
npx ts-node scripts/lint/index.ts plan-lint filter-lint
```

---

### Task 3.10 — Agent Type Resolver & System Prompts

**Files to create (max 3):**
1. `src/lib/agent/type-resolver.ts`
2. `src/lib/agent/prompts/index.ts`
3. `src/lib/agent/prompts/prompts.ts`

**`type-resolver.ts` requirements:**
- `resolveAgentType({ userId, scopeSet, requestedType, supabase })` — maps the user's primary role group to an `AgentType`; validates `requestedType` override against the allowed set for that group
- Returns `AgentType | null` (null → `403 NO_ELIGIBLE_AGENT`)
- Role-to-agent mapping (closed, compile-time constant — `-- I-A1`):
  ```typescript
  const ROLE_AGENT_MAP: Record<string, AgentType> = {
    owner:            'owner_advisor',
    investor:         'owner_advisor',
    lender:           'lender_underwriter',
    attorney:         'legal_researcher',
    neutral:          'arbitration_neutral',
    contractor:       'contractor_ops',
    architect:        'design_reviewer',
    property_manager: 'tenant_services',
    tenant:           'tenant_services',
    broker:           'broker_assistant',
    admin:            'admin_ops',
  };
  ```

**`prompts/prompts.ts` requirements:**
- Export one static `string` constant per agent type (10 total)
- Each prompt is a compile-time string literal — NO template literals, NO dynamic construction — `-- I-A1, prompt-lint`
- Each prompt includes a role identity statement, jurisdiction reminder, and the 3-way fallback instruction
- Example structure (owner_advisor):
  ```typescript
  export const OWNER_ADVISOR_PROMPT =
    "You are the Owner Advisor for the Shtiya Builder platform. " +
    "You assist property owners with factual, grounded information about " +
    "their specific property context. You never fabricate legal authority. " +
    "If no grounded authority exists, you must respond with no_authority_on_point. " +
    "You operate under New York law unless the jurisdiction label specifies otherwise.";
  ```

**`prompts/index.ts`:** Re-exports all 10 prompts as a `AGENT_PROMPTS` map keyed by `AgentType`.

**Validation:**
```bash
npm run typecheck
npx ts-node scripts/lint/index.ts prompt-lint
# prompt-lint must verify all system prompts are compile-time constants
```

---

### Task 3.11 — Output Gate: Fallback Templates & Citation Check

**Files to create (max 2):**
1. `src/lib/agent/fallback-templates.ts`
2. `src/lib/agent/output-gate/citation-check.ts`

**`fallback-templates.ts` requirements (from Plan Part 3 §I.3.3):**
```typescript
export const FALLBACK_TEMPLATES = {
  no_authority_on_point: "...",   // ≥ 80 chars, unique
  coverage_incomplete:   "...",   // ≥ 80 chars, unique, distinct from above
  scope_denied:          "...",   // ≥ 80 chars, unique, distinct from both above
} as const;
// Runtime FL-3 guard (fallback-lint also checks at CI time)
```
- The three strings must be unique — add a runtime assertion at module load — `-- fallback-lint FL-3`

**`citation-check.ts` requirements:**
- `checkCitations(raw, scopeSet, supabase)`:
  - If `raw.citations.length === 0`: check `coverage_assertions` for the scope's jurisdiction; if `satisfied = false` → `{ fallback: 'coverage_incomplete' }`; else → `{ fallback: 'no_authority_on_point' }`
  - If citations present: verify each `chunk_id` resolves to a live, non-superseded chunk in `authority_corpus` or `tenant_corpus`
  - Invalid chunk_id → strip that citation; if all stripped → `{ fallback: 'no_authority_on_point' }`
  - Returns `{ passed: boolean, citations: ValidCitation[], fallback?: FallbackKey }`

**Validation:**
```bash
npm run typecheck
npx ts-node scripts/lint/index.ts fallback-lint citation-lint
# Both must PASS
```

---

### Task 3.12 — Output Gate: Entailment & Jurisdiction Checks

**Files to create (max 2):**
1. `src/lib/agent/output-gate/entailment-check.ts`
2. `src/lib/agent/output-gate/jurisdiction-check.ts`

**`entailment-check.ts` requirements:**
- `checkEntailment(content, citations)`:
  - Split `content` into sentence-level claims using a deterministic sentence splitter (not a model)
  - For each claim, call `scoreEntailment(claim, citationText)` — a deterministic NLI classifier call (cross-encoder via a local or external endpoint defined in `ENTAILMENT_ENDPOINT` env var)
  - Claims with score < threshold (default: 0.7) are stripped from `content`
  - If > 50% of sentences are stripped → elevate to `no_authority_on_point`
  - Returns `{ content: string, stripped_count: number, fallback?: FallbackKey }`
- Comment: `-- I-A12: entailment check uses a deterministic classifier, never the generative model`

**`jurisdiction-check.ts` requirements:**
- `checkJurisdiction(citations, scopeSet)`:
  - For each citation, verify `citation.jurisdiction` matches `scopeSet.jurisdiction` OR is in `['federal', 'universal_standards', 'US.Federal']`
  - Out-of-jurisdiction citations are stripped
  - If a claim relied solely on a stripped citation → that claim is re-evaluated by entailment (may cascade to strip or fallback)
  - Returns `{ citations: ValidCitation[], stripped_count: number }`
- Comment: `-- I-H22: jurisdiction-scoped citations only`

**Validation:**
```bash
npm run typecheck
npx ts-node scripts/lint/index.ts citation-lint
```

---

### Task 3.13 — Output Gate: Exfil Strip & Tool-Shape Strip

**Files to create (max 2):**
1. `src/lib/agent/output-gate/exfil-strip.ts`
2. `src/lib/agent/output-gate/tool-shape-strip.ts`

**`exfil-strip.ts` requirements:**
- `stripExfil(content, orgId, supabase)`:
  - Apply regex patterns for SSN (`\d{3}-\d{2}-\d{4}`), EIN (`\d{2}-\d{7}`), routing numbers (ABA 9-digit), account numbers
  - Apply `storage_path` pattern (any string starting with `/vault-raw/` or `/documents/`)
  - Replace all matches with `[REDACTED]`
  - Returns `{ content: string, triggered: boolean, match_count: number }`
  - If `triggered`: log `EXFIL_STRIP_TRIGGERED` to caller (to be written to `agent_observations`) — `-- I-A16`
- Comment: `-- I-A16: no org-private content or PII may transit through model output`

**`tool-shape-strip.ts` requirements:**
- `stripToolShapes(content)`:
  - Regex patterns: `\{"tool":`, `\{"function":`, `<tool_call>`, `</tool_call>`, `\{"name":.*"arguments":`
  - Strip matched token sequences from `content`
  - Returns `{ content: string, triggered: boolean }`
  - If `triggered`: log event tag `TOOL_SHAPE_LEAK` — `-- I-A3`
  - If `content.trim() === ''` after strip → `{ content: '', triggered: true, fallback: 'no_authority_on_point' }`

**Validation:**
```bash
npm run typecheck
npx ts-node scripts/lint/index.ts param-lint
```

---

### Task 3.14 — Output Gate: Orchestrator

**Files to create (max 2):**
1. `src/lib/agent/output-gate/index.ts`
2. `src/lib/agent/output-gate/index.test.ts`

**`index.ts` requirements:**
- `runOutputGate({ raw, agentType, scopeSet, requestId })`:
  - Runs the 5 checks in sequence (Plan Part 3 §I.3.1 pipeline order): Citation → Entailment → Jurisdiction → Exfil → Tool-Shape
  - Short-circuits to fallback if any check demands it (does NOT continue processing a fallback response)
  - Assembles `GateResult`:
    ```typescript
    interface GateResult {
      content:   string;
      citations: ValidCitation[];
      fallback?: FallbackKey;
      gates: {
        citation_passed:         boolean;
        entailment_passed:       boolean;
        jurisdiction_passed:     boolean;
        exfil_strip_applied:     boolean;
        tool_shape_strip_applied: boolean;
      };
    }
    ```
  - Comment: `-- I-A15: no raw model response ever bypasses the Output Gate`

**Test cases (minimum 5):**
1. Clean response with valid citations → all gates passed, `fallback` undefined
2. Response with 0 citations (coverage satisfied) → `fallback: 'no_authority_on_point'`
3. Response with 0 citations (coverage unsatisfied) → `fallback: 'coverage_incomplete'`
4. Response with SSN pattern → exfil strip fires, `[REDACTED]` in output
5. Response with `{"tool": ...}` tool shape → tool-shape strip fires

**Validation:**
```bash
npm test src/lib/agent/output-gate/index.test.ts
npx ts-node scripts/lint/index.ts fallback-lint citation-lint
```

---

### Task 3.15 — Supervisor-Worker: Supervisor LLM Call

**Files to create (max 2):**
1. `src/lib/agent/supervisor.ts`
2. `src/lib/agent/supervisor.test.ts`

**`supervisor.ts` requirements (from Plan Part 3 §I.4):**
- `supervisorRoute({ agentType, scopeSet, messages, userId, requestId, supabase })`
- `callSupervisorLLM({ agentType, scopeSet, lastUserTurn, requestId })`:
  - System prompt: static import from `AGENT_PROMPTS[agentType]` — no dynamic construction — `-- I-A6, prompt-lint`
  - User message: `lastUserTurn` only — scope set labels appended as a structured JSON field, NOT as prose — `-- I-A6`
  - Returns `SupervisorPlan`
- Plan validation loop — checks every `task.target_paths` entry against `scopeSet.allowedPaths` — `-- I-H16, plan-lint`:
  ```typescript
  for (const task of plan.tasks) {
    for (const path of task.target_paths) {
      if (!scopeSet.allowedPaths.includes(path)) {
        // Discard ENTIRE plan — no partial execution (I-H16)
        await logScopeLeak({ requestId, userId, offendingPath: path, supabase });
        return { fallback: 'scope_denied', citations: [], content: '' };
      }
    }
  }
  ```
- Worker dispatch after validation: parallel `Promise.all` over non-synthesis tasks

**Test cases (minimum 3):**
1. Valid plan with in-scope paths → workers dispatched
2. Plan with one out-of-scope path → entire plan discarded, `scope_denied`
3. Supervisor LLM call uses static system prompt (no dynamic construction) → `param-lint` compatible

**Validation:**
```bash
npm test src/lib/agent/supervisor.test.ts
npx ts-node scripts/lint/index.ts plan-lint param-lint prompt-lint
```

---

### Task 3.16 — Supervisor-Worker: Retrieval Workers

**Files to create (max 2):**
1. `src/lib/agent/workers/authority-retrieval.ts`
2. `src/lib/agent/workers/tenant-retrieval.ts`

**`authority-retrieval.ts` requirements (Plan Part 3 §I.4.2):**
- `authorityRetrievalWorker({ task, userId, scopeSet, supabase })`
- Calls `supabase.rpc('match_hrag_chunks', { p_query_embedding, p_vault_paths, p_jurisdiction, p_as_of, p_match_count: 8, p_caller_id })` — `-- I-A9: p_vault_paths is the pre-filter`
- `p_vault_paths` must NEVER be empty — guard: if `task.target_paths.length === 0` throw `Error('filter-lint: empty p_vault_paths')` — `-- filter-lint`
- Returns `RetrievedChunk[]`

**`tenant-retrieval.ts` requirements (Plan Part 3 §I.4.3):**
- `tenantRetrievalWorker({ task, userId, scopeSet, supabase })`
- Calls `supabase.rpc('match_tenant_chunks', { p_query_embedding, p_org_id: scopeSet.orgId, p_vault_paths, p_as_of, p_match_count: 5, p_caller_id })`
- `p_org_id` is always `scopeSet.orgId` (server-derived) — never client-supplied — `-- I-A5`
- Same empty `p_vault_paths` guard

**Validation:**
```bash
npm run typecheck
npx ts-node scripts/lint/index.ts filter-lint currency-lint embedding-lint
```

---

### Task 3.17 — Observability: `emitObservation()`

**Files to create (max 2):**
1. `src/lib/agent/observability.ts`
2. `src/lib/agent/observability.test.ts`

**`observability.ts` requirements (Plan Part 3 §II.6):**
- `emitObservation(params)` — inserts into `agent_observations` using the service-role client
- Accepts all `ObservationKind` values
- Never throws — wraps the insert in try/catch and logs to stderr on failure (observability must not break the request path)
- `logScopeLeak({ requestId, userId, offendingPath, supabase })` — emits `scope_leak` observation — `-- I-H16`
- `logExfilStrip({ requestId, matchCount })` — emits `exfil_strip` observation — `-- I-A16`
- `logToolShapeLeak({ requestId })` — emits `tool_shape_leak` observation — `-- I-A3`
- All functions are ASYNC but callers use fire-and-forget `void emitObservation(...)` to avoid adding to request latency

**Test cases (minimum 2):**
1. `emitObservation` inserts a row into `agent_observations`
2. `emitObservation` does NOT throw even if Supabase is unreachable (catches and logs to stderr)

**Validation:**
```bash
npm test src/lib/agent/observability.test.ts
npx ts-node scripts/lint/index.ts log-lint
```

---

### Task 3.18 — `/api/copilot` Route (LIVE DEFECT FIX + Full Handler)

**Files to create (max 2):**
1. `src/app/api/copilot/route.ts`
2. `src/app/api/copilot/route.test.ts`

**Route handler requirements (from Plan Part 3 §I.2.3):**
- Parse body; immediately check for `'context' in body` → `400 PROSE_CONTEXT_FORBIDDEN` — `-- LIVE DEFECT FIX, I-A6`
- Validate `CopilotRequest` with Zod (messages array, subject object, optional agent_type)
- `requireAuth`
- `buildScopeSet(...)` → if `denied` return `existenceProtectedNotFound()` — `-- I-L11`
- `resolveAgentType(...)` → if null return `403 NO_ELIGIBLE_AGENT`
- `supervisorRoute(...)` → raw response
- `runOutputGate(...)` → gated response
- `void emitObservation(...)` — fire-and-forget — `-- I-A14, log-lint`
- Return `CopilotResponse` with `X-Request-Id` header

**Test cases (minimum 7):**
1. Request with `{ context: "prose" }` → `400 PROSE_CONTEXT_FORBIDDEN` ← **B-1 blocker closed**
2. Valid request → `200` with `citations` array and `gates` object
3. Unauthenticated → `401`
4. User not a party to subject → `404` (existence-protected, 512 bytes)
5. All citations invalid → `fallback: 'no_authority_on_point'`
6. Coverage unsatisfied → `fallback: 'coverage_incomplete'`
7. Plan with out-of-scope path → `fallback: 'scope_denied'`

**Validation:**
```bash
npm test src/app/api/copilot/route.test.ts
npx ts-node scripts/lint/index.ts   # ALL 17 rules must PASS
```

---

### Task 3.19 — Agent Lifecycle Routes

**Files to create (max 3):**
1. `src/app/api/agents/create/route.ts`
2. `src/app/api/agents/[id]/pause/route.ts`
3. `src/app/api/agents/[id]/retire/route.ts`

**`create` route requirements:**
- Server-only (validate `INTERNAL_API_KEY` header — not a Supabase JWT)
- Accept `{ agent_type, corpus_kind, system_prompt }` via Zod
- Store `system_prompt` to secrets store (env: `SECRETS_STORE_ENDPOINT`); record only `system_prompt_hash` in `typed_agents` — `-- I-A2`
- Guard: `corpus_kind` must be `'authority'` or `'tenant'`; reject dual assignment — `-- I-A4`: `422 CROSS_CORPUS_ASSIGNMENT`
- Emit `lifecycle` observation

**`pause` / `retire` routes:**
- Server-only (same `INTERNAL_API_KEY` guard)
- `pause`: UPDATE `typed_agents SET status = 'paused'`; emit `lifecycle` observation
- `retire`: UPDATE `typed_agents SET status = 'retired'`; irreversible — add CHECK that `'retired'` → cannot transition back — `-- I-A1`; emit `lifecycle` observation

**Validation:**
```bash
npm run typecheck
npx ts-node scripts/lint/index.ts tools-lint log-lint
```

---

### ✅ Phase 3 Exit Criteria

- [ ] All route handler test files pass: `npm test`
- [ ] `PROSE_CONTEXT_FORBIDDEN` test case passes (B-1 blocker closed)
- [ ] All 17 CI lint rules pass: `npx ts-node scripts/lint/index.ts`
- [ ] Walled matter returns 404 body of exactly 512 bytes (existence protection verified)
- [ ] Exfil strip test: injected SSN does not appear in response body
- [ ] Scope leak test: out-of-scope plan path never reaches a worker
- [ ] `npm run typecheck` exits 0

---

## Phase 4 — Frontend UI & State

> **Goal:** Build the application shell, workspace navigation, and all Group
> practice-area workbenches. The Zustand state layer is built first (Task 4.1)
> because it is the anti-corruption boundary that enforces `I-A6` at the client
> level — specifically, it must NEVER send a `context` prose string.

---

### Task 4.1 — Zustand Terminal Store (No Prose Context — I-A6)

**Files to create (max 2):**
1. `src/store/terminal.ts`
2. `src/store/terminal.test.ts`

**Store requirements:**
- State shape:
  ```typescript
  interface TerminalState {
    messages:    CopilotMessage[];     // user/assistant turns only
    subject:     CopilotSubject | null; // { kind, id } — server-derived
    agent_type?: AgentType;
    status:      'idle' | 'loading' | 'streaming' | 'error';
    error:       string | null;
    // context: string  ← DELIBERATELY ABSENT (I-A6)
    //                     This field must never be added to this store.
    //                     If you see it, it is a defect.
  }
  ```
- `sendMessage(content: string)` action:
  - Appends user message to `messages`
  - Builds request body as `{ messages, subject, agent_type }` — NO `context` field — `-- I-A6`
  - POSTs to `/api/copilot`
  - Appends assistant response to `messages`
- Comment block at top of file:
  ```typescript
  // ── I-A6 INVARIANT ──────────────────────────────────────────────────────────
  // The 'context' prose field is PROHIBITED in this store and in any request
  // sent to /api/copilot. The route will reject it with 400 PROSE_CONTEXT_FORBIDDEN.
  // Do not add a 'context' field here under any circumstances.
  // ────────────────────────────────────────────────────────────────────────────
  ```

**Test cases (minimum 3):**
1. `sendMessage` sends request WITHOUT a `context` field — inspect the serialized body
2. `sendMessage` appends both user and assistant turns to `messages`
3. `sendMessage` with walled subject → `error` state set, message NOT appended

**Validation:**
```bash
npm test src/store/terminal.test.ts
npx ts-node scripts/lint/index.ts param-lint
# param-lint must detect that no `context` field appears in the request body construction
```

---

### Task 4.2 — 3-Pane Shell Layout

**Files to create (max 3):**
1. `src/app/layout.tsx` — root layout with providers
2. `src/components/shell/ThreePaneShell.tsx` — left nav · center workspace · right terminal
3. `src/components/shell/TopBar.tsx` — role badge, user menu, notification bell

**Shell requirements:**
- Left pane (240px): `WorkspaceNav` (links driven by `workspace_manifest()` RPC result)
- Center pane (flex): `WorkspaceMain` (route outlet — page content renders here)
- Right pane (380px, collapsible): `TerminalPanel` (the Copilot chat interface)
- Right pane is **always** a client component with the Zustand terminal store
- No `context` prop drilling — the terminal communicates only via the store — `-- I-A6`
- Server component: `ThreePaneShell` fetches `workspace_manifest()` on the server using the service client and passes only `workspaces: WorkspaceItem[]` as a prop (no raw DB types)

**Validation:**
```bash
npm run build   # must compile without error
npm run typecheck
```

---

### Task 4.3 — Workspace Navigation & Group 1 Owner Dashboard

**Files to create (max 3):**
1. `src/components/workspace/WorkspaceNav.tsx`
2. `src/app/(workspace)/owner/[propertyId]/page.tsx`
3. `src/app/(workspace)/owner/[propertyId]/vitals/page.tsx`

**`WorkspaceNav.tsx`:**
- Renders the workspace list from `workspace_manifest()` prop
- Each workspace entry has sub-tabs driven by `subtabs` field (from the manifest)
- `owner_distressed` workspace shows `defensive_map`, `loss_mitigation`, `legal_shield`, `exposure_privacy` — never shows investment sub-tabs
- `owner_investor` workspace shows `assembly_map`, `jv_syndication` — never shows distressed sub-tabs
- The `upsell_allowed` flag from the manifest controls whether a locked upgrade CTA is shown

**Owner vitals page:**
- Server component — fetches from `avm_snapshots` and `municipal_records` for the property
- Displays AVM band, open violations, liens, permits (read-only)
- NO AI-generated valuations — only the stored `avm_band` text — `-- I-31 analogue`

**Validation:**
```bash
npm run build
npm run typecheck
```

---

### Task 4.4 — Group 4 Legal Shield: Matter List & Matter Detail

**Files to create (max 3):**
1. `src/app/(workspace)/legal/matters/page.tsx` — matter list (server component)
2. `src/app/(workspace)/legal/matters/[matterId]/page.tsx` — matter detail shell
3. `src/components/legal/MatterStatusBadge.tsx`

**Matter list page:**
- Server component — fetches `matters` filtered by `is_matter_party()` via Supabase server client
- A matter that cannot be read shows NOTHING — existence protection at the UI layer — `-- I-L11`
- No matter name, type, or party count is shown in list view for `status = 'archived'` matters

**Matter detail page:**
- Server component shell — fetches matter metadata
- Renders sub-tabs: `Overview`, `Trust`, `Documents`, `Gig Rail` (tabs rendered only if user has access)
- If `wall_blocks_user()` is true for this matter: redirect to a generic 404 page (not a wall-specific message) — `-- I-L11`
- Sets terminal `subject = { kind: 'matter', id: matterId }` via a client component boundary

**Validation:**
```bash
npm run build
npm run typecheck
npx ts-node scripts/lint/index.ts wall-lint
```

---

### Task 4.5 — Group 4: Trust Ledger UI

**Files to create (max 3):**
1. `src/app/(workspace)/legal/matters/[matterId]/trust/page.tsx`
2. `src/components/legal/trust/TrustLedgerTable.tsx`
3. `src/components/legal/trust/DisburseModal.tsx`

**Trust page:**
- Server component — fetches trust ledger entries for the matter's trust account
- Only `lead_counsel` and `partner`/`associate` roles see the `Disburse` button — class enforced server-side via `matter_parties.matter_role` check

**`TrustLedgerTable.tsx`:**
- Client component
- Displays: `direction`, `amount_cents` (formatted as USD), `debit_kind`, `status`, `maker_id` (display name), `checker_id` (display name or "Pending")
- Row with `status = 'pending'` shows a "Awaiting Checker" chip
- No edit or delete UI — ledger is append-only — `-- I-L4`

**`DisburseModal.tsx`:**
- Client component — form with Zod + React Hook Form validation
- Fields: `debit_kind` (select from closed enum only), `amount_cents`, `memo`
- Submit calls `POST /api/legal/trust/disburse`
- On `202`: shows "Disbursement pending — send the dual-control link to a checker"
- NO `context` field anywhere in the form — `-- I-A6`

**Validation:**
```bash
npm run build
npm run typecheck
```

---

### Task 4.6 — Group 4: Gig Rail UI

**Files to create (max 3):**
1. `src/app/(workspace)/legal/matters/[matterId]/gig/page.tsx`
2. `src/components/legal/gig/GigJobCard.tsx`
3. `src/components/legal/gig/AssignModal.tsx`

**Gig page:**
- Server component — fetches `gig_jobs` for the matter (filtered via `is_matter_party()` + wall check)
- `lead_counsel` sees the "Post Job" and "Assign" buttons; providers see only their own assignments

**`GigJobCard.tsx`:**
- Client component — shows job status badge, type, jurisdiction, scheduled time
- Status `submission_pending` shows "Awaiting Acceptance" chip with a link to the accept flow

**`AssignModal.tsx`:**
- Client component — allows counsel to assign a provider
- Validates that the selected licence is active and jurisdiction-matched (client-side pre-check + server enforces) — `-- I-L19`
- Displays returned `capture_nonce` in a one-time reveal panel: "Copy this nonce — it will not be shown again" — `-- I-L17`
- After copy-confirmation, nonce is cleared from React state (never persisted to localStorage)

**Validation:**
```bash
npm run build
npm run typecheck
```

---

### Task 4.7 — Group 4: Practice-Area Workbenches (PI & Bankruptcy)

**Files to create (max 3):**
1. `src/app/(workspace)/legal/matters/[matterId]/workbench/pi/page.tsx`
2. `src/app/(workspace)/legal/matters/[matterId]/workbench/bankruptcy/page.tsx`
3. `src/components/legal/workbench/ClassGrantGate.tsx`

**`ClassGrantGate.tsx`:**
- Client component wrapper — checks `has_data_class_grant()` for the current user/matter/class before rendering children
- If grant absent: renders a "Request Access" UI that calls `POST /api/legal/matters/[matterId]/class-grant` (a route to be built in Task 3.X extension)
- If grant present: renders `{children}`
- Comment: `-- I-L8: gate enforced at UI layer; DB RLS enforces independently`

**PI workbench page:**
- Wrapped in `<ClassGrantGate class="class_phi">` — `-- I-L8`
- Server component — fetches `pi_medical_records` and `pi_liens` for the matter
- Each medical record shows provider name, date, and a "Download" button (fetches from object storage via a signed URL)
- Lien table: `lienholder`, `lien_amount_cents`, `lien_type`, `status` — with "Negotiate" action for `asserted` liens

**Bankruptcy workbench page:**
- Wrapped in `<ClassGrantGate class="class_insolvency">` — `-- I-L8`
- Server component — fetches `bk_schedules`
- Each schedule shows `schedule_type`, `filed_version`, a "View" button

**Validation:**
```bash
npm run build
npx ts-node scripts/lint/index.ts class-lint wall-lint
```

---

### Task 4.8 — Group 4: Corporate & Family Workbenches

**Files to create (max 3):**
1. `src/app/(workspace)/legal/matters/[matterId]/workbench/corporate/page.tsx`
2. `src/app/(workspace)/legal/matters/[matterId]/workbench/family/page.tsx`
3. `src/components/legal/workbench/MnpiRestrictedBanner.tsx`

**Corporate workbench page:**
- Wrapped in `<ClassGrantGate class="class_mnpi">` — `-- I-L8`
- Server component — fetches `corp_transaction_records`
- Checks `on_restricted_list()` for the current user server-side — if true, renders a blank page with a "Restricted" banner (no content, no error detail) — `-- I-L10`
- `MnpiRestrictedBanner.tsx`: generic banner — "Access to this matter is restricted." No reason given.

**Family workbench page:**
- Wrapped in `<ClassGrantGate class="class_family">` — `-- I-L8`
- Server component — fetches `family_asset_inventories`
- If any row has `minors_involved = true`: renders a "Sealed — contact matter counsel" overlay instead of the record content — `-- state sealing rules`

**Validation:**
```bash
npm run build
npx ts-node scripts/lint/index.ts class-lint
```

---

### Task 4.9 — Group 5 Contractor & Group 6 Architect Dashboards

**Files to create (max 3):**
1. `src/app/(workspace)/contractor/work-packages/page.tsx`
2. `src/app/(workspace)/architect/design-packages/page.tsx`
3. `src/components/shared/MilestoneTimeline.tsx`

**Contractor work packages page:**
- Server component — fetches `work_packages` via `is_work_package_party()`
- Status filter tabs: `draft`, `awarded`, `in_progress`, `inspection_pending`, `completed`
- Each card shows BoQ item count, milestone status, draw request count
- `vision_model_result` on milestones shown as ADVISORY chip only — never as a gate — `-- I-A3`

**Architect design packages page:**
- Server component — fetches `design_packages` via `is_design_package_party()`
- Phase filter: `feasibility` through `record_set`
- Each card shows discipline, phase, seal status, open RFI count
- "Seal Package" button: only for `lead_designer` with an active `professional_licences` row — not a platform seal, just a record — `-- no seal enforcement, just record`

**`MilestoneTimeline.tsx`:**
- Client component — shared between contractor and architect views
- Renders milestones as a linear timeline
- AI vision result shown as `ℹ Advisory` label — NOT as a checkmark or pass/fail indicator — `-- I-A3`

**Validation:**
```bash
npm run build
npm run typecheck
```

---

### Task 4.10 — Group 7 Property Manager & Tenant Dashboards

**Files to create (max 3):**
1. `src/app/(workspace)/manager/tenancies/page.tsx`
2. `src/app/(workspace)/tenant/my-unit/page.tsx`
3. `src/components/tenancy/MaintenanceTicketCard.tsx`

**Manager tenancies page:**
- Server component — fetches `tenancies` for all engagements managed by this user
- Each tenancy card: unit, tenant names, lease dates, rent status, open ticket count
- "End Tenancy" action sets `status = 'ended'` — comment: `-- I-22: this is a legal record change only; platform never gates physical access`
- No eviction flow, no utility shutoff flow — `-- I-22 Access Floor`

**Tenant my-unit page:**
- Server component — fetches the single tenancy where `auth.uid() = any(tenant_user_ids)`
- Shows rent ledger (last 6 entries), deposit trust status, open maintenance tickets
- "Submit Ticket" button — opens a modal with category, description, photo upload

**`MaintenanceTicketCard.tsx`:**
- Client component — shows priority badge, category, status
- Priority `emergency` shows a red badge — this is for DISPLAY ONLY — `-- I-22: no platform action is ever triggered by priority`

**Validation:**
```bash
npm run build
npm run typecheck
```

---

### Task 4.11 — Group 9 Brokerage Dashboard & Listings

**Files to create (max 3):**
1. `src/app/(workspace)/broker/listings/page.tsx`
2. `src/app/(workspace)/broker/listings/[listingId]/page.tsx`
3. `src/components/broker/CommissionRecordPanel.tsx`

**Listings page:**
- Server component — fetches `listings` via `broker_seats` membership
- Status filter tabs: `coming_soon`, `active`, `under_contract`, `pending`, `sold`
- `list_price_cents` displayed only — no platform-suggested or benchmarked price — `-- I-31`

**Listing detail page:**
- Shows representation type, agency type, disclosure acknowledgement log
- "Add Commission Record" button — opens form with `agreed_rate_bps` (manual entry only)
- Form field label: "Agreed commission rate (basis points) — manually entered" — `-- I-31`

**`CommissionRecordPanel.tsx`:**
- Client component
- Displays the single agreed commission for the transaction
- No benchmark, no comparison, no platform suggestion anywhere in this component — `-- I-31`
- Comment block: `-- I-31: Antitrust compliance — no cross-brokerage rate data here`

**Validation:**
```bash
npm run build
npx ts-node scripts/lint/index.ts wall-lint
```

---

### ✅ Phase 4 Exit Criteria

- [ ] `npm run build` exits 0 — no build errors
- [ ] `npm run typecheck` exits 0
- [ ] Terminal store test: `sendMessage` body never contains a `context` field
- [ ] Existence protection UI test: walled matter shows standard 404 page, not a wall-specific message
- [ ] `ClassGrantGate` test: practice-area workbench renders nothing without a class grant
- [ ] All 17 CI lint rules pass

---

## Phase 5 — Agentic Pipelines & Gates

> **Goal:** Build the background pipeline workers — OCR/Markdown extraction,
> MicroVM artifact reconstruction, and the embedding generation pipeline.
> These are standalone Node.js workers (not Next.js routes) that process the
> `hrag_ingestion_queue` and populate `authority_corpus` / `tenant_corpus`.

---

### Task 5.1 — Ingestion Worker: OCR & Markdown Extraction

**Files to create (max 3):**
1. `src/workers/ingest/ocr-extract.ts`
2. `src/workers/ingest/markdown-convert.ts`
3. `src/workers/ingest/ocr-extract.test.ts`

**`ocr-extract.ts` requirements:**
- `extractText(storagePath: string, provider: MicrovmProvider): Promise<string>`
- Downloads the raw file from the `vault-raw` bucket (service-role client)
- For PDFs: uses `pdfjs-dist` to extract text layer; falls back to OCR if text layer is absent
- For images: calls the OCR endpoint (env: `OCR_ENDPOINT`) — result is raw text
- Validates that the extraction result does NOT contain patterns matching PII regex (SSN, EIN, routing) before returning — `-- I-H3, vault-pii-lint`
- Returns extracted text string or throws `PiiDetectedError`

**`markdown-convert.ts` requirements:**
- `convertToMarkdown(rawText: string): string`
- Normalizes whitespace, headings, and paragraph breaks
- Strips any metadata headers that could contain PII (author name, creation date fields)
- Returns clean Markdown string suitable for chunking

**Test cases (minimum 3):**
1. PDF with text layer → extracted text returned
2. Text containing SSN pattern → `PiiDetectedError` thrown
3. Raw text with metadata header → header stripped from Markdown output

**Validation:**
```bash
npm test src/workers/ingest/ocr-extract.test.ts
npx ts-node scripts/lint/index.ts vault-pii-lint
```

---

### Task 5.2 — Ingestion Worker: Chunking & Embedding

**Files to create (max 2):**
1. `src/workers/ingest/chunker.ts`
2. `src/workers/ingest/embedder.ts`

**`chunker.ts` requirements:**
- `chunkDocument(markdown: string, path: string, jurisdiction: string): Chunk[]`
- Splits on semantic boundaries (headers, paragraphs) — max 512 tokens per chunk (using `tiktoken`)
- Each chunk carries: `text`, `path` (ltree), `jurisdiction`, `chunk_index`
- Overlap: 64 tokens between adjacent chunks
- Returns `Chunk[]`

**`embedder.ts` requirements:**
- `embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]>`
- Calls OpenAI `text-embedding-3-small` (1536 dimensions) in batches of 100
- Each result: `{ ...chunk, embedding: number[] }`
- Comment: `-- I-A10: embedding carries same RLS as content — never returned to client`
- Comment: `-- I-19: no embeddings-only export path — embeddings are write-only to corpus tables`

**Validation:**
```bash
npm run typecheck
npx ts-node scripts/lint/index.ts embedding-lint currency-lint
```

---

### Task 5.3 — Ingestion Worker: Corpus Writer

**Files to create (max 2):**
1. `src/workers/ingest/corpus-writer.ts`
2. `src/workers/ingest/corpus-writer.test.ts`

**`corpus-writer.ts` requirements:**
- `writeToAuthorityCorpus(chunks: EmbeddedChunk[], meta: IngestMeta): Promise<void>`
  - Validates `meta.path` is registered in `vault_nodes` — `-- I-H1`
  - Validates `meta.jurisdiction` is non-null — `-- I-H22, claim-lint`
  - Batch-inserts into `authority_corpus` using service-role client
  - After insert: UPDATE `coverage_assertions SET satisfied = true` for the matching `domain + jurisdiction + instrument_set`
- `writeToTenantCorpus(chunks: EmbeddedChunk[], meta: IngestMeta, orgId: string): Promise<void>`
  - Validates `meta.owner_org_id = orgId` — `-- I-A5`
  - Validates `meta.path` registered in `vault_nodes` — `-- I-H1`
  - Batch-inserts into `tenant_corpus`

**Test cases (minimum 3):**
1. Valid authority corpus write → `coverage_assertions.satisfied` updated to `true`
2. Null jurisdiction → write rejected with `claim-lint` error
3. Tenant corpus write with mismatched org → rejected

**Validation:**
```bash
npm test src/workers/ingest/corpus-writer.test.ts
npx ts-node scripts/lint/index.ts claim-lint vault-pii-lint
```

---

### Task 5.4 — Ingestion Pipeline Orchestrator

**Files to create (max 2):**
1. `src/workers/ingest/pipeline.ts`
2. `src/workers/ingest/pipeline.test.ts`

**`pipeline.ts` requirements:**
- `runIngestionPipeline(queueEntryId: string): Promise<void>`
- Polls `hrag_ingestion_queue` for `status = 'queued'` entries (or receives via a job queue)
- For each entry:
  1. UPDATE `status = 'processing'`
  2. `extractText()` → if `PiiDetectedError`: UPDATE `status = 'rejected'`, emit `ingest_rejected` observation
  3. `convertToMarkdown()`
  4. `chunkDocument()`
  5. `embedChunks()`
  6. `writeToAuthorityCorpus()` or `writeToTenantCorpus()` based on `org_id` nullity
  7. UPDATE `status = 'completed'`, emit `ingest_completed` observation
- All steps wrapped in try/catch — on any error: UPDATE `status = 'failed'`, emit `ingest_rejected`

**Test cases (minimum 3):**
1. Happy path: `queued` → `completed`, corpus row created
2. PII detected: `queued` → `rejected`, no corpus row created
3. MicroVM proof invalid (re-verified in pipeline): `queued` → `rejected`

**Validation:**
```bash
npm test src/workers/ingest/pipeline.test.ts
npx ts-node scripts/lint/index.ts vault-pii-lint log-lint
```

---

### Task 5.5 — MicroVM Artifact Reconstruction Worker

**Files to create (max 2):**
1. `src/workers/microvm/reconstructor.ts`
2. `src/workers/microvm/reconstructor.test.ts`

**`reconstructor.ts` requirements:**
- `reconstructArtifact(queueEntryId: string): Promise<ReconstructedArtifact>`
- Fetches the raw file and MicroVM proof from the queue entry
- Re-verifies the MicroVM proof (belt-and-suspenders — proof was checked at ingest but re-verified here before content is trusted) — `-- I-H6`
- Extracts the signed execution manifest from the proof:
  - `steps_executed: string[]` — must include `'pii_scan'`, `'integrity_check'`
  - `file_sha256: string` — must match the raw file's actual SHA-256
  - `isolation_attested: boolean` — must be `true`
- Returns `{ text: string, verified: true }` or throws `ReconstructionError`

**Test cases (minimum 3):**
1. Valid proof + matching hash → `{ verified: true }`
2. Proof with wrong file hash → `ReconstructionError`
3. Proof missing `pii_scan` step → `ReconstructionError`

**Validation:**
```bash
npm test src/workers/microvm/reconstructor.test.ts
npx ts-node scripts/lint/index.ts vault-pii-lint
```

---

### Task 5.6 — Background Worker Runner

**Files to create (max 2):**
1. `src/workers/runner.ts` — worker process entry point
2. `src/workers/runner.test.ts`

**`runner.ts` requirements:**
- Connects to Supabase using the service-role client
- Subscribes to `hrag_ingestion_queue` via Supabase Realtime (or polls every 10 seconds as fallback)
- On new `queued` entry: dispatches to `runIngestionPipeline()`
- Concurrency: max 3 simultaneous pipeline runs (semaphore)
- Graceful shutdown: drains in-flight pipelines before exiting on `SIGTERM`
- All uncaught errors logged to stderr + emit `ingest_rejected` observation
- Comment: `-- I-H8: content never written directly to corpus — always via screening queue`

**Validation:**
```bash
npm run typecheck
# Integration test: insert a row into hrag_ingestion_queue, verify status transitions
npm test src/workers/runner.test.ts
```

---

### ✅ Phase 5 Exit Criteria

- [ ] `npm test src/workers/` — all worker tests pass
- [ ] Pipeline happy path: a test PDF inserted into `hrag_ingestion_queue` reaches `status = 'completed'` and a corpus row appears
- [ ] PII rejection: a document with an injected SSN reaches `status = 'rejected'`
- [ ] `coverage_assertions.satisfied` is set to `true` for a seeded assertion after the corresponding corpus is written
- [ ] All 17 CI lint rules pass

---

## Phase 6 — Testing & Final E2E

> **Goal:** Close all blocking items, verify all acceptance criteria from
> `Plan_v3_Part3.md §IV.3`, and confirm the platform is production-ready.

---

### Task 6.1 — RLS Test Matrix (27 Roles × 6 Subject Types)

**Files to create (max 3):**
1. `tests/rls/rls-matrix.test.ts`
2. `tests/rls/rls-fixtures.ts` — test user seeds for all 27 roles
3. `tests/rls/rls-assertions.ts` — shared assertion helpers

**Test matrix:**
- For each of the 27 roles, create a test user with `supabase.auth.admin.createUser()`
- For each subject type (`property`, `deal`, `facility`, `matter`, `work_package`, `design_package`):
  - Assert: a user WITH the correct binding CAN read their own rows
  - Assert: a user WITHOUT a binding CANNOT read another user's rows (returns empty, not 403)
  - Assert: a walled matter returns the same empty result as a non-existent matter — `-- I-L11`
- Assert: a user with `actor_class = 'billing'` cannot INSERT into any authorization table — `-- I-2`

**Validation:**
```bash
npm test tests/rls/rls-matrix.test.ts
# Must produce 162 passing assertions (27 roles × 6 subject types)
```

---

### Task 6.2 — Trust Dual-Control Integration Tests

**Files to create (max 2):**
1. `tests/legal/trust-dual-control.test.ts`
2. `tests/legal/trust-fixtures.ts`

**Test cases (minimum 10):**
1. Valid disbursement → maker submits, checker approves → `status = 'posted'`
2. Same natural person as maker and checker (same `identity_subject_id`) → `422`
3. Two user accounts sharing one `identity_subject_id` as maker/checker → `422` — `-- R-4 residual risk closed`
4. Checker is a paralegal → `403`
5. `debit_block_attested = false` → `403 DEBIT_BLOCK_NOT_ATTESTED`
6. `debit_block_attested_at` > 90 days ago → `403`
7. Amount exceeds `per_client_trust_balance` → `422 SOLVENCY_CHECK_FAILED`
8. Invalid `debit_kind` value → `400 INVALID_DEBIT_KIND`
9. Contra entry written on rejection → `trust_ledger` row count increases by 1 (not update)
10. Trust ledger UPDATE attempt → trigger fires, exception raised

**Validation:**
```bash
npm test tests/legal/trust-dual-control.test.ts
```

---

### Task 6.3 — Existence Protection Byte-Length Parity Test

**Files to create (max 1):**
1. `tests/legal/existence-protection.test.ts`

**Test cases:**
- Create a matter, add a test user as a party, erect a wall screening that user
- Send 100 GET/POST requests for the walled matter from the screened user's session
- Send 100 GET/POST requests for a non-existent matter ID from the same session
- Assert: the byte length of each response body is identical across walled vs. non-existent responses — `-- I-L11`
- Assert: no response from the walled matter returns `403` (must be `404`)
- Assert: no response body contains the word "wall", "screened", "blocked", or "access denied"

**Validation:**
```bash
npm test tests/legal/existence-protection.test.ts
# p100 byte-length equality must hold
```

---

### Task 6.4 — Gig Rail Integration Tests

**Files to create (max 1):**
1. `tests/legal/gig-rail.test.ts`

**Test cases (minimum 8):**
1. Valid assign → `201`, nonce returned once
2. Second call to `/assign` for the same job → old assignment expired, new nonce issued
3. Submit with valid nonce → `202 submission_pending`
4. Submit with same nonce again → `403 NONCE_CONSUMED`
5. Submit with expired nonce (advance clock) → `403 NONCE_EXPIRED`
6. Accept with non-lead-counsel caller → `403`
7. Accept with unverified affidavit → `422`
8. Gig escrow funded from trust ledger source → `422 TRUST_FUNDING_PROHIBITED` — `-- I-L21`

**Validation:**
```bash
npm test tests/legal/gig-rail.test.ts
```

---

### Task 6.5 — Agent Factory Integration Tests

**Files to create (max 2):**
1. `tests/agent/copilot-route.test.ts`
2. `tests/agent/output-gate.test.ts`

**`copilot-route.test.ts` (minimum 7 test cases — mirrors Plan Part 3 §IV.3):**
1. `{ context: "prose" }` → `400 PROSE_CONTEXT_FORBIDDEN` — **B-1 blocker confirmed closed**
2. Valid request → `200`, `citations` non-empty, `fallback` absent
3. Unauthenticated → `401`
4. Non-party subject → `404` (existence-protected, byte-length 512)
5. Coverage unsatisfied → `fallback: 'coverage_incomplete'`
6. Out-of-scope plan path → `fallback: 'scope_denied'`, scope_leak observation emitted
7. All citations invalid → `fallback: 'no_authority_on_point'`

**`output-gate.test.ts` (minimum 6 test cases):**
1. Injected SSN in mock model response → `[REDACTED]` in output, `exfil_strip_applied: true`
2. Tool-shape JSON in mock response → stripped, `tool_shape_strip_applied: true`
3. Entire response is tool-shape → `fallback: 'no_authority_on_point'`
4. Claim not entailed by citation → sentence stripped
5. > 50% sentences stripped by entailment → `fallback: 'no_authority_on_point'`
6. Out-of-jurisdiction citation → citation stripped, remaining claims re-evaluated

**Validation:**
```bash
npm test tests/agent/copilot-route.test.ts tests/agent/output-gate.test.ts
```

---

### Task 6.6 — HRAG Coverage Assertions Integration Test

**Files to create (max 1):**
1. `tests/hrag/coverage-assertions.test.ts`

**Test cases (minimum 5):**
1. Legal question in seeded US.NY CPLR domain → ≥ 1 citation returned with valid `chunk_id`
2. Legal question in unseeded jurisdiction (e.g., US.HI) → `fallback: 'coverage_incomplete'`
3. Query with `p_as_of` in the past beyond `effective_to` → 0 chunks returned
4. `match_hrag_chunks()` called with empty `p_vault_paths` → exception raised (filter-lint guard in worker code fires)
5. Authority corpus chunk with null jurisdiction → rejected by `claim-lint` guard during ingestion

**Validation:**
```bash
npm test tests/hrag/coverage-assertions.test.ts
npx ts-node scripts/lint/index.ts currency-lint claim-lint filter-lint
```

---

### Task 6.7 — Full CI Lint Suite Final Run

**Files to modify (max 1):**
1. `scripts/lint/index.ts` — ensure all 17 rules are registered and tested against the full `src/` codebase

**Final lint audit checklist:**
- [ ] `wall-lint` — all matter-scoped tables have `wall_blocks_user()` in SELECT policy
- [ ] `definer-lint` — all DEFINER functions have `SET search_path = ''`; retrieval RPCs are INVOKER
- [ ] `privilege-lint` — all 7 authorization tables have billing guard triggers
- [ ] `class-lint` — all `data_class` tables have `has_data_class_grant()` in RLS
- [ ] `param-lint` — no system prompt interpolates retrieved content
- [ ] `prompt-lint` — all system prompts are compile-time constants
- [ ] `tools-lint` — all state-mutating tools annotated `requires_human_gate: true`
- [ ] `plan-lint` — `supervisorRoute()` contains pre-dispatch scope_set path validation
- [ ] `filter-lint` — all retrieval RPC calls pass non-empty `p_vault_paths`
- [ ] `fallback-lint` — all 3 fallback keys present, non-empty, unique
- [ ] `citation-lint` — no response with empty citations lacks a fallback
- [ ] `vault-pii-lint` — no PII columns in ingestion queue; proof check precedes DB write
- [ ] `claim-lint` — no authority corpus chunk ingested without jurisdiction
- [ ] `currency-lint` — all retrieval calls pass `p_as_of`; RPC filters by `effective_to`
- [ ] `embedding-lint` — no raw embeddings returned to client; embedding grant revoked
- [ ] `log-lint` — every return path in `/api/copilot` calls `emitObservation()`
- [ ] `servicerole-lint` — corpus RPCs use service-role key, not anon key

**Validation:**
```bash
npx ts-node scripts/lint/index.ts
# Output must be: "17/17 rules PASS — zero violations"
npm run test       # full test suite
npm run typecheck  # zero errors
npm run build      # zero build errors
```

---

### Task 6.8 — Telemetry Smoke Test

**Files to create (max 1):**
1. `tests/telemetry/observation-chain.test.ts`

**Test requirements:**
- Send one valid `POST /api/copilot` request with a test user against a staging Supabase instance
- Query `agent_observations` for the `request_id` returned in the response header
- Assert the following observation kinds are present (in order): `request_start`, `scope_set_computed`, `plan_generated`, at least one `worker_dispatched`, at least one `worker_completed`, `gate_citation`, `gate_entailment`, `gate_jurisdiction`, `gate_exfil`, `gate_tool_shape`, `request_complete`
- Assert `request_complete.latency_ms` is a positive integer
- Assert no observation has `null` for `request_id`

**Validation:**
```bash
npm test tests/telemetry/observation-chain.test.ts
# Minimum 8 observation rows per request confirmed
```

---

### Task 6.9 — Alerting Threshold Smoke Test

**Files to create (max 1):**
1. `tests/telemetry/alerting-thresholds.test.ts`

**Test requirements:**
- Inject synthetic `exfil_strip` observation into `agent_observations` — verify alert is triggered (mock the Datadog/PagerDuty endpoint)
- Inject synthetic `scope_leak` observation — verify P0 alert fires
- Inject 16 `fallback_triggered` observations in a 5-minute window (> 15% rate threshold) — verify P2 alert fires
- All three alerts acknowledged → test passes

**Validation:**
```bash
npm test tests/telemetry/alerting-thresholds.test.ts
```

---

### Task 6.10 — `supabase db diff` Final Validation & Schema Comment Check

**Files to modify:** None — this is a read-only validation task.

**Validation steps:**
```bash
# 1. Fresh reset to confirm all migrations apply cleanly from scratch
supabase db reset

# 2. Zero diff against staging
supabase db diff --use-migra
# Must output: "No changes detected"

# 3. Confirm final schema comment matches v3.0 range
psql $DATABASE_URL -c "SELECT obj_description('public'::regnamespace, 'pg_namespace');"
# Must contain: "0001–0086 validated"

# 4. Confirm retrieval RPCs are SECURITY INVOKER
psql $DATABASE_URL -c "SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('match_hrag_chunks','match_tenant_chunks','match_af_chunks');"
# All three must show prosecdef = 'f'

# 5. Confirm embedding column grant revoked
psql $DATABASE_URL -c "SELECT grantee, privilege_type FROM information_schema.column_privileges WHERE table_name IN ('authority_corpus','tenant_corpus') AND column_name = 'embedding';"
# Must return ZERO rows for 'authenticated' grantee

# 6. Final 17-rule lint
npx ts-node scripts/lint/index.ts
# "17/17 rules PASS"
```

---

### ✅ Phase 6 Exit Criteria (= v3.0 Production Readiness)

- [ ] `supabase db reset` completes without error — all migrations 0001–0086
- [ ] `supabase db diff --use-migra` returns zero diff on `staging`
- [ ] All 17 CI lint rules report `PASS`
- [ ] `npm run test` — zero failures across all test suites
- [ ] `npm run typecheck` — zero TypeScript errors
- [ ] `npm run build` — zero build errors
- [ ] RLS matrix: 162/162 role/subject assertions pass
- [ ] B-1 blocker: `PROSE_CONTEXT_FORBIDDEN` test case passes
- [ ] Trust dual-control: same-person attempt returns `422` (10/10 trust tests pass)
- [ ] Gig nonce: consumed nonce returns `403 NONCE_CONSUMED` (8/8 gig tests pass)
- [ ] Existence protection: byte-length parity holds across 100 walled vs. 100 non-existent requests
- [ ] Exfil strip: injected SSN absent from all response bodies
- [ ] Scope leak: out-of-scope plan path never reaches a worker
- [ ] Telemetry: ≥ 8 observation rows per copilot request confirmed
- [ ] Coverage assertions: US.NY CPLR domain returns ≥ 1 citation

---

## Overall Tasks Summary

| Phase | Part | Tasks | Description |
|---|---|---|---|
| Phase 0 

_[Continuing response due to length limit...]_

````markdown
| Phase 0 | Part 1 | 0.1 – 0.9   | Environment & CI Scaffold (9 tasks)             |
| Phase 1 | Part 1 | 1.1 – 1.19  | Database Foundation 0001–0059 (19 tasks)        |
| Phase 2 | Part 1 | 2.1 – 2.21  | Hardened Infrastructure DB 0060–0086 (21 tasks) |
| Phase 3 | Part 2 | 3.1 – 3.19  | Backend API Routes (19 tasks)                   |
| Phase 4 | Part 2 | 4.1 – 4.11  | Frontend UI & State (11 tasks)                  |
| Phase 5 | Part 2 | 5.1 – 5.6   | Agentic Pipelines & Gates (6 tasks)             |
| Phase 6 | Part 2 | 6.1 – 6.10  | Testing & Final E2E (10 tasks)                  |
| **Total** | **Both** | **95 tasks** | **Full v3.0 execution** |

---

## Blocking Items Closure Checklist

Cross-reference with `Plan_v3_Part3.md §IV.2`. Every blocker must be closed before
the corresponding phase exits. Mark each closed with the task that closes it.

| Blocker | Description | Closed By | Status |
|---|---|---|---|
| **B-1** | Live defect — `context` field accepted by old `/api/copilot` | Task 3.18 | ☐ |
| **B-2** | `has_data_class_grant()` stub returns `false` | Task 2.4 (Migration 0063) | ☐ |
| **B-3** | `on_restricted_list()` stub returns `false` | Task 2.4 (Migration 0063) | ☐ |
| **B-4** | Retrieval RPCs return empty (no corpus seeded) | Task 5.3 + Task 5.4 (corpus writer + pipeline) | ☐ |
| **B-5** | `resolve_scope_set()` stub | Task 2.19 (Migration 0084) | ☐ |

---

## Red-Team Regression Closure Checklist

Cross-reference with `Plan_v3_Part3.md §IV.6`. Every finding must map to a passing
test or lint rule before v3.0 is tagged.

| Finding | Closed By Task | Test / Rule | Status |
|---|---|---|---|
| AF-01 | Task 3.15 + Task 0.5 | `param-lint` + supervisor architecture | ☐ |
| AF-02 | Task 3.18 + Task 0.7 | `PROSE_CONTEXT_FORBIDDEN` route guard + `param-lint` | ☐ |
| AF-03 | Task 3.13 + Task 0.7 | Tool-Shape Strip + `tools-lint` | ☐ |
| AF-04 | Task 3.16 + Task 0.7 | `filter-lint` + `p_vault_paths` pre-filter guard | ☐ |
| AF-05 | Task 3.11 + Task 0.7 | `fallback-lint` FL-3 + unique template assertion | ☐ |
| AF-06 | Task 3.11 + Task 0.7 | Distinct `coverage_incomplete` vs `no_authority_on_point` templates | ☐ |
| AF-07 | Task 2.13 + Task 0.8 | `embedding-lint` + `REVOKE SELECT (embedding)` | ☐ |
| AF-08 | Task 3.19 | `CROSS_CORPUS_ASSIGNMENT` guard in `/api/agents/create` | ☐ |
| AF-09 | Task 3.10 + Task 3.19 | Prompt in secrets store; only hash in DB | ☐ |
| AF-10 | Task 3.16 + Task 0.8 | `currency-lint` + `p_as_of` in all retrieval calls | ☐ |
| AF-11 | Task 3.1 + Task 0.8 | `servicerole-lint` + service client in `server.ts` only | ☐ |
| AF-12 | Task 2.10 + Task 2.19 | `definer-lint` — `match_af_chunks`, `match_hrag_chunks` are INVOKER | ☐ |
| AF-13 | Task 2.12 + Task 0.5 | `definer-lint` — all DEFINER functions have `SET search_path = ''` | ☐ |
| AF-14 | Task 3.17 + Task 0.8 | `log-lint` — `emitObservation()` on every return path | ☐ |
| AF-15 | Task 3.15 + Task 0.7 | `plan-lint` — discard-entire-plan path validated | ☐ |
| AF-16 | Task 3.15 + Task 0.7 | `param-lint` — supervisor never receives corpus content | ☐ |
| H-01 | Task 2.15 | `guard_corpus_path_registration()` trigger on both corpus tables | ☐ |
| H-02 | Task 2.15 | `guard_no_authority_cycle()` trigger on `authority_edges` | ☐ |
| H-03 | Task 2.18 + Task 0.8 | `vault-pii-lint` + `tenant_corpus_requires_org` constraint | ☐ |
| H-04 | Task 3.1 + Task 0.8 | `servicerole-lint` + tenant corpus org RLS | ☐ |
| H-05 | Task 3.7 + Task 5.1 | `vault-pii-lint` + MicroVM proof gate + OCR PII check | ☐ |
| H-06 | Task 5.4 | Queue as mandatory intermediate — no direct corpus insert path | ☐ |
| H-07 | Task 2.17 | `guard_disclosure_consent()` trigger | ☐ |
| H-08 | Task 5.3 | `coverage_assertions.satisfied` set only by corpus writer | ☐ |
| H-09 | Task 2.16 + Task 0.8 | `claim-lint` + `jurisdiction NOT NULL` on `authority_corpus` | ☐ |
| H-10 | Task 3.16 + Task 0.8 | `currency-lint` + `p_as_of` required in all retrieval workers | ☐ |
| H-11 | Task 2.17 | `guard_shared_branch_write()` trigger + `ac_publisher_only` | ☐ |
| H-12 | Task 2.19 + Task 0.5 | `definer-lint` — `match_hrag_chunks` is INVOKER | ☐ |
| H-13 | Task 3.9 | `buildScopeSet()` server-only — no browser-callable export | ☐ |
| H-14 | Task 2.8 | `authority_corpus_no_org` CHECK constraint | ☐ |
| L-01 | Task 2.2 + Task 6.2 | `guard_identity_dual_control()` trigger + trust dual-control tests | ☐ |
| L-02 | Task 3.3 + Task 2.1 | `INVALID_DEBIT_KIND` route guard + `debit_kind` CHECK constraint | ☐ |
| L-03 | Task 2.2 + Task 6.2 | `trust_ledger_append_only` trigger + test case 10 | ☐ |
| L-04 | Task 3.3 + Task 2.2 | `DEBIT_BLOCK_NOT_ATTESTED` route guard + attestation trigger | ☐ |
| L-05 | Task 3.3 + Task 2.2 | `per_client_solvency_check()` + `SOLVENCY_CHECK_FAILED` | ☐ |
| L-06 | Task 3.5 + Task 6.4 | Nonce stored hashed + `NONCE_CONSUMED` test case | ☐ |
| L-07 | Task 2.5 | `REVOKE UPDATE` on verified columns | ☐ |
| L-08 | Task 3.6 + Task 6.4 | `TRUST_FUNDING_PROHIBITED` guard + gig test case 8 | ☐ |
| L-09 | Task 3.2 + Task 6.3 | `existenceProtectedNotFound()` + byte-length parity test | ☐ |
| L-10 | Task 2.4 + Task 4.8 | `guard_class_grant()` trigger + MNPI UI restricted banner | ☐ |
| L-11 | Task 2.2 | No self-execution path in `arbitration_awards` | ☐ |
| L-12 | Task 2.5 + Task 3.5 | `mp_perdiem_expiry_required` constraint + `EXPIRY_REQUIRED` guard | ☐ |

---

## Residual Risk Monitoring Assignments

Cross-reference with `Plan_v3_Part3.md §IV.1`. These are accepted risks requiring
ongoing operational attention — not code tasks, but standing operational duties.

| Risk | Monitoring Action | Cadence | Owner |
|---|---|---|---|
| R-1 — Entailment classifier accuracy | Review `gate_entailment` observation rate; tune threshold if false-negative rate > 5% | Weekly (Phase 5+) | Agent Factory team |
| R-2 — MicroVM provider availability | Monitor `ingest_rejected` rate attributed to proof failures; add secondary provider | Monthly | Vault pipeline team |
| R-3 — Coverage assertion staleness | Verify `reverify_due` cron job runs; check `satisfied = false` assertion count | Weekly (Phase 5+) | HRAG team |
| R-4 — Dual-control identity reuse | Run Task 6.2 test case 3 (two accounts, one identity subject) in staging monthly | Monthly | Legal OS team |
| R-5 — Gig nonce replay across environments | Verify nonces are prefixed with env identifier (`prod_`, `staging_`) before hashing | Per-deploy | Security team |
| R-6 — Wall retroactive epoch race | Monitor `wall_prior_access` for entries with `index_purged_at IS NULL` > 5 minutes after `recorded_at` | Daily (Phase 3+) | Legal OS team |
| R-7 — Existence protection timing variance | Re-run byte-length parity test monthly; consider adding ±50ms jitter if delta detected | Monthly | Platform team |
| R-8 — Cross-jurisdictional citation mapping | Track `gate_jurisdiction` strip rate; build jurisdiction mapping table when strip rate > 2% | Quarterly | HRAG team |

---

## File & Directory Map (Complete v3.0 Target State)

This is the full target file tree for the v3.0 implementation. Every file listed
here corresponds to one or more tasks above. Use this as a completeness checklist.

```
shtiya-builder/
├── architecture/
│   └── 04_engineering_plans/
│       └── master_engineering_plans/
│           ├── Plan_v3_Part1.md       ✅ Complete
│           ├── Plan_v3_Part2.md       ✅ Complete
│           ├── Plan_v3_Part3.md       ✅ Complete
│           ├── Tasks_v3_Part1.md      ✅ Complete
│           └── Tasks_v3_Part2.md      ✅ Complete (this document)
│
├── supabase/
│   ├── config.toml                    Task 0.2
│   ├── storage.sql                    Task 0.9
│   └── migrations/
│       ├── 0001_foundation_part_a.sql Task 1.1
│       ├── 0001_foundation_part_b.sql Task 1.2
│       ├── 0001_foundation_part_c.sql Task 1.3
│       ├── 0001_foundation_part_d.sql Task 1.4
│       ├── 0001_foundation_part_e.sql Task 1.5
│       ├── 0001_foundation_part_f.sql Task 1.6
│       ├── 0001_foundation_part_g.sql Task 1.6
│       ├── 0001_foundation_part_h.sql Task 1.7
│       ├── 0020_group1_2_extensions.sql        Task 1.8
│       ├── 0030_group3_extensions.sql          Task 1.9
│       ├── 0040_group4_extensions.sql          Task 1.10
│       ├── 0041_practice_workbenches.sql       Task 1.11
│       ├── 0050_group5_6_extensions.sql        Task 1.12
│       ├── 0051_group7_extensions.sql          Task 1.12
│       ├── 0052_group9_extensions.sql          Task 1.13
│       ├── 0054_gig_rail_baseline.sql          Task 1.14
│       ├── 0055_platform_infra.sql             Task 1.15
│       ├── 0056_coverage_assertions_stub.sql   Task 1.16
│       ├── 0057_corpus_stubs.sql               Task 1.17
│       ├── 0058_indexes_and_grants.sql         Task 1.18
│       ├── 0059_baseline_validation.sql        Task 1.19
│       ├── 0060_lw_identity_and_classes.sql    Task 2.1
│       ├── 0061_lw_trust_hardening.sql         Task 2.2
│       ├── 0062_lw_wall_hardening.sql          Task 2.3
│       ├── 0063_lw_data_class_grant_impl.sql   Task 2.4
│       ├── 0064_lw_gig_rail_hardening.sql      Task 2.5
│       ├── 0065_lw_rls_and_grants.sql          Task 2.6
│       ├── 0066_lw_validation.sql              Task 2.7
│       ├── 0070_af_corpora_and_agents.sql      Task 2.8
│       ├── 0071_af_ingestion_screening.sql     Task 2.9
│       ├── 0072_af_retrieval_rpcs.sql          Task 2.10
│       ├── 0073_af_observability.sql           Task 2.11
│       ├── 0074_af_rls_hardening.sql           Task 2.12
│       ├── 0075_af_grants.sql                  Task 2.13
│       ├── 0076_af_validation.sql              Task 2.14
│       ├── 0080_hrag_nodes_and_dag.sql         Task 2.15
│       ├── 0081_hrag_corpus_paths.sql          Task 2.16
│       ├── 0082_hrag_disclosures.sql           Task 2.17
│       ├── 0083_hrag_ingestion_queue.sql       Task 2.18
│       ├── 0084_hrag_retrieval_rpcs.sql        Task 2.19
│       ├── 0085_hrag_rls_hardening.sql         Task 2.20
│       └── 0086_hrag_validation.sql            Task 2.21
│
├── scripts/
│   ├── lint-all.sh                    Task 0.3
│   ├── seed-coverage-assertions.sql   Task 0.9
│   └── lint/
│       ├── index.ts                   Task 0.4
│       └── rules/
│           ├── group-auth.ts          Tasks 0.4–0.6
│           ├── group-agent.ts         Task 0.7
│           ├── group-vault.ts         Task 0.8
│           └── group-ops.ts           Task 0.8
│
├── src/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts              Task 3.1
│   │   │   └── types.ts               Task 3.1
│   │   ├── api/
│   │   │   ├── guards.ts              Task 3.2
│   │   │   └── existence-protection.ts Task 3.2
│   │   ├── storage.ts                 Task 0.9
│   │   ├── vault/
│   │   │   └── microvm.ts             Task 3.8
│   │   └── agent/
│   │       ├── scope-set.ts           Task 3.9
│   │       ├── type-resolver.ts       Task 3.10
│   │       ├── supervisor.ts          Task 3.15
│   │       ├── observability.ts       Task 3.17
│   │       ├── fallback-templates.ts  Task 3.11
│   │       ├── prompts/
│   │       │   ├── index.ts           Task 3.10
│   │       │   └── prompts.ts         Task 3.10
│   │       ├── output-gate/
│   │       │   ├── index.ts           Task 3.14
│   │       │   ├── citation-check.ts  Task 3.11
│   │       │   ├── entailment-check.ts Task 3.12
│   │       │   ├── jurisdiction-check.ts Task 3.12
│   │       │   ├── exfil-strip.ts     Task 3.13
│   │       │   └── tool-shape-strip.ts Task 3.13
│   │       └── workers/
│   │           ├── authority-retrieval.ts Task 3.16
│   │           └── tenant-retrieval.ts    Task 3.16
│   │
│   ├── store/
│   │   └── terminal.ts                Task 4.1
│   │
│   ├── app/
│   │   ├── layout.tsx                 Task 4.2
│   │   ├── api/
│   │   │   ├── copilot/
│   │   │   │   └── route.ts           Task 3.18  ← LIVE DEFECT FIX
│   │   │   ├── legal/
│   │   │   │   ├── trust/
│   │   │   │   │   ├── disburse/route.ts Task 3.3
│   │   │   │   │   └── check/route.ts    Task 3.4
│   │   │   │   └── gig/
│   │   │   │       ├── assign/route.ts   Task 3.5
│   │   │   │       ├── submit/route.ts   Task 3.6
│   │   │   │       └── accept/route.ts   Task 3.6
│   │   │   ├── vault/
│   │   │   │   └── tenant-corpus/route.ts Task 3.7
│   │   │   └── agents/
│   │   │       ├── create/route.ts    Task 3.19
│   │   │       └── [id]/
│   │   │           ├── pause/route.ts Task 3.19
│   │   │           └── retire/route.ts Task 3.19
│   │   └── (workspace)/
│   │       ├── owner/[propertyId]/
│   │       │   ├── page.tsx           Task 4.3
│   │       │   └── vitals/page.tsx    Task 4.3
│   │       ├── legal/matters/
│   │       │   ├── page.tsx           Task 4.4
│   │       │   └── [matterId]/
│   │       │       ├── page.tsx       Task 4.4
│   │       │       ├── trust/page.tsx Task 4.5
│   │       │       ├── gig/page.tsx   Task 4.6
│   │       │       └── workbench/
│   │       │           ├── pi/page.tsx         Task 4.7
│   │       │           ├── bankruptcy/page.tsx Task 4.7
│   │       │           ├── corporate/page.tsx  Task 4.8
│   │       │           └── family/page.tsx     Task 4.8
│   │       ├── contractor/work-packages/page.tsx Task 4.9
│   │       ├── architect/design-packages/page.tsx Task 4.9
│   │       ├── manager/tenancies/page.tsx       Task 4.10
│   │       ├── tenant/my-unit/page.tsx          Task 4.10
│   │       └── broker/
│   │           ├── listings/page.tsx            Task 4.11
│   │           └── listings/[listingId]/page.tsx Task 4.11
│   │
│   ├── components/
│   │   ├── shell/
│   │   │   ├── ThreePaneShell.tsx     Task 4.2
│   │   │   └── TopBar.tsx             Task 4.2
│   │   ├── workspace/
│   │   │   └── WorkspaceNav.tsx       Task 4.3
│   │   ├── legal/
│   │   │   ├── MatterStatusBadge.tsx  Task 4.4
│   │   │   ├── trust/
│   │   │   │   ├── TrustLedgerTable.tsx Task 4.5
│   │   │   │   └── DisburseModal.tsx    Task 4.5
│   │   │   ├── gig/
│   │   │   │   ├── GigJobCard.tsx     Task 4.6
│   │   │   │   └── AssignModal.tsx    Task 4.6
│   │   │   └── workbench/
│   │   │       ├── ClassGrantGate.tsx Task 4.7
│   │   │       └── MnpiRestrictedBanner.tsx Task 4.8
│   │   ├── shared/
│   │   │   └── MilestoneTimeline.tsx  Task 4.9
│   │   ├── tenancy/
│   │   │   └── MaintenanceTicketCard.tsx Task 4.10
│   │   └── broker/
│   │       └── CommissionRecordPanel.tsx Task 4.11
│   │
│   └── workers/
│       ├── ingest/
│       │   ├── ocr-extract.ts         Task 5.1
│       │   ├── markdown-convert.ts    Task 5.1
│       │   ├── chunker.ts             Task 5.2
│       │   ├── embedder.ts            Task 5.2
│       │   ├── corpus-writer.ts       Task 5.3
│       │   └── pipeline.ts            Task 5.4
│       ├── microvm/
│       │   └── reconstructor.ts       Task 5.5
│       └── runner.ts                  Task 5.6
│
└── tests/
    ├── rls/
    │   ├── rls-matrix.test.ts         Task 6.1
    │   ├── rls-fixtures.ts            Task 6.1
    │   └── rls-assertions.ts          Task 6.1
    ├── legal/
    │   ├── trust-dual-control.test.ts Task 6.2
    │   ├── trust-fixtures.ts          Task 6.2
    │   ├── existence-protection.test.ts Task 6.3
    │   └── gig-rail.test.ts           Task 6.4
    ├── agent/
    │   ├── copilot-route.test.ts      Task 6.5
    │   └── output-gate.test.ts        Task 6.5
    ├── hrag/
    │   └── coverage-assertions.test.ts Task 6.6
    └── telemetry/
        ├── observation-chain.test.ts  Task 6.8
        └── alerting-thresholds.test.ts Task 6.9
```

---

## Final Sign-off

This document — together with `Tasks_v3_Part1.md` — constitutes the complete
**Shtiya Builder Ecosystem v3.0 Master Execution Checklist**.

**Total scope:**
- **95 micro-sprint tasks** across 7 phases
- **86 database migrations** (0001–0086)
- **49 source files** in `src/`
- **37 test files** in `tests/` and co-located `*.test.ts`
- **17 CI lint rules** — all implemented, all passing at Phase 6 exit
- **36 red-team findings** — all closed and mapped to a task + test
- **5 blocking items** — all closed by named tasks
- **8 residual risks** — all assigned owners and monitoring cadences
- **Max 3 files per task, max 500 lines per file** — Micro-Sprint methodology
  honored throughout

**Source-of-truth hierarchy (reminder):**
```
Plan_v3_Part1.md  (invariants — highest authority)
       ↓
Plan_v3_Part2.md  (schemas)
       ↓
Plan_v3_Part3.md  (routes, CI, rollout, sign-off)
       ↓
Tasks_v3_Part1.md + Tasks_v3_Part2.md  (execution — this document)
       ↓
src/              (implementation — must not contradict any Plan doc)
```

**Document status:** FINAL
**Version:** 3.0
**Produced by:** IBM Bob, Lead Architect & Project Manager

---

*End of Tasks_v3_Part2.md — Master Execution Checklist v3.0 complete.*

