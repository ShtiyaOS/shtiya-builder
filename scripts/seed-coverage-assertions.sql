-- scripts/seed-coverage-assertions.sql
-- Shtiya Builder v3.0 — Initial Coverage Assertion Seeds
--
-- Applies to: coverage_assertions table (created in migration 1056)
-- Run after: supabase db reset (Phase 0.9 scaffold)
-- Run before: Phase 2 HRAG migrations (1080+)
-- NOTE: superseded by migration 10850, which replaces coverage_assertions with
-- the ltree-backed schema. See the two notes below.
--
-- These 12 seeds declare the minimum instrument sets that must be present
-- in authority_corpus before any jurisdiction-scoped query is served.
-- The `satisfied` column starts false; it is updated by the HRAG ingestion
-- pipeline (migrations 1080+).
--
-- DO NOT run this seed against a database that has already run migration 10850
-- (which drops this stub and replaces coverage_assertions with the full
-- ltree-backed schema: subject_kind + jurisdiction_id + required_path ltree).
-- The columns below — domain, jurisdiction, instrument_set — do not exist after
-- that migration, so every statement here fails on a current database.
--
-- Idempotency: the stub coverage_assertions has no unique constraint on
-- (domain, jurisdiction, instrument_set), so ON CONFLICT has no arbiter here.
-- Each row uses a guarded INSERT ... SELECT ... WHERE NOT EXISTS instead,
-- which is re-runnable.

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'law', 'US.NY', 'CPLR'
where not exists (
  select 1 from coverage_assertions
  where domain = 'law' and jurisdiction = 'US.NY' and instrument_set = 'CPLR'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'law', 'US.NY', 'RPAPL'
where not exists (
  select 1 from coverage_assertions
  where domain = 'law' and jurisdiction = 'US.NY' and instrument_set = 'RPAPL'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'law', 'US.NY', 'RPL'
where not exists (
  select 1 from coverage_assertions
  where domain = 'law' and jurisdiction = 'US.NY' and instrument_set = 'RPL'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'law', 'US.Federal', 'UCC.Art9'
where not exists (
  select 1 from coverage_assertions
  where domain = 'law' and jurisdiction = 'US.Federal' and instrument_set = 'UCC.Art9'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'law', 'US.NY', 'NY.RealPropertyTaxLaw'
where not exists (
  select 1 from coverage_assertions
  where domain = 'law' and jurisdiction = 'US.NY' and instrument_set = 'NY.RealPropertyTaxLaw'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'law', 'US.Federal', 'FAA'
where not exists (
  select 1 from coverage_assertions
  where domain = 'law' and jurisdiction = 'US.Federal' and instrument_set = 'FAA'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'law', 'US.Federal', 'BSA'
where not exists (
  select 1 from coverage_assertions
  where domain = 'law' and jurisdiction = 'US.Federal' and instrument_set = 'BSA'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'law', 'US.Federal', 'FCRA'
where not exists (
  select 1 from coverage_assertions
  where domain = 'law' and jurisdiction = 'US.Federal' and instrument_set = 'FCRA'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'standards', '*', 'IBC.2021'
where not exists (
  select 1 from coverage_assertions
  where domain = 'standards' and jurisdiction = '*' and instrument_set = 'IBC.2021'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'investor', '*', 'FannieMae.SEL'
where not exists (
  select 1 from coverage_assertions
  where domain = 'investor' and jurisdiction = '*' and instrument_set = 'FannieMae.SEL'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'standards', '*', 'ABA.ModelRules'
where not exists (
  select 1 from coverage_assertions
  where domain = 'standards' and jurisdiction = '*' and instrument_set = 'ABA.ModelRules'
);

insert into coverage_assertions (domain, jurisdiction, instrument_set)
select 'standards', '*', 'ASTM.E2018'
where not exists (
  select 1 from coverage_assertions
  where domain = 'standards' and jurisdiction = '*' and instrument_set = 'ASTM.E2018'
);

