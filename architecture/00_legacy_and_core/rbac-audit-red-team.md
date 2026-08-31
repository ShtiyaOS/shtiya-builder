# Shtiya Builder — RBAC Audit & Red Team Report

**Date:** 2026-08-18  
**Scope:** All 11 Supabase RLS policy files, 6 API route handlers, 3 server-component layouts, and 1 TypeScript RBAC registry against the 22-sub-role taxonomy in `shtiya_builder-role-taxonomy.md`.  
**Method:** Static code audit of every hardcoded role string. No running exploit code — these are architectural gaps, not live CVEs.

---

## Executive Summary

The current codebase operates on a **10-value flat enum** (`user_role`). The business architecture requires **22 granular sub-roles** across 7 groups. The gap between these two models creates **9 confirmed vulnerabilities** at 3 distinct layers: database policy, API route application logic, and layout gate expansion surface.

**Severity classification:**  
- 🔴 **Critical** — exploitable without any additional tooling; a user with a valid session can access data or trigger state transitions they should never reach.  
- 🟠 **High** — exploitable with minor effort (e.g. any authenticated user sending a crafted POST body).  
- 🟡 **Medium** — requires a specific account type to exploit, but the blast radius is significant when triggered.  
- 🟢 **Low / Design Debt** — not exploitable today, but will break under the 22-sub-role migration if not fixed first.

---

## LAYER 1 — Database (RLS Policy Gaps)

### VULN-01 🔴 `escrow/release` has NO role gate at the DB layer
**File:** `supabase/migrations/0007_write_policies.sql` → `financial_ledgers_lender_update`  
**File:** `src/app/api/escrow/release/route.ts`

**Finding:** `POST /api/escrow/release` updates `financial_ledgers.status = 'released'` and records a `web3_tx_hash`. The RLS UPDATE policy `financial_ledgers_lender_update` allows this for any caller whose `current_user_role() in ('lender', 'admin')`. However, `escrow/release` itself has **zero application-level role check** — unlike `draws/approve` which explicitly gates on `['lender', 'admin'].includes(profile.role)`, the escrow release route has no equivalent check:

```
// src/app/api/escrow/release/route.ts — lines 28-45
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
// ← NO profile.role fetch. NO role comparison. Proceeds directly to business logic.
```

The only enforcement is the DB-layer RLS policy. This means: any authenticated user who is NOT a `lender` or `admin` will reach the Vision gate logic, the Web3 call, and will only fail at the `.update()` step when PGRST116 fires — **after an on-chain `releaseFunds()` call has already been attempted**. If the Web3 call succeeds before the DB write fails, funds move on-chain while the ledger stays `held`. The comment in the file itself acknowledges this: *"POST /api/escrow/release has no equivalent app-level role check today — this policy closes that gap at the DB layer"* — but closing a gap at the DB layer after an on-chain call fires is not a safe pattern for irreversible financial transactions.

