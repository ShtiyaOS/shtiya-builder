# MASTER BLUEPRINT — ALL-IN-ONE LEGAL WORKSPACE

**Document class:** Production Architecture Specification
**Supersedes:** `architecture/02_draft_blueprints/DraftBlueprint_Legal_Workspace.md`
**Version:** 2.0 (Red-Teamed / Hardened)
**Date:** 2026-08-20
**Audit mode:** Mode 1 Red Team — Vectors A1 (IOLTA/trust tampering), A2 (cross-practice privilege leakage), A3 (legal gig escrow exploitation), A4 (ethical wall bypass)
**Parent blueprint:** `MasterBlueprint_Group_4.md` v2.0 — **binding**. This document *extends* Group 4; where the two disagree, Group 4 governs unless this document explicitly supersedes a named section.
**Taxonomy scope:** `legal_transactional`, `legal_title`, `legal_expediter`, `legal_loss_mitigation`, `legal_arbitrator` (group string `neutral`), plus two new non-attorney service classes introduced here: `legal_process_server`, `legal_per_diem`
**Counterparty blueprints:** `_Group_1.md` · `_Group_2.md` · `_Group_3.md` · `_Group_5.md` · `_Group_7.md` · `_Group_9.md` · `MasterBlueprint_Agent_Factory_Platform.md`
**Stack:** Next.js 14 App Router · Supabase Postgres + RLS · Zustand Context Registry · Vercel AI SDK · $SHQL settlement rail

---

## 0. How To Read This Document

| Section | Contents |
|---|---|
| **I** | Hardened Executive Architecture — the corrected design and its invariants |
| **II** | Hardened PostgreSQL Schema & RLS Policies — migrations, security functions, guard triggers |
| **III** | API & Route Contracts — explicit 400 / 401 / 403 / 409 / 429 semantics |
| **IV** | Red Team Vulnerability Matrix & Mitigations — 34 findings across the four audit vectors |
| **V** | Compliance & Invariant Checklist — ISO 27001 · ISO 42001 · SOC 2 TSC · NYC TDPA, acceptance criteria, CI guardrails, residual risk |

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt

**Audit verdict up front.** The draft is directionally right and structurally unsafe. It is right that the matter is the primitive, that privilege must be enforced in the database, and that trust accounting belongs in the core rather than in an integration. It is unsafe in four specific ways, and all four share one root cause: **the draft records conclusions where it needs to record evidence, and states policies where it needs to state constraints.**

- `geofence_verified boolean` stores the *conclusion* of a check the client performs. The server must compute it from raw evidence, or it is a field the attacker sets.
- "No billing actor may deduct without a double-signature authorization" is a sentence in a compliance section. Group 4's actual trigger requires the second signature **only above $10,000** — which does not prohibit conversion, it specifies the increment size.
- "Firm members on `ethical_walls` are hard-blocked at the RLS database level" is true of the two tables Group 4 wrote and false of every table this draft adds, plus every retrieval index, transcript store, cache, and aggregate.
- "Funds release automatically upon provenance verification" pays for **presence at coordinates**. Service of process is not presence at coordinates. The draft makes sewer service profitable, same-day, and documented.

The reframe: the Legal Workspace's defensible product is not speed, it is **an evidentiary record a firm can survive an audit, a traverse hearing, and a bar grievance with.** Section I keeps the speed where speed is honest — attempt fees, undisputed baselines, immediate reads — and removes it from the four places where speed is what makes the output void.

---

# SECTION I — HARDENED EXECUTIVE ARCHITECTURE

## I.1 Design Thesis

Group 4 established the **matter** as the authorization primitive and closed VULN-05 with `matter_parties` + `representations` + `is_matter_party()`. That model is correct and this document does not relitigate it. What Group 4 did not have to solve — because its scope was real-estate legal work — is what happens when the same firm, the same seats, and the same Co-Pilot serve five practice areas whose data classes have *incompatible* handling rules:

| Practice | Dominant data class | Regime that governs it | What breaks if it leaks |
|---|---|---|---|
| PropTech / Closings | Transaction records, title, trust | RESPA, state escrow licensure, IOLTA | Money; recording priority |
| Personal Injury | **PHI** — medical records, bills, liens | HIPAA (as business associate of no one — see I.6), 42 CFR Part 2 for SUD records, state medical-records law | Statutory penalties; the client's medical history |
| Bankruptcy | Creditor schedules, SOFA, means test | 11 U.S.C.; §107 public filing; trustee's control of privilege | Pre-filing: the client's entire financial position, to their creditors |
| Corporate | **MNPI** — cap tables, term sheets, diligence | Securities laws; Reg FD analogues; insider-trading exposure | The platform becomes the tipping channel into its own acquisition marketplace |
| Family / Estates | Minors' data, asset division, probate | State sealing rules; guardianship | The most personally destructive disclosure class in the system |

The draft's answer to all five is one table: `legal_matter_metadata (metadata_key text, metadata_value jsonb)`. That is a single undifferentiated bag with no privilege class, no data class, no facet, and — in the draft — no RLS at all.

**The thesis of this hardening: data class is a first-class dimension, orthogonal to matter membership.** Being on the matter is necessary and never sufficient. A paralegal added to a corporate matter for calendaring must not read the cap table; a per diem attorney assigned to cover a single calendar call must not read the medical file. Group 4 already built the facet mechanism (`matter_parties.scope text[]`); the draft ignores it. Section II makes the facet mandatory and adds a class predicate above it.

## I.2 Invariants

These are testable assertions. Each maps to an acceptance criterion in §V.3 and a CI lint in §V.4.

**Trust & custody**

- **I-L1** Every trust disbursement carries a maker and a checker who are **distinct natural persons** (distinct `identity_subject_id`, not merely distinct `user_id`). There is no amount below which the second key is optional.
- **I-L2** No client's trust balance may go negative at any instant. Per-client sub-ledger solvency is a database constraint, not a report.
- **I-L3** Platform fees, subscription charges, processor fees, and chargebacks never touch trust principal, at any amount, by any path. The only debits permitted against a trust account are: client disbursement, approved settlement line, earned-fee transfer against a delivered invoice, court-ordered payment, interpleader deposit, and bar-foundation interest remittance.
- **I-L4** The trust ledger is append-only and hash-chained. Correction is by contra-entry. A row rewritten out-of-band is detectable.
- **I-L5** No external actor holds pull (debit) authority over a trust account. The platform never stores a credential capable of initiating a debit against one.
- **I-L6** Earned-fee transfer requires an invoice that has been **delivered** to the client and whose notice period has elapsed, and can never exceed that invoice's unbilled-against remainder.

**Privilege & isolation**

- **I-L7** Every matter-scoped table routes reads through `is_matter_party()`. A table added without it fails CI.
- **I-L8** Every row of practice-area data carries a `data_class`. Reading a class requires the facet **and** a class grant. Matter membership alone grants nothing above `class_general`.
- **I-L9** The privilege holder is resolved dynamically through `privilege_successions`. A Chapter 7 trustee, an executor, or a surviving entity can become the holder; a static `privilege_holder_id` cannot express this and is no longer authoritative on its own.
- **I-L10** A user holding an active MNPI designation cannot hold an active acquisition, brokerage, or capital session against any counterparty inside that designation's cluster. Enforced across Groups 2, 3, and 9 tables — not inside Group 4.
- **I-L11** Existence is a protected fact. A matter a caller cannot read is indistinguishable from a matter that does not exist, in every surface including counts, aggregates, calendars, notifications, search, and error codes.

**Ethical walls**

- **I-L12** A wall overrides every grant. There is no role, seat, entitlement, or admin branch that reads through an active wall. The service role is not an exception — see I-L14.
- **I-L13** Walls have scope: `matter`, `client`, or `cluster`. A new matter opened for a walled client inherits the wall at intake, by trigger, before the matter row is visible.
- **I-L14** Every service-role code path that touches a matter-scoped table re-asserts the wall predicate explicitly via `*_for(p_user …)` functions. Service-role usage is inventoried and lint-enforced.
- **I-L15** Erecting a wall is **retroactive to the index, not to history**: within 60 seconds, the screened user's retrieval index rows, transcript partitions, cached prompt prefixes, and provider-side context caches for that matter are purged or key-rotated, and live sessions are epoch-fenced closed. The user's *prior* access is preserved as an auditable record (`wall_prior_access`), because concealing it would defeat the screen's own disclosure purpose.

**Legal gig marketplace**

- **I-L16** Provenance gates **acceptance of a submission**. It never gates money. Release of the service fee requires a notarized affidavit and an affirmative human acceptance by counsel of record.
- **I-L17** Every capture nonce is server-issued, single-use, short-TTL, and bound to `(gig_id, user_id, device_id)`. It must appear inside the signed device-attestation payload, or the submission is rejected.
- **I-L18** `geofence_verified`, `attestation_verified`, and `timestamp_verified` are **server-computed and client-unwritable**. `REVOKE UPDATE` on those columns is part of the migration.
- **I-L19** A gig provider must hold a credential that is current, and **jurisdiction-matched to the service address**, at the moment of assignment and again at the moment of release.
- **I-L20** A per diem assignment creates a narrow, expiring, facet-scoped `matter_parties` row (`scope = {appearance}`), never a `representation`, and never a document grant beyond the named calendar item. It runs the full Group 4 conflict screen first.
- **I-L21** Gig escrow is never funded from trust principal (I-L3). It is an advanced cost from the operating account or a client-authorized advance held under its own ledger.

## I.3 The Trust Architecture — What Actually Changed

Group 4 §II.7 built licensed trust accounts, dual control above a threshold, three-way reconciliation, disputed-deposit freezes, and the short-sale approved-statement guard. Four things were missing, and each is independently sufficient to lose a firm its licence.

**1. Per-client sub-ledger solvency.** The reconciliation table carries `bank_cents`, `ledger_cents`, `file_cents` and computes a break. But nothing asserts that *each client's* balance is non-negative. Account-level solvency is satisfied while Client A's funds pay Client B's disbursement — which is the single most common disbarment fact pattern in trust accounting, and it reconciles perfectly at the account level every day. §II.2 adds `trust_client_balances` with `check (balance_cents >= 0)` and a row-locking trigger, and redefines `file_cents` as *the sum of client sub-ledger balances*, making three-way reconciliation actually three-way.

**2. The threshold was the vulnerability.** `thr bigint := 1000000` means every disbursement under $10,000 executes on one signature. The exploit is not sophisticated: forty-one transfers of $9,999. Worse, the enabling check constraint is vacuous by construction — `check (maker_id is null or checker_id is null or maker_id <> checker_id)` returns TRUE whenever `checker_id` is NULL, so the sub-threshold path has no second key *and* no constraint. §II.2 makes dual control unconditional and re-tiers the threshold to govern **escalation** (responsible-attorney approval, out-of-band confirmation, 24-hour hold) rather than existence.

**3. The second key was a `user_id`, not a person.** A solo practitioner holding two accounts satisfies `maker_id <> checker_id`. §II.1 introduces `identity_subjects` and compares verified natural persons, requires the checker's step-up authentication assertion to be **fresh** (≤ 15 minutes) and recorded, and requires the checker to have loaded the disbursement detail server-side before attesting — a checker who never saw the payee is not a control.

**4. The attack was never in the database.** The draft's "external billing actor" is a payment processor with ACH debit authority on the account. If that authority exists, every control in this document is bypassed at the bank, not at the API. §II.2 requires a **debit-block attestation** on every registered trust account, re-attested quarterly, and forbids the platform from holding any credential with debit capability against one. Processor fees and chargebacks settle against the **operating** account only — which is also the rule in most state bars, so this is a compliance requirement wearing a security hat.

**Interest.** IOLTA interest belongs to the state bar foundation, not the firm and not the client. The draft does not model it, which means it can be swept anywhere. §II.2 restricts interest remittance to payees on a `bar_foundation_payees` registry.

## I.4 Practice-Area Isolation — Typed Tables, Not a JSONB Bag

`legal_matter_metadata` is replaced. Each workbench gets typed storage with its own class, its own retention clock, and its own predicate:

```
class_general        → calendaring, docketing, status, non-substantive notes
class_financial      → trust, invoices, settlement statements
class_phi            → pi_medical_records, pi_bills, pi_liens          [HIPAA/42 CFR Pt.2 handling]
class_mnpi           → corp_cap_tables, corp_transaction_records       [restricted-list enforced]
class_insolvency     → bk_schedules, bk_sofa, bk_means_test            [pre-filing = maximum sensitivity]
class_family         → family_asset_inventories, support_calcs         [minors; sealing]
class_tdpa_regulated → smart-access / biometric evidence ingested into a matter (§V.2)
```

Two rules make this work:

- **Class grants are explicit and separate from matter membership.** `matter_class_grants (matter_id, user_id, data_class, granted_by, expires_at)`. Being counsel of record does not auto-grant `class_phi`; opening the medical file is an act with a record.
- **A class can be *sealed* rather than deleted.** Sealing satisfies retention duties while removing operational access — the pattern Group 7 §II.8 established for tenancy records, reused here for the TDPA/legal-hold collision (§V.2).

**The MNPI finding deserves its own line.** A corporate workbench holding cap tables and pending-transaction data, inside a platform that also runs an acquisition marketplace (Group 2), a capital desk (Group 3), and a brokerage (Group 9), is an information-barrier problem with securities consequences — not a privacy problem. If any firm member also holds an `investor_*` or `broker_*` capacity, the platform is the conduit between the tip and the trade. §II.3 adds `mnpi_designations` and a **restricted list** enforced as a predicate on Group 2/3/9 tables. This is a cross-group obligation and is listed in §V.6.

**Bankruptcy inverts the usual privilege direction.** Schedules are among the most sensitive documents in the system pre-filing and become public record on filing. And in a corporate Chapter 7, control of the privilege passes to the trustee (*Weintraub*). A static `privilege_holder_id` cannot express that. §II.3's `privilege_successions` makes the holder a resolvable function of time and event.

## I.5 The Legal Gig Rail — Provenance Gates Submission, Not Money

The draft's flow is: post gig with escrow → server accepts → uploads proof with GPS + attestation + nonce → **funds release automatically upon provenance verification.**

What provenance actually proves is that *a device attesting to be genuine reported coordinates near an address at a time.* What makes service of process valid is a different list entirely: that the server was **authorized** (in New York City, licensed by DCWP, bonded, and subject to contemporaneous record-keeping obligations under the Administrative Code and 6 RCNY, including GPS-enabled device and electronic-record duties); that the manner of service satisfied the applicable subdivision (CPLR 308 for individuals, 311/311-a for entities, with the affix-and-mail follow-through where relied on); that the affidavit was **sworn**; that it was **filed**; and that it survives a traverse hearing if challenged.

Presence at coordinates is consistent with valid service and equally consistent with **sewer service** — driving to the address, photographing the door, never knocking, and swearing a false affidavit. An auto-release on geofence pays for the photograph. It makes the fraud faster, cheaper, and — this is the part that ends careers — **documented in the attorney's own system, timestamped, and producible by opposing counsel at the traverse hearing.**

The hardened rail splits the payment the way Group 4 §II.5.7 split arbitral awards and Group 5 §II.6.3 split contested deliveries — undisputed portion now, contested portion held:

```
ATTEMPT FEE     small, capped, per-attempt          released on verified attempt evidence
                (max 3 attempts absent authorization) — provenance-gated, honest about
                proving only presence

SERVICE FEE     the bulk                            released on: notarized affidavit
                                                    + counsel-of-record acceptance (human act)
                                                    + provider credential current at release

TRAVERSE        reserve % held                      released at the earlier of filing-plus-window
RESERVE                                             or dismissal of a traverse challenge;
                                                    clawed back on a sustained traverse
```

The cash-flow benefit the draft wanted survives — a server gets paid the attempt fee the same day, which is more than the industry gives them today — while the platform stops certifying something it cannot observe.

**Nonce, hash, and attestation, corrected.**

- `nonce uuid UNIQUE` prevents literal value reuse and nothing else. The real replay is *the same photograph and attestation under a fresh nonce*. §II.4 makes the nonce server-issued, TTL-bounded, single-use, bound to `(gig_id, user_id, device_id)`, and **required to appear inside the signed attestation payload** — which is what actually binds an attestation to a request rather than to a device.
- `perceptual_hash text UNIQUE NOT NULL` is a global unique index on a *fuzzy* value. It has two defects at once: it **false-rejects** a legitimate second service at the same door on a different matter, and it is a **griefing primitive** — an attacker who can insert proofs pre-registers hashes to deny a competitor's submissions. §II.4 scopes uniqueness to `(gig_id)` and demotes cross-gig near-duplicates to a **review flag with human adjudication**, never an automatic rejection and never an automatic approval.
- `device_attestation jsonb NOT NULL` proves nothing unverified. §II.4 stores the raw token, verifies the signature chain server-side against Apple App Attest / Google Play Integrity roots, records verdict, key id, and verification time, and hard-fails on mock-location, emulator, debuggable build, or unrecognized root.
- `captured_at timestamptz NOT NULL` is client-supplied. Server receipt time is authoritative; client time is retained as evidence of disagreement, and a delta beyond tolerance is a review flag.

**Per diem is not a gig.** A per diem appearance is the practice of law. Assigning a stranger to a matter is a conflict-and-privilege event, not a dispatch event. I-L20 gives them the narrowest possible grant: an expiring `matter_parties` row scoped to `{appearance}`, the full Group 4 conflict screen first (a per diem attorney covering both sides of a calendar call is a live conflict that occurs routinely in practice), bar admission verified in that jurisdiction, and **no** representation edge — so `may_read_privileged()` never returns true for them.

## I.6 What This Document Does Not Claim

Stated plainly, because a compliance section that overclaims is worse than one that is silent:

