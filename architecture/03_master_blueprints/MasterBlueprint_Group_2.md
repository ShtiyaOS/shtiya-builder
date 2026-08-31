# MASTER BLUEPRINT — GROUP 2: THE DEMAND (INVESTOR / DEVELOPER ENTITY)

**Document class:** Production Architecture Specification
**Supersedes:** `architecture/02_draft_blueprints/02_group_the-demand_developers.md`
**Version:** 2.0 (Red-Teamed / Hardened)
**Date:** 2026-08-19
**Taxonomy scope:** 3 of 25 sub-roles — `investor_wholesaler`, `investor_value_add`, `investor_assembler`
**RLS group string:** `investor` (via `current_user_role_group()`)
**Counterparty blueprint:** `MasterBlueprint_Group_1.md` v2.0 — **binding**; Appendix A is the boundary contract
**Stack:** Next.js 14 App Router · Supabase Postgres + RLS · Zustand Context Registry · Vercel AI SDK · Mapbox GL · $SHQL Web3 settlement

---

## 0. How To Read This Document

| Part | Contents |
|---|---|
| **Part I** | Red Team Audit — 26 findings, ranked, with exploit paths |
| **Part II** | Hardened Architecture — the corrected design |
| **Part III** | Implementation Spec — schema, RLS, API contracts, TS types |
| **Part IV** | Verification — RBAC matrix, acceptance criteria, telemetry |
| **Part V** | Residual Risk & Legal Review Queue |
| **Appendix A** | **The Group 1 ↔ Group 2 Boundary Contract** (mandatory reconciliation) |
| **Appendix B** | Traceability to `rbac-audit-red-team.md` |
| **Appendix C** | Required deltas to `phase8-sub-role-expansion-plan.md` |

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt
Every finding carries a `FIX →` pointer to the Part II/III section that resolves it.

---

# PART I — RED TEAM AUDIT

## 0.1 Executive Verdict

**The draft's Tier 1 product is the product Group 1's hardening prohibits.**

The Group 2 draft sells "off-market distress data" as its entry-tier subscription, renders it as a "Macro-Distress Map" of 60-day mortgage latencies and utility shut-offs, and lets a subscriber click a distressed parcel to fire a signed purchase option at the homeowner. Group 1 §II.5.3 #5 forbids computing, exposing, ranking, or selling derived distress state; §II.5.4 requires consent before contact; §II.8.4 withdrew the equivalent Group 9 tier. Written as drafted, these two blueprints cannot both ship. **This document resolves the conflict in Group 1's favour and rebuilds Group 2's economics on a different, lawful, and defensible basis.**

That resolution is not a concession — it is the correct read of where Group 2's advantage actually lies. Four structural defects drive the remaining findings:

1. **The draft sells information asymmetry; the platform's real product is execution certainty.** Distress lists are a commodity — every skip-trace vendor sells them, and the good ones are FCRA-encumbered. What no competitor offers is a verified counterparty on both sides, an assignment that cannot be double-sold, a title-cleared close, sealed-bid procurement, and a draw that funds without a phone call. That is the product this blueprint builds. §II.5, §II.7, §II.8.

2. **Entity verification is treated as identity verification.** KYB proves an LLC exists. It proves nothing about who is operating it, and an LLC costs $50 and one day — so entity-level bans, quotas, and suppressions are defeated by a new registration. Every reputational and protective control Group 1 built collapses at this seam. §II.2.

3. **On-chain objects are asserted to *be* legal interests.** "The smart contract instantly reassigns the equitable title rights"; "transferring the master consolidated deed to the assembler's holding company." Neither is possible. Equitable interests transfer by assignment instrument subject to the option's assignability clause; deeds transfer by recorded conveyance at the county. The draft creates a permanent divergence between chain state and legal state, at assignment-fee scale for wholesalers and at nine-figure scale for assemblers. §II.7, §II.9.

4. **Authorization is derived from subscription tier.** Tier 3 buys "SEC-compliant data rooms and algorithmic syndication." A billing event that widens a data scope is a privilege escalation with a credit card, and it is the identical defect found as G1-04. Group 2's authorization primitive is not the parcel (investors own nothing) — it is the **deal**. §II.1.

Layered on top: an unregistered securities offering (`investor_assembler` pools LP capital with no Reg D pathway, no accreditation check, and no Rule 506(d) bad-actor screen), unlicensed-wholesaling exposure in states that now require registration, FCRA exposure on mortgage-delinquency data used for acquisition solicitation, and a syndication contract that irreversibly sweeps pooled capital on the word of a single unauthenticated municipal API.

## 0.2 Finding Register

| ID | Sev | Domain | Finding |
|---|---|---|---|
| G2-01 | 🔴 | Onboarding | KYB proves an entity exists, not that the operator controls it — developer impersonation |
| G2-02 | 🔴 | Onboarding | Shell-entity churn defeats every ban, quota, and Group 1 suppression |
| G2-03 | 🔴 | Data | Macro-Distress Map is a prohibited surface and FCRA-encumbered |
| G2-04 | 🔴 | Contact | Instant Contract Engine bypasses the entire Group 1 solicitation control plane |
| G2-05 | 🔴 | $SHQL | Tokenized option asserted to *be* the equitable interest — chain/legal divergence |
| G2-06 | 🔴 | $SHQL | Assignment fee paid to the wholesaler before the assignee can verify anything |
| G2-07 | 🔴 | $SHQL | Syndication oracle is a single unauthenticated source triggering irreversible sweeps |
| G2-08 | 🔴 | Securities | Assembler pools LP capital with no Reg D pathway, accreditation, or bad-actor screen |
| G2-09 | 🔴 | RBAC | Subscription tier widens data scope — privilege escalation by payment |
| G2-10 | 🟠 | Fraud | Non-platform double assignment; freely transferable token breaks KYC and assignability |
| G2-11 | 🟠 | Contact | Assignment Marketplace broadcasts seller identity, address, and price to a bulletin board |
| G2-12 | 🟠 | Privacy | Assembler data room exposes named consumer homeowners' signed intents to LPs |
| G2-13 | 🟠 | $SHQL | Materials paid instantly on order — no delivery verification, no velocity limit |
| G2-14 | 🟠 | $SHQL | Draw N-of-M lets the borrower certify its own progress — construction-loan fraud |
| G2-15 | 🟠 | RBAC | Deal-scoped data (BoQ, docs, ledgers) reachable by role group rather than membership |
| G2-16 | 🟠 | RBAC | No org seat model — shared logins, or an analyst holding escrow authority |
| G2-17 | 🟠 | UI | Single flat portal violates the contextual-workspace paradigm; Co-Pilot spans all deals |
| G2-18 | 🟠 | Extortion | Assembly footprint leakage lets a rival buy the keystone parcel |
| G2-19 | 🟠 | Extortion | Wholesaler re-trades the assignment fee after the developer sinks diligence cost |
| G2-20 | 🟠 | Compliance | No licensure gate for wholesaling in states requiring registration |
| G2-21 | 🟠 | Assembly | "Completely eliminating holdout risk" re-imports the drag-along deleted in G1-10 |
| G2-22 | 🟡 | Data | "Distress before it hits public ledgers" — no lawful provenance for non-public signals |
| G2-23 | 🟡 | Marketplace | Open BoQ bidding permits bid shopping and bid leakage; undisclosed steering fees |
| G2-24 | 🟡 | $SHQL | LP capital locked with no sunset; multi-month token exposure on a USD obligation |
| G2-25 | 🟡 | Monetization | Platform takes a % of assignment spread — aligned against the homeowner |
| G2-26 | 🟢 | UX | Every "instant" in the draft is a removed checkpoint; KYB-before-value drop-off |

---

## 1. Onboarding & Entity Trust

### G2-01 🔴 KYB verifies the entity, not the operator

**Draft text:** *"The user submits their corporate EIN, which the system instantly cross-references against state registries to verify the operating entity."*

**Finding.** Middesk or an equivalent confirms that `ACME HOLDINGS LLC` is in good standing in Delaware with a matching EIN. It confirms nothing about the human submitting it. EINs appear in public filings, lien records, UCC statements, and prior contracts. Secretary of State registries are free and searchable. The full input set for this check is public.

**Exploit.** Attacker looks up an established regional developer with a visible track record, submits that entity's name and EIN, and passes KYB instantly. They now hold a verified `investor_value_add` account carrying another firm's reputation. They post BoQs and collect contractor bids containing competitors' pricing; they receive assignment offers from wholesalers; they solicit connections from Group 1 owners under a trusted name; and in the draft's own supply-chain flow they are positioned to receive materials or direct payments. The impersonated firm has no account and no notice.

**Aggravating factor.** The draft binds tier to entity scale, so impersonating a *large* entity is also the fastest route to the widest data scope.

`FIX →` §II.2 Entity Trust Ladder. KYB is one rung, never the whole ladder. E2 requires beneficial-owner KYC plus a control proof binding the natural person to the entity: officer/registered-agent match, entity-bank micro-deposit, IRS SS-4/147C letter, or verified control of the entity's registered domain.

---

### G2-02 🔴 Shell-entity churn defeats every protective control

**Finding.** Group 1 §II.5.4 specifies that a declined connection is *permanently* suppressed and survives "new subscriptions, new role assignments, and re-registration under the same verified identity." That guarantee is only as strong as the identity keying. The draft keys accounts to **entities**. A Delaware or New Mexico LLC costs roughly $50 and clears in a day; New Mexico does not even publish member names.

**Exploit.** A wholesaler accumulates suppressions after harassing owners across a neighborhood, or is banned outright. They register `ACME HOLDINGS II LLC`, complete KYB in three minutes, and re-enter with a clean suppression table, a reset connection quota, zero reputation history, and a fresh trial. They resume contacting the same owners. Group 1's central anti-predation guarantee is defeated for the price of a filing fee.

**Second-order exploit.** The same technique multiplies solicitation quota: ten entities, each with three lifetime invitations per parcel, yields thirty. The quota is nominally per-requester, so entity-keying converts a hard cap into a purchasable one.

`FIX →` §II.2.3 Beneficial Owner Identity Graph. Suppressions, quotas, reputation, sanctions, and bans attach to the **V1 IDV identity hash** of every control person, propagate to every entity that identity controls, and are inherited automatically by any new entity that person registers. Undisclosed related entities are detected (shared registered agent, address, phone, bank account, device, payment instrument) and disclosure of affiliates is a condition of E2.

---

### G2-20 🟠 No licensure gate for wholesaling

**Finding.** Several jurisdictions now require a real estate licence or a specific wholesaler registration to market or assign residential purchase contracts, and several treat marketing the *property* (rather than one's equitable interest) as unlicensed brokerage. The platform supplies the contract generator, the marketing surface, and the assignment rail, in every state, with no jurisdictional logic. It is the instrumentality.

`FIX →` §II.2.5 Jurisdiction Capability Gating — the assignment and offer surfaces are enabled per state per sub-role, gated on verified licensure or registration where required, with mandatory equitable-interest-only marketing language enforced in the listing template (§II.7.4).

---

### G2-08 🔴 Assembler syndication is an unregistered securities offering

**Draft text:** *"deploys an institutional-grade smart contract that aggregates massive capital tranches from multiple Joint Venture participants"*; Tier 3 sells *"SEC-compliant data rooms."*

**Finding.** Pooling capital from passive participants into a common enterprise with profits expected from the promoter's efforts is an investment contract under *Howey*. The draft provides: no offering-exemption pathway, no accredited-investor verification, no Rule 506(d) bad-actor screening of the promoter or its control persons, no subscription-document workflow, no transfer restrictions, and no Form D. It also markets "SEC-compliant data rooms" — a data room is a file store; compliance is a process, and describing the file store as the compliance is a misrepresentation the platform makes on the promoter's behalf.

**Aggravating factor.** If the platform hosts the offering surface and takes transaction-based compensation on capital raised, it risks acting as an unregistered broker-dealer.

`FIX →` §II.9.1 Reg D rails: 506(b) vs 506(c) election, accreditation verification under 506(c), bad-actor screening against every beneficial owner from §II.2.3, general-solicitation UI hard-disabled under 506(b), subscription-document workflow, Form D reminders, transfer restrictions, and **flat platform fees only** on syndication surfaces (§II.10.3).

---

### G2-26 🟢 KYB-before-value drop-off

**Finding.** A wholesaler evaluating the platform wants to know whether there is inventory in their market before they upload an EIN and beneficial-owner documents. The draft gates everything behind KYB.

`FIX →` §II.2.1 E0 Prospect — aggregate market statistics only (counts, medians, absorption), no parcels, no identities, no export.

---

## 2. Data Plane & Predation

### G2-03 🔴 The Macro-Distress Map is a prohibited surface

**Draft text:** *"Renders regional heatmaps of 60-day mortgage latencies, utility shut-offs, and chronic code enforcement violations"*; Tier 1 sells *"off-market distress data"*; the taxonomy adds *"predictive analytics to identify municipal and financial distress before it hits public ledgers."*

**Finding — three independent defects.**

1. **It is the surface Group 1 prohibits.** §II.5.3 #5: the platform computes distress internally *solely to offer the Shield tier*, and that computation "is never exposed, exported, sorted on, or sold to any role outside Group 1 + `admin`." §II.8.4 withdrew the Group 9 equivalent by name. A heatmap ranking parcels by distress is precisely the amplification the boundary forbids.

2. **Mortgage delinquency is consumer credit information.** "60-day latencies" is a credit-file attribute. Obtaining or using it requires a permissible purpose under FCRA. Acquiring a consumer's home is not one; the pre-screen mechanism exists only for firm offers of credit or insurance. Selling this as a subscription data layer places the platform in the position of a consumer reporting agency furnishing files without permissible purpose.

3. **Utility shut-off data is not generally lawfully available** for acquisition targeting, and its inclusion signals that the pipeline's provenance was never examined.

**Exploit.** No exploit is required — the product *is* the harm, and it is sold by the seat. Secondarily, the heatmap is a re-identification oracle: a "heatmap" over parcels is a per-parcel score with a colour ramp, and a subscriber can sample it at parcel resolution to reconstruct the underlying score, defeating Group 1's k-anonymity floor through repeated bounded queries.

`FIX →` §II.5 Demand-Side Data Plane. The distress heatmap is **withdrawn**. It is replaced by four lawful sources — the consented `seeking_exit` feed, unranked public records, the subscriber's own lead data, and inbound owner-initiated offer requests — plus a genuinely valuable **Market Intelligence** product that is statistical, census-block-aggregated, k-anonymized, and carries no parcel-level score. §II.5.4 adds a Provenance Registry so no layer can ever render again without a declared lawful basis.

---

### G2-04 🔴 The Instant Contract Engine bypasses the solicitation control plane

**Draft text:** *"Clicking a distressed parcel triggers an automated contract generator to securely transmit a digitally signed purchase option"* directly to the owner.

**Finding.** This is unsolicited first contact, delivered as an executable contract, targeted by distress, at one click. It bypasses `can_solicit()`, the 3-per-parcel-lifetime invitation quota, the permanent-decline suppression, and the `no_contact` register — every control in Group 1 §II.5.4. A signed purchase option as an opening touch on a homeowner in arrears is the exact pattern consumer-protection regulators describe when they write foreclosure-rescue and unfair-practices rules.

**Exploit.** Subscriber selects a county, filters the map by the distress ramp, and fires templated options at hundreds of owners in an afternoon. Each is a document the recipient can sign. Recipients who do not understand that they are conveying equitable interest sign under time pressure.

`FIX →` §II.6 Contact & Offer Protocol — a four-stage ladder (connection request → acceptance → introduction → offer), where every stage is quota-limited and suppression-checked server-side, an offer cannot be the first artifact a recipient sees, offers require an accepted connection plus an owner-granted offer invitation, and the owner receives a plain-language explanation of equitable interest plus a rescission window before any signature binds.

---

### G2-11 🟠 The Assignment Marketplace broadcasts the seller

**Draft text:** *"A digital bulletin board to instantly broadcast secured off-market contracts to Value-Add Developers."*

**Finding.** The homeowner signed an option with **one** counterparty. The draft then republishes the parcel address, the contract price, and — by inference from the map layer that produced the lead — the seller's distress posture, to every Tier 2 subscriber. The consent scope of the original transaction does not extend to a bulletin board. This is also the exact conduct that draws unlicensed-brokerage findings: marketing the *property* to the public rather than one's *equitable interest* to a counterparty.

`FIX →` §II.7.4 Masked Assignment Listings — pre-NDA listings expose deal geometry only (submarket, product type, price band, timeline), never address, never owner identity; unmasking requires an executed NDA plus an assignment intent; seller consent to assignment must exist in the option and is verified before listing; listing template enforces equitable-interest-only language.

---

### G2-12 🟠 The assembler data room exposes named homeowners to LPs

**Draft text:** *"data room containing the cryptographically secured intent-to-sell agreements of the underlying owners."*

**Finding.** Group 1 owners signed a JV intent within a **committee**, under §II.6.2's mutual-opt-in visibility model. They did not consent to their signed intent — name, parcel, price, terms — being circulated to an enterprise assembler's limited partners, lenders, and consultants, nor to it being downloadable and retained indefinitely by parties they will never meet.

`FIX →` §II.9.4 Purpose-Bound Data Rooms — per-recipient grants with expiry, viewer-only rendering with no download for consumer-signed instruments, per-recipient watermarking, an access log surfaced to the owner in Group 1's Exposure & Privacy subtab, and a consent artifact naming the recipient class that the owner must have acknowledged before inclusion.

---

### G2-22 🟡 No lawful provenance for non-public signals

**Finding.** "Distress before it hits public ledgers" describes data whose source is, by definition, not the public record. Nowhere does the draft state where it comes from. The two plausible answers are both disqualifying: platform-internal Group 1 state (a direct boundary breach), or purchased credit-adjacent data (G2-03 defect 2).

`FIX →` §II.5.4 Provenance Registry — every map layer and data product declares source, licence, lawful basis, permitted use, and refresh cadence. **A layer with no registry entry does not render**, enforced at the tile-service layer, not in the client.

---

## 3. Assignment, Title & Contract Mechanics

### G2-05 🔴 The token is asserted to be the legal interest

**Draft text:** *"Purchase options... are minted as non-fungible data objects"*; the taxonomy adds *"The underlying smart contract instantly reassigns the equitable title rights to the new developer."*

**Finding.** A token transfer does not assign an equitable interest in real property. Assignment is governed by the option's assignability clause (many are expressly non-assignable, or require the seller's written consent), by the statute of frauds, and in some structures by recording. The draft creates a system where the chain says the developer holds the interest while the paper says the wholesaler does — or worse, that no valid assignment occurred at all because the option prohibited it.

