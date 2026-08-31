# Shtiya Builder Ecosystem v3.0 — Master Engineering Plan
## Part 1 of 3: Document Header, System Architecture & Invariants, Deliberately-Not-Built List

**Document class:** Production Engineering Blueprint — Master Plan (Modular, 3-Part Series)
**Produced by:** IBM Bob, Lead Architect & Project Manager
**Version:** 3.0 — Integrating the Core Ecosystem, Legal Workspace, and HRAG Agent Factory
**Input corpus:**
- Master Blueprints Groups 1–7, 9 (v2.0 Red-Teamed)
- `MasterBlueprint_Legal_Workspace.md` v2.0
- `MasterBlueprint_Agent_Factory_Platform.md` v2.0
- `MasterBlueprint_Hierarchical_Vault_Network.md` v2.0 (HRAG)
- `Plan.md` v2.0 (archive) — invariants I-1 through I-31 carried forward and extended

**ISO_SOC2_GATE:** ✅ All flags verified `true` across all three infrastructure blueprints
**Date:** 2026-08-20
**Companion documents:**
- `Plan_v3_Part2.md` — Database Schemas & Migration Sequences (Groups 1–9 + Legal Workspace + HRAG)
- `Plan_v3_Part3.md` — API Route Contracts, Phase Implementation Plan, Compliance Guardrails, CI Lint Inventory

> **How to read this series.** Part 1 establishes the non-negotiable architecture, invariants, and the list of capabilities that will never be built. Parts 2 and 3 depend on Part 1 in full. Any conflict between Parts 2 or 3 and Part 1 resolves in favor of Part 1. Any conflict between this plan and an upstream Master Blueprint resolves in favor of the Master Blueprint.

---

## Executive Summary

v2.0 of this plan established the 27-role Core Ecosystem — the three-pane Bloomberg Terminal shell, the Zustand Context Registry, the per-group authorization primitives, and eight group-level workspaces (Groups 1–7, 9). That work is carried forward without change.

v3.0 integrates three major infrastructure blueprints produced by the Red Team hardening cycle:

| Blueprint | What it adds to the platform |
|---|---|
| **Legal Workspace** (`MasterBlueprint_Legal_Workspace.md` v2.0) | A fully-hardened Group 4 extension: practice-area-typed data classes, unconditional dual-control trust accounting with per-client sub-ledger solvency, staged gig-service provenance rail, ethical-wall purge protocol with retroactive index invalidation, and cross-group MNPI information-barrier enforcement across Groups 2, 3, and 9. |
| **Agent Factory Platform** (`MasterBlueprint_Agent_Factory_Platform.md` v2.0) | The co-pilot infrastructure that replaces the live `src/app/api/copilot/route.ts`: physically separated authority and tenant corpora, a two-predicate retrieval model (authorization ∩ relevance), server-side grounding gate, output gate with citation entailment, and zero-tools answering model. |
| **HRAG — Hierarchical Vault Network** (`MasterBlueprint_Hierarchical_Vault_Network.md` v2.0) | Universal knowledge infrastructure spanning all 27 roles: a three-axis model (ltree containment tree + DAG authority-relations graph + authorization predicate), multi-domain topologies for Law, Standards, Investor, Classification, and per-org Tenant subtrees, a zero-trust MicroVM ingestion pipeline, and a supervisor-worker agentic retrieval architecture that enforces the caller's own RLS session at every worker. |

The resulting platform is a unified PropTech/FinTech/LegalTech/KnowledgeTech system. Its defensive posture is: **the database is the security boundary, the agent cannot take actions, and silence is preferable to a confident wrong answer.**

---

## Part I — System Architecture & Invariants

### I.A — Three-Pane Layout Topology (Carried Forward from v2.0, Unchanged)

```
src/app/(apps)/layout.tsx
  CSS Grid: grid-cols-[250px_1fr_350px] h-screen overflow-hidden
  ├── <aside>  Left Pane   (250px)  — React Server Component
  ├── <main>   Center Pane (1fr)    — Dynamic page slot; min-h-0 min-w-0 overflow-y-auto
  └── <aside>  Right Pane  (350px)  — 'use client' Co-Pilot
```

