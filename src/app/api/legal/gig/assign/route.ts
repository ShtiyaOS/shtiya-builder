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
 * POST /api/legal/gig/assign — assign a provider to a legal gig posting.
 *
 * WHICH GIG RAIL THIS TARGETS
 * ---------------------------
 * The database carries two gig schemas. The task spec names the 1054 baseline
 * (gig_jobs / gig_assignments / gig_submissions / gig_escrow); this route uses
 * the Legal Workspace rail (legal_gig_postings / gig_capture_nonces /
 * legal_service_attempts / legal_service_affidavits / gig_releases) instead,
 * because that is the one the invariants are attached to:
 *
 *   legal_gig_postings  → gig_assignment_guard (I-L19 eligibility, self-dealing)
 *                       → gig_funding_guard    (I-L21 frozen terms)
 *   gig_releases        → gig_release_guard    (I-L16 provenance gates money)
 *
 * The 1054 tables carry NO triggers at all. Routing the legal gig flow through
 * them would satisfy the spec's column names and bypass every guard the Legal
 * Workspace migrations exist to enforce.
 *
 * Nothing authorization-relevant is read from the request body. gig_type,
 * service_jurisdiction and matter_id all come off the posting row — a
 * jurisdiction supplied by the caller is a licence check chosen by the caller.
 */

const GigAssignSchema = z.object({
  gig_id:      z.string().uuid(),
  provider_id: z.string().uuid(),
  device_id:   z.string().min(1).max(200),
  /** Capture-nonce lifetime. Server-clamped; a caller-chosen TTL is not a TTL. */
  nonce_ttl_minutes: z.number().int().min(1).max(240).optional(),
});

const DEFAULT_NONCE_TTL_MINUTES = 120;

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
  const parsed = GigAssignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST', detail: parsed.error.format() }, { status: 400 });
  }
  const { gig_id, provider_id, device_id, nonce_ttl_minutes } = parsed.data;

  const caller = await resolveAppUser(authUser.id, supabase);
  if (!caller) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 403 });

  // The posting is the source of truth for matter, type and jurisdiction.
  const { data: posting } = await supabase
    .from('legal_gig_postings')
    .select('id, matter_id, gig_type, service_jurisdiction, state, assigned_to_user_id, posted_by_user_id, funding_source')
    .eq('id', gig_id)
    .maybeSingle();

  if (!posting) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Wall first, then party — both existence-protected (I-L11, I-L12).
  const wallBlock = await requireWallClear(caller.id, posting.matter_id, requestId, supabase);
  if (wallBlock) return wallBlock;
  const partyBlock = await requireMatterParty(caller.id, posting.matter_id, requestId, supabase);
  if (partyBlock) return partyBlock;

  if (posting.assigned_to_user_id) {
    return NextResponse.json({ error: 'ALREADY_ASSIGNED' }, { status: 409 });
  }

  // -- I-L19: licensure is checked against the POSTING's type and jurisdiction.
  // gig_provider_eligible() also verifies standing, expiry, reverify_due and
  // bond currency — the professional_licences table the spec queries has no
  // standing or jurisdiction column at all.
  const { data: eligible, error: eligErr } = await supabase.rpc('gig_provider_eligible', {
    p_user:         provider_id,
    p_type:         posting.gig_type,
    p_jurisdiction: posting.service_jurisdiction,
  });
  if (eligErr || eligible !== true) {
    return NextResponse.json({ error: 'LICENCE_MISMATCH' }, { status: 422 });   // -- I-L19
  }

  // -- I-L20: a per-diem or process-server seat on a matter must expire. An
  // open-ended matter_parties row is a permanent grant issued for one errand.
  const { data: mp } = await supabase
    .from('matter_parties')
    .select('expires_at, status')
    .eq('matter_id', posting.matter_id)
    .eq('user_id', provider_id)
    .maybeSingle();

  if (!mp) return NextResponse.json({ error: 'PROVIDER_NOT_ON_MATTER' }, { status: 422 });
  if (!mp.expires_at) {
    return NextResponse.json({ error: 'EXPIRY_REQUIRED' }, { status: 422 });    // -- I-L20
  }

  // -- I-L17: one capture nonce, bound to gig + provider + device, with a
  // server-set expiry. legal_service_attempts.nonce is an FK onto this row, so
  // an attempt that never received a nonce cannot be recorded at all.
  const ttl = nonce_ttl_minutes ?? DEFAULT_NONCE_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();

  const { data: nonceRow, error: nonceErr } = await supabase
    .from('gig_capture_nonces')
    .insert({ gig_id, issued_to: provider_id, device_id, expires_at: expiresAt })
    .select('nonce, expires_at')
    .single();

  if (nonceErr || !nonceRow) {
    return NextResponse.json(
      { error: 'NONCE_ERROR', detail: nonceErr?.message ?? null }, { status: 500 });
  }

  // The assignment itself. gig_assignment_guard re-runs eligibility and refuses
  // self-dealing (same natural person, or a shared firm seat) on this update.
  const { error: assignErr } = await supabase
    .from('legal_gig_postings')
    .update({
      assigned_to_user_id: provider_id,
      assigned_at:         new Date().toISOString(),
      state:               'assigned',
    })
    .eq('id', gig_id);

  if (assignErr) {
    const selfDealing = assignErr.message?.includes('SELF_DEALING');
    const notEligible = assignErr.message?.includes('PROVIDER_NOT_ELIGIBLE');
    return NextResponse.json(
      {
        error:  selfDealing ? 'SELF_DEALING' : notEligible ? 'LICENCE_MISMATCH' : 'ASSIGN_FAILED',
        detail: assignErr.message ?? null,
      },
      { status: selfDealing || notEligible ? 422 : 500 },
    );
  }

  // The nonce is returned once, here. It is stored in the clear because
  // legal_service_attempts FKs onto it; possession is scoped by the RLS on
  // gig_capture_nonces, not by secrecy of the value in this response.
  return NextResponse.json(
    {
      gig_id,
      provider_id,
      capture_nonce:     nonceRow.nonce,
      nonce_expires_at:  nonceRow.expires_at,
      state:             'assigned',
    },
    { status: 201, headers: { 'X-Request-Id': requestId } },
  );
}
