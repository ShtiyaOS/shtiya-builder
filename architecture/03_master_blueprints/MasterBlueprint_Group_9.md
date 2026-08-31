# MASTER BLUEPRINT — GROUP 9: THE CONNECTORS (BROKERAGE)

**Document class:** Production Architecture Specification
**Supersedes:** `architecture/02_draft_blueprints/09_group_the-connectors_brokerage.md`
**Version:** 2.0 (Red-Teamed / Hardened)
**Date:** 2026-08-19
**Taxonomy scope:** 3 sub-roles — `broker_commercial`, `broker_residential`, `broker_leasing`
**RLS group string:** `broker` — **newly defined here, and immediately removed from the security boundary**
**Counterparty blueprints:** `MasterBlueprint_Group_1.md` · `_Group_2.md` · `_Group_3.md` · `_Group_4.md` · `_Group_5.md` · `_Group_6.md` · `_Group_7.md` v2.0 — **all binding**; Appendix A is the boundary contract
**Stack:** Next.js 14 App Router · Supabase Postgres + RLS · Zustand Context Registry · Vercel AI SDK · Mapbox GL · $SHQL settlement rail

---

## 0. How To Read This Document

| Part | Contents |
|---|---|
| **Part I** | Red Team Audit — 32 findings, ranked, with exploit paths |
| **Part II** | Hardened Architecture — the corrected design |
| **Part III** | Implementation Spec — schema, RLS, API contracts, TS types |
| **Part IV** | Verification — RBAC matrix, acceptance criteria, CI guardrails, telemetry |
| **Part V** | Residual Risk & Board / Regulatory Review Queue |
| **Appendix A** | Boundary contract with Groups 1–7 |
| **Appendix B** | **The Independence Pattern** — one problem, now solved seven times |
| **Appendix C** | **The Vulnerable-Counterparty Floor** — one principle, four groups |
| **Appendix D** | **THE RE-PROPOSAL REGISTER** — mechanisms already struck, shipped again |
| **Appendix E** | Traceability to `rbac-audit-red-team.md` |
| **Appendix F** | Required deltas to `phase8-sub-role-expansion-plan.md` — **including the taxonomy arithmetic** |

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt

---

# PART I — RED TEAM AUDIT

## 0.1 Executive Verdict

**Group 9 is the only group in the ecosystem whose entire economic function is a fiduciary duty, and the draft never uses the word.** Not "fiduciary," not "agency," not "dual agency," not "licence," not "disclosure," not "principal." What it ships instead is a lead-generation console, a distress feed, and a commission-routing contract.

That omission would be serious in any group. Here it is disqualifying, because a real estate broker's legal existence *is* the agency relationship: loyalty, confidentiality, disclosure, obedience, accounting, and reasonable care, owed to a named principal, under a licence granted by a state that can revoke it. Strip that out and what remains is not a brokerage product. It is an unlicensed intermediary with a payment rail.

**But the finding that should stop this draft before any of the above is arithmetic.**

Three of the four monetization mechanisms in this draft have already been deleted **by name** in blueprints this document is required to treat as binding:

| Draft mechanism | Struck by | Verbatim |
|---|---|---|
| *"Distress Interception"* premium tier | `MasterBlueprint_Group_1.md` §II.8.4 | *"The Group 9 draft's 'Distress Interception' premium tier is **withdrawn** and replaced with the consented `seeking_exit` feed."* |
| HELOC referral bounty | `MasterBlueprint_Group_1.md` §II.8.3 | *"Forbidden: any fee contingent on loan consummation; any per-referral bounty; any % of loan amount — RESPA §8(a)/(b); **the Group 9 'HELOC referral bounty' is deleted**."* |
| Fee on a referred consumer transacting | `MasterBlueprint_Group_1.md` §II.8.3, Broker row | *"Permitted: flat access subscription. **Forbidden: fee contingent on a referred consumer transacting.**"* |

This is the first group in the corpus whose primary defect is not a novel design error but the **re-proposal of struck mechanisms**. Appendix D registers all of them, because the process failure is more dangerous than any individual finding: a corpus in which deletions do not stick will re-ship every vulnerability it has ever fixed. Appendix D therefore also specifies the control.

The remaining structural defects:

1. **No licence exists anywhere in the design.** Brokerage is the most heavily licensed activity in the entire 27-role taxonomy — per state, per firm, with salespersons who cannot hold a licence independently and who, in most states, **may not be paid a commission by anyone other than their sponsoring broker**. The draft's smart contract *"routing the $SHQL instantly to their respective wallets"* is, in most launch jurisdictions, an unlawful compensation structure and a licence-revocation event for every participant.

2. **The commission engine implements the practice that was dismantled.** *"The smart contract... calculates the broker's commission (e.g., 5% of the sale price). It automatically splits this fee between the Listing Broker and the Buyer's Broker based on the RLS Universal Co-Brokerage Agreement."* Post-settlement practice changes removed offers of compensation from shared listing surfaces and require separately negotiated, separately agreed cooperating compensation. A platform that hard-codes a customary rate and auto-splits it across all participants is not merely non-compliant — it is a **rate-standardization mechanism across competing brokerages**, which is the same algorithmic-coordination theory that withdrew Group 7's rent benchmark (G7-30), in a market with an active enforcement history.

3. **Every fee in the draft is contingent on a consumer transacting.** Subscription-for-distress-data, closing micro-fees, HELOC bounties, and a data-room deposit the broker both sets and profits from. There is no revenue line that survives a consumer deciding *not* to sell. That is the exact incentive geometry that Groups 1, 4, and 7 each built explicit floors against, and it points at the most vulnerable counterparty in the system.

4. **The Data Room Access Escrow is a genuinely novel extortion surface.** A fiduciary charges a stake for access to *the principal's own confidential information*, sets the amount, holds the float, and decides the refund. Group 4 §II.7.3 already established that an escrow holder may not determine the condition of release. Here the escrow holder is also the interested agent.

5. **Group 9 is the maximum-blast-radius role in the taxonomy, and the draft grants its scope by subscription tier.** Trace what this group is asked to see: Group 1 parcels and distress state, Group 2 deals and assemblage footprints, Group 3 lender products, Group 6 studies, Group 7 rent rolls and lease expirations, and *"proprietary financial ledgers of a building."* Then read the monetization line: *"High-tier SaaS subscription fees for access to the platform's proprietary distress and zoning data."* Entitlement-widens-scope is the single most-repeated invariant violation in this corpus (G1-04, G2-09), and Group 9 states it as the business model.

6. **The three `broker_*` keys do not exist.** They appear in no enum, no `ROLE_APP_MAP`, no `ROLE_GROUP_MAP`, no RLS policy, and — critically — **the role taxonomy document has no Group 9 section at all**. Group 4 Appendix D moved the canonical count to 27 *on the assumption these three keys exist somewhere*. They do not. Today a broker cannot log in; and the naive fix — one `broker` group string across all three — would expose every brokerage's book of business, client identities, motivations, and price expectations to every competitor on the platform.

**The honest reframe.** The defensible product here is not leads and it is not a commission rail — leads are a commodity and the rail is a liability. It is being **the only platform on which the agency relationship, the disclosure, and the compensation are all on the record, verifiable, and defensible**. Post-settlement brokerage has an acute, unmet, and expensive compliance problem: written buyer agreements before touring, separately negotiated cooperating compensation, agency disclosure at first substantive contact, fair-housing service equality, and a transaction file that survives a state audit. Nobody sells that well. A brokerage will pay a flat subscription for it forever, and it is the one revenue line in this group that does not require a consumer to be harmed. Part II builds that.

## 0.2 Finding Register

| ID | Sev | Domain | Finding |
|---|---|---|---|
| G9-01 | 🔴 | Licensure | No licence, brokerage firm, designated broker, or salesperson-affiliation model exists |
| G9-02 | 🔴 | Agency | Agency relationships are unmodelled; the design produces undisclosed dual agency by default |
| G9-03 | 🔴 | Fiduciary | The Developer Pitch Hub is undisclosed dual representation with an unguarded self-dealing path |
| G9-04 | 🔴 | Disclosure | Compensation flows from adverse parties simultaneously, with no disclosure record and no API gate |
| G9-05 | 🟠 | Instruments | No listing agreement, no buyer-broker agreement, no agency disclosure — the constitutive documents are absent |
| G9-06 | 🟠 | Consumer | "Sheer transactional conduit" FSBO product collides with minimum-service statutes |
| G9-07 | 🟠 | Supervision | Brokerage seats, teams, and the designated broker's supervision duty are unmodelled |
| G9-08 | 🔴 | Antitrust | A hard-coded customary rate auto-split across brokerages is rate standardization, and misstates post-settlement rules |
| G9-09 | 🔴 | Settlement | Smart-contract commission at "deed transfer" bypasses settlement, licensure, and the closing statement |
| G9-10 | 🟠 | Disputes | Procuring cause and competing commission claims have no representation in the model |
| G9-11 | 🟠 | Licensure | Sponsoring-broker, franchise, team, and referral splits are unmodelled; payment to unlicensed persons is reachable |
| G9-12 | 🟡 | Antitrust | A default commission percentage rendered in a shared system is itself a coordination signal |
| G9-13 | 🔴 | Distress | **"Distress Interception" was withdrawn by name in G1 §II.8.4 and is re-proposed here** |
| G9-14 | 🔴 | RBAC | The premium tier purchases data scope — G1-04 / G2-09, restated as the business model |
| G9-15 | 🟠 | Data | The Spatial Prospecting Map re-imports the withdrawn heatmap and has no Provenance Registry basis |
| G9-16 | 🟠 | Solicitation | The Lead Gen CRM industrializes outbound owner solicitation outside the G1 consent ladder, with no TCPA/DNC model |
| G9-17 | 🟠 | Solicitation | Brokers become a suppression-laundering channel for Groups 2 and 3 |
| G9-18 | 🔴 | Extortion | The Data Room Access Escrow monetizes the principal's own information and makes the interested agent the escrow determiner |
| G9-19 | 🟠 | Data | Broker-operated data rooms are a parallel channel around G2's assignment board and purpose-bound rooms |
| G9-20 | 🟠 | Confidentiality | The broker's read scope is the union of every other group's; client confidentiality is unmodelled |
| G9-21 | 🔴 | RESPA | **The HELOC referral bounty was deleted by name in G1 §II.8.3 and is a RESPA §8 violation** |
| G9-22 | 🟠 | RESPA | Closing-contingent platform fees implicate RESPA and corrupt every neutral platform function |
| G9-23 | 🔴 | Fair Housing | Residential matchmaking and "curated tours" with no fair-housing controls is a steering engine |
| G9-24 | 🟠 | MLS | RLS integration treats participant agreements, IDX/VOW rules, and copyright as an API detail |
| G9-25 | 🟠 | Reliance | The Packaged Deal requirement is undisclosed steering, and a broker-commissioned Phase I is not buyer-reliable |
| G9-26 | 🔴 | Taxonomy | The three `broker_*` keys exist in no enum, no map, no policy, and no taxonomy section |
| G9-27 | 🔴 | RBAC | A single `broker` group string would expose every brokerage's book of business and client confidences |
| G9-28 | 🟠 | Escrow | "Smart contract executing the deed transfer" contradicts G1 §II.6.3 and G4 §II.7 |
| G9-29 | 🟡 | UI | A flat portal violates the contextual-workspace paradigm; the unit of work is the representation |
| G9-30 | 🟡 | Boundary | `broker_leasing` and Group 7 collide; a broker must never reach Class-T screening data |
| G9-31 | 🟢 | UX | Licence-and-payment-before-value onboarding, with the free tier holding nothing |
| G9-32 | 🟢 | Lifecycle | No listing expiry, withdrawal, protection period, or post-termination confidentiality duty |

---

## 1. Licensure, Agency & Fiduciary Duty

### G9-01 🔴 No licence, brokerage firm, designated broker, or affiliation model exists

**Finding.** The draft describes three broker sub-roles performing listing, buyer representation, tenant representation, assemblage brokerage, and commission collection — and models none of the following:

```
· the state licence, its class (broker / associate broker / salesperson), number,
  standing, expiry, and disciplinary history
· the BROKERAGE FIRM, which in most states is separately licensed and is the entity
  that may lawfully receive compensation
· the DESIGNATED BROKER / broker-of-record, who is legally responsible for the
  conduct of every licensee affiliated with the firm
· the SALESPERSON AFFILIATION edge — a salesperson cannot hold a licence
  independently and cannot practise except through a sponsoring broker
· errors & omissions coverage
· per-state reciprocity and the licence needed for the TRANSACTION'S state, which is
  not necessarily the licensee's home state
```

**The compensation consequence is immediate and severe.** *"Routing the $SHQL instantly to their respective wallets"* pays an individual agent. In most US states a licensed salesperson **may be compensated only by their sponsoring broker**, and paying a commission to anyone else — including directly to the salesperson, and absolutely including an unlicensed person — is a statutory violation exposing the payer, the payee, and the firm to licence discipline.

**Exploit — and it needs no sophistication.** Register, select `broker_residential`, list a property, collect a commission. Nothing in the draft verifies that the actor may lawfully perform any of it. Unlicensed brokerage is a criminal offence in most states, and a platform that supplies the listing surface, the contract, and the payment rail is not an incidental bystander to it.

`FIX →` §II.2 the **Registration Ladder (R0–R3)** and §II.1.2 the **licensee model** — the licence belongs to a *person*, the commission belongs to the *firm*, and the affiliation edge is what connects them. This is the Group 6 §II.1.2 seal-holder pattern applied to a different profession, for the same reason: an individual's professional authority cannot be held by a company account.

---

### G9-02 🔴 Agency is unmodelled, and the design produces undisclosed dual agency by default

**Finding.** The draft has *"buyer representation pipelines,"* *"Commercial Tenant Rep,"* *"Landlord & Tenant Matchmaking,"* and a commission *"split between the Listing Broker and the Buyer's Broker"* — four distinct agency postures — inside one account with one data scope and no representation object.

The questions the design cannot answer:

| Question | Consequence of not answering |
|---|---|
| Whom does this licensee represent on this transaction? | Every duty owed is undefined |
| Has the required agency disclosure been made and acknowledged? | Required at first substantive contact in most states; its absence is a disciplinary matter and voids compensation in some |
| Is the firm on both sides? | **Dual agency is prohibited outright in several states** and requires informed written consent from every principal elsewhere |
| If designated agency, where is the wall? | Confidential principal information — motivation, price flexibility, timeline — is readable across the firm |
| Does confidentiality survive termination? | It does, in most states; the draft has no post-termination state at all |

**Exploit.** A brokerage lists 128 Maple St for a seller and separately represents a buyer touring it. Under the draft both representations live in the same CRM with the same read scope. The buyer's agent sees the seller's stated urgency, the price floor discussed in the listing workspace, and the days-on-market analytics. That is not a leak; it is the design.

Group 4 built exactly this machinery once already — intake conflict screening, imputation across the firm (MRPC 1.10), ethical walls, and an append-only screening record (§II.6.1–§II.6.3). Group 9 needs the same objects for the same reason, and the draft does not reference them.

`FIX →` §II.4 — `agency_representations` as the authorization primitive; §II.4.2 disclosure gated **at the API layer, not the UI**; §II.4.3 dual agency blocked in prohibiting states and consent-gated elsewhere, with **designated agency plus an `engagement_wall`** as the preferred structure, inheriting G4 §II.6.2 unchanged.

---

### G9-03 🔴 The Developer Pitch Hub is undisclosed dual representation with an unguarded self-dealing path

**Draft text:** *"When the broker successfully organizes a group of `owner_investor` users, they utilize the portal to commission a conceptual massing study from an `arch_ra` and present a unified, de-risked blueprint to the `investor_assembler`."*

**Finding.** In one sentence the broker: (a) assembles a cohort of sellers whose interests are to maximize price and who are now bound together, (b) commissions a professional study — paid by whom, disclosed to whom, and relied on by whom, all unstated — and (c) delivers the package to **a specific named buyer**, who under the draft's own commission model also pays them.

Three distinct defects:

1. **Undisclosed dual representation at scale.** Every owner in the footprint is a principal. The buyer is a counterparty the broker is also compensated by. No disclosure, no consent, no wall.
2. **The broker learns the footprint.** Group 2 §II.9.6 made footprint confidentiality a first-class control specifically because knowing the footprint lets a party buy the keystone parcel and hold the assembly hostage. Group 9's draft hands the complete footprint to an actor with a commission incentive and no fiduciary constraint. **Undisclosed principal purchase — the agent or their affiliate acquiring the asset they represent — is the classic broker fraud, and nothing here prevents it.**
3. **The owners' leverage is destroyed by the packaging.** Group 1 §II.6.1 deleted the drag-along outright: *"A homeowner's right to decline is not a defect to be engineered away."* A *"unified, de-risked blueprint"* presented to a single buyer is the commercial equivalent — it converts n independent negotiations into one, with the broker holding the pen.

`FIX →` §II.4.6 — the cohort-organizing capability survives, **as a disclosed agency of the owners**: buyer-side compensation disclosed to every owner before any pitch; a **hard bar on the licensee or their identity cluster (G2 §II.2.3) taking any interest in any parcel in the footprint** for the representation term plus a cooling-off period (`self-dealing-lint`); footprint confidentiality inherited from G2 §II.9.6; and every commissioned study carrying §II.9.2's `commissioned_by` / `for_whose_benefit` / `reliance_grantable` attribution.

---

### G9-04 🔴 Compensation flows from adverse parties simultaneously, with no disclosure record

**Finding.** Count the ways a Group 9 broker is paid in this draft: the co-brokerage split (from the transaction), the HELOC referral bounty (from a lender), the data-room deposit (from a prospective buyer), and the subscription (to the platform, for data about third parties). No two of those have the same payer, and several have payers whose interests are adverse to the broker's principal.

Group 1 §II.8.3 already established the control and made it structural:

> *"Every routing event that carries platform compensation renders an Affiliated Business Arrangement disclosure identifying the relationship, the fee, and the payer, with an explicit statement that the consumer is free to shop elsewhere. Acknowledgement is written to `disclosures` with the rendered document hash. **Routing without a recorded acknowledgement is blocked at the API layer, not merely discouraged in the UI.**"*

Group 9 is the group for which that rule was written, and the draft implements none of it.

`FIX →` §II.4.2 and §II.11.4 — a **Disclosures Register** as a first-class brokerage subtab; every compensation source disclosed to every principal **before the act that earns it**; `agency-disclosure-lint` fails the build on any broker-side routing, referral, or instrument path that can execute without a committed acknowledgement row.

---

### G9-05 🟠 The constitutive instruments do not exist

**Finding.** A brokerage relationship is created by documents, and none of them are in the draft:

- **The listing agreement** — term, exclusivity type (exclusive right to sell / exclusive agency / open), permitted marketing, protection period, cancellation rights, and the compensation the seller agrees to pay. Without it there is no authority to market the property and no enforceable right to a fee.
- **The buyer-broker agreement** — post-settlement practice changes require a written agreement **with a stated compensation amount, executed before the buyer tours a property**, across most of the US. The draft has buyer pipelines and tours and no agreement.
- **The agency disclosure** — required at first substantive contact in most states, in a state-prescribed form.

The draft has a smart contract that pays a commission and no document that creates the right to one.

`FIX →` §II.8.1 and §II.5.4 — all three generated inside the Group 4 §II.11.1 boundary (per-jurisdiction counsel-approved templates, versioned, identified approving attorney, mechanical field completion, no instrument-selection recommendation), with **the buyer agreement gating the tour and the unmasked listing view at the API layer**.

---

### G9-06 🟠 "Sheer transactional conduit" collides with minimum-service statutes

**Draft text:** *"Flat-Fee / Agent-Assisted FSBOs. They can utilize the portal to offer limited-service, flat-fee MLS listings on the REBNY RLS, acting as a sheer transactional conduit for homeowners seeking maximum exposure."*

**Finding.** Limited-service brokerage is lawful in some states and **restricted or prohibited in a meaningful number of others** by minimum-service statutes, which typically require a licensee to accept delivery of and present offers, assist with counteroffers, and answer the client's questions — duties a "sheer transactional conduit" is by definition disclaiming. Several of those duties are non-waivable.

The phrase itself is the finding: a broker cannot contract out of the duties that make them a broker, and a platform that markets the disclaimer as a product feature is inviting per-transaction disciplinary exposure onto its users in every minimum-service state.

`FIX →` §II.2.3 — a **capability-jurisdiction matrix** for Group 9, inheriting Group 2 §II.2.5's structure: `enabled` / `requires_licence` / `disabled` per state per sub-role per capability, hard-blocked at the API layer with a plain explanation. Limited-service listing is a per-state capability, and the service level actually delivered is recorded on the listing agreement rather than asserted in marketing copy.

---

### G9-07 🟠 Brokerage seats, teams, and the supervision duty are unmodelled

**Finding.** The draft models one account per broker. A real brokerage is: a designated broker who is **legally responsible for the conduct of every affiliated licensee**, managing brokers with supervisory scopes, team leads with internal split arrangements, agents, and unlicensed administrative staff who **may not perform licensed activity or receive compensation** for it.

Without seats: shared logins, no supervision surface, no way for the designated broker to discharge a duty they are personally liable for, and no way to prevent an unlicensed admin from performing a licensed act. Groups 3 (§II.1.2), 5 (§II.1.2), and 7 (§II.9.3) each built a seat model with an intersection rule; Group 9 needs the same and additionally needs the **supervision** surface, because here the seat hierarchy carries statutory liability rather than merely operational scope.

`FIX →` §II.1.3 `broker_seats` with `designated_broker | managing_broker | team_lead | agent | unlicensed_admin`, the G3 I-5 intersection rule inherited, and §II.4.7 a **Supervision** subtab exposing to the designated broker every representation, disclosure gap, licence lapse, and open complaint in their firm.

---

## 2. The Commission Engine

### G9-08 🔴 A hard-coded rate auto-split across brokerages is rate standardization, and misstates the rules

**Draft text:** *"When a transaction closes, the smart contract executing the deed transfer simultaneously calculates the broker's commission (e.g., 5% of the sale price). It automatically splits this fee between the Listing Broker and the Buyer's Broker based on the RLS Universal Co-Brokerage Agreement, routing the $SHQL instantly to their respective wallets."*

**Finding — the draft is wrong about the current state of the rules, and the error is the dangerous kind.**

Following the residential brokerage antitrust settlements and the resulting practice changes:

```
· offers of cooperating compensation MAY NOT be published on a multiple listing service
· cooperating compensation must be separately negotiated and separately agreed
· a written buyer-broker agreement stating the compensation amount is required before
  the buyer tours a property
· compensation is not "universal," not customary, and not derivable from a rate card
```

The draft implements the **pre-settlement** model, describes it as compliance, and encodes it in a shared automated system.

**The antitrust exposure is structural, not incidental.** A platform that supplies a default rate (*"e.g., 5%"*), a standard split formula, and a shared execution rail across competing brokerages is a mechanism by which independent firms converge on a common price without ever communicating. That is the same theory that withdrew Group 7's cross-manager rent benchmark (G7-30, `rent-recommendation-lint`), and it is more acute here because in Group 7 the platform aggregated a price and in Group 9 the platform **proposes** one.

`FIX →` §II.5.1–§II.5.3 (**I-31**) — compensation is an **agreement between named parties**, entered by them, never proposed, defaulted, suggested, benchmarked, distributed, or aggregated by the platform. **No offer of compensation renders on any shared listing surface.** Cooperating compensation is bilateral, recorded on the transaction, and invisible to every non-party. `commission-benchmark-lint` fails the build on any default value, placeholder, suggestion, percentile, or cross-brokerage aggregate of a commission rate.

---

### G9-09 🔴 Smart-contract commission at "deed transfer" bypasses settlement, licensure, and the closing statement

**Finding.** *"The smart contract executing the deed transfer"* does not exist and cannot. Group 1 §II.6.3 #6 settled this for the whole corpus: *"Escrow never holds title. Title transfer occurs only at a recorded closing through licensed settlement."* A deed transfer is a recorded act performed by a licensed settlement agent under state law; a chain event is not one, cannot cause one, and cannot reliably observe one.

Everything downstream inherits the error:

| Draft behaviour | Why it fails |
|---|---|
| Commission computed on-chain at transfer | The transfer is off-chain; the chain has no authoritative view of it |
| Paid *"instantly"* | Commission is a line on the settlement statement, disbursed by the settlement agent from proceeds |
| Paid to individual wallets | In most states only the sponsoring brokerage may lawfully receive it (G9-01) |
| Paid ahead of everything else | Commission sits behind payoffs, liens, judgments, and levies against the payee; a broker with a judgment against them cannot be paid around it |
| Irreversible | Closings rescind, fail post-recording, and get unwound. There is no clawback |
| No RESPA line | On residential federally-related transactions the fee must appear on the disclosure the consumer signs |

`FIX →` §II.5.5 (**I-35**) — commission is a **line item on a recorded settlement**, disbursed by the settlement agent to the **sponsoring brokerage**, after the §II.5.5 claim window closes. The $SHQL rail may settle that agreed line under the Group 1 §II.7.2 two-phase protocol **with the recorded closing as the Phase-0 gate**, never as its trigger. **No chain event disburses a commission**, asserted by `settlement-only-lint`.

