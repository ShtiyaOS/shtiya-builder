# Plan.md — Shtiya Builder Ecosystem v2.0 Technical Blueprint

**Author:** Principal Software Architect (Claude)
**Stack:** Next.js 14 (App Router) · Supabase Pro (PostgreSQL + pgvector + Realtime + Edge Functions + Storage) · Gemini Multimodal API · Tracerfy API · Web3 Escrow Smart Contracts · NYC Open Data
**Scope:** 10-App Unified Arena + 5 zero-cost "Agentic Enhancement" layers (Watchdog, Vision, Pulse, Match, Sentinel)

---

## 0. Agentic Enhancements — Cross-Cutting Layer

Per Ideation Analysis (approved), these five enhancements are **not** standalone apps. Each is a feature layer riding on infrastructure already provisioned for a parent app, at $0 incremental subscription cost. They are folded into the phases and schema below and flagged inline wherever they touch a table, route, or task.

| Enhancement | Parent App(s) | Underlying Tech Reused |
|---|---|---|
| **Watchdog** (violation/risk radar) | Shtiya Acquisition, Shtiya Property | NYC Open Data + Supabase Edge Functions (cron) + Realtime |
| **Vision** (AI site inspector) | Shtiya Contractor, Shtiya Escrow | Gemini Multimodal (video/vision) |
| **Pulse** (live deal rooms) | Shtiya Owner, Shtiya Capital | Supabase Realtime (WebSockets/Presence) |
| **Match** (semantic search/recs) | Cross-app (Acquisition, Design, Capital) | Supabase `pgvector` |
| **Sentinel** (auto-compliance bot) | Shtiya Office | Tracerfy-pattern scraping + Gemini OCR + Edge Functions cron |

---

## 1. Architecture Overview & Scaffolding Strategy

### 1.1 Monorepo / Folder Hierarchy

```text
shtiya-builder/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── callback/route.ts
│   │   ├── (apps)/
│   │   │   ├── owner/                    # Shtiya Owner
│   │   │   │   ├── page.tsx              # Block Assembly GIS Map
│   │   │   │   ├── block/[id]/page.tsx
│   │   │   │   └── pulse/                # Agentic: Pulse (live deal rooms)
│   │   │   ├── acquisition/              # Shtiya Acquisition
│   │   │   │   ├── page.tsx
│   │   │   │   ├── leads/[id]/page.tsx
│   │   │   │   └── watchdog/             # Agentic: Watchdog dashboard
│   │   │   ├── legal/                    # Shtiya Legal
│   │   │   │   ├── page.tsx
│   │   │   │   └── agreements/[id]/page.tsx
│   │   │   ├── capital/                  # Shtiya Capital
│   │   │   │   ├── page.tsx
│   │   │   │   ├── draws/[id]/page.tsx
│   │   │   │   └── pulse/                # Agentic: Pulse (live draw status)
│   │   │   ├── design/                   # Shtiya Design
│   │   │   │   ├── page.tsx
│   │   │   │   └── vault/[id]/page.tsx
│   │   │   ├── contractor/               # Shtiya Contractor
│   │   │   │   ├── page.tsx
│   │   │   │   ├── scope/new/page.tsx
│   │   │   │   └── vision/               # Agentic: Vision AI inspector
│   │   │   ├── property/                 # Shtiya Property
│   │   │   │   ├── page.tsx
│   │   │   │   ├── maintenance/[id]/page.tsx
│   │   │   │   └── watchdog/             # Agentic: Watchdog (tenant risk)
│   │   │   ├── escrow/                   # Shtiya Escrow
│   │   │   │   ├── page.tsx
│   │   │   │   └── vision/               # Agentic: Vision-gated draw release
│   │   │   ├── office/                   # Shtiya Office
│   │   │   │   ├── page.tsx
│   │   │   │   └── sentinel/             # Agentic: Sentinel compliance bot
│   │   │   └── marketing/                # Shtiya Marketing
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   ├── webhooks/
│   │   │   │   ├── gemini/route.ts
│   │   │   │   ├── tracerfy/route.ts
│   │   │   │   └── web3-escrow/route.ts
│   │   │   └── match/route.ts            # Agentic: Match semantic search API
│   │   ├── layout.tsx
│   │   └── middleware.ts
│   ├── components/
│   │   ├── shared/                       # Cross-app shell (nav, RBAC guards)
│   │   └── apps/                         # App-specific UI, mirrors (apps)/ tree
│   ├── lib/
│   │   ├── supabase/{client.ts,server.ts,middleware.ts}
│   │   ├── gemini/{ocr.ts,vision.ts}     # vision.ts = Agentic Vision
│   │   ├── tracerfy/client.ts
│   │   ├── web3/{escrow-contract.ts,abi.json}
│   │   ├── nyc-open-data/client.ts       # Agentic Watchdog data source
│   │   └── rbac/roles.ts
│   └── types/database.types.ts           # Supabase generated types
├── supabase/
│   ├── migrations/                       # SQL DDL, timestamped
│   └── functions/
│       ├── watchdog-poll/                # Agentic: cron, NYC Open Data → violations
│       ├── sentinel-verify/              # Agentic: cron, license/insurance re-check
│       └── match-embed/                  # Agentic: embed new documents on insert
├── CLAUDE.md
├── Plan.md
├── Tasks.md
└── ShtiyaBuilderEcosystem_Master_Architecture.md
```

