import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Users, ArrowLeft, CheckCircle2, Clock, XCircle, Lock } from 'lucide-react';
import {
  BlockCommitteeActions,
  StatusBadge,
  type CommitteeMember,
} from '@/components/apps/owner/BlockCommitteeActions';
import { PulseListener } from '@/components/apps/owner/PulseListener';

// ── Mock data seed ────────────────────────────────────────────────────────────
// Used when the committee row doesn't exist in the DB yet (dev / before T1.3).
const MOCK_COMMITTEE = {
  id: 'mock-committee-1',
  name: 'Lenox Ave Block Assembly',
  status: 'forming',
  projected_value: 4_200_000,
  target_member_count: 5,
  created_at: new Date().toISOString(),
};

const MOCK_MEMBERS: CommitteeMember[] = [
  {
    property_id: 'prop-1',
    user_id: 'user-1',
    status: 'signed',
    signed_at: new Date().toISOString(),
    address: '123 Lenox Ave',
    owner_name: 'Marcus Johnson',
  },
  {
    property_id: 'prop-2',
    user_id: 'user-2',
    status: 'invited',
    signed_at: null,
    address: '456 Adam Clayton Powell Jr Blvd',
    owner_name: 'Diane Carter',
  },
  {
    property_id: 'prop-3',
    user_id: 'user-3',
    status: 'invited',
    signed_at: null,
    address: '789 Malcolm X Blvd',
    owner_name: 'Robert Williams',
  },
];

// ── Status icon helper ────────────────────────────────────────────────────────
function MemberStatusIcon({ status }: { status: string }) {
  if (status === 'signed')
    return <CheckCircle2 className="h-4 w-4 text-indigo-600" aria-label="Signed" />;
  if (status === 'declined')
    return <XCircle className="h-4 w-4 text-red-500" aria-label="Declined" />;
  return <Clock className="h-4 w-4 text-yellow-500" aria-label="Invited" />;
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BlockCommitteePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // ── Auth ─────────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Fetch committee ───────────────────────────────────────────────────────
  let committee = MOCK_COMMITTEE;
  let members: CommitteeMember[] = MOCK_MEMBERS;
  let currentPropertyId = 'prop-1'; // placeholder for the logged-in owner's property

  if (user) {
    const { data: committeeRow } = await supabase
      .from('block_committees')
      .select('id, name, status, projected_value, target_member_count, created_at')
      .eq('id', id)
      .single();

    if (committeeRow) {
      committee = committeeRow;

      const { data: memberRows } = await supabase
        .from('block_committee_members')
        .select('block_committee_id, property_id, user_id, status, signed_at')
        .eq('block_committee_id', id);

      if (memberRows) {
        members = memberRows.map((m) => ({
          property_id: m.property_id,
          user_id: m.user_id ?? null,
          status: m.status,
          signed_at: m.signed_at ?? null,
        }));
      }

      // Find the current user's property in this committee (first match).
      const myMember = memberRows?.find((m) => m.user_id === user.id);
      if (myMember) {
        currentPropertyId = myMember.property_id;
      }
    } else if (id !== 'mock-committee-1') {
      // Real DB is available but the committee doesn't exist.
      notFound();
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const signedCount = members.filter((m) => m.status === 'signed').length;
  const progressPct = Math.min(
    100,
    Math.round((signedCount / committee.target_member_count) * 100),
  );

  const currentMemberStatus =
    members.find((m) => m.user_id === (user?.id ?? 'user-1'))?.status ?? null;

  const isLocked = committee.status === 'locked';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Back link ─────────────────────────────────────────────────────── */}
      <Link
        href="/owner"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to map
      </Link>

      {/* ── Committee header ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {isLocked ? (
              <Lock className="h-6 w-6 text-green-600" />
            ) : (
              <Users className="h-6 w-6 text-indigo-600" />
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{committee.name}</h1>
              <p className="mt-0.5 text-xs text-gray-400">ID: {committee.id}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={committee.status} />
            {/* Pulse live-channel indicator — client island */}
            <PulseListener committeeId={committee.id} />
          </div>
        </div>

        {/* ── Progress bar ──────────────────────────────────────────────── */}
        <div className="mt-5 space-y-1.5">
          <div className="flex justify-between text-xs font-medium text-gray-600">
            <span>Signatures</span>
            <span>
              {signedCount} / {committee.target_member_count} needed to lock
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">{progressPct}% complete</p>
        </div>

        {/* ── Metadata row ──────────────────────────────────────────────── */}
        {committee.projected_value && (
          <p className="mt-4 text-sm text-gray-600">
            <span className="font-medium">Projected value:</span>{' '}
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            }).format(committee.projected_value)}
          </p>
        )}
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      {!isLocked && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Actions</h2>
          <BlockCommitteeActions
            committeeId={committee.id}
            currentPropertyId={currentPropertyId}
            currentMemberStatus={currentMemberStatus}
          />
        </div>
      )}

      {isLocked && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <span>
            This committee has reached its target. The block is <strong>locked</strong> and ready
            for the next step.
          </span>
        </div>
      )}

      {/* ── Member roster ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Current Members</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {members.map((m) => (
            <li key={m.property_id} className="flex items-center gap-4 px-6 py-4">
              <MemberStatusIcon status={m.status} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {m.owner_name ?? `User ${m.user_id?.slice(0, 8) ?? '—'}`}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {m.address ?? `Property ${m.property_id.slice(0, 8)}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={m.status} />
                {m.signed_at && (
                  <span className="text-xs text-gray-400">
                    {new Date(m.signed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {members.length === 0 && (
          <p className="px-6 py-8 text-center text-sm text-gray-500">
            No members yet. Invite neighbors to get started.
          </p>
        )}
      </div>
    </div>
  );
}
