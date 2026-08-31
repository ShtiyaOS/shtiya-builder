# MASTER BLUEPRINT — GROUP 5: THE EXECUTION (CONTRACTOR, SUB-TRADE & LOGISTICS)

**Document class:** Production Architecture Specification
**Supersedes:** `architecture/02_draft_blueprints/05_group_the-execution_contractors-logistics.md`
**Version:** 2.0 (Red-Teamed / Hardened)
**Date:** 2026-08-19
**Taxonomy scope:** 4 sub-roles — `contractor_gc`, `contractor_sub`, `contractor_supplier`, **`contractor_logistics`** *(the second of the two keys missing from the canonical count; see Group 4 Appendix D)*
**RLS group string:** `contractor` — **and this document removes it from the security boundary**
**Counterparty blueprints:** `MasterBlueprint_Group_1.md` · `_Group_2.md` · `_Group_3.md` · `_Group_4.md` v2.0 — **binding**; Appendix A is the boundary contract
**Stack:** Next.js 14 App Router · Supabase Postgres + RLS · Zustand Context Registry · Vercel AI SDK · Mapbox GL · $SHQL settlement rail

---

## 0. How To Read This Document

| Part | Contents |
|---|---|
| **Part I** | Red Team Audit — 29 findings, ranked, with exploit paths |
| **Part II** | Hardened Architecture — the corrected design |
| **Part III** | Implementation Spec — schema, RLS, API contracts, TS types |
| **Part IV** | Verification — RBAC matrix, acceptance criteria, telemetry |
| **Part V** | Residual Risk & Regulatory Review Queue |
| **Appendix A** | Boundary contract with Groups 1–4 |
| **Appendix B** | **`contractor_logistics` — closing the taxonomy gap Group 4 opened** |
| **Appendix C** | Traceability to `rbac-audit-red-team.md` |
| **Appendix D** | Required deltas to `phase8-sub-role-expansion-plan.md` |

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt

---

# PART I — RED TEAM AUDIT

## 0.1 Executive Verdict

Read the draft's verbs. *"Completely eliminates GC payment withholding risk."* *"Virtually eliminating mechanics liens."* *"Eliminates B2B credit risk."* *"Completely eliminate construction litigation."*

Mechanic's liens, retainage, lien waivers, prompt-payment statutes, and trust-fund laws are not friction. They are the accumulated legislative settlement of roughly a century of construction workers not getting paid, and they exist because the party doing the physical work has the least market power and the most sunk cost. **This group's draft treats every one of those protections as a defect to be engineered away, on behalf of the party that has the least of them.**

Five structural defects follow from that posture:

1. **The platform promises a payment guarantee it cannot honour.** *"Work packages are pre-funded in project escrows, guaranteeing direct payment upon verified completion."* Escrow can be short; the developer can default; the lender can freeze the facility under Group 3 §II.9.6; a milestone can be contested; a lien claim can intervene. Stating a guarantee creates a promise the platform may be held to — and, worse, induces subcontractors to forgo the self-help protections they would otherwise take. **A sub who relies on the guarantee and skips a preliminary notice has lost their lien rights and gained nothing.**

2. **Licensing is modelled as a boolean when it is a four-dimensional match.** A licence is per trade, per classification, per jurisdiction, and per scope. The draft verifies "active status" and dispatches. Routing a contractor to work outside their classification is unlicensed contracting — and in states like California, B&P §7031 both bars the contractor from suing for payment **and** lets the owner recover everything already paid. The platform would be systematically generating uncollectible work and disgorgement exposure for its own Group 1 and Group 2 users.

3. **A QR scan by the buyer's agent is the release authority on the supplier's money.** Proof-of-Delivery is a bearer token with no nonce, no geofence, no device binding, no counter-signature, and no quantity or condition capture — while Group 3 §II.9.3 already built exactly this machinery for photographs and it is simply not applied here. GC-supplier collusion on a phantom delivery requires one photographed QR code.

4. **The compliance freeze is confiscatory and adversarially triggerable.** A lapsed certificate *"immediately locks dispatch status and freezes draw releases."* A certificate expiry is not a policy cancellation, renewals are routinely issued late, and freezing **already-earned** funds over a paperwork gap is a conversion problem and, where trust-fund statutes apply, a diversion problem. It is also a weapon: whoever can cause or spoof a lapse can freeze a competitor's payroll.

5. **Every incentive in the design points at physical speed, with no safety counterweight.** "Cash Flow Accelerator," draws without 60-day delays, crane sync so trucks arrive the moment the hoisting crew is ready. Nothing in the draft stops work for an unsafe condition, records an incident, matches a qualification to a task, or handles a serious injury. The system pays faster for faster work performed at height with heavy equipment by people whose qualifications it vaults but never checks against the task.

Layered on top: the supplier's *"demand heatmaps based on real-time BoQs generated by architects across the platform network"* aggregates the architect's work product and the developer's confidential cost basis and renders it to the counterparties who will price against it — which is both the exact BoQ leakage the taxonomy prohibits and a forward-looking information exchange among competing suppliers.

**The honest reframe.** The protections the draft wants to eliminate are the ones the platform should be *executing* — faster, more reliably, and more legibly than paper ever could. Preliminary notices filed on time instead of missed. Lien deadlines tracked instead of blown. Waivers exchanged atomically instead of chased. Retainage released on the statutory schedule instead of forgotten. Trust funds accounted in priority order instead of commingled. That is a product a subcontractor would pay for, and it is the opposite of what the draft describes.

## 0.2 Finding Register

| ID | Sev | Domain | Finding |
|---|---|---|---|
| G5-01 | 🔴 | Licensing | Licence treated as a boolean; scope/classification/jurisdiction mismatch → §7031 exposure |
| G5-02 | 🔴 | Labor | No worker-classification model; the platform's own controls make it a joint-employer risk |
| G5-03 | 🔴 | Payment | "Guaranteeing direct payment" is a promise the platform cannot honour and induces reliance |
| G5-04 | 🔴 | Payment | "Virtually eliminating mechanics liens" suppresses the sub's only statutory leverage |
| G5-05 | 🔴 | Payment | Synchronous splits ignore entitlement, waivers, retainage, trust-fund priority, legal process |
| G5-06 | 🔴 | Delivery | PoD QR is a bearer token — no nonce, geofence, device binding, or counter-signature |
| G5-07 | 🔴 | Delivery | Buyer's agent unilaterally releases the supplier's money → collusion and gate-side coercion |
| G5-08 | 🔴 | Compliance | COI freeze confiscates **earned** funds and is adversarially triggerable |
| G5-09 | 🔴 | Safety | Payment velocity coupled to production with no safety counterweight or stop-work authority |
| G5-10 | 🔴 | Data | Supplier demand heatmap leaks network-wide BoQ data to the counterparties pricing against it |
| G5-11 | 🔴 | Antitrust | Forward-looking demand quantities shared among competing suppliers via a common intermediary |
| G5-12 | 🔴 | RBAC | Four sub-roles collapse to group `contractor`; cross-company pricing, BoQ, and margin exposure |
| G5-13 | 🟠 | Payment | "Instant AR settlement" pays on order — no acceptance, rejection, spec match, or warranty hold |
| G5-14 | 🟠 | Insurance | COI verified; **workers' compensation** is not — the statutory-employer gap |
| G5-15 | 🟠 | Bonding | "Bonding Vault" in the heading; licence, payment, and performance bonds never distinguished |
| G5-16 | 🟠 | Licensing | Licence lending / RMO-RME abuse; suspension evaded by re-incorporation |
| G5-17 | 🟠 | Payment | Prompt-payment statutes and statutory interest are nowhere in the payment logic |
| G5-18 | 🟠 | Payment | Sub-tier retainage undefined; statutory caps and release schedules unmodelled |
| G5-19 | 🟠 | Safety | OSHA quals are vaulted but never matched against task assignment at dispatch |
| G5-20 | 🟠 | Logistics | DOT/FMCSA, HOS, CDL, cargo insurance, and crane certification entirely unmodelled |
| G5-21 | 🟠 | Security | Job-site, staging, and delivery-window data is a construction-theft target list |
| G5-22 | 🟠 | RBAC | No crew or worker model — the person scanning and photographing is unidentified |
| G5-23 | 🟠 | Data | Trade CAD access is unscoped; architect IP with no licence terms or watermarking |
| G5-24 | 🟠 | UI | Flat portal; the workspace unit should be the work package |
| G5-25 | 🟠 | Monetization | Every obvious fee model takes from trust res, the sub's payment, or work allocation |
| G5-26 | 🟡 | Cross-group | PM→sub direct routing creates an unscoped entry path into a tenant-occupied dwelling |
| G5-27 | 🟡 | Vision | AI progress verification re-imports the release authority Groups 1 and 3 removed |
| G5-28 | 🟡 | Taxonomy | `contractor_logistics` does not exist in the enum, `ROLE_APP_MAP`, or any policy |
| G5-29 | 🟢 | UX | The heaviest onboarding in the ecosystem for its least digitally-patient user class |

---

## 1. Licensing, Classification & Labor

### G5-01 🔴 A licence is a four-dimensional match, not a boolean

**Draft text:** *"The platform integrates with municipal licensing databases to verify active status (e.g., Master Electrician, Master Plumber, Hoisting/Rigging)."*

**Finding.** "Active status" is one of four dimensions that must all hold before a contractor may lawfully perform a given scope:

| Dimension | Example failure |
|---|---|
| **Trade** | A licensed plumber performing electrical work |
| **Classification** | A California "B" general licensee self-performing C-10 electrical beyond the incidental-and-supplemental limit |
| **Jurisdiction** | A master electrician licensed in one county dispatched to the next, where reciprocity does not apply |
| **Scope / threshold** | Work over a dollar or structural threshold requiring a different licence class, a permit, or the licensee physically on site |

The draft verifies dimension one and dispatches.

**Exploit — and it is not really an exploit, it is the default behaviour.** A `contractor_sub` with a valid licence in Jurisdiction A accepts a dispatched work package in Jurisdiction B. They perform the work. They are an unlicensed contractor as to that job. Consequences compound in three directions: the contractor cannot maintain an action for payment; in California under B&P §7031 the **owner may recover every dollar already paid**, which lands on a Group 1 homeowner or a Group 2 developer; and any lien they file is void. The platform routed the work, verified the credential, and is the proximate cause.

**Aggravating factor.** The draft's whole value proposition is dispatch velocity, so this failure occurs at volume and silently.

`FIX →` §II.2.5 Scope Match Engine — a work package declares the required trade, classification, jurisdiction, and threshold; dispatch is **blocked** unless the contractor holds all four; near-misses surface with the specific missing dimension named. This is a genuine product feature, not merely a control: no competitor tells a sub *why* they are ineligible before they mobilize.

---

### G5-02 🔴 No worker-classification model — the platform's own controls create the exposure

**Finding.** Enumerate what the draft has the platform do to a `contractor_sub`: publish a **dispatch board** that assigns work orders; set **schedules** (JIT sync so the sub is present when the crane is ready); control **payment** and its timing; **monitor performance** through AI verification; and **suspend the ability to work** through the compliance freeze.

Those are, almost item for item, the control factors under the FLSA economic-reality test, the IRS common-law factors, and California's ABC test — and the taxonomy itself describes `contractor_sub` as covering *"trade-specific **workers**."* A platform that dispatches individuals to jobs, sets when they arrive, controls their pay, rates their performance, and can bar them from working is not obviously operating a marketplace. It is operating something closer to a staffing arrangement, with joint-employer, wage-and-hour, overtime, payroll-tax, and workers'-compensation consequences attaching to the platform itself.

**This is the largest unpriced liability in the group**, and unlike most findings in this corpus it cannot be fixed by a gate — it requires architecting *away* from control.

`FIX →` §II.11 Classification Firewall — contractors set their own rates and accept or decline freely; the platform publishes opportunities rather than assigning them; no exclusivity; no platform-imposed schedule (the GC's schedule is the GC's, and is surfaced as information); ratings are factual completion records rather than a discipline mechanism; suspension is limited to credential and safety grounds with due process; and a continuous classification-risk monitor. An optional, properly licensed employer-of-record path is offered for parties who want employment rather than contracting.

---

### G5-14 🟠 Workers' compensation is the gap the COI does not cover

**Finding.** The draft verifies "Certificates of Insurance." A COI typically evidences general liability. Workers' compensation is a separate policy, and it is the one that matters most: in nearly every state a general contractor is a **statutory employer** liable for the injuries of an uninsured subcontractor's employees. A GC dispatching an uninsured sub through this platform inherits that exposure, and the platform verified something else.

`FIX →` §II.2.4 — GL, **workers' compensation**, auto, umbrella, and (for `contractor_logistics`) cargo and motor-carrier coverage are verified as **distinct** coverages with distinct limits, endorsements (additional insured, waiver of subrogation, primary and non-contributory), and expiry tracking. Sole proprietors with valid WC exemptions are modelled explicitly rather than being silently treated as covered.

---

### G5-15 🟠 "Bonding Vault" names bonds it never distinguishes

**Finding.** The section heading promises bonding; the body never mentions one. Three different instruments with three different beneficiaries are being conflated: a **licence bond** (protects the public, tiny limits), a **payment bond** (protects subs and suppliers — the single most important instrument in this group), and a **performance bond** (protects the owner). A sub who believes a payment bond exists because "bonding" appeared in the UI, and who therefore skips a lien notice, has been actively harmed.

`FIX →` §II.2.4 — bonds are typed, with obligee, principal, penal sum, and claim deadlines; payment-bond claim deadlines are tracked alongside lien deadlines in §II.5.4; the UI never renders an undifferentiated "bonded" badge.

---

### G5-16 🟠 Licence lending and suspension evasion

**Finding.** The characteristic licensing fraud in this trade is **licence lending** — an unlicensed operator runs work under a licensed RMO/RME's number, often for a monthly fee, with the licensee never on site. Verifying that a licence number is active detects none of it. Separately, a contractor suspended for a safety event re-registers a new entity, exactly as Group 2 G2-02 described for wholesalers.

`FIX →` §II.2.3 — licences bind to the **natural person licensee** and to their verified role in the entity (owner, RMO, RME, qualifying party), with periodic re-attestation by the licensee themselves, not the entity. Suspensions, safety events, and disciplinary history attach to the **identity cluster** (Group 2 §II.2.3) and are inherited by any new entity those control persons register.

---

## 2. Payment Architecture

### G5-03 🔴 The payment guarantee the platform cannot honour

**Draft text:** *"Direct Payment Protection: Completely eliminates GC payment withholding risk. Work packages are pre-funded in project escrows, guaranteeing direct payment upon verified completion."*

**Finding.** Every word after "pre-funded" is unsupportable. Payment can fail because the escrow is under-funded relative to the completed scope; the developer defaults; the lender freezes the facility under Group 3 §II.9.6 (which this ecosystem explicitly permits); the milestone is contested; a competing lien claim intervenes; a backcharge is asserted; or the compliance freeze fires (G5-08).

Two harms, and the second is worse:

1. **Contractual exposure.** "Guaranteeing" is the language of a promise. A sub who is not paid will argue the platform guaranteed it, and the marketing copy is the exhibit.
2. **Induced reliance.** This is the real damage. A subcontractor who believes payment is guaranteed does not serve a preliminary notice, does not diary the lien deadline, does not negotiate a joint-check agreement, and does not ask for a payment bond. When payment then fails, they have lost the protections they would have taken **and** the guarantee turns out not to exist. The platform will have made them strictly worse off than a paper job.

`FIX →` §II.5 Payment Protection Architecture — the guarantee language is **withdrawn** and replaced by verifiable mechanism: a funding-verification badge the sub can inspect (escrow balance versus committed scope, updated live), direct-pay routing described accurately as a routing mechanism, an explicit disclosure of what it does and does not cover, and — critically — §II.5.4's lien and notice assistance, so protections are *preserved and exercised* rather than quietly displaced.

---

### G5-04 🔴 Suppressing mechanic's liens harms the party with least power

**Draft text (taxonomy):** *"virtually eliminating mechanics liens."*

**Finding.** The mechanic's lien is the only leverage a subcontractor has when money runs out upstream, and it exists precisely because that is when they need leverage. In many states lien rights are **non-waivable in advance** (California Civil Code §8122 among others), so a system that suppresses them contractually is unenforceable; a system that suppresses them *procedurally* — by making filing awkward, by burying deadlines, by conditioning payment on non-filing — is worse, because it works.

Group 4 §II.5.2 already carved lien and prompt-payment rights out of the arbitration clause on exactly this reasoning. The payment flow needs the same carve-out, and the same reasoning points somewhere better than neutrality.

`FIX →` §II.5.4 Lien & Notice Assistance — the platform **assists** the right instead of eliminating it: automatic preliminary-notice generation and service with proof of service retained; per-jurisdiction lien and payment-bond deadline calendars per work package; escalating reminders as deadlines approach; and an explicit rule that filing a notice or a lien **never** affects dispatch eligibility, ratings, or payment routing. Retaliation for filing is a platform violation with defined consequences.

> This is the single clearest instance of the reframe: the draft's "eliminate liens" becomes "never miss a lien deadline again," which is a feature subs would actually pay for and which costs the platform nothing but honesty.

---

### G5-05 🔴 Synchronous splits ignore entitlement, waivers, retainage, trust priority, and legal process

**Draft text:** *"When a GC receives an escrow draw, embedded smart contract logic automatically splits and routes pre-agreed amounts directly to the sub-contractors' wallets."*

**Finding.** Automatic splitting is directionally right — it is the best idea in the draft — and it is specified in a way that breaks five separate things.

1. **Entitlement ≠ the pre-agreed amount.** Actual entitlement moves with change orders, approved extras, partial completion, backcharges, and defective-work deductions. Paying a fixed proportion overpays subs who under-performed and underpays subs who absorbed a change.
2. **No lien waiver exchange at the sub tier.** Group 1 §II.7.3 gates 6 and 7 require conditional and unconditional waivers at the GC tier. The sub tier — where the lien risk actually originates — has no equivalent, so the owner pays and remains exposed.
3. **No sub-tier retainage.** Many states cap retainage and mandate release schedules; the draft models neither, at either tier.
4. **Construction trust-fund statutes are ignored.** New York Lien Law Article 3-A, and comparable statutes in Texas, Michigan, and elsewhere, make draw proceeds a **trust** for the benefit of subs and suppliers, with personal liability and in some states criminal exposure for diversion. Automatic splitting is a superb vehicle for compliance — but only if the trust res is tracked and the statutory **priority order** (labor, then materials and subs, then GC overhead and profit) is respected. Splitting "pre-agreed amounts" that route the GC's margin alongside or ahead of unpaid subs is diversion, automated.
5. **Legal process is bypassed.** Garnishments, tax levies, child-support orders, and assignments attach to a sub's receivable. Routing straight to a wallet ignores service of process and exposes the payer.

`FIX →` §II.5.2 Entitlement Engine and §II.5.3 Trust-Fund Accounting — splits compute from **approved entitlement** (base scope ± approved change orders − backcharges − retainage) rather than a static proportion; the waiver exchange runs at every tier as an atomic precondition; retainage is tracked per tier against statutory caps with scheduled release; draw proceeds are held as an accounted trust res disbursed in statutory priority, with GC margin **last**; and a legal-process register intercepts routing before settlement.

---

### G5-13 🟠 "Instant AR settlement" pays on order

**Finding.** Group 2 G2-13 caught this from the buyer's side. From the supplier's side the additional gaps are: no acceptance period, no rejection or return path, no verification that delivered material matches the BoQ specification, and no warranty holdback. **Substitution fraud** is the specific risk — bill Grade A, ship Grade B — and it is invisible to a system whose only delivery signal is that a truck arrived.

`FIX →` §II.6.4 — spec-match capture at delivery (product identifiers, mill certs or submittals where applicable, quantity), a defined acceptance window with a rejection path that reverses settlement, and a warranty holdback for specified material classes.

---

### G5-17 / G5-18 🟠 Prompt-payment statutes and retainage caps are absent

**Finding.** Most states impose mandatory payment timelines with statutory interest for late payment, on both public and private work, and many make those rights non-waivable. Most also cap retainage percentages and mandate release on substantial completion or on a schedule. The draft's payment logic references neither, which means the platform can be the instrument of a statutory violation while displaying "on time."

`FIX →` §II.5.5 — per-jurisdiction prompt-payment clocks per tier, with statutory interest accrued automatically and displayed to both parties; retainage caps enforced against the jurisdiction's limit; scheduled release with reminders; and the clocks are visible to the payee, which is the entire point.

---

## 3. Delivery, Verification & Compliance Holds

### G5-06 🔴 Proof-of-Delivery is a bearer token

**Draft text:** *"the GC scans a digital QR bill of lading. This cryptographic Proof-of-Delivery instantly triggers the smart contract to release the final material payment to the supplier and the delivery fee to the logistics provider."*

**Finding.** Calling it cryptographic does not make it bound to anything. The QR encodes a value; possession of the value is the whole authentication. Missing: a server-issued single-use nonce, a geofence against the site, device attestation, capture-time binding, and any linkage to the physical goods.

Group 3 §II.9.3 built precisely this machinery — capture nonce, in-app-only capture, device attestation, geofence, timestamp attestation, sequence continuity, perceptual-hash replay detection — for photographs supporting draws. It is not applied here, on a control that releases money on a signal weaker than a photograph.

**Exploit.** Supplier photographs the QR at the warehouse and messages it to the GC. Nothing ships. The GC scans from an office. Payment releases for goods that do not exist. Detection depends on someone eventually noticing missing material on a site where material moves constantly.

`FIX →` §II.6.2 — the Group 3 §II.9.3 provenance bundle applied to delivery: server-issued single-use nonce displayed at the gate, in-app scan only, device attestation, geofence against the parcel, timestamp attestation, and replay detection across the facility.

---

### G5-07 🔴 The buyer's agent unilaterally releases the seller's money

**Finding.** Structurally, the GC is the buyer's agent, and the draft makes the GC's scan the sole trigger releasing the supplier's payment and the logistics provider's fee. That is a single-party control over a counterparty's money, and it fails in both directions:

- **Collusion.** GC and supplier agree on a phantom or inflated delivery and split proceeds drawn from the developer's or lender's escrow. One scan, no counter-party.
- **Gate-side coercion.** The truck is at the kerb, the driver is on the clock, the crane window is closing. The GC declines to scan until the supplier discounts or the logistics provider waives the fee. The draft's own JIT design maximizes this leverage by making the delivery window narrow and expensive to miss.

`FIX →` §II.6.3 — delivery confirmation requires **counter-signature**: the receiving party's provenance-bound scan **and** the delivering driver's attestation, with quantity and condition captured by both. A discrepancy opens a **partial-acceptance** path that settles the undisputed quantity immediately and escalates the remainder — the same undisputed-baseline pattern Group 4 §II.5.7 established for arbitration, applied at the gate. A refusal to confirm within a defined window auto-escalates rather than sitting as leverage.

---

### G5-08 🔴 The compliance freeze confiscates earned funds and is adversarially triggerable

**Draft text:** *"If a policy lapses, the smart contract system immediately locks the contractor's dispatch status and freezes draw releases until a renewed COI is verified."*

**Finding — four defects.**

1. **A certificate expiry is not a policy cancellation.** Certificates are evidence, issued periodically and routinely renewed after the prior one's stated expiry. Treating a stale certificate date as a coverage lapse produces false positives constantly.
2. **Freezing *earned* funds is confiscatory.** Money owed for completed, verified work is not the platform's to hold because a document expired. Where trust-fund statutes apply it is also diversion of a trust res, and where subs are downstream it withholds *their* money over the GC's paperwork.
3. **It is a weapon.** Anyone able to cause a lapse, delay a renewal, or spoof the verification source can freeze a competitor's or a counterparty's payroll instantly and with no appeal.
4. **The safety logic inverts.** A contractor whose cash flow is frozen mid-project is more likely to cut corners, defer maintenance, and push crews — not less.

`FIX →` §II.7 Proportionate Compliance Holds, built on one distinction the draft never draws:

> **Prospective controls are permitted and immediate. Retrospective controls are never permitted.**
> A credential lapse may suspend **new** dispatch at once. It may **never** freeze funds already earned for completed work.

With grace periods calibrated to real renewal behaviour, notice before any action, an appeal path, verification-source failure treated as platform failure rather than contractor failure, and downstream subs insulated from an upstream party's compliance state entirely.

---

### G5-27 🟡 AI progress verification re-imports removed release authority

**Draft text:** *"Upon verification, the smart contract releases $SHQL draw funds from escrow."*

**Finding.** Group 3 §II.7.3 established the governing rule, and Group 1 §II.7.3 gate 1 and Group 2 §II.8.2 both implement it: **a model may block a disbursement on its own; it may never release one.** Group 5's draft restores the model as the release trigger with the developer as co-signer — and Group 3 G3-05 already established that the developer is the borrower and cannot approve its own draw.

`FIX →` §II.6.5 — Vision output is advisory to release and dispositive to block; release requires the Group 3 §II.9.2 three-key set (contractor requests, independent inspector attests, lender releases under dual control). Group 5's contribution is the **submission** side: provenance-bound evidence and the crew-member identity of the person who captured it.

---

## 4. Data, Antitrust & Site Security

### G5-10 🔴 The demand heatmap leaks network-wide BoQ data

**Draft text:** *"Demand Forecasting Map: Displays material demand heatmaps based on real-time BoQs generated by architects across the platform network."*

**Finding.** A Bill of Quantities is the architect's work product and, quantity by quantity, the developer's confidential cost basis and construction schedule. The draft aggregates BoQs **across the network** and renders them to **suppliers** — the counterparties who will quote against those exact quantities on those exact dates.

The taxonomy is explicit that this class of leakage is prohibited: *"the Wholesaler cannot view the proprietary BoQ generated by the Registered Architect."* Group 2 §II.8.4 scoped BoQ access to deal membership on the same principle. This is the same defect with a wider blast radius and a subscription attached.

**Exploit.** Supplier observes that a submarket needs 400 cubic yards of concrete in eleven days. They quote accordingly. The developer's own design data has been converted into the supplier's pricing power, and neither the architect nor the developer consented.

`FIX →` §II.9.2 — the network-wide demand map is **withdrawn**. Suppliers see: their own order history and pipeline; RFQs deliberately sent to them; and the §II.9.3 regional index. BoQ line-item access requires work-package membership.

---

### G5-11 🔴 Forward-looking demand data shared among competing suppliers

**Finding.** Independently of the leakage, the heatmap is an information-exchange instrument. Competing suppliers receive forward-looking demand quantities and timing through a common intermediary — the configuration information-exchange doctrine treats most severely, because forward-looking data supports both price coordination and market allocation. Group 2 §V.2 item 8 and Group 3 §II.6.5 already flagged the analogous problem for rate data; here it is quantities and dates, which is worse.

`FIX →` §II.9.3 — regional material indices only: historical, minimum lag, aggregated above a participant-count floor, non-attributable, and **never forward-looking**. Individual RFQs are visible only to invited suppliers.

---

### G5-21 🟠 The site map is a construction-theft target list

**Finding.** The Logistics & Site Map renders active job sites, **material staging zones**, delivery windows, and crane schedules. That is a precise answer to the question a construction thief asks: where will valuable material be sitting, unattended, and when. Construction-site theft is a multi-billion-dollar annual loss category, copper and equipment especially, and the draft publishes the reconnaissance for it.

No prior group flagged this class of harm, because no prior group rendered the physical location of unattended value on a schedule.

`FIX →` §II.10 — staging locations, delivery windows, and crane schedules are **need-to-know**: visible only to work-package parties with a delivery role, at the resolution their role requires; regional views are coarse; historical staging data ages out; and access to the delivery schedule is logged.

---

### G5-23 🟠 Trade CAD access is unscoped architect IP

**Finding.** *"Clicking a marker opens trade-specific CAD schematics."* The trade-scoping instinct is correct, but nothing enforces it, and CAD is the architect's copyrighted work product. Missing: per-trade extraction rather than whole-model access, licence terms governing use, watermarking, and expiry on work-package completion.

`FIX →` §II.9.4 — trade-scoped extracts generated per work package rather than whole-model access; per-recipient watermarking; licence terms surfaced and acknowledged; access expiring with the work package; and download logging visible to the architect. Group 6 owns the extraction pipeline.

---

## 5. Safety, RBAC & Monetization

### G5-09 🔴 No safety counterweight anywhere in the design

**Finding.** The draft's incentive vector is unopposed: "Cash Flow Accelerator," draws "without 60-day delays," JIT crane sync so trucks arrive exactly when hoisting is ready. Speed is rewarded at every point. Absent entirely:

- **Stop-work authority** — no one can halt work for an unsafe condition
- **Incident recording** — no near-miss, injury, or property-damage capture
- **OSHA logs** — no 300/300A equivalent
- **Qualification-to-task matching** — see G5-19
- **Serious-injury protocol** — no fatality or hospitalization workflow, no site preservation, no reporting clock
- **Competent-person requirements** — excavation, scaffolding, fall protection, confined space

A system that pays faster for faster physical work, and that never once slows anything for safety, has made a choice. On a job site that choice has a body count.

`FIX →` §II.8 Safety Architecture — **stop-work authority for anyone physically on site**, including a sub's individual crew member, exercisable in-app, with the invoking party protected: **a stop-work call never costs the caller money, dispatch eligibility, or rating.** Plus incident capture with a serious-injury protocol and reporting clock, OSHA log generation, qualification matching at dispatch (§II.8.3), and — structurally — safety events are **decoupled** from payment velocity so that safety never competes with cash flow.

---

### G5-19 🟠 Qualifications are vaulted but never matched to tasks

**Finding.** The COI & License Compliance Vault monitors "OSHA certifications" as documents. Nothing checks that the person assigned to rigging holds the rigging qualification, that a confined-space entry has a trained attendant, or that fall-protection-required work is assigned to trained personnel. A vault is a filing cabinet; the control is the match.

`FIX →` §II.8.3 — work packages declare required qualifications; dispatch is blocked absent a current match at the **crew-member** level (§II.1.2), not merely at company level; expiring qualifications warn before they block.

---

### G5-20 🟠 Logistics compliance is entirely unmodelled

