-- =============================================================================
-- 0010_investor_connections.sql
-- Shtiya Builder — Investor ↔ Owner Connection Requests
--
-- Implements the "friend request" pattern between investor and owner roles:
--   - Investor sends a connection request to an owner (status: requested)
--   - Owner accepts or declines (status: accepted | declined)
--   - Investor may withdraw a pending request (status: withdrawn)
--   - Direct communication (deal-room access, full property data) only
--     unlocks after status = 'accepted'
--
-- Also adds a limited property discovery SELECT policy so investors can
-- browse public property fields (address, BBL) without an accepted connection
-- or an active agreement — the existing properties_owner_access policy only
-- allowed investors to see properties they already had an agreement on, which
-- made discovery impossible.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------------
create type connection_status as enum (
  'requested',   -- investor sent, owner has not acted
  'accepted',    -- owner accepted — full data + direct communication unlocked
  'declined',    -- owner declined — investor can re-request after 30 days
  'withdrawn'    -- investor cancelled before owner acted
);

-- ---------------------------------------------------------------------------
-- Table 12: INVESTOR_OWNER_CONNECTIONS
-- ---------------------------------------------------------------------------
create table investor_owner_connections (
  id           uuid primary key default gen_random_uuid(),
  investor_id  uuid not null references users(id) on delete cascade,
  owner_id     uuid not null references users(id) on delete cascade,
  status       connection_status not null default 'requested',
  message      text,                          -- optional intro message from investor
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz,                   -- set when owner accepts/declines
  unique (investor_id, owner_id)              -- one active record per pair
);

-- Index for owner inbox lookups (owner sees all incoming requests)
create index investor_connections_owner_idx on investor_owner_connections (owner_id, status);
-- Index for investor outbox lookups (investor sees all their outbound requests)
create index investor_connections_investor_idx on investor_owner_connections (investor_id, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table investor_owner_connections enable row level security;

-- Investor: sees their own outbound requests
create policy "connections_investor_select" on investor_owner_connections for select
  using (investor_id = auth.uid() or current_user_role() = 'admin');

-- Owner: sees incoming requests addressed to them
create policy "connections_owner_select" on investor_owner_connections for select
  using (owner_id = auth.uid() or current_user_role() = 'admin');

-- Investor: can create a new request (their own investor_id only)
create policy "connections_investor_insert" on investor_owner_connections for insert
  with check (
    investor_id = auth.uid()
    and current_user_role() = 'investor'
  );

-- Investor: can withdraw their own pending request
-- Owner: can accept or decline a request addressed to them
-- Each side is limited to the status transitions it owns.
create policy "connections_update" on investor_owner_connections for update
  using (
    -- investor withdrawing their own pending request
    (investor_id = auth.uid() and status = 'requested')
    -- owner resolving an incoming request
    or (owner_id = auth.uid() and status = 'requested')
    or current_user_role() = 'admin'
  )
  with check (
    -- investor may only set status to 'withdrawn'
    (investor_id = auth.uid() and status = 'withdrawn')
    -- owner may only set status to 'accepted' or 'declined'
    or (owner_id = auth.uid() and status in ('accepted', 'declined'))
    or current_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- Property discovery for investors
--
-- Before this policy, investors could only see properties they already had
-- an agreement on (properties_owner_access). That made the "Connect" button
-- unreachable — you can't send a connection request to an owner whose
-- property you can't see.
--
-- This policy exposes only public-safe fields via a limited SELECT. The
-- actual column restriction (address, BBL only — no financials, documents,
-- violations) is enforced in the API route, not here; this policy just
-- controls row-level visibility. RLS cannot restrict columns — that is
-- handled by the query's explicit SELECT list in the route handler.
-- ---------------------------------------------------------------------------
create policy "properties_investor_discovery" on properties for select
  using (current_user_role() = 'investor');
