# Shtiya Builder Ecosystem v3.0 — Master Engineering Plan
## Part 3 of 3: API Route Contracts, CI Guardrails, Phased Implementation & Final Sign-off

**Document class:** Production Engineering Blueprint — Master Plan (Modular, 3-Part Series)
**Produced by:** IBM Bob, Lead Architect & Project Manager
**Version:** 3.0
**Depends on:** `Plan_v3_Part1.md` (invariants) · `Plan_v3_Part2.md` (schemas)
**This document:** API contracts, CI lint rules, telemetry, phased rollout, final sign-off

---

## Overview

This is the final part of the three-part Master Engineering Plan for Shtiya Builder v3.0. It covers:

- **Part I** — API & Route Contracts (replacement `/api/copilot`, Supervisor-Worker routing, Output Gates, Legal Workspace routes, Agent lifecycle routes, Zero-Trust MicroVM ingestion route)
- **Part II** — CI Guardrails & Telemetry (17-rule lint inventory, observability spec)
- **Part III** — Phased Implementation Rollout (4 phases, concrete milestones)
- **Part IV** — Final Sign-off (residual risk inventory, blocking items, acceptance criteria, compliance maps)

All invariant references (I-A1–I-A16, I-H1–I-H23, I-L1–I-L21, I-1–I-31) trace to `Plan_v3_Part1.md`. All table and function references trace to `Plan_v3_Part2.md`.

---

## Part I — API & Route Contracts

### §I.1 — Architectural Preamble: Route Taxonomy

All routes in v3.0 fall into one of five categories:

| Category | Path Prefix | Auth Model | Notes |
|---|---|---|---|
| **Copilot (Agent)** | `/api/copilot` | Supabase JWT + RLS | Replaces the broken `{ messages, context }` pattern |
| **Legal Workspace** | `/api/legal/*` | JWT + matter party check | All routes wall-checked |
| **Vault / Ingestion** | `/api/vault/*` | JWT + org membership + MicroVM proof | Zero-trust ingest pipeline |
| **Agent Lifecycle** | `/api/agents/*` | Service key (server-only) | Create / pause / drain agents |
| **Webhooks** | `/api/webhooks/*` | HMAC signature verification | Stripe, IDV vendor, chain oracle |

**Global invariants applying to all routes:**
- `I-A14`: Every route that touches corpus data must emit an `X-Request-Id` header and log to `agent_observations`.
- `I-A15`: No route may proxy a raw model response directly to the client without passing through the Output Gate.
- `I-L11`: Any route that references a matter must return a byte-identical 404 for walled/denied matters as for non-existent matters. Response bodies must be padded to the p50 byte length of a normal 404.
- **LIVE DEFECT (must fix):** The current `src/app/api/copilot/route.ts` accepts `{ messages, context }` where `context` is a prose string interpolated into the system prompt. This violates Group 1 §II.3.4 (I-A6). The replacement route below rejects `context` with **400 PROSE_CONTEXT_FORBIDDEN**.

---

### §I.2 — `/api/copilot` — Multi-Agent Supervisor-Worker Route

**File:** `src/app/api/copilot/route.ts`

#### §I.2.1 — Request Schema

```typescript
// POST /api/copilot
// Content-Type: application/json

interface CopilotRequest {
  // Required: the closed conversation turns so far (user/assistant only)
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;

  // Required: subject context — server derives scope_set from this
  subject: {
    kind: 'property' | 'deal' | 'facility' | 'matter'
        | 'work_package' | 'design_package' | 'tenancy';
    id: string;  // UUID
  };

  // Optional: explicit agent type override (server validates against role)
  agent_type?: AgentType;

  // FORBIDDEN: the 'context' prose field is explicitly rejected (I-A6)
  // context?: string  ← DO NOT ADD. Returns 400 PROSE_CONTEXT_FORBIDDEN.
}
```

#### §I.2.2 — Response Schema

```typescript
interface CopilotResponse {
  // The assistant's final grounded turn
  content: string;

  // Grounding metadata (always present; never omitted even if empty)
  citations: Array<{
    chunk_id:   string;
    path:       string;   // ltree path of the chunk's vault node
    instrument: string;   // e.g. "CPLR §3212", "IBC 2021 §1006.1"
    as_of:      string;   // ISO date — the chunk's effective_from value
    text:       string;   // verbatim excerpt (≤ 300 chars)
  }>;

  // 3-way fallback signal (I-A11, I-H22)
  // Exactly one of these will be true if grounding was incomplete
  fallback?: 'no_authority_on_point' | 'coverage_incomplete' | 'scope_denied';

  // Output gate results (always present for observability)
  gates: {
    citation_passed:    boolean;
    entailment_passed:  boolean;
    jurisdiction_passed: boolean;
    exfil_strip_applied: boolean;
    tool_shape_strip_applied: boolean;
  };

  // Request tracing
  request_id: string;
  agent_type:  string;
  latency_ms:  number;
}
```

#### §I.2.3 — Handler Implementation

```typescript
// src/app/api/copilot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runOutputGate } from '@/lib/agent/output-gate';
import { buildScopeSet } from '@/lib/agent/scope-set';
import { resolveAgentType } from '@/lib/agent/type-resolver';
import { supervisorRoute } from '@/lib/agent/supervisor';
import { emitObservation } from '@/lib/agent/observability';

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startMs   = Date.now();

  // ── 1. Parse & validate ─────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // LIVE DEFECT FIX: reject the legacy prose context field (I-A6, Group 1 §II.3.4)
  if (typeof body === 'object' && body !== null && 'context' in body) {
    return NextResponse.json(
      { error: 'PROSE_CONTEXT_FORBIDDEN',
        detail: 'The context field is not accepted. Use subject.kind + subject.id.' },
      { status: 400 }
    );
  }

  const parsed = parseCopilotRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { messages, subject, agent_type: requestedType } = parsed.value;

  // ── 2. Auth — server-derive the caller's identity (I-A7) ────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const supabase   = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: { user }, error: authError } =
    await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

  if (authError || !user) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  // ── 3. Server-compute SCOPE_SET (I-A8, I-H14) ───────────────────────────────
  // Supervisor receives labels from a closed server-computed set.
  // Out-of-set paths discard the entire plan (I-H16).
  // Pre-filter applied here; ANN operator will never post-filter (I-A9).
  const scopeSet = await buildScopeSet({
    userId:      user.id,
    subjectKind: subject.kind,
    subjectId:   subject.id,
    supabase,
  });

  if (scopeSet.denied) {
    // Existence-protect: return 404 padded to p50, not 403 (I-L11)
    return existenceProtectedNotFound(requestId);
  }

  // ── 4. Resolve agent type (I-A1) ────────────────────────────────────────────
  // Agent type is resolved server-side from the user's role binding.
  // A requested type override is validated against the allowed set for that role.
  const agentType = await resolveAgentType({
    userId:        user.id,
    scopeSet,
    requestedType,
    supabase,
  });

  if (!agentType) {
    return NextResponse.json({ error: 'NO_ELIGIBLE_AGENT' }, { status: 403 });
  }

  // ── 5. Supervisor-Worker dispatch (I-H13, I-H16) ────────────────────────────
  // Supervisor receives: agentType, scopeSet (labels only), last user message.
  // Supervisor NEVER receives corpus content (I-A6).
  // Worker retrieval is pre-filtered by scopeSet (I-A9).
  const rawResponse = await supervisorRoute({
    agentType,
    scopeSet,
    messages,
    userId: user.id,
    requestId,
    supabase,
  });

  // ── 6. Output Gate (§I.3) ───────────────────────────────────────────────────
  const gateResult = await runOutputGate({
    raw:        rawResponse,
    agentType,
    scopeSet,
    requestId,
  });

  // ── 7. Emit observability (I-A14) ───────────────────────────────────────────
  await emitObservation({
    requestId,
    userId:     user.id,
    agentType,
    subjectKind: subject.kind,
    subjectId:  subject.id,
    latencyMs:  Date.now() - startMs,
    gateResult,
    supabase,
  });

  // ── 8. Return ────────────────────────────────────────────────────────────────
  const response: CopilotResponse = {
    content:    gateResult.content,
    citations:  gateResult.citations,
    fallback:   gateResult.fallback,
    gates:      gateResult.gates,
    request_id: requestId,
    agent_type: agentType,
    latency_ms: Date.now() - startMs,
  };

  return NextResponse.json(response, {
    headers: { 'X-Request-Id': requestId },
  });
}

// ── Existence protection helper (I-L11) ────────────────────────────────────────
// Returns a 404 that is byte-identical to a normal not-found response,
// padded to the p50 byte length (512 bytes) to prevent timing side-channels.
function existenceProtectedNotFound(requestId: string) {
  const body = JSON.stringify({ error: 'NOT_FOUND' });
  const pad  = ' '.repeat(Math.max(0, 512 - body.length));
  return new NextResponse(body + pad, {
    status:  404,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  });
}
```

---

### §I.3 — Output Gate

**File:** `src/lib/agent/output-gate.ts`

The Output Gate is the mandatory post-processing pipeline that every raw model response must pass through before being returned to the client. It consists of five sequential checks. Any check failure either strips the offending content or triggers a fallback. No raw model response ever bypasses the gate (I-A15).

