# Shtiya Builder Ecosystem v2.0 — Engineering Plan

**Document class:** Production Engineering Blueprint  
**Produced by:** IBM Bob, Lead Architect & Project Manager  
**Input corpus:** 8 Master Blueprints (Groups 1–7, 9) + Master Architecture + Terminal Layout Plan + UI Assembly Plan  
**ISO_SOC2_GATE:** ✅ All 8 flags verified `true`  
**Date:** 2026-08-19  

---

## Executive Summary

This plan translates nine group-level Master Blueprints into a single, phased, implementation-ready engineering specification for the Shtiya Builder Ecosystem v2.0. The application is a multi-sided PropTech/FinTech platform for 27 distinct professional roles, served through a persistent "Bloomberg Terminal" three-pane UI backed by Supabase PostgreSQL (RLS), Next.js 14 App Router, Zustand, and the Vercel AI SDK.

The plan is organized into four strictly sequential phases:

| Phase | Scope | Output |
|---|---|---|
| **Phase 1** | Foundation & Three-Pane Shell | Next.js layout, Supabase Auth, core schema, RLS skeleton |
| **Phase 2** | Directory Navigation & RBAC Filtering | Left Pane, Middleware, Role App Map, Zero-Trust layouts |
| **Phase 3** | Context Registry & Agentic Co-Pilot | Zustand store, Right Pane, `/api/copilot` route |
| **Phase 4** | Micro-App Routing & 27 Sub-Role Workspaces | Center Pane injection, per-group authorization primitives |

---

## Part I — Core Architectural Constraints (Invariant)

These constraints are non-negotiable. Every implementation task must satisfy all of them.

### I.A — Three-Pane Layout Topology

```
src/app/(apps)/layout.tsx
  CSS Grid: grid-cols-[250px_1fr_350px] h-screen overflow-hidden
  ├── <aside>  Left Pane   (250px)  — React Server Component
  ├── <main>   Center Pane (1fr)    — Dynamic page slot; min-h-0 min-w-0 overflow-y-auto
  └── <aside>  Right Pane  (350px)  — 'use client' Co-Pilot
```

### I.B — Zero-Trust Left Pane (Server-Only)

- **No `use client` directive** anywhere in `LeftSidebar.tsx`. The only client boundary is a nested `<SignOutButton>` sub-component.
- Navigation tree derived **server-side** from `ROLE_APP_MAP` using the caller's `users.role` read via `@supabase/ssr` session cookies.
- Active-link styling resolved from the `x-next-pathname` header injected by `middleware.ts`. No `usePathname`.

### I.C — Hardened Zustand Context Registry

The Zustand store shape (hardened per G1 §II.3.4):

```typescript
interface TerminalStore {
  workspaceId:  string | null;
  propertyId:   string | null;   // or dealId / facilityId / matterId / etc.
  capacity:     string | null;   // the workspace-type string
  epoch:        number;          // monotonic; incremented on every switch
  setWorkspace: (ws: WorkspacePayload) => void;
  clearWorkspace: () => void;
}
```

Rules:
1. `clearWorkspace()` fires **before** the new route mounts; the epoch increments simultaneously.
2. `prepareSendMessagesRequest` injects `{ workspaceId, propertyId, capacity, epoch }` — **no prose**.
3. A dispatch against a null-state store is refused client-side.

### I.D — API Co-Pilot Route (Server Re-Authorization)

`/api/copilot` must:
1. Authenticate the caller (`createClient()` — 401 if no session).
2. Receive `{ messages, workspaceId, propertyId, capacity, epoch }` from the body.
3. Verify authorization server-side using the appropriate primitive (`has_property_capacity()`, `is_deal_member()`, `is_facility_party()`, `is_work_package_party()`, `is_design_package_party()`, or `matter_parties` membership).
4. Return `403` without invoking the model if authorization fails.
5. Select the system prompt from `capacity` **server-side** — never from client input.
6. Stream via `streamText` + `result.toDataStreamResponse()`.

### I.E — Universal Authorization Invariants (Cross-Group)

These invariants apply to **every** RLS policy in every group. No exception.

| ID | Rule |
|---|---|
| **I-1** | No RLS policy uses `current_user_role_group()` for row-level access except the literal `admin` branch. Primitives: `has_property_capacity()` (G1), `is_deal_member()` (G2), `is_facility_party()` (G3), matter role (G4), `is_work_package_party()` (G5), `is_design_package_party()` (G6), engagement/tenancy membership (G7/G9). |
| **I-2** | No billing code path holds any SQL grant on any authorization table. Enforced by `REVOKE` + `assert_not_billing_actor()` trigger on all authorization tables. |
| **I-3** | `verification_tier` / trust level / credential level are monotonic-by-evidence. May only be raised by the verification service role. |
| **I-4** | `owner_investor` never resolves to RLS group `investor` and never receives the `acquisition` app segment. |
| **I-22** | No platform capability may deny, condition, or degrade a tenant's physical access to their dwelling, its utilities, or its habitability (G7 Access Floor). |
| **I-25** | Auto-approve is permitted; auto-deny is prohibited in housing screening (G7). |
| **I-31** | No commission rate is proposed, defaulted, benchmarked, or aggregated by the platform across competing brokerages (G9). |