**Finding.** `contractor_logistics` moves heavy loads on public roads and lifts them over occupied urban sites. The draft's stated risk is *"preventing municipal traffic fines."* The actual risk set: motor-carrier authority and safety rating, CDL class and endorsements, driver medical certification, **hours-of-service** limits, cargo and auto liability limits, oversize/overweight permits and routing, and crane operator certification plus lift-plan requirements.

An HOS-violating driver and an uncertified crane operator are how people die on this workflow, and the draft's JIT design actively pressures both — the whole point is that the truck arrives exactly on time.

`FIX →` §II.9.5 — carrier authority and safety rating verified; CDL class, endorsements, and medical cards tracked per driver; **HOS-aware scheduling that refuses to book a delivery window a compliant driver cannot legally meet**; cargo and auto limits verified against load value; permit and route validation for oversize loads; crane operator certification and lift plans required before a hoisting window opens.

---

### G5-12 🔴 Four sub-roles, one group string

**Finding.** All four sub-roles resolve to `contractor`. Every policy that gates on that string — `documents_scoped_access`, `vision_inspections_scoped`, the `(contractor)` layout allowlist — treats them as one scope. Consequences:

- A `contractor_supplier` reads another supplier's quoted pricing and terms.
- A `contractor_sub` reads the GC's full BoQ, including the GC's margin on the sub's own trade — which destroys the GC's negotiating position on every subsequent package.
- A `contractor_logistics` provider reads project financials it has no relationship to.
- Any contractor reads `vision_inspections` for properties they have never worked on — photographs of the interiors of people's homes.

This is the same defect closed for lenders in Group 3 (G3-07) and for attorneys in Group 4 (G4-08), reaching the fourth group.

`FIX →` §II.1 Work-Package-Scoped Authorization + Appendix A row A44. `is_work_package_party()` replaces the group string; **no Group 5 policy may use `current_user_role_group()` for row access except the literal `admin` branch.**

---

### G5-22 🟠 No crew or worker model

**Finding.** One login per company. So the identity of the person who scanned the PoD, captured the milestone photographs, or performed the rigging is unknown to the system. Three consequences: Group 3 §II.9.3's provenance chain terminates at a shared account, which weakens every draw's evidentiary value; qualification-to-task matching (G5-19) is impossible; and worker classification (G5-02) cannot even be analysed, because the platform does not know who the workers are.

`FIX →` §II.1.2 Crew Model — `crew_members` with individual verified identity, credentials, and qualifications; provenance binds to the individual; dispatch and qualification matching operate at crew-member granularity; and the classification firewall (§II.11) operates on real people rather than an abstraction.

---

### G5-25 🟠 Every obvious fee model is disqualified

**Finding.** The draft never states its fee structure for this group. The candidates are all defective:

| Candidate | Why it fails |
|---|---|
| % of draws | Takes from the contractor's earned funds and, where trust-fund statutes apply, from a trust res |
| % of material orders | Steering incentive toward fee-bearing suppliers (Group 2 G2-23) |
| Fee for dispatch priority | Pay-to-play on work allocation, and — combined with G5-02 — makes the platform look decisively like a staffing employer |
| Charging subs for payment access | Extracting from the least powerful party for access to money they have already earned |

`FIX →` §II.12 — flat seat subscription paid by the company; flat per-transaction operational fees invariant to amount; **no fee is ever deducted from a trust res, from a sub's payment, or from escrowed principal**; no fee affects dispatch ranking or work allocation; marketplace fees on materials are paid by the supplier, disclosed, and never weight default ranking (Group 2 §II.8.4 parity).

---

### G5-26 🟡 PM→sub direct routing enters an occupied dwelling

**Taxonomy text:** *"A Property Manager can route a tenant's immediate plumbing ticket directly to the sub-contractor, bypassing the GC entirely."*

**Finding.** Operationally sensible; architecturally it creates a dispatch path that terminates inside a **tenant-occupied dwelling**, with no entry-notice requirement, no tenant consent capture, no identity verification of the individual entering, and no background-check consideration. Group 7 owns the tenant relationship; Group 5 owns the person walking through the door.

`FIX →` §II.1.4 — a maintenance work package into an occupied unit requires statutory entry notice, tenant scheduling consent, the **crew-member identity** of the entrant surfaced to the tenant in advance, and an entry log. Group 7 supplies the notice rules and the tenant-side consent surface.

---

### G5-29 🟢 The heaviest onboarding for the least patient user class

**Finding.** Licence per trade per jurisdiction, GL, WC, auto, bonds, W-9, banking, safety qualifications, trade classifications — against a user who is on a job site, on a phone, in the sun, between tasks. This is the ecosystem's worst ratio of onboarding burden to user patience, and no amount of downstream value survives a signup flow they abandon.

`FIX →` §II.2.6 — progressive credentialing where each rung unlocks concrete earning capability rather than gating everything behind completion; carrier-direct COI ingestion so the contractor never uploads a certificate; licence lookup by number with auto-population; mobile-first capture; a "your crew can start Monday if you add X" completion path; and a broker-assist channel for insurance gaps.

---

# PART II — HARDENED ARCHITECTURE

## II.0 Design Thesis

> **The draft's verbs give it away: eliminate, eliminate, eliminate.** Liens, retainage, waivers, prompt-payment statutes, and trust-fund laws are not friction to be removed — they are what a century of unpaid construction workers won, and they protect the party in this ecosystem with the least market power and the most sunk cost.
>
> **The product is not eliminating those mechanisms. It is executing them — faster, more reliably, and more legibly than paper ever could.** Preliminary notices served on time instead of missed. Lien deadlines tracked instead of blown. Waivers exchanged atomically instead of chased. Retainage released on schedule instead of forgotten. Trust funds accounted in statutory priority instead of commingled.
>
> A subcontractor will pay for that. No subcontractor will thank you for eliminating their lien rights.

**Governing structural principles:**

1. **Prospective controls are permitted; retrospective confiscation is not.** A lapse may stop new dispatch; it may never freeze earned funds. (§II.7)
2. **Safety never competes with cash flow.** A stop-work call costs the caller nothing. (§II.8)
3. **Statutory protections are assisted, never suppressed.** (§II.5.4)
4. **Automation may be conservative unilaterally, never permissive unilaterally.** (inherited, Group 3 §II.0)
5. **Access derives from a work-package role, never from a role group.** (§II.1)

---

## II.1 Authorization Model *(resolves G5-12, G5-22, G5-26)*

**Principle:** Group 1's primitive is the parcel, Group 2's the deal, Group 3's the facility, Group 4's the matter. Group 5's is the **work package** — the scoped unit of physical work that a contract, a budget, a schedule, a set of credentials, and a payment attach to.

```
users.role         → coarse nav routing only. Never used for Group 5 row access.
companies          → the verified trade entity (C0…C3 credential level)
crew_members       → INDIVIDUALS with verified identity and qualifications
work_packages      → the authorization primitive
wp_parties         → who is on this package and in what capacity
entitlements       → billing-derived feature flags. Never widens a data scope.
```

### II.1.1 Work-package roles

| `wp_role` | Reaches | Cannot |
|---|---|---|
| `prime` (`contractor_gc`) | Full package: scope, budget, schedule, subs, draws | See the developer's margin or other packages' pricing |
| `trade` (`contractor_sub`) | **Own scope only**: trade CAD extract, own budget line, own draws, own waivers | See the prime's margin, other trades' pricing, or the project BoQ |
| `supplier` | Own quotes, orders, deliveries, settlement | See competing quotes or the project budget |
| `carrier` (`contractor_logistics`) | Delivery windows, routes, staging assignment for **own** loads | See material pricing or project financials |
| `crew` | Task assignment, safety information, capture surfaces | Any financial surface |
| `inspector` | Inspection scope (Group 3 §II.9.5 rotation) | Pricing, financials, other packages |

**The pricing wall is load-bearing.** A trade seeing the prime's margin on the trade's own scope destroys the prime's position on every subsequent package; a supplier seeing competing quotes destroys the bid process (Group 2 §II.8.4). Both are enforced by role scope, not by UI omission.

### II.1.2 The crew model *(G5-22)*

```
crew_members(company_id, user_id, identity_hash, qualifications[], status)

· INDIVIDUAL verified identity — the Group 3 §II.9.3 provenance chain binds to a
  person, not to a shared company login
· qualification matching at dispatch operates per crew member (§II.8.3)
· the classification firewall (§II.11) operates on real people
· entry into an occupied dwelling surfaces the entrant's identity to the tenant (§II.1.4)
```

### II.1.3 Invariants

- **I-1** *(inherited)* No Group 5 RLS policy may use `current_user_role_group()` for row access except the literal `admin` branch. They call `is_work_package_party()`.
- **I-2** *(inherited)* No billing path holds any grant on companies, crew, work packages, or party rows.
- **I-13** *(new)* **No compliance state may freeze funds already earned for completed, verified work.** Enforced at the disbursement layer. (§II.7)
- **I-14** *(new)* A payment split may never route prime margin ahead of an unpaid trust-priority claimant. (§II.5.3)
- **I-15** *(new)* Filing a preliminary notice, lien, or bond claim may never affect dispatch eligibility, rating, or payment routing. (§II.5.4)
- **I-16** *(new)* Dispatch is blocked unless the **scope match** (trade × classification × jurisdiction × threshold) and the **qualification match** both hold. (§II.2.5, §II.8.3)

### II.1.4 Occupied-dwelling packages *(G5-26)*

A maintenance package whose site is a tenant-occupied unit requires: statutory entry notice generated and served per Group 7's jurisdiction rules; tenant scheduling consent recorded; the assigned crew member's identity and photo surfaced to the tenant in advance; and an entry log the tenant can see. No dispatch occurs without all four.

---

## II.2 Credentialing — The Trade Ladder *(resolves G5-01, G5-14, G5-15, G5-16, G5-29)*

### II.2.1 Levels

| Level | Proves | Evidence | Unlocks |
|---|---|---|---|
| **C0** | Nothing | Email, phone | Browse public opportunities; regional indices |
| **C1** | A real natural person | V1 IDV (IAL2), device and phone binding | Saved searches, RFQ receipt, profile |
| **C2** | A licensed, insured company | Licence bound to the **natural person licensee** (§II.2.3) · GL · **workers' compensation** · auto · W-9 · verified payout account | Bidding, contracting, dispatch within matched scope |
| **C3** | Package-qualified | Scope match (§II.2.5) · qualification match (§II.8.3) · bonds where required · carrier compliance for `contractor_logistics` (§II.9.5) | Dispatch to this package; draw participation |

### II.2.2 Progressive credentialing *(G5-29)*

```
Each rung unlocks concrete earning capability — nothing is gated behind full completion.
CARRIER-DIRECT COI    ingested from the insurer or broker; the contractor never uploads
                      a certificate and renewals arrive automatically (this alone removes
                      the largest source of G5-08 false positives)
LICENCE LOOKUP        by number; trade, classification, jurisdiction, and standing
                      auto-populate from the authority
MOBILE-FIRST          camera capture, large targets, offline tolerance, resumable
COMPLETION PATH       "your crew can start Monday if you add X" — always the shortest
                      path to the next dollar, never a checklist
BROKER ASSIST         a channel to obtain missing coverage rather than a dead end
```

### II.2.3 Licence binding and cluster inheritance *(G5-16)*

```
A licence binds to the NATURAL PERSON LICENSEE and to their verified role in the
entity (owner | RMO | RME | qualifying party), re-attested periodically BY THE
LICENSEE THEMSELVES — not by the entity. This is the licence-lending control.

Suspensions, safety events, and disciplinary history attach to the IDENTITY CLUSTER
(Group 2 §II.2.3) and are inherited by any new entity the control persons register.
Re-incorporation after a safety suspension inherits the suspension.
```

### II.2.4 Coverage and bonds as distinct objects *(G5-14, G5-15)*

```
COVERAGES     general liability · WORKERS' COMPENSATION · auto · umbrella ·
              (carriers) cargo + motor carrier liability
              each with limits, endorsements (additional insured, waiver of
              subrogation, primary and non-contributory), and independent expiry
EXEMPTIONS    sole-proprietor WC exemptions modelled EXPLICITLY — never silently
              treated as covered
BONDS         TYPED with obligee, principal, penal sum, and claim deadline:
                licence bond      (protects the public)
                PAYMENT BOND      (protects subs and suppliers — tracked in §II.5.4)
                performance bond  (protects the owner)
              The UI never renders an undifferentiated "bonded" badge.
```

### II.2.5 The Scope Match Engine *(G5-01 — the fix, and a genuine feature)*

```
A work package DECLARES:  required_trade · required_classification ·
                          jurisdiction · scope_threshold (value / structural / permit)

Dispatch is BLOCKED unless the company holds all four. Near-misses surface the
SPECIFIC missing dimension:

    "You hold C-10 Electrical in Kings County. This package is in Nassau County,
     where your licence is not recognized. Reciprocity: none. Apply here →"

No competitor tells a subcontractor WHY they are ineligible before they mobilize.
This control is also the product.

REVERSE CHECK: the owner-side surface shows Group 1 and Group 2 users that every
dispatched contractor is scope-matched — which is what protects them from the
§7031 disgorgement exposure the draft would have created.
```

### II.2.6 Monitoring

Licence standing re-verified on the authority's cadence and on any disciplinary event; coverage expiry tracked against the **policy** where carrier-direct, and against the certificate only as a fallback with a wider grace window (§II.7.2). A lapse degrades C2→C1: existing packages continue under §II.7's prospective-only rule; new dispatch stops.

---

## II.3 The Directory Pane — Work Package Workspaces *(resolves G5-24)*

### II.3.1 Definition

> A Group 5 **Workspace** is `(company_id, work_package_id)`, plus a Dispatch workspace for opportunity flow and a Company workspace for compliance and cash flow. Navigation, map scope, Co-Pilot context, and authorization are the same unit.

### II.3.2 Tree shape

```
DIRECTORY  (Left Pane · 250px · React Server Component · zero client hooks)
│
├─ ◈ Company                          ← aggregate; no package context
│    ├─ Credentials & Coverage   (licence, GL, WC, bonds, expiries — §II.2.4)
│    ├─ Crew & Qualifications    (individuals; §II.1.2)
│    ├─ Cash Flow                (draws, retainage held, prompt-pay clocks)
│    ├─ Notices & Deadlines      (§II.5.4 — lien and bond calendar)
│    ├─ Safety                   (incidents, OSHA log, stop-work history)
│    └─ Billing
│
├─ 📋 Dispatch                        ← opportunity flow, NOT assignment (§II.11)
│    ├─ Open Opportunities   (scope-matched; you may accept or decline freely)
│    ├─ RFQs & Bids          (sealed until deadline — Group 2 §II.8.4)
│    └─ Declined             (declining costs nothing, ever)
│
├─ 🔨 Harrison Infill — Rough Electrical    ← WORKSPACE  wp_role=trade
│    ├─ Scope & Trade CAD    (trade EXTRACT only, watermarked — §II.9.4)
│    ├─ Schedule & Site      (staging visible only if you have a delivery role)
│    ├─ Progress & Evidence  (provenance-bound capture — §II.6.5)
│    ├─ Payment              (entitlement, waivers, retainage, prompt-pay clock)
│    ├─ Safety               (stop-work button — always present, always free)
│    └─ Notices              (preliminary notice status, lien deadline)
│
├─ 🚛 Eastside — Concrete Delivery Wed 06:00 ← WORKSPACE  wp_role=carrier
│    ├─ Load & Route · Site Window & Crane Sync · HOS Feasibility (§II.9.5)
│    └─ Proof of Delivery    (counter-signed; §II.6.3)
│
└─ 📦 Supplier — Open Orders               ← WORKSPACE  wp_role=supplier
     ├─ Quotes & Orders · Deliveries & Acceptance · Settlement
     └─ Regional Index      (historical, lagged, non-attributable — §II.9.3)
```

