# MASTER BLUEPRINT — GROUP 4: THE COMPLIANCE (LEGAL SHIELD)

**Document class:** Production Architecture Specification
**Supersedes:** `architecture/02_draft_blueprints/04_group_the-compliance_legal-shield.md`
**Version:** 2.0 (Red-Teamed / Hardened)
**Date:** 2026-08-19
**Taxonomy scope:** 5 sub-roles — `legal_transactional`, `legal_title`, `legal_expediter`, `legal_loss_mitigation`, **`legal_arbitrator`** *(new; see Appendix D — the canonical role count is arithmetically broken)*
**RLS group string:** `attorney` (via `current_user_role_group()`) — **and this document removes it from the security boundary**
**Counterparty blueprints:** `MasterBlueprint_Group_1.md` · `_Group_2.md` · `_Group_3.md` v2.0 — **binding**; Appendix A is the boundary contract
**Stack:** Next.js 14 App Router · Supabase Postgres + RLS · Zustand Context Registry · Vercel AI SDK · Mapbox GL · $SHQL settlement rail

---

## 0. How To Read This Document

| Part | Contents |
|---|---|
| **Part I** | Red Team Audit — 28 findings, ranked, with exploit paths |
| **Part II** | Hardened Architecture — the corrected design |
| **Part III** | Implementation Spec — schema, RLS, API contracts, TS types |
| **Part IV** | Verification — RBAC matrix, acceptance criteria, telemetry |
| **Part V** | Residual Risk & Bar / Regulatory Review Queue |
| **Appendix A** | Boundary contract with Groups 1–3 |
| **Appendix B** | **VULN-05 closure** — the finding every prior blueprint deferred |
| **Appendix C** | Traceability to `rbac-audit-red-team.md` |
| **Appendix D** | **The 25-role taxonomy is arithmetically broken** — resolution required |
| **Appendix E** | Required deltas to `phase8-sub-role-expansion-plan.md` |

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt

---

# PART I — RED TEAM AUDIT

## 0.1 Executive Verdict

The draft's opening move is *"We eliminate the public court system from the project lifecycle."*

Every enforcement mechanism in this entire ecosystem derives its force from that system. An escrow is enforceable because a court will compel it. An arbitral award moves money because 9 U.S.C. §9 lets a court confirm it into a judgment. A recorded lien has priority because a court will honour it. A platform that routes around the courts does not escape them — it just arrives in front of them without the artifacts that would have won.

And that is the structural error running through this group: **the draft optimizes for speed at the precise points where speed is what makes the output void.**

1. **The arbitration design produces vacatable awards, and then spends them.** Awards are described as "final, unappealable," issued in a hard 14 days, on platform-curated evidence only, by an arbitrator with no disclosed selection process, and they *"physically trigger the release of locked escrow funds."* Under FAA §10 an award is vacatable for evident partiality, for refusing to hear pertinent and material evidence, and for exceeding powers — and *Hall Street v. Mattel* forecloses contracting around those grounds. The draft's design maximizes exposure on all three. Worse, because the award self-executes, **a vacated award has already moved the money.** Vacatur becomes a remedy against a party who no longer holds the funds. An award that gets vacated is worse than no award at all.

2. **The five legal sub-roles collapse into one RLS group, so privilege does not exist.** `agreements_party_access` grants any `attorney`-group session read on every agreement in the database; the write policies grant insert and update. Under Phase 8 all five sub-roles map to `attorney`. A `legal_title` officer can read a `legal_transactional` attorney's client's draft agreements; a `legal_loss_mitigation` specialist representing a homeowner can read opposing counsel's file. This is VULN-05, flagged in the original audit, deferred by Group 1's Appendix A ("out of Group 1 scope; Group 4 must scope to assigned matters") and again by Group 2. It closes here — and it is not merely an access bug. Disclosure of privileged material to third parties is the classic waiver fact pattern, so the defect does not just leak the file, **it destroys the client's privilege in it.**

3. **A "neutral" holds unilateral custody of other people's money.** The `legal_title` officer *"strictly controls the ultimate release of the $SHQL earnest money"* and, *"if a buyer breaches the contract terms, executes a manual transaction to liquidate the escrow in favor of the seller."* One person, one signature, no dual control, no bonding, no trust accounting — and that person unilaterally adjudicates whether a breach occurred. The draft states that this eliminates escrow fraud. It is a specification *for* escrow fraud, and the breach determination is an adjudicative act performed by someone whose entire value is that they do not adjudicate.

4. **The platform is inside the practice of law without being able to practice it.** It generates instruments, structures the attorney's terminal signature, routes consumers to counsel, and runs a model inside legal workspaces. Document automation is defensible; selection, customization, and advice are not (MRPC 5.5). And a workflow that conditions an attorney's signature on platform-defined checks directs the lawyer's professional judgment, which MRPC 5.4(c) forbids a non-lawyer entity from doing.

5. **The fee structures re-import defects three prior blueprints already removed.** Loss-mitigation fees are escrowed in advance (Group 1 §II.7.5 prohibited this under MARS/Reg. O) and are taken *"from the closing proceeds prior to the final disbursement to the institutional lender"* — which, on a short sale, is paying yourself ahead of the lienholder out of its collateral without its approval appearing on the settlement statement. That is short sale fraud, described as a feature.

**The honest reframe.** The draft sells *speed*: 14 days, instantaneous discovery, immediate release. The platform's actual defensible product in this group is **durability** — awards that survive a vacatur petition, files that survive a privilege challenge, escrows that survive an audit, and settlements that survive a title examination. Part II keeps almost all of the speed, by separating the *undisputed* portion of a dispute (which can move immediately) from the *contested delta* (which cannot). That single distinction preserves the cash-flow benefit the draft is chasing while keeping the legal remedy alive.

## 0.2 Finding Register

| ID | Sev | Domain | Finding |
|---|---|---|---|
| G4-01 | 🔴 | Arbitration | "Final, unappealable" is legally false; FAA §10 grounds cannot be contracted away |
| G4-02 | 🔴 | Arbitration | Self-executing award destroys the vacatur remedy — funds move before confirmation |
| G4-03 | 🔴 | Arbitration | No neutral selection, disclosure, conflict, or challenge process → evident partiality |
| G4-04 | 🔴 | Arbitration | Hard 14-day cap + platform-only evidence = designed refusal to hear evidence |
| G4-05 | 🔴 | Arbitration | "Hardcoded in every agreement" contradicts Group 1 §II.6.5 consumer protections |
| G4-06 | 🔴 | Arbitration | Platform earns on arbitration while selecting the arbitrator — structural partiality |
| G4-07 | 🔴 | Arbitration | Inverted extortion: a repeat-player payment-suppression machine against subs |
| G4-08 | 🔴 | Privilege | Five legal sub-roles collapse to group `attorney` — cross-client privileged access |
| G4-09 | 🔴 | Ethics | No conflict-of-interest checking, no ethical walls, no matter model |
| G4-10 | 🔴 | Escrow | Title officer holds unilateral custody — the exact fraud claimed to be eliminated |
| G4-11 | 🔴 | Escrow | A neutral unilaterally adjudicates breach and disburses on its own determination |
| G4-12 | 🔴 | Loss mit. | Advance fee re-imported, contradicting Group 1 §II.7.5 (MARS / Reg. O) |
| G4-13 | 🔴 | Loss mit. | Fee paid from short-sale proceeds ahead of the lienholder — short sale fraud |
| G4-14 | 🔴 | UPL | Platform-generated instruments and platform-structured legal judgment |
| G4-15 | 🔴 | Settlement | Attorney single-signature settlement; deed "logged on the blockchain", not recorded |
| G4-16 | 🔴 | Taxonomy | `legal_arbitrator` makes 27 keys against a canonical 25 — the count is broken |
| G4-17 | 🟠 | Ethics | MRPC 5.4(c): platform workflow directs attorney professional judgment |
| G4-18 | 🟠 | Loss mit. | Specialist→wholesaler referral is a conflict against the client they represent |
| G4-19 | 🟠 | Expediter | Paid on cure ⇒ structural incentive toward violation existence; contractor referral loop |
| G4-20 | 🟠 | Expediter | No anti-corruption controls on a rail whose whole job is municipal-official contact |
| G4-21 | 🟠 | Evidence | AI-derived evidence in adjudication: no authentication, challenge right, or disclosure |
| G4-22 | 🟠 | Records | Immutability conflicts with retention, correction, sealing, and deletion obligations |
| G4-23 | 🟠 | Data | Triage map is the distress heatmap, fourth appearance — with a partly legitimate need |
| G4-24 | 🟠 | Arbitration | Arbitrator performing disbursement is a custodial act that may strip arbitral immunity |
| G4-25 | 🟠 | Signatures | VULN-07 unresolved for the party that matters: proxy signing by counsel |
| G4-26 | 🟡 | Monetization | Escrow and settlement fees on legal transactions — RESPA §8 |
| G4-27 | 🟡 | Privacy | Loss-mitigation "privacy lock" is a map behaviour, not a grant object |
| G4-28 | 🟢 | UX | Onboarding is heavy and the privilege defect is itself the adoption blocker |

---

## 1. The Fast-Track Arbitration Design

### G4-01 🔴 "Final, unappealable" is legally false

**Draft text:** *"Provides the tools to issue a final, unappealable ruling."*

**Finding.** No arbitral award is unappealable in the sense the draft means. 9 U.S.C. §10 supplies vacatur grounds — corruption, evident partiality, refusal to hear pertinent and material evidence, misconduct prejudicing a party's rights, exceeding powers — and §11 supplies modification grounds. *Hall Street Associates v. Mattel* holds that parties cannot contract to expand judicial review; the settled corollary in the circuits is that they cannot contract it away either. A clause purporting to make an award unreviewable is unenforceable, and its presence is itself evidence of overreach when a court examines the clause for unconscionability.

**Why it matters commercially, not just doctrinally.** The entire ecosystem's escrow logic assumes awards are final. If awards are in fact challengeable — and they are — then every downstream design that treats an award as terminal is built on a false premise. The correct response is not to assert finality harder; it is to build a process whose awards actually survive challenge.

`FIX →` §II.5 Arbitration Protocol. The clause is redrafted to FAA-consistent language, review grounds are expressly preserved, and product copy asserting unappealability is withdrawn.

---

### G4-02 🔴 Self-execution destroys the vacatur remedy

**Draft text:** *"executes a cryptographic signature that deterministically unlocks the escrow and routes the $SHQL to the prevailing party within 14 days."*

**Finding.** An award becomes enforceable as a judgment when a court confirms it under §9; a party has three months to move to vacate under §12. The draft's design moves the money at the moment of the award, before either window runs.

The consequence is that **vacatur becomes worthless**. A party who successfully vacates an award has a piece of paper and no funds — the money left an irreversible settlement rail and is now in a counterparty's wallet, possibly a dissolved entity's (Group 2 G2-02: entity churn). The remedy the FAA provides has been engineered out of existence by the settlement layer.

**Exploit — the vacatur-proof grab.** Repeat player obtains an award on a thin record before a favourably-selected arbitrator (G4-03). Funds release the same day. The losing sub moves to vacate on §10(a)(3) and wins nine months later. The prevailing entity has dissolved. The award was legally wrong and financially final.

`FIX →` §II.5.7 **Staged Release** — the single most important correction in this document. The award is decomposed into an **undisputed baseline** (the amount neither party contests, which releases immediately) and the **contested delta** (which is held in neutral custody through the confirmation window). The draft's cash-flow benefit is largely preserved; the legal remedy survives.

---

### G4-03 🔴 No neutral selection, disclosure, conflict, or challenge process

**Draft text:** *"A neutral, third-party legal professional (or retired judge)."*

**Finding.** That is the entire specification. Unanswered: who selects the arbitrator; whether the parties have any input; what must be disclosed; how a challenge is made and to whom; whether repeat appointments are tracked; and whether the arbitrator has any relationship to the platform, to a party, or to counsel.

*Commonwealth Coatings v. Continental Casualty* establishes an affirmative disclosure duty for arbitrators; undisclosed dealings with a party are evident partiality under §10(a)(2). A design with no disclosure step guarantees the ground is available in every case.

**The repeat-player problem is structural, not incidental.** A developer or lender that arbitrates fifty matters a year is a source of recurring appointments. A subcontractor arbitrates once. An arbitrator who wants future appointments has an interest, and it does not run toward the subcontractor. This is the well-documented failure mode of institutional arbitration, and the draft has no control against it.

`FIX →` §II.5.3 — appointment by party strike-and-rank from a roster the platform does not curate for outcome; mandatory disclosure including **published appointment history and outcome distribution by party type**; a challenge path to an independent administrator; per-party appointment caps; and mandatory rotation. Publishing the repeat-player statistics to both parties is the strongest single control available and costs nothing.

---

### G4-04 🔴 The 14-day cap plus platform-only evidence is a designed §10(a)(3) violation

**Draft text:** *"Traditional litigation takes years because of 'discovery.' In Shtiya, discovery is instantaneous."*; the Evidence Dashboard provides *"read-only, chronological access"* to platform records; rulings issue *"within 14 days."*

**Finding — two compounding defects.**

1. **The record is closed.** "Instantaneous discovery" is not fast discovery; it is **no discovery**. The arbitrator sees what the platform logged and nothing else. Change orders agreed on a phone call, emails outside the platform, expert opinion on defective work, witness testimony about site conditions, the subcontractor's own daily logs — none of it has an ingress path. §10(a)(3) makes refusing to hear pertinent and material evidence a vacatur ground, and a system with no submission mechanism refuses it by construction.

2. **The record is asymmetric.** Platform evidence favours whichever party the data model represents best. Contractors upload photos; developers upload BoQs and schedules; **homeowners upload nothing**. A forum that treats platform records as the universe systematically advantages the party who generates platform records.

3. **The clock is a cap, not a target.** A fixed 14 days with no extension for complexity converts every complex matter into a §10(a)(3) candidate.

`FIX →` §II.5.4 — a party evidence-submission channel with equal standing to platform records; complexity tiering with an expedited *default* of 30 days rather than a 14-day cap; extension on cause with a reasoned order; an express arbitrator power to request further evidence; and a **reasoned award** requirement so that whether material evidence was considered is testable.

---

### G4-05 🔴 "Hardcoded in every agreement" contradicts Group 1

**Draft text:** *"Every master agreement and smart contract executed on the platform contains a hardcoded, binding Fast-Track Arbitration clause."*

**Finding.** Group 1 §II.6.5 already governs consumer arbitration: a 30-day post-execution opt-out, carve-outs for small-claims and statutory foreclosure and consumer-protection claims and injunctive relief, no class-action waiver in the consumer tier, and cost-shifting above small-claims to the commercial party. "Hardcoded in every agreement" is the direct negation of all four.

Three further problems the word "hardcoded" creates:

- **Non-waivable statutory rights.** Many states make mechanic's lien rights non-waivable in advance, and many prompt-payment statutes are expressly non-waivable. A clause that purports to route those into arbitration is void as to them and risks poisoning the clause.
- **9 U.S.C. §402.** The Ending Forced Arbitration of Sexual Assault and Sexual Harassment Act makes a pre-dispute clause unenforceable at the claimant's election for covered claims. A hardcoded clause cannot accommodate an election it does not model.
- **Unconscionability.** A clause imposed on consumers with no opt-out, a compressed schedule, a forum the drafter administers, and cost allocation that exceeds the claim's value is the standard procedural-plus-substantive fact pattern.

`FIX →` §II.5.2 Clause Architecture — tiered by counterparty class, with the Group 1 consumer protections implemented rather than asserted, statutory carve-outs enumerated in the clause text, and a §402 election path.

---

### G4-06 🔴 The platform earns on arbitration while selecting the arbitrator

**Draft text:** *"Arbitrators and Expediters are paid fixed fees locked in $SHQL micro-escrows prior to case initiation"*, within a monetization model of *"SaaS subscriptions for the CRM tools and transactional escrow fees."*

**Finding.** The draft does not say the platform takes no cut, and the surrounding fee model says it takes escrow fees. Combine that with an unspecified selection process (G4-03) and the structure is: the entity that profits from disputes chooses who decides them and holds the disputed funds. Every element of that sentence is independently disqualifying, and together they are the strongest available argument that the forum is not neutral.

`FIX →` §II.12.2 — **the platform's net revenue from arbitration outcomes is zero by design.** A flat published administrative fee, invariant to outcome and to the amount in controversy, paid into a segregated administration account; arbitrator compensation fixed at appointment and paid in full regardless of who prevails; the platform never selects the arbitrator; disputed funds held by a licensed third-party custodian, not by the platform.

---

### G4-07 🔴 The inversion: a repeat-player payment-suppression machine