---

## Part II — Database Schema & Supabase Architecture

### II.1 — Core Tables (Phase 1 Foundation)

```sql
-- Identity & Access
users(id uuid PK, email, role text, created_at)
-- role is nav-routing only; never used for row access outside admin branch

-- Properties (anchor record for Groups 1, 7)
properties(
  id uuid PK, bbl text UNIQUE,
  address text, borough text,
  recorded_grantees jsonb[],          -- all deed grantees
  title_holder_type text,             -- 'person' | 'entity' | 'trust'
  exposure_policy text NOT NULL DEFAULT 'private',  -- 'private' | 'network' | 'seeking_exit'
  recorded_at timestamptz,            -- deed recording date
  co_owned boolean GENERATED ALWAYS AS (jsonb_array_length(recorded_grantees) > 1) STORED,
  created_at, updated_at
)

-- Group 1: Capacity Binding Model
property_role_bindings(
  id uuid PK, user_id uuid FK→users, property_id uuid FK→properties,
  capacity text,                      -- 'owner_single' | 'owner_investor' | 'owner_distressed'
  verification_tier text DEFAULT 'V0',-- V0..V3+
  claim_share text DEFAULT 'sole',    -- 'sole' | 'partial'
  status text DEFAULT 'active',       -- 'active' | 'dormant' | 'contested' | 'revoked'
  attested_at timestamptz,
  created_at
)

-- Entitlements (billing-derived feature flags; NEVER data scope)
entitlements(
  id uuid PK, user_id uuid FK→users,
  key text, source text,              -- 'stripe' | 'system'
  expires_at timestamptz,
  created_at
)

-- Agreements, Documents, Financial Ledgers (shared)
agreements(id uuid PK, parties uuid[], privilege_class text, binding_status text, created_at)
documents(
  id uuid PK, title text, storage_path text,
  privilege_class text,               -- 'none' | 'attorney_client' | 'work_product' | 'settlement_privileged'
  privilege_holder_id uuid FK→users,
  created_at
)
financial_ledgers(
  id uuid PK, ledger_type text, usd_amount_cents bigint,
  status text, party_ids uuid[], created_at
)

-- Escrow Intents (Two-Phase, Atomic — G1 §II.7.2)
escrow_intents(
  id uuid PK, idempotency_key text UNIQUE,
  source_ledger_id uuid, direction text, usd_amount_cents bigint,
  status text DEFAULT 'pending',      -- 'pending' | 'broadcasting' | 'confirmed' | 'failed'
  on_chain_tx_hash text,
  created_at, confirmed_at
)

-- Disclosures (mandatory acknowledgement log — G1/G3/G9)
disclosures(
  id uuid PK, user_id uuid, disclosure_type text,
  rendered_document_hash text, acknowledged_at timestamptz, created_at
)
```

### II.2 — Group Authorization Primitives

```sql
-- Group 2: Deal Membership
orgs(id, name, trust_level text, rbac_key text, created_at)
org_members(org_id, user_id, org_role text, spend_limit_cents bigint)
deals(id, org_id, property_id, deal_type text, status text, created_at)
deal_memberships(id, user_id, org_id, deal_id, deal_role text, scope text, status text)

-- Group 3: Facility Parties
institutions(id, name, activation_level text, product_lines text[], created_at)
institution_members(
  institution_id, user_id, inst_role text,
  credit_authority_cents bigint, dual_control_threshold_cents bigint
)
facilities(id, institution_id, borrower_id, facility_type text, committed_usd_cents bigint, status text)
facility_parties(facility_id, user_id, institution_id, party_role text, status text)

-- Group 4: Matter Model
firms(id, name, admission_level text, created_at)
firm_members(firm_id, user_id, firm_role text)
matters(id, firm_id, matter_type text, status text, created_at)
matter_parties(matter_id, user_id, matter_role text, status text)
representations(matter_id, counsel_user_id, client_user_id, scope text, status text)
ethical_walls(matter_id, firm_id, screened_user_ids uuid[], created_at)
conflict_checks(id, matter_id, checked_by uuid, result text, checked_at)

-- Group 5: Work Package Model
companies(id, name, credential_level text, created_at)
crew_members(company_id, user_id, identity_hash text, qualifications jsonb, status text)
work_packages(id, company_id, property_id, scope text, status text, created_at)
wp_parties(work_package_id, user_id, company_id, wp_role text, status text)

-- Group 6: Design Package Model
practices(id, name, credential_level text, created_at)
seal_holders(practice_id, user_id, identity_hash text, discipline text, status text)
professional_licences(
  seal_holder_id, jurisdiction text, discipline text, licence_number text,
  standing text, expires_on date, stamp_content text
)
design_packages(id, practice_id, project_id, discipline text, phase text, status text)
dp_parties(design_package_id, user_id, practice_id, dp_role text, status text)
design_licences(id, grantor_id, grantee_id, design_package_id, scope text, permitted_uses text[], status text)

-- Group 7: Tenancy Model
management_engagements(
  id, manager_user_id, owner_property_binding_id,
  licence_verified boolean, trust_account_verified boolean, status text
)
tenancies(id, engagement_id, unit_id, tenant_user_ids uuid[], lease_start date, lease_end date, status text)
rent_trust(id, tenancy_id, amount_cents bigint, status text, applied_at timestamptz)
deposit_trust(id, tenancy_id, amount_cents bigint, depository text, interest_accrued_cents bigint, status text)
screening_reports(id, applicant_user_id, ordered_at timestamptz, expires_at timestamptz, status text)

-- Group 9: Agency Representation Model
brokerages(id, designated_broker_user_id, registration_level text, e_and_o_verified boolean)
broker_seats(brokerage_id, user_id, seat_role text, licence_id text)
agency_representations(
  id, brokerage_id, listing_property_id, principal_user_id,
  representation_type text,          -- 'seller' | 'buyer' | 'tenant_rep' | 'landlord_rep'
  agency_type text,                  -- 'exclusive_right' | 'exclusive_agency' | 'open' | 'designated'
  status text
)
```