### II.3.3 Server-side derivation

`work_package_manifest()` runs under the caller's RLS-scoped session in the RSC. Subtabs absent from the manifest are not rendered **and** their routes independently reject direct navigation. The pricing wall (§II.1.1) is a manifest-level exclusion, not a render condition. **The Safety subtab and its stop-work control are present in every package workspace for every role including `crew`, and cannot be removed by any configuration.**

### II.3.4 Context isolation

Inherited from Group 1 §II.3.4: identifiers only (`{ companyId, workPackageId, wpRole, epoch }`), never prose; `is_work_package_party()` re-checked server-side with 403 returned **without invoking the model**; epoch fencing; per-workspace transcript partitioning; retrieval purged within 24h of a party row's termination.

**Group 5 specific:** the Co-Pilot in a `trade` workspace has no retrieval access to project-level BoQ, budget, or pricing beyond the trade's own scope — the pricing wall applies to the model as well as the UI.

---

## II.4 Sub-Role Portals — Hardened Feature Matrices

### II.4.1 A · General Contractor — `contractor_gc`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Scope & Schedule** | Package scope, BoQ lines for the package, critical path, permits | `prime` |
| **Trades & Dispatch** | Publish scoped opportunities; scope-match preview; award | C2 + §II.2.5 |
| **Progress & Evidence** | Provenance-bound capture bound to a crew member (§II.6.5) | `prime` or `crew` |
| **Draws** | Request draws; entitlement view; waiver exchange; retainage ledger | **request only — never approve** (Group 3 §II.9.2) |
| **Trust Ledger** | Draw proceeds as accounted trust res in statutory priority (§II.5.3) | `prime` |
| **Safety** | Incidents, stop-work log, OSHA log, qualification matrix | always present |
| **Notices** | Preliminary notices served, lien and bond deadlines | §II.5.4 |

**Hardening deltas from draft**
- The GC **cannot approve its own draw** — Group 3 §II.9.2 three-key release applies (G5-27).
- Draw proceeds are a tracked trust res; **prime margin disburses last** (I-14).
- Scope-match is enforced before any trade is dispatched, protecting the GC from §7031 exposure on its own subs.
- Delivery confirmation requires counter-signature (§II.6.3) — the GC's scan alone releases nothing.

### II.4.2 B · Specialty Sub-Contractor — `contractor_sub`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Scope & Trade CAD** | **Trade extract only**, watermarked, expiring (§II.9.4) | `trade` |
| **Schedule & Site** | Own work windows; staging only with a delivery role (§II.10) | `trade` |
| **Progress & Evidence** | Provenance-bound capture, crew-member bound | `trade` / `crew` |
| **Payment** | Entitlement detail, waiver exchange, retainage held, **prompt-pay clock with accruing statutory interest** | `trade` |
| **Notices** | Preliminary notice status, lien deadline, payment-bond claim deadline | §II.5.4 |
| **Safety** | Stop-work authority, incident reporting, own qualifications | always present |

**Hardening deltas from draft**
- The payment **guarantee** is withdrawn and replaced with verifiable mechanism: a live funding badge showing escrow balance against committed scope, an accurate description of what direct-pay routing does and does not cover, and full §II.5.4 notice assistance (G5-03).
- **Lien rights are assisted, not eliminated** — preliminary notices generated and served automatically, deadlines calendared, reminders escalating, and filing carries **zero** consequence for dispatch, rating, or routing (G5-04, I-15).
- Splits compute from **approved entitlement**, not a static proportion (G5-05).
- **The sub cannot see the prime's margin.** The pricing wall runs both ways.
- Downstream subs are insulated from an upstream party's compliance state (§II.7.4).

### II.4.3 C · Material Supplier — `contractor_supplier`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Quotes & Orders** | RFQs sent to them; own quotes; order pipeline | C2 |
| **Deliveries & Acceptance** | PoD counter-signature, quantity and condition, acceptance window, rejection path | §II.6.3, §II.6.4 |
| **Settlement** | Staged settlement, warranty holdback, dispute state | §II.6.4 |
| **Regional Index** | Historical, lagged, aggregated, **non-attributable** material indices | §II.9.3 |

**Hardening deltas from draft**
- The **network-wide BoQ demand heatmap is withdrawn** (G5-10, G5-11). Suppliers see their own pipeline, RFQs sent to them, and the regional index.
- Suppliers **cannot see competing quotes**, before or after award (Group 2 §II.8.4 parity).
- "Instant AR settlement" becomes **staged** settlement: undisputed quantity on counter-signed delivery, balance on acceptance-window expiry, warranty holdback where the material class requires it (G5-13).
- Spec-match capture at delivery defeats substitution fraud.

### II.4.4 D · Logistics & Warehousing — `contractor_logistics`

| Subtab | Capabilities | Gates |
|---|---|---|
| **Load & Route** | Assigned loads, routing, oversize permits | C3 + §II.9.5 |
| **Site Window & Crane Sync** | Delivery window, hoisting readiness, **HOS feasibility check** | §II.9.5 |
| **Warehouse Capacity** | Own capacity listing, staging assignments | C2 |
| **Proof of Delivery** | Driver-side attestation with quantity and condition | §II.6.3 |
| **Compliance** | Carrier authority, safety rating, CDL and medical per driver, cargo limits | §II.9.5 |

**Hardening deltas from draft**
- Full carrier compliance is modelled, not just "municipal traffic fines" (G5-20).
- **HOS-aware scheduling refuses to book a window a compliant driver cannot legally meet** — the JIT design's pressure on drivers is the hazard, and this is the control.
- Crane operator certification and a lift plan are required before a hoisting window opens.
- The driver counter-signs delivery; the GC's scan alone releases nothing (G5-07).
- Staging locations and windows are need-to-know (§II.10).

---

## II.5 Payment Protection Architecture *(resolves G5-03, G5-04, G5-05, G5-13, G5-17, G5-18)*

### II.5.1 Funding verification replaces the guarantee *(G5-03)*

```
WITHDRAWN:  "guaranteeing direct payment", "completely eliminates withholding risk",
            "eliminates B2B credit risk"

REPLACED BY a live, inspectable FUNDING BADGE on every work package:
   · escrow balance vs. committed scope, updated live
   · funding source and its state (Group 3 facility status, including any freeze)
   · what direct-pay routing DOES cover: routing at the moment of a released draw
   · what it does NOT cover: escrow shortfall, developer default, lender freeze,
     contested milestones, competing lien claims, asserted backcharges
   · surfaced BEFORE acceptance, acknowledged into `disclosures`

A mechanism honestly described is worth more than a guarantee that fails once.
```

### II.5.2 Entitlement Engine *(G5-05)*

```
approved_entitlement =
      base scope earned to date
    + approved change orders
    − asserted and substantiated backcharges
    − retainage (§II.5.5)
    − prior payments

Splits compute from THIS, per tier, per period. Never from a static proportion.
Disputed components split into an UNDISPUTED portion (which pays) and a CONTESTED
delta (which escalates) — the Group 4 §II.5.7 pattern applied to progress payments,
so a disagreement over one change order never holds a whole payment hostage.
```

### II.5.3 Trust-fund accounting *(G5-05, I-14)*

```
Draw proceeds are held as an ACCOUNTED TRUST RES where the jurisdiction imposes one
(NY Lien Law Art. 3-A and analogues), disbursed in STATUTORY PRIORITY:

    1. labor and wages
    2. materials and equipment
    3. subcontractors
    4. required insurance, bonds, and taxes
    5. PRIME OVERHEAD AND MARGIN — LAST

I-14 is enforced at the disbursement layer: a split routing prime margin ahead of an
unpaid higher-priority claimant is REJECTED. Automated splitting is the best idea in
the draft, and priority ordering is what makes it lawful rather than a diversion engine.

LEGAL PROCESS REGISTER: garnishments, tax levies, child-support orders, and assignments
intercept routing BEFORE settlement. A wallet split that ignores service of process
exposes the payer.
```

### II.5.4 Lien & Notice Assistance *(G5-04 — the reframe)*

```
The platform ASSISTS the statutory right. It never suppresses it.

PRELIMINARY NOTICE   auto-generated per jurisdiction on package acceptance; served by
                     the required method; proof of service retained and surfaced
DEADLINE CALENDAR    lien, bond-claim, and stop-notice deadlines per package per
                     jurisdiction, computed from the correct triggering event
ESCALATING REMINDERS at 50%, 75%, 90% of the window, to the individual, not a shared inbox
FILING SUPPORT       document preparation with a handoff to Group 4 counsel where the
                     jurisdiction or the amount warrants it
I-15 (ABSOLUTE)      filing a notice, lien, or bond claim NEVER affects dispatch
                     eligibility, rating, or payment routing. Retaliation for filing is
                     a platform violation with defined consequences, and the pattern is
                     monitored (§IV.4).
CARVE-OUT            lien and prompt-payment rights are excluded from the arbitration
                     clause per Group 4 §II.5.2 and from every waiver the platform
                     generates.
```

### II.5.5 Retainage and prompt payment *(G5-17, G5-18)*

```
RETAINAGE     tracked PER TIER against the jurisdiction's statutory cap; scheduled
              release on substantial completion or the statutory schedule; reminders;
              a held-retainage ledger visible to the party whose money it is
PROMPT PAY    per-jurisdiction clocks PER TIER, started by the correct triggering event;
              STATUTORY INTEREST accrues automatically and is displayed to BOTH parties;
              non-waivable rights are never included in any platform-generated waiver
WAIVER        conditional on submission, unconditional on clearance — at EVERY TIER,
EXCHANGE      atomic with the payment, so the owner is never exposed to a lien for work
              they paid for (Group 1 §II.7.3 gates 6–7 extended down the chain)
```

---

## II.6 Delivery & Progress Verification *(resolves G5-06, G5-07, G5-13, G5-27)*

### II.6.1 Governing rules

Inherited and binding: the Group 1 §II.7.2 two-phase intent protocol on every money movement; USD denomination with the ±2% settlement band; **a model may block a disbursement, never release one** (Group 3 §II.7.3).

### II.6.2 Provenance-bound delivery *(G5-06)*

The Group 3 §II.9.3 evidence bundle, applied to delivery:

```
NONCE          server-issued, single-use, displayed at the gate, bound to the load
IN-APP ONLY    scan path only; a transmitted or photographed code does not authenticate
DEVICE ATTEST  platform attestation binding the scan to a real device and app build
GEOFENCE       within the parcel boundary, tolerance configured per site
TIMESTAMP      attested capture time; server receipt recorded separately
REPLAY         nonce single-use; cross-load reuse detected and blocked
CREW BINDING   the scanning individual is identified (§II.1.2)

Any provenance failure BLOCKS. It never warns.
```

### II.6.3 Counter-signed delivery *(G5-07)*

```
Delivery confirmation requires BOTH:
   · the RECEIVING party's provenance-bound scan
   · the DELIVERING driver's attestation
with QUANTITY and CONDITION captured by each, independently.

DISCREPANCY → partial acceptance: the undisputed quantity settles immediately, the
              remainder escalates. Nobody's whole payment is hostage to a partial
              disagreement.
NON-CONFIRM → a receiving party that neither confirms nor states a deficiency within
              the window AUTO-ESCALATES. Silence at the gate is not leverage.
GATE PROTECT  the driver's attestation is recorded even if the receiver refuses, which
              is what removes the coercion (G5-07).
```

### II.6.4 Acceptance, rejection and spec match *(G5-13)*

```
SPEC MATCH        product identifiers, mill certs or submittals where the class requires
                  them, captured at delivery — the substitution-fraud control
ACCEPTANCE WINDOW defined per material class; settlement STAGES across it
REJECTION PATH    reverses the staged settlement, generates the return authorization,
                  and opens a dispute — a path that simply does not exist in the draft
WARRANTY HOLD     a holdback for material classes where latent defect risk warrants it
```

### II.6.5 Progress evidence *(G5-27)*

Group 5 owns the **submission** side of the draw: the provenance-bound evidence bundle, bound to the identified crew member who captured it. Release remains the Group 3 §II.9.2 three-key act — contractor requests, independent rotated inspector attests, lender releases under dual control. Vision output is advisory to release and dispositive to block.

---

## II.7 Proportionate Compliance Holds *(resolves G5-08)*

### II.7.1 The governing distinction

> **Prospective controls are permitted and immediate. Retrospective confiscation is never permitted.**
> A credential lapse may suspend **new** dispatch at once. It may **never** freeze funds already earned for completed, verified work. (Invariant I-13)

### II.7.2 Hold ladder

| State | Trigger | Effect |
|---|---|---|
| **Warning** | Coverage or licence expiring within the notice window | Banner, reminder, broker-assist link. **No** operational effect. |
| **Dispatch hold** | Expiry reached, no renewal evidence | **New** dispatch suspended. Existing work continues. Earned funds unaffected. |
| **Site hold** | Confirmed cancellation, or a licence suspension by the authority | Work stops on safety and legality grounds. Earned funds **still** unaffected. |
| **Funds hold** | **Never on compliance grounds.** Only on a Group 3 §II.9.2 gate failure, a competing lien claim, or a Group 4 disputed-deposit freeze | Requires a specific stated basis; visible to the payee with a running clock |

### II.7.3 False-positive control *(the largest real-world defect in G5-08)*

```
CARRIER-DIRECT      coverage state read from the insurer or broker, not from a
                    certificate's printed date — this removes most false positives
                    at the source (§II.2.2)
GRACE               calibrated to observed renewal behaviour; wider where the only
                    signal is a certificate
NOTICE FIRST        no operational effect without prior notice to the company and its
                    responsible person
APPEAL              same-day path with evidence upload and human review
SOURCE FAILURE      a verification source that is down, rate-limited, or schema-drifted
                    is a PLATFORM failure, not a contractor failure — it never triggers
                    a hold (Group 2 §II.9.2 parser-drift rule)
ADVERSARIAL         hold triggers attributable to a counterparty action are flagged and
                    reviewed before taking effect
```

### II.7.4 Downstream insulation

A hold on an upstream party **never** freezes a downstream party's earned funds. A trade's payment does not stop because the prime's certificate lapsed — that is the prime's compliance problem and, under §II.5.3, the trade's money is trust res the prime does not own.

---

## II.8 Safety Architecture *(resolves G5-09, G5-19)*

### II.8.1 Stop-work authority

```
ANY person physically on site — including an individual `crew` member of a
sub-subcontractor — may invoke a stop-work in-app, on the hazard, in seconds.

PROTECTED ABSOLUTELY:
  · a stop-work call NEVER costs the caller money, dispatch eligibility, or rating
  · the caller may remain anonymous to parties other than the safety responder
  · retaliation is a platform violation with defined consequences
  · stop-work rate is NEVER a negative metric on any dashboard, anywhere

Work resumes only on documented abatement by a qualified person.
```

