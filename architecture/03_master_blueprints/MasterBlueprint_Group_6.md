# MASTER BLUEPRINT — GROUP 6: THE DESIGN (ARCHITECT & ENGINEER)

**Document class:** Production Architecture Specification
**Supersedes:** `architecture/02_draft_blueprints/06_group_the-design_architects-engineers.md`
**Version:** 2.0 (Red-Teamed / Hardened)
**Date:** 2026-08-19
**Taxonomy scope:** 3 sub-roles — `arch_ra`, `arch_engineer`, `arch_zoning`
**RLS group string:** `architect` — **and this document removes it from the security boundary**
**Counterparty blueprints:** `MasterBlueprint_Group_1.md` · `_Group_2.md` · `_Group_3.md` · `_Group_4.md` · `_Group_5.md` v2.0 — **binding**; Appendix A is the boundary contract
**Stack:** Next.js 14 App Router · Supabase Postgres + RLS · Zustand Context Registry · Vercel AI SDK · Mapbox GL · $SHQL settlement rail

---

## 0. How To Read This Document

| Part | Contents |
|---|---|
| **Part I** | Red Team Audit — 26 findings, ranked, with exploit paths |
| **Part II** | Hardened Architecture — the corrected design |
| **Part III** | Implementation Spec — schema, RLS, API contracts, TS types |
| **Part IV** | Verification — RBAC matrix, acceptance criteria, telemetry |
| **Part V** | Residual Risk & Board / Regulatory Review Queue |
| **Appendix A** | Boundary contract with Groups 1–5 |
| **Appendix B** | **The Independence Pattern** — one problem, now solved five times |
| **Appendix C** | Traceability to `rbac-audit-red-team.md` |
| **Appendix D** | Required deltas to `phase8-sub-role-expansion-plan.md` |

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt

---

# PART I — RED TEAM AUDIT

## 0.1 Executive Verdict

**Group 6's output is not files. It is professional judgment, sealed, with a named individual's licence and personal liability behind it.** The draft models the files exhaustively — vaults, versions, parsers, gigabytes — and never once models the seal.

Everything follows from that omission:

1. **A click is substituted for a legal instrument.** *"The engineer uses this portal to issue the cryptographic sign-offs required to validate foundation and framing integrity."* A structural observation is a sealed report under IBC Chapter 17, and the sealed document is what the building department accepts and what the engineer's professional liability attaches to. A platform signature is neither. The draft builds a system in which a click releases money while the artifact that carries the legal and safety weight may never exist — and where the engineer's personal exposure attaches to something the platform did not create.

2. **The person whose judgment protects the public is paid by the party who benefits from a "yes."** The draft calls the engineer *"the ultimate, unyielding arbiter of physical safety"* and makes their approval *"the deterministic key that unlocks the $SHQL escrow."* It never says who pays them. If the developer or GC does — and in construction that is the default — then the safety judgment sits inside the same incentive structure that Group 3 §II.9.5 fixed for inspectors and Group 4 §II.5.3 fixed for arbitrators, at higher stakes than either. There is also no way for the engineer to say anything other than yes: no conditional approval, no deficiency list, no stop, and no protection for the engineer who halts a pour.

3. **Compensation is made contingent on government decisions.** The zoning consultant is paid *"strictly upon the successful, verified issuance of a zoning variance"*; the architect *"upon permit approvals."* Contingent compensation for obtaining a discretionary government approval is restricted or banned by contingency-lobbying rules in many jurisdictions, generally requires lobbyist registration the draft does not model, and places the consultant's entire income on a councilmember's vote. The draft then supplies, as a map layer, *"historical paths of city council voting behavior regarding variances"* — an influence-targeting product shipped alongside the incentive to use it.

4. **A machine-extracted quantity take-off sizes a construction loan.** *"The system completely eliminates manual quantity take-offs… instantly outputs the exact lumber, concrete, and steel requirements"*, and that BoQ *"directly informs the Institutional Lender of the exact capital required."* BIM-to-quantity extraction is highly sensitive to model level of development, family classification, and modelling convention; it carries no waste factors, allowances, or site conditions. The draft declares none of that, attributes the output to nobody, and wires it straight into a facility size and a contractor's bid basis. The architect gets the liability for a take-off they did not perform.

5. **The architect's copyright, licence, and non-payment leverage are all absent.** Files are vaulted, parsed, distributed to contractors, shown to lenders, and placed in investor data rooms, with no licence grant, no scope limit, no term, no derivative rules, and no suspension right on non-payment. That suspension right is the architect's equivalent of the subcontractor's mechanic's lien — and this draft removes it exactly as Group 5's draft removed liens, and for the same reason: it reads as friction.

**The honest reframe.** The platform's defensible product for this group is not storage and it is not parsing. It is **making the seal work harder than paper ever let it**: an observation record that proves the engineer was on site before they sealed, a version state machine that guarantees the trades are building from the drawing that is actually current for construction, a BoQ whose confidence and exclusions travel with it into the lender's underwriting, and a licence whose scope and payment status are enforceable rather than aspirational. Part II builds that.

## 0.2 Finding Register

| ID | Sev | Domain | Finding |
|---|---|---|---|
| G6-01 | 🔴 | Seal | "Cryptographic sign-off" is not a professional seal; the legal artifact may never exist |
| G6-02 | 🔴 | Independence | The safety arbiter is paid by the party who benefits from approval |
| G6-03 | 🔴 | Corruption | Zoning fees contingent on a discretionary government approval; no lobbying registration |
| G6-04 | 🔴 | Corruption | Council voting-behaviour map is an official-influence targeting product |
| G6-05 | 🔴 | Liability | Machine-extracted BoQ sizes a loan and a bid, with no LOD, confidence, or attribution |
| G6-06 | 🔴 | Seal | Seal-without-observation: nothing requires the engineer to have been on site |
| G6-07 | 🔴 | IP | No copyright, licence grant, scope, term, or non-payment suspension right |
| G6-08 | 🔴 | RBAC | Three sub-roles collapse to group `architect` — competitor design IP is cross-readable |
| G6-09 | 🔴 | Payment | Architect paid on permit approval — bearing municipal risk they cannot price or control |
| G6-10 | 🟠 | Data | "Density arbitrage opportunity" is a parcel-level acquisition score aimed at Group 1 |
| G6-11 | 🟠 | Privacy | Intent Aggregator puts owner-signed intents into a public hearing record |
| G6-12 | 🟠 | Seal | Binary sign-off only — no conditional approval, deficiency list, or stop disposition |
| G6-13 | 🟠 | Extortion | Fee disputes can ride on a safety judgment, in both directions |
| G6-14 | 🟠 | Licensure | Per-state licensure and stamp authority unmodelled; no seal-holder individual |
| G6-15 | 🟠 | Liability | No professional liability (E&O) verification for a group whose output *is* a liability |
| G6-16 | 🟠 | Records | "Immutable repository" conflicts with correction, supersession, and retention duties |
| G6-17 | 🟠 | Coordination | No clash detection, RFI, or submittal workflow — disputes originate off-record |
| G6-18 | 🟠 | Versioning | "Eliminates version control chaos" with no issued-for-construction state |
| G6-19 | 🟠 | Data | Geotechnical findings are material facts with unmodelled disclosure consequences |
| G6-20 | 🟠 | Monetization | Software affiliate commissions steer a professional's tool choice, undisclosed |
| G6-21 | 🟡 | Monetization | Per-gigabyte hosting fees against records with statutory survival obligations |
| G6-22 | 🟡 | UI | Flat portal; the workspace unit should be the design package |
| G6-23 | 🟡 | Integration | No AHJ or plan-check integration despite a workflow that assumes one |
| G6-24 | 🟡 | Seal | Substitution of a dissenting engineer is unmonitored — opinion shopping |
| G6-25 | 🟢 | UX | Gigabyte uploads, parse latency, and native-tool round-trip are unaddressed |
| G6-26 | 🟢 | Taxonomy | `arch_zoning` holds `legal` app access with no matter-role basis |

---

## 1. The Seal, Observation & Independence

### G6-01 🔴 A cryptographic sign-off is not a professional seal

**Draft text:** *"The engineer uses this portal to issue the cryptographic sign-offs required to validate foundation and framing integrity."* And: *"A General Contractor cannot receive the initial foundation draw until the `arch_engineer` digitally and cryptographically signs off on the rebar, trenching, and soil compaction."*

**Finding.** Structural observation of rebar placement, trenching, and compaction produces a **sealed report** under the applicable building code's special-inspection and structural-observation provisions. The document the building department accepts, the document the owner's insurer relies on, and the document to which the engineer's personal professional liability attaches, is the sealed instrument — bearing the licensee's stamp, licence number, jurisdiction, expiry, and the statutory attestation language for that state.

A platform-generated cryptographic signature is none of those things. It is not recognized by any authority having jurisdiction, it does not satisfy any code provision, and it does not carry the statutory language.

**The exposure runs the wrong way.** The engineer's licence and personal liability are engaged by their professional judgment regardless of what the platform records. So the draft produces a system where the engineer bears full professional exposure for a determination the platform captured as a button press, with no sealed artifact to defend, no statement of what was observed, no limitations, and no scope. When a foundation fails, the engineer's defence is a database row.

`FIX →` §II.5 Seal & Observation Architecture. The seal is an **instrument**: a sealed document with jurisdiction-correct stamp content and attestation language, produced by the licensee, hashed and stored. The platform records and transports it; the platform never computes its validity and never substitutes for it.

---

### G6-06 🔴 Seal without observation

**Finding.** Nothing in the draft requires the engineer to have been on site. The workflow is: milestone reached → engineer signs → escrow unlocks. Every party's cash flow is waiting on that click, and the click is available from anywhere.

Sealing an observation report for work one did not observe is professional misconduct in every US jurisdiction and is criminal in several. The draft does not merely fail to prevent it — its incentive structure **pressures toward it**. A GC with a crew standing down and a lender's window closing is calling the engineer, and the engineer's alternative to clicking is a two-hour drive.

**Exploit.** The GC photographs the rebar, texts it to the engineer, and the engineer seals from the office. If the placement is wrong, the failure surfaces months later in a structure carrying people.

`FIX →` §II.5.3 Observation Provenance — a sealed observation report **cannot be created** without a recorded site visit carrying the Group 5 §II.6.2 provenance bundle: server-issued nonce, in-app capture, device attestation, geofence against the parcel, and attested timestamp, bound to the **individual seal-holder** rather than a firm account. Remote review is a distinct, separately labelled disposition that **cannot** satisfy an observation requirement and is disclosed as such to every downstream party.

---

### G6-02 🔴 The safety arbiter is paid by the party who benefits from approval

**Draft text:** the engineer is *"the ultimate, unyielding arbiter of physical safety"* whose approval is *"the deterministic key that unlocks the $SHQL escrow, ensuring that capital is never, under any circumstances, deployed into a structurally compromised foundation."*

**Finding.** The draft never says who pays the engineer. In construction the default is the developer or the GC — which means the person whose judgment protects the public is retained, paid, and renewable by the party whose money is released when they say yes, standing next to them on site while the crew waits.

This is not a novel problem in this corpus. It is the **fifth appearance of the same structure**, and the ecosystem has already answered it four times:

| Group | Neutral | Resolution |
|---|---|---|
| G3 §II.9.5 | Construction inspector | Rotation pool, project-funded inspection escrow, paid regardless of outcome |
| G4 §II.5.3 | Arbitrator | Platform never selects; compensation fixed at appointment, paid regardless of outcome |
| G4 §II.7.3 | Escrow holder | No authority to determine breach at all |
| G5 §II.9.5 | — | Delivery counter-signature so no single interested party confirms |
| **G6** | **Structural observer** | **Re-imports the defect, at the highest stakes in the system** |

**Exploit — and it does not require bad faith.** Marginal compaction, a pour scheduled for tomorrow, weather closing in, and an engineer who will be re-engaged on the developer's next four projects. Nobody bribes anybody. The judgment simply drifts, systematically, in one direction, and the platform's automation removes the friction that used to slow it.

**Aggravating factor.** The draft gives the engineer **no way to say anything but yes** — see G6-12.

`FIX →` §II.6 Independence & Compensation. Structural observation is compensated from a **project-funded observation escrow** established at closing, fixed at engagement, and **paid in full regardless of disposition**. The engineer of record for observation is engaged for the project, not per visit, and cannot be dismissed mid-project without the §II.6.4 substitution protocol. This is Appendix B's pattern, applied a fifth time.

---

### G6-12 🟠 Binary sign-off with no gradations

**Finding.** Real structural observation produces deficiency lists, required corrections, re-observations, and occasionally a stop. The draft offers one output: the signature that unlocks escrow. An engineer facing work that is 95% right must either release money on deficient work or halt the project.

`FIX →` §II.5.4 Graduated Dispositions — `observed_conforming` · `conforming_with_conditions` (conditions tracked to closure) · `deficiency_list` (itemized, re-observation required) · `non_conforming_stop`. Each disposition is a sealed instrument. Only `observed_conforming` and a closed-out `conforming_with_conditions` satisfy the Group 3 §II.9.2 gate; the others are recorded, transmitted, and paid for identically.

---

### G6-13 🟠 Fee disputes riding on a safety judgment

**Finding.** Two mirrored extortion paths, both live in the draft:

- **Engineer → project.** An unpaid engineer withholds the foundation sign-off. Because that signature is the deterministic escrow key, one professional's fee dispute freezes the GC's draw, the subs' splits, and the supplier's settlement.
- **Project → engineer.** *"Seal it or we replace you and you are not paid for the work you have done."* The draft has no substitution protocol, so replacement is unlogged and unlimited.

`FIX →` §II.6.3 and §II.6.4 — the observation escrow is funded at closing and released on **disposition rendered**, not on disposition content, which removes the engineer's incentive to withhold and the project's ability to threaten. Fee disputes route to the Group 4 §II.5 forum and can **never** be raised as a condition of, or resolved through, a safety determination. Substitution is permitted but logged with a stated reason; the incoming engineer must **independently observe** and cannot adopt a predecessor's disposition; and serial substitution raises review (§II.6.4, G6-24).

---

### G6-24 🟡 Opinion shopping through substitution

**Finding.** Nothing prevents a developer from cycling engineers until one seals. The dissenting engineer's `deficiency_list` or `non_conforming_stop` vanishes with them, because the draft has no record that survives the engagement.

`FIX →` §II.6.4 — a superseded disposition **persists on the project record** and is disclosed to every subsequent engineer of record, to the lender, and to the AHJ package. An incoming engineer must acknowledge the prior disposition before rendering their own. Substitution frequency is monitored per developer and per GC.

---

## 2. Government Decisions, Influence & Compensation

### G6-03 🔴 Contingent compensation for a discretionary approval

