-- =============================================================================
-- 1001_foundation_part_a.sql
-- Shtiya Builder v3.0 — Migration 0001 Part A:
-- Extensions, users, properties, and the first-wave transactional tables.
--
-- Preceded by: 1000_v3_begin.sql (drops v1 colliding tables/ENUMs)
-- Part B/C/D add the remaining foundation tables. `documents.matter_id` is
-- declared here but its FK to `matters` is added in Part D, once that table
-- exists.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ---------------------------------------------------------------------------
-- Section 2 — users
--
-- `platform_role` is constrained to the 27 canonical roles by
-- `users_role_check` below. The constraint is declared inline (rather than via
-- ALTER TABLE) so the whole statement stays idempotent under IF NOT EXISTS —
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id     uuid UNIQUE NOT NULL,
  email            text UNIQUE NOT NULL,
  full_name        text NOT NULL,
  platform_role    text NOT NULL,         -- one of the 27 roles
  org_id           uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_role_check CHECK (platform_role IN (  -- I-4
    'owner_occupant',
    'owner_investor',
    'owner_distressed',
    'tenant_market',
    'tenant_section8',
    'tenant_commercial',
    'lender_mortgage',
    'lender_bridge',
    'lender_mezzanine',
    'contractor_gc',
    'contractor_sub',
    'contractor_owner_builder',
    'architect_licensed',
    'architect_intern',
    'architect_owner_designer',
    'property_manager',
    'asset_manager',
    'facility_manager',
    'attorney_re',
    'attorney_liti',
    'attorney_corp',
    'broker_buyers',
    'broker_sellers',
    'broker_dual',
    'per_diem',
    'process_server',
    'gig_worker'
  ))
);


-- ---------------------------------------------------------------------------
-- Section 3 — properties
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS properties (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES users(id),
  address          text NOT NULL,
  borough          text,
  block            text,
  lot              text,
  co_owned         boolean GENERATED ALWAYS AS (false) STORED,  -- placeholder until multi-owner support
  status           text NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — entitlements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entitlements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id),
  feature          text NOT NULL,
  granted_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  UNIQUE (user_id, feature)
);


-- ---------------------------------------------------------------------------
-- Section 5 — agreements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agreements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id),
  agreement_type   text NOT NULL,
  status           text NOT NULL DEFAULT 'draft',
  signed_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 6 — documents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES users(id),
  property_id      uuid REFERENCES properties(id),
  matter_id        uuid,                  -- FK added after matters table exists (Part D)
  bucket           text NOT NULL,
  storage_path     text NOT NULL,
  content_type     text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 7 — financial_ledgers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS financial_ledgers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id),
  entry_type       text NOT NULL,
  amount_cents     bigint NOT NULL,
  currency         text NOT NULL DEFAULT 'USD',
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 8 — escrow_intents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS escrow_intents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id),
  initiator_id     uuid NOT NULL REFERENCES users(id),
  amount_cents     bigint NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 9 — disclosures
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS disclosures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id),
  disclosed_by     uuid NOT NULL REFERENCES users(id),
  disclosure_type  text NOT NULL,
  content          text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 10 — property_role_bindings
--
-- `prb_capacity_check` permits only the ownership, lending, and brokerage
-- capacities. Distressed ownership (`owner_distressed`) is a first-class
-- capacity here, not a status flag -- I-4
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS property_role_bindings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id),
  user_id          uuid NOT NULL REFERENCES users(id),
  capacity         text NOT NULL,
  granted_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, user_id, capacity),

  CONSTRAINT prb_capacity_check CHECK (capacity IN (
    'owner_occupant',
    'owner_investor',
    'owner_distressed',
    'lender_mortgage',
    'lender_bridge',
    'lender_mezzanine',
    'broker_buyers',
    'broker_sellers',
    'broker_dual'
  ))
);

REVOKE ALL ON property_role_bindings FROM public;


-- ---------------------------------------------------------------------------
-- Section 11 — Billing guard function & trigger
-- ---------------------------------------------------------------------------

-- I-2: no billing actor may hold an authorization-table role simultaneously
CREATE OR REPLACE FUNCTION assert_not_billing_actor()  -- I-2
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Billing actors (platform_role IN ('per_diem','process_server')) must
  -- never appear in authorization tables.  This trigger is shared across
  -- all authorization tables via separate trigger registrations.
  --
  -- `public.users` is schema-qualified because SET search_path = '' (AF-13)
  -- leaves no schema on the resolution path; an unqualified `users` would
  -- raise "relation users does not exist" on every write.
  IF (SELECT platform_role FROM public.users WHERE id = NEW.user_id)
       IN ('per_diem', 'process_server') THEN
    RAISE EXCEPTION 'billing actor % may not hold a capacity binding (I-2)', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prb_billing_guard ON property_role_bindings;
CREATE TRIGGER trg_prb_billing_guard  -- I-2
  BEFORE INSERT OR UPDATE ON property_role_bindings
  FOR EACH ROW EXECUTE FUNCTION assert_not_billing_actor();


-- ---------------------------------------------------------------------------
-- Section 12 — REVOKE for entitlements
-- ---------------------------------------------------------------------------

REVOKE ALL ON entitlements FROM public;