**Exploit scenario:** `owner_single` authenticates, calls `POST /api/escrow/release` with a valid `ledger_id` and their own Ethereum address as `recipient`. Vision gate is checked (they're the property owner — they can read vision_inspections under `properties_owner_access`), on-chain call fires, PGRST116 fires on the DB write. Funds may move, ledger stays `held`, and the route returns HTTP 500 with the funds gone.

**Fix:** Add an explicit role check at the top of `escrow/release` mirroring `draws/approve` — before any Vision gate or Web3 call executes.

---

### VULN-02 🔴 `violations` policy grants ALL investors access to ALL violations globally
**File:** `supabase/migrations/0002_rls_policies.sql` → `violations_owner_access`

```sql
create policy "violations_owner_access" on violations for select
  using (
    exists (select 1 from properties p where p.id = violations.property_id and p.owner_id = auth.uid())
    or current_user_role() in ('investor', 'admin')  -- ← THIS LINE
  );
```

**Finding:** Any user with `role = 'investor'` can SELECT every violation record in the database regardless of whether they have any relationship to that property. The taxonomy intention is that investors can see violations on properties **they are actively scouting or hold a connection to**. The current policy is a bulk data exfiltration vector — an investor can enumerate every HPD/DOB/ECB/311 violation across all tracked properties without triggering any threshold, alerting logic, or connection requirement.

Under the 22-sub-role model, `investor_wholesaler`, `investor_value_add`, and `investor_assembler` should only see violations on properties where they hold an `accepted` connection or an active `agreements` row — not the entire `violations` table.

**Exploit scenario:** `investor_wholesaler` calls `supabase.from('violations').select('*')` — returns all violations across all properties. This is off-market intelligence that should only unlock after a connection is accepted.

---

### VULN-03 🟠 `properties_investor_discovery` policy exposes ALL properties with no connection prerequisite
**File:** `supabase/migrations/0010_investor_connections.sql` → `properties_investor_discovery`

```sql
create policy "properties_investor_discovery" on properties for select
  using (current_user_role() = 'investor');
```

**Finding:** This policy was intentionally added to unblock the discovery feed (fair), but it grants row-level access to **all properties** for any investor. The column restriction (address + BBL only, no financials) is enforced exclusively at the API route query level — `GET /api/connections/discovery` explicitly selects only `id, address, bbl, owner_id`. However, RLS cannot restrict columns — this is a PostgREST concern. Any investor with direct `supabase-js` client access (e.g. a compromised browser session, a custom client, or a future mobile app) can call `supabase.from('properties').select('*')` and receive the full row — including `lat`, `lng`, `metadata jsonb`, `embedding vector(768)`, and `status`. The column restriction exists only in one route handler, not in the policy.

**Exploit scenario:** Investor opens browser devtools, initializes `supabase-js` with their anon session, runs `supabase.from('properties').select('*')`. Gets all rows with all columns — GPS coordinates, property metadata, and raw embedding vectors for all properties.

**Fix:** Two options — (a) create a Postgres view `properties_public` that only exposes `id, address, bbl, owner_id` and grant the discovery policy on the view, not the base table; or (b) use a column-masking RLS policy via a row security policy WITH CHECK that effectively restricts via a separate read function. Option (a) is simpler and standard.

---

### VULN-04 🟠 `compliance_checks` has no contractor-role INSERT policy — Sentinel cannot write
**File:** `supabase/migrations/0007_write_policies.sql` — no INSERT policy exists for `compliance_checks`

**Finding:** `supabase/functions/sentinel-verify/index.ts` (the Sentinel agent) upserts rows into `compliance_checks`. There is a SELECT policy (`compliance_checks_scoped`) but no INSERT or UPDATE policy for `compliance_checks`. The `sentinel-verify` Edge Function presumably uses the service-role client (which bypasses RLS), but:
1. If it ever switches to a scoped client, all Sentinel writes silently fail.
2. There is no RLS-enforced write path for contractors to update their own compliance records — no contractor can ever self-attest.
3. The app code in `draws/approve` reads `compliance_checks` via the RLS-scoped lender client — if a lender cannot see a `compliance_checks` row that should exist (and the INSERT was silently blocked), `draws/approve` treats the absence as "no compliance issue" and allows the draw.

**Exploit scenario:** A contractor whose compliance is actually lapsed has no `compliance_checks` row (Sentinel write failed silently). `draws/approve` checks `compliance_checks`, finds nothing, concludes no lapse, and releases the draw. This is a silent bypass of the Sentinel gate.

---

### VULN-05 🟡 `agreements_party_access` allows attorneys to read ALL agreements cross-tenant
**File:** `supabase/migrations/0002_rls_policies.sql` → `agreements_party_access`

```sql
create policy "agreements_party_access" on agreements for select
  using (
    parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or current_user_role() in ('attorney', 'admin')
  );
```

**Finding:** Any user with `role = 'attorney'` can SELECT every agreement in the database regardless of whether they are assigned to it. The taxonomy defines four distinct legal sub-roles (`legal_transactional`, `legal_title`, `legal_expediter`, `legal_loss_mitigation`), each with different client contexts. Under the current policy, a `legal_title` officer (whose job is title clearance, not PSA review) can read every JV agreement across every tenant. This violates the separation-of-duties principle the taxonomy is built on, and is a compliance risk (attorney-client privilege, NDA terms).

**Write policies (0007) mirror the same flaw:** `agreements_party_insert` and `agreements_party_update` both allow any `attorney` to insert or update any agreement.

---

### VULN-06 🟡 `deal_room_events_member_access` skips the `financial_ledger_id` branch entirely
**File:** `supabase/migrations/0002_rls_policies.sql` → `deal_room_events_member_access`

```sql
create policy "deal_room_events_member_access" on deal_room_events for select
  using (
    (deal_room_events.block_committee_id is not null
      and is_block_committee_member(deal_room_events.block_committee_id))
    or current_user_role() = 'admin'
  );
```

**Finding:** Events with `financial_ledger_id` set (and `block_committee_id = null`) — i.e., `draw_status_changed` events emitted by `draws/approve` — are **only visible to admins**. Lenders who approve the draw, borrowers (owners/investors) who should see draw status updates, and the Pulse live feed for the Capital app all silently receive zero events. This was noted in T4.3's acceptance criteria: *"Borrower and lender both see draw status changes reflected within 2 seconds via the shared deal_room_events Realtime channel"* — this acceptance criterion is not met by the current policy.

**Exploit (inverse):** A lender approves a draw via `draws/approve`. The Pulse `DealRoomFeed` subscribes to `deal_room_events`. The `draw_status_changed` event is inserted, but the lender's RLS-scoped SELECT returns nothing for ledger-linked events — the live channel is dead for all non-admin parties on capital deal rooms.

---

## LAYER 2 — Application Code (Route Handler Gaps)

### VULN-07 🟠 `PATCH /api/agreements` allows any listed party to sign on behalf of another party
**File:** `src/app/api/agreements/route.ts` → `PATCH` handler, lines 179 and 197-200

```typescript
const signingUserId = (party_user_id as string | undefined) ?? user.id;
// ...
const partyIndex = parties.findIndex((p) => p.user_id === signingUserId);
if (partyIndex === -1) {
  return NextResponse.json({ error: 'User is not a listed party on this agreement.' }, { status: 403 });
}
```

**Finding:** `party_user_id` in the request body is **caller-controlled and not validated against `user.id`**. Any authenticated user who is listed as a party to an agreement can POST `{ agreement_id: "...", party_user_id: "<any other party's UUID>" }` and stamp a `signed_at` timestamp for that other party. The route's own check only verifies that `party_user_id` is in the `parties` array — not that it equals `user.id`. An attorney listed on an agreement can sign on behalf of all other parties, executing the agreement unilaterally.

**Exploit scenario:** `legal_transactional` attorney calls `PATCH /api/agreements` with `party_user_id` set to the seller's UUID. The seller's entry gets `signed_at` stamped. If the attorney is the last unsigned party, `status` transitions to `'executed'`. The seller never actually signed.

**Fix:** Remove the `party_user_id` parameter entirely, or if proxy-signing is a legitimate product feature, add an explicit delegation/consent mechanism. At minimum: `signingUserId` must equal `user.id` unless the caller is `admin`.

---

### VULN-08 🟠 `connections_update` WITH CHECK allows an owner to accept their OWN request
**File:** `supabase/migrations/0010_investor_connections.sql` → `connections_update` policy, lines 79-84

```sql
with check (
  (investor_id = auth.uid() and status = 'withdrawn')
  or (owner_id = auth.uid() and status in ('accepted', 'declined'))
  or current_user_role() = 'admin'
);
```

**Finding:** The WITH CHECK policy verifies `owner_id = auth.uid()` when accepting/declining, and `investor_id = auth.uid()` when withdrawing. But the USING clause (which controls which rows can be targeted) also permits the owner to target rows where `owner_id = auth.uid() and status = 'requested'`. If a user's account is **both the investor_id and the owner_id on a row** (e.g. a test account, or a future admin-impersonation flow that sets `investor_id` to the acting user's UUID and `owner_id` to the same UUID), the policy permits a self-accept. The UNIQUE constraint on `(investor_id, owner_id)` prevents the same UUID appearing on both sides in a live flow, but this is only a physical constraint — the WITH CHECK logic itself has no `investor_id != owner_id` guard.