---

### G9-10 🟠 Procuring cause and competing claims have no representation

**Finding.** Two brokers each claim to have procured the buyer. This is the single most common dispute in the industry, and it is normally resolved through association arbitration under a defined body of procuring-cause factors. The draft pays one wallet instantly and irreversibly, which means the platform will have distributed a contested fund before anyone can contest it — and will then be the defendant, because it is the party that chose.

Group 4 built an entire arbitration protocol with a neutrality wall, party-driven neutral selection, compensation fixed at appointment, and zero net platform revenue from outcomes. Group 9 does not reference it.

`FIX →` §II.5.5 — a **claim window** between the recorded closing and disbursement, during which a competing claim converts the line to a hold; the hold routes to a Group 4 `neutral` under the §II.5.3 selection protocol; the **undisputed portion disburses immediately** (the G5 §II.6.3 partial-settlement pattern, inherited), so no broker's whole fee is hostage to a partial disagreement.

---

### G9-11 🟠 Sponsoring-broker, franchise, team, and referral splits are unmodelled

**Finding.** The draft's split model is two-way: listing broker, buyer's broker. Real commission flow is a chain of contractual and statutory relationships:

```
gross commission
  → SPONSORING BROKERAGE (the only lawful payee in most states)
     → franchise fee            (contractual)
     → team lead split          (contractual, internal)
     → agent split              (contractual, internal)
     → referral fee out         (LICENSED brokerages only, disclosed)
     → transaction fees, desk fees, E&O deductions
```

Two things follow. First, the platform must not compute this — it is a firm-internal contractual matter and a platform formula would be both wrong and a liability. Second, and more seriously, **paying any part of a commission to an unlicensed person is a criminal offence in most states**, and a wallet-address payout model has no concept of licensure at the payee.

`FIX →` §II.5.6 — the platform settles **one line to the sponsoring brokerage**. Internal splits are a firm-internal ledger the platform may *record* for the firm's own bookkeeping and never *compute* or *execute*. Referral fees are payable only to a verified R2 brokerage, disclosed to the principal, and blocked to any unlicensed payee at the API layer.

---

### G9-12 🟡 A default commission percentage in a shared system is itself a coordination signal

**Finding.** Even framed as an example, *"(e.g., 5% of the sale price)"* becomes the pre-filled value in a shared UI used by competing firms, and pre-filled values are adopted. A platform-supplied default is a price signal regardless of the label attached to it, and its adoption rate is measurable — which makes it evidence.

`FIX →` §II.5.2 — the compensation field is **empty, required, and free-entry**, with no default, no placeholder text containing a number, no recently-used value, no autocomplete, and no "typical range" affordance anywhere in the product. Adoption telemetry on commission values is on the §II.11.6 deliberately-not-collected list, because collecting it would itself create the aggregate that I-31 forbids.

---

## 3. Distress, Data & Prospecting

### G9-13 🔴 "Distress Interception" was withdrawn by name and is re-proposed here

**Draft text:** *"**Distress Interception:** By subscribing to premium data tiers, this broker can view properties where an `owner_distressed` has toggled the 'Seeking Exit' flag. The broker can rapidly intervene to list the property or sell it off-market to an `investor_value_add`."*

**Finding.** `MasterBlueprint_Group_1.md` §II.8.4, which is binding on this document:

> *"No paid tier, in any group, exposes: the existence of an `owner_distressed` binding, a Shield-tier offer or acceptance, an internally-computed distress score, or an inference derived from any of them. **The Group 9 draft's 'Distress Interception' premium tier is withdrawn** and replaced with the consented `seeking_exit` feed — which the owner turns on, from a cooled-off state, having read what it means."*

The draft's description is also internally incoherent in a revealing way. It says the broker sees parcels *"where an `owner_distressed` has toggled the Seeking Exit flag"* — which is the consented feed and is fine — but names the product **Interception**, gates it behind a **premium data tier**, and the monetization line sells *"access to the platform's **proprietary distress** data."* Consented data is not proprietary and does not need a premium tier. **The thing being sold is the distress state; the seeking-exit framing is the wrapper.**

**And the described workflow is the harm the rule exists to prevent.** *"Rapidly intervene... or sell it off-market to an `investor_value_add`"* describes an agent, owing a duty to maximize a distressed homeowner's proceeds, routing that homeowner's property to a discount buyer off-market. That is the equity-stripping fact pattern that MARS/Regulation O, state foreclosure-consultant statutes, and Group 4 §II.9's loss-mitigation regime exist to address — and Group 1 §II.8.3 already set the fee for loss-mitigation-adjacent work at **$0 in any structure**.

`FIX →` §II.6.1 (**I-36**) — withdrawn, for the second time, and made an invariant so it cannot return a third: **no surface, tier, export, model, or inference exposes a distress binding, a Shield state, a distress score, or anything derived from them.** The consented `seeking_exit` feed is available at **every tier including free**, carrying Group 1 §II.5.3 in full — 24h hysteresis, 30-day tombstoning, k≥5 floor, hourly cadence quantization — because a data scope may never be a paid feature (G9-14) and because the paywall was the mechanism by which the fig leaf worked.

---

### G9-14 🔴 The premium tier purchases data scope

**Draft text:** *"High-tier SaaS subscription fees for access to the platform's proprietary distress and zoning data."*

**Finding.** Group 1 §II.8.1, restated in Group 2 §II.1.3 and Group 7 §II.13.1: *"An entitlement can gate whether a subtab **renders and its analytics run**. It can never gate whether a **row is readable**. Every entitlement check is a feature check evaluated **after** an independent RLS scope check has already passed."* Group 2 rated this 🔴 as G2-09, "privilege escalation by payment."

Group 9's draft states it as the business model, in the same sentence as the data it is escalating to.

**Exploit.** The escalation path is the subscription form. Beyond that, an entitlement-derived scope is enforceable only in application code — RLS cannot see a Stripe state without the billing role holding a grant it must not have (I-2) — so the boundary becomes a UI condition, and every finding in `rbac-audit-red-team.md` established that a direct `supabase-js` call walks past UI conditions.

`FIX →` §II.11.2 — tiers gate **brokerage-side features only**: seat count, CRM automation depth, compliance-reporting breadth, Market Reference granularity within the k-floor. Every data scope in Group 9 derives from an `agency_representation`, a `listing` mandate, or a consented feed available to all — never from a payment. `entitlement-scope-lint` (inherited from Group 2) fails the build on any RLS predicate or data-fetch path reachable from an entitlement check.

---

### G9-15 🟠 The Spatial Prospecting Map re-imports the withdrawn heatmap

**Draft text:** *"The interactive map loaded with MapPLUTO land-use categories, combined lot-size filters, and built-FAR caps for **finding off-market sites**."*

**Finding.** "Off-market" means *parcels whose owners have not offered them*. Group 2 §II.5.1 withdrew the Macro-Distress Map and constrained prospecting to exactly four sources, and Group 2 §II.5.3 forbade any layer rendering finer than its aggregation unit, enforced **server-side at the tile service**. Group 9's map is parcel-level targeting of non-consenting owners with a filter set optimized for finding them.

Two further defects:

- **No Provenance Registry entry.** Group 2 §II.5.4 requires every layer to carry `lawful_basis` from a controlled vocabulary and **a layer with no current entry does not render**. MapPLUTO is public and licensed — perfectly legitimate — but must be registered with its licence and permitted use. *"Proprietary distress data"* has **no member of the vocabulary it could claim**: `inferred_nonpublic` was deliberately excluded precisely to foreclose it.
- **Built-FAR residual as a targeting score.** Group 6 §II.9.3 withdrew the "density arbitrage opportunity" score (G6-10) and required zoning facts to render **unranked**. A filter for parcels with unused FAR is that score with a different UI.

`FIX →` §II.6.2–§II.6.3 — Group 2's four lawful sources inherited unchanged, plus one Group 9 addition (MLS/RLS data under the participant agreement, §II.8.2), each with a Provenance Registry entry. Zoning and land-use facts render **unranked**; no opportunity score, no upzoning-likelihood, no FAR-residual ranking; the G2 §II.5.3 anti-reconstruction controls apply whole, including query-volume anomaly detection per identity cluster.

---

### G9-16 🟠 The Lead Gen CRM industrializes solicitation outside the consent ladder

**Draft text:** *"Deal Flow CRM & Lead Gen: Management of **outbound owner solicitations**, active listings, and buyer representation pipelines."*

**Finding.** Outbound owner solicitation is the exact activity Group 1 §II.5.4 and Group 2 §II.6 govern, and the governing rules are not soft:

```
· consent-first contact — no message about a parcel absent an ACCEPTED connection
· 3 connection requests per parcel per lifetime, 1 per 30 days
· a decline is PERMANENT and survives new subscriptions, new accounts, and role changes
· `no_contact` is absolute
· suppression is evaluated on the TARGET PARCEL, never on the requester's role
· quotas are evaluated against the IDENTITY CLUSTER (G2 §II.2.3), never the org
```

The draft ships tooling to do the opposite at volume, and adds a channel dimension nobody has modelled: **a CRM that manages outbound solicitation will call and text.** Telephone consumer protection is the most-litigated marketing exposure in US real estate, with per-contact statutory damages, and the draft has no consent record, no national or state do-not-call scrub, no internal DNC list, no calling-hours model in the **called party's** time zone, and no revocation handling.

`FIX →` §II.6.4 — Group 1 §II.5.4 and Group 2 §II.6's four-stage ladder inherited **without exception for brokers**, plus a telephony layer: consent records with source and timestamp, DNC scrub before every campaign, one-action revocation honored **across the identity cluster and every channel**, calling-window enforcement, and per-cluster contact-velocity limits. `dnc-lint` fails the build on any outbound path that can execute without a current scrub and a consent record.

---

### G9-17 🟠 Brokers become a suppression-laundering channel

**Finding.** A broker with access to Group 1 owners is a conduit through which Groups 2 and 3 reach consumers who have suppressed *them*. *"I have a buyer who's very interested"* is a solicitation performed on someone else's behalf, and the draft's Deal Flow CRM makes it a workflow.

This defeats the entire Group 1 exposure control plane by indirection. Group 1 §II.5.4's symmetry rule — *"Suppression is evaluated on the target parcel, never on the requester's role"* — closes the direct path and says nothing about the relayed one, because until Group 9 there was no relay.

`FIX →` §II.6.4 (**I-30**) — **a broker may not transmit, on behalf of another user, any contact that the target's suppression state would block for that user.** The relayed principal is disclosed in every solicitation, the suppression check evaluates **both** the broker's cluster and the disclosed principal's cluster, and an undisclosed relay detected after the fact is a trust-level reversion for the brokerage cluster (the G2 §II.2.3 undisclosed-affiliate consequence, inherited).

---

## 4. Data Rooms & Confidential Information

### G9-18 🔴 The Data Room Access Escrow monetizes the principal's own information

**Draft text:** *"**Data Room Access Escrow:** A broker can lock a highly sensitive due-diligence data room (containing proprietary financial ledgers of a building) behind a refundable $SHQL micro-deposit. A developer must stake funds to view the data, eliminating 'lookie-loos' and protecting the seller's privacy."*

**Finding — four distinct defects, and the combination is novel to this group.**

1. **Whose information is it?** *"Proprietary financial ledgers of a building"* belong to the **owner** (Group 1), and where the building has tenants they are derived from Group 7 tenancy data, which is **Class-T restricted** and which Group 7 §II.11.2 already ruled a broker receives **nothing** of. A fiduciary charging third parties for access to the principal's confidential information, and keeping the proceeds, is self-dealing on the principal's asset. It is not cured by the seller benefiting incidentally from fewer tourists.

2. **The interested agent determines the refund.** *"Refundable"* — on whose determination? The broker sets the amount, holds the float, and decides whether the condition for return was met. Group 4 §II.7.3 resolved this exact structure for escrow holders: **no authority to determine breach at all**; release requires mutual instruction, a staged award, or a court order. Here the determiner is not merely disinterested-but-empowered — they are the counterparty's agent.

3. **It is an advance fee for access to a listing**, a category restricted or prohibited in a number of jurisdictions, and it puts the broker's interest directly against the principal's: a high deposit maximizes float and screens out real buyers; a low one maximizes volume. Neither setting is chosen for the seller.

4. **The float is trust money.** Deposits held on behalf of prospective counterparties are trust funds in most states, requiring segregation and accounting — the machinery Group 7 §II.6.1 built and Group 4 §II.7.1 built before it. The draft has one sentence and no corpus.

**The stated goal is legitimate and is achieved for free.** Screening out unqualified viewers is what an **NDA plus a verified-identity gate plus a proof-of-funds attestation** does, and none of those pay the agent.

`FIX →` §II.7 (**I-33**) — the access-deposit product is **withdrawn**. Access is gated by: verified counterparty credential (E2 for Group 2 actors, R2 for brokerages), an executed NDA, a **purpose-bound, expiring grant**, per-seat watermarking, and an access log **visible to the principal**. Zero fee to the viewer, zero revenue to the agent. Where a seller wants a financial screen, the instrument is a **proof-of-funds attestation from a verified source** — a fact, not a fee.

---

### G9-19 🟠 Broker data rooms are a parallel channel around Group 2's boundaries

**Draft text:** *"Digital Data Rooms: Secure, RBAC-locked vaults where the broker stores zoning analyses, lease expiration schedules, and access agreements to share with verified developers."*

**Finding.** Group 2 §II.7.4 is explicit and was written with this group in mind: *"the board is visible only to E2+ `investor_value_add` and `investor_assembler` members — never publicly, and **never to Group 9 brokers**."* Group 2 §II.9.4 further made data rooms **purpose-bound** after G2-12 found assembler rooms exposing named consumer homeowners' signed intents to LPs.

A broker-operated room that aggregates content from Groups 1, 2, 6, and 7 and shares it with "verified developers" is a side channel around all of that, and its contents inherit nothing:

| Content | Origin | Rule the draft ignores |
|---|---|---|
| *"lease expiration schedules"* | Group 7 | G7 §II.11.2: brokers receive listing data for **vacant or lawfully-noticed** units only; nothing about a sitting tenant |
| *"zoning analyses"* | Group 6 | G6 §II.8.2: distribution operates strictly within `design_licences.permitted_uses`; G6 §II.7 attribution travels with it |
| *"proprietary financial ledgers"* | Group 1 / Group 7 | Owner grant required; Class-T excluded categorically |
| *"access agreements"* | Group 1 | Owner's instrument; the broker holds no independent right to distribute it |

`FIX →` §II.7.3 — every data-room item carries its **origin group's rules as data**, enforced at grant time, not at upload time: Group 7 material arrives de-identified and aggregated per A66; Group 6 material carries its licence and reliance posture (§II.9.2); Group 1 material requires the owner's explicit, revocable, purpose-bound grant; Group 2's assignment board remains structurally invisible.

---

### G9-20 🟠 The broker's read scope is the union of every other group's, and client confidentiality is unmodelled

**Finding — two halves.**

**Outbound:** trace what the draft asks Group 9 to see and it is nearly the whole platform — Group 1 parcels and distress state, Group 2 deals and assemblage footprints, Group 3 lender products, Group 6 studies, Group 7 rent rolls and lease expirations. **Group 9 is the maximum-blast-radius role in the taxonomy.** A compromised broker account under the draft's design is a platform-wide data breach, and the draft grants that scope by subscription tier (G9-14).

**Inbound:** a brokerage's own book — client identities, motivations, price floors, timelines, and pipeline — is simultaneously the firm's core commercial asset **and** confidential information the firm owes a duty over, in most states surviving termination of the relationship. The draft has no confidentiality model, no post-termination state, and (per G9-27) a single group string that would make every firm's book readable by every competitor.

`FIX →` §II.1 (**I-30**) — every broker-side read of a principal's confidential information requires an active `agency_representation` or `listing` mandate; §II.6.5 confidentiality survives termination and is enforced by `status`-aware policies rather than by deletion; §II.10 the cross-group boundary table states what Group 9 receives from each group, and it is materially less than the draft assumes.

---

## 5. The Referral Bounty & Platform Fees

### G9-21 🔴 The HELOC referral bounty was deleted by name and is a RESPA §8 violation

**Draft text:** *"**Bounty/Referral Payouts:** If a broker refers an `owner_single` to the platform, and that owner subsequently takes out a HELOC to renovate, the broker automatically receives a micro-percentage referral bounty via a smart contract sweep."*

**Finding.** `MasterBlueprint_Group_1.md` §II.8.3, Lender row, verbatim: *"Forbidden: any fee contingent on loan consummation; any per-referral bounty; any % of loan amount — RESPA §8(a)/(b); **the Group 9 'HELOC referral bounty' is deleted**."*

The prohibition is not a house rule. RESPA §8(a) forbids giving **or accepting** any fee, kickback, or thing of value pursuant to an agreement to refer business incident to a settlement service involving a federally related mortgage loan. A HELOC secured by a residence is such a loan. A percentage bounty for a referral, paid on consummation, is the paradigm case. Exposure is **criminal**, runs to statutory treble damages, and attaches to **both sides** — the payer (the platform or the lender) and the payee (the broker) — with no good-faith exception for automation.

**The fiduciary defect compounds it.** A broker whose compensation depends on their client taking a particular financing product has an undisclosed interest in that advice. The draft automates the payment and never surfaces the interest.

`FIX →` §II.11.1 — **deleted, for the second time, and made structural (I-32)**: no Group 9 compensation may be contingent on a referral to a lender, a settlement service, a title agency, an insurer, or any platform-monetized counterparty. `respa-lint` fails the build on any fee constant reachable from a loan-origination, loan-consummation, title-order, or settlement-service event. Where a lawful affiliated business arrangement exists, it renders the Group 1 §II.8.3 disclosure and pays **nothing per referral**.

---

### G9-22 🟠 Closing-contingent platform fees implicate RESPA and corrupt every neutral function

**Draft text:** *"micro-transaction fees on the $SHQL ledger when a broker's listing successfully closes through a platform escrow."*

**Finding.** Two problems.

**(a) RESPA again, one step removed.** On a residential transaction involving a federally related mortgage, a fee taken by a platform at closing must be compensation for services actually performed, of a value reasonably related to those services. A percentage-of-ledger "micro-transaction fee" tied to closing is a fee for the transaction occurring, not for a service — and Group 1 §II.8.3's Broker row already forbids *"fee contingent on a referred consumer transacting."*

**(b) The alignment defect is the deeper one.** A platform with revenue contingent on closings has a financial interest in every consumer's decision to transact. That interest sits underneath: the fair-housing match engine, the compensation record, the disclosure gate, the commission claim window, and any dispute the platform touches. Group 4 §II.12.2 established **zero net platform revenue from dispute outcomes** for exactly this reason, and Group 7 §II.13.3 generalized it to distress. Group 9 needs the transaction-side statement of the same rule.

`FIX →` §II.11.3 — **zero net platform revenue from a transaction outcome.** No fee rises with a closing, a commission amount, a sale price, a referral, a loan, a lease execution, or a consumer's decision to transact. Revenue is a **flat, transaction-independent subscription paid by the brokerage** — which is precisely what Group 1 §II.8.3's Broker row specified before this draft was written. `settlement-revenue-lint`.

---

## 6. Listings, MLS Integration & Fair Housing

### G9-23 🔴 Residential matchmaking with no fair-housing controls is a steering engine

**Draft text:** *"They arrange **curated property tours** that match operational needs and future expansion plans"* (`broker_leasing`), alongside `broker_residential` serving *"retail home buyers."*

**Finding.** Steering — directing prospects toward or away from areas, or providing different service levels, on a protected basis — is the canonical fair housing violation, and it is the one that survives into automated systems most easily, because a recommendation engine trained on historical matches reproduces historical segregation without anyone intending it.

Absent from the draft, entirely:

```
· any fair-housing content control on listing copy or imagery
· an equal-service standard, or any measurement of service delivered by geography
· outcome testing of match, tour, and recommendation distributions
· a prohibition on protected-class-correlated filters and features
· advertising-audience constraints for housing ads
· the equal-opportunity statement on marketing surfaces
```

**And the map will be asked for the proxies.** School ratings, crime data, and "neighborhood quality" scores are the three most-requested layers in every residential product ever built, and all three are near-perfect protected-class proxies with a documented enforcement history. A "Spatial Prospecting Map" with no policy on them will ship them.

Group 7 §II.4.4 already built the outcome-testing machinery for tenant screening. Group 9 needs it applied to **service and recommendation** rather than to admission — a different surface, the same statutory duty, the same method.

`FIX →` §II.10 — an **equal-service record** with continuous outcome testing by geography and proxy; §II.10.2 school-quality, crime, and demographic layers **withdrawn** as steering surfaces, replaced with factual user-requested amenity data rendered unranked; §II.10.3 match outputs filtered on **the consumer's own stated criteria only**, with no learned preference model over protected-correlated features; §II.10.4 housing-ad audience targeting restricted to a permitted-category set with no lookalike audiences; §II.8.3 listing copy and imagery through a prohibited-content screen, and **no machine-generated listing copy transmitted without a licensee's explicit authorship act** (the G4 §II.11.2 / G6 §II.11.3 pattern).

---

### G9-24 🟠 RLS/MLS integration treats participant agreements, display rules, and copyright as an API detail

**Draft text:** *"API integration with listing management providers to **pull and push** exclusive listing data securely through the REBNY RLS network, ensuring compliance with NYC co-brokerage rules."*

**Finding.** MLS/RLS data arrives under a participant agreement with terms the draft does not model:

| Term | Draft |
|---|---|
| Access limited to participants and subscribers, tied to licensure and membership | no membership model |
| IDX and VOW are **distinct rulesets** with different display, registration, and consumer-consent requirements | no display mode |
| Attribution and required disclosure on every displayed listing | absent |
| Prohibited uses: scraping, derivative products, commingling with non-MLS inventory without disclosure | the draft builds a "proprietary" derivative product on it |
| Copyright in listing content and photographs held by the listing broker or the photographer | no rights model, and photographs are the most-litigated asset class in this business |
| Takedown propagation on delisting, within the MLS's window | absent |
| Clear-cooperation obligations on publicly marketed listings | absent (see G9-32) |

And the compliance claim itself is stale: *"ensuring compliance with NYC co-brokerage rules"* is asserted while the draft implements the pre-settlement compensation model those rules no longer permit (G9-08).

`FIX →` §II.8.2 — participant and subscriber status verified as a **precondition of the feed** (R2, §II.2.1); IDX and VOW as **distinct, separately-configured display modes** with their own consent and registration flows; attribution and required disclosures rendered on every listing; per-asset copyright ownership recorded with an explicit licence to display; prohibited-use enforcement including a bar on derivative products and on commingling without disclosure; takedown propagation inside the MLS's window with a monitored SLA. `mls-use-lint`.

---

### G9-25 🟠 The Packaged Deal requirement is undisclosed steering, and a broker-commissioned Phase I is not buyer-reliable

**Draft text:** *"To list a commercial development site on the platform's B2B marketplace, the system prompts the broker to attach a preliminary massing/zoning study and an environmental Phase I report. This builds immediate buyer confidence."*

**Finding — two defects, and the second is the one that costs real money.**

**(a) Steering with a financial interest.** The platform requires work to be commissioned, and it earns a marketplace fee on the Group 6 professionals (`arch_ra`, `arch_zoning`) who perform it. Group 6 §II.11.1 established the analogous rule when it found affiliate commissions steering a professional's tool choice (G6-20): the interest must be disclosed and must not drive the recommendation. Here the platform is not merely recommending — it is **conditioning access to the marketplace** on spend it monetizes, and the cost lands on the seller.

**(b) A Phase I ESA is a liability-shifting instrument, not a confidence-building document.** A Phase I Environmental Site Assessment performed to the applicable standard establishes the "all appropriate inquiry" element of the CERCLA innocent-landowner and bona-fide-prospective-purchaser defences. Three properties of that instrument the draft ignores:

```
USER-SPECIFIC     the report is prepared FOR a named user. A buyer who did not
                  commission it generally CANNOT rely on it without a RELIANCE LETTER
                  from the environmental professional.
SHELF LIFE        components expire — a substantial portion within 180 days, the whole
                  within a year — and a stale report does not support the defence.
CONSEQUENTIAL     a Recognized Environmental Condition finding creates a SELLER
                  DISCLOSURE OBLIGATION in most states.
```

The draft posts a seller's-broker-commissioned Phase I in a data room and describes its purpose as *"builds immediate buyer confidence."* That is an invitation to reliance the document does not support, from a party who is not the buyer's agent — and the buyer who skips their own Phase I on the strength of it loses the statutory defence and inherits the remediation.

This is structurally identical to Group 6 §II.7 (a machine BoQ sizing a loan with no attribution) and Group 6 §II.9.6 (geotechnical findings as material facts with unmodelled disclosure consequences). The corpus already has the pattern; Group 9 needs to apply it.

