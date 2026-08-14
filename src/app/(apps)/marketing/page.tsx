import { createClient } from '@/lib/supabase/server';
import { Megaphone, Star, TrendingUp, Users } from 'lucide-react';
import { LeadForm } from '@/components/apps/marketing/LeadForm';
import { SimilarDeals } from '@/components/apps/acquisition/SimilarDeals';

// ── Mock reviews (dev fallback) ───────────────────────────────────────────────
const MOCK_REVIEWS = [
  {
    id: 'rev-1',
    author: 'David K.',
    rating: 5,
    body: 'Shtiya helped us close our first block assembly deal in Harlem within 3 months. The platform is incredibly well designed.',
    platform: 'Google',
    created_at: '2024-10-15',
  },
  {
    id: 'rev-2',
    author: 'Priya M.',
    rating: 5,
    body: 'The escrow + vision inspection combo gave our lender confidence to fund without site visits. Game changer.',
    platform: 'Trustpilot',
    created_at: '2024-11-02',
  },
  {
    id: 'rev-3',
    author: 'James T.',
    rating: 4,
    body: 'Solid tool for managing the contractor workflow. The voice-to-scope feature alone is worth it.',
    platform: 'Google',
    created_at: '2024-11-20',
  },
];

// ── Mock lead pipeline stats ──────────────────────────────────────────────────
const MOCK_STATS = {
  total_leads: 47,
  matched: 31,
  converted: 8,
  avg_match_score: 0.18, // lower = better (cosine distance)
};

export default async function MarketingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type StatData = typeof MOCK_STATS;
  let stats: StatData = MOCK_STATS;

  if (user) {
    // Count lead documents to show pipeline metrics
    const { count: totalLeads } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'lead');

    // Count leads that have a related property (matched by AI)
    const { data: matchedRows } = await supabase
      .from('documents')
      .select('id, property_id')
      .eq('type', 'lead')
      .not('property_id', 'is', null);

    if (totalLeads != null) {
      stats = {
        total_leads: totalLeads ?? 0,
        matched: matchedRows?.length ?? 0,
        converted: 0, // conversion tracked externally until acquisition integration is wired
        avg_match_score: MOCK_STATS.avg_match_score,
      };
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Shtiya Marketing</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Lead funnel · AI property matching · Review syndication
          </p>
        </div>
      </div>

      {/* ── Pipeline stats ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-gray-500 mb-1">Total Leads</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total_leads}</p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
            <p className="text-xs text-indigo-600">AI Matched</p>
          </div>
          <p className="text-2xl font-bold text-indigo-700">{stats.matched}</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50 p-4 shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Users className="h-3.5 w-3.5 text-green-600" />
            <p className="text-xs text-green-600">Converted</p>
          </div>
          <p className="text-2xl font-bold text-green-700">{stats.converted}</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 shadow-sm text-center">
          <p className="text-xs text-violet-600 mb-1">Avg Similarity</p>
          <p className="text-2xl font-bold text-violet-700">
            {stats.total_leads > 0
              ? (1 - stats.avg_match_score).toFixed(2)
              : '—'}
          </p>
        </div>
      </div>

      {/* ── Lead intake form ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Inbound Lead Form</h2>
        <p className="mb-5 text-xs text-gray-500">
          Leads submitted here are stored in the pipeline and automatically matched to the
          most relevant property in the portfolio using pgvector semantic search.
          Qualified leads are forwarded to the Acquisition queue.
        </p>
        <LeadForm />
      </div>

      {/* ── Similar properties finder ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Property Match Preview</h2>
        <p className="mb-4 text-xs text-gray-500">
          Preview which properties a given lead description would match before submitting.
        </p>
        <SimilarDeals />
      </div>

      {/* ── Reviews syndication ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Client Reviews</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {MOCK_REVIEWS.map((review) => (
            <li key={review.id} className="px-5 py-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{review.author}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                    {review.platform}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-700">{review.body}</p>
              <p className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
