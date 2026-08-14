import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/block-committees
 *
 * Invite a neighbor by inserting a block_committee_members row with
 * status = 'invited'. The caller must be authenticated.
 *
 * Body: {
 *   block_committee_id: string   — uuid of the target committee
 *   property_id:        string   — uuid of the neighbor's property
 *   user_id:            string   — uuid of the invited user
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { block_committee_id, property_id, user_id } = body ?? {};

  if (!block_committee_id || !property_id || !user_id) {
    return NextResponse.json(
      { error: 'block_committee_id, property_id, and user_id are required' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('block_committee_members')
    .insert({
      block_committee_id,
      property_id,
      user_id,
      status: 'invited',
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation (member already exists for this committee+property)
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This property is already part of the committee.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data }, { status: 201 });
}

/**
 * PATCH /api/block-committees
 *
 * Sign the intent agreement for a committee member. Sets status = 'signed'
 * and signed_at = now(). After signing, checks whether the committee has
 * reached its target_member_count; if so, flips block_committees.status
 * to 'locked'.
 *
 * Body: {
 *   block_committee_id: string   — uuid of the committee
 *   property_id:        string   — uuid of the member's property
 * }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { block_committee_id, property_id } = body ?? {};

  if (!block_committee_id || !property_id) {
    return NextResponse.json(
      { error: 'block_committee_id and property_id are required' },
      { status: 400 },
    );
  }

  // 1. Sign the member row.
  const { data: member, error: memberError } = await supabase
    .from('block_committee_members')
    .update({ status: 'signed', signed_at: new Date().toISOString() })
    .eq('block_committee_id', block_committee_id)
    .eq('property_id', property_id)
    .select()
    .single();

  if (memberError) {
    if (memberError.code === 'PGRST116') {
      // PostgREST: no rows matched (member not found or already signed)
      return NextResponse.json(
        { error: 'Member not found for this committee and property.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // 2. Count signed members and compare to the committee's target.
  const { data: committee, error: committeeError } = await supabase
    .from('block_committees')
    .select('target_member_count, status')
    .eq('id', block_committee_id)
    .single();

  if (committeeError || !committee) {
    // Non-fatal: the sign succeeded; we just couldn't check the threshold.
    return NextResponse.json({ member, locked: false }, { status: 200 });
  }

  const { count: signedCount, error: countError } = await supabase
    .from('block_committee_members')
    .select('*', { count: 'exact', head: true })
    .eq('block_committee_id', block_committee_id)
    .eq('status', 'signed');

  if (countError) {
    return NextResponse.json({ member, locked: false }, { status: 200 });
  }

  const targetReached =
    committee.status !== 'locked' &&
    signedCount !== null &&
    signedCount >= committee.target_member_count;

  let locked = false;
  if (targetReached) {
    const { error: lockError } = await supabase
      .from('block_committees')
      .update({ status: 'locked' })
      .eq('id', block_committee_id);

    if (!lockError) {
      locked = true;
    }
  }

  // 4. Emit a deal_room_events row so Realtime subscribers receive the update
  //    within ~2 seconds without a page refresh (Agentic: Pulse).
  await supabase.from('deal_room_events').insert({
    block_committee_id,
    event_type: 'member_signed',
    payload: {
      property_id,
      signed_at: member.signed_at,
      locked,
    },
  });

  return NextResponse.json({ member, locked }, { status: 200 });
}