`FIX →` §II.9 — the Packaged Deal requirement is **de-mandated** into an optional, disclosed enrichment on which **the platform earns zero** (§II.9.1). Every study carries `commissioned_by`, `for_whose_benefit`, `reliance_grantable`, and its component shelf lives (§II.9.2). **A study whose reliance is not grantable renders with an explicit non-reliance banner and cannot be represented as buyer diligence** (`reliance-lint`). A **reliance letter is a first-class object**. A REC finding triggers a seller disclosure-obligation prompt routed to Group 4, inheriting G6 §II.9.6 unchanged.

---

## 7. RBAC & Taxonomy

### G9-26 🔴 The three broker keys exist in no enum, no map, no policy, and no taxonomy section

**Finding.** This group's three `rbac_key` values are referenced by the draft blueprint and by nothing else in the codebase or the architecture corpus:

```
shtiya_builder-role-taxonomy.md      → 7 group sections. THERE IS NO GROUP 9 SECTION.
                                       broker_commercial, broker_residential, and
                                       broker_leasing are defined NOWHERE.
phase8-sub-role-expansion-plan.md    → 22 keys. No broker key. No `broker` group string.
                                       No layout gate. No app segment.
src/lib/rbac/roles.ts                → ROLE_APP_MAP has no broker entry;
                                       getAllowedApps('broker_commercial') → []
supabase/migrations/                 → user_role enum has no broker value
```

**And the taxonomy arithmetic depends on them.** Group 4 Appendix D reconciled the corpus to **27** keys by counting `22 (Phase 8) + 3 (Group 9 brokers) + legal_arbitrator + contractor_logistics`. Group 5 Appendix B and Groups 6 and 7 each restated 27 and declared they added nothing. **The count is correct only if Group 9's three keys are actually defined, and Group 9 is the group that never defined them.** Group 4's migration `0027_group4_taxonomy_expansion.sql` added its own two enum values and could not have added Group 9's, because no document specified them.

Consequence today: a broker cannot authenticate into any app segment. Consequence of the naive fix: see G9-27.

`FIX →` §III.7 and Appendix F — Group 9 owns and supplies the three keys: enum values, `ROLE_APP_MAP` entries against a **new `brokerage` app segment**, the `broker` group string in `ROLE_GROUP_MAP`, layout gate, and fixtures. Migration `0048` carries the enum expansion, reconciling the corpus to a **defined** 27.

---

### G9-27 🔴 A single `broker` group string would expose every firm's book of business

**Finding.** The obvious implementation — three keys, one `broker` group string, policies written as `current_user_role_group() = 'broker'` per Phase 8 T8.2's pattern — produces the most commercially damaging instance of a defect this corpus has now closed six times (G1-02, G2-15, G3-07, G4-08, G5-12, G6-08, G7-27).

What every broker on the platform would read about every other broker:

```
· client identities and the fact of the representation itself
· the principal's MOTIVATION, price floor, and timeline — confidential by fiduciary duty
· active listings before they are marketed, and pocket listings that never will be
· the buyer pipeline: who is looking, at what price, with what financing
· commission agreements — which reconstructs the cross-brokerage rate aggregate that
  I-31 exists to prevent
· data-room contents inherited from Groups 1, 2, 6, and 7
```

This is simultaneously the Group 6 defect (competitor commercial IP — a brokerage's book **is** the firm's asset) **and** the Group 7 defect (confidential consumer data held under a legal duty), in one policy line. And unlike Group 6, disclosure here is not merely a commercial harm: it is a breach of the confidentiality duty the licensee owes, which is a disciplinary matter for a licence the platform does not control.

`FIX →` §II.1 (**I-1**, inherited) — Group 9's authorization primitives are the **representation** and the **listing mandate**. `is_representation_party()` and `has_listing_mandate()` are the only row-access predicates. `current_user_role_group() = 'broker'` **never appears in a Group 9 policy**, CI-enforced, and the string exists solely for coarse nav routing.

---

## 8. Escrow, Workspace & Lifecycle

### G9-28 🟠 "The smart contract executing the deed transfer" contradicts two binding blueprints

**Finding.** Group 1 §II.6.3 #6: *"Escrow never holds title. Title transfer occurs only at a recorded closing through licensed settlement."* Group 4 §II.7 owns trust and settlement, and §II.7.3 forbids an escrow holder from determining breach. Group 4 §II.7.5 governs signing authority. Group 9's draft asserts a smart contract that performs the deed transfer, computes a fee, and disburses it — contradicting all three, and additionally assuming a chain-native representation of a recorded instrument that no jurisdiction accepts.

`FIX →` §II.5.5 — settlement is Group 4's; Group 9 contributes **one line item** to it and consumes the recorded-closing event as a gate. Per §III.7, **no broker sub-role holds the `escrow` app segment at all** — the deliberate parallel to Group 4's `legal_arbitrator: ['legal']`, which was denied `escrow` on the principle that a party holding no financial signature needs no financial surface.

---

### G9-29 🟡 A flat portal violates the contextual-workspace paradigm

**Draft text:** *"**▼ 🤝 BROKERAGE & DEAL DESK (Active Portal)**"* — one node, four subtabs, spanning every client, listing, and pipeline the firm holds.

**Finding.** Identical in shape to G2-17 and G6-22. The Co-Pilot's context spans every representation at once, which is not merely an information-architecture problem here: cross-representation retrieval **is** the confidentiality breach in G9-02 and G9-27, delivered by a chatbot.

`FIX →` §II.3 — a Group 9 Workspace is `(brokerage_id, representation_id)` or `(brokerage_id, listing_id)`, plus a Brokerage workspace for licences, supervision, disclosures, and walls, and a Market Reference workspace for research. Navigation, map scope, Co-Pilot context, and authorization are the same unit — and per §II.3.5 the Co-Pilot has **no cross-representation retrieval**, which is a fiduciary constraint before it is a privacy one.

---

### G9-30 🟡 `broker_leasing` and Group 7 collide, and the boundary is already written

**Finding.** `MasterBlueprint_Group_7.md` §II.13.4 and Appendix A row A69 already resolved the positioning collision and stated the rule Group 9 inherits: the platform offers **direct leasing where the manager is licensed to perform it**, never a claim that brokerage is unnecessary, and *"`broker_leasing` operates as a first-class participant: a broker holds a scoped `management_engagement` facet or an owner-granted listing mandate."*

What remains for Group 9 to specify — and what the draft's *"Integrates with the `prop_manager` to fill vacancies"* leaves dangerously open — is the **data boundary**. A leasing broker placing a tenant sits adjacent to Group 7's screening pipeline, and Group 7 §II.11.1 classifies the applicant's screening file, income attestation, bank-derived data, and household composition as **Class-T with no admin branch**. A broker must never reach any of it, at any tier, under any engagement.

`FIX →` §II.10.5 — `broker_leasing` participates through an owner-granted `listing` mandate or a Group 7 `management_engagement` facet with `lease` scope only. It reaches unit availability, terms, and marketing; it reaches **no** applicant file, no screening report, no income attestation, and nothing about a sitting tenant (A66, A69, inherited).

---

### G9-31 🟢 Licence-and-payment-before-value onboarding

**Finding.** The draft's first-run experience is: verify a licence, subscribe to a high tier, and only then see data — with the free tier holding nothing, because the draft's entire data product is the paid tier (G9-14). That is the Group 2 G2-26 drop-off pattern ("KYB before value") with a paywall added, applied to a profession that evaluates software in a 20-minute trial between showings.

`FIX →` §II.2.2 — value at rung zero: R0 reaches Market Reference at the k-floor, the compliance template library, and a full sandbox; R1 reaches the CRM for the broker's **own** contacts with no platform-sourced data. Licence verification is required **at the point of the first licensed act** — creating a representation, listing a property, or transmitting an instrument — not at signup. Consented-feed access is not a tier (§II.6.1).

---

### G9-32 🟢 No listing lifecycle, and no post-termination confidentiality

**Finding.** Missing: listing expiry, withdrawal versus cancellation, the **protection period** (during which a seller who closes with a broker-introduced buyer still owes the fee — the most common post-termination dispute in the business), the exclusivity type, clear-cooperation obligations on publicly marketed listings, and the **post-termination confidentiality duty**, which in most states survives the relationship indefinitely as to the principal's confidential information.

`FIX →` §II.8.4 — a listing state machine with expiry, withdrawal, protection period, and cancellation as typed transitions; §II.6.5 confidentiality enforced by `status`-aware policies so a terminated representation converts to a read-only, confidentiality-preserving state rather than being deleted or left open.

---
# PART II — HARDENED ARCHITECTURE

## II.0 Design Thesis

> **Group 9's product is a fiduciary relationship.** The draft models leads, a distress feed, and a commission rail — and never names the duty that is the group's entire legal existence. Worse, three of its four revenue mechanisms were struck by name in Group 1's blueprint and shipped again here (Appendix D).
>
> The defensible product is **the record**: the only platform on which the agency relationship, the disclosure, and the compensation are all captured, verifiable, and defensible under a state audit. Post-settlement brokerage has an acute and expensive compliance problem — written buyer agreements before touring, separately negotiated cooperating compensation, agency disclosure at first substantive contact, fair-housing service equality, and a transaction file that survives an examination. Nobody sells that well, it is worth a flat subscription forever, and it is the only revenue line in this group that does not require a consumer to be harmed.

**Governing structural principles:**

1. **Every broker action occurs inside a named representation or listing mandate, or it does not occur.** (§II.1, §II.4.1)
2. **The platform never originates, defaults, suggests, benchmarks, or aggregates a commission.** (§II.5, I-31)
3. **Every compensation source is disclosed to every principal before the act that earns it.** (§II.4.2, I-30)
4. **No compensation is contingent on a referral to a settlement service.** (§II.11.1, I-32)
5. **A fiduciary never profits from the principal's information.** (§II.7, I-33)
6. **Distress is not a product** — sixth restatement, now an invariant. (§II.6.1, I-36)
7. **Commission disburses only from a recorded settlement, to the sponsoring brokerage.** (§II.5.5, I-35)
8. **Entitlements are feature flags. They never widen a data scope.** (I-2, inherited)
9. **Access derives from a representation or a mandate, never from a role group.** (I-1, inherited)

---

## II.1 Authorization Model *(resolves G9-02, G9-20, G9-26, G9-27)*

**Principle:** Group 1's primitive is the parcel, Group 2's the deal, Group 3's the facility, Group 4's the matter, Group 5's the work package, Group 6's the design package, Group 7's the engagement and the tenancy. **Group 9's is the representation** — because that is the unit a duty attaches to, the unit confidentiality attaches to, the unit conflicts are screened against, and the unit compensation is earned within.

```
users.role              → coarse nav routing only. Never used for Group 9 row access.

brokerages              → the licensed FIRM (R0…R3 registration level)
licensees               → INDIVIDUALS with per-state licences and a sponsoring affiliation
broker_seats            → firm seats; scope is the INTERSECTION of the seat role and the
                          representation (the G3 I-5 pattern)
agency_representations  → THE authorization primitive: (principal, licensee, brokerage,
                          side, scope, term, disclosure state)
listings                → an owner-granted marketing mandate on a property or unit
engagement_walls        → designated-agency screens within a firm (the G4 §II.6.2 pattern)
compensation_agreements → who pays whom, how much, agreed BEFORE the act (§II.5)
disclosures             → shared corpus (G1 §II.8.3); Group 9 writes to it constantly
entitlements            → billing-derived feature flags. Never widens a data scope.
```

**Two predicates, and no third:**

```sql
is_representation_party(p_rep uuid, p_facet text, p_side agency_side)
has_listing_mandate(p_listing uuid, p_facet text)
```

### II.1.1 Agency sides

| `agency_side` | Duty runs to | Notes |
|---|---|---|
| `seller_agent` | The seller | Listing mandate required |
| `buyer_agent` | The buyer | Written buyer agreement with stated compensation required before touring (§II.5.4) |
| `landlord_agent` | The landlord/owner | Composes with Group 7 (§II.10.5) |
| `tenant_agent` | The tenant/occupier | Never reaches Group 7 Class-T (A66) |
| `designated_agent` | One principal, inside a firm on both sides | **Requires an `engagement_wall`** (§II.4.3) |
| `dual_agent` | Both, with reduced duties | **Blocked in prohibiting states**; elsewhere requires informed written consent from every principal, recorded before the act (I-34) |
| `transaction_broker` | Neither, as a facilitator | Only where the state recognizes the status |
| `referral_only` | No principal | May receive a disclosed referral fee from a **licensed brokerage** only (§II.5.6) |

### II.1.2 The licensee model — *the licence belongs to a person, the commission belongs to the firm* *(G9-01)*

This is the Group 6 §II.1.2 seal-holder pattern applied to a different profession, for the same reason: an individual's professional authority cannot be held by a company account.

```
licensees(brokerage_id, user_id, identity_hash, licence_class, status)
broker_licences(licensee_id, state, licence_number, licence_class, standing,
                expires_on, sponsoring_brokerage_id, disciplinary_flags)

· licence_class ∈ ('broker','associate_broker','salesperson')
· a `salesperson` CANNOT hold a representation without an active sponsoring affiliation
· the licence must be active in the TRANSACTION'S state, which is not necessarily the
  licensee's home state — reciprocity is data, not an assumption (§II.2.3)
· COMPENSATION IS PAYABLE TO THE SPONSORING BROKERAGE ONLY (I-35, §II.5.6)
· affiliation change is a first-class event: representations transfer per state law, and
  the outgoing brokerage's confidentiality duty PERSISTS (§II.6.5)
· disciplinary history attaches to the IDENTITY CLUSTER (G2 §II.2.3) and is inherited by
  any re-registered brokerage — the G2-02 ban-evasion control, inherited whole
```

### II.1.3 Brokerage seats and the supervision duty *(G9-07)*

| `broker_seat_role` | Reaches | Never |
|---|---|---|
| `designated_broker` | Every representation, disclosure, wall, and complaint in the firm — **because they are personally liable for them** | Cross a wall they are screened from (§II.4.3) |
| `managing_broker` | Assigned representations plus the supervision surface for their scope | Representations outside their scope |
| `team_lead` | Their team's representations | Other teams' principals or confidences |
| `agent` | Their own representations | Any other licensee's principals, pipeline, or confidences |
| `unlicensed_admin` | Transaction logistics, scheduling, document assembly | **Any licensed act**; any compensation; any principal confidence |

Seat scope is the **intersection** of the seat role and the representation (G3 I-5, inherited). The `unlicensed_admin` seat is a hard block on licensed activity at the API layer, not a UI convention, because performing a licensed act unlicensed is a criminal exposure for the firm.

### II.1.4 Invariants

- **I-1** *(inherited)* No Group 9 RLS policy may use `current_user_role_group()` for row access except the literal `admin` branch. Policies call `is_representation_party()` or `has_listing_mandate()`.
- **I-2** *(inherited)* No billing path holds any grant on brokerages, licensees, licences, representations, listings, walls, or compensation agreements. **And no entitlement widens a data scope** (G9-14).
- **I-30** *(new)* Every broker-side read of a principal's confidential information requires an active `agency_representation` or `listing` mandate, and every solicitation — including one relayed on another user's behalf — is evaluated against the **target's** suppression state for **both** the broker's and the disclosed principal's identity cluster. (§II.6.4)
- **I-31** *(new)* The platform never originates, defaults, suggests, benchmarks, distributes, or aggregates a commission rate, and no offer of compensation renders on any shared listing surface. (§II.5.2)
- **I-32** *(new)* No Group 9 compensation may be contingent on a referral to a lender, settlement service, title agency, insurer, or any platform-monetized counterparty. (§II.11.1)
- **I-33** *(new)* A licensee may not be compensated from, nor hold a determinative role over, any escrow, deposit, or access fee derived from the principal's own information or listing. (§II.7)
- **I-34** *(new)* Dual agency requires informed written consent from every principal, recorded **before** the act, and is blocked entirely in states that prohibit it. (§II.4.3)
- **I-35** *(new)* Commission disburses only from a **recorded settlement**, to the **sponsoring brokerage**, after the §II.5.5 claim window. No chain event disburses a commission. (§II.5.5)
- **I-36** *(new — the sixth restatement of G1 §II.8.4, promoted to an invariant)* No surface, tier, export, model, or inference exposes a distress binding, a Shield state, a distress score, or anything derived from them. (§II.6.1)
- **I-37** *(new)* Match, tour, and listing-recommendation outputs carry no protected-class-correlated feature and are outcome-tested for steering. (§II.10)

---

## II.2 Onboarding — The Registration Ladder *(resolves G9-01, G9-06, G9-31)*

### II.2.1 Levels

| Level | Proves | Evidence | Unlocks |
|---|---|---|---|
| **R0** | Nothing | Email, phone | Market Reference at the k-floor, compliance template library, full sandbox |
| **R1** | A real natural person | V1 IDV (IAL2), device and phone binding | CRM for the broker's **own** contacts; **no platform-sourced data**; saved searches on the consented feed |
| **R2** | A licensed brokerage | Firm licence · **designated broker verified as an individual licensee** · E&O · W-9 · payout account · trust account where the state requires the brokerage to hold deposits · MLS/RLS participant status where the feed is used | Seats, listings, representations, data rooms, referral receipt |
| **R3** | Practice-qualified in **this** state | The **individual** licensee's active licence in the transaction's state, correct class, sponsoring affiliation verified · state agency-disclosure forms loaded · buyer-agreement template approved for the state · fair-housing attestation | Creating a representation, transmitting an instrument, receiving a compensation line |

**Licence monitoring** inherits Group 5 §II.2.6: standing re-verified on the authority's cadence and on any disciplinary event. A lapse degrades R3→R2 **prospectively** — existing representations continue so principals are not stranded mid-transaction, the designated broker is notified, and **new** representations, instruments, and compensation lines stop. A revocation blocks all four immediately and notifies every active principal, because a principal has a right to know their agent cannot lawfully act.

### II.2.2 Value at rung zero *(G9-31)*

```
R0 gets a real product: Market Reference (k-floored, §II.6.3), the full compliance
   template library, and a sandbox with synthetic data.
R1 gets the CRM for contacts the broker already has — with zero platform-sourced data,
   which is what makes it safe to give away.
LICENCE VERIFICATION is required at the FIRST LICENSED ACT, not at signup.
CONSENTED-FEED ACCESS IS NOT A TIER (§II.6.1, I-2).
```

### II.2.3 Jurisdiction capability gating *(G9-06)*

Inherits Group 2 §II.2.5's structure, extended to brokerage:

```
capability_jurisdiction_matrix(state, sub_role, capability) →
    'enabled' | 'requires_licence' | 'disabled'

Group 9 capabilities gated per state:
  dual_agency               → 'disabled' in prohibiting states (I-34)
  designated_agency         → requires an engagement_wall where recognized
  transaction_broker        → 'disabled' where the status is not recognized
  limited_service_listing   → 'disabled' in minimum-service states (G9-06)
  referral_fee_receipt      → 'requires_licence'
  rebate_to_consumer        → 'disabled' where prohibited
  team_name_marketing       → per-state naming and advertising rules

'disabled' hard-blocks at the API layer with a plain explanation and a link to the
requirement. 'requires_licence' renders only with a verified current licence.
A state with no current matrix row is treated as 'disabled' — the failure mode is
refusal to operate, never operating wrongly (the G7 rule-pack principle, inherited).
```

---

## II.3 The Directory Pane — Representation Workspaces *(resolves G9-29)*

### II.3.1 Definition

> A Group 9 **Workspace** is `(brokerage_id, representation_id)` or `(brokerage_id, listing_id)`, plus a **Brokerage** workspace for licences, supervision, disclosures, and walls, and a **Market Reference** workspace for research. Navigation, map scope, Co-Pilot context, and authorization are the same unit.

### II.3.2 Tree shape

```
DIRECTORY  (Left Pane · 250px · React Server Component · zero client hooks)
│
├─ ◈ Brokerage                              ← aggregate; no principal context
│    ├─ Licences & Affiliations  (per state, per licensee, sponsoring edge — §II.1.2)
│    ├─ Supervision              (designated broker's duty surface — §II.4.7)
│    ├─ Disclosures Register     (every disclosure, to whom, when, acknowledged — §II.4.2)
│    ├─ Walls & Conflicts        (designated agency screens — §II.4.3)
│    ├─ Compensation Agreements  (entered, never suggested — §II.5)
│    ├─ Transaction Files        (state retention duty; survives everything — §II.11.5)
│    └─ Billing
│
├─ 📚 Market Reference                       ← research; NO parcel targeting
│    ├─ Submarket Statistics     (k≥5, lagged, distributions — §II.6.3)
│    └─ Jurisdiction Rules       (agency forms, capability matrix, disclosure timing)
│
├─ 🏷 128 Maple St — Seller Representation    ← WORKSPACE  side=seller_agent
│    ├─ Listing Agreement        (term, exclusivity, protection period — §II.8.1)
│    ├─ Marketing & Syndication  (IDX/VOW modes, FH content screen — §II.8.2, §II.8.3)
│    ├─ Offers & Negotiation     (all offers presented; minimum-service duties)
│    ├─ Data Room                (NDA-gated, purpose-bound, NO fee — §II.7)
│    ├─ Studies & Reliance       (commissioned_by / reliance_grantable — §II.9)
│    └─ Compensation             (agreed with the seller, before the act — §II.5.1)
│
├─ 🔎 Chen Household — Buyer Representation   ← WORKSPACE  side=buyer_agent
│    ├─ Buyer Agreement          (stated compensation, EXECUTED BEFORE TOURING — §II.5.4)
│    ├─ Search & Tours           (consumer's stated criteria ONLY — §II.10.3)
│    ├─ Service Record           (equal-service measurement — §II.10.1)
│    └─ Offers                   (cooperating compensation negotiated bilaterally — §II.5.3)
│
├─ 🏬 Franklin Row — Landlord Representation  ← WORKSPACE  side=landlord_agent
│    └─ composes with a Group 7 listing mandate; NO Class-T reach (§II.10.5)
│
└─ ⊕ Start a representation                  ← the only growth affordance in the tree
```

**Deliberately absent from the Group 9 tree**, each corresponding to a Part I finding:

```
✗ any distress feed, distress tier, or distress-derived surface        (G9-13, I-36)
✗ any off-market owner-targeting layer or FAR-residual ranking          (G9-15)
✗ any commission default, benchmark, distribution, or comparison        (G9-08, I-31)
✗ Group 2's assignment board                                            (G9-19, G2 §II.7.4)
✗ any Group 7 applicant file, screening report, or sitting-tenant datum (G9-30, A66)
✗ any school-quality, crime, or demographic layer                       (G9-23, §II.10.2)
✗ any escrow, deposit, or fund-holding surface                          (G9-28, §III.7)
```

### II.3.3 Server-side derivation

`brokerage_manifest()` executes under the caller's RLS-scoped session in the RSC. The client never computes, filters, or reorders it. A subtab absent from the manifest is not rendered **and** its route independently rejects direct navigation. R3 gates (Marketing & Syndication, Offers, Compensation) are **manifest-level exclusions**, never disabled buttons. A workspace behind an `engagement_wall` the caller is screened from **does not appear in the tree at all** — its absence is the wall.

### II.3.4 Context isolation

Inherited from Group 1 §II.3.4: identifiers only (`{ brokerageId, representationId | listingId, side, epoch }`), never prose; the predicate is re-checked server-side with 403 returned **without invoking the model**; epoch fencing; per-workspace transcript partitioning; retrieval purged within 24h of a representation's termination.

### II.3.5 Co-Pilot constraints — a fiduciary constraint before a privacy one

```
· NO CROSS-REPRESENTATION RETRIEVAL. A buyer-side workspace can never retrieve from a
  seller-side workspace in the same firm. This is the G9-02 confidentiality breach, and
  a chatbot is the easiest way to deliver it.
· NO WALL CROSSING. Retrieval respects engagement_walls identically to RLS (§II.4.3).
· NO COMMISSION OUTPUT of any kind — no suggestion, no range, no "typical", no
  comparison, no computation from comparables (I-31).
· NO LEGAL ADVICE OR INSTRUMENT GENERATION for any account class (G4 §II.11.2, whole).
· NO LISTING COPY transmitted without the licensee's explicit authorship act (§II.8.3).
· NO NEIGHBOURHOOD CHARACTERIZATION — "safe", "family", "up-and-coming", "good schools",
  and every synonym are blocked server-side by content class, because they are steering
  in natural language (§II.10.2, I-37).
· NO CHARACTERIZATION of a consumer, and no inference of a protected characteristic.
```

---

## II.4 Agency, Disclosure & Conflicts *(resolves G9-02, G9-03, G9-04, G9-05, G9-07)*

### II.4.1 The representation is the constitutive act

No Group 9 capability renders or executes outside an active `agency_representation` or `listing` mandate. There is no "browse and contact" mode, no "pipeline" that precedes a relationship, and no code path from a map click to a transmitted instrument (the G2 §II.6.2 structural rule, inherited).

### II.4.2 Disclosure is gated at the API layer *(G9-04)*