- **HIPAA.** A law firm holding a client's medical records is generally not a covered entity or a business associate by virtue of that possession; the records arrive by authorization or subpoena. The platform is a service provider to the firm. It therefore inherits *contractual and state-law* obligations, not automatic HIPAA obligations — but 42 CFR Part 2 (substance-use records) travels with the record itself and re-disclosure is restricted regardless of who holds it. §II.3 treats `class_phi` at the Part 2 standard because that is the stricter rule and the one that survives being wrong about the first question. Confirmation is a §V.5 blocking item.
- **"Cryptographically enforced document classification"** (draft §2.A) is not what the design does and the phrase is withdrawn. Classification is enforced by RLS predicates and guard triggers. Cryptography appears in the hash chain (tamper *evidence*, not prevention), in attestation verification, and in at-rest encryption. Calling RLS "cryptographic" invites an auditor to ask for a key-management story that does not exist.
- **Zero-hallucination Co-Pilot behaviour** is specified in the Agent Factory blueprint and is not asserted here.

## I.7 Degraded Operation

| Failure | Behaviour |
|---|---|
| Attestation vendor unreachable | Submissions **queue as unverified**; no attempt fee releases; no rejection either. Never fail-open to "verified". |
| Reconciliation break beyond tolerance | All disbursements from that account freeze (Group 4 behaviour, retained); deposits continue; client read access unaffected. |
| Bond / E&O / licence lapse | Disbursement freeze, immediate; responsible attorney and every affected client notified. |
| Wall-purge job failing | Wall creation **blocks** rather than completing partially; the wall is not "created" until the purge acknowledges. A half-erected wall is worse than none because it is believed. |
| Notary/RON provider outage | Service fee holds; attempt fees unaffected; matter clocks are advisory-flagged, never auto-extended. |
| Billing failure on an active matter | Group 4 §II.8.5 obligation lock is inherited verbatim: pinned to free `ent.custodial`. A dunning failure never separates a client from their file or their trust reconciliation. |

---

# SECTION II — HARDENED POSTGRESQL SCHEMA & RLS POLICIES

Migrations sequence after the Group 4 set (`0027`–`0032`) and after Group 5/6/7/9 additions. Target files:

```
0060_lw_identity_and_classes.sql     identity subjects, data classes, class grants
0061_lw_trust_hardening.sql          per-client sub-ledgers, unconditional dual control,
                                     hash chain, fee transfer, interest, debit block
0062_lw_practice_workbenches.sql     typed practice tables, MNPI, privilege succession
0063_lw_gig_rail.sql                 credentials, nonces, raw-evidence proofs, staged release
0064_lw_walls_and_retrieval.sql      wall scope, inheritance, retrieval index, purge protocol
0065_lw_rls.sql                      all policies
0066_lw_grants.sql                   column-level REVOKEs and service-role inventory
```

## II.1 `0060_lw_identity_and_classes.sql`

```sql
-- ── Natural-person identity (I-L1) ────────────────────────────────────────
-- Two user rows controlled by one human satisfy `maker_id <> checker_id`.
-- Dual control has to compare PEOPLE, so people need identifiers.
create table identity_subjects (
  id                uuid primary key default gen_random_uuid(),
  verification_ref  text not null,          -- IDV vendor case reference
  verified_at       timestamptz not null,
  reverify_due      timestamptz not null,
  liveness_passed   boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table users
  add column identity_subject_id uuid references identity_subjects(id);

-- One human may hold several accounts; a control that needs two humans compares
-- subjects, never user ids.
create index users_identity_subject on users (identity_subject_id)
  where identity_subject_id is not null;

-- ── Data classes (I-L8) ───────────────────────────────────────────────────
create type data_class as enum (
  'class_general',        -- calendaring, docketing, status
  'class_financial',      -- trust, invoices, settlement statements
  'class_phi',            -- medical records / bills / liens; handled at 42 CFR Pt.2 standard
  'class_mnpi',           -- cap tables, transaction records
  'class_insolvency',     -- schedules, SOFA, means test
  'class_family',         -- asset division, support, minors
  'class_tdpa_regulated'  -- smart-access / biometric evidence ingested into a matter
);

-- Being on the matter grants class_general and nothing else.
create table matter_class_grants (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  class        data_class not null,
  granted_by   uuid not null references users(id),
  basis        text not null,
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  unique (matter_id, user_id, class)
);
create index mcg_lookup on matter_class_grants (user_id, matter_id, class)
  where revoked_at is null;

-- A grant is an act with a record. Self-granting is not a thing.
create or replace function guard_class_grant() returns trigger
language plpgsql as $$
begin
  if new.granted_by = new.user_id then
    raise exception 'I-L8: a class grant cannot be self-issued (matter %)', new.matter_id
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from matter_parties mp
     where mp.matter_id = new.matter_id and mp.user_id = new.granted_by
       and mp.role in ('counsel_of_record','escrow_holder') and mp.status = 'active') then
    raise exception 'I-L8: only counsel of record or the escrow holder may grant a class'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger matter_class_grants_guard before insert or update on matter_class_grants
  for each row execute function guard_class_grant();

-- Append-only audit of every class-grant decision (SOC 2 CC6.2 / CC6.3).
create table matter_class_grant_log (
  id         uuid primary key default gen_random_uuid(),
  grant_id   uuid not null,
  action     text not null check (action in ('granted','revoked','expired')),
  actor_id   uuid references users(id),
  at         timestamptz not null default now(),
  detail     jsonb not null default '{}'::jsonb
);
create rule mcgl_no_update as on update to matter_class_grant_log do instead nothing;
create rule mcgl_no_delete as on delete to matter_class_grant_log do instead nothing;
```

## II.2 `0061_lw_trust_hardening.sql`

```sql
-- ── The account gains the controls that live at the BANK, not the API ─────
alter table trust_accounts
  add column debit_block_attested_at   timestamptz,   -- I-L5
  add column debit_block_reattest_due  timestamptz,
  add column operating_account_ref     text,          -- fees settle HERE, never trust
  add column interest_program_payee_id uuid;          -- → bar_foundation_payees

create table bar_foundation_payees (
  id            uuid primary key default gen_random_uuid(),
  jurisdiction  text not null,
  program_name  text not null,
  payee_ref     text not null,
  verified_at   timestamptz not null,
  unique (jurisdiction, payee_ref)
);

-- ── Per-client sub-ledger solvency (I-L2) ─────────────────────────────────
-- Account-level solvency reconciles perfectly while client A's money pays
-- client B's disbursement. This is the constraint that makes that impossible.
create table trust_client_balances (
  trust_account_id uuid not null references trust_accounts(id),
  matter_id        uuid not null references matters(id) on delete cascade,
  client_id        uuid not null references users(id),
  balance_cents    bigint not null default 0 check (balance_cents >= 0),
  updated_at       timestamptz not null default now(),
  primary key (trust_account_id, matter_id, client_id)
);

alter table trust_ledger
  add column client_id            uuid references users(id),
  add column entry_kind           text,      -- see check below
  add column invoice_id           uuid,      -- → legal_invoices, for earned_fee_transfer
  add column reversal_of          uuid references trust_ledger(id),
  add column maker_auth_ref       text,      -- step-up assertion id (WebAuthn credential + challenge)
  add column checker_auth_ref     text,
  add column checker_attested_at  timestamptz,
  add column checker_saw_detail   boolean not null default false,
  add column seq                  bigint,
  add column prev_hash            text,
  add column row_hash             text;

alter table trust_ledger
  add constraint trust_entry_kind_ck check (entry_kind in (
    'client_deposit','client_disbursement','approved_settlement_line',
    'earned_fee_transfer','court_ordered_payment','interpleader_deposit',
    'interest_remittance','contra_reversal'));

-- I-L3: there is no 'platform_fee', no 'subscription', no 'processor_fee',
-- and no 'chargeback' entry kind. The enumeration IS the control.

-- ── Sub-ledger application, with row locking (I-L2) ───────────────────────
create or replace function apply_trust_balance() returns trigger
language plpgsql as $$
declare delta bigint;
begin
  if new.client_id is null then
    raise exception 'I-L2: every trust entry names a client' using errcode = '23514';
  end if;
  delta := case when new.direction = 'deposit' then new.usd_amount_cents
                else -new.usd_amount_cents end;

  insert into trust_client_balances (trust_account_id, matter_id, client_id, balance_cents)
  values (new.trust_account_id, new.matter_id, new.client_id, 0)
  on conflict do nothing;

  -- FOR UPDATE serialises concurrent disbursements against the same sub-ledger;
  -- without it two $9,999 releases race past a $10,000 balance.
  perform 1 from trust_client_balances
    where trust_account_id = new.trust_account_id
      and matter_id = new.matter_id and client_id = new.client_id
    for update;

  update trust_client_balances
     set balance_cents = balance_cents + delta, updated_at = now()
   where trust_account_id = new.trust_account_id
     and matter_id = new.matter_id and client_id = new.client_id;
  -- the check (balance_cents >= 0) raises 23514 here on overdraw. That
  -- exception IS the anti-commingling control.
  return new;
end $$;
create trigger trust_ledger_balance_apply after insert on trust_ledger
  for each row execute function apply_trust_balance();

-- ── Unconditional dual control (I-L1) ─────────────────────────────────────
-- Replaces Group 4 §III.1.5's threshold-gated guard. The threshold survives,
-- but it now governs ESCALATION, not whether a second key exists.
create or replace function guard_trust_disbursement_v2() returns trigger
language plpgsql as $$
declare
  acct           trust_accounts;
  esc_threshold  bigint := 1000000;                  -- $10,000 → escalation, not existence
  maker_subject  uuid;
  checker_subject uuid;
  window_start   timestamptz := now() - interval '24 hours';
  window_total   bigint;
begin
  if new.direction <> 'disbursement' then return new; end if;

  select * into acct from trust_accounts where id = new.trust_account_id;

  if acct.frozen_at is not null then
    raise exception 'ACCOUNT_FROZEN: %', acct.frozen_reason using errcode = '42501';
  end if;
  if acct.bond_expires_at < now() or acct.eo_expires_at < now() then
    raise exception 'ACCOUNT_FROZEN: bond or E&O lapsed' using errcode = '42501';
  end if;
  -- I-L5: no debit-block attestation, no disbursement. The control that matters
  -- lives at the bank; this asserts someone confirmed it there.
  if acct.debit_block_attested_at is null or acct.debit_block_reattest_due < now() then
    raise exception 'ACCOUNT_FROZEN: ACH debit-block attestation stale or absent'
      using errcode = '42501';
  end if;

  if new.entry_kind = 'contra_reversal' then
    if new.reversal_of is null then
      raise exception 'I-L4: a contra entry must name the row it reverses' using errcode='23514';
    end if;
  end if;

  -- Dual control, unconditionally, on natural persons.
  if new.maker_id is null or new.checker_id is null then
    raise exception 'DUAL_CONTROL_REQUIRED: maker and checker are both mandatory'
      using errcode = '42501';
  end if;
  select identity_subject_id into maker_subject   from users where id = new.maker_id;
  select identity_subject_id into checker_subject from users where id = new.checker_id;
  if maker_subject is null or checker_subject is null then
    raise exception 'DUAL_CONTROL_REQUIRED: both signers must be identity-verified'
      using errcode = '42501';
  end if;
  if maker_subject = checker_subject then
    raise exception 'DUAL_CONTROL_REQUIRED: maker and checker are the same natural person'
      using errcode = '42501';
  end if;
  -- A checker who never loaded the payee is not a control.
  if not new.checker_saw_detail
     or new.checker_auth_ref is null
     or new.checker_attested_at is null
     or new.checker_attested_at < now() - interval '15 minutes' then
    raise exception 'DUAL_CONTROL_REQUIRED: fresh step-up attestation on reviewed detail'
      using errcode = '42501';
  end if;

  -- Escalation tier: responsible attorney + out-of-band confirmation.
  if new.usd_amount_cents >= esc_threshold then
    if not exists (select 1 from firm_members fm
                    join matters m on m.firm_id = fm.firm_id
                   where m.id = new.matter_id and fm.user_id = new.checker_id
                     and fm.seat_role = 'responsible_attorney') then
      raise exception 'DUAL_CONTROL_REQUIRED: escalation tier requires responsible attorney'
        using errcode = '42501';
    end if;
  end if;

  -- Anti-structuring: rolling 24h aggregate per (matter, client) also escalates.
  select coalesce(sum(usd_amount_cents),0) into window_total
    from trust_ledger
   where matter_id = new.matter_id and client_id = new.client_id
     and direction = 'disbursement' and created_at >= window_start;
  if window_total + new.usd_amount_cents >= esc_threshold
     and not exists (select 1 from firm_members fm
                      join matters m on m.firm_id = fm.firm_id
                     where m.id = new.matter_id and fm.user_id = new.checker_id
                       and fm.seat_role = 'responsible_attorney') then
    raise exception 'DUAL_CONTROL_REQUIRED: 24h aggregate crosses escalation tier'
      using errcode = '42501';
  end if;

  if exists (select 1 from disputed_deposits d
              where d.matter_id = new.matter_id and d.released_at is null) then
    raise exception 'DEPOSIT_DISPUTED' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trust_ledger_disbursement_guard on trust_ledger;
create trigger trust_ledger_disbursement_guard_v2 before insert or update on trust_ledger
  for each row execute function guard_trust_disbursement_v2();

-- ── Earned-fee transfer (I-L6) ────────────────────────────────────────────
create table legal_invoices (
  id                  uuid primary key default gen_random_uuid(),
  matter_id           uuid not null references matters(id) on delete cascade,
  client_id           uuid not null references users(id),
  amount_cents        bigint not null check (amount_cents > 0),
  issued_at           timestamptz not null default now(),
  delivered_at        timestamptz,
  notice_period_ends_at timestamptz,
  disputed_at         timestamptz,
  voided_at           timestamptz
);

create or replace function guard_earned_fee_transfer() returns trigger
language plpgsql as $$
declare inv legal_invoices; drawn bigint;
begin
  if new.entry_kind <> 'earned_fee_transfer' then return new; end if;
  if new.invoice_id is null then
    raise exception 'I-L6: earned-fee transfer requires an invoice' using errcode='42501';
  end if;
  select * into inv from legal_invoices where id = new.invoice_id;
  if inv.matter_id <> new.matter_id or inv.client_id <> new.client_id then
    raise exception 'I-L6: invoice does not belong to this matter/client' using errcode='42501';
  end if;
  if inv.delivered_at is null or inv.notice_period_ends_at > now()
     or inv.disputed_at is not null or inv.voided_at is not null then
    raise exception 'I-L6: invoice undelivered, within notice period, disputed, or void'
      using errcode = '42501';
  end if;
  select coalesce(sum(usd_amount_cents),0) into drawn from trust_ledger
    where invoice_id = new.invoice_id and entry_kind = 'earned_fee_transfer';
  if drawn + new.usd_amount_cents > inv.amount_cents then
    raise exception 'I-L6: transfer exceeds invoice remainder' using errcode='42501';
  end if;
  if new.payee_ref is distinct from
     (select operating_account_ref from trust_accounts where id = new.trust_account_id) then
    raise exception 'I-L3: earned fees transfer only to the firm operating account'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trust_ledger_fee_guard before insert on trust_ledger
  for each row execute function guard_earned_fee_transfer();

-- ── Interest routing ──────────────────────────────────────────────────────
create or replace function guard_interest_remittance() returns trigger
language plpgsql as $$
begin
  if new.entry_kind <> 'interest_remittance' then return new; end if;
  if not exists (select 1 from bar_foundation_payees p
                  join trust_accounts a on a.interest_program_payee_id = p.id
                 where a.id = new.trust_account_id and p.payee_ref = new.payee_ref) then
    raise exception 'IOLTA interest remits only to the registered bar foundation payee'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trust_ledger_interest_guard before insert on trust_ledger
  for each row execute function guard_interest_remittance();

-- ── Append-only + hash chain (I-L4) ───────────────────────────────────────
create rule trust_ledger_no_delete as on delete to trust_ledger do instead nothing;

create or replace function seal_trust_row() returns trigger
language plpgsql as $$
declare prev record;
begin
  select seq, row_hash into prev from trust_ledger
   where trust_account_id = new.trust_account_id
   order by seq desc nulls last limit 1;
  new.seq := coalesce(prev.seq, 0) + 1;
  new.prev_hash := prev.row_hash;
  new.row_hash := encode(digest(
      coalesce(new.prev_hash,'') || new.id::text || new.trust_account_id::text ||
      new.matter_id::text || coalesce(new.client_id::text,'') || new.direction ||
      new.usd_amount_cents::text || coalesce(new.payee_ref,'') ||
      coalesce(new.entry_kind,'') || new.seq::text,
      'sha256'), 'hex');
  return new;
end $$;
create trigger trust_ledger_seal before insert on trust_ledger
  for each row execute function seal_trust_row();

-- Financial fields are immutable after write; correction is by contra entry.
create or replace function guard_trust_immutable() returns trigger
language plpgsql as $$
begin
  if (old.usd_amount_cents, old.direction, old.payee_ref, old.client_id,
      old.matter_id, old.entry_kind, old.row_hash)
     is distinct from
     (new.usd_amount_cents, new.direction, new.payee_ref, new.client_id,
      new.matter_id, new.entry_kind, new.row_hash) then
    raise exception 'I-L4: trust entries are corrected by contra entry, never edited'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trust_ledger_immutable before update on trust_ledger
  for each row execute function guard_trust_immutable();

-- Three-way reconciliation becomes actually three-way: file_cents must equal
-- the sum of the per-client sub-ledgers, not a separately-asserted number.
create or replace function assert_three_way(p_account uuid, p_as_of date)
returns bigint language sql stable as $$
  select coalesce(sum(balance_cents),0) from trust_client_balances
   where trust_account_id = p_account;
$$;
```

