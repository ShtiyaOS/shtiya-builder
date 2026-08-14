'use client';

import { useState } from 'react';
import { UserPlus, PenLine, Loader2 } from 'lucide-react';

// ── Types shared with the server page ────────────────────────────────────────
export interface CommitteeMember {
  property_id: string;
  user_id: string | null;
  status: string;
  signed_at: string | null;
  address?: string;
  owner_name?: string;
}

interface BlockCommitteeActionsProps {
  committeeId: string;
  currentPropertyId: string;
  currentMemberStatus: string | null; // null = current user is not yet a member
}

// ── Inline status badge ───────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    signed: 'bg-indigo-100 text-indigo-800',
    invited: 'bg-yellow-100 text-yellow-800',
    declined: 'bg-red-100 text-red-800',
    forming: 'bg-gray-100 text-gray-700',
    locked: 'bg-green-100 text-green-800',
    rezoning_filed: 'bg-purple-100 text-purple-800',
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
        classes[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

// ── Interactive actions panel ─────────────────────────────────────────────────
export function BlockCommitteeActions({
  committeeId,
  currentPropertyId,
  currentMemberStatus,
}: BlockCommitteeActionsProps) {
  const [inviteLoading, setInviteLoading] = useState(false);
  const [signLoading, setSignLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [memberStatus, setMemberStatus] = useState<string | null>(currentMemberStatus);

  // ── Invite a neighbor (POST) ───────────────────────────────────────────────
  async function handleInvite() {
    // For the mock UI we invite a hard-coded neighbor property.
    // In production this would open a search-and-select dialog.
    const neighborPropertyId = crypto.randomUUID();
    const neighborUserId = crypto.randomUUID();

    setInviteLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/block-committees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_committee_id: committeeId,
          property_id: neighborPropertyId,
          user_id: neighborUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? 'Failed to invite neighbor.' });
      } else {
        setMessage({ type: 'success', text: 'Invitation sent successfully.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setInviteLoading(false);
    }
  }

  // ── Sign the intent agreement (PATCH) ─────────────────────────────────────
  async function handleSign() {
    setSignLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/block-committees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_committee_id: committeeId,
          property_id: currentPropertyId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? 'Failed to sign.' });
      } else {
        setMemberStatus('signed');
        setMessage({
          type: 'success',
          text: json.locked
            ? '🎉 You signed! The committee has reached its target and is now LOCKED.'
            : 'Intent agreement signed successfully.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSignLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Feedback banner */}
      {message && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {/* Invite neighbor */}
        <button
          onClick={handleInvite}
          disabled={inviteLoading}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {inviteLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Invite Neighbor
        </button>

        {/* Sign intent agreement */}
        <button
          onClick={handleSign}
          disabled={signLoading || memberStatus === 'signed'}
          title={memberStatus === 'signed' ? 'You have already signed.' : undefined}
          className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {signLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PenLine className="h-4 w-4" />
          )}
          {memberStatus === 'signed' ? 'Agreement Signed ✓' : 'Sign Intent Agreement'}
        </button>
      </div>

      {/* Current user's membership status */}
      {memberStatus && (
        <p className="text-xs text-gray-500">
          Your membership status:{' '}
          <StatusBadge status={memberStatus} />
        </p>
      )}
    </div>
  );
}