```
BEFORE the first substantive contact with a principal:
    · the state's agency disclosure form, rendered and acknowledged into `disclosures`
      with the rendered document hash

BEFORE any act that earns compensation:
    · EVERY compensation source disclosed to EVERY principal — the transaction fee, any
      cooperating compensation, any referral fee received or paid, any affiliated
      business arrangement (G1 §II.8.3), and the platform's own subscription posture
    · an explicit statement that the consumer is free to shop elsewhere

ENFORCEMENT: routing, instrument transmission, tour scheduling, and compensation-line
creation are BLOCKED at the API layer absent a committed acknowledgement row.
`agency-disclosure-lint` fails the build on any broker-side path that can execute without
one. This is the Group 1 §II.8.3 rule, and Group 9 is the group it was written for.
```

### II.4.3 Dual agency, designated agency, and walls *(G9-02, I-34)*

```
PROHIBITING STATE   dual_agency is 'disabled' in the capability matrix. The API refuses
                    to create the representation. There is no consent override.

PERMITTING STATE    informed written consent from EVERY principal, recorded BEFORE the
                    act, in the state's prescribed form, acknowledged into `disclosures`.
                    The reduced duties are stated in plain language to each principal.

PREFERRED           DESIGNATED AGENCY with an engagement_wall:
                      · two licensees, two representations, one firm
                      · the wall is a ROW-LEVEL SCREEN, not a policy
                      · CONFIDENTIAL principal information — motivation, price floor,
                        timeline, financing posture — is unreadable across it
                      · the designated broker's supervisory read is itself screened where
                        the state requires it, and the screening is recorded
                      · Co-Pilot retrieval respects the wall identically (§II.3.5)
                      · the wall is append-only and disclosed to both principals

The G4 §II.6.1–§II.6.3 machinery — intake conflict screening, firm-wide imputation, and
an append-only `conflict_checks` record — is inherited whole and runs at every
representation intake.
```

### II.4.4 Self-dealing and undisclosed principal purchase *(G9-03)*

```
A licensee, their identity cluster (G2 §II.2.3), or any entity they control acquiring an
interest in a property they represent REQUIRES, before any offer is made:
   · written disclosure of principal status to the principal
   · the principal's recorded consent
   · an independent valuation from a rotation the licensee does not control
     (the G1 §II.6.3 #1 appraisal-floor pattern, inherited)

And for assemblage representations (§II.4.6) it is BARRED OUTRIGHT for the term of the
representation plus a cooling-off period, because the information asymmetry is total.

`self-dealing-lint` fails the build if any acquisition path can execute for an identity
cluster holding an active representation on the target property.
```

### II.4.5 Confidentiality *(G9-20, G9-32)*

The duty of confidentiality over a principal's confidential information **survives termination of the representation** in most states, indefinitely. Therefore a terminated representation transitions to `terminated` and becomes **read-only and confidentiality-preserving** — it is never deleted, never opened, and never becomes an aggregate. Confidential fields (`motivation`, `price_floor_cents`, `timeline`, `financing_posture`) are a distinct class with their own policy, unreadable outside the representation and unreadable across a wall, at any status.

### II.4.6 The assemblage representation — the Developer Pitch Hub, rebuilt *(G9-03)*

The capability survives. The posture changes completely.

```
THE BROKER IS THE OWNERS' AGENT, disclosed, or the capability does not render.

  · every owner in the cohort receives, BEFORE any pitch: the broker's compensation from
    ALL sides including the buyer's, the identity of any buyer being approached, and a
    plain-language statement of what a unified package does to their individual leverage
  · Group 1 §II.6.1 governs: NO drag-along, no cohort mechanism that binds a declining
    owner, and holdout pricing rather than holdout elimination
  · Group 1 §II.6.2 consent-gated neighbour visibility applies unchanged — the broker
    does not learn who declined
  · Group 2 §II.9.6 FOOTPRINT CONFIDENTIALITY applies to the broker: the footprint is
    workspace-scoped, watermarked, export-quota'd, and never leaves the representation
  · §II.4.4 BARS the licensee's cluster from any interest in the footprint
  · commissioned studies carry §II.9.2 attribution and reliance posture
  · every owner retains an independent-counsel offer at the platform's expense
    (G1 §II.6.3 #4), from counsel with no economic relationship to the broker or buyer
```

### II.4.7 Supervision *(G9-07)*

The Supervision subtab renders, to the designated broker only, every open representation, every missing or stale disclosure, every licence approaching expiry, every capability blocked by the jurisdiction matrix, every open complaint, and every wall in force. It exists because the designated broker carries **personal statutory liability** for the conduct of every affiliated licensee, and a platform that hides the firm's compliance posture from the person legally answerable for it is a liability it manufactures.

---

## II.5 The Compensation Architecture *(resolves G9-08 → G9-12)*

### II.5.1 Compensation is an agreement, not a computation

```
compensation_agreements(
  representation_id, payer_party, payee_brokerage_id,
  basis,              -- 'percentage' | 'flat' | 'hourly' | 'hybrid' — ENTERED, not chosen
                      --  from a platform list of customary structures
  amount_or_rate,     -- ENTERED. No default. No placeholder. No suggestion.
  cap_cents, conditions_text,
  disclosed_at, acknowledged_at,   -- both REQUIRED before the agreement is active
  agreed_at, superseded_by
)
```

Entered by the parties, before the act, disclosed and acknowledged. The platform records it and settles it. **The platform never computes what it should be.**

### II.5.2 The platform proposes no number *(I-31, G9-08, G9-12)*

```
FORBIDDEN, everywhere in the product, at every tier, in every surface:
  ✗ a default or pre-filled commission value
  ✗ placeholder text containing a number ("e.g., 5%")
  ✗ a "typical", "customary", "market", or "suggested" range
  ✗ a recently-used value, an autocomplete, or a template carrying a rate
  ✗ any distribution, percentile, median, or aggregate of commission rates
  ✗ any cross-brokerage comparison, ranking, or benchmark
  ✗ any Co-Pilot output containing a commission figure or range (§II.3.5)
  ✗ any telemetry on commission values or their adoption — collecting it would BUILD
    the aggregate this invariant forbids (§II.11.6)

The field is EMPTY, REQUIRED, and FREE-ENTRY.
`commission-benchmark-lint` fails the build on any of the above.
```

This is the Group 7 I-29 rule (no unit-level rent price or recommendation), applied to the price of brokerage services, for the identical reason and with a heavier enforcement posture because here the platform would be the proposer rather than the aggregator.

### II.5.3 Cooperating compensation is bilateral and never published *(G9-08)*

```
· NO offer of compensation renders on any shared listing surface — not the listing, not
  the search result, not the map card, not the syndicated feed, not the API. (I-31)
· Cooperating compensation is negotiated between the two brokerages, recorded on the
  TRANSACTION, and visible only to the parties to it.
· A listing carries no compensation field. The schema does not have one.
· `mls-use-lint` additionally asserts nothing resembling a compensation offer enters
  the outbound MLS/RLS payload (§II.8.2).
```

### II.5.4 Buyer agreements gate the tour *(G9-05)*

```
For a residential buyer representation:
  an executed buyer-broker agreement WITH A STATED COMPENSATION AMOUNT is required before:
      · scheduling or attending a tour or showing
      · unmasking a listing beyond the public display fields
      · transmitting an offer

Enforced at the API layer. The agreement is generated inside the G4 §II.11.1 boundary,
is terminable per its own terms, and both parties hold an executed copy with its hash.
```

### II.5.5 Settlement-only disbursement, with a claim window *(I-35, G9-09, G9-10, G9-28)*

```
                    ┌──────────────────────────────────────────────┐
  recorded closing  │  Group 4 licensed settlement. THE authority.  │
  (Group 4 / G1     │  Commission is a LINE ITEM on the statement.  │
   §II.6.3 #6)      └──────────────────┬───────────────────────────┘
                                       │
                         ┌─────────────▼─────────────┐
                         │  CLAIM WINDOW (default 5  │
                         │  business days)           │
                         └─────────────┬─────────────┘
              no competing claim  ─────┤───── competing procuring-cause claim
                                       │                      │
                    DISBURSE to the    │            HOLD the disputed portion
                    SPONSORING         │            · UNDISPUTED PORTION DISBURSES
                    BROKERAGE, via the │              IMMEDIATELY (G5 §II.6.3 pattern)
                    G1 §II.7.2 two-    │            · the hold routes to a G4 `neutral`
                    phase protocol     │              under the §II.5.3 selection
                    with the RECORDED  │              protocol, compensation fixed at
                    CLOSING as the     │              appointment, zero net platform
                    Phase-0 GATE       │              revenue from the outcome
                                       │
  NO CHAIN EVENT EVER DISBURSES A COMMISSION. `settlement-only-lint` asserts no code path
  reaches a commission disbursement from a chain event, a listing state, or a deal state.

CLAWBACK: a rescinded, reversed, or unwound closing reverses the commission line. The
claim window and any applicable rescission window are aligned so that disbursement never
precedes the point at which the transaction becomes final.
```

### II.5.6 Splits — recorded, never computed *(G9-11)*

```
THE PLATFORM SETTLES ONE LINE: gross commission → the SPONSORING BROKERAGE.

Internal splits (franchise, team, agent, desk fees, E&O deductions) are a FIRM-INTERNAL
CONTRACTUAL LEDGER. The platform may RECORD them for the firm's own bookkeeping. It never
COMPUTES them and never EXECUTES them — both would be wrong and both would be a liability.

REFERRAL FEES are payable only to a verified R2 brokerage, disclosed to the principal
under §II.4.2, and BLOCKED AT THE API LAYER to any unlicensed payee. `licensed-payee-lint`
fails the build on any disbursement path that can resolve a payee without an active
brokerage licence in the relevant state.
```

### II.5.7 What a broker never holds

No Group 9 sub-role holds the `escrow` app segment, no Group 9 surface holds funds, and no Group 9 actor determines the release of anything. This is the deliberate parallel to Group 4's `legal_arbitrator: ['legal']` — a party who holds no financial signature is given no financial surface, so the temptation and the attack surface both cease to exist.

---

## II.6 Data, Distress & Prospecting *(resolves G9-13 → G9-17)*

### II.6.1 Distress is not a product — the sixth restatement, now an invariant *(I-36)*

```
WITHDRAWN, AGAIN:  the "Distress Interception" tier, in every form and under every name.

NO surface, tier, export, model, inference, filter, sort, alert, or Co-Pilot output
exposes: an `owner_distressed` binding, a Shield-tier offer or acceptance, an internally
computed distress score, or ANY inference derived from them. There is no premium path,
no enterprise path, no partner path, and no admin-adjacent path outside the audited
break-glass. (G1 §II.8.4, promoted here to I-36 because this is the second time it has
had to be withdrawn.)

THE REPLACEMENT — and it is genuinely better:
  the consented `seeking_exit` feed, carrying Group 1 §II.5.3 IN FULL:
      · 24h hysteresis before a parcel becomes discoverable
      · 30-day tombstoning so feed diffing yields no event on narrowing
      · k≥5 floor on any geographically bounded query
      · hourly cadence quantization
  AVAILABLE AT EVERY TIER INCLUDING FREE — because a data scope may never be a paid
  feature (I-2, G9-14), and because the paywall was the mechanism by which the previous
  framing worked.

`distress-tier-lint` fails the build on any entitlement check reachable from a distress
binding, a Shield state, or a distress-derived value.
```

### II.6.2 The five lawful sources

Group 2 §II.5.1's four, unchanged, plus one Group 9 addition:

| # | Source | Constraint |
|---|---|---|
| 1 | **Consented Feed** | Group 1 parcels at `seeking_exit`; G1 §II.5.3 in full; free at every tier |
| 2 | **Public Records** | Rendered as **facts, never as a score**. No ranking, heatmap, sort-by-distress, alerting, or "opportunity" labelling |
| 3 | **My Contacts** | The brokerage's own book. Lawful-basis attestation on upload; suppression and quota still apply on contact |
| 4 | **Inbound Requests** | Owner- or consumer-initiated. Highest intent; the principal sets the terms |
| 5 | **MLS / RLS** *(new)* | Under the participant agreement, in a registered display mode, with attribution, prohibited-use enforcement, and takedown propagation (§II.8.2) |

Every layer requires a **Provenance Registry** entry (G2 §II.5.4) carrying `lawful_basis` from the controlled vocabulary — `public_record`, `licensed_commercial`, `first_party_consent`, `subscriber_owned`, and now `mls_participant_licence`. **`inferred_nonpublic` remains not a member.** A layer with no current entry does not render, enforced at the tile service.

### II.6.3 The map, and what it may not do *(G9-15)*

```
INHERITED WHOLE from G2 §II.5.3 (anti-reconstruction):
  · no layer renders finer than its aggregation unit — SERVER-SIDE at the tile service
  · query-volume anomaly detection per identity cluster; grid sampling pages security
  · export quotas per seat, per-seat watermarking, logged exports; quota exhaustion is a
    SECURITY event, never an upsell trigger

GROUP 9 ADDITIONS:
  ✗ no opportunity score, FAR-residual ranking, upzoning-likelihood, or "off-market
    potential" sort — G6 §II.9.3 requires zoning facts to render UNRANKED, and a filter
    for unused FAR is that score with a different control (G9-15)
  ✗ no school-quality, crime, or demographic layer (§II.10.2, I-37)
  ✗ no owner-identity layer, and no owner contact affordance on a `private` parcel —
    403 SOLICITATION_SUPPRESSED regardless of what the zoning envelope shows
```

### II.6.4 Solicitation, relay, and telephony *(G9-16, G9-17, I-30)*

```
INHERITED WITHOUT EXCEPTION FOR BROKERS — G1 §II.5.4 and G2 §II.6's four-stage ladder:
  consent-first contact · 3 requests per parcel per lifetime, 1 per 30 days · a decline
  is PERMANENT across the identity cluster · `no_contact` is absolute · suppression is
  evaluated on the TARGET PARCEL, never on the requester's role · an offer can never be
  the first artifact a recipient sees

THE RELAY RULE (I-30, the G9-17 fix — new, because Group 9 is the first relay):
  A broker may not transmit, on behalf of another user, any contact the target's
  suppression state would block for that user.
    · the relayed principal is DISCLOSED in every solicitation
    · the suppression check evaluates BOTH the broker's cluster AND the disclosed
      principal's cluster; either suppression blocks
    · an undisclosed relay detected after the fact is a trust-level reversion for the
      brokerage's entire identity cluster (the G2 §II.2.3 undisclosed-affiliate
      consequence, inherited)

TELEPHONY (new — a CRM that manages outbound solicitation will call and text):
  · consent records with source, timestamp, and channel, per contact
  · national and state do-not-call scrub before EVERY campaign, with a scrub freshness SLA
  · an internal do-not-call list, honored across the identity cluster and every channel
  · calling-window enforcement in the CALLED PARTY'S time zone
  · one-action revocation, honored across every channel and the whole cluster, immediately
  · per-cluster contact-velocity limits
  `dnc-lint` fails the build on any outbound path executable without a current scrub and
  a consent record.
```

### II.6.5 Client confidentiality and the book of business *(G9-20)*

The brokerage's book is the firm's asset **and** a body of information the firm owes a duty over. Therefore: confidential principal fields are a distinct policy class (§II.4.5); they are unreadable outside the representation, unreadable across a wall, and unreadable after termination by anyone other than the parties who held the duty; they never enter an aggregate, an export, a Market Reference statistic, a model feature, or a Co-Pilot index; and an affiliation change transfers representations per state law while the **outgoing** brokerage's confidentiality obligation persists and is enforced by a retained, read-only, screened record.

---

## II.7 Data Rooms — the Access Escrow Withdrawn *(resolves G9-18, G9-19)*

### II.7.1 The fee is removed

```
WITHDRAWN: the "Data Room Access Escrow" and every variant — access deposits, stakes,
           viewing fees, refundable holds, and any charge levied on a counterparty for
           access to information about the principal's asset. (I-33)

REPLACED BY — which achieves the stated goal, for free, without the fiduciary conflict:
  IDENTITY GATE      verified counterparty credential (E2 for Group 2 actors, R2 for
                     brokerages, V3 for owners)
  NDA                executed, versioned, per-room, inside the G4 §II.11.1 boundary
  PURPOSE-BOUND      the grant names its purpose and expires (G2 §II.9.4, inherited)
  WATERMARKING       per-seat, on every document and every derived view
  ACCESS LOG         every view, download, and export — VISIBLE TO THE PRINCIPAL, which
                     is the control the draft's deposit was pretending to be
  PROOF OF FUNDS     where the seller wants a financial screen, a verified attestation
                     from a verified source. A FACT, not a fee.

ZERO fee to the viewer. ZERO revenue to the agent. ZERO float anywhere.
`principal-info-fee-lint` fails the build on any charge, deposit, or hold reachable from
a data-room, listing, or document-access path.
```

### II.7.2 The principal sees who looked

The access log is a **principal-facing** surface, not an internal one. A seller sees which verified counterparties viewed their room, when, and what they took. That is a genuinely valuable product, it is the accountability the deposit was a poor proxy for, and it costs the counterparty nothing.

### II.7.3 Contents carry their origin group's rules *(G9-19)*

Enforced at **grant time**, not at upload time, because the grant is where the disclosure happens:

| Content origin | Rule enforced on grant |
|---|---|
| **Group 1** — owner documents, ledgers, access agreements | Requires the owner's explicit, revocable, purpose-bound grant. The broker holds no independent right to distribute |
| **Group 2** — deal and assignment material | The assignment board remains structurally invisible to Group 9 (G2 §II.7.4). Deal material requires deal membership |
| **Group 6** — massing, zoning, and design studies | Distribution operates strictly within `design_licences.permitted_uses`; §II.9 attribution and reliance travel with it |
| **Group 7** — rent rolls, lease schedules | **De-identified and aggregated only** (A66). Nothing about a sitting tenant. No Class-T, at any tier, ever |
| **Group 3** — financing terms | Facility-party scoped; never a marketing input |

---

## II.8 Listings, MLS Integration & Marketing Compliance *(resolves G9-05, G9-24, G9-32)*

### II.8.1 The listing agreement is an instrument

Generated inside the Group 4 §II.11.1 boundary: per-jurisdiction counsel-approved templates, versioned, with an identified approving attorney, mechanical field completion, no instrument-selection recommendation, no advisory text, and a not-legal-advice disclosure with an offer of independent counsel acknowledged into `disclosures`. It carries: term, exclusivity type, **protection period**, permitted marketing and syndication scope, service level actually delivered (§II.2.3), cancellation rights, and the compensation the seller agreed to under §II.5.1. **Both parties hold an executed copy with its hash.**

### II.8.2 MLS / RLS integration *(G9-24)*

```
PRECONDITION      verified participant or subscriber status, tied to R2 and to current
                  licensure. No status, no feed — inbound or outbound.
DISPLAY MODES     IDX and VOW are DISTINCT, separately configured, with their own
                  registration, consumer-consent, and display-field rules. A single
                  "integration" is not a display mode.
ATTRIBUTION       listing brokerage attribution and every required disclosure rendered on
                  every displayed listing, in every mode, including syndicated surfaces.
COPYRIGHT         per-asset ownership recorded (listing brokerage or photographer) with
                  an explicit licence to display and its scope. Photographs are the
                  most-litigated asset class in this business.
PROHIBITED USE    no scraping, no derivative products built on MLS content, no commingling
                  with non-MLS inventory absent disclosure. The "proprietary data" product
                  the draft proposed is barred by the participant agreement it depends on.
TAKEDOWN          delisting propagates to every surface inside the MLS's window, on a
                  monitored SLA. A stale listing is a compliance failure, not a cache miss.
NO COMPENSATION   the outbound payload carries nothing resembling an offer of cooperating
                  compensation (§II.5.3, I-31).
`mls-use-lint` enforces the payload allowlist and the prohibited-use set.
```

### II.8.3 Fair-housing content control *(G9-23)*

```
EVERY listing description, photograph caption, marketing email, ad, and syndicated
payload passes a prohibited-content screen before transmission:
    familial-status terms · "adult"/"mature" community language absent a verified
    exemption · religious references · national-origin and language preferences ·
    disability-negative or accessibility-exclusionary phrasing · steering language
    ("safe", "family neighborhood", "up-and-coming", "good schools", "the right kind of")

· a flagged item routes to human review with the specific term cited; it is never
  silently rewritten
· the equal-opportunity statement renders on every marketing surface
· NO MACHINE-GENERATED LISTING COPY IS TRANSMITTED WITHOUT THE LICENSEE'S EXPLICIT
  AUTHORSHIP ACT (the G4 §II.11.2 and G6 §II.11.3 pattern, inherited)
`steering-lint` covers the content screen and the Co-Pilot block jointly.
```

### II.8.4 Listing lifecycle *(G9-32)*

```
draft → active → { under_contract → closed
                 | withdrawn        (marketing stops; the agreement may continue)
                 | expired          (term end; protection period BEGINS)
                 | cancelled        (agreement terminated; protection period per its terms) }
          → terminated (read-only, confidentiality-preserving — §II.4.5)

· the PROTECTION PERIOD is a first-class dated object, rendered to both parties, because
  it is the most common post-termination dispute in the business
· clear-cooperation obligations: where the brokerage participates in an MLS with such a
  rule, a publicly marketed listing must be entered within the rule's window; the platform
  surfaces the clock and does not enforce the rule on the MLS's behalf
· expiry and withdrawal propagate to every syndicated surface (§II.8.2 takedown)
```

---

## II.9 Professional Studies, Attribution & Reliance *(resolves G9-25)*

### II.9.1 The Packaged Deal requirement is de-mandated