#### §I.3.1 — Gate Architecture

```
Raw Model Response
        │
        ▼
  ┌─────────────┐   fail (no citations)
  │  Citation   │──────────────────────► fallback: no_authority_on_point
  │   Check     │
  └──────┬──────┘
         │ pass
         ▼
  ┌─────────────┐   fail (claim exceeds grounding)
  │ Entailment  │──────────────────────► strip unsupported claim segments
  │   Check     │
  └──────┬──────┘
         │ pass / stripped
         ▼
  ┌─────────────┐   fail (out-of-jurisdiction citation)
  │Jurisdiction │──────────────────────► strip or flag + log
  │   Check     │
  └──────┬──────┘
         │ pass / stripped
         ▼
  ┌─────────────┐   triggered (PII/org data detected)
  │  Exfil      │──────────────────────► strip token sequences, log
  │   Strip     │
  └──────┬──────┘
         │ clean
         ▼
  ┌─────────────┐   triggered (tool invocation in prose output)
  │ Tool-Shape  │──────────────────────► strip, log TOOL_SHAPE_LEAK
  │   Strip     │
  └──────┬──────┘
         │ clean
         ▼
  Final Gated Response
```

#### §I.3.2 — Check Definitions

**Check 1: Citation Check**

- **Invariant:** I-A11 — every factual proposition must be grounded.
- **Pass condition:** The response contains ≥ 1 citation object from the retrieval pipeline, and every citation's `chunk_id` resolves to a live, non-superseded, non-expired vault node.
- **Fail action:** Set `fallback = 'no_authority_on_point'` and replace the response body with the canonical `no_authority_on_point` template (see §I.3.3). Do NOT return the raw model prose.
- **Edge case — coverage:** If `coverage_assertions` shows the relevant domain/jurisdiction assertion is `satisfied = false`, set `fallback = 'coverage_incomplete'` instead.

**Check 2: Entailment Check**

- **Invariant:** I-A12 — response claims must be entailed by cited passages.
- **Pass condition:** Each sentence-level claim in the response is semantically entailed by at least one cited chunk (verified by a deterministic entailment classifier, not the generative model).
- **Fail action:** Strip the non-entailed sentences. If > 50% of the response is stripped, elevate to `no_authority_on_point` fallback.
- **Implementation note:** Use a fine-tuned NLI classifier (cross-encoder architecture). Never use the generative model to self-verify its own entailment.

**Check 3: Jurisdiction Check**

- **Invariant:** I-H22 — a citation from jurisdiction A may not be presented as authority in jurisdiction B without explicit mapping.
- **Pass condition:** Every citation's jurisdiction label matches the `scopeSet.jurisdiction` or is tagged as `federal` / `universal_standards`.
- **Fail action:** Strip the citation. If the claim depended solely on that citation, re-evaluate entailment for the now-uncited claim (may cascade to entailment strip or fallback).

**Check 4: Exfil Strip**

