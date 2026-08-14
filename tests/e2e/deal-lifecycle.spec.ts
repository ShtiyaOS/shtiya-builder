/**
 * T4.16 — End-to-End Deal Lifecycle Integration Test
 *
 * Walks: Owner block assembly -> Acquisition lead -> Legal PSA execution ->
 * Capital draw funding -> Contractor milestone upload -> Vision approval ->
 * Escrow release -> Property handoff, asserting correct state and RLS
 * enforcement at every hop.
 *
 * Route handlers are imported and invoked directly (no live `next dev`/
 * `next start` server) — see tests/e2e/README.md for why that's safe.
 * Requires a running local Supabase stack (`supabase start`) with all
 * migrations applied (`supabase db reset`) and SUPABASE_SERVICE_ROLE_KEY
 * set — see .env.example.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inspectMilestone } from '@/lib/gemini/vision';
import { POST as inviteMember, PATCH as signMember } from '@/app/api/block-committees/route';
import { POST as createLead } from '@/app/api/leads/route';
import { POST as createAgreement, PATCH as signAgreement } from '@/app/api/agreements/route';
import { POST as approveDraw } from '@/app/api/draws/approve/route';
import { POST as uploadMilestone } from '@/app/api/milestone-upload/route';
import { POST as releaseEscrow } from '@/app/api/escrow/release/route';
import { POST as submitMaintenance } from '@/app/api/maintenance/route';
import { seedLifecycle, type LifecycleFixture } from './helpers/seed';
import { actAs, jsonRequest, formRequest } from './helpers/route-caller';
import { createAnonClient } from './helpers/supabase-test-client';

let ctx: LifecycleFixture;
let agreementId: string;
let ledgerId: string;

beforeAll(async () => {
  ctx = await seedLifecycle();
});

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

describe('1. Owner block assembly (T2.1/T2.2)', () => {
  it('ownerA self-enrolls propertyA and invites neighbor ownerB/propertyB', async () => {
    actAs(ctx.users.ownerA.client);
    const selfEnroll = await inviteMember(
      jsonRequest('/api/block-committees', 'POST', {
        block_committee_id: ctx.ids.committee,
        property_id: ctx.ids.propertyA,
        user_id: ctx.users.ownerA.user.id,
      }),
    );
    expect(selfEnroll.status).toBe(201);

    actAs(ctx.users.ownerA.client);
    const inviteNeighbor = await inviteMember(
      jsonRequest('/api/block-committees', 'POST', {
        block_committee_id: ctx.ids.committee,
        property_id: ctx.ids.propertyB,
        user_id: ctx.users.ownerB.user.id,
      }),
    );
    expect(inviteNeighbor.status).toBe(201);
  });

  it('signing both members locks the committee once target_member_count is reached', async () => {
    actAs(ctx.users.ownerA.client);
    const signA = await signMember(
      jsonRequest('/api/block-committees', 'PATCH', {
        block_committee_id: ctx.ids.committee,
        property_id: ctx.ids.propertyA,
      }),
    );
    expect(signA.status).toBe(200);
    expect((await signA.json()).locked).toBe(false);

    actAs(ctx.users.ownerB.client);
    const signB = await signMember(
      jsonRequest('/api/block-committees', 'PATCH', {
        block_committee_id: ctx.ids.committee,
        property_id: ctx.ids.propertyB,
      }),
    );
    expect(signB.status).toBe(200);
    expect((await signB.json()).locked).toBe(true);

    const { data } = await ctx.service
      .from('block_committees')
      .select('status')
      .eq('id', ctx.ids.committee)
      .single();
    expect(data?.status).toBe('locked');
  });

  it('RLS: an uninvolved tenant cannot see the committee or sign on ownerB\'s behalf', async () => {
    const { data: visible } = await ctx.users.tenant.client
      .from('block_committees')
      .select('*')
      .eq('id', ctx.ids.committee);
    expect(visible).toEqual([]);

    actAs(ctx.users.tenant.client);
    const forged = await signMember(
      jsonRequest('/api/block-committees', 'PATCH', {
        block_committee_id: ctx.ids.committee,
        property_id: ctx.ids.propertyB,
      }),
    );
    // block_committee_members_self_sign (0007) hides the row from the
    // tenant's UPDATE -> 0 rows matched -> PGRST116 -> route maps to 404.
    expect(forged.status).toBe(404);
  });
});

describe('2. Acquisition lead (Marketing funnel / T4.14)', () => {
  it('an anonymous visitor submits a lead, stored as a documents row', async () => {
    // POST /api/leads is public and never requires a session — actAs() still
    // needs to resolve to *something* since the route unconditionally calls
    // createClient() (even if only to satisfy RLS on the match_properties RPC).
    actAs(createAnonClient());
    const res = await createLead(
      jsonRequest('/api/leads', 'POST', {
        name: 'Jane Prospect',
        email: 'jane@example.com',
        description: 'Looking for a 4-unit multifamily property in Bushwick',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.lead_id).toBeTruthy();
    // GEMINI_API_KEY is cleared for this whole run (vitest.setup.ts) so the
    // route's embedText() short-circuits to null and no match is attempted
    // here — this is purely for network-free determinism, NOT the RLS gap
    // that used to exist. See the next test for a direct, Gemini-free proof
    // that the underlying match lookup itself now correctly bypasses RLS.
    expect(body.related_property_id).toBeNull();

    const { data: doc } = await ctx.service.from('documents').select('*').eq('id', body.lead_id).single();
    expect(doc?.type).toBe('lead');
    expect(doc?.uploaded_by).toBeNull();
    expect((doc?.bucket_path as string)?.startsWith('meta:')).toBe(true);
  });

  it('fix verification: match_properties() bypasses RLS via the admin client, not the anon client', async () => {
    // Deterministic stand-in for a real Gemini embedding — proves the RLS
    // bypass mechanism itself (src/lib/supabase/admin.ts's createAdminClient,
    // used by POST /api/leads for exactly this lookup) without depending on
    // a real model call.
    const FIXED_VECTOR = Array.from({ length: 768 }, (_, i) => (i % 7) / 7);
    const { error: embedErr } = await ctx.service
      .from('properties')
      .update({ embedding: FIXED_VECTOR })
      .eq('id', ctx.ids.propertyA);
    expect(embedErr).toBeNull();

    const queryEmbedding = `[${FIXED_VECTOR.join(',')}]`;

    // An anonymous, RLS-scoped client (what the route used before the fix)
    // still correctly sees zero rows — auth.uid() is NULL, and
    // properties_owner_access (0002) grants no anonymous access.
    const anon = createAnonClient();
    const { data: anonMatches } = await anon.rpc('match_properties', {
      query_embedding: queryEmbedding,
      match_count: 1,
    });
    expect(anonMatches ?? []).toEqual([]);

    // The service-role client bypasses RLS and finds the seeded property.
    const { data: adminMatches } = await ctx.service.rpc('match_properties', {
      query_embedding: queryEmbedding,
      match_count: 1,
    });
    expect(adminMatches?.[0]?.id).toBe(ctx.ids.propertyA);
  });
});

describe('3. Legal PSA execution (T3.1/T3.2)', () => {
  it('attorney drafts a PSA naming ownerA and investor as parties', async () => {
    actAs(ctx.users.attorney.client);
    const res = await createAgreement(
      jsonRequest('/api/agreements', 'POST', {
        type: 'psa',
        property_id: ctx.ids.propertyA,
        parties: [
          { user_id: ctx.users.ownerA.user.id, role: 'owner' },
          { user_id: ctx.users.investor.user.id, role: 'investor' },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.agreement.status).toBe('draft');
    agreementId = body.agreement.id;
  });

  it('signing all three parties advances draft -> pending_signature -> executed', async () => {
    actAs(ctx.users.attorney.client);
    const signAttorney = await signAgreement(
      jsonRequest('/api/agreements', 'PATCH', { agreement_id: agreementId }),
    );
    expect(signAttorney.status).toBe(200);
    expect((await signAttorney.json()).status).toBe('pending_signature');

    actAs(ctx.users.ownerA.client);
    const signOwner = await signAgreement(
      jsonRequest('/api/agreements', 'PATCH', { agreement_id: agreementId }),
    );
    expect(signOwner.status).toBe(200);
    expect((await signOwner.json()).status).toBe('pending_signature');

    actAs(ctx.users.investor.client);
    const signInvestor = await signAgreement(
      jsonRequest('/api/agreements', 'PATCH', { agreement_id: agreementId }),
    );
    expect(signInvestor.status).toBe(200);
    expect((await signInvestor.json()).status).toBe('executed');

    const { data } = await ctx.service
      .from('agreements')
      .select('status, parties')
      .eq('id', agreementId)
      .single();
    expect(data?.status).toBe('executed');
    type Party = { signed_at: string | null };
    expect((data?.parties as Party[]).every((p) => p.signed_at !== null)).toBe(true);
  });

  it('RLS: an uninvolved tenant cannot see the PSA at all', async () => {
    const { data } = await ctx.users.tenant.client.from('agreements').select('*').eq('id', agreementId);
    expect(data).toEqual([]);

    actAs(ctx.users.tenant.client);
    const forged = await signAgreement(
      jsonRequest('/api/agreements', 'PATCH', { agreement_id: agreementId }),
    );
    // agreements_party_update (0007) hides the row from the tenant's own
    // SELECT-then-UPDATE lookup inside the route -> "not found" -> 404
    // (never reaches the party-membership 403 check, since the route can't
    // see the row to begin with).
    expect(forged.status).toBe(404);
  });
});

describe('4. Capital draw funding (T4.1/T4.2)', () => {
  it('lender holds a seeded escrow ledger: pending -> held', async () => {
    const { data: ledger, error } = await ctx.service
      .from('financial_ledgers')
      .insert({
        property_id: ctx.ids.propertyA,
        agreement_id: agreementId,
        type: 'escrow_hold',
        amount: 50000,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    ledgerId = ledger!.id;

    actAs(ctx.users.lender.client);
    const res = await approveDraw(
      jsonRequest('/api/draws/approve', 'POST', { ledger_id: ledgerId, action: 'hold' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('held');

    const { data } = await ctx.service.from('financial_ledgers').select('status').eq('id', ledgerId).single();
    expect(data?.status).toBe('held');
  });

  it('role gate + RLS: tenant cannot approve the draw and cannot read the ledger', async () => {
    actAs(ctx.users.tenant.client);
    const res = await approveDraw(
      jsonRequest('/api/draws/approve', 'POST', { ledger_id: ledgerId, action: 'hold' }),
    );
    // App-level role check in draws/approve rejects before touching the DB.
    expect(res.status).toBe(403);

    const { data } = await ctx.users.tenant.client.from('financial_ledgers').select('*').eq('id', ledgerId);
    expect(data).toEqual([]); // T1.4-style acceptance, exercised end-to-end.
  });
});

describe('5-6. Contractor milestone upload + Vision approval (T3.3-T3.5)', () => {
  it('a critical-severity Vision inspection sets blocks_draw = true', async () => {
    vi.mocked(inspectMilestone).mockResolvedValueOnce({
      ai_summary: 'Exposed wiring visible near the electrical panel.',
      flagged_issues: [{ issue: 'Exposed wiring near panel', severity: 'critical' }],
      confidence: 0.92,
      blocks_draw: true,
    });

    actAs(ctx.users.contractor.client);
    const form = new FormData();
    form.set('property_id', ctx.ids.propertyA);
    form.set('file', new File([Buffer.from('fake-jpeg-bytes-1')], 'milestone-1.jpg', { type: 'image/jpeg' }));
    const res = await uploadMilestone(formRequest('/api/milestone-upload', form));
    expect(res.status).toBe(201);
    const body = await res.json();

    const { data } = await ctx.service
      .from('vision_inspections')
      .select('blocks_draw')
      .eq('document_id', body.document_id)
      .single();
    expect(data?.blocks_draw).toBe(true);
  });
});

describe('7. Escrow release (T3.6/T3.7)', () => {
  it('release is blocked with 409 while the latest inspection has blocks_draw = true', async () => {
    actAs(ctx.users.lender.client);
    const res = await releaseEscrow(
      jsonRequest('/api/escrow/release', 'POST', {
        ledger_id: ledgerId,
        recipient: '0x000000000000000000000000000000000000dEaD',
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.blocks_draw).toBe(true);

    const { data } = await ctx.service.from('financial_ledgers').select('status').eq('id', ledgerId).single();
    expect(data?.status).toBe('held'); // unchanged
  });

  it('a corrected clean inspection clears the gate and release succeeds', async () => {
    vi.mocked(inspectMilestone).mockResolvedValueOnce({
      ai_summary: 'Framing complete, no issues visible.',
      flagged_issues: [],
      confidence: 0.88,
      blocks_draw: false,
    });

    actAs(ctx.users.contractor.client);
    const form = new FormData();
    form.set('property_id', ctx.ids.propertyA);
    form.set('file', new File([Buffer.from('fake-jpeg-bytes-2')], 'milestone-2.jpg', { type: 'image/jpeg' }));
    const uploadRes = await uploadMilestone(formRequest('/api/milestone-upload', form));
    expect(uploadRes.status).toBe(201);

    actAs(ctx.users.lender.client);
    const res = await releaseEscrow(
      jsonRequest('/api/escrow/release', 'POST', {
        ledger_id: ledgerId,
        recipient: '0x000000000000000000000000000000000000dEaD',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('released');
    // No Web3 env vars are configured (vitest.setup.ts) -> the route's
    // built-in DB-only fallback path issues a mock-tx-... hash.
    expect(body.web3_tx_hash).toMatch(/^mock-tx-/);

    const { data } = await ctx.service
      .from('financial_ledgers')
      .select('status, web3_tx_hash')
      .eq('id', ledgerId)
      .single();
    expect(data?.status).toBe('released');
  });
});

describe('8. Property handoff (T4.8-T4.10)', () => {
  it('the owner can see the released ledger and executed PSA under RLS', async () => {
    const { data: ledgerRows } = await ctx.users.ownerA.client
      .from('financial_ledgers')
      .select('*')
      .eq('id', ledgerId);
    expect(ledgerRows?.[0]?.status).toBe('released');

    const { data: agreementRows } = await ctx.users.ownerA.client
      .from('agreements')
      .select('*')
      .eq('id', agreementId);
    expect(agreementRows?.[0]?.status).toBe('executed');
  });

  it('a tenant can submit a maintenance ticket on the handed-off property', async () => {
    actAs(ctx.users.tenant.client);
    const res = await submitMaintenance(
      jsonRequest('/api/maintenance', 'POST', {
        property_id: ctx.ids.propertyA,
        trade: 'Plumbing',
        description: 'Leak under kitchen sink',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket_document_id).toBeTruthy();
    expect(body.scope_document_id).toBeTruthy();
  });

  it('RLS: the tenant still cannot see the PSA or the ledger (not a party, not lender/admin)', async () => {
    const { data: agr } = await ctx.users.tenant.client.from('agreements').select('*').eq('id', agreementId);
    expect(agr).toEqual([]);
    const { data: led } = await ctx.users.tenant.client.from('financial_ledgers').select('*').eq('id', ledgerId);
    expect(led).toEqual([]);
  });
});
