# Phase 8 — Full 22 Sub-Role RBAC Expansion

## Top-Level Overview

**Goal:** Migrate Shtiya Builder from its current 10-value flat `user_role` enum to the 22 granular sub-roles defined in `shtiya_builder-role-taxonomy.md`. No new app pages or map layers are built in this phase — scope is strictly RBAC: schema, policies, middleware, layout gates, API route guards, nav metadata, and test fixtures.

**Approach:** One breaking Supabase migration replaces the old enum; everything downstream (RLS, TypeScript, tests) is updated to match. Because this is a clean-slate migration the hosted DB will be reset — no data migration is needed.

**Non-goals (Phase 9):** Sub-role-specific map layers, dedicated UI pages per sub-role, `$SHQL` token flows, SB-9 zoning overlays, or any new Supabase Edge Functions.

---

## The 22 Sub-Roles

Derived from `shtiya_builder-role-taxonomy.md`. Each row maps the new `rbac_key` to the old flat role it replaces and the apps it can access.

| # | New `rbac_key` | Replaces | App Segments |
|---|----------------|----------|--------------|
| 1 | `owner_single` | `owner` | `owner`, `property`, `escrow` |
| 2 | `owner_investor` | `owner` | `owner`, `acquisition`, `property`, `escrow` |
| 3 | `owner_distressed` | `owner` | `owner`, `property`, `escrow` |
| 4 | `investor_wholesaler` | `investor` | `acquisition`, `escrow` |
| 5 | `investor_value_add` | `investor` | `acquisition`, `capital`, `design`, `escrow` |
| 6 | `investor_assembler` | `investor` | `acquisition`, `capital`, `legal`, `design`, `escrow` |
| 7 | `lender_institutional` | `lender` | `capital`, `escrow` |
| 8 | `lender_heloc` | `lender` | `capital`, `escrow` |
| 9 | `lender_jv` | `lender` | `capital`, `legal`, `escrow` |
| 10 | `legal_transactional` | `attorney` | `legal`, `escrow` |
| 11 | `legal_title` | `attorney` | `legal`, `escrow` |
| 12 | `legal_expediter` | `attorney` | `legal`, `escrow` |
| 13 | `legal_loss_mitigation` | `attorney` | `legal`, `escrow` |
| 14 | `contractor_gc` | `contractor` | `contractor`, `design`, `escrow` |
| 15 | `contractor_sub` | `contractor` | `contractor`, `escrow` |
| 16 | `contractor_supplier` | `contractor` | `contractor`, `escrow` |
| 17 | `arch_ra` | `architect` | `design`, `escrow` |
| 18 | `arch_engineer` | `architect` | `design`, `escrow` |
| 19 | `arch_zoning` | `architect` | `legal`, `design`, `escrow` |
| 20 | `prop_manager` | `property_manager` | `property`, `escrow` |
| 21 | `prop_tenant` | `tenant` | `property` |
| 22 | `admin` | `admin` | all 10 app segments |

> `marketer` is removed from the enum — no sub-role in the taxonomy maps to it. The `marketing` app remains accessible to `admin` only until Phase 9 defines a marketing persona.

---

## Role-to-Group Mapping (for RLS)

RLS policies currently check exact role strings. After migration they must check **role groups** — multiple sub-roles that share the same access pattern. The strategy is a `current_user_role_group()` helper function that maps a sub-role to its group string.

| Group String | Sub-Roles That Map To It |
|---|---|
| `owner` | `owner_single`, `owner_investor`, `owner_distressed` |
| `investor` | `investor_wholesaler`, `investor_value_add`, `investor_assembler` |
| `lender` | `lender_institutional`, `lender_heloc`, `lender_jv` |
| `attorney` | `legal_transactional`, `legal_title`, `legal_expediter`, `legal_loss_mitigation` |
| `contractor` | `contractor_gc`, `contractor_sub`, `contractor_supplier` |
| `architect` | `arch_ra`, `arch_engineer`, `arch_zoning` |
| `property_manager` | `prop_manager` |
| `tenant` | `prop_tenant` |
| `admin` | `admin` |

---

## Layout Gate Mapping

| Layout File | Current Allowlist | New Allowlist |
|---|---|---|
| `(admin)/layout.tsx` | `['admin']` | `['admin']` — unchanged |
| `(owner)/layout.tsx` | `['owner', 'investor', 'admin']` | all 3 `owner_*` + all 3 `investor_*` + `admin` |
| `(contractor)/layout.tsx` | `['contractor', 'architect', 'admin']` | all 3 `contractor_*` + all 3 `arch_*` + `admin` |

---

## Sub-Tasks

---