### II.3 — Critical SQL Functions

```sql
-- Group 1 core authorization check
CREATE OR REPLACE FUNCTION has_property_capacity(p_property_id uuid, p_capacity text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM property_role_bindings
    WHERE user_id = auth.uid()
      AND property_id = p_property_id
      AND capacity = p_capacity
      AND status = 'active'
  );
$$;

-- Group 2 core authorization check
CREATE OR REPLACE FUNCTION is_deal_member(p_deal_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM deal_memberships
    WHERE user_id = auth.uid() AND deal_id = p_deal_id AND status = 'active'
  );
$$;

-- Group 3 core authorization check
CREATE OR REPLACE FUNCTION is_facility_party(p_facility_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM facility_parties
    WHERE user_id = auth.uid() AND facility_id = p_facility_id AND status = 'active'
  );
$$;

-- Groups 5/6 work/design package checks (same pattern)
CREATE OR REPLACE FUNCTION is_work_package_party(p_wp_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM wp_parties
    WHERE user_id = auth.uid() AND work_package_id = p_wp_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_design_package_party(p_dp_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM dp_parties
    WHERE user_id = auth.uid() AND design_package_id = p_dp_id AND status = 'active'
  );
$$;

-- Billing actor guard (I-2)
CREATE OR REPLACE FUNCTION assert_not_billing_actor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.actor_class', true) = 'billing' THEN
    RAISE EXCEPTION 'billing actor cannot modify authorization tables';
  END IF;
  RETURN NEW;
END;
$$;
-- Apply to: property_role_bindings, deal_memberships, facility_parties, wp_parties, dp_parties, matter_parties
```

### II.4 — RLS Policy Skeleton

The universal policy pattern for all non-admin branches:

```sql
-- Example: properties (Group 1)
CREATE POLICY "properties_owner_access" ON properties FOR SELECT
  USING (
    has_property_capacity(id, 'owner_single')
    OR has_property_capacity(id, 'owner_investor')
    OR has_property_capacity(id, 'owner_distressed')
    OR current_user_role_group() = 'admin'
    -- exposure_policy for discovery surfaces is a SEPARATE policy
  );

-- Example: financial_ledgers (cross-group — ALL primitives, never role group)
CREATE POLICY "ledgers_party_access" ON financial_ledgers FOR SELECT
  USING (
    auth.uid() = ANY(party_ids)
    OR current_user_role_group() = 'admin'
    -- The lender branch from G1 §III.3 IS REMOVED per G3 Appendix B
    -- Use is_facility_party() instead if lender needs access
  );
```

### II.5 — Exposure Control Plane (Group 1 §II.5)

```sql
-- k-anonymity floor enforcement via materialized view
CREATE MATERIALIZED VIEW discovery_feed AS
  SELECT id, borough, zoning_class, avm_band, parcel_boundary
  FROM properties
  WHERE exposure_policy != 'private'
    AND exposure_policy_held_since < now() - interval '24 hours'  -- hysteresis
  -- Tombstones: removed parcels linger 30 days with stale_since date
;

CREATE INDEX ON discovery_feed(borough);
-- Refresh: pg_cron every hour on the hour (quantized cadence)

-- k-anonymity enforcement in the API layer:
-- Any bounded-geography query returning < 5 parcels returns 0 rows + 'region_too_sparse' code
```

---

## Part III — ROLE_APP_MAP & 27-Role Taxonomy

Per Group 4 Appendix D, the canonical count is **27 roles** (not 25). The two additions are `legal_arbitrator` (group `neutral`) and `contractor_logistics` (group `contractor`).