- **Invariants:** I-A16, I-H18 — no org-private content or PII may transit through the model output to the client.
- **Triggered by:**
  - Regex matches for SSN, EIN, account number, routing number patterns
  - Token sequences matching `tenant_corpus` org-private content (detected via embedding similarity against the org's own corpus — a model is not used for this; it is a deterministic hash-lookup against indexed n-grams)
  - Any verbatim reproduction of a document `storage_path`
- **Strip action:** Replace the matched token sequence with `[REDACTED]`. Log `EXFIL_STRIP_TRIGGERED` to `agent_observations`.

**Check 5: Tool-Shape Strip**

- **Invariant:** I-A3 — tool invocation shapes must not appear in prose-mode responses.
- **Triggered by:** Any token sequence matching known tool-call JSON shapes (`{"tool":`, `{"function":`, `<tool_call>`, etc.) in a non-tool-use response.
- **Strip action:** Remove the token sequence. Log `TOOL_SHAPE_LEAK` to `agent_observations`. If the entire response resolves to empty after stripping, return `no_authority_on_point`.

#### §I.3.3 — Canonical Fallback Templates

The three fallback responses are strictly non-identical. `fallback-lint` (§II.3.11) verifies this at CI time.

```typescript
// src/lib/agent/fallback-templates.ts

export const FALLBACK_TEMPLATES = {

  no_authority_on_point: [
    "The available legal corpus does not contain a directly applicable authority ",
    "for this question in the current jurisdiction. You should consult primary sources ",
    "or qualified counsel before relying on any position."
  ].join(''),

  coverage_incomplete: [
    "The instrument set for this jurisdiction is not yet fully indexed. The platform ",
    "cannot confirm whether an applicable authority exists. Check coverage status or ",
    "consult primary sources directly."
  ].join(''),

  scope_denied: [
    "This matter or subject is not within your current access scope. If you believe ",
    "this is an error, contact the matter's counsel of record."
  ].join(''),

} as const satisfies Record<string, string>;

// CI guard: no two templates may be identical (fallback-lint rule FL-3)
const templateValues = Object.values(FALLBACK_TEMPLATES);
if (new Set(templateValues).size !== templateValues.length) {
  throw new Error('fallback-lint: duplicate fallback template detected');
}
```

---

### §I.4 — Supervisor-Worker Routing

**File:** `src/lib/agent/supervisor.ts`

#### §I.4.1 — Supervisor Contract

The Supervisor receives a **closed, server-computed scope_set** (labels only — never corpus content) and the agent type. It generates a ranked plan consisting of retrieval sub-tasks. Plans that reference paths outside the scope_set are discarded entirely (I-H16 — no partial execution).

```typescript
// src/lib/agent/supervisor.ts

export interface SupervisorPlan {
  tasks: Array<{
    worker_kind: 'authority_retrieval' | 'tenant_retrieval' | 'synthesis';
    // path labels from scope_set only — never free-text corpus paths (I-H16)
    target_paths: string[];
    query:        string;
    // jurisdiction scoping
    jurisdiction: string;
    as_of:        string;  // ISO date — chunks past this are ineligible (I-A13)
  }>;
}

export async function supervisorRoute(params: {
  agentType:  AgentType;
  scopeSet:   ScopeSet;
  messages:   CopilotMessage[];
  userId:     string;
  requestId:  string;
  supabase:   SupabaseClient;
}): Promise<RawModelResponse> {

  const { agentType, scopeSet, messages, userId, requestId, supabase } = params;

  // ── Step 1: Planner (Supervisor LLM call) ─────────────────────────────────
  // System prompt is STATIC and role-specific. No retrieved content is ever
  // placed into the system role (I-A6).
  // The planner sees: agentType, scopeSet labels (not content), last user turn.
  const plan: SupervisorPlan = await callSupervisorLLM({
    agentType,
    scopeSet,       // labels only — paths and jurisdiction strings
    lastUserTurn:   messages.at(-1)!.content,
    requestId,
  });

  // ── Step 2: Validate plan against scope_set (I-H16) ───────────────────────
  // Any task referencing a path not in scopeSet is a discard-entire-plan event.
  for (const task of plan.tasks) {
    for (const path of task.target_paths) {
      if (!scopeSet.allowedPaths.includes(path)) {
        // Log and return scope_denied fallback — do NOT execute partial plan
        await logScopeLeak({ requestId, userId, offendingPath: path, supabase });
        return { fallback: 'scope_denied', citations: [], content: '' };
      }
    }
  }

  // ── Step 3: Execute Worker tasks (pre-filter, then ANN) ───────────────────
  // Pre-filter is applied BEFORE the ANN operator (I-A9 — never post-filter).
  const workerResults = await Promise.all(
    plan.tasks
      .filter(t => t.worker_kind !== 'synthesis')
      .map(task => executeWorkerTask({ task, userId, scopeSet, supabase }))
  );

  // ── Step 4: Synthesis (Worker LLM call) ───────────────────────────────────
  // The synthesis worker receives: retrieved chunks + citations.
  // It does NOT receive the plan's free-text reasoning (I-A6 boundary).
  const synthesisResult = await callSynthesisWorker({
    agentType,
    messages,
    retrievedChunks: workerResults.flat(),
    requestId,
  });

  return synthesisResult;
}
```

#### §I.4.2 — Worker: Authority Retrieval

```typescript
// src/lib/agent/workers/authority-retrieval.ts

export async function authorityRetrievalWorker(params: {
  task:     SupervisorPlanTask;
  userId:   string;
  scopeSet: ScopeSet;
  supabase: SupabaseClient;
}): Promise<RetrievedChunk[]> {

  const { task, userId, scopeSet, supabase } = params;

  // Call the SECURITY INVOKER RPC (I-H14 — never DEFINER on retrieval)
  // The RPC applies RLS as the calling user; pre-filter is inside the RPC.
  const { data, error } = await supabase.rpc('match_hrag_chunks', {
    p_query_embedding: await embedQuery(task.query),
    p_vault_paths:     task.target_paths,   // pre-filter (I-A9)
    p_jurisdiction:    task.jurisdiction,
    p_as_of:           task.as_of,          // date-bound (I-A13)
    p_match_count:     8,
    p_caller_id:       userId,
  });

  if (error) throw new Error(`authority_retrieval_rpc_error: ${error.message}`);
  return data ?? [];
}
```

#### §I.4.3 — Worker: Tenant Corpus Retrieval

```typescript
// src/lib/agent/workers/tenant-retrieval.ts

export async function tenantRetrievalWorker(params: {
  task:     SupervisorPlanTask;
  userId:   string;
  scopeSet: ScopeSet;
  supabase: SupabaseClient;
}): Promise<RetrievedChunk[]> {

  const { task, userId, scopeSet, supabase } = params;

  // Tenant corpus is org-scoped. Cross-tenant reads are never possible (I-A5).
  // The RPC enforces org membership via RLS on tenant_corpus.
  // No embedding-only export path exists (I-19).
  const { data, error } = await supabase.rpc('match_tenant_chunks', {
    p_query_embedding: await embedQuery(task.query),
    p_org_id:          scopeSet.orgId,        // caller's org — server-derived
    p_vault_paths:     task.target_paths,
    p_as_of:           task.as_of,
    p_match_count:     5,
    p_caller_id:       userId,
  });

  if (error) throw new Error(`tenant_retrieval_rpc_error: ${error.message}`);
  return data ?? [];
}
```

---

### §I.5 — Legal Workspace Routes

All routes in this section are protected by:
1. Supabase JWT authentication
2. `is_matter_party(matter_id)` check (server-side, via service-role supabase call)
3. `wall_blocks_user(matter_id)` check — wall takes absolute precedence (I-L12)
4. Existence protection: a denied/walled matter returns a padded 404 identical to a non-existent matter (I-L11)

#### §I.5.1 — `POST /api/legal/trust/disburse`

Initiates a trust disbursement. **Dual control is mandatory** (I-L1) — the checker must be a different natural person than the maker, verified via `identity_subjects`.

```typescript
// Request
interface TrustDisburseRequest {
  trust_account_id: string;   // UUID
  matter_id:        string;   // UUID — for wall check
  client_user_id:   string;   // UUID
  debit_kind:       TrustDebitKind;
  amount_cents:     number;
  memo?:            string;
}

// Response (202 Accepted — not 200; the checker must still act)
interface TrustDisburseResponse {
  ledger_entry_id: string;    // UUID of the pending trust_ledger row
  status:          'pending'; // always pending until checker posts
  dual_control_url: string;   // link the maker must send to the checker
  expires_at:      string;    // ISO — pending entries expire in 24h if unchecked
}
```

**Handler invariants enforced:**
- `I-L1`: Dual control — checker endpoint at `POST /api/legal/trust/check` must be called by a different user whose `identity_subject_id` does not share an `identity_subjects` row with the maker.
- `I-L3`: `debit_kind` must be in the closed enum (`client_disbursement`, `approved_settlement_line`, `earned_fee_transfer`, `court_ordered_payment`, `interpleader_deposit`, `interest_remittance`, `contra_reversal`). Any other value returns `400 INVALID_DEBIT_KIND`.
- `I-L5`: `trust_accounts.debit_block_attested` must be `true` and `debit_block_attested_at` within the last 90 days. Otherwise returns `403 DEBIT_BLOCK_NOT_ATTESTED`.
- `I-L6`: `amount_cents` must not exceed `trust_accounts.per_client_balance` for the given client. Checked via the `per_client_solvency_check()` function (installed in migration 0061). Returns `422 SOLVENCY_CHECK_FAILED`.
- Ledger is append-only: no update or delete path exists in this route.

#### §I.5.2 — `POST /api/legal/trust/check`

The checker half of the dual-control disbursement flow.

```typescript
// Request
interface TrustCheckRequest {
  ledger_entry_id: string;  // UUID of the pending trust_ledger row
  decision:        'approve' | 'reject';
  checker_notes?:  string;
}

// Response
interface TrustCheckResponse {
  ledger_entry_id: string;
  status:          'posted' | 'rejected';
  posted_at?:      string;
}
```

**Handler invariants enforced:**
- `I-L1`: Verifies `checker_id` identity subject differs from `maker_id` identity subject at the natural-person level.
- `I-L2`: Checker must hold `firm_role` of `partner`, `associate`, or `of_counsel` in the same firm as the maker. A paralegal cannot be a checker for disbursements.
- The route sets `trust_ledger.checker_id = auth.uid()` and `status = 'posted'` only on `approve`. On `reject`, status = `'reversed'` and a contra entry is written.

#### §I.5.3 — `POST /api/legal/gig/assign`

Assigns a process server or per-diem attorney to an open gig job. The server issues a single-use, short-TTL capture nonce (I-L17).

```typescript
// Request
interface GigAssignRequest {
  gig_id:      string;  // UUID
  provider_id: string;  // UUID — the process server / per-diem user
  licence_id:  string;  // UUID — must be current, jurisdiction-matched (I-L19)
}

// Response
interface GigAssignResponse {
  assignment_id:   string;
  capture_nonce:   string;   // single-use, server-generated (I-L17)
  nonce_expires_at: string;  // ISO — short TTL (default: 4 hours)
  instructions_url: string;
}
```

**Handler invariants enforced:**
- `I-L17`: `capture_nonce` is generated server-side as a cryptographically random 32-byte hex string. It is stored hashed in `gig_assignments.capture_nonce`. The plaintext is returned once and never stored.
- `I-L18`: `geofence_verified`, `attestation_verified`, and `timestamp_verified` columns are `REVOKE UPDATE` (enforced in 0060 migration). They are set only by the submission verification pipeline, never by this route.
- `I-L19`: The `professional_licences` row referenced by `licence_id` must have `standing = 'active'` and a `jurisdiction` matching the gig job's `jurisdiction`. Returns `422 LICENCE_MISMATCH`.
- `I-L20`: `matter_parties` record for the provider must have `expires_at` set (never open-ended for per-diem/process-server roles). Returns `422 EXPIRY_REQUIRED`.

#### §I.5.4 — `POST /api/legal/gig/submit`

The provider submits their service affidavit and signed attestation payload.

```typescript
// Request
interface GigSubmitRequest {
  assignment_id:       string;
  capture_nonce:       string;     // must match the issued nonce (I-L17)
  attestation_payload: object;     // signed device-attestation JSON
  affidavit_storage_path: string;  // path to notarized affidavit in object storage
}

// Response (202 — pending counsel acceptance)
interface GigSubmitResponse {
  submission_id:    string;
  status:           'submission_pending';
  acceptance_url:   string;  // for counsel of record to act on
}
```

**Handler invariants enforced:**
- `I-L16`: Provenance gates **acceptance**, never money. The route creates a `gig_submissions` row with `accepted_by = NULL`. Fee release requires a separate `POST /api/legal/gig/accept` call by counsel of record — this route never touches `gig_escrow`.
- `I-L17`: The submitted `capture_nonce` is compared against the stored hash. A mismatch returns `403 NONCE_INVALID`. A reused nonce (already consumed) returns `403 NONCE_CONSUMED`.
- `I-L21`: `gig_escrow.source_type` must be `operating_account` or `client_advance`. Any attempt to fund from `trust_ledger` returns `422 TRUST_FUNDING_PROHIBITED`.

#### §I.5.5 — `POST /api/legal/gig/accept`

Counsel of record accepts the gig submission, triggering escrow release.

```typescript
// Request
interface GigAcceptRequest {
  submission_id: string;
  decision:      'accept' | 'reject';
  notes?:        string;
}

// Response
interface GigAcceptResponse {
  submission_id: string;
  escrow_status: 'released' | 'returned';
}
```

**Handler invariants enforced:**
- Caller must be `matter_parties.matter_role = 'lead_counsel'` on the matter linked to the gig job.
- `I-L16`: Only an affirmative human acceptance triggers escrow release. The route calls the escrow-release service only on `decision = 'accept'` with a verified `affidavit_verified = true` submission.
- Wall check applied: if the matter is walled at the time of acceptance, returns padded 404.

---

### §I.6 — Zero-Trust MicroVM Ingestion Route

**File:** `src/app/api/vault/tenant-corpus/route.ts`

This route accepts documents for ingestion into the tenant corpus. Every document transits through an isolated MicroVM before any content reaches the database. The MicroVM proof (a signed execution receipt from the VM provider) must accompany each ingest request.

#### §I.6.1 — Request Schema

```typescript
// POST /api/vault/tenant-corpus
// Content-Type: multipart/form-data

// Form fields:
interface TenantCorpusIngestRequest {
  // The document to ingest
  file:              File;          // max 20 MB

  // Document metadata
  path:              string;        // ltree path — must be within caller's org scope
  effective_from:    string;        // ISO date
  effective_to?:     string;        // ISO date (omit for evergreen)
  description?:      string;

  // MicroVM execution proof (I-H6, I-H7)
  // Signed receipt from the sandboxed execution environment
  // proving the document was processed in isolation.
  microvm_proof:     string;        // base64-encoded signed receipt
  microvm_provider:  'firecracker' | 'gvisor' | 'kata';
}
```

#### §I.6.2 — Handler Implementation

```typescript
// src/app/api/vault/tenant-corpus/route.ts

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  const user = await getAuthenticatedUser(req);
  if (!user) return unauthorized(requestId);

  // ── 2. Org membership — no cross-tenant ingestion (I-A5) ─────────────────────
  const orgId = await getCallerOrgId(user.id);
  if (!orgId) {
    return NextResponse.json(
      { error: 'ORG_MEMBERSHIP_REQUIRED',
        detail: 'Tenant corpus ingestion requires org membership.' },
      { status: 403 }
    );
  }

  // ── 3. Parse multipart form ───────────────────────────────────────────────────
  const formData = await req.formData();
  const file          = formData.get('file') as File | null;
  const path          = formData.get('path') as string | null;
  const effectiveFrom = formData.get('effective_from') as string | null;
  const effectiveTo   = formData.get('effective_to') as string | null;
  const microvmProof  = formData.get('microvm_proof') as string | null;
  const microvmProvider = formData.get('microvm_provider') as string | null;

  if (!file || !path || !effectiveFrom || !microvmProof || !microvmProvider) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  // File size guard
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE', limit_mb: 20 }, { status: 413 });
  }

  // ── 4. Validate MicroVM proof (I-H6, I-H7) ───────────────────────────────────
  const proofValid = await verifyMicrovmProof({
    proof:    microvmProof,
    provider: microvmProvider,
    fileHash: await sha256(await file.arrayBuffer()),
  });

  if (!proofValid) {
    return NextResponse.json(
      { error: 'MICROVM_PROOF_INVALID',
        detail: 'The MicroVM execution receipt is invalid or does not match the file.' },
      { status: 422 }
    );
  }

  // ── 5. Path ownership — caller's org only (I-A5) ────────────────────────────
  const pathAllowed = await assertPathWithinOrg({ path, orgId });
  if (!pathAllowed) {
    return NextResponse.json(
      { error: 'PATH_OUT_OF_SCOPE',
        detail: 'The provided ltree path is not within your organization scope.' },
      { status: 403 }
    );
  }

  // ── 6. PII screen (vault-pii-lint runtime equivalent) ───────────────────────
  // The MicroVM already ran the PII screen; we verify the proof attests to it.
  // A proof that does not include a PII-scan step is rejected here.
  if (!proofIncludesPiiScan(microvmProof)) {
    return NextResponse.json(
      { error: 'PII_SCAN_NOT_ATTESTED',
        detail: 'The MicroVM proof does not include a PII scan attestation.' },
      { status: 422 }
    );
  }

  // ── 7. Enqueue ingestion (I-H8) ──────────────────────────────────────────────
  // Content is not written directly — it enters the screening queue.
  // The ingestion pipeline (background worker) performs chunking, embedding,
  // and final insertion into tenant_corpus.
  const { data: queueEntry, error: queueError } = await supabase
    .from('hrag_ingestion_queue')
    .insert({
      org_id:          orgId,
      submitted_by:    user.id,
      path,
      effective_from:  effectiveFrom,
      effective_to:    effectiveTo ?? null,
      raw_storage_path: await storeRawFile(file, orgId),
      microvm_proof:   microvmProof,
      microvm_provider: microvmProvider,
      pii_scan_status: 'attested',
      status:          'queued',
    })
    .select('id')
    .single();

  if (queueError) {
    return NextResponse.json(
      { error: 'QUEUE_ERROR', detail: queueError.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ingest_id: queueEntry.id, status: 'queued', path },
    { status: 202, headers: { 'X-Request-Id': requestId } }
  );
}
```

---

### §I.7 — Agent Lifecycle Routes

These routes are **server-only** (service-role key required; not accessible from the browser). They manage the lifecycle of typed agents.

| Route | Method | Description |
|---|---|---|
| `/api/agents/create` | POST | Register a new typed agent in `typed_agents` |
| `/api/agents/:id/pause` | POST | Pause an agent (drains in-flight requests) |
| `/api/agents/:id/resume` | POST | Resume a paused agent |
| `/api/agents/:id/drain` | POST | Mark agent `draining`; no new requests accepted |
| `/api/agents/:id/retire` | POST | Mark agent `retired`; irreversible |
| `/api/agents/assignments` | GET | List `agent_assignments` for a corpus path |

**Key invariants:**
- `I-A1`: An agent's `agent_type` is immutable after creation. Retire and recreate to change type.
- `I-A2`: `system_prompt` is stored in `typed_agents.system_prompt_hash` only — the hash of the canonicalized prompt. The prompt content lives in a separate secrets store (not in the database). The route at `POST /api/agents/create` accepts the prompt text, stores it to the secrets store, and writes only the hash to the DB.
- `I-A4`: `corpus_kind` must be `authority` or `tenant`. An agent may not be assigned to both. Returns `422 CROSS_CORPUS_ASSIGNMENT` if violated.
- All lifecycle state transitions are recorded in `agent_observations` with `observation_kind = 'lifecycle'`.

---

## Part II — CI Guardrails & Telemetry

### §II.1 — CI Lint Rule Inventory

All 17 lint rules below are mandatory CI gates. A failing lint rule blocks the PR merge. Rules are grouped by the invariant family they enforce.

---

#### §II.2 — RLS & Authorization Lints

**Rule: `wall-lint`**

| Property | Value |
|---|---|
| **ID** | `wall-lint` |
| **Enforces** | I-L12: ethical wall takes absolute precedence |
| **What it checks** | Every migration that adds a new matter-scoped table must include a `wall_blocks_user()` predicate in its RLS SELECT policy. Every existing matter-scoped RLS policy must contain the call. |
| **Pattern** | `grep -r "matter_id" --include="*.sql" \| grep -L "wall_blocks_user"` — any matter-referencing table without `wall_blocks_user` in its RLS fails. |
| **Fail message** | `wall-lint: table {table} has matter_id but RLS policy missing wall_blocks_user() call` |

---

**Rule: `definer-lint`**

| Property | Value |
|---|---|
| **ID** | `definer-lint` |
| **Enforces** | AF-12, AF-13: SECURITY DEFINER functions must set `search_path = ''` and use fully-qualified names |
| **What it checks** | 1) Every `SECURITY DEFINER` function in migrations must contain `set search_path = ''`. 2) Retrieval RPCs (`match_hrag_chunks`, `match_tenant_chunks`, `match_af_chunks`) must be `SECURITY INVOKER`, not `DEFINER`. |
| **Pattern** | Parse SQL AST; flag any `SECURITY DEFINER` function lacking `SET search_path = ''`; flag any retrieval RPC with `SECURITY DEFINER`. |
| **Fail message** | `definer-lint: {function_name} is SECURITY DEFINER but missing SET search_path = ''` OR `definer-lint: retrieval RPC {function_name} must be SECURITY INVOKER` |