**Exploit.** Wholesaler secures an option containing a standard non-assignment clause. Platform mints the token anyway (nothing reads the clause). Developer buys the token for $40,000, believing they hold the interest. Seller refuses to close with a party they never contracted with. The developer holds a token, no interest, and no counterparty — and the platform's immutable log is the record that says they *do* hold it.

`FIX →` §II.7.1 — the token is a **chain-of-custody pointer, explicitly not the interest**, and renders that disclaimer in every surface. Minting requires a machine-checked assignability determination against the parsed option (`assignable` / `assignable_with_consent` / `non_assignable`); a `non_assignable` option cannot be listed; `assignable_with_consent` requires a recorded seller consent artifact before listing. The legal assignment executes as an e-signed instrument; the token movement is a *consequence* of that instrument, sequenced through the two-phase intent protocol.

---

### G2-10 🟠 Double assignment and uncontrolled token transfer

**Draft text:** *"logging the chain of custody immutably to prevent any off-chain assignment disputes or dual-contract fraud."*

**Finding.** The immutable log prevents a second assignment **on the platform**. It does nothing about a paper assignment executed the same afternoon to an off-platform buyer, which is the actual fraud pattern. Separately, a freely transferable token can be sold on any secondary venue to a wallet with no KYC, no accreditation, no licence, and no relationship to the option's assignability clause — converting a real property interest into a bearer instrument.

`FIX →` §II.7.2 — tokens are **non-transferable except through a platform-attested transfer hook**; every assignment requires a Group 4 `legal_title` clearance gate before funds move; the platform records a memorandum of option where state law permits, converting the platform record into constructive notice; and the assignment instrument carries a seller acknowledgment that no other assignment is outstanding.

---

### G2-06 🔴 The assignment fee is paid before anything is verified

**Draft text:** *"The Value-Add Developer executes a smart contract that transfers the $SHQL assignment fee to the wholesaler's wallet."*

**Finding.** Payment is atomic with token transfer and precedes every fact that determines whether the developer received anything: whether the option is assignable, whether title is clear, whether the seller acknowledges, whether the signature on the option is genuine, whether the option is still in force. The wholesaler is paid; the developer's recourse is litigation against a $50 LLC (see G2-02).

**Exploit — the clean-exit fraud.** Register an LLC, complete KYB, secure or fabricate an option on a parcel, list the assignment, collect the fee on-chain, dissolve. The chain settlement is final. With entity-keyed identity (G2-02), the same person repeats it.

`FIX →` §II.7.3 Assignment Escrow — the fee escrows and releases only on a deal-type-appropriate condition set: `legal_title` clearance, seller acknowledgment of assignment, and (for assignment-at-closing structures) recorded closing. Time-boxed with automatic full refund to the assignee on expiry. Earnest money is held by a **licensed escrow agent, never in the wholesaler's wallet**.

---

### G2-19 🟠 Assignment-fee re-trade extortion

**Finding.** The developer performs diligence — inspection, title pull, contractor walk-through, lender pre-flight — against an option with a fixed expiry. As expiry nears, the developer's sunk cost is maximal and their alternatives are minimal. The rational adversarial move for the wholesaler is to raise the assignment fee at T-minus-72-hours. The draft's "instant" marketplace has no mechanism preventing it.

`FIX →` §II.7.5 — the assignment fee is **fixed and binding at listing** for the duration of a Diligence Lock the assignee purchases (refundable deposit); any term alteration inside the lock voids the lock and refunds the deposit in full plus a documented diligence-cost credit; re-listing a parcel at a higher fee after a voided lock is rate-limited and reputation-scored.

---

## 4. Construction, Supply Chain & Draws

### G2-13 🟠 Materials pay instantly on order

**Draft text:** *"the system verifies the escrow balance and executes the purchase in $SHQL, instantly paying the supplier and deducting the exact amount from the project ledger."*

**Finding.** Payment fires on *order*, not on *delivery*. Three failure modes: a supplier takes payment and never ships; a compromised developer session drains the project ledger to an attacker-controlled supplier wallet in a single request with no velocity limit and no step-up; and — most significantly — a substantial share of that ledger is the **lender's** money under a construction facility, being disbursed with the lender as neither signer nor observer.

`FIX →` §II.8.3 Materials Escrow — PO → shipment (partial release permitted for bona fide deposits, capped) → site receipt confirmed by the `contractor_gc` with geotagged Vision evidence → balance release. Per-transaction and rolling-24h velocity caps, step-up authentication above threshold, supplier payout accounts bound to the verified entity, and lender co-consent required for any disbursement against debt-facility funds.

---

### G2-14 🟠 The borrower certifies its own progress

**Draft text:** *"requiring approval from both the developer and the lender's designated inspector."*

**Finding.** The developer is the borrower. Their incentive is to certify progress early and often to maintain liquidity — the canonical construction-loan fraud pattern (over-billing against the schedule of values, front-loading, and billing for stored materials never delivered). The draft additionally omits every standard control: retainage, conditional and unconditional lien waivers, and schedule-of-values variance detection. Group 1 §II.7.3 already established these for the homeowner side; the developer side is the higher-value target and has none of them.

**Cross-group extortion (mirror of G1-14).** The inverse also holds: a developer can withhold draw approval to renegotiate the GC's price mid-project, with the contractor's payroll as leverage.

`FIX →` §II.8.2 — 3-key release (developer, independent inspection oracle, lender) where the developer can request but **never unilaterally approve**; full Group 1 §II.7.3 gate set inherited (Vision, compliance-row-must-exist, waiver exchange, 10% retainage); schedule-of-values variance alarms; stored-materials treated under §II.8.3 only; and a bilateral dispute clock escalating to Group 4 so neither party can hold the other's cash flow hostage indefinitely.

---

### G2-23 🟡 Bid shopping, bid leakage, and steering

**Draft text:** *"post their Bill of Quantities (BoQ) to instantly receive bids."*

**Finding.** With open bids, a developer can reveal bid A to bidder B to extract a lower number — bid shopping. Contractors learn this quickly and either pad or leave. Separately, if the platform earns a fee on material orders it has an undisclosed incentive to steer the BoQ toward fee-bearing suppliers. Taxonomy line 189 also requires that a wholesaler must not see an architect's proprietary BoQ — with `design` in `investor_value_add`'s app map and `acquisition` shared across the group, that isolation needs an explicit mechanism.

`FIX →` §II.8.4 — sealed bids until a published deadline, simultaneous unsealing, bid contents never exposed to competing bidders, post-award anonymized ranking only, disclosed platform fees on every marketplace surface, no fee-weighted default ranking, and BoQ access scoped to deal membership (§II.1) rather than to role group.

---

## 5. Assembly & Syndication

### G2-07 🔴 The syndication oracle is a single point of catastrophic failure

**Draft text:** *"The contract holds the $SHQL capital in an immutable escrow until... an external oracle, such as the municipal property database, confirms the rezoning event, [then] the smart contract deterministically executes the bulk acquisition."*

**Finding.** A single municipal endpoint — typically an unauthenticated scrape of a portal with no stable schema, no SLA, and no signing — is the sole trigger for an irreversible nine-figure sweep. Failure modes: the portal changes its HTML and the parser reads a stale or wrong field; DNS or BGP interference feeds the platform a forged response; the municipality posts a provisional approval later rescinded on appeal; the record is simply wrong. Each yields a **false positive**, which under "deterministic execution" is unrecoverable.

**Exploit.** An attacker who can influence the resolution path for one municipal hostname — or who can get a single crafted record into a scraped page — triggers the sweep. Capital moves to seller wallets. There is no recall.

**Second defect.** *"transferring the master consolidated deed to the assembler's holding company"* is not something a contract can do. Deeds are recorded instruments; consolidation is a municipal action. Same divergence as G2-05, at maximum scale.

**Third defect.** Sellers are paid *to wallets*. Real closings require payoff of existing mortgages and liens, prorations, transfer taxes, and title insurance through settlement. Sweeping tokens to a seller leaves their mortgage unsatisfied and title clouded — the transaction the assembler paid for does not exist.

`FIX →` §II.9.2 Multi-Source Attested Oracle — N-of-M across independent municipal sources plus a **notarized human attestation** from a licensed `arch_zoning` and a `legal_title` officer, both staking reputation and bonded; a mandatory 10-business-day dispute window between confirmation and execution during which any LP or GP can halt; per-confirmation value caps requiring a fresh attestation above threshold; appeal-period awareness so provisional approvals never satisfy the gate; and §II.9.3 Coordinated Closing, in which the contract releases **to licensed settlement**, never to seller wallets, and title transfers by recorded conveyance with the token acting only as a settlement receipt.

---

### G2-21 🟠 Holdout elimination re-imports the deleted drag-along

**Draft text:** *"Enterprise users orchestrating massive capital deployment into rezoned assets, completely eliminating catastrophic holdout risk"*; the map *"highlights contiguous blocks achieving 100% owner consensus."*

**Finding.** Group 1 §II.6.1 deleted the drag-along and replaced it with Holdout-Priced Assembly for stated consumer-protection reasons. Group 2's enterprise tier is sold on the promise that holdout risk is *eliminated*. Only two mechanisms could deliver that: binding non-signers (deleted), or eliminating them at the point of consensus formation via pressure. Neither survives.

Note also that "100% consensus" as a *display filter* creates the pressure directly: it tells the assembler exactly which single parcel is blocking a block, which is the input to a targeted-pressure campaign against one household.

`FIX →` §II.9.5 Cascading Footprint Assembly — the assembler underwrites a **primary footprint** and pre-priced fallback footprints; the syndication executes over whichever footprint achieves consented participation; non-participants are excluded, never bound, never individually identified to the assembler pre-consent. Consensus is surfaced as a band (`60-79%`, `80-99%`, `complete`) over a minimum 5-parcel cohort — never as "one holdout remaining."

---

### G2-18 🟠 Footprint leakage lets a rival buy the keystone

**Finding.** This one runs against Group 2, and the draft is equally careless with it. If the platform publishes "blocks achieving consensus" to every Tier 3 subscriber, a rival assembler reads the map, identifies the assembly in progress, and acquires the keystone parcel to resell at a monopoly premium. The assembler's months of option cost and consultant spend are captured by a competitor who read a dashboard. Neither party is protected: the homeowner from targeted pressure, nor the assembler from front-running.

`FIX →` §II.9.6 Footprint Confidentiality — declared target footprints are private to the declaring org; the public consensus layer is coarse (census-block, banded, k≥5, hourly-quantized); committee formation is never broadcast; and an intra-platform front-running rule bars any org from transacting on a parcel it learned of through another org's confidential footprint, enforced by an access-log-backed audit trail.

---

### G2-24 🟡 Locked LP capital and multi-month token exposure