**Draft text:** *"The Zoning Consultant is compensated via $SHQL smart contracts that execute strictly upon the verified issuance of a zoning variance or the formal recordation of a new parcel map."* The taxonomy adds that this *"aligns the consultant's financial incentives perfectly with the risk profile of the Master Assembler."*

**Finding.** It aligns them with the assembler and misaligns them with everything else. Contingent compensation for obtaining a discretionary government approval is prohibited or restricted by contingency-lobbying rules in many states and municipalities precisely because it converts a professional's entire income into a stake in a specific official decision. Compounding it:

- **No lobbyist registration or disclosure** is modelled anywhere, though appearing before a planning commission on a client's behalf for compensation triggers registration in many jurisdictions.
- **No gift, contribution, or interaction rules.** Group 4 §II.8.3 built anti-corruption controls for expediters dealing with building-department staff. This is the same hazard one tier up — elected officials, discretionary votes, and far larger sums — with none of the controls.
- **The automation makes it worse.** A smart contract that pays on variance issuance creates a permanent, immutable, publicly-inspectable record of a contingent payment tied to a specific official act. That is not merely a violation; it is a violation with an evidence trail the platform built and retained.

`FIX →` §II.6.5 — compensation is milestone-based on **work performed** (research memo delivered, application submitted, plan-check response filed, hearing attended), never on outcome. Where a jurisdiction permits contingency and the consultant is properly registered, a **bounded** success bonus is allowed as a declared, capped, disclosed component. Lobbyist registration status is verified per jurisdiction and gated at dispatch; interactions with public officials are logged per §II.6.6; and the anti-corruption regime from Group 4 §II.8.3 is inherited in full.

---

### G6-04 🔴 The council voting-behaviour map is an influence-targeting product

**Draft text:** *"The layers display exact Floor Area Ratios, conditional use permit zones, and **historical paths of city council voting behavior regarding variances**."*

**Finding.** Rendering, geographically, how individual public officials vote on discretionary land-use approvals, to a paid consultant whose compensation depends on those votes, is an official-influence targeting layer. Voting records are public — but the product here is not the record, it is the **derived predictive model of an official's behaviour, sold as a subscription, to the party with a contingent financial stake in changing it**.

Put the two findings together and the draft ships, in one product, the map of which officials can be moved and the incentive to move them.

`FIX →` §II.9.4 — official-level voting prediction is **withdrawn**. What remains is legitimate and sufficient: jurisdiction-level approval-rate statistics by application type, median timelines, and the published record of decisions — aggregated to the body, never modelled per official, never predictive, and never joined to a specific pending application. This is the same treatment Group 4 §II.8.4 gave the enforcement-sweep layer and Group 3 §II.6.1 gave credit geography.

---

### G6-09 🔴 The architect bears municipal risk they cannot price

**Draft text:** *"The architect is paid their design fees in $SHQL via automated milestone releases tied directly to municipal permit approvals."*

**Finding.** Permit approval depends on plan-check backlogs, staff turnover, policy changes, neighbour appeals, and the owner's willingness to fund revisions — almost none of which the architect controls, and none of which they can price. An architect who completed and sealed a compliant design and is unpaid for eleven months because the city is slow is financing the municipality.

There is a second, subtler harm: an architect whose payment depends on getting through plan check is under pressure to **under-design to the path of least resistance** — value-engineering out of the drawings whatever the reviewer is likely to question. That pressure runs against the professional obligation the seal represents.

`FIX →` §II.6.5 — design fees are milestone-based on **deliverables produced** (schematic set, design development, construction documents, permit set submitted, plan-check responses issued), each releasing on delivery and acceptance. Permit issuance may carry a bounded completion bonus; it is never the trigger for the base fee.

---

## 3. The BoQ, Liability & IP

### G6-05 🔴 A machine take-off sizes a loan with no attribution

**Draft text:** *"The system completely eliminates manual quantity take-offs. The vault parses the uploaded CAD files and instantly outputs the exact lumber, concrete, and steel requirements."* Then: *"This BoQ directly informs the Institutional Lender of the exact capital required."*

**Finding — a liability transfer with nobody at the receiving end.**

BIM-derived quantities are only as good as the model's level of development, family classification, and modelling conventions. An LOD 200 model yields an order-of-magnitude estimate; an LOD 400 model yields something near-constructible. Extraction misses generic families, misclassifies assemblies, and inherently carries **no waste factors, no allowances, no site conditions, and no means-and-methods**. The word "exact" is wrong in every one of those dimensions.

Now trace the consequences. That number sizes a Group 3 construction facility (§II.5). It becomes the basis of a Group 5 sealed bid (§II.8.4). It funds an escrow that Group 1 and Group 2 users draw against. **If it is 18% light, the project runs out of money at 82% complete** — the single most destructive outcome in construction, and the one where the lender's collateral is a half-built structure.

**Whose liability?** The draft never says, which in practice means the architect's, because the BoQ is presented as flowing from their model. They are then liable for a quantity survey they did not perform, did not review, and may not have seen.

`FIX →` §II.7 BoQ Provenance & Attribution — every BoQ carries a declared **LOD**, extraction method and version, per-line confidence, an explicit exclusions list (waste, allowances, site conditions, means and methods), and an **attribution state**: `machine_extracted` (advisory only) or `professional_verified` (a named licensee accepted it, with their own scope statement). **A `machine_extracted` BoQ cannot size a facility or serve as a bid basis** — Group 3 and Group 5 must see the attribution before consuming it, and their gates reject unverified input.

---

### G6-07 🔴 No copyright, licence, scope, term, or non-payment right

**Finding.** Architectural works and technical drawings are copyrighted, and absent a written transfer the design professional owns them; the owner receives a limited licence for the project. The draft models none of it. Files are "vaulted," then parsed, extracted into trade packages for Group 5 (§II.9.4), shown to Group 3 lenders, and placed in Group 2 investor data rooms (§II.9.4) — with no grant instrument, no scope limitation, no term, no derivative-work rules, no attribution requirement, and no revocation.

**The missing right is the important one.** Standard owner-architect agreements make the licence conditional on payment and permit its suspension when fees are unpaid. That suspension is the architect's principal commercial leverage, and it is the direct analogue of the subcontractor's mechanic's lien — which **Group 5's draft removed, for the same reason, using the same reasoning: it read as friction.** This is the second time in this corpus that a group's draft quietly deletes the one protection its users depend on.

**Exploit.** Developer receives the permit set, stops paying, terminates the architect, and hands the vaulted files to a cheaper firm to complete. Under the draft, the files remain distributed, the trade extracts keep flowing, and the architect has no mechanism. They also remain the sealing professional of record on drawings someone else is now modifying.

`FIX →` §II.8 IP, Licence & Records — an explicit `design_licences` grant with grantor, grantee, scope (this project, this site), permitted uses, derivative rules, attribution, and term; **non-payment suspension as a first-class right** with platform assistance (notice generation, cure period, deadline tracking) exactly mirroring Group 5 §II.5.4's lien assistance; and an absolute rule (I-19) that exercising it never affects platform standing, ranking, or eligibility.

---

### G6-18 🟠 "Eliminates version control chaos" with no issued-for-construction state

**Finding.** The draft claims to solve version control by vaulting. Vaulting is storage. The actual failure mode in construction is **building from a superseded drawing**, and preventing it requires a state machine that names exactly one current-for-construction revision per discipline per package — which the draft does not have.

This directly breaks a Group 5 dependency: §II.9.4 requires trade CAD **extracts**, and an extract generated from a drawing that has since been superseded is a defect delivered at scale to every trade on the package.

`FIX →` §II.8.3 Revision State Machine — `draft → issued_for_review → issued_for_permit → issued_for_construction → superseded → void`, with exactly one `issued_for_construction` revision per discipline per package at any time. **Group 5 trade extracts derive only from `issued_for_construction`**, carry the revision identifier, and are invalidated automatically on supersession with notification to every holder.

---

### G6-16 🟠 Immutability against correction and retention duties

**Finding.** *"Centralizes massive soil reports and structural load calculations into a single immutable repository."* Group 4 G4-22 established the general problem; Group 6 has a sharper version. A preliminary geotechnical report that is later corrected, a calculation set with an error found in review, a drawing issued and then voided — all must be correctable in a way that preserves the audit trail without leaving the erroneous document standing as current. Separately, design professionals carry **statutory record-retention obligations** running years past project completion, which can outlive both the subscription and the firm.

`FIX →` §II.8.5 — the Group 4 §II.6.5 lifecycle inherited: supersession chains rather than silent edits, tombstones preserving existence and hash, jurisdiction-aware retention, legal holds. Plus a **records-survival guarantee** (§II.11.2): retention obligations outlive subscription state and firm dissolution.

---

## 4. Data, Privacy & Coordination

### G6-10 🟠 "Density arbitrage opportunity" is a parcel-level acquisition score

**Draft text:** *"Clicking a parcel immediately highlights the exact density arbitrage opportunity for the Master Assembler."*

**Finding.** This computes, per parcel, the delta between current and maximum permissible density and presents it as an acquisition opportunity — a parcel-level score over specific homeowners' property, framed for the benefit of the party trying to buy it. It is the **fifth appearance** of the pattern Group 1 §II.5.3 #5 prohibited: Group 2's distress heatmap (G2-03), Group 3's credit-quality map (G3-02), Group 4's enforcement-sweep layer (G4-23), and now this.

**But the Group 4 precedent governs the resolution, not a blanket withdrawal.** Zoning data is public, and a zoning consultant working entitlements has an entirely legitimate need for FAR limits, overlays, and permitted-use tables. The defect is the *scoring overlay* and the *acquisition framing* — "here is the arbitrage, for the assembler" — not the underlying facts.

`FIX →` §II.9.3 — public zoning facts render **unranked**: FAR, overlays, permitted uses, setbacks, height limits, SB-9 eligibility criteria as stated criteria. The **arbitrage score, the opportunity ranking, and the assembler-directed framing are withdrawn.** Owner contact runs through the Group 1 §II.5.4 consent ladder without exception, and a parcel at `exposure_policy = 'private'` is unreachable for solicitation regardless of its zoning envelope.

---

### G6-11 🟠 Owner intents into a public hearing record

**Draft text:** *"Utilizes cryptographic intent-to-sell agreements generated by the Owner-Investor group to present a legally binding, unified front to the municipal planning commission."*

**Finding — two defects.**

1. **Consent scope.** Group 1 §II.6.2 established mutual-opt-in visibility for committee participation, and Group 4 §II.9.4 made owner-signed instruments purpose-bound with per-recipient grants and an owner-visible access log. Submitting those instruments to a **municipal planning commission** places them in a public record, permanently, before an audience the owner never contemplated — and planning commission submissions are generally subject to public-records law. This is irreversible in a way no other disclosure in the corpus is.
2. **"Legally binding" is false.** Group 1 §II.6.1 made JV intents explicitly **non-binding letters of intent** with rescission windows, precisely to avoid coercing consumer homeowners. Representing them to a government body as binding misrepresents the owners' position to a decision-maker and may induce reliance the owners can defeat.

`FIX →` §II.9.5 — submission to any public body requires a **separate, specific, per-owner consent** naming the body and acknowledging permanent public disclosure; a **redacted aggregate** form (parcel count and percentage, no identities, no terms) is the default; and any characterization of participation to a public body must accurately state its binding status.

---

### G6-19 🟠 Geotechnical findings are material facts with unmodelled consequences

**Finding.** Liquefaction indices, fault proximity, slope instability, and expansive soils affect value, insurability, buildability, and — in many states — the seller's affirmative disclosure obligations. The draft treats these as engineering documents in a vault and never asks who may see them or what seeing them obliges.

Both directions fail. If a Group 2 acquirer or Group 9 broker reaches an adverse report through the flat `architect` group (G6-08), they hold material non-public information about a parcel they may be trading. If the **owner** cannot reach a report commissioned on their own property, they cannot meet a disclosure obligation they carry personally.

`FIX →` §II.9.6 — geotechnical findings carry a **materiality classification**; the property owner always has access to reports on their own parcel; adverse findings trigger a disclosure-obligation prompt routed to Group 4; and access by any acquisition-side role requires deal membership plus an acknowledgement that the finding may be material to a transaction.

---

### G6-17 🟠 No clash detection, RFI, or submittal workflow

**Finding.** The draft has upload, parse, and version, but nothing for the architect and engineer to reconcile a conflict, and nothing for the GC to ask a question. In practice that means RFIs and submittals happen by email — and RFIs and submittals are precisely where construction disputes originate. Group 4's arbitration record and Group 3's draw evidence both assume a complete project record; the draft leaves a hole exactly where the contested facts live.

`FIX →` §II.10 — clash detection between disciplines at each issue; an **RFI workflow** with response clocks and a cost/schedule-impact flag; a **submittal workflow** with review dispositions; and a change-order linkage so that an RFI response carrying cost impact flows into the Group 5 §II.5.2 entitlement engine rather than surfacing later as a backcharge dispute.

---

## 5. Licensure, RBAC & Monetization

### G6-08 🔴 Three sub-roles, one group string, competitor IP cross-readable

**Finding.** `arch_ra`, `arch_engineer`, and `arch_zoning` all resolve to `architect`. Every policy gating on that string treats them as one scope. Consequences:

- **Any architect reads any other architect's BIM and drawings.** These firms compete for the same commissions. This is direct competitive-IP exposure, and it is also a copyright problem: the platform is enabling access to protected works outside any licence.
- Any user in the group reads any engineer's calculations and sealed reports — including reports carrying adverse findings on parcels they have no relationship to.
- `arch_zoning` additionally holds the `legal` app segment (Phase 8), with no matter-role basis after Group 4 §II.1 moved legal access onto matter membership (G6-26).

This is the same defect closed for lenders (G3-07), attorneys (G4-08), and contractors (G5-12), reaching the fifth group.

`FIX →` §II.1 Design-Package-Scoped Authorization. `is_design_package_party()` replaces the group string; **no Group 6 policy may use `current_user_role_group()` for row access except the literal `admin` branch.** `arch_zoning`'s `legal` segment is removed (Appendix D).

---

### G6-14 🟠 No seal-holder model, no per-state licensure

**Finding.** A design firm has principals, licensed staff, and unlicensed staff, and licensure is per state with limited reciprocity. Only a specific individual, licensed in the project's jurisdiction, may seal. The draft has one account per firm and verifies nothing.

This is the Group 5 G5-01 four-dimensional problem and the G5-22 crew problem, combined — and here the individual dimension is legally load-bearing, because the seal belongs to a person, not a company. Practising or stamping without licensure in the jurisdiction is criminal in most states.

`FIX →` §II.2 and §II.1.2 — `seal_holders` as individuals with per-jurisdiction licences (verified against the national records systems), discipline history, expiry, and stamp content per state; sealing is blocked unless the individual holds an active licence **in the project's jurisdiction** for the **discipline** required; and the identity-cluster inheritance from Group 2 §II.2.3 carries disciplinary history across re-registered firms.