### III.1 — Role Group Strings

| Group String | Sub-Roles |
|---|---|
| `owner` | `owner_single`, `owner_investor`, `owner_distressed` |
| `investor` | `investor_wholesaler`, `investor_value_add`, `investor_assembler` |
| `lender` | `lender_institutional`, `lender_heloc`, `lender_jv` |
| `attorney` | `legal_transactional`, `legal_title`, `legal_expediter`, `legal_loss_mitigation` |
| `neutral` | `legal_arbitrator` *(new — must NEVER map to `attorney`)* |
| `contractor` | `contractor_gc`, `contractor_sub`, `contractor_supplier`, `contractor_logistics` *(new)* |
| `architect` | `arch_ra`, `arch_engineer`, `arch_zoning` |
| `property_manager` | `prop_manager` |
| `tenant` | `prop_tenant` |
| `broker` | `broker_commercial`, `broker_residential`, `broker_leasing` |
| `admin` | *(internal)* |

### III.2 — ROLE_APP_MAP (App Segment → Allowed Groups)

```typescript
// src/lib/rbac/roles.ts
export const ROLE_APP_MAP: Record<string, string[]> = {
  owner:       ['owner'],
  acquisition: ['investor'],                      // owner_investor EXCLUDED (G1 §II.4.2)
  capital:     ['lender', 'admin'],
  legal:       ['attorney', 'neutral', 'admin'],  // neutral is NOT attorney
  design:      ['architect', 'admin'],
  contractor:  ['contractor', 'admin'],
  property:    ['property_manager', 'tenant', 'admin'],
  brokerage:   ['broker', 'admin'],
  office:      ['admin'],
};
```

---

## Part IV — Phase 1: Foundation & Three-Pane Shell

### Goal

Establish the project skeleton, Supabase schema, authentication flow, and the three-pane CSS Grid shell. No business logic; no role-specific UI.

### 1.1 — Project Bootstrap

- **Framework:** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS.
- **Dependencies:** `@supabase/ssr`, `@supabase/supabase-js`, `zustand`, `ai`, `@ai-sdk/google`, `mapbox-gl`, `lucide-react`.
- **Environment variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`.

### 1.2 — Supabase Foundation Migration (`0001_foundation.sql`)

Deploy the following in order:
1. Enable `uuid-ossp` extension.
2. `users` table with `role text NOT NULL DEFAULT 'owner'`.
3. `properties` table (full schema from §II.1).
4. `property_role_bindings` table + `assert_not_billing_actor()` trigger.
5. `entitlements` table + billing actor `REVOKE`.
6. `agreements`, `documents`, `financial_ledgers`, `escrow_intents`, `disclosures` tables.
7. `has_property_capacity()` function.
8. Seed one admin user.

### 1.3 — Auth Flow

- Login page: `src/app/(auth)/login/page.tsx` — email/password via Supabase Auth.
- Redirect post-login: `middleware.ts` reads session, looks up `users.role`, redirects to the appropriate app segment root.
- Logout: server action calling `supabase.auth.signOut()`.

### 1.4 — Three-Pane Layout Shell

File: `src/app/(apps)/layout.tsx`

```
Responsibilities:
  1. Async Server Component.
  2. Read x-next-pathname from headers().
  3. Fetch session + users.role via @supabase/ssr.
  4. Render CSS Grid: grid-cols-[250px_1fr_350px] h-screen overflow-hidden bg-slate-950.
  5. Left aside: <LeftSidebar> (RSC — placeholder for Phase 2).
  6. Center main: min-h-0 min-w-0 overflow-y-auto — renders {children}.
  7. Right aside: <RightSidebar> (Client — placeholder for Phase 3).
