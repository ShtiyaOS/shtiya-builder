# 📄 DRAFT BLUEPRINT: ALL-IN-ONE LEGAL WORKSPACE (GROUP 4 EXTENSION)
**Document Status:** Draft Blueprint (Phase 1)
**Target Group:** Group 4 (Legal Shield & Legal OS)
**Taxonomy Roles:** `legal_transactional`, `legal_title`, `legal_expediter`, `legal_loss_mitigation`, `legal_arbitrator` (Group: `neutral`)
**Author:** Gemini Master Orchestrator

---

## 1. ARCHITECTURAL MANDATE & CORE VISION
The Legal Workspace expands Group 4 from a real-estate-only closing tool into an **All-in-One Practice Operating System**. Instead of forcing attorneys into the "Generalist Trap" of legacy CRMs (like Clio or PracticePanther), this workspace provides a unified core with specialized practice-area workbenches (PropTech/Closings, Personal Injury, Corporate, Family/Estates, Bankruptcy).

### Key Architectural Invariants:
1. **Core Practice Primitives:** All matters share universal baseline schemas: `matters`, `matter_parties`, `time_billing`, `IOLTA_trust_accounts`, `documents` (with `privilege_class`), and `ethical_walls`.
2. **Unified Legal Tier:** No piecemeal subscription gates per practice area. All practice workbenches are bundled into the flagship Legal Tier to maximize usage, speed up deal flow, and capture transaction velocity.
3. **Integrated Legal Services Marketplace:** On-demand micro-gigs (Per Diem attorneys, Process Servers, Mobile Notaries) locked in two-phase micro-escrow (`escrow_intents`) and released via cryptographic proof (`provenanceBundle`).
4. **Hardware & Supplies Procurement Engine:** Built-in procurement store connected to dropship/affiliate networks for scanners, encrypted media, and closing supplies.

---

## 2. SYSTEM TOPOLOGY & WORKBENCH MODULES

### A. Core Legal CRM & Infrastructure
*   **Matter Management:** Centralized matter docketing, calendar statutory clocks, court filing trackers.
*   **IOLTA & Trust Accounting:** Native multi-party trust accounting adhering to state bar rules. Direct ledger recording with two-key authorization for disbursements.
*   **Privilege & Ethical Walls:** Cryptographically enforced document classification (`privilege_class`: `none` | `attorney_client` | `work_product` | `settlement_privileged`). Firm members on `ethical_walls` are hard-blocked at the RLS database level.

### B. Practice-Area Workbenches (Center Pane Dynamic Injections)
*   **PropTech & Closings (Base):** ERC-3643 identity verification, title clearance, Delaware LLC SPV formation, two-phase escrow intents.
*   **Personal Injury Workbench:** Medical records OCR parsing, bill extraction, settlement valuation models, insurance lien tracking, demand letter generator.
*   **Bankruptcy Workbench:** Chapter 7/11/13 petition assembly, asset/liability schedule parser, creditor meeting calendars, automatic stay enforcement logs.
*   **Corporate & Contracts Workbench:** Cap table manager, entity formation wizards, regulatory audit trails, contract redlining engine.
*   **Family & Estates Workbench:** Asset division calculation matrix, child support calculators, probate asset inventory mapping.

### C. Legal Services & Procurement Marketplace
*   **Process Server & Per Diem Gig Engine:**
    *   Attorneys post jobs with escrow funding.
    *   Gigs are accepted by verified local service providers.
    *   Process servers upload Affidavit of Service with `provenanceBundle` (GPS geofence + timestamp + device attestation + single-use nonce).
    *   Funds release automatically upon provenance verification.
*   **Hardware Procurement Store:** Affiliate/dropship integration inside the `Settings/Office` tab for desktop scanners, encrypted media, and legal paper supplies.

---

## 3. DATABASE SCHEMA EXTENSIONS (SUPABASE / POSTGRESQL)

```sql
-- Matter Management Extension
CREATE TABLE legal_matters (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id uuid REFERENCES firms(id),
  matter_name text NOT NULL,
  practice_area text NOT NULL, -- 'proptech', 'personal_injury', 'bankruptcy', 'corporate', 'family'
  jurisdiction_state text NOT NULL,
  jurisdiction_county text,
  status text DEFAULT 'active', -- 'intake', 'active', 'stayed', 'closed'
  created_at timestamptz DEFAULT now()
);

-- Practice-Specific Matter Metadata
CREATE TABLE legal_matter_metadata (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  matter_id uuid REFERENCES legal_matters(id) ON DELETE CASCADE,
  metadata_key text NOT NULL,
  metadata_value jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Legal Gig Marketplace (Process Servers, Per Diem, Notaries)
CREATE TABLE legal_gig_postings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  matter_id uuid REFERENCES legal_matters(id),
  posted_by_user_id uuid REFERENCES users(id),
  gig_type text NOT NULL, -- 'process_server', 'per_diem', 'mobile_notary', 'title_abstractor'
  offered_usd_cents bigint NOT NULL,
  escrow_intent_id uuid REFERENCES escrow_intents(id),
  location_geofence jsonb, -- target location coordinates and radius
  status text DEFAULT 'open', -- 'open', 'assigned', 'provenance_verified', 'completed', 'disputed'
  assigned_to_user_id uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Provenance Proof for Legal Gigs
CREATE TABLE legal_gig_proofs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gig_id uuid REFERENCES legal_gig_postings(id),
  uploaded_by_user_id uuid REFERENCES users(id),
  storage_path text NOT NULL,
  perceptual_hash text UNIQUE NOT NULL,
  device_attestation jsonb NOT NULL,
  geofence_verified boolean NOT NULL,
  nonce uuid UNIQUE NOT NULL,
  captured_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

---

## 4. API & ROUTE CONTRACTS
* **GET /api/legal/matters** Fetches user's active matters across all practice areas (RLS: matter_parties).

* **POST /api/legal/gigs/create** Creates a legal service gig and locks funds into a two-phase escrow_intent.

* **POST /api/legal/gigs/submit-proof** Accepts process server photo/document, verifies provenanceBundle, writes to legal_gig_proofs, and triggers automated escrow release.

* **GET /api/legal/procurement/catalog** Returns affiliate hardware and supply catalog with direct dropship ordering.

## 5. COMPLIANCE & LEGAL GUARDRAILS
* **IOLTA Compliance:** No billing actor or platform fee may deduct directly from the IOLTA principal without a double-signature authorization.

* **Advisory Disclaimers:** All AI-generated redlines, demand letters, or pleadings carry mandatory UI tags: "Advisory Draft — Requires Final Review by Counsel of Record."

* **Ethical Wall Isolation:** Cross-matter conflict checks run automatically on every new matter intake.