**Finding.** The escrow is described as holding capital "until" the rezoning confirms. Rezoning petitions take 9–36 months and frequently fail. There is no sunset, no redemption right, and no interim reporting — LP capital is trapped indefinitely in a contract with a trigger that may never fire. Separately, a USD-denominated capital commitment held in $SHQL across that horizon is an unhedged currency position taken on the LPs' behalf.

`FIX →` §II.9.7 — mandatory `sunset_at` with automatic pro-rata return; LP redemption rights at defined windows; quarterly reporting obligations; and USD denomination with the Group 1 §II.7.6 band applied at settlement. Capital at this scale is held by a **qualified custodian or licensed escrow agent**, with $SHQL used for settlement mechanics only.

---

## 6. RBAC, Workspace & Monetization

### G2-09 🔴 Subscription tier widens data scope

**Finding.** Identical in shape to G1-04. Tier 1/2/3 are described as unlocking "environmental layers, CAD tools, the B2B marketplace," then "algorithmic block syndication and SEC-compliant data rooms." Since Group 2's surfaces are data surfaces, a tier upgrade is a scope upgrade, driven by a Stripe webhook. Every billing defect — replayed event, unverified signature, test-mode acceptance, trial provisioning before settlement, chargeback without deprovision — becomes an authorization defect.

Worse than G1-04 in one respect: tier is also a **self-asserted capability claim**. Paying for Tier 3 does not make an entity an assembler, yet it grants the assembler surface.

`FIX →` §II.1.3 — `entitlements` (billing, features) and `deal_memberships` (data scope) are separate tables with separate writers; the billing role holds no grant on membership tables; Invariant I-2 from Group 1 is inherited verbatim; and the assembler surface additionally requires E3 entity trust plus the §II.9.1 securities pathway, neither of which is purchasable.

---

### G2-15 🟠 Deal-scoped data reachable by role group

**Finding.** `investor_value_add` holds `acquisition`, `capital`, `design`, `escrow`; `investor_assembler` adds `legal`. Under the existing policy model, access to `agreements`, `documents`, `financial_ledgers`, and `vision_inspections` is decided by `current_user_role_group()`. That makes membership in the *group* the key to another developer's BoQ, soil reports, capital stack, and legal instruments — the precise contamination taxonomy line 189 prohibits when it states that the wholesaler must not see the architect's BoQ.

`FIX →` §II.1.1 Deal Membership Model. Investors own no parcels, so parcel capacity (the Group 1 primitive) does not apply. Their primitive is the **deal**: `deal_memberships(user_id, org_id, deal_id, deal_role, scope, status)`, enforced by `is_deal_member()` in every Group 2 policy. Invariant I-1 is inherited: no Group 2 policy may use `current_user_role_group()` for row access except for the literal `admin` branch.

---

### G2-16 🟠 No org seat model

**Finding.** A developer entity is not one person. It has an acquisitions analyst, a project manager, a bookkeeper, and a principal. With no seat concept the outcomes are a shared login — which destroys audit trails, step-up authentication, and per-actor limits — or every employee holding the principal's escrow authority.

`FIX →` §II.1.2 Org Seats — `org_members(org_id, user_id, org_role, spend_limit_cents)` with `org_role ∈ {principal, admin, analyst, finance, viewer}`. This axis is **orthogonal to the 25-role taxonomy and can only ever narrow, never widen**, the entity's `rbac_key`. Escrow authorization is a distinct grant with per-seat and per-transaction limits; the principal is the only role that can grant it.

---

### G2-17 🟠 A single flat portal breaks the workspace paradigm

**Draft text:** a single `▼ 🏗️ INVESTOR / DEVELOPER (Active Portal)` tab with six subtabs.

**Finding.** A `investor_value_add` runs eight to fifteen concurrent projects. Group 1 §II.3 defines a Workspace as the unit of navigation, map scope, Co-Pilot context, **and authorization** — deliberately the same unit. A single flat portal has no such unit: the map shows everything, the Co-Pilot reasons across every deal simultaneously, and there is no context boundary to enforce. It also means a Co-Pilot conversation about a deal the org has since exited remains a retrieval candidate forever.

`FIX →` §II.3 — Workspace = **deal**, plus one Market workspace for prospecting and one Portfolio root for aggregates. Epoch fencing, identifier-only context transmission, server-side re-authorization, and per-workspace transcript partitioning all inherited verbatim from Group 1 §II.3.4.

---

### G2-25 🟡 The platform is paid a percentage of the spread

**Finding.** A percentage fee on the assignment fee makes platform revenue an increasing function of the gap between what the homeowner receives and what the developer pays. The platform is then economically aligned with widening that gap — against the Group 1 user it has separately promised to protect. It is also the structure most likely to be characterized as compensation for arranging a real estate transaction in states requiring licensure for that.

`FIX →` §II.10.3 — **flat per-transaction fees** on assignment and syndication surfaces, invariant to spread and to capital raised. Percentage fees remain permitted only where Group 1 §II.8.3 already permits them (contractor/supplier marketplace, paid by the professional).

---

# PART II — HARDENED ARCHITECTURE

## II.0 Design Thesis

> **The draft sells information asymmetry. This blueprint sells execution certainty.**

Distress lists are a commodity, and the good ones are legally encumbered. What no competitor can offer is: a counterparty verified to a natural person, an assignment that cannot be double-sold or sold by a dissolving shell, title cleared before money moves, sealed-bid procurement with real bid integrity, draws that fund without a phone call, and a syndication built on rails that survive an SEC or state examination. Every removal in Part I is paid for by a capability in Part II.

---

## II.1 Authorization Model *(resolves G2-09, G2-15, G2-16)*

**Principle:** Group 1's primitive is the parcel because owners own parcels. Group 2's primitive is the **deal**, because investors own nothing — they hold positions in transactions.

```
users.role         → coarse nav routing only. Never used for Group 2 row access.
orgs               → the verified operating entity (E0…E3 trust level)
org_members        → seats within the entity. Can only NARROW the entity's rbac_key.
deal_memberships   → the authorization primitive: (user, org, deal, deal_role, scope)
entitlements       → billing-derived feature flags. Never widens a data scope.
```

### II.1.1 Deal Membership

A `deal` is the transaction container: one parcel or an assembly footprint, its documents, agreements, ledgers, bids, and events. Membership is explicit, time-bounded, and revocable.

| `deal_role` | Reaches | Cannot |
|---|---|---|
| `sponsor` | Everything in the deal; grants and revokes membership | Bypass §II.8.2 draw separation |
| `co_investor` | Financials, agreements, documents | Manage membership; authorize escrow |
| `assignee_candidate` | **Masked** listing only; unmasks on NDA + intent (§II.7.4) | See owner identity pre-NDA |
| `diligence_observer` | Read-only, watermarked, expiring | Export; persist after expiry |
| `counterparty` | Cross-group parties (GC, architect, lender, attorney) scoped to their function | Reach unrelated deal facets |

**Invariants (inherited from Group 1 and extended):**

- **I-1** No Group 2 RLS policy may reference `current_user_role_group()` for row access on `properties`, `documents`, `agreements`, `financial_ledgers`, `vision_inspections`, `deal_room_events`, or `bids`. They call `is_deal_member()`.
- **I-2** No billing code path holds any grant on `deal_memberships`, `org_members`, or `orgs`. Enforced by `REVOKE` plus the `assert_not_billing_actor()` trigger.
- **I-5** *(new)* An `org_member`'s effective permissions are the **intersection** of the org's `rbac_key` capabilities and the seat's `org_role`. A seat can never exceed its org.
- **I-6** *(new)* Membership grants are logged append-only and are visible to the deal `sponsor` and to any Group 1 owner whose parcel is in the deal (§II.9.4).

### II.1.2 Org Seats

`org_role ∈ {principal, admin, analyst, finance, viewer}`. Escrow authorization is a **separate boolean grant** with a `spend_limit_cents` ceiling per seat and per transaction, grantable only by a `principal`, requiring V3+ step-up to exercise, and automatically revoked when a seat is removed. Seat changes emit audit events and notify the principal out-of-band.

### II.1.3 Billing / authorization separation *(G2-09)*

Identical to Group 1 §II.8.1. Entitlements gate *features* — whether the CAD overlay renders, whether the syndication workflow is available — and are evaluated **only after** an independent membership check has already passed. The assembler surface additionally requires `orgs.trust_level = 'E3'` **and** an active §II.9.1 offering record; neither is purchasable.

---

## II.2 Onboarding — The Entity Trust Ladder *(resolves G2-01, G2-02, G2-20, G2-26)*

### II.2.1 Trust levels

| Level | Name | Proves | Evidence | Unlocks |
|---|---|---|---|---|
| **E0** | Prospect | Nothing | Email + phone | Aggregate market statistics only. No parcels, no identities, no export. |
| **E1** | Operator Identified | A real, unique natural person | V1 IDV (IAL2), liveness, device + phone binding | Saved searches, the consented feed in read-only, inbound offer requests |
| **E2** | Entity Controlled | This person controls this entity | KYB **plus** a control proof (below) **plus** beneficial-owner disclosure | Outbound connection requests, offers, assignment listings, BoQ posting |
| **E3** | Institutional | Verified scale, licensure, and clean screening | Licensure verification, Rule 506(d) bad-actor screen on all control persons, financial-capacity attestation, insurance | Syndication, assembly, data rooms, LP capital |

**E2 control proofs — one required, all logged to `entity_evidence`:**

1. Officer, manager, or registered-agent name match against the Secretary of State record, matched to the E1 identity.
2. Micro-deposit verification to a bank account held **in the entity's name** with a matching beneficial owner.
3. IRS SS-4 confirmation or 147C letter, name and EIN matched.
4. Verified control of the entity's registered domain plus a mailbox at that domain (accepted only in combination with #1).

KYB alone never reaches E2. This is the entire fix for G2-01.

### II.2.2 Ladder pacing *(G2-26)*

```
E0 → E1  prompted on: saving a search, or the 2nd session
E1 → E2  prompted on: the first outbound action — never before
E2 → E3  prompted on: the first syndication or assembly action
Claim state persists 30 days; resumption nudges at 24h, 72h, 7d, 21d, 29d
```

### II.2.3 Beneficial Owner Identity Graph *(G2-02 — the critical control)*

```
Every org is keyed to the V1 IDV identity hashes of ALL control persons
  (≥25% beneficial ownership, plus every officer with signing authority).

identity_hash → { orgs controlled }   is the authoritative subject for:
    · Group 1 solicitation suppressions (§G1 II.5.4)
    · connection and offer quotas
    · reputation and dispute history
    · sanctions and bans
    · trial eligibility

CONSEQUENCE: registering a new entity inherits every suppression, every quota
consumption, every reputation mark, and every ban held by its control persons.
Ban evasion by re-incorporation is structurally impossible.
```

**Undisclosed-affiliate detection.** Shared registered agent, shared business address, shared phone, shared bank account, shared payment instrument, shared device fingerprint, or shared payout wallet raise a linkage candidate. Affirmative disclosure of affiliated entities is a **condition of E2**; a subsequently detected undisclosed affiliate is a trust-level reversion to E1 across the whole cluster, not a warning.

**Quota arithmetic.** All Group 1 quotas (3 lifetime invitations per parcel, 1 per 30 days) are evaluated against the **identity cluster**, never the org. Ten entities do not buy thirty invitations.

### II.2.4 Ongoing monitoring

Re-screening of beneficial owners against sanctions and bad-actor lists runs quarterly and on any material change (new control person, address change, licence lapse). E3 requires annual re-attestation. A lapse degrades the org to E2 — reads and exports persist, outbound and syndication actions stop.

### II.2.5 Jurisdiction capability gating *(G2-20)*

```
capability_jurisdiction_matrix(state, sub_role, capability) →
    'enabled' | 'requires_licence' | 'disabled'

· 'requires_licence' renders the capability only with a verified, current licence
  or wholesaler registration, verified through Group 8 (`office`).
· 'disabled' hard-blocks at the API layer, not the UI, with a plain explanation
  and a link to the jurisdiction's requirement.
· Assignment listing templates enforce equitable-interest-only marketing language
  in every jurisdiction (§II.7.4), regardless of licensure.
```

---

## II.3 The Directory Pane — Deal Workspaces *(resolves G2-17)*

### II.3.1 Definition

> A Group 2 **Workspace** is `(org_id, deal_id)` — or `(org_id, 'market')` for prospecting. It is the unit of navigation, map scope, Co-Pilot context, and authorization. Same four, same unit, same reason as Group 1 §II.3.1.

### II.3.2 Tree shape

```
DIRECTORY  (Left Pane · 250px · React Server Component · zero client hooks)
│
├─ ◈ Portfolio                       ← aggregate; no deal context
│    └─ Pipeline · Capital Stack · Vendors · Team & Seats · Billing
│
├─ 🔭 Market                          ← the ONLY prospecting surface
│    ├─ Consented Feed               (§II.5.1)
│    ├─ Public Records               (unranked, unscored)
│    ├─ My Leads                     (subscriber's own data)
│    ├─ Inbound Requests             (owner-initiated)
│    └─ Market Intelligence          (aggregate, k≥5)
│
├─ 📋 1420 Cedar — Under Option       ← WORKSPACE  deal_role=sponsor
│    ├─ Deal Room · Underwriting · Title & Diligence · Assignment · Timeline
│
├─ 🏗️ Harrison Infill — In Construction ← WORKSPACE  deal_role=sponsor
│    ├─ Deal Room · Underwriting · Draws · Procurement · Vendors · Timeline
│
├─ 🏙️ Eastside Assembly — Syndicating  ← WORKSPACE  E3 + offering record required
│    ├─ Footprint (confidential) · Data Room · LP Register · Entitlement Track · Closing
│
└─ ⊕ New Deal
```

### II.3.3 Server-side derivation

Produced by `deal_workspace_manifest()` under the caller's RLS-scoped session in the RSC. The client performs no filtering, sorting, or conditional rendering beyond what the manifest returns. A subtab absent from the manifest is not rendered **and** its route independently rejects direct navigation. Padlocked upsell rows appear only when `upsell_allowed = true`.

### II.3.4 Context isolation

Inherited verbatim from Group 1 §II.3.4, with the deal as the subject: clear-then-switch with a monotonic `epoch`; identifiers only (`{ orgId, dealId, epoch }`) — never prose; server-side re-authorization via `is_deal_member()` returning 403 **without invoking the model**; epoch fencing on the response stream; per-workspace transcript partitioning.

**Group 2 specific:** when a `deal_membership` is revoked or expires, the corresponding Co-Pilot transcript is removed from the retrieval index within 24 hours, and the Market workspace's system prompt is forbidden from referencing any deal-scoped fact. A developer who exits a deal cannot ask the Co-Pilot what they used to know.

---

## II.4 Sub-Role Portals — Hardened Feature Matrices

### II.4.1 A · Wholesaler — `investor_wholesaler`