## II.3 `0062_lw_practice_workbenches.sql`

```sql
-- legal_matter_metadata is NOT created. The draft's untyped bag is replaced by
-- typed tables, each carrying its class and its facet. A jsonb bag cannot be
-- RLS'd by class because the class lives inside the value.

create type matter_practice as enum
  ('proptech','personal_injury','bankruptcy','corporate','family_estates');

alter table matters
  add column practice_area matter_practice,
  add column jurisdiction_county text;

-- ── Personal Injury (class_phi; handled at 42 CFR Pt.2 standard) ──────────
create table pi_medical_records (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  document_id    uuid references documents(id),
  provider_name  text,
  service_from   date, service_to date,
  class          data_class not null default 'class_phi' check (class = 'class_phi'),
  part2_restricted boolean not null default false,   -- SUD records: re-disclosure restricted
  redisclosure_notice_required boolean not null default true,
  authorization_doc_id uuid references documents(id),
  ocr_extract_id uuid,                               -- → tenant corpus, never the authority Vault
  created_at     timestamptz not null default now()
);

create table pi_liens (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id) on delete cascade,
  lienholder   text not null,
  lien_kind    text not null check (lien_kind in
                 ('medicare','medicaid','erisa','hospital','workers_comp','provider','other')),
  asserted_cents bigint,
  resolved_cents bigint,
  resolved_at  timestamptz,
  class        data_class not null default 'class_financial'
);

-- A settlement disbursement cannot execute while a lien is unresolved: paying
-- the client over a Medicare/ERISA lien creates personal liability for counsel.
create or replace function guard_pi_lien_clearance() returns trigger
language plpgsql as $$
begin
  if new.direction <> 'disbursement' or new.entry_kind <> 'client_disbursement' then
    return new;
  end if;
  if exists (select 1 from matters m where m.id = new.matter_id
              and m.practice_area = 'personal_injury')
     and exists (select 1 from pi_liens l where l.matter_id = new.matter_id
                  and l.resolved_at is null) then
    raise exception 'LIEN_UNRESOLVED: settlement disbursement blocked by an open lien'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trust_ledger_pi_lien_guard before insert on trust_ledger
  for each row execute function guard_pi_lien_clearance();

-- ── Bankruptcy (class_insolvency; pre-filing = maximum sensitivity) ───────
create table bk_schedules (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references matters(id) on delete cascade,
  chapter       text not null check (chapter in ('7','11','13')),
  schedule_code text not null,                 -- 'A/B','D','E/F','I','J','SOFA','means'
  payload       jsonb not null,
  class         data_class not null default 'class_insolvency'
                  check (class = 'class_insolvency'),
  filed_at      timestamptz,                   -- NULL ⇒ pre-filing ⇒ never disclosable
  public_after_filing boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── Corporate (class_mnpi) + the restricted list (I-L10) ──────────────────
create table corp_cap_tables (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  entity_ref  text not null,
  as_of       date not null,
  payload     jsonb not null,
  class       data_class not null default 'class_mnpi' check (class = 'class_mnpi'),
  created_at  timestamptz not null default now()
);

create table mnpi_designations (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references matters(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  subject_cluster text[] not null,      -- Group 2 §II.2.3 beneficial-owner cluster hashes
  designated_at timestamptz not null default now(),
  released_at   timestamptz,
  unique (matter_id, user_id)
);
create index mnpi_active on mnpi_designations (user_id) where released_at is null;

-- The predicate Groups 2, 3, and 9 must consume (§V.6).
create or replace function public.on_restricted_list(p_cluster text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mnpi_designations d
     where d.user_id = auth.uid() and d.released_at is null
       and d.subject_cluster && p_cluster);
$$;

-- ── Family / Estates (class_family) ──────────────────────────────────────
create table family_asset_inventories (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  payload     jsonb not null,
  involves_minor boolean not null default false,
  class       data_class not null default 'class_family' check (class = 'class_family'),
  sealed_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- ── Privilege succession (I-L9) ──────────────────────────────────────────
-- Weintraub: in a corporate Chapter 7 the trustee controls the privilege. A
-- static privilege_holder_id cannot express that, so the holder becomes a
-- resolvable function of time and event.
create table privilege_successions (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  from_holder_id uuid not null references users(id),
  to_holder_id   uuid not null references users(id),
  basis          text not null check (basis in
                   ('bk_trustee_appointment','executor_appointment','merger','assignment','court_order')),
  order_doc_id   uuid references documents(id) not null,
  effective_at   timestamptz not null,
  created_at     timestamptz not null default now()
);
create rule priv_succ_no_update as on update to privilege_successions do instead nothing;
create rule priv_succ_no_delete as on delete to privilege_successions do instead nothing;

create or replace function public.current_privilege_holder(p_matter uuid, p_original uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.to_holder_id from privilege_successions s
      where s.matter_id = p_matter and s.effective_at <= now()
      order by s.effective_at desc limit 1),
    p_original);
$$;

-- ── Adverse parties: the four new practice areas introduce counterparties
--    that do not exist in the property/deal graph, so the Group 4 conflict
--    screen cannot see them.
create table matter_adverse_parties (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  party_kind  text not null check (party_kind in
                ('individual','entity','insurer','medical_provider','creditor',
                 'trustee','government','estate')),
  display_name text not null,
  identity_cluster text[] not null default '{}',
  added_at    timestamptz not null default now()
);
create index map_cluster on matter_adverse_parties using gin (identity_cluster);
```

## II.4 `0063_lw_gig_rail.sql`

```sql
create type gig_type as enum
  ('process_server','per_diem','mobile_notary','title_abstractor','court_runner');
create type gig_state as enum
  ('draft','open','assigned','attempt_submitted','attempt_verified',
   'affidavit_submitted','accepted','service_released','reserve_released',
   'disputed','traverse_sustained','cancelled','expired');

-- ── Provider credentials (I-L19) ─────────────────────────────────────────
create table gig_provider_credentials (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  gig_type          gig_type not null,
  issuing_authority text not null,          -- e.g. 'NYC DCWP', 'NY UCS', 'NY DOS'
  jurisdiction      text not null,          -- state or municipality the licence covers
  licence_number    text not null,
  bond_ref          text,
  bond_expires_at   timestamptz,
  issued_on         date not null,
  expires_on        date not null,
  standing          text not null check (standing in ('active','suspended','revoked','expired')),
  verified_at       timestamptz not null,
  reverify_due      timestamptz not null,
  unique (user_id, gig_type, jurisdiction)
);

create or replace function public.gig_provider_eligible(
  p_user uuid, p_type gig_type, p_jurisdiction text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gig_provider_credentials c
     where c.user_id = p_user and c.gig_type = p_type
       and c.jurisdiction = p_jurisdiction         -- matched to the SERVICE address
       and c.standing = 'active'
       and c.expires_on > current_date
       and c.reverify_due > now()
       and (c.bond_expires_at is null or c.bond_expires_at > now()));
$$;

-- ── Postings ─────────────────────────────────────────────────────────────
create table legal_gig_postings (
  id                  uuid primary key default gen_random_uuid(),
  matter_id           uuid not null references matters(id) on delete cascade,
  posted_by_user_id   uuid not null references users(id),
  gig_type            gig_type not null,
  service_jurisdiction text not null,
  service_geofence    jsonb not null,       -- {lat, lng, radius_m} — radius_m <= 150
  -- Money is decomposed the way Group 4 §II.5.7 decomposed awards.
  attempt_fee_cents   bigint not null check (attempt_fee_cents > 0),
  max_attempts        int not null default 3 check (max_attempts between 1 and 6),
  service_fee_cents   bigint not null check (service_fee_cents > 0),
  reserve_bps         int not null default 1500 check (reserve_bps between 0 and 5000),
  escrow_intent_id    uuid references escrow_intents(id),
  funding_source      text not null check (funding_source in ('operating','client_advance')),
  state               gig_state not null default 'draft',
  assigned_to_user_id uuid references users(id),
  assigned_at         timestamptz,
  amounts_frozen_at   timestamptz,
  created_at          timestamptz not null default now()
);

-- I-L21: gig escrow is never funded from trust principal.
create or replace function guard_gig_funding() returns trigger
language plpgsql as $$
begin
  if new.funding_source not in ('operating','client_advance') then
    raise exception 'I-L21: gig escrow cannot draw on trust principal' using errcode='42501';
  end if;
  -- TOCTOU: amounts freeze at assignment; changing them afterwards requires
  -- re-acceptance, which is a new assignment.
  if old is not null and old.amounts_frozen_at is not null
     and (old.attempt_fee_cents, old.service_fee_cents, old.reserve_bps, old.service_geofence)
         is distinct from
         (new.attempt_fee_cents, new.service_fee_cents, new.reserve_bps, new.service_geofence) then
    raise exception 'GIG_TERMS_FROZEN: re-post to change terms after assignment'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger gig_funding_guard before insert or update on legal_gig_postings
  for each row execute function guard_gig_funding();

-- Self-dealing screen: the poster and the assignee cannot be the same natural
-- person, share an identity subject, or share a firm seat.
create or replace function guard_gig_assignment() returns trigger
language plpgsql as $$
declare poster_subject uuid; assignee_subject uuid;
begin
  if new.assigned_to_user_id is null then return new; end if;
  if not gig_provider_eligible(new.assigned_to_user_id, new.gig_type, new.service_jurisdiction) then
    raise exception 'PROVIDER_NOT_ELIGIBLE: credential absent, expired, or wrong jurisdiction'
      using errcode = '42501';
  end if;
  select identity_subject_id into poster_subject   from users where id = new.posted_by_user_id;
  select identity_subject_id into assignee_subject from users where id = new.assigned_to_user_id;
  if poster_subject is not null and poster_subject = assignee_subject then
    raise exception 'SELF_DEALING: poster and provider are the same natural person'
      using errcode = '42501';
  end if;
  if exists (select 1 from firm_members a join firm_members b on a.firm_id = b.firm_id
              where a.user_id = new.posted_by_user_id and b.user_id = new.assigned_to_user_id) then
    raise exception 'SELF_DEALING: provider shares a firm seat with the poster'
      using errcode = '42501';
  end if;
  new.amounts_frozen_at := coalesce(new.amounts_frozen_at, now());
  return new;
end $$;
create trigger gig_assignment_guard before update on legal_gig_postings
  for each row execute function guard_gig_assignment();

-- ── Server-issued capture nonces (I-L17) ─────────────────────────────────
create table gig_capture_nonces (
  nonce        uuid primary key default gen_random_uuid(),
  gig_id       uuid not null references legal_gig_postings(id) on delete cascade,
  issued_to    uuid not null references users(id),
  device_id    text not null,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  consumed_by  uuid
);
create index nonce_live on gig_capture_nonces (gig_id, issued_to)
  where consumed_at is null;

-- ── Attempts: RAW EVIDENCE, server-computed verdicts (I-L18) ─────────────
create table legal_service_attempts (
  id                 uuid primary key default gen_random_uuid(),
  gig_id             uuid not null references legal_gig_postings(id) on delete cascade,
  attempt_index      int not null,
  submitted_by       uuid not null references users(id),
  nonce              uuid not null references gig_capture_nonces(nonce),
  storage_path       text not null,
  -- raw, as reported by the device; NEVER treated as fact
  reported_lat       double precision,
  reported_lng       double precision,
  reported_accuracy_m double precision,
  client_captured_at timestamptz,
  attestation_token  text not null,          -- raw App Attest / Play Integrity token
  perceptual_hash    text not null,
  -- server-computed; client has no UPDATE grant on these (0066)
  received_at        timestamptz not null default now(),
  attestation_verified boolean,
  attestation_verdict jsonb,
  attestation_key_id text,
  geofence_verified  boolean,
  geofence_distance_m double precision,
  timestamp_skew_s   int,
  duplicate_of       uuid references legal_service_attempts(id),
  review_flags       text[] not null default '{}',
  verified_at        timestamptz,
  unique (gig_id, attempt_index),
  -- Uniqueness is scoped to the gig. A global unique on a FUZZY hash both
  -- false-rejects a legitimate second service at the same door and hands an
  -- attacker a pre-registration griefing primitive.
  unique (gig_id, perceptual_hash)
);

create or replace function guard_attempt_submission() returns trigger
language plpgsql as $$
declare n gig_capture_nonces; g legal_gig_postings;
begin
  select * into n from gig_capture_nonces where nonce = new.nonce for update;
  if n.nonce is null then
    raise exception 'NONCE_INVALID' using errcode = '42501';
  end if;
  if n.consumed_at is not null then
    raise exception 'NONCE_REPLAY: nonce already consumed' using errcode = '42501';
  end if;
  if n.expires_at < now() then
    raise exception 'NONCE_EXPIRED' using errcode = '42501';
  end if;
  if n.gig_id <> new.gig_id or n.issued_to <> new.submitted_by then
    raise exception 'NONCE_BINDING_MISMATCH: nonce is bound to another gig or user'
      using errcode = '42501';
  end if;
  select * into g from legal_gig_postings where id = new.gig_id;
  if g.assigned_to_user_id is distinct from new.submitted_by then
    raise exception 'NOT_ASSIGNED' using errcode = '42501';
  end if;
  if new.attempt_index > g.max_attempts then
    raise exception 'ATTEMPT_LIMIT_EXCEEDED' using errcode = '42501';
  end if;
  update gig_capture_nonces set consumed_at = now(), consumed_by = new.id
    where nonce = new.nonce;
  return new;
end $$;
create trigger attempt_submission_guard before insert on legal_service_attempts
  for each row execute function guard_attempt_submission();

-- ── Affidavit + acceptance: the money path (I-L16) ───────────────────────
create table legal_service_affidavits (
  id                uuid primary key default gen_random_uuid(),
  gig_id            uuid not null references legal_gig_postings(id) on delete cascade,
  attempt_id        uuid references legal_service_attempts(id),
  cplr_subdivision  text,                    -- '308(1)','308(2)','308(4)','311','311-a', …
  served_person     text,
  notary_act_ref    text not null,           -- notarial act / RON session identifier
  notary_verified_at timestamptz not null,
  document_id       uuid not null references documents(id),
  filed_with_court_at timestamptz,
  court_index_ref   text,
  accepted_by       uuid references users(id),      -- counsel of record; a HUMAN act
  accepted_at       timestamptz,
  traverse_filed_at timestamptz,
  traverse_outcome  text check (traverse_outcome in ('sustained','denied','withdrawn')),
  created_at        timestamptz not null default now()
);

-- Releases are executed by the escrow service role only. There is no
-- interactive path to money — same posture as Group 4 arb_releases.
create table gig_releases (
  id           uuid primary key default gen_random_uuid(),
  gig_id       uuid not null references legal_gig_postings(id),
  tranche      text not null check (tranche in ('attempt','service','reserve','clawback')),
  amount_cents bigint not null,
  basis        text not null,
  executed_by  text not null default 'escrow_service_role',
  executed_at  timestamptz not null default now(),
  intent_id    uuid references escrow_intents(id),
  unique (gig_id, tranche, intent_id)
);

create or replace function guard_gig_release() returns trigger
language plpgsql as $$
declare g legal_gig_postings; a legal_service_affidavits;
begin
  select * into g from legal_gig_postings where id = new.gig_id for update;

  if new.tranche = 'attempt' then
    if not exists (select 1 from legal_service_attempts t
                    where t.gig_id = new.gig_id and t.verified_at is not null
                      and t.attestation_verified and t.geofence_verified
                      and t.duplicate_of is null) then
      raise exception 'PROVENANCE_UNVERIFIED' using errcode = '42501';
    end if;

  elsif new.tranche in ('service','reserve') then
    select * into a from legal_service_affidavits where gig_id = new.gig_id
      order by created_at desc limit 1;
    if a.id is null or a.notary_verified_at is null then
      raise exception 'AFFIDAVIT_REQUIRED: notarized affidavit absent' using errcode='42501';
    end if;
    if a.accepted_by is null then
      raise exception 'ACCEPTANCE_REQUIRED: counsel of record has not accepted'
        using errcode = '42501';
    end if;
    if not is_matter_party_for(a.accepted_by, g.matter_id, 'gigs', 'counsel_of_record') then
      raise exception 'ACCEPTANCE_INVALID: acceptor is not counsel of record'
        using errcode = '42501';
    end if;
    -- I-L19 re-checked at release, not only at assignment.
    if not gig_provider_eligible(g.assigned_to_user_id, g.gig_type, g.service_jurisdiction) then
      raise exception 'PROVIDER_NOT_ELIGIBLE: credential lapsed before release'
        using errcode = '42501';
    end if;
    if new.tranche = 'reserve' then
      if a.filed_with_court_at is null then
        raise exception 'RESERVE_HELD: affidavit not filed' using errcode = '42501';
      end if;
      if a.traverse_filed_at is not null and a.traverse_outcome is null then
        raise exception 'RESERVE_HELD: traverse challenge pending' using errcode = '42501';
      end if;
      if a.traverse_outcome = 'sustained' then
        raise exception 'RESERVE_FORFEIT: traverse sustained — clawback path only'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger gig_release_guard before insert on gig_releases
  for each row execute function guard_gig_release();

-- ── Per diem: an appearance grant, never a representation (I-L20) ────────
create table per_diem_assignments (
  id             uuid primary key default gen_random_uuid(),
  gig_id         uuid not null references legal_gig_postings(id) on delete cascade,
  matter_id      uuid not null references matters(id) on delete cascade,
  attorney_id    uuid not null references users(id),
  calendar_item  text not null,
  hearing_at     timestamptz not null,
  conflict_check_id uuid not null references conflict_checks(id),
  matter_party_id uuid references matter_parties(id),
  created_at     timestamptz not null default now()
);

create or replace function guard_per_diem() returns trigger
language plpgsql as $$
declare j text;
begin
  select jurisdiction into j from matters where id = new.matter_id;
  if not exists (select 1 from bar_admissions b
                  where b.user_id = new.attorney_id and b.jurisdiction = j
                    and b.standing = 'active' and b.reverify_due > now()) then
    raise exception 'BAR_NOT_ACTIVE: per diem attorney not admitted in %', j
      using errcode = '42501';
  end if;
  if not exists (select 1 from conflict_checks c
                  where c.id = new.conflict_check_id and c.matter_id = new.matter_id
                    and c.result in ('clear','waived','screened')) then
    raise exception 'CONFLICT_HIT: per diem assignment requires a cleared screen'
      using errcode = '42501';
  end if;
  -- The grant: narrow, facet-scoped, expiring. Never a representation.
  insert into matter_parties (matter_id, user_id, role, scope, expires_at, status)
  values (new.matter_id, new.attorney_id, 'co_counsel',
          array['appearance'], new.hearing_at + interval '24 hours', 'active')
  returning id into new.matter_party_id;
  return new;
end $$;
create trigger per_diem_guard before insert on per_diem_assignments
  for each row execute function guard_per_diem();
```