### I.B — Zero-Trust Left Pane (Carried Forward, Unchanged)

- **No `use client` directive** anywhere in `LeftSidebar.tsx`.
- Navigation tree derived **server-side** from `ROLE_APP_MAP` using the caller's `users.role` read via `@supabase/ssr` session cookies.
- Active-link styling resolved from the `x-next-pathname` header injected by `middleware.ts`. No `usePathname`.

### I.C — Hardened Zustand Context Registry (Carried Forward, Unchanged)

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
2. `prepareSendMessagesRequest` injects `{ workspaceId, propertyId, capacity, epoch }` — **no prose, no context strings**.
3. A dispatch against a null-state store is refused client-side.

### I.D — API Co-Pilot Route (Replaced by Agent Factory — See I.P)

The live `src/app/api/copilot/route.ts` that accepts a prose `context` string and interpolates it into the system prompt **is replaced entirely** by the Agent Factory pipeline. The v2.0 route contract below is retained as the authorization interface; the model-invocation path is the Agent Factory's. See I.P for the complete replacement specification.

Original authorization contract (unchanged):
1. Authenticate the caller (`createClient()` — 401 if no session).
2. Receive `{ messages, workspaceId, propertyId, capacity, epoch }` from the body.
3. Verify authorization server-side using the appropriate primitive.
4. Return `403` without invoking the model if authorization fails.
5. Select the system prompt from `capacity` **server-side** — never from client input.
6. Stream via `streamText` + `result.toDataStreamResponse()`.

### I.E — Universal Authorization Invariants (Cross-Group, Carried Forward and Extended)

| ID | Rule |
|---|---|
| **I-1** | No RLS policy uses `current_user_role_group()` for row-level access except the literal `admin` branch. Subject authorization primitives: `has_property_capacity()` (G1), `is_deal_member()` (G2), `is_facility_party()` (G3), `is_matter_party()` (G4), `is_work_package_party()` (G5), `is_design_package_party()` (G6), tenancy/engagement membership (G7/G9). The HRAG dispatcher `subject_party(kind, id)` routes through all of these. |
| **I-2** | No billing code path holds any SQL grant on any authorization table. Enforced by `REVOKE` + `assert_not_billing_actor()` trigger on all authorization tables. |
| **I-3** | `verification_tier` / trust level / credential level are monotonic-by-evidence. May only be raised by the verification service role. |
| **I-4** | `owner_investor` never resolves to RLS group `investor` and never receives the `acquisition` app segment. |
| **I-22** | No platform capability may deny, condition, or degrade a tenant's physical access to their dwelling, its utilities, or its habitability (G7 Access Floor). |
| **I-25** | Auto-approve is permitted; auto-deny is prohibited in housing screening (G7). |
| **I-31** | No commission rate is proposed, defaulted, benchmarked, or aggregated by the platform across competing brokerages (G9). |

### I.F — Multi-Agent Supervisor-Worker Topology

The HRAG retrieval layer uses a three-tier agentic model. **The caller's own RLS session is the security boundary at every tier** — no tier may hold more authority than its principal.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ROUTE  /api/copilot   (caller's RLS session — SECURITY INVOKER)     │
│                                                                       │
│  1. resolve subject binding  →  subject_party(kind, id)  →  403/404  │
│  2. compute SCOPE_SET server-side from DB rows (ltree nodes)          │
│     — never from `capacity` string, never from the NL query           │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │  scope_set (closed, server-immutable)
┌───────────────────────────────────▼──────────────────────────────────┐
│  SUPERVISOR (planner model — no tools, no content)                    │
│  · input:  the user query + SCOPE_SET node LABELS + as_of date        │
│  · output: a plan selecting ≤ N branches FROM scope_set               │
│  · a plan naming any path outside scope_set is DISCARDED;             │
│    the deterministic fallback plan executes (I-H15)                   │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │
               ┌────────────────────┼────────────────────┐
               ▼                    ▼                    ▼
          ┌─────────┐          ┌─────────┐          ┌─────────┐
          │ WORKER  │          │ WORKER  │          │ WORKER  │
          │ lineage │          │ subtree │          │ org     │
          │ NY.CPLR │          │ Div_03  │          │ subtree │
          └────┬────┘          └────┬────┘          └────┬────┘
               │  Each executes match_hrag_chunks() under the
               │  CALLER'S session (SECURITY INVOKER). No worker
               │  holds a grant the caller lacks. (I-H14)
               └────────────────────┬────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MERGE + PRECEDENCE  (deterministic — authority_relations DAG)        │