*Capital velocity through **verified, escrowed, title-cleared** contract assignment.*

| Subtab | Capabilities | Gates |
|---|---|---|
| **Market** | Consented feed, unranked public records, own leads, inbound requests, market intelligence | E1 read / **E2 for any outbound** |
| **Deal Room** | Per-deal documents, communications, timeline | deal membership |
| **Title & Diligence** | Preliminary title order to `legal_title`, encumbrance report, assignability determination | E2 |
| **Assignment** | Masked listing, NDA gate, escrowed fee, chain-of-custody | E2 + assignability cleared + licensure gate |
| **Timeline** | Option expiry, diligence lock, closing coordination | deal membership |

**Hardening deltas from draft**
- The Macro-Distress Map is **withdrawn** (§II.5). Prospecting is consent-based and public-record-based, with no parcel-level scoring anywhere.
- The Instant Contract Engine is replaced by the four-stage Contact & Offer Protocol (§II.6). An offer can never be a first touch.
- Assignment listings are masked pre-NDA and carry enforced equitable-interest-only language (§II.7.4).
- The assignment fee escrows; the wholesaler is paid on title clearance and seller acknowledgment, not on token transfer (§II.7.3).
- **New capability, and the tier's real value:** a wholesaler operating here can prove to an assignee that the option is assignable, that title is clear, that the seller has acknowledged, and that the fee is escrowed. That is worth more per deal than any list.

### II.4.2 B · Value-Add Developer — `investor_value_add`

*Repositioning execution: procurement integrity, draw automation, and lender coordination.*

| Subtab | Capabilities | Gates |
|---|---|---|
| **Underwriting** | Feasibility layers (SUSMP, Alquist-Priolo, SB-9 split test), CAD overlay, GRM and IRR models | E2 + `ent.feasibility` |
| **Procurement** | Sealed-bid BoQ distribution, simultaneous unseal, award, materials PO | E2 + deal membership |
| **Draws** | Draw request, schedule-of-values tracking, waiver exchange, retainage ledger | deal membership; **request only — never approve** (§II.8.2) |
| **Vendors** | Verified GC/sub/supplier directory with live Group 8 compliance state | E2 |
| **Deal Room / Timeline** | Documents, permits, inspections, critical path | deal membership |

**Hardening deltas from draft**
- The developer **cannot approve its own draw** (§II.8.2). It requests; the independent inspection oracle and the lender release.
- Materials pay against delivery, not against order, with velocity caps and lender co-consent on facility funds (§II.8.3).
- Bids are sealed until deadline; bid contents are never visible to competing bidders; platform fees are disclosed on every surface and never weight default ranking (§II.8.4).
- BoQ and design documents are scoped to deal membership, never to role group — a wholesaler in the `investor` group cannot reach an architect's BoQ (taxonomy line 189, G2-15).

### II.4.3 C · Master Assembler — `investor_assembler`

*Enterprise assembly on securities-compliant, settlement-real rails.*

| Subtab | Capabilities | Gates |
|---|---|---|
| **Footprint** | Confidential target footprint, cascading fallbacks, banded consensus over k≥5 cohorts | E3 |
| **Data Room** | Purpose-bound, per-recipient, expiring, watermarked, view-only for consumer instruments | E3 + §II.9.4 consent artifacts |
| **LP Register** | Reg D pathway, accreditation verification, subscription documents, transfer restrictions | E3 + active offering record |
| **Entitlement Track** | Zoning petition status, consultant attestations, appeal windows | E3 |
| **Closing** | Coordinated multi-parcel settlement through licensed escrow | E3 + §II.9.3 |

**Hardening deltas from draft**
- "Eliminates holdout risk" is replaced by Cascading Footprint Assembly (§II.9.5). Non-participants are excluded, never bound, never individually identified pre-consent.
- The single-source oracle is replaced by an N-of-M multi-source oracle with bonded human attestation and a 10-business-day halt window (§II.9.2).
- Capital never sweeps to seller wallets. It releases to **licensed settlement**; title transfers by recorded conveyance (§II.9.3).
- "SEC-compliant data rooms" is withdrawn as a claim and replaced with an actual Reg D workflow (§II.9.1).
- Footprints are confidential, and an intra-platform front-running prohibition protects the assembler from rivals reading the consensus map (§II.9.6).
- LP capital carries a mandatory sunset with automatic pro-rata return, redemption windows, and quarterly reporting (§II.9.7).

---

## II.5 Demand-Side Data Plane *(resolves G2-03, G2-22)*

### II.5.1 The four lawful sources

The Macro-Distress Map is withdrawn. Prospecting draws from exactly four sources, and no others may be added without a Provenance Registry entry.

| # | Source | Content | Constraint |
|---|---|---|---|
| 1 | **Consented Feed** | Group 1 parcels at `exposure_policy = 'seeking_exit'` | Inherits Group 1 §II.5.3 in full: 24h hysteresis, 30-day tombstoning, k≥5 floor, hourly cadence quantization |
| 2 | **Public Records** | Recorded liens, filed violations, permit history, recorded transfers | Rendered as **facts, never as a score**. No ranking, no heatmap, no sort-by-distress, no alerting, no "opportunity" labelling |
| 3 | **My Leads** | The subscriber's own uploaded or independently sourced lists | Upload requires a lawful-basis attestation; suppression and quota still apply on contact |
| 4 | **Inbound Requests** | Owner-initiated offer requests from Group 1 | Highest-intent source; owner sets the terms of engagement |

### II.5.2 Market Intelligence — the replacement product

Genuinely valuable, lawful, and defensible; the commercial substitute for the withdrawn heatmap:

- Absorption rates, days-on-market, and price-per-foot distributions by submarket
- Permit issuance velocity and inspection-failure rates by jurisdiction
- Entitlement approval rates and median timelines by municipality and project type
- Construction cost indices derived from anonymized platform BoQ and bid data
- Aggregate capital availability and observed rate bands by lender class

**Constraints:** census-block or coarser aggregation, k≥5 minimum cell population, differential-privacy noise on small cells, no parcel-level values, and no time series fine enough to permit differencing attacks against a single parcel.

### II.5.3 Anti-reconstruction

A choropleth over parcels is a per-parcel score with a colour ramp. Repeated bounded sampling reconstructs it. Therefore:

- No layer renders at a resolution finer than its aggregation unit — enforced **server-side at the tile service**, not by client zoom limits.
- Query-volume anomaly detection per identity cluster; systematic grid sampling is a scraping signature and pages security (§IV.4).
- Export quotas per seat, per-seat watermarking, and logged exports. Quota exhaustion is a security event, not an upsell trigger.

### II.5.4 Provenance Registry *(G2-22)*

```sql
data_layers(
  layer_key, source_name, source_url, licence, lawful_basis,
  permitted_use, prohibited_use, refresh_cadence, last_verified_at,
  reviewed_by, review_expires_at
)
```

**A layer with no current registry entry does not render** — enforced at the tile service. `lawful_basis` is a controlled vocabulary (`public_record`, `licensed_commercial`, `first_party_consent`, `subscriber_owned`); **`inferred_nonpublic` is not a member of the vocabulary**, which is what structurally forecloses "distress before it hits public ledgers." Review expiry forces re-verification; an expired entry stops rendering rather than degrading silently.

---

## II.6 Contact & Offer Protocol *(resolves G2-04)*

### II.6.1 The four-stage ladder

```
STAGE 1 — CONNECTION REQUEST
  guards: E2 · can_solicit(property) · identity-cluster quota (§II.2.3)
          · target exposure_policy ≠ 'private' · no_contact clear
  payload: identity, track record, area of interest. NO price. NO document.
  → an offer document at this stage is REJECTED at the API layer, not warned about

STAGE 2 — OWNER ACCEPTANCE
  the owner accepts, declines, or ignores. Decline ⇒ PERMANENT suppression
  across the entire identity cluster. Ignore ⇒ no retry inside the quota window.

STAGE 3 — INTRODUCTION
  messaging opens. The owner may request an indicative range. Still no instrument.

STAGE 4 — OFFER
  guards: accepted connection · owner-granted offer_invitation · E2
          · jurisdiction capability check (§II.2.5)
  the owner receives, BEFORE any signature surface renders:
    · a plain-language explanation of equitable interest and what assignment means
    · the assignability posture and whether the buyer intends to assign
    · a statement of the buyer's role (principal vs. wholesaler intending assignment)
    · an offer of independent counsel at the platform's expense
  signature binds only after a 3-business-day rescission window (Group 1 §II.6.3 parity)
```

### II.6.2 Structural rules

- **An offer can never be the first artifact a recipient sees.** Enforced server-side; there is no code path from a map click to a transmitted instrument.
- **Every guard is evaluated on the target parcel**, never on the requester's role — a neighbouring `owner_investor` and an `investor_wholesaler` are treated identically (Group 1 §II.5.4 symmetry).
- **Quotas apply to the identity cluster** (§II.2.3), never to the org.
- **Template control.** Offer instruments are generated from reviewed templates with jurisdiction-specific mandatory disclosures. Free-text substitution is confined to allowlisted fields; the platform will not transmit an arbitrary user-authored instrument to a consumer.
- **Wholesaler intent disclosure.** If the buyer intends to assign rather than close, that must be disclosed in the offer. Concealing it is the core consumer complaint in this business and the most common basis for state enforcement.

---

## II.7 Assignment Protocol *(resolves G2-05, G2-06, G2-10, G2-11, G2-19)*

### II.7.1 The token is a pointer, not the interest *(G2-05)*

```
option_tokens.legal_effect = 'chain_of_custody_pointer'   -- immutable, rendered in every surface

MINT PRECONDITIONS (all machine-checked):
  · the executed option document is on file, hash-anchored
  · assignability_status ∈ {'assignable','assignable_with_consent'} — parsed from the
    instrument and confirmed by a Group 4 `legal_title` review for any non-template option
  · if 'assignable_with_consent': a recorded seller consent artifact exists
  · the option is in force (not expired, not terminated)
  · the seller's signature is verified against the §II.6 signing session

'non_assignable' options CANNOT be minted and CANNOT be listed. There is no override.
```

The legal assignment is an e-signed assignment instrument. The token movement is a **consequence** of that instrument, sequenced through the two-phase intent protocol (§II.8.1). Every surface displaying a token displays: *"This token records custody of a contract right. It is not the contract right, and transferring it does not by itself assign anything."*

### II.7.2 Transfer control *(G2-10)*

- Tokens are **non-transferable except through a platform-attested transfer hook**. A direct wallet-to-wallet transfer reverts. This preserves KYC, licensure gating, and the assignability clause.
- A Group 4 `legal_title` clearance gate must pass before assignment funds move.
- Where state law permits, the platform records a **memorandum of option**, converting the platform record into constructive notice and materially raising the cost of an off-platform double assignment.
- The assignment instrument carries a seller acknowledgment that no other assignment is outstanding, and the wholesaler warrants the same under a liquidated-damages clause backed by the §II.7.3 escrow.

### II.7.3 Assignment Escrow *(G2-06)*

```
The assignment fee NEVER moves atomically with the token.

ESCROW RELEASE CONDITIONS (deal-type dependent, all snapshotted at authorization):
  A. `legal_title` clearance: no superior liens or encumbrances defeating the interest
  B. Seller acknowledgment of the assignment (or recorded consent where required)
  C. For assignment-at-closing structures: recorded closing confirmed by settlement
  D. No open dispute on the deal

TIME-BOX: expires_at, default 30 days. On expiry with conditions unmet, the fee
refunds to the assignee IN FULL, automatically, with no platform fee retained.

EARNEST MONEY is held by a LICENSED ESCROW AGENT. Never in the wholesaler's wallet.
Never in a platform-controlled contract.
```

This is the single control that makes the clean-exit fraud (G2-06) uneconomic: the shell dissolves before the escrow releases, and the assignee is made whole automatically.

### II.7.4 Masked listings *(G2-11)*

| Stage | Assignee candidate sees |
|---|---|
| Board | Submarket, product type, price band, timeline, assignability status, escrow posture, wholesaler reputation |
| Post-NDA | Approximate location, condition summary, redacted title report |
| Post-intent + Diligence Lock | Full address, owner identity, complete instrument, full title report |

Enforced at the API layer with per-stage field allowlists — masking is never a client-side render decision. The listing template enforces **equitable-interest-only** marketing language in every jurisdiction, and the board is visible only to E2+ `investor_value_add` and `investor_assembler` members — never publicly, and never to Group 9 brokers.

### II.7.5 Diligence Lock *(G2-19)*

```
The assignee purchases a Diligence Lock (refundable deposit, default 10 business days).
During the lock:
  · the assignment fee and every material term are FIXED and BINDING on the wholesaler
  · the listing is withdrawn from the board
  · the assignee receives full unmasked access
If the wholesaler alters any term inside the lock:
  · the lock voids, the deposit refunds IN FULL
  · a documented diligence-cost credit is assessed against the wholesaler
  · the event is recorded on the wholesaler's identity-cluster reputation
Re-listing at a higher fee after a voided lock is rate-limited and reputation-scored.
```

---

## II.8 Construction, Procurement & Supply Chain *(resolves G2-13, G2-14, G2-23)*

### II.8.1 Two-Phase Intent Protocol

Inherited verbatim from Group 1 §II.7.2 and applied to every Group 2 money movement — assignment fees, materials, draws, syndication calls. Restated as binding here:

1. The database is the ledger of record; the chain is the settlement rail.
2. Nothing irreversible happens before a durable, committed `escrow_intents` row exists.
3. The HTTP response is never authoritative; confirmation arrives only from the chain indexer.
4. Obligations are denominated in `usd_amount_cents`; the ±2% settlement band applies.
5. Client-supplied `idempotency_key` is unique; a replay returns the original intent.
6. Chain calls are permitted only in `worker/` and `indexer/`, never in a route handler (CI-enforced).

### II.8.2 Construction draws — separation of duties *(G2-14)*

**3-key release. The developer may request but can never unilaterally approve.**

```
Developer (borrower)  → REQUESTS the draw. Signature required, never sufficient.
Inspection Oracle     → independent inspector + Vision evidence + Group 8 compliance
Lender                → releases against the facility

Release requires:  Oracle + Lender.   Developer + Lender alone is INSUFFICIENT
                                       when the draw funds debt-facility money.
Platform recovery key: 72h timelock, refunds to SOURCE only, never forwards to a vendor.
```

**Gates — all must hold, snapshotted at authorize and re-evaluated at broadcast (Group 1 §II.7.3 parity):**