## II.5 `0064_lw_walls_and_retrieval.sql`

```sql
-- ── Walls gain scope (I-L13) ─────────────────────────────────────────────
alter table ethical_walls
  add column scope_kind text not null default 'matter'
    check (scope_kind in ('matter','client','cluster')),
  add column subject_client_id uuid references users(id),
  add column subject_cluster   text[] not null default '{}',
  add column wall_epoch        bigint not null default 1,
  -- I-L15: a wall is not "created" until the purge acknowledges. A half-erected
  -- wall is worse than none, because it is believed.
  add column purge_ack_at      timestamptz;

alter table ethical_walls
  add constraint wall_scope_ck check (
    (scope_kind = 'matter'  and matter_id is not null) or
    (scope_kind = 'client'  and subject_client_id is not null) or
    (scope_kind = 'cluster' and array_length(subject_cluster,1) > 0));

-- Group 4's unique (matter_id, screened_user_id) no longer fits client/cluster
-- walls, which have no single matter.
alter table ethical_walls drop constraint if exists ethical_walls_matter_id_screened_user_id_key;
create unique index wall_matter_uniq on ethical_walls (matter_id, screened_user_id)
  where scope_kind = 'matter';

create table wall_prior_access (
  id            uuid primary key default gen_random_uuid(),
  wall_id       uuid not null references ethical_walls(id) on delete cascade,
  matter_id     uuid not null references matters(id),
  user_id       uuid not null references users(id),
  first_access  timestamptz,
  last_access   timestamptz,
  access_count  int not null default 0,
  captured_at   timestamptz not null default now()
);
-- Screening does not un-ring the bell. Concealing prior access would defeat
-- the screen's own disclosure purpose, so it is snapshotted, not deleted.

create table wall_lift_events (
  id          uuid primary key default gen_random_uuid(),
  wall_id     uuid not null references ethical_walls(id),
  lifted_by   uuid not null references users(id),
  basis       text not null,
  client_consent_doc_id uuid references documents(id),
  at          timestamptz not null default now()
);
create rule wall_lift_no_update as on update to wall_lift_events do instead nothing;
create rule wall_lift_no_delete as on delete to wall_lift_events do instead nothing;

create or replace function guard_wall_lift() returns trigger
language plpgsql as $$
begin
  if old.lifted_at is null and new.lifted_at is not null then
    if not exists (select 1 from firm_members fm
                    where fm.firm_id = new.firm_id and fm.user_id = auth.uid()
                      and fm.seat_role = 'responsible_attorney') then
      raise exception 'WALL_LIFT_UNAUTHORIZED: responsible attorney only'
        using errcode = '42501';
    end if;
    if new.screened_user_id = auth.uid() then
      raise exception 'WALL_LIFT_UNAUTHORIZED: a screened member cannot lift their own screen'
        using errcode = '42501';
    end if;
    new.wall_epoch := old.wall_epoch + 1;
  end if;
  return new;
end $$;
create trigger ethical_walls_lift_guard before update on ethical_walls
  for each row execute function guard_wall_lift();

-- New matters for a walled client or cluster inherit the wall AT INTAKE,
-- before the matter row is visible to anyone (I-L13).
create or replace function inherit_walls_on_matter_open() returns trigger
language plpgsql as $$
begin
  insert into ethical_walls (firm_id, matter_id, screened_user_id, basis, scope_kind,
                             subject_client_id, subject_cluster, purge_ack_at)
  select w.firm_id, new.id, w.screened_user_id,
         'inherited: ' || w.basis, 'matter', w.subject_client_id, w.subject_cluster, now()
    from ethical_walls w
   where w.lifted_at is null
     and w.firm_id = new.firm_id
     and (
       (w.scope_kind = 'client' and exists (
          select 1 from representations r
           where r.matter_id = new.id and r.client_id = w.subject_client_id))
       or
       (w.scope_kind = 'cluster' and exists (
          select 1 from matter_adverse_parties ap
           where ap.matter_id = new.id and ap.identity_cluster && w.subject_cluster))
     )
  on conflict do nothing;
  return new;
end $$;
create trigger matters_wall_inherit after insert on matters
  for each row execute function inherit_walls_on_matter_open();

-- ── The Co-Pilot retrieval index is matter- and wall-scoped (I-L15) ──────
-- The wall's biggest hole is not a table, it is every COPY of matter content:
-- retrieval indexes, transcripts, caches, and provider-side context caches.
create table copilot_retrieval_index (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id) on delete cascade,
  document_id  uuid references documents(id) on delete cascade,
  class        data_class not null,
  privilege_class privilege_class not null default 'none',
  chunk        text not null,
  embedding    vector(1536),
  wall_epoch   bigint not null default 1,
  created_at   timestamptz not null default now()
);
-- Partitioned per matter: partial indexes keep the ANN search PRE-filtered.
-- Post-filtering an ANN result set both leaks (through counts and latency) and
-- destroys recall.
create index cri_matter on copilot_retrieval_index (matter_id);
create index cri_vec on copilot_retrieval_index using hnsw (embedding vector_cosine_ops);

create table copilot_transcripts (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  epoch       bigint not null,
  wall_epoch  bigint not null default 1,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  cited_chunks uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- Purge protocol. Called synchronously by POST /api/legal/walls; the wall row
-- is not marked created until this returns.
create or replace function purge_walled_context(p_wall uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w ethical_walls;
begin
  select * into w from ethical_walls where id = p_wall;
  delete from copilot_transcripts
   where user_id = w.screened_user_id
     and (matter_id = w.matter_id
          or (w.scope_kind <> 'matter' and matter_id in (
               select m.id from matters m
                where m.firm_id = w.firm_id
                  and (exists (select 1 from representations r
                                where r.matter_id = m.id and r.client_id = w.subject_client_id)
                       or exists (select 1 from matter_adverse_parties ap
                                   where ap.matter_id = m.id
                                     and ap.identity_cluster && w.subject_cluster)))));
  update copilot_retrieval_index set wall_epoch = wall_epoch + 1
   where matter_id = w.matter_id;
  -- Provider-side context caches are keyed on (matter_id, wall_epoch); the
  -- bump above orphans them. Session revocation is issued by the API layer.
  update ethical_walls set purge_ack_at = now() where id = p_wall;
end $$;
```

## II.6 Security Functions

*Created at the head of `0060` (several guard triggers above depend on them); presented here together for readability.*

> **`search_path` hardening — applies to every function below.** These are written `set search_path = public` to match the Group 4 convention they extend. That convention is **insufficient**, and `MasterBlueprint_Agent_Factory_Platform.md` **AF-13** establishes the corrected standard: every `SECURITY DEFINER` function sets `search_path = ''` and fully qualifies every referenced object, because an unqualified name inside a definer function is a live privilege-escalation vector — an attacker able to create an object in a schema earlier on the path hijacks the call as the function's owner. Migration `0060` applies that standard to **every** definer function it creates *and* re-issues the Group 4 functions (`is_matter_party`, `may_read_privileged`, `bar_active`, `current_user_role`, `current_user_role_group`, `holds_neutral_appointment`) with `search_path = ''` and qualified names. The bodies below are shown in unqualified form for readability only; `definer-lint` (§V.4) fails the build on the unhardened form.

```sql
-- ── Wall predicate, scope-aware (I-L12, I-L13) ───────────────────────────
-- Group 4's is_matter_party() checks only matter-scoped walls. Client- and
-- cluster-scoped walls have no matter_id, so they were invisible to it.
create or replace function public.screened_from_matter_for(p_user uuid, p_matter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ethical_walls w
     where w.screened_user_id = p_user
       and w.lifted_at is null
       -- NOTE: purge_ack_at is deliberately NOT tested here. A wall blocks from
       -- the instant the row exists; purge_ack_at records whether the I-L15
       -- purge completed, and is checked by the API (which fails the request if
       -- it did not), never by the deny path. Testing it here would invert the
       -- control: an unacknowledged wall would fail open.
       and (
         (w.scope_kind = 'matter' and w.matter_id = p_matter)
         or (w.scope_kind = 'client' and exists (
               select 1 from representations r
                where r.matter_id = p_matter and r.client_id = w.subject_client_id))
         or (w.scope_kind = 'cluster' and exists (
               select 1 from matter_adverse_parties ap
                where ap.matter_id = p_matter and ap.identity_cluster && w.subject_cluster))
       ));
$$;

create or replace function public.screened_from_matter(p_matter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select screened_from_matter_for(auth.uid(), p_matter);
$$;

-- ── Explicit-subject variants (I-L14) ────────────────────────────────────
-- Every service-role path re-asserts the predicate through these. A route that
-- uses the service role and calls auth.uid() is asserting nothing at all —
-- auth.uid() is NULL there.
create or replace function public.is_matter_party_for(
  p_user uuid, p_matter uuid, p_facet text default null, p_role matter_role default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matter_parties mp
     where mp.matter_id = p_matter and mp.user_id = p_user
       and mp.status = 'active'
       and (mp.expires_at is null or mp.expires_at > now())
       and (p_facet is null or p_facet = any(mp.scope))
       and (p_role  is null or mp.role = p_role))
  and not screened_from_matter_for(p_user, p_matter);
$$;

-- Group 4's is_matter_party() is REDEFINED to delegate, so the scope-aware
-- wall check applies everywhere Group 4 already used it — no policy rewrites.
create or replace function public.is_matter_party(
  p_matter uuid, p_facet text default null, p_role matter_role default null)
returns boolean language sql stable security definer set search_path = public as $$
  select is_matter_party_for(auth.uid(), p_matter, p_facet, p_role);
$$;

-- ── Class predicate (I-L8) ───────────────────────────────────────────────
create or replace function public.may_read_class_for(
  p_user uuid, p_matter uuid, p_class data_class)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when not is_matter_party_for(p_user, p_matter) then false
    when p_class = 'class_general' then true
    else exists (
      select 1 from matter_class_grants g
       where g.matter_id = p_matter and g.user_id = p_user and g.class = p_class
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now()))
  end;
$$;

create or replace function public.may_read_class(p_matter uuid, p_class data_class)
returns boolean language sql stable security definer set search_path = public as $$
  select may_read_class_for(auth.uid(), p_matter, p_class);
$$;

-- ── Privilege, with succession (I-L9) ────────────────────────────────────
create or replace function public.may_read_privileged_v2(p_matter uuid, p_original uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with holder as (select current_privilege_holder(p_matter, p_original) as id)
  select (select id from holder) = auth.uid()
      or exists (select 1 from representations r, holder h
                  where r.matter_id = p_matter and r.client_id = h.id
                    and r.attorney_id = auth.uid() and r.terminated_at is null)
      or exists (select 1 from representations r
                   join firm_members fm on fm.firm_id = r.firm_id, holder h
                  where r.matter_id = p_matter and r.client_id = h.id
                    and r.terminated_at is null and fm.user_id = auth.uid())
  -- The wall overrides every branch above, including the holder's own counsel.
  and not screened_from_matter(p_matter);
$$;

-- ── Existence protection (I-L11) ─────────────────────────────────────────
-- Every count, calendar, dashboard, and notification roll-up goes through this.
-- A screened member reading "Matter #4471 — 14.2 hrs this week" on a firm
-- dashboard has learned the firm holds the matter, who is on it, and how hard
-- they are working it. That is the classic wall leak in real firms, and it is
-- never in the documents table.
create or replace function public.visible_matter_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select mp.matter_id from matter_parties mp
   where mp.user_id = auth.uid() and mp.status = 'active'
     and (mp.expires_at is null or mp.expires_at > now())
     and not screened_from_matter_for(auth.uid(), mp.matter_id);
$$;
```

## II.7 RLS Policies — `0065_lw_rls.sql`

```sql
alter table matter_class_grants        enable row level security;
alter table trust_client_balances      enable row level security;
alter table legal_invoices             enable row level security;
alter table pi_medical_records         enable row level security;
alter table pi_liens                   enable row level security;
alter table bk_schedules               enable row level security;
alter table corp_cap_tables            enable row level security;
alter table mnpi_designations          enable row level security;
alter table family_asset_inventories   enable row level security;
alter table privilege_successions      enable row level security;
alter table matter_adverse_parties     enable row level security;
alter table gig_provider_credentials   enable row level security;
alter table legal_gig_postings         enable row level security;
alter table gig_capture_nonces         enable row level security;
alter table legal_service_attempts     enable row level security;
alter table legal_service_affidavits   enable row level security;
alter table gig_releases               enable row level security;
alter table per_diem_assignments       enable row level security;
alter table ethical_walls              enable row level security;
alter table wall_prior_access          enable row level security;
alter table copilot_retrieval_index    enable row level security;
alter table copilot_transcripts        enable row level security;
alter table identity_subjects          enable row level security;

-- ── Practice-area data: facet AND class. Membership alone grants nothing. ─
create policy pi_med_read on pi_medical_records for select
  using (is_matter_party(matter_id, 'medical')
         and may_read_class(matter_id, 'class_phi'));
create policy pi_med_write on pi_medical_records for insert
  with check (is_matter_party(matter_id, 'medical', 'counsel_of_record')
              and may_read_class(matter_id, 'class_phi'));

create policy pi_lien_read on pi_liens for select
  using (is_matter_party(matter_id, 'trust')
         and may_read_class(matter_id, 'class_financial'));

-- Pre-filing schedules are the most sensitive rows in the system; post-filing
-- they are public record. The predicate has to know the difference.
create policy bk_sched_read on bk_schedules for select
  using (
    (filed_at is null
       and is_matter_party(matter_id, 'insolvency')
       and may_read_class(matter_id, 'class_insolvency'))
    or (filed_at is not null and public_after_filing
       and is_matter_party(matter_id)));

create policy corp_cap_read on corp_cap_tables for select
  using (is_matter_party(matter_id, 'corporate')
         and may_read_class(matter_id, 'class_mnpi'));

create policy family_read on family_asset_inventories for select
  using (is_matter_party(matter_id, 'family')
         and may_read_class(matter_id, 'class_family')
         and sealed_at is null);

-- ── Trust ──────────────────────────────────────────────────────────────────
create policy trust_bal_read on trust_client_balances for select
  using (client_id = auth.uid()
         or (is_matter_party(matter_id, 'trust')
             and may_read_class(matter_id, 'class_financial')));
-- The client always reads their own sub-ledger. A trust architecture the
-- client cannot audit is not a trust architecture.

create policy invoice_read on legal_invoices for select
  using (client_id = auth.uid() or is_matter_party(matter_id, 'billing'));

-- I-L1: no interactive INSERT on trust_ledger at all. Disbursements are
-- composed through POST /api/legal/trust/disbursements, which assembles the
-- maker/checker pair and writes under a constrained service identity. The
-- table's guard triggers are the second line, not the first.
drop policy if exists "trust_dual_control_insert" on trust_ledger;
create policy trust_no_interactive_insert on trust_ledger for insert with check (false);
create policy trust_read on trust_ledger for select
  using (client_id = auth.uid()
         or (is_matter_party(matter_id, 'trust')
             and may_read_class(matter_id, 'class_financial')));

-- ── MNPI / restricted list ────────────────────────────────────────────────
create policy mnpi_self_read on mnpi_designations for select
  using (user_id = auth.uid() or is_matter_party(matter_id, 'corporate'));

-- ── Gigs ───────────────────────────────────────────────────────────────────
-- A provider sees the postings they are eligible for and the ones assigned to
-- them. They never see the matter, the parties, or any document on it.
create policy gig_posting_read on legal_gig_postings for select
  using (
    assigned_to_user_id = auth.uid()
    or is_matter_party(matter_id, 'gigs')
    or (state = 'open'
        and gig_provider_eligible(auth.uid(), gig_type, service_jurisdiction)));

create policy gig_posting_insert on legal_gig_postings for insert
  with check (is_matter_party(matter_id, 'gigs', 'counsel_of_record'));

create policy nonce_own_read on gig_capture_nonces for select
  using (issued_to = auth.uid());
create policy nonce_no_interactive_insert on gig_capture_nonces for insert with check (false);
-- I-L17: nonces are SERVER-ISSUED. A client that can mint its own nonce has a
-- replay primitive, not a control.

create policy attempt_read on legal_service_attempts for select
  using (submitted_by = auth.uid()
         or exists (select 1 from legal_gig_postings g
                     where g.id = gig_id and is_matter_party(g.matter_id, 'gigs')));
create policy attempt_insert on legal_service_attempts for insert
  with check (submitted_by = auth.uid()
              and exists (select 1 from legal_gig_postings g
                           where g.id = gig_id and g.assigned_to_user_id = auth.uid()));

create policy affidavit_read on legal_service_affidavits for select
  using (exists (select 1 from legal_gig_postings g
                  where g.id = gig_id
                    and (g.assigned_to_user_id = auth.uid()
                         or is_matter_party(g.matter_id, 'gigs'))));

create policy releases_no_interactive_insert on gig_releases for insert with check (false);
-- Same posture as Group 4 arb_releases: no interactive session of any role
-- moves gig escrow. Escrow service role only, through the §III.8 contract.
create policy releases_read on gig_releases for select
  using (exists (select 1 from legal_gig_postings g
                  where g.id = gig_id
                    and (g.assigned_to_user_id = auth.uid()
                         or is_matter_party(g.matter_id, 'gigs'))));

-- ── Walls ──────────────────────────────────────────────────────────────────
-- A screened member CAN see that they are screened — that is required by the
-- screen's own disclosure purpose — but sees no matter detail through it.
create policy wall_visibility on ethical_walls for select
  using (screened_user_id = auth.uid()
         or exists (select 1 from firm_members fm
                     where fm.firm_id = ethical_walls.firm_id
                       and fm.user_id = auth.uid()
                       and fm.seat_role in ('responsible_attorney','auditor')));
create policy wall_no_self_insert on ethical_walls for insert
  with check (exists (select 1 from firm_members fm
                       where fm.firm_id = ethical_walls.firm_id
                         and fm.user_id = auth.uid()
                         and fm.seat_role = 'responsible_attorney')
              and screened_user_id <> auth.uid());

-- ── Co-Pilot copies ────────────────────────────────────────────────────────
-- The wall predicate is applied INSIDE the retrieval query, not after it. A
-- post-filtered ANN search leaks through result counts and latency, and a
-- walled matter must be indistinguishable from a nonexistent one (I-L11).
create policy cri_read on copilot_retrieval_index for select
  using (is_matter_party(matter_id)
         and may_read_class(matter_id, class)
         and (privilege_class = 'none'
              or may_read_privileged_v2(matter_id,
                   (select privilege_holder_id from documents d where d.id = document_id))));

create policy transcript_own_read on copilot_transcripts for select
  using (user_id = auth.uid() and is_matter_party(matter_id));
-- Partitioned by (matter_id, user_id). There is no cross-matter retrieval, so
-- a screened member's OTHER matters can never surface walled content.

-- ── The admin branch, corrected ────────────────────────────────────────────
-- Group 4 kept `current_user_role_group() = 'admin'` on matters/matter_parties.
-- That branch reads walled matter existence and party lists, which is precisely
-- the fact a wall exists to conceal (I-L12).
drop policy if exists "matters_party_select" on matters;
create policy matters_party_select_v2 on matters for select
  using (is_matter_party(matters.id) or break_glass_active(matters.id));

drop policy if exists "mp_self_or_matter_select" on matter_parties;
create policy mp_select_v2 on matter_parties for select
  using ((user_id = auth.uid() and not screened_from_matter(matter_id))
         or is_matter_party(matter_id)
         or break_glass_active(matter_id));

-- Break-glass is time-boxed, holder-notified, and append-only recorded. It is
-- not a role check.
create table break_glass_grants (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id),
  admin_id     uuid not null references users(id),
  basis        text not null,
  approved_by  uuid not null references users(id),
  opened_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  holder_notified_at timestamptz,
  check (approved_by <> admin_id)
);
create rule bgg_no_delete as on delete to break_glass_grants do instead nothing;

create or replace function public.break_glass_active(p_matter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from break_glass_grants b
                  where b.matter_id = p_matter and b.admin_id = auth.uid()
                    and b.expires_at > now() and b.holder_notified_at is not null);
$$;
```

