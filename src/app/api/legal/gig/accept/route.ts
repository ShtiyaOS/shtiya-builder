import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedUser,
  resolveAppUser,
  requireMatterParty,
  requireWallClear,
} from '@/lib/api/guards';

/**
 * POST /api/legal/gig/accept — counsel of record accepts (or refuses) a
 * notarized service affidavit.
 *
 * -- I-L16: this is the hinge. Provenance gates acceptance, and acceptance is
 * what unlocks the service tranche. The order is load-bearing: acceptance is
 * written FIRST, then the release is attempted, because gig_release_guard reads
 * legal_service_affidavits.accepted_by and refuses a release that no one has
 * accepted. Releasing first and recording acceptance after would invert the
 * invariant into a formality.
 *
 * -- I-L21: escrow may never be sourced from the trust ledger. The column
 * constraint already makes 'trust_ledger' unrepresentable
 * (funding_source ∈ operating | client_advance); this route asserts it anyway,
 * so the invariant survives a future widening of that CHECK.
 *
 * Only the SERVICE tranche is released here. 'attempt' is payable on a verified
 * attempt regardless of outcome, and 'reserve' additionally requires the
 * affidavit to be filed with the court with any traverse resolved — neither is
 * an acceptance decision, and both are guarded separately.
 */

const GigAcceptSchema = z.object({
  gig_id:       z.string().uuid(),
  affidavit_id: z.string().uuid(),
  action:       z.enum(['accept', 'reject']),
  reason:       z.string().max(500).optional(),
});

// -- I-L16: counsel of record. matter_parties.party_role is the live column and
// its CHECK has no 'lead_counsel' value; the counsel roles it does have are
// these two.
const COUNSEL_ROLES = ['attorney', 'co_counsel'];

// -- I-L21: the only funding sources escrow may draw on.
const PERMITTED_FUNDING_SOURCES = ['operating', 'client_advance'];

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const supabase  = createAdminClient();

  const authUser = await getAuthenticatedUser(req, supabase);
  if (!authUser) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = GigAcceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST', detail: parsed.error.format() }, { status: 400 });
  }
  const { gig_id, affidavit_id, action } = parsed.data;

  const caller = await resolveAppUser(authUser.id, supabase);
  if (!caller) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 403 });

  const { data: posting } = await supabase
    .from('legal_gig_postings')
    .select('id, matter_id, service_fee_cents, reserve_bps, funding_source, escrow_intent_id, state')
    .eq('id', gig_id)
    .maybeSingle();

  if (!posting) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const wallBlock = await requireWallClear(caller.id, posting.matter_id, requestId, supabase);
  if (wallBlock) return wallBlock;
  const partyBlock = await requireMatterParty(caller.id, posting.matter_id, requestId, supabase);
  if (partyBlock) return partyBlock;

  const { data: mp } = await supabase
    .from('matter_parties')
    .select('party_role')
    .eq('matter_id', posting.matter_id)
    .eq('user_id', caller.id)
    .maybeSingle();

  const role = (mp as { party_role: string } | null)?.party_role;
  if (!role || !COUNSEL_ROLES.includes(role)) {
    return NextResponse.json({ error: 'NOT_COUNSEL_OF_RECORD' }, { status: 403 });  // -- I-L16
  }

  if (action === 'reject') {
    await supabase.from('legal_gig_postings').update({ state: 'disputed' }).eq('id', gig_id);
    return NextResponse.json(
      { status: 'rejected', released_cents: 0 },
      { status: 200, headers: { 'X-Request-Id': requestId } },
    );
  }

  // ---- accept ----
  const { data: affidavit } = await supabase
    .from('legal_service_affidavits')
    .select('id, gig_id, notary_verified_at, accepted_by')
    .eq('id', affidavit_id)
    .maybeSingle();

  if (!affidavit || affidavit.gig_id !== gig_id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!affidavit.notary_verified_at) {
    return NextResponse.json({ error: 'AFFIDAVIT_NOT_VERIFIED' }, { status: 422 });
  }
  if (affidavit.accepted_by) {
    return NextResponse.json({ error: 'ALREADY_ACCEPTED' }, { status: 409 });
  }

  // -- I-L21
  if (!PERMITTED_FUNDING_SOURCES.includes(posting.funding_source)) {
    return NextResponse.json({ error: 'TRUST_LEDGER_ESCROW_FORBIDDEN' }, { status: 422 });
  }

  const { error: acceptErr } = await supabase
    .from('legal_service_affidavits')
    .update({ accepted_by: caller.id, accepted_at: new Date().toISOString() })
    .eq('id', affidavit_id);

  if (acceptErr) {
    return NextResponse.json(
      { error: 'ACCEPT_FAILED', detail: acceptErr.message ?? null }, { status: 500 });
  }

  await supabase.from('legal_gig_postings').update({ state: 'accepted' }).eq('id', gig_id);

  // Service tranche = fee less the withheld reserve.
  const serviceFee    = Number(posting.service_fee_cents ?? 0);
  const reserveBps    = Number(posting.reserve_bps ?? 0);
  const reserveCents  = Math.floor((serviceFee * reserveBps) / 10_000);
  const releaseCents  = serviceFee - reserveCents;

  const { error: releaseErr } = await supabase
    .from('gig_releases')
    .insert({
      gig_id,
      tranche:      'service',
      amount_cents: releaseCents,
      basis:        'affidavit accepted by counsel of record',
      intent_id:    posting.escrow_intent_id ?? null,
    });

  if (releaseErr) {
    const msg = releaseErr.message ?? '';
    const mapped =
      msg.includes('PROVENANCE_UNVERIFIED') ? 'PROVENANCE_UNVERIFIED' :
      msg.includes('AFFIDAVIT_REQUIRED')    ? 'AFFIDAVIT_NOT_VERIFIED' :
      msg.includes('ACCEPTANCE')            ? 'ACCEPTANCE_INVALID' :
      msg.includes('PROVIDER_NOT_ELIGIBLE') ? 'LICENCE_MISMATCH' :
      'RELEASE_FAILED';
    // Acceptance stands; the money did not move. That is the correct pair of
    // outcomes — the affidavit really was accepted, and the guard really did
    // refuse the release.
    return NextResponse.json(
      { error: mapped, detail: msg, accepted: true, released_cents: 0 },
      { status: 422, headers: { 'X-Request-Id': requestId } },
    );
  }

  return NextResponse.json(
    {
      status:         'accepted',
      released_cents: releaseCents,
      reserve_held_cents: reserveCents,
    },
    { status: 200, headers: { 'X-Request-Id': requestId } },
  );
}