---

**Rule: `privilege-lint`**

| Property | Value |
|---|---|
| **ID** | `privilege-lint` |
| **Enforces** | I-2: billing actor cannot modify authorization tables |
| **What it checks** | Every authorization table (`property_role_bindings`, `deal_memberships`, `facility_parties`, `matter_parties`, `wp_parties`, `dp_parties`, `broker_seats`) must have a `trg_%_billing_guard` trigger present in the migration that creates it. |
| **Fail message** | `privilege-lint: authorization table {table} missing billing guard trigger` |

---

**Rule: `class-lint`**

| Property | Value |
|---|---|
| **ID** | `class-lint` |
| **Enforces** | I-L8: data class access requires an explicit grant |
| **What it checks** | Every table with a `data_class` column must have an RLS policy that calls `has_data_class_grant()`. No table may default to `class_general` without an explicit check. |
| **Fail message** | `class-lint: table {table} has data_class column but RLS missing has_data_class_grant() check` |

---

#### §II.3 — Agent Factory Lints

**Rule: `param-lint`**

| Property | Value |
|---|---|
| **ID** | `param-lint` |
| **Enforces** | I-A6: no retrieved content in the system role; no prose context field |
| **What it checks** | 1) No `systemPrompt` or `system` role message in any LLM call contains string interpolation from a retrieval result. 2) No route handler passes a `context` string field into a system message. |
| **Pattern** | AST analysis of TypeScript call sites to `openai.chat.completions.create` and equivalent; flag any `role: 'system'` message whose content is dynamically constructed from a retrieval variable. |
| **Fail message** | `param-lint: system prompt interpolates retrieved content at {file}:{line}` |

---

**Rule: `prompt-lint`**

| Property | Value |
|---|---|
| **ID** | `prompt-lint` |
| **Enforces** | I-A1: system prompt is static and role-specific |
| **What it checks** | Every LLM call site that constructs a system prompt must reference a compile-time constant from `src/lib/agent/prompts/` — no runtime string construction allowed in the system role. |
| **Fail message** | `prompt-lint: system prompt at {file}:{line} is not a compile-time constant` |

---

**Rule: `tools-lint`**

| Property | Value |
|---|---|
| **ID** | `tools-lint` |
| **Enforces** | I-A3: tool results are advisory; human gate required for real-world actions |
| **What it checks** | Any tool function defined in `src/lib/agent/tools/` that modifies database state must be accompanied by a `requires_human_gate: true` annotation. Unannotated state-mutating tools fail. |
| **Fail message** | `tools-lint: tool {tool_name} modifies state but missing requires_human_gate annotation` |

---

**Rule: `plan-lint`**