## II.8 Column Grants & Service-Role Inventory — `0066_lw_grants.sql`

```sql
-- I-L18: the server-computed verdict columns are not client-writable. Storing
-- a CONCLUSION the client can set is the defect that made the draft's
-- `geofence_verified boolean` worthless.
revoke update on legal_service_attempts from authenticated;
grant update (review_flags) on legal_service_attempts to authenticated;

revoke insert, update on gig_releases     from authenticated;
revoke insert, update on trust_ledger     from authenticated;
revoke update on trust_client_balances    from authenticated;
revoke insert on gig_capture_nonces       from authenticated;
revoke all on identity_subjects           from authenticated;

-- I-L14: every service-role path is inventoried. `service_role_routes` is read
-- by CI (`servicerole-lint`); a route using the service role that is absent
-- from this table, or that does not call a *_for() predicate, fails the build.
create table service_role_routes (
  route            text primary key,
  justification    text not null,
  predicate_called text not null,          -- e.g. 'is_matter_party_for'
  reviewed_at      timestamptz not null,
  reviewed_by      text not null
);
insert into service_role_routes values
 ('/api/legal/trust/disbursements','composes maker/checker pair under constrained identity',
  'is_matter_party_for', now(), 'security-review'),
 ('/api/legal/gigs/release','escrow settlement; no interactive path exists',
  'is_matter_party_for', now(), 'security-review'),
 ('/api/legal/walls','synchronous purge across index, transcript, and cache',
  'screened_from_matter_for', now(), 'security-review');
```

---

# SECTION III — API & ROUTE CONTRACTS

## III.0 Universal Semantics

Every route in this section obeys the following. They are stated once and not repeated per route.

| Code | Meaning in this workspace | Rule |
|---|---|---|
| **400** | Malformed, or **carries a parameter the caller is not permitted to supply**. A request containing `vault_filters`, `geofence_verified`, `privilege_class` override, `maker_id`/`checker_id` self-assignment, or `party_user_id` is rejected outright rather than having the field ignored — silent ignoring makes probing invisible. |
| **401** | No session. The model is never invoked; no row is read. |
| **403** | Authenticated and denied. **The body carries a stable reason code and never a resource description.** `403 NOT_MATTER_PARTY` never says which matter, who is on it, or that it exists. |
| **404** | Reserved for genuine absence *and* for existence-protected denial (I-L11). A matter behind a wall returns **404**, identical in body, headers, and timing to a matter that was never created. `403` is used only where the caller already provably knows the resource exists (they are on the matter but lack the facet or class). |
| **409** | State conflict: a conflict-check hit, a nonce already consumed, a duplicate release, a frozen account, a pending traverse, an unresolved lien. Idempotent retries of an already-applied operation return the original result, not 409. |
| **423** | Locked: account frozen, deposit disputed, reserve held. Distinguished from 409 because 423 is expected to clear without caller action. |
| **429** | Rate limited. `Retry-After` always present. Budgets are per user **and** per firm, and separately per *sensitive operation class* (§III.9). |

Additional universal rules:

- **Timing uniformity.** Existence-protected denials pad to the p50 latency of the success path. An attacker distinguishing "no such matter" from "walled matter" by response time has defeated I-L11 without ever reading a row.
- **Identifiers only.** No route accepts prose context, filter objects, or authority strings from the client. Group 1 §II.3.4 governs and is inherited verbatim.
- **Idempotency.** Every money-moving route requires an `Idempotency-Key` header, keyed with the Group 1 `escrow_intents.idempotency_key` mechanism. Absent header → **400**.
- **Step-up.** Routes marked ⚡ require a fresh WebAuthn assertion (≤ 15 min) whose credential id is recorded on the resulting row.

## III.1 Matters & Practice Workbenches

### `POST /api/legal/matters`
```
Request   { kind, practice_area, jurisdiction, jurisdiction_county?, parties[],
            adverse_parties[] }
Guards    bar_active(jurisdiction); firm at B2+; Group 4 conflict screen runs
          against clients, adverse parties, affiliates, Group 2 beneficial-owner
          clusters AND the new matter_adverse_parties clusters BEFORE the row exists
Effect    opens the matter; `matters_wall_inherit` fires and applies any client- or
          cluster-scoped wall before the row is visible to anyone (I-L13)
Errors    400 ADVERSE_PARTIES_REQUIRED (PI/BK/corporate/family require ≥1)
          401 · 403 BAR_NOT_ACTIVE · 403 FIRM_TIER_INSUFFICIENT
          409 CONFLICT_HIT { check_id }  ← the detail is written to conflict_checks,
              NOT returned; returning it leaks the other client's identity
          429 (conflict screening is expensive and is an enumeration surface)
```

### `GET /api/legal/matters`
```
Effect    returns only visible_matter_ids(). Counts, totals, and facets are computed
          from the same function — never from a separate aggregate query (I-L11)
Errors    401 · 429
```

### `POST /api/legal/matters/:id/class-grants` ⚡
```
Request   { user_id, class, basis, expires_at }
Guards    caller is counsel_of_record or escrow_holder; caller ≠ grantee;
          grantee is an active matter party; class is valid for the practice area
Effect    grants a data class. This is an ACT with a record, not a side effect of
          adding someone to the matter (I-L8)
Errors    400 SELF_GRANT · 403 NOT_GRANTOR · 404 (existence-protected)
          409 GRANT_EXISTS · 429
```

### `GET /api/legal/matters/:id/workbench`
```
Effect    returns practice_workbench_manifest() under the caller's RLS session.
          A tab absent from the manifest is not rendered AND its route independently
          rejects direct navigation. Hiding is never the control.
          The manifest returns no counts for classes the caller cannot read — a
          "Medical Records (14)" badge on a class the caller lacks is a disclosure.
Errors    401 · 404 (existence-protected)
```

### `GET /api/legal/matters/:id/medical` · `/insolvency` · `/corporate` · `/family`
```
Guards    is_matter_party(id, <facet>) AND may_read_class(id, <class>)
Errors    401 · 403 CLASS_NOT_GRANTED (caller is on the matter; existence already known)
          404 (caller is not on the matter, or is walled)
          429
```

## III.2 Trust & IOLTA

### `POST /api/legal/trust/disbursements` ⚡
```
Request   { matter_id, client_id, entry_kind, amount_cents, payee_ref,
            invoice_id?, checker_user_id }
Headers   Idempotency-Key (required)
Guards    · caller is escrow_holder on the matter with facet 'trust'
          · caller ≠ checker as NATURAL PERSONS (identity_subject_id) — I-L1
          · checker has an independent fresh step-up assertion AND has loaded the
            disbursement detail server-side (checker_saw_detail); a checker who
            never saw the payee is not a control
          · account not frozen; bond, E&O, and DEBIT-BLOCK attestation all current
          · per-client sub-ledger stays ≥ 0 — enforced by constraint, not by a
            pre-flight read (a pre-flight read races) — I-L2
          · earned_fee_transfer: delivered, out-of-notice, undisputed invoice;
            payee = firm operating account; ≤ invoice remainder — I-L6
          · loss_mitigation: Group 4 approved-settlement-line guard still applies
          · personal_injury: no open pi_liens row
Effect    two-phase: POST creates a PENDING authorization returning `disbursement_id`;
          the checker calls POST /:id/countersign; only then does the ledger row write.
          The route writes under a constrained service identity (trust_ledger has
          `with check (false)` for interactive sessions).
Errors    400 MISSING_IDEMPOTENCY_KEY · 400 CHECKER_IS_SELF
          401
          403 DUAL_CONTROL_REQUIRED · 403 NOT_ON_APPROVED_SETTLEMENT_STATEMENT
          403 CLASS_NOT_GRANTED
          409 INSUFFICIENT_CLIENT_BALANCE  ← the anti-commingling refusal
          409 IDEMPOTENT_REPLAY (returns the original result, not an error body)
          409 LIEN_UNRESOLVED
          423 ACCOUNT_FROZEN · 423 DEPOSIT_DISPUTED
          429 (per firm; and a separate, tighter budget per matter per 24h —
              structuring shows up as burst velocity before it shows up as amount)
```

### `POST /api/legal/trust/disbursements/:id/countersign` ⚡
```
Guards    caller ≠ maker as natural persons; caller has loaded the detail in this
          session; assertion ≤ 15 min old; authorization not expired (30 min TTL)
Errors    400 · 401 · 403 SAME_NATURAL_PERSON · 403 STALE_ASSERTION
          409 ALREADY_COUNTERSIGNED · 409 AUTHORIZATION_EXPIRED · 429
```

### `GET /api/legal/trust/reconciliation`
```
Effect    three-way: bank_cents vs ledger_cents vs assert_three_way() — the SUM OF
          THE CLIENT SUB-LEDGERS, not a separately-asserted file figure. Also returns
          hash-chain continuity: any seq gap or prev_hash mismatch is reported as a
          `chain_break`, which freezes the account (I-L4)
Errors    401 · 403 · 429
```

### `POST /api/legal/trust/accounts/:id/debit-block-attestation` ⚡
```
Request   { attested_by, institution_confirmation_ref }
Effect    records the I-L5 attestation. Absent or stale ⇒ every disbursement from
          the account returns 423 ACCOUNT_FROZEN. This is the control that lives at
          the BANK; the platform can only assert that someone confirmed it there.
Errors    400 · 401 · 403 · 429
```

## III.3 The Legal Gig Rail

### `POST /api/legal/gigs`
```
Request   { matter_id, gig_type, service_jurisdiction, service_geofence,
            attempt_fee_cents, max_attempts, service_fee_cents, reserve_bps,
            funding_source }
Guards    counsel_of_record with facet 'gigs'; funding_source ∈ {operating,
          client_advance} — trust principal is not a permitted source (I-L21);
          geofence radius ≤ 150 m
Errors    400 TRUST_FUNDING_FORBIDDEN · 400 GEOFENCE_TOO_BROAD
          401 · 403 · 429
```

### `POST /api/legal/gigs/:id/assign`
```
Guards    gig_provider_eligible(provider, gig_type, SERVICE jurisdiction) — matched
          to where the service happens, not where the provider lives (I-L19);
          self-dealing screen on identity_subject_id and shared firm seat
Effect    freezes amounts and geofence (TOCTOU); for per_diem, runs the full Group 4
          conflict screen and creates the narrow {appearance} grant (I-L20)
Errors    400 · 401 · 403 PROVIDER_NOT_ELIGIBLE · 403 SELF_DEALING
          409 CONFLICT_HIT · 409 ALREADY_ASSIGNED · 429
```

### `POST /api/legal/gigs/:id/nonce`
```
Effect    issues a single-use, TTL-bounded nonce bound to (gig_id, user_id,
          device_id). The client cannot mint one — gig_capture_nonces has
          `with check (false)` for interactive sessions (I-L17)
Response  { nonce, expires_at, attestation_challenge }
          The nonce MUST be echoed inside the signed attestation payload; that echo
          is what binds an attestation to THIS request rather than to a device
Errors    401 · 403 NOT_ASSIGNED · 429 (tight — nonce minting is the replay budget)
```

### `POST /api/legal/gigs/:id/attempts`
```
Request   { nonce, storage_path, reported_lat, reported_lng, reported_accuracy_m,
            client_captured_at, attestation_token, perceptual_hash }
REJECTED  any request containing `geofence_verified`, `attestation_verified`,
          `timestamp_verified`, or `verified_at` → 400 SERVER_COMPUTED_FIELD.
          The draft's defect was storing the CONCLUSION of a check the client
          performs (I-L18)
Effect    · consumes the nonce atomically (SELECT … FOR UPDATE); a second use is
            NONCE_REPLAY, not a silent overwrite
          · verifies the attestation signature chain server-side against Apple /
            Google roots; hard-fails on mock location, emulator, debuggable build,
            rooted device, or unrecognised root
          · computes geofence_distance_m against the FROZEN geofence
          · computes timestamp_skew_s against server receipt time; client time is
            evidence of disagreement, never authority
          · near-duplicate perceptual match against other gigs raises a REVIEW FLAG
            with human adjudication — never an automatic reject (griefing) and never
            an automatic approve
Errors    400 SERVER_COMPUTED_FIELD · 400 MALFORMED_ATTESTATION
          401
          403 NOT_ASSIGNED · 403 ATTESTATION_FAILED · 403 DEVICE_INTEGRITY_FAILED
          409 NONCE_REPLAY · 409 NONCE_EXPIRED · 409 NONCE_BINDING_MISMATCH
          409 ATTEMPT_LIMIT_EXCEEDED
          429 (per provider per gig; and a global per-provider budget — a provider
              submitting 40 attempts an hour across 30 gigs is the sewer-service
              signature)
```

### `POST /api/legal/gigs/:id/affidavit`
```
Request   { attempt_id, cplr_subdivision, served_person, notary_act_ref,
            document_id }
Guards    notary act verified against the notarial/RON provider's record;
          cplr_subdivision valid for the party kind served
Effect    creates the affidavit. MOVES NO MONEY.
Errors    400 · 401 · 403 · 409 NOTARY_ACT_UNVERIFIED · 429
```

### `POST /api/legal/gigs/:id/accept` ⚡
```
Guards    caller is counsel_of_record on the matter with facet 'gigs'
Effect    THE HUMAN ACT. Provenance never releases the service fee; counsel does
          (I-L16). Records `accepted_by`/`accepted_at`.
Errors    401 · 403 NOT_COUNSEL_OF_RECORD · 404 · 409 AFFIDAVIT_REQUIRED · 429
```

### `POST /api/legal/gigs/:id/release`
```
Guards    ESCROW SERVICE ROLE ONLY. No interactive session of any role — attorney,
          provider, admin — can call this. `gig_releases` is `with check (false)`
          for `authenticated`.
Tranches  attempt  → verified attempt evidence
          service  → notarized affidavit + counsel acceptance + credential current
                     at release (re-checked, not trusted from assignment time)
          reserve  → affidavit filed AND (no traverse filed OR traverse denied/
                     withdrawn) AND the filing window elapsed
          clawback → traverse sustained
Errors    403 SERVICE_ROLE_ONLY
          409 PROVENANCE_UNVERIFIED · 409 AFFIDAVIT_REQUIRED · 409 ACCEPTANCE_REQUIRED
          409 DUPLICATE_RELEASE (unique on (gig_id, tranche, intent_id))
          423 RESERVE_HELD · 423 TRAVERSE_PENDING
```