│  · dedupe · rerank · apply I-H7/I-H8 precedence                       │
│  · conflicts detected in code, not by the model (I-H8)                │
│  · undetermined precedence → present both chunks with labels (I-H8)   │
└───────────────────────────────────┬──────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  GROUNDING GATE  (3-way fallback: §I.L below)                         │
│  SYNTHESIS       (envelope-delimited context; no tools; content       │
│                   never in system role — I-A1, I-A2)                  │
│  OUTPUT GATE     (citation check · entailment check ·                 │
│                   exfil-channel strip · tool-shape strip)             │
└──────────────────────────────────────────────────────────────────────┘
```

**Confused-deputy control.** The supervisor receives node *labels*, not chunk *content*. Its output is a selection from a closed, server-computed set. A fully-compromised planner can at worst choose a suboptimal subset of what the caller was already authorized to read.

### I.G — ltree / DAG Hierarchical Vault Structure

The knowledge infrastructure has three orthogonal axes. None substitutes for either of the other two.

```
AXIS 1 — CONTAINMENT           ltree `path`
  "Where does this artifact live in an administrative hierarchy?"
  Strict tree. One parent per chunk. Answers: inheritance scope, lineage
  retrieval, index partitioning. I-H1 through I-H6.

AXIS 2 — AUTHORITY RELATIONS   `authority_relations` edge table (DAG)
  "What governs what?"
  Relations: adopts · amends · supersedes · binds · persuasive_to ·
  preempted_by · incorporates_by_reference · implements.
  Answers: precedence, conflict resolution, the model-code adoption
  problem, appellate binding. THIS IS THE AXIS THE DRAFT MISSED.

AXIS 3 — AUTHORIZATION         owner_org_id · visibility · disclosure grants
  "Who may read this?"
  Inherited from the Agent Factory blueprint. Intersected with Axis 1,
  never substituted. A path is a RELEVANCE statement, never an ACL.
```

Root tree structure:

```
ROOT  (structural — no retrievable content at or above this level)
├── Law              enacted law, regulation, official interpretation, agency guidance
│   └── US
│       ├── Federal
│       └── <STATE>              NY, CA, FL, TX, ...
├── Standards        PUBLISHED MODEL STANDARDS — authoritative nowhere until adopted
│   ├── ICC · NFPA · ASHRAE · ACI · ASTM · ANSI · ISO
├── Investor         CONTRACTUAL OVERLAYS — binding by contract, not by law
│   ├── FannieMae · FreddieMac · FHA · VA · GinnieMae
├── Classification   INDEX AXES — not authority; referenced via topic_paths[] only
│   ├── CSI (MasterFormat, UniFormat) · Omniclass · NAICS
└── Org              TENANT SUBTREES — one root per firm; never shared
    └── o_<32-hex>
```

Key structural invariants:
- **I-H2**: No chunk may be filed above its domain's inheritance floor. `ROOT`, `ROOT.Law`, `ROOT.Standards`, `ROOT.Investor`, `ROOT.Classification`, `ROOT.Org` are structural nodes. **No retrievable content at or above them.** This closes the broadcast-amplification attack vector.
- **I-H7**: A model-standard chunk (`ROOT.Standards.*`) can never ground a jurisdiction-specific answer unless an `adopts` edge exists from that jurisdiction to that exact version. Where an `amends` edge also exists, the amendment governs and **both are cited**.
- **I-H11**: A tenant chunk's `path` is a descendant of its own org root (`ROOT.Org.<org_label>`), enforced by trigger. Tenant content is **never** filed at a shared jurisdictional or classification node.
- **I-H13**: Cross-party access is granted **only** through `corpus_disclosures`, bound to a shared subject and validated through the `Plan.md` §I.E primitives. Disclosure is read-through, never copy — so revocation is real.

### I.H — MicroVM Zero-Trust Ingestion Pipeline

No parser, renderer, OCR engine, or model touches an uploaded byte outside the sandbox. The sandbox has **no network egress and no platform credentials** (I-H17).

```
STAGE 0  INTAKE           typed declaration; subject-bound; size/count budgeted
          403 before a byte is stored if the caller is not a subject party

