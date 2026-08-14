'use client';

import { useState } from 'react';
import { Search, Loader2, Building2 } from 'lucide-react';

interface SimilarDealResult {
  id: string;
  score?: number;
  address?: string;
  bbl?: string;
  status?: string;
  property_id?: string;
}

interface SimilarDealsProps {
  /** Pre-fill the search with a lead description to auto-surface related properties. */
  initialQuery?: string;
}

/**
 * SimilarDeals
 *
 * Agentic: Match — client island that queries /api/match for properties
 * semantically similar to a free-text lead description. Used in the
 * Acquisition app to surface related deals and in the Marketing app to
 * auto-route inbound leads.
 */
export function SimilarDeals({ initialQuery = '' }: SimilarDealsProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SimilarDealResult[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setHint(null);
    setResults([]);

    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), table: 'properties', limit: 5 }),
      });
      const json = await res.json() as {
        results?: SimilarDealResult[];
        hint?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? 'Search failed.');
      } else {
        setResults(json.results ?? []);
        setHint(json.hint ?? null);
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          placeholder="e.g. vacant lot Harlem corner, 4-family brownstone, gut-reno candidate…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Find
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && <p className="text-xs text-amber-600 italic">{hint}</p>}

      {searched && results.length === 0 && !error && !hint && (
        <p className="text-xs text-gray-400">No similar deals found for that description.</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {results.map((r, idx) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-600">
                {idx + 1}
              </span>
              <Building2 className="h-4 w-4 flex-shrink-0 text-gray-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {r.address ?? r.id}
                </p>
                <p className="text-xs text-gray-400">
                  {r.bbl && <span className="mr-2">BBL: {r.bbl}</span>}
                  {r.status && <span className="capitalize mr-2">{r.status}</span>}
                  {r.score != null && (
                    <span>similarity {(1 - r.score).toFixed(3)}</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