```

### 1.5 — Unauthorized Page

File: `src/app/unauthorized/page.tsx` — static 403 message + "Return to Login" link.

---

## Part V — Phase 2: Directory Navigation & RBAC Filtering

### Goal

Build the Left Pane as a fully server-rendered, role-scoped navigation tree. Activate per-role-group Zero-Trust layout gates. Wire the `x-next-pathname` middleware header.

### 2.1 — Middleware Enhancement

File: `src/middleware.ts`

Add **one line only** to the existing RBAC redirect logic:

```typescript
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-next-pathname', request.nextUrl.pathname);
// Pass requestHeaders into NextResponse.next({ request: { headers: requestHeaders } })
```

The existing `supabase.auth.getUser()` + RBAC redirect flow is **not modified**.

### 2.2 — ROLE_APP_MAP & Navigation Helpers

File: `src/lib/rbac/roles.ts`

Exports:
- `ROLE_APP_MAP` (§III.2).
- `ROLE_GROUP_MAP`: `Record<string, string>` mapping each of the 27 sub-role strings to its group string.
- `getAllowedApps(role: string): NavItem[]` — returns `{ label, href, icon }[]` filtered by the role's group.
- `getWorkspaceManifest(userId, supabaseClient)` — async function that calls the Supabase RPC `workspace_manifest()` and returns the typed navigation tree for Group 1 users (parcel-scoped workspaces).

### 2.3 — LeftSidebar Server Component

File: `src/components/layout/LeftSidebar.tsx`

- **No `use client`**.
- Props: `{ currentPath: string; role: string; userId: string }`.
- For `owner`-group roles: call `getWorkspaceManifest()` → render the parcel-scoped tree (§II.3.2 tree shape from G1).
- For all other groups: render `getAllowedApps(role)` as flat nav links.
- Active styling: `currentPath.startsWith(item.href)` → `bg-slate-800`.
- Bottom: `<SignOutButton>` (isolated `use client` sub-component).

### 2.4 — Zero-Trust Role-Group Layouts

Three server component layouts that independently enforce role gates:

```
src/app/(apps)/(owner)/layout.tsx     → allows group: owner
src/app/(apps)/(investor)/layout.tsx  → allows group: investor
src/app/(apps)/(lender)/layout.tsx    → allows group: lender, admin
src/app/(apps)/(legal)/layout.tsx     → allows group: attorney, neutral, admin
src/app/(apps)/(contractor)/layout.tsx→ allows group: contractor, admin
src/app/(apps)/(architect)/layout.tsx → allows group: architect, admin
src/app/(apps)/(property)/layout.tsx  → allows group: property_manager, tenant, admin
src/app/(apps)/(broker)/layout.tsx    → allows group: broker, admin
src/app/(apps)/(admin)/layout.tsx     → allows group: admin only
```

Each layout:
1. Fetches session server-side.
2. Looks up `users.role`, derives group via `ROLE_GROUP_MAP`.
3. `redirect('/unauthorized')` if group not in allowlist.
4. Renders `{children}` (no chrome — the outer `(apps)/layout.tsx` owns the shell).

### 2.5 — `workspace_manifest()` SQL Function (Group 1)

```sql
CREATE OR REPLACE FUNCTION workspace_manifest(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'workspaces', jsonb_agg(
      jsonb_build_object(
        'propertyId',   prb.property_id,
        'capacity',     prb.capacity,
        'address',      p.address,
        'upsell_allowed', (
          NOT EXISTS (
            SELECT 1 FROM property_role_bindings
            WHERE user_id = p_user_id AND capacity = 'owner_distressed' AND status = 'active'
          )
        ),
        'subtabs', (
          SELECT jsonb_agg(tab)
          FROM (
            SELECT CASE prb.capacity
              WHEN 'owner_single'     THEN '["vitals","maintenance","renovation","insurance","local_network"]'::jsonb
              WHEN 'owner_investor'   THEN '["vitals","assembly_map","jv_syndication","enterprise_desk","insurance"]'::jsonb
              WHEN 'owner_distressed' THEN '["defensive_map","loss_mitigation","legal_shield","exposure_privacy"]'::jsonb
            END AS tab
          ) t
        )
      )
    )
  )
  FROM property_role_bindings prb
  JOIN properties p ON p.id = prb.property_id
  WHERE prb.user_id = p_user_id AND prb.status = 'active';
$$;
```

---

## Part VI — Phase 3: Context Registry & Agentic Co-Pilot

### Goal

Implement the Zustand Context Registry, the Right Pane Co-Pilot interface, and the `/api/copilot` streaming route with server-side workspace re-authorization.

### 3.1 — Zustand Terminal Store

File: `src/store/terminalStore.ts`

```typescript
import { create } from 'zustand';

interface WorkspacePayload {
  workspaceId:  string;
  propertyId:   string;
  capacity:     string;
}

interface TerminalState {
  workspaceId:    string | null;
  propertyId:     string | null;
  capacity:       string | null;
  epoch:          number;
  setWorkspace:   (ws: WorkspacePayload) => void;
  clearWorkspace: () => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  workspaceId:  null,
  propertyId:   null,
  capacity:     null,
  epoch:        0,
  setWorkspace: (ws) => set({ ...ws, epoch: get().epoch + 1 }),
  clearWorkspace: () => set({ workspaceId: null, propertyId: null, capacity: null, epoch: get().epoch + 1 }),
}));
```

### 3.2 — `usePageContext` Hook

File: `src/hooks/usePageContext.ts`

```typescript
'use client';
import { useLayoutEffect } from 'react';
import { useTerminalStore } from '@/store/terminalStore';

