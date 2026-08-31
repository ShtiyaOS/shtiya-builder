# 🧠 SHTIYA BUILDER: ORCHESTRATOR MASTER STATE
**Date:** August 19, 2026
**Role:** Master Project Orchestrator & Strategic Overseer (Gemini)

## 1. PROJECT OVERVIEW
**Project:** Shtiya Builder Ecosystem (v2.0)
**Nature:** A decentralized PropTech, FinTech, and Social Network platform utilizing a 25-role taxonomy and a strict Web3 ($SHQL) micro-escrow monetization model.
**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL/RLS), Zustand, Mapbox GL, Vercel AI SDK, Web3/Smart Contracts.

## 2. THE 3-PANE ARCHITECTURAL MANDATE
The UI is a state-persistent "Bloomberg Terminal" layout (`src/app/(apps)/layout.tsx`):
1. **Left Pane (250px):** Zero-Trust Switcher (React Server Component). Uses `@supabase/ssr` to filter routes based on a 25-role RBAC taxonomy. Active paths are styled via edge `middleware.ts` header injection (`x-next-pathname`) to avoid client hooks.
2. **Center Pane (1fr):** The Routing Arena. Injects 10 specific micro-apps. Broadcasts semantic context to a Zustand Context Registry upon mounting.
3. **Right Pane (350px):** Agentic Co-Pilot (Client Component). Uses Vercel AI SDK. Bypasses stale state anomalies by dynamically injecting the Zustand context string via the `prepareSendMessagesRequest` interceptor on every prompt.

## 3. MULTI-AGENT PIPELINE
The execution of this project relies on a highly structured multi-agent workflow:
*   **Gemini (You):** The Orchestrator. You have filesystem access to verify code, manage state, and oversee the pipeline.
*   **Claude Pro (The Red Team & Executor):** Hardens Draft Blueprints into Master Blueprints, then writes the actual frontend/backend code.
*   **IBM Bob (Project Manager):** Reads Master Blueprints to output `Plan.md` and `Tasks.md`. Writes NO actual app code, only scaffolding plans.

## 4. CURRENT WORKFLOW STATUS
*   **Directory Structure:** The `/architecture/` folder is cleanly organized into `00_legacy_and_core`, `01_system_prompts`, `02_draft_blueprints`, `03_master_blueprints`, and `04_engineering_plans`.
*   **Role Taxonomy:** All 9 Groups (24 Roles, skipping Admin Group 8) have drafted blueprints in `02_draft_blueprints/`.
*   **Active Bottleneck:** None. Groups 5, 6, 7, and 9 were completed; the two extension blueprints (Legal Workspace, Agent Factory) were audited and hardened on 2026-08-20.
*   **Remaining Blueprints to Process by Claude:** None. All 8 group blueprints plus both cross-system extensions are in `03_master_blueprints/`.

## 6. ISO SOC2 COMPLIANCE GATE
This matrix confirms that each Master Blueprint has passed the Claude Pro Red Team audit and is cleared for engineering handoff to IBM Bob. All gates must be `true` to proceed.

- **ISO_SOC2_GATE:**
  - `MasterBlueprint_Group_1.md`: true
  - `MasterBlueprint_Group_2.md`: true
  - `MasterBlueprint_Group_3.md`: true
  - `MasterBlueprint_Group_4.md`: true
  - `MasterBlueprint_Group_5.md`: true
  - `MasterBlueprint_Group_6.md`: true
  - `MasterBlueprint_Group_7.md`: true
  - `MasterBlueprint_Group_9.md`: true
  - `MasterBlueprint_Legal_Workspace.md`: true
  - `MasterBlueprint_Agent_Factory_Platform.md`: true
  - `MasterBlueprint_Hierarchical_Vault_Network.md`: true

**Gate note (Claude Pro Red Team, 2026-08-20).** Both new Master Blueprints passed the Mode 1 audit and are cleared for engineering handoff, with two standing conditions that Bob must carry into `Plan.md` / `Tasks.md` as blocked-by markers rather than as ordinary tasks:

1. **Cross-group build-blockers.** `MasterBlueprint_Legal_Workspace.md` §V.6 creates an obligation on Groups 2, 3, and 9 (`on_restricted_list()` on every counterparty-scoped policy). Until that lands, finding **LW-16** (MNPI → the platform's own acquisition marketplace) is open regardless of anything inside Group 4, and the **corporate workbench must not ship**.
2. **Live-code contract break.** `MasterBlueprint_Agent_Factory_Platform.md` §III.2 replaces the shipped `/api/copilot` contract. `src/app/api/copilot/route.ts` currently accepts a client-supplied prose `context` string and interpolates it into the system prompt, which Group 1 §II.3.4 prohibits. The hardened route **rejects** that field with `400` rather than ignoring it, so every `prepareSendMessagesRequest` call site and `src/store/terminalStore.ts` must migrate in the same change.

Each blueprint also carries a §V.7 blocking legal/regulatory review queue. Those items block their named surfaces, not the engineering handoff.

**Gate note (Claude Pro Red Team, 2026-08-20, second pass).** `MasterBlueprint_Hierarchical_Vault_Network.md` passed the Mode 1 audit and expands the HRAG topology from legal-only to all 27 roles. Three conditions for Bob:

3. **Build order is fixed.** The HRAG blueprint extends `authority_corpus` / `tenant_corpus` from the Agent Factory blueprint (migrations `0080`–`0086` follow `0070`–`0076`). It cannot be scheduled before it.
4. **A staffing dependency, not just a code one.** `vault_nodes`, `authority_relations`, `scope_templates`, and `coverage_assertions` are editorially governed data requiring a named corpus editor with a review cadence tied to code cycles and legislative sessions. Finding **HV-11** — the draft filed Regulation Z under the OCC rather than the CFPB — is what an unmaintained taxonomy produces, and its errors are silent at retrieval time. **Blocks:** production retrieval in any domain whose authority graph is unattested. This is a Group 8 obligation and needs a person, not a ticket.
5. **Standards licensing is the largest unresolved dependency across all three extension blueprints.** ICC, NFPA, ASHRAE, ACI, and ASTM texts are licensed works, and the enacted-text reasoning in *Veeck* does not cover unadopted model codes, code commentary, or referenced standards reproduced in full. **Blocks:** `ROOT.Standards.*` entirely, and with it the Groups 5/6 construction-code retrieval that motivates the expansion.

## 5. YOUR IMMEDIATE DIRECTIVE
As the localized Gemini Orchestrator, your first action is to scan the `/architecture/03_master_blueprints/` folder. Verify which blueprints Claude successfully generated before pausing. Await user confirmation to resume prompting Claude for the remaining groups, or step in to analyze any generated files.