STAGE 1  QUARANTINE       content-addressed write to isolated bucket
          No parser has run. No model has run. Not yet readable by the tenant.

STAGE 2  STATIC VALIDATION  ← deterministic, no model, no parser execution
          magic-byte sniff → single allow-listed type
          POLYGLOT NEGATIVE TEST: must NOT also parse as a second type (I-H18)
          structural limits: size, page count, compression ratio, nesting depth
          ClamAV signature scan (known malware only — correctly scoped)

STAGE 3  SANDBOXED RECONSTRUCTION  ← microVM, no egress, no credentials, ephemeral
          render/re-encode to a clean artifact. Active content is DESTROYED BY
          RECONSTRUCTION, not detected: no JS, no OpenAction, no Launch, no
          embedded files, no external entities, no macros, no scripted SVG, no XMP.
          Output: normalized PDF + page rasters + text layer.

STAGE 4  EXTRACTION        OCR / vision / table extraction, still inside the sandbox.
          Output: Markdown + STRUCTURED FACT SET (numerals, dates, currency,
          citations, defined terms, table cell counts).

STAGE 5  DETERMINISTIC FIDELITY GATE  ← code, not a model
          page count, numeral round-trip, currency round-trip, citation round-trip,
          table cell-count round-trip. A dropped decimal point is a HARD FAIL. (I-H22)

STAGE 6  FIELD EXTRACTION AGENT  ← a model EXTRACTS; it does not DECIDE (I-H20)
          returns typed fields + confidences. Comparison to the declaration is
          performed by deterministic code. No model verdict is ever a gate.

STAGE 7  INJECTION SCREEN + NEUTRALIZE  (Agent Factory §II.3)
          Applied to the extracted Markdown.

STAGE 8  PROMOTION  → the org's own subtree ONLY (I-H21)
          Nothing auto-files into ROOT.Law.* or ROOT.Standards.*; those accept
          writes exclusively from the Agent Factory publishing pipeline.
