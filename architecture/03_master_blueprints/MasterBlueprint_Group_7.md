# MASTER BLUEPRINT — GROUP 7: THE OPERATION (PROPERTY MANAGER & TENANT)

**Document class:** Production Architecture Specification
**Supersedes:** `architecture/02_draft_blueprints/07_group_the-operation_property-managers-tenants.md`
**Version:** 2.0 (Red-Teamed / Hardened)
**Date:** 2026-08-19
**Taxonomy scope:** 2 sub-roles — `prop_manager`, `prop_tenant`
**RLS group strings:** `property_manager`, `tenant` — **and this document removes both from the security boundary**
**Counterparty blueprints:** `MasterBlueprint_Group_1.md` · `_Group_2.md` · `_Group_3.md` · `_Group_4.md` · `_Group_5.md` · `_Group_6.md` v2.0 — **binding**; Appendix A is the boundary contract
**Forward dependency:** `02_draft_blueprints/09_group_the-connectors_brokerage.md` — unhardened; §II.13.4 states the rule Group 9 must adopt
**Stack:** Next.js 14 App Router · Supabase Postgres + RLS · Zustand Context Registry · Vercel AI SDK · Mapbox GL · $SHQL settlement rail

---

## 0. How To Read This Document

| Part | Contents |
|---|---|
| **Part I** | Red Team Audit — 35 findings, ranked, with exploit paths |
| **Part II** | Hardened Architecture — the corrected design |
| **Part III** | Implementation Spec — schema, RLS, API contracts, TS types |
| **Part IV** | Verification — RBAC matrix, acceptance criteria, CI guardrails, telemetry |
| **Part V** | Residual Risk & Board / Regulatory Review Queue |
| **Appendix A** | Boundary contract with Groups 1–6, and the forward rule for Group 9 |
| **Appendix B** | **The Independence Pattern** — one problem, now solved six times |
| **Appendix C** | **The Vulnerable-Counterparty Floor** — one principle, three groups |
| **Appendix D** | Traceability to `rbac-audit-red-team.md` |
| **Appendix E** | Required deltas to `phase8-sub-role-expansion-plan.md` |

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt

---

# PART I — RED TEAM AUDIT

## 0.1 Executive Verdict

**Group 7 is the only group in the ecosystem whose product is a specific human being's home, and the draft models that human as a data subject rather than as a party.**

Read the draft's own monetization sentence back: *"Per-unit SaaS subscription fees, applicant screening transaction fees ($30–$50 per application), and rent-roll micro-processing fees."* Two of those three revenue lines are extracted **from the tenant** — once when they ask for the housing, and again every month they pay for it. The tenant appears nowhere else in the economics. They appear in the UI as *"Restricted, unit-only schematic view ensuring privacy"* — privacy framed as a restriction placed on them rather than a protection owed to them.

Everything else in the audit follows from that inversion:

1. **The platform builds a consumer reporting agency and never says the words.** *"Automated Plaid/Open-Banking financial verification, credit scoring, and eviction checks"*, assembled into a risk score and furnished to a landlord for a fee, is the statutory definition of a consumer report furnished by a consumer reporting agency. The FCRA regime that attaches — permissible purpose, maximum possible accuracy, file disclosure, 30-day reinvestigation, adverse action notice — is entirely absent. So is any fair-housing testing, despite `ISO_42001_A_5_2_Impact_Assessment: true` being asserted in `ORCHESTRATOR_MASTER_STATE.md`.

2. **The approval rule is written; the denial rule is not.** *"If an applicant's verified income is 40x monthly rent, credit score exceeds 700, and housing court records are clean, the system auto-generates the lease."* The mirror case — the automated **no** — is where every dollar of legal exposure and every unit of human harm lives, and the draft does not model it at all. The three criteria as stated are a national hard rule that excludes housing-voucher holders by construction, treats eviction *filings* (not judgments) as disqualifying, and encodes a credit threshold with known disparate impact. It is a disparate-impact engine wired directly to an automated decision with no notice, no human, and no appeal.

3. **The same independence defect the ecosystem has now fixed five times, in its sixth costume — and Group 6 Appendix B predicted this exact one.** *"Upon completion of a verified repair, funds are released automatically from the maintenance reserve to the contractor."* Verified by whom? The property manager: the party who dispatches the repair, controls the vendor's future work, holds the reserve, releases the payment, and whose compensation improves when the repair does not happen. The only party who actually knows whether the heat works — the tenant — holds no key.

4. **Habitability is rendered as a cost line on an optimization dashboard.** *"Aggregate NOI dashboard"* + *"automated management fee deductions"* + a manager-controlled maintenance reserve is a real-time quantification of exactly how much a manager saves by deferring a repair. Heat, hot water, gas, mold, lead, locks, and elevators are not discretionary spend; they carry statutory clocks and a non-waivable warranty in nearly every US jurisdiction. The draft has one undifferentiated triage board and no habitability class. Worse: the platform's own record then proves the manager knew.

5. **The money mechanics reverse the trust hierarchy.** *"Deducting management fees before sweeping funds to the owner's ledger."* Rent collected on an owner's behalf is trust money in most states, generally requiring a segregated account and, in many, a real estate broker's licence to collect at all. Taking the manager's fee out of the corpus before the beneficiary is accounted to is the same defect Group 5 §II.5.3 closed as I-14 — prime margin ahead of a trust-priority claimant — in a domain where the corpus is a stranger's rent. Security deposits, the single most litigated object in residential tenancy, do not appear in the draft at all.

6. **The tenant's statutory remedies are automated away.** *"On the first of the month, the smart contract automatically executes the $SHQL rent transfer."* Rent withholding and repair-and-deduct are non-waivable remedies for habitability failure in most states; Regulation E requires a stop-payment right on preauthorized transfers and forbids conditioning service on them. An irrevocable monthly pull is a contract around a right the tenant cannot lawfully surrender, dressed as convenience.

7. **The word "eviction" appears once — as a screening input — and never as a thing the platform must refuse to become.** A system with automated arrears detection, a manager dashboard, dispatchable field labour, and a smart-lock market adjacent to it will be asked for remote lockout, utility control, and amenity revocation within two quarters of launch. Every one of those is self-help eviction, criminal in many states. An omission is not a control.

**The honest reframe.** The platform's defensible product here is not cheaper screening and it is not faster dispatch — both are commodities, and both are the surfaces where the platform's liability actually lives. It is **being the only operator in this market whose record is trusted by both sides**: an applicant-held screening report that is ordered once, disputed properly, and reusable; a habitability clock that runs in public and cannot be stopped by a payment dispute; a repair completion that requires the occupant's confirmation; a trust ledger where the owner's money and the tenant's deposit are provably where they are supposed to be; and a tenancy record that belongs to the tenant and survives the manager. Every one of those is a thing an owner will pay more for, precisely because the tenant can rely on it. Part II builds that.

## 0.2 Finding Register

| ID | Sev | Domain | Finding |
|---|---|---|---|
| G7-01 | 🔴 | FCRA | The screening engine is a consumer reporting agency operating with none of the regime |
| G7-02 | 🔴 | Fair Housing | 40x / 700 / "clean housing court" is a national hard rule with disparate impact and source-of-income exclusion |
| G7-03 | 🔴 | Automated Decision | The denial path is unmodelled — no adverse action notice, no human review, no appeal |
| G7-04 | 🔴 | Fees / Fraud | $30–$50 application fee exceeds statutory caps and creates a phantom-listing fee farm |
| G7-05 | 🔴 | Privacy | Raw open-banking transaction ingestion is industrial-scale protected-class inference |
| G7-06 | 🔴 | Retention | Applicant dossiers held indefinitely and duplicated across every manager applied to |
| G7-07 | 🟡 | Product | Screening score is either a portable blacklist or a fee paid twelve times |
| G7-08 | 🔴 | Independence | The manager dispatches, verifies, and releases the repair payment; the tenant holds no key |
| G7-09 | 🔴 | Habitability | NOI optimization with no habitability floor is deferred-maintenance-as-a-service |
| G7-10 | 🟠 | Safety | Emergency dispatch depends on marketplace liquidity and has no fail-safe; "live map availability" is worker surveillance |
| G7-11 | 🟠 | Privacy | A stranger dispatched into an occupied home, plus geotagged photographs of its interior |
| G7-12 | 🔴 | Trust Funds | Rent is trust money; the draft takes the management fee out of the corpus first |
| G7-13 | 🔴 | Trust Funds | Security deposits do not appear in the architecture at all |
| G7-14 | 🔴 | Consumer | Irrevocable auto-pay contracts around non-waivable withholding remedies and Reg E stop-payment |
| G7-15 | 🟠 | Ledger | Unspecified payment-application ordering silently manufactures a rent default out of a fee |
| G7-16 | 🟠 | Settlement | A rail failure or a settlement-band miss becomes the tenant's default |
| G7-17 | 🟠 | Records | "Immutable rent receipts" defeat correction, and the ledger becomes a tenant blacklist |
| G7-18 | 🟠 | Fees | A processing fee levied on a housing payment, with no guaranteed free method |
| G7-19 | 🔴 | Eviction | Nothing in the design forbids the platform becoming a self-help eviction instrument |
| G7-20 | 🔴 | Records | Losing platform access means losing the tenant's entire evidentiary record |
| G7-21 | 🟠 | Dispute | The tenant's only escalation path is the counterparty they are escalating against |
| G7-22 | 🟠 | Consumer | The "forbearance protocol" is a permanent adverse record the tenant is induced to author |
| G7-23 | 🟠 | Retaliation | Retaliation is unmodelled, and the platform's records make it easier to perform |
| G7-24 | 🟠 | Model | Co-tenants, guarantors, occupants, and subtenants do not exist |
| G7-25 | 🟠 | Regulated | Rent-regulated units and automated increases produce statutory overcharges |
| G7-26 | 🟡 | Lifecycle | No renewal, notice statutes, just-cause grounds, move-out, or deposit-return clock |
| G7-27 | 🔴 | RBAC | Two group strings gate an entire rental market's consumer financial and housing data |
| G7-28 | 🔴 | RBAC | The management mandate is not modelled — role possession is treated as authority to collect rent |
| G7-29 | 🟠 | Safety | Occupancy data is a stalking and domestic-violence dataset; VAWA protections are absent |
| G7-30 | 🔴 | Antitrust | Cross-manager "market rent benchmarks" is algorithmic price coordination |
| G7-31 | 🟠 | Monetization | A per-unit subscription lapse reaches into the tenancy, the trust corpus, and the records |
| G7-32 | 🟡 | Positioning | The "Anti-Broker Engine" is a brokerage-licensure claim, a UPL surface, and a Group 9 collision |
| G7-33 | 🟡 | FCRA | Rent reporting makes the platform a furnisher; post-tenancy balances make it a collector |
| G7-34 | 🟢 | UX | Maximal-intrusion onboarding before any value, and an applicant with no workspace |
| G7-35 | 🟢 | Taxonomy | Residential and commercial tenancy share one key and one protection regime |

---

## 1. Screening, Fair Housing & Applicant Data

### G7-01 🔴 The screening engine is a consumer reporting agency operating with none of the regime

**Draft text:** *"The portal integrates automated Plaid/Open-Banking financial verification, credit scoring, and eviction checks."* Monetized as *"applicant screening transaction fees ($30–$50 per application)."*

**Finding.** Assembling or evaluating consumer credit, financial, and public-record information, for the purpose of furnishing it to a third party who will use it to decide a housing application, for a fee, is the statutory definition of a **consumer reporting agency furnishing a consumer report**. The draft describes the activity precisely and implements none of the obligations that attach to it:

| Obligation | Draft |
|---|---|
| Permissible-purpose certification by the user (landlord) | absent |
| Reasonable procedures to assure **maximum possible accuracy** | absent |
| Consumer file disclosure on request | absent |
| Dispute intake and **reinvestigation within 30 days** | absent |
| Correction propagation to everyone who received the report | absent |
| Adverse action notice naming the agency and the consumer's rights | absent |
| Obsolescence limits on stale public records | absent |
| Identity-theft block procedure | absent |

**Exploit.** An applicant is denied on a mismatched eviction record belonging to a different person with a similar name — the single most common tenant-screening error in the enforcement record. Under the draft there is no notice telling them a report was used, no way to see the file, no dispute path, and no mechanism to correct the record before they apply to the next eleven units. The error follows them across the entire platform, at $40 a time.

**Aggravating factor.** The draft's rule cites *"eviction checks"* as a first-class input. Eviction **filings** are widely known to be inaccurate, are sealed or restricted from tenant-screening use by a growing set of jurisdictions, and are subject to obsolescence limits. A national pipeline that treats them as a binary disqualifier is the fact pattern regulators have repeatedly brought actions on.

`FIX →` §II.4. The screening product is rebuilt as a **regulated, applicant-initiated, applicant-held consumer report** with the full §II.4.5 accuracy, disclosure, dispute, and adverse-action regime, delivered through a licensed reporting partner or under the platform's own registration — either way, the obligations are implemented, not inherited by accident.

---

### G7-02 🔴 A national hard rule with disparate impact and source-of-income exclusion

**Draft text:** *"If an applicant's verified income is 40x monthly rent, credit score exceeds 700, and housing court records are clean, the system auto-generates the lease and sends a sign request."*

**Finding.** Three thresholds, no jurisdiction parameter, no individualized assessment, no documented business necessity, no less-discriminatory-alternative analysis, and no outcome testing. Each one is independently defective:

- **`income ≥ 40× monthly rent`.** Applied to the **full** contract rent, this excludes housing-voucher holders by arithmetic — the voucher pays the majority of the rent, so the tenant's own income can never reach the multiple. Source-of-income discrimination is prohibited by statute in a large and growing set of states and municipalities, including the NYC market the draft explicitly targets. Several jurisdictions additionally cap the permissible income ratio outright. The rule also excludes fixed-income seniors, disability-benefit recipients, and anyone with substantial assets and modest income.
- **`credit score > 700`.** A threshold well above the median, applied uniformly, with well-documented disparate impact by race and national origin, and no demonstrated relationship to payment performance at that cut point. Thin-file and no-file applicants — disproportionately young, immigrant, and lower-income — fail it categorically rather than on evidence.
- **`housing court records are clean`.** Filings, not judgments. A tenant who *won* their case, or whose case was dismissed, or who was named on a building-wide filing, has a record that is not "clean."

Stacked and multiplied, the three produce a compound exclusion rate no one has ever measured, applied at machine speed across every unit on the platform. This is exactly what `ISO_42001_A_5_2_Impact_Assessment` in the orchestrator state file asserts has been verified. It has not.

**Exploit — no bad actor required.** The platform ships one default policy. Every manager accepts it because it is the default. The platform has now imposed a single, untested, unlawful-in-several-markets admissions rule on its entire housing inventory, and the disparate impact is attributable to the platform rather than to any individual landlord.

`FIX →` §II.4.2 — criteria become a **published, versioned, jurisdiction-parameterized `screening_policy` object** with no national default; §II.4.4 mandatory pre-deployment and continuous disparate-impact testing per ISO 42001 A.5.2; voucher-aware ratio computation on the **tenant's portion only**, with subsidy status excluded from every input; jurisdiction rule packs governing eviction-record and criminal-record use, including individualized assessment where required.

---

### G7-03 🔴 The denial path is unmodelled — no adverse action, no human, no appeal

**Finding.** The draft specifies exactly one outcome: approval, automatically, with a lease generated and a signature requested. The **no** is not designed. That is where every regulatory obligation and every real human harm sits.

What is missing on denial:
- Any notice at all that a decision was made, or that a report was used.
- The adverse action notice: the reporting agency's identity and contact details, a statement that the agency did not make the decision, the consumer's right to a free file copy within 60 days, and the right to dispute.
- The **key factors** and score disclosure where a score was used.
- **Human review.** A consequential automated decision on housing, made with no human in the loop, is exactly the category that a growing set of jurisdictions now require notice and human review for, and it is the category most likely to attract statutory automated-decision rules over this system's lifetime.
- Any appeal, reconsideration, or supplemental-evidence path — the applicant with a co-signer, a larger deposit, twelve months of rent receipts, or a corrected record has nowhere to put them.

**Also unmodelled: conditional approval.** Real leasing runs on gradations — approved with a guarantor, approved with additional deposit where lawful, waitlisted. A binary auto-approve gate turns every gradation into a silent denial. This is structurally identical to G6-12, where the engineer could only say yes.

`FIX →` §II.4.3 — **auto-approve permitted, auto-deny prohibited (I-25)**. Graduated dispositions. Every adverse or conditional outcome requires a named human at the manager, a reason drawn from the published policy, an adverse action notice through §II.4.5, and a supplemental-evidence path that reopens the decision.

---

### G7-04 🔴 The application fee exceeds statutory caps and creates a phantom-listing fee farm

**Draft text:** *"applicant screening transaction fees ($30–$50 per application)."*

**Finding — two distinct defects.**

**(a) The number is unlawful in several launch markets.** Application-fee caps, actual-cost limits, mandatory itemized receipts, and refund-of-unused-portion requirements are statutory in a substantial set of states — including caps materially below $30, and including the NYC market the draft names. A flat national $30–$50 is not a pricing decision; it is a compliance failure with per-application statutory damages.

**(b) The incentive structure is corrupt, and it invites a specific fraud.** Platform revenue rises with the **number of applications**, not with the number of tenancies. Two consequences follow directly:

```
PLATFORM INCENTIVE   more applicants per unit → more revenue
                     fewer approvals per applicant → more applications → more revenue
                     The platform earns most when the market works worst.

PHANTOM LISTING      an actor lists a unit they do not control, collects 60 applications
                     at $40, and never leases it. Under the draft nothing verifies that
                     the lister has any relationship to the property (see G7-28), so the
                     fee farm is not merely possible — it is the highest-margin use of
                     the product as designed.
```

`FIX →` §II.4.7 — the screening fee is **cost-based, jurisdiction-capped, receipted, and refundable for the unused portion**, and the platform books **zero net revenue per application** (the G4 §II.12.2 pattern, applied here). §II.4.8 — accepting applications requires a verified `management_engagement` traceable to a Group 1 V3 owner binding, which removes the phantom-listing surface entirely. §II.4.1's applicant-held report means the applicant pays **once**, not once per door.

---

### G7-05 🔴 Raw open-banking transaction ingestion is protected-class inference at scale

**Draft text:** *"automated Plaid/Open-Banking financial verification"*; *"income linking"* in the tenant onboarding flow.

**Finding.** A bank-account link does not return "income." It returns a transaction ledger. That ledger discloses, in plain text, to a housing decision-maker:

```
medical and behavioural-health providers · reproductive health clinics · addiction
treatment · religious institutions · union dues · political contributions · bail and
criminal-defence payments · immigration legal services · domestic-violence shelters ·
gambling · alimony and child support · disability and public-benefit deposits
```

Every line of that list is a direct read on a protected characteristic or on facts a housing provider is prohibited from considering. The draft ingests all of it, in a housing admissions decision, and retains it (G7-06). No data minimization, no purpose limitation, no field-level filtering, no retention limit, no revocation at decision. It also collides with `ISO_27001_A_8_1_PII_Encryption` and `TDPA_90_Day_Destruction` as asserted in the orchestrator state file, neither of which is implementable against an unbounded transaction corpus.

**Exploit.** A manager reviewing an application sees six months of transactions and declines. The stated reason is "insufficient documentation." The actual reason is a clinic name. Nothing in the draft records that the manager ever saw it, and nothing prevents them from seeing it.

`FIX →` §II.4.6 — the platform receives **derived attestations only**: verified income amount, stability, and continuity, computed inside the aggregator boundary and returned as a signed attestation object. **The raw transaction stream never enters platform storage and never reaches any manager surface, at any tier, ever.** The connection is single-use and purpose-bound, revoked at decision, and the attestation carries its own method and confidence, exactly as the Group 6 §II.7 BoQ carries its LOD.

---

### G7-06 🔴 Applicant dossiers held indefinitely and duplicated across every manager applied to

**Finding.** An applicant applies to twelve units. Under the draft, twelve independent managers each hold a permanent copy of that person's government ID, credit file, eviction search, and bank-derived financial history, and the platform holds the union of all of it, forever, with no purpose limitation. Eleven of those twelve have no lawful ongoing need for any of it.

There is no TTL, no purge, no separation between the **fair-housing record-retention duty** (a real obligation, satisfied by a sealed record) and **operational access** (no duty, no justification). The draft's own governing gate `TDPA_90_Day_Destruction: true` asserts time-to-live indexes exist. None are specified.

**Exploit.** A single manager account compromise yields a complete financial and identity dossier on every person who ever applied to that portfolio — including the people who were declined, who never became customers, and who have no relationship with the platform at all. The blast radius of the least-secured actor in the system is the entire applicant population.

`FIX →` §II.4.9 (I-28) — applicant data is **purpose-bound to a single unit application**, auto-purged on a short clock after disposition. The retention-obligated subset persists **only** in a sealed compliance store that is write-once, no-manager-read, and reachable only by audited compliance query. The applicant-held report model (§II.4.1) means the identity and financial evidence lives with the applicant, not scattered across twelve landlords.

---

### G7-07 🟡 The screening score is either a portable blacklist or a fee paid twelve times

**Finding.** The draft's score has no stated scope, which forces an unacknowledged choice:

- **Portable across applications** → it is a durable, platform-computed reputational score attached to a person's housing prospects. That is a blacklist, it is a consumer report in its own right, and it inherits every FCRA obligation plus the entire tenant-blacklisting enforcement history.
- **Not portable** → the applicant pays $40, twelve times, for twelve identical credit pulls, and each pull is a hard inquiry.

Both are bad. The draft picks neither, which means the implementation will pick portable, because it is cheaper.

`FIX →` §II.4.1 — **applicant-initiated, applicant-held, applicant-revocable, time-boxed and reusable**. The applicant orders one report, holds it, and grants scoped, expiring access to specific managers. It is not a platform-held score, it is not computed about them without their act, and it is destroyed on revocation. The platform never maintains a cross-applicant ranking of any kind (§II.13.5, deliberately-not-built list).

---

## 2. Habitability, Maintenance & the Independence Defect

### G7-08 🔴 The manager dispatches, verifies, and releases the repair payment — and the tenant holds no key

**Draft text:** *"Upon completion of a verified repair, funds are released automatically from the maintenance reserve to the contractor."*

**Finding.** Verified by whom, and paid for by whom, are the two questions the draft never asks. In the design as written the property manager simultaneously:

```
· dispatches the vendor          → controls the vendor's future work volume
· defines "complete"             → sole verifier
· holds the maintenance reserve  → custodian
· releases the payment           → disburser
· earns on collected rent, and   → beneficiary of every dollar not spent on repair
  reports NOI as the headline
```

**This is the sixth appearance of the pattern this corpus has now fixed five times** — and `MasterBlueprint_Group_6.md` Appendix B predicted this specific instance by name: *"the property manager who both dispatches repairs and approves their payment (G7)."*

| Group | Neutral | Resolution |
|---|---|---|
| G3 §II.9.5 | Construction inspector | Rotation pool, project-funded escrow, paid regardless of finding |
| G4 §II.5.3 | Arbitrator | Party-driven selection, compensation fixed at appointment |
| G4 §II.7.3 | Escrow holder | No authority to determine breach at all |
| G5 §II.6.3 | Delivery confirmer | Counter-signature; the driver's attestation records regardless |
| G6 §II.6.3 | Structural observer | Paid regardless of disposition; the seal releases nothing |
| **G7** | **Repair verifier** | **Re-imports the defect, with a resident living in the outcome** |

**Extortion runs in both directions.** A manager can withhold a subcontractor's payment indefinitely by simply not marking a job verified, and the sub's dispatch volume depends on the same manager — so the sub does not object. Conversely a manager can demand a kickback as a condition of dispatch, and the platform's own dispatch queue is the enforcement mechanism.

**And the person with the only reliable evidence is excluded.** The tenant is standing in the apartment. They know whether the radiator is hot. The draft gives them a ticket status field.

`FIX →` §II.5.4 — **three-key repair completion**: the contractor submits a provenance-bound completion bundle (G5 §II.6.2); the **tenant confirms or states a deficiency**; the manager releases under the owner's mandate. Non-response auto-escalates and settles the undisputed portion (G5 §II.6.3). A manager hold requires a stated deficiency citing a numbered item, else it is void and escalates (G3 §II.9.6). §II.5.5 makes the manager's compensation **structurally indifferent** to whether the repair happens.

---

### G7-09 🔴 NOI optimization with no habitability floor is deferred-maintenance-as-a-service

**Draft text:** *"Portfolio Health & NOI: Aggregate NOI dashboard, market rent benchmarks, and vacancy alerts."* Paired with *"Maintenance Dispatch Desk: Live triage board."*

**Finding.** The draft ships a real-time net-operating-income optimizer over a portfolio of occupied homes, and a single undifferentiated maintenance queue with no classification, no statutory clock, and no floor. Together they compute, continuously and legibly, the exact margin benefit of not fixing something.

There is no concept of:

```
· the implied warranty of habitability (non-waivable in nearly every US jurisdiction)
· essential services with statutory response windows (heat, hot water, gas, water,
  electricity, working locks, elevator in a walk-up-exempt building)
· lead, mold, pest, and carbon-monoxide obligations with their own regimes
· jurisdictional repair clocks and the tenant remedies that attach when they lapse
· the distinction between an emergency, a habitability defect, and a cosmetic request
```

**The second-order defect is evidentiary and worse for the operator.** The platform's own timestamped record — ticket opened, classified, seen by the manager, not dispatched for 31 days — is the single best exhibit a tenant's counsel could ask for in a habitability action, a rent-abatement claim, or a code-enforcement referral. The draft builds that exhibit and hands the manager an interface that encourages producing it.

`FIX →` §II.5.1 mandatory **condition classification** with jurisdiction-loaded statutory clocks; §II.5.2 the **habitability floor (I-27)** — a habitability-classified condition is never gated on payment status, escrow balance, subscription state, or an open dispute, and the platform funds emergency dispatch against the engagement rather than allowing a manager delinquency to reach a resident; §II.5.3 a public, immutable clock with automatic escalation to the owner, then to a Group 4 matter, then to a tenant-triggered code-enforcement referral; §II.13.2 removes habitability spend from every optimizable surface and renders it as non-discretionary.

---

### G7-10 🟠 Emergency dispatch has no fail-safe, and "live map availability" is worker surveillance

**Draft text:** *"Property managers can instantly dispatch on-call, vetted specialty trades (electricians, plumbers) at any hour via live map availability."*

**Finding — two defects.**

**(a) There is no failure path.** A gas smell at 03:00 in January cannot depend on whether a marketplace has liquidity in that ZIP code at that hour. The draft has no answer for zero acceptances, no timeout, no escalation, and no non-marketplace terminal. It also markets an emergency capability, which creates a reliance the platform cannot honour and a duty it has not accepted.

**(b) "Live map availability" of individual tradespeople is continuous location tracking of workers the platform claims are independent.** Group 5 §II.11 built a worker classification firewall precisely to keep the platform out of direction and control. Real-time GPS position, acceptance pressure, and dispatch ranking are three of the strongest indicia of an employment relationship, imported here casually as a UI feature.

`FIX →` §II.5.7 — an **escalation ladder with a non-marketplace terminal**: timed dispatch attempts, then a platform-arranged emergency panel, then the manager's own non-delegable duty, with the tenant holding a **unilateral** path to utility emergency, 911, and code enforcement surfaced in-product at every stage. The platform never represents itself as emergency response. Availability is **self-declared and coarse** (service area and on-call window), never live position — inheriting G5 §II.11 unchanged.

---

### G7-11 🟠 A stranger dispatched into an occupied home, and photographs of its interior

**Draft text:** *"Geotagged photographic ticketing with real-time vendor dispatch tracking."*

**Finding.** The draft's dispatch flow sends an identified vendor to a specific unit, at a known time, where a known person lives — and it captures photographs of the inside of that person's home. Neither side of that is modelled:

- **Entry.** No statutory notice period (commonly 24 hours, with a genuine-emergency exception), no tenant-selected windows, no vendor identity verification presented to the tenant, no record of who entered and when that the tenant can read, and no scope limit on what the vendor is told. As drafted, the vendor's job card can carry the tenant's name, phone, payment status, and household composition, none of which is necessary to fix a sink.
- **Imagery.** Photographs of a home's interior are among the most sensitive media the platform will ever hold. There is no retention limit, no restriction on vendor-side copies, no tenant access to their own submissions, no redaction path, and no rule preventing those images from reaching an owner, a lender data room, a marketing surface, or a model training set.

