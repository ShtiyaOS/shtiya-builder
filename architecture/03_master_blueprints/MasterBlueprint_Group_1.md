# MASTER BLUEPRINT — GROUP 1: THE SUPPLY (OWNER ENTITY)

**Document class:** Production Architecture Specification
**Supersedes:** `architecture/02_draft_blueprints/01_group_the-supply_owners.md`
**Version:** 2.0 (Red-Teamed / Hardened)
**Date:** 2026-08-19
**Taxonomy scope:** 3 of 25 sub-roles — `owner_single`, `owner_investor`, `owner_distressed`
**RLS group string:** `owner` (via `current_user_role_group()`)
**Stack:** Next.js 14 App Router · Supabase Postgres + RLS · Zustand Context Registry · Vercel AI SDK · Mapbox GL · $SHQL Web3 escrow

---

## 0. How To Read This Document

| Part | Contents |
|---|---|
| **Part I** | Red Team Audit — 21 findings, ranked, with exploit paths |
| **Part II** | Hardened Architecture — the corrected design |
| **Part III** | Implementation Spec — schema, RLS, API contracts, TS types |
| **Part IV** | Verification — RBAC matrix, acceptance criteria, telemetry |
| **Part V** | Residual Risk & Legal Review Queue |
| **Appendix A** | Traceability to `rbac-audit-red-team.md` (VULN-01…09) |
| **Appendix B** | Deltas required in `phase8-sub-role-expansion-plan.md` |

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/Design-Debt
Every finding carries a `FIX →` pointer to the Part II/III section that resolves it.

---

# PART I — RED TEAM AUDIT

## 0.1 Executive Verdict

The draft blueprint is commercially coherent and architecturally unsound. Three structural defects generate most of the 21 findings:

1. **Identity is conflated with entitlement.** The draft implies that *paying* for the Investor add-on grants the `owner_investor` role. Under the taxonomy, `role` is an RBAC key that widens data scope. A billing event must never widen a data scope. This is a privilege-escalation-by-credit-card vector.

2. **Roles are modelled per-account, but the domain is per-parcel.** A real user is `owner_single` on their residence, `owner_investor` on an inherited lot, and `owner_distressed` on a rental in arrears — *simultaneously*. A single `users.role` enum column cannot express this, so the draft's "Contextual Workspace Switching" has no authorization primitive underneath it. The Directory Pane would be switching between views the database cannot distinguish.

3. **Privacy is described as a UI toggle.** The "Privacy Lock" that shields `owner_distressed` users from wholesaler solicitation is specified as a map-layer suppression. All three owner sub-roles collapse to the single RLS group string `owner`; the suppression therefore has no database enforcement. The single highest-consequence failure mode in this entire group is a distress-signal leak, and the draft defends it client-side.

Layered on top: the monetization model **charges pre-foreclosure homeowners a subscription** and **takes a percentage referral fee on legal and mortgage-adjacent services**, both of which are not merely reputational risks but direct exposure under RESPA §8, ABA MRPC 5.4/7.2, and state foreclosure-consultant advance-fee statutes.

## 0.2 Finding Register

| ID | Sev | Domain | Finding |
|---|---|---|---|
| G1-01 | 🔴 | Onboarding | Deed-record name match is a fuzzy string compare — parcel takeover by name collision |
| G1-02 | 🔴 | RBAC | All three owner sub-roles collapse into RLS group `owner`; no sub-role isolation exists |
| G1-03 | 🔴 | Privacy | Distress exposure suppression is client-side only; distress signal leaks to Group 2/9 |
| G1-04 | 🔴 | Monetization | Subscription purchase escalates `users.role` → privilege escalation by payment |
| G1-05 | 🔴 | $SHQL | On-chain release precedes durable DB intent; funds can move with no ledger record |
| G1-06 | 🔴 | Legal/Fin | Percentage affiliate sweep on legal + HELOC referrals violates RESPA §8 / MRPC 5.4 |
| G1-07 | 🔴 | Legal/Fin | `$SHQL` micro-escrow "to retain legal counsel" is an advance fee for loss-mitigation |
| G1-08 | 🟠 | Onboarding | Co-owned parcels: first claimant obtains unilateral escrow authority over co-owners |
| G1-09 | 🟠 | Onboarding | LLC/trust title (majority of investor parcels) fails exact-name match → hard drop-off |
| G1-10 | 🟠 | JV | "Without holdout risk" implies drag-along coercion of consumer homeowners |
| G1-11 | 🟠 | JV | Sybil neighbors inflate committee opt-in percentages to manufacture social pressure |
| G1-12 | 🟠 | Privacy | Per-parcel neighbor opt-in status on the block map is PII-by-inference (doxxing) |
| G1-13 | 🟠 | $SHQL | Draw release has no lien-waiver exchange and no retainage → double-payment exposure |
| G1-14 | 🟠 | $SHQL | Distressed cure escrow is counterparty-attested → cure-stalling extortion under clock |
| G1-15 | 🟠 | RBAC | Co-Pilot context is client-supplied; stale workspace context bleeds across parcels |
| G1-16 | 🟠 | Monetization | Charging `owner_distressed` a subscription; upsell padlocks shown in Shield workspace |
| G1-17 | 🟡 | RBAC | `owner_investor` is granted the `acquisition` app segment but resolves to group `owner` |
| G1-18 | 🟡 | Onboarding | Hard verification gate before any delivered value → measured onboarding cliff |
| G1-19 | 🟡 | Monetization | Lapsed subscription strips access to committees the user is contractually bound to |
| G1-20 | 🟡 | $SHQL | USD obligations settled in a volatile token with no denomination or circuit breaker |
| G1-21 | 🟢 | Data | Stale municipal deed records permit claims on recently-transferred parcels |

---

## 1. Onboarding & Identity

### G1-01 🔴 The "3-Minute Verification Loop" is a parcel takeover primitive

**Draft text:** *"users bypass manual document uploads. The system utilizes an automated API match, cross-referencing the user's rapid identity verification (e.g., Plaid/Stripe) against municipal tax and deed records (e.g., NYC Open Data)."*

**Finding.** Identity verification (Plaid/Stripe Identity) proves *who you are*. Deed records prove *who owns the parcel*. Matching one against the other proves only that a person with a matching name exists. It does not prove that person is *this* person, and it proves nothing about current control of the property. NYC Open Data ACRIS grantee names are unnormalized free text. A verified "Maria Garcia" can claim any parcel deeded to any "Maria Garcia" in the five boroughs.

**Exploit.** Attacker completes legitimate KYC under their own real identity. Queries ACRIS/PLUTO for parcels whose grantee name matches theirs. Claims the highest-AVM match. They now hold `owner_single` on a stranger's home: full read of the Vitals dashboard, the ability to originate a HELOC application secured against that parcel, authority to open a $SHQL escrow and name a payee, and authority to invite "contractors" to the property. The real owner has no account and receives no notice.