---

### G6-15 🟠 No professional liability verification

**Finding.** For the one group whose entire deliverable is a liability instrument, the draft verifies no professional liability coverage. Downstream consequences are severe: lenders underwrite against sealed reports, owners rely on them, and several states require a certificate of merit from a licensed professional before a design-defect claim can even proceed — which presupposes an insured professional to claim against.

`FIX →` §II.2.4 — professional liability (E&O) verified with limits, retroactive date, and expiry; **claims-made policy gaps flagged explicitly**, since a lapsed claims-made policy leaves prior work uncovered; project-specific policies supported; a lapse blocks new sealing while leaving all prior work accessible (the Group 5 §II.7 prospective-only rule).

---

### G6-20 🟠 Affiliate commissions steer a professional's tool choice

**Draft text:** *"Affiliate commissions for software license referrals (e.g., user buys an AutoCAD seat through the portal)."*

**Finding.** A design professional's software choice affects deliverable quality, interoperability, and — on this platform specifically — how well the BoQ parser reads their model. A platform earning per seat has an incentive to steer that choice, and if its own extraction works best with the tools it earns on, the steering compounds and looks like a quality recommendation.

Small compared with Group 1's RESPA findings, but the principle established there applies: compensated routing of a professional decision requires disclosure and must not affect ranking.

`FIX →` §II.11.1 — affiliate relationships and compensation disclosed at the point of presentation; **no fee-weighted ranking or default selection**; parser compatibility published for all supported formats regardless of affiliate status; and no capability is gated on purchasing through the portal.

---

### G6-21 🟡 Per-gigabyte hosting against records with statutory survival

**Finding.** *"Data-hosting fees for vaulting massive, gigabyte-heavy geotechnical and BIM files."* The billing unit is the size of the professional record. When a firm stops paying — or dissolves — the files a building department, an insurer, a successor professional, or a litigant may need years later are exactly what the fee was attached to.

`FIX →` §II.11.2 — a **records-survival guarantee**: retention-obligated records remain accessible to the professional, the owner, and any party with a legal-hold interest regardless of subscription state, under the Group 1 §II.8.5 obligation lock. Storage pricing is per-firm-tier rather than per-gigabyte on retention-obligated records, so the fee never becomes a lever against a statutory duty. Export in open formats is always available.

---

### G6-25 🟢 Gigabyte uploads and native-tool round-trip

**Finding.** BIM and point-cloud files run to gigabytes; parse jobs take minutes to hours; and the draft's entire premise is that professionals keep working in Revit and AutoCAD. Yet there is no resumable upload, no background parse with notification, no desktop sync connector, and no round-trip so that a platform-side markup returns to the native environment. Without those, "vaulting" is a manual export chore appended to the real workflow, and it will be skipped.

`FIX →` §II.3.5 — resumable chunked upload with integrity verification; asynchronous parse with progress and notification; a desktop connector for watched-folder publication; native-format round-trip for markups and RFI responses; and derivative generation (viewables, trade extracts) decoupled from the upload path.

---

# PART II — HARDENED ARCHITECTURE

## II.0 Design Thesis

> **Group 6's product is not files. It is a seal — a named individual's professional judgment, carrying their licence and their personal liability.** The draft models gigabytes and never models the seal, so it builds a system where a click releases money, the legal artifact may not exist, and the person whose judgment protects the public is paid by the party who benefits from a yes.
>
> The platform's defensible contribution is **making the seal work harder than paper ever let it**: an observation record proving the engineer was on site before they sealed; a version state machine guaranteeing the trades build from the drawing that is actually current; a BoQ whose confidence and exclusions travel with it into the lender's underwriting; and a licence whose scope and payment status are enforceable rather than aspirational.

**Governing structural principles:**

1. **A seal is an instrument, never a gesture.** The platform records and transports it; it never computes its validity or substitutes for it. (§II.5)
2. **Observation precedes seal, provably.** (§II.5.3)
3. **A neutral is never paid by the party who benefits from their answer.** (§II.6, Appendix B)
4. **No compensation is contingent on a government decision.** (§II.6.5)
5. **Machine output is advisory until a named professional accepts it.** (§II.7)
6. **Access derives from a design-package role, never from a role group.** (§II.1)

---

## II.1 Authorization Model *(resolves G6-08, G6-14, G6-26)*

**Principle:** Group 1's primitive is the parcel, Group 2's the deal, Group 3's the facility, Group 4's the matter, Group 5's the work package. Group 6's is the **design package** — the scoped set of drawings, models, calculations, and seals for one project phase and discipline.

```
users.role         → coarse nav routing only. Never used for Group 6 row access.
practices          → the verified design firm (P0…P3 credential level)
seal_holders       → INDIVIDUALS with per-jurisdiction licences and stamp authority
design_packages    → the authorization primitive
dp_parties         → who is on this package and in what capacity
design_licences    → the IP grant (§II.8)
entitlements       → billing-derived feature flags. Never widens a data scope.
```

### II.1.1 Design-package roles

| `dp_role` | Reaches | Cannot |
|---|---|---|
| `architect_of_record` | Full package; issues revisions; grants licences | Seal outside their licensed jurisdiction or discipline |
| `engineer_of_record` | Own discipline in full; observation dispositions | Be dismissed mid-project outside §II.6.4 |
| `consultant` | Scoped discipline (zoning, civil, MEP) | Other disciplines' work product |
| `reviewer` | Read-only for coordination; comment and RFI | Issue revisions or seal |
| `owner_rep` | Deliverables at their licensed scope; not internal work product | Internal calculations, sketches, or superseded drafts |
| `downstream` (G3/G5 consumers) | **Issued-for-construction** revisions and verified BoQ only | Native models, internal work product, unverified extractions |

### II.1.2 The seal-holder model *(G6-14)*

```
seal_holders(practice_id, user_id, identity_hash, discipline, status)
professional_licences(seal_holder_id, jurisdiction, discipline, licence_number,
                      standing, expires_on, stamp_content, attestation_text)

· the seal belongs to a PERSON, not a firm
· sealing requires an active licence in the PROJECT'S jurisdiction for the
  REQUIRED discipline — blocked otherwise (I-17)
· stamp content and statutory attestation language are per state
· disciplinary history attaches to the IDENTITY CLUSTER (Group 2 §II.2.3) and is
  inherited by any re-registered practice
```

### II.1.3 Invariants

- **I-1** *(inherited)* No Group 6 RLS policy may use `current_user_role_group()` for row access except the literal `admin` branch. They call `is_design_package_party()`.
- **I-2** *(inherited)* No billing path holds any grant on practices, seal holders, licences, packages, or party rows.
- **I-17** *(new)* A seal cannot be applied without an active licence held by the sealing **individual** in the project's jurisdiction for the required discipline.
- **I-18** *(new)* An observation disposition cannot be created without a provenance-verified site visit by the sealing individual. (§II.5.3)
- **I-19** *(new)* Exercising a licence-suspension right on non-payment never affects platform standing, ranking, or eligibility. (§II.8.4 — the Group 5 I-15 analogue)
- **I-20** *(new)* A `machine_extracted` BoQ may not size a facility, serve as a bid basis, or fund an escrow. (§II.7)
- **I-21** *(new)* Observation compensation is released on **disposition rendered**, never on disposition content. (§II.6.3)

---

## II.2 Credentialing — The Professional Ladder *(resolves G6-14, G6-15)*

| Level | Proves | Evidence | Unlocks |
|---|---|---|---|
| **P0** | Nothing | Email, phone | Public zoning references, code library, aggregate statistics |
| **P1** | A real natural person | V1 IDV (IAL2), device and phone binding | Sandbox, template library, format compatibility reference |
| **P2** | A licensed practice | Firm registration where required, at least one seal holder verified, **professional liability (E&O)** with limits and retroactive date, W-9, payout account | Package membership, model upload, coordination, RFI |
| **P3** | Seal authority in this jurisdiction | Individual licence active in the **project's** jurisdiction for the required **discipline**, verified against the national records system; stamp content configured; discipline history clear | **Sealing**, observation dispositions, BoQ verification, AHJ submission |

**E&O specifics (G6-15).** Limits, retroactive date, and expiry are tracked; **claims-made gaps are flagged explicitly**, because a lapsed claims-made policy leaves prior work uncovered and that fact matters to every downstream party relying on a seal. Project-specific policies are supported. A lapse blocks **new** sealing while leaving all prior work fully accessible — the Group 5 §II.7 prospective-only rule, inherited.

**Monitoring.** Licence standing re-verified on the board's cadence and on any disciplinary action; a suspension immediately blocks new sealing, notifies every active package, and — because a suspended professional's prior seals remain legally operative — records the suspension on the package record rather than erasing the seals.

---

## II.3 The Directory Pane — Design Package Workspaces *(resolves G6-22, G6-25)*

### II.3.1 Definition

> A Group 6 **Workspace** is `(practice_id, design_package_id)`, plus a Practice workspace for credentials and a Reference workspace for code and zoning research. Navigation, map scope, Co-Pilot context, and authorization are the same unit.

### II.3.2 Tree shape

```
DIRECTORY  (Left Pane · 250px · React Server Component · zero client hooks)
│
├─ ◈ Practice                        ← aggregate; no project context
│    ├─ Seal Holders & Licences  (individuals, per jurisdiction — §II.1.2)
│    ├─ Professional Liability   (limits, retro date, claims-made gaps — §II.2)
│    ├─ Fees & Milestones        (deliverable-based; §II.6.5)
│    ├─ Licence Register         (grants issued, scope, payment status — §II.8)
│    ├─ Records & Retention      (survival-guaranteed; §II.11.2)
│    └─ Billing
│
├─ 📚 Reference                       ← research; no parcel targeting
│    ├─ Code Library · Zoning Texts (codified, searchable)
│    └─ Jurisdiction Statistics  (BODY-level approval rates; NEVER per-official)
│
├─ 📐 Harrison Infill — Architectural   ← WORKSPACE  dp_role=architect_of_record
│    ├─ Models & Drawings   (revision state machine — §II.8.3)
│    ├─ Coordination        (clash detection, discipline reconciliation — §II.10)
│    ├─ RFIs & Submittals   (response clocks, cost/schedule impact — §II.10.2)
│    ├─ BoQ                 (LOD, confidence, exclusions, attribution — §II.7)
│    ├─ Seals & Issuance    (sealed instruments; jurisdiction-correct — §II.5)
│    └─ Licence & Fees      (grant scope, payment status, suspension — §II.8.4)
│
├─ 🏗️ Harrison Infill — Structural      ← WORKSPACE  dp_role=engineer_of_record
│    ├─ Calculations & Reports
│    ├─ Site Observation    (provenance-bound visits — §II.5.3)
│    ├─ Dispositions        (graduated, sealed — §II.5.4)
│    └─ Observation Escrow  (fixed at engagement; paid regardless — §II.6.3)
│
└─ 🏛 Eastside Assembly — Entitlements   ← WORKSPACE  dp_role=consultant
     ├─ Zoning Analysis     (public facts, UNRANKED — §II.9.3)
     ├─ Application & Hearings
     ├─ Interaction Log     (public-official contacts — §II.6.6)
     └─ Registration        (lobbyist status per jurisdiction — §II.6.5)
```

### II.3.3 Server-side derivation

`design_package_manifest()` runs under the caller's RLS-scoped session in the RSC. Subtabs absent from the manifest are not rendered **and** their routes independently reject direct navigation. **Seals & Issuance renders only for a `seal_holder` with an active licence in the package's jurisdiction** — the credential gate is a manifest-level exclusion, not a disabled button.

### II.3.4 Context isolation

Inherited from Group 1 §II.3.4: identifiers only (`{ practiceId, designPackageId, dpRole, epoch }`), never prose; `is_design_package_party()` re-checked server-side with 403 returned **without invoking the model**; epoch fencing; per-workspace transcript partitioning; retrieval purged within 24h of a party row's termination.

**Group 6 specific:** the Co-Pilot has **no cross-package retrieval** — a competitor's design is never a retrieval candidate, which is a copyright constraint as much as a confidentiality one. And no model output may be presented as, or incorporated into, a sealed instrument without the seal holder's explicit authorship act (§II.11.3).

### II.3.5 Large-file and native-tool workflow *(G6-25)*

```
UPLOAD        resumable chunked upload with integrity verification and background resume
PARSE         asynchronous with progress and completion notification; never blocks the UI
DESKTOP       a watched-folder connector publishes from the native environment; the
CONNECTOR     professional never performs a manual export chore
ROUND-TRIP    platform-side markups and RFI responses return to the native format
DERIVATIVES   viewables and trade extracts generate off the upload path so a slow parse
              never blocks issuance
```

---

## II.4 Sub-Role Portals — Hardened Feature Matrices

### II.4.1 A · Registered Architect — `arch_ra`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Models & Drawings** | Upload, revision state machine, discipline sets | P2 + package party |
| **Coordination** | Clash detection between disciplines, reconciliation | §II.10.1 |
| **RFIs & Submittals** | Response clocks, cost/schedule impact flags | §II.10.2 |
| **BoQ** | Extraction with LOD, confidence, exclusions; **professional verification** | §II.7 |
| **Seals & Issuance** | Sealed instruments with jurisdiction-correct stamp and attestation | **P3 in this jurisdiction** |
| **Licence & Fees** | Grant scope, payment status, **suspension right** | §II.8.4 |

**Hardening deltas from draft**
- Design fees are **deliverable-based**, not contingent on permit issuance (G6-09).
- The BoQ carries LOD, confidence, exclusions, and an attribution state; **`machine_extracted` cannot size a facility or a bid** (I-20, G6-05).
- Copyright and licence are explicit, with a **non-payment suspension right** the platform assists and never penalizes (I-19, G6-07).
- Exactly one `issued_for_construction` revision per discipline; Group 5 trade extracts derive only from it and invalidate on supersession (G6-18).

### II.4.2 B · Structural Engineer — `arch_engineer`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Calculations & Reports** | Load calcs, shear walls, soil reports, SUSMP documentation | P2 + package party |
| **Site Observation** | Provenance-bound visit records bound to the individual | **P3 + I-18** |
| **Dispositions** | Graduated, sealed: conforming / conditions / deficiency / stop | **P3 in this jurisdiction** |
| **Observation Escrow** | Fixed at engagement, **paid regardless of disposition** | §II.6.3 |

**Hardening deltas from draft**
- **The seal releases nothing.** A conforming disposition is an *input* to the Group 3 §II.9.2 three-key release, exactly like the independent inspector's attestation (G6-02).
- **Observation must precede the seal**, proven by a provenance-bound site visit (I-18, G6-06).
- **Four dispositions, not one** — the engineer can now say something other than yes (G6-12).
- Compensation is fixed at engagement and released on **disposition rendered**, never on content (I-21) — which removes both the incentive to approve and the ability to withhold.
- Substitution is logged with a reason; the incoming engineer must **independently observe**; superseded dispositions persist on the record and are disclosed onward (G6-13, G6-24).