```

### I.I — Legal Workspace — Trust Architecture Invariants

The following invariants govern all `trust_ledger` writes. They are testable database constraints, not prose policies.

| ID | Rule |
|---|---|
| **I-L1** | Every trust disbursement carries a maker and a checker who are **distinct natural persons** (distinct `identity_subject_id`, not merely distinct `user_id`). There is no amount below which the second key is optional. |
| **I-L2** | No client's trust balance may go negative at any instant. Per-client sub-ledger solvency is a database constraint (`check (balance_cents >= 0)`), not a report. |
| **I-L3** | Platform fees, subscription charges, processor fees, and chargebacks **never** touch trust principal, at any amount, by any path. The only permitted debit kinds are: `client_disbursement`, `approved_settlement_line`, `earned_fee_transfer`, `court_ordered_payment`, `interpleader_deposit`, `interest_remittance`, `contra_reversal`. |
| **I-L4** | The trust ledger is append-only and hash-chained. Correction is by contra-entry. A row rewritten out-of-band is detectable. |
| **I-L5** | No external actor holds pull (debit) authority over a trust account. The platform never stores a credential capable of initiating a debit against one. Debit-block attestation is required and re-attested quarterly. |
| **I-L6** | Earned-fee transfer requires an invoice that has been delivered to the client with the notice period elapsed, and can never exceed that invoice's unbilled-against remainder. |

### I.J — Legal Workspace — Privilege & Isolation Invariants

| ID | Rule |
|---|---|
| **I-L7** | Every matter-scoped table routes reads through `is_matter_party()`. A table added without it fails CI. |
| **I-L8** | Every row of practice-area data carries a `data_class`. Reading a class requires the facet **and** a class grant. Matter membership alone grants nothing above `class_general`. |
| **I-L9** | The privilege holder is resolved dynamically through `privilege_successions`. A Chapter 7 trustee, executor, or surviving entity can become the holder; a static `privilege_holder_id` is not authoritative on its own. |
| **I-L10** | A user holding an active MNPI designation cannot hold an active acquisition, brokerage, or capital session against any counterparty inside that designation's cluster. Enforced via `on_restricted_list()` predicate applied to Groups 2, 3, and 9 tables. |
| **I-L11** | Existence is a protected fact. A matter a caller cannot read is indistinguishable from a matter that does not exist, in every surface including counts, aggregates, calendars, notifications, search, and error codes. |

### I.K — Legal Workspace — Ethical Wall Invariants

| ID | Rule |
|---|---|
| **I-L12** | A wall overrides every grant. There is no role, seat, entitlement, or admin branch that reads through an active wall. The service role is not an exception. |
| **I-L13** | Walls have scope: `matter`, `client`, or `cluster`. A new matter opened for a walled client inherits the wall at intake, by trigger, before the matter row is visible. |
| **I-L14** | Every service-role code path that touches a matter-scoped table re-asserts the wall predicate explicitly. Service-role usage is inventoried and lint-enforced. |
| **I-L15** | Wall erection is retroactive to the index. Within 60 seconds: screened user's retrieval index rows, transcript partitions, cached prompt prefixes, and provider-side context caches for that matter are purged or key-rotated; live sessions are epoch-fenced closed. Prior access is preserved as `wall_prior_access` (for disclosure, not concealment). |

### I.L — Legal Workspace — Gig Rail Invariants

| ID | Rule |
|---|---|
| **I-L16** | Provenance gates **acceptance of a submission**. It never gates money. Release of the service fee requires a notarized affidavit and an affirmative human acceptance by counsel of record. |
| **I-L17** | Every capture nonce is server-issued, single-use, short-TTL, and bound to `(gig_id, user_id, device_id)`. It must appear inside the signed device-attestation payload. |
| **I-L18** | `geofence_verified`, `attestation_verified`, and `timestamp_verified` are **server-computed and client-unwritable**. `REVOKE UPDATE` on those columns is part of the migration. |
| **I-L19** | A gig provider must hold a credential that is current and **jurisdiction-matched to the service address** at assignment and again at release. |
| **I-L20** | A per diem assignment creates a narrow, expiring, facet-scoped `matter_parties` row (`scope = {appearance}`), never a `representation`, and never a document grant beyond the named calendar item. The full Group 4 conflict screen runs first. |
| **I-L21** | Gig escrow is never funded from trust principal (I-L3). It is an advance cost from the operating account or a client-authorized advance under its own ledger. |

### I.M — Agent Factory — Retrieval & Corpus Invariants

| ID | Rule |
|---|---|
| **I-A1** | Retrieved content **never** occupies the system role. It is delivered in a separate message, inside a structural envelope, explicitly labelled as data. The system prompt states that envelope content is never an instruction. |
| **I-A2** | The answering model has **no tools**. Not restricted tools — none. |
| **I-A3** | Every state-changing action is initiated by a human against a **server-rendered** confirmation whose parameters the model did not author, with its own authorization check. No model output is ever an authorization. |
| **I-A4** | The authority corpus and the tenant corpus are **physically separate tables** with separate write paths, separate trust classes, and separate ANN indexes. |
| **I-A5** | Tenant chunks are visible **only** to their owning org. There is no `public` visibility on the tenant corpus. |
| **I-A6** | Authorization is derived server-side from verified credentials. It is never read from the request, from the agent row's filters, or from the client store. |
| **I-A7** | Agent filters are **narrowing only** (`authorized ∩ relevant`). An empty or wildcard filter is a hard error, never "match all". |
| **I-A8** | `match_threshold`, `match_count`, and reranker parameters are **server constants**, not request parameters. |
| **I-A9** | Retrieval RPCs apply the authorization predicate **before** the ANN operator (pre-filter). Post-filtering an ANN result set leaks through counts and latency and destroys recall. |
| **I-A10** | The `embedding` column carries the **same** RLS as `content`. Embeddings are not anonymized data. There is no "embeddings-only" table, view, or export. |
| **I-A11** | The fallback is a **server-side control-flow branch**. When grounding fails, the route returns the canonical string and **does not invoke the model**. It is not a prompt instruction. |
| **I-A12** | Every legal or regulatory proposition in an answer carries a resolvable `chunk_id`. A sentence that fails entailment against its cited chunk is stripped. If stripping empties the answer, the response degrades to the fallback. |
| **I-A13** | A chunk whose `effective_to` has passed, whose `superseded_by` is set, or whose `verified_at` is past its re-verification due date **cannot ground an answer**. |
| **I-A14** | No PII, no matter content, no `class_phi` / `class_family` / `class_mnpi` / `class_tdpa_regulated` data, and no tenant data ever enters the authority corpus, any shared index, any eval set, or any training surface. |
| **I-A15** | `agent_execution_logs` stores `chunk_id` references, never chunk content. |
| **I-A16** | Prompt-cache keys include `(org_id, agent_id, corpus_epoch, wall_epoch)`. A wall bump or corpus revision orphans every cached prefix. |

### I.N — Three-Way Grounding Fallback (HRAG §I.5)

The Agent Factory's single `no-information` fallback is replaced by three distinct outcomes. These must never render identically to the user.

| Fallback code | Meaning | Safe to interpret as "no such rule"? |
|---|---|---|
| `no_authority_on_point` | Corpus is covered for this jurisdiction; nothing matched the query. | **Yes** |
| `coverage_incomplete` | Corpus does not claim to cover this jurisdiction or instrument set. | **No** — it means "we don't know" |
| `scope_denied` | Existence-protected; the result would be a 403/404. | **No** |

The `coverage_incomplete` path is triggered by unsatisfied **coverage assertions** — per-domain, per-jurisdiction declarations of which instrument sets must be present and current. A query into a jurisdiction with an unsatisfied coverage assertion returns `COVERAGE_INCOMPLETE`, never the `no_authority_on_point` fallback.

### I.O — HRAG Core Invariants (Topology, Authority, Isolation, Ingestion)

The full invariant sets I-H1 through I-H23 from `MasterBlueprint_Hierarchical_Vault_Network.md` §I.3 govern this plan in their entirety and are incorporated by reference. Key invariants most likely to be violated in implementation are restated here:

- **I-H3**: Path labels are produced **only** by `normalize_label()`. Two ingestion paths that each "handle" label normalization independently produce divergent labels and silently split the subtree. `Miami-Dade County` → `Miami_Dade_County`, **always, from the function, nowhere else.**
- **I-H5**: Version is a **pinned path label** (`IBC.2021`), never a wildcard. No retrieval may return two versions of the same instrument in one result set without an explicit `compare_versions` request.
- **I-H14**: Every worker agent executes under the **caller's own RLS session**. No worker holds a grant the caller lacks.
- **I-H16**: Existence is protected at the vault level. A denied vault is indistinguishable from an empty one in plan narration, counts, latency, and citations.
- **I-H22**: Markdown fidelity is checked **deterministically**: page count, extracted numerals, currency amounts, dates, citation tokens, defined terms, and table cell counts must round-trip. A dropped decimal point is a hard failure, not a semantic judgment.
- **I-H23**: The raw artifact is content-addressed (`sha256`), write-once, and hash-verified on every read.

### I.P — The Corrected Co-Pilot Pipeline (Agent Factory Replacement)

This is the corrected pipeline that replaces the live route. The existing `context` prose interpolation is removed; the authorization interface from I.D is retained.

```
PUBLISHING PIPELINE   authority_corpus
(editorial, signed)   statutes · local rules · codes · forms
─────────────────────> trust_class = 'authority'
 source URL + hash     owner_org_id IS NULL
 + publisher + human                          visibility: public/
 approval + effective                         verified/attorney
 dates                 effective_from / effective_to / superseded