**Blast radius.** Financial (fraudulent HELOC origination against a third party's equity), physical (dispatching vendors to an address), and reputational (the platform is the origination point of the fraud).

`FIX →` §II.2 Progressive Claim Ladder — V2 record match is necessary but *never sufficient*; V3 possession proof is mandatory before any capability that touches money, third parties, or the parcel address.

---

### G1-08 🟠 Co-ownership: first claimant obtains unilateral control

**Finding.** The draft models one owner per parcel. Reality: tenancy-in-common, joint tenancy with right of survivorship, tenancy by the entirety, and inherited fractional interests. A deed listing four grantees will record four names. First-claim-wins hands one of four co-owners the multi-signature draw-release authority described in §4.1 of the draft, plus the ability to sign a JV intent agreement encumbering the whole parcel.

**Exploit.** One sibling of four heirs claims the inherited parcel, executes a JV intent agreement with a Master Assembler, and collects earnest money into an escrow they alone control. The other three heirs are not users and are never notified.

`FIX →` §II.2.4 Co-owner Quorum + §II.6.3 (no single-signer parcel encumbrance).

---

### G1-09 🟠 Entity-held title breaks the match — silently

**Finding.** A large share of the `owner_investor` target population holds title in an LLC, a revocable living trust, or a family partnership. The grantee string is `SUNNYSIDE HOLDINGS LLC`, not a natural person's name. The draft's automated match returns zero results and the user is dropped into an unhandled state with no path forward — the exact user segment with the highest LTV.

`FIX →` §II.2.3 Entity Linkage Path (Secretary of State officer match / trust certification).

---

### G1-18 🟡 Verification precedes value — measured drop-off cliff

**Finding.** The flow is: sign up → KYC → deed match → *then* see anything. Consumer PropTech funnels lose 40–70% at an identity gate placed before first value. The draft's own selling point ("3-Minute") is an admission that the gate is the funnel's weakest joint; shortening a bad gate does not fix it.

`FIX →` §II.2.1 V0 Prospect state — full read-only Vitals on a self-asserted address, zero writes, zero map presence, resumable claim for 14 days.

---

### G1-21 🟢 Stale record window

**Finding.** Municipal deed recording lags transfer by 2–12 weeks. A seller who closed last month is still the grantee of record and can re-claim a parcel they no longer own; conversely a legitimate new buyer cannot claim for weeks.

`FIX →` §II.2.5 Recency guard, contest window, and 180-day re-attestation.

---

## 2. RBAC & Cross-Contamination

### G1-02 🔴 Sub-role isolation does not exist at the data layer

**Finding.** Per `phase8-sub-role-expansion-plan.md`, all of `owner_single`, `owner_investor`, `owner_distressed` map to the group string `owner`. Every Group 1 RLS policy (`properties_owner_access`, `documents_scoped_access`, `block_committees_member_access`, `deal_room_events_member_access`, `ledgers_party_access`) is written against `current_user_role_group()`. Therefore **the three sub-roles are indistinguishable to Postgres**. Every isolation guarantee the draft makes — "personal home data never bleeds into commercial investment data", the Privacy Lock, the Defensive Map View — is enforced only by which React component the Center Pane happens to render.

**Exploit.** Any owner-group session opens devtools, initializes `supabase-js` with the anon session, and reads every table the `owner` group can reach across every workspace the account touches, ignoring the Directory Pane entirely. Where the draft promises workspace isolation, there is a single flat scope.

**Compounding factor.** The draft's tiering makes this worse, not better: it wants a *paid* add-on to widen the role, meaning the widened scope is permanent and account-wide once purchased.

`FIX →` §II.1 Capacity Binding Model. Group 1 authorization moves from `users.role` (account-scoped) to `property_role_bindings` (parcel-scoped), enforced by `has_property_capacity()` in every Group 1 policy. `current_user_role_group()` is retained *only* for coarse app-segment routing, never for row access on Group 1 entities.

---

### G1-17 🟡 App-map / RLS-group divergence for `owner_investor`

**Finding.** `ROLE_APP_MAP` grants `owner_investor` the `acquisition` segment. The acquisition surface's data policies (`properties_investor_discovery`, `connections_investor_insert`) test `current_user_role_group() = 'investor'`. `owner_investor` resolves to `'owner'`. The user sees a navigable, paid-for app segment that returns zero rows in perpetuity.

The dangerous repair is the obvious one: widen the group check. That would hand every homeowner who buys a $29/mo add-on the same global property-discovery scope as a professional wholesaler — the exact bulk-exfiltration surface flagged as VULN-02/VULN-03.

`FIX →` §II.4.2. `acquisition` is **removed** from `owner_investor`'s app map. Assembly tooling lives inside the `owner` segment as parcel-scoped subtabs. `owner_investor` never joins the `investor` group.

---

### G1-15 🟠 Co-Pilot context bleed across workspaces

**Finding.** Per `terminal-layout-plan.md` T7.3/T7.6, Center Pane pages push a semantic context string into the Zustand store on mount, and `RightSidebar` injects that string into the request body via `prepareSendMessagesRequest`. Two defects:

1. **Stale context.** Zustand state survives route transitions. Navigating from the Assembly workspace to the Shield workspace before the new page's `useEffect` commits leaves the previous parcel's context attached to the next dispatched message.
2. **Client-supplied authority.** The context string arrives at `/api/copilot` from the browser. A modified client can send *any* context string — including a parcel identifier the user has no binding on — and the route will condition Gemini's response on it.

**Exploit.** Attacker sets the store context to a neighbor's BBL plus a prompt asking for lien-stack and arrears summarization. If the copilot route hydrates server-side data from the client-supplied identifier without re-authorizing, it becomes an RLS bypass with a natural-language interface.

`FIX →` §II.3.4. The client transmits `{ workspace_id, property_id, capacity }` identifiers only — never prose. The route re-derives every fact from the RLS-scoped server client under the caller's session, and hard-fails if `has_property_capacity()` is false. Context is versioned with a monotonic `workspace_epoch`; mismatched epochs are rejected rather than answered.

---

## 3. Privacy & Predation

### G1-03 🔴 Distress-signal leakage — the group's highest-consequence failure

**Finding.** The draft's Privacy Lock "explicitly suppresses unsolicited map pings from Wholesalers unless the user toggles a specific 'Seeking Exit' flag." Four independent leaks defeat this:

1. **No DB enforcement** (see G1-02) — suppression is a map-layer filter.
2. **Cross-group monetization of the signal.** The Group 9 draft states that a residential broker, *"by subscribing to premium data tiers… can view properties where an `owner_distressed` has toggled the 'Seeking Exit' flag."* The platform is therefore selling distress exposure as an upsell. Group 1's defensive posture and Group 9's revenue model are in direct contradiction.
3. **Removal is itself a signal.** If a parcel is present in the investor discovery feed and later disappears, the disappearance is information. Serial snapshots of the feed reconstruct exactly the state the Privacy Lock exists to hide.
4. **Sparse-result inference.** A geographically bounded query returning one or two parcels re-identifies the owner directly, since parcel → address → occupant is a public join.

**Exploit.** Wholesaler polls `/api/connections/discovery` hourly and diffs. Parcels that vanish, or that appear with a violation delta, are ranked as distress candidates. The wholesaler contacts them out-of-band (mail, door-knock, phone) — outside the platform, where no suppression applies. The platform has functioned as a distress-lead generator against its own defensive tier.

`FIX →` §II.5 Exposure Control Plane: default-deny `exposure_policy`, hysteresis + tombstoning so departures emit no signal, k-anonymity floor on all geo queries, an absolute `no_contact` register, and removal of distress state from every paid data product (§II.8.4).

---

### G1-12 🟠 Block-map neighbor status is doxxing-by-inference

**Finding.** The Assembly map colour-codes parcels by "the neighbors' verified willingness to participate." A parcel polygon is a street address. A street address is an identified household. Rendering per-parcel participation state to any subscriber reveals each neighbor's financial posture to every other neighbor, before any mutual consent exists — and to anyone who pays $29/mo and lives nearby.

**Secondary vector:** unbounded JV invitations become a harassment channel against a neighbor who has already declined.

`FIX →` §II.6.2. Pre-consent rendering is **aggregate-only** ("4 of 12 parcels responded") with a minimum cohort of 5 parcels. Per-parcel identity unlocks only on *mutual* opt-in. Invitations are quota-limited (3 per parcel lifetime, 1 per 30 days) and a decline sets a permanent suppression that no re-subscription clears.

---

### G1-11 🟠 Sybil neighbors manufacture assembly momentum

**Finding.** "Block Committee: 80% Joined" is a social-proof pressure instrument. If opt-in status can be set by unverified accounts, an assembler creates five accounts, claims five adjacent parcels at V2 (name-match only, per G1-01), and presents a genuine holdout with a fabricated consensus.

`FIX →` §II.6.4. Only V3-verified, contest-clear bindings increment the committee denominator or numerator. Invited-but-unverified parcels render in a visually distinct "invited" state and are excluded from all percentages and all valuation math.

---

## 4. Joint Venture & Assembly Mechanics

### G1-10 🟠 "Without holdout risk" is drag-along coercion of consumers

**Draft text:** *"executes multi-party on-chain locks to securely syndicate neighborhood assemblies without holdout risk."*

**Finding.** Holdout risk in an assembly is, from the holdout's side, simply the right to decline. Any mechanism that eliminates it is a mechanism that compels a homeowner to transfer their primary residence on terms set by a supermajority of neighbors. Encoding drag-along rights over owner-occupied residential property into a smart contract signed by consumers via a web UI invites unconscionability challenge, state consumer-protection enforcement, and — because the contract is autonomous — creates an irreversible transfer the platform cannot unwind when challenged.

The mandatory binding arbitration clause referenced in the master architecture compounds this: pre-dispute mandatory arbitration with class waivers, imposed on consumer homeowners in a transaction involving their residence, is the single most attackable clause in the product.

`FIX →` §II.6.1 Holdout-Priced Assembly. Non-participants are *excluded from the footprint*, never bound. Feasibility recomputes without them. §II.6.5 caps arbitration: 30-day opt-out, small-claims and statutory-claim carve-outs, no class waiver for the consumer tier.

---

## 5. $SHQL & Financial Mechanics

### G1-05 🔴 On-chain release precedes durable intent (Group-1 instance of VULN-01)

**Finding.** The existing `POST /api/escrow/release` fires `releaseFunds()` and then writes the ledger. Under RLS failure, network partition, or process termination between the two, value moves on-chain with no durable record. For Group 1 the payer is a consumer homeowner and the counterparty is a contractor — a class of dispute with statutory dimensions.

Group-1-specific aggravation: the draft assigns draw authorization to `owner_single`, so the caller is legitimately entitled to move funds. The failure is not authorization, it is **atomicity**. An owner clicks "Release Draw", the browser times out, they click again — and the current design offers no idempotency key.

`FIX →` §II.7.2 Two-Phase Intent Protocol: durable `escrow_intents` row committed *before* any RPC, client-supplied idempotency key with a uniqueness constraint, HTTP response explicitly non-authoritative, confirmation only via chain-indexer webhook, plus a 5-minute reconciler for stuck intents.

---

### G1-13 🟠 Draw release without lien-waiver exchange or retainage

**Finding.** The draft's milestone payment is: verified work → multi-sig → funds move. Missing: the exchange of a conditional waiver on the current draw and an unconditional waiver on the prior draw. Without it, a subcontractor who was not paid by the GC files a mechanic's lien against the homeowner's residence for work the homeowner already paid for. The homeowner pays twice. Also missing: retainage, so the final 5–10% needed to compel punch-list completion has already been disbursed.

`FIX →` §II.7.3 — waiver exchange is an atomic precondition of the release transaction; 10% retainage held until final acceptance plus expiry of the statutory lien period.

---

### G1-14 🟠 Cure escrow is counterparty-attested — extortion under a clock

**Finding.** The Legal Shield uses "$SHQL micro-escrows to retain legal counsel" for a homeowner facing an auction date. If release is gated on the professional's own attestation that the work is done, the professional holds an asset (the cure) that becomes exponentially more valuable to the owner as the deadline approaches. The rational adversarial move is to stall and renegotiate at T-minus-72-hours. The escrow, intended as protection, is the leverage.

`FIX →` §II.7.4 — release triggers exclusively on an **objective municipal oracle** state change (DOB/ECB/HPD violation status → closed; SWO → lifted), double-read ≥24h apart from independent fetches; hard `deadline_at` with automatic full reversion to the owner; unilateral owner substitution right at any time before cure.

---

### G1-06 🔴 Percentage affiliate sweeps on legal and mortgage-adjacent referrals

**Draft text:** *"All professional engagements (contractors, lawyers, brokers) executed through the portal trigger automated affiliate fees via $SHQL smart contracts"* and *"the smart contract seamlessly splits the platform's affiliate fee prior to vendor disbursement."*

**Finding.** This is one fee model applied to three legally distinct counterparty classes:

- **Legal services.** A percentage of an attorney's fee paid to a non-lawyer entity is fee-splitting (ABA MRPC 5.4) and payment for a referral (MRPC 7.2(b)). Every participating attorney is placed in violation. This is not a platform-side risk the platform can accept on their behalf.
- **HELOC / settlement services.** A HELOC secured by a 1-4 family residence is a federally related mortgage loan. A fee paid for the referral of settlement-service business is a RESPA §8(a) kickback; a fee split without services actually rendered is §8(b). The Group 9 draft makes this explicit — *"If a broker refers an `owner_single`… and that owner subsequently takes out a HELOC… the broker automatically receives a micro-percentage referral bounty via a smart contract sweep."* A referral bounty contingent on loan consummation is the textbook §8 fact pattern, here automated and immutably logged.
- **Contractors.** A percentage marketplace fee is ordinary and lawful.

**Aggravating detail:** *"splits the platform's affiliate fee prior to vendor disbursement"* means the fee is skimmed from escrowed consumer funds. On a distressed matter the platform is taking a cut of money a homeowner escrowed to save their house.

`FIX →` §II.8.3 Counterparty-Class Fee Matrix. Percentage transaction fees are permitted **only** for the contractor/supplier class. Legal and settlement-service professionals pay a flat, transaction-independent platform access subscription, disclosed, that does not vary with whether the consumer transacts. Mandatory RESPA-compliant Affiliated Business Arrangement disclosure rendered *before* routing. No platform fee is ever deducted from consumer-escrowed principal on an `owner_distressed` matter.

---

### G1-07 🔴 Advance-fee loss-mitigation escrow

**Finding.** "Loss Mitigation: emergency pipelines specifically designed to apply for loan modifications", funded by "$SHQL micro-escrows to retain legal counsel". Collecting fees in advance of performing loan-modification or foreclosure-relief services is prohibited for non-attorneys under the FTC MARS Rule / Reg. O (12 CFR 1015) and state foreclosure-consultant statutes (e.g. Cal. Civ. Code §2945 et seq.). Attorneys have a narrow carve-out **conditioned on** the funds being held in a client trust account until earned — and a $SHQL smart-contract escrow is not an IOLTA trust account.

`FIX →` §II.7.5 — Loss-mitigation engagements use a **funding-commitment** model: the owner's funds remain in the owner's own custody with a conditional authorization; the platform escrows nothing and earns nothing on the principal. Attorney fees route to the firm's IOLTA account through a licensed rail. Non-attorney loss-mitigation services collect **no** advance fee, full stop. `owner_distressed` is a $0 tier (§II.8.2).

---

### G1-20 🟡 USD obligations settled in a volatile token

**Finding.** A homeowner agrees to pay a contractor $48,000. The escrow holds $SHQL. Between funding and final draw, the token moves 30%. Either the contractor is underpaid or the homeowner overpays; either way the platform has converted a construction contract into an unhedged currency position taken by a consumer who did not choose it.

`FIX →` §II.7.6 — obligations are denominated and stored in `usd_amount_cents`. $SHQL is a settlement rail only. Settlement uses a TWAP oracle inside a ±2% band; a breach pauses the release and notifies both parties rather than settling. Fiat on-ramp at authorization time — the owner is never required to hold the token.

---

## 6. Monetization & Tiering

### G1-04 🔴 Privilege escalation by payment

**Finding.** "advanced portals (Investor, Loss Mitigation) are gated behind subscription add-ons", combined with a role-driven RLS model, means a Stripe webhook mutates `users.role`. Any billing-side defect — a test-mode webhook accepted in production, a replayed event, an unverified signature, a trial that provisions before payment settles, a chargeback that does not deprovision — becomes an authorization defect. Worse, the `owner_distressed` tier is *purchasable*, so an adversary buys the tier that unlocks the distressed-matter surfaces.

`FIX →` §II.8.1. `entitlements` (billing-derived, feature flags) and `property_role_bindings` (verification-derived, data scope) are separate tables with separate write paths. **No billing event may ever insert, update, or delete a binding.** A DB trigger enforces this; the Stripe webhook's DB role has no grant on the bindings table. Entitlements gate *features*; bindings gate *data*.

---

### G1-16 🟠 Monetizing the pre-foreclosure tier

**Finding.** Charging a subscription to a homeowner in pre-foreclosure to access foreclosure-avoidance tooling is (a) the advance-fee problem again (G1-07), (b) a regulatory magnet, and (c) commercially self-defeating — this user has no liquidity, which is why they are in the tier. The draft compounds it by specifying that locked tiers render with padlock icons in the Directory Pane: a homeowner 40 days from auction is shown upsell padlocks.

`FIX →` §II.8.2. **Shield (`owner_distressed`) is free, permanently, and is offered — never sold.** All upsell affordances are suppressed platform-wide when the active workspace capacity is `owner_distressed`. Revenue on distressed matters comes exclusively from the professional side (expediters, loss-mitigation counsel) paying flat access fees.

---

### G1-19 🟡 Lapsed subscription strips contractually-bound access

**Finding.** An `owner_investor` who signed a JV intent agreement and whose card then fails loses access to the committee they are a legal party to — the agreement, the escrow, and the deal-room record. The platform has made a contractual party's own records unavailable to them over a $29 dunning failure.

`FIX →` §II.8.5 Obligation Lock: any user who is a party to an active `agreement`, a non-terminal `financial_ledger`, or a live committee is pinned to a free `custodial` entitlement. Custodial grants full read + export of their own matters and all signature/consent actions; it withholds only net-new origination (new committees, new invitations, new analytics runs).

---

# PART II — HARDENED ARCHITECTURE

## II.1 The Capacity Binding Model *(resolves G1-02, G1-04, G1-17)*

**Principle:** In Group 1, a role is not a property of a person. It is a property of the **(person, parcel)** edge.

```
users.role          → coarse nav routing only. Never used for Group 1 row access.
property_role_bindings(user_id, property_id, capacity, verification_tier, status)
                    → the authorization primitive. One row per capacity a user holds on a parcel.
entitlements(user_id, key, source, expires_at)
                    → billing-derived feature flags. Never widens data scope.
```

Three capacities, matching the taxonomy keys exactly:

| Capacity | Meaning | Grantable by | Requires |
|---|---|---|---|
| `owner_single` | Recorded owner of an owner-occupied or single-hold parcel | Claim Ladder | V3 |
| `owner_investor` | Recorded owner electing assembly/FAR participation on this parcel | Owner self-election | V3 + `ent.assembly` |
| `owner_distressed` | Parcel under lien, pre-foreclosure, or active enforcement | System offer + owner acceptance | V3, no entitlement |

Capacities are **additive and parcel-scoped**. A user may hold `owner_single` on parcel A and `owner_distressed` on parcel B concurrently, with no scope interaction between them.

**`users.role` derivation** (trigger-maintained, nav-only):

```
owner_investor   if ∃ binding(capacity='owner_investor', status='active')
owner_distressed if ∃ binding(capacity='owner_distressed') and ∄ owner_single/owner_investor binding
owner_single     otherwise
```

This keeps `middleware.ts`, `ROLE_APP_MAP`, and the `(owner)` layout gate working unmodified, while removing them from the security boundary for Group 1 rows.

**Non-negotiable invariants:**

- **I-1** No Group 1 RLS policy may reference `current_user_role_group()` for row access on `properties`, `documents`, `agreements`, `financial_ledgers`, `violations`, `vision_inspections`, or `deal_room_events`. They must call `has_property_capacity()`.
- **I-2** No billing code path holds any grant on `property_role_bindings`. Enforced by `REVOKE` + a `BEFORE` trigger asserting `current_setting('app.actor_class') <> 'billing'`.
- **I-3** `verification_tier` is monotonic-by-evidence and may only be raised by the verification service role.
- **I-4** `owner_investor` never resolves to RLS group `investor` and never receives the `acquisition` app segment.

---

## II.2 Onboarding — The Progressive Claim Ladder *(resolves G1-01, G1-08, G1-09, G1-18, G1-21)*

Verification is a ladder, not a gate. Each rung unlocks a bounded capability set. The user receives value at rung 0.

### II.2.1 Tier definitions

| Tier | Name | Proves | Evidence | Time |
|---|---|---|---|---|
| **V0** | Prospect | Nothing | Self-asserted address | 0s |
| **V1** | Identified | This is a real, unique human | IAL2 IDV (Stripe Identity / Persona), liveness, device+phone binding | ~90s |
| **V2** | Record-Matched | A person of this name is grantee of record | Normalized grantee match, or Entity Linkage (§II.2.3) | ~30s |
| **V3** | Possession-Proven | This person controls this parcel | One of the §II.2.2 proofs | 1–7 days |
| **V3+** | Step-Up | This session is this person, right now | Passkey/WebAuthn re-auth, ≤5 min old | ~5s |

### II.2.2 V3 possession proofs (any one sufficient; all logged to `claim_evidence`)

1. **Address PIN.** Physical postcard with a 9-digit code to the parcel address. Free, slow (3–7 days), extremely strong. Default path.
2. **Tax-payer micro-deposit.** Two sub-dollar deposits to the bank account of record with the municipal tax collector, matched by amount. Instant-ish (1–2 days), very strong.
3. **Servicer linkage.** OAuth or verified statement OCR from the mortgage servicer, with a name + property-address match. Instant. Strong.
4. **Utility account match.** Verified utility account in the claimant's name at the parcel address. Instant. Moderate — accepted only in combination with V2.
5. **Notarized affidavit of ownership** + **10-day public contest window** with notice mailed to the address of record. Slow, used for edge cases (probate, recent transfer, entity chains).

**Rule:** Proof types 1, 2, 3, and 5 are individually sufficient at V2. Proof type 4 requires V2 plus one additional signal.

### II.2.3 Entity Linkage Path *(G1-09)*

When the grantee string does not resolve to a natural person:

```
grantee looks like an entity (LLC / TRUST / LP / INC / CORP suffix, or a normalization miss)
  → prompt: "This parcel is held by SUNNYSIDE HOLDINGS LLC. Are you an authorized signer?"
  → Secretary of State registered-agent / officer / manager lookup, name matched against V1 identity
     OR uploaded Certification of Trust (trustee name matched against V1 identity)
     OR uploaded Operating Agreement signature page + a §II.2.2 possession proof
  → grants V2. V3 still requires a §II.2.2 proof.
```

Entity claims additionally set `properties.title_holder_type = 'entity'`, which suppresses the owner-occupancy consumer-protection presumptions in §II.6 (an LLC is not a consumer homeowner) — while retaining them for `trust` where the trustee is also the occupant.

### II.2.4 Co-owner quorum *(G1-08)*

```
On V2, the system parses ALL grantees from the deed record → properties.recorded_grantees jsonb[]
recorded_grantee_count > 1  ⇒  the parcel enters `co_owned` mode:
  · The claimant receives a binding with claim_share = 'partial'
  · Solo capabilities: read Vitals, upload documents, request quotes, invite co-owners
  · BLOCKED until all recorded grantees hold active bindings, or a notarized
    consent/authority document is on file and the 10-day contest window has closed:
      – opening or authorizing any escrow
      – signing any agreement that encumbers the parcel
      – electing owner_investor capacity
      – toggling exposure_policy above 'private'
  · Co-owner invitations are mailed to the address of record, not merely emailed
```

### II.2.5 Recency, contest, and re-attestation *(G1-21)*

- **Recency guard.** If the deed record's `recorded_at` is within 90 days, V2 alone never suffices — a §II.2.2 proof is mandatory (this is already true; the guard additionally *notifies* the prior grantee of record).
- **Contest.** `claim_contests` — any V3 claimant on a parcel may contest another's claim. A contest immediately freezes all irreversible capabilities (escrow authorization, agreement signing, exposure changes) on that parcel for **both** parties pending manual `admin` adjudication. Freeze is the default; there is no auto-resolution.
- **Re-attestation.** Bindings carry `attested_at`. At +180 days the user is prompted for a lightweight re-attestation. At +270 days without it, the binding degrades to `dormant`: reads and exports persist, all writes and money movement stop.

### II.2.6 The V0 Prospect experience *(G1-18)*

V0 delivers the entire Vitals Dashboard read-only for a self-asserted address: AVM, comps, parcel boundary, zoning class, permit history, sanitation schedule, public violation record. It writes nothing, creates no map pin, appears to no other user, and is excluded from every feed and every count.

```
V0 → V1  prompted at: saving anything, or the 3rd session
V1 → V2  prompted at: same trigger, immediately after V1 (single continuous flow)
V2 → V3  prompted at: the first capability that needs it — never before
         Claim state persists 14 days; email + push resumption at 24h, 72h, 7d, 13d
```

### II.2.7 Capability gate matrix

| Capability | Min tier | Extra |
|---|---|---|
| Read Vitals (self-asserted address) | V0 | — |
| Save parcel / document vault | V1 | — |
| Maintenance ticketing (self-serve) | V2 | — |
| Appear as a pin to any other user | **V3** | `exposure_policy ≠ private` |
| Request contractor quotes | **V3** | — |
| Initiate HELOC application | **V3** | V3+ step-up |
| Open / fund / authorize any escrow | **V3** | V3+ step-up, quorum clear (§II.2.4) |
| Sign any agreement | **V3** | V3+ step-up, contest clear |
| Elect `owner_investor` capacity | **V3** | `ent.assembly`, quorum clear |
| Transmit a JV intent to a neighbor | **V3** | invitation quota (§II.6.2) |
| Accept `owner_distressed` capacity | **V3** | — (never gated on payment) |
| Toggle `exposure_policy` | **V3** | V3+ step-up, cooling-off (§II.5.2) |

---

## II.3 The Directory Pane — Workspace Contract *(resolves G1-15, and implements G1-02's UI half)*

### II.3.1 Definition

> A **Workspace** is the tuple `(user_id, property_id, capacity)`. It is the unit of navigation, the unit of map scope, the unit of Co-Pilot context, and the unit of authorization. These four are the same unit by construction — that is the entire point.

### II.3.2 Tree shape

```
DIRECTORY  (Left Pane · 250px · React Server Component · zero client hooks)
│
├─ ◈ Portfolio                              ← aggregate; no parcel context
│    └─ All Properties · Documents · Billing
│
├─ 🏠 128 Maple St                          ← WORKSPACE  capacity=owner_single  V3
│    ├─ Vitals
│    ├─ Maintenance & Upkeep
│    ├─ Renovation & Financing
│    ├─ Insurance Vault
│    └─ Local Network
│
├─ 📈 4412 Sunnyside Ave                    ← WORKSPACE  capacity=owner_investor  V3
│    ├─ Vitals
│    ├─ Assembly Map
│    ├─ JV & Syndication
│    ├─ Enterprise Desk
│    └─ Insurance Vault
│
├─ 🛡 77 Bergen Pl                           ← WORKSPACE  capacity=owner_distressed  V3
│    ├─ Defensive Map          ← NO upsell affordances render anywhere in this subtree
│    ├─ Loss Mitigation
│    ├─ Legal Shield
│    └─ Exposure & Privacy
│
└─ ⊕ Claim a property                       ← the ONLY growth affordance shown to a
                                              user whose active workspace is distressed
```

### II.3.3 Server-side derivation

The tree is produced by a single SQL function, `workspace_manifest()`, executed under the caller's RLS-scoped session in the RSC. The client never computes, filters, or reorders it.

- A subtab absent from the manifest is not rendered — and the corresponding route independently rejects direct navigation. Hiding is never the control.
- Padlocked upsell rows are emitted **only** when the manifest returns `upsell_allowed = true`, which is `false` whenever any active workspace has capacity `owner_distressed` *(G1-16)*.
- Active-link styling continues to derive from the `x-next-pathname` header per `terminal-layout-plan.md` T7.2 — no `usePathname`, no client boundary except `SignOutButton`.

### II.3.4 Context isolation protocol *(G1-15)*

```
Zustand store shape (hardened):
  {
    workspaceId: string | null,     // opaque uuid
    propertyId:  string | null,
    capacity:    'owner_single' | 'owner_investor' | 'owner_distressed' | null,
    epoch:       number             // monotonic; incremented by the workspace switch action
  }
```

1. **Switch clears first.** The workspace-switch action sets the store to `null`-state and increments `epoch` **before** the new route mounts. A dispatch against a null-state store is refused client-side.
2. **Identifiers only.** `prepareSendMessagesRequest` injects `{ workspaceId, propertyId, capacity, epoch }`. Prose context is never transmitted.
3. **Server re-derivation.** `/api/copilot` asserts `has_property_capacity(propertyId, capacity)` under the caller's session and, on failure, returns `403` without invoking the model. All grounding facts are re-fetched server-side through the RLS-scoped client.
4. **Epoch fencing.** The response carries the request's `epoch`; the client discards any stream whose epoch ≠ current. Cross-workspace answers cannot render even if one is somehow produced.
5. **Capacity-scoped system prompt.** The Shield workspace's system prompt forbids valuation, assembly, and disposition advice, and prepends a not-legal-advice preamble. The Home workspace's forbids lien-stack and arrears reasoning. Prompts are selected server-side from `capacity`, never from client input.
6. **Transcript partitioning.** Co-Pilot history is stored per `workspaceId`. There is no cross-workspace retrieval — a Shield conversation is never a retrieval candidate in an Assembly conversation.

---

## II.4 Sub-Role Portals — Hardened Feature Matrices

### II.4.1 A · Shtiya Home — `owner_single`

*Asset modernization and equity extraction for the recorded owner of a residence.*

| Subtab | Capabilities | Gates |
|---|---|---|
| **Vitals** | AVM + confidence interval, comps, parcel boundary, zoning class, permit history, public violation record, sanitation schedule, emergency contacts | V0 read / V2 save |
| **Maintenance & Upkeep** | Ticketing, vendor dispatch, warranty tracking, service history | V2 |
| **Renovation & Financing** | Scope builder, vetted-contractor quote requests, BoQ intake from Group 6, HELOC application to `lender_heloc`, escrow funding | V3; V3+ for money; ABA disclosure pre-routing |
| **Insurance Vault** | Policy storage, renewal alerts, premium-shopping API | V2 |
| **Local Network** | Own parcel isolated; verified professional pins by category and radius | V3; own parcel is the **only** parcel rendered |

**Hardening deltas from draft**
- AVM ships with a confidence interval and a "not an appraisal" disclosure. A point estimate on a consumer's largest asset is a reliance risk.
- Contractor pins carry live `compliance_checks` state from Group 8 — a lapsed license renders as unavailable, not merely flagged.
- HELOC routing renders the RESPA-compliant Affiliated Business Arrangement disclosure *before* the handoff, with an explicit acknowledgement event written to `disclosures`.
- The map isolates the user's own parcel. Neighbor parcels are basemap geometry only — no ownership, no status, no interaction.

### II.4.2 B · Shtiya Assembly — `owner_investor` *(G1-17)*

*Parcel-scoped FAR and assembly tooling. **Not** an acquisition surface.*

| Subtab | Capabilities | Gates |
|---|---|---|
| **Assembly Map** | Zoning overlays, FAR utilization, SB-9 eligibility (≥1,200 sf split test), massing models, **aggregate** neighbor response state | V3 + `ent.assembly`; k≥5 cohort (§II.5.3) |
| **JV & Syndication** | Committee creation, quota-limited JV intent transmission, aggregated valuation, independent-appraisal ordering | V3 + quorum clear + §II.6 protocol |
| **Enterprise Desk** | Connection requests *outbound only* to `investor_assembler`, `arch_zoning`, `lender_jv` | V3; consent-first, §II.5.4 |
| **Vitals / Insurance Vault** | Inherited from `owner_single` | as above |

**Hardening deltas from draft**
- **`acquisition` is removed from this role's `ROLE_APP_MAP`.** Assembly is a parcel-scoped surface inside `owner`, not a market-wide discovery surface. `owner_investor` never joins RLS group `investor`, and therefore never touches `properties_investor_discovery` or the `violations` bulk read.
- Neighbor parcels are visible **only** as aggregate counts until mutual opt-in *(G1-12)*.
- Massing models and aggregated valuations are labelled "indicative, not an appraisal" and cannot be exported as a client-facing document without an independent appraisal on file.
- A neighbor parcel bearing an `owner_distressed` binding is **excluded from JV solicitation** exactly as it is from wholesaler solicitation, unless `exposure_policy = 'seeking_exit'`. Intra-group predation is predation *(§II.5.1)*.

### II.4.3 C · Shtiya Shield — `owner_distressed`

*Defensive tier. Free, permanently. Offered by the system; never sold.*

| Subtab | Capabilities | Gates |
|---|---|---|
| **Defensive Map** | Active SWOs, code enforcement actions, lien priority stack, auction-date countdown — **own parcel only** | V3 |
| **Loss Mitigation** | Loan-mod document assembly, servicer communication log, short-sale coordination, hardship-package builder | V3; **no advance fee, ever** (§II.7.5) |
| **Legal Shield** | Routing to `legal_expediter` / `legal_loss_mitigation`; funding-commitment authorization (not escrow); IOLTA rail for attorney fees | V3 + V3+; MARS/Reg-O compliant flow |
| **Exposure & Privacy** | Read the full disclosure ledger: who can see this parcel, what they see, when it changed; the `no_contact` switch; the `seeking_exit` toggle behind cooling-off | V3 + V3+ |

**Hardening deltas from draft**
- **$0, permanently.** Entering the tier requires no payment and no entitlement. Revenue on distressed matters comes from professional-side flat access fees only *(G1-16, G1-07)*.
- **Zero upsell surface.** When any active workspace carries this capacity, `upsell_allowed = false` globally in `workspace_manifest()`. No padlock, no banner, no interstitial, no email campaign.
- **Entry is offered, not sold.** The system detects distress signals (public lien filing, SWO, arrears) on an existing V3 binding and *offers* the capacity. Acceptance is explicit and revocable; declining suppresses re-offers for 90 days and is not recorded in any exportable field.
- **Exposure & Privacy is a first-class subtab**, not a buried setting. The user can see and revoke every grant.
- **Suppression is symmetric.** Solicitation blocks apply to `investor_wholesaler`, `broker_residential`, *and* `owner_investor` neighbors alike.

---

## II.5 Exposure Control Plane *(resolves G1-03, G1-12)*

### II.5.1 Default-deny exposure policy

```sql
properties.exposure_policy  enum('private','network','seeking_exit')  NOT NULL DEFAULT 'private'
```

- `private` — invisible to every user outside an active binding or an `accepted` connection. **Default for every parcel at creation, regardless of capacity.** The Privacy Lock is not a distressed feature; it is the platform default that the distressed tier merely cannot be talked out of.
- `network` — discoverable by verified professionals, without financial detail.
- `seeking_exit` — discoverable by acquisition-side roles; the owner has affirmatively invited offers.

Enforced in RLS on `properties`, `violations`, `documents`, and `deal_room_events`. Not a map filter.

### II.5.2 Cooling-off on exposure widening

Widening (`private → network → seeking_exit`) requires V3+ step-up, renders a plain-language consequence disclosure, and takes effect after a **24-hour cooling-off** during which it is one-click cancellable. **Narrowing is instant and unconditional.** This is asymmetric by design: pressure produces widening, and a distressed owner under a deadline must never be able to be walked through an irreversible exposure change in a single phone call.

### II.5.3 Anti-inference measures *(G1-03 leaks 3 and 4)*

1. **Hysteresis.** A parcel becomes discoverable only after `exposure_policy ≠ 'private'` has held for ≥24h.
2. **Tombstoning.** When a parcel narrows its exposure, it does **not** vanish from the discovery feed. It is replaced by a frozen tombstone carrying its last-published values and a `stale_since` date, retained 30 days, then aged out on a schedule uncorrelated with the change. Feed diffing therefore yields no event.
3. **k-anonymity floor.** Any geographically bounded discovery query that would return fewer than **5** parcels returns zero and a `region_too_sparse` code. No exceptions for admin-adjacent roles; `admin` uses the audited break-glass path instead.
4. **Cadence quantization.** The discovery materialized view refreshes on a fixed hourly boundary. Individual state changes are never observable in real time.
5. **No derived distress scores.** The platform computes distress internally to *offer the Shield tier*. That computation is never exposed, exported, sorted on, or sold to any role outside Group 1 + `admin`. Public violation records remain visible where law makes them public — but the platform must not rank, alert, or recommend on them.
6. **No removal signal on Shield entry.** Accepting `owner_distressed` does not itself change `exposure_policy` and produces no observable state change anywhere outside the owner's own workspace.

### II.5.4 Solicitation control

```sql
solicitation_suppressions(property_id, suppressed_role_group, suppressed_user_id, reason, created_at, permanent bool)
```

- **Consent-first contact.** No user may message an owner about a parcel absent an `accepted` connection. Connection requests are quota-limited: 3 per parcel lifetime per requester, 1 per 30 days.
- **A decline is permanent.** Declining sets `permanent = true` for that requester. No new subscription, no new account under the same verified identity, and no role change clears it.
- **`no_contact` is absolute.** The owner-level switch blocks all inbound connection requests platform-wide and is not overridable by any role except a `legal_*` counterparty already party to an active matter.
- **Symmetry.** Suppression is evaluated on the *target parcel*, never on the *requester's role*. A neighboring `owner_investor` is suppressed identically to an `investor_wholesaler`.
- **Off-platform leakage is a product decision.** Any data export that includes parcel identifiers plus owner-adjacent state is watermarked per-seat, quota-limited, and logged. Export quota exhaustion is a security event, not a billing event.

---

## II.6 Assembly & JV Protocol *(resolves G1-10, G1-11, G1-12)*

### II.6.1 Holdout-Priced Assembly — replacing "no holdout risk"

**The drag-along is deleted.** A homeowner's right to decline is not a defect to be engineered away.

```
Committee proposes footprint F = {p1…pn}
Each owner independently signs or declines a NON-BINDING JV Intent (LOI)
At the feasibility deadline:
  participants P = { p ∈ F : signed and rescission window expired }
  → recompute feasibility over P alone (FAR, SB-9 split test, minimum acreage, massing)
  → if P is feasible: proceed with P. Non-participants are simply outside the footprint.
  → if P is infeasible: the committee dissolves. Earnest money returns 100% to source.
NO mechanism binds a non-signer. NO mechanism prices a non-signer's parcel without consent.
NO mechanism transfers title. Escrow holds option consideration only.
```

Dissenter's buyout is **optional and owner-initiated**: a non-participant may *elect* to be bought out at independent appraised value. The committee may not initiate it.

### II.6.2 Consent-gated neighbor visibility *(G1-12)*

| Stage | What the initiator sees | What the neighbor sees |
|---|---|---|
| Pre-invitation | Aggregate only: "12 parcels in footprint · 4 responded" (min cohort 5) | Nothing |
| Invitation sent | Delivery status only — no read receipt, no identity | The invitation, the footprint, the indicative math, and a decline button |
| Neighbor accepts | Full per-parcel identity, both directions | Full per-parcel identity, both directions |
| Neighbor declines | Aggregate count decrements. **No identity. No retry.** | Permanent suppression set |

Invitation quota: 3 per parcel lifetime, 1 per 30 days, hard-capped at the committee level to prevent round-robin harassment through multiple initiators.

### II.6.3 Consumer protections (owner-occupied / `title_holder_type ∈ {natural, trust}`)

1. **Independent appraisal floor.** No JV intent may be presented with an indicative per-parcel value unless a licensed independent appraisal is on file. The committee pays; the appraiser is selected from a rotation the committee does not control.
2. **Rescission.** 7 calendar days on the JV Intent (LOI), 3 business days on the definitive agreement. Rescission is one click, requires no reason, and reverses all escrow effects.
3. **Plain-language summary.** A one-page, reading-level-tested summary of economic effect must be acknowledged before signature; the acknowledgement is written to `disclosures` with the rendered document hash.
4. **Independent counsel offer.** Every consumer signer is offered platform-funded consultation with a `legal_transactional` attorney **who has no economic relationship to the committee**. Declining is logged.
5. **No parcel encumbrance by a single signer.** Where `co_owned`, every recorded grantee must independently sign (§II.2.4).
6. **Escrow never holds title.** The $SHQL instrument holds option consideration. Title transfer occurs only at a recorded closing through licensed settlement.

### II.6.4 Sybil resistance *(G1-11)*

- Only bindings with `verification_tier = 'V3'`, `status = 'active'`, and no open contest count toward any numerator or denominator.
- Invited-but-unverified parcels render in a distinct "invited" state and are excluded from every percentage and every valuation.
- One natural identity (V1 IDV hash) may hold at most **4** V3 bindings inside any single committee footprint; beyond that, all of that identity's parcels in the footprint are collapsed to a single vote and flagged for review.
- Committee progress renders as an explicit fraction with a verified-parcel denominator — never a bare percentage, never a progress bar.

### II.6.5 Arbitration clause limits *(G1-10)*

For any agreement with a consumer signer (`title_holder_type ∈ {natural, trust}` and owner-occupied):

- 30-day post-execution arbitration **opt-out**, exercisable in-product in one click.
- Carve-outs preserved: small-claims, statutory foreclosure and consumer-protection claims, and injunctive relief.
- **No class-action waiver** in the consumer tier.
- Arbitration costs above the small-claims threshold are borne by the commercial party.

---

## II.7 $SHQL Financial Mechanics *(resolves G1-05, G1-06, G1-07, G1-13, G1-14, G1-20)*

### II.7.1 Governing principles

1. **The database is the ledger of record. The chain is the settlement rail.** Never the inverse.
2. **Nothing irreversible happens before a durable, committed intent row exists.**
3. **The HTTP response is never authoritative.** Confirmation arrives only from a chain indexer.
4. **Obligations are denominated in USD.** The token is a transport.
5. **A consumer is never required to hold the token, take token price risk, or hold a key whose loss destroys their funds.**
6. **The platform key can only ever return funds to their source.** It can never forward value to a third party.

### II.7.2 Two-Phase Intent Protocol *(G1-05)*

```
PHASE 0 — AUTHORIZE (synchronous, DB only)
  · assert has_property_capacity(property_id, capacity)          ← app layer
  · assert V3 binding, contest-clear, quorum-clear
  · assert V3+ step-up ≤ 5 minutes old
  · INSERT escrow_intents (id, idempotency_key UNIQUE, ledger_id, usd_amount_cents,
      payee, gates_snapshot jsonb, state='authorized', authorized_by, authorized_at)
  · COMMIT  ← the transaction boundary. Nothing on-chain has happened.
  · a duplicate idempotency_key returns the EXISTING intent, 200. Never a second transfer.

PHASE 1 — BROADCAST (async worker, never in the request path)
  · re-read the intent FOR UPDATE; state must be 'authorized'
  · re-evaluate every gate against LIVE data; any drift → state='blocked', notify, stop
  · state='broadcasting', persist tx_hash on submission
  · the request path returns 202 Accepted + intent id. The UI polls or subscribes.

PHASE 2 — CONFIRM (chain indexer webhook, signature-verified)
  · match the on-chain event by intent id (embedded in calldata)
  · state='confirmed', write financial_ledgers.status, emit deal_room_event
  · this is the ONLY path that marks a ledger released

PHASE 3 — RECONCILE (cron, every 5 minutes)
  · any intent in 'broadcasting' beyond N confirmations of wall-clock → query chain by intent id
  · found  → drive to 'confirmed'
  · absent → state='failed', funds provably unmoved, surface a retry
  · ambiguous → state='needs_review', page an operator. Never auto-resolve an ambiguous
    financial state.
```

Chain-reorg handling: confirmation requires N-block finality before `confirmed`; a reorg past that depth transitions to `needs_review`, never to a silent re-broadcast.

### II.7.3 Milestone draw release — `owner_single` *(G1-13)*

**Signature scheme: 2-of-3.** Keys: **Owner** (passkey-derived, device-bound, with a social/institutional recovery path), **Oracle** (Vision inspection + Group 8 compliance attestation), **Platform Recovery** (timelocked).

```
Owner + Oracle       → releases to the contractor. The normal path.
Owner + Platform     → 72h timelock, refunds to SOURCE only. Owner's escape hatch.
Oracle + Platform    → 72h timelock, refunds to SOURCE only. Never forwards to a vendor.
```

The platform can never, under any key combination, cause funds to reach a vendor without the owner. This keeps the platform out of the position of directing consumer funds to a third party.

**Release gates — ALL must hold, snapshotted into `gates_snapshot` at authorize and re-evaluated at broadcast:**

| # | Gate | Source |
|---|---|---|
| 1 | `vision_inspections.blocks_draw = false` for this milestone | Group 6 Vision |
| 2 | Inspection authored by a user holding a **contractor capacity on this property** | fixes VULN-09 at the Group 1 boundary |
| 3 | Contractor `compliance_checks` current and non-lapsed, **row must exist** — absence is a BLOCK, never a pass | fixes VULN-04 |
| 4 | Unconditional lien waiver on file for the **prior** draw | new |
| 5 | Conditional lien waiver on file for **this** draw, executed by GC and every sub on the milestone | new |
| 6 | Retainage: cumulative release ≤ 90% until final acceptance | new |
| 7 | No open `claim_contests` on the parcel | §II.2.5 |
| 8 | Settlement rate inside the ±2% band | §II.7.6 |

Final 10% releases on: owner acceptance **and** expiry of the statutory mechanic's-lien period **and** unconditional waivers from all parties. Owner non-response for 30 days after substantial completion escalates to the dispute path (Group 4 `legal_arbitrator`), never to auto-release.

### II.7.4 Cure escrow — `owner_distressed` *(G1-14)*

Applies to **non-legal** cure work only (expediter filings, physical remediation). Legal fees follow §II.7.5.

```
· Trigger is an OBJECTIVE MUNICIPAL ORACLE ONLY. Never a counterparty attestation.
    – DOB/ECB/HPD violation status → 'closed' / 'resolved'
    – Stop Work Order status → 'lifted'
  Confirmed by two independent reads ≥ 24h apart from independently-configured fetchers.
  A single read never releases.
· HARD DEADLINE. Every cure escrow carries deadline_at, defaulting to
  min(auction_date - 14 days, funding_date + 60 days). At deadline_at with no oracle
  confirmation, funds revert to the owner AUTOMATICALLY and IN FULL. No fee. No discretion.
· SUBSTITUTION RIGHT. The owner may unilaterally revoke and re-assign the engagement to a
  different professional at any moment before oracle confirmation, with zero penalty and
  zero notice period. The professional cannot block, delay, or condition the substitution.
· NO ESCALATION. The fee is fixed at engagement and immutable in the contract. Any
  renegotiation requires a NEW engagement the owner affirmatively initiates from a
  cooled-off state — a scope-change request cannot be raised inside an active escrow
  within 14 days of deadline_at.
· NO PLATFORM FEE on the escrowed principal. Zero. (§II.8.3)
```

The stalling strategy is removed at its root: stalling forfeits the entire fee at `deadline_at`, and the owner can substitute at any time. Time pressure now works against the professional, which is the correct direction.

### II.7.5 Loss-mitigation funding commitments *(G1-07)*

**No advance fee is collected for loss-mitigation or foreclosure-relief services. The platform escrows nothing and earns nothing on the principal.**

| Service class | Mechanism |
|---|---|
| Attorney (`legal_loss_mitigation`, `legal_expediter`) | Owner executes a **funding commitment** — a conditional payment authorization. Funds remain in the owner's own account. On completion of a defined, verifiable service step, the owner releases through a licensed rail into the firm's **IOLTA trust account**. A smart contract is not and cannot be a client trust account. |
| Non-attorney loss-mitigation services | **No advance fee under any structure.** Payment on completion only, verified by servicer or municipal oracle. |
| Platform | Fee is **$0** on this class. Revenue derives from the professional's flat access subscription (§II.8.3). |

Every loss-mitigation engagement renders the MARS/Reg-O-mandated disclosures with acknowledgement written to `disclosures`, including the statement that the owner may reject any offer obtained and owes nothing for a rejected offer.

### II.7.6 Denomination and volatility *(G1-20)*

- `financial_ledgers.usd_amount_cents` is the obligation. `shql_amount` is a derived settlement quantity, computed at broadcast.
- Rate source is a 30-minute TWAP from ≥3 independent venues; median taken; single-venue outliers discarded.
- **Band:** if the settlement rate has moved >2% against the authorize-time rate, the intent transitions to `blocked` and notifies both parties. It does not settle and it does not silently re-price.
- Fiat on-ramp executes at authorization. The owner funds in USD, holds no token, and takes no price risk between authorize and settle.
- Gas is paid by the platform via a relayer/paymaster. A consumer is never asked to hold a gas asset, and gas-price spikes never block a homeowner's draw.

---

## II.8 Monetization & Entitlements *(resolves G1-04, G1-06, G1-16, G1-19)*

### II.8.1 Hard separation of billing and authorization *(G1-04)*

```
Stripe webhook  →  entitlements(user_id, key, source='stripe', expires_at)     [feature flags]
Verification svc →  property_role_bindings(...)                                [data scope]

The billing DB role has NO grant on property_role_bindings, properties,
agreements, financial_ledgers, or violations. Enforced by REVOKE plus a BEFORE
trigger asserting current_setting('app.actor_class', true) IS DISTINCT FROM 'billing'.
```

An entitlement can gate whether the **Assembly Map subtab renders and its analytics run**. It can never gate whether a row is readable. Every entitlement check is a *feature* check evaluated *after* an independent RLS capacity check has already passed.

Webhook hardening: signature verification, event-id replay table, live/test mode assertion, and provisioning only on `invoice.paid` — never on `checkout.session.completed`. Chargeback and dispute events deprovision entitlements; they never touch bindings.

### II.8.2 Tier structure

| Tier | Price | Entitlement key | Unlocks (features only) |
|---|---|---|---|
| **Prospect** | $0 | — | V0 Vitals read-only, 1 saved address |
| **Home** | $0 | `ent.home` | Full `owner_single` workspace, 1 property, ticketing, vault |
| **Home+** | $/mo | `ent.home_plus` | Unlimited properties, insurance shopping automation, document AI, quote concierge, priority dispatch |
| **Assembly** | $$/mo | `ent.assembly` | Zoning overlays, massing, committee tooling, aggregated valuation, enterprise desk |
| **Shield** | **$0 forever** | *(none — capacity only)* | Full `owner_distressed` workspace, in perpetuity |
| **Custodial** | $0 | `ent.custodial` | Auto-granted obligation lock (§II.8.5) |

**Shield carries no entitlement key by design.** There is no product surface through which it could be sold, mis-provisioned, or lost to a failed payment *(G1-16, G1-07)*.

### II.8.3 Counterparty-class fee matrix *(G1-06)*

| Counterparty class | Permitted platform fee | Forbidden | Rationale |
|---|---|---|---|
| Contractor / sub / supplier (Group 5) | % marketplace fee on contract value, paid **by the contractor**, disclosed pre-engagement | Deduction from consumer-escrowed principal without itemized pre-disclosure | Ordinary marketplace economics |
| Architect / engineer (Group 6) | % marketplace fee, paid by the professional | — | Ordinary |
| **Attorney (Group 4)** | **Flat, transaction-independent platform access subscription paid by the firm** | Any % of fee; any per-referral payment; any fee contingent on the consumer engaging | MRPC 5.4 fee-splitting; MRPC 7.2(b) referral payments |
| **Lender — HELOC / mortgage (Group 3)** | **Flat, transaction-independent access subscription paid by the lender** | Any fee contingent on loan consummation; any per-referral bounty; any % of loan amount | RESPA §8(a)/(b); the Group 9 "HELOC referral bounty" is deleted |
| **Broker (Group 9)** | Flat access subscription | Fee contingent on a referred consumer transacting; premium tiers that expose distress state | RESPA §8 where a settlement service is implicated; §II.5 where distress is |
| **Loss mitigation (distressed matters)** | **$0** | Any fee of any structure on the escrowed principal | MARS / Reg. O; state foreclosure-consultant statutes |

**Disclosure requirement.** Every routing event that carries platform compensation renders an Affiliated Business Arrangement disclosure identifying the relationship, the fee, and the payer, with an explicit statement that the consumer is free to shop elsewhere. Acknowledgement is written to `disclosures` with the rendered document hash. **Routing without a recorded acknowledgement is blocked at the API layer, not merely discouraged in the UI.**

### II.8.4 Distress data is not a product *(G1-03)*

No paid tier, in any group, exposes: the existence of an `owner_distressed` binding, a Shield-tier offer or acceptance, an internally-computed distress score, or an inference derived from any of them. The Group 9 draft's "Distress Interception" premium tier is **withdrawn** and replaced with the consented `seeking_exit` feed — which the owner turns on, from a cooled-off state, having read what it means.

### II.8.5 Obligation Lock *(G1-19)*

```sql
-- Auto-granted, non-purchasable, non-expiring while any obligation is live.
grant ent.custodial WHERE the user is:
    a party on an agreement with status != 'terminated'
  OR a party on a financial_ledger in a non-terminal state
  OR an active member of a block_committee
```

Custodial grants: full read and export of the user's own matters, all signature and consent actions, all dispute actions, all escrow *reversion* actions. It withholds only net-new origination — new committees, new invitations, new analytics runs. **A payment failure can never separate a user from a contract they are bound by, or from funds they have escrowed.**

Deletion and downgrade: account deletion is honored except where a live obligation or a records-retention duty exists, in which case the account is restricted to custodial and the user is told precisely which obligation blocks deletion and when it clears.


---

# PART III — IMPLEMENTATION SPECIFICATION

## III.1 Schema Additions

Target migration files (sequenced **after** the security-hardening migration and **before** the sub-role enum migration where noted in Appendix B):

- `0013_group1_capacity_bindings.sql`
- `0014_group1_exposure_control.sql`
- `0015_group1_escrow_intents.sql`
- `0016_group1_rls.sql`

### III.1.1 `0013_group1_capacity_bindings.sql`

```sql
-- ── Enums ──────────────────────────────────────────────────────────────────
create type owner_capacity      as enum ('owner_single','owner_investor','owner_distressed');
create type verification_tier   as enum ('V0','V1','V2','V3');
create type binding_status      as enum ('pending','active','dormant','frozen','revoked');
create type title_holder_type   as enum ('natural','trust','entity','unknown');
create type claim_share         as enum ('sole','partial');

-- ── Property title metadata ────────────────────────────────────────────────
alter table properties
  add column title_holder_type       title_holder_type not null default 'unknown',
  add column recorded_grantees       jsonb not null default '[]'::jsonb,
  add column recorded_grantee_count  int  not null default 0,
  add column deed_recorded_at        date,
  add column owner_occupied          boolean not null default false;

-- ── The Group 1 authorization primitive ────────────────────────────────────
create table property_role_bindings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  property_id        uuid not null references properties(id) on delete cascade,
  capacity           owner_capacity     not null,
  verification_tier  verification_tier  not null default 'V0',
  status             binding_status     not null default 'pending',
  claim_share        claim_share        not null default 'sole',
  identity_hash      text,                       -- V1 IDV hash; Sybil ceiling (§II.6.4)
  attested_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, property_id, capacity)
);
create index prb_lookup on property_role_bindings (user_id, property_id, status);
create index prb_property on property_role_bindings (property_id, capacity, verification_tier);
create index prb_identity on property_role_bindings (identity_hash) where identity_hash is not null;

-- ── Evidence ledger (append-only, audit-grade) ─────────────────────────────
create type evidence_kind as enum (
  'idv','grantee_match','entity_linkage','address_pin','tax_micro_deposit',
  'servicer_link','utility_match','notarized_affidavit'
);
create table claim_evidence (
  id           uuid primary key default gen_random_uuid(),
  binding_id   uuid not null references property_role_bindings(id) on delete cascade,
  kind         evidence_kind not null,
  provider     text not null,
  result       jsonb not null,
  tier_granted verification_tier not null,
  created_at   timestamptz not null default now()
);
-- append-only
create rule claim_evidence_no_update as on update to claim_evidence do instead nothing;
create rule claim_evidence_no_delete as on delete to claim_evidence do instead nothing;

-- ── Contests (§II.2.5) ─────────────────────────────────────────────────────
create type contest_status as enum ('open','upheld','rejected','withdrawn');
create table claim_contests (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references properties(id) on delete cascade,
  contested_binding_id uuid not null references property_role_bindings(id) on delete cascade,
  contestant_id  uuid not null references users(id),
  status         contest_status not null default 'open',
  opened_at      timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references users(id),
  rationale      text
);
create index contests_open on claim_contests (property_id) where status = 'open';

-- ── Entitlements: billing-derived, feature-only (§II.8.1) ──────────────────
create table entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  key         text not null,          -- 'ent.home' | 'ent.home_plus' | 'ent.assembly' | 'ent.custodial'
  source      text not null,          -- 'stripe' | 'system' | 'obligation_lock'
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);

-- ── I-2: billing may never touch bindings ──────────────────────────────────
create or replace function assert_not_billing_actor() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.actor_class', true), '') = 'billing' then
    raise exception 'I-2 violation: billing actor may not mutate %', tg_table_name
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger prb_no_billing before insert or update or delete
  on property_role_bindings for each row execute function assert_not_billing_actor();

revoke all on property_role_bindings, claim_evidence, claim_contests from billing_writer;

-- ── users.role derivation: nav routing only (§II.1) ────────────────────────
create or replace function sync_nav_role(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select case
    when exists (select 1 from property_role_bindings
                 where user_id = p_user and capacity = 'owner_investor' and status = 'active')
      then 'owner_investor'
    when exists (select 1 from property_role_bindings
                 where user_id = p_user and capacity = 'owner_distressed' and status = 'active')
     and not exists (select 1 from property_role_bindings
                 where user_id = p_user and capacity = 'owner_single' and status = 'active')
      then 'owner_distressed'
    else 'owner_single'
  end into v;
  update users set role = v::user_role
   where id = p_user and role::text like 'owner_%';   -- never re-roles a non-owner account
end $$;
```

### III.1.2 `0014_group1_exposure_control.sql`

```sql
create type exposure_policy as enum ('private','network','seeking_exit');

alter table properties
  add column exposure_policy       exposure_policy not null default 'private',
  add column exposure_effective_at timestamptz,             -- hysteresis (§II.5.3)
  add column no_contact            boolean not null default false;

create table exposure_change_requests (       -- 24h cooling-off (§II.5.2)
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete cascade,
  requested_by  uuid not null references users(id),
  from_policy   exposure_policy not null,
  to_policy     exposure_policy not null,
  effective_at  timestamptz not null,
  cancelled_at  timestamptz,
  applied_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (to_policy > from_policy)             -- narrowing bypasses this table entirely
);

create table solicitation_suppressions (      -- §II.5.4
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references properties(id) on delete cascade,
  suppressed_user_id    uuid references users(id) on delete cascade,
  suppressed_role_group text,
  reason                text not null,
  permanent             boolean not null default false,
  created_at            timestamptz not null default now()
);
create index supp_lookup on solicitation_suppressions (property_id, suppressed_user_id);

create table disclosures (                    -- §II.8.3 / §II.6.3 / §II.7.5
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id),
  property_id     uuid references properties(id),
  disclosure_kind text not null,   -- 'aba_respa' | 'mars_reg_o' | 'jv_plain_language'
                                   -- | 'not_an_appraisal' | 'arbitration_optout'
  document_hash   text not null,
  acknowledged_at timestamptz not null default now(),
  unique (user_id, property_id, disclosure_kind, document_hash)
);

-- Discovery surface: a VIEW, never the base table (closes VULN-03 for Group 1)
create materialized view properties_discoverable as
  select p.id, p.address, p.bbl, p.owner_id, p.exposure_policy,
         null::numeric as lat, null::numeric as lng,   -- coordinates never published
         p.exposure_effective_at,
         false as is_tombstone, null::timestamptz as stale_since
    from properties p
   where p.exposure_policy <> 'private'
     and p.exposure_effective_at <= now() - interval '24 hours';
create unique index on properties_discoverable (id);
-- Tombstone rows (§II.5.3 #2) are merged in by the hourly refresh job, which unions
-- the live set with tombstones retained 30 days. Refresh fires on a fixed hourly
-- boundary only — never on write.
```

### III.1.3 `0015_group1_escrow_intents.sql`

```sql
create type intent_state as enum
  ('authorized','broadcasting','confirmed','failed','blocked','reverted','needs_review');

create table escrow_intents (
  id                uuid primary key default gen_random_uuid(),
  idempotency_key   text not null unique,               -- §II.7.2, client-supplied
  ledger_id         uuid not null references financial_ledgers(id),
  property_id       uuid not null references properties(id),
  intent_kind       text not null,   -- 'milestone_draw' | 'cure_escrow' | 'jv_option' | 'revert'
  usd_amount_cents  bigint not null check (usd_amount_cents > 0),
  shql_amount       numeric,                            -- derived at broadcast
  rate_at_authorize numeric,
  payee             text not null,
  gates_snapshot    jsonb not null,                     -- §II.7.3
  state             intent_state not null default 'authorized',
  tx_hash           text,
  deadline_at       timestamptz,                        -- §II.7.4 cure escrow
  authorized_by     uuid not null references users(id),
  authorized_at     timestamptz not null default now(),
  confirmed_at      timestamptz,
  last_error        text
);
create index intents_pending on escrow_intents (state)
  where state in ('authorized','broadcasting','needs_review');
create index intents_deadline on escrow_intents (deadline_at)
  where deadline_at is not null and state not in ('confirmed','reverted','failed');

create table lien_waivers (                               -- §II.7.3 gates 4 & 5
  id           uuid primary key default gen_random_uuid(),
  ledger_id    uuid not null references financial_ledgers(id),
  draw_index   int  not null,
  waiver_type  text not null check (waiver_type in ('conditional','unconditional')),
  party_id     uuid not null references users(id),
  document_id  uuid references documents(id),
  executed_at  timestamptz not null default now(),
  unique (ledger_id, draw_index, waiver_type, party_id)
);

alter table financial_ledgers
  add column usd_amount_cents  bigint,                    -- §II.7.6 denomination
  add column retainage_bps     int not null default 1000, -- 10%
  add column released_bps      int not null default 0;
```

## III.2 RLS Helper Functions

```sql
-- ── The Group 1 authorization predicate (invariant I-1) ────────────────────
create or replace function public.has_property_capacity(
  p_property uuid,
  p_capacity owner_capacity default null,
  p_min_tier verification_tier default 'V3'
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from property_role_bindings b
     where b.user_id     = auth.uid()
       and b.property_id = p_property
       and b.status      = 'active'
       and b.verification_tier >= p_min_tier
       and (p_capacity is null or b.capacity = p_capacity)
  );
$$;

-- ── Irreversible-action guard: quorum + contest + tier ─────────────────────
create or replace function public.can_act_irreversibly(p_property uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select has_property_capacity(p_property, null, 'V3')
     and not exists (select 1 from claim_contests c
                      where c.property_id = p_property and c.status = 'open')
     and (
       -- co-owner quorum (§II.2.4): every recorded grantee holds an active V3 binding,
       -- OR a notarized authority document is on file
       (select recorded_grantee_count from properties where id = p_property) <= 1
       or (select count(distinct b.user_id) from property_role_bindings b
            where b.property_id = p_property and b.status='active' and b.verification_tier='V3')
          >= (select recorded_grantee_count from properties where id = p_property)
       or exists (select 1 from claim_evidence e
                    join property_role_bindings b on b.id = e.binding_id
                   where b.property_id = p_property and e.kind = 'notarized_affidavit')
     );
$$;

-- ── Feature entitlement (NEVER a data-scope check) ─────────────────────────
create or replace function public.has_entitlement(p_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from entitlements e
                  where e.user_id = auth.uid() and e.key = p_key
                    and (e.expires_at is null or e.expires_at > now()));
$$;

-- ── Solicitation permission (§II.5.4) — evaluated on the TARGET parcel ─────
create or replace function public.can_solicit(p_property uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select (select not no_contact from properties where id = p_property)
     and not exists (
       select 1 from solicitation_suppressions s
        where s.property_id = p_property
          and (s.suppressed_user_id = auth.uid()
               or s.suppressed_role_group = current_user_role_group()))
     and (select exposure_policy from properties where id = p_property) <> 'private';
$$;
```

## III.3 Group 1 RLS Policies — `0016_group1_rls.sql`

Every policy below replaces a `current_user_role_group() = 'owner'` check with a capacity check. **Invariant I-1 is verified by CI (§IV.3).**

```sql
-- properties ---------------------------------------------------------------
drop policy if exists "properties_owner_access" on properties;
create policy "properties_capacity_access" on properties for select
  using (
    has_property_capacity(properties.id, null, 'V1')
    or current_user_role_group() = 'admin'
  );

drop policy if exists "properties_owner_update" on properties;
create policy "properties_capacity_update" on properties for update
  using (has_property_capacity(properties.id, null, 'V3'))
  with check (has_property_capacity(properties.id, null, 'V3'));

-- Exposure may ONLY widen through the cooling-off table (§II.5.2).
create or replace function guard_exposure_widening() returns trigger
language plpgsql as $$
begin
  if new.exposure_policy > old.exposure_policy
     and not exists (select 1 from exposure_change_requests r
                      where r.property_id = new.id and r.to_policy = new.exposure_policy
                        and r.cancelled_at is null and r.effective_at <= now()) then
    raise exception 'exposure widening requires a matured cooling-off request'
      using errcode = '42501';
  end if;
  if new.exposure_policy <> old.exposure_policy then
    new.exposure_effective_at := now();      -- resets hysteresis (§II.5.3 #1)
  end if;
  return new;
end $$;
create trigger properties_exposure_guard before update on properties
  for each row when (old.exposure_policy is distinct from new.exposure_policy)
  execute function guard_exposure_widening();

-- violations (closes VULN-02 at the Group 1 boundary) ----------------------
drop policy if exists "violations_owner_access" on violations;
create policy "violations_scoped_access" on violations for select
  using (
    has_property_capacity(violations.property_id, null, 'V1')
    or exists (select 1 from investor_owner_connections c
                where c.status = 'accepted'
                  and c.investor_id = auth.uid()
                  and c.owner_id = (select owner_id from properties p
                                     where p.id = violations.property_id))
    or current_user_role_group() = 'admin'
  );
-- NOTE: role-group alone NEVER grants violation access. Connection or capacity only.

-- documents ---------------------------------------------------------------
drop policy if exists "documents_scoped_access" on documents;
create policy "documents_capacity_access" on documents for select
  using (
    documents.uploaded_by = auth.uid()
    or has_property_capacity(documents.property_id, null, 'V2')
    or current_user_role_group() = 'admin'
  );

-- financial_ledgers -------------------------------------------------------
drop policy if exists "ledgers_party_access" on financial_ledgers;
create policy "ledgers_party_access" on financial_ledgers for select
  using (
    has_property_capacity(financial_ledgers.property_id, null, 'V2')
    or current_user_role_group() in ('lender','admin')
  );

-- Ledger status is written ONLY by the confirmation path (§II.7.2 Phase 2).
create policy "ledgers_no_direct_status_write" on financial_ledgers for update
  using (false);
-- Phase 2 uses the indexer service role, which bypasses RLS and is the sole writer.

-- escrow_intents ----------------------------------------------------------
alter table escrow_intents enable row level security;
create policy "intents_party_select" on escrow_intents for select
  using (has_property_capacity(escrow_intents.property_id, null, 'V2')
         or current_user_role_group() in ('lender','admin'));

create policy "intents_owner_authorize" on escrow_intents for insert
  with check (
    authorized_by = auth.uid()
    and can_act_irreversibly(escrow_intents.property_id)
    and state = 'authorized'
  );
-- No UPDATE policy exists. State transitions belong exclusively to the worker,
-- indexer, and reconciler service roles.

-- deal_room_events (closes VULN-06 at the Group 1 boundary) ---------------
drop policy if exists "deal_room_events_member_access" on deal_room_events;
create policy "deal_room_events_member_access" on deal_room_events for select
  using (
    (block_committee_id is not null and is_block_committee_member(block_committee_id))
    or (financial_ledger_id is not null and exists (
          select 1 from financial_ledgers l
           where l.id = deal_room_events.financial_ledger_id
             and (has_property_capacity(l.property_id, null, 'V2')
                  or current_user_role_group() in ('lender','admin'))))
    or current_user_role_group() = 'admin'
  );

-- property_role_bindings --------------------------------------------------
alter table property_role_bindings enable row level security;
create policy "prb_self_select" on property_role_bindings for select
  using (user_id = auth.uid()
         or has_property_capacity(property_id, null, 'V3')   -- co-owners see each other
         or current_user_role_group() = 'admin');
-- No INSERT/UPDATE policy. Bindings are written only by the verification service role.

-- entitlements ------------------------------------------------------------
alter table entitlements enable row level security;
create policy "ent_self_select" on entitlements for select using (user_id = auth.uid());
-- No client write path. Billing writes via a dedicated role with no binding grants.
```

## III.4 `workspace_manifest()` — the Directory Pane source of truth

```sql
create or replace function public.workspace_manifest()
returns jsonb
language sql stable security definer set search_path = public as $$
with wk as (
  select b.property_id, b.capacity, b.verification_tier, p.address, p.exposure_policy,
         exists (select 1 from claim_contests c
                  where c.property_id = b.property_id and c.status = 'open') as contested
    from property_role_bindings b
    join properties p on p.id = b.property_id
   where b.user_id = auth.uid() and b.status in ('active','dormant')
),
flags as (
  select bool_or(capacity = 'owner_distressed') as any_distressed from wk
)
select jsonb_build_object(
  -- §II.3.3 / §II.8.2: no upsell affordance renders anywhere when a Shield
  -- workspace is present. This is computed server-side and is not overridable.
  'upsell_allowed', not coalesce((select any_distressed from flags), false),
  'workspaces', coalesce(jsonb_agg(jsonb_build_object(
      'property_id', wk.property_id,
      'label',       wk.address,
      'capacity',    wk.capacity,
      'tier',        wk.verification_tier,
      'contested',   wk.contested,
      'subtabs', case wk.capacity
        when 'owner_single' then
          jsonb_build_array('vitals','maintenance','renovation','insurance','network')
        when 'owner_investor' then
          case when has_entitlement('ent.assembly')
            then jsonb_build_array('vitals','assembly','jv','enterprise','insurance')
            else jsonb_build_array('vitals','insurance') end
        when 'owner_distressed' then
          jsonb_build_array('defensive','loss_mitigation','shield','exposure')
      end
  ) order by wk.capacity), '[]'::jsonb)
) from wk;
$$;
```

The RSC Left Pane consumes this function's output verbatim. It performs no filtering, no sorting, and no conditional rendering beyond what the manifest states — matching `terminal-layout-plan.md` T7.4's zero-client-hook constraint.

## III.5 API Contracts

All routes: Next.js App Router route handlers, Supabase SSR client under the caller's session, structured error codes, and no `console.log` of parcel identifiers or user identifiers.

### `POST /api/owner/claims`
Start or advance a claim.
```
Request  { address | property_id, evidence_kind, payload }
Guards   authenticated; rate-limited 5/hour/identity
Effect   upserts property_role_bindings(status='pending'); appends claim_evidence;
         recomputes verification_tier; on V2 parses recorded_grantees and sets
         title_holder_type + recorded_grantee_count; calls sync_nav_role()
Response 201 { binding_id, tier, next_step, blocked_capabilities[] }
Errors   409 CLAIM_CONTESTED · 422 RECENCY_GUARD · 422 ENTITY_LINKAGE_REQUIRED
```

### `POST /api/owner/capacity`
Elect or accept a capacity on a parcel.
```
Request  { property_id, capacity }
Guards   V3 binding; can_act_irreversibly(); for 'owner_investor' → has_entitlement('ent.assembly')
         for 'owner_distressed' → NO entitlement check, ever (§II.8.2)
Effect   inserts a binding row; sync_nav_role()
Response 200 { capacity, subtabs[] }
Errors   403 TIER_INSUFFICIENT · 403 QUORUM_REQUIRED · 402 ENTITLEMENT_REQUIRED (assembly only)
```

### `PATCH /api/owner/exposure`
```
Request  { property_id, to_policy }
Guards   V3 + V3+ step-up ≤5 min
Effect   NARROWING → applied immediately.
         WIDENING  → inserts exposure_change_requests with effective_at = now()+24h;
                     returns the cancellation token. Applied by a cron job at maturity.
Response 200 { applied: bool, effective_at, cancel_token }
```

### `POST /api/escrow/intents`
Replaces the unsafe `POST /api/escrow/release`.
```
Request  { ledger_id, property_id, intent_kind, usd_amount_cents, payee, idempotency_key }
Guards   1. has_property_capacity(property_id, null, 'V3')      ← app layer, BEFORE anything
         2. can_act_irreversibly(property_id)
         3. V3+ step-up ≤5 minutes old
         4. all §II.7.3 gates evaluated and snapshotted
Effect   INSERT escrow_intents … state='authorized'; COMMIT. NO chain call in this path.
Response 202 { intent_id, state:'authorized' }
         Duplicate idempotency_key → 200 with the EXISTING intent. Never a second transfer.
Errors   403 CAPACITY_REQUIRED · 403 STEP_UP_REQUIRED · 409 GATE_BLOCKED { gate, detail }
         · 422 RATE_BAND_EXCEEDED
```

### `POST /api/escrow/webhooks/chain` *(indexer → platform)*
```
Guards   HMAC signature verification; replay table on (chain_id, tx_hash, log_index);
         N-block finality required before 'confirmed'
Effect   the ONLY path that writes financial_ledgers.status = 'released'
         emits deal_room_events (now visible to both parties per III.3)
```

### `GET /api/copilot` / `POST /api/copilot`
```
Request  { workspaceId, propertyId, capacity, epoch, messages }   ← identifiers, never prose
Guards   has_property_capacity(propertyId, capacity) → else 403, model NOT invoked
Effect   server re-derives all grounding facts through the RLS-scoped client;
         selects the capacity-scoped system prompt server-side;
         echoes `epoch` in the stream envelope for client-side fencing
```

### `POST /api/connections` *(inbound to a Group 1 parcel)*
```
Added guards  can_solicit(target_property_id)              ← §II.5.4
              quota: 3 lifetime / 1 per 30 days per requester per parcel
              getRoleGroup(target.role) === 'owner'         ← fixes the VULN-08 string break
Errors        403 SOLICITATION_SUPPRESSED · 429 SOLICITATION_QUOTA
```

### `POST /api/milestone-upload` *(hardened, closes VULN-09 for Group 1)*
```
Added guards  the caller must hold a CONTRACTOR capacity on the target property
              (property_contractor_bindings, the Group 5 analogue) — not merely be authenticated
              rate-limited per property; Vision quota accounted per property, not globally
```

## III.6 TypeScript Registry Deltas

```ts
// src/lib/rbac/roles.ts — G1-17: `acquisition` removed from owner_investor
export const ROLE_APP_MAP: Record<string, string[]> = {
  owner_single:     ['owner', 'property', 'escrow'],
  owner_investor:   ['owner', 'property', 'escrow'],   // ← was [..., 'acquisition', ...]
  owner_distressed: ['owner', 'property', 'escrow'],
  // …19 remaining sub-roles + admin unchanged
};

// src/lib/rbac/capacity.ts — NEW. The Group 1 authorization surface for route handlers.
export type OwnerCapacity = 'owner_single' | 'owner_investor' | 'owner_distressed';
export type VerificationTier = 'V0' | 'V1' | 'V2' | 'V3';

/** Mirrors has_property_capacity(). Route handlers call this BEFORE any side effect. */
export async function assertCapacity(
  supabase: SupabaseClient,
  propertyId: string,
  capacity?: OwnerCapacity,
  minTier: VerificationTier = 'V3',
): Promise<void>;

/** Mirrors can_act_irreversibly(). Required before any escrow or signature path. */
export async function assertIrreversible(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<void>;

/** Feature gate. MUST be called only after an assertCapacity() has already passed. */
export async function hasEntitlement(
  supabase: SupabaseClient, key: string,
): Promise<boolean>;
```

```ts
// src/store/terminalStore.ts — §II.3.4 hardened shape
interface TerminalState {
  workspaceId: string | null;
  propertyId:  string | null;
  capacity:    OwnerCapacity | null;
  epoch:       number;
  switchWorkspace: (w: { workspaceId: string; propertyId: string; capacity: OwnerCapacity }) => void;
  clear: () => void;   // called BEFORE the new route mounts; increments epoch
}
```

---

# PART IV — VERIFICATION

## IV.1 RBAC Isolation Matrix

Actor holds the row's capacity on **parcel A**. Columns are what they may reach on **parcel B** (no binding).

| Actor capacity on A | properties(B) | violations(B) | documents(B) | ledgers(B) | escrow_intents(B) | committee(B) | copilot ctx B |
|---|---|---|---|---|---|---|---|
| `owner_single` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ 403 |
| `owner_investor` | ❌* | ❌ | ❌ | ❌ | ❌ | aggregate only | ❌ 403 |
| `owner_distressed` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ 403 |
| `investor_wholesaler` | tombstoned view only, k≥5 | connection required | ❌ | ❌ | ❌ | ❌ | ❌ |
| `broker_residential` | `seeking_exit` only | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `admin` | break-glass, audited | break-glass | break-glass | break-glass | break-glass | ✅ | ✅ |

\* `owner_investor` reaches parcel B only through `properties_discoverable` (address + BBL, no coordinates, no financials) and only where B has consented via `exposure_policy`. Never the base table.

## IV.2 Acceptance Criteria

**Onboarding**
- [ ] A V2-only binding cannot request quotes, open escrow, appear as a pin, or sign anything. Every attempt returns `403 TIER_INSUFFICIENT`.
- [ ] A parcel with `recorded_grantee_count = 3` and one active binding blocks escrow authorization and agreement signing with `403 QUORUM_REQUIRED`.
- [ ] An entity-held parcel routes to the Entity Linkage flow rather than a dead end; the flow terminates in either V2 or an explicit, actionable failure.
- [ ] A deed recorded < 90 days ago rejects V2-only claims and notifies the prior grantee of record.
- [ ] An open contest freezes irreversible capabilities for **both** parties, not just the contested one.
- [ ] V0 delivers a full read-only Vitals dashboard with zero writes, zero pins, and zero presence in any feed or count.

**Isolation**
- [ ] `grep -rn "current_user_role_group" supabase/migrations/` returns **zero** hits on `properties`, `violations`, `documents`, `financial_ledgers`, `vision_inspections`, or `deal_room_events` row predicates other than `= 'admin'`. *(Invariant I-1, CI-enforced.)*
- [ ] Direct `supabase.from('properties').select('*')` under an `owner_*` session returns only bound parcels.
- [ ] Direct `supabase.from('violations').select('*')` under any `investor_*` session returns only connection-scoped rows.
- [ ] A billing-role connection attempting `insert into property_role_bindings` fails with `42501`. *(Invariant I-2.)*
- [ ] `/api/copilot` with a `propertyId` the caller has no binding on returns 403 **without invoking the model** — asserted by a model-call spy, not by response inspection.
- [ ] A stale-epoch stream is discarded client-side and never rendered.

**Privacy**
- [ ] Every new parcel is created `exposure_policy = 'private'`.
- [ ] Widening requires step-up, renders a disclosure, and is cancellable for 24h; narrowing is instant.
- [ ] A parcel that narrows exposure is replaced by a 30-day tombstone. Hourly feed diffing across the transition yields no detectable event. *(Automated: 72 consecutive snapshots, assert zero inferable deltas.)*
- [ ] A bounded geo query returning < 5 parcels returns `region_too_sparse`, including for `owner_investor`.
- [ ] No API response, export, or feed anywhere contains an `owner_distressed` binding, a Shield offer, or a distress score.
- [ ] A declined connection is permanently suppressed across new subscriptions, new role assignments, and re-registration under the same verified identity.

**Assembly**
- [ ] No code path binds a non-signing parcel. Feasibility recomputes over signers only.
- [ ] Per-parcel neighbor identity is unreachable pre-mutual-opt-in — verified at the API layer, not the UI.
- [ ] Committee percentages count only V3, contest-clear, active bindings.
- [ ] A single identity holding > 4 V3 bindings inside one footprint collapses to a single vote and raises a review flag.
- [ ] A `seeking_exit = false` distressed parcel is excluded from JV solicitation by a neighboring `owner_investor` exactly as from a wholesaler.

**Financial**
- [ ] No chain call executes before the intent row is committed. *(Asserted by killing the process between phases and confirming zero on-chain effect.)*
- [ ] A replayed `idempotency_key` returns the original intent and produces no second transfer.
- [ ] Every §II.7.3 gate blocks independently; gate 3 (missing `compliance_checks` row) **blocks**, and a regression test asserts absence-is-block.
- [ ] Cumulative release cannot exceed 90% before final acceptance and lien-period expiry.
- [ ] A cure escrow at `deadline_at` with no oracle confirmation reverts 100% to the owner with zero platform fee.
- [ ] Owner substitution on a cure escrow succeeds with no professional consent and no penalty.
- [ ] A >2% rate move between authorize and broadcast blocks settlement and notifies both parties.
- [ ] No platform fee is ever assessed against escrowed principal on an `owner_distressed` matter — asserted by a ledger invariant test, not by inspection.
- [ ] Routing to a `legal_*` or `lender_*` counterparty without a recorded `disclosures` acknowledgement returns `403 DISCLOSURE_REQUIRED`.

**Monetization**
- [ ] No Stripe event of any type mutates `property_role_bindings`. *(Fuzz the full webhook event catalogue.)*
- [ ] Entering `owner_distressed` requires no payment and no entitlement.
- [ ] With any active Shield workspace, `upsell_allowed = false` and no padlock, banner, interstitial, or lifecycle email renders anywhere.
- [ ] A user with a live agreement whose subscription lapses retains full read, export, signature, and escrow-reversion capability under `ent.custodial`.

## IV.3 CI Guardrails

```
policy-lint     — fails the build if any Group 1 table's RLS predicate references
                  current_user_role_group() other than for the literal 'admin' branch (I-1)
grant-lint      — fails if the billing role holds any grant on binding, property,
                  agreement, ledger, or violation tables (I-2)
intent-lint     — fails if any web3 client call appears in a route handler module;
                  chain calls are permitted only in worker/ and indexer/ (§II.7.2)
fee-lint        — fails if any percentage fee constant is referenced on a code path
                  reachable from a legal_* or lender_* counterparty class (§II.8.3)
disclosure-lint — fails if a routing handler lacks a preceding disclosures assertion
```

## IV.4 Telemetry

Funnel: `v0_vitals_viewed → v1_started → v1_completed → v2_matched → v3_started → v3_completed → first_capability_used`.
Alert on: stage-over-stage conversion drop > 15% week-over-week; V3 median completion > 5 days; entity-linkage failure rate > 10%; contest rate > 0.5% of claims.

Security counters (paged, not dashboarded): binding writes from a non-verification actor; exposure widening without a matured request; intent state transitions outside the worker/indexer/reconciler roles; discovery queries hitting the k-anonymity floor at anomalous rates from a single principal (scraping signature); export quota exhaustion.

Deliberately **not** collected: any per-user distress metric in an exportable, joinable, or vendor-shared surface.

---

# PART V — RESIDUAL RISK & LEGAL REVIEW QUEUE

## V.1 Accepted residual risks

| Risk | Why accepted | Compensating control |
|---|---|---|
| Address-PIN possession proof is defeatable by mail theft | No stronger proof is universally available at consumer cost | Paired with V1 IDV; irreversible actions add V3+ step-up; 10-day contest window; notice to the address of record on every capacity election |
| Public violation and lien records remain public | Statutory; the platform cannot suppress the source | The platform does not *amplify*: no scoring, no ranking, no alerting, no sale of derived distress state |
| Off-platform solicitation after an on-platform data view | The platform cannot control conduct outside it | k-anonymity, tombstoning, cadence quantization, per-seat export watermarking, scraping-signature detection |
| $SHQL settlement finality vs. consumer chargeback expectations | Chain settlement is final; consumers expect reversibility | USD denomination, retainage, dispute path to Group 4 before final release, platform recovery key that refunds to source |

## V.2 Blocking legal review items

These require counsel sign-off before the corresponding surface ships. Each is a build-blocker, not a launch-note.

1. **Money transmission / custody.** Does holding $SHQL in platform-influenced escrow constitute money transmission requiring state MTL or a FinCEN MSB registration? Determines whether the platform recovery key can exist at all in its current form. **Blocks:** all escrow surfaces.
2. **RESPA §8 analysis** of every compensated routing path touching a HELOC or settlement service, including the flat-fee model in §II.8.3. **Blocks:** Renovation & Financing routing.
3. **MRPC 5.4 / 7.2 analysis** of the attorney access-subscription model across the target jurisdictions. **Blocks:** Legal Shield routing.
4. **MARS / Reg. O and state foreclosure-consultant statutes** — confirm the funding-commitment model in §II.7.5 is outside the advance-fee prohibition in every launch state. **Blocks:** all Shield monetization, and Shield itself in states where routing alone triggers registration.
5. **Consumer arbitration enforceability** for the §II.6.5 clause structure, per launch state.
6. **JV securities analysis.** A multi-owner assembly with pooled economics and passive participants may constitute an investment contract under *Howey*. **Blocks:** JV & Syndication.
7. **AVM disclosure.** Confirm the confidence-interval + not-an-appraisal presentation satisfies AVM quality-control rulemaking where the output influences a credit decision.
8. **$SHQL token characterization** — utility vs. security, and the consumer-protection consequence of any consumer being required to touch it. §II.7.6 is written to keep consumers token-free precisely to preserve this answer.

## V.3 Explicitly out of scope for Group 1

Cross-group behaviors surfaced here but owned elsewhere, to be reconciled during Group 2/3/4/9 hardening:

- **Group 9 §"Distress Interception"** — the premium tier exposing `seeking_exit` distressed parcels is withdrawn per §II.8.4 and must be re-specified as a consented feed.
- **Group 9 §"Bounty/Referral Payouts"** — the HELOC referral bounty is deleted per §II.8.3.
- **Group 2 wholesaler discovery** must consume `properties_discoverable`, never the `properties` base table.
- **Group 5 contractor capacity bindings** are the Group 1 model's mirror and are prerequisite to §II.7.3 gate 2 and the hardened milestone-upload guard.

---

# APPENDIX A — Traceability to `rbac-audit-red-team.md`

| Prior finding | Status in this blueprint | Resolved at |
|---|---|---|
| VULN-01 escrow/release has no role gate | Resolved and superseded — route replaced by the two-phase intent protocol | §II.7.2, §III.5 |
| VULN-02 investors read all violations | Resolved for Group 1 — role-group alone never grants; capacity or accepted connection required | §III.3 `violations_scoped_access` |
| VULN-03 investors read full property rows | Resolved — discovery moved to `properties_discoverable` with no coordinates | §III.1.2 |
| VULN-04 no `compliance_checks` INSERT policy | Resolved at the consumption point — absence is a **block**, never a pass | §II.7.3 gate 3 |
| VULN-05 attorneys read all agreements | Out of Group 1 scope; Group 4 must scope to assigned matters. Group 1 compensates via capacity checks on parcel-linked agreements | Group 4 |
| VULN-06 ledger-linked deal-room events invisible | Resolved — `financial_ledger_id` branch added, capacity-scoped | §III.3 |
| VULN-07 proxy-signing via `party_user_id` | Resolved for Group 1 — signature requires V3+ step-up bound to `auth.uid()`; `party_user_id` removed | §II.2.7, §III.5 |
| VULN-08 `connections_update` self-accept + role-string break | Resolved — `getRoleGroup()` comparison plus `can_solicit()` and quota guards | §III.5 |
| VULN-09 milestone-upload has no role check | Resolved — contractor capacity on the target property required | §III.5 |
| DESIGN-01 `parties[].role` free text | Resolved — party rows carry `(user_id, capacity, property_id)`; display lookups use capacity, not string equality | §III.1.1 |
| DESIGN-02 `current_user_role()` typed return | Unchanged — handled by Appendix B sequencing | Appendix B |
| DESIGN-03 layout `ALLOWED_ROLES` sets | Resolved — layout gates are coarse routing only; the security boundary is `has_property_capacity()` | §II.1 |

# APPENDIX B — Required Deltas to `phase8-sub-role-expansion-plan.md`

1. **T8.3 — `ROLE_APP_MAP`.** Remove `acquisition` from `owner_investor`. Its app segments become `['owner','property','escrow']`, identical to the other two owner sub-roles. *(G1-17.)*
2. **T8.2 — RLS.** The listed policies `properties_owner_access`, `violations_owner_access`, `documents_scoped_access`, `ledgers_party_access`, and `deal_room_events_member_access` must **not** merely be widened to `current_user_role_group()`. For Group 1 entities they are replaced wholesale by `has_property_capacity()` per §III.3. Widening them to the group string is the exact defect G1-02 describes.
3. **New tasks T8.8–T8.11.** Migrations `0013`–`0016` (§III.1), sequenced **after** `0011`/`0012` so that `current_user_role_group()` exists for the `admin` branches.
4. **T8.6 — fixtures.** `ownerA`/`ownerB` need `property_role_bindings` rows at `V3`/`active`, not merely a `users.role` value. Existing E2E tests that assume role-string authorization on Group 1 tables will fail correctly and must be rewritten against capacity.
5. **Taxonomy count.** This plan enumerates 22 sub-roles; the canonical taxonomy is **25** — the three Group 9 broker keys (`broker_commercial`, `broker_residential`, `broker_leasing`) must be added to the enum, `ROLE_APP_MAP`, and `ROLE_GROUP_MAP` under a `broker` group string. Group 1's §II.5 suppression logic depends on `broker_residential` being an addressable group.

---

**END OF MASTER BLUEPRINT — GROUP 1**