## III.4 Ethical Walls

### `POST /api/legal/walls` ⚡
```
Request   { firm_id, scope_kind: 'matter'|'client'|'cluster',
            matter_id? | subject_client_id? | subject_cluster?,
            screened_user_id, basis }
Guards    caller is responsible_attorney on the firm; caller ≠ screened user
Effect    SYNCHRONOUS, and it is not "created" until every step returns (I-L15):
          1. snapshot wall_prior_access from the access log — screening does not
             un-ring the bell, and concealing prior access would defeat the screen's
             own disclosure purpose
          2. insert the wall row with purge_ack_at = NULL. The wall blocks from
             this instant — screened_from_matter_for() does not test purge_ack_at,
             so a purge that never completes leaves the member blocked, not free
          3. purge_walled_context(): delete transcripts, bump wall_epoch on the
             retrieval index, orphan provider-side context caches
          4. revoke live sessions for the screened user on affected matters
             (epoch bump; the stream is fenced client-side and killed server-side)
          5. set purge_ack_at
          A failure at any step leaves the wall BLOCKING and the request 500s.
          A half-erected wall is worse than none, because it is believed.
Errors    400 SELF_SCREEN · 401 · 403 NOT_RESPONSIBLE_ATTORNEY
          409 WALL_EXISTS · 429
```

### `POST /api/legal/walls/:id/lift` ⚡
```
Guards    responsible attorney; not the screened user; documented basis; client
          consent document where the jurisdiction requires it
Effect    append-only wall_lift_events; wall_epoch increments. Lifting never
          retroactively grants access to the screened period — technically
          irrelevant, evidentially essential.
Errors    401 · 403 WALL_LIFT_UNAUTHORIZED · 409 ALREADY_LIFTED · 429
```

## III.5 Co-Pilot (Legal Workspace context)

### `POST /api/copilot` *(Legal Workspace binding)*
```
Request   { firmId, matterId, matterRole, classesRequested[], epoch, messages }
          Identifiers only. Never prose, never filters, never a capacity string.
          Group 1 §II.3.4 governs and is inherited verbatim.
Guards    · is_matter_party(matterId) → else 404 WITHOUT INVOKING THE MODEL
          · screened_from_matter(matterId) → 404, indistinguishable from absent
          · every requested class re-checked via may_read_class(); an ungranted
            class is dropped from retrieval silently AND reported in the response
            envelope as `classes_withheld` so the user knows the answer is partial
          · NO CROSS-MATTER RETRIEVAL, EVER. Transcripts partition on
            (matter_id, user_id); retrieval partitions on matter_id
          · privileged chunks require may_read_privileged_v2() on the SAME query,
            not a post-filter
          · non-lawyer account classes: legal advice and instrument generation
            hard-blocked server-side by account class (Group 4 §II.11.2), not by
            prompt instruction
          · wall_epoch is part of the prompt-cache key; a wall bump orphans every
            cached prefix for that matter
Response  carries the request's `epoch` for client-side fencing; a stream whose
          epoch ≠ current is discarded client-side and cancelled server-side
Errors    400 PROSE_CONTEXT_FORBIDDEN (a `context` string in the body is rejected,
              not ignored — this is the live defect in src/app/api/copilot/route.ts)
          401 · 404 (existence-protected) · 429 (per user and per firm)
```

## III.6 Procurement

### `GET /api/legal/procurement/catalog`
```
Effect    returns the affiliate/dropship catalog. Two hard rules the draft omitted:
          · the catalog is NEVER personalised from matter data. A scanner
            recommendation derived from "this firm handles bankruptcy" leaks
            practice composition to an affiliate network
          · affiliate identifiers are attached server-side at click-out; no matter,
            firm, or client identifier is ever placed in an outbound affiliate URL
Errors    401 · 429
```

## III.7 Rate-Limit Budgets (the 429 surface)

| Class | Budget | Why |
|---|---|---|
| Conflict screening | 20 / firm / hour | Enumeration surface: repeated screens against guessed names map the firm's client list |
| Matter creation | 50 / firm / day | Conflict-screen amplification |
| Nonce minting | 10 / provider / gig / hour | The replay budget |
| Attempt submission | 3 / gig, 60 / provider / day | Sewer-service velocity signature |
| Trust disbursement | 25 / firm / day, 5 / matter / 24h | Structuring shows up as burst velocity before it shows up as amount |
| Co-Pilot | 120 / user / hour, 2000 / firm / day | Retrieval-exfiltration budget |
| Class grants | 30 / matter / day | Grant-spray detection |
| Failed 403/404 on matter routes | 30 / user / hour → then 429 for 15 min | Existence probing |

The last row matters most: I-L11 is defeated by *volume* even when each individual response is uniform. A caller generating 400 existence-protected 404s in ten minutes is enumerating, and the response to enumeration is a budget, not a better error code.

---

# SECTION IV — RED TEAM VULNERABILITY MATRIX & MITIGATIONS

34 findings. Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt.
"Where" cites the draft or the inherited Group 4 artifact that carries the defect.

## IV.1 Vector A1 — IOLTA / Trust Ledger Tampering

| ID | Sev | Where | Finding | Exploit path | Mitigation |
|---|---|---|---|---|---|
| **LW-01** | 🔴 | G4 `guard_trust_disbursement()` `thr := 1000000` | Dual control exists **only above $10,000**. Below it, one actor disburses. | Attorney with `escrow_holder` runs 41 × $9,999 = $409,959 in a week. Every row passes every check. | §II.2 `guard_trust_disbursement_v2()`: dual control **unconditional**; threshold re-tiered to escalation (responsible attorney + out-of-band). Rolling 24h aggregate per (matter, client) also escalates — I-L1. |
| **LW-02** | 🔴 | G4 `check (maker_id is null or checker_id is null or maker_id <> checker_id)` | The constraint is **vacuous when `checker_id` is NULL** — the sub-threshold path has no second key *and* no constraint. | Insert with `checker_id = null`. Constraint returns TRUE. | Checker is `NOT NULL` for all disbursements; the guard raises before the constraint is reached. |
| **LW-03** | 🔴 | Draft §5, G4 `trust_ledger` | "Double-signature" compares `user_id`, not **people**. | Solo practitioner registers a second account (or a compromised paralegal seat) and satisfies `maker_id <> checker_id` alone. | `identity_subjects`; the guard compares `identity_subject_id`. Both signers must be IDV-verified with liveness — I-L1. |
| **LW-04** | 🔴 | absent from draft and G4 | **No per-client sub-ledger constraint.** Account-level solvency is satisfied while Client A's funds pay Client B's disbursement. | The classic conversion: "borrowing from Peter." It reconciles perfectly at the account level every single day. | `trust_client_balances` with `check (balance_cents >= 0)` and a `FOR UPDATE` row-locking trigger. Overdraw raises `23514` → `409 INSUFFICIENT_CLIENT_BALANCE` — I-L2. |
| **LW-05** | 🔴 | Draft §5 "no billing actor … may deduct" | The **external billing actor is outside the database.** A processor holding ACH debit authority on the trust account bypasses every control here, at the bank. | LawPay-class processor with debit rights; or a compromised platform credential with pull capability. No API call is made; no ledger row appears. | I-L5: `debit_block_attested_at` mandatory and re-attested quarterly; absent/stale ⇒ `423 ACCOUNT_FROZEN`. Platform never holds a debit-capable credential on a trust account. Processor fees and chargebacks settle against `operating_account_ref` only. |
| **LW-06** | 🔴 | absent | **Earned-fee transfer is unmodelled**, so the legitimate trust→operating path is unconstrained. | Fabricate `time_billing` rows → generate invoice → transfer. Or transfer with no invoice at all, since nothing requires one. | `legal_invoices` + `guard_earned_fee_transfer()`: delivered, notice period elapsed, undisputed, ≤ remainder, payee = operating account — I-L6. |
| **LW-07** | 🟠 | G4 `trust_ledger` | **No append-only rule and no tamper evidence.** `conflict_checks` got `no_update`/`no_delete` rules; the ledger did not. | Any UPDATE-capable path (a mis-scoped policy, a service-role route, a compromised migration role) rewrites history with no residue. | `trust_ledger_no_delete` rule; `guard_trust_immutable()`; per-account SHA-256 hash chain (`seq`, `prev_hash`, `row_hash`); reconciliation reports `chain_break` and freezes — I-L4. |
| **LW-08** | 🟠 | absent | **IOLTA interest is unrouted.** | Interest sweeps to a firm-controlled account. | `bar_foundation_payees` + `guard_interest_remittance()`. |
| **LW-09** | 🟠 | G4 `matter_parties` (no INSERT policy shown) | **Self-appointment as `escrow_holder`.** If any matter party can add parties, an attorney grants themselves the trust facet. | Insert `matter_parties(role='escrow_holder', user_id=auth.uid())` on a matter you are a paralegal on. | §II.1 `guard_class_grant()` pattern extended: privileged matter roles require a responsible-attorney grantor and `granted_by <> user_id`; `matter_parties` insert policy restricted identically. |
| **LW-10** | 🟠 | Draft §4 `POST /api/legal/gigs/create` | Gig escrow funding source unconstrained ⇒ **client funds advance the firm's costs**. | Fund a gig from the IOLTA principal of an unrelated matter. | I-L21 `funding_source ∈ {operating, client_advance}`; `guard_gig_funding()`; trust `entry_kind` enumeration has no gig branch. |
| **LW-11** | 🟡 | Draft §5 | "Two-key authorization" was a **policy sentence in a compliance section**, not a constraint anywhere in the schema. | — (this is the meta-finding behind LW-01…LW-03) | Every clause in §5 of the draft now has a named trigger, an error code, and an acceptance test. Prose that is not enforced is deleted rather than kept as aspiration. |
| **LW-12** | 🟡 | absent | A checker who **never loaded the payee** still counter-signs. | Blind approval workflow; the second key becomes a rubber stamp by UX. | `checker_saw_detail` set only by the server after `GET /disbursements/:id` under the checker's own session; guard requires it plus a ≤15-min assertion. |
| **LW-13** | 🟢 | Draft §3 `offered_usd_cents bigint` | No `check (> 0)`; negative amounts flow into escrow arithmetic. | Negative-amount posting inverts a release into a debit. | `check (attempt_fee_cents > 0)`, `check (service_fee_cents > 0)`, `usd_amount_cents > 0` retained from G4. |

**Vector A1 verdict.** The draft's IOLTA claim was unenforceable as written and the inherited Group 4 implementation contained a structuring gap wide enough to move six figures through. The four controls that actually matter — unconditional dual control on natural persons, per-client sub-ledger solvency, the debit-block attestation, and the invoice-bound fee transfer — are now database constraints. **LW-05 is the finding to escalate first**: it is the only one in this table that no amount of application-layer engineering can close, because the attack is executed at the bank.

## IV.2 Vector A2 — Cross-Practice Privilege Leakage

| ID | Sev | Where | Finding | Exploit path | Mitigation |
|---|---|---|---|---|---|
| **LW-14** | 🔴 | Draft §3 `legal_matter_metadata` | An **untyped jsonb bag with no RLS, no privilege class, and no facet** holds every workbench's crown jewels. A jsonb bag cannot be RLS'd by class because the class lives inside the value. | Paralegal added to a corporate matter for calendaring reads the cap table. A `legal_expediter` on a PI matter reads the settlement valuation. | Table is **not created**. Replaced by typed per-practice tables, each with `data_class`, each RLS'd on facet **and** class — §II.3, I-L8. |
| **LW-15** | 🔴 | Draft §2.B | Matter membership treated as sufficient for all practice data. Group 4 built `matter_parties.scope[]`; the draft ignores it. | Any matter party reads any practice data on that matter. | `may_read_class()`: `class_general` free, everything else requires an explicit, non-self-issued, expiring `matter_class_grants` row. |
| **LW-16** | 🔴 | absent | **MNPI → the platform's own acquisition marketplace.** Cap tables and pending-transaction data sit inside a platform that also runs Groups 2, 3, and 9. | Corporate attorney with an `investor_*` capacity reads a target's cap table on Monday and bids through the acquisition desk on Tuesday. The platform is the tipping channel. | `mnpi_designations` + `on_restricted_list(cluster)` enforced as a predicate on **Group 2/3/9** tables — not inside Group 4. Cross-group obligation, §V.6 — I-L10. |
| **LW-17** | 🔴 | Draft §2.A `privilege_class` | **The privilege holder is static.** In a corporate Chapter 7 the trustee controls the privilege (*Weintraub*); on death it passes to the executor; on merger to the survivor. | Post-appointment, the trustee cannot reach the file and former management still can — the exact inversion of the legal position. | `privilege_successions` (append-only, order-document-backed) + `current_privilege_holder()` + `may_read_privileged_v2()` — I-L9. |
| **LW-18** | 🟠 | Draft §3 `legal_matters.practice_area` | **Bankruptcy schedules have two lifetimes.** Pre-filing they are the most sensitive rows in the system; post-filing they are public record under §107. One predicate cannot serve both. | Pre-filing schedule leaks to a creditor's counsel who is a matter party for another purpose. | `bk_schedules.filed_at` drives a two-branch policy: pre-filing requires facet + class; post-filing relaxes to matter membership. |
| **LW-19** | 🟠 | Draft §5 "conflict checks run on every new matter intake" | The **new practice areas introduce adverse parties that do not exist in the property/deal graph** — insurers, medical providers, creditors, trustees. Group 4's screen cannot see them. | Firm represents Developer D (corporate) and, in PI, a plaintiff injured on D's site. No graph edge exists, so the screen returns clear. | `matter_adverse_parties` with typed kinds and `identity_cluster[]`; screening runs against it at intake **and** nightly (the emerging conflict) — §III.1. |
| **LW-20** | 🟠 | Draft §2.B | **Workbench tabs are an existence oracle.** A Bankruptcy tab rendering with a count for a user with no bankruptcy matters discloses the firm's practice composition and, worse, matter existence. | Screened member reads "Bankruptcy (3)" and learns what they were screened from. | `practice_workbench_manifest()` under the caller's session; no counts for classes the caller cannot read — I-L11, §III.1. |
| **LW-21** | 🟠 | Draft §2.B PI workbench | **PHI handling is unspecified.** Medical records OCR, bill extraction, and lien tracking are described as features with no data class, no re-disclosure control, and no 42 CFR Part 2 handling. | SUD records re-disclosed to a co-defendant's counsel added to the matter for another purpose. | `pi_medical_records` at `class_phi` with `part2_restricted` and `redisclosure_notice_required`; the class is handled at the Part 2 standard because that is the stricter rule and the one that survives being wrong about HIPAA applicability (§I.6). |
| **LW-22** | 🟠 | absent | **Settlement disbursement over an unresolved lien.** | Client paid; Medicare/ERISA lien unresolved; counsel personally liable. | `guard_pi_lien_clearance()` → `409 LIEN_UNRESOLVED`. |
| **LW-23** | 🟡 | Draft §2.B Family workbench | Minors' data and sealed matters have no handling; `sealed_at` exists on no draft table. | Sealed asset inventory remains readable to every matter party after sealing. | `family_asset_inventories.sealed_at`; policy excludes sealed rows; sealing is an act with a record (Group 7 §II.8 pattern reused). |
| **LW-24** | 🟡 | Draft §3 `legal_matters.firm_id uuid REFERENCES firms(id)` | **Nullable firm_id.** A matter with `firm_id = NULL` escapes every firm-scoped predicate, including wall inheritance. | Create a matter with no firm; walls never inherit (§II.5 joins on `w.firm_id = new.firm_id`). | `firm_id` is `NOT NULL` for all `legal_matters`; the inheritance trigger additionally fails closed on NULL. |
| **LW-25** | 🟢 | Draft §3 | `status text DEFAULT 'active'` and `practice_area text` are free text where enums exist. | Typo'd practice area silently escapes practice-scoped policies. | `matter_practice` enum; `check` constraints on status. |

**Vector A2 verdict.** The draft's answer to five practice areas with incompatible handling regimes was one untyped key-value table with no RLS. The corrected model separates **membership** (are you on this matter) from **class** (may you read this kind of thing), and both from **privilege** (whose secret is it, and who holds it *now*). **LW-16 is the finding with the largest blast radius** — it is not a privacy bug, it is a securities exposure created by the platform's own product adjacency, and it cannot be fixed inside Group 4.

## IV.3 Vector A3 — Legal Gig Escrow Exploitation

