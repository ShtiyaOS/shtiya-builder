-- =============================================================================
-- 1000_v3_begin.sql
-- Shtiya Builder v3.0 — Clean-Break Preamble
--
-- Purpose:
--   The v1 prototype (0001_core_schema.sql – 0010_investor_connections.sql)
--   created tables and ENUMs whose names collide with the v3.0 schema.
--   This migration drops those objects so that 1001_foundation_part_a.sql
--   (and subsequent v3.0 migrations) can create them with the correct shape.
--
-- Safety:
--   - Only runs if the v1 objects actually exist (all DROPs are IF EXISTS).
--   - CASCADE removes dependent v1 policies, indexes, and triggers along with
--     the tables — v1 application code must not depend on this database state
--     after this migration runs.
--   - v1 migration FILES (0001–0010) are preserved on disk as historical record
--     and are never re-run (schema_migrations already records them as applied).
--   - v3.0 migrations begin at 1001_. The LEGACY_FILES exclusion in CI lint
--     rules already covers 0001–0010 by filename, so no lint changes are needed.
--
-- Colliding objects dropped:
--   Tables:  users, properties, agreements, financial_ledgers, documents
--   ENUMs:   user_role, agreement_type, agreement_status,
--            ledger_type, ledger_status
--   (Other v1 tables — block_committees, property_violations, etc. — do not
--    collide with v3.0 names and are left untouched.)
-- =============================================================================

-- ── Drop colliding tables (CASCADE removes dependent objects) ─────────────────

DROP TABLE IF EXISTS documents         CASCADE;
DROP TABLE IF EXISTS financial_ledgers CASCADE;
DROP TABLE IF EXISTS agreements        CASCADE;
DROP TABLE IF EXISTS properties        CASCADE;
DROP TABLE IF EXISTS users             CASCADE;

-- ── Drop colliding ENUMs ──────────────────────────────────────────────────────
-- These were created in 0001_core_schema.sql. v3.0 uses plain text with CHECK
-- constraints instead of ENUMs for most roles, so these types are not recreated.

DROP TYPE IF EXISTS ledger_status   CASCADE;
DROP TYPE IF EXISTS ledger_type     CASCADE;
DROP TYPE IF EXISTS agreement_status CASCADE;
DROP TYPE IF EXISTS agreement_type  CASCADE;
DROP TYPE IF EXISTS user_role       CASCADE;

-- ── Validation ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Assert the five colliding tables are gone
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users','properties','agreements','financial_ledgers','documents')
  ) THEN
    RAISE EXCEPTION '1000_v3_begin: colliding v1 table still exists after DROP — manual intervention required';
  END IF;

  -- Assert the five colliding ENUMs are gone
  IF EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname IN ('user_role','agreement_type','agreement_status','ledger_type','ledger_status')
  ) THEN
    RAISE EXCEPTION '1000_v3_begin: colliding v1 ENUM still exists after DROP — manual intervention required';
  END IF;
END $$;