export function usePageContext(ws: WorkspacePayload) {
  const { clearWorkspace, setWorkspace } = useTerminalStore();
  useLayoutEffect(() => {
    clearWorkspace();               // nullifies store + increments epoch BEFORE mount
    setWorkspace(ws);               // sets new context
    return () => clearWorkspace();  // clean up on unmount
  }, [ws.workspaceId]);
}
```

### 3.3 — RightSidebar Client Component

File: `src/components/layout/RightSidebar.tsx`

Key implementation details:
- `useChat({ api: '/api/copilot' })` — **no** `body` or `system` at hook level.
- `prepareSendMessagesRequest`: reads `useTerminalStore.getState()` **synchronously** (not via hook) and appends `{ workspaceId, propertyId, capacity, epoch }` to the request body.
- Client discards any streamed response whose `epoch` ≠ `useTerminalStore.getState().epoch`.
- Auto-scroll via `useEffect` + `ref` on messages array length.
- Renders: header "Co-Pilot", scrollable message history, bottom input + send button.

### 3.4 — `/api/copilot` Route Handler

File: `src/app/api/copilot/route.ts`

```
POST handler:
  1. createClient() → getUser() → 401 if no session
  2. Parse { messages, workspaceId, propertyId, capacity, epoch }
  3. Server-side authorization:
       - capacity = 'owner_*' → has_property_capacity(propertyId, capacity)
       - capacity = 'deal_*'  → is_deal_member(workspaceId)
       - capacity = 'facility_*' → is_facility_party(workspaceId)
       - else → verify matter/package membership
     → 403 if fails
  4. Select system prompt from capacity (server-side; not from body):
       - owner_distressed:  prohibit valuation/assembly/disposition advice; prepend not-legal-advice
       - owner_single:      prohibit lien-stack/arrears reasoning
       - deal_*/investor_*: construction context prompt
       - etc.
  5. streamText({ model: google('gemini-2.5-pro'), system: systemPrompt, messages })
  6. return result.toDataStreamResponse() with epoch echoed in headers
runtime: 'nodejs'
```

### 3.5 — Capacity-Scoped System Prompts

Stored in `src/lib/copilot/systemPrompts.ts` as a `Record<string, string>`. Selected by `capacity` key in the route handler. The client **never** controls which prompt is loaded.

---

## Part VII — Phase 4: Micro-App Routing & Sub-Role Workspaces

### Goal

Inject all 10 micro-app surfaces into the Center Pane. Each micro-app page must broadcast workspace context to the Zustand store on mount. Authorization primitives from §II.2 govern all data access.

### 4.1 — Folder Structure

```
src/app/(apps)/
├── (owner)/
│   └── owner/
│       ├── [propertyId]/
│       │   ├── vitals/page.tsx
│       │   ├── maintenance/page.tsx
│       │   ├── renovation/page.tsx
│       │   ├── insurance/page.tsx
│       │   ├── local_network/page.tsx
│       │   ├── assembly_map/page.tsx         ← owner_investor only
│       │   ├── jv_syndication/page.tsx
│       │   ├── enterprise_desk/page.tsx
│       │   ├── defensive_map/page.tsx        ← owner_distressed only
│       │   ├── loss_mitigation/page.tsx
│       │   ├── legal_shield/page.tsx
│       │   └── exposure_privacy/page.tsx
│       └── portfolio/page.tsx
├── (investor)/
│   └── acquisition/
│       ├── market/page.tsx                   ← consented feed only
│       ├── [dealId]/
│       │   ├── deal_room/page.tsx
│       │   ├── underwriting/page.tsx
│       │   ├── title_diligence/page.tsx
│       │   ├── assignment/page.tsx
│       │   └── timeline/page.tsx
│       └── portfolio/page.tsx
├── (lender)/
│   └── capital/
│       ├── pipeline/page.tsx
│       ├── [facilityId]/
│       │   ├── facility/page.tsx
│       │   ├── draws/page.tsx
│       │   ├── inspections/page.tsx
│       │   └── covenants/page.tsx
│       └── book/page.tsx
├── (legal)/
│   └── legal/
│       ├── [matterId]/
│       │   ├── record/page.tsx
│       │   ├── documents/page.tsx
│       │   ├── escrow/page.tsx
│       │   └── timeline/page.tsx
│       └── matters/page.tsx
├── (contractor)/
│   └── contractor/
│       ├── [workPackageId]/
│       │   ├── scope/page.tsx
│       │   ├── draws/page.tsx
│       │   ├── safety/page.tsx
│       │   └── delivery/page.tsx
│       ├── vision/page.tsx
│       └── packages/page.tsx
├── (architect)/
│   └── design/
│       ├── [designPackageId]/
│       │   ├── models/page.tsx
│       │   ├── coordination/page.tsx
│       │   ├── rfis/page.tsx
│       │   ├── boq/page.tsx
│       │   └── seals/page.tsx
│       └── packages/page.tsx
├── (property)/
│   └── property/
│       ├── [tenancyId]/
│       │   ├── lease/page.tsx
│       │   ├── maintenance/page.tsx
│       │   ├── ledger/page.tsx
│       │   └── screening/page.tsx
│       └── portfolio/page.tsx
├── (broker)/
│   └── brokerage/
│       ├── [representationId]/
│       │   ├── listing/page.tsx
│       │   ├── buyers/page.tsx
│       │   ├── disclosures/page.tsx
│       │   └── transaction/page.tsx
│       └── representations/page.tsx
└── (admin)/
    └── office/
        └── page.tsx