| # | Gate |
|---|---|
| 1 | `vision_inspections.blocks_draw = false` for this milestone |
| 2 | Inspection authored by a verified contractor capacity on this deal |
| 3 | Contractor `compliance_checks` row **must exist** and be current — **absence is a BLOCK** |
| 4 | Unconditional lien waiver on file for the prior draw |
| 5 | Conditional lien waiver for this draw from the GC and every sub on the milestone |
| 6 | Cumulative release ≤ 90% until final acceptance and lien-period expiry (10% retainage) |
| 7 | Schedule-of-values variance within tolerance — front-loading raises a hold, not a warning |
| 8 | Stored materials only under §II.8.3 (delivered and site-confirmed) |
| 9 | Settlement rate inside the ±2% band |

**Bilateral dispute clock.** Either party may escalate to a Group 4 `legal_arbitrator`. A draw held beyond the contractual review period without a documented, specific deficiency auto-escalates. Neither the developer nor the lender can hold the contractor's payroll hostage indefinitely, and the contractor cannot force payment for work not performed.

### II.8.3 Materials escrow *(G2-13)*

```
PO issued  → deposit release permitted, capped at min(30% of PO, jurisdictional norm)
Shipment   → partial release against carrier documentation
Site receipt → confirmed by contractor_gc with geotagged Vision evidence → balance release

CONTROLS:
  · per-transaction cap and rolling-24h velocity cap per deal and per seat
  · V3+ step-up above threshold
  · supplier payout accounts bound to the E2-verified entity; wallet changes are
    a 72h-delayed, out-of-band-confirmed event (defeats payout-address swap fraud)
  · LENDER CO-CONSENT required for any disbursement drawing on facility funds
  · a receipt dispute freezes the balance release, never the whole ledger
```

### II.8.4 Sealed-bid procurement *(G2-23)*

- Bids are **sealed until a published deadline** and unsealed simultaneously.
- Bid contents are never exposed to competing bidders, before or after award — the platform will not carry a bid-shopping mechanic.
- Post-award, participants see an anonymized ranking and their own position only.
- Platform fees are disclosed on every marketplace surface, and **default ranking is never fee-weighted**. Any sponsored placement is labelled as such.
- BoQ and design documents are scoped by `is_deal_member()`, satisfying the taxonomy's requirement that a wholesaler never reach an architect's BoQ.
- Bid-leak detection: award patterns that track a losing bid's number within a narrow band across repeated auctions raise an integrity review against the identity cluster.

---

## II.9 Assembly & Syndication *(resolves G2-07, G2-08, G2-12, G2-18, G2-21, G2-24)*

### II.9.1 Securities rails *(G2-08)*

```
An `investor_assembler` cannot accept a single dollar of third-party capital without
an active `offerings` record. The record carries:

  · exemption pathway: 506(b) | 506(c) | intrastate | other-with-counsel-signoff
  · 506(b): general solicitation UI is HARD-DISABLED. The offering is not listed,
            not searchable, and not visible outside an established pre-existing
            relationship recorded in the platform.
  · 506(c): accredited-investor VERIFICATION required for every LP — self-
            certification is rejected. Verification artifacts retained.
  · Rule 506(d) bad-actor screening against EVERY beneficial owner from §II.2.3,
    re-run quarterly. A hit disables the offering surface immediately.
  · subscription document workflow with countersignature and delivery receipts
  · Form D filing reminders with a hard 15-day post-first-sale alert
  · transfer restrictions enforced on any tokenized LP interest
  · platform compensation is FLAT and invariant to capital raised (§II.10.3)
```

"SEC-compliant data rooms" is withdrawn as a marketing claim wherever it appears.

### II.9.2 Multi-Source Attested Oracle *(G2-07)*

```
A rezoning or consolidation confirmation requires ALL of:

  1. N-of-M agreement across ≥3 INDEPENDENT sources (municipal API, county recorder,
     licensed data vendor), fetched over independently-configured paths with
     certificate pinning, on schedules ≥24h apart
  2. NOTARIZED HUMAN ATTESTATION from a licensed `arch_zoning` AND a `legal_title`
     officer, each staking bonded reputation
  3. APPEAL-PERIOD CLEARANCE — a provisional or appealable approval NEVER satisfies
     the gate; the statutory appeal window must have run
  4. A 10-BUSINESS-DAY HALT WINDOW between confirmation and execution, during which
     any LP or the GP may halt for cause. Halt is one click and requires no proof;
     it converts execution into manual review.
  5. VALUE CAP: above threshold, a second independent attestation set is required.

A single source can NEVER trigger execution. Parser or schema drift on any source
raises `needs_review` and pauses the pipeline — it never silently degrades to a
smaller quorum.
```

### II.9.3 Coordinated Closing *(G2-07 defects 2 and 3)*

```
The contract NEVER sweeps capital to seller wallets, and NEVER purports to transfer a deed.

  · Capital releases TO LICENSED SETTLEMENT (title company / escrow agent / attorney
    trust, per jurisdiction)
  · Settlement handles: existing lien and mortgage payoffs, prorations, transfer taxes,
    title insurance, and recording
  · TITLE TRANSFERS BY RECORDED CONVEYANCE. The county record is dispositive.
  · The token records a settlement RECEIPT after recording confirms — never before,
    and never as the operative transfer
  · Multi-parcel closings execute as an all-or-none settlement batch: any parcel that
    fails to close collapses the batch to the next cascading footprint (§II.9.5),
    or unwinds cleanly with full refunds
```

### II.9.4 Purpose-bound data rooms *(G2-12)*