| ID | Sev | Where | Finding | Exploit path | Mitigation |
|---|---|---|---|---|---|
| **LW-26** | 🔴 | Draft §2.C, §4 "Funds release automatically upon provenance verification" | **Auto-release pays for presence at coordinates.** Service of process is not presence at coordinates. | *Sewer service, industrialised.* Drive to the address, photograph the door, never knock, submit, get paid the same day, swear a false affidavit later. The platform's own timestamped record then becomes opposing counsel's exhibit at the traverse hearing. | I-L16 three-tranche split (§I.5): **attempt fee** on verified provenance (honest about proving only presence), **service fee** on notarized affidavit + counsel acceptance, **traverse reserve** on filing with clawback. Provenance gates *submission acceptance*, never money. |
| **LW-27** | 🔴 | Draft §3 `geofence_verified boolean NOT NULL` | The schema stores the **conclusion** of a check the client performs. | Submit `geofence_verified = true`. Nothing computes it. | I-L18: raw evidence columns (`reported_lat/lng/accuracy_m`, `attestation_token`); verdicts computed server-side; `REVOKE UPDATE` on verdict columns; a request carrying one → `400 SERVER_COMPUTED_FIELD`. |
| **LW-28** | 🔴 | Draft §3 `nonce uuid UNIQUE` | **Uniqueness is not binding.** A unique constraint stops literal value reuse; the real replay is the same photograph and attestation under a *fresh* nonce. | Capture once at a real address. Reuse the image + attestation across 30 gigs, each with a new nonce. | I-L17: server-issued, TTL-bounded, single-use, bound to `(gig_id, user_id, device_id)`, **echoed inside the signed attestation payload**; `gig_capture_nonces` insert `with check (false)` for clients; atomic `FOR UPDATE` consumption. |
| **LW-29** | 🔴 | Draft §3 `perceptual_hash text UNIQUE NOT NULL` | A **global unique index on a fuzzy value** is simultaneously a false-reject and a **denial-of-service primitive**. | (a) Legitimate second service at the same door on a different matter is rejected. (b) Attacker pre-registers hashes of likely doorways to block a competitor's submissions permanently. | Uniqueness scoped to `(gig_id, perceptual_hash)`; cross-gig near-duplicates set `review_flags` for human adjudication — never auto-reject, never auto-approve. |
| **LW-30** | 🔴 | Draft §3 `device_attestation jsonb NOT NULL` | An attestation blob that is **never verified** is a JSON object with an authoritative-sounding name. | Post `{"verified": true}`. | Raw token stored; signature chain verified server-side against Apple App Attest / Google Play Integrity roots; verdict, key id, and verification time recorded; hard-fail on mock location, emulator, debuggable build, unrecognised root. |
| **LW-31** | 🟠 | Draft §2.C "verified local service providers" | **No licensure model at all.** `assigned_to_user_id uuid REFERENCES users(id)` — any user. | Unlicensed server takes NYC process-service gigs. In NYC that is an unlicensed-activity violation for the server and a defective-service problem for the attorney. | `gig_provider_credentials` + `gig_provider_eligible()`, **jurisdiction-matched to the service address**, re-checked at assignment *and* at release — I-L19. |
| **LW-32** | 🟠 | Draft §2.C "Per Diem attorneys" | **A per diem appearance is the practice of law.** The draft dispatches it like a delivery. Assigning a stranger to a matter is a conflict-and-privilege event. | Per diem attorney covering both sides of a calendar call (routine in practice) — live conflict, and a matter grant that exposes the file. | I-L20: full Group 4 conflict screen first; bar admission verified in the matter's jurisdiction; a narrow `{appearance}`-scoped `matter_parties` row expiring 24h after the hearing; **no representation edge**, so `may_read_privileged_v2()` never returns true for them. |
| **LW-33** | 🟠 | Draft §4 | **Self-dealing and double-release.** No relationship screen between poster and assignee; no idempotency on release. | Attorney assigns own alt account, submits, releases — conversion of client funds if the escrow was trust-funded (LW-10). Or race two release calls. | `guard_gig_assignment()` self-dealing screen on `identity_subject_id` and shared firm seat; `unique (gig_id, tranche, intent_id)` on `gig_releases`; `Idempotency-Key` mandatory; `FOR UPDATE` on the gig row. |
| **LW-34** | 🟡 | Draft §3 `captured_at timestamptz NOT NULL` + mutable `offered_usd_cents` | Client-supplied capture time is authority; gig terms are mutable after assignment (**TOCTOU**). | Backdate capture to fit a statutory window. Or raise `offered_usd_cents` after a colleague accepts. | Server receipt time authoritative, client time retained as disagreement evidence with a skew review flag; `amounts_frozen_at` set at assignment, changes require re-post. |

**Vector A3 verdict.** Every individual control the draft named — GPS, attestation, nonce, perceptual hash — was implemented in the weakest possible form: a conclusion instead of evidence, a uniqueness constraint instead of a binding, an unverified blob instead of a verified chain. But the controls were never the real problem. **LW-26 is the finding that matters**: the design pays for the wrong thing. No amount of attestation hardening makes a geofence into proof of service, and a platform that auto-releases on one has industrialised the exact fraud the process-service licensing regime exists to prevent — while generating the documentary record that convicts its own customer.

## IV.4 Vector A4 — Ethical Wall Bypass

| ID | Sev | Where | Finding | Exploit path | Mitigation |
|---|---|---|---|---|---|
| **LW-35** | 🔴 | Draft §2.A vs. G4 `is_matter_party()` | **"Hard-blocked at the RLS database level" is true of two Group 4 tables and false of every table this draft adds.** | Screened member queries `legal_matter_metadata`, `legal_gig_postings`, `time_billing`, or any practice table directly via `supabase-js`. None call `is_matter_party()`. | I-L7: every matter-scoped table routes through `is_matter_party()`; `wall-lint` fails the build on any policy over a table with a `matter_id` column that does not call it. |
| **LW-36** | 🔴 | Draft §2.A; G4 §II.3 transcript partitioning | **The Co-Pilot's copies are the wall's biggest hole** — retrieval index, transcripts, embeddings, prompt caches, and provider-side context caches all live outside the RLS-protected row. A wall erected today does not retract what the index holds. | Screened member's existing transcript still answers questions about the walled matter. Or the model's cached prefix still contains the walled content. | I-L15: `purge_walled_context()` runs **synchronously** inside `POST /api/legal/walls`; transcripts deleted, `wall_epoch` bumped (orphaning provider-side caches, since the epoch is part of the cache key), live sessions revoked. The wall is **not marked created** until purge acknowledges — a half-erected wall is worse than none because it is believed. |
| **LW-37** | 🔴 | inherited | **The service role bypasses RLS entirely.** Any route using `SUPABASE_SERVICE_ROLE_KEY` with a caller-supplied `matter_id` is a total wall bypass — and `auth.uid()` is NULL there, so any predicate that calls it silently asserts nothing. | A single service-role route with a `matterId` parameter defeats every wall in the system. | I-L14: `*_for(p_user, …)` explicit-subject predicates; `service_role_routes` inventory table; `servicerole-lint` fails the build on an uninventoried service-role route or one that does not call a `*_for()` predicate. |
| **LW-38** | 🔴 | G4 §III.3 `matters_party_select`, `mp_self_or_matter_select` | **`current_user_role_group() = 'admin'` reads walled matter existence and party lists** — precisely the fact a wall exists to conceal. Group 4 removed the admin branch from privileged *documents* and left it on *matters*. | Admin session enumerates walled matters and who is screened from them. | `break_glass_active()` replaces the role branch: time-boxed, two-person approved (`approved_by <> admin_id`), **holder-notified before it is active**, append-only recorded. |
| **LW-39** | 🔴 | Draft §3 `ethical_walls` (implied `matter_id` only) | **Walls have no scope.** A lateral hire screened from Client X's matter is not screened from the matter opened for Client X tomorrow. | Wait one day. Open a new matter. The wall does not cover it. | I-L13: `scope_kind ∈ {matter, client, cluster}` with `subject_cluster[]` (Group 2 beneficial-owner clusters); `matters_wall_inherit` trigger applies the wall **at intake, before the matter row is visible**. |
| **LW-40** | 🟠 | absent | **Aggregates and notifications are the classic real-firm wall leak.** Firm dashboards, time-billing roll-ups, calendars, conflict results, and notification fan-out all disclose matter existence and intensity. | Screened member reads "Matter #4471 — 14.2 hrs this week" and learns the firm holds it, who is on it, and how hard they are working it. Never touches a document. | `visible_matter_ids()` is the only source for every count, roll-up, calendar, and notification; fan-out is filtered **at generation**, never at render — I-L11. |
| **LW-41** | 🟠 | Draft §3 `lifted_at` | **Anyone with UPDATE lifts the wall**, including the screened member. | `update ethical_walls set lifted_at = now() where screened_user_id = auth.uid()`. | `guard_wall_lift()`: responsible attorney only, never the screened user; append-only `wall_lift_events`; `wall_epoch` increments. |
| **LW-42** | 🟠 | inherited | **Existence leakage through error codes and timing.** `403` on a walled matter and `404` on a nonexistent one are distinguishable, and so are their latencies. | Binary-search the matter space with 403/404 as the oracle. | §III.0: walled ⇒ **404**, byte-identical body and headers, padded to success-path p50 latency; plus a 429 budget on failed matter-route lookups, because I-L11 is defeated by volume even when each response is uniform. |
| **LW-43** | 🟡 | absent | **The screened member's own prior work stays in the matter**, and the system has no record of what they saw before the screen. | Screening is asserted in a memo; the disclosure obligation cannot be evidenced. | `wall_prior_access` snapshotted at wall creation. Deliberately **not** deleted — concealing prior access would defeat the screen's own disclosure purpose. |
| **LW-44** | 🟡 | Draft §5 "conflict checks run automatically" | Screening is presented as automatic, but **who may screen and on what basis is unspecified**, and self-screening was possible. | Member screens a colleague off a matter to monopolise it. | `wall_no_self_insert` policy + responsible-attorney requirement + documented `basis` + `wall_lift_events` audit. |

**Vector A4 verdict.** Group 4's wall enforcement was real but shallow: correct in two predicates, absent everywhere else, and blind to the four places walls actually leak in practice — **copies** (LW-36), **the service role** (LW-37), **aggregates** (LW-40), and **scope drift over time** (LW-39). The corrected design treats a wall as a *system-wide epoch* rather than a row: erecting one is a synchronous, acknowledged operation across the database, the retrieval index, the transcript store, the provider cache, and every live session, and it fails closed at every step.

## IV.5 Cross-Vector Observations

1. **Three of the four vectors share one defect shape: a stored conclusion where evidence belongs.** `geofence_verified`, `privilege_holder_id`, `rbac_visibility`-in-jsonb, and "double-signature authorization"-as-prose are the same mistake in four costumes. The general rule this document adopts: *the database stores what was observed and the server computes what it means; a column whose value the client can assert is not a control.*

2. **Two of the four vectors are only closable outside Group 4.** LW-05 (ACH debit authority) is closed at the bank. LW-16 (MNPI) is closed in Groups 2, 3, and 9. A blueprint that treats its own boundary as the security boundary will ship both.

3. **The wall and the Co-Pilot are the same problem.** Every finding in A4 that is not about a row is about a *copy* — index, transcript, cache. That is exactly the surface the Agent Factory blueprint governs, which is why I-L15's purge protocol and that document's tenant-isolation model must be implemented together or neither works.

---

# SECTION V — COMPLIANCE & INVARIANT CHECKLIST

> **Standards-mapping caveat.** Annex-A control identifiers below follow ISO/IEC 27001:2022 and the AICPA Trust Services Criteria (2017, rev. 2022). Identifiers must be re-confirmed against the certifying body's current text before an audit; this table is an engineering-to-control map, not a statement of certification. ISO/IEC 42001 mappings are given at clause/theme level deliberately — the AI-management standard's control set is newer and its numbering is the item most likely to move.

## V.1 ISO / SOC 2 Control Map

| Control | Requirement | Implementing artifact in this blueprint |
|---|---|---|
| **ISO 27001 A.5.15** Access control | Rules for physical and logical access | `is_matter_party()` / `may_read_class()` / `may_read_privileged_v2()` as the sole access path; §II.7 |
| **A.5.18** Access rights | Provision, review, and **removal** | `matter_class_grants` with `expires_at`/`revoked_at`; representation termination purges retrieval within 24h; per diem grants auto-expire (I-L20) |
| **A.8.2** Privileged access rights | Restricted and managed | `break_glass_grants`: time-boxed, two-person approved, holder-notified; the ordinary `admin` branch is removed (LW-38) |
| **A.8.3** Information access restriction | Restrict per access-control policy | Facet + class + privilege, three independent predicates; column-level `REVOKE` in `0066` |
| **A.8.5** Secure authentication | Strong auth for sensitive functions | ⚡ step-up (WebAuthn) on disbursement, countersign, class grant, wall creation, wall lift; assertion id recorded on the row |
| **A.8.10** Information deletion | Delete when no longer required | `purge_walled_context()`; TDPA TTL job (§V.2); sealing rather than deletion where a retention duty applies |
| **A.8.11** Data masking | Mask per policy | Existence protection (I-L11): 404-uniform responses; `classes_withheld` envelope rather than silent partial answers |
| **A.8.12** Data leakage prevention | Prevent unauthorised disclosure | `wall-lint`, `privilege-lint`, `servicerole-lint`, `class-lint`; no matter/client identifier in outbound affiliate URLs (§III.6) |
| **A.8.15** Logging | Event logs produced, kept, protected | `matter_class_grant_log`, `wall_breach_attempts`, `wall_lift_events`, `conflict_checks`, `break_glass_grants` — all append-only by rule |
| **A.8.16** Monitoring activities | Detect anomalous behaviour | §V.5 telemetry: structuring velocity, sewer-service signature, existence probing, wall breach attempts |
| **A.8.24** Use of cryptography | Policy on cryptographic controls | SHA-256 trust hash chain (tamper **evidence**, explicitly not prevention); attestation signature-chain verification; at-rest encryption for `class_phi`/`class_family` |
| **A.5.33** Protection of records | Protect from loss, falsification, unauthorised access | I-L4 append-only + hash chain; Group 4 §II.6.5 supersession/tombstone lifecycle retained |
| **A.5.34** PII privacy | Identify and meet PII requirements | `data_class` taxonomy; Part 2 handling for SUD records; TDPA class (§V.2) |
| **A.5.23** Cloud services security | Manage cloud-service security | `service_role_routes` inventory; Supabase RLS as the enforcement plane with lint-verified coverage |
| **SOC 2 CC6.1** Logical access | Restrict to authorised users | Same as A.5.15/A.8.3 above |
| **CC6.2** Registration & authorization | Credentials issued on authorization | `matter_class_grants` non-self-issued; `gig_provider_credentials` verified against the issuing authority |
| **CC6.3** Access modification & removal | Timely change and removal | Wall erection revokes live sessions within 60s (I-L15); credential lapse blocks release even mid-gig (I-L19) |
| **CC6.7** Restricted transmission & movement | Restrict movement of information | No cross-matter retrieval, ever; transcripts partitioned on `(matter_id, user_id)` |
| **CC7.2** Monitoring for anomalies | Detect and act | §V.5 security counters, paged not dashboarded |
| **CC7.4** Incident response | Respond to identified events | Chain-break freezes the account; unacknowledged wall purge fails the request; attestation-vendor outage queues rather than fails open |
| **CC8.1** Change management | Authorised, designed, tested changes | Migration sequence `0060`–`0066`; every lint in §V.4 is a build gate |
| **PI1.1–PI1.3** Processing integrity | Complete, valid, accurate, timely, authorised processing | Per-client sub-ledger solvency (I-L2); three-way reconciliation against the sub-ledger sum; idempotency keys on every money route; `unique (gig_id, tranche, intent_id)` |
| **C1.1 / C1.2** Confidentiality | Identify and dispose of confidential information | `data_class` taxonomy; sealing; TDPA TTL; privilege log per matter |
| **A1.2** Availability | Recovery and backup | Degraded-operation table (§I.7): every failure mode fails **closed on disclosure** and **open on the client's access to their own file** |
| **ISO 42001** (AI management) — AI risk assessment & impact | Assess AI-system risks and impacts | The Co-Pilot's legal-content surfaces carry the Group 4 §II.11.2 non-lawyer block; advisory tagging is mandatory UI (Draft §5, retained); grounding controls specified in `MasterBlueprint_Agent_Factory_Platform.md` §IV.4 |
| **ISO 42001** — Data for AI systems | Provenance and quality of AI training/context data | The Legal Workspace contributes **no** matter content to any authority corpus; `class_phi` and `class_family` are excluded from every training, analytics, and aggregate surface — in scope for `privilege-lint` |

## V.2 NYC Tenant Data Privacy Act — Scope, and the Collision Nobody Modelled

