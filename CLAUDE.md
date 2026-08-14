# 🤖 CLAUDE INSTRUCTION PROMPT: Technical Blueprint & Task Generation

**ROLE & SYSTEM CONTEXT:**
You are acting as a **Principal Software Architect and Lead Full-Stack Developer**. You are responsible for architecting, staging, and orchestrating the build for the **Shtiya Builder Ecosystem (v2.0)**—a 10-App PropTech, FinTech, and Social Network platform built on a Unified Arena architecture using Next.js 14 (App Router), Supabase (PostgreSQL with Row-Level Security), and Web3/Smart Contract integrations.

---

### 📄 SOURCE CONTEXT DOCUMENT
Use the following architecture specification as the single source of truth for the system requirements:

> **Document:** `ShtiyaBuilderEcosystem_Master_Architecture.md`
> - **Unified Portal:** `app.shtiya.com` (Multi-tenant RBAC rendering 10 apps)
> - **Shared Core Engine:** Supabase DB, RLS, Web3 Escrow Smart Contracts
> - **10-App Suite:** 
>   1. *Shtiya Owner* (GIS Social Block Assembly Map)
>   2. *Shtiya Acquisition* (Probate OCR & Debt Scraping)
>   3. *Shtiya Legal* (Smart PSAs & Binding Arbitration)
>   4. *Shtiya Capital* (Lender Draw Underwriting & RWA Factoring)
>   5. *Shtiya Design* (CAD/BIM Vault & BoQ Generator)
>   6. *Shtiya Contractor* (Voice-to-Scope & Milestone Photos)
>   7. *Shtiya Property* (Landlord/Tenant Portal & Maintenance)
>   8. *Shtiya Escrow* (Web3 Smart Contracts & Draw Releases)
>   9. *Shtiya Office* (License/Insurance Auditing & Compliance, Bookkeeping, Accounting, Payroll)
>   10. *Shtiya Marketing* (Syndication & Lead Syndication)

---

### 🎯 YOUR DIRECTIVE
You must generate the complete text content for two separate markdown files: **`Plan.md`** and **`Tasks.md`**.

Provide your output clearly divided into two distinct sections titled `# Plan.md` and `# Tasks.md`.

---

## 1. SPECIFICATIONS FOR `Plan.md` (Technical Blueprint)

Write a comprehensive, technical blueprint document. Do not use high-level vague language—provide exact engineering designs, API contracts, folder structures, and database schemas.

### Structure required inside `Plan.md`:

1. **Architecture Overview & Scaffolding Strategy:**
   - Next.js 14 App Router monorepo/folder hierarchy (`/src/app/(apps)/...`).
   - Dynamic RBAC Middleware routing logic based on user roles (`owner`, `investor`, `attorney`, `lender`, `contractor`, etc.).

2. **Master Database Schema & Security Policy (Supabase PostgreSQL):**
   - Provide complete SQL DDL statements for core tables (`users`, `properties`, `block_committees`, `agreements`, `financial_ledgers`, `documents`).
   - Define exact Row-Level Security (RLS) policies enforcing multi-tenant boundaries.

3. **Phased Build Strategy:**
   Divide the technical blueprint into four logical, sequential development phases:
   - **Phase 1: Foundation & Shared Core Engine** (Next.js scaffold, Supabase Auth/RLS, Shared Shell UI).
   - **Phase 2: Ingestion, GIS & Community Engine** (*Shtiya Owner* Block Assembly Map, *Shtiya Acquisition* OCR & Skip-Tracing).
   - **Phase 3: Legal Shield, Execution & Escrow Engine** (*Shtiya Legal* Smart Contracts, *Shtiya Contractor* Voice-to-Scope, *Shtiya Escrow* Smart Contract integration).
   - **Phase 4: Capital, Operations & Unified Arena Integration** (*Shtiya Capital*, *Shtiya Property*, *Shtiya Design*, *Shtiya Office*, *Shtiya Marketing*, End-to-End Deal Flow Integration).

---

## 2. SPECIFICATIONS FOR `Tasks.md` (Granular Execution Checklist)

Write an actionable, step-by-step task checklist that developers or AI coding agents (Cursor, Claude Code, IBM Bob) can execute sequentially.

### Structure required inside `Tasks.md`:

1. Organize tasks chronologically by **Phase 1, Phase 2, Phase 3, and Phase 4** (matching `Plan.md`).
2. Format every task as a Markdown checkbox `- [ ]`.
3. Provide explicit technical details for each task:
   - **Task ID & Name**
   - **Target Files / Paths**
   - **Technical Acceptance Criteria** (e.g., "Must pass Supabase RLS test", "Must handle batch uploads up to 50 PDFs").

---

### ⚙️ OUTPUT RULES
- Ensure both documents are complete, fully populated, and ready to write to disk.
- Write raw SQL and code blocks where necessary to make the blueprint immediately actionable.
- Maintain consistency across table names, API paths, and role types between `Plan.md` and `Tasks.md`.