### II.4.3 C · Zoning Consultant — `arch_zoning`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Zoning Analysis** | FAR, overlays, permitted uses, setbacks, SB-9 criteria — **unranked public facts** | P2 |
| **Application & Hearings** | Submittal preparation, hearing calendar, response tracking | P2 + package party |
| **Interaction Log** | Public-official contacts logged per matter | §II.6.6 |
| **Registration** | Lobbyist registration status verified per jurisdiction | **gated at dispatch** |

**Hardening deltas from draft**
- **Contingent compensation is withdrawn.** Fees are milestone-based on work performed; a bounded, disclosed success bonus is permitted only where the jurisdiction allows contingency and the consultant is registered (G6-03).
- **The council voting-behaviour map is withdrawn.** Jurisdiction-level, body-aggregated approval statistics replace it — never per-official, never predictive (G6-04).
- The **arbitrage score and assembler-directed framing are withdrawn**; zoning facts render unranked, and owner contact runs through the Group 1 consent ladder (G6-10).
- The **Intent Aggregator requires per-owner consent** naming the public body, defaults to a redacted aggregate, and must state participation's true binding status (G6-11).
- The Group 4 §II.8.3 anti-corruption regime is inherited in full.
- The `legal` app segment is **removed** from this role (G6-26, Appendix D).

---

## II.5 Seal & Observation Architecture *(resolves G6-01, G6-06, G6-12)*

### II.5.1 The seal is an instrument

```
A SEAL is a document, not an event:
  · the sealing individual's stamp content, licence number, jurisdiction, expiry
  · the STATE'S statutory attestation language, verbatim for that jurisdiction
  · an explicit scope statement: what was designed or observed, and what was not
  · limitations and exclusions
  · date and revision identifier

THE PLATFORM records, hashes, transports, and presents it. THE PLATFORM NEVER
computes its validity, never generates the attestation on the professional's behalf,
and never substitutes a database state for the document.
```

Digital signature technology is used where a jurisdiction accepts it, in that jurisdiction's accepted form. Where it does not, the platform transports the wet-sealed artifact and records its provenance. **The platform adapts to the jurisdiction; the jurisdiction is never assumed to adapt to the platform.**

### II.5.2 Sealing preconditions *(I-17)*

Blocked unless: the sealing **individual** holds an active licence in the **project's jurisdiction** for the **required discipline**; E&O is current or the gap is explicitly acknowledged and disclosed downstream; the subject revision is in a sealable state; and, for observation dispositions, §II.5.3 is satisfied.

### II.5.3 Observation provenance *(I-18, G6-06)*

```
An observation disposition CANNOT be created without a recorded site visit carrying
the Group 5 §II.6.2 provenance bundle:

  NONCE          server-issued, single-use, bound to the package and milestone
  IN-APP CAPTURE only; no gallery upload
  DEVICE ATTEST  binding the capture to a real device and app build
  GEOFENCE       within the parcel boundary
  TIMESTAMP      attested capture time
  INDIVIDUAL     bound to the SEAL HOLDER, not a practice account

REMOTE REVIEW is a distinct, separately labelled disposition. It CANNOT satisfy an
observation requirement, and its remote character is disclosed to the lender, the
GC, and the AHJ package.

Any provenance failure BLOCKS. It never warns.
```

### II.5.4 Graduated dispositions *(G6-12)*

| Disposition | Meaning | Satisfies the G3 §II.9.2 gate? |
|---|---|---|
| `observed_conforming` | Observed; conforms to the sealed design | ✅ |
| `conforming_with_conditions` | Conforms subject to itemized conditions | ✅ **only when every condition is closed out** |
| `deficiency_list` | Itemized deficiencies; re-observation required | ❌ |
| `non_conforming_stop` | Work must not proceed | ❌ — and it **halts** the affected activity |

**Every disposition is a sealed instrument, transmitted identically, and compensated identically (I-21).** The engineer's pay does not depend on which one they choose — which is the entire point.

### II.5.5 The seal releases nothing *(the G6-02 structural fix)*

```
A conforming disposition is an INPUT to the Group 3 §II.9.2 three-key release:

    Borrower/GC        → REQUESTS
    Independent party  → ATTESTS   ← the engineer's sealed disposition sits HERE,
                                     alongside the rotated inspector's attestation
    Lender             → RELEASES  under dual control

The engineer holds NO financial signature and NO escrow key. The draft's phrase
"the deterministic key that unlocks the $SHQL escrow" is withdrawn — it is exactly
the coupling that created G6-02, and Group 4 §II.5.7 removed the identical coupling
for arbitrators for the identical reason.
```

---

## II.6 Independence & Compensation *(resolves G6-02, G6-03, G6-09, G6-13, G6-24)*

### II.6.1 The principle

> **A neutral is never paid by the party who benefits from their answer, and never paid differently depending on what the answer is.**

See Appendix B: this is the fifth application of one pattern in this corpus.

### II.6.2 Who is a neutral here

`arch_engineer` acting as **engineer of record for observation** is a neutral: their determination protects third parties and the public, and it gates money. `arch_ra` in design and `arch_zoning` in entitlements are **advocates for their client** and are compensated as such — but neither may have compensation contingent on a government decision (§II.6.5).

### II.6.3 Observation escrow *(I-21)*

```
FUNDED       at project closing, from project funds, alongside the Group 3 §II.9.5
             inspection escrow
FIXED        the fee is set at engagement and is immutable for the engagement
PAID         on DISPOSITION RENDERED — regardless of whether it is conforming,
             conditional, deficient, or a stop
SOURCE       neither the developer nor the GC pays per visit, so neither pays for
             an outcome
DISPUTES     fee disputes route to the Group 4 §II.5 forum and can NEVER be raised as
             a condition of, or resolved through, a safety determination (G6-13)
```

### II.6.4 Substitution protocol *(G6-13, G6-24)*

```
PERMITTED     an engineer of record may be replaced
LOGGED        with a stated reason, visible to the lender and in the AHJ package
INDEPENDENT   the incoming engineer must OBSERVE INDEPENDENTLY and may not adopt a
              predecessor's disposition
PERSISTENT    a superseded disposition — especially a deficiency list or stop —
              REMAINS on the project record permanently and is disclosed to every
              subsequent engineer, the lender, and the AHJ package
ACKNOWLEDGED  the incoming engineer must acknowledge the prior disposition before
              rendering their own
MONITORED     substitution frequency per developer and per GC raises review
```

This makes opinion shopping visible and expensive rather than silent and free.

### II.6.5 No contingent compensation for government decisions *(G6-03, G6-09)*

| Role | Compensation basis | Forbidden |
|---|---|---|
| `arch_ra` | Deliverables: schematic, design development, construction documents, permit set submitted, plan-check responses issued | Base fees contingent on permit issuance |
| `arch_zoning` | Work performed: research memo, application submitted, response filed, hearing attended | Fees contingent on variance issuance or parcel-map recordation |
| `arch_engineer` (observation) | Disposition rendered (§II.6.3) | Any variation by disposition content |

A **bounded, capped, disclosed** success bonus is permitted only where the jurisdiction allows contingent compensation for the activity **and** the consultant holds current registration. Otherwise it is unavailable, and the platform will not construct it.

### II.6.6 Anti-corruption *(G6-03, G6-04)*

Group 4 §II.8.3 inherited in full and extended to elected and appointed officials:

```
REGISTRATION   lobbyist registration verified per jurisdiction; unregistered
               representation before a body that requires it is BLOCKED at dispatch
INTERACTION    official contacts logged per matter: date, body, official, purpose
LOG
PROHIBITION    no payment or thing of value to any public official may be routed
               through or facilitated by the platform, in any form
CONTRIBUTIONS  political contribution disclosure where pay-to-play rules apply
ANOMALY        approval velocity materially faster than the body's distribution is a
               REVIEW TRIGGER, never a marketing statistic
SUSPENSION     immediate on any bribery or ethics charge against a control person
```

---

## II.7 BoQ Provenance & Attribution *(resolves G6-05)*

### II.7.1 Every BoQ declares its own limits

```
LOD              the source model's declared level of development
METHOD           extraction engine and version, with the mapping ruleset applied
CONFIDENCE       per line item, not merely in aggregate
EXCLUSIONS       explicit and mandatory: waste factors, allowances, site conditions,
                 means and methods, escalation, general conditions
LABEL            "This is a model-derived quantity extraction. It is not a quantity
                 survey and it is not a cost estimate."
```

### II.7.2 Attribution states *(I-20)*

| State | Meaning | May size a facility? | May be a bid basis? |
|---|---|---|---|
| `machine_extracted` | Parser output. Nobody has accepted it. | ❌ | ❌ |
| `professional_verified` | A **named licensee** reviewed and accepted it, with their own scope statement and exclusions | ✅ | ✅ |
| `quantity_surveyed` | An independent quantity survey | ✅ | ✅ |

**Group 3 §II.5 must see the attribution state before underwriting, and Group 5 §II.8.4 before bidding.** Both gates reject `machine_extracted` input — enforced at their end and at ours (Appendix A rows A50, A51).

### II.7.3 Variance monitoring

Extracted quantities are compared against as-built consumption at project close; systematic bias by material class, model source, and LOD feeds parser improvement and is published in the model card (Group 3 §II.7.2 pattern). **A parser whose error distribution drifts beyond tolerance is suspended from the verification path**, not silently degraded.

---

## II.8 IP, Licence & Records *(resolves G6-07, G6-16, G6-18)*

### II.8.1 Ownership is explicit

The design professional owns the copyright in the architectural work and the technical drawings absent a written transfer. The platform never asserts, implies, or acquires ownership, and the terms of service say so in terms a professional's counsel can rely on.

### II.8.2 The licence grant

```sql
design_licences(
  grantor_id, grantee_id, design_package_id,
  scope,            -- 'this_project_this_site' | 'named_derivative' | 'transfer'
  permitted_uses,   -- construct | permit | market | modify | reuse
  derivative_rules, attribution_required,
  term_start, term_end,
  payment_conditional bool,     -- the leverage (§II.8.4)
  suspended_at, terminated_at
)
```

Downstream distribution — Group 5 trade extracts, Group 3 lender review, Group 2 data rooms — operates **strictly within the grant**. A use outside `permitted_uses` is blocked at the API, not discouraged in a document.

### II.8.3 Revision state machine *(G6-18)*

```
draft → issued_for_review → issued_for_permit → issued_for_construction
                                              → superseded → void

EXACTLY ONE `issued_for_construction` revision per discipline per package at a time.

Group 5 trade extracts derive ONLY from `issued_for_construction`, carry the revision
identifier on every sheet, and are AUTOMATICALLY INVALIDATED on supersession with
notification to every holder. Building from a superseded drawing is the failure this
prevents, and vaulting alone never prevented it.
```

### II.8.4 Non-payment suspension *(I-19 — the G6-07 fix)*

```
The architect's licence-suspension right is FIRST-CLASS, and the platform ASSISTS it
exactly as Group 5 §II.5.4 assists the subcontractor's lien:

  NOTICE       generated on the contractual trigger, served, proof retained
  CURE PERIOD  per the agreement, tracked with escalating reminders
  SUSPENSION   on expiry: downstream distribution halts; extracts invalidate;
               `issued_for_construction` status is withdrawn
  SAFETY FLOOR suspension NEVER removes access to records needed for life-safety,
               for an AHJ, or for a party under a legal hold (§II.8.5)
  I-19         exercising it NEVER affects platform standing, ranking, or eligibility.
               Retaliation is a platform violation with defined consequences.
```

> This is the second time in this corpus that a group's draft deleted its users' principal leverage because it read as friction — Group 5's mechanic's lien was the first. The correction is the same: **assist the right, never suppress it.**

### II.8.5 Records lifecycle and survival *(G6-16)*

Group 4 §II.6.5 inherited — supersession chains, tombstones preserving existence and hash, jurisdiction-aware retention, legal holds — plus:

```
SURVIVAL   retention-obligated records remain accessible to the professional, the
           owner, and any party with a legal-hold interest REGARDLESS of subscription
           state or firm dissolution (§II.11.2)
SUCCESSOR  a defined transfer path on firm dissolution or professional death
EXPORT     open formats, always available, never gated
```

---

## II.9 Data Plane *(resolves G6-04, G6-10, G6-11, G6-19)*

### II.9.1 Design IP confidentiality

Models, drawings, and calculations are scoped to design-package membership. **There is no cross-package retrieval, including for the Co-Pilot** — these firms compete, and the constraint is copyright as much as confidentiality.

### II.9.2 Downstream extracts

Group 5 §II.9.4 governs: trade-scoped **extracts**, per-recipient watermarking, licence terms surfaced and acknowledged, access expiring with the work package, download logging visible to the architect. Group 6 owns the extraction pipeline and produces extracts only from `issued_for_construction`.

### II.9.3 Zoning facts, unranked *(G6-10)*

```
RENDERED       FAR limits, overlays, permitted uses, setbacks, height limits, SB-9
               eligibility criteria — as STATED CRITERIA, public and unranked
NOT RENDERED   density "arbitrage" scores, opportunity ranking, upzoning-likelihood
               models, or any assembler-directed framing
CONTACT        Group 1 §II.5.4 consent ladder applies WITHOUT EXCEPTION; a parcel at
               exposure_policy = 'private' is unreachable for solicitation regardless
               of its zoning envelope
```

### II.9.4 Jurisdiction statistics, not official models *(G6-04)*

```
PERMITTED   approval rates by application type, median timelines, and the published
            record of decisions — AGGREGATED TO THE BODY
FORBIDDEN   per-official voting models, predictive scoring of an official's behaviour,
            or any join between an official's record and a specific pending application
```

### II.9.5 Public-body submissions *(G6-11)*

```
DEFAULT      a REDACTED AGGREGATE: parcel count and percentage. No identities, no terms.
IDENTIFIED   requires SEPARATE, SPECIFIC, PER-OWNER consent naming the public body and
             acknowledging PERMANENT PUBLIC DISCLOSURE — this is irreversible in a way
             no other disclosure in this corpus is
ACCURACY     any characterization of owner participation to a public body must state
             its true binding status; Group 1 §II.6.1 makes JV intents NON-BINDING
LOG          every submission is recorded in the owner's Group 1 Exposure & Privacy
             subtab access log
```

### II.9.6 Geotechnical materiality *(G6-19)*

```
CLASSIFICATION   every geotechnical finding carries a materiality classification
OWNER ACCESS     the property owner ALWAYS reaches reports on their own parcel
DISCLOSURE       an adverse material finding triggers a disclosure-obligation prompt
                 routed to Group 4
ACQUISITION-SIDE access by any Group 2 or Group 9 role requires deal membership PLUS an
                 acknowledgement that the finding may be material to a transaction
CORRECTION       a superseded preliminary report never stands as current (§II.8.5)
```