**Draft text:** the entire premise — *"bad actors freeze escrow funds to extort developers facing high financing costs"*, solved by a fast binding forum.

**Finding.** The hold-up problem is real and worth solving. But the mechanism the draft builds is symmetrical, and its asymmetries all run one way. Consider it from the other side:

A general contractor or developer disputes the final payment on every subcontract as a matter of policy. Each sub is now in a 14-day proceeding, in a forum administered by the platform, before an arbitrator appointed through an undisclosed process, on a record consisting of documents the developer generated, and must fund a share of the arbitration escrow to participate. For a $40,000 final payment, the rational sub settles at 60 cents. **The tool built to defeat extortion is a superior instrument of it**, because the repeat player can afford the process and the one-shot player cannot.

`FIX →` §II.5.8 Asymmetry Controls — cost allocation capping the smaller party's exposure at a small-claims-equivalent filing fee with the balance borne by the party with the larger claim volume; the undisputed baseline releasing immediately regardless of the dispute (§II.5.7), which removes the ability to hold *all* of a sub's money hostage over a contested portion; a mandatory pre-arbitration exchange; pattern monitoring on dispute-initiation rates per party; and express preservation of lien and prompt-payment rights.

---

### G4-24 🟠 The arbitrator disbursing funds may strip arbitral immunity

**Draft text:** *"Provides the tools to issue a final, unappealable ruling and physically trigger the release of locked escrow funds."*

**Finding.** Arbitral immunity attaches to adjudicative acts. Taking custody of and disbursing money is a custodial act, not an adjudicative one. An arbitrator who personally executes the transfer steps outside the adjudicative role and into the escrow-agent role, potentially forfeiting immunity, incurring escrow-agent duties they are not licensed or bonded for, and creating a conflict — the decision-maker becomes the disbursing agent for their own decision.

`FIX →` §II.5.7 — the arbitrator issues the award and signs nothing financial. The **custodian** effects release, on the award plus the §II.5.7 staging rules. Adjudication and custody are structurally separated.

---

## 2. Privilege, Conflicts & the Matter Model

### G4-08 🔴 Five sub-roles, one group, no privilege *(VULN-05, finally in scope)*

**Finding.** The existing policies read:

```sql
-- 0002_rls_policies.sql
create policy "agreements_party_access" on agreements for select
  using ( parties @> ... or current_user_role() in ('attorney', 'admin') );
-- 0007_write_policies.sql
"agreements_party_insert" / "agreements_party_update"  -- same attorney branch, for WRITES
```

Under Phase 8, `legal_transactional`, `legal_title`, `legal_expediter`, `legal_loss_mitigation`, and now `legal_arbitrator` all resolve to `attorney`. Therefore **every legal professional on the platform can read, insert, and update every agreement in the database.**

Concrete consequences:

- A `legal_title` officer whose job is encumbrance clearance reads the JV operating agreements, side letters, and draft PSAs of every deal on the platform.
- A `legal_loss_mitigation` specialist representing a homeowner reads the servicer's counsel's file on the same matter.
- An `legal_arbitrator` — a neutral — has standing read access to both parties' privileged material outside the record, which is independently disqualifying.
- Opposing counsel on any transaction read each other's work product.

**This is worse than an access-control bug.** Attorney-client privilege protects communications kept confidential. Systematic accessibility by attorneys outside the representation is the fact pattern for waiver by disclosure. The defect does not merely expose the file — **it may destroy the client's privilege in it**, retroactively, for material the client can never claw back.

**Deferred twice.** Group 1 Appendix A: *"Out of Group 1 scope; Group 4 must scope to assigned matters."* Group 2 carried the same note. It closes here — see Appendix B.

`FIX →` §II.1 Matter-Scoped Authorization. Access derives from a **representation or party role on a specific matter**, never from the role group. Privilege is a first-class column with its own policy class. Neutrals hold a party role that structurally cannot coexist with a representation.

---

### G4-09 🔴 No conflict checking, no ethical walls, no matter model

**Finding.** The draft has no concept of a *matter*, a *client*, or a *representation*. Without them the platform cannot perform the most basic obligation of a legal practice:

- **MRPC 1.7 / 1.9** — an attorney can be retained by both sides of the same transaction, or against a former client in a substantially related matter, and nothing in the system notices.
- **MRPC 1.10** — conflicts impute across a firm; the draft has no firm entity, so imputation cannot be evaluated.
- **Ethical walls** — where screening is permitted, there is no mechanism to implement one.
- **Neutrality** — an arbitrator's conflicts must be checked against both parties, their counsel, their affiliates, and prior appointments. No graph exists to check against.

Nothing in the architecture would prevent the same attorney from drafting the PSA for the buyer, holding escrow as title officer, and arbitrating the resulting dispute.

`FIX →` §II.6 Conflicts & Ethical Walls — a matter graph with clients, adverse parties, and affiliates; automated conflict screening at intake against the full graph including the beneficial-owner clusters from Group 2 §II.2.3; firm-level imputation with documented screens; wall enforcement in RLS, not in policy documents; and a hard structural rule that a neutral role and an advocacy role can never coexist on one matter.

---

### G4-25 🟠 Proxy signing by counsel — VULN-07 where it actually bites

**Finding.** VULN-07 identified that `PATCH /api/agreements` accepts a caller-controlled `party_user_id`, letting any listed party stamp `signed_at` for another. Group 1 declared it resolved for its scope via V3+ step-up bound to `auth.uid()`. But the original audit's own exploit was the attorney case: *"an attorney listed on an agreement can sign on behalf of all other parties, executing the agreement unilaterally."*

Counsel signing for a client is sometimes legitimate — with an executed power of attorney, or as a signatory expressly authorized in the instrument. The defect is that the draft models neither, so the system cannot distinguish authorized execution from forgery.

`FIX →` §II.7.5 — a `signing_authority` object (POA instrument, corporate resolution, or express designation in the instrument), verified and scoped to named agreements, with an expiry; absent it, `signingUserId` must equal `auth.uid()`; every proxy signature notifies the principal out-of-band and is logged as such on the face of the instrument.

---

### G4-22 🟠 Immutability collides with legal obligations

**Draft text:** *"Immutable Document Vault"*, *"every payment is immutably logged."*

**Finding.** Immutability is presented as an unqualified good. In a legal records system it conflicts with:

- **Correction.** An erroneously filed document, a misidentified party, a wrong figure — legal records require a supersession and correction mechanism.
- **Sealing and expungement.** Courts order records sealed; some proceedings are confidential by statute.
- **Retention and destruction.** Bar rules require client file retention for a period *and* proper disposal after; some jurisdictions require destruction on client instruction.
- **Deletion rights.** CCPA/CPRA and comparable regimes provide deletion rights with legal-obligation exceptions that must be evaluated, not assumed.
- **Legal holds.** A hold must be able to *suspend* deletion — which requires deletion to exist as a capability.

An append-only ledger with no supersession, redaction, or tombstone model is a compliance liability wearing the costume of a security feature.

`FIX →` §II.6.5 Records Lifecycle — append-only with an explicit **supersession chain** (records are corrected by superseding entries, never silent edits); cryptographic tombstones that preserve the *existence and hash* of a redacted record while removing content; jurisdiction-aware retention schedules; legal-hold flags that suspend all disposal; and a sealing model that removes a record from every retrieval surface while preserving auditability of the sealing act itself.

---

## 3. Escrow, Custody & Settlement

### G4-10 🔴 Unilateral custody by the title officer

**Draft text:** *"Financial triggers are entirely custodial in nature. The `legal_title` officer strictly controls the ultimate release of the $SHQL earnest money."* The stated pain point eliminated is *"escrow fraud."*

**Finding.** One individual with unilateral authority to move client funds, with:

| Control | Present |
|---|---|
| Dual control / maker-checker | ❌ |
| Fidelity bond and E&O coverage | ❌ |
| State escrow agent licensing | ❌ |
| Trust account (IOLTA or state escrow trust) | ❌ — funds are in a token vault |
| Three-way reconciliation | ❌ |
| Segregation per transaction | ❌ |
| Disbursement limits | ❌ |
| Out-of-band payee verification | ❌ |

Escrow fraud is overwhelmingly *insider* fraud, and the draft removes every control that exists specifically to prevent it while claiming to have solved it. Group 3 §II.1.2 already established dual control for lender disbursement; the party holding *other people's earnest money* has less.

