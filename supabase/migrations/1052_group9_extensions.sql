-- =============================================================================
-- 1052_group9_extensions.sql
-- Shtiya Builder v3.0 — Group 9 (Brokerage) extension tables.
--
-- All four tables are brokerage-scoped through agency_representations.
-- None carry a direct matter_id FK, so wall-lint will not check them.
-- I-31 enforcement anchors are in listings (no auto-populated price) and
-- commission_records (no benchmark rate, no cross-brokerage aggregation).
--
-- RLS DEFINER ACCESSOR: agency_representations has its own RLS policy
-- (agency_representations_party_read in 1007) that admits only the named
-- agent, client, and property-capacity holders — not brokerage seat holders
-- generally. A JOIN through that table from a USING clause therefore returns
-- zero rows for a principal broker querying their own brokerage's listings.
--
-- Fix (same pattern as document_matter_id() in 1021): a narrow SECURITY
-- DEFINER accessor representation_brokerage_id() bypasses the invoker-RLS
-- problem and lets the four policies gate access on broker_seats alone.
-- This accessor intentionally returns the brokerage_id for any caller who
-- knows the representation UUID; the four policies then enforce that only
-- active seat holders at that brokerage can read the downstream tables.
--
-- Builds on 1001 (users, properties), 1002 (current_app_user_id,
-- current_user_role_group), 1007 (agency_representations, broker_seats).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — listings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS listings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representation_id uuid NOT NULL REFERENCES agency_representations(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  list_price_cents  bigint CHECK (list_price_cents > 0),
  status            text NOT NULL DEFAULT 'coming_soon'
                      CHECK (status IN (
                        'coming_soon','active','under_contract',
                        'pending','sold','withdrawn','expired'
                      )),
  listed_at         timestamptz,
  -- I-31: list_price_cents entered by listing agent; never auto-populated by the platform
  -- No platform-suggested price, no benchmark derived from competing brokerages (I-31)
  created_at        timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — showings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS showings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES listings(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  scheduled_at timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'requested'
                 CHECK (status IN (
                   'requested','confirmed','completed','cancelled','no_show'
                 )),
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 3 — representation_disclosures
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS representation_disclosures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representation_id uuid NOT NULL REFERENCES agency_representations(id),
  disclosure_type   text NOT NULL
                      CHECK (disclosure_type IN (
                        'agency_disclosure','dual_agency_consent',
                        'buyer_rep_agreement','seller_net_sheet',
                        'lead_paint','property_condition',
                        'spq','tds','avid'
                      )),
  rendered_hash     text NOT NULL,
  acknowledged_by   uuid NOT NULL REFERENCES users(id),
  acknowledged_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — commission_records
-- ---------------------------------------------------------------------------

-- I-31: no benchmark rate, no platform-suggested rate, no cross-brokerage aggregation.
-- agreed_rate_bps is the negotiated rate for this specific closed transaction only.
CREATE TABLE IF NOT EXISTS commission_records (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representation_id      uuid NOT NULL REFERENCES agency_representations(id),
  listing_id             uuid REFERENCES listings(id),
  -- agreed_rate_bps: entered manually; never derived from platform data (I-31)
  agreed_rate_bps        int  CHECK (agreed_rate_bps > 0),
  total_commission_cents bigint CHECK (total_commission_cents > 0),
  co_brokerage_split_bps int,                          -- for co-op deals only
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN (
                             'pending','earned','paid','disputed','voided'
                           )),
  closed_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 5 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE listings                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE showings                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE representation_disclosures ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records         ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 6 — representation_brokerage_id() accessor
--
-- Narrow SECURITY DEFINER function that reads agency_representations.brokerage_id
-- for a given representation UUID. Running as DEFINER bypasses the RLS policy
-- on agency_representations (which only admits the named agent/client/owner),
-- allowing the four downstream policies to gate access on broker_seats alone
-- without needing to JOIN through the restricted parent table.
--
-- Same pattern as document_matter_id() in 1021.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.representation_brokerage_id(p_representation_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT brokerage_id FROM public.agency_representations WHERE id = p_representation_id;
$$;


-- ---------------------------------------------------------------------------
-- Section 7 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
--
-- All four policies gate on broker_seats.user_id via the accessor, which
-- returns the brokerage_id for any known representation UUID without
-- triggering the agency_representations RLS barrier.
-- showings uses a second accessor call through listings.representation_id.
-- ---------------------------------------------------------------------------

-- listings: any active seat holder at the representation's brokerage
DROP POLICY IF EXISTS "listings_brokerage_read" ON listings;
CREATE POLICY "listings_brokerage_read" ON listings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.broker_seats bs
      WHERE bs.brokerage_id = public.representation_brokerage_id(listings.representation_id)
        AND bs.user_id      = public.current_app_user_id()
    )
    OR public.current_user_role_group() = 'admin'
  );

-- showings: requester self-read, or any seat holder at the listing's brokerage
DROP POLICY IF EXISTS "showings_party_read" ON showings;
CREATE POLICY "showings_party_read" ON showings FOR SELECT
  USING (
    requested_by = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.listings l
      JOIN public.broker_seats bs
        ON bs.brokerage_id = public.representation_brokerage_id(l.representation_id)
      WHERE l.id          = showings.listing_id
        AND bs.user_id    = public.current_app_user_id()
    )
    OR public.current_user_role_group() = 'admin'
  );

-- representation_disclosures: acknowledger self-read, or seat holder at the brokerage
DROP POLICY IF EXISTS "representation_disclosures_party_read" ON representation_disclosures;
CREATE POLICY "representation_disclosures_party_read" ON representation_disclosures FOR SELECT
  USING (
    acknowledged_by = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.broker_seats bs
      WHERE bs.brokerage_id = public.representation_brokerage_id(
                                representation_disclosures.representation_id)
        AND bs.user_id      = public.current_app_user_id()
    )
    OR public.current_user_role_group() = 'admin'
  );

-- commission_records: seat holder at the representation's brokerage
DROP POLICY IF EXISTS "commission_records_brokerage_read" ON commission_records;
CREATE POLICY "commission_records_brokerage_read" ON commission_records FOR SELECT  -- I-31
  USING (
    EXISTS (
      SELECT 1 FROM public.broker_seats bs
      WHERE bs.brokerage_id = public.representation_brokerage_id(
                                commission_records.representation_id)
        AND bs.user_id      = public.current_app_user_id()
    )
    OR public.current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 8 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON listings                   FROM public;
REVOKE ALL ON showings                   FROM public;
REVOKE ALL ON representation_disclosures FROM public;
REVOKE ALL ON commission_records         FROM public;