```

### 4.2 — Per-Page Context Broadcast Pattern

Every micro-app page that is a Client Component (or wraps a `PageContextProvider`) calls:

```typescript
usePageContext({
  workspaceId: params.propertyId ?? params.dealId ?? params.facilityId ?? ...,
  propertyId:  params.propertyId ?? derivedPropertyId,
  capacity:    'owner_single',  // or the appropriate capacity string
});
```

Server Component pages wrap a thin `<PageContextClient>` component that is `use client` and calls `usePageContext`.

### 4.3 — Micro-App Authorization Pattern (per group)

Each micro-app route must:

1. Read `params.{contextId}` from the URL.
2. Call the appropriate server-side authorization function using the RLS-scoped Supabase client.
3. Return 404 (not 403) if not authorized — avoids leaking the existence of the resource.
4. Never pass raw user-controlled identifiers to the AI route; use the validated server-side record.

### 4.4 — Group 1: Owner Workspace API Contracts

```
GET  /api/owner/[propertyId]/vitals        → AVM, comps, zoning, violations (RLS: has_property_capacity)
GET  /api/owner/[propertyId]/maintenance   → Maintenance tickets (RLS: has_property_capacity)
POST /api/owner/[propertyId]/exposure      → Toggle exposure_policy (requires V3+ step-up, 24h cooling-off)
POST /api/owner/[propertyId]/escrow/intent → Create escrow_intent (idempotency_key required)
POST /api/owner/claim                      → Initiate property claim (V0→V3 ladder)
```

### 4.5 — Group 2: Investor Workspace API Contracts

```
GET  /api/acquisition/market/feed          → consented seeking_exit parcels (k≥5, quantized)
POST /api/acquisition/connections/request  → Connection request (quota-checked against identity cluster)
GET  /api/acquisition/deals/[dealId]       → Deal room (RLS: is_deal_member)
POST /api/acquisition/deals/[dealId]/assignment → List assignment (assignability check first)
POST /api/acquisition/escrow/intent        → Assignment escrow intent (two-phase)
```

### 4.6 — Group 3: Lender Workspace API Contracts

```
GET  /api/capital/facilities/[facilityId]  → Facility detail (RLS: is_facility_party)
POST /api/capital/facilities/[facilityId]/draws/request  → Borrower draw request (never approval)
POST /api/capital/facilities/[facilityId]/draws/review   → Lender review (dual-control enforced)
GET  /api/capital/facilities/[facilityId]/inspections    → Evidence bundles (provenance-bound)
POST /api/capital/fair-lending/analyze     → Fair lending monitor (institution's own book only)
```

### 4.7 — Group 4: Legal Workspace API Contracts

```
GET  /api/legal/matters/[matterId]         → Matter record (RLS: matter_parties)
POST /api/legal/matters/[matterId]/conflict-check → Run conflict screen
POST /api/legal/matters/[matterId]/seal    → Apply professional seal (seal_holder required; provenance-bound)
POST /api/legal/arbitration/[matterId]/initiate → Open Fast-Track Arbitration (consumer opt-out respected)
GET  /api/legal/arbitration/[matterId]/award → Retrieve staged award (undisputed + delta)
```

### 4.8 — Group 5: Contractor Workspace API Contracts

```
GET  /api/contractor/packages/[wpId]       → Work package (RLS: is_work_package_party)
POST /api/contractor/packages/[wpId]/delivery/confirm → Counter-signed PoD (nonce + geofence + device)
POST /api/contractor/packages/[wpId]/safety/stop-work → Stop-work order (never costs the caller)
POST /api/contractor/vision/upload         → Milestone photo (provenance bundle, advisory only)
GET  /api/contractor/lien-assist/[wpId]    → Lien deadline calendar (jurisdiction-aware)
```

### 4.9 — Group 6: Design Package API Contracts

```
GET  /api/design/packages/[dpId]           → Design package (RLS: is_design_package_party)
POST /api/design/packages/[dpId]/seal      → Apply seal (individual seal_holder, jurisdiction match, provenance visit required)
POST /api/design/packages/[dpId]/boq/verify → Professional BoQ verification (converts machine→professional)
POST /api/design/packages/[dpId]/rfis      → Create RFI (response clock starts)
GET  /api/design/packages/[dpId]/revision  → Current issued-for-construction revision
```

### 4.10 — Group 7: Property Management API Contracts

```
GET  /api/property/tenancies/[tenancyId]   → Tenancy record (manager or tenant parties only)
POST /api/property/screening/order         → Applicant-initiated screening report order
POST /api/property/rent/authorize          → Authorize rent pull (Reg E: discharge on authorization; I-23)
POST /api/property/maintenance/complete    → Three-key completion (contractor + tenant + manager)
POST /api/property/deposit/itemize         → Move-out itemization (statutory clock, undisputed portion auto-releases)
GET  /api/property/habitability/[ticketId] → Habitability clock (public, immutable)
```

### 4.11 — Group 9: Brokerage Workspace API Contracts

```
GET  /api/brokerage/representations/[repId]→ Representation record (agency_representations)
POST /api/brokerage/representations        → Create representation (agency disclosure generated + acknowledged first)
POST /api/brokerage/listings/[listingId]/commission → Record commission agreement (empty field; no default; no benchmark)
POST /api/brokerage/disclosures/acknowledge → Record ABA/compensation disclosure (blocks routing absent this)
GET  /api/brokerage/market/feed            → Four lawful sources only (consented, public records, own leads, inbound)
```

---

## Part VIII — Compliance & Safety Guardrails (Cross-Cutting)

### VIII.1 — Lint Rules (CI-Enforced)

The following checks must pass on every PR:

| Rule ID | What it checks |
|---|---|
| `role-group-data-access-lint` | No RLS policy body contains `current_user_role_group()` outside the literal `admin` branch |
| `billing-actor-lint` | No billing webhook handler imports or calls any function that writes to authorization tables |
| `entitlement-scope-lint` | No RLS predicate or data-fetch path is reachable via an entitlement check alone |
| `commission-benchmark-lint` | No commission/fee field has a default numeric value, placeholder with a number, or autocomplete |
| `distress-exposure-lint` | No query or export references `owner_distressed` capacity, Shield state, or internally-computed distress scores outside Group 1 + admin |
| `rent-first-lint` | Payment application ordering in `rent_trust` waterfall is `rent → fees`, never `fees → rent` |
| `settlement-only-lint` | No chain event or escrow route disburses a commission or deed-transfer proceeds |
| `dnc-lint` | No outbound telephony path executes without a current DNC scrub and a consent record |
| `agency-disclosure-lint` | No broker-side routing, referral, or instrument execution path proceeds without a committed `disclosures` row |

### VIII.2 — Deliberately-Not-Built List

The following capabilities **must not be built**, referenced in any issue, or merged in any PR:

1. Distress heatmap / Macro-Distress Map (withdrawn G2, G3, G4, G9).
2. Subscription-gated data scope widening (I-2 / G1-04, G2-09, G9-14).
3. Drag-along / holdout elimination for consumer homeowners (G1-10, G2-21).
4. Per-HELOC referral bounty (G1-06, G9-21 — RESPA §8).
5. Percentage affiliate fee on legal or settlement-service referrals (G1-06, G3-09).
6. Council member voting-behaviour prediction map (G6-04).
7. Data Room Access Escrow (G9-18 — withdrawn).
8. Smart-lock manager-initiated lockout or utility cutoff (I-22 Access Floor).
9. Advance fees for loss-mitigation services (G1-07, G4-12).
10. Self-executing arbitral awards (G4-02 — staged release only).
11. Cross-manager rent benchmarks (G7-30 — algorithmic price coordination).
12. Demand-forecasting heatmap from network-wide BoQs (G5-10/G5-11).
13. "Distress Interception" premium tier (G9-13 — withdrawn twice, now invariant).
14. Cross-brokerage commission rate aggregates or defaults (I-31, G9-08/G9-12).
15. Raw open-banking transaction stream delivered to any landlord surface (G7-05).
16. Auto-deny in housing screening (I-25 — auto-approve only; denials require human review + adverse-action notice).

### VIII.3 — Provenance Registry

Every map layer and data product must have an entry in `data_layer_registry(layer_id, source, licence, lawful_basis, permitted_use, refresh_cadence)`. A layer with no current, valid entry **does not render** — enforced at the tile service, not the client.

---

## Part IX — Key Architectural Patterns Reference

| Pattern | Location | Governing Rule |
|---|---|---|
| Two-Phase Escrow Intent | `POST /api/*/escrow/intent` | G1 §II.7.2 — durable intent before chain; idempotency key required |
| Undisputed-Baseline Release | Arbitration, delivery, deposit | G4 §II.5.7 — undisputed portion moves immediately; contested delta waits |
| Provenance Bundle | Vision uploads, PoD, seal observations | G3 §II.9.3 — nonce + device attestation + geofence + timestamp + replay detection |
| Staged Award | `POST /api/legal/arbitration/*/award` | G4 §II.5.7 — no self-execution; custodian effects release after confirmation window |
| Obligation Lock | Subscription lapse | G1 §II.8.5 — parties to active agreements retain read + export + signature rights regardless |
| Classification Firewall | Contractor dispatch | G5 §II.11 — platform publishes; contractor accepts/declines; no exclusivity; no platform schedule |
| Trust Waterfall | Rent/deposit processing | G7 §II.6 — collect → trust → owner sweep → manager fee (never deduct from corpus first) |
| Engagement Wall | Brokerage dual agency | G9 §II.4.3 — neutral + advocacy never coexist on one matter, one account, one session |

---

*End of Plan.md — proceed to `Tasks.md` for the granular execution checklist.*
