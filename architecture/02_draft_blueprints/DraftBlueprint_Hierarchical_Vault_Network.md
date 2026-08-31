# 📄 DRAFT BLUEPRINT: HIERARCHICAL MICRO-VAULT & INGESTION NETWORK
**Document Status:** Draft Blueprint (Phase 1)
**Target Group:** Cross-System Infrastructure (Knowledge Management, Legal OS, Enterprise)
**Nature:** Multi-Agent Hierarchical RAG (HRAG) & Zero-Trust Document Ingestion
**Author:** Gemini Master Orchestrator

---

## 1. ARCHITECTURAL MANDATE & CORE VISION
The system eschews "flat" vector databases in favor of a **Hierarchical Retrieval-Augmented Generation (HRAG)** architecture. Knowledge is partitioned into highly specific jurisdictional Micro-Vaults. Data enters these vaults exclusively through a heavily guarded, multi-agent ingestion and verification pipeline to prevent context poisoning, malware insertion, and semantic degradation.

### Key Architectural Invariants:
1. **Jurisdiction-First Partitioning:** Law is geographically bound. Vaults are anchored by Geography and Courthouse, not by Practice Area.
2. **Dual-Storage Immutability:** Every ingested document yields two artifacts: an immutable raw original (PDF/Image) stored in secure blob storage, and a structured Markdown (`.md`) derivative stored in the active retrieval index.
3. **Agentic Division of Labor:** Ingestion, parsing, verification, and retrieval are handled by discrete, specialized micro-agents (OCR, Integrity, Assistant) overseen by a Supervisor routing agent.
4. **Zero-Trust Ingestion:** All user uploads land in an isolated sandbox. Documents must pass malware scanning and form-to-document metadata verification before OCR and indexing.

---

## 2. JURISDICTION-FIRST MICRO-VAULT TOPOLOGY

The `authority_corpus` and `tenant_corpus` are partitioned using a materialized path tree structure (`path` column) utilizing PostgreSQL's `ltree` extension. 

Crucially, the hierarchy is anchored by **Geography and Jurisdiction**, not by Practice Area. An attorney in New York requires seamless cross-practice access to NY procedural law rather than cross-state access to a single practice area.

**Topology Path Structure:**
`ROOT / [Federal|State] / [State Code] / [County] / [Courthouse or Agency] / [Practice Area]`

**State Court Topology Example:**
*   `ROOT / State / NY` *(State Vault - Substantive NY Law, CPLR)*
    *   `ROOT / State / NY / Kings` *(County Vault - Kings County ordinances)*
        *   `ROOT / State / NY / Kings / Supreme_Civil` *(Courthouse Vault - E-file rules, Judge Part rules)*
            *   `ROOT / State / NY / Kings / Supreme_Civil / Personal_Injury` *(Practice Vault - Pleadings, tort precedents)*
            *   `ROOT / State / NY / Kings / Supreme_Civil / Real_Estate` *(Practice Vault - Foreclosure, title actions)*

**Federal Court Topology Example:**
*   `ROOT / Federal / District_Courts / SDNY` *(Courthouse Vault - Southern District of NY Local Rules)*
    *   `ROOT / Federal / District_Courts / SDNY / Bankruptcy` *(Practice Vault)*

When a user queries a Kings County Personal Injury matter, the Supervisor Agent constrains the vector search space to `path @> 'ROOT.State.NY.Kings.Supreme_Civil.Personal_Injury'`, inherently inheriting all parent courthouse and state-level procedural rules while filtering out irrelevant jurisdictions.

---

## 3. ZERO-TRUST INGESTION & VERIFICATION PIPELINE

```text
[User Upload Form] ──> [Quarantine Sandbox] ──> [Verification Agent] ──> [OCR Agent] ──> [Integrity Agent] ──> [Micro-Vault]

Stage 1: Structured Intake & Sandbox Quarantine
The UI Form: The user uploads a file and is forced to declare deterministic metadata: Filing Number, Case Name, Document Type (e.g., Complaint, Verified Bill of Particulars), and Practice Area/Jurisdiction.

The Sandbox: The raw file is placed in a quarantined Supabase Storage bucket. A serverless function executes a ClamAV/malware scan. Infected files are purged immediately.

Stage 2: Form-to-Document Verification Agent
A specialized LLM agent reads the first 3 pages of the quarantined document and compares it strictly to the user's declared form data.

Validation: Does the caption actually state "Kings County Supreme Court"? Does the document type match "Complaint"? If there is a mismatch, the agent pauses ingestion and flags it for human correction.

Stage 3: The OCR & Structuring Agent
Upon verification, the document passes to an OCR/Vision pipeline. It extracts tables, headers, and paragraphs, formatting them strictly into Markdown (.md).

Markdown preserves hierarchical headings, making semantic chunking deterministic and boundary-aware, avoiding the context-destruction of raw text dumping.

Stage 4: The Vault Integrity Agent (Gatekeeper) & Dual-Storage
The Integrity Agent performs a final semantic check ensuring the .md chunks logically align with the expected structure of the raw file.

Dual-Storage Execution: The immutable original file is moved to the reference_vault (for court exhibits and auditing), and the generated .md file is committed to the working_vault.

The chunks are embedded and indexed into the precise jurisdictional ltree path.

---

## 4. DATABASE SCHEMA EXTENSIONS (SUPABASE)

-- Enable LTREE Extension for Hierarchical Pathing
CREATE EXTENSION IF NOT EXISTS ltree;

-- Add Pathing to Vault Domains
ALTER TABLE vault_domains ADD COLUMN path ltree;
CREATE INDEX path_gist_idx ON vault_domains USING GIST (path);

-- Zero-Trust Ingestion Queue
CREATE TABLE document_ingestion_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid REFERENCES users(id),
  matter_id uuid REFERENCES matters(id),
  declared_metadata jsonb NOT NULL,      -- User's form inputs (Filing #, Case Name, Doc Type)
  raw_storage_path text NOT NULL,        -- Pointer to quarantine sandbox bucket
  md_storage_path text,                  -- Pointer to generated markdown
  malware_scan_status text DEFAULT 'pending' CHECK (malware_scan_status IN ('pending', 'clean', 'infected')),
  verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'mismatch', 'rejected')),
  target_vault_path ltree NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Dual-Storage Reference Linking in the Tenant Corpus
ALTER TABLE tenant_corpus 
  ADD COLUMN raw_reference_path text NOT NULL,  -- Immutable original file (Reference Folder)
  ADD COLUMN md_working_path text NOT NULL;     -- The machine-readable file (Working Folder)

## 5. AGENTIC RETRIEVAL PIPELINE (SUPERVISOR / WORKER)
When a lawyer queries /api/copilot:

Supervisor Agent (The Orchestrator): Analyzes the natural language query and the active matter context. If the query requires local procedural rules, substantive state law, and case precedent, it decomposes the request into parallel retrieval tasks.

Worker Agent 1 (Courthouse Vault): Retrieves the specific local trial rules and judge part orders (ROOT.State.NY.Kings.Supreme_Civil).

Worker Agent 2 (State Vault): Retrieves the substantive statutes (ROOT.State.NY).

Supervisor Agent (Synthesis): Cross-references the findings from the micro-vaults. If a local Kings County rule modifies a standard NY State timeline, the Supervisor synthesizes the final answer, resolving the conflict and citing both hierarchical chunks explicitly.