### T8.1 — Database Enum Replacement Migration

**Status:** `[ ] pending`

**Intent:** Replace the 10-value `user_role` enum with the 22-value enum via a new migration file (`0011_sub_role_expansion.sql`). This is a clean-slate operation — no `ALTER TYPE ADD VALUE` needed; the migration drops and recreates the enum after updating the `users.role` column.

**Expected Outcomes:**
- Migration applies cleanly to a fresh DB (`supabase db reset`).
- `select enum_range(null::user_role)` returns all 22 sub-role values.
- The `users.role` column still has `not null default 'owner_single'` (replaces `'owner'`).

**Todo List:**
1. Create `supabase/migrations/0011_sub_role_expansion.sql`.
2. `ALTER TABLE users ALTER COLUMN role DROP DEFAULT` (must drop default before changing enum).
3. `ALTER TABLE users ALTER COLUMN role TYPE text` (cast away from enum to allow re-create).
4. `DROP TYPE user_role CASCADE`.
5. `CREATE TYPE user_role AS ENUM (...)` with all 22 values listed in the table above.
6. `ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role`.
7. `ALTER TABLE users ALTER COLUMN role SET DEFAULT 'owner_single'`.
8. Create `current_user_role_group()` helper SQL function (used by RLS in T8.2).

**Relevant Context:**
- Existing enum: `supabase/migrations/0001_core_schema.sql` lines 17–20.
- `current_user_role()` helper function already defined in `0002_rls_policies.sql` — `current_user_role_group()` is a sibling function added in this migration.
- `CASCADE` on `DROP TYPE` removes the old column constraint — the `ALTER COLUMN ... TYPE` step right after re-applies the new enum type.

---

### T8.2 — RLS Policy Group-Aware Update

**Status:** `[ ] pending`

**Intent:** Add a second migration (`0012_sub_role_rls_update.sql`) that drops and recreates every RLS policy currently referencing an old flat role string, replacing exact role checks with `current_user_role_group()` calls. No existing policy _logic_ changes — only the role string comparisons widen to group membership.

**Expected Outcomes:**
- All existing RLS SELECT and write policies still enforce the same logical boundaries, but now accept any sub-role that belongs to the group (e.g. `lender_institutional`, `lender_heloc`, `lender_jv` all satisfy `current_user_role_group() in ('lender', 'admin')`).
- `supabase db reset` applies both 0011 and 0012 cleanly.

**Todo List:**
1. Create `supabase/migrations/0012_sub_role_rls_update.sql`.
2. For each affected policy in `0002_rls_policies.sql`, `0007_write_policies.sql`, and `0010_investor_connections.sql` — `DROP POLICY IF EXISTS` then recreate using `current_user_role_group()`.
3. Policies to update (all 17 affected):
   - `users_self_select` — `'admin'` → `current_user_role_group() = 'admin'`
   - `properties_owner_access` — `'admin'` → group check
   - `block_committees_member_access` — `'admin'`
   - `block_committee_members_self` — `'admin'`
   - `agreements_party_access` — `'attorney', 'admin'`
   - `ledgers_party_access` — `'lender', 'admin'`
   - `documents_scoped_access` — `'admin'`
   - `violations_owner_access` — `'investor', 'admin'`
   - `vision_inspections_scoped` — `'lender', 'admin'`
   - `deal_room_events_member_access` — `'admin'`
   - `compliance_checks_scoped` — `'admin'`
   - `block_committees_member_update` — `'admin'`
   - `block_committee_members_insert` — `'admin'`
   - `block_committee_members_self_sign` — `'admin'`
   - `agreements_party_insert` / `agreements_party_update` — `'attorney', 'admin'`
   - `financial_ledgers_lender_update` — `'lender', 'admin'`
   - `deal_room_events_insert_*` — `'lender', 'admin'`
   - `connections_investor_insert` — `current_user_role_group() = 'investor'`
   - `connections_update` — group-aware investor/owner checks
   - `properties_investor_discovery` — `current_user_role_group() = 'investor'`

**Relevant Context:**
- `current_user_role()` is defined in `0002_rls_policies.sql` and returns the `users.role` value for `auth.uid()`.
- `current_user_role_group()` is defined in migration 0011 (T8.1) — must be created before these policies run.
- The `connections_investor_insert` and `properties_investor_discovery` policies in `0010_investor_connections.sql` check for the exact string `'investor'` — these must now check `current_user_role_group() = 'investor'`.

---

### T8.3 — `ROLE_APP_MAP` and TypeScript RBAC Update

**Status:** `[ ] pending`