`FIX →` §II.7 Trust & Custody — funds in a licensed escrow trust account or IOLTA, never a platform-controlled token vault; per-transaction segregation; mandatory dual control above threshold with maker ≠ checker enforced in the database; three-way reconciliation (bank, ledger, file) with break reporting; bonding, E&O, and escrow licensure verified at onboarding and monitored for lapse; payee account changes delayed and out-of-band confirmed (the wire-fraud control the industry's own losses forced into existence).

---

### G4-11 🔴 A neutral unilaterally adjudicating breach

**Draft text:** *"If a buyer breaches the contract terms, the officer executes a manual transaction to liquidate the escrow in favor of the seller."*

**Finding.** Determining that a party breached is an adjudication. The title officer is described in the same document as *"the ultimate neutral, third-party arbiter of the transaction"* — and neutrality is precisely the property destroyed by deciding contested questions in one party's favour. In most states an escrow holder faced with competing claims must obtain **mutual written instruction**, an **award or judgment**, or file an **interpleader**. Disbursing on the holder's own view of the merits is a licensing violation, a breach of the escrow agreement, and personal liability.

`FIX →` §II.7.3 Disputed Deposit Protocol — on any competing claim the deposit freezes; release requires mutual written instruction, a §II.5 award that has cleared its staging window, or a court order; interpleader is a first-class supported workflow; and the escrow holder has **no** authority to determine breach, with the UI offering no affordance that implies otherwise.

---

### G4-15 🔴 Attorney single-signature settlement; the deed is not recorded

**Draft text:** *"The Transactional Attorney utilizes their cryptographic signature to trigger final $SHQL settlement... moves funds from the buyer's escrow to the seller's wallet while simultaneously logging the deed transfer on the blockchain."*

**Finding — three defects, each already adjudicated elsewhere in this ecosystem.**

1. **The deed.** Title passes by recorded conveyance. Group 2 §II.9.3 and Group 3 §II.5.6 both established this. "Logging the deed transfer on the blockchain" records nothing and perfects nothing.
2. **Seller proceeds to a wallet.** Real closings disburse through settlement with payoff of existing liens, prorations, transfer taxes, and title insurance. Sweeping funds to a seller's wallet leaves the seller's mortgage unsatisfied and title clouded — the identical defect as Group 2 G2-07.
3. **One signature on the largest sum in the transaction**, from a trust account, with no dual control and no reconciliation.

`FIX →` §II.7.4 Settlement Protocol — funds release **to licensed settlement**; payoffs, prorations, taxes, and title insurance handled there; title passes by recorded conveyance with the recording confirmation returned as a first-class artifact (this is the object Group 3 §II.5.6 requires and Group 2 §II.7.3 requires); dual control on disbursement; the ledger stores a settlement **receipt** after recording confirms, never before, and never as the operative transfer.

---

## 4. Expediter & Loss Mitigation

### G4-19 🟠 Paid on cure ⇒ an incentive toward violations existing

**Finding.** The expediter's compensation triggers on a municipal state change from violation to cured. Their revenue is therefore a function of the *stock of violations*. That is a latent misalignment in any outcome-only fee, and the taxonomy makes it acute: *"If a contractor triggers an SWO by exceeding the scope of their municipal permit, the expediter is immediately pinged via the system to file a cure certificate."*

**Exploit — the fee mill.** A contractor and an expediter with a relationship: the contractor works outside permit scope, the SWO issues, the expediter is auto-engaged and auto-paid on cure. The owner pays for a violation manufactured by the contractor and cured by the contractor's associate. Nothing in the draft detects the pairing or gives the owner a choice.

`FIX →` §II.8.2 — the auto-ping is removed; **the owner selects the expediter**, always. A contractor cannot engage an expediter on a violation arising from its own work. Pairing frequency between contractor and expediter identities (Group 2 §II.2.3 clusters) is monitored, and outliers raise review. Fee structure shifts to work-performed-on-defined-scope with a **bounded** outcome bonus, which preserves urgency without making the violation itself the revenue base.

---

### G4-20 🟠 No anti-corruption controls on the municipal rail

**Finding.** The expediter role exists to interact with building department officials, plan examiners, and hearing officers. That is the single highest-corruption-risk interface in real estate, with a long enforcement record in exactly the jurisdictions this platform targets. The draft automates payment on outcome with **no visibility into how the outcome was obtained** — which is the structure a laundering rail would have if one were designed deliberately.

`FIX →` §II.8.3 — anti-corruption attestations at onboarding and per engagement; a prohibition on any payment or thing of value to a public official routed through or facilitated by the platform; logging of official interactions on a per-matter basis; anomaly detection on cure velocity (a cure materially faster than the jurisdiction's distribution is a review trigger, not a success metric); mandatory reporting channel; and immediate suspension on any bribery-related charge against a control person.

---

### G4-12 🔴 Advance fee re-imported

**Draft text:** *"The platform escrows the processing and negotiation fees."*

**Finding.** Group 1 §II.7.5 resolved this: advance fees for loan-modification and foreclosure-relief services are prohibited for non-attorneys under the MARS Rule / Reg. O (12 CFR 1015) and state foreclosure-consultant statutes; attorneys have a narrow carve-out conditioned on funds sitting in a client trust account until earned, **and a smart-contract escrow is not a trust account**. The Group 4 draft escrows negotiation fees in advance, which is the prohibited structure by name.

`FIX →` §II.9.1 — Group 1 §II.7.5 governs verbatim. Non-attorney loss-mitigation collects **no advance fee under any structure**. Attorney engagements use a funding-commitment model with release to the firm's IOLTA on defined, verifiable service steps. Platform fee is **$0** on this class.

---

### G4-13 🔴 Fee from short-sale proceeds ahead of the lienholder

**Draft text:** *"If a short sale is approved by the bank, the smart contract ensures the specialist receives their $SHQL fee directly from the closing proceeds prior to the final disbursement to the institutional lender, protecting the specialist's compensation."*

**Finding.** In a short sale the lienholder accepts less than it is owed and its approval letter dictates the permitted disbursements on the settlement statement. Taking a fee out of those proceeds **ahead of the lender**, without that fee appearing on the approved settlement statement, is not a payment-protection feature — it is diversion of the lienholder's collateral proceeds, and misrepresenting the settlement statement to obtain short-sale approval is a recognized mortgage fraud pattern with criminal exposure for everyone in the chain, including whoever built the mechanism.

The phrase *"protecting the specialist's compensation"* describes the intent accurately, which is what makes it dangerous: the mechanism is designed to route around the lender's control over its own proceeds.

`FIX →` §II.9.2 — no disbursement from short-sale proceeds occurs except as it appears on the **lender-approved settlement statement**; the platform blocks any fee path from short-sale proceeds absent a matching approved line item; the specialist's compensation arrangement is disclosed to the lienholder as part of the short-sale package; and where the lender disallows the fee, the fee is not collected from proceeds — full stop.

---

### G4-18 🟠 Specialist→wholesaler referral against their own client

**Taxonomy text:** *"If a short sale is deemed the only viable path... the specialist integrates with the Wholesaler to solicit a cash offer."*

**Finding.** The loss-mitigation specialist is the homeowner's advocate. Routing that homeowner to an `investor_wholesaler` — the counterparty whose economics depend on acquiring below market, and against whom Group 1 §II.5 built an entire suppression apparatus — is a conflict against the person they represent. If the specialist receives any consideration for the referral it is worse; if the platform does, worse still (Group 1 §II.8.3).

`FIX →` §II.9.3 — a specialist may not refer, introduce, or transmit a client's parcel to any Group 2 acquirer while representing them, and may hold no economic relationship with the lender, the servicer, or any acquirer on the matter. Where a market exit is genuinely the client's best path, the client is presented with the **Group 1 §II.5 consented `seeking_exit` route** under their own control, with the specialist's role limited to advice. Independence is attested per engagement and screened against the Group 2 identity clusters.

---

## 5. UPL, Independence, Data & Taxonomy

### G4-14 🔴 The platform inside the practice of law

**Finding.** Across the ecosystem the platform: generates purchase options and offers from templates (Group 2 §II.6), generates *"master agreements"* here, routes consumers to counsel, structures when an attorney's signature is required and what it releases, and runs a language model inside legal workspaces. Document *automation* has defensible precedent. What does not:

- **Selection** — presenting a consumer with "the right instrument for your situation" is legal advice.
- **Customization advice** — guiding field completion on a legal instrument for a non-lawyer.
- **Model-generated legal content to a non-lawyer** — the Co-Pilot answering a homeowner's question about their lien priority or their arbitration rights.
- **Structuring the lawyer's act** — see G4-17.

`FIX →` §II.11 UPL Boundary — templates are drafted and approved by licensed counsel per jurisdiction and are versioned; no recommendation engine selects an instrument for a non-lawyer; field completion is mechanical with no advisory text; every instrument surfaces a not-legal-advice disclosure and an offer of independent counsel, acknowledged into `disclosures`; and the Co-Pilot is **hard-blocked from generating legal advice or instruments for non-lawyer accounts**, with the block enforced server-side by account class, not by prompt instruction.

---

### G4-17 🟠 MRPC 5.4(c): the platform directs professional judgment

**Finding.** *"The Transactional Attorney utilizes their cryptographic signature to trigger final settlement"* once *"the attorney verifies that all municipal transfer taxes are paid, compliance checks are complete, and the deed is properly executed."* The platform defines the checklist, gates the signature on its own checks, and makes the signature the mechanism that releases money. A non-lawyer entity that determines when and on what basis a lawyer signs is regulating the lawyer's professional judgment, which MRPC 5.4(c) prohibits.

`FIX →` §II.11.3 — platform checks are **advisory inputs displayed to counsel**, never preconditions on counsel's signature; the attorney can sign over a failed platform check with a recorded rationale, and can decline to sign with all checks green; the signature attests to the lawyer's own professional determination in the lawyer's own words; and the release mechanism is separated from the attestation (§II.7.4), so signing is not itself a disbursement act.

---

### G4-21 🟠 AI-derived evidence in an adjudicative forum

**Finding.** The Evidence Dashboard presents *"AI-verified milestone photos"* to an arbitrator as fact. Group 3 §II.9.3 established that a photograph without provenance is not evidence; in an adjudicative setting the bar rises further. Missing: an authentication standard (the FRE 901 / 902(13)–(14) analogue for digital records), chain of custody, disclosure that a model produced the classification, the model's error characteristics, and the opposing party's right to challenge both the image and the classification.

An arbitrator who relies on an undisclosed model's output that a party could not challenge has arguably refused to hear evidence on the point — back to §10(a)(3).

`FIX →` §II.10 Evidence Standard — every evidentiary item carries a provenance record and an authentication class; **AI-derived conclusions are labelled as such, with the model version, confidence, and known error rates disclosed on the face of the exhibit**; either party may challenge an exhibit, which converts it from fact to contested item requiring independent corroboration; and the arbitrator's reasoned award must state what it relied on.

---

### G4-23 🟠 The triage map — a legitimate need, an illegitimate implementation

**Finding.** *"Heatmaps of recent code enforcement sweeps"*, *"active SWOs in bright red"*, *"municipal violation heatmaps."* This is the fourth appearance of the distress-surface pattern (Group 1 §II.5.3, Group 2 G2-03, Group 3 G3-02).

**But the expediter's case is genuinely different, and a blanket withdrawal would be the wrong call.** Municipal violations are public records; working them is the entire lawful business of an expediter; and unlike a lender's credit map or a wholesaler's distress feed, the expediter's engagement *benefits* the owner. The defect is not the visibility of public data — it is (a) the ranking and scoring overlay that converts public facts into a targeting product, and (b) the absence of any solicitation constraint.

`FIX →` §II.8.4 — public violation records render as **facts, unranked**: no heatmap, no severity score, no sort-by-opportunity, no "sweep" prediction layer. Contacting an owner runs through the **Group 1 §II.5.4 consent ladder** without exception, and a parcel at `exposure_policy = 'private'` is unreachable for solicitation regardless of what the public record says. Group 1 owners who elect it receive an inbound expediter-request path, which is the higher-intent channel anyway.

---

### G4-16 🔴 The taxonomy count is arithmetically broken

**Finding.** The system prompt and every directive specify a *"strict 25-role RBAC taxonomy."* Actual enumeration across the source documents:

```
phase8-sub-role-expansion-plan.md        22 keys
  + Group 9 drafts: broker_commercial, broker_residential, broker_leasing    → 25
  + Group 4 draft:  legal_arbitrator          "[The New Addition]"           → 26
  + Group 5 draft:  contractor_logistics                                     → 27
```

**27 keys exist across the draft corpus against a canonical count of 25.** The two extras are `legal_arbitrator` (introduced here) and `contractor_logistics` (introduced in Group 5, which CLAUDE.md's own group summary names explicitly: *"GCs, Sub-Trades, Suppliers, Logistics/3PL"*). Neither appears in the Phase 8 enum, `ROLE_APP_MAP`, or `ROLE_GROUP_MAP`. Every RLS policy, layout gate, and test fixture built against 22 or 25 will be wrong for these two.

This is not a documentation nit. `legal_arbitrator` **must** be a distinct rbac_key rather than a capacity on an attorney account, because the whole point of the role is that it cannot carry advocacy privileges (§II.1.3). Modelling it as anything softer re-creates G4-09.

`FIX →` Appendix D — the canonical count moves to **27**, with `legal_arbitrator` under a new `neutral` group string (deliberately *not* `attorney`) and `contractor_logistics` under `contractor`. Appendix E carries the Phase 8 deltas.

---

# PART II — HARDENED ARCHITECTURE

## II.0 Design Thesis

> **The draft optimizes for speed at precisely the points where speed is what makes the output void.**
> An award that gets vacated is worse than no award: it moves the money, then unwinds. A file that loses privilege is worse than no file. An escrow released by one signature is the fraud it claims to prevent.
>
> The product here is not speed. It is **durability** — awards that survive a vacatur petition, files that survive a privilege challenge, escrows that survive an audit, settlements that survive a title examination.
>
> Almost all of the speed is nonetheless preserved, by one distinction the draft never draws: **the undisputed portion of a dispute can move immediately; only the contested delta must wait.**

**Governing structural principles:**

1. **Adjudication and custody are never the same party.** (§II.5.7, §II.7.3)
2. **Neutrality and advocacy can never coexist on one matter, in one account, in one session.** (§II.1.3)
3. **Access derives from a matter role, never from a role group.** (§II.1)
4. **The platform's net revenue from any dispute outcome is zero.** (§II.12.2)
5. **Automation may be conservative unilaterally, never permissive unilaterally.** (inherited, Group 3 §II.0)

---

## II.1 Matter-Scoped Authorization *(resolves G4-08, G4-09)*

**Principle:** Group 1's primitive is the parcel, Group 2's the deal, Group 3's the facility. Group 4's is the **matter** — because that is the unit a representation attaches to, the unit privilege attaches to, and the unit conflicts are checked against.

```
users.role             → coarse nav routing only. Never used for Group 4 row access.
firms                  → the verified practice entity (B0…B3 admission level)
firm_members           → seats; conflicts impute across the firm (MRPC 1.10)
matters                → the authorization primitive
matter_parties         → who is in the matter and in what capacity
representations        → WHICH lawyer represents WHICH party (the privilege edge)
ethical_walls          → screens within a firm
conflict_checks        → append-only record of every screen run
```

### II.1.1 Matter roles

| `matter_role` | Reaches | Cannot |
|---|---|---|
| `counsel_of_record` | Their own client's privileged material; shared matter record | Any other party's privileged material |
| `co_counsel` | As scoped by the representation | Exceed the engagement scope |
| `neutral` | **The record only.** No party's privileged material, ever | Hold any representation on this matter, or any related matter |
| `escrow_holder` | Transaction documents and instructions | Determine breach (§II.7.3); read privileged material |
| `party` | Own privileged material; shared record | Other parties' privileged material |
| `expert` | Scoped exhibits only | The financial or privileged record |
| `observer` | Shared record, read-only, expiring, watermarked | Export; persist past expiry |

### II.1.2 Privilege as a first-class attribute

```sql
documents.privilege_class ∈
  ('none', 'attorney_client', 'work_product', 'common_interest', 'settlement_privileged')
documents.privilege_holder_id   -- the CLIENT, not the lawyer
```

Privileged material is reachable only by the holder and by counsel with a current representation of that holder on that matter. **There is no `admin` branch on privileged reads** — platform personnel reach them only through an audited break-glass that writes an access event visible to the privilege holder. A privilege log is generated per matter on demand.

### II.1.3 The neutrality wall *(the structural fix for G4-03 and G4-09)*

```
INVARIANT I-10:
  A user holding matter_role = 'neutral' on matter M can hold NO representation on M,
  on any matter sharing a party with M, or on any matter sharing a party's beneficial-
  owner cluster (Group 2 §II.2.3) with M — for the duration of M plus a cooling-off period.

INVARIANT I-11:
  `legal_arbitrator` is a DISTINCT rbac_key under the group string `neutral` — NOT
  `attorney`. A natural person may hold both keys under separate accounts, but the
  session, workspace tree, and Co-Pilot retrieval are structurally disjoint: no
  advocacy workspace is reachable in a session where a neutral workspace is active.

INVARIANT I-12:
  An arbitrator's read scope on a matter is the RECORD ONLY — exhibits admitted under
  §II.10, submissions, and orders. Never a party's vault, never privileged material,
  never the platform's wider data.
```

### II.1.4 Inherited invariants

- **I-1** No Group 4 RLS policy may use `current_user_role_group()` for row access except the literal `admin` branch — and on privileged rows, **not even that**.
- **I-2** No billing path holds any grant on matters, representations, walls, or trust records.
- **I-7** Dual control on trust disbursement above threshold; maker ≠ checker in the database.

---

## II.2 Onboarding — The Admission Ladder *(resolves G4-28)*

| Level | Proves | Evidence | Unlocks |
|---|---|---|---|
| **B0** | Nothing | Email, phone | Public materials, aggregate statistics |
| **B1** | A real natural person | V1 IDV (IAL2), device and phone binding | Sandbox, template library (read-only) |
| **B2** | An admitted, insured practitioner | **Bar admission verified per jurisdiction**, discipline history, malpractice coverage, firm affiliation, conflict-system attestation | Matter creation, representation, document work |
| **B3** | Role-specific authority | `legal_title`: escrow licensure + fidelity bond + trust account + three-way reconciliation attestation · `legal_arbitrator`: neutral qualification, roster admission, standing disclosure · `legal_expediter`: registration where required + anti-corruption attestation · `legal_loss_mitigation`: MARS/Reg. O posture confirmed | Trust custody, arbitral appointment, municipal filing, loss-mitigation engagement |

**Per-jurisdiction, per-role.** The `capability_jurisdiction_matrix` (Group 2 §II.2.5, extended in Group 3) gains legal capabilities. Admission in one state does not enable matters in another; pro hac vice is modelled as a matter-scoped, expiring grant.

**Monitoring.** Bar standing is re-verified quarterly and on any discipline event; a suspension immediately freezes matter access to read-only and notifies the firm's responsible attorney and every affected client. Insurance lapse blocks new matters. `legal_title` bond or licence lapse **freezes all trust disbursement immediately**.

**Adoption note (G4-28).** Attorneys are the ecosystem's most conservative adopters, and the privilege defect (G4-08) is not merely a security problem — it is the reason a competent firm would decline to onboard. §II.1 and §II.6 are therefore the adoption strategy as much as the security design. The onboarding surface should lead with the privilege architecture and the per-matter privilege log, because that is the objection.

---

## II.3 The Directory Pane — Matter Workspaces

### II.3.1 Definition

> A Group 4 **Workspace** is `(firm_id, matter_id)`. Navigation, map scope, Co-Pilot context, and authorization are the same unit.
> **A neutral workspace is a separate tree that cannot be open in the same session as any advocacy workspace** (I-11).

### II.3.2 Tree shape

```
DIRECTORY  (Left Pane · 250px · React Server Component · zero client hooks)
│
├─ ◈ Practice                      ← aggregate; no client context
│    └─ Matters · Conflicts · Trust Ledger · Templates · Seats · Billing
│
├─ 📁 Ramirez / 128 Maple — Transaction     ← MATTER  role=counsel_of_record
│    ├─ Client File        (privileged; privilege log available)
│    ├─ Instruments        (drafting; versioned; supersession chain)
│    ├─ Title & Encumbrance
│    ├─ Trust Ledger       (this matter's funds only)
│    └─ Timeline & Filings
│
├─ 🏛 77 Bergen — SWO Cure                   ← MATTER  legal_expediter
│    ├─ Violation Record   (public facts, UNRANKED)
│    ├─ Hearing Calendar · Cure Filings
│    └─ Engagement & Fee   (owner-selected; §II.8.2)
│
├─ 🛡 Okonkwo — Loss Mitigation              ← MATTER  legal_loss_mitigation
│    ├─ Client File (privileged) · Servicer Log · Workout Options
│    └─ Independence Attestation             (§II.9.3)
│
└─ ⚖️ NEUTRAL SESSION                        ← SEPARATE TREE. Mutually exclusive.
     └─ Arb-2026-0417 · Harrison Draw #4
        ├─ Record & Exhibits      (admitted items ONLY — no party vaults)
        ├─ Submissions & Orders
        ├─ Disclosure & Challenges (§II.5.3)
        └─ Award & Staging         (§II.5.7 — no financial signature exists here)
```

### II.3.3 Server-side derivation

`matter_workspace_manifest()` runs under the caller's RLS-scoped session in the RSC. Subtabs absent from the manifest are not rendered **and** their routes independently reject direct navigation. Selecting the neutral tree closes every advocacy workspace and increments the epoch; the two trees never appear together.

### II.3.4 Context isolation

Inherited from Group 1 §II.3.4, with matter-specific hardening:

- Identifiers only (`{ firmId, matterId, matterRole, epoch }`), never prose.
- `is_matter_party()` re-checked server-side; 403 returned **without invoking the model**.
- **No cross-matter retrieval, ever.** A matter's transcript and documents are never retrieval candidates in another matter — this is a privilege requirement, not a preference.
- **Privileged material is excluded from every retrieval index** unless the querying session holds a current representation of the privilege holder on that matter.
- The neutral workspace's retrieval scope is the admitted record only.
- On representation termination, the matter's transcript leaves the retrieval index within 24 hours.

---

## II.4 Sub-Role Portals — Hardened Feature Matrices

### II.4.1 A · Fast-Track Arbitrator — `legal_arbitrator` *(group string `neutral`)*

| Subtab | Capabilities | Gates |
|---|---|---|
| **Record & Exhibits** | Admitted exhibits with provenance and authentication class; AI-derived items labelled with model, version, confidence, error rates | `neutral` on this matter |
| **Submissions & Orders** | Party submissions (platform and off-platform on equal footing), scheduling orders, evidence requests | §II.5.4 |
| **Disclosure & Challenges** | Own disclosure statement; challenge status; **published appointment history and outcome distribution** | §II.5.3 |
| **Award & Staging** | Reasoned award drafting; staging determination (baseline vs. contested delta) | §II.5.7 |

**Hardening deltas from draft**
- **No financial signature exists in this role.** The arbitrator issues an award; the custodian effects release (G4-24).
- "Final, unappealable" is withdrawn; awards carry FAA-consistent language preserving §10/§11 review.
- 14-day cap → complexity-tiered schedule, expedited default 30 days, extension on cause by reasoned order.
- Read scope is the admitted record only — never party vaults, never privileged material (I-12).
- Appointment history and outcome distribution by party type are **published to both parties** before appointment is confirmed.

### II.4.2 B · Transactional Attorney — `legal_transactional`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Client File** | Privileged material for this client on this matter | representation |
| **Instruments** | Drafting, versioning, supersession chain, execution with verified signing authority | B2 + jurisdiction |
| **Title & Encumbrance** | Commitment review, exceptions, date-downs | matter party |
| **Trust Ledger** | This matter's trust activity, reconciliation state | B3 where holding funds |
| **Timeline & Filings** | Recording status and the recording confirmation artifact (§II.7.4) | matter party |

**Hardening deltas from draft**
- Cross-matter agreement access is **gone** (G4-08). Access is by representation.
- Settlement is disbursement to licensed settlement with dual control; the attorney's signature is an **attestation**, not a disbursement act (G4-15, G4-17).
- Platform compliance checks are advisory inputs; counsel may sign over a failed check with recorded rationale, or decline with all checks green (MRPC 5.4(c)).
- Proxy signature requires a verified `signing_authority` object; otherwise `signingUserId = auth.uid()` (G4-25).

### II.4.3 C · Title & Escrow Officer — `legal_title`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Encumbrance Record** | Liens, judgments, municipal fines on matter parcels — unranked facts | matter party |
| **Commitment & Exceptions** | Title commitment issuance, exception clearance, endorsements | B3 |
| **Escrow Trust** | Deposits, disbursements under dual control, three-way reconciliation, break log | B3 + I-7 |
| **Disputed Deposits** | Freeze state, mutual-instruction workflow, interpleader preparation | §II.7.3 |
| **Clearance Gates** | The `legal_title` clearance object consumed by Group 2 §II.7.3 and Group 3 §II.5.6 | B3 |

**Hardening deltas from draft**
- Funds move to a **licensed escrow trust account or IOLTA**, never a platform token vault (G4-10).
- **No unilateral release.** Dual control above threshold; maker ≠ checker in the database.
- **No breach determination.** Competing claims freeze the deposit; release requires mutual written instruction, a staged award, or a court order; interpleader is a supported workflow (G4-11).
- Payee account changes are delayed and out-of-band confirmed — the wire-fraud control.
- Clearance and recording confirmation are **first-class artifacts** other groups depend on, closing the requests in Group 2 §V.3 and Group 3 §V.3.

### II.4.4 D · Municipal Expediter — `legal_expediter`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Violation Record** | Public municipal records as **unranked facts** — no heatmap, no score, no sweep prediction | B3 + jurisdiction |
| **Hearing Calendar** | Hearing scheduling, appearance tracking | matter party |
| **Cure Filings** | Filing preparation, submission, municipal correspondence | matter party |
| **Engagement & Fee** | Owner-selected engagement; scope; bounded outcome bonus | §II.8.2 |
| **Interaction Log** | Logged official interactions; anti-corruption attestations | §II.8.3 |

**Hardening deltas from draft**
- The heatmap overlay is **withdrawn**; public facts render unranked (G4-23).
- Owner contact runs through the Group 1 §II.5.4 consent ladder without exception; `private` parcels are unreachable for solicitation.
- The contractor auto-ping is **removed** — the owner selects the expediter, and a contractor cannot engage one on a violation from its own work (G4-19).
- Fee is work-performed-on-scope with a bounded outcome bonus; Group 1 §II.7.4's objective oracle, deadline reversion, and substitution right all apply.
- Anti-corruption controls and cure-velocity anomaly detection (G4-20).

### II.4.5 E · Loss Mitigation Specialist — `legal_loss_mitigation`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Client File** | Privileged; hardship package; financial picture | representation + Group 1 grant |
| **Servicer Log** | Communications, submissions, decision timeline | matter party |
| **Workout Options** | Modification, forbearance, repayment, short sale, deed-in-lieu modelling | B3 |
| **Independence Attestation** | Per-engagement conflict screen against lender, servicer, and Group 2 clusters | §II.9.3 |

**Hardening deltas from draft**
- **No advance fee.** Group 1 §II.7.5 governs verbatim; platform fee is $0 (G4-12).
- **No fee from short-sale proceeds** except as it appears on the lender-approved settlement statement (G4-13).
- **No referral to any Group 2 acquirer while representing the client** (G4-18); market exit runs through Group 1's consented `seeking_exit` route under the client's own control.
- Parcel access is a **revocable, expiring, purpose-bound grant object** the homeowner can see and withdraw from Group 1's Exposure & Privacy subtab — not a map behaviour (G4-27).
- Receives the Group 3 §II.11.5 Shield handoff, which the borrower elects.

---

## II.5 The Arbitration Protocol *(resolves G4-01 → G4-07, G4-24)*

### II.5.1 Objective

> An award that cannot be vacated is worth more than an award issued quickly. Every rule below exists to close a §10 ground.

### II.5.2 Clause architecture *(G4-05)*

```
Clause terms are TIERED BY COUNTERPARTY CLASS, not hardcoded.

COMMERCIAL ↔ COMMERCIAL (both entities, both represented)
  · binding arbitration, expedited schedule, reasoned award
  · cost sharing per the schedule

ANY CONSUMER PARTY (Group 1 natural person / trust, owner-occupied)
  → Group 1 §II.6.5 governs and is IMPLEMENTED, not asserted:
      · 30-day post-execution opt-out, one click, in-product
      · carve-outs: small claims, statutory foreclosure and consumer-protection
        claims, injunctive relief
      · NO class-action waiver
      · costs above the small-claims threshold borne by the commercial party

ALL TIERS — enumerated in the clause text:
  · mechanic's lien rights and prompt-payment statutory rights are EXPRESSLY PRESERVED
    and not subject to the clause (many states make them non-waivable in advance)
  · 9 U.S.C. §402 election path for covered claims
  · FAA §10 / §11 review grounds expressly preserved; no purported waiver
```

### II.5.3 Neutral selection and disclosure *(G4-03, G4-06)*

```
ROSTER        maintained against published qualification criteria. The platform does
              NOT curate for outcome and does not rank by win rate for any party class.
SELECTION     party STRIKE-AND-RANK from a randomly drawn slate. Where the parties
              cannot agree, appointment is by RANDOM SELECTION from the qualified
              remainder. THE PLATFORM NEVER PICKS.
DISCLOSURE    mandatory and continuing, per Commonwealth Coatings: relationships with
              parties, counsel, affiliates, and beneficial-owner clusters (Group 2
              §II.2.3); prior appointments; sources of compensation.
PUBLISHED     appointment history and outcome distribution BY PARTY TYPE are shown to
STATISTICS    both parties before appointment is confirmed. This is the single
              strongest repeat-player control and it costs nothing to provide.
CHALLENGE     to an independent administrator, not to the platform. A sustained
              challenge redraws the slate.
CAPS          per-party appointment caps per arbitrator per rolling period; mandatory
              rotation once a cap is approached.
COMPENSATION  fixed at appointment, paid in full REGARDLESS OF OUTCOME, from the
              administration account — never from the disputed funds.
```

### II.5.4 Evidence ingress and schedule *(G4-04)*

```
PARTY SUBMISSIONS  each party may submit off-platform evidence — documents, declarations,
                   expert reports, witness statements — with EQUAL STANDING to platform
                   records. Platform records carry no evidentiary preference.
ASYMMETRY NOTE     the record favours whoever generates platform data. Where a consumer
                   or one-shot party is opposite a repeat player, the arbitrator is
                   prompted to consider record asymmetry and may order production.
ARBITRATOR POWER   may request further evidence, order limited production, and take
                   testimony by video.
SCHEDULE           complexity-tiered. Expedited DEFAULT of 30 days; extension on cause
                   by REASONED ORDER. Never a hard cap — a cap is a §10(a)(3) generator.
REASONED AWARD     mandatory. Findings on each contested issue, and a statement of what
                   the arbitrator relied on (§II.10).
```

### II.5.5 Record and neutrality scope

The arbitrator's read scope is the admitted record only (I-12). Ex parte contact is blocked at the messaging layer; every communication is on the record and visible to both parties.

### II.5.6 Custody during proceedings

Disputed funds move to a **neutral third-party custodian** — never a platform-controlled vault, never the arbitrator, never either party's counsel. Interest accrues to the eventual prevailing party per the schedule.

### II.5.7 Staged Release — the core correction *(G4-02, G4-24)*

```
THE AWARD DOES NOT MOVE MONEY. The custodian does, under these rules:

┌─ UNDISPUTED BASELINE ────────────────────────────────────────────────────┐
│ The amount neither party contests — established in the mandatory pre-     │
│ arbitration exchange (§II.5.8) and confirmed in the award.                │
│ RELEASES IMMEDIATELY on the award. No waiting period.                     │
│ This is where the draft's cash-flow benefit actually lives, and it is     │
│ preserved in full.                                                        │
└──────────────────────────────────────────────────────────────────────────┘
┌─ CONTESTED DELTA ────────────────────────────────────────────────────────┐
│ Held by the custodian through the CONFIRMATION WINDOW.                    │
│ Releases on the EARLIEST of:                                              │
│   (a) the window expiring with no vacatur petition filed                  │
│   (b) joint written instruction of the parties                            │
│   (c) a court confirming the award (9 U.S.C. §9)                          │
│ A timely vacatur petition HOLDS the delta until resolved.                 │
│ Window length is set by the clause tier and disclosed at the outset.      │
└──────────────────────────────────────────────────────────────────────────┘

CONSEQUENCE: a vacated award has not already spent the money. The FAA remedy
survives, which is the entire point.

SEPARATION: the arbitrator has no financial signature. Adjudication and custody
are different parties (Principle 1), which also preserves arbitral immunity.
```

### II.5.8 Asymmetry controls *(G4-07)*

```
PRE-ARBITRATION   mandatory exchange of positions and identification of the undisputed
EXCHANGE          baseline BEFORE a case initiates. Most disputes resolve here, and it
                  is what makes §II.5.7's baseline computable.
COST CAP          the smaller claimant's exposure is capped at a small-claims-equivalent
                  filing fee; the balance is borne by the party with the larger claim
                  volume on the platform.
BASELINE RELEASE  a party cannot hold ALL of a counterparty's money hostage over a
                  contested portion — the baseline releases regardless of the dispute.
PATTERN MONITOR   dispute-initiation rates per party, per counterparty class, are
                  monitored. A party disputing an outlier share of its final payments
                  raises review — the direct G4-07 signal.
STATUTORY RIGHTS  lien and prompt-payment rights expressly preserved (§II.5.2).
REPRESENTATION    every party is offered the fee schedule and a plain-language guide
                  before initiation; consumers are additionally offered independent
                  counsel with no economic relationship to the platform or the opponent.
```

---

## II.6 Conflicts, Walls & Records *(resolves G4-09, G4-22)*

### II.6.1 Conflict screening at intake

Every new matter and every new representation runs an automated screen against: current and former clients of the firm; adverse parties and their affiliates; **beneficial-owner clusters** (Group 2 §II.2.3), which catches the entity-churn evasion; and prior arbitral appointments. Results are recorded append-only in `conflict_checks`. A hit blocks the representation until it is cleared with a documented basis — waiver, screen, or declination.

### II.6.2 Imputation and screens

Conflicts impute across `firm_members` (MRPC 1.10). Where screening is permitted, an `ethical_walls` row is created and **enforced in RLS**, not in a memo: screened members' reads of walled matters fail at the database and are logged as attempts.

### II.6.3 Neutrality enforcement

I-10 and I-11 are enforced by policy and by session structure. An arbitrator's conflict screen runs against both parties, their counsel, their affiliates, their clusters, and their prior appointments with this arbitrator, and its output is part of the mandatory disclosure package (§II.5.3).

### II.6.4 Privilege operations

Privilege log generation per matter; a defined process for inadvertent-disclosure clawback that removes the item from every index and records the event; common-interest arrangements modelled explicitly so shared material does not silently lose protection; and a break-glass path for platform personnel that writes an access event **visible to the privilege holder**.

### II.6.5 Records lifecycle *(G4-22)*

```
APPEND-ONLY + SUPERSESSION  records are corrected by superseding entries that reference
                            the superseded record. No silent edits; no lost history.
TOMBSTONE                   redaction preserves the EXISTENCE and HASH of a record while
                            removing content — auditability without exposure.
RETENTION                   jurisdiction-aware schedules per record class; disposal is a
                            logged, dual-controlled act.
LEGAL HOLD                  suspends all disposal on a matter; holds are themselves logged
                            and cannot be removed by the party subject to them.
SEALING                     removes a record from every retrieval surface while preserving
                            an auditable record OF the sealing act.
DELETION RIGHTS             consumer deletion requests are evaluated against legal-obligation
                            exceptions and answered; the outcome and its basis are recorded.
```

---

## II.7 Trust, Custody & Settlement *(resolves G4-10, G4-11, G4-15, G4-25)*

### II.7.1 Where funds live

```
Client and escrow funds live in a LICENSED ESCROW TRUST ACCOUNT or IOLTA, per
jurisdiction and per role. NEVER in a platform-controlled token vault. NEVER
commingled with platform funds or with another matter's funds.

$SHQL: settlement mechanics and audit trail between institutional parties only.
It is not a trust account and product copy implying otherwise is withdrawn.
```

### II.7.2 Controls *(G4-10)*

```
SEGREGATION      per matter, per transaction
DUAL CONTROL     mandatory above threshold; maker <> checker enforced in the DB (I-7)
RECONCILIATION   three-way (bank ↔ ledger ↔ file) on a fixed cadence, with break
                 reporting and an escalation path; an unreconciled break beyond
                 tolerance FREEZES disbursement
BONDING          fidelity bond, E&O, and escrow licensure verified at B3 and monitored;
                 a lapse freezes disbursement IMMEDIATELY
PAYEE CONTROL    payout account changes are delayed and out-of-band confirmed
LIMITS           per-seat and per-transaction disbursement limits
NO PLATFORM FEE  on trust principal, ever
```

### II.7.3 Disputed Deposit Protocol *(G4-11)*

```
ON ANY COMPETING CLAIM: the deposit FREEZES. The escrow holder has NO authority to
determine breach, and the UI presents no affordance implying otherwise.

RELEASE REQUIRES exactly one of:
  · mutual written instruction of all claimants
  · a §II.5 award that has cleared its §II.5.7 staging window
  · a court order
  · interpleader deposit — a first-class supported workflow with document generation
    and a defined handoff to counsel
```

### II.7.4 Settlement Protocol *(G4-15)*

```
FUNDS      release TO LICENSED SETTLEMENT — never to a seller's wallet. Settlement
           handles lien payoffs, prorations, transfer taxes, title insurance, recording.
TITLE      passes by RECORDED CONVEYANCE. The county record is dispositive.
ARTIFACT   the RECORDING CONFIRMATION (jurisdiction, instrument number, recording date,
           resulting lien position) is a first-class object returned to:
             · Group 2 §II.7.3 assignment escrow condition C
             · Group 3 §II.5.6 funding precondition
             · Group 2 §II.9.3 coordinated closing
CONTROL    dual control on disbursement; three-way reconciliation
RECEIPT    the ledger records a settlement receipt AFTER recording confirms — never
           before, never as the operative transfer
ATTESTATION the attorney's signature attests to their own professional determination.
           It is NOT the disbursement act (§II.11.3).
```

### II.7.5 Signing authority *(G4-25)*

```
DEFAULT:   signingUserId MUST equal auth.uid(). The caller-controlled party_user_id
           parameter is REMOVED.
EXCEPTION: a verified `signing_authority` object — POA instrument, corporate resolution,
           or express designation in the instrument — scoped to NAMED agreements with
           an expiry, verified at grant time.
ALWAYS:    a proxy signature notifies the principal out-of-band, is recorded as a proxy
           signature on the face of the instrument, and names the authority relied on.
```

---

## II.8 Municipal Expediting *(resolves G4-19, G4-20, G4-23)*

### II.8.1 Inherited cure escrow

Group 1 §II.7.4 governs in full: objective municipal oracle only (never counterparty attestation), double-read ≥24h apart from independently configured fetchers, hard `deadline_at` with automatic full reversion to the owner, unilateral owner substitution right, no fee escalation inside the escrow, and **no platform fee on the escrowed principal**. Group 2 §II.9.2's parser-drift rule applies: drift raises `needs_review` and pauses; it never degrades to a smaller quorum.

### II.8.2 Engagement and incentive *(G4-19)*

```
OWNER SELECTS        the auto-ping to an expediter on SWO issuance is REMOVED. The owner
                     chooses, always, from a directory with verified credentials.
CONTRACTOR FIREWALL  a contractor CANNOT engage an expediter on a violation arising from
                     its own work. Where a contractor's work caused the violation, the
                     owner is notified of that fact and selects independently.
PAIRING MONITOR      contractor↔expediter pairing frequency across identity clusters
                     (Group 2 §II.2.3) is monitored; outliers raise review.
FEE STRUCTURE        work-performed-on-defined-scope plus a BOUNDED outcome bonus.
                     Purely outcome-based fees make the violation itself the revenue base.
```

### II.8.3 Anti-corruption *(G4-20)*

```
ATTESTATION   at onboarding and per engagement: no payment or thing of value to any
              public official, directly or indirectly
PROHIBITION   no payment to a public official may be routed through or facilitated by
              the platform, in any form, including expedite or courtesy fees not on
              the jurisdiction's published schedule
INTERACTION   official interactions logged per matter: date, office, official, purpose
LOG
ANOMALY       cure velocity materially faster than the jurisdiction's distribution is a
DETECTION     REVIEW TRIGGER, not a success metric or a marketing statistic
REPORTING     a protected channel for reporting solicitation of improper payments
SUSPENSION    immediate on any bribery-related charge against a control person
```

### II.8.4 The violation surface *(G4-23)*

```
RENDERED:      public municipal records as FACTS — violation text, status, hearing dates,
               statutory deadlines
NOT RENDERED:  heatmaps, severity scores, "opportunity" ranking, sort-by-distress,
               enforcement-sweep prediction layers
CONTACT:       Group 1 §II.5.4 consent ladder applies WITHOUT EXCEPTION. A parcel at
               exposure_policy = 'private' is unreachable for solicitation regardless
               of what the public record says.
INBOUND:       Group 1 owners may request expediter assistance directly — the higher-
               intent channel, and the one the Shield workspace routes to.
```

---

## II.9 Loss Mitigation *(resolves G4-12, G4-13, G4-18, G4-27)*

### II.9.1 Fees *(G4-12)*

Group 1 §II.7.5 governs verbatim. Non-attorney loss-mitigation collects **no advance fee under any structure**. Attorney engagements use the funding-commitment model with release to the firm's **IOLTA** on defined, verifiable service steps — a smart-contract escrow is not a client trust account. Platform fee on this class is **$0**. MARS/Reg. O disclosures render with acknowledgement recorded, including that the consumer may reject any offer obtained and owes nothing for a rejected offer.

### II.9.2 Short sale integrity *(G4-13)*

```
NO disbursement from short-sale proceeds occurs except as it appears on the
LENDER-APPROVED SETTLEMENT STATEMENT.

· the platform BLOCKS any fee path from short-sale proceeds without a matching
  approved line item — enforced at the disbursement layer, not by policy
· the specialist's compensation arrangement is DISCLOSED to the lienholder as part
  of the short-sale package
· where the lender disallows the fee, the fee is NOT collected from proceeds
· any attempt to construct a proceeds path outside the approved statement is a
  security event and is logged as one
```

### II.9.3 Independence *(G4-18)*

```
A specialist representing a homeowner:
  · MAY NOT refer, introduce, or transmit the client's parcel to any Group 2 acquirer
  · MAY NOT hold an economic relationship with the lender, the servicer, or any
    acquirer on the matter
  · attests independence PER ENGAGEMENT, screened against Group 2 identity clusters

Where a market exit is genuinely the client's best path, the client is presented with
the Group 1 §II.5 consented `seeking_exit` route UNDER THEIR OWN CONTROL, with the
specialist advising and not brokering.
```

### II.9.4 Access grants *(G4-27)*

The specialist's parcel access is a **first-class grant object**: explicit, purpose-bound, expiring, revocable, and visible to the homeowner in Group 1's Exposure & Privacy subtab with a full access log. It is enforced in RLS, not as a map-layer behaviour — this is the same defect class as Group 1 G1-03 and is fixed the same way.

### II.9.5 Shield handoff

Receives Group 3 §II.11.5: the servicer may inform, the borrower elects, Shield entry is not an event the lender observes, and the platform earns nothing. The receiving engagement runs a conflict screen against the lender and servicer before it can open.

---

## II.10 Evidence & Authentication Standard *(resolves G4-21)*

```
Every evidentiary item carries:
  PROVENANCE RECORD    Group 3 §II.9.3 bundle where applicable — capture nonce, device
                       attestation, geofence, timestamp, sequence, perceptual hash,
                       C2PA where present
  AUTHENTICATION CLASS 'self_authenticating' | 'witness_authenticated' | 'contested'
                       (the FRE 901 / 902(13)–(14) analogue for digital records)
  CHAIN OF CUSTODY     complete, from capture to admission

AI-DERIVED CONCLUSIONS are LABELLED ON THE FACE OF THE EXHIBIT with:
  · the model and version
  · the confidence score
  · known error characteristics for the classification type
  · an explicit statement that the conclusion is machine-generated

CHALLENGE RIGHT: either party may challenge any exhibit. A challenged exhibit moves to
'contested' and requires independent corroboration before it can support a finding.
An AI conclusion alone can NEVER support a finding over a timely challenge.

The reasoned award must state what the arbitrator relied on, which makes reliance on
unchallengeable machine output visible and therefore testable.
```

---

## II.11 UPL & Professional Independence *(resolves G4-14, G4-17)*

### II.11.1 The document automation boundary

```
PERMITTED:   template libraries drafted and approved by licensed counsel PER
             JURISDICTION, versioned, with an identified approving attorney;
             mechanical field completion; execution mechanics
NOT PERMITTED: recommending WHICH instrument a non-lawyer should use; advisory text on
             how to complete a field; assessment of a non-lawyer's legal position;
             any output framed as what a user "should" do legally
ALWAYS:      a not-legal-advice disclosure and an offer of independent counsel, rendered
             before execution and acknowledged into `disclosures`
```

### II.11.2 Co-Pilot constraints

```
NON-LAWYER ACCOUNTS:  the Co-Pilot is HARD-BLOCKED from generating legal advice or legal
                      instruments. Enforced SERVER-SIDE by account class — not by a
                      prompt instruction, which is not a control.
                      It may explain platform mechanics and surface the user's own
                      documents. It may not interpret them.
LAWYER ACCOUNTS:      a research and drafting assistant. Every output is attributed as
                      machine-generated; the lawyer is the responsible signer; nothing
                      is filed, sent, or executed without an explicit attorney act.
ALL ACCOUNTS:         no cross-matter retrieval (§II.3.4); privileged material excluded
                      from indexes absent a current representation.
```

### II.11.3 Attorney independence *(G4-17)*

```
Platform compliance checks are ADVISORY INPUTS DISPLAYED TO COUNSEL. They are never
preconditions on counsel's signature.

  · counsel MAY sign over a failed platform check, with a recorded rationale
  · counsel MAY decline to sign with every check green
  · the signature attests to counsel's OWN professional determination, in counsel's
    own words — it is not a machine-composed attestation
  · the signature is SEPARATED from the disbursement act (§II.7.4), so signing is
    an attestation and not a fund movement
```

---

## II.12 Monetization *(resolves G4-06, G4-26)*

### II.12.1 Fee structure

| Surface | Permitted | Forbidden | Rationale |
|---|---|---|---|
| Legal practice tools | Flat seat subscription | Any % of legal fees; any per-matter fee scaling with matter value | MRPC 5.4 fee-splitting; Group 1 §II.8.3 |
| Client routing | **Flat access subscription paid by the firm**, transaction-independent | Any per-referral fee; any fee contingent on the consumer engaging | MRPC 7.2(b); Group 1 §II.8.3 |
| Title & escrow | Flat per-transaction technology fee for services actually performed, disclosed | Any fee not for services performed; any split of a settlement fee | RESPA §8 (title and escrow are settlement services) |
| Arbitration | Flat published administrative fee, **invariant to outcome and to amount in controversy** | Any % of disputed funds; any fee varying with who prevails | §II.12.2 |
| Expediting | Flat platform fee paid by the expediter | Any fee on the escrowed cure principal | Group 1 §II.7.4 |
| Loss mitigation | **$0** | Any fee of any structure | Group 1 §II.7.5; MARS / Reg. O |

### II.12.2 Zero net revenue from dispute outcomes *(G4-06)*

```
STRUCTURAL COMMITMENT: the platform's net revenue from arbitration outcomes is ZERO.

  · flat published administrative fee, invariant to outcome and to amount in controversy
  · paid into a SEGREGATED administration account
  · arbitrator compensation FIXED at appointment, paid IN FULL regardless of outcome,
    from the administration account — never from disputed funds
  · the platform NEVER selects the arbitrator (§II.5.3)
  · disputed funds are held by a LICENSED THIRD-PARTY CUSTODIAN, not by the platform
  · the platform takes NO position, files no submissions, and has no standing in any matter

This is the only structure in which the forum can credibly be called neutral, and
neutrality is the property on which every award's enforceability depends.
```

### II.12.3 Obligation Lock

Inherited from Group 1 §II.8.5. A firm or party with an open matter, an active representation, funds in trust, or a pending arbitration is pinned to a free `ent.custodial` state on payment failure: full read, export, filing, signature, trust reconciliation, and dispute participation on existing matters; only net-new matter creation is withheld. **A dunning failure can never separate a client from their file, a party from the forum adjudicating their money, or funds from their reconciliation.**

---

# PART III — IMPLEMENTATION SPECIFICATION

## III.1 Schema Additions

Target migration files, sequenced after the Group 3 set (`0022`–`0026`):

- `0027_group4_taxonomy_expansion.sql` *(the 27-key correction — see Appendix D)*
- `0028_group4_firms_matters.sql`
- `0029_group4_privilege_conflicts.sql`
- `0030_group4_arbitration.sql`
- `0031_group4_trust_accounting.sql`
- `0032_group4_rls.sql`

### III.1.1 `0027_group4_taxonomy_expansion.sql`

```sql
-- Appendix D: the canonical count moves 25 → 27.
alter type user_role add value 'legal_arbitrator';
alter type user_role add value 'contractor_logistics';

-- `legal_arbitrator` gets its OWN group string. It is deliberately NOT `attorney`.
-- I-11: a neutral must never inherit advocacy scope.
create or replace function public.current_user_role_group()
returns text language sql stable security definer set search_path = public as $$
  select case current_user_role()::text
    when 'legal_arbitrator' then 'neutral'
    when 'contractor_logistics' then 'contractor'
    -- …existing 25 mappings unchanged…
  end;
$$;
```

### III.1.2 `0028_group4_firms_matters.sql`

```sql
create type bar_level    as enum ('B0','B1','B2','B3');
create type matter_kind  as enum
  ('transaction','title_escrow','municipal_cure','loss_mitigation','arbitration');
create type matter_role  as enum
  ('counsel_of_record','co_counsel','neutral','escrow_holder','party','expert','observer');

create table firms (
  id                uuid primary key default gen_random_uuid(),
  legal_name        text not null,
  bar_level         bar_level not null default 'B0',
  malpractice_expires_at timestamptz,
  conflict_system_attested_at timestamptz,
  created_at        timestamptz not null default now()
);

create table bar_admissions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  jurisdiction   text not null,
  bar_number     text not null,
  admitted_on    date not null,
  standing       text not null check (standing in ('active','inactive','suspended','disbarred')),
  verified_at    timestamptz not null,
  reverify_due   timestamptz not null,
  pro_hac_matter_id uuid,                    -- matter-scoped, expiring
  unique (user_id, jurisdiction)
);

create table firm_members (
  id        uuid primary key default gen_random_uuid(),
  firm_id   uuid not null references firms(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  seat_role text not null check (seat_role in
    ('responsible_attorney','attorney','paralegal','trust_operations','auditor')),
  unique (firm_id, user_id)
);

create table matters (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid references firms(id),
  kind         matter_kind not null,
  jurisdiction text not null,
  property_id  uuid references properties(id),
  deal_id      uuid references deals(id),
  facility_id  uuid references facilities(id),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  legal_hold   boolean not null default false,       -- §II.6.5
  sealed_at    timestamptz
);

-- THE Group 4 authorization primitive (§II.1)
create table matter_parties (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        matter_role not null,
  scope       text[] not null default '{}',
  expires_at  timestamptz,
  status      text not null default 'active' check (status in ('active','expired','revoked')),
  created_at  timestamptz not null default now(),
  unique (matter_id, user_id, role)
);
create index mp_lookup on matter_parties (user_id, matter_id, status);

-- The privilege edge: WHICH lawyer represents WHICH client on WHICH matter.
create table representations (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id) on delete cascade,
  attorney_id  uuid not null references users(id),
  client_id    uuid not null references users(id),
  firm_id      uuid references firms(id),
  engagement_doc_id uuid references documents(id),
  scope        text not null,
  opened_at    timestamptz not null default now(),
  terminated_at timestamptz,
  unique (matter_id, attorney_id, client_id)
);

-- I-10 / I-11: a neutral can hold no representation on the matter.
create or replace function guard_neutrality() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from matter_parties mp
              where mp.matter_id = new.matter_id and mp.user_id = new.attorney_id
                and mp.role = 'neutral' and mp.status = 'active') then
    raise exception 'I-10: a neutral cannot hold a representation on matter %', new.matter_id
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger representations_neutrality_guard before insert or update on representations
  for each row execute function guard_neutrality();

create or replace function guard_neutral_appointment() returns trigger
language plpgsql as $$
begin
  if new.role = 'neutral' then
    -- no representation on this matter…
    if exists (select 1 from representations r
                where r.matter_id = new.matter_id and r.attorney_id = new.user_id
                  and r.terminated_at is null) then
      raise exception 'I-10: cannot appoint as neutral — active representation exists'
        using errcode = '42501';
    end if;
    -- …nor on any matter sharing a party or a beneficial-owner cluster
    if exists (
      select 1 from representations r
        join matter_parties mp2 on mp2.matter_id = r.matter_id
       where r.attorney_id = new.user_id and r.terminated_at is null
         and mp2.user_id in (select user_id from matter_parties
                              where matter_id = new.matter_id and status = 'active')
    ) then
      raise exception 'I-10: cannot appoint as neutral — related representation exists'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger matter_parties_neutral_guard before insert or update on matter_parties
  for each row execute function guard_neutral_appointment();
```

### III.1.3 `0029_group4_privilege_conflicts.sql`

```sql
create type privilege_class as enum
  ('none','attorney_client','work_product','common_interest','settlement_privileged');

alter table documents
  add column matter_id           uuid references matters(id),
  add column privilege_class     privilege_class not null default 'none',
  add column privilege_holder_id uuid references users(id),
  add column superseded_by       uuid references documents(id),   -- §II.6.5
  add column tombstoned_at       timestamptz,
  add column content_hash        text;

create table conflict_checks (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references firms(id),
  matter_id       uuid references matters(id),
  subject_user_id uuid,
  subject_cluster text[],                      -- Group 2 §II.2.3 identity hashes
  result          text not null check (result in ('clear','hit','waived','screened','declined')),
  detail          jsonb not null,
  basis           text,
  run_at          timestamptz not null default now()
);
create rule conflict_checks_no_update as on update to conflict_checks do instead nothing;
create rule conflict_checks_no_delete as on delete to conflict_checks do instead nothing;

create table ethical_walls (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null references firms(id) on delete cascade,
  matter_id    uuid not null references matters(id) on delete cascade,
  screened_user_id uuid not null references users(id),
  basis        text not null,
  created_at   timestamptz not null default now(),
  lifted_at    timestamptz,
  unique (matter_id, screened_user_id)
);

create table wall_breach_attempts (
  id          uuid primary key default gen_random_uuid(),
  wall_id     uuid not null references ethical_walls(id),
  user_id     uuid not null references users(id),
  attempted_at timestamptz not null default now(),
  target      text not null
);

-- §II.7.5: signing authority replaces the caller-controlled party_user_id (VULN-07)
create table signing_authorities (
  id            uuid primary key default gen_random_uuid(),
  principal_id  uuid not null references users(id) on delete cascade,
  agent_id      uuid not null references users(id) on delete cascade,
  instrument_id uuid references documents(id) not null,   -- POA / resolution
  agreement_ids uuid[] not null,                          -- NAMED agreements only
  verified_by   uuid references users(id),
  verified_at   timestamptz not null,
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);

-- Records lifecycle (§II.6.5): correction by supersession, never silent edit.
create or replace function guard_document_immutability() returns trigger
language plpgsql as $$
begin
  if old.content_hash is distinct from new.content_hash
     and new.superseded_by is null and new.tombstoned_at is null then
    raise exception 'G4-22: documents are corrected by supersession, not edited'
      using errcode = '42501';
  end if;
  if exists (select 1 from matters m where m.id = new.matter_id and m.legal_hold)
     and new.tombstoned_at is not null and old.tombstoned_at is null then
    raise exception 'G4-22: legal hold suspends disposal on matter %', new.matter_id
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger documents_lifecycle_guard before update on documents
  for each row execute function guard_document_immutability();
```

### III.1.4 `0030_group4_arbitration.sql`

```sql
create type arb_stage as enum
  ('pre_exchange','initiated','slate_drawn','appointed','disclosure','challenged',
   'evidence','hearing','awarded','staging','released','vacated','withdrawn');
create type auth_class as enum ('self_authenticating','witness_authenticated','contested');

create table arbitrations (
  id                uuid primary key default gen_random_uuid(),
  matter_id         uuid not null references matters(id) on delete cascade,
  clause_tier       text not null check (clause_tier in ('commercial','consumer')),
  stage             arb_stage not null default 'pre_exchange',
  -- §II.5.4: schedule is a target with cause-based extension, NEVER a hard cap
  target_days       int not null default 30,
  extended_to       timestamptz,
  extension_order_id uuid references documents(id),
  -- §II.5.7 staging
  undisputed_baseline_cents bigint not null default 0,
  contested_delta_cents     bigint not null default 0,
  confirmation_window_ends  timestamptz,
  vacatur_petition_filed_at timestamptz,
  custodian_ref     text not null,               -- licensed third-party custodian
  created_at        timestamptz not null default now()
);

-- §II.5.8: the baseline is established BEFORE initiation. This is what makes
-- staged release computable and what defeats the hold-all-funds tactic.
create table pre_arbitration_exchanges (
  id              uuid primary key default gen_random_uuid(),
  arbitration_id  uuid not null references arbitrations(id) on delete cascade,
  party_id        uuid not null references users(id),
  position        jsonb not null,
  conceded_cents  bigint not null,
  submitted_at    timestamptz not null default now(),
  unique (arbitration_id, party_id)
);

create table arbitrator_roster (
  user_id            uuid primary key references users(id),
  qualifications     jsonb not null,
  admitted_at        timestamptz not null,
  suspended_at       timestamptz,
  -- §II.5.3: PUBLISHED to both parties before appointment is confirmed
  appointments_total int not null default 0,
  outcomes_by_party_type jsonb not null default '{}'::jsonb
);

create table arbitrator_slates (
  id             uuid primary key default gen_random_uuid(),
  arbitration_id uuid not null references arbitrations(id) on delete cascade,
  drawn_at       timestamptz not null default now(),
  candidates     uuid[] not null,
  draw_seed      text not null,                  -- verifiable randomness
  strikes        jsonb not null default '{}'::jsonb,
  appointed_id   uuid references users(id)
);

create table arbitrator_disclosures (
  id             uuid primary key default gen_random_uuid(),
  arbitration_id uuid not null references arbitrations(id) on delete cascade,
  arbitrator_id  uuid not null references users(id),
  disclosure     jsonb not null,
  disclosed_at   timestamptz not null default now(),
  supplemental_to uuid references arbitrator_disclosures(id)
);
create rule disclosures_no_update as on update to arbitrator_disclosures do instead nothing;

create table arbitrator_challenges (
  id             uuid primary key default gen_random_uuid(),
  arbitration_id uuid not null references arbitrations(id) on delete cascade,
  challenger_id  uuid not null references users(id),
  grounds        text not null,
  administrator_id uuid references users(id),     -- independent, NOT the platform
  outcome        text check (outcome in ('sustained','overruled')),
  decided_at     timestamptz
);

-- §II.5.4: party evidence has EQUAL standing with platform records.
create table arb_exhibits (
  id             uuid primary key default gen_random_uuid(),
  arbitration_id uuid not null references arbitrations(id) on delete cascade,
  offered_by     uuid not null references users(id),
  source         text not null check (source in ('platform_record','party_submission')),
  document_id    uuid references documents(id),
  evidence_bundle_id uuid references evidence_bundles(id),   -- Group 3 §II.9.3
  auth_class     auth_class not null default 'contested',
  ai_derived     boolean not null default false,
  ai_model_version text,
  ai_confidence  numeric,
  ai_error_profile jsonb,
  challenged_by  uuid references users(id),
  challenged_at  timestamptz,
  admitted_at    timestamptz
);

-- §II.10: a challenged AI conclusion can never alone support a finding.
create or replace function exhibit_may_support_finding(p_exhibit uuid)
returns boolean language sql stable as $$
  select not (e.ai_derived and e.challenged_at is not null)
    from arb_exhibits e where e.id = p_exhibit;
$$;

create table arb_awards (
  id             uuid primary key default gen_random_uuid(),
  arbitration_id uuid not null references arbitrations(id) on delete cascade,
  reasoned_text  text not null check (length(reasoned_text) >= 500),  -- §II.5.4
  relied_on      uuid[] not null,                 -- exhibit ids
  baseline_cents bigint not null,
  delta_cents    bigint not null,
  prevailing_party uuid references users(id),
  issued_at      timestamptz not null default now(),
  issued_by      uuid not null references users(id)
);

-- G4-02 / G4-24: the award does not move money, and the arbitrator holds no
-- financial signature. Release is a CUSTODIAN act under staging rules.
create table arb_releases (
  id             uuid primary key default gen_random_uuid(),
  arbitration_id uuid not null references arbitrations(id) on delete cascade,
  tranche        text not null check (tranche in ('baseline','delta')),
  amount_cents   bigint not null,
  basis          text not null check (basis in
                   ('award_baseline','window_expired','joint_instruction','court_confirmed')),
  executed_by    uuid not null references users(id),   -- custodian seat
  executed_at    timestamptz not null default now()
);

create or replace function guard_arb_release() returns trigger
language plpgsql as $$
declare a arbitrations;
begin
  select * into a from arbitrations where id = new.arbitration_id;
  -- the arbitrator can never execute a release
  if exists (select 1 from arb_awards w
              where w.arbitration_id = a.id and w.issued_by = new.executed_by) then
    raise exception 'G4-24: the arbitrator cannot execute a release' using errcode='42501';
  end if;
  if new.tranche = 'delta' then
    if a.vacatur_petition_filed_at is not null then
      raise exception 'G4-02: vacatur petition pending — delta held' using errcode='42501';
    end if;
    if new.basis = 'window_expired'
       and (a.confirmation_window_ends is null or a.confirmation_window_ends > now()) then
      raise exception 'G4-02: confirmation window has not expired' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger arb_releases_guard before insert on arb_releases
  for each row execute function guard_arb_release();
```

### III.1.5 `0031_group4_trust_accounting.sql`

```sql
create table trust_accounts (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references firms(id),
  account_kind   text not null check (account_kind in ('iolta','escrow_trust')),
  institution    text not null,
  licence_ref    text,
  bond_ref       text,
  bond_expires_at timestamptz,
  eo_expires_at  timestamptz,
  frozen_at      timestamptz,                    -- lapse or unreconciled break
  frozen_reason  text
);

create table trust_ledger (
  id             uuid primary key default gen_random_uuid(),
  trust_account_id uuid not null references trust_accounts(id),
  matter_id      uuid not null references matters(id),
  direction      text not null check (direction in ('deposit','disbursement')),
  usd_amount_cents bigint not null check (usd_amount_cents > 0),
  payee_ref      text,
  maker_id       uuid references users(id),
  checker_id     uuid references users(id),      -- I-7
  frozen         boolean not null default false, -- §II.7.3 disputed deposit
  executed_at    timestamptz,
  created_at     timestamptz not null default now(),
  check (maker_id is null or checker_id is null or maker_id <> checker_id)
);

create table trust_reconciliations (
  id             uuid primary key default gen_random_uuid(),
  trust_account_id uuid not null references trust_accounts(id),
  as_of          date not null,
  bank_cents     bigint not null,
  ledger_cents   bigint not null,
  file_cents     bigint not null,
  break_cents    bigint generated always as (greatest(
                    abs(bank_cents - ledger_cents), abs(ledger_cents - file_cents))) stored,
  reconciled_by  uuid references users(id),
  unique (trust_account_id, as_of)
);

create table disputed_deposits (                 -- §II.7.3
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  amount_cents   bigint not null,
  claimants      uuid[] not null,
  frozen_at      timestamptz not null default now(),
  release_basis  text check (release_basis in
                   ('mutual_instruction','staged_award','court_order','interpleader')),
  released_at    timestamptz
);

-- G4-10 / G4-11: no unilateral release; no release from a frozen or lapsed account;
-- no release of a disputed deposit absent an enumerated basis.
create or replace function guard_trust_disbursement() returns trigger
language plpgsql as $$
declare acct trust_accounts; thr bigint := 1000000;   -- $10,000 default
begin
  if new.direction <> 'disbursement' or new.executed_at is null then return new; end if;
  select * into acct from trust_accounts where id = new.trust_account_id;
  if acct.frozen_at is not null then
    raise exception 'G4-10: trust account frozen (%)', acct.frozen_reason using errcode='42501';
  end if;
  if acct.bond_expires_at < now() or acct.eo_expires_at < now() then
    raise exception 'G4-10: bond or E&O lapsed — disbursement frozen' using errcode='42501';
  end if;
  if new.usd_amount_cents >= thr and (new.maker_id is null or new.checker_id is null) then
    raise exception 'I-7: dual control required above threshold' using errcode='42501';
  end if;
  if exists (select 1 from disputed_deposits d
              where d.matter_id = new.matter_id and d.released_at is null) then
    raise exception 'G4-11: disputed deposit frozen — mutual instruction, staged award, or court order required'
      using errcode='42501';
  end if;
  return new;
end $$;
create trigger trust_ledger_disbursement_guard before insert or update on trust_ledger
  for each row execute function guard_trust_disbursement();

-- §II.7.4: the recording confirmation artifact Groups 2 and 3 depend on.
create table recording_confirmations (
  id              uuid primary key default gen_random_uuid(),
  matter_id       uuid not null references matters(id),
  property_id     uuid not null references properties(id),
  jurisdiction    text not null,
  instrument_number text not null,
  recording_date  date not null,
  resulting_lien_position int,
  confirmed_by    uuid not null references users(id),   -- legal_title officer
  confirmed_at    timestamptz not null default now(),
  unique (jurisdiction, instrument_number)
);

-- §II.9.2: no short-sale disbursement outside the lender-approved statement.
create table short_sale_approvals (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  lienholder_id  uuid references users(id),
  approval_doc_id uuid references documents(id) not null,
  approved_lines jsonb not null,                 -- payee + amount, per line
  approved_at    timestamptz not null
);

create or replace function guard_short_sale_disbursement() returns trigger
language plpgsql as $$
declare ok boolean;
begin
  if not exists (select 1 from matters m
                  where m.id = new.matter_id and m.kind = 'loss_mitigation') then
    return new;
  end if;
  select exists (
    select 1 from short_sale_approvals s,
         lateral jsonb_array_elements(s.approved_lines) l
     where s.matter_id = new.matter_id
       and l->>'payee' = new.payee_ref
       and (l->>'amount_cents')::bigint >= new.usd_amount_cents
  ) into ok;
  if not ok then
    raise exception 'G4-13: disbursement not on the lender-approved settlement statement'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trust_ledger_short_sale_guard before insert on trust_ledger
  for each row when (new.direction = 'disbursement')
  execute function guard_short_sale_disbursement();
```

## III.2 RLS Helper Functions

```sql
-- ── The Group 4 authorization predicate (Invariant I-1) ────────────────────
create or replace function public.is_matter_party(
  p_matter uuid, p_facet text default null, p_role matter_role default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matter_parties mp
     where mp.matter_id = p_matter and mp.user_id = auth.uid()
       and mp.status = 'active'
       and (mp.expires_at is null or mp.expires_at > now())
       and (p_facet is null or p_facet = any(mp.scope))
       and (p_role  is null or mp.role = p_role)
  )
  -- ethical walls override membership (§II.6.2)
  and not exists (
    select 1 from ethical_walls w
     where w.matter_id = p_matter and w.screened_user_id = auth.uid()
       and w.lifted_at is null
  );
$$;

-- ── Privilege: only the holder and their current counsel. NO admin branch. ─
create or replace function public.may_read_privileged(
  p_matter uuid, p_holder uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select p_holder = auth.uid()
      or exists (select 1 from representations r
                  where r.matter_id = p_matter
                    and r.client_id = p_holder
                    and r.attorney_id = auth.uid()
                    and r.terminated_at is null)
      or exists (select 1 from representations r
                  join firm_members fm on fm.firm_id = r.firm_id
                  where r.matter_id = p_matter and r.client_id = p_holder
                    and r.terminated_at is null and fm.user_id = auth.uid()
                    and not exists (select 1 from ethical_walls w
                                     where w.matter_id = p_matter
                                       and w.screened_user_id = auth.uid()
                                       and w.lifted_at is null));
$$;

-- ── Bar standing + jurisdiction (§II.2) ────────────────────────────────────
create or replace function public.bar_active(p_jurisdiction text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bar_admissions b
                  where b.user_id = auth.uid() and b.jurisdiction = p_jurisdiction
                    and b.standing = 'active' and b.reverify_due > now());
$$;

-- ── I-11: the neutrality session wall ──────────────────────────────────────
create or replace function public.holds_neutral_appointment()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matter_parties mp
                  where mp.user_id = auth.uid() and mp.role = 'neutral'
                    and mp.status = 'active');
$$;
```

## III.3 Group 4 RLS Policies — `0032_group4_rls.sql`

**This migration closes VULN-05 — read and write — for the first time.**

```sql
-- agreements: the attorney group branch is REMOVED (G4-08, Appendix B) -----
drop policy if exists "agreements_party_access" on agreements;
create policy "agreements_matter_access" on agreements for select
  using (
    parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or exists (select 1 from matters m
                where m.id = agreements.matter_id and is_matter_party(m.id, 'instruments'))
    or current_user_role_group() = 'admin'
  );
-- NOTE: `current_user_role() in ('attorney','admin')` is GONE. An attorney reaches
-- an agreement by being a party or holding a matter role. Nothing else.

drop policy if exists "agreements_party_insert" on agreements;
drop policy if exists "agreements_party_update" on agreements;
create policy "agreements_matter_insert" on agreements for insert
  with check (exists (select 1 from matters m
                       where m.id = matter_id
                         and is_matter_party(m.id, 'instruments', 'counsel_of_record'))
              and bar_active((select jurisdiction from matters where id = matter_id)));
create policy "agreements_matter_update" on agreements for update
  using (exists (select 1 from matters m
                  where m.id = agreements.matter_id
                    and is_matter_party(m.id, 'instruments', 'counsel_of_record')));

-- documents: privilege is enforced, and there is NO admin branch on it ----
drop policy if exists "documents_scoped_access_v2" on documents;
create policy "documents_privilege_scoped" on documents for select
  using (
    case when documents.privilege_class = 'none' then (
      documents.uploaded_by = auth.uid()
      or has_property_capacity(documents.property_id, null, 'V2')
      or exists (select 1 from deals d where d.primary_property_id = documents.property_id
                  and is_deal_member(d.id, 'documents'))
      or exists (select 1 from facilities f where f.id = documents.facility_id
                  and is_facility_party(f.id, 'documents'))
      or (documents.matter_id is not null and is_matter_party(documents.matter_id, 'documents'))
      or current_user_role_group() = 'admin'
    ) else
      -- PRIVILEGED: holder or current counsel ONLY. Admin uses audited break-glass.
      may_read_privileged(documents.matter_id, documents.privilege_holder_id)
    end
    and documents.tombstoned_at is null
  );

-- matters / matter_parties ------------------------------------------------
alter table matters enable row level security;
create policy "matters_party_select" on matters for select
  using (is_matter_party(matters.id) or current_user_role_group() = 'admin');
alter table matter_parties enable row level security;
create policy "mp_self_or_matter_select" on matter_parties for select
  using (user_id = auth.uid() or is_matter_party(matter_id) or current_user_role_group() = 'admin');

-- representations: the privilege edge is itself sensitive ------------------
alter table representations enable row level security;
create policy "reps_scoped_select" on representations for select
  using (attorney_id = auth.uid() or client_id = auth.uid()
         or exists (select 1 from firm_members fm
                     where fm.firm_id = representations.firm_id and fm.user_id = auth.uid()));

-- arbitration: the neutral sees the RECORD ONLY (I-12) --------------------
alter table arb_exhibits enable row level security;
create policy "exhibits_record_access" on arb_exhibits for select
  using (exists (select 1 from arbitrations a
                  where a.id = arb_exhibits.arbitration_id
                    and is_matter_party(a.matter_id)));
-- The neutral's matter_role is 'neutral'; is_matter_party() grants the record.
-- Privileged documents remain unreachable because may_read_privileged() has no
-- neutral branch. Neutrality is enforced by the ABSENCE of a grant, not by a filter.

alter table arbitrator_roster enable row level security;
create policy "roster_public_stats" on arbitrator_roster for select using (true);
-- §II.5.3: appointment history and outcome distribution are PUBLISHED.

alter table arb_releases enable row level security;
create policy "releases_no_interactive_insert" on arb_releases for insert with check (false);
-- Releases are executed by the custodian service role under §II.5.7 staging rules.
-- No interactive session — arbitrator, counsel, or party — can move disputed funds.

-- trust ledger ------------------------------------------------------------
alter table trust_ledger enable row level security;
create policy "trust_matter_select" on trust_ledger for select
  using (is_matter_party(matter_id, 'trust') or current_user_role_group() = 'admin');
create policy "trust_dual_control_insert" on trust_ledger for insert
  with check (
    is_matter_party(matter_id, 'trust', 'escrow_holder')
    and (usd_amount_cents < 1000000 or (maker_id is not null and checker_id is not null
                                        and maker_id <> checker_id))
  );

-- wall breach attempts are recorded, never readable by the screened user ---
alter table wall_breach_attempts enable row level security;
create policy "wba_admin_only" on wall_breach_attempts for select
  using (current_user_role_group() = 'admin');
```

## III.4 `matter_workspace_manifest()`

```sql
create or replace function public.matter_workspace_manifest()
returns jsonb
language sql stable security definer set search_path = public as $$
with me as (
  select mp.matter_id, mp.role, m.kind, m.firm_id, m.jurisdiction, m.sealed_at
    from matter_parties mp join matters m on m.id = mp.matter_id
   where mp.user_id = auth.uid() and mp.status = 'active'
     and (mp.expires_at is null or mp.expires_at > now())
     and m.sealed_at is null
     and not exists (select 1 from ethical_walls w
                      where w.matter_id = m.id and w.screened_user_id = auth.uid()
                        and w.lifted_at is null)
),
neutral as (select bool_or(role = 'neutral') as is_neutral from me)
select jsonb_build_object(
  'upsell_allowed', true,
  -- I-11: the two trees are MUTUALLY EXCLUSIVE. A neutral session shows only
  -- neutral matters; no advocacy workspace is reachable.
  'session_mode', case when coalesce((select is_neutral from neutral), false)
                       then 'neutral' else 'advocacy' end,
  'workspaces', coalesce(jsonb_agg(jsonb_build_object(
      'matter_id', me.matter_id,
      'kind',      me.kind,
      'role',      me.role,
      'subtabs', case
        when me.role = 'neutral' then
          jsonb_build_array('record','submissions','disclosure','award_staging')
        when me.kind = 'transaction' then
          jsonb_build_array('client_file','instruments','title','trust','timeline')
        when me.kind = 'title_escrow' then
          jsonb_build_array('encumbrance','commitment','escrow_trust',
                            'disputed_deposits','clearance')
        when me.kind = 'municipal_cure' then
          jsonb_build_array('violation_record','hearings','cure_filings',
                            'engagement','interaction_log')
        when me.kind = 'loss_mitigation' then
          jsonb_build_array('client_file','servicer_log','workout','independence')
        else jsonb_build_array('timeline') end
  ) order by me.kind)
    filter (where (me.role = 'neutral')
                = coalesce((select is_neutral from neutral), false)), '[]'::jsonb)
) from me;
$$;
```

## III.5 API Contracts

### `POST /api/matters`
```
Request  { kind, jurisdiction, property_id?, deal_id?, facility_id?, parties[] }
Guards   bar_active(jurisdiction) for legal roles; firm B2+
Effect   runs the §II.6.1 conflict screen against clients, adverse parties, affiliates,
         and Group 2 beneficial-owner clusters BEFORE the matter opens; records the
         result append-only
Errors   409 CONFLICT_HIT { detail } · 403 BAR_NOT_ACTIVE · 451 JURISDICTION_NOT_ADMITTED
```

### `POST /api/matters/:id/representations`
```
Guards   guard_neutrality() — a neutral on this matter cannot take a representation
Effect   creates the privilege edge; imputes conflicts across the firm; where screening
         applies, creates the ethical_walls rows
Errors   403 NEUTRALITY_VIOLATION · 409 IMPUTED_CONFLICT
```

### `POST /api/arbitrations`
```
Request  { matter_id, clause_tier }
Guards   the §II.5.8 PRE-ARBITRATION EXCHANGE must be complete for all parties —
         an arbitration cannot initiate without the undisputed baseline established
Effect   computes undisputed_baseline_cents from the exchanges; moves the contested
         delta to the licensed custodian; draws a slate
Errors   409 EXCHANGE_INCOMPLETE · 409 CONSUMER_OPTED_OUT · 451 CLAIM_CARVED_OUT
```

### `POST /api/arbitrations/:id/slate`
```
Effect   draws candidates by VERIFIABLE RANDOMNESS from the qualified roster.
         The platform applies no ranking and no outcome-based curation.
         Returns each candidate WITH their published appointment history and
         outcome distribution by party type (§II.5.3).
Then     parties strike and rank; unresolved → random selection from the remainder.
         THERE IS NO PLATFORM-SELECTION CODE PATH.
```

### `POST /api/arbitrations/:id/exhibits`
```
Request  { source: 'platform_record' | 'party_submission', document_id | bundle_id }
Guards   matter party; the evidence window is open
Effect   party submissions carry EQUAL standing with platform records.
         AI-derived items are stamped with model version, confidence, and error profile
         and are labelled on the face of the exhibit (§II.10).
```

### `POST /api/arbitrations/:id/award`
```
Guards   caller is the appointed neutral; reasoned_text ≥ 500 chars; relied_on[] must
         reference admitted exhibits; a challenged AI-derived exhibit cannot be the sole
         support for a finding (exhibit_may_support_finding)
Effect   issues the award and sets the staging split. MOVES NO MONEY.
Errors   422 REASONED_AWARD_REQUIRED · 409 UNSUPPORTED_FINDING
```

### `POST /api/arbitrations/:id/release`
```
Guards   CUSTODIAN SERVICE ROLE ONLY — no interactive session can call this
         · baseline: releases immediately on the award
         · delta:    requires window_expired | joint_instruction | court_confirmed
                     AND no vacatur petition on file
Errors   403 CUSTODIAN_ONLY · 409 CONFIRMATION_WINDOW_ACTIVE · 409 VACATUR_PENDING
```

### `POST /api/trust/disbursements`
```
Guards   escrow_holder on the matter; account not frozen; bond and E&O current;
         dual control above threshold with maker <> checker; no disputed-deposit freeze;
         for loss_mitigation matters, the payee and amount MUST match an approved
         short-sale settlement line
Errors   403 DUAL_CONTROL_REQUIRED · 423 DEPOSIT_DISPUTED · 423 ACCOUNT_FROZEN
         · 403 NOT_ON_APPROVED_SETTLEMENT_STATEMENT
```

### `POST /api/title/recording-confirmations`
```
Guards   legal_title at B3; jurisdiction admitted
Effect   creates the artifact consumed by Group 2 §II.7.3 (condition C) and
         Group 3 §II.5.6 (funding precondition). This closes the requests in
         Group 2 §V.3 and Group 3 §V.3.
```

### `PATCH /api/agreements` *(VULN-07 closure)*
```
CHANGE   the caller-controlled `party_user_id` parameter is REMOVED.
Default  signingUserId = auth.uid()
Proxy    permitted ONLY with a verified, unexpired signing_authority naming THIS
         agreement; the principal is notified out-of-band; the signature is recorded
         as a proxy signature naming the authority relied on
Errors   403 SIGNING_AUTHORITY_REQUIRED · 403 AUTHORITY_SCOPE_MISMATCH
```

### `GET|POST /api/copilot` *(Group 4 context)*
```
Request  { firmId, matterId, matterRole, epoch, messages }
Guards   is_matter_party(matterId) → else 403, model NOT invoked
Effect   · NO CROSS-MATTER RETRIEVAL, EVER (privilege requirement)
         · privileged material excluded from the index absent a current representation
         · a neutral session's retrieval scope is the admitted record only
         · NON-LAWYER ACCOUNTS: legal advice and instrument generation are HARD-BLOCKED
           server-side by account class (§II.11.2) — not by prompt instruction
```

## III.6 TypeScript Registry Deltas

```ts
// src/lib/rbac/roles.ts — Appendix D: 25 → 27 keys
legal_transactional:   ['legal', 'escrow'],
legal_title:           ['legal', 'escrow'],
legal_expediter:       ['legal', 'escrow'],
legal_loss_mitigation: ['legal', 'escrow'],
legal_arbitrator:      ['legal'],              // NEW — deliberately NO 'escrow'.
                                               // A neutral holds no financial surface.
contractor_logistics:  ['contractor', 'escrow'], // NEW (Group 5 owns the detail)

// ROLE_GROUP_MAP — legal_arbitrator is NOT 'attorney'
legal_arbitrator: 'neutral',      // I-11
contractor_logistics: 'contractor',

// src/lib/rbac/matter.ts — NEW.
export type MatterRole =
  | 'counsel_of_record' | 'co_counsel' | 'neutral'
  | 'escrow_holder' | 'party' | 'expert' | 'observer';
export type PrivilegeClass =
  | 'none' | 'attorney_client' | 'work_product' | 'common_interest' | 'settlement_privileged';

/** Mirrors is_matter_party(); includes the ethical-wall override. */
export async function assertMatterParty(
  supabase: SupabaseClient, matterId: string,
  facet?: string, role?: MatterRole,
): Promise<void>;

/** Mirrors may_read_privileged(). There is no admin bypass. */
export async function assertPrivilegeAccess(
  supabase: SupabaseClient, matterId: string, holderId: string,
): Promise<void>;

/** Throws if the caller holds any neutral appointment (I-11 session wall). */
export async function assertNotNeutral(supabase: SupabaseClient): Promise<void>;

/** Account-class gate for the Co-Pilot legal-content block (§II.11.2). */
export function isLawyerAccount(role: string | null): boolean;
```

---

# PART IV — VERIFICATION

## IV.1 Privilege & Neutrality Isolation Matrix

Actor holds a role on **Matter A**. Columns are what they may reach on **Matter B**, and on Matter A's *other* parties.

| Actor | B agreements | B privileged docs | A opposing party's privileged docs | A shared record | B trust ledger |
|---|---|---|---|---|---|
| `legal_transactional` counsel on A | ❌ | ❌ | ❌ | ✅ | ❌ |
| `legal_title` escrow holder on A | ❌ | ❌ | ❌ | ✅ (txn docs) | ❌ |
| `legal_expediter` on A | ❌ | ❌ | ❌ | ✅ (scoped) | ❌ |
| `legal_loss_mitigation` on A | ❌ | ❌ | ❌ | ✅ (scoped) | ❌ |
| **`legal_arbitrator` neutral on A** | ❌ | ❌ | ❌ **never** | admitted record only | ❌ |
| Firm colleague, unscreened | ❌ | ❌ | ❌ | via representation | ❌ |
| Firm colleague, **screened** | ❌ | ❌ | ❌ | ❌ **walled** | ❌ |
| `admin` | break-glass, audited | **break-glass, holder-visible** | break-glass, holder-visible | break-glass | break-glass |

Two load-bearing rows: the **neutral** reaches the admitted record and nothing else — enforced by the absence of a grant in `may_read_privileged()`, not by a filter — and **privileged reads have no ordinary `admin` branch**, only a break-glass the privilege holder can see.

## IV.2 Acceptance Criteria

**Privilege & conflicts (VULN-05 closure)**
- [ ] `grep -rn "current_user_role" supabase/migrations/` returns **zero** hits containing `'attorney'`. *(G4-08 / Appendix B, CI-enforced.)*
- [ ] A `legal_title` officer cannot read an agreement on a matter they hold no role on. *(Direct `supabase-js` query under a real session.)*
- [ ] A `legal_transactional` attorney cannot INSERT or UPDATE an agreement on an unrelated matter. *(The write half of VULN-05.)*
- [ ] Privileged documents are unreachable by any attorney without a current, unterminated representation of the privilege holder — verified across all five legal sub-roles.
- [ ] A terminated representation removes access within the session and the matter's transcript leaves the retrieval index within 24h.
- [ ] A screened firm member's read of a walled matter **fails at the database** and is recorded in `wall_breach_attempts`.
- [ ] Opening a matter without a completed conflict screen is rejected; the screen resolves Group 2 beneficial-owner clusters, not just direct user ids.
- [ ] A privilege log generates per matter and is complete against the document set.

**Neutrality (I-10 / I-11 / I-12)**
- [ ] Appointing a user as `neutral` on a matter where they hold a representation is rejected by trigger.
- [ ] Appointing a user as `neutral` on a matter sharing a party with any matter they are counsel on is rejected.
- [ ] Creating a representation for a user who is `neutral` on that matter is rejected.
- [ ] `legal_arbitrator` resolves to group string `neutral`, **not** `attorney`. *(Enum + function test.)*
- [ ] `getAllowedApps('legal_arbitrator')` does **not** include `escrow` — a neutral has no financial surface.
- [ ] `matter_workspace_manifest()` in neutral mode returns **no** advocacy workspace, and vice versa.
- [ ] A neutral cannot read any privileged document on their own matter.

**Arbitration**
- [ ] An arbitration cannot initiate without a completed pre-arbitration exchange from every party. *(§II.5.8 — this is what makes staging computable.)*
- [ ] **No code path lets the platform select an arbitrator.** *(Static analysis: the only appointment paths are strike-and-rank and verifiable random draw.)*
- [ ] Candidate slates return published appointment history and outcome distribution by party type.
- [ ] An award with `reasoned_text` under 500 characters is rejected.
- [ ] A finding resting solely on a challenged AI-derived exhibit is rejected.
- [ ] Party submissions and platform records are indistinguishable in evidentiary standing — asserted by the absence of any weighting field or ordering preference.
- [ ] **The arbitrator cannot execute a release.** `arb_releases` insert by the award's `issued_by` is rejected by trigger. *(G4-24.)*
- [ ] **No interactive session of any role can insert into `arb_releases`.** *(Policy `with check (false)`; custodian service role only.)*
- [ ] Baseline releases immediately on the award; delta release before the confirmation window expires is rejected. *(G4-02.)*
- [ ] A filed vacatur petition holds the delta; a release attempt returns `409 VACATUR_PENDING`.
- [ ] A consumer-tier clause carries the 30-day opt-out, the statutory carve-outs, no class waiver, and the cost cap; an opted-out consumer's matter cannot be initiated into arbitration.
- [ ] Lien and prompt-payment claims are carved out and cannot be routed into the forum.
- [ ] The smaller party's cost exposure never exceeds the small-claims-equivalent cap.

**Trust & custody**
- [ ] A disbursement above threshold with `maker_id = checker_id` is rejected by check constraint **and** by policy.
- [ ] A disbursement from an account with a lapsed bond or E&O is rejected.
- [ ] A disputed deposit freezes; release without `mutual_instruction`, `staged_award`, `court_order`, or `interpleader` is rejected. *(G4-11.)*
- [ ] **No UI affordance exists for a title officer to determine breach.** *(Route inventory + component scan.)*
- [ ] A short-sale matter disbursement whose payee and amount do not match an approved settlement line is rejected. *(G4-13 — asserted at the DB, not the API.)*
- [ ] An unreconciled break beyond tolerance freezes disbursement.
- [ ] A payout account change is delayed and out-of-band confirmed.
- [ ] No platform fee is ever assessed against trust principal. *(Ledger invariant test.)*

**Settlement & records**
- [ ] No settlement path releases funds to a seller wallet; the only payee class is licensed settlement. *(Static analysis, mirroring Group 2's `settlement-lint`.)*
- [ ] A `recording_confirmations` row is produced and is consumable by Group 2 §II.7.3 and Group 3 §II.5.6. *(Cross-group integration test.)*
- [ ] A document content change without a supersession or tombstone is rejected.
- [ ] A legal hold blocks tombstoning; removing the hold requires an authorized act by someone other than the party subject to it.
- [ ] A sealed matter disappears from every retrieval surface while the sealing act remains auditable.

**UPL & independence**
- [ ] The Co-Pilot refuses to generate legal advice or an instrument for a non-lawyer account — **enforced server-side by account class**, verified by calling the route directly with a modified client. *(G4-14.)*
- [ ] No recommendation engine selects an instrument for a non-lawyer; template selection surfaces carry no advisory ranking.
- [ ] An attorney can sign over a failed platform check with a recorded rationale, and can decline with all checks green. *(MRPC 5.4(c), G4-17.)*
- [ ] Signature and disbursement are separate acts — signing an attestation moves no funds.
- [ ] `PATCH /api/agreements` rejects a `party_user_id` parameter outright; proxy signing requires a verified, unexpired, agreement-scoped authority and notifies the principal. *(VULN-07 closure.)*

**Expediter**
- [ ] No endpoint or tile returns a violation heatmap, severity score, sweep prediction, or opportunity ranking. *(G4-23; `score-lint` extension.)*
- [ ] Contacting an owner runs through the Group 1 consent ladder; a `private` parcel returns `403 SOLICITATION_SUPPRESSED`.
- [ ] A contractor cannot engage an expediter on a violation arising from its own work.
- [ ] Cure escrow reverts in full at `deadline_at` with no platform fee. *(Group 1 §II.7.4 parity.)*
- [ ] Cure velocity anomalies raise review; no surface presents anomalous velocity as a success metric.

## IV.3 CI Guardrails

Groups 1–3 guardrails are inherited. Group 4 adds:

```
policy-lint       — extended: ZERO occurrences of 'attorney' inside current_user_role()
                    or current_user_role_group() predicates (G4-08 / Appendix B)
privilege-lint    — fails if any serializer, export, index, or Co-Pilot retrieval path can
                    emit a row with privilege_class <> 'none' without a may_read_privileged()
                    check on the same path
neutrality-lint   — fails if any code path can produce a matter_parties row with role
                    'neutral' for a user holding a representation on that matter or a
                    party-sharing matter (I-10)
selection-lint    — fails if any code path assigns an arbitrator other than strike-and-rank
                    or verifiable random draw (G4-03/G4-06)
release-lint      — extended: fails if arb_releases is reachable from any interactive route,
                    or if the award issuer can appear as executed_by (G4-02/G4-24)
trust-lint        — fails if any disbursement path can execute without dual control above
                    threshold, or from a frozen/lapsed account, or against a disputed deposit
settlement-lint   — extended: fails if any Group 4 disbursement can resolve a payee that is
                    not licensed settlement or an approved short-sale line (G4-13/G4-15)
upl-lint          — fails if any model invocation with legal-content capability is reachable
                    from a non-lawyer account class (G4-14)
immutability-lint — fails if any path mutates document content without supersession or
                    tombstone, or tombstones under a legal hold (G4-22)
fee-lint          — extended: fails on any fee constant multiplying matter value, disputed
                    amount, legal fees, or short-sale proceeds (G4-06/G4-26)
```

## IV.4 Telemetry

**Forum integrity (the G4-07 signals):** dispute-initiation rate per party and per counterparty class; the ratio of contested delta to undisputed baseline per initiator — a party whose disputes are overwhelmingly baseline with a thin contested sliver is using the forum to delay payment; settlement rate at the pre-arbitration exchange; arbitrator appointment concentration per party; outcome distribution by party type per arbitrator; challenge rate and sustain rate; vacatur petition rate and outcome; median time to award and extension frequency.

**Practice health:** conflict hit rate and disposition mix; wall breach attempts; representation termination-to-index-purge latency; privilege log generation completeness; bar re-verification lapses.

**Trust integrity:** reconciliation break rate and age; dual-control bypass attempts; frozen-account disbursement attempts; payee change attempts; disputed deposit duration.

**Municipal integrity:** cure velocity distribution per jurisdiction with outlier flags; contractor↔expediter pairing concentration; owner-selected versus inbound engagement mix; anti-corruption attestation currency.

**Security counters (paged, not dashboarded):** any read attempt on privileged material without a representation; any neutral appointment blocked by I-10; any attempt to insert `arb_releases` from an interactive session; any short-sale disbursement blocked by the approved-statement guard; any non-lawyer account reaching a legal-content model path; any `party_user_id` parameter observed on the agreements route.

**Deliberately not collected:** the content of privileged material in any analytics, aggregate, or model-training surface — in scope for `privilege-lint`.

---

# PART V — RESIDUAL RISK & BAR / REGULATORY REVIEW QUEUE

## V.1 Accepted residual risks

| Risk | Why accepted | Compensating control |
|---|---|---|
| A vacatur petition filed purely to delay the contested delta | The FAA gives the right; the platform cannot condition it | Baseline releases immediately regardless (§II.5.7); petition rate and outcome monitored per party; frivolous-petition cost-shifting in the clause |
| An arbitrator who discloses fully and is still subtly captured | Disclosure cannot eliminate incentive | Published outcome distribution by party type, appointment caps, mandatory rotation, party strikes, independent challenge administrator |
| Privilege waiver arguments from platform hosting itself | A third-party host is a known privilege question in every practice-management product | Holder-scoped access with no ordinary admin branch; break-glass visible to the holder; per-matter privilege log; documented confidentiality architecture for the client's own waiver analysis |
| Off-platform conduct between a contractor and an expediter | The platform cannot observe relationships it is not party to | Pairing-concentration monitoring, owner selection, cure-velocity anomaly detection, anti-corruption attestation and suspension |
| A jurisdiction that treats the template library as UPL despite the boundary | UPL lines vary by state and are unsettled | Per-jurisdiction counsel approval of templates, jurisdiction capability gating, no selection or advisory layer, counsel offer on every instrument |

## V.2 Blocking bar and regulatory review items

Each is a build-blocker for its surface.

1. **UPL, per launch state.** Whether the template library, instrument generation, and the Co-Pilot's non-lawyer surfaces cross the line. **Blocks:** all consumer-facing instrument generation across Groups 1, 2, and 4.
2. **MRPC 5.4 fee structures.** Confirm the flat access subscription, the arbitration administrative fee, and the title technology fee are not fee-splitting or referral payments in each state. **Blocks:** all Group 4 monetization.
3. **MRPC 5.4(c) independence.** Confirm §II.11.3 sufficiently separates platform checks from professional judgment. **Blocks:** attorney attestation workflows.
4. **Privilege architecture opinion.** A written analysis a client's own counsel can rely on regarding hosting, access, break-glass, and waiver exposure. **Blocks:** firm onboarding at scale — this is the adoption gate as much as the legal one.
5. **Arbitration clause enforceability, per state and per counterparty class.** Unconscionability, consumer carve-outs, lien and prompt-payment non-waivability, §402 election. **Blocks:** the clause, and therefore every escrow that relies on it.
6. **Arbitration administration.** Whether the platform is administering arbitrations in a regulated sense, whether an independent administering body is required, and the §II.5.3 selection mechanics. **Blocks:** the forum.
7. **Escrow and trust.** State escrow agent licensing, IOLTA compliance, three-way reconciliation standards, and whether any part of the rail is money transmission. Shared with Group 1 item 1, Group 2 item 5, Group 3 item 8. **Blocks:** all custody.
8. **MARS / Reg. O.** Confirm the funding-commitment model and the §II.9.2 short-sale controls are outside the advance-fee prohibition in every launch state. Shared with Group 1 item 4. **Blocks:** loss mitigation.
9. **Short-sale disbursement.** Confirm the approved-statement guard is sufficient and that the specialist's compensation disclosure satisfies lender requirements. **Blocks:** short-sale workflows.
10. **RESPA §8.** Title and escrow are settlement services; confirm every Group 4 fee is for services actually performed. Shared with Group 1 item 2. **Blocks:** title and escrow monetization.
11. **Records, retention, and deletion.** Bar file-retention rules per state against the §II.6.5 lifecycle, plus consumer deletion rights and legal-hold interaction. **Blocks:** the records layer.
12. **Municipal registration and anti-corruption.** Expediter registration requirements per jurisdiction and the adequacy of §II.8.3. **Blocks:** the expediter product per jurisdiction.
13. **Evidence and adjudication.** Whether §II.10's authentication classes and AI-labelling satisfy the standard an award needs to survive a §10(a)(3) challenge.

## V.3 Cross-group items surfaced here, owned elsewhere

- **Group 1** must consume the §II.9.4 grant object in the Exposure & Privacy subtab and surface the loss-mitigation access log there.
- **Group 2** must consume `recording_confirmations` as assignment escrow condition C, and must accept that the assignment board is unreachable by `legal_*` roles absent a matter role.
- **Group 3** must consume `recording_confirmations` as the §II.5.6 funding precondition, and route §II.9.6 SLA escalation and the §II.9.7 tripwire into `legal_arbitrator` matters under this document's protocol.
- **Group 5** owns `contractor_logistics`, the second of the two keys missing from the canonical count (Appendix D).
- **Group 8** must supply bar-standing verification, escrow licensure and bond monitoring, and expediter registration checks.

---

# APPENDIX A — BOUNDARY CONTRACT WITH GROUPS 1–3

Extends the Group 2 and Group 3 boundary tables.

| # | Contested surface | Prior position | Group 4 draft position | **Resolution** |
|---|---|---|---|---|
| A24 | Arbitration clause scope | G1 §II.6.5: consumer opt-out, carve-outs, no class waiver, cost-shifting | "Hardcoded, binding" in every agreement | **G1 governs and is implemented.** Clause tiers by counterparty class (§II.5.2). |
| A25 | Award finality | G1/G2/G3 all treat awards as terminal | "Final, unappealable"; self-executing | **Both corrected.** FAA review preserved; staged release keeps the vacatur remedy alive (§II.5.7). |
| A26 | Agreements access | VULN-05 deferred by G1 and G2 to Group 4 | Attorney group reads all agreements | **Closed here.** Matter role and representation only; the `attorney` branch is removed (Appendix B). |
| A27 | Escrow custody | G1 §II.7.2 two-phase; G3 §II.10.3 qualified custodian | Title officer unilateral token-vault control | **G3's model governs, extended.** Licensed trust account, dual control, three-way reconciliation, no unilateral release (§II.7). |
| A28 | Breach determination | Not previously modelled | Title officer liquidates on its own view | **New.** Frozen deposit; mutual instruction, staged award, or court order only (§II.7.3). |
| A29 | Deed transfer | G2 §II.9.3 and G3 §II.5.6: recorded conveyance | "Logging the deed transfer on the blockchain" | **G2/G3 govern.** Recording confirmation is a first-class artifact Group 4 produces (§II.7.4). |
| A30 | Loss-mitigation fees | G1 §II.7.5: no advance fee; IOLTA; platform $0 | Platform escrows negotiation fees | **G1 governs verbatim** (§II.9.1). |
| A31 | Short-sale proceeds | Not previously modelled | Specialist paid ahead of the lienholder | **New and blocking.** Only lender-approved settlement lines; enforced at the DB (§II.9.2). |
| A32 | Distress surfaces | G1 §II.5.3, G2 A1, G3 A19 | Violation heatmaps and enforcement-sweep layers | **Partly upheld, partly reversed.** Public violation facts render **unranked** — the expediter's need is legitimate — but scoring, heatmaps, and cold solicitation are withdrawn (§II.8.4). |
| A33 | Expediter cure escrow | G1 §II.7.4: objective oracle, deadline reversion, substitution | Auto-release on municipal API change | **G1 governs, extended.** Owner selects; contractor firewall; bounded outcome bonus (§II.8.2). |
| A34 | Proxy signing | VULN-07 "resolved for Group 1" via step-up | Attorney signature triggers settlement | **Closed properly.** `party_user_id` removed; verified agreement-scoped signing authority required (§II.7.5). |
| A35 | Wholesaler referral | G1 §II.5 suppression apparatus | Specialist routes client to a wholesaler | **G1 governs.** No acquirer referral while representing; exit runs through consented `seeking_exit` (§II.9.3). |
| A36 | AI evidence | G3 §II.9.3 provenance; G3 §II.7.3 automation principle | "AI-verified photos" presented as fact | **Extended for adjudication.** Authentication classes, model disclosure on the exhibit face, challenge right; a challenged AI conclusion alone never supports a finding (§II.10). |

---

# APPENDIX B — VULN-05 CLOSURE

**The finding every prior blueprint deferred.**

Original audit, VULN-05 🟡: *"`agreements_party_access` allows attorneys to read ALL agreements cross-tenant… a `legal_title` officer can read every JV agreement across every tenant."* Write policies `agreements_party_insert` and `agreements_party_update` carry the same flaw.

- `MasterBlueprint_Group_1.md` Appendix A: *"Out of Group 1 scope; Group 4 must scope to assigned matters."*
- `MasterBlueprint_Group_2.md` Appendix B: same deferral.
- `MasterBlueprint_Group_3.md`: not in scope.

**It closes here, and it was under-rated at 🟡.** The original audit classified it as Medium because it "requires a specific account type to exploit." That analysis understates it in two ways:

1. **Under Phase 8 the blast radius grows.** Five sub-roles map to `attorney`, and one of them is a *neutral* — an arbitrator with standing read access to both parties' material outside the record is independently disqualifying and taints every award they issue.
2. **The harm is not disclosure, it is waiver.** Privilege protects communications kept confidential. Systematic accessibility by attorneys outside the representation is the classic waiver fact pattern. The defect does not just expose the client's file — it may destroy the client's protection in it, retroactively and irreversibly.

**Corrections applied:**

1. `agreements_party_access` → `agreements_matter_access`; the `current_user_role() in ('attorney','admin')` branch is **removed**.
2. `agreements_party_insert` / `agreements_party_update` → matter-scoped, `counsel_of_record` only, with `bar_active()` on the matter's jurisdiction.
3. `documents` gains `privilege_class` and `privilege_holder_id` with a policy that has **no ordinary admin branch** on privileged rows.
4. `legal_arbitrator` is removed from the `attorney` group string entirely (I-11).
5. Invariant I-1 is amended across all four blueprints: **the `admin` branch is the only permitted `current_user_role_group()` predicate — and on privileged rows, not even that.**
6. `policy-lint` extended to fail on any `'attorney'` literal in a role predicate.

---

# APPENDIX C — Traceability to `rbac-audit-red-team.md`

| Prior finding | Status | Resolved at |
|---|---|---|
| **VULN-05** attorneys read and write all agreements | **CLOSED — first time.** Read and write both scoped to matter role and representation | §III.3, Appendix B |
| **VULN-07** proxy signing via `party_user_id` | **CLOSED properly.** G1 addressed its own scope; the attorney case — the audit's own exploit — closes here | §II.7.5, §III.5 |
| VULN-01 escrow release | Closed in G1 (read) and G3 (write); Group 4 adds trust-side dual control and disputed-deposit freeze | §II.7.2, §II.7.3 |
| VULN-06 ledger-linked deal-room events | Resolved in G3; matter-party branch added here | §III.3 |
| DESIGN-01 `parties[].role` free text | Resolved — parties carry `(user_id, matter_id, matter_role)` | §III.1.2 |
| DESIGN-02 `current_user_role()` typed enum | **Now blocking.** Adding two enum values (Appendix D) requires the documented DDL sequencing | Appendix E |
| DESIGN-03 layout `ALLOWED_ROLES` sets | Resolved — layout gates are coarse routing; the boundary is `is_matter_party()` | §II.1 |

---

# APPENDIX D — THE 25-ROLE TAXONOMY IS ARITHMETICALLY BROKEN

**Enumeration across the source corpus:**

| Source | Keys | Running total |
|---|---|---|
| `phase8-sub-role-expansion-plan.md` | 22 | 22 |
| Group 9 drafts — `broker_commercial`, `broker_residential`, `broker_leasing` | +3 | **25** ← the canonical figure |
| Group 4 draft — `legal_arbitrator` *"[The New Addition]"* | +1 | 26 |
| Group 5 draft — `contractor_logistics` | +1 | **27** |

`CLAUDE.md` itself names both: Group 4 as *"Attorneys, Title Officers, Expediters, Fast-Track Arbitrators"* and Group 5 as *"GCs, Sub-Trades, Suppliers, Logistics/3PL"*. The drafts and the canonical count disagree, and every RLS policy, layout gate, `ROLE_APP_MAP` entry, and test fixture built against 22 or 25 is wrong for the two extras.

**Resolution — the canonical count moves to 27:**

| Key | Group string | App segments | Rationale |
|---|---|---|---|
| `legal_arbitrator` | **`neutral`** *(new group string)* | `['legal']` — deliberately **no** `escrow` | I-11: a neutral must never inherit advocacy scope, and must hold no financial surface (G4-24). Modelling this as a capacity on an attorney account re-creates G4-09. |
| `contractor_logistics` | `contractor` | `['contractor','escrow']` | Group 5 owns the detail; the key must exist in the enum before Group 5's blueprint can bind. |

**Why `legal_arbitrator` must be a distinct key and not a capacity.** The neutrality wall is only enforceable if the account itself is separately gated. A capacity on an attorney account would let a session hold advocacy scope and neutral scope simultaneously — which is exactly the conflict the role exists to avoid, and which no amount of UI separation fixes.

---

# APPENDIX E — Required Deltas to `phase8-sub-role-expansion-plan.md`

1. **BLOCKING — T8.2 must be rewritten for the attorney policies.** The plan instructs widening `agreements_party_access`, `agreements_party_insert`, and `agreements_party_update` from `'attorney'` to `current_user_role_group() in ('attorney','admin')`. **Applying T8.2 as written ships VULN-05 to production and extends it to five sub-roles including the arbitrator.** Those three policies must instead be replaced per `0032_group4_rls.sql`.
2. **BLOCKING — T8.1 enum sequencing.** Adding `legal_arbitrator` and `contractor_logistics` compounds DESIGN-02: `current_user_role()` returns the typed enum, so the documented drop-retype-recreate sequence must be followed, and `current_user_role_group()` must be recreated with the `neutral` mapping in the same migration.
3. **T8.1/T8.3 — the enum and both maps move to 27 keys** per Appendix D, with a new `neutral` group string. `ROLE_GROUP_MAP` must **not** map `legal_arbitrator` to `attorney`.
4. **New tasks T8.22–T8.27.** Migrations `0027`–`0032` (§III.1), sequenced after the Group 3 set `0022`–`0026`.
5. **T8.4 — API guards.** `PATCH /api/agreements` must have `party_user_id` **removed**, not merely defaulted — the plan's note about defaulting `profile?.role ?? 'owner'` to `'owner_single'` addresses a display concern and misses the authorization defect entirely.
6. **T8.5 — layout gates.** A `(legal)` layout group is required, and `legal_arbitrator` must be gated separately from the other four legal keys so that the neutral session wall (I-11) has a routing boundary to attach to.
7. **T8.6 — fixtures.** The `attorney` persona needs a `firms` row at B2+, `bar_admissions` for the test jurisdiction, a `matters` row, and `matter_parties` / `representations` rows. Tests asserting that an attorney can read an agreement by role alone will fail correctly and must be rewritten against matter role. A separate `arbitrator` persona is required, and a test must assert it **cannot** read privileged material on its own matter.

---

**END OF MASTER BLUEPRINT — GROUP 4**