| Property | Value |
|---|---|
| **ID** | `plan-lint` |
| **Enforces** | I-H16: out-of-scope paths discard the entire plan |
| **What it checks** | The `supervisorRoute()` function must contain a validation loop that checks every `task.target_paths` entry against `scopeSet.allowedPaths` before any worker is dispatched. The discard path must log and return `scope_denied`. |
| **Pattern** | AST check that `supervisorRoute` contains a pre-dispatch path validation block. |
| **Fail message** | `plan-lint: supervisorRoute() missing pre-dispatch scope_set path validation` |

---

**Rule: `filter-lint`**

| Property | Value |
|---|---|
| **ID** | `filter-lint` |
| **Enforces** | I-A9: pre-filter before ANN, never post-filter |
| **What it checks** | All calls to `match_hrag_chunks`, `match_tenant_chunks`, and `match_af_chunks` must pass `p_vault_paths` as a non-empty array. Any call site that passes an empty array or omits `p_vault_paths` fails. |
| **Fail message** | `filter-lint: RPC call at {file}:{line} missing p_vault_paths pre-filter` |

---

**Rule: `fallback-lint`**

| Property | Value |
|---|---|
| **ID** | `fallback-lint` |
| **Enforces** | I-A11: 3-way fallback — responses are non-identical |
| **What it checks** | FL-1: All three fallback keys (`no_authority_on_point`, `coverage_incomplete`, `scope_denied`) must be defined. FL-2: No fallback may be an empty string. FL-3: No two fallback strings may be identical. FL-4: No code path may return `undefined` or `null` where a fallback is expected. |
| **Fail message** | `fallback-lint: {FL-N} violation at {file}:{line}` |

---

**Rule: `citation-lint`**

| Property | Value |
|---|---|
| **ID** | `citation-lint` |
| **Enforces** | I-A11, I-A12: every response must be grounded |
| **What it checks** | 1) No `CopilotResponse` may be constructed with an empty `citations` array without also setting a `fallback` value. 2) No route handler may skip the Output Gate entirely. |
| **Fail message** | `citation-lint: response at {file}:{line} has empty citations but no fallback set` |

---

#### §II.4 — HRAG & Vault Lints

**Rule: `vault-pii-lint`**

| Property | Value |
|---|---|
| **ID** | `vault-pii-lint` |
| **Enforces** | I-H3, I-H18: no PII in the ingest pipeline |
| **What it checks** | 1) The `hrag_ingestion_queue` table has no column that can store raw PII (name, address, SSN, etc.). 2) The ingestion API route (`/api/vault/tenant-corpus`) must call the MicroVM proof validation before any database write. |
| **Pattern** | Scan `hrag_ingestion_queue` column definitions; flag any `text` column named `name`, `address`, `ssn`, `email`, `phone`. Scan route handler for proof validation before DB insert. |
| **Fail message** | `vault-pii-lint: ingestion queue has PII-like column {column}` OR `vault-pii-lint: ingestion route writes to DB before MicroVM proof validation` |

---

**Rule: `claim-lint`**

| Property | Value |
|---|---|
| **ID** | `claim-lint` |
| **Enforces** | I-H22, I-H23: jurisdiction-scoped claims |
| **What it checks** | Every `vault_nodes` row (and every `authority_corpus` chunk) must have a non-null `jurisdiction` value. Chunks with `jurisdiction = NULL` are ineligible for grounding and must be filtered. The ingestion pipeline must reject null-jurisdiction payloads. |
| **Fail message** | `claim-lint: authority_corpus chunk missing jurisdiction at ingest path {path}` |

---

**Rule: `currency-lint`**

| Property | Value |
|---|---|
| **ID** | `currency-lint` |
| **Enforces** | I-A13, I-H5: outdated chunks must not be used for grounding |
| **What it checks** | 1) No call to a retrieval RPC may omit the `p_as_of` parameter. 2) Any chunk with `effective_to < NOW()` or `reverify_due < NOW()` must be excluded by the RPC's WHERE clause. |
| **Pattern** | AST check on RPC call sites; SQL parse of RPC definition for `effective_to > p_as_of` filter. |
| **Fail message** | `currency-lint: retrieval RPC call at {file}:{line} missing p_as_of parameter` |

---

**Rule: `embedding-lint`**

| Property | Value |
|---|---|
| **ID** | `embedding-lint` |
| **Enforces** | I-A10, I-19: embeddings carry same RLS as content; no embedding-only export |
| **What it checks** | 1) No route exposes raw embedding vectors to the client. 2) No API route queries `authority_corpus.embedding` or `tenant_corpus.embedding` without also enforcing the same RLS policy as the content columns. |
| **Fail message** | `embedding-lint: route {route} exposes raw embeddings without RLS check` |

---

#### §II.5 — Observability & Audit Lints

**Rule: `log-lint`**

| Property | Value |
|---|---|
| **ID** | `log-lint` |
| **Enforces** | I-A14: every agent request must emit an observation |
| **What it checks** | Every code path through `src/app/api/copilot/route.ts` must call `emitObservation()` before returning — including error paths. A `return NextResponse.json(...)` that is not preceded by `emitObservation()` in the same code path fails. |
| **Fail message** | `log-lint: early return at {file}:{line} skips emitObservation()` |

---

**Rule: `servicerole-lint`**

| Property | Value |
|---|---|
| **ID** | `servicerole-lint` |
| **Enforces** | I-A7: agent routes must use service-role Supabase client for auth, not anon key |
| **What it checks** | No call to `createClient()` in `src/app/api/` may use `NEXT_PUBLIC_SUPABASE_ANON_KEY` for RPC calls that retrieve corpus content or modify authorization tables. Service-role key must be used. |
| **Fail message** | `servicerole-lint: corpus RPC at {file}:{line} uses anon key` |

---

### §II.6 — Telemetry Specification

All telemetry is written to the `agent_observations` table (installed in migration 0075) and to a structured log stream. The observability schema is:

```typescript
// Observation kinds and their required fields

type ObservationKind =
  | 'request_start'       // when the route handler begins
  | 'scope_set_computed'  // after buildScopeSet() returns
  | 'plan_generated'      // after supervisor LLM returns a plan
  | 'plan_rejected'       // when plan fails scope_set validation
  | 'worker_dispatched'   // when each worker task begins
  | 'worker_completed'    // when each worker task returns
  | 'gate_citation'       // output gate: citation check result
  | 'gate_entailment'     // output gate: entailment check result
  | 'gate_jurisdiction'   // output gate: jurisdiction check result
  | 'gate_exfil'          // output gate: exfil strip result
  | 'gate_tool_shape'     // output gate: tool-shape strip result
  | 'fallback_triggered'  // when any fallback fires
  | 'request_complete'    // when the route returns a response
  | 'lifecycle'           // agent create/pause/resume/drain/retire
  | 'ingest_queued'       // when a document enters the ingestion queue
  | 'ingest_completed'    // when ingestion pipeline finishes
  | 'ingest_rejected'     // when a document is rejected by screening
  | 'exfil_strip'         // when exfil strip fires in output gate
  | 'tool_shape_leak'     // when tool-shape strip fires
  | 'scope_leak'          // when a plan references an out-of-scope path
  | 'wall_check'          // when wall_blocks_user() fires in a route
  | 'dual_control_check'; // when dual-control verification runs in trust routes

interface AgentObservation {
  id:              string;   // UUID — request_id for the top-level events
  request_id:      string;   // correlates all events for one request
  agent_id:        string | null;  // typed_agents.id if applicable
  agent_type:      string | null;
  observation_kind: ObservationKind;
  subject_kind:    string | null;
  subject_id:      string | null;
  user_id:         string | null;
  // latency_ms measured from request_start for request_complete observations
  latency_ms:      number | null;
  // token_count: prompt + completion tokens for LLM call observations
  token_count:     number | null;
  // gate_passed: true/false for output gate observations
  gate_passed:     boolean | null;
  // detail: structured JSON — schema varies by observation_kind
  detail:          Record<string, unknown>;
  created_at:      string;   // ISO
}
```

**Minimum required telemetry per request:**

Every `POST /api/copilot` request must produce observations of kinds:
`request_start` → `scope_set_computed` → `plan_generated` (or `plan_rejected`) → N × `worker_dispatched` + `worker_completed` → 5 × gate observations → (optional) `fallback_triggered` → `request_complete`

**Alerting thresholds (SRE contract):**

| Signal | Threshold | Alert channel |
|---|---|---|
| `fallback_triggered` rate | > 15% of requests (5-min window) | PagerDuty P2 |
| `gate_exfil` / `exfil_strip` events | > 0 in any 1-min window | PagerDuty P1 |
| `scope_leak` events | > 0 ever | PagerDuty P0 + security on-call |
| `plan_rejected` rate | > 5% of requests (5-min window) | PagerDuty P3 |
| `request_complete` p99 latency | > 8 s | PagerDuty P3 |
| `dual_control_check` failures | > 3 in 10-min window | PagerDuty P2 |
| `ingest_rejected` rate | > 10% of ingests (1-hour window) | Slack #vault-ops |

---

## Part III — Phased Implementation Rollout

### §III.1 — Phase Summary

