import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/connections
 * Investor sends a connection request to an owner.
 *
 * Body: { owner_id: string, message?: string }
 *
 * Rules enforced here (beyond RLS):
 * - Caller must have role = 'investor'
 * - owner_id must resolve to a user with role = 'owner'
 * - A pending or accepted connection already exists → 409
 * - A declined connection exists → 409 with a specific message
 *   (re-request after 30 days is a future feature; blocked for now)
 *
 * PATCH /api/connections
 * Owner accepts or declines an incoming request.
 * Investor withdraws their own pending request.
 *
 * Body: { connection_id: string, status: 'accepted' | 'declined' | 'withdrawn' }
 *
 * RLS WITH CHECK on investor_owner_connections enforces that:
 * - Only the investor can set status = 'withdrawn' on their own row
 * - Only the owner can set status = 'accepted' | 'declined' on their incoming row
 * The route re-validates this in application code as a belt-and-suspenders check.
 */

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Confirm caller is an investor
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'investor') {
    return NextResponse.json({ error: 'Only investors may send connection requests.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { owner_id, message } = body ?? {};
  if (!owner_id) {
    return NextResponse.json({ error: '`owner_id` is required.' }, { status: 400 });
  }

  // Confirm target is an owner
  const { data: target } = await supabase
    .from('users')
    .select('role')
    .eq('id', owner_id)
    .single();
  if (target?.role !== 'owner') {
    return NextResponse.json({ error: 'Target user is not an owner.' }, { status: 400 });
  }

  // Check for an existing connection record (any status)
  const { data: existing } = await supabase
    .from('investor_owner_connections')
    .select('id, status')
    .eq('investor_id', user.id)
    .eq('owner_id', owner_id)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'accepted') {
      return NextResponse.json({ error: 'You are already connected to this owner.' }, { status: 409 });
    }
    if (existing.status === 'requested') {
      return NextResponse.json({ error: 'A connection request is already pending.' }, { status: 409 });
    }
    if (existing.status === 'declined') {
      return NextResponse.json({ error: 'This owner has declined your request.' }, { status: 409 });
    }
    // withdrawn — delete the old record and allow a new one
    await supabase.from('investor_owner_connections').delete().eq('id', existing.id);
  }

  const { data, error } = await supabase
    .from('investor_owner_connections')
    .insert({ investor_id: user.id, owner_id, message: message ?? null })
    .select('id, status, requested_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { connection_id, status } = body ?? {};

  if (!connection_id || !status) {
    return NextResponse.json({ error: '`connection_id` and `status` are required.' }, { status: 400 });
  }
  if (!['accepted', 'declined', 'withdrawn'].includes(status)) {
    return NextResponse.json({ error: '`status` must be accepted, declined, or withdrawn.' }, { status: 400 });
  }

  // Fetch the existing record — RLS SELECT policies ensure only the investor
  // or owner involved can see it.
  const { data: connection } = await supabase
    .from('investor_owner_connections')
    .select('id, investor_id, owner_id, status')
    .eq('id', connection_id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
  }
  if (connection.status !== 'requested') {
    return NextResponse.json({ error: 'Only pending requests can be updated.' }, { status: 409 });
  }

  // Belt-and-suspenders: confirm the caller is the correct party for the
  // requested transition (RLS WITH CHECK enforces this at DB level too).
  if (status === 'withdrawn' && connection.investor_id !== user.id) {
    return NextResponse.json({ error: 'Only the investor can withdraw a request.' }, { status: 403 });
  }
  if (['accepted', 'declined'].includes(status) && connection.owner_id !== user.id) {
    return NextResponse.json({ error: 'Only the owner can accept or decline a request.' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('investor_owner_connections')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', connection_id)
    .select('id, status, resolved_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
