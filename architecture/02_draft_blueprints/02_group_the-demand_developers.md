# OFFICIAL BLUEPRINT: Group 2 - The Investor / Developer
**Shtiya Builder Enterprise Architecture & Workspace Design**

## 1. Architectural Overview & Onboarding
The Investor/Developer group provides the speculative energy, risk capital, and operational execution required to reposition distressed assets and orchestrate land assemblies[cite: 1]. 

*   **The KYB Verification Loop:** To ensure the integrity of the marketplace, developer onboarding requires a Know Your Business (KYB) API integration (e.g., Middesk, Plaid Identity). The user submits their corporate EIN, which the system instantly cross-references against state registries to verify the operating entity.
*   **B2B SaaS Monetization Engine:** This group operates on a tiered B2B subscription model based on their operational scale:
    *   *Tier 1 (Wholesaler):* Standard SaaS fee for off-market distress data and contract assignment tools.
    *   *Tier 2 (Value-Add):* Premium SaaS fee unlocking environmental layers, CAD tools, and the B2B Vendor Marketplace.
    *   *Tier 3 (Enterprise Assembler):* Institutional pricing for algorithmic block syndication and SEC-compliant data rooms.

---

## 2. The Workspace UI Paradigm (Directory Pane)
The Left Sidebar functions as an institutional command center, emphasizing deal velocity, risk modeling, and supply chain management.

**▼ 🏗️ INVESTOR / DEVELOPER (Active Portal)**
*   **Deal Flow CRM:** Pipeline management for active leads and signed purchase options.
*   **Underwriting & ROI:** Dynamic calculators, rent multipliers, and Cap Rate models.
*   **Project Management:** Tracking for active job sites, permit statuses, and N-of-M signature approvals.
*   **Capital Stack:** Dashboards managing active construction debt and JV equity syndications.
*   **B2B Vendor & Material Marketplace:** The execution hub where developers source manpower and order raw materials directly from platform partners.
*   **Macro Reconnaissance:** The localized Interactive Map View.

---

## 3. Sub-Role Portals & Feature Matrices

### A. The Lead Generation Tier: Wholesaler (`investor_wholesaler`)
Designed to maximize capital velocity through contract arbitrage, minimizing holding periods and maximizing assignment fees[cite: 1].
*   **Macro-Distress Map:** Renders regional heatmaps of 60-day mortgage latencies, utility shut-offs, and chronic code enforcement violations[cite: 1].
*   **Instant Contract Engine:** Clicking a distressed parcel triggers an automated contract generator to securely transmit a digitally signed purchase option[cite: 1].
*   **Assignment Marketplace:** A digital bulletin board to instantly broadcast secured off-market contracts to Value-Add Developers[cite: 1].

### B. The Repositioning Tier: Value-Add Developer (`investor_value_add`)
Built for high IRR via structural repositioning, gut-renovations, and SB 9 urban lot splits[cite: 1].
*   **Feasibility Map View:** Renders strict municipal and environmental data: SUSMP runoff requirements, Alquist-Priolo fault zones, and lot split eligibility filters[cite: 1].
*   **The Execution Marketplace:** Direct integration with Group 5 and Group 6. The developer can post their Bill of Quantities (BoQ) to instantly receive bids from vetted General Contractors (`contractor_gc`) and order raw lumber/concrete directly from Material Suppliers (`contractor_supplier`)[cite: 1].
*   **Debt Facility Portal:** Real-time integration with Institutional Lenders to manage construction draws and maintain project liquidity[cite: 1].

### C. The Enterprise Tier: Master Assembler (`investor_assembler`)
Enterprise users orchestrating massive capital deployment into rezoned assets, completely eliminating catastrophic holdout risk[cite: 1].
*   **Aggregated Massing Map:** Highlights contiguous blocks achieving 100% owner consensus, displaying aggregated FAR upside and massing envelopes[cite: 1].
*   **Syndication Data Rooms:** Highly secure, RBAC-locked vaults containing environmental reports, soil analyses, and cryptographically secured intent-to-sell agreements[cite: 1].
*   **Institutional Partner Hub:** Direct procurement pipelines to hire Zoning Consultants (`arch_zoning`) for density bonuses and Transactional Attorneys (`legal_transactional`) to draft master Purchase and Sale Agreements[cite: 1].

---

## 4. Smart Contract & Financial Triggers
*   **Tokenized Assignments:** Purchase options secured by Wholesalers are minted as non-fungible data objects. Assignments automatically trigger $SHQL fee transfers, logging the chain of custody immutably[cite: 1].
*   **Automated Supply Chain:** When a Value-Add Developer orders materials via the B2B Marketplace, the system verifies the escrow balance and executes the purchase in $SHQL, instantly paying the supplier and deducting the exact amount from the project ledger[cite: 1].
*   **Decentralized Acquisitions:** Master Assemblers deploy syndication contracts that hold JV capital in escrow. Algorithms execute the bulk block acquisition only upon oracle-verified rezoning events, protecting LP capital[cite: 1].