TENANT UPLOAD         tenant_corpus
(untrusted, isolated) firm playbooks · templates · OCR extracts
─────────────────────> trust_class = 'tenant'
 injection screen +    owner_org_id = <firm>   NEVER cross-tenant
 neutralization +
 quarantine

               RETRIEVAL — two predicates, intersected
               AUTHORIZATION  vault_visible_to(uid)     ← server-derived
                              + org membership
                              + Legal Workspace walls
                       ∩
               RELEVANCE      agent's typed filters      ← user-chosen,
                              (narrowing only)             narrowing only

               GROUNDING GATE (server control flow)
               0 results, or top rerank < bar,
               or jurisdiction mismatch, or stale
                   ──> RETURN 3-WAY FALLBACK, MODEL NOT INVOKED

               MODEL CALL
               system  = platform instructions ONLY
               context = separate role, envelope-delimited, labelled DATA
               tools   = NONE on the answering path

               OUTPUT GATE
               citation check · entailment check ·
               exfil-channel strip · tool-shape strip
               unsupported sentence ──> degrade to fallback, never ship
```

### I.Q — The Attribution Invariant (Replaces the "Zero-Hallucination" Claim)

> **The Attribution Invariant.** Every legal or regulatory proposition in an agent's output carries a resolvable `chunk_id`, and every such sentence passes an entailment check against the chunk it cites. Sentences that fail are stripped. If stripping empties the answer, the response degrades to the canonical fallback. When grounding fails at retrieval, the model is never invoked at all.

The phrase "Zero-Hallucination RAG" is **withdrawn** from all product surfaces. Asserting it in a system that generates legal content is itself a liability. Attribution is achievable. Certainty is not.

Every generated legal artifact retains the Group 4 mandatory tag: *"Advisory Draft — Requires Final Review by Counsel of Record."*

### I.R — Degraded Operation Summary (Composite)

| Failure | Behaviour |
|---|---|
| Attestation vendor unreachable | Gig submissions queue as unverified; no attempt fee releases; no rejection. Never fail-open to "verified". |
| Embedding provider unreachable | Retrieval fails → canonical fallback. Never answer un-grounded. |
| Reranker unavailable | Fall back to raw similarity with a **higher** bar; mark `grounding_degraded: true`. Never silently lower the bar. |
| Entailment checker unavailable | Output ships only if every sentence carries a citation + `unverified_citations: true` tag; dispositive propositions stripped regardless. |
| Corpus re-verification job stalled | Chunks past `reverify_due` become ineligible for grounding automatically. System degrades toward silence, not stale confidence. |
| Wall epoch bump fails to propagate | Wall creation **blocks** rather than completing partially. A half-erected wall is worse than none. |
| Sandbox unavailable | Ingestion queues. No file is parsed outside the sandbox under any condition. |
| Coverage assertion unsatisfied | `422 COVERAGE_INCOMPLETE`. Never the not-found fallback. |
| One HRAG worker times out | Response marked `partial_scope` with missing branches named **by label**. A silently narrowed scope is a silently wrong answer. |
| Reconciliation break beyond tolerance | All disbursements from that trust account freeze; deposits continue; client read access unaffected. |
| Bond / E&O / licence lapse | Disbursement freeze, immediate; responsible attorney and every affected client notified. |
| Billing failure on an active matter | Pinned to free `ent.custodial`. A dunning failure never separates a client from their file or their trust reconciliation. |
| Rate budget exhausted | `429` with `Retry-After`. Never a degraded model, never a smaller `match_count`. |

---

## Part II — The Deliberately-Not-Built List

The following capabilities **must not be built**, referenced in any issue, documented in any design document, or merged in any PR. This list is invariant — it is not a backlog, it is not subject to sprint prioritization, and it does not expire.

Items 1–16 are carried forward from `Plan.md` v2.0 §VIII.2, unchanged. Items 17–19 are new, added by the Red Team blueprints.

---

### Items 1–16 (Carried Forward from v2.0)

1. **Distress heatmap / Macro-Distress Map** — withdrawn G2, G3, G4, G9. The platform publishes no map, feed, or index that allows an investor to identify and target distressed owners at geographic scale.

2. **Subscription-gated data scope widening** — I-2 / G1-04, G2-09, G9-14. An entitlement may unlock a feature; it may never widen the set of rows a user is authorized to read. Billing is not an authorization primitive.

3. **Drag-along / holdout elimination for consumer homeowners** — G1-10, G2-21. No assembly or deal mechanic on this platform may be used to compel a non-consenting consumer homeowner to sell, transfer, or encumber their residence.

4. **Per-HELOC referral bounty** — G1-06, G9-21. RESPA §8 prohibits fee-splitting on settlement service referrals. No referral fee, kickback, or bounty is paid or received in connection with a HELOC referral.

5. **Percentage affiliate fee on legal or settlement-service referrals** — G1-06, G3-09. Extends item 4 to all settlement services (title, escrow, attorney referral). The platform earns no percentage of a settlement service fee for making a referral.

6. **Council member voting-behaviour prediction map** — G6-04. The platform publishes no map or index of elected officials' predicted votes on land use, zoning, or related matters.

7. **Data Room Access Escrow** — G9-18. Withdrawn. No mechanism exists on this platform by which access to a data room or document set is contingent on payment, deposit, or escrow.

8. **Smart-lock manager-initiated lockout or utility cutoff** — I-22 Access Floor. The platform never issues, relays, or enables a command that locks a tenant out of their dwelling or interrupts its utilities, under any circumstance, at any billing state.

9. **Advance fees for loss-mitigation services** — G1-07, G4-12. The platform does not accept, facilitate, or process advance fees for loss-mitigation or foreclosure-defense services. Fees in this context are earned only after the service is performed.

10. **Self-executing arbitral awards** — G4-02. No arbitral award on this platform self-executes or triggers an automatic fund movement. Release requires staged-release confirmation: undisputed baseline released on award; contested delta requires the confirmation window. A custodian effects release; the platform does not.

11. **Cross-manager rent benchmarks** — G7-30. The platform produces no benchmark, index, suggested rent, or comparable-rent figure derived from the rent data of any other manager or tenant on the network. Algorithmic price coordination is prohibited.

12. **Demand-forecasting heatmap from network-wide BoQs** — G5-10/G5-11. Bill-of-quantities data submitted by contractors on this platform is never aggregated into a demand forecast, material-cost index, or supply-chain intelligence product accessible to competitors.

13. **"Distress Interception" premium tier** — G9-13. Withdrawn twice, now invariant. No feature, tier, or product on this platform is positioned as a tool for identifying or contacting distressed property owners before they engage counsel or list their property.

14. **Cross-brokerage commission rate aggregates or defaults** — I-31, G9-08/G9-12. No commission rate is proposed, defaulted, benchmarked, or aggregated across competing brokerages by any component of this platform, including the Co-Pilot, the auto-populate logic, and any ML model.

15. **Raw open-banking transaction stream delivered to any landlord surface** — G7-05. The platform does not deliver a tenant's raw transaction history to a landlord, property manager, or any other party. Verification is performed by a neutral service; the conclusion is shared, not the stream.

16. **Auto-deny in housing screening** — I-25. Auto-approve is permitted for applications that clear all criteria. Auto-deny is not permitted for any reason. A denial decision requires a human review, the adverse-action notice workflow, and a documented basis.

---

### Items 17–19 (New — Added by the Red Team Blueprints)

17. **No flat-file RAG** — There is no flat-file, single-table, or undifferentiated RAG corpus on this platform. The authority corpus and the tenant corpus are physically separate tables with separate write paths, separate trust classes, and separate per-visibility ANN indexes (I-A4, I-A5). A query does not join across them into a single ranked result set without labelling each chunk's trust class in the envelope. The draft `shtiya_vault` single-table design is superseded and must not be re-introduced.

18. **No third-party wrappers like Google Docs in V3** — No V3 feature relies on a third-party document editing service (Google Docs, Microsoft 365, Notion, etc.) as a storage layer, a co-editing surface, or a data source for the Vault. Document content enters the platform through the zero-trust ingestion pipeline (§I.H) or through the authority publishing pipeline. It does not enter via a foreign API that the platform does not control. This restriction is reviewed at V4 planning.

19. **No cross-tenant embedding-only views** — There is no view, export, API endpoint, background job, or materialized table that presents embeddings from multiple tenants' content without enforcing per-tenant ownership predicates equivalent to the full `owner_org_id` RLS policy. Embeddings from tenant content are not anonymized (I-A10): text is partially reconstructable from a dense embedding. A "vectors only" export is a partial content disclosure. It is not built.

---

*End of Part 1. Part 2 covers the complete database schema and migration sequences for all three infrastructure layers (Core Ecosystem v2.0 + Legal Workspace + HRAG), numbered in deployment order. Part 3 covers API route contracts, phased implementation checklist, compliance CI guardrails, and residual risk inventory.*
