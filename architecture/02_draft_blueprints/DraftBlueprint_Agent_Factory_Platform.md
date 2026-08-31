### File 2: `architecture/02_draft_blueprints/DraftBlueprint_Agent_Factory_Platform.md`

```markdown
# 📄 DRAFT BLUEPRINT: SHTIYA AGENT FACTORY & VAULT PLATFORM
**Document Status:** Draft Blueprint (Phase 1)
**Target Group:** Cross-System Infrastructure (Used by All 25 Roles across Groups 1–9)
**Nature:** Autonomous Domain-Specific AI Agent Provisioning Engine
**Author:** Gemini Master Orchestrator

---

## 1. ARCHITECTURAL MANDATE & CORE VISION
The **Agent Factory** is an independent, core platform service that enables users across all roles (Attorneys, Property Managers, Lenders, Contractors, Brokers) to provision hyper-localized, domain-specific AI agents. 

Rather than relying on generic internet models, instantiated agents are bound to the **Shtiya Vault**—a multi-tenant, metadata-indexed knowledge repository. Agents dynamically self-assemble by applying strict parametric filters against the Vault's vector embeddings.

### Key Architectural Invariants:
1. **Parametric Provisioning:** Agents are created via a structured intake wizard (Domain, Jurisdiction, State, County, Persona, Role Constraints) rather than manual prompt engineering.
2. **Deterministic Context Binding:** When an agent is active in the Center/Right Pane, the Zustand `terminalStore` updates `capacity` (e.g., `capacity = 'agent_ny_kings_pi'`). The `/api/copilot` route enforces server-side metadata filtering on all vector searches.
3. **Zero-Hallucination RAG:** If a query falls outside the bounds of the Vault's tagged documents for that specific jurisdiction, the agent explicitly outputs: *"Information not found in the verified jurisdiction Vault."*
4. **Cross-Portal Portability:** The Agent Factory serves all micro-apps (Legal, Developer, Lender, Contractor, Brokerage).

---

## 2. THE SHTIYA VAULT & AGENT FACTORY PIPELINE

[User Intake Wizard] ──> [Parametric Filter] ──> [Shtiya Vault RAG] ──> [Dynamic Agent Instance]


### A. The Shtiya Vault Architecture
The Vault is a centralized vector repository storing legal statutes, court local rules, local zoning codes, building department codes, construction spec templates, and financial regulatory filings. Every document chunk is tagged with structured metadata:
*   `domain`: `legal`, `proptech`, `construction`, `lending`, `brokerage`, `zoning`
*   `sub_domain`: `personal_injury`, `title`, `hpd_violations`, `mepp_contracting`
*   `state_code`: `NY`, `CA`, `FL`, `TX`, etc.
*   `county_name`: `Kings`, `New_York`, `Miami-Dade`, etc.
*   `jurisdiction_level`: `federal`, `state`, `county`, `municipal`
*   `rbac_visibility`: `public`, `verified_user`, `attorney_only`

### B. The 4-Step Agent Intake Wizard
Inside the UI, users click *"Create Custom Agent"* and pass through an intake flow:
1. **Select Domain & Specialization:** (e.g., Legal -> Personal Injury, OR Real Estate -> Zoning & Land Use).
2. **Select Jurisdiction:** State, County, and Municipal Court / Agency.
3. **Select Persona / Stance:** (e.g., "Plaintiff Counsel", "Landlord Representative", "General Contractor Expediter").
4. **Set Custom Playbook Rules:** Optional upload of firm/company-specific preferences or templates.

---

## 3. DATABASE SCHEMA (SUPABASE / PGVECTOR)

```sql
-- Enable Vector Extension
CREATE EXTENSION IF NOT EXISTS vector;

-- The Centralized Knowledge Vault
CREATE TABLE shtiya_vault (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_title text NOT NULL,
  domain text NOT NULL,              -- 'legal', 'proptech', 'zoning', 'construction', 'lending'
  sub_domain text NOT NULL,          -- 'personal_injury', 'title', 'code_enforcement', etc.
  state_code text,                   -- 'NY', 'CA', etc.
  county_name text,                  -- 'Kings', 'Queens', etc.
  jurisdiction_level text NOT NULL,  -- 'federal', 'state', 'county', 'municipal'
  document_type text NOT NULL,       -- 'statute', 'local_rule', 'form_template', 'building_code'
  content text NOT NULL,             -- raw text chunk
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(1536),            -- dense vector embedding for semantic search
  created_at timestamptz DEFAULT now()
);

-- Index for Fast Metadata Filtering + Vector Search
CREATE INDEX idx_vault_metadata ON shtiya_vault USING gin (metadata);
CREATE INDEX idx_vault_vector ON shtiya_vault USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- User-Instantiated Custom Agents
CREATE TABLE custom_agents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  domain text NOT NULL,
  state_code text,
  county_name text,
  persona_prompt text NOT NULL,
  vault_filters jsonb NOT NULL,      -- e.g. {"domain": "legal", "sub_domain": "personal_injury", "state_code": "NY"}
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
4. SYSTEM PROMPT & SERVER-SIDE EXECUTION
When an instantiated agent is activated, /api/copilot receives the request:

TypeScript
// Server-Side RAG Retrieval in /api/copilot
const { customAgentId, userPrompt } = await req.json();

// 1. Fetch Agent Parameters
const agent = await supabase.from('custom_agents').select('*').eq('id', customAgentId).single();

// 2. Query the Vault with Metadata Hard-Filtering
const embedding = await generateEmbedding(userPrompt);
const { data: vaultDocs } = await supabase.rpc('match_vault_documents', {
  query_embedding: embedding,
  filter_domain: agent.vault_filters.domain,
  filter_state: agent.vault_filters.state_code,
  filter_county: agent.vault_filters.county_name,
  match_threshold: 0.78,
  match_count: 5
});

// 3. Construct System Prompt with Vault Context
const systemPrompt = `
You are ${agent.agent_name}, a specialized AI agent for ${agent.domain} in ${agent.county_name} County, ${agent.state_code}.
Persona Constraints: ${agent.persona_prompt}

VERIFIED JURISDICTIONAL CONTEXT FROM SHTIYA VAULT:
${vaultDocs.map(doc => `--- ${doc.document_title} ---\n${doc.content}`).join('\n\n')}

INSTRUCTIONS:
1. Base your answer strictly on the provided Vault context and laws of ${agent.state_code}/${agent.county_name}.
2. If the answer cannot be derived from the Vault context, explicitly state that verified local authority is required.
`;
5. COMPLIANCE & SAFETY GUARDRAILS
Domain Boundary Enforcement: An agent provisioned for personal_injury cannot be queried for securities_tokenization. Cross-domain leakage triggers a server-side redirect error.

Vault Provenance Tracking: Every statement generated by an agent cites the exact id and document_title of the source chunk in the Shtiya Vault.

ISO/SOC 2 Auditing: All queries and retrievals are logged to agent_execution_logs for compliance auditing.