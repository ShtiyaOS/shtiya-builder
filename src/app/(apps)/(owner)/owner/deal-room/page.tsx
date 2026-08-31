import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { DealRoomFeed } from '@/components/apps/owner/DealRoomFeed';
import type { DealRoomEvent } from '../pulse/usePulseChannel';

const EVENTS_FETCH_LIMIT = 50;

// ── Mock data (dev fallback, same seeded id as owner/block/[id]'s MOCK_COMMITTEE) ──
const MOCK_COMMITTEE_NAME = 'Lenox Ave Block Assembly';
const MOCK_EVENTS: DealRoomEvent[] = [
  {
    id: 'evt-mock-1',
    block_committee_id: 'mock-committee-1',
    event_type: 'member_joined',
    payload: { property_id: 'prop-2', owner_name: 'Diane Carter' },
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 'evt-mock-2',
    block_committee_id: 'mock-committee-1',
    event_type: 'bid_placed',
    payload: { amount_usd: 4_200_000, bidder: 'Northside Capital Partners' },
    created_at: new Date(Date.now() - 1_800_000).toISOString(),
  },
  {
    id: 'evt-mock-3',
    block_committee_id: 'mock-committee-1',
    event_type: 'draw_status_changed',
    payload: { status: 'released', ledger_id: 'ledger-mock-1' },
    created_at: new Date(Date.now() - 600_000).toISOString(),
  },
];

interface PageProps {
  searchParams: Promise<{ committee?: string }>;
}

/**
 * Pulse Realtime Deal-Room (T5.4) — makes the Pulse agent's broadcasts
 * visible to committee members/investors: members joining, bids placed,
 * draw status changing, all live without a page refresh.
 *
 * Server pre-fetches the last 50 `deal_room_events` for `?committee=<id>`
 * through the normal RLS-scoped client — `deal_room_events_member_access`
 * (0002_rls_policies.sql) already restricts this to committee members and
 * admins, so a caller without access simply gets zero rows back rather than
 * an explicit 403 (same non-leaky posture as GET /api/vision-inspections
 * from T5.3). `DealRoomFeed` then layers the live Realtime subscription on
 * top via the existing `usePulseChannel` hook.
 */
export default async function DealRoomPage({ searchParams }: PageProps) {
  const { committee: committeeId } = await searchParams;
  if (!committeeId) redirect('/owner');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let committeeName = MOCK_COMMITTEE_NAME;
  let events: DealRoomEvent[] = MOCK_EVENTS;

  if (user) {
    const { data: committeeRow } = await supabase
      .from('block_committees')
      .select('id, name')
      .eq('id', committeeId)
      .single();

    if (!committeeRow) {
      // Real DB is available but the committee doesn't exist (or RLS hid
      // it) — except for the seeded mock id, which keeps working in dev.
      if (committeeId !== 'mock-committee-1') notFound();
    } else {
      committeeName = committeeRow.name;

      const { data: eventRows } = await supabase
        .from('deal_room_events')
        .select('id, block_committee_id, event_type, payload, created_at')
        .eq('block_committee_id', committeeId)
        .order('created_at', { ascending: false })
        .limit(EVENTS_FETCH_LIMIT);

      events = (eventRows ?? []) as DealRoomEvent[];
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/owner/block/${committeeId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to committee
      </Link>

      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">{committeeName}</h1>
          <p className="text-sm text-gray-500">Live deal-room activity</p>
        </div>
      </div>

      <DealRoomFeed committeeId={committeeId} initialEvents={events} />
    </div>
  );
}
