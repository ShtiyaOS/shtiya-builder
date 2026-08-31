import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/vision-inspections?id=<uuid>
 *
 * Polling endpoint for the Vision AI Sandbox (T5.3) — `InspectionResult`
 * calls this every 3 seconds after upload until `blocks_draw` comes back
 * non-null (i.e. the inspection row exists at all; `blocks_draw` is a
 * `not null` column so any returned row already has a final value).
 *
 * Uses the normal RLS-scoped client, not the service-role client — access
 * is governed entirely by `vision_inspections_scoped` (0002_rls_policies.sql):
 * the submitting contractor, the property owner, lender, or admin. Anyone
 * else gets a 404, not a 403, so the endpoint doesn't confirm whether a
 * given inspection id exists to a caller who isn't allowed to see it.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: '`id` query parameter is required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vision_inspections')
    .select('id, document_id, property_id, contractor_id, ai_summary, flagged_issues, confidence, blocks_draw, created_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 });
  }

  return NextResponse.json(data);
}