### 1.2 Dynamic RBAC Middleware Routing

`src/app/middleware.ts` intercepts every request under `(apps)/`, reads the Supabase session, resolves `users.role`, and enforces app-level access before render.

```ts
// src/app/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

const ROLE_APP_MAP: Record<string, string[]> = {
  owner:              ['owner', 'property', 'escrow'],
  investor:           ['acquisition', 'capital', 'escrow'],
  attorney:           ['legal', 'escrow'],
  lender:             ['capital', 'escrow'],
  contractor:         ['contractor', 'design', 'escrow'],
  architect:          ['design', 'escrow'],
  property_manager:   ['property', 'escrow'],
  tenant:             ['property'],
  admin:              ['office', 'owner', 'acquisition', 'legal', 'capital',
                        'design', 'contractor', 'property', 'escrow', 'marketing'],
  marketer:           ['marketing', 'acquisition'],
};

export async function middleware(req: NextRequest) {
  const { supabase, response } = createMiddlewareClient(req);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();

  const requestedApp = req.nextUrl.pathname.split('/')[1]; // e.g. "capital"
  const allowedApps = ROLE_APP_MAP[profile?.role ?? ''] ?? [];

  if (!allowedApps.includes(requestedApp)) {
    return NextResponse.redirect(new URL('/unauthorized', req.url));
  }

  return response;
}

export const config = {
  matcher: ['/owner/:path*', '/acquisition/:path*', '/legal/:path*',
            '/capital/:path*', '/design/:path*', '/contractor/:path*',
            '/property/:path*', '/escrow/:path*', '/office/:path*',
            '/marketing/:path*'],
};
```

---

## 2. Master Database Schema & Security Policy (Supabase PostgreSQL)

### 2.1 Extensions & Enums

```sql
create extension if not exists "uuid-ossp";
create extension if not exists "vector";        -- Agentic: Match (pgvector)
create extension if not exists "pg_cron";        -- Agentic: Watchdog / Sentinel schedulers

create type user_role as enum (
  'owner', 'investor', 'attorney', 'lender', 'contractor',
  'architect', 'property_manager', 'tenant', 'admin', 'marketer'
);

create type agreement_type as enum ('psa', 'jv', 'lease', 'arbitration_clause');
create type agreement_status as enum ('draft', 'pending_signature', 'executed', 'terminated');
create type ledger_type as enum ('escrow_hold', 'tax_debt', 'material_invoice', 'draw_release', 'rent_payment');
create type ledger_status as enum ('pending', 'held', 'released', 'disputed');
create type violation_source as enum ('DOB', 'HPD', 'ECB', '311');       -- Watchdog
create type compliance_status as enum ('valid', 'expiring_soon', 'lapsed');  -- Sentinel
```