---

## II.10 Design Coordination *(resolves G6-17)*

### II.10.1 Clash detection

Automated inter-discipline clash detection at each issuance, with clashes assigned, tracked, and required to be resolved or accepted before a revision may reach `issued_for_construction`. Clash state is visible to every discipline on the package.

### II.10.2 RFI and submittal workflow

```
RFI          raised by any downstream party (Group 5 §II.1.1 roles included), routed to
             the responsible discipline, with a RESPONSE CLOCK and a COST/SCHEDULE
             IMPACT FLAG
IMPACT       an RFI response carrying cost impact flows into the Group 5 §II.5.2
             entitlement engine as a proposed change order — so it is priced when it
             arises, not litigated later as a backcharge
SUBMITTAL    contractor submittals routed for review with dispositions (approved,
             approved-as-noted, revise-and-resubmit, rejected) and a review clock
RECORD       RFIs and submittals are part of the project record available to Group 4
             §II.10 as authenticated exhibits — this is exactly where construction
             disputes originate, and the draft left it off-platform
```

---

## II.11 Monetization *(resolves G6-20, G6-21)*

### II.11.1 Fee structure

| Surface | Permitted | Forbidden | Rationale |
|---|---|---|---|
| Practice tools | Flat seat subscription | Any % of design fees; any fee scaling with project value | Professional fee-sharing concerns; parity with Group 4 §II.12.1 |
| Software affiliate | Disclosed commission with **no ranking effect** | Fee-weighted ranking, default selection, or capability gated on purchase | G6-20 — a professional's tool choice is a professional judgment |
| Storage | Per-firm tier | **Per-gigabyte pricing on retention-obligated records** | G6-21 — the fee must never become a lever against a statutory duty |
| Observation | Flat, from the project observation escrow, invariant to disposition | Any fee varying with disposition content | I-21, §II.6.3 |
| Entitlements | Flat platform fee | Any fee contingent on a government decision | §II.6.5 |
| BoQ verification | Flat per-package | Any fee scaling with the quantity or the facility it sizes | Aligns the platform with accuracy, not with size |

### II.11.2 Records survival guarantee *(G6-21)*

```
Retention-obligated records remain accessible to the professional, the owner, and any
party with a legal-hold interest REGARDLESS of subscription state or firm dissolution.

Group 1 §II.8.5 obligation lock applies: a practice with an active package, an open
licence grant, an unresolved disposition, or a live retention obligation is pinned to
a free `ent.custodial` state — full read, export, seal access, RFI response, and
records retrieval; only net-new package creation is withheld.

A dunning failure can never separate a professional from their seals, an owner from
their drawings, or a building department from a record it is entitled to.
```

### II.11.3 Co-Pilot constraints

```
The model may assist research, code lookup, drafting narrative, and coordination.

NO model output may be presented as, or incorporated into, a SEALED INSTRUMENT without
the seal holder's explicit authorship act. Every model contribution is attributed as
machine-generated in the working record, and the seal holder is the responsible author —
the same rule Group 4 §II.11.2 applies to lawyers, for the same reason: the licence and
the liability belong to a person.
```

---

# PART III — IMPLEMENTATION SPECIFICATION

## III.1 Schema Additions

Target migration files, sequenced after the Group 5 set (`0033`–`0037`):

- `0038_group6_practices_seals.sql`
- `0039_group6_design_packages.sql`
- `0040_group6_boq_provenance.sql`
- `0041_group6_licence_records.sql`
- `0042_group6_rls.sql`

### III.1.1 `0038_group6_practices_seals.sql`

```sql
create type practice_level as enum ('P0','P1','P2','P3');
create type design_discipline as enum
  ('architecture','structural','civil','geotechnical','mep','zoning','landscape');

create table practices (
  id                uuid primary key default gen_random_uuid(),
  legal_name        text not null,
  level             practice_level not null default 'P0',
  firm_registration text,                       -- where the state registers firms
  created_at        timestamptz not null default now()
);

-- G6-14: the seal belongs to a PERSON, not a firm.
create table seal_holders (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  identity_hash  text not null,                 -- Group 2 §II.2.3 cluster
  discipline     design_discipline not null,
  status         text not null default 'active' check (status in ('active','inactive')),
  unique (practice_id, user_id, discipline)
);
create index sh_identity on seal_holders (identity_hash);

create table professional_licences (
  id              uuid primary key default gen_random_uuid(),
  seal_holder_id  uuid not null references seal_holders(id) on delete cascade,
  jurisdiction    text not null,
  discipline      design_discipline not null,
  licence_number  text not null,
  national_record_ref text,                     -- NCARB / NCEES record
  standing        text not null check (standing in ('active','inactive','suspended','revoked')),
  issued_on       date not null,
  expires_on      date not null,
  -- jurisdiction-correct stamp and statutory attestation (§II.5.1)
  stamp_content   jsonb not null,
  attestation_text text not null,
  verified_at     timestamptz not null,
  reverify_due    timestamptz not null,
  unique (seal_holder_id, jurisdiction, discipline)
);

-- G6-15: E&O, with the claims-made gap made explicit.
create table professional_liability (
  id                uuid primary key default gen_random_uuid(),
  practice_id       uuid not null references practices(id) on delete cascade,
  carrier_name      text not null,
  policy_number     text not null,
  policy_form       text not null check (policy_form in ('claims_made','occurrence')),
  per_claim_cents   bigint not null,
  aggregate_cents   bigint not null,
  retroactive_date  date,                       -- claims-made: prior work coverage
  effective_on      date not null,
  expires_on        date not null,
  project_specific_package_id uuid,
  unique (practice_id, policy_number)
);

-- A claims-made lapse leaves PRIOR work uncovered. Downstream parties relying on a
-- seal must be able to see that, so the gap is a first-class recorded fact.
create table eo_coverage_gaps (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,
  gap_start      date not null,
  gap_end        date,
  acknowledged_by uuid references users(id),
  acknowledged_at timestamptz
);

create trigger practices_no_billing before insert or update or delete on practices
  for each row execute function assert_not_billing_actor();
create trigger seal_holders_no_billing before insert or update or delete on seal_holders
  for each row execute function assert_not_billing_actor();
revoke all on practices, seal_holders, professional_licences from billing_writer;
```

### III.1.2 `0039_group6_design_packages.sql`

```sql
create type dp_role as enum
  ('architect_of_record','engineer_of_record','consultant','reviewer','owner_rep','downstream');
create type revision_state as enum
  ('draft','issued_for_review','issued_for_permit','issued_for_construction','superseded','void');
create type observation_disposition as enum
  ('observed_conforming','conforming_with_conditions','deficiency_list','non_conforming_stop');

create table design_packages (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references properties(id),
  deal_id         uuid references deals(id),
  facility_id     uuid references facilities(id),
  practice_id     uuid references practices(id),
  discipline      design_discipline not null,
  jurisdiction    text not null,                -- drives I-17
  label           text not null,
  created_at      timestamptz not null default now()
);

-- THE Group 6 authorization primitive (§II.1)
create table dp_parties (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  practice_id       uuid references practices(id),
  user_id           uuid not null references users(id) on delete cascade,
  role              dp_role not null,
  scope             text[] not null default '{}',
  expires_at        timestamptz,
  status            text not null default 'active' check (status in ('active','expired','revoked')),
  created_at        timestamptz not null default now(),
  unique (design_package_id, user_id, role)
);
create index dpp_lookup on dp_parties (user_id, design_package_id, status);

-- §II.8.3 revision state machine
create table design_revisions (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  revision_ref      text not null,
  state             revision_state not null default 'draft',
  lod               int,                        -- level of development
  document_id       uuid references documents(id),
  superseded_by     uuid references design_revisions(id),
  issued_at         timestamptz,
  unique (design_package_id, revision_ref)
);

-- EXACTLY ONE issued_for_construction revision per package at a time (§II.8.3).
create unique index one_ifc_per_package on design_revisions (design_package_id)
  where state = 'issued_for_construction';

-- §II.5 the seal as an INSTRUMENT
create table seals (
  id                uuid primary key default gen_random_uuid(),
  design_revision_id uuid references design_revisions(id),
  observation_id    uuid,                       -- set for observation dispositions
  seal_holder_id    uuid not null references seal_holders(id),
  licence_id        uuid not null references professional_licences(id),
  jurisdiction      text not null,
  scope_statement   text not null check (length(scope_statement) >= 40),
  limitations       text,
  document_id       uuid references documents(id) not null,   -- THE sealed artifact
  document_hash     text not null,
  sealed_at         timestamptz not null default now()
);

-- I-17: the sealing INDIVIDUAL must hold an active licence in the PROJECT'S
-- jurisdiction for the REQUIRED discipline. No firm-level substitute exists.
create or replace function guard_seal() returns trigger
language plpgsql as $$
declare j text; d design_discipline;
begin
  select dp.jurisdiction, dp.discipline into j, d
    from design_packages dp
    join design_revisions r on r.design_package_id = dp.id
   where r.id = coalesce(new.design_revision_id,
           (select design_revision_id from observations o where o.id = new.observation_id));
  if not exists (
    select 1 from professional_licences l
     where l.id = new.licence_id and l.seal_holder_id = new.seal_holder_id
       and l.jurisdiction = j and l.discipline = d
       and l.standing = 'active' and l.expires_on > current_date
       and l.reverify_due > now()
  ) then
    raise exception 'I-17: no active % licence in % for this seal holder', d, j
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger seals_licence_guard before insert on seals
  for each row execute function guard_seal();

-- §II.5.3 observation provenance — the I-18 control
create table observations (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  design_revision_id uuid references design_revisions(id),
  milestone_key     text not null,
  seal_holder_id    uuid not null references seal_holders(id),
  -- provenance bundle (Group 5 §II.6.2 / Group 3 §II.9.3)
  capture_nonce     text not null unique,
  device_attestation jsonb not null,
  geo_verified      boolean not null default false,
  geo_distance_m    numeric,
  visited_at        timestamptz not null,
  remote_review     boolean not null default false,   -- CANNOT satisfy observation
  disposition       observation_disposition,
  conditions        jsonb not null default '[]'::jsonb,
  conditions_closed_at timestamptz,
  seal_id           uuid references seals(id),
  superseded_by     uuid references observations(id),  -- §II.6.4 persistence
  created_at        timestamptz not null default now()
);

-- I-18: no disposition without a provenance-verified, in-person site visit.
create or replace function guard_observation() returns trigger
language plpgsql as $$
begin
  if new.disposition is not null then
    if new.remote_review then
      raise exception 'I-18: remote review cannot satisfy an observation requirement'
        using errcode = '42501';
    end if;
    if not new.geo_verified or not (new.device_attestation ? 'verified') then
      raise exception 'I-18: observation provenance failed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger observations_provenance_guard before insert or update on observations
  for each row execute function guard_observation();

-- §II.5.4 / §II.5.5: only conforming (or fully closed-out conditional) satisfies
-- the Group 3 §II.9.2 gate. The engineer holds NO escrow key.
create or replace function observation_satisfies_gate(p_obs uuid) returns boolean
language sql stable as $$
  select o.disposition = 'observed_conforming'
      or (o.disposition = 'conforming_with_conditions' and o.conditions_closed_at is not null)
    from observations o where o.id = p_obs and o.superseded_by is null;
$$;

-- §II.6.3 observation escrow — paid on disposition RENDERED, not on content (I-21)
create table observation_engagements (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  seal_holder_id    uuid not null references seal_holders(id),
  fee_cents         bigint not null,             -- FIXED at engagement
  escrow_ref        text not null,               -- funded at project closing
  engaged_at        timestamptz not null default now(),
  substituted_at    timestamptz,
  substitution_reason text,                      -- §II.6.4, disclosed onward
  acknowledged_prior uuid references observations(id)
);
```

### III.1.3 `0040_group6_boq_provenance.sql`

```sql
create type boq_attribution as enum
  ('machine_extracted','professional_verified','quantity_surveyed');

create table boqs (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  design_revision_id uuid not null references design_revisions(id),
  -- §II.7.1 every BoQ declares its own limits
  source_lod        int not null,
  extractor         text not null,
  extractor_version text not null,
  ruleset_version   text not null,
  exclusions        text[] not null,             -- waste, allowances, site conditions…
  attribution       boq_attribution not null default 'machine_extracted',
  verified_by       uuid references seal_holders(id),
  verifier_scope    text,
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  -- exclusions are MANDATORY; a BoQ that declares none is not a BoQ
  check (array_length(exclusions, 1) >= 1),
  -- verification requires a named licensee and their own scope statement
  check (attribution <> 'professional_verified'
         or (verified_by is not null and verifier_scope is not null))
);

create table boq_lines (
  id           uuid primary key default gen_random_uuid(),
  boq_id       uuid not null references boqs(id) on delete cascade,
  item_code    text not null,
  description  text not null,
  quantity     numeric not null,
  unit         text not null,
  confidence   numeric not null check (confidence between 0 and 1),
  source_ref   text                              -- model element mapping
);

-- I-20: a machine-extracted BoQ may not size a facility, be a bid basis, or fund escrow.
create or replace function boq_may_size_facility(p_boq uuid) returns boolean
language sql stable as $$
  select attribution in ('professional_verified','quantity_surveyed')
    from boqs where id = p_boq;
$$;

-- §II.7.3 extraction accuracy monitoring; drift suspends the verification path.
create table boq_variance (
  id            uuid primary key default gen_random_uuid(),
  boq_id        uuid not null references boqs(id) on delete cascade,
  item_code     text not null,
  extracted_qty numeric not null,
  as_built_qty  numeric not null,
  variance_pct  numeric generated always as (
                  case when extracted_qty = 0 then null
                       else (as_built_qty - extracted_qty) / extracted_qty * 100 end) stored,
  recorded_at   timestamptz not null default now()
);

create table extractor_suspensions (
  extractor     text not null,
  version       text not null,
  reason        text not null,
  suspended_at  timestamptz not null default now(),
  lifted_at     timestamptz,
  primary key (extractor, version, suspended_at)
);
```

### III.1.4 `0041_group6_licence_records.sql`