`FIX →` §II.5.6 — statutory entry notice, tenant-selected windows, **minimum-necessary vendor disclosure** (unit, scope, window, access instructions — never payment status, screening data, household composition, or DV flags), a tenant-visible entry record, vendor identity card rendered to the tenant before arrival, and in-unit imagery held under Class-T restriction (§II.11.1) with defined retention, tenant read-and-export rights, no vendor-side retention, and categorical exclusion from every aggregate, export, marketing, and training surface.

---

## 3. Rent, Trust Funds & the Settlement Rail

### G7-12 🔴 Rent is trust money, and the draft takes the management fee out of the corpus first

**Draft text:** *"Monthly $SHQL rent transfers execute automatically, deducting management fees before sweeping funds to the owner's ledger."*

**Finding.** Rent collected by an agent on a principal's behalf is **trust money** in most US jurisdictions. Three constraints attach, and the draft violates all three:

1. **Segregation.** Trust funds are held in a designated account, separate from operating funds, with per-beneficiary sub-accounting. The draft has one flow and no corpus.
2. **No self-payment before accounting.** Deducting the agent's own compensation from the corpus before the beneficiary is accounted to is, in a large number of states, a licence-revocation offence regardless of whether the amount was owed. The draft makes it the default automated behaviour.
3. **Licensure.** In many states, collecting rent and negotiating leases for compensation on behalf of an owner **requires a real estate broker's licence**. The draft's `prop_manager` has no licence model at all (see also G7-32).

This is structurally the same defect Group 5 §II.5.3 closed as **I-14** — routing prime margin ahead of a trust-priority claimant — with the corpus now being a resident's rent and the claimant being the property owner.

**Additional exposure:** receiving a consumer's funds and transmitting them to a third party is money transmission in most states absent an applicable exemption. The draft assumes the rail is neutral plumbing. It is a regulated activity.

`FIX →` §II.6.1 three segregated corpora (`rent_trust`, `deposit_trust`, `reserve_trust`); §II.6.2 the **waterfall is inverted** — collect → trust → **owner sweep** → manager fee invoiced against the owner's account under a standing instruction with an itemized statement, never a deduction from the corpus (**I-26**); §II.2.1 the M2 rung requires the jurisdiction's licence, a verified trust account, and a fidelity bond.

---

### G7-13 🔴 Security deposits do not appear in the architecture at all

**Finding.** The word "deposit" does not occur in the draft. This is the most litigated object in residential tenancy and it carries, across US jurisdictions, some combination of:

```
· mandatory segregation in a designated account, often at a named institution
· written notice to the tenant of the depository and account
· interest accrual belonging to the TENANT, payable annually or at termination
· statutory caps on amount (commonly 1–2 months)
· itemized statement of deductions within 14–30 days of surrender
· forfeiture of the right to deduct if the statement is late
· double or treble damages for wrongful retention
```

A platform that automates rent and holds a "maintenance reserve" will hold deposits — and the draft's only reserve concept is manager-controlled and repair-funding. Rolling a tenant's deposit into a manager-controlled repair reserve is conversion, and paying the owner's repair obligation from the tenant's deposit is conversion twice.

`FIX →` §II.6.3 — `deposit_trust` as a first-class, per-tenancy, per-jurisdiction corpus: statutory depository, interest handling and ownership, notice of depository generated and delivered at move-in, a move-out itemization workflow with dated photographic evidence and the statutory clock running in public, **automatic release of the undisputed portion**, and a dispute route to Group 4. **A deposit can never fund the reserve, and never funds an obligation the owner independently owes.**

---

### G7-14 🔴 Irrevocable auto-pay contracts around non-waivable remedies

**Draft text:** *"On the first of the month, the smart contract automatically executes the $SHQL rent transfer."* Tenant UI: *"Auto-pay configuration."*

**Finding.** In most US jurisdictions a tenant facing a habitability failure holds statutory remedies that are **non-waivable by contract**: rent withholding, repair-and-deduct, and in some jurisdictions payment into court. All three require the tenant to be able to **not pay**, deliberately, at a moment of their choosing. An automated pull the tenant cannot stop removes the remedy while leaving the statute intact — which means the design does not eliminate the dispute, it just guarantees the platform is a defendant in it.

Independently, Regulation E governs preauthorized electronic fund transfers from a consumer account: written authorization with a copy to the consumer, the right to **stop payment up to three business days before** the scheduled transfer, and a prohibition on **conditioning** the extension of credit or service on preauthorized transfers. The draft has an "auto-pay configuration" screen and no stop-payment path, no authorization artifact, and no rule against making autopay a condition of tenancy.

`FIX →` §II.6.5 — autopay is revocable **in one action**, with an explicit stop-payment path meeting the Reg E window and a **withholding-intent** flow that suspends the pull, records the tenant's stated habitability basis, opens the §II.5.3 clock, and routes to §II.8 escalation. Autopay may never be required, incentivized by a fee differential, or made a screening criterion. **At least one free payment method always exists** (§II.6.9).

---

### G7-15 🟠 Unspecified payment-application ordering manufactures a rent default out of a fee

**Finding.** Rent arrives short — the ordinary case, not the exception. The draft's automated ledger will apply it somewhere, and whichever ordering the implementation picks becomes a legal act with consequences the design never considered:

```
FEE-FIRST      a $50 late fee absorbs $50 of rent → the tenancy is now $50 short on RENT
               → non-payment notice → housing court. A fee has been converted into
               grounds for eviction.
RENT-FIRST     the statutorily preferred ordering in many jurisdictions, and the only
               one that does not manufacture a housing default out of an ancillary charge.
```

Also unmodelled: statutory grace periods, per-jurisdiction late-fee caps (commonly a small percentage, only after grace), the rule in many jurisdictions that **accepting partial rent waives a pending notice**, and the distinction between rent and non-rent charges (utilities, fees, damages) which several jurisdictions forbid from being pursued as rent at all.

`FIX →` §II.6.6 — **rent-first, oldest-first**, mandatory; per-jurisdiction grace periods and fee caps loaded as policy; fees held in a **separate sub-ledger that can never convert into a rent delinquency**; partial payments accepted without waiver consequence and without auto-generating any notice.

---

### G7-16 🟠 A rail failure becomes the tenant's default

**Finding.** Group 1 §II.7.2 is explicit that the HTTP response is never authoritative and confirmation arrives only from a chain indexer, with `broadcasting`, `failed`, and `needs_review` as real states; §II.7.6 permits a ±2% settlement band. Applied unchanged to rent, that means a tenant who authorized payment on the 1st can be **legally in default on the 5th** because of a reorg, an indexer lag, an operator review queue, or a settlement drift of 1.9% — none of which they can observe, influence, or remedy.

In every other group in this corpus, a stalled intent costs someone a delayed draw. Here it costs someone their tenancy.

`FIX →` §II.6.4 (**I-23**) — **discharge on authorization**. The tenant's obligation is satisfied at the Phase-0 authorization timestamp, which is durable and committed before anything touches a rail. Rail state renders as `paid — settling` and is the platform's problem, never the tenant's default. No late fee, no notice, no arrears status, and no reporting may be triggered by a rail-side state. Short settlement inside the band is absorbed by the platform, not billed to the resident.

---

### G7-17 🟠 Immutability defeats correction, and the ledger becomes a blacklist

**Draft text:** *"Auto-pay configuration and immutable rent receipts."*

**Finding — the same shape as G6-16, with higher stakes.** Things that must be correctable in a rent ledger and cannot be under strict immutability: a misposted payment, a payment credited to the wrong unit, a court-ordered rent abatement, a rescinded charge, an identity-theft transaction, a fee assessed under a policy later found unlawful, and a sealed or expunged housing-court outcome that a jurisdiction requires be removed from tenant records.

**And the second-order problem is worse than the first.** A durable, portable, platform-attested record of a person's late payments is a **tenant blacklist** — the artifact at the centre of the tenant-screening enforcement history. The draft creates it as a side effect of a receipt feature, with no rule about who may read it, how long it persists, or whether it follows the tenant to their next application (which G7-07 leaves open).

`FIX →` §II.6.7 — append-only with **typed correcting entries**; correction is a first-class operation, never mutation and never deletion-as-correction. §II.11.2 classifies the payment history as **Class-T restricted**: readable by the tenant and by the parties to that tenancy, never by another manager, never a screening input absent the tenant's §II.4.1 grant, never an export, never an aggregate, never a model feature.

---

### G7-18 🟠 A processing fee levied on a housing payment, with no guaranteed free method

**Draft text:** *"rent-roll micro-processing fees."*

**Finding.** The draft does not say who pays. If it is the tenant, it is a surcharge on a non-discretionary housing payment — increasingly capped or prohibited outright by junk-fee statutes, frequently required to be disclosed pre-authorization, and in several jurisdictions unlawful unless a **free method** remains available. If it is the owner, then passing it through to the tenant as "rent" without disclosure is a different violation. And if it is taken from the corpus, it is G7-12 again.

`FIX →` §II.13.3 — rent processing is charged to the **owner or manager**, never to the resident as a condition of paying rent. **At least one free tenant payment method always exists.** An optional expedited method may carry a disclosed fee, presented before authorization, never applied to the free path, and never taken from the trust corpus (**I-26**).

---

## 4. Tenancy Power, Eviction & Records

### G7-19 🔴 Nothing in the design forbids the platform becoming a self-help eviction instrument

**Finding.** The draft never mentions eviction as a thing the platform must refuse to become. It nonetheless assembles every component: automated arrears detection, a manager control surface, per-unit state, dispatchable field labour, and an operational posture adjacent to smart-lock and utility-submetering vendors. The feature requests that follow launch are predictable and specific:

```
"disable the tenant's smart-lock credential on day 6 of non-payment"
"suspend the delinquent unit's amenity, parking, laundry, or package-room access"
"cut submetered utility service pending payment"
"lock the tenant out of the resident portal until the balance clears"
```

Every one of the first three is **self-help eviction** — criminal in a substantial number of states, with statutory and punitive damages, and unlawful regardless of what a lease says. The fourth is not criminal but is arguably worse in practice: it destroys the tenant's access to their own lease, ledger, receipts, and photographic evidence at precisely the moment they need them in court (G7-20).

An omission is not a control. If the capability can be built, it will be requested, and a product team without a written prohibition will ship it.

`FIX →` §II.7.1 (**I-22, the Access Floor**) — an explicit, enumerated, CI-enforced prohibition: **no platform capability may deny, condition, or degrade a tenant's physical access to their dwelling, its utilities, or its habitability, under any state, for any reason.** Smart-lock integrations, if built at all, are tenant-controlled and structurally incapable of manager-initiated lockout. The resident portal is never revocable by a manager (§II.9).

---

### G7-20 🔴 Losing platform access means losing the tenant's evidentiary record

**Finding.** By design, the platform will hold the tenant's lease, every rent receipt, every maintenance ticket with its timestamps, every photograph they submitted, every entry record, and every message with their manager. That corpus **is** the tenant's case — in a habitability action, a deposit action, a retaliation defence, or a non-payment defence.

The draft gives the manager the account relationship and the subscription. So the tenant's entire evidentiary record can vanish because: the manager stopped paying, the owner changed management companies, the engagement ended, the manager revoked the account, or the tenancy ended. In three of those five the party with the incentive to make the record disappear is the party who can.

Group 1 §II.8.5 established the Obligation Lock — *"a payment failure can never separate a user from a contract they are bound by."* Group 7 needs a stronger version, because here the counterparty controls the subscription and the tenant does not.

`FIX →` §II.8 — the **Tenancy Records Guarantee**. The tenant's copy is the tenant's property: exportable at any time, free, in a form meeting the Group 4 §II.10 authentication standard, surviving tenancy end plus the jurisdiction's limitations period, manager change, owner change, engagement termination, subscription lapse, and any manager-side account action. **A manager cannot revoke, suspend, or degrade a tenant's account** — the capability does not exist in the schema.

---

### G7-21 🟠 The tenant's only escalation path is the counterparty they are escalating against

**Finding.** Trace every tenant-side workflow in the draft to its terminus and it ends at the property manager. Maintenance ticket → manager triage. Payment dispute → manager ledger. Lease question → manager. Forbearance request → manager. The manager holds dispatch, verification, the reserve, the ledger, the record, the renewal decision, and the notice-generation surface.

There is no neutral, no arbitrator route, no legal-aid referral, no code-enforcement path, no owner escalation, and no platform ombuds. Group 4 built an entire arbitration protocol with a neutrality wall (I-10, I-11, I-12) and Group 7 does not reference it once.

`FIX →` §II.8.3 — a **tenant escalation ladder** that does not require the manager's consent at any rung: manager → owner (surfaced into the Group 1 workspace, because the owner carries the non-delegable habitability duty) → Group 4 matter with a `neutral` under the §II.5.3 selection protocol → unilateral, always-available code-enforcement and legal-aid referral surfaced in-product. Small-dollar deposit and abatement disputes route to the Group 4 fast-track with compensation fixed at appointment.

---

### G7-22 🟠 The "forbearance protocol" is a permanent adverse record the tenant is induced to author

**Source:** `shtiya_builder-role-taxonomy.md` §Group 7 — *"If a tenant experiences financial hardship, the platform allows them to initiate a standardized communication protocol with the Property Manager to request a temporary forbearance, logging the request immutably to prevent future disputes over the communication timeline or terms of the delay."*

**Finding.** Framed as a protection, this is the most dangerous single artifact a tenant can create. A written, timestamped, immutable, landlord-visible admission of inability to pay is:

- an **admission** in a subsequent non-payment proceeding, on the record, in the tenant's own words;
- a **screening signal** if the tenancy record is ever portable (G7-07, G7-17) — a hardship request logged in year one follows the person into every application in year four;
- a **retaliation trigger**, since it identifies exactly which residents to decline to renew (G7-23);
- and **immutable**, so it cannot be withdrawn, sealed, expired, or corrected even where a jurisdiction requires it.

The feature is not wrong — a hardship path is genuinely valuable. The **retention and visibility model** is wrong, and it is wrong in the direction that harms the weaker party.

`FIX →` §II.8.4 — the hardship path is preserved and hardened: the tenant chooses per-request between an **acknowledged forbearance agreement** (a mutual instrument, disclosed, enforceable, with defined terms) and a **confidential assistance referral** that is never visible to the manager at all. Any manager-visible hardship record is **purpose-bound, expiring on a short clock, excluded from every screening, renewal, ranking, and analytic surface by I-24 and I-28**, and correctable. Nothing in this path is immutable against the tenant's own withdrawal.

---

### G7-23 🟠 Retaliation is unmodelled, and the platform's records make it easier to perform

**Finding.** Protection against retaliation for exercising tenant rights is statutory in most jurisdictions, often with a rebuttable presumption when an adverse action follows a protected act within 6–12 months. The protected acts map exactly onto the draft's core feature set:

```
filing a maintenance ticket · reporting a condition to code enforcement · requesting a
repair in writing · withholding rent or repairing-and-deducting · joining or organizing
a tenants' association · asserting a DV protection · filing a fair-housing complaint
```

The draft records every one of them, attributes them to a named resident, and surfaces them to the manager on a dashboard, alongside the renewal decision and the screening surface. It has built a retaliation targeting console and has no rule against using it.

Group 5 §II.5.4 already solved this exact shape as **I-15**: *filing a preliminary notice, lien, or bond claim may never affect dispatch eligibility, rating, or payment routing.* Group 7 needs the identical rule with housing consequences.

`FIX →` §II.7.5 (**I-24**) — protected acts are written to a **shielded log** with no grant to any ranking, screening, renewal, priority, or pricing path (REVOKE plus `retaliation-lint`). Jurisdictional presumption windows are loaded and surfaced **to the tenant**. A retaliation monitor flags managers whose adverse actions cluster after protected acts — a supervisory signal, never a manager-visible surface.

---

### G7-24 🟠 Co-tenants, guarantors, occupants, and subtenants do not exist

**Finding.** The draft models exactly one tenant per unit. Reality, and the legal consequences the platform will therefore get wrong:

| Party | Has | Does not have | Draft |
|---|---|---|---|
| Co-leaseholder | Joint-and-several liability, occupancy, the full record | Unilateral termination | absent |
| Guarantor | Financial exposure, notice rights | **Any** occupancy right or access to the unit | absent |
| Adult occupant / household member | Occupancy, habitability standing | Payment obligation, lease control | absent |
| Minor occupant | Occupancy | An account | absent |
| Subtenant / roommate | Possession, sometimes statutory rights | The prime lease | absent |
| Former leaseholder (DV bifurcation, departure) | Nothing, immediately | Continued access — must be terminable **instantly** | absent |

**Exploit.** Three roommates share a lease. One moves out after a domestic incident. Under the draft there is one tenant account per unit, so either the departing party retains full access to the ledger, tickets, entry records, and unit schematic of the home they were removed from, or the remaining residents lose the record. Both outcomes are unacceptable; the first is a safety failure (G7-29).

`FIX →` §II.1.3 — `tenancy_parties` with typed roles and independently revocable grants, mirroring the `dp_parties` / `matter_parties` / `wp_parties` pattern established in Groups 4, 5, and 6. A guarantor reaches obligation and notice surfaces and **never** reaches occupancy, entry, or ticket data. Party termination is instant and unilateral where a DV bifurcation or protective order supports it.

---

### G7-25 🟠 Rent-regulated units and automated increases produce statutory overcharges

**Finding.** The draft targets the NYC market explicitly, where a substantial share of the housing stock is rent-stabilized, and then ships *"market rent benchmarks"* into the manager's dashboard with no concept of a regulatory ceiling. The unmodelled regime includes: legal regulated rent versus preferential rent, board-set increase percentages, lease-renewal offer windows with statutory notice periods, succession rights, MCI and IAI adjustments, and registration obligations. Overcharge exposure typically carries treble damages plus fees, and it attaches to the owner while being caused by the platform's UI.

The same failure occurs in every jurisdiction with rent stabilization, rent control, just-cause ordinances, or statewide increase caps — an expanding set.

`FIX →` §II.12.3 — a `regulatory_regime` on the tenancy: on a regulated unit the **legal regulated rent governs and is rendered as the ceiling**; any increase instrument above it is **blocked at generation**, not warned about; renewal-offer windows and notice periods are computed and surfaced; registration status is tracked and its absence blocks the increase surface entirely.

---

### G7-26 🟡 No lease lifecycle, notice statutes, or just-cause grounds

**Finding.** The draft covers exactly two moments: signing and paying. Absent: renewal offers and their statutory windows, tenure-scaled rent-increase notice periods (commonly 30/60/90 days), non-renewal, just-cause grounds where an ordinance requires them, lease-end and move-out, the move-out inspection with its pre-inspection right in several states, the deposit-return clock, holdover, and lease assignment or transfer on a property sale. Each is a dated, statutory obligation that an automated system either performs correctly or breaches on a schedule.

`FIX →` §II.12 — a full `tenancy` state machine with jurisdiction rule packs driving every notice window, and an instrument-generation gate that refuses to produce a notice outside the permitted grounds or windows for that jurisdiction (§II.7.3).

---

## 5. RBAC, the Data Plane & Occupancy Safety

### G7-27 🔴 Two group strings gate an entire rental market's consumer financial and housing data

**Current state:** `phase8-sub-role-expansion-plan.md` maps group `property_manager` = {`prop_manager`} and group `tenant` = {`prop_tenant`}; `src/lib/rbac/roles.ts` grants `property_manager: ['property','escrow']` and `tenant: ['property']`. T8.2 then rewrites RLS policies to `current_user_role_group()` comparisons.

**Finding.** Applying T8.2 as written to Group 7 tables ships the **most sensitive instance in the entire corpus** of the defect closed for owners (G1-02), deals (G2), lenders (G3-07), matters (G4-08), work packages (G5-12), and design packages (G6-08). A policy of the form `current_user_role_group() = 'property_manager'` grants **every property manager on the platform** read access to **every managed unit's** rent roll, arrears, tenant identity, income attestations, bank-derived screening data, maintenance history, and in-unit photographs.

That is not competitor IP leakage, as in Group 6. It is a whole-market consumer financial and housing-status database, exposed to any actor who can obtain one `prop_manager` account. The `tenant` group string is the mirror image: any policy granting group `tenant` access to `property` rows exposes neighbours' tenancy data to a resident.

**Exploit.** Register as a property manager. Query `financial_ledgers`, `documents`, and any Group 7 table directly through `supabase-js`, bypassing the UI, exactly as VULN-02 and VULN-03 established is possible today. Extract the arrears status and screening file of every renter on the platform.

`FIX →` §II.1 — **two authorization primitives**, because this group contains two structurally different actors: the **management engagement** (`has_unit_mandate()`) and the **tenancy** (`is_tenancy_party()`). Neither group string ever appears in a Group 7 row-access predicate (**I-1**, CI-enforced). §II.11.1 adds **Class-T restriction** on tenant consumer data with an even narrower reach than Group 3's Class-1.

---

### G7-28 🔴 The management mandate is not modelled — role possession is treated as authority to collect rent

**Finding.** The draft never asks the question on which the entire group depends: **who says this manager manages this building?** There is no management agreement, no owner grant, no scope, no term, no revocation, and no licence check. A `prop_manager` role string plus a path to a property row is, under the draft, sufficient to list units, take applications, collect fees, collect rent, and dispatch labour.

This is simultaneously:

- **an account-takeover-to-rent-theft path** — a compromised or fraudulent manager account is a rent-diversion tool with no verification standing between it and a resident's money;
- **the phantom-listing enabler** from G7-04(b);
- **an inability to fire a manager** — with no revocation model, an owner terminating a management company has no mechanism to sever data access, dispatch authority, or the collection instruction; and
- **the reason the tenancy record is fragile** (G7-20) — the tenant's record hangs off the manager's account rather than off the tenancy.

Every other group in this corpus derives authority from a granted, expiring, revocable edge: `property_role_bindings`, `deal_memberships`, `facility_parties`, `matter_parties`, `wp_parties`, `dp_parties`. Group 7 has none.

`FIX →` §II.1.2 — `management_engagements`: granted by a **Group 1 V3 owner binding**, scoped to named units, with a term, a revocation that is immediate and complete, a licence and trust-account precondition (M2, §II.2.1), and an explicit scope vector (`lease`, `collect`, `dispatch`, `disburse`, `notice`). §II.1.4 — engagement termination severs manager access without severing the tenancy or the tenant's record.

---

### G7-29 🟠 Occupancy is a stalking dataset, and VAWA protections are absent

**Finding.** Group 7 assembles the highest-risk personal-safety dataset in the ecosystem: **who lives where, with whom, and when they are home.** Ticket timestamps, entry windows, dispatch records, and *"unit availability"* on the Portfolio Map are, in combination, a real-time occupancy signal for a named individual at a known address.