### 2.2 Core Tables

```sql
-- USERS ---------------------------------------------------------------
create table users (
  id uuid primary key default uuid_generate_v4() references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  phone text,
  role user_role not null default 'owner',
  organization_id uuid,                 -- multi-tenant boundary
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PROPERTIES ------------------------------------------------------------
create table properties (
  id uuid primary key default uuid_generate_v4(),
  bbl text unique not null,             -- NYC Borough-Block-Lot
  parcel_id text,
  address text not null,
  lat double precision,
  lng double precision,
  owner_id uuid references users(id),
  status text not null default 'active',
  metadata jsonb default '{}'::jsonb,
  embedding vector(768),                -- Agentic: Match — semantic comp search
  created_at timestamptz not null default now()
);
create index on properties using ivfflat (embedding vector_cosine_ops);

-- BLOCK COMMITTEES (Shtiya Owner) ---------------------------------------
create table block_committees (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  status text not null default 'forming', -- forming | locked | rezoning_filed
  projected_value numeric(14,2),
  target_member_count int not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table block_committee_members (
  block_committee_id uuid references block_committees(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  user_id uuid references users(id),
  signed_at timestamptz,
  status text not null default 'invited', -- invited | signed | declined
  primary key (block_committee_id, property_id)
);

-- AGREEMENTS (Shtiya Legal) ----------------------------------------------
create table agreements (
  id uuid primary key default uuid_generate_v4(),
  type agreement_type not null,
  property_id uuid references properties(id),
  parties jsonb not null default '[]'::jsonb,   -- [{user_id, role, signed_at}]
  binding_arbitration boolean not null default true,
  status agreement_status not null default 'draft',
  document_id uuid,                              -- fk added after documents table
  embedding vector(768),                          -- Agentic: Match
  created_at timestamptz not null default now()
);

-- FINANCIAL LEDGERS (Shtiya Escrow / Capital / Property) ------------------
create table financial_ledgers (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid references properties(id),
  agreement_id uuid references agreements(id),
  type ledger_type not null,
  amount numeric(14,2) not null,
  currency text not null default 'USD',
  status ledger_status not null default 'pending',
  web3_tx_hash text,                              -- on-chain escrow reference
  created_at timestamptz not null default now()
);

-- DOCUMENTS (shared bucket references) ------------------------------------
create table documents (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid references properties(id),
  uploaded_by uuid references users(id),
  type text not null,                             -- cad, photo, probate_petition, psa, w9...
  bucket_path text not null,
  embedding vector(768),                           -- Agentic: Match
  created_at timestamptz not null default now()
);

alter table agreements add constraint fk_agreements_document
  foreign key (document_id) references documents(id);

-- VIOLATIONS (Agentic: Watchdog) -------------------------------------------
create table violations (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid references properties(id) on delete cascade,
  source violation_source not null,
  external_id text not null,
  description text,
  issued_date date,
  status text default 'open',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

-- VISION INSPECTIONS (Agentic: Vision) --------------------------------------
create table vision_inspections (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references documents(id),
  property_id uuid references properties(id),
  contractor_id uuid references users(id),
  ai_summary text,
  flagged_issues jsonb default '[]'::jsonb,
  confidence numeric(4,3),
  blocks_draw boolean not null default false,
  created_at timestamptz not null default now()
);

-- DEAL ROOM EVENTS (Agentic: Pulse) -------------------------------------------
create table deal_room_events (
  id uuid primary key default uuid_generate_v4(),
  block_committee_id uuid references block_committees(id),
  financial_ledger_id uuid references financial_ledgers(id),
  event_type text not null,                        -- member_joined, bid_placed, draw_status_changed
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- COMPLIANCE CHECKS (Agentic: Sentinel) -----------------------------------------
create table compliance_checks (
  id uuid primary key default uuid_generate_v4(),
  contractor_id uuid references users(id),
  license_number text,
  insurance_policy_number text,
  expiration_date date,
  status compliance_status not null default 'valid',
  last_verified_at timestamptz default now(),
  source text default 'nyc_open_data'
);
```