| Phase | Name | Duration (estimate) | Key Deliverables |
|---|---|---|---|
| **0** | Environment Scaffold | 1 week | Supabase project, CI pipeline, branch strategy |
| **1** | DB & HRAG Scaffold | 3 weeks | Migrations 0001–0059 + 0080–0086 stub |
| **2** | Core Platform & RBAC | 4 weeks | Auth flows, workspace manifest, Group 1–9 APIs |
| **3** | Legal OS & MicroVMs | 5 weeks | Migrations 0060–0066, Legal Workspace routes, MicroVM pipeline |
| **4** | Agent Factory | 4 weeks | Migrations 0070–0076, `/api/copilot` replacement, Output Gate |
| **5** | HRAG Full Deployment | 3 weeks | Full 0080–0086, Supervisor-Worker routing, coverage assertions |
| **6** | Hardening & Sign-off | 2 weeks | All 17 CI lint rules green, telemetry live, red-team regression |

**Total estimated duration:** ~22 weeks from Phase 0 start.

---

### §III.2 — Phase 0: Environment Scaffold

**Goal:** Establish the development and deployment infrastructure before any application code is written.

**Deliverables:**
- [ ] Supabase project created (separate projects for `dev`, `staging`, `prod`)
- [ ] Branch strategy established: `main` → prod, `staging` → staging, feature branches → dev
- [ ] CI pipeline configured (GitHub Actions or equivalent):
  - Migration dry-run on every PR (`supabase db diff --use-migra`)
  - TypeScript typecheck (`tsc --noEmit`)
  - ESLint with custom lint rules scaffold (empty rule stubs for all 17 rules)
  - Jest test runner configured
- [ ] Secrets management: Supabase service-role key, OpenAI key, MicroVM provider key stored in CI secrets and Vercel environment
- [ ] Object storage buckets created: `documents`, `vault-raw`, `gig-affidavits` (separate buckets; no cross-bucket policy)
- [ ] Observability stack: structured log drain (Datadog / Axiom / equivalent), alert channels configured

---

### §III.3 — Phase 1: DB & HRAG Scaffold

**Goal:** Run migrations 0001–0059 to completion. Stand up the HRAG vault node skeleton (without embeddings yet).

**Deliverables:**
- [ ] Migrations `0001–0059` applied to `dev` and `staging` environments
- [ ] All 6 baseline validation assertions in migration `0059` pass
- [ ] `discovery_feed` materialized view refreshing via `pg_cron`
- [ ] `vault_nodes` ltree hierarchy seeded with canonical jurisdiction tree (US.Federal, US.NY, US.CA, US.FL, US.TX as initial coverage)
- [ ] `coverage_assertions` seeded for: `{ domain: 'law', jurisdiction: 'US.NY', instrument_set: 'CPLR' }` and minimum 10 additional assertions
- [ ] HRAG stub tables installed: `authority_corpus`, `tenant_corpus`, `coverage_assertions`, `hrag_ingestion_queue` (from 0056–0057 stubs)
- [ ] `pgvector` extension enabled; embedding columns NOT yet added (deferred to Phase 5)
- [ ] `privilege-lint` and `wall-lint` CI rules enabled and passing

**Exit criteria:** `supabase db diff` against migrations 0001–0059 returns zero diff on staging.

---

### §III.4 — Phase 2: Core Platform & RBAC

**Goal:** Deliver a working 27-role auth system, workspace manifest, and the Group 1–9 API surface (non-agent routes).

**Deliverables:**
- [ ] Sign-up / sign-in flow with Supabase Auth
- [ ] Role assignment UI (admin panel) enforcing the 27-role taxonomy
- [ ] `workspace_manifest()` RPC wired to the front-end navigation
- [ ] Group 1 owner workspace: vitals, maintenance ticket creation, municipal records view
- [ ] Group 2 investor workspace: deal room creation, assembly intent, title diligence
- [ ] Group 3 lender workspace: facility creation, draw request, field inspection
- [ ] Group 4 basic matter intake: firm registration, matter creation, conflict check
- [ ] Group 5 contractor: work package, BoQ, milestone event submission
- [ ] Group 6 architect: design package, seal event, RFI
- [ ] Group 7 property manager + tenant: tenancy, rent ledger, maintenance ticket
- [ ] Group 9 brokerage: listing, showing, agency representation, commission record
- [ ] `entitlements` table wired to Stripe webhook (`POST /api/webhooks/stripe`)
- [ ] `definer-lint`, `privilege-lint`, `class-lint` CI rules enabled and passing

**Exit criteria:** All Group 1–9 CRUD operations pass integration tests with RLS verified (i.e., each test impersonates a different role and asserts correct row visibility).

---

### §III.5 — Phase 3: Legal OS & MicroVMs

**Goal:** Deliver the full Legal Workspace stack: migrations 0060–0066, all trust routes, gig rail, ethical walls with retroactive epoch enforcement, and the Zero-Trust ingestion pipeline.

**Deliverables:**
- [ ] Migrations `0060–0066` applied and validation assertions pass
- [ ] `identity_subjects` table populated by IDV webhook (`POST /api/webhooks/idv`)
- [ ] `has_data_class_grant()` function active (replacing stub from 0041)
- [ ] `on_restricted_list()` function active (replacing stub, wired to `identity_subjects`)
- [ ] `POST /api/legal/trust/disburse` + `POST /api/legal/trust/check` routes live
- [ ] Dual-control test suite: ≥ 10 test cases covering same-person rejection, expired identity, cross-firm rejection
- [ ] `debit_block_attested` re-attestation flow (90-day reminder, re-attestation UI)
- [ ] Gig rail: `POST /api/legal/gig/assign`, `/submit`, `/accept` routes live
- [ ] MicroVM pipeline: `POST /api/vault/tenant-corpus` route live with Firecracker proof validation
- [ ] Ethical wall UI: erect, modify, view prior-access log
- [ ] Wall retroactive enforcement: `wall_epoch` increment triggers index invalidation job
- [ ] `vault-pii-lint`, `claim-lint`, `servicerole-lint` CI rules enabled and passing

**Exit criteria:**
1. Trust disbursement integration test: same-person dual control returns `422`.
2. Gig submission with invalid nonce returns `403 NONCE_INVALID`.
3. Walled matter returns padded 404 that is byte-length-identical to a non-existent matter 404 (measured with 100 requests, p100 byte count must match).
4. MicroVM proof with mismatched file hash returns `422 MICROVM_PROOF_INVALID`.

---

### §III.6 — Phase 4: Agent Factory

**Goal:** Deploy the Agent Factory: migrations 0070–0076, the replacement `/api/copilot` route, the Output Gate, and the Supervisor-Worker architecture.

**Deliverables:**
- [ ] Migrations `0070–0076` applied and validation assertions pass
- [ ] Typed agents seeded for each of the 10 agent types (`owner_advisor`, `legal_researcher`, `contractor_ops`, `design_reviewer`, `lender_underwriter`, `tenant_services`, `broker_assistant`, `arbitration_neutral`, `gig_coordinator`, `admin_ops`)
- [ ] `POST /api/copilot` replacement live — old route disabled
- [ ] `PROSE_CONTEXT_FORBIDDEN` rejection confirmed in integration test (live defect closed)
- [ ] Output Gate all 5 checks active: Citation, Entailment, Jurisdiction, Exfil Strip, Tool-Shape Strip
- [ ] All 3 fallback templates active, distinct, and tested
- [ ] `emitObservation()` wired — every request produces the full observation chain
- [ ] Agent lifecycle routes live: create, pause, resume, drain, retire
- [ ] `param-lint`, `prompt-lint`, `tools-lint`, `plan-lint`, `filter-lint`, `fallback-lint`, `citation-lint`, `log-lint` CI rules enabled and passing

**Exit criteria:**
1. A request with `{ messages, context: "prose" }` returns `400 PROSE_CONTEXT_FORBIDDEN`.
2. A request where the retrieval pipeline returns 0 chunks returns `fallback: 'no_authority_on_point'` — never an empty `content` string.
3. A plan with an out-of-scope path logs `scope_leak` and returns `scope_denied` — no partial execution.
4. An exfil strip event (injected test SSN in model mock response) fires `EXFIL_STRIP_TRIGGERED` and the SSN does not appear in the response body.

---

### §III.7 — Phase 5: HRAG Full Deployment

**Goal:** Complete the HRAG Vault Network: full 0080–0086 migrations, authority corpus populated, embedding pipeline live, Supervisor-Worker routing using real retrieval.

**Deliverables:**
- [ ] Migrations `0080–0086` applied and final validation assertions pass
- [ ] `pgvector` embedding columns added to `authority_corpus` and `tenant_corpus` (via 0070 migration)
- [ ] Embedding generation pipeline: ingest → MicroVM → chunk → embed → insert
- [ ] Initial authority corpus seeded: ≥ 500 chunks covering US.NY CPLR, RPAPL, RPL, UCC Art. 9, NY Real Property Tax Law
- [ ] `match_hrag_chunks()` RPC live and tested with pre-filter and `as_of` date-bounding
- [ ] `resolve_scope_set()` function active (replacing stub)
- [ ] Coverage assertions: all seeded assertions with `satisfied = true` after initial ingest
- [ ] Authority DAG: `authority_edges` populated for hierarchical precedence (federal > state > local)
- [ ] `currency-lint`, `embedding-lint` CI rules enabled and passing
- [ ] Full Supervisor-Worker routing using real HRAG retrieval (Phase 4 used mock retrieval)