```sql
-- §II.8.2 the IP grant
create table design_licences (
  id                uuid primary key default gen_random_uuid(),
  grantor_id        uuid not null references users(id),      -- the design professional
  grantee_id        uuid not null references users(id),      -- typically the owner
  design_package_id uuid not null references design_packages(id) on delete cascade,
  scope             text not null check (scope in
                      ('this_project_this_site','named_derivative','transfer')),
  permitted_uses    text[] not null,   -- construct | permit | market | modify | reuse
  derivative_rules  text,
  attribution_required boolean not null default true,
  term_start        date not null,
  term_end          date,
  payment_conditional boolean not null default true,          -- the leverage
  suspended_at      timestamptz,
  terminated_at     timestamptz
);

-- §II.8.4 non-payment suspension, assisted exactly as Group 5 assists liens
create table licence_suspension_notices (
  id             uuid primary key default gen_random_uuid(),
  design_licence_id uuid not null references design_licences(id) on delete cascade,
  trigger_basis  text not null,
  generated_at   timestamptz not null default now(),
  served_at      timestamptz,
  service_method text,
  proof_doc_id   uuid references documents(id),
  cure_expires_on date not null,
  cured_at       timestamptz,
  suspended_at   timestamptz
);
-- I-19 (ABSOLUTE): exercising suspension NEVER affects platform standing.
-- Enforced by the ABSENCE of any read path from these tables into ranking,
-- eligibility, or dispatch code — verified by `retaliation-lint` (§IV.3).

-- §II.8.4 safety floor: suspension never blocks life-safety, AHJ, or legal-hold access
create or replace function licence_blocks_access(p_licence uuid, p_purpose text)
returns boolean
language sql stable as $$
  select case when p_purpose in ('life_safety','ahj_submission','legal_hold','owner_records')
              then false
         else exists (select 1 from design_licences l
                       where l.id = p_licence
                         and (l.suspended_at is not null or l.terminated_at is not null))
         end;
$$;

-- §II.9.6 geotechnical materiality
create table geotech_findings (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  property_id       uuid not null references properties(id),
  finding_kind      text not null,   -- liquefaction | fault_proximity | slope_stability
                                     -- | expansive_soil | contamination | hydrology
  materiality       text not null check (materiality in ('informational','material','adverse_material')),
  document_id       uuid references documents(id),
  superseded_by     uuid references geotech_findings(id),
  disclosure_prompted_at timestamptz,
  created_at        timestamptz not null default now()
);

-- §II.9.5 public-body submissions of owner instruments
create table public_body_submissions (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  body_name         text not null,
  submission_form   text not null check (submission_form in ('redacted_aggregate','identified')),
  binding_status_stated text not null,     -- must accurately state non-binding LOI status
  submitted_at      timestamptz
);

create table owner_disclosure_consents (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public_body_submissions(id) on delete cascade,
  owner_user_id  uuid not null references users(id),
  property_id    uuid not null references properties(id),
  body_named     text not null,
  permanence_acknowledged boolean not null default false,
  consented_at   timestamptz not null default now(),
  unique (submission_id, owner_user_id)
);

-- G6-11: an identified submission requires per-owner consent naming the body
-- AND acknowledging permanent public disclosure.
create or replace function guard_public_submission() returns trigger
language plpgsql as $$
declare missing int;
begin
  if new.submission_form = 'identified' and new.submitted_at is not null then
    select count(*) into missing
      from dp_parties p
     where p.design_package_id = new.design_package_id
       and not exists (select 1 from owner_disclosure_consents c
                        where c.submission_id = new.id and c.owner_user_id = p.user_id
                          and c.body_named = new.body_name
                          and c.permanence_acknowledged);
    if missing > 0 then
      raise exception 'G6-11: % owner consents missing for identified submission', missing
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger public_submissions_consent_guard before update on public_body_submissions
  for each row execute function guard_public_submission();

-- §II.10.2 RFI / submittal
create table rfis (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  work_package_id   uuid references work_packages(id),        -- Group 5 linkage
  raised_by         uuid not null references users(id),
  question          text not null,
  response          text,
  responded_at      timestamptz,
  response_due_at   timestamptz not null,
  cost_impact       boolean not null default false,
  schedule_impact   boolean not null default false,
  change_order_ref  uuid,                                     -- → Group 5 §II.5.2
  created_at        timestamptz not null default now()
);

create table submittals (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  work_package_id   uuid references work_packages(id),
  submitted_by      uuid not null references users(id),
  disposition       text check (disposition in
                      ('approved','approved_as_noted','revise_resubmit','rejected')),
  reviewed_by       uuid references seal_holders(id),
  review_due_at     timestamptz not null,
  reviewed_at       timestamptz
);

create table clashes (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  counterpart_package_id uuid references design_packages(id),
  detected_at       timestamptz not null default now(),
  severity          text not null,
  resolved_at       timestamptz,
  accepted_at       timestamptz,
  accepted_by       uuid references seal_holders(id)
);

-- §II.8.3: unresolved clashes block promotion to issued_for_construction.
create or replace function guard_ifc_promotion() returns trigger
language plpgsql as $$
begin
  if new.state = 'issued_for_construction' and old.state <> 'issued_for_construction' then
    if exists (select 1 from clashes c
                where c.design_package_id = new.design_package_id
                  and c.resolved_at is null and c.accepted_at is null) then
      raise exception 'G6-17: unresolved clashes block issue-for-construction'
        using errcode = '42501';
    end if;
    if not exists (select 1 from seals s where s.design_revision_id = new.id) then
      raise exception 'G6-01: an issued-for-construction revision must be sealed'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger revisions_ifc_guard before update on design_revisions
  for each row execute function guard_ifc_promotion();
```

## III.2 RLS Helper Functions

```sql
-- ── The Group 6 authorization predicate (Invariant I-1) ────────────────────
create or replace function public.is_design_package_party(
  p_dp uuid, p_facet text default null, p_role dp_role default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from dp_parties p
     where p.design_package_id = p_dp and p.user_id = auth.uid()
       and p.status = 'active'
       and (p.expires_at is null or p.expires_at > now())
       and (p_facet is null or p_facet = any(p.scope))
       and (p_role  is null or p.role = p_role)
  );
$$;

-- ── I-17: seal authority is per INDIVIDUAL, per jurisdiction, per discipline ──
create or replace function public.may_seal(p_dp uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from design_packages dp
      join seal_holders sh on sh.user_id = auth.uid() and sh.discipline = dp.discipline
      join professional_licences l on l.seal_holder_id = sh.id
     where dp.id = p_dp
       and l.jurisdiction = dp.jurisdiction and l.discipline = dp.discipline
       and l.standing = 'active' and l.expires_on > current_date
       and sh.status = 'active'
  );
$$;

-- ── §II.8.2 downstream access operates STRICTLY within the licence grant ─────
create or replace function public.licence_permits(p_dp uuid, p_use text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from design_licences dl
     where dl.design_package_id = p_dp
       and dl.grantee_id = auth.uid()
       and p_use = any(dl.permitted_uses)
       and dl.terminated_at is null
       and (dl.suspended_at is null or p_use in ('life_safety','ahj_submission'))
       and (dl.term_end is null or dl.term_end >= current_date)
  );
$$;

-- ── §II.9.2 downstream extracts come ONLY from issued_for_construction ───────
create or replace function public.current_ifc_revision(p_dp uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from design_revisions
   where design_package_id = p_dp and state = 'issued_for_construction' limit 1;
$$;
```

## III.3 Group 6 RLS Policies — `0042_group6_rls.sql`

```sql
-- documents: design-package membership, NOT the architect group string (G6-08) ---
drop policy if exists "documents_privilege_scoped_v2" on documents;
create policy "documents_privilege_scoped_v3" on documents for select
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
                  and is_design_package_party(dp.id, 'documents'))        -- ← Group 6
      or current_user_role_group() = 'admin'
    ) else
      may_read_privileged(documents.matter_id, documents.privilege_holder_id)
    end
    and documents.tombstoned_at is null
  );
-- `current_user_role_group() = 'architect'` never appears. Competing firms cannot
-- read each other's models — a copyright constraint as much as a confidentiality one.

-- design_packages / dp_parties -------------------------------------------
alter table design_packages enable row level security;
create policy "dp_party_select" on design_packages for select
  using (is_design_package_party(design_packages.id) or current_user_role_group() = 'admin');
alter table dp_parties enable row level security;
create policy "dpp_self_or_aor_select" on dp_parties for select
  using (user_id = auth.uid()
         or is_design_package_party(design_package_id, null, 'architect_of_record')
         or current_user_role_group() = 'admin');

-- revisions: downstream sees ONLY issued_for_construction (§II.8.3) -------
alter table design_revisions enable row level security;
create policy "revisions_scoped_select" on design_revisions for select
  using (
    is_design_package_party(design_package_id, 'drawings')
    or (state = 'issued_for_construction'
        and (is_design_package_party(design_package_id, null, 'downstream')
             or exists (select 1 from work_packages w
                         where w.property_id = (select property_id from design_packages
                                                 where id = design_revisions.design_package_id)
                           and is_work_package_party(w.id, 'documents'))))
    or current_user_role_group() = 'admin'
  );
-- A Group 5 trade never reaches a draft, a permit set, or a superseded revision.

-- seals: readable by the package and by downstream consumers of the artifact --
alter table seals enable row level security;
create policy "seals_scoped_select" on seals for select
  using (exists (select 1 from design_revisions r
                  where r.id = seals.design_revision_id
                    and is_design_package_party(r.design_package_id))
         or exists (select 1 from observations o
                     where o.id = seals.observation_id
                       and is_design_package_party(o.design_package_id))
         or current_user_role_group() = 'admin');
create policy "seals_individual_insert" on seals for insert
  with check (
    exists (select 1 from seal_holders sh
             where sh.id = seal_holder_id and sh.user_id = auth.uid())
  );
-- I-17 is additionally enforced by guard_seal(). A firm account cannot seal.

-- observations: the engineer of record and the package ------------------
alter table observations enable row level security;
create policy "observations_package_select" on observations for select
  using (is_design_package_party(design_package_id)
         or exists (select 1 from facilities f
                     where f.property_id = (select property_id from design_packages
                                             where id = observations.design_package_id)
                       and is_facility_party(f.id, 'inspection'))     -- lender sees it
         or current_user_role_group() = 'admin');
create policy "observations_eor_insert" on observations for insert
  with check (
    is_design_package_party(design_package_id, null, 'engineer_of_record')
    and exists (select 1 from seal_holders sh
                 where sh.id = seal_holder_id and sh.user_id = auth.uid())
  );
-- §II.6.4: superseded dispositions are NOT deletable and remain readable.
create policy "observations_no_delete" on observations for delete using (false);

-- boqs: attribution gates downstream consumption (I-20) ------------------
alter table boqs enable row level security;
create policy "boqs_scoped_select" on boqs for select
  using (is_design_package_party(design_package_id, 'boq')
         or exists (select 1 from facilities f
                     where f.property_id = (select property_id from design_packages
                                             where id = boqs.design_package_id)
                       and is_facility_party(f.id, 'financials'))
         or exists (select 1 from work_packages w
                     where w.property_id = (select property_id from design_packages
                                             where id = boqs.design_package_id)
                       and is_work_package_party(w.id, 'boq'))
         or current_user_role_group() = 'admin');
create policy "boqs_verify_by_licensee" on boqs for update
  using (is_design_package_party(design_package_id, 'boq'))
  with check (
    attribution <> 'professional_verified'
    or exists (select 1 from seal_holders sh
                where sh.id = verified_by and sh.user_id = auth.uid())
  );
-- A user cannot mark a BoQ professionally verified in someone else's name.

-- design_licences: grantor and grantee -----------------------------------
alter table design_licences enable row level security;
create policy "licences_party_select" on design_licences for select
  using (grantor_id = auth.uid() or grantee_id = auth.uid()
         or current_user_role_group() = 'admin');
create policy "licences_grantor_suspend" on design_licences for update
  using (grantor_id = auth.uid());
-- I-19: suspension is UNCONDITIONAL on platform standing, ranking, or eligibility.
-- Deliberately not gated on subscription state, ratings, or counterparty consent.

-- geotech findings: owner always reaches their own parcel (§II.9.6) -------
alter table geotech_findings enable row level security;
create policy "geotech_scoped_select" on geotech_findings for select
  using (
    has_property_capacity(geotech_findings.property_id, null, 'V2')   -- OWNER, always
    or is_design_package_party(design_package_id)
    or exists (select 1 from deals d
                where d.primary_property_id = geotech_findings.property_id
                  and is_deal_member(d.id, 'diligence'))
    or current_user_role_group() = 'admin'
  );

-- rfis / submittals / clashes: package + linked work package -------------
alter table rfis enable row level security;
create policy "rfis_scoped" on rfis for select
  using (is_design_package_party(design_package_id)
         or (work_package_id is not null and is_work_package_party(work_package_id)));
create policy "rfis_downstream_insert" on rfis for insert
  with check (is_design_package_party(design_package_id)
              or (work_package_id is not null and is_work_package_party(work_package_id)));
```

## III.4 `design_package_manifest()`

```sql
create or replace function public.design_package_manifest()
returns jsonb
language sql stable security definer set search_path = public as $$
with me as (
  select p.design_package_id, p.role, dp.label, dp.discipline, dp.jurisdiction,
         dp.practice_id,
         may_seal(dp.id) as can_seal
    from dp_parties p
    join design_packages dp on dp.id = p.design_package_id
   where p.user_id = auth.uid() and p.status = 'active'
     and (p.expires_at is null or p.expires_at > now())
)
select jsonb_build_object(
  'upsell_allowed', true,
  'practice', jsonb_build_array(
     'seal_holders','professional_liability','fees','licence_register',
     'records_retention','billing'),
  -- §II.9.4: BODY-level statistics only. No per-official modelling exists to expose.
  'reference', jsonb_build_array('code_library','zoning_texts','jurisdiction_statistics'),
  'workspaces', coalesce(jsonb_agg(jsonb_build_object(
      'design_package_id', me.design_package_id,
      'label', me.label,
      'discipline', me.discipline,
      'role', me.role,
      'subtabs', (
        case me.role
          when 'architect_of_record' then
            jsonb_build_array('models','coordination','rfis','boq','licence_fees')
          when 'engineer_of_record' then
            jsonb_build_array('calculations','observation','dispositions','escrow')
          when 'consultant' then
            jsonb_build_array('zoning_analysis','applications','interaction_log','registration')
          when 'reviewer' then jsonb_build_array('models','coordination','rfis')
          when 'owner_rep' then jsonb_build_array('deliverables','rfis')
          else jsonb_build_array('deliverables') end
        -- §II.3.3: Seals & Issuance renders ONLY for a licensed seal holder in this
        -- jurisdiction. A credential gate is an EXCLUSION, never a disabled button.
        || case when me.can_seal then jsonb_build_array('seals_issuance')
                else '[]'::jsonb end
      )
  ) order by me.discipline), '[]'::jsonb)
) from me;
$$;
```

## III.5 API Contracts

### `POST /api/practices/credentials`
```
Request  { practice_id, kind, payload }
Guards   authenticated; identity-cluster rate limits (Group 2 §II.2.3)
Effect   licence verified against the national record system and bound to the
         INDIVIDUAL seal holder with jurisdiction, discipline, stamp content, and
         statutory attestation text; E&O recorded with policy form and retroactive
         date; a claims-made gap is recorded as an explicit `eo_coverage_gaps` row
Response 200 { level, seal_jurisdictions[], eo_gaps[], missing[] }
Errors   422 INDIVIDUAL_LICENCE_REQUIRED · 409 CLUSTER_DISCIPLINE_INHERITED
```