### 2.3 Row-Level Security Policies

```sql
alter table users enable row level security;
alter table properties enable row level security;
alter table block_committees enable row level security;
alter table block_committee_members enable row level security;
alter table agreements enable row level security;
alter table financial_ledgers enable row level security;
alter table documents enable row level security;
alter table violations enable row level security;
alter table vision_inspections enable row level security;
alter table deal_room_events enable row level security;
alter table compliance_checks enable row level security;

-- USERS: self-read/update, admin full access
create policy "users_self_select" on users for select
  using (auth.uid() = id or exists (
    select 1 from users u where u.id = auth.uid() and u.role = 'admin'));
create policy "users_self_update" on users for update
  using (auth.uid() = id);

-- PROPERTIES: owner sees own; investors/lenders/contractors see properties
-- they hold an active agreement or ledger record against; admin sees all.
create policy "properties_owner_access" on properties for select
  using (
    owner_id = auth.uid()
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
    or exists (
      select 1 from agreements a
      where a.property_id = properties.id
        and a.parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    )
  );
create policy "properties_owner_write" on properties for update
  using (owner_id = auth.uid());

-- BLOCK COMMITTEES: visible to invited members + admin
create policy "block_committees_member_access" on block_committees for select
  using (
    exists (
      select 1 from block_committee_members m
      where m.block_committee_id = block_committees.id and m.user_id = auth.uid()
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "block_committee_members_self" on block_committee_members for select
  using (user_id = auth.uid() or exists (
    select 1 from users u where u.id = auth.uid() and u.role = 'admin'));

-- AGREEMENTS: visible only to listed parties, attorneys assigned, admin
create policy "agreements_party_access" on agreements for select
  using (
    parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or exists (select 1 from users u where u.id = auth.uid() and u.role in ('attorney','admin'))
  );

-- FINANCIAL LEDGERS: parties to the linked agreement/property, lenders, admin
create policy "ledgers_party_access" on financial_ledgers for select
  using (
    exists (
      select 1 from agreements a
      where a.id = financial_ledgers.agreement_id
        and a.parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role in ('lender','admin'))
  );

-- DOCUMENTS: uploader, property owner, admin
create policy "documents_scoped_access" on documents for select
  using (
    uploaded_by = auth.uid()
    or exists (select 1 from properties p where p.id = documents.property_id and p.owner_id = auth.uid())
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- VIOLATIONS (Watchdog): property owner + investors watching that property + admin
create policy "violations_owner_access" on violations for select
  using (
    exists (select 1 from properties p where p.id = violations.property_id and p.owner_id = auth.uid())
    or exists (select 1 from users u where u.id = auth.uid() and u.role in ('investor','admin'))
  );

-- VISION INSPECTIONS: contractor who submitted, escrow admins, property owner
create policy "vision_inspections_scoped" on vision_inspections for select
  using (
    contractor_id = auth.uid()
    or exists (select 1 from properties p where p.id = vision_inspections.property_id and p.owner_id = auth.uid())
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- DEAL ROOM EVENTS (Pulse): committee members / ledger parties only
create policy "deal_room_events_member_access" on deal_room_events for select
  using (
    exists (
      select 1 from block_committee_members m
      where m.block_committee_id = deal_room_events.block_committee_id and m.user_id = auth.uid()
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- COMPLIANCE CHECKS (Sentinel): contractor sees own record, office admin sees all
create policy "compliance_checks_scoped" on compliance_checks for select
  using (
    contractor_id = auth.uid()
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
```

---

## 3. Phased Build Strategy