**Exit criteria:**
1. A legal question within the seeded US.NY corpus returns ≥ 1 citation with a valid `chunk_id` and `as_of` date.
2. A legal question for an unseeded jurisdiction returns `fallback: 'coverage_incomplete'`.
3. `match_hrag_chunks()` with `SECURITY DEFINER` check assertion (from migration 0086) passes.
4. All 17 CI lint rules are green on the `staging` branch.

---

### §III.8 — Phase 6: Hardening & Sign-off

**Goal:** Close all residual risk items, confirm all CI guardrails are green, complete the red-team regression suite, and deliver the final acceptance sign-off.

**Deliverables:**
- [ ] All 17 CI lint rules green on `main` and `staging`
- [ ] Full telemetry live: every `POST /api/copilot` request produces the complete observation chain in `agent_observations`
- [ ] All alerting thresholds configured and tested (synthetic alerts fired and acknowledged)
- [ ] Red-team regression suite: ≥ 1 test case per invariant (I-A1–I-A16, I-H1–I-H23, I-L1–I-L21) — see §IV.3
- [ ] Performance baseline: p50 / p95 / p99 latency recorded for `/api/copilot`, `/api/legal/trust/disburse`, `/api/vault/tenant-corpus`
- [ ] Existence protection byte-length parity verified across all matter-scoped routes
- [ ] Final schema comment on `public` schema matches the v3.0 migration sequence `0001–0086`
- [ ] `Plan_v3_Part3.md` (this document) merged to `main`

---

## Part IV — Final Sign-off

### §IV.1 — Residual Risk Inventory

The items below are known residual risks that have been assessed and accepted, with documented mitigations. None of these represent an open blocking defect — they represent areas requiring ongoing operational attention.

| ID | Risk | Mitigation | Owner |
|---|---|---|---|
| R-1 | Entailment classifier accuracy | NLI classifier may have false negatives on complex multi-hop legal claims. Fallback to `no_authority_on_point` on low-confidence scores. | Agent Factory team |
| R-2 | MicroVM provider availability | Single MicroVM provider is a SPOF for ingestion. Add secondary provider in Phase 5 + fallback queue. | Vault pipeline team |
| R-3 | Coverage assertion staleness | `satisfied = true` assertions may become stale if corpus is not re-indexed. `reverify_due` + pg_cron job mitigates; needs SRE monitoring. | HRAG team |
| R-4 | Dual-control bypass via identity reuse | Two accounts sharing one identity_subject_id can bypass dual control. The `guard_identity_dual_control()` trigger (0061) closes this at the DB level; app-layer test suite must include regression. | Legal OS team |
| R-5 | Gig nonce replay across environments | A nonce issued in staging could theoretically be replayed in prod if secrets are shared. Nonces must be environment-scoped (prefix with env identifier). | Security team |
| R-6 | Wall retroactive epoch race | A brief window exists between wall erection and `wall_epoch` index invalidation. The `wall_prior_access` table records this for disclosure, not concealment. | Legal OS team |
| R-7 | Existence protection timing variance | Response padding targets p50 byte length. If the upstream response latency is far below p50, the padded 404 may be detectably faster. Consider adding jitter to the response delay. | Platform team |
| R-8 | Cross-jurisdictional citation mapping | Jurisdiction check (Output Gate Check 3) relies on a static jurisdiction label match. Cross-jurisdictional mappings (e.g., federal circuits vs. state courts) require a mapping table not yet built. | HRAG team |

---

### §IV.2 — Blocking Items

The following items are **hard blockers** — they must be resolved before the corresponding phase can exit.

| Blocker | Phase | Status | Resolution |
|---|---|---|---|
| **B-1: Live defect — `context` field** | Phase 4 | **OPEN** | The `PROSE_CONTEXT_FORBIDDEN` rejection must be implemented in the new `/api/copilot` route. The old route must be disabled. This is a hard blocker for Phase 4 exit. |
| **B-2: `has_data_class_grant()` stub** | Phase 3 | Open until 0060 runs | The stub returns `false` for all requests. All practice-workbench tables (PI, bankruptcy, corporate, family) are read-blocked until 0060 is applied. This is by design — Phase 3 resolves it. |
| **B-3: `on_restricted_list()` stub** | Phase 3 | Open until 0060 runs | Returns `false` until wired to `identity_subjects`. MNPI cross-group restriction (I-L10) is unenforced until Phase 3. |
| **B-4: Retrieval RPCs return empty** | Phase 5 | Open until corpus seeded | `match_hrag_chunks()` will always trigger `coverage_incomplete` fallback until the authority corpus is seeded. Phase 4 test suite must use mock retrieval. |
| **B-5: `resolve_scope_set()` stub** | Phase 5 | Open until 0083 runs | Supervisor-Worker routing uses a simplified scope set until the full HRAG node hierarchy is deployed. |

---

### §IV.3 — Acceptance Criteria Summary

The following criteria must ALL be met before v3.0 is declared complete and `main` is tagged `v3.0.0`.

**Database layer:**
- [ ] Migrations 0001–0086 apply cleanly from scratch on a fresh Supabase project in < 5 minutes
- [ ] All validation assertion DO blocks in 0059, 0066, 0076, 0086 pass without exception
- [ ] `supabase db diff` against a `prod` snapshot returns zero diff

**Authorization layer:**
- [ ] RLS test matrix: 27 roles × 6 subject types = 162 role/subject combinations tested; each asserts correct row visibility and correct denial
- [ ] Ethical wall test: screened user receives padded 404 on all matter-scoped routes
- [ ] Billing actor guard: a request with `app.actor_class = 'billing'` fails all authorization table mutations with the correct exception

**Agent layer:**
- [ ] `PROSE_CONTEXT_FORBIDDEN`: a request with `context` field returns `400` (B-1 closed)
- [ ] Output Gate: all 5 checks produce correct results for injected test cases
- [ ] 3-way fallback: all 3 templates are distinct, non-empty, and triggered by the correct conditions
- [ ] `scope_leak`: a plan with an out-of-scope path never reaches a worker

**Legal Workspace:**
- [ ] Trust disbursement: same-person dual control rejected at DB level (trigger) AND at route level
- [ ] Gig nonce: consumed nonce returns `403 NONCE_CONSUMED`; expired nonce returns `403 NONCE_EXPIRED`
- [ ] MicroVM ingest: proof mismatch returns `422`; PII-scan not attested returns `422`
- [ ] Existence protection: 100-request byte-length parity test across walled vs. non-existent matters

**CI layer:**
- [ ] All 17 lint rules pass on `main`
- [ ] Zero new TypeScript errors on `tsc --noEmit`
- [ ] Test coverage ≥ 80% on `src/lib/agent/` and `src/app/api/legal/`

**Telemetry:**
- [ ] Every `POST /api/copilot` request in staging produces ≥ 8 observation rows
- [ ] Alert channels tested: each PagerDuty threshold fires a test alert and is acknowledged

---

### §IV.4 — Compliance Map

| Regulation / Standard | Invariant(s) | Implementation Anchor |
|---|---|---|
| **NY Judiciary Law § 90 (attorney-client privilege)** | I-L8, I-L12 | `matter_class_grants`, `ethical_walls`, `wall_blocks_user()` |
| **ABA Model Rules 1.6, 1.7, 1.9** | I-L12, I-L13 | `conflict_checks`, `ethical_walls`, wall retroactive enforcement |
| **42 CFR Part 2 (substance abuse records)** | I-L8 (`class_phi`) | `pi_medical_records` RLS, `has_data_class_grant()` |
| **Federal Arbitration Act (FAA)** | I-L21 (analogue), G4-01–G4-03 | `arbitration_cases.faa_review_preserved`, no self-execution in `arbitration_awards` |
| **FCRA (screening reports)** | I-25 | `screening_reports` — no `denied` status; `adverse_action_notices` — human-authored basis |
| **NY RPL § 443 (agency disclosure)** | I-31 | `agency_representations` — no commission benchmark; `representation_disclosures` |
| **AML / BSA (trust accounting)** | I-L1–I-L6 | `trust_ledger` — dual control, hash chain, debit-block attestation |
| **SOC 2 CC6.2 / CC6.3** | I-L8, I-A14 | `matter_class_grant_log`, `agent_observations` — append-only audit |
| **NIST SP 800-207 (Zero Trust)** | I-H6, I-H7 | MicroVM proof validation in `/api/vault/tenant-corpus` |
| **GDPR / CCPA (data minimization)** | I-A16, I-H18 | Exfil Strip (Output Gate Check 4); `vault-pii-lint` |
| **Fair Housing Act** | I-25, I-22 | No auto-deny in screening; no platform-gated physical access (Access Floor) |
| **Dodd-Frank (MNPI restrictions)** | I-L10 | `on_restricted_list()`, `corp_transaction_records` RLS |

---

### §IV.5 — Document Integrity

