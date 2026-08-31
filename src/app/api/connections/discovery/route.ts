import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/connections/discovery
 *
 * Returns owner properties visible to an investor, enriched with the
 * investor's current connection status for each property's owner.
 *
 * Public fields only: id, address, bbl, owner_id — no financials, no
 * documents, no violations. Full data unlocks only after status = 'accepted'.
 *
 * RLS: the new `properties_investor_discovery` policy (migration 0010)
 * allows investors to SELECT from properties. The explicit column list here
 * (not SELECT *) enforces the public-fields-only contract at the query level.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'investor' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only investors may use the discovery feed.' }, { status: 403 });
  }

  // Fetch public property fields only
  const { data: props, error: propsErr } = await supabase
    .from('properties')
    .select('id, address, bbl, owner_id')
    .order('created_at', { ascending: false })
    .limit(200);

  if (propsErr) return NextResponse.json({ error: propsErr.message }, { status: 500 });

  // Fetch this investor's connection records in one query
  const { data: connections } = await supabase
    .from('investor_owner_connections')
    .select('id, owner_id, status')
    .eq('investor_id', user.id);

  // Build a lookup: owner_id → { connection_id, status }
  const connByOwner = new Map<string, { id: string; status: string }>(
    (connections ?? []).map((c) => [c.owner_id, { id: c.id, status: c.status }]),
  );

  const result = (props ?? []).map((p) => {
    const conn = connByOwner.get(p.owner_id);
    return {
      id: p.id,
      address: p.address,
      bbl: p.bbl,
      owner_id: p.owner_id,
      connection_status: (conn?.status ?? 'none') as string,
      connection_id: conn?.id ?? null,
    };
  });

  return NextResponse.json(result);
}