- Per-recipient grants with a hard expiry; no standing access.
- Consumer-signed instruments (Group 1 owners' intents) render **view-only, download-disabled**, with per-recipient visible and forensic watermarking.
- Every access writes an event surfaced to the owner in Group 1's Exposure & Privacy subtab. The owner can see which LP viewed their signed intent and when.
- Inclusion requires a **consent artifact naming the recipient class** that the owner acknowledged at signing. An owner who consented to a committee has not consented to an LP syndicate; that requires a fresh acknowledgment.
- Grant revocation is immediate and retroactive to the viewer session.

### II.9.5 Cascading Footprint Assembly *(G2-21)*

```
The assembler declares a PRIMARY footprint and pre-priced FALLBACK footprints, each
independently underwritten. At the participation deadline the syndication executes
over the largest footprint achieving consented participation.

  · Non-participants are EXCLUDED from the footprint. Never bound. Never drag-along.
  · Non-participants are NEVER individually identified to the assembler pre-consent.
  · Consensus surfaces as a BAND (60-79% | 80-99% | complete) over a k≥5 cohort.
    "One holdout remaining" is not a renderable state — it is a targeting instruction.
  · A parcel that declines is permanently suppressed for the identity cluster and does
    not appear in any fallback footprint the same cluster declares.
```

This preserves the assembler's genuine economics — pre-priced fallbacks are how competent assemblers already underwrite holdout risk — without any coercive mechanism.

### II.9.6 Footprint confidentiality & front-running *(G2-18)*

- Declared target footprints are **private to the declaring org**. They are not a data product and appear in no feed at any tier.
- The public consensus layer is coarse: census-block, banded, k≥5, hourly-quantized.
- Committee formation events are never broadcast outside Group 1's own committee membership.
- **Intra-platform front-running prohibition:** no org may transact on a parcel it learned of through another org's confidential footprint or data room. Enforced by an append-only access log joined against subsequent transactions; a hit is a trust-level reversion and a dispute referral, not a warning.

### II.9.7 LP capital protection *(G2-24)*

- **Mandatory `sunset_at`** on every syndication contract. At sunset without execution, capital returns **pro-rata, automatically, in full**, with no platform fee retained.
- Defined LP redemption windows with disclosed terms.
- Quarterly reporting obligations enforced by the platform: missing a report disables new capital calls.
- USD denomination end to end; the Group 1 §II.7.6 band applies at settlement.
- Capital at this scale is held by a **qualified custodian or licensed escrow agent**. $SHQL provides settlement mechanics and audit trail, not custody.

---

## II.10 Monetization *(resolves G2-09, G2-25)*

### II.10.1 What was removed, and what replaces it

| Withdrawn | Why | Commercial replacement |
|---|---|---|
| Tier 1 "off-market distress data" | G2-03 — prohibited surface, FCRA-encumbered | Consented feed + Market Intelligence + assignment execution rails |
| Distress heatmap | G2-03 | Aggregate absorption, permit velocity, entitlement approval analytics |
| "SEC-compliant data rooms" as a claim | G2-08 | An actual Reg D workflow, which is worth more and is defensible |
| % of assignment spread | G2-25 | Flat per-transaction fee |

### II.10.2 Tier structure

| Tier | Entitlement key | Requires | Unlocks (features only — never data scope) |
|---|---|---|---|
| **Prospect** | — | E0 | Aggregate market statistics |
| **Scout** | `ent.scout` | E1 | Consented feed, own leads, saved searches, inbound requests |
| **Operator** | `ent.operator` | **E2** | Outbound contact, offers, assignment listings, title ordering, diligence locks |
| **Builder** | `ent.builder` | **E2** | Feasibility layers, CAD overlay, sealed-bid procurement, draws, materials |
| **Institutional** | `ent.institutional` | **E3 + active offering record** | Syndication, assembly, data rooms, LP register, coordinated closing |

**Every tier above Prospect requires a trust level that cannot be purchased.** A subscription without the corresponding E-level renders the tier's features inert and says so plainly, rather than granting the surface. This is the structural answer to G2-09.

### II.10.3 Fee structure

| Surface | Permitted | Forbidden | Rationale |
|---|---|---|---|
| Assignment | **Flat** per-transaction fee | Any % of the assignment fee or spread | G2-25 — never align platform revenue against the Group 1 seller |
| Syndication | **Flat** platform fee | Any fee scaling with capital raised | Unregistered broker-dealer risk (G2-08) |
| Contractor / supplier marketplace | % fee paid by the professional, disclosed | Deduction from consumer-escrowed principal without itemized pre-disclosure | Group 1 §II.8.3 parity |
| Lender / legal routing | Flat access subscription paid by the professional | Any transaction-contingent or per-referral fee | Group 1 §II.8.3 — RESPA §8, MRPC 5.4 |
| Data | Seat subscription | Any per-parcel or per-lead pricing on Group 1 sourced data | Per-lead pricing on consented data recreates the lead-broker incentive |

### II.10.4 Obligation Lock and downgrade

Inherited from Group 1 §II.8.5. Any org that is a party to an active agreement, a non-terminal ledger, an open escrow, a live syndication, or an active deal membership is pinned to a free `ent.custodial` state on payment failure. Custodial grants full read, export, signature, dispute, and escrow-reversion capability on existing matters, and withholds only net-new origination. **A dunning failure can never separate a developer from an escrow they funded or a contract they are bound by**, and can never strand an LP.

### II.10.5 Trial and scraping controls

Trials are keyed to the **identity cluster**, not the org (§II.2.3) — one trial per cluster, ever. Export quotas are per seat with watermarking; quota exhaustion pages security. Systematic grid sampling of any map layer is a scraping signature (§II.5.3) and suspends the cluster pending review.

---

# PART III — IMPLEMENTATION SPECIFICATION

## III.1 Schema Additions

Target migration files, sequenced after the Group 1 set (`0013`–`0016`):

- `0017_group2_orgs_trust.sql`
- `0018_group2_deals_memberships.sql`
- `0019_group2_assignment_protocol.sql`
- `0020_group2_syndication.sql`
- `0021_group2_rls.sql`

### III.1.1 `0017_group2_orgs_trust.sql`

```sql
create type entity_trust_level as enum ('E0','E1','E2','E3');
create type org_role           as enum ('principal','admin','analyst','finance','viewer');

create table orgs (
  id                 uuid primary key default gen_random_uuid(),
  legal_name         text not null,
  ein                text,
  formation_state    text,
  registered_agent   text,
  trust_level        entity_trust_level not null default 'E0',
  trust_verified_at  timestamptz,
  trust_expires_at   timestamptz,                 -- E3 annual re-attestation (§II.2.4)
  created_at         timestamptz not null default now(),
  unique (ein, formation_state)
);

-- ── The Beneficial Owner Identity Graph (§II.2.3) — the G2-02 control ──────
create table org_control_persons (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid references users(id),
  identity_hash  text not null,          -- V1 IDV hash. THE authoritative subject.
  ownership_bps  int,                    -- basis points; >= 2500 must be disclosed
  is_signer      boolean not null default false,
  disclosed_at   timestamptz not null default now(),
  unique (org_id, identity_hash)
);
create index ocp_identity on org_control_persons (identity_hash);

-- Suppressions, quotas, reputation and bans resolve through this view.
create view identity_cluster as
  select ocp.identity_hash, ocp.org_id, o.trust_level
    from org_control_persons ocp join orgs o on o.id = ocp.org_id;

-- Undisclosed-affiliate detection (§II.2.3)
create table org_linkage_signals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  linked_org_id uuid not null references orgs(id) on delete cascade,
  signal_kind   text not null,   -- 'registered_agent'|'address'|'phone'|'bank'
                                 -- |'payment_instrument'|'device'|'payout_wallet'
  disclosed     boolean not null default false,
  detected_at   timestamptz not null default now()
);

create type entity_evidence_kind as enum (
  'kyb','officer_match','entity_bank_micro_deposit','irs_147c',
  'domain_control','licence','bad_actor_screen','sanctions_screen','insurance'
);
create table entity_evidence (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  kind         entity_evidence_kind not null,
  provider     text not null,
  result       jsonb not null,
  level_granted entity_trust_level not null,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create rule entity_evidence_no_update as on update to entity_evidence do instead nothing;
create rule entity_evidence_no_delete as on delete to entity_evidence do instead nothing;

-- ── Org seats (§II.1.2) ────────────────────────────────────────────────────
create table org_members (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  role              org_role not null default 'viewer',
  can_authorize_escrow boolean not null default false,
  spend_limit_cents bigint,
  created_at        timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ── Jurisdiction capability gating (§II.2.5) ───────────────────────────────
create table capability_jurisdiction_matrix (
  state       text not null,
  sub_role    text not null,
  capability  text not null,        -- 'offer'|'assignment_listing'|'syndication'
  status      text not null check (status in ('enabled','requires_licence','disabled')),
  citation    text,
  primary key (state, sub_role, capability)
);

-- ── I-2 inherited from Group 1: billing may never touch authorization ──────
create trigger orgs_no_billing before insert or update or delete on orgs
  for each row execute function assert_not_billing_actor();
create trigger org_members_no_billing before insert or update or delete on org_members
  for each row execute function assert_not_billing_actor();
revoke all on orgs, org_members, org_control_persons, entity_evidence from billing_writer;
```

### III.1.2 `0018_group2_deals_memberships.sql`

```sql
create type deal_stage as enum
  ('prospect','under_option','diligence','under_contract','construction','syndicating','closed','dead');
create type deal_member_role as enum
  ('sponsor','co_investor','assignee_candidate','diligence_observer','counterparty');

create table deals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  label          text not null,
  stage          deal_stage not null default 'prospect',
  primary_property_id uuid references properties(id),
  footprint_id   uuid,                         -- assembly footprint (0020)
  confidential   boolean not null default true, -- §II.9.6
  created_at     timestamptz not null default now()
);

-- ── The Group 2 authorization primitive (§II.1.1) ──────────────────────────
create table deal_memberships (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals(id) on delete cascade,
  org_id      uuid not null references orgs(id),
  user_id     uuid not null references users(id) on delete cascade,
  deal_role   deal_member_role not null,
  scope       text[] not null default '{}',    -- facet allowlist, e.g. {'documents','financials'}
  granted_by  uuid references users(id),
  expires_at  timestamptz,
  status      text not null default 'active' check (status in ('active','expired','revoked')),
  created_at  timestamptz not null default now(),
  unique (deal_id, user_id, deal_role)
);
create index dm_lookup on deal_memberships (user_id, deal_id, status);

-- I-6: membership grants are append-only auditable
create table deal_membership_events (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references deal_memberships(id) on delete cascade,
  event         text not null,      -- 'granted'|'revoked'|'expired'|'scope_changed'
  actor_id      uuid references users(id),
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create rule dme_no_update as on update to deal_membership_events do instead nothing;

create trigger deals_no_billing before insert or update or delete on deals
  for each row execute function assert_not_billing_actor();
create trigger dm_no_billing before insert or update or delete on deal_memberships
  for each row execute function assert_not_billing_actor();
revoke all on deals, deal_memberships from billing_writer;

-- ── Provenance Registry (§II.5.4) ──────────────────────────────────────────
create table data_layers (
  layer_key         text primary key,
  source_name       text not null,
  source_url        text,
  licence           text not null,
  lawful_basis      text not null
    check (lawful_basis in ('public_record','licensed_commercial',
                            'first_party_consent','subscriber_owned')),
  -- NOTE: 'inferred_nonpublic' is deliberately absent from this vocabulary.
  permitted_use     text not null,
  prohibited_use    text not null,
  refresh_cadence   text not null,
  last_verified_at  timestamptz not null,
  reviewed_by       uuid references users(id),
  review_expires_at timestamptz not null
);
```

### III.1.3 `0019_group2_assignment_protocol.sql`

```sql
create type assignability_status as enum
  ('unknown','assignable','assignable_with_consent','non_assignable');
create type listing_stage as enum ('board','post_nda','post_intent');

create table purchase_options (
  id                   uuid primary key default gen_random_uuid(),
  deal_id              uuid not null references deals(id) on delete cascade,
  property_id          uuid not null references properties(id),
  seller_user_id       uuid references users(id),
  document_id          uuid references documents(id),
  document_hash        text not null,
  assignability_status assignability_status not null default 'unknown',
  seller_consent_doc   uuid references documents(id),   -- required if _with_consent
  option_price_cents   bigint not null,
  expires_at           timestamptz not null,
  terminated_at        timestamptz,
  created_at           timestamptz not null default now()
);

create table option_tokens (
  id            uuid primary key default gen_random_uuid(),
  option_id     uuid not null references purchase_options(id) on delete cascade,
  legal_effect  text not null default 'chain_of_custody_pointer'
                  check (legal_effect = 'chain_of_custody_pointer'),   -- §II.7.1
  token_ref     text,
  transferable  boolean not null default false,                        -- §II.7.2
  minted_at     timestamptz
);

-- G2-05: a non-assignable option can never be minted or listed. No override.
create or replace function guard_option_mint() returns trigger
language plpgsql as $$
declare o purchase_options;
begin
  select * into o from purchase_options where id = new.option_id;
  if o.assignability_status not in ('assignable','assignable_with_consent') then
    raise exception 'G2-05: option % is not assignable', o.id using errcode='42501';
  end if;
  if o.assignability_status = 'assignable_with_consent' and o.seller_consent_doc is null then
    raise exception 'G2-05: seller consent artifact required' using errcode='42501';
  end if;
  if o.expires_at <= now() or o.terminated_at is not null then
    raise exception 'G2-05: option not in force' using errcode='42501';
  end if;
  return new;
end $$;
create trigger option_tokens_mint_guard before insert on option_tokens
  for each row execute function guard_option_mint();

create table assignment_listings (
  id            uuid primary key default gen_random_uuid(),
  option_id     uuid not null references purchase_options(id) on delete cascade,
  fee_cents     bigint not null,                    -- FIXED at listing (§II.7.5)
  submarket     text not null,
  product_type  text not null,
  price_band    text not null,
  listed_at     timestamptz not null default now(),
  withdrawn_at  timestamptz
);

create table diligence_locks (                       -- §II.7.5
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references assignment_listings(id) on delete cascade,
  assignee_org  uuid not null references orgs(id),
  deposit_cents bigint not null,
  fee_locked_cents bigint not null,
  nda_document_id  uuid references documents(id),
  expires_at    timestamptz not null,
  voided_at     timestamptz,
  void_reason   text,
  created_at    timestamptz not null default now()
);

-- G2-19: any term change inside an active lock voids it and refunds in full.
create or replace function guard_listing_terms() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from diligence_locks l
              where l.listing_id = new.id and l.voided_at is null and l.expires_at > now())
     and new.fee_cents is distinct from old.fee_cents then
    update diligence_locks set voided_at = now(), void_reason = 'terms_altered_in_lock'
      where listing_id = new.id and voided_at is null;
    -- refund + diligence-cost credit + reputation mark are emitted by the worker
  end if;
  return new;
end $$;
create trigger listing_terms_guard before update on assignment_listings
  for each row execute function guard_listing_terms();

create table assignment_escrows (                     -- §II.7.3
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references assignment_listings(id),
  assignee_org      uuid not null references orgs(id),
  usd_amount_cents  bigint not null,
  title_cleared_at  timestamptz,                      -- condition A
  seller_ack_at     timestamptz,                      -- condition B
  closing_recorded_at timestamptz,                    -- condition C
  dispute_open      boolean not null default false,   -- condition D
  expires_at        timestamptz not null,             -- default now()+30d
  released_at       timestamptz,
  refunded_at       timestamptz
);
```

### III.1.4 `0020_group2_syndication.sql`

```sql
create type exemption_pathway as enum ('506b','506c','intrastate','other');
create type oracle_state      as enum ('pending','partial','confirmed','halted','needs_review');

create table offerings (                              -- §II.9.1
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id),
  deal_id              uuid not null references deals(id),
  pathway              exemption_pathway not null,
  general_solicitation boolean not null default false,
  form_d_due_at        timestamptz,
  form_d_filed_at      timestamptz,
  bad_actor_screen_at  timestamptz not null,
  bad_actor_clear      boolean not null,
  sunset_at            timestamptz not null,          -- §II.9.7 MANDATORY
  created_at           timestamptz not null default now(),
  -- 506(b) forbids general solicitation. Structural, not advisory.
  check (not (pathway = '506b' and general_solicitation))
);

create table lp_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  offering_id         uuid not null references offerings(id) on delete cascade,
  lp_user_id          uuid not null references users(id),
  committed_usd_cents bigint not null,
  accreditation_verified_at timestamptz,              -- REQUIRED for 506c
  subscription_doc_id uuid references documents(id),
  countersigned_at    timestamptz,
  redeemed_at         timestamptz
);
-- 506(c): self-certification is rejected; verification artifact required.
create or replace function guard_accreditation() returns trigger
language plpgsql as $$
declare p exemption_pathway;
begin
  select pathway into p from offerings where id = new.offering_id;
  if p = '506c' and new.accreditation_verified_at is null then
    raise exception 'G2-08: 506(c) requires verified accreditation' using errcode='42501';
  end if;
  return new;
end $$;
create trigger lp_accreditation_guard before insert or update on lp_subscriptions
  for each row execute function guard_accreditation();

create table assembly_footprints (                    -- §II.9.5 / §II.9.6
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null references deals(id) on delete cascade,
  rank           int not null,                        -- 0 = primary, 1..n = fallbacks
  parcel_ids     uuid[] not null,
  underwritten_value_cents bigint,
  confidential   boolean not null default true,       -- never a data product
  unique (deal_id, rank)
);

create table oracle_attestations (                    -- §II.9.2
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null references deals(id) on delete cascade,
  source_kind    text not null,   -- 'municipal_api'|'county_recorder'|'data_vendor'
                                  -- |'arch_zoning_human'|'legal_title_human'
  source_name    text not null,
  fetched_at     timestamptz not null,
  payload_hash   text not null,
  asserts_event  text not null,   -- 'rezoning_approved'|'consolidation_recorded'
  appeal_window_clear boolean not null default false,
  attestor_id    uuid references users(id),           -- human attestations only
  bond_ref       text
);

create table oracle_confirmations (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references deals(id) on delete cascade,
  state         oracle_state not null default 'pending',
  machine_sources_agreeing int not null default 0,
  human_attestations       int not null default 0,
  confirmed_at  timestamptz,
  halt_expires_at timestamptz,                        -- confirmed_at + 10 business days
  halted_by     uuid references users(id),
  halt_reason   text
);

-- §II.9.2: execution requires >=3 machine sources, 2 human attestations,
-- appeal clearance, and an expired halt window. Enforced before any intent insert.
create or replace function syndication_execution_permitted(p_deal uuid)
returns boolean
language sql stable as $$
  select exists (
    select 1 from oracle_confirmations c
     where c.deal_id = p_deal
       and c.state = 'confirmed'
       and c.machine_sources_agreeing >= 3
       and c.human_attestations >= 2
       and c.halt_expires_at <= now()
       and c.halted_by is null
       and exists (select 1 from oracle_attestations a
                    where a.deal_id = p_deal and a.appeal_window_clear)
  );
$$;
```

## III.2 RLS Helper Functions

```sql
-- ── The Group 2 authorization predicate (Invariant I-1) ────────────────────
create or replace function public.is_deal_member(
  p_deal uuid,
  p_facet text default null,
  p_min_role deal_member_role default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from deal_memberships m
     where m.deal_id = p_deal
       and m.user_id = auth.uid()
       and m.status  = 'active'
       and (m.expires_at is null or m.expires_at > now())
       and (p_facet is null or p_facet = any(m.scope))
       and (p_min_role is null or m.deal_role = p_min_role)
  );
$$;

-- ── Org seat permission — can only NARROW, never widen (Invariant I-5) ─────
create or replace function public.has_org_permission(p_org uuid, p_roles org_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m
                  where m.org_id = p_org and m.user_id = auth.uid()
                    and m.role = any(p_roles));
$$;

create or replace function public.can_authorize_escrow(p_org uuid, p_amount_cents bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m
                  where m.org_id = p_org and m.user_id = auth.uid()
                    and m.can_authorize_escrow
                    and (m.spend_limit_cents is null or p_amount_cents <= m.spend_limit_cents));
$$;

-- ── Entity trust level (§II.2.1) ───────────────────────────────────────────
create or replace function public.org_trust_at_least(p_org uuid, p_level entity_trust_level)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orgs o
                  where o.id = p_org and o.trust_level >= p_level
                    and (o.trust_expires_at is null or o.trust_expires_at > now()));
$$;

-- ── Identity cluster resolution — the G2-02 control (§II.2.3) ──────────────
-- Suppressions, quotas, reputation, bans and trials resolve to THIS set,
-- never to a single org. Re-incorporation inherits everything.
create or replace function public.current_identity_cluster()
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct ocp2.identity_hash), '{}')
    from org_control_persons ocp1
    join org_control_persons ocp2 on ocp2.org_id = ocp1.org_id
   where ocp1.user_id = auth.uid();
$$;

-- Group 1's can_solicit() is extended to evaluate against the cluster.
create or replace function public.can_solicit_cluster(p_property uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select can_solicit(p_property)
     and not exists (
       select 1 from solicitation_suppressions s
        where s.property_id = p_property
          and s.suppressed_identity_hash = any(current_identity_cluster()));
$$;
```

> **Migration note.** `solicitation_suppressions` (Group 1 §III.1.2) gains a
> `suppressed_identity_hash text` column, and every Group 1 suppression write path
> populates it. Without this column the G2-02 fix does not hold. This is a
> **blocking dependency** recorded in Appendix C.

## III.3 Group 2 RLS Policies — `0021_group2_rls.sql`

```sql
-- deals -------------------------------------------------------------------
alter table deals enable row level security;
create policy "deals_member_select" on deals for select
  using (is_deal_member(deals.id) or current_user_role_group() = 'admin');

create policy "deals_org_insert" on deals for insert
  with check (has_org_permission(org_id, array['principal','admin']::org_role[])
              and org_trust_at_least(org_id, 'E2'));

-- deal_memberships --------------------------------------------------------
alter table deal_memberships enable row level security;
create policy "dm_self_or_sponsor_select" on deal_memberships for select
  using (user_id = auth.uid()
         or is_deal_member(deal_id, null, 'sponsor')
         or current_user_role_group() = 'admin');
create policy "dm_sponsor_insert" on deal_memberships for insert
  with check (is_deal_member(deal_id, null, 'sponsor'));

-- documents: deal membership, NOT role group (Invariant I-1, fixes G2-15) --
drop policy if exists "documents_capacity_access" on documents;
create policy "documents_scoped_access_v2" on documents for select
  using (
    documents.uploaded_by = auth.uid()
    or has_property_capacity(documents.property_id, null, 'V2')        -- Group 1 owners
    or exists (select 1 from deals d
                where d.primary_property_id = documents.property_id
                  and is_deal_member(d.id, 'documents'))               -- Group 2 members
    or current_user_role_group() = 'admin'
  );

-- financial_ledgers -------------------------------------------------------
drop policy if exists "ledgers_party_access" on financial_ledgers;
create policy "ledgers_party_access_v2" on financial_ledgers for select
  using (
    has_property_capacity(financial_ledgers.property_id, null, 'V2')
    or exists (select 1 from deals d
                where d.primary_property_id = financial_ledgers.property_id
                  and is_deal_member(d.id, 'financials'))
    or current_user_role_group() in ('lender','admin')
  );

-- properties: investors reach the VIEW, never the base table (VULN-03) ----
-- properties_investor_discovery is DROPPED. Group 2 consumes
-- properties_discoverable (Group 1 §III.1.2) exclusively.
drop policy if exists "properties_investor_discovery" on properties;

-- violations: connection or membership required. Role group NEVER suffices.
-- (Group 1 §III.3 already enforces this; restated as a Group 2 invariant.)

-- assignment listings: staged field exposure (§II.7.4) --------------------
alter table assignment_listings enable row level security;
create policy "listings_board_select" on assignment_listings for select
  using (
    org_trust_at_least((select org_id from deals d
                         join purchase_options po on po.deal_id = d.id
                        where po.id = assignment_listings.option_id), 'E2')
    and exists (select 1 from org_members m
                 where m.user_id = auth.uid()
                   and org_trust_at_least(m.org_id, 'E2'))
  );
-- Unmasked fields (address, seller identity, full instrument) live on
-- purchase_options and are gated by an ACTIVE diligence_lock:
alter table purchase_options enable row level security;
create policy "options_unmask_on_lock" on purchase_options for select
  using (
    is_deal_member(purchase_options.deal_id)
    or exists (select 1 from diligence_locks l
                join assignment_listings al on al.id = l.listing_id
               where al.option_id = purchase_options.id
                 and l.voided_at is null and l.expires_at > now()
                 and has_org_permission(l.assignee_org,
                       array['principal','admin','analyst']::org_role[]))
    or current_user_role_group() = 'admin'
  );

-- offerings / LP register -------------------------------------------------
alter table offerings enable row level security;
create policy "offerings_member_select" on offerings for select
  using (is_deal_member(offerings.deal_id) or current_user_role_group() = 'admin');
alter table lp_subscriptions enable row level security;
create policy "lp_self_or_sponsor" on lp_subscriptions for select
  using (lp_user_id = auth.uid()
         or is_deal_member((select deal_id from offerings o where o.id = offering_id),
                           null, 'sponsor'));

-- assembly footprints: confidential to the declaring org (§II.9.6) --------
alter table assembly_footprints enable row level security;
create policy "footprints_org_only" on assembly_footprints for select
  using (is_deal_member(assembly_footprints.deal_id, 'footprint'));
-- There is no public read path. The coarse consensus layer is a separate,
-- k-anonymized materialized view and never joins to this table.

-- escrow_intents: org seat authority + trust level ------------------------
create policy "intents_org_authorize" on escrow_intents for insert
  with check (
    authorized_by = auth.uid()
    and can_authorize_escrow(
          (select org_id from deals d where d.id = (gates_snapshot->>'deal_id')::uuid),
          usd_amount_cents)
    and (gates_snapshot->>'step_up_at')::timestamptz > now() - interval '5 minutes'
  );
```

## III.4 `deal_workspace_manifest()`

```sql
create or replace function public.deal_workspace_manifest()
returns jsonb
language sql stable security definer set search_path = public as $$
with mem as (
  select d.id as deal_id, d.label, d.stage, d.org_id, m.deal_role, m.scope,
         o.trust_level,
         exists (select 1 from offerings f where f.deal_id = d.id) as has_offering
    from deal_memberships m
    join deals d on d.id = m.deal_id
    join orgs  o on o.id = d.org_id
   where m.user_id = auth.uid() and m.status = 'active'
     and (m.expires_at is null or m.expires_at > now())
)
select jsonb_build_object(
  'upsell_allowed', true,
  'market_workspace', jsonb_build_object(
     'subtabs', jsonb_build_array(
        'consented_feed','public_records','my_leads','inbound_requests','market_intel')),
  'workspaces', coalesce(jsonb_agg(jsonb_build_object(
      'deal_id',  mem.deal_id,
      'label',    mem.label,
      'stage',    mem.stage,
      'role',     mem.deal_role,
      'subtabs', case
        when mem.stage in ('prospect','under_option','diligence')
          then jsonb_build_array('deal_room','underwriting','title','assignment','timeline')
        when mem.stage = 'construction'
          then jsonb_build_array('deal_room','underwriting','draws','procurement','vendors','timeline')
        when mem.stage = 'syndicating' and mem.trust_level = 'E3' and mem.has_offering
          then jsonb_build_array('footprint','data_room','lp_register','entitlement','closing')
        else jsonb_build_array('deal_room','timeline') end
  ) order by mem.stage), '[]'::jsonb)
) from mem;
$$;
```

Note the syndication subtabs are unreachable without `trust_level = 'E3'` **and** an
offering record. No entitlement key appears in that branch — the assembler surface is
not purchasable (§II.10.2).

## III.5 API Contracts

### `POST /api/orgs/verify`
```
Request  { legal_name, ein, formation_state, evidence_kind, payload, control_persons[] }
Guards   authenticated; rate-limited per identity cluster
Effect   runs KYB; requires a §II.2.1 control proof for E2; records org_control_persons
         with identity_hash; runs linkage detection; runs sanctions + 506(d) screens for E3
Response 200 { trust_level, missing_evidence[], linked_org_candidates[] }
Errors   409 UNDISCLOSED_AFFILIATE · 422 CONTROL_PROOF_REQUIRED · 403 BAD_ACTOR_HIT
```

### `POST /api/connections` *(Group 2 outbound — replaces the Instant Contract Engine)*
```
Request  { property_id, message }          ← NO price, NO document, NO instrument
Guards   org_trust_at_least(org,'E2')
         · can_solicit_cluster(property_id)                 ← identity cluster, not org
         · quota: 3 lifetime / 1 per 30 days PER CLUSTER per parcel
         · jurisdiction capability check
         · payload must not contain a document reference    ← rejected, not stripped
Errors   403 SOLICITATION_SUPPRESSED · 429 CLUSTER_QUOTA · 400 INSTRUMENT_NOT_PERMITTED
         · 403 TRUST_LEVEL_REQUIRED · 451 JURISDICTION_DISABLED
```

### `POST /api/offers`
```
Request  { property_id, offer_invitation_id, template_key, fields{} }
Guards   accepted connection · owner-granted offer_invitation · E2 · jurisdiction gate
         · template_key must be a reviewed template; fields restricted to an allowlist
Effect   renders mandatory disclosures (equitable interest, assignment intent,
         independent counsel offer) and records acknowledgement in `disclosures`
         BEFORE the signature surface is reachable; binds after a 3-business-day
         rescission window
Errors   403 NO_ACCEPTED_CONNECTION · 403 NO_OFFER_INVITATION · 422 TEMPLATE_REQUIRED
```

### `POST /api/options/:id/token`
```
Guards   guard_option_mint() — assignability cleared, consent artifact where required,
         option in force, seller signature verified
Effect   mints a NON-TRANSFERABLE chain-of-custody pointer
Errors   403 OPTION_NOT_ASSIGNABLE · 403 SELLER_CONSENT_REQUIRED · 409 OPTION_EXPIRED
```

### `POST /api/assignments/escrow`
```
Request  { listing_id, idempotency_key }
Guards   active diligence_lock held by the caller's org · E2 · seat escrow authority
Effect   escrows the fee via the two-phase intent protocol. Release requires
         title clearance + seller acknowledgment (+ recorded closing where applicable)
         and no open dispute. Auto-refund IN FULL at expires_at.
Response 202 { escrow_id, conditions_outstanding[] }
```

### `POST /api/draws/request` · `POST /api/draws/approve`
```
/request  callable by deal sponsor (the borrower). Creates the request ONLY.
/approve  guards: caller is the inspection oracle OR the lender.
          THE BORROWER'S ORG CANNOT CALL /approve. Enforced by org identity
          comparison, not by role string. All 9 §II.8.2 gates evaluated.
Errors    403 SELF_APPROVAL_FORBIDDEN · 409 GATE_BLOCKED { gate, detail }
```

### `POST /api/materials/orders`
```
Guards   deal membership · seat escrow authority within spend_limit_cents
         · per-transaction and rolling-24h velocity caps
         · V3+ step-up above threshold
         · lender co-consent when drawing on facility funds
         · supplier payout account bound to the E2 entity; wallet changes are
           72h-delayed and out-of-band confirmed
Effect   deposit ≤ min(30% of PO, jurisdictional norm); balance releases on
         site receipt confirmed by contractor_gc with geotagged Vision evidence
```

### `POST /api/syndication/execute`
```
Guards   syndication_execution_permitted(deal_id)  ← ≥3 machine sources, 2 human
         attestations, appeal window clear, 10-business-day halt window expired,
         no halt flag · E3 · active offering · no open LP dispute
Effect   releases TO LICENSED SETTLEMENT. Never to seller wallets.
         Token records a settlement receipt only AFTER recording confirms.
Errors   409 ORACLE_QUORUM_INSUFFICIENT · 409 HALT_WINDOW_ACTIVE · 409 SYNDICATION_HALTED
         · 409 APPEAL_WINDOW_OPEN
```

### `GET|POST /api/copilot` *(Group 2 context)*
```
Request  { orgId, dealId, epoch, messages }      ← identifiers, never prose
Guards   is_deal_member(dealId) → else 403, model NOT invoked
Effect   server re-derives grounding facts under RLS; selects the stage-scoped system
         prompt server-side; echoes epoch for client-side fencing.
         The Market workspace prompt is forbidden from referencing deal-scoped facts.
```

## III.6 TypeScript Registry Deltas

```ts
// src/lib/rbac/roles.ts — Group 2 app segments confirmed unchanged from Phase 8.
// The security boundary moves OFF these strings and onto deal membership.
investor_wholesaler: ['acquisition', 'escrow'],
investor_value_add:  ['acquisition', 'capital', 'design', 'escrow'],
investor_assembler:  ['acquisition', 'capital', 'legal', 'design', 'escrow'],

// src/lib/rbac/deal.ts — NEW. The Group 2 authorization surface.
export type DealMemberRole =
  | 'sponsor' | 'co_investor' | 'assignee_candidate' | 'diligence_observer' | 'counterparty';
export type EntityTrustLevel = 'E0' | 'E1' | 'E2' | 'E3';

/** Mirrors is_deal_member(). Route handlers call this BEFORE any side effect. */
export async function assertDealMember(
  supabase: SupabaseClient, dealId: string,
  facet?: string, minRole?: DealMemberRole,
): Promise<void>;

/** Mirrors org_trust_at_least(). Never satisfied by an entitlement. */
export async function assertTrustLevel(
  supabase: SupabaseClient, orgId: string, level: EntityTrustLevel,
): Promise<void>;

/** Mirrors current_identity_cluster(). Quotas and suppressions resolve here. */
export async function identityCluster(supabase: SupabaseClient): Promise<string[]>;

/** Draw separation of duties (G2-14). Throws if the caller's org is the borrower. */
export async function assertNotBorrower(
  supabase: SupabaseClient, dealId: string,
): Promise<void>;
```

---

# PART IV — VERIFICATION

## IV.1 Cross-Group Isolation Matrix

Actor is a member of **Deal A**. Columns are what they may reach on **Deal B** and on Group 1 parcels with no relationship.

| Actor | Deal B docs | Deal B BoQ/bids | Deal B ledgers | Deal B footprint | G1 parcel (private) | G1 parcel (seeking_exit) | G1 distress state |
|---|---|---|---|---|---|---|---|
| `investor_wholesaler` E2 | ❌ | ❌ | ❌ | ❌ | ❌ | masked feed row | ❌ **never** |
| `investor_value_add` E2 | ❌ | ❌ | ❌ | ❌ | ❌ | masked feed row | ❌ **never** |
| `investor_assembler` E3 | ❌ | ❌ | ❌ | ❌ | ❌ | banded aggregate, k≥5 | ❌ **never** |
| Same-org analyst seat | per membership | per membership | ❌ (no finance seat) | per membership | ❌ | as org | ❌ |
| `admin` | break-glass, audited | break-glass | break-glass | break-glass | break-glass | ✅ | audited |

The final column is the boundary contract's load-bearing row: **no Group 2 actor, at any tier, at any trust level, ever reaches Group 1 distress state.**

## IV.2 Acceptance Criteria

**Entity trust**
- [ ] KYB alone never reaches E2. A submission with a valid EIN and no control proof returns `422 CONTROL_PROOF_REQUIRED`.
- [ ] Submitting a third party's public EIN without a control proof cannot produce an active outbound-capable account. *(Direct G2-01 regression test.)*
- [ ] A new org registered by a control person carrying suppressions inherits **all** of them at creation — asserted by suppression count, not by UI state. *(G2-02.)*
- [ ] Ten orgs sharing one control person consume **one** shared invitation quota per parcel, not ten.
- [ ] One trial per identity cluster, ever. A second org under the same control person receives no trial.
- [ ] A detected undisclosed affiliate reverts the entire cluster to E1.
- [ ] A `requires_licence` capability in a state without verified licensure returns `451 JURISDICTION_DISABLED` at the **API**, verified by direct call, not by UI absence.

**Data plane**
- [ ] No endpoint, tile, export, or feed returns a parcel-level distress score, ranking, or heatmap value. *(Exhaustive endpoint sweep.)*
- [ ] Systematic grid sampling of any layer cannot reconstruct a per-parcel value — asserted by an automated 10,000-sample reconstruction attempt against a known ground truth.
- [ ] A `data_layers` row with `review_expires_at < now()` stops the layer rendering at the tile service.
- [ ] `lawful_basis` rejects any value outside the four-member vocabulary; `inferred_nonpublic` is unrepresentable.
- [ ] Consented-feed rows inherit Group 1 hysteresis, tombstoning, k≥5, and hourly quantization — asserted by 72 consecutive snapshots yielding zero inferable deltas.

**Contact**
- [ ] There is no code path from a map click to a transmitted instrument. *(Static analysis plus an attempted direct POST carrying a document reference, which must return `400 INSTRUMENT_NOT_PERMITTED` — rejected, not silently stripped.)*
- [ ] An offer without an accepted connection and an owner-granted invitation returns 403.
- [ ] Mandatory disclosures are recorded in `disclosures` before any signature surface is reachable; skipping the acknowledgement blocks the signature route.
- [ ] A declined connection permanently suppresses the whole identity cluster, surviving new orgs, new subscriptions, and re-registration.

**Assignment**
- [ ] A `non_assignable` option cannot be minted or listed — no override, no admin bypass. *(G2-05.)*
- [ ] An `assignable_with_consent` option without a consent artifact cannot be minted.
- [ ] A direct wallet-to-wallet token transfer reverts. *(G2-10.)*
- [ ] The assignment fee cannot release before title clearance and seller acknowledgment; at `expires_at` it refunds in full with no platform fee retained. *(G2-06.)*
- [ ] Altering `fee_cents` inside an active diligence lock voids the lock, refunds the deposit in full, and writes a reputation mark. *(G2-19.)*
- [ ] Pre-NDA listing responses contain no address, no owner identity, and no full instrument — asserted on the **API response body**, not the rendered page. *(G2-11.)*

**Construction & procurement**
- [ ] The borrower's org calling `/api/draws/approve` returns `403 SELF_APPROVAL_FORBIDDEN`. *(G2-14.)*
- [ ] All nine §II.8.2 gates block independently; gate 3 asserts that a **missing** `compliance_checks` row blocks rather than passes.
- [ ] Cumulative release cannot exceed 90% before final acceptance and lien-period expiry.
- [ ] Materials payment cannot exceed the deposit cap before shipment documentation, nor complete before site receipt with geotagged evidence. *(G2-13.)*
- [ ] A supplier payout wallet change is delayed 72h and requires out-of-band confirmation.
- [ ] Bid contents are unreachable by competing bidders before **and after** award — asserted on the API response. *(G2-23.)*
- [ ] A wholesaler in the `investor` group cannot reach an architect's BoQ on a deal they are not a member of. *(Taxonomy line 189, G2-15.)*

**Syndication**
- [ ] `/api/syndication/execute` with 2 machine sources returns `409 ORACLE_QUORUM_INSUFFICIENT`.
- [ ] Execution during the halt window returns `409 HALT_WINDOW_ACTIVE`; a single LP halt blocks execution.
- [ ] A provisional approval with an open appeal window never satisfies the gate.
- [ ] Parser drift on any source raises `needs_review` and pauses; it never degrades to a smaller quorum. *(Fault-injection test.)*
- [ ] Capital releases only to a licensed settlement account. No code path releases to a seller wallet. *(Static analysis plus runtime assertion.)*
- [ ] A 506(b) offering cannot set `general_solicitation = true` — DB check constraint, not application logic.
- [ ] A 506(c) LP subscription without `accreditation_verified_at` is rejected at insert.
- [ ] A Rule 506(d) hit against any control person disables the offering surface immediately.
- [ ] At `sunset_at` without execution, LP capital returns pro-rata in full with no fee retained.
- [ ] An assembly footprint is unreachable by any org other than the declaring one, at any tier. *(G2-18.)*

**Authorization & billing**
- [ ] `grep -rn "current_user_role_group" supabase/migrations/` returns zero hits on Group 2 row predicates other than the literal `admin` branch. *(Invariant I-1, CI-enforced.)*
- [ ] No Stripe event of any type mutates `orgs`, `org_members`, `deal_memberships`, or `deals`. *(Full webhook catalogue fuzz; Invariant I-2.)*
- [ ] An `ent.institutional` subscription without `trust_level = 'E3'` renders the syndication surface inert and states why — it does not grant access. *(G2-09.)*
- [ ] An analyst seat without `can_authorize_escrow` cannot authorize any intent; a seat above `spend_limit_cents` is rejected at the policy layer.
- [ ] A revoked deal membership removes the Co-Pilot transcript from the retrieval index within 24h, verified by an adversarial recall prompt.
- [ ] A payment failure on an org with an open escrow retains full read, export, signature, and reversion capability under `ent.custodial`.

## IV.3 CI Guardrails

Group 1's guardrails are inherited. Group 2 adds:

```
policy-lint      — extended: Group 2 tables must use is_deal_member(), not role group (I-1)
grant-lint       — extended: billing role holds no grant on orgs, org_members,
                   deal_memberships, deals (I-2)
provenance-lint  — fails the build if any tile or map layer key lacks a current
                   data_layers row with a non-expired review (§II.5.4)
score-lint       — fails if any endpoint, view, or serializer emits a parcel-level
                   distress, opportunity, or motivation score under any field name
                   (regex + response-schema scan) (G2-03)
sod-lint         — fails if any code path permits a deal's sponsor org to satisfy a
                   draw approval predicate (G2-14)
settlement-lint  — fails if any syndication execution path can resolve a payee that
                   is not a registered licensed settlement account (G2-07)
fee-lint         — extended: fails on any percentage constant reachable from an
                   assignment or syndication fee path (G2-25, G2-08)
cluster-lint     — fails if any quota, suppression, ban, or trial check resolves on
                   org_id rather than current_identity_cluster() (G2-02)
```

## IV.4 Telemetry

**Funnel:** `e0_market_viewed → e1_started → e1_completed → e2_control_proof_started → e2_completed → first_outbound → first_deal → first_close`.
Alert on: stage-over-stage drop > 15% WoW; E2 control-proof completion < 60%; median E2 time > 3 days.

**Marketplace health:** assignment escrow refund rate (rising = wholesaler quality problem); diligence-lock void rate per cluster; bid participation rate per BoQ (falling = suspected bid shopping); draw dispute rate and median resolution time; syndication halt rate.

**Security counters (paged, not dashboarded):** undisclosed-affiliate detections; grid-sampling scraping signatures; export quota exhaustion; supplier payout-wallet change attempts; self-approval attempts on draws; oracle source disagreement; front-running audit hits (§II.9.6); any attempt to write a Group 2 authorization table from the billing role.

**Deliberately not collected:** any per-parcel distress, motivation, or opportunity metric in any exportable, joinable, or vendor-shared surface — including internal analytics tables, which are in scope for `score-lint`.

---

# PART V — RESIDUAL RISK & LEGAL REVIEW QUEUE

## V.1 Accepted residual risks

| Risk | Why accepted | Compensating control |
|---|---|---|
| Off-platform contact after a consented-feed view | The platform cannot govern conduct outside it | Cluster-keyed suppression, export watermarking, scraping detection, feed cadence quantization |
| Paper double assignment executed off-platform | State recording law, not platform mechanics | Memorandum of option where permitted, title clearance gate before funds move, seller warranty backed by escrow |
| A control person who is genuinely never disclosed | Beneficial-ownership opacity is a legal-regime problem | Linkage-signal detection, disclosure as an E2 condition, cluster-wide reversion on later detection |
| Municipal source data that is simply wrong | Not correctable by the platform | 3-source quorum, bonded human attestation, appeal-window clearance, 10-day halt window, value caps |
| $SHQL settlement finality vs. commercial expectations | Chain settlement is final | USD denomination, licensed settlement and custody, escrowed conditions, dispute path before irreversible steps |

## V.2 Blocking legal review items

Each is a build-blocker for its surface, not a launch note.

1. **Securities.** Reg D pathway design, platform's own broker-dealer status given transaction-based compensation, and whether tokenized LP interests are separately regulated. **Blocks:** all syndication surfaces.
2. **FCRA.** Confirm that no retained, purchased, or derived data element in the demand-side plane is a consumer report or a derivative of one. **Blocks:** Market and Market Intelligence.
3. **State wholesaling licensure.** Per-state determination populating `capability_jurisdiction_matrix`. **Blocks:** offer and assignment surfaces per state.
4. **Unlicensed brokerage.** Confirm masked listings plus equitable-interest-only language keeps the platform out of brokerage in each launch state. **Blocks:** the assignment board.
5. **Money transmission / custody.** Whether assignment escrow and materials escrow require MTL or an MSB registration, and whether "licensed settlement" satisfies it. **Blocks:** all escrow surfaces (shared with Group 1 item 1).
6. **Consumer protection on offers.** Review the §II.6 disclosure set, rescission period, and wholesaler-intent disclosure against each launch state's UDAP regime. **Blocks:** the offer surface.
7. **Prompt-payment statutes.** Confirm the §II.8.2 dispute clock and retainage schedule comply per state. **Blocks:** the draw surface.
8. **Antitrust.** Sealed-bid procurement plus aggregated construction cost indices touch information-exchange doctrine; confirm aggregation and lag prevent price signalling.
9. **Data licensing.** Every `data_layers` row's licence must permit the declared `permitted_use`, including resale within Market Intelligence.

## V.3 Cross-group items surfaced here, owned elsewhere

- **Group 4** must scope `legal_title` clearance as a first-class gate object (§II.7.2, §II.7.3) and provide the arbitration path for §II.8.2's dispute clock.
- **Group 5** must expose contractor capacity bindings for §II.8.2 gate 2 and site-receipt confirmation for §II.8.3.
- **Group 6** must scope BoQ documents to deal membership (§II.8.4) and provide `arch_zoning` human attestation with bonding for §II.9.2.
- **Group 3** must accept lender co-consent on materials disbursement (§II.8.3) and act as the release key in §II.8.2.
- **Group 9** must not receive the assignment board (§II.7.4), and the withdrawn "Distress Interception" tier must stay withdrawn.

---

# APPENDIX A — THE GROUP 1 ↔ GROUP 2 BOUNDARY CONTRACT

**This appendix is binding on both blueprints. Where the two conflict, this table governs.**

| # | Contested surface | Group 1 v2.0 position | Group 2 draft position | **Resolution** |
|---|---|---|---|---|
| A1 | Derived distress state | Never exposed, exported, sorted on, or sold outside Group 1 + admin (§II.5.3 #5) | Tier 1 product: "off-market distress data", Macro-Distress Map | **Group 1 governs.** Heatmap withdrawn. Replaced by the consented feed + unranked public records + Market Intelligence (§II.5). |
| A2 | First contact | Consent-first; connection → acceptance → contact (§II.5.4) | One-click signed purchase option from a map pin | **Group 1 governs.** Four-stage ladder; an instrument can never be a first touch (§II.6). |
| A3 | Contact quotas & suppression | 3 lifetime / 1 per 30 days per parcel; decline is permanent | Entity-keyed accounts | **Extended.** Quotas and suppressions resolve to the **identity cluster**, not the org (§II.2.3). Requires the `suppressed_identity_hash` column (Appendix C item 1). |
| A4 | Holdout risk | Holdout-Priced Assembly; no drag-along (§II.6.1) | "Completely eliminating catastrophic holdout risk" | **Group 1 governs.** Cascading Footprint Assembly; non-participants excluded, never bound (§II.9.5). |
| A5 | Consensus display | Aggregate-only pre-consent, min cohort 5 (§II.6.2) | "Blocks achieving 100% owner consensus" | **Group 1 governs, extended.** Banded over k≥5. "One holdout remaining" is not a renderable state (§II.9.5) — and footprint confidentiality protects Group 2 in return (§II.9.6). |
| A6 | Owner-signed instruments in data rooms | Mutual-opt-in visibility; owner sees an access log (§II.4.3) | Data room contains underlying owners' intent-to-sell agreements | **Purpose-bound.** Per-recipient expiring grants, view-only, watermarked, access log surfaced to the owner, fresh consent naming the recipient class (§II.9.4). |
| A7 | Property discovery | `properties_discoverable` view only; no coordinates; k≥5 (§II.5.3) | Implicit base-table access via `properties_investor_discovery` | **Group 1 governs.** That policy is dropped; Group 2 consumes the view exclusively (§III.3). |
| A8 | Violations access | Capacity or accepted connection; role group never suffices (§III.3) | Implicit group-wide access | **Group 1 governs.** Restated as a Group 2 invariant. |
| A9 | Distressed-tier monetization | Shield is $0 forever; distress is not a product (§II.8.2, §II.8.4) | Tier 1 sells distress data | **Group 1 governs.** No Group 2 tier prices Group 1 distress state (§II.10.3). |
| A10 | Escrow atomicity | Two-phase intent; DB before chain (§II.7.2) | "Instantly paying", atomic fee-for-token | **Group 1 governs.** Applied to every Group 2 money movement (§II.8.1). |
| A11 | Fee structure on consumer-facing routing | Flat, transaction-independent for legal and settlement services (§II.8.3) | Percentage affiliate sweeps | **Group 1 governs, extended.** Flat fees on assignment and syndication too, since a % of spread aligns the platform against the Group 1 seller (§II.10.3). |
| A12 | Draw gate set | Vision + compliance-must-exist + waivers + retainage (§II.7.3) | Developer + lender inspector | **Group 1 governs, extended.** Full gate set inherited plus separation of duties: the borrower can request but never approve (§II.8.2). |

**Net effect on Group 2's economics.** Three revenue surfaces are withdrawn (distress data, spread-percentage fees, "SEC-compliant" positioning) and five are added: escrowed and title-cleared assignment execution, diligence locks, sealed-bid procurement, Market Intelligence, and Reg D syndication rails. The replacement basket is defensible, examinable, and — unlike a distress list — not resellable by a competitor with a scraper.

---

# APPENDIX B — Traceability to `rbac-audit-red-team.md`

| Prior finding | Status for Group 2 | Resolved at |
|---|---|---|
| VULN-02 investors read all violations globally | Resolved — role group never suffices; connection or deal membership required | §III.3, Boundary A8 |
| VULN-03 investors read full property rows | Resolved — `properties_investor_discovery` dropped; view-only consumption | §III.3, Boundary A7 |
| VULN-04 no `compliance_checks` INSERT policy | Resolved at consumption — absence is a **block** in §II.8.2 gate 3 | §II.8.2 |
| VULN-06 ledger-linked deal-room events invisible | Resolved — membership branch added to the ledger policy | §III.3 |
| VULN-08 `connections_update` self-accept + role-string break | Resolved — `getRoleGroup()` comparison plus `can_solicit_cluster()` and cluster quotas | §III.5 |
| VULN-09 milestone-upload has no role check | Resolved — contractor capacity on the deal required for §II.8.2 gate 2 | §II.8.2 |
| DESIGN-01 `parties[].role` free text | Resolved — party rows carry `(user_id, org_id, deal_id, deal_role)` | §III.1.2 |
| DESIGN-03 layout `ALLOWED_ROLES` sets | Resolved — layout gates are coarse routing; the boundary is `is_deal_member()` | §II.1 |

---

# APPENDIX C — Required Deltas to `phase8-sub-role-expansion-plan.md` and to Group 1

1. **BLOCKING — Group 1 §III.1.2.** `solicitation_suppressions` must gain `suppressed_identity_hash text`, and every Group 1 suppression write path must populate it. Without this column the G2-02 identity-cluster fix does not hold and Group 1's "permanent decline" guarantee is defeated by a $50 LLC filing. **This is a Group 1 change that Group 2's security depends on.**
2. **T8.2 — RLS.** `properties_investor_discovery` is **dropped**, not widened to `current_user_role_group() = 'investor'` as the plan specifies. Group 2 consumes `properties_discoverable` exclusively. The plan's instruction to widen it must be struck.
3. **T8.2 — RLS.** `violations_owner_access` must not be widened to a group check for `investor`. Group 2 access requires an accepted connection or deal membership (Boundary A8).
4. **T8.4 — API guards.** `POST /api/connections` needs the full §III.5 guard set (cluster quota, `can_solicit_cluster`, instrument rejection, jurisdiction gate), not merely the `getRoleGroup()` string fix the plan describes.
5. **New tasks T8.12–T8.16.** Migrations `0017`–`0021` (§III.1), sequenced after the Group 1 set `0013`–`0016`.
6. **T8.6 — fixtures.** The `investor` persona needs an `orgs` row at `E2`, an `org_members` seat, `org_control_persons` with an identity hash, and `deal_memberships` rows. Tests that assume role-string authorization on deal-scoped tables will fail correctly and must be rewritten against membership.
7. **Taxonomy count.** Restated from Group 1 Appendix B: the plan enumerates 22 sub-roles; the canonical taxonomy is **25**. The three Group 9 broker keys must be added under a `broker` group string — Group 2 §II.7.4 depends on `broker_*` being addressable in order to exclude brokers from the assignment board.

---

**END OF MASTER BLUEPRINT — GROUP 2**
