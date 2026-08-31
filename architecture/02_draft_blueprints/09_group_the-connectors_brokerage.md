# OFFICIAL BLUEPRINT: Group 9 - The Brokerage
**Shtiya Builder Enterprise Architecture & Workspace Design**

## 1. Architectural Overview & The Deal-Flow Engine
The Brokerage group is the circulatory system of the Shtiya Builder platform. They facilitate the movement of assets between Group 1 (Owners) and Group 2 (Developers), and fill the completed structures for Group 7 (Property Managers). 

*   **The "Packaged Deal" Requirement:** The platform disincentivizes "lazy" brokering. To list a commercial development site on the platform's B2B marketplace, the system prompts the broker to attach a preliminary massing/zoning study and an environmental Phase I report. This builds immediate buyer confidence, weeding out time-wasters and pushing pricing beyond expectations. 
*   **REBNY RLS Integration:** The platform features API integration with listing management providers to pull and push exclusive listing data securely through the REBNY RLS network, ensuring compliance with NYC co-brokerage rules. 
*   **Monetization Engine:** High-tier SaaS subscription fees for access to the platform's proprietary distress and zoning data, plus micro-transaction fees on the $SHQL ledger when a broker's listing successfully closes through a platform escrow.

---

## 2. The Workspace UI Paradigm (Directory Pane)
The Left Sidebar transforms into a high-velocity CRM, spatial prospecting tool, and digital data room manager.

**▼ 🤝 BROKERAGE & DEAL DESK (Active Portal)**
*   **Spatial Prospecting Map:** The interactive map loaded with MapPLUTO land-use categories, combined lot-size filters, and built-FAR caps for finding off-market sites.
*   **Deal Flow CRM & Lead Gen:** Management of outbound owner solicitations, active listings, and buyer representation pipelines.
*   **Digital Data Rooms:** Secure, RBAC-locked vaults where the broker stores zoning analyses, lease expiration schedules, and access agreements to share with verified developers.
*   **Lease Economics Calculator:** Tools to break down lease economics, tenant improvement allowances, and expansion rights for commercial tenants.

---

## 3. Sub-Role Portals & Feature Matrices

### A. Commercial Broker (`broker_commercial`)
Focuses on block assemblage, investment sales, and off-market development sites.
*   **Assemblage Mapping:** The broker uses the map to select neighborhoods and apply logic to screen adjacent parcels based on existing built intensity (FAR) and lot counts. 
*   **Developer Pitch Hub:** When the broker successfully organizes a group of `owner_investor` users, they utilize the portal to commission a conceptual massing study from an `arch_ra` and present a unified, de-risked blueprint to the `investor_assembler`. 
*   **Commercial Tenant Rep:** For completed office/retail spaces, they manage corporate tenant requirements, comparing neighborhood dynamics, commute access, and negotiating lease language against landlords. 

### B. Residential Broker (`broker_residential`)
Focuses on single-family flips, small multi-family investment sales, and retail home buyers.
*   **Distress Interception:** By subscribing to premium data tiers, this broker can view properties where an `owner_distressed` has toggled the "Seeking Exit" flag. The broker can rapidly intervene to list the property or sell it off-market to a `investor_value_add`.
*   **Flat-Fee / Agent-Assisted FSBOs:** They can utilize the portal to offer limited-service, flat-fee MLS listings on the REBNY RLS, acting as a sheer transactional conduit for homeowners seeking maximum exposure. 

### C. Leasing Broker (`broker_leasing`)
The operational connector handling high-velocity tenant placement for retail, office, and luxury residential units.
*   **Landlord & Tenant Matchmaking:** Integrates with the `prop_manager` to fill vacancies. They arrange curated property tours that match operational needs and future expansion plans. 
*   **Lease Execution Dashboard:** Coordinates all aspects of the deal from initial search through closing, ensuring the financial terms (e.g., percentage rent provisions for retail) are accurately reflected in the final digital lease. 

---

## 4. Smart Contract & Financial Triggers
*   **Automated Commission Splits:** When a transaction closes, the smart contract executing the deed transfer simultaneously calculates the broker's commission (e.g., 5% of the sale price). It automatically splits this fee between the Listing Broker and the Buyer's Broker based on the RLS Universal Co-Brokerage Agreement, routing the $SHQL instantly to their respective wallets. 
*   **Data Room Access Escrow:** A broker can lock a highly sensitive due-diligence data room (containing proprietary financial ledgers of a building) behind a refundable $SHQL micro-deposit. A developer must stake funds to view the data, eliminating "lookie-loos" and protecting the seller's privacy.
*   **Bounty/Referral Payouts:** If a broker refers an `owner_single` to the platform, and that owner subsequently takes out a HELOC to renovate, the broker automatically receives a micro-percentage referral bounty via a smart contract sweep.