### `POST /api/design-packages/:id/seals`
```
Request  { revision_id | observation_id, scope_statement, limitations, document }
Guards   may_seal(package) — INDIVIDUAL licence, project jurisdiction, required
         discipline (I-17) · scope_statement ≥ 40 chars · the sealed artifact is
         attached (§II.5.1) · for observations, guard_observation() has passed
Effect   records and hashes the sealed instrument. The platform does NOT generate the
         attestation, does NOT compute validity, and does NOT substitute for the document.
Errors   403 NO_LICENCE_IN_JURISDICTION { jurisdiction, discipline }
         · 422 SCOPE_STATEMENT_REQUIRED · 422 SEALED_ARTIFACT_REQUIRED
```

### `POST /api/design-packages/:id/observations`
```
Request  { milestone_key, capture_nonce, device_attestation, geo, disposition, conditions[] }
Guards   engineer_of_record · seal holder is the caller · I-18 provenance:
         in-app capture, live server nonce, device attestation, geofence
         · `remote_review: true` CANNOT carry a disposition
Effect   creates the disposition; a conforming (or closed-out conditional) disposition
         becomes an INPUT to the Group 3 §II.9.2 gate.
         IT RELEASES NOTHING — the engineer holds no escrow key (§II.5.5).
Errors   422 OBSERVATION_PROVENANCE_FAILED { failed_checks[] }
         · 403 REMOTE_REVIEW_CANNOT_DISPOSE · 409 NONCE_CONSUMED
```

### `PATCH /api/observation-engagements/:id/substitute`
```
Request  { new_seal_holder_id, reason }
Guards   reason required; the prior disposition must be acknowledged by the incoming
         engineer before they may render their own
Effect   logs the substitution; the SUPERSEDED DISPOSITION PERSISTS and is disclosed to
         the lender and in the AHJ package; substitution frequency per developer and
         per GC feeds review (§II.6.4)
Errors   422 SUBSTITUTION_REASON_REQUIRED · 409 PRIOR_DISPOSITION_UNACKNOWLEDGED
```

### `POST /api/boqs/:id/verify`
```
Guards   caller is the named seal holder; verifier_scope supplied
Effect   transitions attribution machine_extracted → professional_verified.
         UNTIL THIS HAPPENS the BoQ cannot size a Group 3 facility, serve as a
         Group 5 bid basis, or fund an escrow (I-20).
Errors   403 VERIFIER_MISMATCH · 422 VERIFIER_SCOPE_REQUIRED
```

### `POST /api/design-revisions/:id/issue`
```
Request  { target_state }
Guards   `issued_for_construction` requires: a seal on the revision · zero unresolved
         or unaccepted clashes · exactly one IFC revision per package (unique index)
Effect   supersedes the prior IFC revision; INVALIDATES every derived Group 5 trade
         extract and notifies every holder (§II.8.3)
Errors   409 UNRESOLVED_CLASHES { count } · 409 REVISION_NOT_SEALED
```

### `POST /api/design-licences/:id/suspend`
```
Guards   caller is the GRANTOR. Nothing else. (I-19)
         Explicitly NOT gated on: subscription state, ratings, platform standing,
         grantee consent, or dispatch eligibility.
Effect   after notice and cure expiry, halts downstream distribution, invalidates
         extracts, withdraws IFC status.
         SAFETY FLOOR: life-safety, AHJ submission, legal-hold, and owner-records
         access are NEVER blocked (§II.8.4).
Note     `retaliation-lint` (§IV.3) fails the build if any ranking, eligibility, or
         dispatch path reads licence_suspension_notices.
```

### `POST /api/public-body-submissions/:id/submit`
```
Guards   `identified` form requires per-owner consent naming the body AND acknowledging
         PERMANENT public disclosure (guard_public_submission)
         · binding_status_stated must accurately reflect Group 1 §II.6.1 (non-binding LOI)
Default  `redacted_aggregate` — parcel count and percentage only
Effect   writes to each owner's Group 1 Exposure & Privacy access log
Errors   403 OWNER_CONSENT_MISSING { count } · 422 BINDING_STATUS_MISSTATED
```

### `GET|POST /api/copilot` *(Group 6 context)*
```
Request  { practiceId, designPackageId, dpRole, epoch, messages }
Guards   is_design_package_party(designPackageId) → else 403, model NOT invoked
Effect   NO CROSS-PACKAGE RETRIEVAL — a competing firm's model is never a retrieval
         candidate (copyright, not merely confidentiality).
         NO model output may be presented as or incorporated into a SEALED INSTRUMENT
         without the seal holder's explicit authorship act (§II.11.3).
```

## III.6 TypeScript Registry Deltas

```ts
// src/lib/rbac/roles.ts — G6-26: `legal` removed from arch_zoning.
// Group 4 §II.1 moved legal access onto matter membership, so an app segment
// grant with no matter role is a dangling privilege.
arch_ra:       ['design', 'escrow'],
arch_engineer: ['design', 'escrow'],
arch_zoning:   ['design', 'escrow'],       // ← was ['legal', 'design', 'escrow']

// src/lib/rbac/designPackage.ts — NEW.
export type DpRole =
  | 'architect_of_record' | 'engineer_of_record' | 'consultant'
  | 'reviewer' | 'owner_rep' | 'downstream';
export type BoqAttribution = 'machine_extracted' | 'professional_verified' | 'quantity_surveyed';
export type ObservationDisposition =
  | 'observed_conforming' | 'conforming_with_conditions'
  | 'deficiency_list' | 'non_conforming_stop';

/** Mirrors is_design_package_party(). Called BEFORE any side effect. */
export async function assertDesignPackageParty(
  supabase: SupabaseClient, dpId: string, facet?: string, role?: DpRole,
): Promise<void>;

/** I-17. Seal authority is per INDIVIDUAL, per jurisdiction, per discipline. */
export async function assertMaySeal(
  supabase: SupabaseClient, dpId: string,
): Promise<void>;

/** I-20. Group 3 and Group 5 both call this before consuming a BoQ. */
export async function assertBoqUsable(
  supabase: SupabaseClient, boqId: string,
): Promise<void>;

/** §II.8.2. Downstream distribution operates strictly within the grant. */
export async function assertLicencePermits(
  supabase: SupabaseClient, dpId: string, use: string,
): Promise<void>;
```

---

# PART IV — VERIFICATION

## IV.1 Cross-Practice Isolation Matrix

Actor is a party to **Design Package A**. Columns are what they may reach on **Package B** and within A.

| Actor | B models | B calculations | B BoQ | A other discipline's work product | A owner's parcel geotech | G1 distress |
|---|---|---|---|---|---|---|
| `arch_ra` (AOR on A) | ❌ | ❌ | ❌ | coordination views only | ✅ (package party) | ❌ **never** |
| `arch_engineer` (EOR on A) | ❌ | ❌ | ❌ | coordination views only | ✅ | ❌ **never** |
| `arch_zoning` (consultant on A) | ❌ | ❌ | ❌ | ❌ (own discipline) | ❌ | ❌ **never** |
| `reviewer` on A | ❌ | ❌ | ❌ | read-only coordination | ❌ | ❌ |
| Group 5 `trade` | ❌ | ❌ | verified only | **IFC extract only** | ❌ | ❌ |
| Group 3 lender | ❌ | observation dispositions | **verified only** | ❌ | via facility party | ❌ |
| Property owner | ❌ | ❌ | ❌ | deliverables per licence | ✅ **always** | own |
| `admin` | break-glass | break-glass | break-glass | break-glass | break-glass | audited |

Two load-bearing rows: **competing practices reach nothing of each other's**, which is copyright as much as confidentiality; and the **property owner always reaches geotechnical findings on their own parcel**, because they carry the disclosure obligation personally.

## IV.2 Acceptance Criteria

**Seal & observation**
- [ ] A seal cannot be created without an attached sealed artifact and a scope statement of at least 40 characters. *(G6-01.)*
- [ ] A seal by an individual with no active licence in the **package's jurisdiction** for the **package's discipline** is rejected by `guard_seal()`. *(I-17.)*
- [ ] A firm account with no `seal_holders` row cannot seal — the insert policy requires `sh.user_id = auth.uid()`. *(G6-14.)*
- [ ] The platform generates no attestation text; `attestation_text` originates from the licence record and is jurisdiction-specific.
- [ ] An observation disposition without a geofence-verified, device-attested, nonce-bound in-app capture is rejected. *(I-18, G6-06.)*
- [ ] `remote_review = true` carrying a disposition is rejected, and remote character is disclosed to the lender, GC, and AHJ package.
- [ ] All four dispositions are creatable, transmit identically, and are compensated identically. *(G6-12, I-21.)*
- [ ] **A conforming disposition releases no funds.** No code path exists from `observations` to a disbursement — release requires the Group 3 §II.9.2 three keys. *(G6-02, asserted structurally.)*
- [ ] `conforming_with_conditions` satisfies the Group 3 gate **only** once `conditions_closed_at` is set.
- [ ] A superseded disposition remains readable and non-deletable, and is disclosed to the incoming engineer, the lender, and the AHJ package. *(G6-24.)*
- [ ] Substitution without a stated reason, or without the incoming engineer acknowledging the prior disposition, is rejected. *(G6-13.)*

**Independence & compensation**
- [ ] Observation compensation is released on **disposition rendered** and is byte-identical across all four disposition values. *(I-21 — asserted by comparing payouts for each.)*
- [ ] No code path lets the developer or GC pay the observing engineer per visit. *(G6-02.)*
- [ ] No fee constant is reachable from a permit-issuance, variance-issuance, or parcel-map-recordation event. *(`contingency-lint`. G6-03, G6-09.)*
- [ ] A zoning consultant unregistered in a jurisdiction requiring registration is blocked at dispatch. *(G6-03.)*
- [ ] Official interactions are logged per matter; approval velocity anomalies raise review and appear on no marketing surface. *(G6-04.)*
- [ ] A fee dispute cannot be raised as a condition of, or resolved through, an observation disposition. *(G6-13.)*

**BoQ**
- [ ] A BoQ with an empty `exclusions` array is rejected by check constraint. *(G6-05.)*
- [ ] `professional_verified` without a named `verified_by` and a `verifier_scope` is rejected.
- [ ] A user cannot mark a BoQ verified in another seal holder's name. *(Policy `with check`.)*
- [ ] **A `machine_extracted` BoQ cannot size a Group 3 facility, serve as a Group 5 bid basis, or fund an escrow.** *(I-20 — asserted at both consuming gates, not only here.)*
- [ ] Every BoQ line carries a confidence value; the LOD is declared and surfaced to every consumer.
- [ ] An extractor version whose variance distribution drifts beyond tolerance is suspended from the verification path. *(§II.7.3.)*

**IP, licence & versioning**
- [ ] Downstream distribution outside `permitted_uses` is blocked at the API. *(§II.8.2.)*
- [ ] **Exercising licence suspension produces zero change** in platform standing, ranking, eligibility, or dispatch — asserted by diffing all four. *(I-19, G6-07.)*
- [ ] Suspension never blocks life-safety, AHJ submission, legal-hold, or owner-records access. *(§II.8.4 safety floor.)*
- [ ] Exactly one `issued_for_construction` revision per package exists at any time. *(Unique index. G6-18.)*
- [ ] Promotion to IFC with unresolved clashes, or without a seal, is rejected.
- [ ] Superseding an IFC revision **invalidates every derived Group 5 trade extract** and notifies every holder. *(Cross-group integration test.)*
- [ ] A Group 5 trade cannot reach a draft, permit-set, or superseded revision.
- [ ] Retention-obligated records remain accessible after subscription lapse and after firm dissolution. *(§II.11.2.)*

**Data & privacy**
- [ ] No endpoint or tile returns a per-official voting model, prediction, or any join between an official's record and a pending application. *(G6-04.)*
- [ ] No surface returns a density arbitrage score, opportunity ranking, or upzoning-likelihood model. *(G6-10, `score-lint` extension.)*
- [ ] Zoning facts render unranked; owner contact returns `403 SOLICITATION_SUPPRESSED` on a `private` parcel regardless of zoning envelope.
- [ ] An `identified` public-body submission without per-owner consent naming the body and acknowledging permanence is rejected. *(G6-11.)*
- [ ] Submissions write to each owner's Group 1 Exposure & Privacy access log.
- [ ] A submission misstating binding status is rejected — Group 1 §II.6.1 makes JV intents non-binding.
- [ ] **The property owner always reaches geotechnical findings on their own parcel**, including adverse ones. *(G6-19.)*
- [ ] An adverse material finding triggers a disclosure-obligation prompt routed to Group 4.

**RBAC**
- [ ] `grep -rn "current_user_role_group" supabase/migrations/` returns **zero** hits containing `'architect'`. *(I-1, CI-enforced. G6-08.)*
- [ ] An `arch_ra` at Practice X cannot read Practice Y's models on an unrelated package. *(Direct `supabase-js` query.)*
- [ ] `getAllowedApps('arch_zoning')` does **not** include `legal`. *(G6-26.)*
- [ ] The Co-Pilot has no cross-package retrieval — asserted by an adversarial recall prompt naming a competitor's package.
- [ ] Seals & Issuance is absent from the manifest for a non-seal-holder, and its route rejects direct navigation.
- [ ] No Stripe event mutates `practices`, `seal_holders`, `professional_licences`, `design_packages`, or `dp_parties`. *(I-2 webhook fuzz.)*

## IV.3 CI Guardrails

Groups 1–5 guardrails are inherited. Group 6 adds:

```
policy-lint        — extended: ZERO occurrences of 'architect' inside
                     current_user_role_group() predicates (I-1)
seal-lint          — fails if any code path can create a seal without an attached
                     artifact, or can generate attestation text on the professional's
                     behalf, or can compute seal validity (G6-01)
observation-lint   — fails if any disposition path bypasses the I-18 provenance bundle,
                     or if `remote_review` can carry a disposition (G6-06)
escrow-decouple-lint — fails if ANY code path reaches a disbursement from `observations`
                     or `seals`. The engineer holds no escrow key (G6-02, §II.5.5)
contingency-lint   — fails if any fee constant is reachable from a permit-issuance,
                     variance-issuance, or parcel-map-recordation event (G6-03, G6-09)
official-model-lint— fails if any surface models, predicts, or scores an individual
                     public official's behaviour (G6-04)
boq-attribution-lint — fails if a facility-sizing, bid-basis, or escrow-funding path can
                     consume a `machine_extracted` BoQ (I-20)
retaliation-lint   — extended: fails if any ranking, eligibility, or dispatch path reads
                     licence_suspension_notices (I-19)
ifc-lint           — fails if a Group 5 trade extract can derive from a revision that is
                     not `issued_for_construction`, or survives supersession (G6-18)
score-lint         — extended: fails on any density-arbitrage, opportunity, or
                     upzoning-likelihood score keyed to a parcel (G6-10)
records-survival-lint — fails if any retention-obligated record path is gated on
                     subscription state (G6-21)
```