### II.8.2 Incident capture and serious-injury protocol

Near-miss, injury, and property-damage capture with photographs and witness identification; **OSHA 300/300A-equivalent log generation** per establishment per year; a serious-injury protocol with the statutory reporting clock, site-preservation instructions, and an immediate notification chain; and root-cause capture that feeds qualification and dispatch rules rather than a punishment record.

### II.8.3 Qualification-to-task matching *(G5-19)*

```
Work packages DECLARE required qualifications (rigging, confined space, fall
protection, competent-person roles, trenching, hot work…).

Dispatch is BLOCKED absent a current match AT THE CREW-MEMBER LEVEL (§II.1.2) —
company-level possession is not a match, because the company does not do the lift.

Expiring qualifications WARN before they block. The vault becomes a control.
```

### II.8.4 Decoupling safety from cash flow

```
Structurally enforced:
  · a stop-work or incident NEVER accelerates or decelerates any payment
  · schedule pressure is never surfaced as a payment consequence to a crew member
  · no dashboard ranks companies by speed without safety context
  · the JIT crane-sync window (§II.9.5) yields to an HOS or fatigue constraint
    ALWAYS — the window moves, the driver does not

Safety must never have to win an argument against cash flow, so the design does not
let them meet.
```

---

## II.9 Supply Chain, Data & Logistics Compliance *(resolves G5-10, G5-11, G5-20, G5-23)*

### II.9.1 BoQ confidentiality

BoQ line items are scoped to work-package membership. A `trade` sees their own scope; a `supplier` sees only the lines in an RFQ addressed to them; a `carrier` sees loads, never pricing. This satisfies the taxonomy's own prohibition and Group 2 §II.8.4.

### II.9.2 The demand map is withdrawn *(G5-10)*

The network-wide demand heatmap is **withdrawn**. Suppliers see their own order history and pipeline, RFQs deliberately sent to them, and the §II.9.3 regional index.

### II.9.3 Regional material index — the antitrust-safe replacement *(G5-11)*

```
HISTORICAL      never forward-looking. Forward-looking demand shared among competing
                suppliers is the configuration information-exchange doctrine treats
                most severely.
LAGGED          minimum publication lag
AGGREGATED      above a participant-count floor, with small-cell suppression
NON-ATTRIBUTABLE no project, developer, architect, or competitor is identifiable
CONTENT         historical regional consumption by material class, price indices,
                lead-time distributions — genuinely useful for inventory planning, and
                the part suppliers actually need
RFQ PRIVACY     individual RFQs are visible only to invited suppliers; quote contents
                are never visible to competing suppliers, before or after award
```

### II.9.4 Trade CAD extraction *(G5-23)*

Trade-scoped **extracts** generated per work package rather than whole-model access; per-recipient watermarking; licence terms surfaced and acknowledged; access expiring with the package; download logging visible to the architect. Group 6 owns the extraction pipeline and the licence terms.

### II.9.5 Carrier and lift compliance *(G5-20)*

```
CARRIER        operating authority and safety rating verified; cargo and auto liability
               limits verified AGAINST LOAD VALUE
DRIVER         CDL class and endorsements, medical certification, per driver, tracked
               as crew members (§II.1.2)
HOURS OF       HOS-AWARE SCHEDULING: the platform REFUSES to book a delivery window a
SERVICE        compliant driver cannot legally meet. The JIT design's core pressure is
               on the driver, and this is the control that resolves it.
PERMITS        oversize/overweight permits and route validation before dispatch
CRANE          operator certification and a lift plan required before a hoisting window
               opens; the window yields to weather and fatigue constraints
```

---

## II.10 Site Security *(resolves G5-21)*

```
Staging locations, delivery windows, and crane schedules answer the question a
construction thief asks. They are NEED-TO-KNOW:

VISIBILITY    work-package parties with a delivery role, at their role's resolution
              · `trade`  → own work windows only; no staging locations
              · `carrier` → own loads and assigned staging only
              · `prime`  → full site logistics
REGIONAL      coarse only; no staging locations, no windows, no crane schedules
HISTORICAL    staging data ages out on a fixed schedule
LOGGING       delivery-schedule access is logged; bulk or anomalous access to future
              windows raises review
HIGH-VALUE    material classes above a value threshold suppress the window from every
              surface except the receiving party and the carrier
```

---

## II.11 Worker Classification Firewall *(resolves G5-02)*

**This cannot be fixed with a gate. It requires architecting away from control.**

| Control the draft creates | Replacement |
|---|---|
| Dispatch board **assigns** work | The platform **publishes opportunities**; the contractor accepts or declines freely, and declining costs nothing, ever |
| Platform sets schedule | The **GC's** schedule is the GC's, surfaced as information; the platform imposes none |
| Platform sets pay | **Contractors set their own rates** and bid them |
| Performance rating as discipline | **Factual completion records** — on-time, scope-complete, safety events — never a subjective score used to withhold work |
| Exclusive dispatch | **No exclusivity.** Working off-platform is never penalized |
| Suspension at will | Suspension **only** on credential or safety grounds, with notice and appeal (§II.7.2) |

```
CLASSIFICATION MONITOR: continuously evaluates the platform's own control factors per
jurisdiction (ABC, economic reality, common law) and raises a design review when a
surface drifts toward control. This is a PRODUCT constraint, not a legal footnote —
the monitor gates feature launches.

EMPLOYER-OF-RECORD PATH: an optional, properly licensed EOR arrangement for parties who
want employment rather than contracting. Offered, never defaulted, never a condition
of dispatch.
```

---

## II.12 Monetization *(resolves G5-25)*

### II.12.1 Fee structure

| Surface | Permitted | Forbidden | Rationale |
|---|---|---|---|
| Trade tools | Flat seat subscription paid by the company | Any % of draws; any per-draw fee scaling with amount | Takes from earned funds and from trust res (§II.5.3) |
| Materials marketplace | % marketplace fee paid **by the supplier**, disclosed | Deduction from escrowed principal without itemized pre-disclosure; fee-weighted default ranking | Group 1 §II.8.3, Group 2 §II.8.4 parity |
| Logistics | Flat per-booking operational fee | Any fee varying with load value or with meeting a window | A fee that rewards hitting the window pressures the driver (§II.9.5) |
| Dispatch | **Nothing** | Any fee, tier, or boost affecting work allocation or ranking | Pay-to-play on work allocation, and it deepens G5-02 |
| Notices & liens | Included in the base subscription | Any fee to exercise a statutory right | Charging for a lien deadline reminder is charging for the protection itself |

**No fee is ever deducted from a trust res, from a subcontractor's payment, or from escrowed principal.** No fee on any Group 5 surface affects dispatch eligibility or ranking.

### II.12.2 Obligation Lock

Inherited from Group 1 §II.8.5. A company with an active work package, held retainage, an open draw, a pending notice deadline, or an open safety matter is pinned to a free `ent.custodial` state on payment failure: full read, export, evidence submission, payment receipt, **notice and lien deadline access**, and safety reporting on existing packages; only net-new bidding is withheld. **A dunning failure can never separate a contractor from their earned money, their lien deadlines, or their safety records.**

---

# PART III — IMPLEMENTATION SPECIFICATION

## III.1 Schema Additions

Target migration files, sequenced after the Group 4 set (`0027`–`0032`):

- `0033_group5_companies_crew.sql`
- `0034_group5_work_packages.sql`
- `0035_group5_payment_protection.sql`
- `0036_group5_delivery_safety.sql`
- `0037_group5_rls.sql`

> `contractor_logistics` was added to the enum in Group 4's `0027_group4_taxonomy_expansion.sql` (Appendix D of that document). Group 5 owns its app-map, group-string, and policy detail — see Appendix B.

### III.1.1 `0033_group5_companies_crew.sql`

```sql
create type credential_level as enum ('C0','C1','C2','C3');
create type licensee_role    as enum ('owner','rmo','rme','qualifying_party');
create type coverage_kind    as enum
  ('general_liability','workers_comp','auto','umbrella','cargo','motor_carrier');
create type bond_kind        as enum ('licence','payment','performance');

create table companies (
  id                uuid primary key default gen_random_uuid(),
  legal_name        text not null,
  credential_level  credential_level not null default 'C0',
  payout_account_ref text,
  payout_changed_at timestamptz,                  -- 72h delay + OOB confirm
  created_at        timestamptz not null default now()
);

-- G5-01 / G5-16: a licence is four-dimensional AND bound to a natural person.
create table trade_licences (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  licensee_user_id  uuid not null references users(id),      -- the NATURAL PERSON
  licensee_role     licensee_role not null,                  -- anti licence-lending
  identity_hash     text not null,                           -- Group 2 §II.2.3 cluster
  trade             text not null,
  classification    text not null,                           -- e.g. 'C-10', 'B'
  jurisdiction      text not null,
  scope_threshold   jsonb not null default '{}'::jsonb,      -- value / structural / permit
  standing          text not null check (standing in ('active','inactive','suspended','revoked')),
  verified_at       timestamptz not null,
  reverify_due      timestamptz not null,
  licensee_attested_at timestamptz,                          -- BY THE LICENSEE, periodically
  unique (company_id, trade, classification, jurisdiction)
);
create index tl_identity on trade_licences (identity_hash);

create table coverages (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  kind           coverage_kind not null,
  carrier_name   text not null,
  policy_number  text not null,
  limits         jsonb not null,
  endorsements   text[] not null default '{}',   -- additional_insured, waiver_of_subrogation…
  effective_on   date not null,
  expires_on     date not null,
  -- G5-08: carrier-direct beats certificate dates. Source matters for grace width.
  source         text not null check (source in ('carrier_direct','broker_direct','certificate')),
  cancelled_at   timestamptz,                    -- CONFIRMED cancellation ≠ expiry
  exemption_ref  text,                           -- sole-proprietor WC exemption
  unique (company_id, kind, policy_number)
);

-- G5-15: bonds are typed, with obligee and claim deadline. No generic "bonded" badge.
create table bonds (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  kind           bond_kind not null,
  surety         text not null,
  obligee        text not null,
  principal      text not null,
  penal_sum_cents bigint not null,
  claim_deadline_rule text not null,             -- feeds §II.5.4 calendar
  effective_on   date not null,
  expires_on     date not null
);

-- G5-22: INDIVIDUALS. Provenance, qualification matching, and classification all
-- require knowing who the people are.
create table crew_members (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  identity_hash  text not null,
  status         text not null default 'active' check (status in ('active','inactive')),
  created_at     timestamptz not null default now(),
  unique (company_id, user_id)
);

create table crew_qualifications (
  id             uuid primary key default gen_random_uuid(),
  crew_member_id uuid not null references crew_members(id) on delete cascade,
  qualification  text not null,        -- 'rigging','confined_space','fall_protection',
                                       -- 'competent_person_excavation','cdl_a','nccco'…
  issuer         text not null,
  issued_on      date not null,
  expires_on     date,
  verified_at    timestamptz not null,
  unique (crew_member_id, qualification)
);

-- I-2 inherited
create trigger companies_no_billing before insert or update or delete on companies
  for each row execute function assert_not_billing_actor();
create trigger crew_no_billing before insert or update or delete on crew_members
  for each row execute function assert_not_billing_actor();
revoke all on companies, trade_licences, coverages, bonds, crew_members from billing_writer;
```

### III.1.2 `0034_group5_work_packages.sql`

```sql
create type wp_role  as enum ('prime','trade','supplier','carrier','crew','inspector');
create type wp_state as enum
  ('draft','open_for_bid','awarded','mobilized','in_progress','substantially_complete',
   'closed','terminated');

create table work_packages (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid references deals(id),
  facility_id       uuid references facilities(id),
  property_id       uuid not null references properties(id),
  parent_wp_id      uuid references work_packages(id),      -- sub-tier chain
  label             text not null,
  state             wp_state not null default 'draft',
  jurisdiction      text not null,
  -- §II.2.5 Scope Match Engine
  required_trade    text not null,
  required_classification text not null,
  scope_threshold   jsonb not null default '{}'::jsonb,
  -- §II.8.3 qualification matching
  required_qualifications text[] not null default '{}',
  -- occupied dwelling (§II.1.4)
  occupied_dwelling boolean not null default false,
  contract_value_cents bigint,
  retainage_bps     int not null default 1000,
  created_at        timestamptz not null default now()
);

-- THE Group 5 authorization primitive (§II.1)
create table wp_parties (
  id             uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  company_id     uuid references companies(id),
  user_id        uuid not null references users(id) on delete cascade,
  role           wp_role not null,
  scope          text[] not null default '{}',
  expires_at     timestamptz,
  status         text not null default 'active' check (status in ('active','expired','revoked')),
  created_at     timestamptz not null default now(),
  unique (work_package_id, user_id, role)
);
create index wpp_lookup on wp_parties (user_id, work_package_id, status);

-- §II.2.5 / §II.8.3 / I-16: dispatch requires BOTH matches.
create or replace function scope_match(p_company uuid, p_wp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trade_licences l, work_packages w
     where w.id = p_wp and l.company_id = p_company
       and l.trade = w.required_trade
       and l.classification = w.required_classification
       and l.jurisdiction = w.jurisdiction
       and l.standing = 'active'
       and l.reverify_due > now()
  );
$$;

create or replace function qualification_match(p_crew uuid, p_wp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from work_packages w, unnest(w.required_qualifications) q
     where w.id = p_wp
       and not exists (select 1 from crew_qualifications cq
                        where cq.crew_member_id = p_crew and cq.qualification = q
                          and (cq.expires_on is null or cq.expires_on > current_date))
  );
$$;

create or replace function guard_dispatch() returns trigger
language plpgsql as $$
declare w work_packages;
begin
  if new.role in ('prime','trade') and new.company_id is not null then
    if not scope_match(new.company_id, new.work_package_id) then
      raise exception 'G5-01: scope match failed — trade/classification/jurisdiction'
        using errcode = '42501';
    end if;
  end if;
  if new.role = 'crew' then
    if not qualification_match(
        (select id from crew_members where user_id = new.user_id
          and company_id = new.company_id), new.work_package_id) then
      raise exception 'G5-19: crew qualification match failed' using errcode = '42501';
    end if;
  end if;
  -- §II.1.4 occupied dwelling
  select * into w from work_packages where id = new.work_package_id;
  if w.occupied_dwelling and new.role in ('trade','crew') then
    if not exists (select 1 from dwelling_entry_consents c
                    where c.work_package_id = w.id and c.tenant_consented_at is not null
                      and c.notice_served_at is not null) then
      raise exception 'G5-26: entry notice and tenant consent required' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger wp_parties_dispatch_guard before insert on wp_parties
  for each row execute function guard_dispatch();

create table dwelling_entry_consents (              -- §II.1.4 (Group 7 supplies rules)
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  tenant_user_id  uuid references users(id),
  notice_served_at timestamptz,
  notice_method   text,
  tenant_consented_at timestamptz,
  scheduled_window tstzrange,
  entrant_crew_member_id uuid references crew_members(id),
  entered_at      timestamptz
);
```

