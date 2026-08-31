# OFFICIAL BLUEPRINT: Group 1 - The Owner Entity
**Shtiya Builder Enterprise Architecture & Workspace Design**

## 1. Architectural Overview & Onboarding
The Owner group represents the foundational supply side of the real estate marketplace[cite: 1]. To capture users effectively, the onboarding flow prioritizes speed and frictionless verification.

*   **The 3-Minute Verification Loop:** To claim the foundational `owner_single` role, users bypass manual document uploads. The system utilizes an automated API match, cross-referencing the user's rapid identity verification (e.g., Plaid/Stripe) against municipal tax and deed records (e.g., NYC Open Data).
*   **Monetization Engine:** Group 1 operates on a SaaS freemium/tiered model combined with a decentralized marketplace. Base homeownership tools are low-cost/free to maximize user acquisition, while advanced portals (Investor, Loss Mitigation) are gated behind subscription add-ons. 
*   **Affiliate Revenue:** All professional engagements (contractors, lawyers, brokers) executed through the portal trigger automated affiliate fees via $SHQL smart contracts[cite: 1]. 

---

## 2. The Workspace UI Paradigm (Directory Pane)
The user interface utilizes **Contextual Workspace Switching**. Instead of siloed accounts, users manage their diverse real estate identities via the Left Sidebar Directory Pane. 

*   **Main Tabs:** Represent the user's unlocked programmatic roles (e.g., 🏠 Homeowner, 📈 Investor).
*   **Subtabs:** Represent the specific application modules within that role.
*   **Context Isolation:** Clicking a Main Tab instantly redraws the central Interactive Map View and re-scopes the AI Co-Pilot's context, ensuring personal home data never bleeds into commercial investment data.
*   **The Upsell Engine:** Locked tiers appear in the Directory Pane with a padlock icon. Clicking them routes the user to a frictionless upgrade pipeline.

---

## 3. Sub-Role Portals & Feature Matrices

### A. The Base Tier: Single Homeowner (`owner_single`)
Designed for individuals seeking to extract utility, manage maintenance, or extract financial equity from their primary residence without engaging in speculative block assemblies[cite: 1].

**Directory Subtabs:**
*   **Vitals Dashboard:** Real-time Automated Valuation Model (AVM) estimates, local comparable sales, parcel boundaries, municipal zoning class, trash days, and emergency local contacts[cite: 1].
*   **Maintenance & Upkeep:** A localized ticketing system for wear-and-tear repairs (plumbing, HVAC).
*   **Renovation & Financing:** A module to source vetted contractors, request large-scale remodeling quotes, and instantly apply for Retail Equity (HELOCs) to fund the $SHQL smart contract escrows[cite: 1].
*   **Insurance Vault:** A secure locker for storing homeowner policies, equipped with automated API tools to shop for lower premiums.
*   **Local Professional Network:** The Interactive Map View strictly isolates the user's parcel while surfacing verified "pins" for local professionals (Contractors, Brokers, Legal) available for hire[cite: 1].

### B. The Investor Add-On: Owner-Investor (`owner_investor`)
A paid tier for homeowners seeking to maximize their Floor Area Ratio (FAR) and assemble adjacent parcels for high-density rezoning (e.g., SB 9 lot splits)[cite: 1].

**Directory Subtabs:**
*   **Block Assembly Map:** The map view shifts to reveal zoning overlays, theoretical massing models, contiguous block mapping, and neighbor opt-in statuses[cite: 1].
*   **JV & Syndication:** Tools to transmit digital Joint Venture (JV) intent agreements to neighbors and calculate aggregated bulk valuations[cite: 1].
*   **Enterprise Integrations:** Direct connection pipelines to Master Assemblers, Zoning Consultants, and JV Equity Partners[cite: 1].

### C. The Emergency Add-On: Distressed Homeowner (`owner_distressed`)
A defensive tier for properties burdened by severe municipal tax liens, pre-foreclosure proceedings, or catastrophic code violations[cite: 1].

**Directory Subtabs:**
*   **Defensive Map View:** The map instantly highlights active Stop Work Orders (SWO), code enforcement violations, and lien priority stacks[cite: 1].
*   **Loss Mitigation:** Emergency pipelines specifically designed to apply for loan modifications or coordinate short sales.
*   **Legal Shield Network:** Direct routing to specialized Municipal Expediters and Loss Mitigation Specialists utilizing $SHQL micro-escrows to retain legal counsel[cite: 1].
*   **Privacy Lock:** Explicitly suppresses unsolicited map pings from Wholesalers unless the user toggles a specific "Seeking Exit" flag[cite: 1].

---

## 4. Smart Contract & Financial Triggers
All value transfer within the Group 1 ecosystem is governed by decentralized $SHQL ledgers to ensure trustless execution[cite: 1]:
1.  **Milestone Payments:** The `owner_single` utilizes a multi-signature interface to authorize partial draw releases to contractors based on verified work[cite: 1].
2.  **Syndication Escrows:** The `owner_investor` executes multi-party on-chain locks to securely syndicate neighborhood assemblies without holdout risk[cite: 1].
3.  **Automated Affiliate Sweeps:** Upon any successful contract execution or professional hire through the local map network, the smart contract seamlessly splits the platform's affiliate fee prior to vendor disbursement.