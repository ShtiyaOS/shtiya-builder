'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ViolationFeed } from './ViolationFeed';
import { VisionQueue } from './VisionQueue';
import { SentinelPanel } from './SentinelPanel';
import { PulseFeed } from './PulseFeed';
import { MatchLog } from './MatchLog';
import type {
  ComplianceCheckRow,
  DealRoomEventRow,
  MatchedLeadRow,
  ViolationRow,
  VisionInspectionRow,
} from './types';

const VIOLATIONS_CAP = 100;
const EVENTS_CAP = 100;

interface AgentCommandCenterProps {
  initialViolations: ViolationRow[];
  initialInspections: VisionInspectionRow[];
  initialCompliance: ComplianceCheckRow[];
  initialEvents: DealRoomEventRow[];
  initialLeads: MatchedLeadRow[];
}

/**
 * AgentCommandCenter
 *
 * Admin-only dashboard composing all 5 agent panels (Watchdog, Vision,
 * Sentinel, Pulse, Match). Server-fetched initial data is passed in as
 * props to avoid a fetch waterfall on first paint; this component then
 * layers live Supabase Realtime subscriptions on top of the two feeds that
 * matter most for "is anything happening right now" — `violations`
 * (Watchdog) and `deal_room_events` (Pulse). Both tables are already in the
 * `supabase_realtime` publication (0003/0004) and both have an
 * admin-inclusive RLS SELECT policy, so this browser-client subscription
 * (running as the signed-in admin's own session) receives every row
 * regardless of which property/committee it belongs to.
 */
export function AgentCommandCenter({
  initialViolations,
  initialInspections,
  initialCompliance,
  initialEvents,
  initialLeads,
}: AgentCommandCenterProps) {
  const [violations, setViolations] = useState(initialViolations);
  const [events, setEvents] = useState(initialEvents);

  // Inspections, compliance, and leads are refreshed on full page load only —
  // no realtime requirement was called for on those three panels.
  const [inspections] = useState(initialInspections);
  const [compliance] = useState(initialCompliance);
  const [leads] = useState(initialLeads);

  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel('office:command-center')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'violations' },
        async (payload) => {
          const row = payload.new as {
            id: string;
            property_id: string | null;
            source: string;
            external_id: string;
            description: string | null;
            issued_date: string | null;
            status: string;
            created_at: string;
          };

          let address: string | null = null;
          if (row.property_id) {
            const { data } = await supabase
              .from('properties')
              .select('address')
              .eq('id', row.property_id)
              .single();
            address = (data as { address?: string } | null)?.address ?? null;
          }

          setViolations((prev) =>
            [
              {
                id: row.id,
                property_id: row.property_id,
                property_address: address,
                source: row.source,
                external_id: row.external_id,
                description: row.description,
                issued_date: row.issued_date,
                status: row.status,
                created_at: row.created_at,
              },
              ...prev,
            ].slice(0, VIOLATIONS_CAP),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deal_room_events' },
        async (payload) => {
          const row = payload.new as {
            id: string;
            block_committee_id: string | null;
            financial_ledger_id: string | null;
            event_type: string;
            payload: Record<string, unknown>;
            created_at: string;
          };

          let committeeName: string | null = null;
          if (row.block_committee_id) {
            const { data } = await supabase
              .from('block_committees')
              .select('name')
              .eq('id', row.block_committee_id)
              .single();
            committeeName = (data as { name?: string } | null)?.name ?? null;
          }

          setEvents((prev) =>
            [
              {
                id: row.id,
                block_committee_id: row.block_committee_id,
                committee_name: committeeName,
                financial_ledger_id: row.financial_ledger_id,
                event_type: row.event_type,
                payload: row.payload ?? {},
                created_at: row.created_at,
              },
              ...prev,
            ].slice(0, EVENTS_CAP),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ViolationFeed violations={violations} />
      <PulseFeed events={events} />
      <VisionQueue inspections={inspections} />
      <SentinelPanel checks={compliance} />
      <div className="lg:col-span-2">
        <MatchLog leads={leads} />
      </div>
    </div>
  );
}