### III.1.3 `0035_group5_payment_protection.sql`

```sql
-- §II.5.2 Entitlement Engine
create table wp_entitlements (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  period_end      date not null,
  base_earned_cents      bigint not null default 0,
  change_orders_cents    bigint not null default 0,
  backcharges_cents      bigint not null default 0,
  retainage_cents        bigint not null default 0,
  prior_payments_cents   bigint not null default 0,
  -- undisputed vs contested (Group 4 §II.5.7 pattern applied to progress payments)
  undisputed_cents bigint generated always as (
    greatest(base_earned_cents + change_orders_cents
             - backcharges_cents - retainage_cents - prior_payments_cents, 0)) stored,
  contested_cents bigint not null default 0,
  unique (work_package_id, period_end)
);

-- §II.5.3 Trust-fund accounting. Priority order is the whole point.
create type trust_priority as enum
  ('labor','materials','subcontractors','insurance_bonds_taxes','prime_margin');

create table trust_res (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid references facilities(id),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  draw_ref        text not null,
  received_cents  bigint not null,
  jurisdiction    text not null,
  statute_applies boolean not null default false,   -- NY Lien Law Art. 3-A analogues
  received_at     timestamptz not null default now()
);

create table trust_claims (
  id             uuid primary key default gen_random_uuid(),
  trust_res_id   uuid not null references trust_res(id) on delete cascade,
  claimant_id    uuid not null references users(id),
  priority       trust_priority not null,
  amount_cents   bigint not null,
  satisfied_cents bigint not null default 0,
  created_at     timestamptz not null default now()
);

-- I-14: prime margin can never disburse ahead of an unsatisfied higher priority.
create or replace function guard_trust_priority() returns trigger
language plpgsql as $$
declare unsatisfied bigint;
begin
  if new.satisfied_cents > old.satisfied_cents and new.priority = 'prime_margin' then
    select coalesce(sum(amount_cents - satisfied_cents), 0) into unsatisfied
      from trust_claims
     where trust_res_id = new.trust_res_id
       and priority < 'prime_margin'::trust_priority;
    if unsatisfied > 0 then
      raise exception 'I-14: % cents of higher-priority trust claims unsatisfied', unsatisfied
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trust_claims_priority_guard before update on trust_claims
  for each row execute function guard_trust_priority();

-- §II.5.3 legal process register — intercepts routing BEFORE settlement
create table payment_encumbrances (
  id            uuid primary key default gen_random_uuid(),
  payee_user_id uuid not null references users(id),
  kind          text not null check (kind in
                  ('garnishment','tax_levy','child_support','assignment')),
  authority_ref text not null,
  amount_cents  bigint,
  served_at     timestamptz not null,
  released_at   timestamptz
);

-- §II.5.4 Lien & Notice Assistance
create table statutory_notices (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  claimant_id     uuid not null references users(id),
  kind            text not null check (kind in
                    ('preliminary_notice','notice_of_intent','lien','bond_claim','stop_notice')),
  jurisdiction    text not null,
  deadline_on     date not null,
  generated_at    timestamptz,
  served_at       timestamptz,
  service_method  text,
  proof_doc_id    uuid references documents(id),
  filed_at        timestamptz
);
create index sn_deadlines on statutory_notices (deadline_on) where filed_at is null;

-- I-15 (ABSOLUTE): filing NEVER affects dispatch, rating, or routing.
-- Enforced by the ABSENCE of any read path from statutory_notices into dispatch,
-- ranking, or payment-routing code — verified by `retaliation-lint` (§IV.3).

-- §II.5.5 prompt payment + retainage
create table prompt_pay_clocks (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  payee_id        uuid not null references users(id),
  jurisdiction    text not null,
  trigger_event   text not null,
  started_at      timestamptz not null,
  statutory_days  int not null,
  paid_at         timestamptz,
  interest_rate_bps int not null,
  accrued_interest_cents bigint not null default 0
);

create table retainage_ledger (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  holder_id       uuid not null references users(id),
  payee_id        uuid not null references users(id),
  held_cents      bigint not null default 0,
  statutory_cap_bps int not null,
  release_due_on  date,
  released_cents  bigint not null default 0
);

-- §II.5.5 waiver exchange AT EVERY TIER (extends Group 1 §II.7.3 gates 6-7 downward)
create table tier_waivers (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  tier            int not null,                  -- 0=prime, 1=trade, 2=sub-sub…
  period_end      date not null,
  waiver_type     text not null check (waiver_type in ('conditional','unconditional')),
  party_id        uuid not null references users(id),
  document_id     uuid references documents(id),
  executed_at     timestamptz not null default now(),
  unique (work_package_id, tier, period_end, waiver_type, party_id)
);
```

### III.1.4 `0036_group5_delivery_safety.sql`

```sql
-- §II.6.2 / §II.6.3 provenance-bound, COUNTER-SIGNED delivery
create table delivery_events (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  order_ref       text not null,
  supplier_id     uuid references companies(id),
  carrier_id      uuid references companies(id),
  -- server-issued, single-use, bound to the load (G5-06)
  capture_nonce   text not null unique,
  -- receiving side
  receiver_crew_id uuid references crew_members(id),
  receiver_scanned_at timestamptz,
  receiver_device_attestation jsonb,
  receiver_geo_verified boolean not null default false,
  receiver_qty    numeric,
  receiver_condition text,
  -- delivering side (G5-07 counter-signature)
  driver_crew_id  uuid references crew_members(id),
  driver_attested_at timestamptz,
  driver_qty      numeric,
  driver_condition text,
  -- §II.6.4
  spec_identifiers jsonb,
  acceptance_window_ends timestamptz,
  rejected_at     timestamptz,
  rejection_reason text,
  escalated_at    timestamptz
);

-- G5-06 / G5-07: no single-party release. Provenance failure BLOCKS.
create or replace function delivery_confirmed(p_event uuid) returns boolean
language sql stable as $$
  select d.receiver_scanned_at is not null
     and d.driver_attested_at  is not null
     and d.receiver_geo_verified
     and d.receiver_device_attestation ? 'verified'
     and d.rejected_at is null
    from delivery_events d where d.id = p_event;
$$;

-- settles the undisputed quantity; the delta escalates (§II.6.3)
create or replace function delivery_undisputed_qty(p_event uuid) returns numeric
language sql stable as $$
  select least(coalesce(d.receiver_qty, 0), coalesce(d.driver_qty, 0))
    from delivery_events d where d.id = p_event;
$$;

-- §II.7 Proportionate compliance holds
create type hold_level as enum ('warning','dispatch_hold','site_hold');

create table compliance_holds (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  level          hold_level not null,
  basis          text not null,
  source_kind    text not null check (source_kind in
                   ('carrier_direct','broker_direct','certificate','authority')),
  notice_sent_at timestamptz,
  effective_at   timestamptz not null,
  appealed_at    timestamptz,
  cleared_at     timestamptz
);
-- I-13: there is deliberately NO 'funds_hold' level on this table.
-- Compliance state cannot reach the disbursement layer at all.

-- §II.8 Safety
create table stop_work_events (
  id             uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  invoked_by     uuid not null references users(id),
  anonymous_to_parties boolean not null default false,
  hazard         text not null,
  invoked_at     timestamptz not null default now(),
  abated_at      timestamptz,
  abated_by      uuid references users(id),
  abatement_note text
);
-- §II.8.1: a stop-work NEVER affects payment, dispatch, or rating. Enforced by the
-- ABSENCE of any read path from this table into those systems (`safety-lint`, §IV.3).

create table safety_incidents (
  id             uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  severity       text not null check (severity in
                   ('near_miss','first_aid','recordable','lost_time','hospitalization','fatality')),
  occurred_at    timestamptz not null,
  reported_at    timestamptz not null default now(),
  crew_member_id uuid references crew_members(id),
  narrative      text not null,
  -- serious-injury protocol (§II.8.2)
  regulator_report_due_at timestamptz,
  regulator_reported_at   timestamptz,
  site_preserved boolean,
  root_cause     jsonb
);

create table osha_log_entries (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  establishment  text not null,
  year           int not null,
  incident_id    uuid references safety_incidents(id),
  case_class     text not null
);
```

## III.2 RLS Helper Functions

```sql
-- ── The Group 5 authorization predicate (Invariant I-1) ────────────────────
create or replace function public.is_work_package_party(
  p_wp uuid, p_facet text default null, p_role wp_role default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wp_parties p
     where p.work_package_id = p_wp and p.user_id = auth.uid()
       and p.status = 'active'
       and (p.expires_at is null or p.expires_at > now())
       and (p_facet is null or p_facet = any(p.scope))
       and (p_role  is null or p.role = p_role)
  );
$$;

-- ── The pricing wall (§II.1.1) — load-bearing, both directions ────────────
create or replace function public.may_see_pricing(p_wp uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_work_package_party(p_wp, null, 'prime')
      or current_user_role_group() = 'admin';
  -- `trade` never sees prime margin; `supplier` never sees competing quotes;
  -- `carrier` never sees material pricing.
$$;

-- ── I-13: compliance state CANNOT reach the disbursement layer ─────────────
create or replace function public.dispatch_permitted(p_company uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from compliance_holds h
                      where h.company_id = p_company
                        and h.level in ('dispatch_hold','site_hold')
                        and h.cleared_at is null and h.effective_at <= now());
$$;
-- There is deliberately NO `payment_permitted(company)` function. Earned funds are
-- unreachable from compliance state by construction, not by policy.

-- ── §II.5.3 legal process interception ────────────────────────────────────
create or replace function public.payment_encumbered(p_payee uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payment_encumbrances e
                  where e.payee_user_id = p_payee and e.released_at is null);
$$;
```

## III.3 Group 5 RLS Policies — `0037_group5_rls.sql`

```sql
-- documents: work-package membership, NOT the contractor group string (G5-12) ---
drop policy if exists "documents_privilege_scoped" on documents;
create policy "documents_privilege_scoped_v2" on documents for select
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
                  and is_work_package_party(w.id, 'documents'))     -- ← Group 5
      or current_user_role_group() = 'admin'
    ) else
      may_read_privileged(documents.matter_id, documents.privilege_holder_id)
    end
    and documents.tombstoned_at is null
  );
-- NOTE: `current_user_role_group() = 'contractor'` never appears. A contractor
-- reaches a document by being on the work package. Nothing else.

-- vision_inspections: work-package party, not role group ------------------
drop policy if exists "vision_inspections_scoped_v2" on vision_inspections;
create policy "vision_inspections_scoped_v3" on vision_inspections for select
  using (
    has_property_capacity(vision_inspections.property_id, null, 'V2')
    or exists (select 1 from facilities f where f.property_id = vision_inspections.property_id
                and is_facility_party(f.id, 'inspection'))
    or exists (select 1 from deals d where d.primary_property_id = vision_inspections.property_id
                and is_deal_member(d.id, 'inspection'))
    or exists (select 1 from work_packages w where w.property_id = vision_inspections.property_id
                and is_work_package_party(w.id, 'inspection'))
    or current_user_role_group() = 'admin'
  );

-- work_packages / wp_parties ---------------------------------------------
alter table work_packages enable row level security;
create policy "wp_party_select" on work_packages for select
  using (is_work_package_party(work_packages.id) or current_user_role_group() = 'admin');
alter table wp_parties enable row level security;
create policy "wpp_self_or_prime_select" on wp_parties for select
  using (user_id = auth.uid()
         or is_work_package_party(work_package_id, null, 'prime')
         or current_user_role_group() = 'admin');

-- THE PRICING WALL (§II.1.1) ---------------------------------------------
alter table wp_entitlements enable row level security;
create policy "entitlement_own_tier" on wp_entitlements for select
  using (
    may_see_pricing(work_package_id)
    or exists (select 1 from wp_parties p
                where p.work_package_id = wp_entitlements.work_package_id
                  and p.user_id = auth.uid() and p.role = 'trade'
                  and p.status = 'active')
  );
-- A `trade` sees its OWN entitlement row; the prime's margin lives on the prime's
-- own row, which the trade's predicate does not reach.

-- statutory notices: the claimant's own, always, unconditionally (I-15) ---
alter table statutory_notices enable row level security;
create policy "notices_claimant_select" on statutory_notices for select
  using (claimant_id = auth.uid()
         or is_work_package_party(work_package_id, null, 'prime')
         or current_user_role_group() = 'admin');
create policy "notices_claimant_insert" on statutory_notices for insert
  with check (claimant_id = auth.uid());
-- Deliberately unconditional on compliance holds, ratings, or dispatch state:
-- exercising a statutory right can never be gated (I-15).

-- trust claims: claimants see their own; the prime sees the res ------------
alter table trust_claims enable row level security;
create policy "trust_claims_scoped" on trust_claims for select
  using (claimant_id = auth.uid()
         or exists (select 1 from trust_res r
                     where r.id = trust_claims.trust_res_id
                       and is_work_package_party(r.work_package_id, null, 'prime')));

-- delivery events: counter-signature parties only -------------------------
alter table delivery_events enable row level security;
create policy "delivery_parties_select" on delivery_events for select
  using (is_work_package_party(work_package_id, 'delivery')
         or current_user_role_group() = 'admin');
create policy "delivery_no_single_party_confirm" on delivery_events for update
  using (is_work_package_party(work_package_id, 'delivery'));
-- Settlement reads delivery_confirmed(), which requires BOTH sides. A single
-- party's update can never satisfy it.

-- compliance holds: the company and admin. NEVER a payment predicate. ------
alter table compliance_holds enable row level security;
create policy "holds_company_select" on compliance_holds for select
  using (exists (select 1 from crew_members c
                  where c.company_id = compliance_holds.company_id and c.user_id = auth.uid())
         or current_user_role_group() = 'admin');

-- safety: stop-work is readable by everyone on the package; the invoker may
-- be anonymous to parties other than the safety responder (§II.8.1) -------
alter table stop_work_events enable row level security;
create policy "stop_work_package_select" on stop_work_events for select
  using (is_work_package_party(work_package_id) or current_user_role_group() = 'admin');
create policy "stop_work_anyone_on_site_insert" on stop_work_events for insert
  with check (is_work_package_party(work_package_id));
-- INSERT is deliberately open to EVERY role on the package including `crew`.
-- Stop-work authority that a worker cannot exercise is not stop-work authority.

alter table safety_incidents enable row level security;
create policy "incidents_package_select" on safety_incidents for select
  using (is_work_package_party(work_package_id) or current_user_role_group() = 'admin');
create policy "incidents_anyone_insert" on safety_incidents for insert
  with check (is_work_package_party(work_package_id));
```

## III.4 `work_package_manifest()`