### Phase 1 — Foundation & Shared Core Engine
- Scaffold Next.js 14 App Router project, `(auth)` and `(apps)` route groups.
- Provision Supabase Pro project; enable `pgvector` and `pg_cron` extensions (unlocks Match, Watchdog, Sentinel later at $0 extra cost).
- Deploy master schema (Section 2.2) and RLS policies (Section 2.3) via `supabase/migrations`.
- Implement Supabase Auth (email + OAuth), session middleware, and the RBAC `middleware.ts` router (Section 1.2).
- Build shared Shell UI: top nav, role-aware app switcher, `components/shared/`.

### Phase 2 — Ingestion, GIS & Community Engine
- **Shtiya Owner:** Interactive GIS Block Assembly Map (Mapbox/Leaflet + `properties` lat/lng), `block_committees` signup flow, JV intent agreement trigger.
  - *Agentic — Pulse:* Supabase Realtime channel on `block_committees.id` broadcasting `deal_room_events` (member joins, signature countdown) live to the map UI.
- **Shtiya Acquisition:** Probate PDF ingestion via Gemini OCR (`lib/gemini/ocr.ts`), Tracerfy skip-tracing client, municipal debt pull into `financial_ledgers`.
  - *Agentic — Watchdog:* `supabase/functions/watchdog-poll` Edge Function (pg_cron, daily) pulls NYC Open Data DOB/HPD/ECB/311 feeds, upserts into `violations` keyed on `bbl`, and pushes Realtime alerts to subscribed investors.

### Phase 3 — Legal Shield, Execution & Escrow Engine
- **Shtiya Legal:** Smart PSA/JV template generator writing to `agreements`, binding-arbitration clause toggler, e-signature capture updating `parties` jsonb.
- **Shtiya Contractor:** Voice-to-Scope estimator (Gemini audio→structured JSON), milestone photo/video upload to `documents`.
  - *Agentic — Vision:* `lib/gemini/vision.ts` analyzes uploaded milestone video/photos, writes `vision_inspections` with `flagged_issues` and `blocks_draw`.
- **Shtiya Escrow:** Web3 smart contract deploy/interaction (`lib/web3/escrow-contract.ts`), draw-release logic gated on `financial_ledgers.status`.
  - *Agentic — Vision gate:* Escrow draw-release endpoint checks `vision_inspections.blocks_draw = false` before authorizing a `web3_tx_hash` release.

### Phase 4 — Capital, Operations & Unified Arena Integration
- **Shtiya Capital:** Lender underwriting dashboard, draw approval queue against `financial_ledgers`.
  - *Agentic — Pulse:* live draw-approval status broadcast via `deal_room_events` to borrower + lender simultaneously.
- **Shtiya Design:** CAD/BIM vault (`documents` type=`cad`), BoQ generator, hand-off to Contractor scope.
  - *Agentic — Match:* `pgvector` similarity search across `documents.embedding` for "find similar floor plans / BoQs."
- **Shtiya Property:** Landlord/tenant portal, rent ledger (`financial_ledgers` type=`rent_payment`), maintenance ticket routing to Contractor.
  - *Agentic — Watchdog:* reused feed surfaces HPD violations against a landlord's own portfolio inside the Property dashboard.
- **Shtiya Office:** License/insurance/W9 auditing, bookkeeping/payroll.
  - *Agentic — Sentinel:* `supabase/functions/sentinel-verify` Edge Function (pg_cron, monthly) re-checks contractor license/insurance status against NYC Open Data + Gemini OCR re-parse of uploaded docs, writes `compliance_checks`, and flips `financial_ledgers`/Escrow gating on lapse.
- **Shtiya Marketing:** Review syndication, lead funnel builder feeding qualified leads into `acquisition`.
  - *Agentic — Match:* semantic matching of inbound lead descriptions against existing `properties.embedding` to auto-route hot leads.
- **End-to-end integration test:** full deal lifecycle — Owner block assembly → Acquisition lead → Legal PSA → Capital draw funding → Contractor milestone → Vision approval → Escrow release → Property handoff — across all RLS boundaries.
