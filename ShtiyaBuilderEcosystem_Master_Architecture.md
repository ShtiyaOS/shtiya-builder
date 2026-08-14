# 🏗️ Shtiya Builder Ecosystem: Master Architecture
**Version:** 2.0
**Concept:** A 10-App PropTech, FinTech & Social Network Ecosystem for Real Estate Development

---

## 🌍 Core Philosophy
The Shtiya Builder Ecosystem replaces fragmented real estate tools with a **Multi-Sided Professional Network Platform**. By moving homeowners, investors, attorneys, lenders, and contractors onto a single Unified Arena, Shtiya eliminates friction. Built on Web3 escrow, strict binding arbitration templates, and an interactive block-assembly social engine, Shtiya secures equity and accelerates development.

---

## 🏛️ System Architecture & The Unified Arena

All users log into a single domain (`app.shtiya.com`). Supabase Role-Based Access Control (RLS) dynamically renders the correct application interface while connecting everyone to the Shared Backend Engine.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       HTTP://APP.SHTIYA.COM                                            │
│                                  (Shtiya Unified Arena & Portal)                                       │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
 ┌─────────────────┬─────────────────┬──────────────┴──────────────┬─────────────────┬─────────────────┐
 ▼                 ▼                 ▼                             ▼                 ▼                 ▼
┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
│1. ACQUIS. │   │2. CAPITAL │   │3. CONTRAC.│   │4. LEGAL   │   │5. DESIGN  │   │6. PROPERTY│   │7. OWNER   │
│(Investors)│   │(Lenders)  │   │(Builders) │   │(Attorneys)│   │(Architect)│   │(Managers) │   │(Community)│
└─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
      │               │               │               │               │               │               │
 ═════╧═══════════════╧═══════════════╧═══════════════╧═══════════════╧═══════════════╧═══════════════╧═════
                             SHTIYA SHARED BACKEND ENGINE & ESCROW SMART CONTRACTS
                       (8. Escrow | 9. Office | 10. Marketing operating at the Core level)
 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
```

---

## 🏙️ The Block Assembly Social Map (Shtiya Owner)

The platform empowers homeowners to form joint ventures and aggregate their parcels for high-density upzoning, protected by smart contracts and mandatory binding arbitration.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   THE SHTIYA BLOCK ASSEMBLY MAP                                        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [ Interactive GIS Map View ]                                                                         │
│                                                                                                        │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                                                    │
│   │ 🏡1  │  │ 🏡2  │  │ 🏡3  │  │ 🏡4  │  │ 🏡5  │   ◄─── "Block Committee: 80% Joined"                  │
│   │[User1] │[User2] │[User3] │[User4] │ [LOCK] │        (Need 1 more owner to trigger rezoning bid)   │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘                                                    │
│                                                                                                        │
│   STATUS: 4 of 5 Owners Signed JV Intent Agreement.                                                   │
│   PROJECTED REZONING VALUE: $14,000,000 Total ($2.8M per owner vs $1.1M standalone).                    │
│   ACTION: [Invite Neighbor #5 to Join Block Committee]                                                 │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📱 The 10-App Professional Suite

| App Name | Primary User Persona | Core Functionality | Network Hand-Off |
| :--- | :--- | :--- | :--- |
| **1. Shtiya Owner** | Homeowners & Neighbors | Social block assembly, JV matchmaking, bulk renovation requests. | Pushes block assemblies to *Capital/Acquisition* for developer bids. |
| **2. Shtiya Acquisition**| Real Estate Investors | Scrapes probate leads, pulls municipal debt, analyzes block zones. | Sends qualified seller leads to *Legal*. |
| **3. Shtiya Legal** | Attorneys & Title | Smart PSAs, binding arbitration clauses, clear title, evictions. | Locks Earnest Money via *Escrow*. |
| **4. Shtiya Capital** | Lenders & VCs | Underwrites acquisition loans, funds renovation draws, RWA factoring. | Wires construction capital directly into *Escrow*. |
| **5. Shtiya Design** | Architects & Engineers | Vaults CAD/BIM files, tracks permits, converts plans to a BoQ. | Passes finalized BoQ to *Contractor*. |
| **6. Shtiya Contractor** | GCs & Sub-trades | Voice-to-Scope estimating, price audits, uploads site progress photos. | Submits photos to unlock *Escrow* funds. |
| **7. Shtiya Property** | Landlords & Tenants | Rent collection, routes maintenance tickets, tracks lease documents. | Routes repairs directly to *Contractor*. |
| **8. Shtiya Escrow** | System (Web3) | Smart contracts replacing traditional escrows for instant payouts. | Holds tenant deposits, lender draws, homeowner JVs. |
| **9. Shtiya Office** | Back-Office Admins | Verifies state licenses, insurance expirations, manages W9s. | Blocks *Escrow* payouts if a GC's license lapses. |
| **10. Shtiya Marketing** | Sales & Wholesalers | Automates social proof, syndicates reviews, builds lead funnels. | Feeds raw inbound seller leads to *Acquisition*. |

---

## 🗄️ Master Database Schema (Supabase PostgreSQL)
*The Shared Core relational model anchoring all 10 apps.*

*   **`users`**: RBAC accounts (Investors, Homeowners, Contractors).
*   **`properties`**: The anchor record (BBL, Parcel ID, GIS Coordinates).
*   **`block_committees`**: Links multiple `properties` together for joint-venture rezoning.
*   **`agreements`**: Stores Smart PSAs, JVs, and Leases (with binding arbitration flags).
*   **`financial_ledgers`**: Escrow balances, tax debts, material invoices.
*   **`documents`**: PDF bucket references (CAD files, photos, probate petitions).

---

## 🚀 4 Hour Sprint Plan
*Leveraging Google Cloud Code Assist, Claude Pro, and IBM Bob to build rapidly.*

### Hour 1: The Core Foundation
*   **Goal:** Set up Supabase DB, Next.js 14 Unified Arena shell, and Auth.
*   **Deliverables:** Master database schema deployed, GitHub repo initialized, login routing functional based on user tier.

### Hour 2: Sourcing & Community
*   **Goal:** Build *Shtiya Owner* (Map/Block Assembly) & *Shtiya Acquisition*.
*   **Deliverables:** Interactive GIS map for homeowners, probate PDF ingestion via Gemini API, Skip Tracing integration.

### Hour 3: Execution & Legal Shield
*   **Goal:** Build *Shtiya Legal*, *Shtiya Contractor*, and *Shtiya Escrow*.
*   **Deliverables:** Smart contract generation with arbitration templates, Voice-to-Scope quoting tool, milestone photo-upload UI.

### Hour 4: Capital, Operations & Polish
*   **Goal:** Build *Shtiya Capital*, *Shtiya Property*, and tie the ecosystem together.
*   **Deliverables:** Lender dashboard for draw approvals, Tenant portal for rent/maintenance, final end-to-end testing of the deal lifecycle.