More practically: the application check in `connections/route.ts` line 58 verifies `target?.role !== 'owner'` but under the 22-sub-role migration this check will break (since `target?.role` will be `'owner_single'` not `'owner'`) — at which point ANY target user passes the check, investors can send requests to other investors, and the `connections_update` WITH CHECK becomes the only gate.

---

### VULN-09 🟢 `milestone-upload` has no role check — any authenticated user can trigger Gemini Vision
**File:** `src/app/api/milestone-upload/route.ts` — lines 64-67

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
// ← Only auth check. No role check. Tenant, attorney, investor, lender, marketer can all POST.
```

**Finding:** Any authenticated user — regardless of role — can upload a milestone file and trigger a Gemini Vision call. The cost implication is bounded by Gemini's per-project quota, but the blast radius includes: (a) any user can create `vision_inspections` rows linked to any `property_id` they provide; (b) a malicious actor can flood the Vision queue with garbage uploads to exhaust quota and delay legitimate contractor inspections; (c) because `vision_inspections_insert_own` only checks `contractor_id = auth.uid()`, a `tenant` or `investor` can create inspection rows with their own UUID as `contractor_id` — creating fraudulent inspection records for properties they don't work on.

**Severity note:** This is 🟢 Low today because the Vision gate at `escrow/release` checks the inspection linked to `document_id` or `property_id`, and fraudulent inspections with `blocks_draw = false` would only help (not hinder) a draw release. But under a scenario where an attacker sets `blocks_draw = true` on a fraudulent inspection, they could block legitimate draws. This vector becomes High severity in that case.

---

## LAYER 3 — Architecture / Design Gaps

### DESIGN-01 — `agreements.parties[].role` is a free-text string, not a foreign key or enum
**File:** `src/app/api/agreements/route.ts` line 92

```typescript
const initialParty = { user_id: user.id, role: profile?.role ?? 'owner', signed_at: null };
```

The `parties` JSONB column stores `{ user_id, role, signed_at }` objects. `role` here is whatever the caller's `users.role` value is — a free-text string stored in an unvalidated JSONB field. When the 22-sub-role migration lands, this field will contain sub-role strings like `'owner_investor'`, but existing rows will contain `'owner'`. Agreement lookup logic in `capital/page.tsx` and `capital/draws/[id]/page.tsx` hardcodes:

```typescript
parties.find((p) => p.role === 'owner' || p.role === 'investor')
```

After migration, this find returns `undefined` for all rows — no borrower is ever displayed in the Capital dashboard.

---

### DESIGN-02 — `current_user_role()` returns `user_role` enum — strict type will reject new sub-roles
**File:** `supabase/migrations/0002_rls_policies.sql` lines 38-46

```sql
create or replace function public.current_user_role()
returns user_role  -- ← typed return, not text
```

When migration 0011 replaces the `user_role` enum, this function must also be updated. If the function is `CREATE OR REPLACE`d in 0011 with the new return type BEFORE `DROP TYPE user_role CASCADE`, Postgres will reject the DDL. The migration must: (1) drop or redefine `current_user_role()` to return `text` first, (2) drop and recreate the enum, (3) retype the function back to the new enum. This sequencing is not documented and will cause the migration to fail if applied naively.

---

### DESIGN-03 — Layout gates are `Set<string>` literals — will silently pass all sub-roles not in the set
**File:** `src/app/(apps)/(owner)/layout.tsx` line 4

```typescript
const ALLOWED_ROLES = new Set(['owner', 'investor', 'admin']);
```

Under the 22-sub-role migration, `profile?.role` will be `'owner_investor'`, `'investor_value_add'`, etc. None of these strings are in the current `Set`. Every non-admin user navigating to any `(owner)` app will be redirected to `/unauthorized` — silently, with no error output. This is the fail-safe direction (deny), but it means the entire `(owner)` app group becomes inaccessible to all owners and investors the moment the DB migration runs, before T8.5 is applied.

---

## Red Team Attack Matrix Summary

| ID | Severity | Layer | Vector | Controllable By |
|----|----------|-------|--------|----------------|
| VULN-01 | 🔴 Critical | API + Web3 | Escrow release has no role gate — on-chain call fires before RLS block | Any authenticated user |
| VULN-02 | 🔴 Critical | RLS | All investors can SELECT all violations globally | Any `investor`-role session |
| VULN-03 | 🟠 High | RLS | Investors can SELECT full property rows via direct `supabase-js` call | Any `investor`-role session |
| VULN-04 | 🟠 High | RLS | No INSERT policy for `compliance_checks` — Sentinel silent fail = draw always passes | Supabase Edge Function config change |
| VULN-05 | 🟡 Medium | RLS | Any attorney reads and writes all agreements cross-tenant | Any `attorney`-role session |
| VULN-06 | 🟡 Medium | RLS | Ledger-linked `deal_room_events` are invisible to lenders and borrowers | Pulse channel always dead for capital deals |
| VULN-07 | 🟠 High | API | Proxy-signing: any party can stamp `signed_at` for another party | Any listed agreement party |
| VULN-08 | 🟠 High | RLS | `connections_update` WITH CHECK will break under sub-role migration | Any authenticated user after migration |
| VULN-09 | 🟢 Low | API | No role gate on milestone-upload — any user can trigger Gemini Vision | Any authenticated user |
| DESIGN-01 | 🟢 Low | Schema | `agreements.parties[].role` is free-text — Capital dashboard will break after migration | Migration event |
| DESIGN-02 | 🟢 Low | Schema | `current_user_role()` returns typed enum — DDL sequence will fail | Migration event |
| DESIGN-03 | 🟢 Low | Layout | `ALLOWED_ROLES` Set literals will block all users after migration | Migration event |

---

## Fix Priority Order

Resolve in this sequence before beginning any Phase 8 migration work:

```
1. VULN-01  — Add role gate to escrow/release (5-line fix, no migration)
2. VULN-07  — Remove party_user_id proxy-signing from agreements PATCH (2-line fix)
3. VULN-02  — Scope violations policy to connected/agreed properties only (migration)
4. VULN-03  — Create properties_public view; re-scope discovery policy to view (migration)
5. VULN-06  — Add ledger_id branch to deal_room_events_member_access (migration)
6. VULN-04  — Add INSERT + UPDATE policy for compliance_checks (migration)
7. VULN-05  — Scope attorney agreement access to assigned matters only (migration)
8. VULN-08  — Add investor_id != owner_id guard to connections_update (migration)
9. VULN-09  — Add contractor role check to milestone-upload (5-line fix)
10. DESIGN-01/02/03 — Addressed as part of Phase 8 migration sequencing
```

Items 1, 2, and 9 are pure TypeScript fixes with no migration required and can be applied immediately.
Items 3–8 require a new migration (`0011_security_hardening.sql`) that must be applied before the sub-role enum migration.
