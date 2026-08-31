# OFFICIAL BLUEPRINT: Group 7 - Property Manager & Tenant (Expanded)
**Shtiya Builder Enterprise Architecture & Workspace Design**

## 1. Architectural Overview & The Direct-Leasing Engine
The Property Manager & Tenant group represents the terminal, stabilized phase of the real estate lifecycle: the ongoing operation and maintenance of the physical asset[cite: 1]. 

*   **Direct-to-Tenant Underwriting (The Anti-Broker Engine):** Under regulations like the NYC FARE Act, property managers absorb the financial loss of broker fees and poor tenant vetting. The portal integrates automated Plaid/Open-Banking financial verification, credit scoring, and eviction checks. Property managers can market listings directly and execute leases without paying 1-month to 15% annual rent broker fees.
*   **The Emergency Dispatch Engine:** Connects directly with Group 5 (Contractors). Property managers can instantly dispatch on-call, vetted specialty trades (electricians, plumbers) at any hour via live map availability.
*   **Monetization Engine:** Per-unit SaaS subscription fees, applicant screening transaction fees ($30–$50 per application), and rent-roll micro-processing fees.

---

## 2. The Workspace UI Paradigm (Directory Pane)

**▼ 🏢 PROPERTY MANAGEMENT (Active Portal - Manager View)**
*   **Underwriting & Applicant Desk:** Inbound tenant applications, AI risk scores, verified income reports, and one-click lease approvals.
*   **Portfolio Health & NOI:** Aggregate NOI dashboard, market rent benchmarks, and vacancy alerts.
*   **Live Rent Roll:** Financial ledger tracking $SHQL rent collection, automated management fee deductions, and owner sweeps[cite: 1].
*   **Maintenance Dispatch Desk:** Live triage board for emergency repairs connected to the Group 5 Contractor Map.
*   **Portfolio Map View:** Localized map view showing maintenance hotspots and unit availability[cite: 1].

**▼ 🔑 MY UNIT (Active Portal - Tenant View)**
*   **Unit Schematic Map:** Restricted, unit-only schematic view ensuring privacy[cite: 1].
*   **Applicant Onboarding:** Instant ID upload, income linking, and digital lease signing.
*   **Payments & Ledgers:** Auto-pay configuration and immutable rent receipts[cite: 1].
*   **Maintenance Ticketing:** Geotagged photographic ticketing with real-time vendor dispatch tracking[cite: 1].

---

## 3. Financial & Underwriting Triggers
*   **Parametric Lease Approval:** If an applicant's verified income is 40x monthly rent, credit score exceeds 700, and housing court records are clean, the system auto-generates the lease and sends a sign request.
*   **Automated Rent Sweeps:** Monthly $SHQL rent transfers execute automatically, deducting management fees before sweeping funds to the owner's ledger[cite: 1].
*   **Maintenance Escrow Payouts:** Upon completion of a verified repair, funds are released automatically from the maintenance reserve to the contractor[cite: 1].