**Intent:** Update `src/lib/rbac/roles.ts` to map all 22 sub-roles to their app segments, replace the `AppRole` type, and expose a `getRoleGroup()` utility that mirrors the SQL helper (used by API routes).

**Expected Outcomes:**
- `getAllowedApps('owner_investor')` returns `['owner', 'acquisition', 'property', 'escrow']`.
- `getAllowedApps('investor_assembler')` returns `['acquisition', 'capital', 'legal', 'design', 'escrow']`.
- `getAllowedApps('admin')` still returns all 10 segments.
- `getRoleGroup('lender_institutional')` returns `'lender'`.
- `getRoleGroup('admin')` returns `'admin'`.
- `tsc --noEmit` clean.

**Todo List:**
1. Expand `ROLE_APP_MAP` in `src/lib/rbac/roles.ts` with all 22 sub-role keys and their app segment arrays per the mapping table above. Remove `marketer`.
2. Update `AppRole` type to be `keyof typeof ROLE_APP_MAP`.
3. Add `ROLE_GROUP_MAP: Record<string, string>` constant that maps each sub-role to its group string.
4. Export `getRoleGroup(role: string | null | undefined): string | null` function.

**Relevant Context:**
- Current file: `src/lib/rbac/roles.ts` — 10-key ROLE_APP_MAP.
- `getAllowedApps()` function signature stays unchanged — only the map it reads expands.
- `getRoleGroup()` will be consumed by API route guards in T8.4.

---

### T8.4 — API Route Guard Updates

**Status:** `[ ] pending`

**Intent:** Update every API route that hardcodes an old flat role string to use `getRoleGroup()` from `src/lib/rbac/roles.ts` instead of exact `profile.role` comparisons.

**Expected Outcomes:**
- `POST /api/connections` — any `investor_*` sub-role can send a request; any `owner_*` sub-role is a valid target.
- `PATCH /api/connections` — same group checks.
- `GET /api/connections/discovery` — any `investor_*` sub-role or `admin` gets the feed.
- `POST/PATCH /api/draws/approve` — any `lender_*` sub-role or `admin` can approve.
- `tsc --noEmit` clean.

**Todo List:**
1. `src/app/api/connections/route.ts` — replace `profile?.role !== 'investor'` with `getRoleGroup(profile?.role) !== 'investor'`; replace `target?.role !== 'owner'` with `getRoleGroup(target?.role) !== 'owner'`.
2. `src/app/api/connections/discovery/route.ts` — replace `profile?.role !== 'investor' && profile?.role !== 'admin'` with group-based check.
3. `src/app/api/draws/approve/route.ts` — replace `['lender', 'admin'].includes(profile.role)` with group-based check.
4. `src/app/api/agreements/route.ts` — the `profile?.role ?? 'owner'` default used in `agreements.parties` payloads should default to `'owner_single'` instead of `'owner'`.

**Relevant Context:**
- `getRoleGroup()` is added in T8.3 — must complete T8.3 before this task.
- `src/app/(apps)/capital/page.tsx` and `src/app/(apps)/capital/draws/[id]/page.tsx` both have `parties.find(p => p.role === 'owner' || p.role === 'investor')` — these are display-only, but should be widened to group checks for correctness.

---

### T8.5 — Layout Gate + LeftSidebar Update

**Status:** `[ ] pending`

**Intent:** Update the three role-group server layouts to use the expanded allowlists, and update `LeftSidebar`'s `NAV_META` to stay correct (app segments don't change, so this is mostly a verification step plus removing any reference to `marketer`).

**Expected Outcomes:**
- `(admin)/layout.tsx` — still allows only `'admin'` (unchanged).
- `(owner)/layout.tsx` — allows `owner_single`, `owner_investor`, `owner_distressed`, `investor_wholesaler`, `investor_value_add`, `investor_assembler`, `admin`.
- `(contractor)/layout.tsx` — allows `contractor_gc`, `contractor_sub`, `contractor_supplier`, `arch_ra`, `arch_engineer`, `arch_zoning`, `admin`.
- `LeftSidebar` `NAV_META` — 10 app segment keys are unchanged; no role strings in `NAV_META` itself.
- `tsc --noEmit` clean after all layout changes.

**Todo List:**
1. `src/app/(apps)/(owner)/layout.tsx` — replace `ALLOWED_ROLES` set with all `owner_*` + all `investor_*` + `admin`.
2. `src/app/(apps)/(contractor)/layout.tsx` — replace `ALLOWED_ROLES` set with all `contractor_*` + all `arch_*` + `admin`.
3. `src/app/(apps)/(admin)/layout.tsx` — no change needed (already checks `role !== 'admin'`; string is still `'admin'`).
4. Verify `src/components/layout/LeftSidebar.tsx` — `NAV_META` keys are app segments (not role strings), so no change. Confirm `getAllowedApps()` still filters correctly by checking that `getAllowedApps('marketer')` now returns `[]` (marketer removed from map).