It becomes an **optional, disclosed enrichment**. The platform earns **zero** on any study it prompts for — no marketplace fee, no referral fee, no revenue share, no preferred placement — inheriting the Group 6 §II.11.1 rule that closed G6-20 (affiliate commissions steering a professional's tool choice). A platform that conditions marketplace access on spend it monetizes is steering with a financial interest, and the cost lands on the seller.

### II.9.2 Every study declares who paid and who may rely

```
professional_studies(
  study_type,            -- 'phase_i_esa' | 'massing' | 'zoning' | 'survey' | 'appraisal' …
  commissioned_by,       -- the party who engaged the professional
  for_whose_benefit,     -- the named user of the report
  reliance_grantable,    -- boolean: can a third party obtain reliance at all?
  reliance_letters[],    -- FIRST-CLASS objects, per relying party
  component_expiries jsonb,  -- per-component shelf life
  professional_id,       -- the Group 6 licensee or the environmental professional
  standard_ref           -- the standard the work was performed to
)
```

**A study whose reliance is not grantable to the viewer renders with an explicit non-reliance banner and cannot be represented as buyer diligence anywhere in the product.** `reliance-lint` fails the build on any surface that presents a study as diligence without an evaluated reliance posture.

This is the Group 6 §II.7 BoQ-attribution pattern (`machine_extracted` cannot size a facility) applied to a different artifact class, for the identical reason: an unattributed technical document wired into a consequential decision transfers liability to whoever the reader assumes prepared it for them.

### II.9.3 Phase I ESA specifics — the liability instrument

```
· performed by an Environmental Professional to the applicable standard, recorded
· USER-SPECIFIC: prepared FOR a named user. A buyer who did not commission it generally
  CANNOT rely on it without a RELIANCE LETTER from the professional (§II.9.2)
· COMPONENT SHELF LIVES tracked and rendered — a substantial portion expires within
  180 days, the whole within a year, and a stale report does not support the defence
· a seller's-broker-commissioned Phase I renders, by default, with:
      "Commissioned by the seller. Not prepared for your reliance. Obtain your own
       assessment or request a reliance letter."
· A RECOGNIZED ENVIRONMENTAL CONDITION triggers a SELLER DISCLOSURE-OBLIGATION prompt
  routed to Group 4, acknowledged, and recorded — inheriting G6 §II.9.6 (geotechnical
  findings as material facts) unchanged
```

### II.9.4 Massing and zoning studies

Group 6 §II.8.2's licence terms and §II.7's attribution travel with every study. **An unsealed or machine-derived study cannot support a marketing claim about achievable FAR, buildable area, or unit count** — the G6 I-20 rule (a `machine_extracted` BoQ may not size a facility) applied to the marketing surface, which is where a buyer actually relies on it.

---

## II.10 Fair Housing, Service Equality & the Matching Engine *(resolves G9-23, G9-30, I-37)*

### II.10.1 The equal-service record

```
Service events are recorded per representation: tours offered and delivered, listings
shown, response latency, follow-up contacts, offers presented, and referrals made.

Continuous outcome testing by geography and proxy, per licensee and per brokerage,
against the brokerage's own baseline and the population — the Group 7 §II.4.4 machinery,
applied to SERVICE rather than admission.

Drift beyond tolerance raises a SUPERVISORY signal to the designated broker and to Group 8.
It is never a public rating, never a ranking, and never a marketing surface.
```

### II.10.2 Withdrawn layers and blocked language *(G9-23)*

```
WITHDRAWN as steering surfaces: school ratings and school-district scoring · crime data
and "safety" scores · demographic overlays · "neighborhood quality", "desirability", or
"lifestyle" indices · any composite that ranks areas.

REPLACED BY: factual, user-requested, UNRANKED amenity data — transit distance, commute
time to a user-supplied address, parcel and building facts, and links to the authoritative
public sources for anything else.

BLOCKED IN LANGUAGE, server-side by content class, in listing copy and Co-Pilot output
alike: the §II.8.3 term set, in every synonym and paraphrase (§II.3.5, §II.8.3).
```

### II.10.3 Recommendation constraints *(I-37)*

```
· match and tour outputs are filtered on THE CONSUMER'S OWN STATED CRITERIA ONLY
· no learned preference model over features correlated with a protected characteristic;
  `proxy-lint` (inherited from G7) covers zip code, surname, national origin, familial
  status, disability, language, and their derived features
· a model may NARROW on stated criteria. A model may never SUGGEST a geography the
  consumer did not ask for, and never RANK areas
· outcome distributions of what was shown, per licensee, tested continuously (§II.10.1)
· the consumer sees why each result matched — their own criteria, restated
```

### II.10.4 Advertising

Housing-ad audience targeting is restricted to a permitted-category set; **no lookalike or similar-audience products**, whose training data reproduces historical segregation by construction; no exclusion targeting on any protected-correlated dimension; all copy through the §II.8.3 screen; and every ad carries the equal-opportunity statement.

### II.10.5 The Group 7 boundary *(G9-30)*

```
`broker_leasing` participates through an owner-granted `listing` mandate or a Group 7
`management_engagement` facet with `lease` scope only (G7 §II.13.4, A69).

REACHES:  unit availability, lease terms offered, marketing content, tour scheduling,
          building common-element facts
NEVER REACHES: any applicant's screening report, income attestation, bank-derived datum,
          government ID, household composition, or any Class-T element; any datum about
          a SITTING tenant; any occupancy pattern or entry record
          (G7 §II.11.1 Class-T, A66 — enforced by policy, not by convention)
```

---

## II.11 Monetization *(resolves G9-04, G9-14, G9-21, G9-22)*

### II.11.1 What is withdrawn, and by whom

| Draft mechanism | Status | Struck by |
|---|---|---|
| *"Distress Interception"* premium tier | **Withdrawn (second time)** — now I-36 | G1 §II.8.4, by name |
| HELOC referral bounty | **Deleted (second time)** — now I-32 | G1 §II.8.3, by name; RESPA §8(a)/(b) |
| Closing-contingent `$SHQL` micro-transaction fee | **Withdrawn** — now §II.11.3 | G1 §II.8.3 Broker row; G4 §II.12.2 pattern |
| Data Room Access Escrow | **Withdrawn** — now I-33 | G4 §II.7.3 (escrow holder determines nothing); fiduciary self-dealing |
| Subscription-for-data-scope | **Withdrawn** — I-2 | G1 §II.8.1; G2 §II.1.3 (G2-09) |

**Four of the draft's five revenue mechanisms are removed.** The fifth — a subscription — survives with its structure corrected. That is the finding, not a side effect of it.

### II.11.2 What replaces them

**A flat, transaction-independent subscription paid by the brokerage** — which is exactly what Group 1 §II.8.3's Broker row specified before this draft was written.

| Tier | Price | Entitlement key | Unlocks (**features only**) |
|---|---|---|---|
| **Solo** | $/seat/mo | `ent.brokerage_solo` | Representations, listings, disclosures register, compliance templates, transaction file |
| **Firm** | $$/seat/mo | `ent.brokerage_firm` | Seats, walls, supervision surface, CRM automation depth, fair-housing outcome reporting |
| **Enterprise** | negotiated | `ent.brokerage_enterprise` | API, multi-office consolidation, custom jurisdiction packs, audit export |

**The compliance product is the product.** The disclosure register, the buyer-agreement lifecycle, the agency-disclosure timing record, the fair-housing service testing, the supervision surface, and a transaction file that survives a state audit are what post-settlement brokerages have an acute and unmet need to buy. It is defensible, it is worth a flat fee forever, and no consumer has to be harmed for it to earn.

An entitlement may gate whether a **feature renders**. It may never gate whether a **row is readable** (I-2). Consented-feed access, Market Reference at the k-floor, and the compliance template library are available at **every tier including free**.

### II.11.3 Zero net platform revenue from a transaction outcome

```
No fee rises with: a closing · a commission amount · a sale price · a lease execution ·
a referral · a loan · a title order · a consumer's decision to transact.

This is the third application of the G4 §II.12.2 rule (zero net revenue from dispute
outcomes) and the G7 §II.13.3 rule (revenue flat with respect to tenant distress). The
reason is the same each time: a platform with a stake in the outcome cannot be trusted
with the surfaces that shape it — here, the match engine, the disclosure gate, the
compensation record, and the commission claim window.

`settlement-revenue-lint` fails the build on any revenue path reachable from a closing,
settlement, commission, referral, loan-origination, or lease-execution event.
```

### II.11.4 Fee matrix — Group 9's row, restated and extended

Extends Group 1 §II.8.3:

| Counterparty | Permitted | Forbidden | Rationale |
|---|---|---|---|
| **Brokerage (Group 9)** | Flat, transaction-independent, per-seat subscription paid by the firm | Any % of commission; any fee contingent on a closing, a referral, or a consumer transacting; any fee taken at settlement | G1 §II.8.3; RESPA §8; §II.11.3 |
| **Lender (Group 3)** | Nothing to Group 9, in any structure | **Any referral bounty, any % of loan amount, any consummation-contingent payment** | I-32; RESPA §8(a)/(b) |
| **Consumer** | Nothing | Any platform fee for access to a listing, a data room, a document, a disclosure, or a dispute | I-33 |
| **Group 6 professional** | Existing marketplace fee where the professional is engaged independently | **Any fee on a study the platform prompted for** (§II.9.1) | G6-20 pattern |
| **Referring brokerage** | A disclosed referral fee, brokerage-to-brokerage | Payment to any unlicensed payee | §II.5.6 |

**Every routing event carrying platform compensation renders the Group 1 §II.8.3 Affiliated Business Arrangement disclosure, acknowledged into `disclosures`, and is blocked at the API layer without it** (§II.4.2).

### II.11.5 Obligation Lock

Extends Group 1 §II.8.5. A brokerage subscription lapse withholds **net-new origination only**: new representations, new listings, new campaigns, new analytics. It never touches:

```
· a live representation or the duties owed under it
· any principal's access to their own agreement, disclosures, or transaction record
· the disclosure register or the conflict-screening record
· a commission line already earned and pending settlement
· any TRANSACTION FILE under a state retention duty — commonly 3–7 years, and the
  designated broker is personally answerable for its production on examination
· any open Group 4 matter or commission claim
```

### II.11.6 Deliberately not collected

Extending the Group 1 §II.8.4, Group 2 §II.5.3, Group 6 §IV.4, and Group 7 §II.11.5 lists:

```
✗ any commission value telemetry, adoption rate, or distribution — collecting it would
  BUILD the cross-brokerage aggregate that I-31 forbids
✗ any distress binding, Shield state, distress score, or derived inference (I-36)
✗ any parcel-level opportunity, FAR-residual, or off-market-potential score
✗ any protected-class inference, lookalike audience, or neighborhood-desirability index
✗ any cross-brokerage comparison of client outcomes, conversion, or pipeline
✗ any Group 7 Class-T datum, at any aggregation
```

---

## II.12 Degraded Operation

| Failure | Designed behaviour |
|---|---|
| **MLS/RLS feed unavailable** | Listings already displayed carry a `stale_since` marker; **no new outbound push** and no display of data the participant agreement requires to be current. Takedown obligations are honored from the last known state; the failure mode is showing less, never showing stale. |
| **A licence lapses mid-representation** | R3→R2 prospectively (§II.2.1). The representation continues so the principal is not stranded; new instruments, new representations, and compensation lines stop; **the principal and the designated broker are both notified**, because a principal has a right to know. |
| **A brokerage dissolves mid-listing** | Representations and listing agreements are the principal's contracts, not the platform's. The principal is notified, the transaction file is preserved under the retention duty, and re-engagement with a successor brokerage is a one-action flow. No commission line is voided by the dissolution; it settles to the estate under §II.5.5. |
| **A settlement fails after the commission was agreed** | No disbursement has occurred — §II.5.5 gates on the **recorded** closing. The line reverts to unearned. Nothing to claw back, which is the point of the ordering. |
| **A competing procuring-cause claim arrives inside the window** | The undisputed portion disburses; the disputed portion holds and routes to a Group 4 neutral. Neither broker's whole fee is hostage (§II.5.5). |
| **An affiliation change mid-transaction** | Representations transfer per the state's rule; the outgoing brokerage retains a **read-only, screened** record under its surviving confidentiality duty (§II.6.5); the principal is notified and consents where the state requires it. |
| **A disclosure is discovered missing after an act** | The act is recorded as non-compliant on the Supervision surface, the disclosure is delivered immediately with an acknowledgement of the gap, and the compensation line is flagged — because in several states a missing agency disclosure affects the right to a fee, and the designated broker must see it before the closing rather than after the complaint. |
| **A jurisdiction capability row is missing or stale** | The capability is treated as `disabled` (§II.2.3). Refusal to operate, never operating wrongly. |

---
# PART III — IMPLEMENTATION SPECIFICATION

## III.1 Schema Additions

Target migration files, sequenced after the Group 7 set (`0043`–`0047`):

- `0048_group9_taxonomy_and_brokerages.sql` — **includes the enum expansion that reconciles the corpus to a defined 27 (G9-26)**
- `0049_group9_representations.sql`
- `0050_group9_listings_compensation.sql`
- `0051_group9_datarooms_studies.sql`
- `0052_group9_rls.sql`

### III.1.1 `0048_group9_taxonomy_and_brokerages.sql`

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- G9-26: the three broker keys exist in no enum today. Group 4's 0027 added
-- legal_arbitrator and contractor_logistics and COULD NOT have added these,
-- because no document specified them. This migration closes the arithmetic:
--   22 (Phase 8) + 3 (here) + legal_arbitrator + contractor_logistics = 27
-- ═══════════════════════════════════════════════════════════════════════════
alter type user_role add value if not exists 'broker_commercial';
alter type user_role add value if not exists 'broker_residential';
alter type user_role add value if not exists 'broker_leasing';

-- ROLE_GROUP_MAP delta. The string exists for coarse nav routing ONLY and is
-- barred from every Group 9 row-access predicate by I-1 (§III.3).
create or replace function public.current_user_role_group()
returns text language sql stable security definer set search_path = public as $$
  select case (select role::text from users where id = auth.uid())
    when 'broker_commercial'  then 'broker'
    when 'broker_residential' then 'broker'
    when 'broker_leasing'     then 'broker'
    -- … all prior mappings preserved verbatim from 0027 …
    else current_user_role_group_prior()
  end;
$$;

create type registration_level as enum ('R0','R1','R2','R3');
create type licence_class      as enum ('broker','associate_broker','salesperson');
create type broker_seat_role   as enum
  ('designated_broker','managing_broker','team_lead','agent','unlicensed_admin');

create table brokerages (
  id            uuid primary key default gen_random_uuid(),
  legal_name    text not null,
  level         registration_level not null default 'R0',
  firm_licence_state text,
  firm_licence_number text,
  created_at    timestamptz not null default now()
);

-- G9-01 / §II.1.2: the licence belongs to a PERSON. The commission belongs to the FIRM.
create table licensees (
  id            uuid primary key default gen_random_uuid(),
  brokerage_id  uuid not null references brokerages(id) on delete restrict,
  user_id       uuid not null references users(id) on delete cascade,
  identity_hash text not null,                   -- G2 §II.2.3 cluster
  class         licence_class not null,
  status        text not null default 'active' check (status in ('active','inactive','terminated')),
  affiliated_at timestamptz not null default now(),
  unique (brokerage_id, user_id)
);
create index lic_identity on licensees (identity_hash);

create table broker_licences (
  id                 uuid primary key default gen_random_uuid(),
  licensee_id        uuid not null references licensees(id) on delete cascade,
  state              text not null,
  class              licence_class not null,
  licence_number     text not null,
  standing           text not null check (standing in ('active','inactive','suspended','revoked')),
  issued_on          date not null,
  expires_on         date not null,
  -- a salesperson CANNOT practise except through a sponsoring broker (§II.1.2)
  sponsoring_brokerage_id uuid references brokerages(id),
  disciplinary_flags jsonb not null default '[]',
  verified_at        timestamptz not null,
  reverify_due       timestamptz not null,
  unique (licensee_id, state, licence_number)
);
alter table broker_licences add constraint salesperson_requires_sponsor
  check (class <> 'salesperson' or sponsoring_brokerage_id is not null);

create table broker_eo (
  id             uuid primary key default gen_random_uuid(),
  brokerage_id   uuid not null references brokerages(id) on delete cascade,
  carrier_name   text not null,
  policy_number  text not null,
  per_claim_cents bigint not null,
  aggregate_cents bigint not null,
  effective_on   date not null,
  expires_on     date not null,
  unique (brokerage_id, policy_number)
);

create table broker_seats (
  id            uuid primary key default gen_random_uuid(),
  brokerage_id  uuid not null references brokerages(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  seat_role     broker_seat_role not null,
  team_ref      text,
  status        text not null default 'active' check (status in ('active','suspended','revoked')),
  unique (brokerage_id, user_id)
);
create index bs_user on broker_seats (user_id, status);

-- G9-06 / §II.2.3: per-state capability gating. A missing row is treated as 'disabled'.
create table broker_capability_matrix (
  id          uuid primary key default gen_random_uuid(),
  state       text not null,
  sub_role    text not null,
  capability  text not null,
  posture     text not null check (posture in ('enabled','requires_licence','disabled')),
  note        text,
  reviewed_at timestamptz not null,
  review_expires_at timestamptz not null,
  unique (state, sub_role, capability)
);

-- G9-24 / §II.8.2: MLS participant status is a PRECONDITION of the feed.
create table mls_participations (
  id             uuid primary key default gen_random_uuid(),
  brokerage_id   uuid not null references brokerages(id) on delete cascade,
  mls_ref        text not null,
  participant_id text not null,
  display_modes  text[] not null default '{}',   -- {'idx','vom'} — distinct rulesets
  agreement_hash text not null,
  status         text not null check (status in ('active','suspended','terminated')),
  takedown_window_minutes int not null,
  verified_at    timestamptz not null,
  unique (brokerage_id, mls_ref)
);

create trigger brokerages_no_billing before insert or update or delete on brokerages
  for each row execute function assert_not_billing_actor();
create trigger licensees_no_billing before insert or update or delete on licensees
  for each row execute function assert_not_billing_actor();
revoke all on brokerages, licensees, broker_licences, broker_seats from billing_writer;
```

### III.1.2 `0049_group9_representations.sql`

```sql
create type agency_side as enum
  ('seller_agent','buyer_agent','landlord_agent','tenant_agent',
   'designated_agent','dual_agent','transaction_broker','referral_only');
create type representation_status as enum
  ('pending_disclosure','active','suspended','terminated','expired');

-- THE Group 9 authorization primitive (§II.1)
-- NOTE: deliberately NOT named `representations` — Group 4 §III.1 already owns that
-- table for the attorney-client edge. Two professions, two duties, two tables.
create table agency_representations (
  id                 uuid primary key default gen_random_uuid(),
  brokerage_id       uuid not null references brokerages(id) on delete restrict,
  licensee_id        uuid not null references licensees(id) on delete restrict,
  principal_user_id  uuid not null references users(id) on delete restrict,
  side               agency_side not null,
  state              text not null,                     -- the TRANSACTION's state
  property_id        uuid references properties(id),
  unit_id            uuid references units(id),
  scope              text[] not null default '{}',
  status             representation_status not null default 'pending_disclosure',
  -- §II.4.2: nothing substantive happens before this is set.
  agency_disclosed_at    timestamptz,
  agency_disclosure_hash text,
  -- I-34: dual agency needs consent from EVERY principal, recorded BEFORE the act.
  dual_consent_ids   uuid[] not null default '{}',
  engagement_wall_id uuid,
  term_start         date not null,
  term_end           date,
  terminated_at      timestamptz,
  created_at         timestamptz not null default now()
);
create index ar_lookup on agency_representations (licensee_id, status);
create index ar_principal on agency_representations (principal_user_id, status);

-- I-34 at the schema layer: a dual-agency row without recorded consent is not persistable.
alter table agency_representations add constraint dual_requires_consent
  check (side <> 'dual_agent' or cardinality(dual_consent_ids) >= 2);
-- §II.4.3: designated agency requires a wall, structurally.
alter table agency_representations add constraint designated_requires_wall
  check (side <> 'designated_agent' or engagement_wall_id is not null);
-- §II.4.2: `active` is unreachable without a delivered agency disclosure.
alter table agency_representations add constraint active_requires_disclosure
  check (status <> 'active' or (agency_disclosed_at is not null and agency_disclosure_hash is not null));

-- §II.4.5: confidential principal information — a DISTINCT policy class, unreadable
-- across a wall and after termination by anyone but the parties who held the duty.
create table representation_confidences (
  id                uuid primary key default gen_random_uuid(),
  representation_id uuid not null references agency_representations(id) on delete cascade,
  motivation        text,
  price_floor_cents bigint,
  price_ceiling_cents bigint,
  timeline          text,
  financing_posture text,
  updated_at        timestamptz not null default now(),
  unique (representation_id)
);

-- §II.4.3: the wall is a ROW-LEVEL SCREEN. G4 §II.6.2 pattern, inherited.
create table engagement_walls (
  id            uuid primary key default gen_random_uuid(),
  brokerage_id  uuid not null references brokerages(id) on delete cascade,
  label         text not null,
  created_at    timestamptz not null default now(),
  disclosed_to  uuid[] not null default '{}'          -- both principals
);
create table engagement_wall_members (
  id        uuid primary key default gen_random_uuid(),
  wall_id   uuid not null references engagement_walls(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  screened_from_wall_id uuid references engagement_walls(id),
  unique (wall_id, user_id)
);
alter table agency_representations
  add constraint ar_wall_fk foreign key (engagement_wall_id) references engagement_walls(id);

-- G4 §II.6.1, inherited: append-only conflict screening at every intake.
create table broker_conflict_checks (
  id                uuid primary key default gen_random_uuid(),
  brokerage_id      uuid not null references brokerages(id) on delete cascade,
  representation_id uuid references agency_representations(id) on delete set null,
  screened_at       timestamptz not null default now(),
  result            text not null check (result in ('clear','wall_required','blocked')),
  detail            jsonb not null default '{}'
);
create rule bcc_no_update as on update to broker_conflict_checks do instead nothing;
create rule bcc_no_delete as on delete to broker_conflict_checks do instead nothing;

-- G9-17 / I-30: a relayed solicitation discloses its principal, and BOTH clusters are
-- checked against the target's suppression state.
create table solicitation_relays (
  id                   uuid primary key default gen_random_uuid(),
  brokerage_id         uuid not null references brokerages(id) on delete cascade,
  target_property_id   uuid not null references properties(id),
  on_behalf_of_user_id uuid not null references users(id),
  disclosed            boolean not null default true,
  created_at           timestamptz not null default now()
);
alter table solicitation_relays add constraint relay_must_disclose check (disclosed);

-- §II.6.4: telephony consent and suppression, honored across the identity cluster.
create table contact_consents (
  id            uuid primary key default gen_random_uuid(),
  brokerage_id  uuid not null references brokerages(id) on delete cascade,
  contact_hash  text not null,
  channel       text not null check (channel in ('voice','sms','email')),
  consent_source text not null,
  consented_at  timestamptz not null,
  revoked_at    timestamptz,
  unique (brokerage_id, contact_hash, channel)
);
create table dnc_scrubs (
  id            uuid primary key default gen_random_uuid(),
  brokerage_id  uuid not null references brokerages(id) on delete cascade,
  campaign_ref  uuid not null,
  scrubbed_at   timestamptz not null default now(),
  registry_refs text[] not null,
  unique (campaign_ref)
);
```

### III.1.3 `0050_group9_listings_compensation.sql`

```sql
create type listing_state as enum
  ('draft','active','under_contract','closed','withdrawn','expired','cancelled','terminated');
create type exclusivity_type as enum
  ('exclusive_right_to_sell','exclusive_agency','open','limited_service');
create type compensation_basis as enum ('percentage','flat','hourly','hybrid');

create table listings (
  id                 uuid primary key default gen_random_uuid(),
  brokerage_id       uuid not null references brokerages(id) on delete restrict,
  representation_id  uuid not null references agency_representations(id) on delete restrict,
  property_id        uuid references properties(id),
  unit_id            uuid references units(id),
  state              listing_state not null default 'draft',
  exclusivity        exclusivity_type not null,
  term_start         date not null,
  term_end           date not null,
  -- G9-32: the most common post-termination dispute in the business.
  protection_period_days int not null default 0,
  protection_expires_on  date,
  service_level      jsonb not null default '{}',   -- what is ACTUALLY delivered (§II.2.3)
  listing_agreement_hash text not null,
  created_at         timestamptz not null default now()
  -- DELIBERATELY ABSENT: any compensation, cooperating-compensation, or offer-of-
  -- compensation column. I-31 / §II.5.3 — the schema has no field for it, which is
  -- the strongest available form of "it never renders on a shared listing surface".
);
create index listings_state on listings (state, term_end);

create table listing_marketing_assets (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  asset_type    text not null check (asset_type in ('photo','video','floorplan','copy')),
  storage_ref   text not null,
  -- G9-24: photographs are the most-litigated asset class in this business.
  copyright_owner text not null,
  display_licence_scope text not null,
  -- G9-23 / §II.8.3: nothing transmits without passing the screen.
  fh_screen_status text not null default 'pending'
    check (fh_screen_status in ('pending','passed','flagged','human_cleared')),
  fh_flagged_terms text[],
  -- machine-generated copy requires an explicit human authorship act
  machine_generated boolean not null default false,
  authored_by   uuid references users(id),
  authored_at   timestamptz
);
alter table listing_marketing_assets add constraint machine_copy_needs_authorship
  check (not machine_generated or (authored_by is not null and authored_at is not null));

create table listing_syndications (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references listings(id) on delete cascade,
  mls_participation_id uuid not null references mls_participations(id),
  display_mode   text not null check (display_mode in ('idx','vow')),
  pushed_at      timestamptz,
  takedown_due_at timestamptz,
  taken_down_at  timestamptz,
  attribution_rendered boolean not null default false
);

-- §II.5.1: compensation is an AGREEMENT. Entered, disclosed, acknowledged, then active.
create table compensation_agreements (
  id                 uuid primary key default gen_random_uuid(),
  representation_id  uuid not null references agency_representations(id) on delete restrict,
  payer_party_id     uuid not null references users(id),
  payee_brokerage_id uuid not null references brokerages(id),
  basis              compensation_basis not null,
  amount_or_rate     numeric not null,          -- ENTERED. No default anywhere upstream.
  cap_cents          bigint,
  conditions_text    text,
  disclosed_at       timestamptz not null,
  acknowledged_at    timestamptz not null,
  agreed_at          timestamptz not null default now(),
  superseded_by      uuid references compensation_agreements(id)
);
-- §II.4.2: disclosure and acknowledgement PRECEDE agreement. Not persistable otherwise.
alter table compensation_agreements add constraint comp_disclosure_precedes
  check (disclosed_at <= acknowledged_at and acknowledged_at <= agreed_at);

-- §II.5.5: the commission line. Gated on a RECORDED settlement, never a chain event.
create table commission_lines (
  id                 uuid primary key default gen_random_uuid(),
  compensation_agreement_id uuid not null references compensation_agreements(id),
  settlement_id      uuid not null,             -- Group 4 recorded settlement
  recorded_closing_at timestamptz not null,     -- I-35: the gate
  payee_brokerage_id uuid not null references brokerages(id),
  usd_cents          bigint not null,
  claim_window_ends_at timestamptz not null,
  disbursed_at       timestamptz,
  escrow_intent_id   uuid,                      -- G1 §II.7.2, Phase 0 gated on the above
  reversed_at        timestamptz,
  reversal_reason    text
);
alter table commission_lines add constraint claim_window_after_closing
  check (claim_window_ends_at > recorded_closing_at);
alter table commission_lines add constraint no_disburse_before_window
  check (disbursed_at is null or disbursed_at >= claim_window_ends_at);

-- G9-10: procuring cause has a representation in the model.
create table commission_claims (
  id                 uuid primary key default gen_random_uuid(),
  commission_line_id uuid not null references commission_lines(id) on delete cascade,
  claimant_brokerage_id uuid not null references brokerages(id),
  basis              text not null,
  filed_at           timestamptz not null default now(),
  disputed_cents     bigint not null,
  matter_id          uuid,                      -- routed to a Group 4 neutral
  resolved_at        timestamptz,
  resolution         text
);

-- §II.5.6: internal splits are RECORDED for the firm's bookkeeping. Never computed,
-- never executed. No FK to any disbursement path exists, by design.
create table internal_split_records (
  id                 uuid primary key default gen_random_uuid(),
  commission_line_id uuid not null references commission_lines(id) on delete cascade,
  recorded_by        uuid not null references users(id),
  split_detail       jsonb not null,
  recorded_at        timestamptz not null default now()
);
```

### III.1.4 `0051_group9_datarooms_studies.sql`

```sql
create type study_type as enum
  ('phase_i_esa','phase_ii_esa','massing','zoning','survey','appraisal','structural','other');

create table broker_data_rooms (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listings(id) on delete cascade,
  created_by        uuid not null references users(id),
  nda_template_hash text not null,
  created_at        timestamptz not null default now()
  -- I-33 / §II.7.1: DELIBERATELY ABSENT — deposit_cents, stake_cents, access_fee_cents,
  -- and every variant. The access-escrow product is withdrawn, and the schema has no
  -- column that could carry it. `principal-info-fee-lint` asserts none is ever added.
);

create table data_room_grants (
  id            uuid primary key default gen_random_uuid(),
  data_room_id  uuid not null references broker_data_rooms(id) on delete cascade,
  grantee_user_id uuid not null references users(id) on delete cascade,
  purpose       text not null,                  -- G2 §II.9.4: purpose-bound
  nda_signed_at timestamptz not null,
  nda_hash      text not null,
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  watermark_seed text not null
);

-- §II.7.2: the access log is a PRINCIPAL-FACING surface.
create table data_room_access_log (
  id           uuid primary key default gen_random_uuid(),
  grant_id     uuid not null references data_room_grants(id) on delete cascade,
  document_ref uuid not null,
  action       text not null check (action in ('view','download','export','print')),
  occurred_at  timestamptz not null default now()
);
create rule drl_no_update as on update to data_room_access_log do instead nothing;
create rule drl_no_delete as on delete to data_room_access_log do instead nothing;

-- §II.9.2: who paid, who may rely, and for how long.
create table professional_studies (
  id                 uuid primary key default gen_random_uuid(),
  listing_id         uuid references listings(id) on delete set null,
  property_id        uuid references properties(id),
  study_type         study_type not null,
  commissioned_by    uuid not null references users(id),
  for_whose_benefit  uuid not null references users(id),
  reliance_grantable boolean not null,
  professional_ref   uuid,                      -- Group 6 licensee or environmental pro
  standard_ref       text not null,
  performed_at       date not null,
  component_expiries jsonb not null default '{}',
  document_ref       uuid not null,
  -- G9-25 / §II.9.3: a REC finding is a material fact with a disclosure consequence.
  adverse_finding    boolean not null default false,
  disclosure_matter_id uuid                     -- routed to Group 4 when adverse
);
alter table professional_studies add constraint adverse_routes_to_disclosure
  check (not adverse_finding or disclosure_matter_id is not null);

create table study_reliance_letters (
  id            uuid primary key default gen_random_uuid(),
  study_id      uuid not null references professional_studies(id) on delete cascade,
  relying_party_id uuid not null references users(id),
  issued_by     uuid not null references users(id),
  issued_at     timestamptz not null default now(),
  document_hash text not null,
  unique (study_id, relying_party_id)
);

-- §II.10.1: the equal-service record.
create table service_events (
  id                uuid primary key default gen_random_uuid(),
  representation_id uuid not null references agency_representations(id) on delete cascade,
  event_type        text not null,   -- tour_offered / tour_delivered / listing_shown /
                                     -- offer_presented / follow_up / referral_made
  geography_ref     text,            -- census-tract or coarser; NEVER a parcel
  occurred_at       timestamptz not null default now(),
  latency_seconds   int
);
create index se_rep on service_events (representation_id, occurred_at);
```

## III.2 RLS Helper Functions

```sql
-- ── The Group 9 authorization predicate (Invariant I-1) ────────────────────
create or replace function public.is_representation_party(
  p_rep uuid, p_facet text default null, p_side agency_side default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from agency_representations r
      left join licensees l on l.id = r.licensee_id
      left join broker_seats s on s.brokerage_id = r.brokerage_id
                             and s.user_id = auth.uid() and s.status = 'active'
     where r.id = p_rep
       and r.status in ('active','suspended','terminated')
       and ( r.principal_user_id = auth.uid()            -- the principal, always
             or l.user_id = auth.uid()                   -- the licensee of record
             or ( s.id is not null                       -- a firm seat, wall-screened
                  and s.seat_role in ('designated_broker','managing_broker','team_lead')
                  and not wall_screens(auth.uid(), r.engagement_wall_id) ) )
       and (p_facet is null or p_facet = any(r.scope) or r.principal_user_id = auth.uid())
       and (p_side  is null or r.side = p_side)
  );
$$;

-- ── §II.4.3: the wall is a ROW-LEVEL SCREEN, not a policy ──────────────────
create or replace function public.wall_screens(p_user uuid, p_wall uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_wall is not null and exists (
    select 1 from engagement_wall_members m
     where m.user_id = p_user and m.screened_from_wall_id = p_wall
  );
$$;

-- ── The listing mandate predicate ──────────────────────────────────────────
create or replace function public.has_listing_mandate(
  p_listing uuid, p_facet text default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from listings li
      join agency_representations r on r.id = li.representation_id
     where li.id = p_listing
       and li.state <> 'terminated'
       and is_representation_party(r.id, p_facet)
  );
$$;

-- ── I-34 + §II.4.2: an act may not precede its disclosure ──────────────────
create or replace function public.may_act_on_representation(p_rep uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from agency_representations r
      join licensees l   on l.id = r.licensee_id and l.user_id = auth.uid()
                        and l.status = 'active'
      join broker_licences bl on bl.licensee_id = l.id
     where r.id = p_rep
       and r.status = 'active'
       and r.agency_disclosed_at is not null            -- §II.4.2
       and bl.state = r.state                           -- the TRANSACTION's state
       and bl.standing = 'active' and bl.expires_on > current_date
       and (bl.class <> 'salesperson' or bl.sponsoring_brokerage_id = r.brokerage_id)
       and (r.side <> 'dual_agent'
            or capability_posture(r.state, 'dual_agency') <> 'disabled')  -- I-34
  );
$$;

-- ── §II.2.3: a missing capability row is 'disabled'. Refusal, never guessing. ──
create or replace function public.capability_posture(p_state text, p_capability text)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select posture from broker_capability_matrix m
      where m.state = p_state and m.capability = p_capability
        and m.review_expires_at > now()
      limit 1),
    'disabled');
$$;

-- ── I-35: a commission line is disbursable only from a recorded settlement ──
create or replace function public.commission_disbursable(p_line uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from commission_lines cl
     where cl.id = p_line
       and cl.recorded_closing_at is not null
       and cl.claim_window_ends_at <= now()
       and cl.reversed_at is null
       and cl.disbursed_at is null
       -- the payee must be a LICENSED BROKERAGE in the transaction's state (§II.5.6)
       and exists (select 1 from brokerages b
                    join licensees li on li.brokerage_id = b.id
                    join broker_licences bl on bl.licensee_id = li.id
                   where b.id = cl.payee_brokerage_id
                     and bl.standing = 'active' and bl.expires_on > current_date)
       -- and no unresolved competing claim (§II.5.5)
       and not exists (select 1 from commission_claims c
                        where c.commission_line_id = cl.id and c.resolved_at is null)
  );
$$;
```

## III.3 Group 9 RLS Policies — `0052_group9_rls.sql`

```sql
-- documents: representation or listing mandate, NEVER the broker group string (G9-27) --
drop policy if exists "documents_privilege_scoped_v4" on documents;
create policy "documents_privilege_scoped_v5" on documents for select
  using (
    case when documents.privilege_class = 'none' then (
      documents.uploaded_by = auth.uid()
      or has_property_capacity(documents.property_id, null, 'V2')
      or exists (select 1 from deals d where d.primary_property_id = documents.property_id
                  and is_deal_member(d.id, 'documents'))
      or exists (select 1 from facilities f where f.id = documents.facility_id
                  and is_facility_party(f.id, 'documents'))
      or (documents.matter_id is not null and is_matter_party(documents.matter_id, 'documents'))
      or exists (select 1 from work_packages w where w.id = documents.work_package_id
                  and is_work_package_party(w.id, 'documents'))
      or exists (select 1 from design_packages dp where dp.id = documents.design_package_id
                  and is_design_package_party(dp.id, 'documents'))
      or exists (select 1 from tenancies t where t.id = documents.tenancy_id
                  and is_tenancy_party(t.id, 'documents'))
      or exists (select 1 from listings li where li.id = documents.listing_id      -- ← G9
                  and has_listing_mandate(li.id, 'documents'))
      or exists (select 1 from data_room_grants g                                   -- ← G9
                  join broker_data_rooms dr on dr.id = g.data_room_id
                 where g.grantee_user_id = auth.uid()
                   and g.revoked_at is null and g.expires_at > now()
                   and documents.data_room_id = dr.id)
      or current_user_role_group() = 'admin'
    ) else
      may_read_privileged(documents.matter_id, documents.privilege_holder_id)
    end
    and documents.tombstoned_at is null
  );
-- `current_user_role_group() = 'broker'` NEVER appears. A brokerage's book of business
-- is not readable by a competitor — a fiduciary constraint before a commercial one.

-- representations -------------------------------------------------------
alter table agency_representations enable row level security;
create policy "ar_party_select" on agency_representations for select
  using (is_representation_party(agency_representations.id)
         or current_user_role_group() = 'admin');
create policy "ar_licensee_write" on agency_representations for all
  using (exists (select 1 from licensees l
                  where l.id = agency_representations.licensee_id
                    and l.user_id = auth.uid() and l.status = 'active'))
  with check (
    exists (select 1 from licensees l
             where l.id = agency_representations.licensee_id
               and l.user_id = auth.uid() and l.status = 'active')
    -- a representation cannot be activated in a state where the licensee is not licensed
    and (status <> 'active' or exists (
          select 1 from broker_licences bl
            join licensees l2 on l2.id = bl.licensee_id and l2.user_id = auth.uid()
           where bl.state = agency_representations.state
             and bl.standing = 'active' and bl.expires_on > current_date))
  );

-- §II.4.5: confidential principal information. Wall-screened, and survives termination
-- as READ-ONLY for the parties who held the duty. No admin branch.
alter table representation_confidences enable row level security;
create policy "rc_walled_select" on representation_confidences for select
  using (exists (
    select 1 from agency_representations r
     where r.id = representation_confidences.representation_id
       and is_representation_party(r.id)
       and not wall_screens(auth.uid(), r.engagement_wall_id)
  ));
create policy "rc_active_write" on representation_confidences for all
  using (exists (select 1 from agency_representations r
                  where r.id = representation_confidences.representation_id
                    and r.status = 'active' and is_representation_party(r.id)))
  with check (exists (select 1 from agency_representations r
                       where r.id = representation_confidences.representation_id
                         and r.status = 'active' and is_representation_party(r.id)));
-- Deliberately NO admin policy: platform personnel reach a principal's confidences only
-- through an audited break-glass writing an access event visible to the principal
-- (the G4 §II.1.2 privileged-row rule, inherited).

-- listings ---------------------------------------------------------------
alter table listings enable row level security;
create policy "listing_mandate_or_public_select" on listings for select
  using (
    has_listing_mandate(listings.id)
    or (listings.state = 'active' and listings.property_id is not null
        and exists (select 1 from properties p where p.id = listings.property_id
                     and p.exposure_policy <> 'private'))     -- public display fields only
    or exists (select 1 from properties p where p.id = listings.property_id
                and has_property_capacity(p.id, null, 'V3'))  -- the OWNER
    or current_user_role_group() = 'admin'
  );
-- The public branch is field-limited by the API view, never by client rendering
-- (the G2 §II.7.4 per-stage allowlist pattern, inherited).

-- compensation -----------------------------------------------------------
alter table compensation_agreements enable row level security;
create policy "comp_parties_only_select" on compensation_agreements for select
  using (
    compensation_agreements.payer_party_id = auth.uid()
    or exists (select 1 from broker_seats s
                where s.brokerage_id = compensation_agreements.payee_brokerage_id
                  and s.user_id = auth.uid() and s.status = 'active'
                  and s.seat_role <> 'unlicensed_admin')
    or current_user_role_group() = 'admin'
  );
-- I-31: parties only. No cross-brokerage read, at any tier, which is what makes the
-- commission-rate aggregate structurally unbuildable rather than merely forbidden.

alter table commission_lines enable row level security;
create policy "cl_parties_select" on commission_lines for select
  using (
    exists (select 1 from broker_seats s
             where s.brokerage_id = commission_lines.payee_brokerage_id
               and s.user_id = auth.uid() and s.status = 'active')
    or exists (select 1 from commission_claims c
                join broker_seats s2 on s2.brokerage_id = c.claimant_brokerage_id
               where c.commission_line_id = commission_lines.id
                 and s2.user_id = auth.uid() and s2.status = 'active')
    or current_user_role_group() = 'admin'
  );

-- data rooms -------------------------------------------------------------
alter table broker_data_rooms enable row level security;
create policy "dr_mandate_or_grant_select" on broker_data_rooms for select
  using (
    has_listing_mandate(broker_data_rooms.listing_id)
    or exists (select 1 from data_room_grants g
                where g.data_room_id = broker_data_rooms.id
                  and g.grantee_user_id = auth.uid()
                  and g.revoked_at is null and g.expires_at > now())
    or exists (select 1 from listings li
                join properties p on p.id = li.property_id
               where li.id = broker_data_rooms.listing_id
                 and has_property_capacity(p.id, null, 'V3'))    -- the OWNER, always
    or current_user_role_group() = 'admin'
  );

-- §II.7.2: the principal reads the access log on their own asset.
alter table data_room_access_log enable row level security;
create policy "dral_principal_and_mandate_select" on data_room_access_log for select
  using (exists (
    select 1 from data_room_grants g
      join broker_data_rooms dr on dr.id = g.data_room_id
      join listings li on li.id = dr.listing_id
      join properties p on p.id = li.property_id
     where g.id = data_room_access_log.grant_id
       and (has_property_capacity(p.id, null, 'V3')      -- the principal
            or has_listing_mandate(li.id))               -- their agent
  ));

-- studies ----------------------------------------------------------------
alter table professional_studies enable row level security;
create policy "ps_scoped_select" on professional_studies for select
  using (
    professional_studies.commissioned_by = auth.uid()
    or professional_studies.for_whose_benefit = auth.uid()
    or exists (select 1 from study_reliance_letters rl
                where rl.study_id = professional_studies.id
                  and rl.relying_party_id = auth.uid())
    or (professional_studies.listing_id is not null
        and has_listing_mandate(professional_studies.listing_id))
    or exists (select 1 from data_room_grants g
                join broker_data_rooms dr on dr.id = g.data_room_id
               where dr.listing_id = professional_studies.listing_id
                 and g.grantee_user_id = auth.uid()
                 and g.revoked_at is null and g.expires_at > now())
    or current_user_role_group() = 'admin'
  );
-- A viewer without commissioning, benefit, or a reliance letter sees the study WITH the
-- §II.9.3 non-reliance banner, applied by the API view, never by client rendering.
```

## III.4 Guard Triggers

```sql
-- I-31: the platform proposes no number. Enforced in the database as a backstop to
-- `commission-benchmark-lint`, because this is the antitrust-facing invariant.
create or replace function public.guard_no_platform_commission()
returns trigger language plpgsql as $$
begin
  if current_setting('app.actor_class', true) in ('service','system') then
    raise exception 'I-31: a compensation agreement must originate from a named party.
      The platform never proposes, defaults, or computes a commission.';
  end if;
  return new;
end $$;
create trigger comp_agreement_guard before insert on compensation_agreements
  for each row execute function guard_no_platform_commission();

-- I-35: no chain event disburses a commission.
create or replace function public.guard_commission_disbursement()
returns trigger language plpgsql as $$
begin
  if new.disbursed_at is not null and old.disbursed_at is null then
    if not commission_disbursable(new.id) then
      raise exception 'I-35: commission disburses only from a recorded settlement, to a
        licensed sponsoring brokerage, after the claim window, with no open claim.';
    end if;
  end if;
  return new;
end $$;
create trigger commission_disbursement_guard before update on commission_lines
  for each row execute function guard_commission_disbursement();

-- I-30 / §II.6.4: a relayed solicitation checks BOTH clusters against the target.
create or replace function public.guard_solicitation_relay()
returns trigger language plpgsql as $$
begin
  if not can_solicit(new.target_property_id) then
    raise exception 'I-30: the brokerage cluster is suppressed on this parcel.';
  end if;
  if not can_solicit_cluster(new.target_property_id, new.on_behalf_of_user_id) then
    raise exception 'I-30: the disclosed principal''s cluster is suppressed on this
      parcel. A broker may not relay contact the target has blocked.';
  end if;
  return new;
end $$;
create trigger solicitation_relay_guard before insert on solicitation_relays
  for each row execute function guard_solicitation_relay();

-- I-34 / §II.4.2: activation requires the state's agency disclosure and a permitted side.
create or replace function public.guard_representation_activation()
returns trigger language plpgsql as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    if new.agency_disclosed_at is null then
      raise exception '§II.4.2: the agency disclosure must be delivered and acknowledged
        before a representation becomes active.';
    end if;
    if new.side = 'dual_agent'
       and capability_posture(new.state, 'dual_agency') = 'disabled' then
      raise exception 'I-34: dual agency is prohibited in %. There is no consent
        override.', new.state;
    end if;
  end if;
  return new;
end $$;
create trigger representation_activation_guard before update on agency_representations
  for each row execute function guard_representation_activation();

-- §II.4.4: self-dealing on a represented property is barred without disclosure+consent,
-- and barred outright inside an assemblage representation.
create or replace function public.guard_self_dealing()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from agency_representations r
      join licensees l on l.id = r.licensee_id
     where r.property_id = new.property_id
       and r.status = 'active'
       and l.identity_hash = current_identity_cluster()
  ) then
    raise exception '§II.4.4: an identity cluster holding an active representation on
      this property may not acquire an interest in it without recorded disclosure,
      principal consent, and an independent valuation.';
  end if;
  return new;
end $$;
-- Applied to the acquisition-intent paths in Groups 1 and 2.
```

## III.5 Manifest Function

```sql
-- §II.3.3. A workspace behind a wall the caller is screened from DOES NOT APPEAR.
create or replace function public.brokerage_manifest()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  select jsonb_agg(node) into result
    from (
      select jsonb_build_object(
        'kind','representation',
        'representationId', r.id,
        'brokerageId', r.brokerage_id,
        'side', r.side,
        'status', r.status,
        'label', coalesce(p.address_line, u.label, 'Representation'),
        'subtabs', (
          select jsonb_agg(t) from unnest(array[
            case when r.side in ('seller_agent','landlord_agent')
                 then 'listing_agreement' end,
            case when r.side = 'buyer_agent' then 'buyer_agreement' end,
            case when may_act_on_representation(r.id) then 'marketing' end,
            case when may_act_on_representation(r.id) then 'offers' end,
            case when r.side = 'buyer_agent' then 'search_tours' end,
            'service_record',
            case when r.side in ('seller_agent','landlord_agent') then 'data_room' end,
            case when r.side in ('seller_agent','landlord_agent') then 'studies' end,
            case when may_act_on_representation(r.id) then 'compensation' end
          ]) t where t is not null)
      ) as node
        from agency_representations r
        left join properties p on p.id = r.property_id
        left join units u on u.id = r.unit_id
       where is_representation_party(r.id)
         and r.status in ('active','pending_disclosure','suspended','terminated')
         -- the wall is the absence (§II.3.3)
         and not wall_screens(auth.uid(), r.engagement_wall_id)
    ) nodes;
  return coalesce(result, '[]'::jsonb);
end $$;
```

## III.6 API Contracts

### `POST /api/brokerages/:id/licensees`
Adds a licensee. **Guards:** caller holds a `designated_broker` seat; the individual's licence is verified against the state authority; a `salesperson` class requires `sponsoring_brokerage_id` = this brokerage. **Returns** `{ licenseeId, states[], class }`.

### `POST /api/representations`
**Guards:** R2 brokerage; the licensee holds an active licence **in the transaction's state**; `broker_conflict_checks` runs and commits **in the same transaction** — a `wall_required` result requires an `engagement_wall_id` in the payload; `capability_posture(state, side)` is not `disabled`. Created in `pending_disclosure`. **422 `CAPABILITY_DISABLED`** with the specific state rule; **409 `CONFLICT_WALL_REQUIRED`** with the conflicting representation's id withheld.

### `POST /api/representations/:id/disclosure`
Renders the state's agency disclosure form, records acknowledgement into `disclosures` with the document hash, and transitions to `active`. **The `guard_representation_activation()` trigger rejects activation without it.** For `dual_agent`, requires an acknowledgement from **every** principal (I-34).

### `POST /api/compensation-agreements`
**Guards:** `may_act_on_representation`; `disclosed_at ≤ acknowledged_at ≤ agreed_at` (check constraint); actor class is **not** `service` or `system` (`guard_no_platform_commission()`). **The request body has no server-supplied default for `amount_or_rate`, and the endpoint rejects a request in which the value was not client-originated.** **Returns** `{ agreementId, disclosedAt, acknowledgedAt }`.

### `POST /api/listings`
**Guards:** `is_representation_party(repId, null, 'seller_agent'|'landlord_agent')`; `may_act_on_representation`; a committed listing agreement hash; `exclusivity = 'limited_service'` requires `capability_posture(state,'limited_service_listing') = 'enabled'` (G9-06). **The payload has no compensation field** — the schema has no column (I-31).

### `POST /api/listings/:id/tours`
**Guards for a residential buyer side:** an executed `buyer_agreement` with a **stated compensation amount** exists on the buyer's representation. **403 `BUYER_AGREEMENT_REQUIRED`** otherwise (§II.5.4). Writes a `service_events` row (§II.10.1).

### `POST /api/listings/:id/syndications`
**Guards:** active `mls_participations` row for the brokerage and MLS; `display_mode` present in `display_modes`; every marketing asset at `fh_screen_status ∈ {passed, human_cleared}`; machine-generated copy carries an authorship act. **The outbound payload passes the `mls-use-lint` allowlist and carries nothing resembling an offer of compensation** (I-31). Sets `takedown_due_at` from the participation's window.

### `POST /api/data-rooms/:id/grants`
**Guards:** `has_listing_mandate`; grantee is E2 (Group 2) or R2 (Group 9) or V3 (Group 1); NDA executed with its hash; `purpose` and `expires_at` required. **No fee, deposit, stake, or hold is accepted — the endpoint has no such parameter and the schema has no such column** (I-33). Content inherits its origin group's rules at grant time (§II.7.3): Group 7 material resolves to the de-identified aggregate view; Group 6 material is checked against `licence_permits()`; Group 1 material requires the owner's grant. **Returns** `{ grantId, expiresAt, watermarkSeed, itemsWithheld[] }`.

### `POST /api/solicitations`
**Guards:** the G1 §II.5.4 / G2 §II.6 four-stage ladder in full; `can_solicit(targetProperty)` for the **brokerage cluster**; and where `onBehalfOfUserId` is present, `can_solicit_cluster()` for the **disclosed principal's** cluster (I-30). Telephony campaigns additionally require a current `dnc_scrubs` row and a `contact_consents` row per contact and channel. **403 `SOLICITATION_SUPPRESSED`** naming which cluster is suppressed, never which parcel state caused it.

### `POST /api/commission-lines`
**Guards:** an active `compensation_agreements` row; a **recorded settlement id from Group 4** with `recorded_closing_at`; the payee is a licensed brokerage in the transaction's state. Sets `claim_window_ends_at`. **Returns** `202 { lineId, claimWindowEndsAt }`. **No chain event can reach this endpoint** (`settlement-only-lint`).

### `POST /api/commission-claims`
Competing procuring-cause claim. **Guards:** the claimant holds an R2 brokerage seat; filed inside the window. **Effects:** holds the disputed portion, **disburses the undisputed portion immediately**, and opens a Group 4 matter with a `neutral` under the §II.5.3 selection protocol. **Returns** `{ claimId, matterId, undisputedDisbursedCents }`.

### `POST /api/commission-lines/:id/disburse`
**Guards:** `commission_disbursable()` — recorded closing, claim window elapsed, no open claim, licensed payee brokerage. Executes Group 1 §II.7.2 **Phase 0** with the recorded closing as the gate. **Payee is the sponsoring brokerage; an individual payee is rejected** (§II.5.6, `licensed-payee-lint`).

### `POST /api/studies`
**Guards:** `has_listing_mandate`. Requires `commissioned_by`, `for_whose_benefit`, `reliance_grantable`, `standard_ref`, and `component_expiries`. `adverse_finding = true` **requires** a `disclosure_matter_id` — the check constraint rejects the insert otherwise, routing a REC to Group 4 (§II.9.3).

### `GET /api/studies/:id`
Returns the study **with an evaluated reliance posture for the caller**: `{ reliancePosture: 'commissioner' | 'named_beneficiary' | 'reliance_letter' | 'none', banner? }`. A `none` posture renders the §II.9.3 non-reliance banner, applied server-side (`reliance-lint`).

### `GET|POST /api/copilot` *(Group 9 context)*
Body carries `{ brokerageId, representationId | listingId, side, epoch }` — identifiers only. Server re-checks `is_representation_party()` **and** `wall_screens()` and returns **403 without invoking the model** on failure. Hard server-side blocks by content class: no commission figure or range (I-31), no legal advice or instrument generation (G4 §II.11.2), no listing copy without an authorship act, no neighbourhood characterization (§II.10.2, I-37), no cross-representation retrieval, and no characterization of a consumer.

## III.7 TypeScript Registry Deltas

```ts
// src/lib/rbac/roles.ts — G9-26: the three keys, defined here for the first time.
// A NEW app segment `brokerage` is introduced: a broker's workspace is not an owner's,
// an investor's, or a property manager's, and reusing any of those would grant the
// maximum-blast-radius role someone else's surface (G9-20).
broker_commercial:  ['brokerage', 'acquisition'],
broker_residential: ['brokerage'],
broker_leasing:     ['brokerage', 'property'],

// NOTE 1 — NO BROKER SUB-ROLE HOLDS `escrow`.
//   The deliberate parallel to Group 4's `legal_arbitrator: ['legal']`. A party who
//   holds no financial signature is given no financial surface, so the temptation and
//   the attack surface both cease to exist (§II.5.7, G9-28).
// NOTE 2 — `broker_residential` does NOT hold `acquisition`.
//   `acquisition` is the wholesaler/assembler segment. A residential broker with
//   acquisition reach is the distress-interception path by another name (G9-13).
// NOTE 3 — `broker_leasing` holds `property` for the Group 7 composition, and reaches
//   NO Class-T element under any engagement (§II.10.5, A66).

// ROLE_GROUP_MAP — all three map to `broker`, which exists for coarse nav routing and
// is BARRED from every Group 9 row-access predicate by I-1.
broker_commercial:  'broker',
broker_residential: 'broker',
broker_leasing:     'broker',

// src/lib/rbac/brokerage.ts — NEW.
export type AgencySide =
  | 'seller_agent' | 'buyer_agent' | 'landlord_agent' | 'tenant_agent'
  | 'designated_agent' | 'dual_agent' | 'transaction_broker' | 'referral_only';
export type BrokerSeatRole =
  | 'designated_broker' | 'managing_broker' | 'team_lead' | 'agent' | 'unlicensed_admin';
export type LicenceClass = 'broker' | 'associate_broker' | 'salesperson';
export type RelianceposTure =
  | 'commissioner' | 'named_beneficiary' | 'reliance_letter' | 'none';

/** Mirrors is_representation_party(). Called BEFORE any side effect. */
export async function assertRepresentationParty(
  supabase: SupabaseClient, repId: string, facet?: string, side?: AgencySide,
): Promise<void>;

/** Mirrors may_act_on_representation(). Licence + state + disclosure + capability. */
export async function assertMayAct(
  supabase: SupabaseClient, repId: string,
): Promise<void>;

/** I-34. Throws DUAL_AGENCY_PROHIBITED where the state disallows it — no override. */
export async function assertDualAgencyPermitted(
  supabase: SupabaseClient, state: string,
): Promise<void>;

/**
 * I-31. There is deliberately NO function that returns, suggests, or ranges a
 * commission. The absence is the control. Do not add one.
 */

/** I-35. The ONLY sanctioned disbursement gate. Groups 3 and 4 call it too. */
export async function assertCommissionDisbursable(
  supabase: SupabaseClient, lineId: string,
): Promise<void>;

/** §II.5.4. Gates tours and unmasked listing views for residential buyer sides. */
export async function assertBuyerAgreementOnFile(
  supabase: SupabaseClient, repId: string,
): Promise<void>;

/** §II.9.2. Every study surface calls this before rendering. */
export async function evaluateReliance(
  supabase: SupabaseClient, studyId: string,
): Promise<{ posture: ReliancePosture; banner?: string }>;

/** I-30. Checks BOTH the brokerage cluster and any disclosed principal's cluster. */
export async function assertMaySolicit(
  supabase: SupabaseClient, propertyId: string, onBehalfOfUserId?: string,
): Promise<void>;
```

---
# PART IV — VERIFICATION

## IV.1 Cross-Representation & Cross-Brokerage Isolation Matrix

Actor holds a seat at **Brokerage A** and is party to **Representation A1** (seller side). Columns are what they may reach.

| Actor | Brokerage B's representations | B's commission agreements | A2 (buyer side, walled) | A1 principal's confidences | G1 distress | G2 assignment board | G7 Class-T |
|---|---|---|---|---|---|---|---|
| `agent` on A1 | ❌ | ❌ | ❌ **walled** | ✅ | ❌ **never** | ❌ **never** | ❌ **never** |
| `team_lead` at A | ❌ | ❌ | ❌ if walled | own team only | ❌ | ❌ | ❌ |
| `managing_broker` at A | ❌ | A's only | ❌ if walled | in scope, unwalled only | ❌ | ❌ | ❌ |
| `designated_broker` at A | ❌ | A's only | **screened where the state requires** | supervisory, recorded | ❌ | ❌ | ❌ |
| `unlicensed_admin` at A | ❌ | ❌ | ❌ | ❌ **never** | ❌ | ❌ | ❌ |
| Any broker at Brokerage B | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **The principal** of A1 | ❌ | **their own, always** | ❌ | ✅ **their own** | own | ❌ | ❌ |
| Data-room grantee (E2/R2) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (aggregate only) |
| Group 2 `investor_assembler` | ❌ | ❌ | ❌ | ❌ | ❌ | own deals | ❌ |
| Group 7 `prop_manager` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | own engagement |
| `admin` | break-glass | break-glass | break-glass | ❌ **no branch** | audited | audited | ❌ **no branch** |

Four load-bearing rows. **No brokerage reaches any other brokerage's representations or compensation agreements at any tier** — which is simultaneously the G9-27 confidentiality fix and what makes the I-31 cross-brokerage rate aggregate structurally unbuildable rather than merely forbidden. **A wall is an absence, not a permission denial** — the walled workspace does not appear in the manifest. **`unlicensed_admin` reaches no principal confidence at all**, because performing or being positioned to perform a licensed act unlicensed is a criminal exposure for the firm. And **`admin` has no branch on principal confidences**, inheriting the Group 4 §II.1.2 privileged-row rule.

## IV.2 Acceptance Criteria

**Licensure, agency & disclosure**
- [ ] A representation cannot be created by a licensee with no active licence **in the transaction's state**. *(G9-01.)*
- [ ] A `salesperson`-class licence without `sponsoring_brokerage_id` is rejected by check constraint. *(G9-01.)*
- [ ] A representation cannot reach `active` without a delivered, acknowledged agency disclosure — asserted at the constraint **and** the trigger. *(§II.4.2.)*
- [ ] `agency-disclosure-lint` returns zero: no broker-side routing, instrument, tour, or compensation path can execute without a committed acknowledgement row. *(G9-04.)*
- [ ] A `dual_agent` representation in a prohibiting state is rejected, and **no consent payload overrides it**. *(I-34 — asserted by attempting one with full consent.)*
- [ ] A `designated_agent` representation without an `engagement_wall_id` is not persistable. *(§II.4.3.)*
- [ ] A licensee screened from a wall cannot read the walled representation, its confidences, or its documents — **and the workspace does not appear in `brokerage_manifest()`**. *(G9-02.)*
- [ ] `representation_confidences` has **no admin policy**; a break-glass read writes an access event visible to the principal. *(§II.4.5.)*
- [ ] Confidences remain readable by the parties who held the duty after `terminated`, and are never deleted. *(G9-32.)*
- [ ] An `unlicensed_admin` seat cannot create a representation, transmit an instrument, or appear on a compensation agreement. *(G9-07.)*
- [ ] `limited_service_listing` is blocked in a minimum-service state by the capability matrix, at the API layer. *(G9-06.)*
- [ ] A state with no current `broker_capability_matrix` row resolves to `disabled`. *(§II.2.3 — asserted by deleting a row.)*
- [ ] An identity cluster holding an active representation on a property cannot acquire an interest in it; inside an assemblage representation it is barred outright. *(`self-dealing-lint`. G9-03, §II.4.4.)*

**Compensation**
- [ ] `grep -rn` over the entire client bundle, API layer, template library, and seed data returns **zero** commission defaults, placeholder rates, "typical/customary/market" ranges, percentiles, or cross-brokerage aggregates. *(`commission-benchmark-lint`. I-31, G9-08, G9-12.)*
- [ ] `compensation_agreements` rejects an insert from a `service` or `system` actor class. *(I-31, `guard_no_platform_commission()`.)*
- [ ] The `listings` table has **no compensation column**, and the outbound MLS payload carries nothing resembling an offer of compensation. *(I-31, §II.5.3, `mls-use-lint`.)*
- [ ] A tour or unmasked listing view for a residential buyer side is refused without an executed buyer agreement carrying a stated compensation amount. *(§II.5.4, G9-05.)*
- [ ] `settlement-only-lint` returns zero: **no code path reaches a commission disbursement from a chain event, a listing state, or a deal state.** *(I-35, G9-09.)*
- [ ] A disbursement before `claim_window_ends_at` is rejected by check constraint **and** by `commission_disbursable()`. *(§II.5.5.)*
- [ ] A disbursement to an individual, or to any payee without an active brokerage licence, is rejected. *(`licensed-payee-lint`. G9-11.)*
- [ ] An open `commission_claims` row blocks disbursement of the disputed portion **and the undisputed portion disburses immediately**. *(G9-10.)*
- [ ] A reversed closing reverses the commission line, and no disbursement preceded the recorded closing. *(G9-09, §II.12.)*
- [ ] `internal_split_records` has **no foreign key to, and no code path into, any disbursement**. *(§II.5.6 — asserted structurally.)*

**Distress, data & solicitation**
- [ ] `distress-tier-lint` returns zero: **no entitlement check is reachable from a distress binding, a Shield state, or any distress-derived value.** *(I-36, G9-13.)*
- [ ] No surface, export, model, filter, sort, alert, or Co-Pilot output exposes an `owner_distressed` binding or anything derived from it — asserted by an adversarial sweep of every Group 9 endpoint at every tier. *(I-36.)*
- [ ] The consented `seeking_exit` feed returns **identical results at the free tier and the enterprise tier**. *(I-2, G9-14 — the single clearest assertion that entitlement does not widen scope.)*
- [ ] `entitlement-scope-lint` returns zero: no RLS predicate or data-fetch path is reachable from an entitlement check. *(G9-14.)*
- [ ] A geographically bounded discovery query returning fewer than 5 parcels returns `region_too_sparse`. *(G1 §II.5.3, inherited.)*
- [ ] No layer renders finer than its aggregation unit, enforced at the tile service; grid-sampling patterns page security. *(G2 §II.5.3, inherited. G9-15.)*
- [ ] A layer with no current Provenance Registry entry does not render, and `inferred_nonpublic` is not an accepted `lawful_basis`. *(G2 §II.5.4. G9-15.)*
- [ ] No surface returns an opportunity score, FAR-residual ranking, upzoning-likelihood, or off-market-potential sort. *(`score-lint` extended. G9-15.)*
- [ ] A relayed solicitation is blocked when **either** the brokerage cluster **or** the disclosed principal's cluster is suppressed on the target parcel. *(I-30, G9-17 — asserted in both directions.)*
- [ ] An undisclosed relay is not persistable (`relay_must_disclose`), and one detected after the fact reverts the brokerage cluster's trust level. *(G9-17.)*
- [ ] `dnc-lint` returns zero: no outbound voice or SMS path executes without a current scrub and a per-channel consent record; revocation is honored across the cluster and every channel immediately. *(G9-16.)*

**Data rooms, studies & reliance**
- [ ] `principal-info-fee-lint` returns zero: **no charge, deposit, stake, hold, or fee is reachable from a data-room, listing, or document-access path**, and no such column exists in the schema. *(I-33, G9-18.)*
- [ ] The data-room access log is readable **by the principal** and is append-only. *(§II.7.2.)*
- [ ] A grant resolves Group 7 material to the de-identified aggregate view and withholds every Class-T element, returning them in `itemsWithheld[]`. *(A66, G9-19, G9-30.)*
- [ ] A grant checks Group 6 material against `licence_permits()` and Group 1 material against the owner's grant. *(G9-19.)*
- [ ] Group 2's assignment board is unreachable from every Group 9 surface and predicate. *(G2 §II.7.4, G9-19.)*
- [ ] A study viewed by a party with no commissioning, benefit, or reliance letter renders the §II.9.3 non-reliance banner, **applied server-side**. *(`reliance-lint`. G9-25.)*
- [ ] `adverse_finding = true` without a `disclosure_matter_id` is rejected by check constraint, routing a REC to Group 4. *(G9-25, §II.9.3.)*
- [ ] Component shelf lives render, and an expired Phase I is labelled as not supporting the defence. *(§II.9.3.)*
- [ ] The platform books **zero** revenue on any study it prompted for. *(§II.9.1, G6-20 pattern.)*

**Fair housing & marketing**
- [ ] No marketing asset transmits at `fh_screen_status = 'pending'` or `'flagged'`. *(§II.8.3, G9-23.)*
- [ ] Machine-generated listing copy without an authorship act is not persistable. *(`machine_copy_needs_authorship`.)*
- [ ] `steering-lint` returns zero: no school-quality, crime, or demographic layer exists, and the blocked-language set is enforced in listing copy **and** Co-Pilot output. *(§II.10.2, I-37.)*
- [ ] Match and tour outputs are filtered on the consumer's stated criteria only; `proxy-lint` (inherited from G7) returns zero on protected-class-correlated features. *(§II.10.3, I-37.)*
- [ ] Service-event distributions are tested by geography and proxy per licensee, and drift routes to the designated broker and Group 8 — **never to a public rating**. *(§II.10.1.)*
- [ ] Housing-ad targeting rejects lookalike audiences and exclusion targeting on protected-correlated dimensions. *(§II.10.4.)*

**MLS, listings & lifecycle**
- [ ] Inbound and outbound feed access is refused without an active `mls_participations` row and current licensure. *(G9-24.)*
- [ ] IDX and VOW are separately configured; a listing cannot syndicate in a mode absent from `display_modes`. *(G9-24.)*
- [ ] Attribution and required disclosures render on every displayed listing in every mode. *(G9-24.)*
- [ ] Delisting propagates to every syndicated surface inside `takedown_window_minutes`, on a monitored SLA. *(G9-24, G9-32.)*
- [ ] `mls-use-lint` enforces the outbound payload allowlist and fails on any derivative-product or commingling path. *(G9-24.)*
- [ ] The protection period is computed on `expired` and `cancelled`, rendered to both parties, and survives termination. *(G9-32.)*

**RBAC & taxonomy**
- [ ] `select enum_range(null::user_role)` returns **27** values, including all three `broker_*` keys. *(G9-26 — the arithmetic closed.)*
- [ ] `getAllowedApps('broker_commercial') = ['brokerage','acquisition']`, `('broker_residential') = ['brokerage']`, `('broker_leasing') = ['brokerage','property']`. *(§III.7.)*
- [ ] **No broker sub-role holds the `escrow` segment**, and no Group 9 surface holds or releases funds. *(§II.5.7, G9-28.)*
- [ ] `grep -rn "current_user_role_group" supabase/migrations/` returns **zero** hits containing `'broker'` outside the literal `admin` branch. *(I-1, CI-enforced. G9-27.)*
- [ ] A broker at Brokerage A cannot read Brokerage B's representations, listings, confidences, compensation agreements, or data rooms via direct `supabase-js` query. *(G9-27.)*
- [ ] A broker cannot read any Group 7 Class-T element, any Group 1 distress state, or Group 2's assignment board, under any engagement or tier. *(G9-20, G9-30.)*
- [ ] No Stripe event mutates brokerages, licensees, licences, representations, listings, walls, or compensation agreements. *(I-2 webhook fuzz.)*

## IV.3 CI Guardrails

Groups 1–7 guardrails are inherited unchanged. Group 9 adds:

```
policy-lint             — extended: ZERO occurrences of 'broker' inside
                          current_user_role_group() predicates outside the admin branch (I-1)
commission-benchmark-lint — fails on ANY commission default, placeholder containing a
                          number, "typical/customary/market/suggested" range, percentile,
                          distribution, cross-brokerage aggregate, adoption telemetry, or
                          Co-Pilot output containing a rate. NO ALLOWLIST. (I-31)
settlement-only-lint    — fails if any code path reaches a commission disbursement from a
                          chain event, a listing state, or a deal state (I-35)
licensed-payee-lint     — fails if any disbursement path can resolve a payee without an
                          active brokerage licence in the transaction's state (§II.5.6)
agency-disclosure-lint  — fails if any broker-side routing, instrument, tour, or
                          compensation path can execute without a committed
                          acknowledgement row (§II.4.2, G9-04)
dual-agency-lint        — fails if any consent path can override a 'disabled' capability
                          posture, and if any wall can be bypassed by a seat role (I-34)
respa-lint              — fails if any fee constant is reachable from a loan-origination,
                          loan-consummation, title-order, or settlement-service event
                          (I-32, G9-21)
settlement-revenue-lint — fails on any revenue path reachable from a closing, settlement,
                          commission, referral, or lease-execution event (§II.11.3, G9-22)
principal-info-fee-lint — fails on any charge, deposit, stake, or hold reachable from a
                          data-room, listing, or document-access path (I-33, G9-18)
distress-tier-lint      — fails if any entitlement check is reachable from a distress
                          binding, a Shield state, or a distress-derived value (I-36)
entitlement-scope-lint  — inherited from G2, extended: fails if any RLS predicate or
                          data-fetch path is reachable from an entitlement check (G9-14)
steering-lint           — fails on any school-quality, crime, demographic, or
                          neighborhood-desirability layer, and on the blocked-language set
                          in listing copy or Co-Pilot output (I-37, G9-23)
proxy-lint              — inherited from G7, extended to match, tour, and recommendation
                          features (I-37)
mls-use-lint            — fails on any outbound payload field outside the allowlist, any
                          compensation-offer field, any derivative-product path, and any
                          commingling path lacking disclosure (G9-24)
reliance-lint           — fails on any surface presenting a study as diligence without an
                          evaluated reliance posture (§II.9.2, G9-25)
self-dealing-lint       — fails if any acquisition path can execute for an identity cluster
                          holding an active representation on the target (§II.4.4, G9-03)
dnc-lint                — fails on any outbound voice/SMS path executable without a current
                          scrub and a per-channel consent record (G9-16)
score-lint              — extended: fails on any opportunity, FAR-residual,
                          upzoning-likelihood, or off-market-potential score (G9-15)
segment-lint            — extended: fails if any broker-reachable route requires the
                          `escrow` app segment (§III.7, G9-28)
```

## IV.4 Telemetry

**Registration funnel:** `R0 → R1 → first representation → R2 → R3 → first listing`. Because licence verification is deferred to the first licensed act (§II.2.2), the honest signal is **R1→first-representation conversion**, and a drop there means the licence verification step is failing rather than the product. Break out by blocking dimension (state, licence class, sponsorship, capability posture).

**Agency and disclosure integrity — the group's most important dashboard:** disclosure delivery rate as a percentage of representations reaching `active` (must be 100%; anything below is a defect, not a metric); **median time between first substantive contact and disclosure delivery**, which is the actual compliance exposure; dual-agency rate by state against the state's own posture; **wall-bypass attempts** (pages immediately); conflict-check `wall_required` and `blocked` rates per brokerage; representations activated with a lapsed licence (should be structurally zero).

**Compensation integrity:** commission-agreement completion rate before the first compensable act; **claim-window claim rate and claim resolution latency**; undisputed-portion disbursement latency; disbursement attempts failing `commission_disbursable()`, broken out by which condition failed — a firm repeatedly failing `licensed payee` is a licensure problem surfacing; reversal rate on rescinded closings.

**Deliberately and specifically not collected:** any commission value, distribution, adoption rate, percentile, or trend. Collecting it would **build** the cross-brokerage aggregate that I-31 exists to prevent, and the existence of the dataset would itself be the evidence. This is the one telemetry exclusion in the corpus that is a legal control rather than a privacy one.

**Solicitation and consent:** relay volume with disclosed-principal composition; suppression blocks by cluster (brokerage versus relayed principal — a firm with a high relayed-block rate is being used to launder suppression); DNC scrub freshness; revocation-to-honor latency (target: immediate); contact velocity per cluster against the quota.

**Fair housing:** service-event distributions by geography and proxy, per licensee and per brokerage, against own baseline and population; tours offered versus delivered by geography; response latency dispersion; content-screen flag rate and human-clearance rate by term category; **ad-targeting rejections** by rule.

**Data rooms and reliance:** grants issued, revoked, and expired; principal access-log views (a principal who never looks is a product signal, not a compliance one); studies rendered with a `none` reliance posture; reliance letters requested versus issued; adverse findings routed to Group 4 and their acknowledgement rate.

---

# PART V — RESIDUAL RISK & BOARD / REGULATORY REVIEW QUEUE

## V.1 Accepted residual risks

| Risk | Why accepted | Compensating control |
|---|---|---|
| A licensee who breaches a fiduciary duty off-platform | The platform cannot observe conduct outside it | The on-platform record is complete and authenticable (G4 §II.10), which makes the breach provable rather than preventable; supervision surface; identity-cluster reputation |
| Two brokerages agreeing a rate bilaterally | Bilateral negotiation is lawful and is the post-settlement design | The platform contributes no number, no aggregate, and no visibility across firms (I-31) — it removes the *mechanism* of coordination, which is what it can control |
| A principal who does not read the disclosure | Disclosure obligations are personal | Plain-language rendering, reading-level testing, acknowledgement with document hash, independent-counsel offer, and the disclosure surviving in the transaction file |
| Designated agency where the state permits it but the wall is socially porous | A wall is a technical control over a human firm | Row-level screening including Co-Pilot retrieval, manifest-level absence, bypass-attempt paging, and disclosure of the wall to both principals |
| A study that is properly attributed and still wrong | Attribution is not accuracy | Reliance posture travels with it, component shelf lives render, the professional is named, and adverse findings route to disclosure |
| Off-platform pocket listings | The platform cannot compel a brokerage's inventory onto it | Clear-cooperation clocks surfaced where the brokerage participates; the compliance record makes on-platform materially safer under examination |
| A steering pattern below statistical detectability | Outcome testing has a power floor | Content screening, blocked language, withdrawn proxy layers, stated-criteria-only matching, and per-licensee baselines that detect individual drift earlier than population tests |
| A state whose agency forms or rules change mid-quarter | Rule packs have real maintenance lag | A state with no current capability row is `disabled` — refusal to operate, never operating wrongly (§II.2.3) |

## V.2 Blocking board and regulatory review items

Each is a build-blocker for its surface.

1. **Real estate licensure, per state.** Firm licensing, designated-broker requirements, salesperson affiliation and sponsorship, reciprocity, and **who may lawfully receive a commission**. **Blocks:** all representations, all listings, all compensation.
2. **Post-settlement compensation practice.** Whether §II.5.1–§II.5.5's structure — entered compensation, no published offers, bilateral cooperating compensation, buyer agreements before touring — is correct and complete for each launch market, and how it interacts with each MLS's rules. **Blocks:** the entire compensation architecture.
3. **Antitrust.** Whether I-31's controls (no default, no aggregate, no cross-brokerage visibility, no adoption telemetry) are sufficient given that the platform operates a shared system used by competing firms. This is the highest-severity open item in the document. **Blocks:** launch.
4. **Agency law, per state.** Dual agency prohibitions and consent forms, designated agency recognition and wall adequacy, transaction-broker status, disclosure timing ("first substantive contact"), and the duration of post-termination confidentiality. **Blocks:** representation creation per state.
5. **Minimum-service statutes.** Which states restrict limited-service brokerage and what the irreducible duty set is. **Blocks:** the flat-fee listing product per state.
6. **RESPA §8.** Confirmation that §II.11's structure — flat transaction-independent subscription, zero referral compensation, zero closing-contingent fee — is clean, and whether any affiliated business arrangement the platform contemplates requires the §II.4.2 disclosure. **Blocks:** all monetization. Shared in kind with Group 1 item on the fee matrix and Group 3's RESPA items.
7. **Fair housing.** Approval of the §II.8.3 content screen term set, the §II.10.1 outcome-testing methodology and thresholds, the §II.10.2 withdrawn-layer list, the §II.10.3 matching constraints, and the §II.10.4 advertising restrictions. **Blocks:** all residential surfaces.
8. **MLS and RLS participant agreements.** Per-MLS: permitted access, IDX and VOW rulesets, attribution, prohibited uses, derivative-product rules, commingling, data retention, takedown windows, and copyright in listing content and photographs. **Blocks:** the feed, inbound and outbound.
9. **Telephone consumer protection.** Whether §II.6.4's consent, scrub, calling-window, and revocation model satisfies federal and state requirements including the state registries and any state-specific consent standard. **Blocks:** all outbound telephony.
10. **Trust and escrow.** Confirmation that Group 9 holds no funds anywhere — including that §II.7's data rooms hold no deposit and that commission settlement is entirely Group 4's — and whether any state nonetheless requires a brokerage trust account for the platform's flows. **Blocks:** the data-room and settlement surfaces.
11. **Environmental professional standards and reliance.** Whether §II.9.3's non-reliance banner, reliance-letter model, and shelf-life rendering are correct, and whether the platform incurs liability by displaying a study at all. Related to Group 6 item 9. **Blocks:** the studies surface.
12. **UPL.** Whether listing agreements, buyer agreements, agency disclosures, and NDAs generated for non-lawyer brokers stay inside the Group 4 §II.11.1 boundary. Shared with Group 4 item 1 and Group 7 item 13. **Blocks:** all instrument generation.
13. **Advertising and team-name rules, per state.** Licensee name and licence-number display, team naming, brokerage identification on every advertisement, and social-media rules. **Blocks:** marketing surfaces per state.
14. **Transaction-file retention, per state.** Retention periods (commonly 3–7 years), what must be retained, production on examination, and the designated broker's personal responsibility for it. **Blocks:** the §II.11.5 Obligation Lock design.
15. **Commission dispute forum.** Whether §II.5.5's routing to a Group 4 neutral is compatible with association arbitration obligations where the brokerage is a member, and which forum governs on conflict. **Blocks:** the claim window.

## V.3 Cross-group items surfaced here, owned elsewhere

- **Group 1** must accept `listings` as an owner-granted mandate emanating from a V3 binding, must render broker access in the Exposure & Privacy access log, and must expose `can_solicit_cluster()` for the I-30 relay check (Appendix A rows A74, A79).
- **Group 2** must accept that its assignment board remains structurally invisible to Group 9 (G2 §II.7.4, restated at A76) and that footprint confidentiality binds brokers on assemblage representations (A77).
- **Group 3** must accept that **no Group 9 compensation of any kind flows from a lender**, in any structure, and must reject any referral-linked fee construct at its own boundary (A80, I-32).
- **Group 4** owns settlement, the commission line on the closing statement, the neutral for commission claims, every Group 9 instrument under §II.11.1, and the disclosure-obligation matters routed from §II.9.3 (A75, A78).
- **Group 6** must accept that studies distributed through a broker data room operate strictly within `design_licences.permitted_uses` and that the §II.9.2 attribution and reliance posture travel with them (A81).
- **Group 7** must accept `broker_leasing` as a first-class participant through a `listing` mandate or a `lease`-scoped engagement facet, and Group 9 accepts G7's Class-T boundary without exception (A69 confirmed, A82).
- **Group 8** must supply: state licence-authority integrations, MLS/RLS participant verification, the `broker_capability_matrix` as a maintained operational surface with an SLA, DNC registry access, the §II.10.1 fair-housing monitor as a dedicated supervisory role, and the break-glass audit path with principal notification.

---

# APPENDIX A — BOUNDARY CONTRACT WITH GROUPS 1–7

Extends the Group 2, 3, 4, 5, 6, and 7 boundary tables. Rows A74 onward.

| # | Contested surface | Prior position | Group 9 draft position | **Resolution** |
|---|---|---|---|---|
| A74 | Source of a broker's authority | G1 §II.1 and G7 §II.1.2: authority derives from a granted, verified, revocable edge | Role possession plus a subscription tier | **G1 governs, extended.** `agency_representations` and `listings` emanate from a principal's act; a V3 binding grants the listing mandate (§II.1). |
| A75 | Who disburses a commission | G1 §II.6.3 #6 (title moves only at a recorded closing); G4 §II.7 owns settlement | A smart contract at deed transfer, to individual wallets | **G1 and G4 govern.** Commission is a line on a Group 4 recorded settlement, paid to the sponsoring brokerage after the claim window. **No chain event disburses** (I-35). |
| A76 | Group 2's assignment board | G2 §II.7.4: *"never to Group 9 brokers"* | Broker data rooms sharing deal material with "verified developers" | **G2 governs, unchanged.** The board is structurally invisible; data-room contents carry their origin group's rules at grant time (§II.7.3). |
| A77 | Assemblage footprints | G2 §II.9.6 footprint confidentiality; G1 §II.6.1 no drag-along | Developer Pitch Hub organizing owners and pitching a named buyer | **Both govern, and a bar is added.** Disclosed owner-side agency, buyer-side compensation disclosed to every owner, footprint workspace-scoped, and the licensee's cluster **barred from any interest in the footprint** (§II.4.6, §II.4.4). |
| A78 | Instruments for non-lawyers | G4 §II.11.1 document-automation boundary | Listing and lease "execution," auto-generated | **G4 governs, unchanged.** Every Group 9 instrument is a counsel-approved per-jurisdiction template with mechanical field completion and no selection or advisory layer (§II.8.1). |
| A79 | Solicitation of owners | G1 §II.5.4 consent ladder; G2 §II.6 four stages | A CRM for *"management of outbound owner solicitations"* | **G1 and G2 govern without exception, plus a new rule.** I-30: a broker may not **relay** contact the target has blocked for the relayed principal — the first relay in the corpus, so the first statement of the rule (§II.6.4). |
| A80 | Lender-to-broker compensation | G1 §II.8.3: *"the Group 9 'HELOC referral bounty' is deleted"* | The bounty, re-proposed | **Deleted a second time and made structural.** I-32: no Group 9 compensation is contingent on a referral to a lender or any settlement service. `respa-lint` (§II.11.1). |
| A81 | Design studies in a marketing surface | G6 §II.7 attribution; G6 §II.8.2 licence; G6 I-20 (`machine_extracted` sizes nothing) | Studies attached to listings to *"build buyer confidence"* | **G6 governs, extended to reliance.** `commissioned_by` / `for_whose_benefit` / `reliance_grantable` travel with every study; an unsealed study cannot support a marketing claim about achievable FAR (§II.9.2, §II.9.4). |
| A82 | Leasing and tenant data | G7 §II.11.2 A66 and §II.13.4 A69 | *"Integrates with the `prop_manager` to fill vacancies"* | **G7 governs, unchanged and confirmed.** `broker_leasing` reaches availability, terms, and marketing. It reaches **no** applicant file, no Class-T, and nothing about a sitting tenant (§II.10.5). |
| A83 | Distress as a surface | G1 §II.8.4 withdrew the Group 9 tier **by name** | *"Distress Interception"*, re-proposed and monetized | **Withdrawn a second time and promoted to I-36.** No surface, tier, export, model, or inference, anywhere, ever. The consented feed replaces it and is **free at every tier** (§II.6.1). |
| A84 | Entitlement and data scope | G1 §II.8.1; G2 §II.1.3 (G2-09, 🔴) | *"High-tier SaaS fees for access to... data"* | **Withdrawn.** Tiers gate features only. The clearest test in the corpus: the consented feed returns **identical results at the free and enterprise tiers** (§II.11.2, I-2). |
| A85 | Fees charged to a consumer | G1 §II.8.3; G7 §II.13.3 (the tenant pays nothing) | Data-room access deposits set and kept by the agent | **Withdrawn.** I-33: a fiduciary never profits from access to the principal's information. NDA, identity gate, and a principal-visible access log replace it, at zero cost (§II.7). |
| A86 | Price/rate coordination | G7 §II.12.1 and I-29 (no unit-level rent recommendation) | A default commission rate and an automated universal split | **Second application of the same rule, with a heavier posture.** In G7 the platform aggregated a price; here it would **propose** one. I-31 forbids proposing, defaulting, benchmarking, aggregating, **and measuring** (§II.5.2, §II.11.6). |

---

# APPENDIX B — THE INDEPENDENCE PATTERN: ONE PROBLEM, SOLVED SEVEN TIMES

Group 7's Appendix B predicted this group by name and predicted that the defect would appear **three times** in this draft. It appeared three times.

**The pattern:** *a party whose judgment is supposed to protect someone else is selected, paid, or renewable by the party who benefits from a particular answer.*

| Group | The neutral | The defect as drafted | The resolution |
|---|---|---|---|
| **G3** §II.9.5 | Construction inspector | Payer-selected | Rotation pool, project-funded escrow, paid regardless of finding |
| **G4** §II.5.3 | Arbitrator | Platform selects and earns on the dispute | Party strike-and-rank; compensation fixed at appointment; zero net revenue from outcomes |
| **G4** §II.7.3 | Escrow holder | Liquidates on its own view of breach | No authority to determine breach at all |
| **G5** §II.6.3 | Delivery confirmer | The buyer's agent alone releases the seller's money | Counter-signature; the driver's attestation records regardless |
| **G6** §II.6.3 | Structural observer | Approval is "the deterministic key" to the payer's escrow | Paid regardless of disposition; the seal releases nothing |
| **G7** §II.5.4 | Repair verifier | The manager dispatches, verifies, releases, and earns more when the repair does not happen | Three keys, with the **occupant** holding one |
| **G9** §II.5, §II.7, §II.11.1 | **The agent** | **Three instances in one draft** | **Three resolutions, below** |

**Group 9's three instances, as predicted:**

| Instance | The defect | The resolution |
|---|---|---|
| **The commission** | Paid contingently, at a rate the platform proposes, split by a formula the platform computes, disbursed by the platform at an event the platform observes | Compensation is an **agreement between named parties**, entered by them, disclosed before the act. The platform proposes nothing, computes nothing, and disburses only from a **recorded settlement** after a claim window (I-31, I-35). |
| **The data room** | The fiduciary sets a fee for access to the principal's information, holds the float, and determines the refund — the G4 §II.7.3 escrow-holder defect with an *interested* determiner | The fee is **withdrawn entirely** (I-33). NDA, identity gate, purpose-bound expiring grant, and a **principal-visible access log** — which is the accountability the deposit was a poor proxy for, at zero cost. |
| **The referral bounty** | The agent's advice to their own client about financing is paid for by the lender receiving the referral | **Deleted** (I-32). No Group 9 compensation is contingent on a referral to any settlement service, and the RESPA line is enforced by `respa-lint` rather than by policy. |

**The resolution, generalized — and the fifth part Group 9 adds:**

1. **Sever selection.** The interested party does not choose the neutral.
2. **Sever compensation from outcome.** The fee is fixed before the judgment and paid identically whatever it is.
3. **Sever the judgment from the money.** The neutral determines; a different party transfers.
4. *(G7)* **Give a key to the party with the evidence**, even when they are not the customer.
5. *(G9 — new)* **Where the actor is unavoidably interested, remove the discretion rather than the actor.** A broker cannot be made disinterested; that is what an agent *is*. So the design removes every point at which their interest could be exercised: the platform proposes no rate, holds no fee, determines no refund, and disburses on no judgment. **The agent keeps their loyalty to their principal and is given no lever to sell.**

**Closing the prediction.** Groups 3 through 7 and 9 have each imported this pattern once or more. **Group 8 (Admin) is the only group left**, and the instance to expect is the one already named in Group 6's Appendix B: *the admin who both verifies compliance and can release the payout it gates*. The corpus now has five resolution parts and seven worked examples; applying them pre-emptively to Group 8 is the cheapest audit in the programme.

---

# APPENDIX C — THE VULNERABLE-COUNTERPARTY FLOOR: ONE PRINCIPLE, FOUR GROUPS

Extends Group 7's Appendix C.

| Group | The vulnerable party | What they stand to lose | The floor |
|---|---|---|---|
| **G1** §II.4.3 | `owner_distressed` | Their home, through foreclosure | Shield: **$0 forever, no entitlement key**, no upsell in the subtree, distress is not a product at any tier |
| **G4** §II.9.1 | The loss-mitigation consumer | Their home, and their equity | **$0 fees in any structure** on escrowed principal; independence from the servicer |
| **G7** §II.13.2 | `prop_tenant` | Their home, through eviction — and their record | **$0 forever, no entitlement key**; the Access Floor; the Habitability Floor; records that survive the counterparty |
| **G9** §II.11.4 | **The represented consumer** — seller, buyer, or renter | **Their equity, through an agent's undisclosed adverse interest** | **Nothing is charged to the consumer**, ever: no listing fee, no data-room fee, no document fee, no dispute fee. **No platform revenue rises with their transacting** (§II.11.3). **Every compensation source is disclosed before the act that earns it** (§II.4.2). **Their agent is given no lever to sell** (Appendix B, part 5). |

**The generalized floor, restated with Group 9's addition:**

1. **The vulnerable party's product is free, permanently, with no entitlement key** — no surface through which it can be sold, mis-provisioned, or lost.
2. **No platform revenue line rises with their distress or their transacting.**
3. **Their state is not a product.** No tier exposes it; no score is computed from it. *(Group 9 is the second group to have to be told this about the same dataset.)*
4. **Their record survives the counterparty**, who is the party with the incentive to make it disappear.
5. **Exercising a right is invisible to every decisioning surface.**
6. **(G9 — new) Where a professional is paid to act for them, every source of that professional's compensation is disclosed to them before the act it pays for**, and the platform contributes no undisclosed source of its own.

**Group 8 should be audited against this floor directly.** Its vulnerable counterparty is every consumer in the system simultaneously, and its lever is the compliance attestation that gates their money.

---

# APPENDIX D — THE RE-PROPOSAL REGISTER

**This appendix exists because Group 9's primary defect is not a novel design error. It is the re-proposal of mechanisms that a binding blueprint had already struck by name.**

| # | Mechanism | Struck by | Verbatim | Group 9 draft | Now |
|---|---|---|---|---|---|
| RP-1 | "Distress Interception" premium tier | G1 §II.8.4 | *"The Group 9 draft's 'Distress Interception' premium tier is **withdrawn**…"* | Shipped as a headline `broker_residential` feature | **I-36** + `distress-tier-lint` |
| RP-2 | HELOC referral bounty | G1 §II.8.3 | *"…any per-referral bounty; any % of loan amount — RESPA §8(a)/(b); **the Group 9 'HELOC referral bounty' is deleted**."* | Shipped as a `$SHQL` smart-contract sweep | **I-32** + `respa-lint` |
| RP-3 | Fee contingent on a referred consumer transacting | G1 §II.8.3, Broker row | *"**Forbidden:** fee contingent on a referred consumer transacting."* | Shipped as *"micro-transaction fees… when a broker's listing successfully closes"* | **§II.11.3** + `settlement-revenue-lint` |
| RP-4 | Entitlement widening a data scope | G1 §II.8.1; G2 §II.1.3 (G2-09 🔴) | *"An entitlement… can never gate whether a row is readable."* | Shipped as *"High-tier SaaS subscription fees for access to… data"* | **I-2** + `entitlement-scope-lint` |
| RP-5 | Parcel-level opportunity scoring | G1 §II.5.3 #5; G2 A1; G3 A19; G4 A32; G6 A54; G7 A68 | *"No derived distress scores… the platform must not rank, alert, or recommend."* | Shipped as *"built-FAR caps for finding off-market sites"* | **§II.6.3** + `score-lint` |
| RP-6 | An escrow holder determining its own release condition | G4 §II.7.3 | *"No authority to determine breach at all."* | Shipped as the *"refundable"* Data Room Access Escrow | **I-33** + `principal-info-fee-lint` |
| RP-7 | A chain event moving title or its proceeds | G1 §II.6.3 #6 | *"Title transfer occurs only at a recorded closing through licensed settlement."* | Shipped as *"the smart contract executing the deed transfer"* | **I-35** + `settlement-only-lint` |

**Seven re-proposals in a 46-line draft.** Six of the seven are 🔴.

## D.1 Why this happened, and the control

The draft blueprints were written **in parallel**, before the master blueprints existed. Group 9's draft could not have known what Group 1's audit would strike. That is not a failure of the author — it is a **failure of the pipeline**, and it will recur on every remaining group and on every future revision, because a corpus in which deletions do not stick re-ships every vulnerability it has ever fixed.

**The control, owed to IBM Bob's `Plan.md` and to every future blueprint revision:**

```
architecture/00_legacy_and_core/STRUCK_MECHANISMS.md   ← NEW, and machine-readable

One row per mechanism any master blueprint has withdrawn, deleted, or barred:
    id · mechanism · striking blueprint and section · verbatim quote ·
    the invariant that now enforces it · the lint that fails the build

RULES:
  1. Every new or revised blueprint is checked against this register BEFORE drafting.
     A re-proposal must either not appear, or appear with an explicit argument for
     why the striking rationale no longer holds — never silently.
  2. `Plan.md` and `Tasks.md` are checked against it before task generation. A task
     implementing a struck mechanism is a blocking review failure, not a code-review
     comment.
  3. Every entry names its LINT. A struck mechanism with no lint is not struck; it is
     merely disapproved, and disapproval does not survive a sprint.
  4. The register is append-only. An entry is retired only by a named decision
     recorded in the register itself, with the reasoning.
```

**Seed it with the seven rows above, plus the equivalents from Groups 2–7** — the withdrawn Macro-Distress Map (G2-03), the drag-along (G1-10), the demand map (G5-10), the density-arbitrage score (G6-10), the council voting-behaviour map (G6-04), the rent benchmark (G7-30), and the eviction-risk score (G7-19). That is the corpus's accumulated judgment in one file, and it is currently held nowhere.

---

# APPENDIX E — Traceability to `rbac-audit-red-team.md`

| Prior finding | Status for Group 9 | Resolved at |
|---|---|---|
| VULN-01 `escrow/release` has no DB-layer role gate | **Structurally foreclosed for this group.** No broker sub-role holds the `escrow` segment, no Group 9 surface holds funds, and `commission_disbursable()` gates on a recorded settlement, a licensed payee brokerage, an elapsed claim window, and no open claim | §III.7, §III.2 |
| VULN-02 `violations` readable by all investors globally | Same shape, applied to representations and confidences: a group-string policy would expose every brokerage's book. Closed structurally — `'broker'` appears in no Group 9 predicate | §III.3, I-1 |
| VULN-03 `properties_investor_discovery` exposes all properties | The Group 9 analogue is the off-market prospecting map, closed by inheriting G2 §II.5.1's four lawful sources, the Provenance Registry, and the tile-service aggregation floor | §II.6.2, §II.6.3 |
| VULN-04 `compliance_checks` has no INSERT policy | Group 9 supplies licence standing, E&O, MLS participation, and capability posture as compliance inputs; **absence resolves to `disabled`** rather than defaulting open | §II.2.3 |
| VULN-05 attorneys read all agreements cross-tenant | Directly analogous and closed the same way: `compensation_agreements` is readable by the **parties only**, which is simultaneously the confidentiality fix and what makes the I-31 rate aggregate unbuildable | §III.3 |
| VULN-07 proxy-signing on `PATCH /api/agreements` | Directly relevant: a broker must never acknowledge a disclosure or execute an agreement on a principal's behalf. The disclosure endpoint records the **principal's** acknowledgement; no endpoint accepts a `party_user_id` override | §III.6 |
| VULN-08 `connections_update` self-accept | Same shape as the listing mandate: a brokerage cannot grant itself a representation. `ar_licensee_write` requires the caller to be the licensee, and the listing mandate derives from the principal's act | §III.3 |
| VULN-09 `milestone-upload` has no role check | Analogue: marketing assets require `has_listing_mandate` plus a passed fair-housing screen plus, for machine-generated copy, an explicit authorship act | §II.8.3, §III.1.3 |
| DESIGN-01 `parties[].role` free text | Resolved — `agency_representations(principal, licensee, brokerage, agency_side)` and `broker_seats(brokerage, user, broker_seat_role)`, both enum-typed | §III.1.2 |
| DESIGN-02 `current_user_role()` strict enum rejects new sub-roles | **Directly triggered by this group and resolved here.** `0048` adds the three `broker_*` values — the first migration in the corpus to expand the enum since Group 4's `0027` | §III.1.1 |
| DESIGN-03 layout `ALLOWED_ROLES` sets | Resolved — a new `(brokerage)` route group and layout gate; the gate is coarse routing, the boundary is `is_representation_party()` | Appendix F item 4 |

---

# APPENDIX F — Required Deltas to `phase8-sub-role-expansion-plan.md`

1. **BLOCKING — T8.1's enum is missing three keys, and the corpus arithmetic depends on them.** Phase 8 defines 22 values. Group 4 Appendix D reconciled the corpus to **27** by counting `22 + 3 (Group 9 brokers) + legal_arbitrator + contractor_logistics`, and Groups 5, 6, and 7 each restated 27 and added nothing. **The three broker keys were never defined anywhere** — not in `phase8-sub-role-expansion-plan.md`, not in `shtiya_builder-role-taxonomy.md` (which has no Group 9 section at all), not in `ROLE_APP_MAP`, and not in any migration. Migration `0048` (§III.1.1) adds `broker_commercial`, `broker_residential`, and `broker_leasing`, closing the count at a **defined 27**. Until it applies, a broker cannot authenticate.

2. **BLOCKING — T8.2 must be written for the Group 9 policies from the outset.** T8.2's pattern is to widen policies to `current_user_role_group()` group checks. Applied to Group 9 tables it ships **G9-27**: every brokerage reads every competitor's representations, principal confidences, listings, pipelines, data rooms, and compensation agreements. That is a fiduciary breach for every licensee on the platform, a disciplinary exposure against licences the platform does not control, and it reconstructs the cross-brokerage commission aggregate that I-31 exists to prevent. Use `0052_group9_rls.sql` (§III.3).

3. **BLOCKING — a new `brokerage` app segment is required.** `ROLE_APP_MAP`'s ten segments contain no home for this group, and reusing `owner`, `acquisition`, or `property` would grant the maximum-blast-radius role someone else's surface (G9-20). Add `brokerage` as an eleventh segment with `src/app/(apps)/(brokerage)/`. Per §III.7: `broker_commercial: ['brokerage','acquisition']`, `broker_residential: ['brokerage']`, `broker_leasing: ['brokerage','property']` — and **no broker sub-role holds `escrow`**, the deliberate parallel to `legal_arbitrator: ['legal']`.

4. **T8.5 — layout gates.** A new `(brokerage)/layout.tsx` gated on the three broker keys plus `admin`. It is coarse routing and not a security boundary; `brokerage_manifest()` is, and a walled workspace is absent from it rather than denied by it (§II.3.3).

5. **New tasks T8.43–T8.47.** Migrations `0048`–`0052` (§III.1), sequenced after the Group 7 set `0043`–`0047`. `0048` must run **before** any Group 9 RLS or fixture task, because it carries the enum expansion everything else depends on.

6. **T8.3 — `ROLE_GROUP_MAP`.** All three keys map to a new `broker` group string. `current_user_role_group()` gains three branches. **The string is for coarse nav routing only and is barred from every Group 9 row-access predicate** by I-1, CI-enforced by the extended `policy-lint`.

7. **T8.4 — API guards.** Every Group 9 route must call `assertRepresentationParty()` or `has_listing_mandate()`; every compensable act must call `assertMayAct()`; every disbursement must call `assertCommissionDisbursable()` (I-35); every tour and unmasked view on a residential buyer side must call `assertBuyerAgreementOnFile()`; every solicitation must call `assertMaySolicit()` with the relayed principal where present (I-30); every study surface must call `evaluateReliance()`. None exist in the plan.

8. **T8.6 — fixtures.** The three broker personas need: a `brokerages` row at R2 with a firm licence, a `licensees` row with a `broker_licences` row **matching the test property's state**, a `broker_seats` row, `broker_eo`, a `broker_capability_matrix` row for the test state, and an `mls_participations` row for the syndication tests. A **second, unrelated brokerage** is required, as is a **walled pair** of representations at one brokerage, an `unlicensed_admin` seat, and a **principal** persona on each side.

   Tests must assert, at minimum:
   - a second brokerage reads **nothing** of the first's representations, confidences, listings, or compensation agreements (G9-27);
   - a walled licensee cannot read the walled representation **and it is absent from the manifest** (G9-02);
   - a representation cannot reach `active` without a delivered agency disclosure (§II.4.2);
   - a `dual_agent` representation in a prohibiting state is rejected **with full consent present** (I-34);
   - the consented `seeking_exit` feed returns **byte-identical results at the free and enterprise tiers** (I-2, G9-14);
   - no commission default, placeholder, or aggregate exists anywhere in the bundle, API, templates, or seed data (I-31);
   - a commission disbursement is unreachable from any chain event (I-35);
   - a disbursement to an individual payee is rejected (G9-11);
   - a data-room grant accepts **no fee parameter and no fee column exists** (I-33);
   - a broker reaches **no** Group 7 Class-T element and **no** Group 1 distress state, at any tier (G9-20, G9-30);
   - a relayed solicitation is blocked when the **relayed principal's** cluster is suppressed, even where the brokerage's is not (I-30).

9. **New task — `shtiya_builder-role-taxonomy.md` has no Group 9 section.** The canonical taxonomy document defines Groups 1–7 only. Group 9's three sub-roles have no taxonomy entry describing their motivation, map permissions, integration points, or financial triggers — the five columns every other role carries. Part II of this document supplies the content; the taxonomy file must be updated to match, or it will continue to disagree with the enum, the plan, and the code.

10. **New task — `STRUCK_MECHANISMS.md`.** Appendix D specifies it. It is a pipeline control rather than a Group 9 feature, but Group 9 is the group that proved it is needed, and it is a prerequisite for Groups 8 and for every blueprint revision thereafter.

11. **Taxonomy count: 27, and now defined.** Group 9 introduces no keys beyond the three the corpus has been counting since Group 4 Appendix D and has never had. After `0048`, `select enum_range(null::user_role)` returns 27 values and the arithmetic in Groups 4, 5, 6, and 7 becomes true rather than assumed.

---

**END OF MASTER BLUEPRINT — GROUP 9**