Absent entirely: VAWA and state-law housing protections for survivors of domestic violence, sexual assault, and stalking — including lease bifurcation (removing the perpetrator without terminating the survivor's tenancy), emergency lock change, prohibitions on adverse action based on being a victim, address-confidentiality program participation, and the confidentiality of the documentation the survivor provides. Also absent: any rule preventing a former household member's account from retaining unit access (G7-24), and any suppression of a survivor's unit from manager-side aggregates, vendor job cards, or the map.

`FIX →` §II.11.3 — a **DV/safety protection state** on the tenancy: instant party termination, lock-change dispatch without notice to the removed party, unit suppression from every aggregate, map layer, vendor card, and export, documentation held under Class-T with a narrower read set than any other object in the system, a panic path that creates no manager-visible record, and an explicit prohibition on victim status as an input to any screening, renewal, or pricing surface.

---

## 6. Monetization, Positioning & the Data Product

### G7-30 🔴 Cross-manager "market rent benchmarks" is algorithmic price coordination

**Draft text:** *"Portfolio Health & NOI: Aggregate NOI dashboard, market rent benchmarks, and vacancy alerts."*

**Finding.** A platform that ingests non-public lease terms, rents, concessions, and vacancy data from competing property managers, and returns pricing guidance derived from that pooled data, is the precise fact pattern of the algorithmic rent-setting cases brought by federal and state antitrust authorities. The theory does not require an agreement between the landlords; the shared algorithm and the pooled non-public data are the mechanism. Exposure includes treble damages, and the platform is the primary defendant rather than an incidental one.

Group 5 §II.9.3 already faced this and built the antitrust-safe replacement — a regional index rather than a demand map, after the demand map was withdrawn as G5-10. Group 7 re-imports the withdrawn design in a market with an active enforcement docket.

`FIX →` §II.12.1 — the benchmark is rebuilt on the G5 §II.9.3 pattern and **constrained harder**: aggregation to a geography with a k-anonymity floor, temporal lag, public and consented sources only, delivered as a **distribution, never a recommendation**, with **no unit-level suggested price, no acceptance tracking, no adoption telemetry, and no non-public competitor lease data of any kind** (**I-29**). `rent-recommendation-lint` fails the build on any surface that emits a price for a specific unit.

---

### G7-31 🟠 A per-unit subscription lapse reaches into the tenancy, the corpus, and the records

**Finding.** The draft's primary revenue line is a per-unit SaaS subscription held by the manager. Group 1 §II.8.1 established the hard separation: entitlements are feature flags and may never gate a row. Group 7 has, as drafted, no such separation — and here the person harmed by a billing failure is not the customer.

If a manager's card declines, nothing may follow from that for: a resident paying rent, a resident opening a habitability ticket, a resident reading or exporting their lease and receipts, an owner receiving their sweep, a deposit sitting in trust, a contractor awaiting payment for completed work, or a record under a retention duty.

`FIX →` §II.13.6 — the **Group 7 Obligation Lock**, an extension of G1 §II.8.5: a lapse withholds net-new manager-side origination only (new listings, new applications, new analytics). It never touches the trust corpora, never blocks a habitability dispatch (**I-27**), never touches a tenant surface (which carries no entitlement key at all, §II.13.2), and never deletes a retention-obligated record.

---

### G7-32 🟡 The "Anti-Broker Engine" is a licensure claim, a UPL surface, and a Group 9 collision

**Draft text:** *"Property managers can market listings directly and execute leases without paying 1-month to 15% annual rent broker fees."*

**Finding — three problems in one sentence.**

1. **Licensure.** In many states, marketing units, negotiating leases, and collecting rent **for compensation on behalf of an owner** is licensed brokerage activity, whether or not anyone calls it brokering. A platform whose marketing claim is that it eliminates the broker, while its users perform brokerage without a licence check, is inviting unlicensed-activity exposure onto itself and its users. The FARE Act does not eliminate brokers; it reallocates who pays them.
2. **UPL.** *"Execute leases"* and *"auto-generates the lease"* is automated legal-instrument generation for non-lawyers. Group 4 §II.11.1 drew this boundary precisely: per-jurisdiction counsel-approved templates, versioned, with an identified approving attorney, mechanical field completion only, no recommendation of which instrument to use, no advisory text, and a not-legal-advice disclosure acknowledged into `disclosures`. The draft references none of it.
3. **Group 9.** The ecosystem simultaneously sells `broker_leasing` a subscription whose stated purpose is *"Integrates with the `prop_manager` to fill vacancies."* The platform cannot be both the anti-broker engine and the leasing broker's CRM. This must be resolved as a positioning rule before either group ships, or Group 9's product is undermined by Group 7's marketing and Group 7's users are exposed by Group 9's absence.

`FIX →` §II.2.1 (M2 requires the jurisdiction's licence where rent collection or lease negotiation is licensed activity); §II.12.2 (all lease and notice generation runs inside the Group 4 §II.11.1 boundary, unmodified); §II.13.4 (positioning rule: the platform is a **direct-leasing option**, never a claim that brokerage is unnecessary or unlawful to require — this is the rule Group 9's audit inherits, recorded at Appendix A row A69).

---

### G7-33 🟡 Rent reporting makes the platform a furnisher; post-tenancy balances make it a collector

**Finding.** Rent reporting to consumer bureaus is the obvious adjacent product to an automated rent ledger, and post-tenancy balance collection is the obvious adjacent product to a move-out itemization. Neither is mentioned, and both carry regimes the draft has no structure for:

- **Furnisher obligations** attach on the first report: accuracy and integrity duties, direct and indirect dispute investigation, correction propagation, and the duty to mark disputed items. Group 3 §II.11.2 already built a furnisher spine — Group 7 must inherit it rather than reinvent it.
- **Negative rent reporting on a tenant is severe and asymmetric** — a single 30-day late can cost a person a hundred credit-score points and follow them for seven years, over a dispute they may have won.
- **Post-tenancy balance collection** by a party other than the original creditor implicates the FDCPA, including validation notices, communication restrictions, and the prohibition on collecting disputed amounts as though undisputed.

`FIX →` §II.13.5 — rent reporting is **opt-in, positive-only by default**, never a condition of tenancy, never a screening lever, with the tenant able to withdraw prospectively and with the Group 3 §II.11.2 furnisher dispute process inherited **whole**. Disputed amounts are never reported. Post-tenancy balances route to the Group 4 boundary; the platform does not act as a collector.

---

### G7-34 🟢 Onboarding order, and the applicant with no workspace

**Finding.** The tenant funnel as drafted is *"Instant ID upload, income linking, and digital lease signing"* — government ID, a bank-account link, and a credit pull, demanded before the applicant has been told the screening criteria, the fee, whether the unit is still available, or whether they are plausibly eligible. It is the maximum-intrusion, maximum-friction sequence, presented at the moment of lowest trust, to a person who is often applying under time pressure and has been declined before.

Separately, the draft's tenant workspace is *"🔑 MY UNIT"* — which does not exist for an applicant. The person doing the most work in this group has no workspace at all until they are already a tenant.

`FIX →` §II.3.3 — an **Applications workspace** that exists from the first search, before any identity or financial disclosure. §II.2.2 — the tenant ladder inverts the order: published criteria and fee **before** any collection; a free self-assessment against the published policy; identity only when an application is actually submitted; the §II.4.6 income attestation only at submission, single-use and revoked at decision. The applicant reaches real value at rung zero, exactly as Group 1 §II.2.6 requires for owners.

---

### G7-35 🟢 Residential and commercial tenancy share one key and one protection regime

**Source:** the taxonomy defines `prop_tenant` as *"the Residential or Commercial Tenant."*

**Finding.** These are different legal universes. Residential tenancy carries the implied warranty of habitability, non-waivable remedies, deposit statutes, notice statutes, eviction protections, and consumer status. Commercial tenancy carries essentially none of them and instead carries percentage rent, CAM reconciliation, TI allowances, estoppel certificates, SNDAs, exclusivity clauses, and go-dark provisions. One key with one rule set will either apply consumer protections that do not exist commercially, or — far more likely, since the draft's economics are manager-facing — fail to apply the residential protections at all.

**The right answer is not a new rbac_key.** The protection regime attaches to the **tenancy**, not to the person: the same individual is a residential tenant at home and a commercial tenant at their shop, in the same session.

`FIX →` §II.1.3 — `tenancies.tenancy_class ∈ ('residential','commercial','mixed_use','short_term')` drives the entire rule pack: which statutory clocks load, which protections apply, which instruments are generable, and which subtabs render. The taxonomy count is **unchanged at 27** (Appendix E item 7).

---
# PART II — HARDENED ARCHITECTURE

## II.0 Design Thesis

> **Group 7 is the only group in the ecosystem whose product is a specific person's home.** The draft models that person as a data subject — screened, scored, swept, and restricted — and models the manager as the customer. Every defect in Part I is a consequence of that single inversion.
>
> The platform's defensible contribution is **being the operator whose record both sides can rely on**: a screening report the applicant orders once and holds; a habitability clock that runs in public and cannot be stopped by a payment dispute; a repair completion that requires the occupant's confirmation; trust ledgers where the owner's money and the resident's deposit are provably where they belong; and a tenancy record that is the tenant's property and survives the manager. An owner pays more for a manager the residents trust, because trusted operations have lower vacancy, lower turnover, lower legal cost, and fewer code violations. That is the actual product.

**Governing structural principles:**

1. **The tenant is a party, never a data subject.** (§II.1.3, §II.8)
2. **Habitability is a floor, never a line item.** No condition classified habitability is ever gated on money, subscription state, or an open dispute. (§II.5.2, I-27)
3. **The platform holds no capability that can be used to remove a person from their home.** (§II.7.1, I-22)
4. **A consumer report is a regulated instrument, and the applicant holds it.** Auto-approve is permitted; auto-deny is not. (§II.4, I-25)
5. **Rent is trust money before it is anyone's revenue.** (§II.6, I-26)
6. **A tenant's obligation is discharged when they authorize, not when the rail confirms.** (§II.6.4, I-23)
7. **Exercising a tenant right is invisible to every platform surface.** (§II.7.5, I-24)
8. **A neutral is never paid by the party who benefits from their answer** — sixth application. (§II.5.4, Appendix B)
9. **Access derives from an engagement or a tenancy, never from a role group.** (§II.1, I-1)

---

## II.1 Authorization Model *(resolves G7-24, G7-27, G7-28, G7-35)*

**Principle:** Group 1's primitive is the parcel, Group 2's the deal, Group 3's the facility, Group 4's the matter, Group 5's the work package, Group 6's the design package. **Group 7 has two**, and that is the honest modelling rather than a compromise: the group contains two structurally different actors whose scopes are not nested, do not overlap, and must not be derivable from one another.

```
users.role              → coarse nav routing only. Never used for Group 7 row access.

MANAGER SIDE
  management_firms      → the verified operator (M0…M3 credential level)
  me_seats              → staff seats within a firm; scope is the INTERSECTION of the
                          engagement's scope and the seat's role (the G3 I-5 pattern)
  management_engagements→ THE manager-side authorization primitive: an owner's granted,
                          scoped, expiring, revocable mandate over named units

TENANT SIDE
  tenancies             → THE tenant-side authorization primitive: unit × term × class
  tenancy_parties       → who is on this tenancy and in what capacity
  applications          → pre-tenancy, purpose-bound, TTL'd (§II.4.9)

SHARED
  units                 → the physical addressable object, child of a Group 1 property
  screening_reports     → applicant-OWNED, applicant-granted (§II.4.1)
  trust_ledgers         → rent / deposit / reserve corpora (§II.6.1)
  entitlements          → billing-derived feature flags. Never widens a data scope.
```

**Two predicates, and no third:**

```sql
has_unit_mandate(p_unit uuid, p_facet text, p_seat me_seat_role)  -- manager side
is_tenancy_party(p_tenancy uuid, p_facet text, p_role tenancy_role) -- tenant side
```

### II.1.1 Why the manager's scope is not the union of tenancies

A manager with a mandate over a building reaches **operational** facets of every unit in it — arrears status, lease terms, ticket state, entry records. They do **not** thereby reach the Class-T consumer data of the residents (§II.11.2), and they do not reach a tenancy after their engagement ends. Conversely a tenant reaches their **own** tenancy in full and reaches nothing about the building beyond common-element notices. Neither predicate is expressible in terms of the other, which is exactly why there are two.

### II.1.2 The management engagement *(G7-28)*

```
management_engagements(
  id, management_firm_id, property_id, granted_by_binding_id, unit_scope uuid[],
  scope text[],            -- {lease, collect, dispatch, disburse, notice}
  starts_on, ends_on, terminated_at, termination_reason,
  licence_id,              -- required where the jurisdiction licenses rent collection
  trust_account_id,        -- required where `collect` or `disburse` is in scope
  habitability_sla_accepted_at
)

· GRANTED BY a Group 1 property_role_binding at V3. Nothing else can create one.
· SCOPED to named units. A firm managing 4 units in a 60-unit building reaches 4.
· TERMED and REVOCABLE. Revocation is immediate, complete, and one-sided (the owner's).
· `collect` REQUIRES a verified trust account (§II.6.1) and, where the jurisdiction
  licenses the activity, a verified licence (§II.2.1 M2).
· `disburse` REQUIRES maker≠checker above the dual-control threshold (G3 I-7, inherited).
```

**Revocation semantics (the G7-20 fix at the authorization layer).** Terminating an engagement severs the **manager's** access. It does not touch the `tenancy`, the `tenancy_parties`, the trust corpora, the tenant's records, or any open habitability clock. A successor engagement inherits the operational record; the resident's account, history, and evidence are continuous across the change and were never the manager's to begin with.

### II.1.3 Tenancy parties *(G7-24, G7-35)*

| `tenancy_role` | Reaches | Never reaches |
|---|---|---|
| `leaseholder` | The tenancy in full: lease, ledger, receipts, tickets, entry records, deposit, evidence export | Other units; other tenancies; any manager-side aggregate |
| `co_leaseholder` | Identical to `leaseholder`; joint-and-several obligations rendered | Unilateral termination of the tenancy |
| `occupant` (adult household member) | Habitability tickets, entry records, notices, building announcements | The ledger, the deposit, the lease financial terms |
| `guarantor` | Obligation balance, notices, demand history — **financial surfaces only** | **Any** occupancy datum: entry records, tickets, in-unit imagery, household composition |
| `authorized_agent` | As scoped by the tenant's grant, expiring (advocate, legal aid, family member) | Anything outside the explicit grant |
| `former_party` | Their own historical record, read and export only, permanently | Anything current: entry, tickets, ledger, occupancy, unit state |

`tenancies.tenancy_class ∈ ('residential','commercial','mixed_use','short_term')` selects the entire rule pack — statutory clocks, generable instruments, protection regime, and which subtabs render. **A person may hold `residential` and `commercial` tenancies simultaneously with no scope interaction**, exactly as a Group 1 user holds `owner_single` on one parcel and `owner_distressed` on another.

`former_party` is the DV-bifurcation and departure primitive: transitioning a party to `former_party` is **instantaneous, unilateral where a protective order or bifurcation supports it, and irreversible without the remaining leaseholders' act** (§II.11.3).

### II.1.4 Invariants

- **I-1** *(inherited)* No Group 7 RLS policy may use `current_user_role_group()` for row access except the literal `admin` branch — and on Class-T rows, **not even that** (the G4 §II.1.2 privileged-row rule, inherited). Policies call `has_unit_mandate()` or `is_tenancy_party()`.
- **I-2** *(inherited)* No billing path holds any grant on engagements, tenancies, party rows, trust ledgers, applications, or screening reports.
- **I-7** *(inherited)* Dual control on trust disbursement above threshold; maker ≠ checker in the database.
- **I-22** *(new — the Access Floor)* **No platform capability may deny, condition, or degrade a tenant's physical access to their dwelling, its utilities, or its habitability — in any state, for any reason, at any tier.** (§II.7.1)
- **I-23** *(new)* A rent obligation is discharged at the Phase-0 authorization timestamp. No rail state may produce a delinquency, a fee, a notice, or a report. (§II.6.4)
- **I-24** *(new — the anti-retaliation rule, the G5 I-15 analogue)* Exercising a tenant right may never affect any ranking, screening, renewal, priority, dispatch, or pricing surface. (§II.7.5)
- **I-25** *(new)* No adverse or conditional application outcome without a named human decision-maker and a §II.4.5 notice. **Auto-approve is permitted; auto-deny is prohibited.** (§II.4.3)
- **I-26** *(new — the G5 I-14 analogue)* No platform fee, subscription, management fee, or revenue of any kind is taken from a trust corpus ahead of the beneficiary's accounting. (§II.6.2)
- **I-27** *(new — the Habitability Floor)* A habitability-classified condition is never gated on payment status, arrears, escrow balance, subscription state, or an open dispute. (§II.5.2)
- **I-28** *(new)* Applicant data is purpose-bound with a TTL; retention beyond it exists only in a sealed compliance store no manager can read. (§II.4.9)
- **I-29** *(new)* No surface emits a rent price, increase amount, or pricing recommendation for a specific unit, and no non-public competitor lease data enters any index. (§II.12.1)

---

## II.2 Onboarding — Two Ladders, Deliberately Asymmetric

### II.2.1 Manager ladder *(resolves G7-12, G7-28, G7-32)*

| Level | Proves | Evidence | Unlocks |
|---|---|---|---|
| **M0** | Nothing | Email, phone | Public market index (§II.12.1), product reference, sandbox |
| **M1** | A real natural person | V1 IDV (IAL2), device and phone binding | Firm creation, seat invitation, template library |
| **M2** | A licensed, bonded operator | **Real estate broker or property-manager licence where the jurisdiction licenses rent collection or lease negotiation** · verified **trust account** at a qualifying depository · fidelity bond · E&O · W-9 · payout account | Accepting an engagement; `lease` and `dispatch` scope |
| **M3** | Engagement-qualified on these units | Owner grant from a **V3 Group 1 binding** · jurisdiction rule pack loaded and acknowledged · **habitability SLA accepted** · deposit-handling attestation | `collect`, `disburse`, applications, notices, deposit custody |

**Licence monitoring** inherits the Group 5 §II.2.6 cadence: standing re-verified on the authority's schedule and on any disciplinary event. A lapse degrades M2→M1 **prospectively** — existing engagements continue so residents are not stranded, `collect` continues into trust, but `disburse` and new engagements stop, the owner is notified, and the platform's own §II.6.2 sweep continues to run so the owner is never cut off from their money by their agent's lapse.

### II.2.2 Tenant ladder — and why it stops at T1 *(resolves G7-34)*

| Level | Proves | Evidence | Unlocks |
|---|---|---|---|
| **T0** | Nothing | Nothing — no account required | Search, saved units, **the published screening criteria and fee for every listing**, free self-assessment against them |
| **T1** | A real natural person | V1 IDV (IAL2), device and phone binding | **The complete tenant product, free, permanently**: applications, tenancy workspace, ledger, receipts, ticketing, entry records, evidence export, dispute, escalation |

**There is no T2, and that is a design decision, not an omission.** Everything a resident could conceivably be charged for is a counterweight to a manager-side capability, and a two-sided market where only one side pays produces exactly the draft this document is correcting. The tenant tier carries **no entitlement key**, precisely as Group 1 §II.8.2 gives Shield none: there is no product surface through which it could be sold, mis-provisioned, downgraded, or lost to a failed payment.

**The screening report is not a tier.** It is an applicant-owned object (§II.4.1) the applicant orders, holds, grants, and revokes. Ordering one never changes the applicant's tier and never creates a platform-held score.

**Order of collection, inverted** *(G7-34)*:

```
BEFORE any identity or financial disclosure, the applicant sees:
  · the published screening_policy for THIS unit, in full, in plain language
  · the fee, its statutory basis, and its refundability
  · unit availability and application volume already received
  · a FREE self-assessment: "against this policy, here is where you stand" — computed
    client-side from self-asserted values, transmitted nowhere

THEN, only on an actual submission:
  · identity (T1)
  · the §II.4.6 income attestation — single-use, purpose-bound, revoked at decision
  · the §II.4.1 report grant — scoped to this unit, expiring
```

---

## II.3 The Directory Pane — Two Workspace Species *(resolves G7-27, G7-34)*

### II.3.1 Definitions

> A **Manager Workspace** is `(management_firm_id, property_id)` under an active engagement. A **Tenant Workspace** is `(user_id, tenancy_id)`. Navigation, map scope, Co-Pilot context, and authorization are the same unit in both cases.

**The tenant tree is not a subset of the manager tree.** They are different products with different information architectures serving parties with adverse interests. Any implementation that renders one as a filtered view of the other has reintroduced G7-27.

### II.3.2 Manager tree

```
DIRECTORY  (Left Pane · 250px · React Server Component · zero client hooks)
│
├─ ◈ Firm                                   ← aggregate; no property context
│    ├─ Licences & Bonds        (M2 standing, per jurisdiction — §II.2.1)
│    ├─ Trust Accounts          (rent · deposit · reserve; reconciliation — §II.6.1)
│    ├─ Seats & Scopes          (me_seat_role; intersection rule — §II.1)
│    ├─ Engagements             (owner grants, scope, term, revocation — §II.1.2)
│    ├─ Screening Policies      (published, versioned, per jurisdiction — §II.4.2)
│    ├─ Fair Housing Monitor    (outcome testing; own portfolio only — §II.4.4)
│    └─ Billing
│
├─ 📚 Market Reference                       ← research; NO unit-level pricing
│    ├─ Regional Rent Index     (k-floored, lagged, distribution — §II.12.1)
│    └─ Jurisdiction Rule Packs (clocks, caps, notice windows, regulated regimes)
│
├─ 🏢 1180 Bergen St                          ← WORKSPACE  engagement scope: units 1A–4C
│    ├─ Units & Tenancies       (lease state machine, renewals, notices — §II.12)
│    ├─ Applications            (graduated dispositions; no auto-deny — §II.4.3)
│    ├─ Habitability Board      (classified, clocked, NON-optimizable — §II.5)
│    ├─ Dispatch                (scope-matched to Group 5; entry protocol — §II.5.6)
│    ├─ Rent Trust              (collect → sweep → invoice; never deduct — §II.6.2)
│    ├─ Deposit Trust           (per tenancy; statutory clocks — §II.6.3)
│    ├─ Reserve                 (owner-funded, owner-owned — §II.5.5)
│    ├─ Owner Reporting         (what the owner sees; Class-T excluded — §II.11.2)
│    └─ Compliance              (registrations, inspections, violations → Group 4)
│
└─ 🏬 Franklin Retail Row                     ← WORKSPACE  tenancy_class = commercial
     ├─ Leases & Options        (percentage rent, CAM, TI, estoppels, SNDAs)
     ├─ CAM Reconciliation
     └─ ⚠ residential protection subtabs DO NOT RENDER on a commercial workspace
```

**Deliberately absent from the manager tree**, each corresponding to a Part I finding:

```
✗ NOI optimization surface with habitability as a variable line   (G7-09, §II.13.2)
✗ Unit-level rent recommendation or suggested increase            (G7-30, I-29)
✗ Eviction-risk, tenant, or resident score of any kind            (G7-19, §II.13.7)
✗ Raw bank transaction view                                        (G7-05, §II.4.6)
✗ Cross-portfolio tenant search or lookup                          (G7-27, §II.11.2)
✗ Any lock, utility, amenity, or portal-access control             (G7-19, I-22)
✗ Maintenance "hotspot" layer at a granularity that identifies who complained (§II.11.4)
```

### II.3.3 Tenant tree

```
DIRECTORY  (Left Pane · 250px · React Server Component · zero client hooks)
│
├─ 🔎 Applications                            ← exists from the FIRST SEARCH, pre-tenancy
│    ├─ Saved Units             (criteria and fee visible before any disclosure)
│    ├─ My Screening Report     (applicant-OWNED: order, hold, grant, revoke — §II.4.1)
│    ├─ Active Applications     (status, decision, reasons, appeal — §II.4.3)
│    └─ Adverse Actions         (notice, file copy, DISPUTE — §II.4.5)
│
├─ 🏠 Apt 3B · 1180 Bergen St                 ← WORKSPACE  tenancy_class = residential
│    ├─ My Home                 (lease terms, key dates, renewal window, notices)
│    ├─ Repairs                 (classified; the STATUTORY CLOCK is visible — §II.5.3)
│    ├─ Entry Log               (who entered, when, why, with what authorization)
│    ├─ Rent & Receipts         (discharge-on-authorization; correcting entries — §II.6)
│    ├─ Deposit                 (where it is held, interest, itemization clock — §II.6.3)
│    ├─ Get Help                (escalation ladder: owner → neutral → code → legal aid)
│    └─ My Records              (export, always, free — §II.8)
│
├─ 📁 My Records — 214 Court St (ended 2025)  ← FORMER tenancy; read + export, permanent
│
└─ 🛟 Safety                                   ← renders ONLY if the tenant activates it
     └─ DV / stalking protections, party removal, lock change — §II.11.3
        (creates NO manager-visible record; §II.11.3)
```

**Deliberately absent from the tenant tree:** any upsell affordance anywhere in the subtree — the Group 1 §II.3.2 Shield rule, inherited verbatim, because the same reasoning applies with the same force.

### II.3.4 Server-side derivation

Two manifest functions, `portfolio_manifest()` and `tenancy_manifest()`, execute under the caller's RLS-scoped session in the RSC. The client never computes, filters, or reorders either. A subtab absent from a manifest is not rendered **and** its route independently rejects direct navigation. Credential gates (M2 for `Trust Accounts`, M3 for `Rent Trust`) are **manifest-level exclusions**, never disabled buttons.

`tenancy_manifest()` is derived from `tenancy_parties` alone. **It never consults `management_engagements`,** which is what makes the tenant's workspace structurally independent of the manager's account state (G7-20, G7-31).

### II.3.5 Context isolation

Inherited from Group 1 §II.3.4: identifiers only (`{ engagementId | tenancyId, unitId, epoch }`), never prose; the predicate is re-checked server-side with 403 returned **without invoking the model**; epoch fencing; per-workspace transcript partitioning; retrieval purged within 24h of a party row's termination or an engagement's revocation.

**Group 7 specific, and non-negotiable:**

```
· NO cross-tenancy retrieval. A manager's Co-Pilot cannot retrieve from any tenancy;
  it retrieves from the ENGAGEMENT's operational record only, with Class-T excluded
  from the index entirely (§II.11.2).
· NO Class-T data is ever an index candidate, in either direction.
· The Co-Pilot is HARD-BLOCKED SERVER-SIDE BY ACCOUNT CLASS from: generating legal
  advice or instruments for any account (G4 §II.11.2, inherited whole); recommending a
  screening outcome; recommending a rent or increase amount (I-29); producing eviction
  guidance, timing, or strategy; or characterizing a specific resident.
· For TENANT accounts it may explain platform mechanics, surface the tenant's own
  documents and clocks, and locate the escalation ladder. It may not interpret a lease.
```

---

## II.4 Screening Architecture *(resolves G7-01 → G7-07)*

### II.4.1 The report is applicant-initiated and applicant-held

```
THE OBJECT              screening_reports(applicant_id, ...) — owned by the APPLICANT
ORDERED BY              the applicant, in one act, from their Applications workspace
PAID                    once (§II.4.7), not once per door
VALID FOR               a jurisdiction-configured window (default 30 days)
SHARED BY               an explicit, per-unit, EXPIRING grant the applicant creates
REVOCABLE               by the applicant, at any time, which purges the grantee's copy
NOT                     a platform-held score, a cross-applicant ranking, a durable
                        reputation, or an input to anything the applicant did not grant
```

This posture is chosen deliberately: it is the consumer-initiated disclosure model, it collapses twelve hard inquiries into one, it removes the per-application fee farm (G7-04b), it eliminates twelve landlord-held dossiers (G7-06), and it resolves the G7-07 fork without creating a blacklist.

**Regulatory posture, stated once and implemented rather than inherited by accident:** the platform either operates through a **licensed consumer-reporting partner** under a contract that assigns the §II.4.5 obligations explicitly, or it registers and operates as a reporting agency itself. Either way the obligations below are implemented in this system. There is no third option in which the activity happens and the obligations do not. (Board queue item 1.)

### II.4.2 Criteria as a published, versioned, jurisdiction-parameterized policy *(G7-02)*

```
screening_policies(
  id, management_firm_id, jurisdiction, version, published_at, superseded_at,
  income_basis,            -- 'tenant_portion' | 'total_household'  ← see below
  income_multiple,         -- NULL where the jurisdiction caps or forbids a ratio
  credit_criteria jsonb,   -- thresholds AND the alternatives that satisfy them
  rental_history_criteria jsonb,
  record_use_rules jsonb,  -- eviction/criminal use per the jurisdiction rule pack
  accepted_alternatives jsonb, -- guarantor, additional deposit where lawful, rent
                               -- history, bank statements, co-signer, subsidy award
  individualized_assessment_required bool
)
```

**There is no national default. A firm cannot accept applications without publishing a policy for the unit's jurisdiction.** Hard rules:

- **Source-of-income neutrality (the G7-02 fix).** Where an applicant holds a subsidy, the ratio is computed on **the tenant's portion of the rent only**, never the contract rent. Subsidy status, voucher program, and benefit type are **excluded from every input and every model feature**, and refusal to consider a voucher is blocked at policy publication in jurisdictions that prohibit it. Fixed-income, benefit-income, self-employment, and asset-based qualification are first-class `accepted_alternatives`, not exceptions.
- **Record-use rules load from the jurisdiction pack.** Eviction *filings* versus *judgments*, sealed-record rules, look-back limits, dismissal and tenant-victory handling, and outright prohibitions on use — all per jurisdiction, none defaulted. Criminal-record use, where permitted at all, requires `individualized_assessment_required` and routes through the §II.4.3 human path with the nature, recency, and relevance recorded.
- **No proxy variables.** Zip code, surname, national origin, familial status, disability, source of income, language, and any derived feature correlated with them are excluded from every criterion and every model. `proxy-lint` fails the build on a criterion or feature referencing them.
- **Alternatives are mandatory, not optional.** A policy with no `accepted_alternatives` is rejected at publication: a threshold with no alternative path is a categorical exclusion.

### II.4.3 The decision pipeline — auto-approve yes, auto-deny never *(G7-03, I-25)*

```
                     ┌─────────────────────────────────────────────┐
  application ─────► │ evaluate against the PUBLISHED policy       │
                     │ version pinned at submission, immutable     │
                     └──────────────┬──────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
  meets ALL criteria         meets with conditions      does not meet
         │                          │                          │
   AUTO-APPROVE               ┌─────┴─────┐             NAMED HUMAN REQUIRED
   permitted; lease           │ graduated │             · reason from the published
   offer generated            │ options   │               policy, selected not typed
   under §II.12.2             └─────┬─────┘             · §II.4.5 adverse action notice
                                    │                   · supplemental-evidence path
                    approved_with_guarantor             · reconsideration on new evidence
                    approved_with_additional_deposit      or a corrected record
                      (only where lawful, capped)       · NEVER a silent decline
                    waitlisted (with position)          · NEVER an automated denial
```

**`disposition ∈ ('approved','approved_with_conditions','waitlisted','declined','withdrawn')`** — five, not two, for the same reason Group 6 §II.5.4 needed four dispositions instead of one: a binary gate turns every gradation into a silent no.

An application that receives no disposition inside the jurisdiction's window (or 14 days, whichever is shorter) **auto-escalates and the fee is refunded** — silence is not an outcome, exactly as it is not at a Group 5 delivery gate.

### II.4.4 Bias testing and model governance *(G7-02, ISO 42001 A.5.2)*

Inherits Group 3 §II.7 model governance whole, with housing-specific additions:

```
PRE-DEPLOYMENT  every screening_policy version and every scoring component is tested for
                disparate impact across protected characteristics using accepted proxy
                methodology, on the firm's own applicant population and on a held-out
                reference population. A policy failing the threshold cannot be published.
CONTINUOUS      outcome rates by geography and proxy, per policy version, per firm,
                monitored for drift. Drift beyond tolerance suspends the policy version
                and reverts to the prior published version.
LESS-DISCRIM.   for any criterion failing the test, the pipeline surfaces the tested
ALTERNATIVE     less-discriminatory alternative and requires the firm to adopt it or
                record a documented business-necessity justification.
EXPLAINABILITY  every disposition carries the policy version, the criteria evaluated,
                and the criteria not met — in the applicant's copy, not only the file.
NEVER           a model output is a disposition. A model may inform a HUMAN; a model
                may never decline. (G3 §II.7.3 automation principle, inherited.)
```

The Fair Housing Monitor renders a firm **its own** outcome distribution against the reference distribution. It is never a leaderboard, never comparative between firms, and never a marketing surface.

### II.4.5 Accuracy, disclosure, dispute, adverse action *(G7-01)*

```
ACCURACY        reasonable procedures for maximum possible accuracy: identity matching
                on multiple corroborating identifiers, NEVER name-and-DOB alone;
                jurisdictional obsolescence limits applied at assembly; source
                provenance recorded per data element (the G6 §II.7 attribution pattern)
FILE DISCLOSURE the applicant reads their complete file, including every element and its
                source, from the Applications workspace, at any time, free
DISPUTE         one-action intake from the file view. Reinvestigation completes within
                30 days. The disputed element is MARKED AS DISPUTED wherever it appears,
                immediately, and cannot be relied upon while marked (I-25)
PROPAGATION     a correction propagates to EVERY grantee who received the report, with
                notice, and reopens any disposition that relied on the corrected element
ADVERSE ACTION  on any declined or conditional disposition, delivered to the applicant:
                · that an adverse action was taken and that a report was used
                · the reporting agency's identity and contact details
                · that the agency did not make the decision and cannot explain it
                · the right to a free file copy and to dispute, with in-product paths
                · the score used and the KEY FACTORS, where a score was used
                · the specific published criteria not met
ID THEFT        block procedure: a blocked element is excluded from assembly and from
                every existing grant
```

### II.4.6 Income verification by attestation, never by transaction stream *(G7-05)*

```
                    ┌──────────────────────────────────────────┐
  applicant ───────►│  aggregator boundary (Plaid / equivalent) │
  one-time,         │                                           │
  purpose-bound,    │  computes: verified income amount,         │
  revoked at        │  stability, continuity, employment signal  │
  decision          └──────────────────┬───────────────────────┘
                                       │  SIGNED ATTESTATION OBJECT
                                       ▼
                        income_attestations(
                          applicant_id, amount_cents, period, method,
                          confidence, computed_at, expires_at, signature)

THE RAW TRANSACTION STREAM NEVER ENTERS PLATFORM STORAGE.
NO MANAGER SURFACE, AT ANY TIER, EVER RENDERS A TRANSACTION.
`transaction-lint` fails the build on any schema column, API field, or view that could
carry a merchant name, MCC, counterparty, or transaction-level amount.
```

The attestation carries its own **method and confidence** and travels with them, exactly as the Group 6 §II.7 BoQ carries its LOD and exclusions. A low-confidence attestation is a fact the human decision-maker sees, not a silent decline. Pay stubs, benefit award letters, tax documents, and bank statements are equally acceptable evidence paths — the connection is a convenience, never a requirement, and refusing to link is never itself a criterion.

### II.4.7 Fees — cost-based, capped, receipted, zero net platform revenue *(G7-04)*

```
AMOUNT      the LESSER of actual cost and the jurisdiction's statutory cap. Where the
            jurisdiction requires the landlord to bear the cost, the applicant fee is $0.
RECEIPT     itemized, at charge, naming each component and its cost
REFUND      the unused portion refunded automatically where required; the FULL fee
            refunded on §II.4.3 window expiry or on a withdrawn listing
PLATFORM    ZERO NET REVENUE PER APPLICATION. The fee passes through to the reporting
            partner at cost. (The G4 §II.12.2 pattern: no revenue may rise with the
            volume of a consumer's adverse experience.)
ONE FEE     the applicant-held report is reusable across applications within its validity
            window; a second landlord's grant costs the applicant NOTHING.
```

### II.4.8 Listing integrity *(G7-04b)*

A unit accepts applications only when: an **active `management_engagement` with `lease` scope** exists, traceable to a **Group 1 V3 owner binding**; the unit is marked available with a dated attestation; and a published `screening_policy` covers the jurisdiction. Application volume per unit is rendered to applicants. Fee collection on a unit later found not to exist, not to be controlled by the lister, or not to be available **reverses in full automatically** and suspends the firm.

### II.4.9 Applicant data lifecycle *(G7-06, I-28)*

```
PURPOSE BOUND   every applicant datum is bound to ONE unit application
LIVE            for the decision window only
ON DISPOSITION  the income attestation connection is revoked; the report grant expires
PURGE           operational copies purge on a short clock (default 30 days) after
                disposition or withdrawal
SEALED STORE    the fair-housing record-retention subset persists WRITE-ONCE in a sealed
                compliance store: no manager grant, no UI surface, no export,
                reachable only by an audited compliance query that is itself logged
NEVER           marketing, cross-property mining, model training, resale, or enrichment
APPLICANT       may purge their own operational record at any time, subject only to the
RIGHT           sealed retention subset, and is told exactly what that subset contains
```

---

## II.5 Habitability & Maintenance Architecture *(resolves G7-08 → G7-11)*

### II.5.1 Classification is mandatory and drives everything *(G7-09)*

```
condition_class ∈
  'emergency'          gas, fire, flood, no heat in season, sewage, structural,
                       carbon monoxide, no working lock, elevator entrapment
                       → clock in HOURS, from the jurisdiction pack
  'habitability'       heat, hot water, water, electricity, mold, pest infestation,
                       lead hazard, window guards, essential appliance where required
                       → clock in DAYS, statutory
  'essential_service'  jurisdiction-defined services the lease or statute requires
  'routine'            non-habitability repair
  'cosmetic'           aesthetic
  'tenant_caused'      chargeable per the lease — and STILL repaired on the habitability
                       clock if it is a habitability condition. Cost allocation is a
                       LEDGER question, never a REPAIR question. (I-27)
```

**Classification is proposed by the ticket's structured intake and may be raised by the tenant unilaterally.** A manager may propose a downgrade; a downgrade of a tenant-asserted habitability classification requires a **stated basis** and does not stop the clock while contested — it escalates under §II.5.3. The tenant can never be classified out of a statutory protection by their counterparty.

### II.5.2 The Habitability Floor *(I-27)*

```
A condition classified 'emergency' or 'habitability' is dispatched WITHOUT REGARD TO:
  · the tenant's arrears, payment status, or payment history
  · any open dispute, notice, or proceeding between the parties
  · the reserve balance
  · the manager's subscription state or billing status
  · the engagement's fee posture

If the reserve is insufficient or the manager's account is delinquent, THE PLATFORM
FUNDS THE DISPATCH against the engagement and recovers from the owner under §II.6.2.
A resident's heat is never contingent on a B2B billing relationship.

`habitability-floor-lint` fails the build if ANY code path from a habitability dispatch
reads arrears, entitlements, subscription state, dispute state, or reserve balance as a
precondition.
```

### II.5.3 The clock runs in public *(G7-09)*

```
opened → classified → acknowledged → dispatched → attended → completed → CONFIRMED

Every transition is timestamped, immutable, and visible to: the TENANT, the manager,
and the OWNER (into the Group 1 §II.4.1 Maintenance & Upkeep subtab — the owner carries
the non-delegable duty and must be able to see it being breached).

ESCALATION on a missed statutory clock, automatic, no one's consent required:
   t+0        notify manager and owner simultaneously
   t+50%      owner escalation with the jurisdiction's tenant-remedy summary rendered
              TO THE TENANT (withholding, repair-and-deduct, abatement — as they exist
              in that jurisdiction, stated as facts, not as advice: G4 §II.11.1)
   t+100%     auto-open a Group 4 matter; the tenant's unilateral code-enforcement
              referral becomes one action; legal-aid directory surfaced
   ANY TIME   the tenant may refer to code enforcement unilaterally. The platform never
              gates, delays, warns about, or notifies the manager in advance of it, and
              the referral is a PROTECTED ACT under I-24.
```

### II.5.4 Three-key repair completion — the sixth application of the independence pattern *(G7-08)*

```
Contractor (Group 5)  → SUBMITS.   Provenance-bound completion bundle (G5 §II.6.2):
                                   nonce, in-app capture, device attestation, geofence,
                                   attested timestamp, crew binding.
Tenant                → CONFIRMS.  Or states a deficiency. THE KEY THE DRAFT OMITTED.
Manager               → RELEASES.  Under the engagement's `disburse` scope, from the
                                   owner-owned reserve, dual-controlled above threshold.

RELEASE REQUIRES:  contractor bundle
                 + ( tenant confirmation
                     OR tenant non-response past the window
                     OR independent verification where the tenant is unreachable or the
                        work is not in the unit )
```

**Anti-hostage rules, both directions, inherited from the groups that already solved each half:**

| Failure mode | Control | Source |
|---|---|---|
| Tenant withholds confirmation as leverage | Non-response past the window auto-escalates; the **undisputed portion settles immediately**; silence is never leverage | G5 §II.6.3 |
| Manager never marks a job verified, holding the sub's money | A hold **requires a stated deficiency citing a numbered scope item**; a hold with no cited item is **void** and the payment proceeds to escalation | G3 §II.9.6 |
| Manager demands a kickback for dispatch | Dispatch runs through the Group 5 §II.2.5 scope-match engine on a rotation the manager does not solely control for `emergency` and `habitability` classes; dispatch declines and their reasons are recorded and monitored | G3 §II.9.5 |
| Contractor's payment held hostage to a tenant–manager dispute | The contractor's entitlement attaches to **work performed and evidenced**, never to the resolution of a dispute between the other two parties (G5 I-13, inherited: no compliance or dispute state freezes funds earned for completed, verified work) | G5 §II.7 |
| Tenant's habitability outcome held hostage to a payment dispute | I-27. The repair happens; the money is a separate ledger question | §II.5.2 |

### II.5.5 The manager's compensation is structurally indifferent to whether the repair happens *(G7-08, G7-09)*

This is the load-bearing element, exactly as it was in G3 §II.9.5, G4 §II.5.3, G6 §II.6.3, and Appendix B:

```
PERMITTED   · percentage of rent COLLECTED
            · fixed per-unit management fee
            · disclosed, fixed leasing fee on an executed tenancy
            · disclosed project-management fee on CAPITAL work, calculated on scope
              approved by the OWNER before the work, never on the repair decision

FORBIDDEN   · any fee calculated on NOI, on net cash flow, or on any base from which
              repair spend is subtracted
            · any bonus, credit, ranking, or platform benefit tied to reserve underspend,
              ticket-closure rate, or maintenance cost per unit
            · any percentage of a repair the manager also authorizes and verifies
            · any manager compensation that varies with a habitability outcome

THE RESERVE is OWNER-FUNDED and OWNER-OWNED, held in `reserve_trust` (§II.6.1). The
manager is a disburser under a scoped mandate, never a beneficiary of the balance.
Unspent reserve returns to the OWNER on engagement termination, never to the manager.
```

`fee-neutrality-lint` fails the build if any fee constant is reachable from a maintenance-spend, NOI, reserve-balance, or ticket-closure value.

### II.5.6 Entry protocol *(G7-11)*

```
NOTICE          the jurisdiction's statutory period (commonly 24h), computed and
                enforced. The genuine-emergency exception is a TYPED, LOGGED override
                that names the emergency condition — never a checkbox.
SCHEDULING      the tenant selects from offered windows. A tenant who declines every
                window escalates under §II.5.3 rather than being entered upon.
VENDOR CARD     rendered to the tenant BEFORE arrival: verified identity, photo, firm,
                Group 5 credential level, scope of work, window.
MINIMUM         the vendor's job card carries: unit, scope, window, access instructions.
NECESSARY       It NEVER carries: the tenant's payment status, arrears, screening data,
                household composition, occupancy pattern, DV/safety state, or any
                Class-T element. `vendor-disclosure-lint` enforces the field allowlist.
ENTRY RECORD    who entered, when, under what authorization, for how long — written on
                every entry and readable BY THE TENANT permanently (§II.8).
IN-UNIT IMAGERY Class-T (§II.11.2). Retention bounded to the ticket's lifecycle plus the
                jurisdiction's evidentiary period. The tenant reads and exports their own.
                NO vendor-side retention. Categorically excluded from every aggregate,
                export, owner report, lender data room, marketing surface, and training
                set. The tenant may redact or withdraw imagery they submitted.
```

### II.5.7 Emergency ladder with a non-marketplace terminal *(G7-10)*

```
t+0        scope-matched dispatch offer to on-call vendors (G5 §II.2.5), fanned out
t+N min    widen radius; escalate offer; notify manager AND owner
t+2N min   PLATFORM-ARRANGED EMERGENCY PANEL — a contracted backstop that does not
           depend on marketplace liquidity at 03:00
t+3N min   the manager's own non-delegable duty is invoked and recorded; owner notified;
           a Group 4 matter opens automatically

AT EVERY STAGE, INCLUDING t+0, the tenant sees — always, unconditionally, one tap:
     · the utility emergency number for their jurisdiction
     · 911
     · the code-enforcement/housing-authority emergency line
     · a plain statement that the platform is NOT an emergency service

Vendor availability is SELF-DECLARED and COARSE: service area polygon + on-call window.
NEVER live position, never continuous tracking, never acceptance-rate ranking that
functions as direction and control. (G5 §II.11 worker classification firewall, inherited
whole — `worker-control-lint` extended to cover Group 7 dispatch surfaces.)
```

---

## II.6 Trust Funds, Deposits & the Rent Rail *(resolves G7-12 → G7-18)*

### II.6.1 Three corpora, segregated, never commingled

| Corpus | Beneficiary | Held | Never |
|---|---|---|---|
| `rent_trust` | The property **owner** | Segregated per engagement, sub-accounted per unit | Platform revenue; manager operating funds; collateral |
| `deposit_trust` | The **tenant** | Segregated per **tenancy**, at the jurisdiction's qualifying depository, interest per statute | Used for any repair the owner independently owes; merged into reserve; lent; pledged |
| `reserve_trust` | The property **owner** | Segregated per engagement, owner-funded | Manager-owned; a manager fee base; a source of platform fees |

Each carries: a verified depository, per-jurisdiction rules from the pack, daily reconciliation with a break report, an immutable movement log, and **no billing-role grant of any kind** (I-2).

### II.6.2 The waterfall is inverted *(G7-12, I-26)*

```
THE DRAFT:    collect → DEDUCT MANAGEMENT FEE → sweep remainder to owner
HARDENED:     collect → rent_trust → SWEEP TO OWNER → fee INVOICED against the owner's
                        account under a standing instruction, with an itemized statement

· The manager NEVER self-pays from the corpus. Where a jurisdiction permits deduction
  under an express written management agreement, it requires: the owner's recorded
  standing instruction, an itemized statement delivered BEFORE the deduction, and
  maker≠checker above threshold (I-7). Absent all three, it is an invoice.
· NO platform fee, subscription, processing fee, or revenue of ANY kind is ever taken
  from any corpus (I-26). Platform fees invoice the manager or the owner directly.
· Sweep cadence, holdback for known obligations, and reconciliation are owner-visible
  in the Group 1 workspace.
· `trust-corpus-lint` fails the build if any fee, subscription, or revenue code path
  holds a grant on, or can debit, a trust ledger.
```

### II.6.3 Deposits *(G7-13)*

```
AT MOVE-IN     deposit → deposit_trust at the jurisdiction's qualifying depository.
               Statutory cap enforced at collection — an over-cap deposit CANNOT be
               taken. Notice of depository generated and delivered to the tenant.
DURING         interest accrues per statute and is CREDITED TO THE TENANT where the
               jurisdiction so provides, visible in the Deposit subtab continuously.
               The balance is never available to fund a repair, a reserve, an arrear,
               or any obligation absent the statutory process.
AT MOVE-OUT    · pre-move-out inspection offered where the jurisdiction grants the right
               · itemization with DATED PHOTOGRAPHIC EVIDENCE per deduction line
               · the statutory clock RUNS IN PUBLIC from the surrender date
               · THE UNDISPUTED PORTION RELEASES AUTOMATICALLY on the clock, without
                 the manager's act — a manager cannot hold a deposit by inaction
               · a missed statutory deadline applies the jurisdiction's consequence
                 (commonly forfeiture of the right to deduct) AUTOMATICALLY
               · the disputed portion routes to the §II.8.3 escalation ladder
NEVER          normal wear and tear as a deduction line where the jurisdiction prohibits
               it; a deduction for a condition with an open habitability ticket that the
               manager failed to resolve; conversion into the reserve.
```

### II.6.4 Discharge on authorization *(G7-16, I-23)*

```
The tenant's rent obligation is DISCHARGED at the Group 1 §II.7.2 PHASE-0 authorization
timestamp — durable, committed, before anything touches a rail.

  Ledger renders:  "PAID — settling"        (never "pending", never "unpaid")
  Rail states 'broadcasting' | 'failed' | 'needs_review' are the PLATFORM'S problem.
  A settlement inside the ±2% band is ABSORBED BY THE PLATFORM, never billed onward.

NO late fee, notice, arrears status, delinquency flag, screening signal, credit report,
or escalation may be triggered by a rail-side state. `discharge-lint` fails the build if
any delinquency path reads an escrow_intent state rather than the authorization timestamp.
```

### II.6.5 Autopay, stop-payment and withholding *(G7-14)*

```
AUTHORIZATION   preauthorized transfers require an explicit written authorization
                artifact, a copy delivered to the tenant, and the terms rendered before
                consent. Stored, versioned, exportable.
REVOCATION      ONE ACTION, from Rent & Receipts. Takes effect immediately for any
                transfer more than the Reg E window (3 business days) away.
NEVER REQUIRED  autopay may never be a condition of tenancy, a screening criterion, a
                fee differential, a renewal condition, or a ranking input.
WITHHOLDING     a first-class flow, not an absence: the tenant suspends the pull, states
INTENT          the habitability basis, and the platform opens/links the §II.5.3 clock,
                records the intent immutably in the TENANT'S record, and surfaces the
                jurisdiction's remedy facts (G4 §II.11.1 boundary: facts, never advice)
                plus the legal-aid directory. Funds the tenant escrows voluntarily go to
                `deposit_trust`-class segregation, are RETURNABLE TO THE TENANT ONLY on
                their instruction or a court order, and are never releasable by the
                manager (G4 §II.7.3: an escrow holder determines nothing).
FREE METHOD     at least one free payment method always exists (§II.13.3).
```

### II.6.6 Payment application ordering *(G7-15)*

```
RENT FIRST, OLDEST FIRST. Mandatory. Not configurable by the manager.

· jurisdiction grace periods and late-fee caps load from the rule pack; a fee outside
  the cap CANNOT be assessed
· FEES LIVE IN A SEPARATE SUB-LEDGER. A fee delinquency can never convert into a rent
  delinquency, can never appear in a non-payment notice, and can never be reported
  (§II.13.5). `rent-first-lint` fails the build on any allocation path that debits rent
  before an outstanding fee is exhausted.
· partial payments are ACCEPTED, always, without waiver consequence and without
  auto-generating any notice. Where a jurisdiction treats acceptance as waiving a
  pending notice, the pending notice is voided and the manager is told why.
· utilities, damages, and other non-rent charges are typed and never pursued as rent
  where the jurisdiction forbids it.
```

### II.6.7 Correction, and what leaves the ledger *(G7-17)*

```
APPEND-ONLY with TYPED CORRECTING ENTRIES. Correction is a first-class operation:
  'mispost' · 'wrong_unit' · 'court_ordered_abatement' · 'rescinded_charge'
  'identity_theft' · 'unlawful_fee_reversal' · 'sealed_by_order' · 'clerical'

Mutation and deletion-as-correction do not exist in the schema. Every correction carries
its author, basis, and the entry it corrects — the G6 §II.8.5 records pattern.

WHAT LEAVES: nothing, by default. The payment history is Class-T (§II.11.2):
  ✓ the tenant, always, free, exportable
  ✓ the parties to THIS tenancy
  ✓ the owner, aggregated to the unit (arrears status and balance, not behaviour)
  ✗ another manager · another applicant screening · any export · any aggregate
  ✗ any model feature · any bureau, absent the §II.13.5 opt-in
```

### II.6.8 Denomination and custody *(G7-16)*

Group 1 §II.7.1 and §II.7.6 apply unchanged and are load-bearing here: obligations are denominated in **USD**; the token is transport; the resident is **never** required to hold the token, take token price risk, or hold a key whose loss could cost them their home. Tenant wallets are custodial by default with no token exposure. The platform key can only ever return funds to their source.

---

## II.7 The Access Floor & Anti-Eviction Architecture *(resolves G7-19, G7-22, G7-23, G7-26)*

### II.7.1 The Access Floor, enumerated *(I-22)*

```
THE PLATFORM DOES NOT BUILD, INTEGRATE, EXPOSE, OR PERMIT — at any tier, under any
state, for any reason, on any account:

  ✗ manager-initiated lock, credential, or access-control revocation of a dwelling
  ✗ any utility control, shutoff, throttle, or submetering enforcement action
  ✗ payment-conditioned amenity, parking, laundry, storage, or common-area access
  ✗ manager revocation, suspension, or degradation of a TENANT's account or records
  ✗ any capability whose effect is to make a dwelling less habitable or less accessible

SMART LOCKS, if integrated at all: tenant-enrolled, tenant-controlled, with the manager
role STRUCTURALLY INCAPABLE of revoking a resident credential — the API surface does not
exist, rather than being permission-gated.

`access-floor-lint` fails the build on any code path, integration, feature flag, or API
surface that can alter dwelling access, utility state, or amenity entitlement as a
function of payment, dispute, or account status. This lint has no allowlist.
```

### II.7.2 What the manager may legitimately do *(G7-26, G7-32)*

Notice generation runs entirely inside the Group 4 §II.11.1 boundary, inherited without modification:

```
PERMITTED     per-jurisdiction templates drafted and approved by licensed counsel,
              versioned, with an identified approving attorney; mechanical field
              completion; statutory service mechanics and proof of service; recording
NOT PERMITTED recommending WHICH notice to serve; advisory text on grounds or timing;
              any assessment of the manager's or the tenant's legal position; any
              output framed as what a party "should" do
ALWAYS        a not-legal-advice disclosure and an offer of independent counsel,
              rendered before generation and acknowledged into `disclosures`
THE PLATFORM  prepares and records. It NEVER files, never serves as agent of record,
              never predicts an outcome, never scores a tenant's eviction risk, never
              ranks tenants by risk, and never routes to a volume eviction service.
```

**Tenant-side parity is mandatory.** Every notice generated is delivered into the tenant's workspace at generation, with: the jurisdiction's response window computed and counted down, the tenant's rights summary for that notice type stated as facts, and the legal-aid directory. A notice the tenant cannot see is not served through this platform.

### II.7.3 Just-cause and window enforcement at generation

Notice generation is **blocked**, not warned about, when: the ground is not permitted in the jurisdiction for that tenancy class; the notice period is shorter than the statute for that tenure; a just-cause ordinance applies and no permitted cause is stated; a rent-regulated tenancy's renewal obligation has not been satisfied (§II.12.3); the amount claimed includes non-rent charges the jurisdiction forbids pursuing as rent (§II.6.6); or **an open habitability ticket past its statutory clock exists on the unit** — in which case the manager is shown the clock they missed, because in most jurisdictions that fact is dispositive.

### II.7.4 The forbearance path, corrected *(G7-22)*

The taxonomy's *"logging the request immutably"* is replaced with a tenant-controlled fork:

```
OPTION A — FORBEARANCE AGREEMENT (mutual, visible, enforceable)
  A real instrument: deferred amount, catch-up schedule, fee waiver, and an express
  agreement not to serve a non-payment notice on the deferred amount during the term.
  Generated under §II.7.2. Both parties execute. Binding, and the tenant gets protection
  in exchange for the disclosure.

OPTION B — CONFIDENTIAL ASSISTANCE (invisible to the manager, always available)
  Rental-assistance program directory, application support, legal-aid referral.
  CREATES NO MANAGER-VISIBLE RECORD OF ANY KIND. The manager learns only that a
  third-party payment arrived, if one does.

RULES BINDING ON BOTH:
  · nothing here is immutable against the TENANT's own withdrawal
  · any manager-visible hardship record is purpose-bound, expires on a short clock, is
    excluded from every screening, renewal, ranking, pricing, and analytic surface
    (I-24, I-28), and is correctable
  · initiating either option is a PROTECTED ACT under I-24
  · the tenant is told, in plain language and BEFORE choosing, what each option means
    for a future proceeding
```

### II.7.5 The retaliation firewall *(G7-23, I-24)*

```
PROTECTED ACTS (typed, not inferred):
  habitability ticket · classification escalation · code-enforcement referral ·
  withholding intent · repair-and-deduct · deposit dispute · fair-housing complaint ·
  tenants'-association membership or organizing · DV/safety protection activation ·
  forbearance or assistance request · any §II.8.3 escalation · any §II.4.5 dispute

THE SHIELDED LOG
  Protected acts write to `protected_acts`, which has NO GRANT to any ranking, screening,
  renewal, pricing, priority, dispatch, or analytic role. REVOKE + a BEFORE trigger
  asserting the reading role, exactly as the G1 I-2 billing separation is enforced.
  `retaliation-lint` fails the build if any such path can reach the table, and extends
  the existing Group 5 I-15 lint rather than duplicating it.

TENANT-FACING
  the jurisdiction's rebuttable-presumption window is computed and surfaced TO THE TENANT
  whenever an adverse action lands inside it, with the legal-aid directory.

SUPERVISORY
  a monitor flags a firm whose adverse actions (non-renewal, fee assessment, notice
  service, dispatch de-prioritization) cluster after protected acts, relative to their
  own baseline and the population. This is a SUPERVISORY signal reviewed by Group 8.
  It is never rendered to a manager, never a public rating, and never a marketing claim.
```

---

## II.8 The Tenancy Records Guarantee *(resolves G7-20, G7-21)*

### II.8.1 The guarantee

```
THE TENANT'S COPY IS THE TENANT'S PROPERTY.

  lease and amendments · every rent receipt and ledger entry · every ticket with its
  full timeline · every photograph they submitted · every entry record · every notice
  served on them · every disclosure they acknowledged · the deposit record and its
  itemization · every correction

EXPORTABLE      at any time, in one action, free, in a form meeting the Group 4 §II.10
                evidence-authentication standard (hash-chained, timestamped, with a
                verification path a court can follow)
SURVIVES        tenancy end + the jurisdiction's limitations period · manager change ·
                owner change · engagement revocation · manager subscription lapse ·
                manager account closure · platform tier changes
NOT REVOCABLE   a manager cannot revoke, suspend, degrade, or expire a tenant's account
                or records. THE CAPABILITY DOES NOT EXIST IN THE SCHEMA (§II.7.1).
DELETION        the tenant's own deletion is honored except where a live obligation or a
                retention duty exists, in which case the account restricts to custodial
                and the tenant is told precisely which obligation blocks it and when it
                clears (Group 1 §II.8.5, inherited).
```

### II.8.2 Continuity across a manager change

When an engagement terminates and a successor begins, the **tenancy is the continuous object**. The tenant's account, workspace, history, ledger, deposit record, and open clocks carry across untouched. The outgoing manager's access is severed at revocation; the incoming manager receives the operational record and **no Class-T applicant data** — screening files do not transfer between managers, ever (§II.4.9).

### II.8.3 The escalation ladder *(G7-21)*

```
Every rung is available WITHOUT the manager's consent.

  1  MANAGER          the ordinary path; SLA'd, clocked, visible
  2  OWNER            surfaced into the Group 1 workspace. The owner carries the
                      non-delegable habitability duty and must be reachable.
  3  NEUTRAL          a Group 4 matter with a `neutral` under the §II.5.3 selection
                      protocol. Compensation FIXED AT APPOINTMENT and paid regardless
                      of outcome (I-21, inherited). Small-dollar deposit and abatement
                      disputes route to the fast track. The platform earns ZERO NET
                      REVENUE from the outcome (G4 §II.12.2, inherited).
  4  PUBLIC           code enforcement, housing authority, rent board, fair-housing
                      agency — surfaced always, one action, never gated, never delayed,
                      never pre-notified to the manager. A PROTECTED ACT (I-24).
  5  COUNSEL          legal-aid directory and the Group 4 attorney directory, with the
                      G1 §II.8.3 fee-matrix rule: NO per-referral payment, NO fee
                      contingent on the tenant engaging.
```

---

## II.9 Sub-Role Portals — Hardened Feature Matrices

### II.9.1 A · Property Manager — `prop_manager`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Units & Tenancies** | Lease state machine, renewals, notice generation, party management | M3 + `lease` scope |
| **Applications** | Graduated dispositions, named-human decisions, evidence review | M3 + published policy |
| **Habitability Board** | Classified queue, statutory clocks, escalation state | M3 + `dispatch`; **not optimizable** |
| **Dispatch** | Scope-matched Group 5 dispatch, entry protocol, three-key completion | M3 + `dispatch` |
| **Rent Trust** | Collection, sweep, reconciliation, itemized fee invoicing | M2 trust account + `collect` |
| **Deposit Trust** | Per-tenancy custody, interest, itemization, statutory clocks | M2 + `collect` |
| **Reserve** | Owner-funded disbursement under mandate | `disburse` + I-7 dual control |
| **Owner Reporting** | Unit performance, compliance posture, clock adherence | M3; **Class-T excluded** |
| **Compliance** | Registrations, inspections, violations → Group 4 | M3 |

**Hardening deltas from the draft**
- Authority derives from a **revocable, scoped, owner-granted engagement**, never a role string (G7-28).
- The **fee is invoiced against the owner's swept balance**, never deducted from the corpus (G7-12, I-26).
- Compensation is **structurally indifferent** to whether a repair happens; NOI-based fees are forbidden (G7-08, G7-09).
- **Auto-deny is prohibited**; every adverse or conditional outcome requires a named human and an adverse action notice (G7-03, I-25).
- **No raw transaction view, no unit-level rent recommendation, no eviction score, no tenant lookup outside the engagement, no access control of any kind** (G7-05, G7-19, G7-27, G7-30).
- The habitability queue is a **floor**, not a backlog: it dispatches regardless of arrears, disputes, or the manager's own billing state (I-27).

### II.9.2 B · Tenant / Resident — `prop_tenant`

| Subtab | Capabilities | Gates |
|---|---|---|
| **My Home** | Lease terms, key dates, renewal window, notices with response clocks | T1 + `is_tenancy_party` |
| **Repairs** | Structured intake, unilateral classification escalation, **the visible clock**, remedy facts | T1 |
| **Entry Log** | Every entry: who, when, why, under what authorization | T1, occupancy roles only |
| **Rent & Receipts** | Discharge-on-authorization ledger, corrections, autopay with one-action revocation, withholding intent | T1, leaseholder roles |
| **Deposit** | Depository, balance, interest, itemization clock, dispute | T1, leaseholder roles |
| **Get Help** | The full §II.8.3 ladder, unconditionally, at every rung | T1 |
| **My Records** | Export, always, free, court-authenticable, permanent | T1 |
| **Safety** | DV/stalking protections; renders only on activation; **no manager-visible record** | T1 |

**Hardening deltas from the draft**
- The tenant is a **party with keys**: they confirm repair completion (G7-08), they can escalate classification unilaterally (G7-09), and they hold the screening report (G7-01).
- **$0 forever, no entitlement key** — unsellable, unloseable, un-mis-provisionable (G7-31).
- **Records are theirs and survive everything**, including the manager (G7-20).
- **Autopay is revocable in one action** and withholding is a supported flow, not an absence (G7-14).
- **An Applications workspace exists before any tenancy and before any disclosure** (G7-34).
- Guarantors reach financial surfaces only; occupants reach habitability surfaces only; former parties are severed instantly (G7-24, G7-29).

### II.9.3 Manager seats — `me_seat_role` *(the G3 §II.1.2 pattern)*

| Seat | Reaches | Never |
|---|---|---|
| `principal` | Everything in the firm's scope; the only seat that may accept engagements | Exceed an engagement's scope |
| `manager` | Operational scope on assigned engagements | Trust disbursement above threshold alone (I-7) |
| `leasing_agent` | Applications and listings on assigned units | Trust ledgers, deposits, existing-tenancy ledgers |
| `maintenance_coord` | Habitability board, dispatch, entry | Any Class-T datum; any ledger; any application |
| `bookkeeper` | Trust ledgers, reconciliation, invoicing | Applications; Class-T; dispatch; notices |
| `read_only` | Reporting surfaces | Any write; any Class-T |

**Seat scope is the intersection of the engagement's scope and the seat's role** (G3 I-5, inherited). A seat can never exceed its engagement, and an engagement can never exceed the owner's grant.

---

## II.10 Degraded Operation — What Happens When Something Breaks

Every other group in this corpus can tolerate a degraded day. Group 7 cannot: rent is due on a date, heat fails on a date, and a statutory clock does not pause for an outage. Each failure mode below has a **designed** behaviour, and in every case the designed behaviour resolves in the resident's favour, because the resident is the party with no alternative.

| Failure | Designed behaviour |
|---|---|
| **Payment rail degraded on the 1st** | Authorization succeeds and **discharges the obligation** (I-23). Settlement catches up. No fee, notice, arrears status, or report is generated from a rail state — the code path does not exist (`discharge-lint`). |
| **Income aggregator unavailable** | Applications proceed on document evidence. Refusal or inability to bank-link is never itself a criterion (§II.4.2), so the outage costs latency, never a denial. |
| **Reporting partner unavailable** | Applications queue with the decision window **paused and the applicant told**. Expiry refunds the fee in full (§II.4.7). No provisional decision is rendered on partial data. |
| **No vendor accepts an emergency** | The §II.5.7 ladder runs to the non-marketplace terminal. The tenant's 911, utility, and code-enforcement paths were already rendered at t+0 and never depended on platform availability. |
| **Manager abandons the portfolio** (unresponsive, insolvent, licence revoked) | Clocks continue and escalate to the **owner**, who holds the non-delegable duty. The corpora are trust property and are not part of the firm's estate. Tenant records are unaffected (§II.8). The owner may revoke and re-grant an engagement without any act by the outgoing firm. |
| **Owner unreachable on an escalated habitability failure** | The §II.5.3 ladder runs to its terminus regardless: a Group 4 matter opens, and the tenant's unilateral code-enforcement referral remains one action. Neither requires a counterparty to respond. |
| **Jurisdiction rule pack stale or missing** | The unit **cannot accept applications, generate notices, or collect deposits**. The failure mode is refusal to operate, never operating on a stale statutory clock (§V.1, Appendix E item 9). |
| **Manager subscription lapses** | §II.13.6. Net-new manager-side origination stops. Rent, tickets, dispatch, sweeps, deposits, records, and clocks are untouched. |
| **Platform outage spanning a statutory deadline** | Deadlines are computed from the recorded event timestamp, not from processing time. Any deadline that elapsed during an outage resolves against the platform: undisputed deposit portions release, fee refunds execute, and the tenant is notified of what the outage affected. |
| **A tenant loses account access** (device, credential, custody) | Recovery is a supported flow with human-assisted identity re-binding. **No custody model exists in which a lost key can cost a resident their funds, their records, or their home** (G1 §II.7.1 #5, and §II.6.8). |

---


## II.11 Data Plane, Class-T Restriction & Occupancy Safety *(resolves G7-05, G7-06, G7-11, G7-27, G7-29)*

### II.11.1 Class-T restricted data

Modelled on Group 3 §II.11.3 Class-1, with a **narrower** read set because the subject is a consumer who is not the customer:

```
CLASS-T:
  screening reports and every element of them · income attestations · any bank-derived
  datum · government ID images · household composition · occupancy pattern · in-unit
  imagery · entry records · DV/safety state and its documentation · hardship and
  forbearance records · protected-act records · tenant contact details

READ SET:
  · the tenant themself, always, and their §II.1.3 authorized_agent within its grant
  · the manager seats whose ROLE requires the specific element, on an ACTIVE engagement,
    for the LIVE purpose only — never historically, never in bulk
  · NO admin branch. Platform personnel reach Class-T only through an audited
    break-glass that writes an access event VISIBLE TO THE TENANT.
    (The Group 4 §II.1.2 privileged-row rule, inherited.)

NEVER APPEARS IN:
  any aggregate · any export · any map layer or tile · any owner report · any lender
  data room · any marketing surface · any model training set · any Co-Pilot index ·
  any cross-tenancy or cross-portfolio query · any analytic product
```

### II.11.2 What crosses each boundary

| To | Receives | Never receives |
|---|---|---|
| **Group 1 — Owner** | Unit performance, lease terms, arrears **status and balance**, habitability clock adherence, compliance posture, entry records on their own parcel | Screening files, income attestations, bank-derived data, ID images, in-unit imagery, household composition, DV state, protected-act records |
| **Group 3 — Lender** | Rent roll **de-identified and aggregated** for DSCR: unit count, occupancy rate, contract rent distribution, aggregate arrears | Any individual tenant, name, ledger, arrears attribution, screening datum, or occupancy identity |
| **Group 5 — Vendor** | Unit, scope, window, access instructions (§II.5.6 allowlist) | Everything else, enforced by field allowlist |
| **Group 4 — Counsel/Neutral** | Matter-scoped record under G4 §II.1.1; the `neutral` gets **the record only** (I-12) | Any party's privileged material; any Class-T outside the matter's scope |
| **Group 6 — Design** | Unit configuration for renovation scope | Occupancy, tenancy, or any Class-T datum |
| **Group 9 — Broker** | Listing data for **vacant or lawfully-noticed** units only | Anything about a **sitting** tenant; occupancy identity; any Class-T; any suppressed unit (§II.11.3) |
| **Group 8 — Admin** | Supervisory aggregates, break-glass under audit | Class-T without a tenant-visible access event |

### II.11.3 DV, stalking and occupancy safety *(G7-29)*

```
ACTIVATION      by the tenant, unilaterally, from the Safety subtab. Requires no
                manager approval, no documentation upload to the manager, and creates
                NO manager-visible record of the activation itself.

ON ACTIVATION:
  · PARTY REMOVAL     a named tenancy_party transitions to `former_party` INSTANTLY.
                      Session invalidation, retrieval purge, and record severance are
                      immediate. Where a protective order or statutory bifurcation
                      supports it, this is unilateral and does not require the removed
                      party's consent or notice.
  · LOCK CHANGE       dispatched on the emergency ladder (§II.5.7) WITHOUT notice to
                      the removed party.
  · UNIT SUPPRESSION  the unit is suppressed from: every map layer at every zoom, every
                      manager-side aggregate that could reveal occupancy, every vendor
                      job card beyond the minimum, every export, every listing surface,
                      and every Group 9 feed.
  · DOCUMENTATION     held Class-T with the narrowest read set in the system: the tenant
                      and an audited break-glass. Not the manager, not the owner.
  · NON-ADVERSE       victim status may NEVER be an input to any screening, renewal,
                      pricing, ranking, dispatch, or notice surface (I-24, and
                      enforced additionally by `proxy-lint`).
  · ADDRESS PROGRAMS  state address-confidentiality participation is honored: the
                      substitute address is used everywhere a mailing address is used.

PANIC PATH      always available from the tenant workspace, one action, creates no
                manager-visible record, surfaces local DV resources and 911.
```

### II.11.4 The map, and what it may not reveal

```
MANAGER MAP     scoped to `management_engagements.unit_scope`. Nothing outside it renders.
  ✓ unit state (occupied / vacant / turning), aggregate compliance posture
  ✓ open habitability tickets AGGREGATED TO THE BUILDING with a k-anonymity floor
  ✗ per-unit "maintenance hotspot" at a granularity that identifies WHO complained —
    this is a retaliation-targeting surface (I-24) and is withdrawn
  ✗ occupancy pattern, entry timing, or household composition at any granularity
  ✗ any suppressed unit (§II.11.3)

TENANT MAP      their own unit plus building common elements and posted notices.
  ✗ any other unit's occupancy, tenancy, arrears, or ticket state — a resident learns
    nothing about their neighbours from this product
```

### II.11.5 Deliberately not collected, and deliberately not built

Extending the Group 1 §II.8.4, Group 5 §II.9.2, and Group 6 §IV.4 lists:

```
✗ an eviction-risk, resident-risk, or tenant score of any kind, at any tier, ever
✗ a cross-applicant or cross-tenant ranking, reputation, or portable behavioural score
✗ any raw bank transaction, merchant, or counterparty datum
✗ any unit-level rent price, increase, or pricing recommendation (I-29)
✗ any correlation product between a protected act and any outcome (that correlation is
  computed ONLY inside the §II.7.5 supervisory monitor and is never a feature or a product)
✗ any occupancy-presence inference product
✗ any resale, enrichment, or licensing of applicant or tenant data to any third party
```

---

## II.12 Lease Lifecycle & Regulated Tenancies *(resolves G7-25, G7-26, G7-35)*

### II.12.1 Market data, rebuilt antitrust-safe *(G7-30, I-29)*

The draft's *"market rent benchmarks"* is **withdrawn** and replaced with the Group 5 §II.9.3 regional-index pattern, constrained harder because the enforcement docket in this domain is active:

```
SOURCES         public records, published listings, and data the contributing owner
                EXPRESSLY consented to contribute. NO non-public competitor lease terms,
                concessions, renewal rates, or occupancy data. Ever.
AGGREGATION     to a geography with a k-anonymity floor and a minimum contributor count
                from independent ownership. Below the floor, nothing renders.
TEMPORAL        lagged. Historical distributions only. No forward projection.
FORM            A DISTRIBUTION, NEVER A RECOMMENDATION. Percentiles for a unit type in a
                geography. No suggested price, no suggested increase, no "optimal" rent,
                no acceptance tracking, no adoption telemetry, no feedback loop of any
                kind from a manager's pricing decision back into the index.
LINT            `rent-recommendation-lint` fails the build on any surface that emits a
                price, increase amount, or ranking for a SPECIFIC unit, and on any
                ingestion path carrying non-public competitor lease terms.
```

### II.12.2 Instruments *(G7-32)*

Leases, renewals, notices, forbearance agreements, and deposit itemizations are generated **entirely inside the Group 4 §II.11.1 boundary**: per-jurisdiction, counsel-approved, versioned templates with an identified approving attorney; mechanical field completion only; no instrument-selection recommendation; no advisory text; a not-legal-advice disclosure and an offer of independent counsel acknowledged into `disclosures` before execution. **Both parties receive the executed instrument and its hash at execution.**

### II.12.3 Regulated tenancies *(G7-25)*

```
tenancies.regulatory_regime ∈
  ('market','rent_stabilized','rent_controlled','subsidized','just_cause_ordinance',
   'income_restricted', ...)   -- loaded from the jurisdiction rule pack

ON A REGULATED TENANCY:
  · the LEGAL REGULATED RENT is rendered as a CEILING wherever a rent appears
  · preferential rent, if any, is tracked distinctly from legal regulated rent
  · any increase instrument above the permitted amount is BLOCKED AT GENERATION —
    not warned about, not flagged, blocked
  · the renewal-offer window and its statutory notice period are computed and surfaced
    to BOTH parties, with a missed window producing the jurisdiction's consequence
  · registration status is tracked; a missing or lapsed registration BLOCKS the
    increase surface entirely
  · succession, MCI/IAI adjustments, and preferential-rent rules load from the pack
  · the §II.12.1 index NEVER renders on a regulated unit's pricing surface — it is
    irrelevant and its presence is an invitation to an overcharge
```

### II.12.4 The tenancy state machine *(G7-26)*

```
application → offer → executed → active → { renewal_offered → renewed
                                          | non_renewal_noticed
                                          | notice_served }
            → ending → surrendered → deposit_itemization → closed → archived(permanent)

Every transition carries the jurisdiction's notice period, computed from tenure and
tenancy_class, with the clock visible to both parties. Just-cause grounds gate
`non_renewal_noticed` and `notice_served` where an ordinance applies (§II.7.3).
`surrendered` starts the §II.6.3 deposit clock automatically, without anyone's act.
```

---

## II.13 Monetization *(resolves G7-04, G7-18, G7-31, G7-32, G7-33)*

### II.13.1 Manager tiers — manager-side features only

| Tier | Price | Entitlement key | Unlocks (features only) |
|---|---|---|---|
| **Operator** | $/unit/mo | `ent.pm_operator` | Engagements, tenancies, habitability board, dispatch, trust ledgers |
| **Operator+** | $$/unit/mo | `ent.pm_operator_plus` | Multi-firm seats, advanced reconciliation, owner reporting automation, regional index depth |
| **Enterprise** | negotiated | `ent.pm_enterprise` | API, portfolio consolidation, custom rule packs |

An entitlement may gate whether a **manager-side analytic subtab renders**. It may never gate whether a row is readable, whether rent is collectible, whether a habitability ticket dispatches (I-27), whether a sweep runs, or whether a tenant reaches anything at all (I-2, G1 §II.8.1).

### II.13.2 The tenant tier

**$0 forever. No entitlement key. Not purchasable, not upgradeable, not losable.**

Precisely as Group 1 §II.8.2 gives Shield no key: there is no product surface through which the tenant product could be sold, mis-provisioned, downgraded, or lost to someone else's failed payment. Every capability in §II.9.2 is permanently available to every T1 resident.

### II.13.3 Fee matrix — extending Group 1 §II.8.3

| Counterparty | Permitted | Forbidden | Rationale |
|---|---|---|---|
| **Manager (Group 7)** | Per-unit subscription; disclosed dispatch marketplace fee paid by the contractor (G5) | Any fee taken from a trust corpus (I-26); any fee that varies with repair spend, NOI, or reserve underspend | Trust law; §II.5.5 neutrality |
| **Owner (Group 1)** | Rent-processing fee, disclosed, invoiced | Deduction from the corpus ahead of the owner's accounting | I-26 |
| **Applicant** | Screening fee at **cost**, capped, receipted, refundable; **$0 where the jurisdiction assigns it to the landlord** | Any platform margin per application; any fee for a decision, an appeal, a dispute, or a file copy | G7-04; the G4 §II.12.2 pattern |
| **Tenant** | **Nothing is required.** An optional expedited payment method may carry a disclosed fee | Any fee to pay rent on the free path; any fee for records, export, ticketing, dispute, or escalation; any late fee accruing to the **platform** | G7-18; §II.13.2 |
| **Contractor (Group 5)** | Existing marketplace fee, paid by the contractor | Any fee contingent on a habitability outcome | G5, inherited |
| **Broker (Group 9)** | Flat access subscription | Any fee contingent on a tenant placement that the platform's screening influenced | G1 §II.8.3, extended |

**The structural rule (the G4 §II.12.2 pattern, applied to housing):**

```
PLATFORM NET REVENUE IS FLAT WITH RESPECT TO TENANT DISTRESS.

No revenue line may rise with: application volume · denial rate · arrears · late fees ·
notices served · evictions · deferred repairs · deposit forfeitures · turnover.

Late fees, where lawful and capped, flow to the OWNER per the lease. The platform books
ZERO. `distress-revenue-lint` fails the build on any revenue path reachable from a
delinquency, notice, denial, forfeiture, or eviction event.
```

### II.13.4 Positioning *(G7-32, and the rule Group 9 inherits)*

The *"Anti-Broker Engine"* framing is **withdrawn** and replaced:

```
PERMITTED   "Direct leasing: list, screen, and lease your own units, where you are
             licensed to do so." Factual comparison of cost paths. Accurate statement
             of who bears a fee under the applicable law.
FORBIDDEN   any claim that brokerage is unnecessary, avoidable as a legal matter, or
             that using the platform substitutes for a licence the user needs
ALWAYS      M2 licence verification where the jurisdiction licenses the activity; an
            in-product statement of what the jurisdiction requires
GROUP 9     `broker_leasing` operates as a first-class participant: a broker holds a
            scoped `management_engagement` facet or an owner-granted listing mandate,
            with commission handled under the Group 9 audit. Group 7 does not compete
            with Group 9's users through marketing; it competes on product.
            (Appendix A, row A69.)
```

### II.13.5 Rent reporting and post-tenancy balances *(G7-33)*

```
REPORTING    OPT-IN, POSITIVE-ONLY BY DEFAULT, never a condition of tenancy, never a
             screening lever, never a fee differential. Withdrawable prospectively in
             one action. Negative reporting requires a SEPARATE, explicit, revocable
             opt-in and is BLOCKED on any disputed amount, any amount subject to an
             open habitability escalation, and any fee sub-ledger balance (§II.6.6).
FURNISHER    the Group 3 §II.11.2 furnisher spine is inherited WHOLE: accuracy and
             integrity duties, direct and indirect dispute investigation, correction
             propagation, and marking disputed items as disputed.
BALANCES     post-tenancy balances route to the Group 4 boundary. THE PLATFORM DOES NOT
             ACT AS A COLLECTOR and does not sell, place, or assign tenant debt.
```

### II.13.6 The Group 7 Obligation Lock *(G7-31)*

Extends Group 1 §II.8.5. A manager subscription lapse withholds **net-new manager-side origination only**: new listings, new applications, new engagements, new analytics runs. It never touches:

```
· a resident paying rent, opening a ticket, reading, exporting, or disputing anything
· a habitability dispatch (I-27) — the platform funds it and recovers (§II.5.2)
· any trust corpus, sweep, deposit, or reconciliation
· a contractor's payment for completed, verified work (G5 I-13, inherited)
· any record under a retention duty, in any jurisdiction
· any open clock, escalation, matter, or dispute
```

### II.13.7 Co-Pilot commercial constraints

The Co-Pilot may not: recommend a screening outcome or characterize an applicant; recommend a rent, increase, or concession (I-29); produce eviction guidance, timing, or strategy; generate a legal instrument or legal advice for any account class (G4 §II.11.2, inherited whole); characterize a specific resident; or surface any Class-T datum to a manager that the manager's seat and live purpose do not independently justify. For tenant accounts it explains mechanics, surfaces the tenant's own documents and clocks, and locates the escalation ladder — and it never interprets a lease.

---
# PART III — IMPLEMENTATION SPECIFICATION

## III.1 Schema Additions

Target migration files, sequenced after the Group 6 set (`0038`–`0042`):

- `0043_group7_engagements_tenancies.sql`
- `0044_group7_screening.sql`
- `0045_group7_trust_ledgers.sql`
- `0046_group7_habitability.sql`
- `0047_group7_rls.sql`

### III.1.1 `0043_group7_engagements_tenancies.sql`

```sql
create type management_level as enum ('M0','M1','M2','M3');
create type me_scope_facet  as enum ('lease','collect','dispatch','disburse','notice');
create type me_seat_role    as enum
  ('principal','manager','leasing_agent','maintenance_coord','bookkeeper','read_only');
create type tenancy_class   as enum ('residential','commercial','mixed_use','short_term');
create type tenancy_role    as enum
  ('leaseholder','co_leaseholder','occupant','guarantor','authorized_agent','former_party');
create type tenancy_state   as enum
  ('offer','executed','active','renewal_offered','renewed','non_renewal_noticed',
   'notice_served','ending','surrendered','closed','archived');
create type regulatory_regime as enum
  ('market','rent_stabilized','rent_controlled','subsidized','just_cause_ordinance',
   'income_restricted');

-- The physical addressable object. Child of a Group 1 property.
create table units (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete cascade,
  label         text not null,                  -- "3B"
  jurisdiction  text not null,                  -- drives every rule pack lookup
  unit_type     text,
  created_at    timestamptz not null default now(),
  unique (property_id, label)
);
create index units_property on units (property_id);

create table management_firms (
  id            uuid primary key default gen_random_uuid(),
  legal_name    text not null,
  level         management_level not null default 'M0',
  created_at    timestamptz not null default now()
);

-- G7-12 / G7-32: licensure is a precondition on `collect` and `lease`, per jurisdiction.
create table management_licences (
  id                uuid primary key default gen_random_uuid(),
  management_firm_id uuid not null references management_firms(id) on delete cascade,
  user_id           uuid references users(id),     -- the natural person licensee
  jurisdiction      text not null,
  licence_type      text not null,                 -- broker / property manager / exempt
  licence_number    text not null,
  standing          text not null check (standing in ('active','inactive','suspended','revoked')),
  expires_on        date not null,
  verified_at       timestamptz not null,
  reverify_due      timestamptz not null,
  unique (management_firm_id, jurisdiction, licence_number)
);

create table management_bonds (
  id                uuid primary key default gen_random_uuid(),
  management_firm_id uuid not null references management_firms(id) on delete cascade,
  bond_type         text not null check (bond_type in ('fidelity','eo','surety')),
  carrier_name      text not null,
  policy_number     text not null,
  per_claim_cents   bigint not null,
  aggregate_cents   bigint not null,
  effective_on      date not null,
  expires_on        date not null,
  unique (management_firm_id, policy_number)
);

-- THE manager-side authorization primitive (§II.1.2, G7-28)
create table management_engagements (
  id                    uuid primary key default gen_random_uuid(),
  management_firm_id    uuid not null references management_firms(id) on delete restrict,
  property_id           uuid not null references properties(id) on delete restrict,
  -- the grant MUST originate from a Group 1 V3 owner binding. Nothing else may create one.
  granted_by_binding_id uuid not null references property_role_bindings(id) on delete restrict,
  unit_scope            uuid[] not null default '{}',        -- empty = all units on property
  scope                 me_scope_facet[] not null default '{}',
  licence_id            uuid references management_licences(id),
  trust_account_id      uuid,                                 -- FK added in 0045
  habitability_sla_accepted_at timestamptz,
  starts_on             date not null,
  ends_on               date,
  terminated_at         timestamptz,
  termination_reason    text,
  created_at            timestamptz not null default now()
);
create index me_lookup on management_engagements (management_firm_id, property_id, terminated_at);
create index me_units  on management_engagements using gin (unit_scope);

-- `collect` and `disburse` require a trust account; `collect`/`lease` require a licence
-- where the jurisdiction licenses the activity. Enforced in guard_engagement_scope().
alter table management_engagements add constraint me_collect_needs_trust
  check (not ('collect' = any(scope) or 'disburse' = any(scope)) or trust_account_id is not null);
alter table management_engagements add constraint me_m3_needs_sla
  check (cardinality(scope) = 0 or habitability_sla_accepted_at is not null);

create table me_seats (
  id                 uuid primary key default gen_random_uuid(),
  management_firm_id uuid not null references management_firms(id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  seat_role          me_seat_role not null,
  engagement_scope   uuid[] not null default '{}',   -- empty = all firm engagements
  status             text not null default 'active' check (status in ('active','suspended','revoked')),
  created_at         timestamptz not null default now(),
  unique (management_firm_id, user_id)
);
create index me_seats_user on me_seats (user_id, status);

-- THE tenant-side authorization primitive (§II.1.3)
create table tenancies (
  id                 uuid primary key default gen_random_uuid(),
  unit_id            uuid not null references units(id) on delete restrict,
  class              tenancy_class not null,
  regime             regulatory_regime not null default 'market',
  state              tenancy_state not null default 'offer',
  term_start         date,
  term_end           date,
  contract_rent_cents bigint,
  legal_regulated_rent_cents bigint,        -- G7-25: the ceiling, where regime demands one
  preferential_rent_cents    bigint,
  registration_ref   text,                  -- regulator registration; absence blocks increases
  surrendered_at     timestamptz,
  closed_at          timestamptz,
  created_at         timestamptz not null default now()
);
create index tenancies_unit on tenancies (unit_id, state);

-- G7-25: an increase above the legal regulated rent cannot be persisted at all.
alter table tenancies add constraint tenancy_regulated_ceiling
  check (
    regime not in ('rent_stabilized','rent_controlled')
    or legal_regulated_rent_cents is null
    or contract_rent_cents is null
    or contract_rent_cents <= legal_regulated_rent_cents
  );

create table tenancy_parties (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid not null references tenancies(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role         tenancy_role not null,
  scope        text[] not null default '{}',
  status       text not null default 'active' check (status in ('active','ended','revoked')),
  ended_at     timestamptz,
  ended_reason text,                        -- 'departure' | 'bifurcation' | 'protective_order'
  created_at   timestamptz not null default now(),
  unique (tenancy_id, user_id, role)
);
create index tp_lookup on tenancy_parties (user_id, tenancy_id, status);

-- G7-29: DV / stalking protection state. Narrowest read set in the system (§II.11.3).
create table tenancy_safety_states (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references tenancies(id) on delete cascade,
  activated_by  uuid not null references users(id),
  activated_at  timestamptz not null default now(),
  suppress_unit boolean not null default true,
  substitute_address text,                  -- address-confidentiality program
  deactivated_at timestamptz,
  unique (tenancy_id)
);

-- G7-23 / I-24: the SHIELDED log. No ranking, screening, renewal, pricing, or
-- dispatch role holds any grant on this table.
create table protected_acts (
  id          uuid primary key default gen_random_uuid(),
  tenancy_id  uuid not null references tenancies(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  act_type    text not null,
  occurred_at timestamptz not null default now(),
  detail_ref  uuid
);
create index pa_tenancy on protected_acts (tenancy_id, occurred_at);

create trigger me_no_billing before insert or update or delete on management_engagements
  for each row execute function assert_not_billing_actor();
create trigger tenancies_no_billing before insert or update or delete on tenancies
  for each row execute function assert_not_billing_actor();
create trigger tp_no_billing before insert or update or delete on tenancy_parties
  for each row execute function assert_not_billing_actor();

revoke all on management_engagements, me_seats, tenancies, tenancy_parties,
              tenancy_safety_states, protected_acts from billing_writer;
-- I-24: the shielded log is unreachable from every decisioning role.
revoke all on protected_acts from ranking_reader, screening_reader, pricing_reader;
```

### III.1.2 `0044_group7_screening.sql`

```sql
create type application_disposition as enum
  ('pending','approved','approved_with_conditions','waitlisted','declined','withdrawn','expired');
create type attestation_method as enum
  ('open_banking_derived','payroll_connect','document_review','benefit_award','self_employed_review');

-- G7-02: criteria are a PUBLISHED, VERSIONED, JURISDICTION-SCOPED object. No national default.
create table screening_policies (
  id                 uuid primary key default gen_random_uuid(),
  management_firm_id uuid not null references management_firms(id) on delete cascade,
  jurisdiction       text not null,
  version            int  not null,
  income_basis       text not null check (income_basis in ('tenant_portion','total_household')),
  income_multiple    numeric,                       -- NULL where the jurisdiction caps/forbids
  credit_criteria    jsonb not null default '{}',
  rental_history_criteria jsonb not null default '{}',
  record_use_rules   jsonb not null default '{}',   -- from the jurisdiction rule pack
  accepted_alternatives jsonb not null,             -- MANDATORY; see constraint
  individualized_assessment_required boolean not null default false,
  bias_test_ref      uuid not null,                 -- §II.4.4; publication is blocked without it
  published_at       timestamptz not null default now(),
  superseded_at      timestamptz,
  unique (management_firm_id, jurisdiction, version)
);
-- A threshold with no alternative path is a categorical exclusion (§II.4.2).
alter table screening_policies add constraint sp_alternatives_required
  check (jsonb_array_length(coalesce(accepted_alternatives,'[]'::jsonb)) > 0);

create table screening_bias_tests (
  id             uuid primary key default gen_random_uuid(),
  policy_ref     uuid,
  method         text not null,
  tested_at      timestamptz not null default now(),
  population_n   int not null,
  outcome_rates  jsonb not null,
  passed         boolean not null,
  less_discriminatory_alternative jsonb,
  business_necessity_rationale text
);

-- G7-05 / §II.4.6: a DERIVED ATTESTATION. There is no transaction table, by design.
create table income_attestations (
  id             uuid primary key default gen_random_uuid(),
  applicant_id   uuid not null references users(id) on delete cascade,
  amount_cents   bigint not null,
  period         text not null check (period in ('monthly','annual')),
  method         attestation_method not null,
  confidence     numeric not null check (confidence between 0 and 1),
  computed_at    timestamptz not null,
  expires_at     timestamptz not null,
  provider_signature text not null,
  revoked_at     timestamptz
);
-- `transaction-lint` additionally asserts that no column anywhere in the schema can
-- carry a merchant name, MCC, counterparty, or transaction-level amount.

-- G7-01 / G7-07: the report is the APPLICANT'S object.
create table screening_reports (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references users(id) on delete cascade,
  provider_ref  text not null,                 -- the reporting agency's file id
  ordered_at    timestamptz not null default now(),
  valid_until   timestamptz not null,
  purged_at     timestamptz,
  unique (applicant_id, provider_ref)
);

create table screening_report_elements (
  id                 uuid primary key default gen_random_uuid(),
  screening_report_id uuid not null references screening_reports(id) on delete cascade,
  element_type       text not null,            -- credit / eviction / criminal / identity
  source             text not null,            -- provenance per element (§II.4.5)
  as_of              date not null,
  payload            jsonb not null,
  disputed_at        timestamptz,              -- MARKED, and unusable while marked
  corrected_at       timestamptz,
  blocked_at         timestamptz               -- identity-theft block
);

-- The applicant's grant. Scoped, expiring, revocable — and revocation purges the copy.
create table screening_grants (
  id                 uuid primary key default gen_random_uuid(),
  screening_report_id uuid not null references screening_reports(id) on delete cascade,
  unit_id            uuid not null references units(id) on delete cascade,
  management_firm_id uuid not null references management_firms(id) on delete cascade,
  granted_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  revoked_at         timestamptz,
  unique (screening_report_id, unit_id)
);

create table applications (
  id                 uuid primary key default gen_random_uuid(),
  unit_id            uuid not null references units(id) on delete cascade,
  applicant_id       uuid not null references users(id) on delete cascade,
  screening_policy_id uuid not null references screening_policies(id),  -- PINNED at submission
  screening_report_id uuid references screening_reports(id),
  income_attestation_id uuid references income_attestations(id),
  submitted_at       timestamptz not null default now(),
  decision_window_ends timestamptz not null,
  disposition        application_disposition not null default 'pending',
  -- I-25: an adverse or conditional disposition REQUIRES a named human.
  decided_by         uuid references users(id),
  decided_at         timestamptz,
  decision_reasons   text[] not null default '{}',   -- selected from the policy, not typed
  conditions         jsonb,
  purge_after        timestamptz not null,           -- I-28
  purged_at          timestamptz
);
create index apps_unit on applications (unit_id, disposition);

-- I-25 at the schema layer: auto-deny is not expressible.
alter table applications add constraint app_adverse_requires_human
  check (
    disposition not in ('declined','approved_with_conditions','waitlisted')
    or (decided_by is not null and decided_at is not null
        and cardinality(decision_reasons) > 0)
  );

create table adverse_action_notices (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  agency_identity jsonb not null,               -- name, address, phone, "did not decide"
  score_used     int,
  key_factors    text[],
  criteria_not_met text[] not null,
  delivered_at   timestamptz not null default now(),
  document_hash  text not null,
  unique (application_id)
);

create table screening_disputes (
  id           uuid primary key default gen_random_uuid(),
  element_id   uuid not null references screening_report_elements(id) on delete cascade,
  opened_by    uuid not null references users(id),
  opened_at    timestamptz not null default now(),
  due_at       timestamptz not null,            -- opened_at + 30 days
  resolution   text check (resolution in ('corrected','deleted','verified','partial')),
  resolved_at  timestamptz
);

-- I-28: the sealed compliance store. No manager grant. No UI surface. Audited query only.
create table applicant_retention_seal (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  sealed_payload jsonb not null,
  sealed_at      timestamptz not null default now(),
  retain_until   date not null
);
revoke all on applicant_retention_seal from authenticated, anon;
```

### III.1.3 `0045_group7_trust_ledgers.sql`

```sql
create type trust_corpus as enum ('rent','deposit','reserve');
create type ledger_entry_kind as enum
  ('rent_charge','rent_payment','fee_charge','fee_payment','deposit_in','deposit_out',
   'deposit_interest','reserve_in','reserve_out','owner_sweep','correction','abatement');
create type correction_kind as enum
  ('mispost','wrong_unit','court_ordered_abatement','rescinded_charge','identity_theft',
   'unlawful_fee_reversal','sealed_by_order','clerical');

create table trust_accounts (
  id                 uuid primary key default gen_random_uuid(),
  management_firm_id uuid not null references management_firms(id) on delete restrict,
  corpus             trust_corpus not null,
  jurisdiction       text not null,
  depository_name    text not null,
  account_ref        text not null,
  interest_bearing   boolean not null default false,
  interest_beneficiary text check (interest_beneficiary in ('tenant','owner','statutory')),
  verified_at        timestamptz not null,
  unique (management_firm_id, corpus, account_ref)
);
alter table management_engagements
  add constraint me_trust_fk foreign key (trust_account_id) references trust_accounts(id);

-- I-26: no fee, subscription, or platform revenue may debit a corpus. Enforced by a
-- trigger, a REVOKE, and `trust-corpus-lint` — three layers, because it is load-bearing.
create table trust_ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  trust_account_id uuid not null references trust_accounts(id) on delete restrict,
  corpus        trust_corpus not null,
  tenancy_id    uuid references tenancies(id),
  unit_id       uuid references units(id),
  engagement_id uuid references management_engagements(id),
  kind          ledger_entry_kind not null,
  amount_cents  bigint not null,
  usd_cents     bigint not null,                  -- G1 §II.7.1 #4: USD is the obligation
  -- I-23: DISCHARGE IS AT AUTHORIZATION. This column, not the intent state, is
  -- what every delinquency computation reads.
  authorized_at timestamptz,
  escrow_intent_id uuid,                          -- rail state; NEVER read by delinquency
  posted_at     timestamptz not null default now(),
  corrects_entry_id uuid references trust_ledger_entries(id),
  correction_kind correction_kind,
  correction_basis text,
  created_by    uuid references users(id)
);
create index tle_tenancy on trust_ledger_entries (tenancy_id, posted_at);
create index tle_unit    on trust_ledger_entries (unit_id, posted_at);

-- Append-only. Mutation and deletion-as-correction do not exist (§II.6.7, G7-17).
create rule tle_no_update as on update to trust_ledger_entries do instead nothing;
create rule tle_no_delete as on delete to trust_ledger_entries do instead nothing;

alter table trust_ledger_entries add constraint tle_correction_shape
  check (corrects_entry_id is null
         or (correction_kind is not null and correction_basis is not null));

-- G7-13: deposits are per-tenancy, capped, and clocked.
create table deposits (
  id             uuid primary key default gen_random_uuid(),
  tenancy_id     uuid not null references tenancies(id) on delete restrict,
  trust_account_id uuid not null references trust_accounts(id) on delete restrict,
  amount_cents   bigint not null,
  statutory_cap_cents bigint not null,
  depository_notice_delivered_at timestamptz,
  itemization_due_at timestamptz,                 -- set automatically on surrender
  itemized_at    timestamptz,
  undisputed_released_at timestamptz,
  unique (tenancy_id)
);
alter table deposits add constraint deposit_within_cap
  check (amount_cents <= statutory_cap_cents);

create table deposit_deductions (
  id           uuid primary key default gen_random_uuid(),
  deposit_id   uuid not null references deposits(id) on delete cascade,
  line_label   text not null,
  amount_cents bigint not null,
  evidence_ref uuid not null,                     -- dated photographic evidence REQUIRED
  disputed_at  timestamptz
);

-- G7-14: the Reg E authorization artifact, revocable in one action.
create table autopay_authorizations (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid not null references tenancies(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  authorized_at timestamptz not null default now(),
  terms_hash   text not null,
  copy_delivered_at timestamptz not null,
  revoked_at   timestamptz,
  unique (tenancy_id, user_id)
);

-- G7-14: withholding is a first-class flow, and the funds are NOT the manager's to release.
create table withholding_intents (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references tenancies(id) on delete cascade,
  declared_by   uuid not null references users(id),
  declared_at   timestamptz not null default now(),
  basis         text not null,
  habitability_ticket_id uuid,
  escrowed_cents bigint not null default 0,
  released_at   timestamptz,
  release_basis text check (release_basis in ('tenant_instruction','court_order'))
);

create trigger trust_no_billing before insert or update or delete on trust_ledger_entries
  for each row execute function assert_not_billing_actor();
revoke all on trust_accounts, trust_ledger_entries, deposits from billing_writer;
```

### III.1.4 `0046_group7_habitability.sql`

```sql
create type condition_class as enum
  ('emergency','habitability','essential_service','routine','cosmetic','tenant_caused');
create type ticket_state as enum
  ('opened','classified','acknowledged','dispatched','attended','completed','confirmed','escalated','closed');
create type completion_key as enum ('contractor_bundle','tenant_confirmation','independent_verification');

create table habitability_tickets (
  id             uuid primary key default gen_random_uuid(),
  tenancy_id     uuid references tenancies(id) on delete set null,  -- null for common areas
  unit_id        uuid not null references units(id) on delete cascade,
  opened_by      uuid not null references users(id),
  klass          condition_class not null,
  klass_asserted_by_tenant boolean not null default false,
  klass_downgrade_basis text,                    -- required to propose a downgrade
  state          ticket_state not null default 'opened',
  opened_at      timestamptz not null default now(),
  clock_due_at   timestamptz not null,           -- from the jurisdiction rule pack
  acknowledged_at timestamptz,
  dispatched_at  timestamptz,
  attended_at    timestamptz,
  completed_at   timestamptz,
  confirmed_at   timestamptz,
  escalated_at   timestamptz,
  escalation_stage int not null default 0,
  work_package_id uuid references work_packages(id)   -- the Group 5 edge
);
create index ht_unit on habitability_tickets (unit_id, state, clock_due_at);

-- A tenant-asserted habitability classification cannot be silently downgraded (§II.5.1).
alter table habitability_tickets add constraint ht_downgrade_needs_basis
  check (not klass_asserted_by_tenant
         or klass in ('emergency','habitability','essential_service')
         or klass_downgrade_basis is not null);

-- §II.5.4: the three keys. Release requires the contractor bundle plus one of the others.
create table repair_completions (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references habitability_tickets(id) on delete cascade,
  key_kind      completion_key not null,
  submitted_by  uuid references users(id),
  provenance_ref uuid,                            -- G5 §II.6.2 bundle
  deficiency_stated text,
  submitted_at  timestamptz not null default now(),
  unique (ticket_id, key_kind)
);

-- G3 §II.9.6 pattern: a hold with no cited item is VOID.
create table repair_holds (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references habitability_tickets(id) on delete cascade,
  held_by       uuid not null references users(id),
  scope_item_ref text,                            -- REQUIRED; absence voids the hold
  stated_deficiency text,
  held_at       timestamptz not null default now(),
  voided_at     timestamptz,
  released_at   timestamptz
);
alter table repair_holds add constraint hold_requires_citation
  check (scope_item_ref is not null and stated_deficiency is not null);

create table entry_records (
  id             uuid primary key default gen_random_uuid(),
  tenancy_id     uuid not null references tenancies(id) on delete cascade,
  ticket_id      uuid references habitability_tickets(id),
  entrant_user_id uuid references users(id),
  entrant_company_id uuid,                        -- Group 5 company
  notice_delivered_at timestamptz,
  notice_required_hours int not null,
  emergency_override_condition text,              -- typed and logged, never a checkbox
  window_start   timestamptz not null,
  window_end     timestamptz not null,
  entered_at     timestamptz,
  exited_at      timestamptz
);
alter table entry_records add constraint entry_notice_or_emergency
  check (notice_delivered_at is not null or emergency_override_condition is not null);

create table code_referrals (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid not null references tenancies(id) on delete cascade,
  referred_by  uuid not null references users(id),
  authority    text not null,
  referred_at  timestamptz not null default now(),
  reference_no text
);
-- Referral is a PROTECTED ACT (I-24). The manager is never pre-notified.
```

## III.2 RLS Helper Functions

```sql
-- ── The Group 7 manager-side predicate (Invariant I-1) ─────────────────────
create or replace function public.has_unit_mandate(
  p_unit uuid, p_facet me_scope_facet default null, p_seat me_seat_role default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from management_engagements e
      join units u on u.id = p_unit and u.property_id = e.property_id
      join me_seats s on s.management_firm_id = e.management_firm_id
                     and s.user_id = auth.uid() and s.status = 'active'
     where e.terminated_at is null
       and e.starts_on <= current_date
       and (e.ends_on is null or e.ends_on >= current_date)
       and (cardinality(e.unit_scope) = 0 or p_unit = any(e.unit_scope))
       and (cardinality(s.engagement_scope) = 0 or e.id = any(s.engagement_scope))
       and (p_facet is null or p_facet = any(e.scope))
       and (p_seat  is null or s.seat_role = p_seat)
  );
$$;

-- ── The Group 7 tenant-side predicate (Invariant I-1) ──────────────────────
-- NOTE: this function NEVER consults management_engagements. That independence is
-- what makes the tenant's workspace survive the manager (§II.3.4, G7-20).
create or replace function public.is_tenancy_party(
  p_tenancy uuid, p_facet text default null, p_role tenancy_role default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenancy_parties p
     where p.tenancy_id = p_tenancy and p.user_id = auth.uid()
       and p.status = 'active'
       and (p_facet is null or p_facet = any(p.scope))
       and (p_role  is null or p.role = p_role)
  );
$$;

-- ── §II.1.3: occupancy facets are unreachable by a guarantor ───────────────
create or replace function public.is_occupancy_party(p_tenancy uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenancy_parties p
     where p.tenancy_id = p_tenancy and p.user_id = auth.uid() and p.status = 'active'
       and p.role in ('leaseholder','co_leaseholder','occupant','authorized_agent')
  );
$$;

-- ── §II.11.1: Class-T. No admin branch; break-glass writes a tenant-visible event ──
create or replace function public.may_read_class_t(p_tenancy uuid, p_element text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    is_tenancy_party(p_tenancy)
    or exists (
      select 1
        from tenancies t
        join units u on u.id = t.unit_id
       where t.id = p_tenancy
         and has_unit_mandate(u.id, null, null)
         and p_element = any (current_setting('app.live_purpose_elements', true)::text[])
    );
$$;

-- ── I-27: the habitability floor. Reads NOTHING about money. ───────────────
create or replace function public.habitability_dispatch_permitted(p_ticket uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from habitability_tickets h
     where h.id = p_ticket
       and h.klass in ('emergency','habitability','essential_service')
  ) or exists (
    select 1 from habitability_tickets h
      join units u on u.id = h.unit_id
     where h.id = p_ticket and has_unit_mandate(u.id, 'dispatch')
  );
$$;
-- The first branch has no join to arrears, entitlements, subscriptions, or reserves —
-- structurally, not by policy. `habitability-floor-lint` asserts it stays that way.

-- ── §II.5.4: three-key repair release ──────────────────────────────────────
create or replace function public.repair_release_permitted(p_ticket uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from repair_completions c
             where c.ticket_id = p_ticket and c.key_kind = 'contractor_bundle')
    and exists (select 1 from repair_completions c
                 where c.ticket_id = p_ticket
                   and c.key_kind in ('tenant_confirmation','independent_verification'))
    and not exists (select 1 from repair_holds h
                     where h.ticket_id = p_ticket
                       and h.voided_at is null and h.released_at is null);
$$;

-- ── I-23: delinquency reads the AUTHORIZATION timestamp, never the rail state ──
create or replace function public.tenancy_arrears_cents(p_tenancy uuid, p_as_of date)
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(
           case when kind = 'rent_charge'  then  usd_cents
                when kind = 'rent_payment' then -usd_cents
                when kind = 'abatement'    then -usd_cents
                else 0 end), 0)
    from trust_ledger_entries
   where tenancy_id = p_tenancy
     and kind in ('rent_charge','rent_payment','abatement')
     -- fee_charge / fee_payment are DELIBERATELY EXCLUDED (§II.6.6, G7-15):
     -- a fee balance can never become a rent delinquency.
     and coalesce(authorized_at, posted_at) <= p_as_of;
$$;
```

## III.3 Group 7 RLS Policies — `0047_group7_rls.sql`

```sql
-- documents: engagement or tenancy membership, NEVER a group string (G7-27) ------
drop policy if exists "documents_privilege_scoped_v3" on documents;
create policy "documents_privilege_scoped_v4" on documents for select
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
      or exists (select 1 from tenancies t where t.id = documents.tenancy_id       -- ← G7
                  and is_tenancy_party(t.id, 'documents'))
      or exists (select 1 from tenancies t join units u on u.id = t.unit_id
                  where t.id = documents.tenancy_id and has_unit_mandate(u.id, 'lease'))
      or current_user_role_group() = 'admin'
    ) else
      may_read_privileged(documents.matter_id, documents.privilege_holder_id)
    end
    and documents.tombstoned_at is null
  );
-- `current_user_role_group()` values 'property_manager' and 'tenant' NEVER appear.

-- engagements / seats ----------------------------------------------------
alter table management_engagements enable row level security;
create policy "me_firm_or_owner_select" on management_engagements for select
  using (
    exists (select 1 from me_seats s where s.management_firm_id = management_engagements.management_firm_id
             and s.user_id = auth.uid() and s.status = 'active')
    or has_property_capacity(management_engagements.property_id, null, 'V3')   -- the OWNER
    or current_user_role_group() = 'admin'
  );
-- Only the granting owner may create or terminate an engagement (G7-28).
create policy "me_owner_write" on management_engagements for all
  using (has_property_capacity(management_engagements.property_id, null, 'V3'))
  with check (
    has_property_capacity(management_engagements.property_id, null, 'V3')
    and exists (select 1 from property_role_bindings b
                 where b.id = management_engagements.granted_by_binding_id
                   and b.user_id = auth.uid() and b.status = 'active'
                   and b.verification_tier = 'V3')
  );

-- tenancies --------------------------------------------------------------
alter table tenancies enable row level security;
create policy "tenancy_party_or_mandate_select" on tenancies for select
  using (
    is_tenancy_party(tenancies.id)
    or has_unit_mandate(tenancies.unit_id, 'lease')
    or exists (select 1 from units u where u.id = tenancies.unit_id
                and has_property_capacity(u.property_id, null, 'V3'))     -- the OWNER
    or current_user_role_group() = 'admin'
  );

alter table tenancy_parties enable row level security;
create policy "tp_self_or_leaseholder_select" on tenancy_parties for select
  using (
    user_id = auth.uid()
    or is_tenancy_party(tenancy_id, null, 'leaseholder')
    or exists (select 1 from tenancies t where t.id = tenancy_parties.tenancy_id
                and has_unit_mandate(t.unit_id, 'lease'))
    or current_user_role_group() = 'admin'
  );
-- G7-29: bifurcation. A leaseholder may end another party's row unilaterally where a
-- safety state is active; the removed party's session and retrieval purge immediately.
create policy "tp_bifurcation_update" on tenancy_parties for update
  using (
    is_tenancy_party(tenancy_id, null, 'leaseholder')
    and exists (select 1 from tenancy_safety_states s
                 where s.tenancy_id = tenancy_parties.tenancy_id and s.deactivated_at is null)
  )
  with check (status in ('ended','revoked'));

-- Class-T: NO ADMIN BRANCH (§II.11.1, the G4 privileged-row rule) ---------
alter table income_attestations enable row level security;
create policy "income_attestation_applicant_select" on income_attestations for select
  using (applicant_id = auth.uid());
-- A manager NEVER reads an attestation row directly; the application surface exposes
-- the amount and confidence only, through an API view under §II.4.6.

alter table screening_reports enable row level security;
create policy "sr_applicant_select" on screening_reports for select
  using (applicant_id = auth.uid());
create policy "sr_granted_firm_select" on screening_reports for select
  using (exists (
    select 1 from screening_grants g
     where g.screening_report_id = screening_reports.id
       and g.revoked_at is null and g.expires_at > now()
       and exists (select 1 from me_seats s
                    where s.management_firm_id = g.management_firm_id
                      and s.user_id = auth.uid() and s.status = 'active'
                      and s.seat_role in ('principal','manager','leasing_agent'))
  ));
-- Revocation or expiry ends the read in the same statement that ends the grant.

alter table tenancy_safety_states enable row level security;
create policy "tss_tenant_only" on tenancy_safety_states for all
  using (is_tenancy_party(tenancy_safety_states.tenancy_id))
  with check (is_tenancy_party(tenancy_safety_states.tenancy_id));
-- Not the manager. Not the owner. Not admin. Break-glass only, with a tenant-visible event.

-- I-24: the shielded log. Readable by the tenant and by the Group 8 supervisory role only.
alter table protected_acts enable row level security;
create policy "pa_self_select" on protected_acts for select
  using (user_id = auth.uid());
-- Deliberately NO manager policy and NO generic admin policy. The §II.7.5 monitor runs
-- as a dedicated supervisory role whose output is aggregate.

-- trust ledgers ----------------------------------------------------------
alter table trust_ledger_entries enable row level security;
create policy "tle_scoped_select" on trust_ledger_entries for select
  using (
    (trust_ledger_entries.tenancy_id is not null
      and is_tenancy_party(trust_ledger_entries.tenancy_id, 'ledger'))
    or (trust_ledger_entries.unit_id is not null
      and has_unit_mandate(trust_ledger_entries.unit_id, 'collect', null))
    or exists (select 1 from units u where u.id = trust_ledger_entries.unit_id
                and has_property_capacity(u.property_id, null, 'V3'))      -- the OWNER
    or current_user_role_group() = 'admin'
  );
-- I-26 is enforced by REVOKE + assert_not_billing_actor() + trust-corpus-lint, not here.

alter table deposits enable row level security;
create policy "deposit_scoped_select" on deposits for select
  using (
    is_tenancy_party(deposits.tenancy_id, 'ledger')
    or exists (select 1 from tenancies t where t.id = deposits.tenancy_id
                and has_unit_mandate(t.unit_id, 'collect'))
    or current_user_role_group() = 'admin'
  );

-- habitability -----------------------------------------------------------
alter table habitability_tickets enable row level security;
create policy "ht_scoped_select" on habitability_tickets for select
  using (
    (habitability_tickets.tenancy_id is not null
      and is_occupancy_party(habitability_tickets.tenancy_id))
    or has_unit_mandate(habitability_tickets.unit_id, 'dispatch')
    or exists (select 1 from units u where u.id = habitability_tickets.unit_id
                and has_property_capacity(u.property_id, null, 'V3'))      -- the OWNER
    or exists (select 1 from work_packages w
                where w.id = habitability_tickets.work_package_id
                  and is_work_package_party(w.id, 'scope'))                -- the VENDOR
    or current_user_role_group() = 'admin'
  );
-- The vendor reaches the TICKET's scope. §II.5.6's field allowlist governs what the
-- job card carries; a vendor never reaches the tenancy, the ledger, or any Class-T row.

create policy "ht_tenant_insert" on habitability_tickets for insert
  with check (is_occupancy_party(tenancy_id) or has_unit_mandate(unit_id, 'dispatch'));

alter table entry_records enable row level security;
create policy "entry_tenant_and_mandate_select" on entry_records for select
  using (
    is_occupancy_party(entry_records.tenancy_id)
    or exists (select 1 from tenancies t where t.id = entry_records.tenancy_id
                and has_unit_mandate(t.unit_id, 'dispatch'))
    or current_user_role_group() = 'admin'
  );
-- A guarantor is excluded by is_occupancy_party(). A former_party is excluded by
-- tenancy_parties.status.
```

## III.4 Guard Triggers

```sql
-- I-22: the Access Floor, asserted in the database as well as in CI.
create or replace function public.assert_no_access_control()
returns trigger language plpgsql as $$
begin
  raise exception 'I-22: dwelling access, utility, and amenity control are not
    representable in this system. See MasterBlueprint_Group_7 §II.7.1.';
end $$;
-- Applied to any table a future migration attempts to create with an access-control
-- shape. `access-floor-lint` is the primary control; this is the backstop.

-- I-25: auto-deny is unreachable.
create or replace function public.guard_application_disposition()
returns trigger language plpgsql as $$
begin
  if new.disposition in ('declined','approved_with_conditions','waitlisted') then
    if new.decided_by is null or current_setting('app.actor_class', true) = 'service' then
      raise exception 'I-25: an adverse or conditional disposition requires a named
        human decision-maker. Automated denial is prohibited.';
    end if;
    if not exists (select 1 from adverse_action_notices a where a.application_id = new.id) then
      raise exception 'I-25: a §II.4.5 adverse action notice must exist before the
        disposition is persisted.';
    end if;
  end if;
  return new;
end $$;
create trigger app_disposition_guard before update on applications
  for each row when (new.disposition is distinct from old.disposition)
  execute function guard_application_disposition();

-- I-26: no fee or platform revenue may debit a corpus.
create or replace function public.guard_trust_debit()
returns trigger language plpgsql as $$
begin
  if new.kind in ('fee_charge','fee_payment')
     and new.corpus in ('rent','deposit','reserve') then
    raise exception 'I-26: platform and management fees are invoiced against the
      beneficiary account. They are never debited from a trust corpus.';
  end if;
  if current_setting('app.actor_class', true) = 'billing' then
    raise exception 'I-2: the billing role holds no grant on trust ledgers.';
  end if;
  return new;
end $$;
create trigger trust_debit_guard before insert on trust_ledger_entries
  for each row execute function guard_trust_debit();

-- G7-13: surrender starts the statutory deposit clock without anyone's act.
create or replace function public.on_tenancy_surrender()
returns trigger language plpgsql as $$
begin
  if new.state = 'surrendered' and old.state is distinct from 'surrendered' then
    update deposits
       set itemization_due_at = new.surrendered_at
           + (select (rules->>'deposit_itemization_days')::int
                from jurisdiction_rule_packs p
                join units u on u.id = new.unit_id
               where p.jurisdiction = u.jurisdiction) * interval '1 day'
     where tenancy_id = new.id;
  end if;
  return new;
end $$;
create trigger tenancy_surrender_clock after update on tenancies
  for each row execute function on_tenancy_surrender();
```

## III.5 Manifest Functions

```sql
-- The manager tree (§II.3.2). Engagement-scoped; credential gates are EXCLUSIONS.
create or replace function public.portfolio_manifest()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  select jsonb_agg(node order by node->>'label') into result
    from (
      select jsonb_build_object(
        'kind','property',
        'engagementId', e.id,
        'propertyId', e.property_id,
        'label', p.address_line,
        'scope', e.scope,
        'subtabs', (
          select jsonb_agg(t) from unnest(array[
            'units_tenancies',
            case when 'lease'    = any(e.scope) then 'applications' end,
            case when 'dispatch' = any(e.scope) then 'habitability' end,
            case when 'dispatch' = any(e.scope) then 'dispatch' end,
            case when 'collect'  = any(e.scope) and e.trust_account_id is not null
                 then 'rent_trust' end,
            case when 'collect'  = any(e.scope) and e.trust_account_id is not null
                 then 'deposit_trust' end,
            case when 'disburse' = any(e.scope) then 'reserve' end,
            'owner_reporting','compliance'
          ]) t where t is not null)
      ) as node
        from management_engagements e
        join properties p on p.id = e.property_id
       where e.terminated_at is null
         and exists (select 1 from me_seats s
                      where s.management_firm_id = e.management_firm_id
                        and s.user_id = auth.uid() and s.status = 'active')
    ) nodes;
  return coalesce(result, '[]'::jsonb);
end $$;

-- The tenant tree (§II.3.3). NEVER consults management_engagements — that is the
-- G7-20 fix expressed at the manifest layer.
create or replace function public.tenancy_manifest()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  select jsonb_agg(node) into result
    from (
      select jsonb_build_object(
        'kind', case when t.state in ('closed','archived') then 'former_tenancy'
                     else 'tenancy' end,
        'tenancyId', t.id,
        'label', u.label || ' · ' || p.address_line,
        'class', t.class,
        'role', tp.role,
        'subtabs', (
          select jsonb_agg(x) from unnest(array[
            'my_home',
            case when tp.role <> 'guarantor' then 'repairs' end,
            case when tp.role <> 'guarantor' then 'entry_log' end,
            case when tp.role in ('leaseholder','co_leaseholder','guarantor')
                 then 'rent_receipts' end,
            case when tp.role in ('leaseholder','co_leaseholder') then 'deposit' end,
            'get_help','my_records',
            case when exists (select 1 from tenancy_safety_states s
                               where s.tenancy_id = t.id and s.deactivated_at is null)
                 then 'safety' end
          ]) x where x is not null)
      ) as node
        from tenancy_parties tp
        join tenancies t on t.id = tp.tenancy_id
        join units u on u.id = t.unit_id
        join properties p on p.id = u.property_id
       where tp.user_id = auth.uid()
         and tp.status in ('active','ended')     -- ended → read-only former record
    ) nodes;
  return coalesce(result, '[]'::jsonb);
end $$;
```

## III.6 API Contracts

### `POST /api/engagements`
Creates a management engagement. **Guards:** caller holds a Group 1 V3 binding on `property_id`; the firm is M2 with an active licence in the unit jurisdiction where `collect` or `lease` is requested; a verified `trust_account_id` where `collect` or `disburse` is requested; `habitability_sla_accepted_at` present. **409** on an overlapping active engagement for the same units. **Returns** `{ engagementId, scope, effectiveUnits }`.

### `DELETE /api/engagements/:id`
Owner-only revocation. **Effects, in one transaction:** `terminated_at` set; every `me_seats` session invalidated for these units; Co-Pilot retrieval purged; open habitability clocks **continue** and reassign to the owner pending a successor; trust corpora **untouched**; `tenancies` and `tenancy_parties` **untouched**. **Returns** `{ terminatedAt, openClocks[], corpusBalances }`.

### `POST /api/screening-reports`
Applicant-initiated. **Guards:** caller is the applicant at T1. Orders the report through the reporting partner. **Returns** `{ reportId, validUntil }`. **Never callable by a manager.**

### `POST /api/screening-reports/:id/grants`
Applicant creates a scoped, expiring grant. **Guards:** caller owns the report; the unit has an active `lease`-scoped engagement (§II.4.8); a published policy covers the jurisdiction. **Returns** `{ grantId, expiresAt }`.

### `DELETE /api/screening-grants/:id`
Applicant revocation. Purges the grantee's copy in the same transaction. **Returns** `{ revokedAt, purged: true }`.

### `POST /api/applications/:id/disposition`
**Guards:** `assertUnitMandate(unitId, 'lease')`; seat in `{principal, manager, leasing_agent}`; **`decided_by` = the authenticated human**; every reason drawn from the pinned policy version. For `declined | approved_with_conditions | waitlisted`, an `adverse_action_notices` row is created **in the same transaction** — the `guard_application_disposition()` trigger rejects the update otherwise. **403 `AUTOMATED_DENIAL_PROHIBITED`** if the caller's actor class is `service` (I-25).

### `POST /api/screening-disputes`
Applicant-initiated from the file view. Marks the element disputed **immediately**, sets `due_at = now() + 30 days`, notifies every live grantee, and blocks reliance on the element while marked. **Returns** `{ disputeId, dueAt, granteesNotified }`.

### `POST /api/habitability-tickets`
**Guards:** `is_occupancy_party(tenancyId)` or `has_unit_mandate(unitId,'dispatch')`. Classification proposed from structured intake; `klass_asserted_by_tenant` set when the opener is an occupancy party. `clock_due_at` computed from the jurisdiction rule pack. **Never reads arrears, entitlements, or subscription state** (I-27). **Returns** `{ ticketId, klass, clockDueAt, escalationSchedule[] }`.

### `POST /api/habitability-tickets/:id/dispatch`
**Guards:** `habitability_dispatch_permitted(ticketId)`; Group 5 scope match (`dispatch_permitted()`); entry notice generated per §II.5.6. On `emergency`, runs the §II.5.7 ladder with the non-marketplace terminal. **403 is impossible on a habitability class for reasons of money** — the predicate has no path to one.

### `POST /api/habitability-tickets/:id/confirm`
The tenant's key. **Guards:** `is_occupancy_party`. Body: `{ confirmed: boolean, deficiency?: string }`. A deficiency escalates and settles the **undisputed portion** of the contractor's entitlement (§II.5.4). **Returns** `{ state, releasePermitted, undisputedSettledCents }`.

### `POST /api/repair-holds`
Manager hold. **Guards:** `has_unit_mandate(unitId,'disburse')`; `scope_item_ref` and `stated_deficiency` both required by check constraint. A hold with neither is **not persistable**. A hold older than the SLA without resolution is voided by cron and the payment proceeds to escalation (G3 §II.9.6 pattern). **Returns** `{ holdId, autoVoidAt }`.

### `POST /api/rent-payments`
**Guards:** `is_tenancy_party(tenancyId,'ledger')`. Executes Group 1 §II.7.2 **Phase 0 only** in the request path; writes `trust_ledger_entries.authorized_at = now()` and commits. **Returns** `202 { entryId, authorizedAt, status: 'paid_settling' }`. Every delinquency computation reads `authorized_at` (I-23). **No endpoint exists that can create a delinquency from a rail state.**

### `DELETE /api/autopay-authorizations/:id`
One action. Effective immediately for any transfer more than 3 business days out; cancels any nearer transfer where the rail permits and otherwise refunds. **Returns** `{ revokedAt, nextTransferCancelled }`.

### `POST /api/withholding-intents`
**Guards:** `is_tenancy_party(tenancyId,'ledger')`. Suspends the autopay pull, records the basis, links or opens the §II.5.3 clock, escrows into segregated custody, surfaces the jurisdiction's remedy facts and the legal-aid directory. Writes a `protected_acts` row (I-24). **Escrowed funds are releasable only on tenant instruction or a court order — the manager has no release path** (G4 §II.7.3, inherited).

### `POST /api/deposits/:id/itemization`
**Guards:** `has_unit_mandate(unitId,'collect')`; every deduction line carries dated photographic `evidence_ref`. Submitting after `itemization_due_at` applies the jurisdiction's consequence automatically. The undisputed portion releases on the clock **without this call** if it is never made. **Returns** `{ itemizedAt, undisputedReleasedAt, disputedCents }`.

### `POST /api/notices`
**Guards:** `has_unit_mandate(unitId,'notice')`; §II.7.3 generation gate — ground permitted for the jurisdiction and tenancy class, notice period ≥ statute for tenure, just-cause satisfied, regulated-renewal obligation satisfied, amount excludes non-rent charges where forbidden, **and no habitability ticket past its statutory clock is open on the unit**. Generated inside the G4 §II.11.1 boundary. **Delivered to the tenant's workspace at generation**, with the response clock and rights summary. **422 `NOTICE_BLOCKED`** with the specific failing gate.

### `POST /api/tenancy-safety-states`
**Guards:** `is_tenancy_party`. Activates §II.11.3: party removal, suppression, lock-change dispatch. **Creates no manager-visible record of the activation.** **Returns** `{ suppressed: true, partiesEnded[], lockChangeTicketId }`.

### `GET /api/tenancy-records/:tenancyId/export`
**Guards:** `is_tenancy_party` — including `former_party`, permanently. Produces the G4 §II.10 authenticable bundle. **Free. Never rate-limited by tier. Never gated on any manager state.** **Returns** a signed archive plus its manifest hash.

### `GET|POST /api/copilot` *(Group 7 context)*
Body carries `{ engagementId | tenancyId, unitId, epoch }` — identifiers only. Server re-checks the predicate and returns **403 without invoking the model** on failure. Class-T is excluded from every index. Hard server-side blocks by account class: no legal advice or instrument generation (G4 §II.11.2), no screening recommendation, no rent or increase recommendation (I-29), no eviction guidance, no characterization of a named resident.

## III.7 TypeScript Registry Deltas

```ts
// src/lib/rbac/roles.ts — app segments UNCHANGED, but the note is load-bearing.
prop_manager: ['property', 'escrow'],
prop_tenant:  ['property'],
// The tenant deliberately does NOT hold `escrow`. Every tenant payment, deposit, and
// withholding surface therefore lives under `property` and MUST NOT require the
// `escrow` segment — a tenant who cannot reach a payment route cannot pay rent.
// `segment-lint` asserts no route under a tenant surface requires `escrow`.

// src/lib/rbac/tenancy.ts — NEW.
export type MeScopeFacet = 'lease' | 'collect' | 'dispatch' | 'disburse' | 'notice';
export type MeSeatRole =
  | 'principal' | 'manager' | 'leasing_agent'
  | 'maintenance_coord' | 'bookkeeper' | 'read_only';
export type TenancyRole =
  | 'leaseholder' | 'co_leaseholder' | 'occupant'
  | 'guarantor' | 'authorized_agent' | 'former_party';
export type TenancyClass = 'residential' | 'commercial' | 'mixed_use' | 'short_term';
export type ConditionClass =
  | 'emergency' | 'habitability' | 'essential_service'
  | 'routine' | 'cosmetic' | 'tenant_caused';
export type ApplicationDisposition =
  | 'pending' | 'approved' | 'approved_with_conditions'
  | 'waitlisted' | 'declined' | 'withdrawn' | 'expired';

/** Mirrors has_unit_mandate(). Called BEFORE any manager-side side effect. */
export async function assertUnitMandate(
  supabase: SupabaseClient, unitId: string, facet?: MeScopeFacet, seat?: MeSeatRole,
): Promise<void>;

/** Mirrors is_tenancy_party(). Never consults engagement state. */
export async function assertTenancyParty(
  supabase: SupabaseClient, tenancyId: string, facet?: string, role?: TenancyRole,
): Promise<void>;

/** I-25. Throws AUTOMATED_DENIAL_PROHIBITED when the actor class is `service`. */
export async function assertHumanDecisionMaker(
  supabase: SupabaseClient, applicationId: string, disposition: ApplicationDisposition,
): Promise<void>;

/** I-27. Returns true for every habitability class WITHOUT reading any money state. */
export function habitabilityFloorApplies(klass: ConditionClass): boolean {
  return klass === 'emergency' || klass === 'habitability' || klass === 'essential_service';
}

/** I-23. The ONLY sanctioned delinquency computation. Reads authorized_at, never rail state. */
export async function tenancyArrearsCents(
  supabase: SupabaseClient, tenancyId: string, asOf: Date,
): Promise<number>;

/** I-26. Group 3 and Group 5 disbursement paths call this before touching a corpus. */
export async function assertNotTrustCorpus(ledgerAccountId: string): Promise<void>;

/** §II.11.1. Class-T reads declare their live purpose; the declaration is logged. */
export async function readClassT<T>(
  supabase: SupabaseClient, tenancyId: string, element: string, purpose: string,
): Promise<T>;
```

---
# PART IV — VERIFICATION

## IV.1 Cross-Tenancy & Cross-Portfolio Isolation Matrix

Actor is scoped to **Engagement A** or **Tenancy A**. Columns are what they may reach elsewhere and within their own scope.

| Actor | Tenancy B ledger | Tenancy B screening file | A's screening file | A's in-unit imagery | A's occupancy pattern | A's protected acts | A's DV state | G1 distress |
|---|---|---|---|---|---|---|---|---|
| `prop_manager` — `principal` on A | ❌ | ❌ | live purpose only | ticket-scoped | ❌ | ❌ **never** | ❌ **never** | ❌ **never** |
| `prop_manager` — `leasing_agent` on A | ❌ | ❌ | live purpose only | ❌ | ❌ | ❌ | ❌ | ❌ |
| `prop_manager` — `maintenance_coord` on A | ❌ | ❌ | ❌ | ticket-scoped | ❌ | ❌ | ❌ | ❌ |
| `prop_manager` — `bookkeeper` on A | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `prop_manager` on an unrelated engagement | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `prop_tenant` — leaseholder on A | ❌ | ❌ | ✅ **own, always** | ✅ **own, always** | ✅ own | ✅ **own** | ✅ **own** | ❌ |
| `prop_tenant` — occupant on A | ❌ | ❌ | ❌ | ✅ own submissions | ✅ own | ✅ own | ✅ own | ❌ |
| `prop_tenant` — **guarantor** on A | ❌ | ❌ | ❌ | ❌ **never** | ❌ **never** | ❌ | ❌ | ❌ |
| `prop_tenant` — **former_party** on A | ❌ | ❌ | historical only | historical only | ❌ **current** | own historical | ❌ | ❌ |
| Property **owner** (Group 1, V3) | ❌ | ❌ | ❌ **never** | ❌ **never** | ❌ | ❌ | ❌ | own |
| Lender (Group 3) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Vendor (Group 5) | ❌ | ❌ | ❌ | job-scoped, no retention | ❌ | ❌ | ❌ | ❌ |
| Broker (Group 9) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `admin` | break-glass | break-glass | break-glass | break-glass | break-glass | ❌ **no branch** | ❌ **no branch** | audited |

Four load-bearing rows. **The property owner never reaches their tenant's screening file or in-unit imagery** — the owner's interest is the unit's performance, not the resident's consumer file. **The guarantor never reaches occupancy data**, because financial exposure is not a right to know when someone is home. **`admin` has no branch at all on protected acts or DV state**, inheriting the Group 4 §II.1.2 privileged-row rule. And **no manager reaches anything on a tenancy outside their engagement**, which is the entire G7-27 fix.

## IV.2 Acceptance Criteria

**Screening, fair housing & applicant data**
- [ ] A firm cannot accept an application on a unit whose jurisdiction has no published `screening_policy`. *(G7-02.)*
- [ ] A policy with an empty `accepted_alternatives` array is rejected by check constraint. *(G7-02.)*
- [ ] A policy without a passing `bias_test_ref` cannot be published. *(G7-02, ISO 42001 A.5.2.)*
- [ ] Where an applicant holds a subsidy, the income ratio is computed on **the tenant's portion only**, and subsidy status appears in no input, feature, or log used for the decision. *(G7-02.)*
- [ ] `proxy-lint` returns zero hits for zip code, surname, national origin, familial status, disability, language, or subsidy status in any criterion or model feature.
- [ ] **An automated denial is impossible**: `guard_application_disposition()` rejects a `declined`, `approved_with_conditions`, or `waitlisted` transition with a null `decided_by` or a `service` actor class. *(I-25 — asserted by attempting one as the service role.)*
- [ ] A declined disposition without a committed `adverse_action_notices` row is rejected in the same transaction. *(I-25.)*
- [ ] All five dispositions are reachable, and `approved_with_conditions` and `waitlisted` carry structured conditions. *(G7-03.)*
- [ ] An application receiving no disposition inside the window auto-expires **and the fee refunds**. *(G7-03, G7-04.)*
- [ ] **No schema column, API field, or view can carry a merchant name, MCC, counterparty, or transaction-level amount.** *(`transaction-lint`. G7-05.)*
- [ ] An applicant reads their complete file including per-element source, and opens a dispute in one action. *(G7-01.)*
- [ ] A disputed element is marked immediately, every live grantee is notified, and the element cannot be relied on while marked. *(G7-01.)*
- [ ] A correction propagates to every grantee and **reopens any disposition that relied on the corrected element**. *(G7-01.)*
- [ ] Revoking a grant purges the grantee's copy in the same transaction. *(G7-07.)*
- [ ] Operational applicant data purges on the TTL; the retention subset exists only in `applicant_retention_seal`, which has **no grant to `authenticated`**. *(I-28 — asserted by a direct `supabase-js` select.)*
- [ ] The platform's net revenue per application is **zero** — asserted by reconciling fee receipts against partner cost. *(G7-04.)*
- [ ] A unit with no active `lease`-scoped engagement traceable to a V3 binding cannot accept an application or collect a fee. *(G7-04b, G7-28.)*

**Habitability & maintenance**
- [ ] `habitability_dispatch_permitted()` contains **no join, subquery, or setting read** touching arrears, entitlements, subscriptions, disputes, or reserve balance. *(I-27 — asserted by parsing the function body in CI.)*
- [ ] A habitability dispatch succeeds for a tenancy with maximum arrears, an open dispute, an active notice, a zero reserve, **and** a delinquent manager subscription — all five simultaneously. *(I-27.)*
- [ ] A tenant-asserted habitability classification cannot be downgraded without a stated basis, and the clock does not stop while a downgrade is contested. *(G7-09.)*
- [ ] The statutory clock is visible to the tenant, the manager, **and the owner**, and escalates automatically at 50% and 100% without anyone's consent. *(G7-09.)*
- [ ] **A repair payment cannot release on the contractor bundle alone** — `repair_release_permitted()` requires a second key. *(G7-08, the sixth application of Appendix B.)*
- [ ] Tenant non-response past the window settles the **undisputed portion** of the contractor's entitlement. *(G7-08.)*
- [ ] A `repair_holds` row without `scope_item_ref` and `stated_deficiency` is not persistable, and an unresolved hold auto-voids on the SLA. *(G7-08.)*
- [ ] `fee-neutrality-lint` returns zero: no fee constant is reachable from a maintenance-spend, NOI, reserve-balance, or ticket-closure value. *(§II.5.5.)*
- [ ] No manager-side surface renders an NOI figure from which repair spend has been subtracted. *(G7-09.)*
- [ ] An entry record without `notice_delivered_at` requires a typed `emergency_override_condition`; a checkbox override is not representable. *(G7-11.)*
- [ ] The vendor job card carries only the §II.5.6 allowlist — asserted by field-diffing the dispatch payload. *(`vendor-disclosure-lint`.)*
- [ ] In-unit imagery appears in no aggregate, export, owner report, lender data room, marketing surface, or training set. *(G7-11.)*
- [ ] An `emergency` ticket with zero vendor acceptances reaches the non-marketplace terminal, and the tenant's 911 / utility / code path is rendered at **t+0**. *(G7-10.)*
- [ ] No surface exposes a vendor's live position; availability is service-area polygon plus on-call window only. *(`worker-control-lint`. G7-10.)*

**Trust funds, deposits & the rail**
- [ ] `guard_trust_debit()` rejects any `fee_charge` or `fee_payment` against any corpus. *(I-26.)*
- [ ] `trust-corpus-lint` returns zero: no fee, subscription, or revenue code path holds a grant on, or can debit, a trust ledger. *(I-26.)*
- [ ] The sweep runs **owner-first**; a management fee exists only as an invoice or as a deduction carrying a recorded standing instruction, a pre-delivered itemized statement, and maker≠checker. *(G7-12, I-7.)*
- [ ] An over-cap deposit **cannot be collected** — rejected by check constraint. *(G7-13.)*
- [ ] `surrendered` sets `itemization_due_at` automatically; the undisputed portion releases **on the clock with no manager action**; a missed deadline applies the jurisdiction's consequence automatically. *(G7-13.)*
- [ ] A deposit deduction line without dated photographic `evidence_ref` is rejected.
- [ ] A deposit can never fund a reserve, a repair the owner owes, or an arrear absent the statutory process. *(G7-13.)*
- [ ] **No delinquency path reads an `escrow_intents` state.** `tenancy_arrears_cents()` reads `authorized_at`. *(`discharge-lint`. I-23.)*
- [ ] A tenant who authorizes on the 1st is not delinquent on the 5th when the intent is `broadcasting`, `failed`, or `needs_review`; no fee, notice, or report is generated. *(I-23 — asserted by driving each rail state.)*
- [ ] A settlement inside the ±2% band produces no tenant-side shortfall. *(G7-16.)*
- [ ] Autopay revocation is one action and takes effect for any transfer beyond the Reg E window. *(G7-14.)*
- [ ] No path makes autopay a condition of tenancy, a screening criterion, a fee differential, or a ranking input. *(G7-14.)*
- [ ] Withheld funds are releasable **only** on tenant instruction or a court order; no manager release path exists. *(G7-14, G4 §II.7.3.)*
- [ ] `rent-first-lint` returns zero: no allocation path debits rent before outstanding fees are exhausted. *(G7-15.)*
- [ ] A fee balance never appears in `tenancy_arrears_cents()`, in a non-payment notice, or in any bureau report. *(G7-15, G7-33.)*
- [ ] A partial payment generates no notice and voids a pending notice where the jurisdiction so provides. *(G7-15.)*
- [ ] `trust_ledger_entries` rejects UPDATE and DELETE; corrections exist only as typed correcting entries. *(G7-17.)*
- [ ] A free tenant payment method always exists, and no fee is charged on it. *(G7-18.)*

**The Access Floor, eviction & records**
- [ ] `access-floor-lint` returns zero, with **no allowlist**: no code path, integration, feature flag, or API surface can alter dwelling access, utility state, or amenity entitlement as a function of payment, dispute, or account status. *(I-22.)*
- [ ] No manager-callable endpoint can revoke, suspend, or degrade a tenant account. *(I-22, G7-20 — asserted by enumerating every manager-scoped mutation.)*
- [ ] Notice generation is **blocked** on: an impermissible ground, a short notice period, an unsatisfied just-cause requirement, an unsatisfied regulated-renewal obligation, non-rent charges pursued as rent, **or an open habitability ticket past its statutory clock**. *(G7-26, §II.7.3.)*
- [ ] Every generated notice appears in the tenant's workspace at generation, with the response clock and rights summary. *(§II.7.2.)*
- [ ] **No surface, model, export, or endpoint produces an eviction-risk, resident-risk, or tenant score.** *(`eviction-score-lint`. §II.11.5.)*
- [ ] `protected_acts` is unreachable from every ranking, screening, renewal, pricing, and dispatch role — asserted by attempting the read as each. *(`retaliation-lint`. I-24.)*
- [ ] A tenant's code-enforcement referral generates no advance manager notification. *(I-24.)*
- [ ] The confidential assistance path (§II.7.4 Option B) creates **no** manager-visible record — asserted by diffing the manager's full read surface before and after. *(G7-22.)*
- [ ] A tenancy record export succeeds for a `former_party` years after `closed`, for free, with the manager's subscription lapsed and the engagement revoked. *(G7-20, G7-31.)*
- [ ] Engagement revocation leaves `tenancies`, `tenancy_parties`, trust corpora, and open clocks untouched, and severs manager access in the same transaction. *(G7-28, §II.8.2.)*
- [ ] `tenancy_manifest()` contains no reference to `management_engagements`. *(G7-20 — asserted by parsing the function body.)*

**RBAC, data plane & safety**
- [ ] `grep -rn "current_user_role_group" supabase/migrations/` returns **zero** hits containing `'property_manager'` or `'tenant'`. *(I-1, CI-enforced. G7-27.)*
- [ ] A `prop_manager` on engagement A cannot read any row of tenancy B via direct `supabase-js` query — ledgers, tickets, documents, tenancies, or parties. *(G7-27.)*
- [ ] A `prop_tenant` cannot read any neighbour's tenancy, ledger, ticket, or occupancy state. *(G7-27.)*
- [ ] A `bookkeeper` seat reaches no application and no Class-T element; a `maintenance_coord` reaches no ledger. *(§II.9.3.)*
- [ ] A seat's effective scope is the **intersection** of engagement scope and seat role — asserted by granting a wide seat on a narrow engagement. *(G3 I-5, inherited.)*
- [ ] `income_attestations` and `screening_reports` have **no admin policy**; a break-glass read writes a tenant-visible access event. *(§II.11.1.)*
- [ ] Safety-state activation ends the named party's row, invalidates their sessions, purges their retrieval, and suppresses the unit from every map, aggregate, export, listing, and Group 9 feed — in one transaction. *(G7-29.)*
- [ ] Victim status appears in no screening, renewal, pricing, ranking, dispatch, or notice input. *(G7-29, `proxy-lint`.)*
- [ ] The manager map renders habitability tickets aggregated to the building above a k-floor, and no per-unit hotspot layer exists. *(§II.11.4, I-24.)*
- [ ] The Co-Pilot has no cross-tenancy retrieval and no Class-T index — asserted by an adversarial recall prompt naming another resident. *(§II.3.5.)*
- [ ] No Stripe event mutates engagements, tenancies, party rows, trust ledgers, applications, or screening reports. *(I-2 webhook fuzz.)*

**Monetization & market data**
- [ ] `rent-recommendation-lint` returns zero: no surface emits a price, increase amount, or ranking for a specific unit, and no ingestion path carries non-public competitor lease terms. *(I-29, G7-30.)*
- [ ] The regional index renders nothing below the k-anonymity floor and produces distributions only. *(G7-30.)*
- [ ] The index does not render on a `rent_stabilized` or `rent_controlled` tenancy's pricing surface. *(G7-25.)*
- [ ] A contract rent above `legal_regulated_rent_cents` on a regulated tenancy is **rejected by check constraint**, not warned about. *(G7-25.)*
- [ ] A missing or lapsed `registration_ref` blocks the increase surface entirely. *(G7-25.)*
- [ ] `distress-revenue-lint` returns zero: no revenue path is reachable from a delinquency, notice, denial, forfeiture, or eviction event. *(§II.13.3.)*
- [ ] Late fees accrue to the owner; the platform books zero. *(§II.13.3.)*
- [ ] `getAllowedApps('prop_tenant')` is `['property']`, and **no tenant route requires the `escrow` segment**. *(`segment-lint`. §III.7.)*
- [ ] The tenant tier carries **no entitlement key**; no code path can provision, downgrade, or revoke it. *(§II.13.2 — asserted by grepping the entitlement registry.)*
- [ ] A manager subscription lapse blocks new listings and new applications and touches nothing else in §II.13.6's list. *(G7-31.)*
- [ ] Negative bureau reporting is blocked on any disputed amount, any amount under an open habitability escalation, and any fee sub-ledger balance. *(G7-33.)*

## IV.3 CI Guardrails

Groups 1–6 guardrails are inherited unchanged. Group 7 adds:

```
policy-lint          — extended: ZERO occurrences of 'property_manager' or 'tenant'
                       inside current_user_role_group() predicates (I-1)
access-floor-lint    — fails if ANY code path, integration, feature flag, or API surface
                       can alter dwelling access, utility state, or amenity entitlement
                       as a function of payment, dispute, or account status.
                       NO ALLOWLIST. This lint cannot be suppressed. (I-22)
habitability-floor-lint — fails if any habitability dispatch path reads arrears,
                       entitlements, subscription state, dispute state, or reserve
                       balance as a precondition (I-27)
discharge-lint       — fails if any delinquency, fee, notice, or reporting path reads an
                       escrow_intent state rather than authorized_at (I-23)
trust-corpus-lint    — fails if any fee, subscription, or revenue path holds a grant on,
                       or can debit, a trust ledger (I-26)
rent-first-lint      — fails on any allocation path that debits rent before outstanding
                       fees are exhausted, or that lets a fee balance enter an arrears
                       computation (G7-15)
retaliation-lint     — extended from G5 I-15: fails if any ranking, screening, renewal,
                       pricing, priority, or dispatch path can reach protected_acts,
                       withholding_intents, code_referrals, or hardship records (I-24)
auto-deny-lint       — fails if any service-role or scheduled path can write an adverse
                       or conditional application disposition (I-25)
transaction-lint     — fails if any schema column, API field, view, or log line can carry
                       a merchant name, MCC, counterparty, or transaction-level amount
                       (G7-05)
proxy-lint           — fails on any screening criterion or model feature referencing zip
                       code, surname, national origin, familial status, disability,
                       language, subsidy status, or victim status (G7-02, G7-29)
vendor-disclosure-lint — fails if a dispatch payload carries any field outside the
                       §II.5.6 allowlist (G7-11)
fee-neutrality-lint  — fails if any fee constant is reachable from a maintenance-spend,
                       NOI, reserve-balance, or ticket-closure value (§II.5.5)
rent-recommendation-lint — fails on any surface emitting a price, increase, or ranking for
                       a specific unit, and on any ingestion path carrying non-public
                       competitor lease terms (I-29)
eviction-score-lint  — fails on any eviction-risk, resident-risk, or tenant score,
                       model, export, or endpoint (§II.11.5)
distress-revenue-lint — fails on any revenue path reachable from a delinquency, notice,
                       denial, forfeiture, or eviction event (§II.13.3)
worker-control-lint  — extended from G5 §II.11: fails on any live-position, continuous
                       tracking, or acceptance-rate ranking surface in Group 7 dispatch
segment-lint         — fails if any tenant-reachable route requires the `escrow` app
                       segment (§III.7)
score-lint           — extended: fails on any parcel- or unit-level opportunity,
                       turnover-likelihood, or resident-quality score (§II.11.5)
```

## IV.4 Telemetry

**Screening funnel and fairness:** `search → policy viewed → self-assessment → application → disposition`. Drop-off at the policy-view step is the honest signal that a policy is exclusionary and is monitored per firm. Outcome rates by geography and proxy, per policy version, per firm, against the reference distribution — **drift beyond tolerance suspends the policy version automatically**. Adverse-action delivery rate must be 100% of adverse dispositions; anything below is a defect, not a metric. Dispute rate, reinvestigation latency against the 30-day duty, correction rate, and **disposition-reopen rate after correction** (the direct G7-01 harm signal). Fee-refund completion rate on expired windows.

**Habitability integrity — the group's most important dashboard:** clock adherence by class, by firm, by jurisdiction; **time from tenant-asserted habitability to dispatch** (the direct G7-09 signal); downgrade-proposal rate per firm and downgrade-contest rate (a firm that downgrades often is reclassifying its way out of statutory clocks); escalation rate at 50% and 100%; **code-referral rate per firm**, which the firm never sees; repair-completion key composition (a firm whose completions run overwhelmingly on `independent_verification` rather than `tenant_confirmation` is routing around the tenant's key); hold rate, void-hold rate, and hold duration per firm (the G3 §II.9.6 pattern); emergency dispatch acceptance latency and non-marketplace-terminal invocation rate.

**Trust integrity:** daily corpus reconciliation with break count and break age; sweep latency and owner-first ordering assertions; deposit itemization timeliness against the statutory clock, and **missed-deadline consequence application rate**; undisputed auto-release rate; any corpus debit attempt (each one pages — I-26 should produce zero, so any nonzero is an incident).

**Consumer-protection integrity:** autopay revocation latency; withholding-intent volume and the habitability clock state at declaration; rail-state-to-delinquency attempts (should be structurally zero — `discharge-lint` should make this unobservable, so any occurrence is a lint escape); partial-payment handling; fee-to-rent conversion attempts.

**Retaliation and safety:** adverse actions falling inside a jurisdiction's presumption window, per firm, against that firm's own baseline and the population; safety-state activation volume and suppression completeness; **any read attempt against `protected_acts` from a non-permitted role** (pages immediately); break-glass Class-T reads with tenant notification confirmation.

**Deliberately not collected:** any eviction-risk, resident-risk, or tenant score; any cross-applicant or cross-tenant behavioural ranking; any raw transaction datum; any unit-level rent recommendation or its adoption rate; any occupancy-presence inference; any correlation product between a protected act and an outcome outside the §II.7.5 supervisory monitor.

---

# PART V — RESIDUAL RISK & BOARD / REGULATORY REVIEW QUEUE

## V.1 Accepted residual risks

| Risk | Why accepted | Compensating control |
|---|---|---|
| A manager who performs a lawful eviction | Lawful eviction is a real legal process the platform cannot and should not prevent | The Access Floor (I-22) bars every *unlawful* shortcut; §II.7.3 blocks defective notices at generation; the tenant sees every notice with its clock and their rights at the moment it is generated |
| A manager who retaliates in ways the platform cannot see (off-platform, or through inaction) | The platform cannot compel a firm's conduct or observe its silence | I-24 shields the record from every decisioning surface; the §II.7.5 monitor detects the observable pattern; presumption windows are surfaced to the tenant with legal-aid routing |
| A tenant who submits a false deficiency to delay a contractor's payment | Confirmation is a judgment, not a proof | The undisputed portion settles immediately (§II.5.4); non-response has a window; independent verification is a third key; deficiency patterns per tenancy are monitored, never rendered to the manager |
| A screening policy that is lawful, tested, and still exclusionary in effect | Disparate-impact analysis has a floor below which it cannot distinguish business necessity from pretext | Publication before collection, continuous outcome testing with automatic suspension on drift, mandatory `accepted_alternatives`, individualized assessment where the jurisdiction requires it, and a human on every adverse outcome |
| An applicant with no credit file and no documentable income | The platform cannot manufacture a qualification | `accepted_alternatives` is mandatory and includes guarantor, rent-history, benefit-award, and asset paths; no threshold may stand alone; refusal to bank-link is never itself a criterion |
| Off-platform side payments between a manager and a vendor | The platform cannot observe cash | Rotation on emergency and habitability dispatch, decline-reason recording, three-key completion, and hold-pattern monitoring make the on-platform path materially faster and the off-platform path visible by its absence |
| A jurisdiction whose rule pack is incomplete or stale at launch | Rule packs are a maintenance surface with real lag | A unit in a jurisdiction with no current rule pack **cannot accept applications, generate notices, or collect deposits** — the failure mode is refusal to operate, not operating wrongly |
| A commercial tenancy where the consumer protections do not apply and the parties are sophisticated | Correct as a matter of law | `tenancy_class` gates the entire rule pack; the residential subtabs do not render; the Access Floor (I-22) nonetheless applies to `mixed_use` and to any tenancy with a residential occupant |

## V.2 Blocking board and regulatory review items

Each is a build-blocker for its surface.

1. **Consumer reporting agency status and structure.** Whether the platform operates as a CRA or exclusively through a licensed partner; the contractual assignment of §II.4.5 obligations; state CRA registration where required; the applicant-held model's treatment under the consumer-initiated disclosure provisions. **Blocks:** all screening.
2. **Fair housing.** Approval of every default rule-pack criterion, the disparate-impact testing methodology and thresholds, the individualized-assessment protocol, and source-of-income compliance per launch market. **Blocks:** application acceptance.
3. **Automated decision-making in housing.** Whether §II.4.3's auto-approve-only posture satisfies the notice and human-review requirements in each launch jurisdiction, and whether the platform's role makes it a housing provider agent with direct FHA exposure. **Blocks:** auto-approval.
4. **Application fee caps and structure, per state and municipality.** Amount, itemization, refundability, who may lawfully bear the cost, and whether zero-margin pass-through changes the analysis. **Blocks:** fee collection per market.
5. **Property-management and brokerage licensure, per state.** Which of `lease`, `collect`, `disburse`, and `notice` are licensed activities; the exemptions; and whether the platform itself performs any of them. **Blocks:** engagement scopes and the §II.13.4 positioning.
6. **Trust accounting and money transmission.** Segregation, depository, and reconciliation rules per state; whether the platform's custody of rent, deposits, and withheld funds constitutes money transmission or requires licensure; the §II.6.2 owner-first waterfall's sufficiency. **Blocks:** `collect` and `disburse`.
7. **Security deposit statutes, per state.** Caps, depository, interest ownership and rate, notice content, itemization windows, the consequence of a missed deadline, and whether automated undisputed release satisfies the statute. **Blocks:** deposit custody.
8. **Regulation E and payment mechanics.** Authorization artifact sufficiency, stop-payment implementation, the prohibition on conditioning, and whether discharge-on-authorization (I-23) is sound as against the landlord's contractual right. **Blocks:** autopay.
9. **Non-waivable tenant remedies.** Whether the §II.6.5 withholding flow, the segregated custody, and the release restriction correctly implement withholding and repair-and-deduct in each launch jurisdiction, and whether the platform incurs liability by facilitating them. **Blocks:** the withholding product.
10. **Habitability duty and platform exposure.** Whether operating the §II.5.3 clock, funding dispatch under §II.5.2, and holding the record creates a duty running from the platform to the resident, and whether that is acceptable. **Blocks:** the habitability product as specified.
11. **Emergency dispatch and reliance.** Whether the §II.5.7 ladder and the disclaimer are sufficient, and what duty attaches to the platform-arranged panel. **Blocks:** emergency dispatch.
12. **Antitrust.** Whether the §II.12.1 index — aggregation floor, contributor independence, temporal lag, distribution-only form, and the absence of any feedback loop — is defensible given the active enforcement posture on rent-setting algorithms. **Blocks:** the market index entirely.
13. **UPL.** Whether lease, notice, and forbearance generation for non-lawyer managers and the tenant-facing rights summaries stay inside the Group 4 §II.11.1 boundary. Shared with Group 4 item 1. **Blocks:** all instrument generation.
14. **FCRA furnisher and FDCPA.** Whether §II.13.5's opt-in positive-only default and the Group 3 §II.11.2 furnisher spine are sufficient, and confirmation that the platform's post-tenancy posture avoids collector status. **Blocks:** rent reporting.
15. **VAWA and state DV protections.** Whether §II.11.3's unilateral bifurcation, documentation handling, and suppression satisfy federal and state requirements, including the treatment of documentation the platform never shows the manager. **Blocks:** the safety product.
16. **Data protection.** The §II.4.6 attestation boundary under GLBA/Reg P and open-banking secondary-use rules; Class-T retention against state privacy statutes; the `applicant_retention_seal` design against the fair-housing retention duty and `TDPA_90_Day_Destruction`. **Blocks:** applicant data collection.
17. **Rent regulation, per market.** Legal regulated rent computation, preferential rent, renewal windows, succession, registration, and MCI/IAI — and whether the platform's blocking behaviour could itself create liability by refusing a lawful increase. **Blocks:** regulated-unit surfaces.
18. **In-unit imagery.** Consent, retention, and whether photographs of a dwelling interior held by a platform create obligations beyond the general privacy regime. **Blocks:** photographic ticketing.

## V.3 Cross-group items surfaced here, owned elsewhere

- **Group 1** must accept `management_engagements` as a grant emanating from a V3 binding, render the §II.5.3 habitability clock and the §II.8.3 escalation state in the owner workspace, and log manager and vendor access into the Exposure & Privacy access log (Appendix A rows A60, A63).
- **Group 3** must consume only the **de-identified aggregate** rent roll of §II.11.2 for DSCR, and must never treat an individual tenancy's arrears as a facility datum (A66).
- **Group 4** receives: habitability escalations as matters, deposit and abatement disputes on the fast track, notice generation inside its §II.11.1 boundary, and post-tenancy balance questions. Its §II.5.3 neutral-selection protocol governs every Group 7 dispute (A64).
- **Group 5** must accept occupied-dwelling packages carrying the §II.5.6 entry protocol and the minimum-necessary field allowlist, must supply the §II.6.2 provenance bundle for repair completion, and must accept that the tenant holds a completion key its draft did not contemplate (A62, A65).
- **Group 6** interacts only through renovation scope on vacant or noticed units; it receives no occupancy or Class-T datum (A67).
- **Group 8** must supply: licence-board and CRA-partner integrations, jurisdiction rule-pack maintenance as an operational function with an SLA, the §II.7.5 supervisory monitor as a dedicated role, the break-glass audit path with tenant notification, and the emergency-panel contracting in §II.5.7.
- **Group 9** must adopt the §II.13.4 positioning rule and the A69 boundary before its own audit, and must accept that it receives **nothing** about a sitting tenant.

---

# APPENDIX A — BOUNDARY CONTRACT WITH GROUPS 1–6, AND THE FORWARD RULE FOR GROUP 9

Extends the Group 2, 3, 4, 5, and 6 boundary tables. Rows A60 onward.

| # | Contested surface | Prior position | Group 7 draft position | **Resolution** |
|---|---|---|---|---|
| A60 | Source of a manager's authority | G1 §II.1: authority derives from a granted, verified, revocable binding | Role string possession | **G1 governs, extended.** `management_engagements` emanate from a V3 `property_role_bindings` row, are unit-scoped, termed, and owner-revocable (§II.1.2). |
| A61 | Who verifies a completed repair | G3 §II.9.2, G5 §II.6.3, G6 §II.5.5 all sever verification from the interested party | The manager verifies and releases | **Sixth application of Appendix B.** Three keys: contractor bundle + tenant confirmation (or window expiry or independent verification) + manager release under mandate (§II.5.4). |
| A62 | Entry into an occupied dwelling | G5 §II.1.4 established occupied-dwelling packages | Dispatch with no entry protocol | **G5 extended.** Statutory notice, tenant-selected windows, vendor identity card, minimum-necessary field allowlist, tenant-visible entry record (§II.5.6). |
| A63 | Owner visibility of tenant data | G1 §II.4.1 gives owners their parcel in full | Owner sweeps and NOI reporting, scope unstated | **Bounded.** The owner receives unit performance, arrears status, clock adherence, and compliance posture. **Never** the resident's screening file, income attestation, bank-derived data, ID, in-unit imagery, household composition, DV state, or protected acts (§II.11.2). |
| A64 | Dispute resolution for a tenant | G4 §II.5.3 neutral selection; G4 §II.12.2 zero net revenue from outcomes | Escalation terminates at the manager | **G4 governs.** The §II.8.3 ladder routes to a G4 `neutral` with compensation fixed at appointment, and to public agencies and legal aid unilaterally (I-24). |
| A65 | Contractor payment during a tenant–manager dispute | G5 I-13: no compliance state freezes funds earned for completed, verified work | Automatic release on manager verification | **G5 governs, both directions.** The contractor's entitlement attaches to evidenced work; a manager hold requires a cited item or is void; a tenant deficiency settles the undisputed portion immediately (§II.5.4). |
| A66 | Rent roll into lender underwriting | G3 §II.5 sizes facilities on verified inputs | "Live Rent Roll" with unstated scope | **De-identified and aggregated only.** Unit count, occupancy, contract-rent distribution, aggregate arrears. No individual tenant, name, ledger, or arrears attribution (§II.11.2). |
| A67 | Design and renovation on occupied stock | G6 §II.1 design packages | Not addressed | **Scoped.** Group 6 receives unit configuration for vacant or noticed units. No occupancy, tenancy, or Class-T datum crosses (§II.11.2). |
| A68 | Parcel- and unit-level scoring | G1 §II.5.3 #5; G2 A1; G3 A19; G4 A32; G6 A54 | "Maintenance hotspots"; implied resident risk | **Sixth application of the same rule.** Habitability aggregates to the building above a k-floor; no per-unit hotspot layer; **no eviction, resident, or tenant score at any tier, ever** (§II.11.4, §II.11.5). |
| A69 | Brokerage and the "anti-broker" claim | G9 draft sells `broker_leasing` a placement product; G1 §II.8.3 forbids transaction-contingent referral fees | *"Execute leases without paying broker fees"* | **Withdrawn and replaced.** Group 7 offers **direct leasing where the manager is licensed to perform it**, never a claim that brokerage is unnecessary. `broker_leasing` participates through a scoped engagement facet or an owner-granted listing mandate. **This row is binding on the Group 9 audit** (§II.13.4). |
| A70 | Market pricing data | G5 §II.9.3 established the antitrust-safe regional index after G5-10 withdrew the demand map | "Market rent benchmarks" across managers | **Second application of the same rule, constrained harder.** Distribution-only, k-floored, lagged, no non-public competitor lease data, **no unit-level price or recommendation of any kind** (I-29, §II.12.1). |
| A71 | Trust-priority ordering | G5 I-14: prime margin never routes ahead of a trust-priority claimant | Management fee deducted before the owner sweep | **Same invariant, second domain.** Collect → trust → **owner sweep** → fee invoiced (I-26, §II.6.2). |
| A72 | Consumer obligations denominated in a token | G1 §II.7.1 #4 and #5; G1 §II.7.6 ±2% band | *"Smart contract automatically executes the $SHQL rent transfer"* | **G1 governs, and is extended.** USD obligation, custodial by default, no key whose loss costs a home — plus **discharge at authorization** (I-23), because a stalled draw costs a delay and a stalled rent payment costs a tenancy. |
| A73 | Model output in a consequential decision | G3 §II.7.3 (a model may block, never release); G4 §II.11.2; G6 A59 | Parametric auto-approval, denial unmodelled | **Same principle, housing-specific.** A model may inform a human; **a model may never decline** (I-25). Auto-approve is permitted because its failure mode is not exclusion. |

---

# APPENDIX B — THE INDEPENDENCE PATTERN: ONE PROBLEM, SOLVED SIX TIMES

Group 6's Appendix B predicted this instance by name. It arrived exactly as described.

**The pattern:** *a party whose judgment is supposed to protect someone else is selected, paid, or renewable by the party who benefits from a particular answer.*

| Group | The neutral | The defect as drafted | The resolution |
|---|---|---|---|
| **G3** §II.9.5 | Construction inspector | "The lender's designated inspector" — payer-selected | Rotation pool, project-funded escrow, paid regardless of finding |
| **G4** §II.5.3 | Arbitrator | Platform selects; platform earns on the dispute | Party strike-and-rank; compensation fixed at appointment; zero net platform revenue from outcomes |
| **G4** §II.7.3 | Escrow holder | Liquidates on its own view of breach | No authority to determine breach at all |
| **G5** §II.6.3 | Delivery confirmer | The buyer's agent alone releases the seller's money | Counter-signature; the driver's attestation records regardless |
| **G6** §II.6.3 | Structural observer | Approval is "the deterministic key" to the payer's escrow | Project-funded observation escrow; **paid regardless of disposition**; the seal releases nothing |
| **G7** §II.5.4 | **Repair verifier** | **The manager dispatches, verifies, releases, holds the reserve, and earns more when the repair does not happen** | **Three keys, with the occupant holding one. Manager compensation made structurally indifferent to the repair. The habitability floor removes the outcome from the money entirely.** |

**The three-part resolution, generalized — and the fourth part Group 7 adds:**

1. **Sever selection.** The interested party does not choose the neutral. *(G7: rotation on emergency and habitability dispatch.)*
2. **Sever compensation from outcome.** The fee is fixed before the judgment and paid identically whatever it is. *(G7: §II.5.5 forbids every NOI-, reserve-, and closure-linked fee base.)*
3. **Sever the judgment from the money.** The neutral determines; a different party transfers. *(G7: the manager releases under an owner mandate; the tenant's key is a determination, not a disbursement.)*
4. **NEW — give the key to the party with the evidence.** In every prior instance the neutral was a professional inserted between two commercial parties. Here the best-informed party is the **occupant**, who was excluded because they are not the customer. Group 7's addition to the pattern: *when a non-customer holds the dispositive evidence, they hold a key — and the mechanism must be robust to their silence, their error, and their leverage.* That is why §II.5.4 has a window, an undisputed-portion settlement, and an independent third key.

**Prediction for Groups 8 and 9.** The pattern remains outstanding in: the admin who both verifies compliance and can release the payout it gates (G8); and the broker whose commission depends on a valuation, a placement, or a match they influence (G9) — in Group 9's draft it appears **three** times, as the automated commission split, the data-room access deposit the broker both sets and benefits from, and the HELOC referral bounty that Group 1 §II.8.3 has already deleted once. Applying the now four-part resolution pre-emptively will be cheaper than auditing it out.

---

# APPENDIX C — THE VULNERABLE-COUNTERPARTY FLOOR: ONE PRINCIPLE, THREE GROUPS

A second pattern has now appeared three times, and unlike the independence pattern it is not about neutrality. It is about **who in a transaction can least afford the platform being wrong**.

| Group | The vulnerable party | What they stand to lose | The floor |
|---|---|---|---|
| **G1** §II.4.3 | `owner_distressed` | Their home, through foreclosure | Shield tier: **$0 forever, no entitlement key**, no upsell affordance anywhere in the subtree, distress state is not a product at any tier, loss-mitigation fees are $0 |
| **G4** §II.9.1 | The loss-mitigation consumer | Their home, and their equity | Fees of $0 in any structure on escrowed principal; independence from the servicer; the Shield handoff |
| **G7** §II.13.2 | `prop_tenant` | Their home, through eviction — and their record | **$0 forever, no entitlement key**; no upsell in the subtree; the Access Floor (I-22); the Habitability Floor (I-27); records that survive the counterparty; anti-retaliation shielding (I-24); zero platform revenue from their distress |

**The generalized floor, stated once:**

1. **The vulnerable party's product is free, permanently, and carries no entitlement key** — so there is no surface through which it can be sold, mis-provisioned, downgraded, or lost to someone else's failed payment.
2. **No platform revenue line rises with their distress.** Not applications, denials, arrears, late fees, notices, forfeitures, or evictions.
3. **Their state is not a product.** No tier, in any group, exposes it; no score is computed from it; no ranking is derived from it.
4. **Their record survives the counterparty**, because the counterparty is the party with the incentive to make it disappear.
5. **Exercising a right is invisible to every decisioning surface** — the G5 I-15 rule, generalized from liens to tenant rights.

Groups 8 and 9 should be audited against this floor directly. Group 9's draft already fails point 3 with its *"Distress Interception"* tier, which Group 1 §II.8.4 withdrew once and which will need withdrawing again.

---

# APPENDIX D — Traceability to `rbac-audit-red-team.md`

| Prior finding | Status for Group 7 | Resolved at |
|---|---|---|
| VULN-01 `escrow/release` has no DB-layer role gate | **Directly aggravated by this group and closed here.** Rent, deposits, and reserves are trust corpora; `guard_trust_debit()`, the `assert_not_billing_actor()` trigger, and the REVOKE set mean no release path exists that is not scoped to an engagement facet with dual control above threshold | §III.1.3, §III.4 |
| VULN-02 `violations` readable by all investors globally | Same shape, higher stakes: the Group 7 analogue would be tenancy and arrears data readable by group string. Closed structurally — neither `property_manager` nor `tenant` appears in any Group 7 predicate | §III.3, I-1 |
| VULN-03 `properties_investor_discovery` exposes all properties | The Group 7 analogue is cross-portfolio tenant lookup, which does not exist: `has_unit_mandate()` is engagement-scoped and `is_tenancy_party()` is tenancy-scoped | §III.2 |
| VULN-04 `compliance_checks` has no INSERT policy | Group 7 supplies habitability clock adherence and licence standing as compliance inputs; **absence blocks** the affected surface rather than defaulting open | §II.2.1, §II.5.3 |
| VULN-05 attorneys read all agreements cross-tenant | Closed in Group 4. Group 7 adds no new cross-tenant document reach: `documents` is gated by tenancy party or unit mandate | §III.3 |
| VULN-07 proxy-signing on `PATCH /api/agreements` | Directly relevant: a manager must never sign, confirm, or authorize on a tenant's behalf. `POST /api/habitability-tickets/:id/confirm` requires `is_occupancy_party`, and no endpoint accepts a `party_user_id` override | §III.6 |
| VULN-08 `connections_update` self-accept | Same shape as the engagement grant: `me_owner_write` requires the caller to **be** the V3 binding holder named in `granted_by_binding_id`. A firm cannot grant itself an engagement | §III.3 |
| VULN-09 `milestone-upload` has no role check | Reinforced: repair-completion evidence requires the Group 5 provenance bundle bound to an identified crew member, and it releases nothing on its own — the tenant's key is separate | §II.5.4 |
| DESIGN-01 `parties[].role` free text | Resolved — `tenancy_parties(tenancy_id, user_id, tenancy_role)` and `me_seats(firm_id, user_id, me_seat_role)`, both enum-typed | §III.1.1 |
| DESIGN-02 `current_user_role()` strict enum | Unaffected — Group 7 adds no enum values (Appendix E item 7) |  |
| DESIGN-03 layout `ALLOWED_ROLES` sets | Resolved — layout gates are coarse routing; the boundaries are `has_unit_mandate()` and `is_tenancy_party()` | §II.1 |

---

# APPENDIX E — Required Deltas to `phase8-sub-role-expansion-plan.md`

1. **BLOCKING — T8.2 must be rewritten for the Group 7 policies.** The plan widens every affected policy to `current_user_role_group()` group checks. **Applying T8.2 as written ships G7-27**, which is the most severe instance of this defect in the corpus: every property manager reads every managed unit's rent roll, arrears, tenant identity, income attestations, and screening data across the entire platform, reachable by direct `supabase-js` query exactly as VULN-02 and VULN-03 established. Replace with `0047_group7_rls.sql` (§III.3). **This is a launch blocker, not a hardening item.**

2. **BLOCKING — the plan has no `units` table.** Group 7's entire model hangs off a unit-level object that does not exist in `0001_core_schema.sql`. `0043` introduces `units` as a child of `properties`, and every Group 7 policy, manifest, and rule-pack lookup keys off `units.jurisdiction`. Sequence it before any Group 7 task.

3. **T8.3 — `ROLE_APP_MAP` app segments are unchanged**, but §III.7's note is binding: `prop_tenant` holds `['property']` and **not** `escrow`, so every tenant payment, deposit, and withholding route must live under `property`. A tenant who cannot reach a payment route cannot pay rent. Add `segment-lint` (§IV.3) to CI.

4. **T8.5 — layout gates.** The plan's `(owner)` and `(contractor)` groups do not cover Group 7. Confirm `prop_manager` and `prop_tenant` route through a `(property)` route group with **two distinct layouts** — the manager and tenant trees are different products (§II.3.1), not one tree with filtered nodes. Neither layout gate is a security boundary; both manifests are (§II.3.4).

5. **New tasks T8.38–T8.42.** Migrations `0043`–`0047` (§III.1), sequenced after the Group 6 set `0038`–`0042`.

6. **T8.4 — API guards.** Every Group 7 route must call `assertUnitMandate()` or `assertTenancyParty()` before any side effect; every application disposition must pass `assertHumanDecisionMaker()` (I-25); every disbursement path in **Groups 3, 5, and 7** must call `assertNotTrustCorpus()` (I-26); every delinquency computation must use `tenancyArrearsCents()` (I-23). None of these exist in the plan.

7. **Taxonomy count unchanged at 27.** Group 7 introduces no new `rbac_key` values. `prop_manager` and `prop_tenant` were both present in the original 22. The residential/commercial distinction (G7-35) is carried by `tenancies.tenancy_class`, and the manager's internal differentiation by `me_seat_role` — **both are attributes of a relationship, not of a person**, which is the correct modelling and the reason no key is added. This preserves the count established in Group 4 Appendix D, Group 5 Appendix B, and Group 6 Appendix D item 7.

8. **T8.6 — fixtures.** The `property_manager` persona needs: a `management_firms` row at M2, a `management_licences` row matching the test unit's jurisdiction, a `trust_accounts` row per corpus, an `me_seats` row, and a `management_engagements` row emanating from the owner fixture's V3 binding. The `tenant` persona needs a `tenancies` row and a `tenancy_parties` row. Additional personas required: a **guarantor**, an **occupant**, a **former_party**, and a **second unrelated management firm**.

   Tests must assert, at minimum:
   - a second manager reads **nothing** of the first's tenancies (G7-27);
   - a service-role disposition of `declined` is **rejected** (I-25);
   - a habitability dispatch succeeds with maximum arrears, an open dispute, a zero reserve, and a lapsed manager subscription (I-27);
   - a repair payment does **not** release on the contractor bundle alone (G7-08);
   - a `fee_charge` against any corpus is **rejected** (I-26);
   - a tenant who authorized on the 1st is **not delinquent** while the intent is `broadcasting` (I-23);
   - a `former_party` can still **export** their record years later with the engagement revoked (G7-20);
   - a guarantor reaches **no** entry record, ticket, or in-unit image (G7-24);
   - `protected_acts` is unreadable from every decisioning role (I-24);
   - a contract rent above the legal regulated rent is **rejected by constraint** (G7-25).

9. **New task — jurisdiction rule packs.** `jurisdiction_rule_packs` is referenced by §III.4's surrender trigger and by every clock, cap, and notice-window computation in this document. It is an operational data surface with an ownership and SLA question, not a schema afterthought, and it belongs to Group 8 (§V.3). **A unit in a jurisdiction with no current rule pack cannot accept applications, generate notices, or collect deposits** — the designed failure mode is refusal to operate.

---

**END OF MASTER BLUEPRINT — GROUP 7**