**Relevant Context:**
- Layout files: `src/app/(apps)/(owner)/layout.tsx` line 4, `src/app/(apps)/(contractor)/layout.tsx` line 4.
- `LeftSidebar` calls `getAllowedApps(role)` — the role value comes from the DB, so once 0011 migration is applied and users are re-seeded with new sub-roles, the nav will automatically filter correctly.

---

### T8.6 — E2E Test Fixtures Update

**Status:** `[ ] pending`

**Intent:** Update `tests/e2e/helpers/seed.ts` to use the new sub-role strings so the T4.16 and T5 test suites continue to work after the enum migration.

**Expected Outcomes:**
- `ROLE_SPECS` maps test personas to the correct new sub-role strings.
- `npm run test:e2e` (T4.16 mocked suite) passes against a fresh DB.
- `npm run test:e2e:live` (T5 live suite) passes against hosted Supabase after migration applied.

**Todo List:**
1. `tests/e2e/helpers/seed.ts` — update `ROLE_SPECS`:
   - `ownerA`: `role: 'owner_investor'` (used in block committee assembly — the taxonomy's assembly sub-role)
   - `ownerB`: `role: 'owner_investor'`
   - `attorney`: `role: 'legal_transactional'`
   - `investor`: `role: 'investor_value_add'`
   - `lender`: `role: 'lender_institutional'`
   - `contractor`: `role: 'contractor_gc'`
   - `tenant`: `role: 'prop_tenant'`
   - `admin`: `role: 'admin'`
2. Update the `LifecycleRole` type comment if it hardcodes the old role strings anywhere else.
3. Run `npm run test:e2e` after T8.1–T8.5 are complete — confirm all tests pass.

**Relevant Context:**
- File: `tests/e2e/helpers/seed.ts` lines 9–28.
- The T5.1 layout test (`AdminLayout`, `OwnerLayout`, `ContractorLayout`) calls layouts with real signed-in users — those users' `role` column in the DB will now hold sub-role strings. The layout gate logic from T8.5 must be in place before running the live suite.

---

### T8.7 — Documentation Sync

**Status:** `[ ] pending`

**Intent:** Update `Plan.md` and `Tasks.md` to record Phase 8 completion and reflect the new 22-sub-role architecture as the canonical RBAC reference.

**Expected Outcomes:**
- `Plan.md` has a new section "7. Sub-Role RBAC Expansion (Phase 8)" documenting the 22 sub-roles, role group mapping, and layout gate mapping.
- `Tasks.md` has a Phase 8 block with T8.1–T8.7, all marked `[x]`.
- `ROLE_APP_MAP` in `Plan.md §1.2` updated to reflect the new 22-key map.

**Todo List:**
1. Append Phase 8 section to `Plan.md`.
2. Append Phase 8 task block to `Tasks.md`.
3. Replace the 10-key `ROLE_APP_MAP` snippet in `Plan.md §1.2` with the new 22-key version.

**Relevant Context:**
- Plan files: `Plan.md`, `Tasks.md`.
- Source of truth for the taxonomy: `shtiya_builder-role-taxonomy.md`.

---

## Implementation Order

Tasks are ordered by dependency. Each must complete before the next begins:

```
T8.1 (migration 0011 — enum + helper fn)
  ↓
T8.2 (migration 0012 — RLS policies)
  ↓
T8.3 (TypeScript ROLE_APP_MAP + getRoleGroup)
  ↓
T8.4 (API route guards)  ← parallel with T8.5
T8.5 (layout gates + sidebar)
  ↓
T8.6 (test fixtures + verification run)
  ↓
T8.7 (docs sync)
```

T8.4 and T8.5 have no dependency on each other and can be done in either order after T8.3.

---

## Key Constraints

- **No destructive UI changes** — existing page components, API routes, and middleware matcher patterns are not touched beyond role string updates.
- **Migration 0011 and 0012 together form one atomic reset** — apply both in sequence via `supabase db reset` or `supabase db push`. They cannot be applied independently to a running DB that has `owner`-enum values.
- **`marketer` is removed** — the `marketing` app becomes admin-only in `ROLE_APP_MAP`. If a `marketer`-role user existed, they would be blocked at middleware after reset. No migration guard is needed since this is clean-slate.
- **`current_user_role_group()` must be created before 0012 runs** — it is defined inside migration 0011. Supabase runs migrations in filename-alphabetical order, so 0011 always precedes 0012.
