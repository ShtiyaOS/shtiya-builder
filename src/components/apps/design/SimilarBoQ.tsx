'use client';

import { useState } from 'react';
import { Search, Loader2, FileText } from 'lucide-react';

interface SimilarBoQResult {
  id: string;
  score?: number;
  type?: string;
  bucket_path?: string;
  property_id?: string;
  created_at?: string;
}

interface SimilarBoQProps {
  propertyId: string;
}

/**
 * SimilarBoQ
 *
 * Agentic: Match — client island that queries /api/match for semantically
 * similar CAD/BIM documents (type='cad' or 'scope_draft') using pgvector
 * cosine similarity. Helps architects and designers find comparable floor
 * plans and Bills of Quantities from the vault.
 */
export function SimilarBoQ({ propertyId }: SimilarBoQProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SimilarBoQResult[]>([]);
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
        body: JSON.stringify({
          query: query.trim(),
          table: 'documents',
          property_id: propertyId,
          limit: 5,
        }),
      });
      const json = await res.json() as {
        results?: SimilarBoQResult[];
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

  function fileLabel(bucketPath: string): string {
    const parts = bucketPath.split('/');
    const name = parts[parts.length - 1] ?? bucketPath;
    return name.replace(/^\d+-/, '');
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          placeholder="e.g. 3-bedroom gut renovation, bathroom tile, structural steel…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      {hint && (
        <p className="text-xs text-amber-600 italic">{hint}</p>
      )}

      {searched && results.length === 0 && !error && !hint && (
        <p className="text-xs text-gray-400">No similar documents found.</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {results.map((r, idx) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-600">
                {idx + 1}
              </span>
              <FileText className="h-4 w-4 flex-shrink-0 text-gray-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {r.bucket_path ? fileLabel(r.bucket_path) : r.id}
                </p>
                <p className="text-xs text-gray-400">
                  {r.type && <span className="capitalize mr-2">{r.type.replace(/_/g, ' ')}</span>}
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
