import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser, resolveAppUser } from '@/lib/api/guards';

/**
 * POST /api/legal/gig/submit — the provider records a service attempt.
 *
 * -- I-L16: provenance gates acceptance, never money. This route touches
 * gig_releases and escrow NOWHERE. A submission is a claim about what happened
 * in the world; it becomes payable only after a notarized affidavit is accepted
 * by counsel of record, and gig_release_guard enforces that independently.
 *
 * -- I-L17: the capture nonce is single-use and is consumed here, before the
 * attempt row is written. The consume is a conditional UPDATE (… WHERE
 * consumed_at IS NULL) so two concurrent submissions cannot both spend it —
 * checking then writing would leave exactly that race open.
 *
 * The verification columns (attestation_verified, geofence_verified,
 * verified_at) are deliberately NOT set from this request. They are written by
 * the verification pipeline. A provider who can assert their own geofence
 * result has not been geofenced.
 */

const GigSubmitSchema = z.object({
  gig_id:              z.string().uuid(),
  nonce:               z.string().uuid(),
  storage_path:        z.string().min(1),
  attestation_token:   z.string().min(1),
  perceptual_hash:     z.string().min(1),
  reported_lat:        z.number().min(-90).max(90).optional(),
  reported_lng:        z.number().min(-180).max(180).optional(),
  reported_accuracy_m: z.number().nonnegative().optional(),
  client_captured_at:  z.string().datetime().optional(),
});

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
  const parsed = GigSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST', detail: parsed.error.format() }, { status: 400 });
  }
  const {
    gig_id, nonce, storage_path, attestation_token, perceptual_hash,
    reported_lat, reported_lng, reported_accuracy_m, client_captured_at,
  } = parsed.data;

  const caller = await resolveAppUser(authUser.id, supabase);
  if (!caller) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 403 });

  const { data: posting } = await supabase
    .from('legal_gig_postings')
    .select('id, matter_id, assigned_to_user_id, max_attempts, state')
    .eq('id', gig_id)
    .maybeSingle();

  if (!posting) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Only the assigned provider submits. No wall check here: the provider is not
  // reading matter content, and a wall on the assigning attorney is not a wall
  // on the process server they engaged.
  if (posting.assigned_to_user_id !== caller.id) {
    return NextResponse.json({ error: 'NOT_ASSIGNED_PROVIDER' }, { status: 403 });
  }

  // -- I-L17: validate the nonce before spending it, so the caller gets a
  // precise reason, then spend it atomically.
  const { data: nonceRow } = await supabase
    .from('gig_capture_nonces')
    .select('nonce, gig_id, issued_to, expires_at, consumed_at')
    .eq('nonce', nonce)
    .maybeSingle();

  if (!nonceRow || nonceRow.gig_id !== gig_id || nonceRow.issued_to !== caller.id) {
    return NextResponse.json({ error: 'NONCE_INVALID' }, { status: 403 });
  }
  if (nonceRow.consumed_at) {
    return NextResponse.json({ error: 'NONCE_CONSUMED' }, { status: 403 });
  }
  if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'NONCE_EXPIRED' }, { status: 403 });
  }

  const { data: consumed, error: consumeErr } = await supabase
    .from('gig_capture_nonces')
    .update({ consumed_at: new Date().toISOString(), consumed_by: caller.id })
    .eq('nonce', nonce)
    .is('consumed_at', null)          // -- I-L17: single-use, race-free
    .select('nonce');

  if (consumeErr || !consumed || consumed.length === 0) {
    return NextResponse.json({ error: 'NONCE_CONSUMED' }, { status: 403 });
  }

  // Attempt numbering, capped by the posting's own max_attempts.
  const { count } = await supabase
    .from('legal_service_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('gig_id', gig_id);

  const attemptIndex = (count ?? 0) + 1;
  if (attemptIndex > (posting.max_attempts ?? 3)) {
    return NextResponse.json({ error: 'MAX_ATTEMPTS_EXCEEDED' }, { status: 422 });
  }

  const { data: attempt, error: attemptErr } = await supabase
    .from('legal_service_attempts')
    .insert({
      gig_id,
      attempt_index:       attemptIndex,
      submitted_by:        caller.id,
      nonce,
      storage_path,
      attestation_token,
      perceptual_hash,
      reported_lat:        reported_lat        ?? null,
      reported_lng:        reported_lng        ?? null,
      reported_accuracy_m: reported_accuracy_m ?? null,
      client_captured_at:  client_captured_at  ?? null,
      // attestation_verified / geofence_verified / verified_at stay NULL —
      // the verification pipeline writes them, not the submitter.
    })
    .select('id')
    .single();

  if (attemptErr || !attempt) {
    return NextResponse.json(
      { error: 'SUBMIT_FAILED', detail: attemptErr?.message ?? null }, { status: 500 });
  }

  await supabase
    .from('legal_gig_postings')
    .update({ state: 'attempt_submitted' })
    .eq('id', gig_id);

  // -- I-L16: no escrow, no release, no money. Acceptance is a later, separate act.
  return NextResponse.json(
    { attempt_id: attempt.id, attempt_index: attemptIndex, status: 'attempt_submitted' },
    { status: 202, headers: { 'X-Request-Id': requestId } },
  );
}