**What the TDPA actually is.** NYC Local Law 63 of 2021 (Admin. Code §26-3001 *et seq.*) governs **owners of residential buildings** who collect tenant data through **smart-access systems** — key fobs, biometric entry, mobile credentials. It requires express consent, limits collection and use, prohibits sale, provides a private right of action, and requires destruction of the data within a defined period (the statute's 90-day destruction duty, and destruction when the tenancy ends).

**Honest scope statement.** The Legal Workspace is not a residential building owner and does not operate smart-access systems. The orchestrator gate `TDPA_90_Day_Destruction` is primarily a **Group 7** obligation. This blueprint is in TDPA scope in exactly one situation, and it is a real one:

> A landlord-tenant, personal-injury, or habitability matter **ingests smart-access or biometric logs as evidence.** The data arrives in the matter as a document or a metadata payload. The destruction duty attaches to the data, not to the original collector's business model.

**The collision.** The destruction duty and the **litigation-hold duty** point in opposite directions on the same bytes. A matter that ingests smart-access logs as evidence is, by construction, a matter in which those logs must be preserved. Deleting them satisfies the TDPA and constitutes spoliation. Retaining them in the clear satisfies the preservation duty and violates the TDPA. **The draft models neither, and no prior blueprint resolves it.**

**Resolution implemented here.**

```sql
-- class_tdpa_regulated: TTL by default, sealed under hold, never both in the clear.
create table tdpa_regulated_evidence (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  document_id    uuid references documents(id),
  source_kind    text not null check (source_kind in
                   ('smart_access_log','biometric_entry','mobile_credential')),
  collected_at   timestamptz not null,
  ingested_at    timestamptz not null default now(),
  destroy_due_at timestamptz not null,           -- statutory clock, set at ingest
  sealed_at      timestamptz,                    -- hold: operational access removed
  destroyed_at   timestamptz,
  minimization_note text not null,               -- what was NOT ingested, and why
  class          data_class not null default 'class_tdpa_regulated'
                   check (class = 'class_tdpa_regulated')
);

create or replace function guard_tdpa_lifecycle() returns trigger
language plpgsql as $$
begin
  -- Under legal hold, the row is SEALED, not retained-in-the-clear and not deleted.
  if exists (select 1 from matters m where m.id = new.matter_id and m.legal_hold) then
    if new.destroyed_at is not null then
      raise exception 'TDPA/HOLD COLLISION: destruction suspended by legal hold — seal instead'
        using errcode = '42501';
    end if;
    if new.sealed_at is null and new.destroy_due_at < now() then
      raise exception 'TDPA/HOLD COLLISION: statutory clock elapsed; sealing is mandatory'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger tdpa_lifecycle_guard before insert or update on tdpa_regulated_evidence
  for each row execute function guard_tdpa_lifecycle();
```

**The operating rules that go with it:**

1. **Minimize at ingest.** Request the narrowest slice — the specific date range and door, never a full access history. `minimization_note` is mandatory and records what was declined.
2. **The clock starts at ingest** and is independent of the original collector's clock, because the platform's possession is its own collection event.
3. **Sealing is the collision resolution.** Under hold: operational access is removed (no matter party, no Co-Pilot retrieval, no export), encryption keys are separated, and access requires break-glass with a documented preservation basis. The row is not deleted, and it is not readable.
4. **The clock resumes on hold release.** Destruction executes automatically at the later of `destroy_due_at` and hold release, and the destruction is recorded.
5. **Never in a Vault, ever.** `class_tdpa_regulated` data is prohibited from every corpus, index, embedding, and aggregate. This is `vault-pii-lint` in the Agent Factory blueprint.
6. **Whether this resolution is legally sufficient is a §V.7 blocking item.** The engineering position is defensible; it is not a legal opinion, and the statute's private right of action makes getting it wrong expensive.

## V.3 Acceptance Criteria

**Trust (Vector A1)**
- [ ] A disbursement of **any** amount with `checker_id = NULL` is rejected. *(LW-01, LW-02 — the sub-threshold path.)*
- [ ] A disbursement where maker and checker share an `identity_subject_id` is rejected, even with distinct `user_id`s. *(LW-03.)*
- [ ] Forty-one sequential $9,999 disbursements: the first crossing the 24h aggregate threshold requires responsible-attorney countersignature. *(LW-01 structuring test — run as an actual loop, not a unit assertion.)*
- [ ] A disbursement that would drive **any single client's** sub-ledger below zero is rejected with `409 INSUFFICIENT_CLIENT_BALANCE`, while the account-level balance remains positive. *(LW-04 — this is the test that proves anti-commingling.)*
- [ ] Two concurrent disbursements against the same sub-ledger, each individually affordable and jointly not, serialise; exactly one succeeds. *(Race test against `FOR UPDATE`.)*
- [ ] A disbursement from an account whose `debit_block_attested_at` is null or stale returns `423 ACCOUNT_FROZEN`. *(LW-05.)*
- [ ] No `entry_kind` value exists for a platform fee, subscription, processor fee, or chargeback. *(I-L3 — asserted by enum inspection, so it cannot be added without a migration and a review.)*
- [ ] An earned-fee transfer against an undelivered, in-notice, disputed, or over-drawn invoice is rejected; the payee must equal `operating_account_ref`. *(LW-06.)*
- [ ] `DELETE FROM trust_ledger` affects zero rows; an `UPDATE` to `usd_amount_cents` raises. *(LW-07.)*
- [ ] Corrupting a `row_hash` out-of-band is reported as `chain_break` by the reconciliation endpoint and freezes the account. *(LW-07.)*
- [ ] IOLTA interest to any payee other than the registered bar foundation is rejected. *(LW-08.)*
- [ ] A checker who has not loaded the disbursement detail in their own session cannot countersign. *(LW-12.)*

**Privilege & practice isolation (Vector A2)**
- [ ] `legal_matter_metadata` **does not exist** in any migration. *(LW-14 — asserted by grep, CI-enforced.)*
- [ ] A paralegal who is an active party on a corporate matter cannot read `corp_cap_tables` without a `class_mnpi` grant. *(LW-15.)*
- [ ] A `class_phi` grant issued by the grantee themselves is rejected. *(LW-15, self-grant.)*
- [ ] A user with an active MNPI designation cannot open an acquisition, capital, or brokerage session against any counterparty in the designation's cluster. *(LW-16 — cross-group integration test against Groups 2/3/9.)*
- [ ] After a `bk_trustee_appointment` succession, the trustee reads privileged material and former management does not. *(LW-17.)*
- [ ] A pre-filing `bk_schedules` row is unreachable without facet + class; the same row post-filing is readable by any matter party. *(LW-18.)*
- [ ] A conflict screen at intake resolves `matter_adverse_parties.identity_cluster`, not only `users.id`. *(LW-19.)*
- [ ] The workbench manifest returns no tab, count, or badge for a class the caller cannot read. *(LW-20.)*
- [ ] A settlement disbursement with an open `pi_liens` row is rejected. *(LW-22.)*
- [ ] No `legal_matters` row can be created with `firm_id = NULL`. *(LW-24.)*

**Gig rail (Vector A3)**
- [ ] **No code path releases the service fee without `accepted_by` set by counsel of record.** *(LW-26 — static analysis plus a direct `gig_releases` insert attempt under every role.)*
- [ ] A request to `POST /attempts` containing `geofence_verified` returns `400 SERVER_COMPUTED_FIELD` — the field is **rejected, not ignored**. *(LW-27.)*
- [ ] `authenticated` has no UPDATE grant on `geofence_verified`, `attestation_verified`, `verified_at`. *(LW-27 — grant inspection.)*
- [ ] Reusing a photograph and attestation under a fresh nonce is rejected because the nonce is not present in the signed attestation payload. *(LW-28 — this is the test the draft's design passes and the hardened design fails, correctly.)*
- [ ] Consuming a nonce twice concurrently: exactly one succeeds, the other returns `409 NONCE_REPLAY`. *(LW-28 race test.)*
- [ ] Two legitimate services at the same address on different gigs both succeed; the near-duplicate raises a review flag and blocks nothing. *(LW-29 — the false-reject half.)*
- [ ] An attacker cannot pre-register a perceptual hash to block another provider's submission. *(LW-29 — the griefing half.)*
- [ ] An attestation token with a valid structure but an unrecognised signing root is rejected. *(LW-30.)*
- [ ] A provider licensed in Nassau County cannot be assigned a Kings County service. *(LW-31 — jurisdiction matched to the service address.)*
- [ ] A provider whose licence lapses **between assignment and release** cannot be released to. *(LW-31 — re-check at release.)*
- [ ] A per diem assignment creates a `matter_parties` row with `scope = {appearance}` and an `expires_at`, and **no `representations` row**; `may_read_privileged_v2()` returns false for that attorney. *(LW-32.)*
- [ ] A per diem assignment without a cleared `conflict_checks` row is rejected. *(LW-32.)*
- [ ] Poster and assignee sharing an `identity_subject_id` or a firm seat is rejected. *(LW-33.)*
- [ ] Two concurrent release calls for the same tranche produce one release. *(LW-33 idempotency.)*
- [ ] Changing `service_fee_cents` after assignment is rejected. *(LW-34 TOCTOU.)*

**Ethical walls (Vector A4)**
- [ ] A screened member's direct `supabase-js` SELECT on **every** matter-scoped table returns zero rows — enumerated table by table, not sampled. *(LW-35.)*
- [ ] Erecting a wall deletes the screened member's transcripts and bumps `wall_epoch` **before the API returns**; a wall whose purge fails leaves `purge_ack_at` null and the member still blocked. *(LW-36.)*
- [ ] After a wall is erected, the screened member's next Co-Pilot request on that matter returns `404` and **does not invoke the model**. *(LW-36 — asserted by a model-call spy, not by response inspection.)*
- [ ] Every service-role route appears in `service_role_routes` and calls a `*_for()` predicate. *(LW-37 — `servicerole-lint`.)*
- [ ] Every `SECURITY DEFINER` function in the schema — including the Group 4 functions this document re-issues — sets `search_path = ''` and references only fully-qualified objects. *(§II.6 note; shared standard with Agent Factory AF-13.)*
- [ ] An `admin` session cannot read a walled matter's existence or party list without an active, holder-notified `break_glass_grants` row. *(LW-38.)*
- [ ] Opening a new matter for a client with an active client-scoped wall applies the wall before the matter is readable by anyone. *(LW-39 — the one-day-later test.)*
- [ ] No firm dashboard, time roll-up, calendar, search result, notification, or count includes a walled matter. *(LW-40 — enumerate every aggregate surface.)*
- [ ] The screened member cannot lift their own wall. *(LW-41.)*
- [ ] A walled matter and a nonexistent matter return byte-identical responses, and their p50/p95 latencies are within tolerance. *(LW-42 — timing test, not just body comparison.)*
- [ ] `wall_prior_access` is populated at wall creation and is never deleted. *(LW-43.)*

## V.4 CI Guardrails

Groups 1–4 guardrails are inherited. This document adds:

```
wall-lint         — fails if any table with a matter_id column has a SELECT policy that
                    does not call is_matter_party() or is_matter_party_for()   (LW-35)
class-lint        — fails if any practice-area table lacks a data_class column, or if a
                    policy over one omits may_read_class()                     (LW-14/15)
definer-lint      — fails if any SECURITY DEFINER function omits `set search_path = ''`
                    or references an unqualified object. Shared standard with
                    MasterBlueprint_Agent_Factory_Platform.md AF-13; applies to the
                    Group 4 functions this document re-issues
servicerole-lint  — fails on any route importing the service-role client that is absent
                    from service_role_routes, or that calls auth.uid() (which is NULL
                    under the service role and therefore asserts nothing)      (LW-37)
trust-lint        — extended: fails if any disbursement path can execute with a null
                    checker; if any entry_kind outside the enumeration is introduced; if
                    any UPDATE path touches a financial column; or if the hash chain
                    trigger is dropped                                          (LW-01/07)
commingle-lint    — fails if trust_client_balances loses its >= 0 check, its FOR UPDATE
                    lock, or its trigger                                        (LW-04)
provenance-lint   — fails if any client-writable column carries a verification verdict;
                    if a nonce is minted outside the server; or if a perceptual-hash
                    uniqueness constraint is global rather than gig-scoped      (LW-27/28/29)
release-lint      — extended: fails if gig_releases is reachable from any interactive
                    route, or if a service-fee release path exists that does not require
                    accepted_by                                                 (LW-26)
existence-lint    — fails if any matter route returns 403 (rather than 404) on a
                    non-party, or returns a body that varies with resource existence (LW-42)
privilege-lint    — extended: fails if class_phi, class_family, or class_tdpa_regulated
                    rows are reachable from any analytics, export, training, or
                    aggregate surface                                           (LW-21/23)
tdpa-lint         — fails if class_tdpa_regulated data reaches any corpus, index, or
                    embedding; or if a destroy_due_at clock is unset at ingest   (§V.2)
mnpi-lint         — fails if any Group 2/3/9 policy over a counterparty-scoped table
                    omits on_restricted_list()                                   (LW-16)
```

## V.5 Telemetry

**Trust integrity (paged, not dashboarded):** disbursement velocity per matter per 24h with structuring bands ($8k–$10k clustering is the signature); sub-ledger overdraw attempts; countersign latency distribution (a median under 30 seconds means the second key is a rubber stamp); chain-break events; debit-block attestation staleness; fee-transfer-to-invoice ratio per firm.

**Gig integrity:** attempts per provider per day and per gig; geofence distance distribution (a provider whose distances cluster at exactly the boundary is optimising against the check); timestamp skew distribution; near-duplicate review-flag rate per provider; **attempt-to-affidavit ratio** — a provider with many verified attempts and few accepted affidavits is the sewer-service signature, and it is visible long before a traverse; traverse rate and sustain rate per provider and per firm; credential-lapse-at-release blocks.

**Wall integrity:** breach attempts per wall; purge acknowledgement latency; unacknowledged walls (should be zero); wall inheritance firings; break-glass openings, duration, and holder-notification latency; lift events by basis.

**Privilege & class:** class grants per matter per day; self-grant attempts; grants with no `expires_at`; MNPI designations active vs. released; restricted-list blocks in Groups 2/3/9; privilege succession events.

**Existence probing:** failed matter-route lookups per user per hour; 404 burst detection; conflict-screen volume per firm (name enumeration).

**Deliberately not collected:** the content of any `class_phi`, `class_family`, `class_mnpi`, or `class_tdpa_regulated` row in any analytics, aggregate, model-training, or vendor telemetry surface. In scope for `privilege-lint`.

## V.6 Cross-Group Obligations Created Here

- **Groups 2, 3, 9** must add `on_restricted_list(cluster)` to every policy over a counterparty-scoped table (listings, deals, facilities, representations, bids). Without it, LW-16 is open regardless of anything in this document. **This is a build-blocker for the corporate workbench.**
- **Group 7** owns the TDPA collection surface; this document owns the ingestion-into-a-matter surface. The `class_tdpa_regulated` TTL clock and the sealing resolution (§V.2) must be reconciled with Group 7's `applicant_retention_seal` so the two do not implement contradictory lifecycles on the same bytes.
- **Group 5** owns crew-member identity; `identity_subjects` (§II.1) is the same primitive and must be a single implementation, not two.
- **Group 8 (admin)** must supply: bar-standing verification, escrow licensure and bond monitoring, **process-server licence verification against the issuing authority**, notary/RON act verification, and the quarterly debit-block attestation workflow.
- **Agent Factory** must implement the tenant-isolation and grounding model in `MasterBlueprint_Agent_Factory_Platform.md`; I-L15's purge protocol depends on `wall_epoch` participating in that document's cache-key derivation.

## V.7 Residual Risk & Blocking Review Queue

**Accepted residual risks**

| Risk | Why accepted | Compensating control |
|---|---|---|
| Two colluding firm members satisfy dual control | Dual control assumes independence; collusion defeats every two-person rule ever written | Velocity telemetry, countersign-latency distribution, mandatory reconciliation by a third seat, `auditor` seat with read-only cross-matter trust visibility |
| A licensed process server who commits sewer service *and* obtains a valid notarization | The platform cannot observe the doorstep | Attempt-to-affidavit ratio, traverse rate per provider, reserve tranche, and the fact that the attempt fee — not the service fee — is what provenance buys |
| GPS spoofing on a fully compromised but attesting device | Hardware attestation is strong, not absolute | Multi-signal corroboration (attestation + network-side coarse location disagreement + timestamp skew) as a **detector**; and the structural answer, which is that no single signal releases the service fee |
| A screened member who already memorised the file | No technical control addresses human memory | `wall_prior_access` disclosure record; the screen's legal effect depends on documentation, which is what the snapshot provides |
| Privilege-waiver argument from platform hosting | A known question in every practice-management product | Holder-scoped access with no ordinary admin branch; break-glass visible to the holder; per-matter privilege log; documented architecture a client's own counsel can rely on |

**Blocking review items** — each blocks its surface.

1. **Trust account controls, per state.** Whether unconditional dual control, the sub-ledger constraint, and the three-way reconciliation definition satisfy each launch state's trust-accounting rules; and whether the platform's role makes it a records-keeper subject to bar audit. **Blocks:** all custody. *(Shares Group 4 item 7.)*
2. **ACH debit-block attestation.** Whether an attestation is sufficient or whether the platform must obtain the block confirmation directly from the institution. **Blocks:** trust disbursement. *(LW-05 — highest priority in this document.)*
3. **Process-server licensing and record-keeping, per jurisdiction.** NYC DCWP licensure, bonding, GPS-device and electronic-record duties, and the retention period the platform inherits by becoming the system of record. **Blocks:** the process-server gig type in each jurisdiction.
4. **Payment structure for process service.** Whether a per-attempt fee structure creates a perverse incentive toward attempts over service, and whether any jurisdiction restricts contingent or outcome-linked compensation for service of process. **Blocks:** the attempt/service split. *(This is the one place where the hardened design introduces a new risk the draft did not have, and it must be reviewed rather than assumed.)*
5. **Per diem assignment and UPL/conflicts.** Whether marketplace-mediated per diem assignment satisfies each jurisdiction's rules on appearance, conflicts, and fee division. **Blocks:** the per diem gig type. *(Shares Group 4 item 2, MRPC 5.4.)*
6. **PHI / 42 CFR Part 2.** Whether the platform's possession creates obligations beyond the contractual, and whether the Part 2 re-disclosure notice mechanism is sufficient. **Blocks:** the PI workbench.
7. **MNPI and the restricted list.** Securities counsel review of whether the information barrier between the corporate workbench and the acquisition/brokerage surfaces is adequate, and whether the platform's structure creates its own exposure. **Blocks:** the corporate workbench. *(LW-16.)*
8. **Bankruptcy privilege succession.** Whether `privilege_successions` correctly implements trustee control in each chapter, and how it interacts with individual (as opposed to corporate) debtors. **Blocks:** the bankruptcy workbench.
9. **TDPA / legal-hold collision.** Whether sealing satisfies the destruction duty, or whether the statute admits no such accommodation. **Blocks:** ingestion of smart-access evidence into any matter. *(§V.2 — the private right of action makes this expensive to get wrong.)*
10. **Ethical wall sufficiency.** Whether the technical screen plus the `wall_prior_access` disclosure record satisfies each jurisdiction's screening requirements, and whether client notice is required. **Blocks:** lateral-hire onboarding at scale.
11. **Procurement affiliate revenue.** RESPA §8 and MRPC 5.4 review of affiliate compensation inside a legal workspace. **Blocks:** procurement monetization. *(Shares Group 4 item 10.)*

---

**End of MasterBlueprint_Legal_Workspace.md** — v2.0, red-teamed, 34 findings across 4 vectors, cleared for engineering handoff subject to the §V.7 blocking queue.