```sql
create or replace function public.work_package_manifest()
returns jsonb
language sql stable security definer set search_path = public as $$
with me as (
  select p.work_package_id, p.role, w.label, w.state, w.occupied_dwelling,
         c.id as company_id,
         dispatch_permitted(c.id) as may_dispatch
    from wp_parties p
    join work_packages w on w.id = p.work_package_id
    left join companies c on c.id = p.company_id
   where p.user_id = auth.uid() and p.status = 'active'
     and (p.expires_at is null or p.expires_at > now())
)
select jsonb_build_object(
  'upsell_allowed', true,
  'dispatch', jsonb_build_object(
     'subtabs', jsonb_build_array('opportunities','rfqs','declined'),
     -- §II.7: a hold suppresses NEW dispatch only. Existing packages persist below.
     'enabled', coalesce(bool_or(me.may_dispatch), false)),
  'company', jsonb_build_array(
     'credentials','crew','cash_flow','notices','safety','billing'),
  'workspaces', coalesce(jsonb_agg(jsonb_build_object(
      'work_package_id', me.work_package_id,
      'label', me.label,
      'state', me.state,
      'role',  me.role,
      'subtabs', case me.role
        when 'prime' then
          jsonb_build_array('scope','trades','progress','draws','trust','safety','notices')
        when 'trade' then
          -- NO project BoQ, NO prime margin, NO other trades' pricing (§II.1.1)
          jsonb_build_array('scope_cad','schedule','progress','payment','notices','safety')
        when 'supplier' then
          jsonb_build_array('quotes','deliveries','settlement','regional_index')
        when 'carrier' then
          jsonb_build_array('load_route','site_window','proof_of_delivery','compliance')
        when 'crew' then
          -- crew see task + safety. NO financial surface, ever.
          jsonb_build_array('task','safety')
        else jsonb_build_array('task','safety') end
  ) order by me.state), '[]'::jsonb)
) from me;
$$;
```

> The **Safety** subtab appears in every branch, including `crew`. There is no configuration, entitlement, or hold that removes it (§II.3.3).

## III.5 API Contracts

### `POST /api/companies/credentials`
```
Request  { company_id, kind, payload }
Guards   authenticated; identity-cluster rate limits (Group 2 §II.2.3)
Effect   licence lookup auto-populates trade/classification/jurisdiction/standing and
         binds to the NATURAL PERSON licensee with their role in the entity;
         coverage prefers carrier_direct ingestion over certificate upload
Response 200 { credential_level, missing[], next_unlock }
Errors   422 LICENSEE_ATTESTATION_REQUIRED · 409 CLUSTER_SUSPENSION_INHERITED
```

### `GET /api/dispatch/opportunities`
```
Effect   PUBLISHES scope-matched opportunities. It does not ASSIGN. (§II.11)
         Near-misses return with the SPECIFIC missing dimension named:
           { eligible: false, missing: 'jurisdiction',
             detail: 'C-10 held in Kings County; package is Nassau County; reciprocity: none' }
Note     declining is free and is recorded as neutral — never as a negative signal.
```

### `POST /api/work-packages/:id/parties`
```
Guards   guard_dispatch(): scope_match() for prime/trade · qualification_match() for crew
         · dispatch_permitted(company) · occupied-dwelling consent where applicable
Errors   403 SCOPE_MATCH_FAILED { missing_dimension } · 403 QUALIFICATION_MISSING { qual }
         · 403 DISPATCH_HOLD { basis, appeal_url } · 403 ENTRY_CONSENT_REQUIRED
```

### `POST /api/deliveries/:id/receive` · `POST /api/deliveries/:id/attest`
```
/receive  receiving crew member; server nonce; in-app scan only; device attestation;
          geofence; quantity + condition
/attest   DELIVERING DRIVER; recorded EVEN IF the receiver refuses (§II.6.3 gate protection)
Settlement runs only when delivery_confirmed() is true — i.e. BOTH sides.
A quantity discrepancy settles delivery_undisputed_qty() and escalates the delta.
Errors    422 PROVENANCE_FAILED { failed_checks[] } · 409 NONCE_CONSUMED
          · 202 PARTIAL_ACCEPTANCE { undisputed_qty, escalation_id }
```

### `POST /api/payments/splits`
```
Guards   entitlement computed from wp_entitlements (never a static proportion)
         · tier waiver exchange complete for the period
         · trust priority satisfied — I-14 rejects prime margin ahead of claimants
         · payment_encumbered(payee) intercepts BEFORE settlement
         · two-phase intent (Group 1 §II.7.2); USD denominated
Errors   409 WAIVER_MISSING { tier, party } · 409 TRUST_PRIORITY_UNSATISFIED { cents }
         · 423 PAYMENT_ENCUMBERED { authority_ref } · 409 ENTITLEMENT_DISPUTED
```

### `POST /api/notices/preliminary`
```
Guards   claimant is a work-package party. NOTHING ELSE. (I-15)
         Explicitly NOT gated on: compliance holds, ratings, dispatch state,
         subscription state, or the prime's consent.
Effect   generates per jurisdiction, serves by the required method, retains proof
Note     `retaliation-lint` (§IV.3) fails the build if any dispatch, ranking, or
         payment-routing code path reads statutory_notices.
```

### `POST /api/safety/stop-work`
```
Guards   is_work_package_party() — ANY role, INCLUDING `crew`. No other gate.
Effect   halts the affected activity; notifies the safety responder; optionally
         anonymous to all other parties
Note     `safety-lint` fails the build if stop_work_events is readable from any
         payment, dispatch, ranking, or rating code path (§II.8.1).
```

### `POST /api/compliance/holds`
```
Guards   verification-source failure is a PLATFORM failure and CANNOT create a hold
Effect   ladder only: warning → dispatch_hold → site_hold. Notice precedes effect.
         THERE IS NO FUNDS-HOLD PATH. (I-13 — enforced by the absence of the enum value.)
Errors   409 SOURCE_UNAVAILABLE · 409 NOTICE_NOT_SERVED
```

### `GET|POST /api/copilot` *(Group 5 context)*
```
Request  { companyId, workPackageId, wpRole, epoch, messages }
Guards   is_work_package_party(workPackageId) → else 403, model NOT invoked
Effect   THE PRICING WALL APPLIES TO THE MODEL: a `trade` session's retrieval scope
         excludes project BoQ, budget, and any pricing beyond its own scope.
         A `crew` session has no financial retrieval at all.
```

## III.6 TypeScript Registry Deltas

```ts
// src/lib/rbac/roles.ts — contractor_logistics detail (Appendix B)
contractor_gc:        ['contractor', 'design', 'escrow'],
contractor_sub:       ['contractor', 'escrow'],
contractor_supplier:  ['contractor', 'escrow'],
contractor_logistics: ['contractor', 'escrow'],   // NEW — no `design`:
                                                  // a carrier never needs CAD.
// ROLE_GROUP_MAP
contractor_logistics: 'contractor',

// src/lib/rbac/workPackage.ts — NEW.
export type WpRole = 'prime' | 'trade' | 'supplier' | 'carrier' | 'crew' | 'inspector';
export type CredentialLevel = 'C0' | 'C1' | 'C2' | 'C3';

/** Mirrors is_work_package_party(). Called BEFORE any side effect. */
export async function assertWorkPackageParty(
  supabase: SupabaseClient, wpId: string, facet?: string, role?: WpRole,
): Promise<void>;

/** The four-dimensional licence match (G5-01). Returns the missing dimension. */
export async function scopeMatch(
  supabase: SupabaseClient, companyId: string, wpId: string,
): Promise<{ ok: true } | { ok: false; missing: 'trade'|'classification'|'jurisdiction'|'threshold' }>;

/** Crew-level qualification match (G5-19). */
export async function qualificationMatch(
  supabase: SupabaseClient, crewMemberId: string, wpId: string,
): Promise<{ ok: boolean; missing: string[] }>;

/** The pricing wall. Throws for trade/supplier/carrier roles. */
export async function assertMaySeePricing(
  supabase: SupabaseClient, wpId: string,
): Promise<void>;

/** I-13 guard. There is deliberately NO paymentPermitted(companyId) counterpart. */
export async function dispatchPermitted(
  supabase: SupabaseClient, companyId: string,
): Promise<boolean>;
```

---

# PART IV — VERIFICATION

## IV.1 Cross-Company Isolation Matrix

Actor is a party to **Work Package A**. Columns are what they may reach on **Package B** and within A.

| Actor | B docs | B pricing | A prime's margin | A other trades' pricing | A staging locations | B vision inspections | G1 distress |
|---|---|---|---|---|---|---|---|
| `contractor_gc` (`prime` on A) | ❌ | ❌ | own | ✅ (is the prime) | ✅ | ❌ | ❌ **never** |
| `contractor_sub` (`trade` on A) | ❌ | ❌ | ❌ **walled** | ❌ **walled** | ❌ (no delivery role) | ❌ | ❌ **never** |
| `contractor_supplier` on A | ❌ | ❌ | ❌ | ❌ (no competing quotes) | ❌ | ❌ | ❌ **never** |
| `contractor_logistics` on A | ❌ | ❌ | ❌ | ❌ | own loads only | ❌ | ❌ **never** |
| `crew` on A | ❌ | ❌ | ❌ | ❌ | task-scoped | ❌ | ❌ **never** |
| `admin` | break-glass | break-glass | break-glass | break-glass | break-glass | break-glass | audited |

The **pricing wall** rows are load-bearing: a trade seeing the prime's margin on its own scope destroys the prime's position on every subsequent package, and a supplier seeing competing quotes destroys the bid process.

## IV.2 Acceptance Criteria

**Licensing & classification**
- [ ] A company licensed in Jurisdiction A cannot be dispatched to a package in Jurisdiction B; the error names `jurisdiction` as the missing dimension. *(G5-01.)*
- [ ] A "B" general licensee cannot be dispatched to a package requiring `C-10` beyond the threshold; the error names `classification`.
- [ ] A licence with no current licensee attestation degrades and blocks new dispatch. *(G5-16.)*
- [ ] A new company registered by control persons carrying a safety suspension inherits it at creation. *(Cluster inheritance; Group 2 §II.2.3 parity.)*
- [ ] Workers' compensation is verified as a **distinct** coverage; a company with GL only cannot reach C2. *(G5-14.)*
- [ ] A sole-proprietor WC exemption is modelled explicitly and is not silently treated as coverage.
- [ ] The UI never renders an undifferentiated "bonded" badge; payment bonds surface with obligee and claim deadline. *(G5-15.)*

**Payment protection**
- [ ] The words "guarantee", "guaranteed", and "eliminates … risk" appear nowhere in Group 5 product copy. *(Copy scan in CI. G5-03.)*
- [ ] The funding badge renders escrow balance against committed scope and the facility's freeze state before a sub accepts, acknowledged into `disclosures`.
- [ ] A preliminary notice generates automatically on package acceptance and is served by the jurisdiction's required method with proof retained.
- [ ] **Filing a lien, notice, or bond claim produces zero change** in dispatch eligibility, opportunity ranking, rating, or payment routing — asserted by diffing all four before and after a filing. *(I-15, G5-04.)*
- [ ] Splits compute from `wp_entitlements`, not a static proportion; a change order alters the split in the same period. *(G5-05.)*
- [ ] A split routing prime margin while a higher-priority trust claim is unsatisfied is rejected. *(I-14.)*
- [ ] A served garnishment intercepts routing before settlement. *(G5-05.)*
- [ ] A tier waiver missing at any tier blocks the payment for that tier.
- [ ] Retainage above the jurisdiction's statutory cap is rejected; scheduled release fires with reminders.
- [ ] Prompt-pay interest accrues automatically and is visible to the payee.

**Delivery**
- [ ] A photographed or transmitted QR does not authenticate — in-app scan with a live server nonce only. *(G5-06.)*
- [ ] A consumed nonce returns `409 NONCE_CONSUMED`; cross-load reuse is blocked.
- [ ] A scan outside the geofence or with failed device attestation **blocks** — no configuration makes any provenance failure advisory.
- [ ] **Settlement does not occur on a single party's confirmation.** Receiver-only or driver-only leaves the delivery unsettled. *(G5-07.)*
- [ ] The driver's attestation is recorded **even when the receiver refuses**, and a non-confirming receiver auto-escalates at window expiry. *(Gate-side coercion control.)*
- [ ] A quantity discrepancy settles `delivery_undisputed_qty()` immediately and escalates only the delta.
- [ ] A rejection within the acceptance window reverses the staged settlement and opens a dispute. *(G5-13.)*
- [ ] Spec identifiers are captured for material classes requiring them.

**Compliance holds**
- [ ] **No code path exists by which a compliance hold reaches a disbursement.** *(I-13 — asserted structurally: `hold_level` has no funds value and no `payment_permitted()` function exists. G5-08.)*
- [ ] An expiring certificate produces a warning with no operational effect; only a confirmed cancellation or authority suspension reaches `site_hold`.
- [ ] A hold cannot take effect without prior notice; an appeal is available same-day.
- [ ] A verification source that is down, rate-limited, or schema-drifted creates **no** hold. *(Fault injection.)*
- [ ] A hold on a prime does not stop a trade's earned payment. *(§II.7.4 downstream insulation.)*

**Safety**
- [ ] **Any package party including `crew` can invoke stop-work**, and the invoking user's payment, dispatch eligibility, and rating are unchanged afterward — asserted by diffing all three. *(G5-09.)*
- [ ] Stop-work rate appears on no ranking, scoring, or comparison surface. *(`safety-lint`.)*
- [ ] Crew-level qualification match blocks dispatch; company-level possession does not satisfy it. *(G5-19.)*
- [ ] A hospitalization or fatality opens the serious-injury protocol with the reporting clock and site-preservation instructions.
- [ ] An OSHA 300A-equivalent generates per establishment per year from `safety_incidents`.
- [ ] A stop-work or incident produces **no** change to any payment timing. *(§II.8.4.)*

**Data, antitrust & security**
- [ ] No endpoint, tile, or export returns network-wide BoQ-derived demand. *(G5-10, `score-lint` extension.)*
- [ ] No supplier-visible surface is forward-looking; the regional index is historical, lagged, aggregated above the participant floor, and non-attributable. *(G5-11.)*
- [ ] A supplier cannot read a competing quote before or after award. *(Group 2 §II.8.4 parity.)*
- [ ] A `trade` receives a watermarked trade **extract**, never the whole model; access expires with the package. *(G5-23.)*
- [ ] Staging locations and delivery windows are unreachable by a `trade` with no delivery role; bulk access to future windows raises review. *(G5-21.)*

**RBAC & classification**
- [ ] `grep -rn "current_user_role_group" supabase/migrations/` returns **zero** hits containing `'contractor'`. *(I-1, CI-enforced. G5-12.)*
- [ ] A `contractor_sub` cannot read the prime's margin or another trade's pricing on the same package. *(The pricing wall, asserted by direct query.)*
- [ ] A `contractor_supplier` cannot read another supplier's terms.
- [ ] A `crew` session has no financial surface in the manifest and no financial retrieval in the Co-Pilot.
- [ ] Provenance binds to an individual `crew_member`, not a shared company login. *(G5-22.)*
- [ ] Declining an opportunity produces no negative signal in ranking or eligibility. *(§II.11.)*
- [ ] No Stripe event mutates `companies`, `crew_members`, `work_packages`, or `wp_parties`. *(I-2 webhook fuzz.)*
- [ ] A maintenance package into an occupied dwelling requires notice, consent, entrant identity, and an entry log before dispatch. *(G5-26.)*

## IV.3 CI Guardrails

Groups 1–4 guardrails are inherited. Group 5 adds:

```
policy-lint       — extended: ZERO occurrences of 'contractor' inside
                    current_user_role_group() predicates (I-1)
funds-hold-lint   — fails if any code path can reach a disbursement predicate from
                    compliance_holds, or if a funds-level hold value is ever added
                    to hold_level (I-13, G5-08)
retaliation-lint  — fails if any dispatch, ranking, rating, or payment-routing code
                    path reads statutory_notices (I-15, G5-04)
safety-lint       — fails if stop_work_events or safety_incidents is readable from any
                    payment, dispatch, ranking, or rating path (§II.8.1/§II.8.4)
pricing-wall-lint — fails if a `trade`, `supplier`, `carrier`, or `crew` serializer can
                    emit prime margin, project BoQ, or a competing quote (§II.1.1)
trust-priority-lint — fails if any split path can satisfy prime_margin while a
                    higher-priority trust claim is unsatisfied (I-14)
delivery-lint     — fails if settlement is reachable without delivery_confirmed(), or
                    if any single-party confirmation path exists (G5-07)
scope-match-lint  — fails if any dispatch path bypasses scope_match() or
                    qualification_match() (I-16)
guarantee-lint    — copy scan: fails on "guarantee", "guaranteed", or "eliminates …
                    risk" in Group 5 product surfaces (G5-03)
forward-data-lint — fails if any supplier-visible aggregate is forward-looking (G5-11)
fee-lint          — extended: fails on any fee constant reachable from a trust res, a
                    sub payment, escrowed principal, or a dispatch-ranking path (G5-25)
```

## IV.4 Telemetry

**Credentialing funnel:** `C0 → C1 → C2 → first_bid → first_award → first_payment`. Alert on C1→C2 completion below 50% and on median C2 time above 5 days — this is the ecosystem's worst onboarding-burden-to-patience ratio (G5-29) and it will show here first. Break out by the specific blocking credential so the friction is attributable.

**Payment health (the G5-03/G5-04 signals):** prompt-pay clock breach rate by prime; accrued statutory interest by prime; **preliminary notices served versus deadlines missed** — the direct measure of whether the reframe is working; lien filings per prime and their correlation with subsequent dispatch (any correlation is an I-15 violation and pages immediately); trust-priority rejections; retainage held beyond the statutory release date.

**Delivery integrity:** provenance failure rate by check type; nonce reuse attempts; **single-party confirmation attempts** (the direct G5-07 collusion/coercion signal); receiver non-confirmation rate by prime (gate-side leverage); quantity discrepancy rate by supplier; rejection rate by material class.

**Compliance-hold health:** hold rate by source kind — a `certificate`-sourced hold rate materially above `carrier_direct` is the G5-08 false-positive signature; appeal rate and sustain rate; verification-source availability; holds cleared within one business day (a high rate means the grace window is too narrow).

**Safety:** stop-work invocation rate — **monitored as a positive indicator, never a negative one**, and explicitly excluded from every ranking surface; abatement time; incident severity distribution; qualification-match block rate; near-miss-to-recordable ratio. A prime whose stop-work rate is anomalously *low* relative to hours worked raises review, which is the correct direction.

**Classification risk (G5-02):** continuously computed control-factor score per jurisdiction — assignment versus publication ratio, schedule imposition, rate-setting, exclusivity, suspension basis distribution. A rising score gates feature launches (§II.11).

**Deliberately not collected:** any surface that ranks companies by speed without safety context; any forward-looking demand aggregate; any correlation product between lien filings and work allocation.

---

# PART V — RESIDUAL RISK & REGULATORY REVIEW QUEUE

## V.1 Accepted residual risks

| Risk | Why accepted | Compensating control |
|---|---|---|
| Off-platform side agreements between prime and trade | The platform cannot govern what parties agree in a trailer | Entitlement engine is the record; prompt-pay clocks run regardless; notice assistance is unconditional |
| A licence held validly but the licensee never on site | On-site presence is not observable from credential data | Licensee attestation by the natural person, cluster-level history, crew-member identity on capture |
| Physical-scene fraud surviving full delivery provenance | An adversary controlling both gate and truck can stage a genuine-looking delivery | Counter-signature from independent parties, quantity/condition from both, acceptance window, spec match |
| Trust-fund statutes vary and some jurisdictions impose none | The res model applies only where the statute does | Priority ordering applied uniformly as best practice; `statute_applies` recorded per jurisdiction |
| A prime that simply does not fund a package | Solvency is not a platform-curable condition | Funding badge before acceptance, notice assistance, prompt-pay interest, payment-bond claim tracking |

## V.2 Blocking regulatory review items

Each is a build-blocker for its surface.

1. **Worker classification, per state.** Whether the §II.11 firewall is sufficient under ABC, economic-reality, and common-law tests, and whether the dispatch surface creates joint-employer exposure. **Blocks:** the dispatch product. This is the largest unpriced liability in the group.
2. **Contractor licensing, per state.** Populating the scope-match matrix (trade × classification × jurisdiction × threshold) and confirming reciprocity rules. **Blocks:** dispatch in each state.
3. **B&P §7031-analogue exposure.** Confirm that scope-match at dispatch discharges the platform's role, and settle the disclosure owed to Group 1 and Group 2 users. **Blocks:** dispatch to consumers.
4. **Mechanic's lien and preliminary notice, per state.** Deadline computation, service methods, and form content for automated generation. **Blocks:** notice assistance — and getting a generated notice *wrong* is worse than not offering it.
5. **Construction trust-fund statutes.** Which jurisdictions impose one, the priority order, and personal or criminal liability for diversion. **Blocks:** the split engine.
6. **Prompt-payment statutes.** Timelines, triggering events, interest rates, and non-waivability per state. **Blocks:** payment clocks.
7. **Retainage statutes.** Caps and release schedules per state and per project type. **Blocks:** retainage.
8. **Lien waiver forms.** Statutory forms exist in several states and non-conforming waivers are void. **Blocks:** the waiver exchange.
9. **Insurance and surety.** Whether coverage verification and the "bonded" presentation create reliance exposure; additional-insured and waiver-of-subrogation endorsement handling. **Blocks:** the compliance vault.
10. **OSHA and state-plan obligations.** Whether generating logs and hosting incident data makes the platform a recordkeeping party, and multi-employer worksite doctrine. **Blocks:** the safety product.
11. **FMCSA / DOT.** Whether HOS-aware scheduling makes the platform a motor-carrier participant, and broker authority questions if it arranges transport. **Blocks:** logistics.
12. **Antitrust.** Information-exchange review of every supplier-visible aggregate, including the §II.9.3 index. Shared with Group 2 item 8 and Group 3 item 12.
13. **Payment intermediation.** Whether split routing constitutes money transmission. Shared with Group 1 item 1, Group 2 item 5, Group 3 item 8, Group 4 item 7. **Blocks:** all splits.

## V.3 Cross-group items surfaced here, owned elsewhere

- **Group 6** must supply the trade-CAD extraction pipeline, watermarking, and licence terms (§II.9.4), plus BoQ line-item scoping to work-package membership.
- **Group 7** must supply entry-notice rules, the tenant consent surface, and the tenant-visible entrant identity for occupied-dwelling packages (§II.1.4, G5-26).
- **Group 3** owns draw release; Group 5 supplies the submission side and consumes the three-key protocol unchanged (§II.6.5).
- **Group 4** receives lien and bond-claim filings that exceed the platform's document-preparation boundary (§II.5.4), and supplies the arbitrator path for delivery and entitlement escalations.
- **Group 8** must supply licence-authority integrations, carrier-direct insurance feeds, bond verification, and the inspector rotation pool Group 3 §II.9.5 requires.

---

# APPENDIX A — BOUNDARY CONTRACT WITH GROUPS 1–4

Extends the Group 2, 3, and 4 boundary tables.

| # | Contested surface | Prior position | Group 5 draft position | **Resolution** |
|---|---|---|---|---|
| A37 | Draw release authority | G3 §II.9.2: three keys; borrower requests, inspector attests, lender releases | AI verification + developer co-sign releases | **G3 governs.** Group 5 owns the submission side only (§II.6.5). |
| A38 | Vision authority | G1 §II.7.3 gate 1; G3 §II.7.3 automation principle | "Upon verification, the smart contract releases" | **G3 governs.** Advisory to release, dispositive to block. |
| A39 | Evidence provenance | G3 §II.9.3 bundle for photographs | QR scan for delivery; geotagged photos for progress | **Extended to delivery.** Full bundle plus counter-signature (§II.6.2, §II.6.3). |
| A40 | BoQ confidentiality | Taxonomy line 189; G2 §II.8.4 deal-membership scoping | Network-wide demand heatmap to suppliers | **Prior position governs.** Map withdrawn; regional index replaces it (§II.9.2, §II.9.3). |
| A41 | Competitive aggregates | G2 §II.5.2 amended by G3 §II.6.5 (no lender-pricing to lenders) | Forward-looking demand to suppliers | **Extended.** No forward-looking aggregate to any competing-supplier audience (§II.9.3). |
| A42 | Lien rights | G4 §II.5.2 carved liens out of arbitration as non-waivable | "Virtually eliminating mechanics liens" | **G4's reasoning governs and extends.** Rights are assisted, never suppressed; filing carries zero consequence (§II.5.4, I-15). |
| A43 | Waiver exchange | G1 §II.7.3 gates 6–7 at the GC tier | Not modelled below the GC | **Extended down the chain.** Waiver exchange at every tier (§II.5.5). |
| A44 | Contractor group scope | G3 A13 and G4 A26 closed the lender and attorney group strings | Four sub-roles share `contractor` | **Same closure, fourth group.** `is_work_package_party()` replaces the group string (§II.1). |
| A45 | Compliance freezes | G3 §II.9.6: a hold requires a stated deficiency and a running clock | COI lapse freezes draws | **Constrained.** Prospective controls only; earned funds are unreachable from compliance state (I-13, §II.7). |
| A46 | Payment guarantees | No prior blueprint promised one | "Guaranteeing direct payment" | **Withdrawn.** Verifiable funding badge and honest mechanism disclosure (§II.5.1). |
| A47 | Milestone upload gate | VULN-09; G3 §II.9.3 requires contractor capacity | Any authenticated contractor uploads | **Tightened.** Work-package party **and** identified crew member **and** provenance bundle. |
| A48 | Distress state | G1 §II.5.3, G2 A1, G3 A19, G4 A32 | Not raised | **Unchanged and restated.** No Group 5 surface exposes Group 1 distress state. |

---

# APPENDIX B — `contractor_logistics`: CLOSING THE TAXONOMY GAP

Group 4 Appendix D established that the corpus contains **27** rbac keys against a canonical count of 25, and that the two extras are `legal_arbitrator` (Group 4) and `contractor_logistics` (Group 5). Group 4's migration `0027_group4_taxonomy_expansion.sql` added both enum values. **Group 5 owns the `contractor_logistics` detail, supplied here:**

| Property | Value | Rationale |
|---|---|---|
| `rbac_key` | `contractor_logistics` | Named in `CLAUDE.md`'s own Group 5 summary: *"GCs, Sub-Trades, Suppliers, Logistics/3PL"* |
| Group string | `contractor` | Shares the coarse routing group; the security boundary is `is_work_package_party()` regardless |
| App segments | `['contractor', 'escrow']` | **No `design`** — a carrier never needs CAD access, and granting it would widen the §II.9.4 IP surface for no operational reason |
| `wp_role` | `carrier` | Loads, routes, staging assignment, PoD attestation. **Never** material pricing or project financials |
| Additional credentialing | Carrier authority and safety rating, CDL and medical per driver, HOS feasibility, cargo and motor-carrier coverage, oversize permits, crane certification and lift plans (§II.9.5) | The only sub-role in the ecosystem operating regulated equipment on public roads |
| Distinct hazard | Hours-of-service pressure created by the platform's own JIT design | §II.9.5's HOS-aware scheduling refuses to book a window a compliant driver cannot legally meet |

**Canonical count after Groups 4 and 5: 27.** Group 6 (`arch_ra`, `arch_engineer`, `arch_zoning`), Group 7 (`prop_manager`, `prop_tenant`), Group 8 (`admin`), and Group 9 (three `broker_*`) introduce no further keys against the corpus enumeration.

---

# APPENDIX C — Traceability to `rbac-audit-red-team.md`

| Prior finding | Status for Group 5 | Resolved at |
|---|---|---|
| **VULN-09** milestone-upload has no role check | **Fully closed.** Requires work-package party **and** identified crew member **and** a provenance bundle with nonce, geofence, device attestation, and replay detection. The original fix ("add a contractor role check") would have been insufficient — a contractor with a valid role and a stolen photograph still passes it | §II.6.5, §III.5 |
| VULN-04 no `compliance_checks` INSERT policy | Resolved at consumption — absence **blocks** at Group 3 §II.9.2 gate 5; Group 5 supplies the credential data that populates it | §II.2.4 |
| VULN-01 escrow release | Read half closed in G1, write half in G3; Group 5 adds delivery counter-signature and trust-priority ordering on the disbursement side | §II.5.3, §II.6.3 |
| VULN-06 ledger-linked deal-room events | Resolved in G3; work-package party branch added | §III.3 |
| DESIGN-01 `parties[].role` free text | Resolved — parties carry `(user_id, work_package_id, wp_role)` | §III.1.2 |
| DESIGN-03 layout `ALLOWED_ROLES` sets | Resolved — layout gates are coarse routing; the boundary is `is_work_package_party()` | §II.1 |

---

# APPENDIX D — Required Deltas to `phase8-sub-role-expansion-plan.md`

1. **BLOCKING — T8.2 must be rewritten for the contractor policies.** The plan widens `documents_scoped_access` and `vision_inspections_scoped` to `current_user_role_group()` group checks. **Applying T8.2 as written ships G5-12**: every contractor reads every project's documents and every property's inspection photographs. Those policies must instead be replaced per `0037_group5_rls.sql`.
2. **T8.3 — `ROLE_APP_MAP`.** Add `contractor_logistics: ['contractor','escrow']` per Appendix B. Note it deliberately omits `design`.
3. **T8.5 — layout gates.** `(contractor)/layout.tsx`'s allowlist must include `contractor_logistics`; omitting it silently locks the entire sub-role out of the app the moment the enum lands (the DESIGN-03 failure mode, repeated).
4. **New tasks T8.28–T8.32.** Migrations `0033`–`0037` (§III.1), sequenced after the Group 4 set `0027`–`0032`.
5. **T8.4 — API guards.** `POST /api/milestone-upload` needs far more than the contractor role check the plan implies: work-package party, identified crew member, server-issued nonce, in-app capture, geofence, device attestation, and replay detection (Appendix C, VULN-09).
6. **T8.6 — fixtures.** The `contractor` persona needs a `companies` row at C2, `trade_licences` matching the test property's jurisdiction and classification, `coverages` including **workers' compensation**, a `crew_members` row with qualifications, and `wp_parties` rows. Tests asserting that a contractor can read a document by role alone will fail correctly and must be rewritten against work-package membership. A separate `supplier` and `carrier` persona are required, and a test must assert the **pricing wall** — that a `trade` cannot read the prime's margin.
7. **Taxonomy count.** Restated from Group 4 Appendix D and closed in Appendix B above: the canonical count is **27**, not 25. `legal_arbitrator` maps to the new `neutral` group string; `contractor_logistics` maps to `contractor`.

---

**END OF MASTER BLUEPRINT — GROUP 5**