This Master Engineering Plan (Parts 1, 2, and 3) constitutes the authoritative technical specification for Shtiya Builder Ecosystem v3.0. No implementation decision may contradict an invariant defined in Part 1 without a formal amendment that:

1. Identifies the invariant by ID (e.g., I-A6, I-L1)
2. States the specific contradiction and the engineering reason for the deviation
3. Documents the compensating control that replaces the invariant's intent
4. Is reviewed and signed off by the Lead Architect before any code is merged

**Source-of-truth hierarchy:**
```
Plan_v3_Part1.md  (invariants — highest authority)

_[Continuing response due to length limit...]_

Picking up exactly from the cut-off — no repeated content:

````markdown
    │
    ▼
Plan_v3_Part2.md  (schemas — authoritative migration sequence)
    │
    ▼
Plan_v3_Part3.md  (this document — routes, CI, rollout, sign-off)
    │
    ▼
Tasks.md          (execution checklist — derived from Part 3 phases)
    │
    ▼
src/              (implementation — must not contradict any Plan doc)
```

Any conflict between a lower-tier document and a higher-tier document is resolved in favor of the higher-tier document. A conflict between `src/` and any Plan document is a defect in `src/`, not in the Plan.

---

### §IV.6 — Red-Team Regression Index

The following table maps each red-team finding (from the three Master Blueprints) to the CI test or lint rule that closes it. Every row must have a green checkmark in the Phase 6 exit report.

| Finding ID | Source Blueprint | Description | Closed By |
|---|---|---|---|
| AF-01 | Agent Factory | Retrieved content injected into system prompt | `param-lint` + Output Gate Citation Check |
| AF-02 | Agent Factory | Prose `context` field interpolated into system role | `PROSE_CONTEXT_FORBIDDEN` (route handler) + `param-lint` |
| AF-03 | Agent Factory | Tool invocation shapes leaked in prose response | Output Gate Tool-Shape Strip + `tools-lint` |
| AF-04 | Agent Factory | Post-filter ANN (authorization applied after vector search) | `filter-lint` + `match_hrag_chunks` pre-filter in RPC |
| AF-05 | Agent Factory | Fallback responses rendered identically | `fallback-lint` FL-3 |
| AF-06 | Agent Factory | Coverage-incomplete and no-authority conflated | `fallback-lint` FL-1 + FL-3; distinct template strings |
| AF-07 | Agent Factory | Embeddings exported without RLS | `embedding-lint` |
| AF-08 | Agent Factory | Agent assigned to both corpora | `I-A4` check in `/api/agents/create` + `CROSS_CORPUS_ASSIGNMENT` guard |
| AF-09 | Agent Factory | System prompt reconstructable from hash | Prompt content in secrets store only; hash in DB (I-A2) |
| AF-10 | Agent Factory | Stale chunks used for grounding past reverify_due | `currency-lint` + `effective_to` filter in RPC |
| AF-11 | Agent Factory | Service-role key used in browser-accessible code path | `servicerole-lint` |
| AF-12 | Agent Factory | Retrieval RPC is SECURITY DEFINER (bypasses RLS) | `definer-lint` — retrieval RPCs must be INVOKER |
| AF-13 | Agent Factory | DEFINER function missing `search_path = ''` | `definer-lint` — search_path check |
| AF-14 | Agent Factory | Observation not emitted on error path | `log-lint` — every return path must call `emitObservation()` |
| AF-15 | Agent Factory | Out-of-scope plan path partially executed | `plan-lint` + supervisor discard-entire-plan logic |
| AF-16 | Agent Factory | Supervisor receives corpus content directly | `param-lint` + `supervisorRoute()` architecture contract |
| H-01 | HRAG Vault | ltree path not registered in vault_nodes before use | `0082` migration trigger `guard_corpus_path_registration()` |
| H-02 | HRAG Vault | Authority edge creates cycle in DAG | `0082` trigger `guard_no_authority_cycle()` |
| H-03 | HRAG Vault | Tenant corpus chunk has `owner_org_id = NULL` | `tenant_corpus_requires_org` CHECK constraint (0057/0073) |
| H-04 | HRAG Vault | Cross-tenant corpus read via service-role bypass | `servicerole-lint` + tenant corpus RLS `org_id` predicate |
| H-05 | HRAG Vault | PII ingested into vault without MicroVM screen | `vault-pii-lint` + MicroVM proof gate in `/api/vault/tenant-corpus` |
| H-06 | HRAG Vault | Ingestion bypasses screening queue (direct insert) | `hrag_ingestion_queue` as mandatory intermediate; no direct-insert path |
| H-07 | HRAG Vault | Cross-party disclosure missing consent record | `0083` trigger `guard_disclosure_consent()` |
| H-08 | HRAG Vault | Coverage assertion marked satisfied without corpus | `coverage_assertions.satisfied` set only by ingestion pipeline; never by route |
| H-09 | HRAG Vault | Jurisdiction label null on authority chunk | `claim-lint` + `jurisdiction NOT NULL` constraint on `authority_corpus` |
| H-10 | HRAG Vault | as_of date omitted from retrieval call | `currency-lint` — `p_as_of` required parameter |
| H-11 | HRAG Vault | Shared authority branch written by tenant publisher | `guard_shared_branch_write()` trigger on `authority_corpus` (0086) |
| H-12 | HRAG Vault | HRAG RPC is SECURITY DEFINER | `definer-lint` — `match_hrag_chunks` must be INVOKER (0086 assertion) |
| H-13 | HRAG Vault | Scope set computed client-side | `buildScopeSet()` is server-only; never callable from browser |
| H-14 | HRAG Vault | Authority corpus visibility set to `org_private` | `authority_corpus_no_org` CHECK + `visibility` enum excludes `org_private` |
| L-01 | Legal Workspace | Same natural person as maker and checker | `identity_subjects` dual-control check; `guard_identity_dual_control()` trigger |
| L-02 | Legal Workspace | Debit kind not in closed enum | `trust_ledger.debit_kind` CHECK constraint (0001) + `INVALID_DEBIT_KIND` route guard |
| L-03 | Legal Workspace | Trust ledger row updated post-posting | `trust_ledger_append_only` trigger (0061); `mcgl_no_update` rule |
| L-04 | Legal Workspace | Debit-block attestation expired | `DEBIT_BLOCK_NOT_ATTESTED` route guard in `/api/legal/trust/disburse` |
| L-05 | Legal Workspace | Per-client balance exceeded | `per_client_solvency_check()` function (0061); `SOLVENCY_CHECK_FAILED` |
| L-06 | Legal Workspace | Gig nonce replayed | Nonce stored hashed; `NONCE_CONSUMED` on second use |
| L-07 | Legal Workspace | Geofence/attestation columns client-writable | `REVOKE UPDATE` on `geofence_verified`, `attestation_verified`, `timestamp_verified` (0060) |
| L-08 | Legal Workspace | Trust principal funding gig escrow | `gig_escrow.source_type` CHECK excludes `trust_ledger`; `TRUST_FUNDING_PROHIBITED` route guard |
| L-09 | Legal Workspace | Walled matter returns 403 (existence leak) | Existence protection: padded 404 at all matter-scoped routes (I-L11) |
| L-10 | Legal Workspace | Data class self-grant | `guard_class_grant()` trigger; self-issue rejected with `42501` |
| L-11 | Legal Workspace | Arbitration award auto-executes | No self-execution path in `arbitration_awards`; staged release requires custodian action |
| L-12 | Legal Workspace | Process server gets open-ended matter access | `matter_parties.expires_at NOT NULL` for `per_diem`/`process_server` roles (I-L20); `EXPIRY_REQUIRED` |

---

### §IV.7 — Final Statement

This document — together with `Plan_v3_Part1.md` and `Plan_v3_Part2.md` — constitutes the complete **Shtiya Builder Ecosystem v3.0 Master Engineering Plan**.

The plan covers:
- **31 core ecosystem invariants** (I-1 through I-31)
- **16 Agent Factory invariants** (I-A1 through I-A16)
- **23 HRAG Vault Network invariants** (I-H1 through I-H23)
- **21 Legal Workspace invariants** (I-L1 through I-L21)
- **86 database migrations** (0001 through 0086)
- **5 API route categories** (Copilot, Legal Workspace, Vault, Agent Lifecycle, Webhooks)
- **5 Output Gate checks** (Citation, Entailment, Jurisdiction, Exfil Strip, Tool-Shape Strip)
- **17 CI lint rules** (wall, definer, privilege, class, param, prompt, tools, plan, filter, fallback, citation, vault-pii, claim, currency, embedding, log, servicerole)
- **7 implementation phases** (Phase 0 through Phase 6, ~22 weeks)
- **36 red-team findings closed** (AF-01–AF-16, H-01–H-14, L-01–L-12)
- **14 compliance anchors** (NY Judiciary Law, ABA Model Rules, 42 CFR Pt.2, FAA, FCRA, NY RPL, AML/BSA, SOC 2, NIST SP 800-207, GDPR/CCPA, Fair Housing Act, Dodd-Frank, and others)

**Document status:** FINAL  
**Version:** 3.0  
**Produced by:** IBM Bob, Lead Architect & Project Manager

---

*End of Master Engineering Plan v3.0 — Part 3 of 3*