## IV.4 Telemetry

**Credentialing funnel:** `P0 → P1 → P2 → first_package → P3 → first_seal`. Alert on P2→P3 completion below 60% — a practice that cannot reach seal authority in the project's jurisdiction is the G6-14 failure surfacing. Break out by blocking dimension (jurisdiction, discipline, E&O gap).

**Seal & observation integrity:** observation provenance failure rate by check type; **remote-review attempts carrying a disposition** (the direct G6-06 pressure signal); time between site visit and seal; disposition distribution per engineer and per developer — an engineer whose distribution is anomalously skewed toward `observed_conforming` relative to peers on comparable work raises review, as does a developer whose engineers' distributions differ from the population; **substitution frequency per developer and per GC** (the direct G6-24 opinion-shopping signal); superseded-disposition rate.

**BoQ accuracy:** extracted-versus-as-built variance by material class, LOD, and extractor version; verification rate (how often a machine extraction is professionally accepted unchanged — a very high rate is itself suspicious); facility-sizing rejections on unverified input.

**IP & versioning:** licence suspensions raised and cured; **any correlation between suspension and subsequent platform standing** (any correlation is an I-19 violation and pages immediately); IFC supersession frequency; extract invalidations and re-issue latency; unresolved clashes at promotion attempts.

**Entitlements integrity:** approval velocity by body versus the body's distribution; registration lapses; official interaction log completeness; contingency-bonus usage by jurisdiction (should be near zero and each instance reviewable).

**Deliberately not collected:** any per-official behavioural model; any parcel-level density-arbitrage or upzoning-likelihood score; any correlation product between licence suspension and work allocation.

---

# PART V — RESIDUAL RISK & BOARD / REGULATORY REVIEW QUEUE

## V.1 Accepted residual risks

| Risk | Why accepted | Compensating control |
|---|---|---|
| An engineer physically present who nonetheless seals inadequately | Presence is verifiable; judgment quality is not | Disposition-distribution monitoring against peers, superseded-disposition persistence, E&O verification, graduated dispositions that make "conditions" cheap to record |
| A BoQ professionally verified but still wrong | Verification is a professional judgment, not a guarantee | LOD, confidence, and exclusions travel with it; variance monitoring; the verifier's own scope statement bounds their attestation |
| A jurisdiction that does not accept any digital seal | Statutory, not curable by the platform | The platform transports the wet-sealed artifact and records provenance; it never assumes the jurisdiction adapts |
| Off-platform coordination and RFIs | The platform cannot compel a project's communications onto it | Response clocks and cost-impact flags make on-platform materially faster; Group 4 exhibits favour the authenticated record |
| An owner who does not read the geotechnical disclosure prompt | Disclosure obligations are personal | Prompt routed to Group 4, acknowledgement recorded, adverse findings surfaced to the owner by default |

## V.2 Blocking board and regulatory review items

Each is a build-blocker for its surface.

1. **Professional licensure, per state and per discipline.** Seal content, statutory attestation language, digital-seal acceptance, and firm-registration requirements. **Blocks:** all sealing.
2. **Digital signature and seal acceptance.** Which jurisdictions accept which forms; whether the platform's transport satisfies board rules. **Blocks:** the sealing workflow per state.
3. **Structural observation and special inspection.** Confirm that the §II.5.3 provenance record satisfies code observation requirements, and settle who the AHJ recognizes as the observer of record. **Blocks:** the observation product.
4. **Contingency lobbying and lobbyist registration, per jurisdiction.** Whether the §II.6.5 bounded-bonus structure is permissible anywhere it is offered. **Blocks:** entitlement compensation.
5. **Anti-corruption.** Adequacy of §II.6.6 for elected-official contact, including pay-to-play contribution rules. **Blocks:** the entitlements product per jurisdiction.
6. **Unauthorized practice of architecture and engineering.** Whether automated BoQ extraction, code-checking, or Co-Pilot outputs constitute practice. Shared in kind with Group 4 item 1. **Blocks:** the parser and the Co-Pilot's technical surfaces.
7. **Copyright and licence.** Whether §II.8.2's grant model, downstream distribution, and derivative rules are sound, and whether the platform's own extraction of derivatives requires an express grant. **Blocks:** all downstream distribution.
8. **Professional record retention.** Board retention rules per state against §II.8.5, and the successor path on firm dissolution. **Blocks:** the records layer.
9. **Reliance and liability.** Whether presenting confidence-scored BoQs and provenance-verified observations to lenders creates platform liability for reliance. Related to Group 3 item 13.
10. **Geotechnical disclosure.** Seller disclosure obligations triggered by adverse findings, per state, and whether the platform's prompt creates a duty. **Blocks:** the geotech materiality classification.
11. **E&O and certificate-of-merit.** Whether verified coverage data creates reliance, and interaction with certificate-of-merit statutes in design-defect claims.

## V.3 Cross-group items surfaced here, owned elsewhere

- **Group 3** must consume `boq_may_size_facility()` before underwriting and must treat an observation disposition as an attestation input to §II.9.2 — never as a release key (Appendix A rows A49, A50).
- **Group 5** must derive trade extracts only from `current_ifc_revision()` and must handle extract invalidation on supersession (A52); its §II.5.2 entitlement engine must accept RFI-derived change orders (§II.10.2).
- **Group 4** receives geotechnical disclosure-obligation referrals (§II.9.6), fee-dispute matters routed away from safety determinations (§II.6.3), and licence-suspension notices exceeding the platform's document-preparation boundary (§II.8.4).
- **Group 1** must surface public-body submissions and geotechnical access in the Exposure & Privacy access log (§II.9.5, §II.9.6).
- **Group 2** must accept that data-room inclusion of design work operates strictly within `design_licences.permitted_uses` (§II.8.2).
- **Group 8** must supply licence-board integrations, national record-system verification, E&O carrier feeds, and lobbyist-registration checks.

---

# APPENDIX A — BOUNDARY CONTRACT WITH GROUPS 1–5

Extends the Group 2, 3, 4, and 5 boundary tables.

| # | Contested surface | Prior position | Group 6 draft position | **Resolution** |
|---|---|---|---|---|
| A49 | Engineer's role in draw release | G3 §II.9.2 three keys; G5 A37 confirmed | Engineer's signature is "the deterministic key that unlocks escrow" | **G3 governs.** The sealed disposition is an **attestation input**, not a key. The engineer holds no financial signature (§II.5.5). |
| A50 | BoQ as a facility-sizing input | G3 §II.5 sizes facilities; G5 §II.8.4 bids against BoQ | "Instantly outputs the exact requirements" → lender | **Constrained.** Only `professional_verified` or `quantity_surveyed` may size a facility or a bid (I-20). Both consuming gates enforce it. |
| A51 | BoQ liability | Not previously modelled | Unattributed machine output | **Attributed.** LOD, confidence, exclusions, and a named verifier with their own scope statement (§II.7). |
| A52 | Trade CAD extracts | G5 §II.9.4 required extraction, watermarking, licence terms | "Trade-specific CAD schematics" with no version state | **Supplied and constrained.** Extracts derive only from `issued_for_construction`, carry the revision id, and invalidate on supersession (§II.8.3). |
| A53 | Design IP | G5 A42 established: assist statutory rights, never suppress | No licence, scope, term, or non-payment right | **Same principle, second application.** Licence grant is explicit; the non-payment suspension right is assisted and protected by I-19, exactly as G5 §II.5.4 assists liens. |
| A54 | Parcel-level scoring | G1 §II.5.3 #5; G2 A1; G3 A19; G4 A32 | "Density arbitrage opportunity" per parcel | **Fifth application of the same rule.** Public zoning facts render unranked; the arbitrage score and assembler framing are withdrawn (§II.9.3). |
| A55 | Owner-signed intents | G1 §II.6.2 mutual opt-in; G4 §II.9.4 purpose-bound | Submitted to a planning commission as "legally binding" | **Consent-gated and corrected.** Redacted aggregate by default; identified submission requires per-owner consent naming the body and acknowledging permanence; binding status must be stated accurately (§II.9.5). |
| A56 | Neutral compensation | G3 §II.9.5 inspectors; G4 §II.5.3 arbitrators | Unspecified; approval gates the payer's money | **Same pattern, fifth application.** Project-funded observation escrow, fixed at engagement, paid regardless of disposition (§II.6.3, Appendix B). |
| A57 | Government-contingent fees | Not previously modelled | Zoning and design fees contingent on approvals | **Withdrawn.** Deliverable- and work-performed-based; bounded disclosed bonus only where the jurisdiction permits and the consultant is registered (§II.6.5). |
| A58 | Official influence data | G4 §II.8.3 anti-corruption for building-dept staff | Per-official council voting-behaviour map | **Extended upward and constrained.** Body-level statistics only; no per-official modelling; full G4 anti-corruption regime inherited (§II.6.6, §II.9.4). |
| A59 | AI in professional output | G4 §II.11.2 (lawyers) | Not addressed | **Same rule.** No model output may enter a sealed instrument without the seal holder's explicit authorship act (§II.11.3). |

---

# APPENDIX B — THE INDEPENDENCE PATTERN: ONE PROBLEM, SOLVED FIVE TIMES

Across six group audits, the same structural defect has appeared in five different drafts, each time in a different costume. It is worth naming once, because the seventh, eighth, and ninth drafts will contain it too.

**The pattern:** *a party whose judgment is supposed to protect someone else is selected, paid, or renewable by the party who benefits from a particular answer.*

| Group | The neutral | The defect as drafted | The resolution |
|---|---|---|---|
| **G3** §II.9.5 | Construction inspector | "The lender's designated inspector" — payer-selected | Rotation pool, project-funded escrow, paid regardless of finding |
| **G4** §II.5.3 | Arbitrator | Platform selects; platform earns on the dispute | Party strike-and-rank from a roster; published outcome statistics; compensation fixed at appointment; platform net revenue from outcomes is zero |
| **G4** §II.7.3 | Escrow holder | "Liquidates the escrow in favor of the seller" on its own view of breach | No authority to determine breach at all; mutual instruction, staged award, or court order |
| **G5** §II.6.3 | Delivery confirmer | The buyer's agent alone releases the seller's money | Counter-signature; the driver's attestation records even if the receiver refuses |
| **G6** §II.6.3 | Structural observer | Approval is "the deterministic key" to the payer's escrow | Project-funded observation escrow, fixed at engagement, **paid regardless of disposition**; the seal releases nothing |

**The three-part resolution, generalized:**

1. **Sever selection.** The interested party does not choose the neutral — a rotation, a random draw, or a mutual process does.
2. **Sever compensation from outcome.** The fee is fixed before the judgment and paid identically whatever the judgment is. This is the load-bearing element: it simultaneously removes the incentive to approve *and* the ability to withhold, closing both extortion directions at once.
3. **Sever the judgment from the money.** The neutral renders a determination; a different party effects the transfer. This preserves immunity where it exists, prevents the judgment from becoming a hostage, and keeps the neutral out of custody.

**Prediction for Groups 7–9.** Expect the pattern again in: the property manager who both dispatches repairs and approves their payment (G7); the admin who both verifies compliance and can release the payout it gates (G8); and the broker whose commission depends on a valuation or a match they influence (G9). Applying the three-part resolution pre-emptively will be cheaper than auditing it out.

---

# APPENDIX C — Traceability to `rbac-audit-red-team.md`

| Prior finding | Status for Group 6 | Resolved at |
|---|---|---|
| VULN-04 no `compliance_checks` INSERT policy | Group 6 supplies credential and licence data feeding the Group 3 §II.9.2 gate 5, where absence **blocks** | §II.2 |
| VULN-09 milestone-upload has no role check | Reinforced from the design side — an observation requires the individual seal holder plus a full provenance bundle, which is stricter than the contractor-capacity check Group 5 established | §II.5.3 |
| VULN-05 attorneys read all agreements | Closed in Group 4; Group 6 removes the residual `legal` app grant from `arch_zoning` that would have survived it | §III.6, Appendix D |
| DESIGN-01 `parties[].role` free text | Resolved — parties carry `(user_id, design_package_id, dp_role)` | §III.1.2 |
| DESIGN-03 layout `ALLOWED_ROLES` sets | Resolved — layout gates are coarse routing; the boundary is `is_design_package_party()` | §II.1 |

---

# APPENDIX D — Required Deltas to `phase8-sub-role-expansion-plan.md`

1. **BLOCKING — T8.2 must be rewritten for the architect policies.** The plan widens `documents_scoped_access` and `vision_inspections_scoped` to group checks. **Applying T8.2 as written ships G6-08**: every design professional reads every competing practice's models, drawings, and calculations — a copyright exposure, not merely a confidentiality one. Replace per `0042_group6_rls.sql`.
2. **T8.3 — `ROLE_APP_MAP`.** Remove `legal` from `arch_zoning`, making it `['design','escrow']`. Group 4 §II.1 moved legal access onto matter membership, so an app-segment grant with no matter-role basis is a dangling privilege that survives Group 4's closure of VULN-05 (G6-26).
3. **T8.5 — layout gates.** `(contractor)/layout.tsx` currently carries the three `arch_*` keys alongside the contractor keys. With `arch_zoning` losing `legal`, confirm the design roles route through a `(design)` group rather than inheriting a contractor layout, and that seal-holder status is **not** a layout-level gate (it is a manifest-level exclusion, §II.3.3).
4. **New tasks T8.33–T8.37.** Migrations `0038`–`0042` (§III.1), sequenced after the Group 5 set `0033`–`0037`.
5. **T8.4 — API guards.** Any route consuming a BoQ must call `boq_may_size_facility()` (I-20), and any route consuming a design document must call `licence_permits()` (§II.8.2). Neither exists in the plan.
6. **T8.6 — fixtures.** The `architect` persona needs a `practices` row at P2, a `seal_holders` row, a `professional_licences` row **matching the test property's jurisdiction and discipline**, `professional_liability`, and `dp_parties` rows. A separate `engineer` persona is required with an `observation_engagements` row. Tests must assert: that a seal by a firm account without a seal-holder row fails; that a `machine_extracted` BoQ cannot size a facility; and that a Group 5 trade cannot reach a non-IFC revision.
7. **Taxonomy count.** Unchanged at **27** (Group 4 Appendix D, Group 5 Appendix B). Group 6 introduces no new keys — `arch_ra`, `arch_engineer`, and `arch_zoning` were all present in the original 22.

---

**END OF MASTER BLUEPRINT — GROUP 6**
