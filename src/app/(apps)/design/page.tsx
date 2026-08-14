import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Building2, FileSearch, FolderOpen } from 'lucide-react';

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
const MOCK_PROPERTIES = [
  { id: 'prop-1', address: '123 Lenox Ave, Harlem, NY 10026', cad_count: 2 },
  { id: 'prop-2', address: '456 Malcolm X Blvd, NY 10037', cad_count: 0 },
];

export default async function DesignPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type PropRow = { id: string; address: string; cad_count: number };
  let properties: PropRow[] = MOCK_PROPERTIES;

  if (user) {
    // Pull properties the user has access to (RLS enforced) with a count of
    // vaulted CAD documents for each.
    const { data: props } = await supabase
      .from('properties')
      .select('id, address')
      .order('created_at', { ascending: false })
      .limit(50);

    if (props && props.length > 0) {
      // Fetch CAD document counts in one query.
      const { data: cadCounts } = await supabase
        .from('documents')
        .select('property_id')
        .eq('type', 'cad')
        .in('property_id', props.map((p) => p.id));

      const countMap: Record<string, number> = {};
      (cadCounts ?? []).forEach((d) => {
        const pid = d.property_id as string;
        countMap[pid] = (countMap[pid] ?? 0) + 1;
      });

      properties = props.map((p) => ({
        id: p.id,
        address: p.address,
        cad_count: countMap[p.id] ?? 0,
      }));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Shtiya Design</h1>
        <p className="mt-1 text-sm text-gray-500">
          CAD/BIM vault · Bill of Quantities generator · Contractor scope hand-off
        </p>
      </div>

      {/* ── Quick-access cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5">
          <div className="flex items-center gap-2 text-indigo-700 mb-2">
            <FolderOpen className="h-5 w-5" />
            <span className="text-sm font-semibold">CAD / BIM Vault</span>
          </div>
          <p className="text-xs text-indigo-600">
            Upload and store .dwg, .rvt, .ifc, and .pdf construction documents
            securely. Each file is linked to a property and tracked in the documents ledger.
          </p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-5">
          <div className="flex items-center gap-2 text-violet-700 mb-2">
            <FileSearch className="h-5 w-5" />
            <span className="text-sm font-semibold">BoQ Generator</span>
          </div>
          <p className="text-xs text-violet-600">
            Select any vaulted PDF and let Gemini AI generate a structured Bill of
            Quantities. Hand off results directly to the Contractor scope workflow.
          </p>
        </div>
      </div>

      {/* ── Property list ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Properties</h2>
        </div>

        {properties.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
            <Building2 className="h-8 w-8 text-gray-200" />
            <p>No properties available.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {properties.map((prop) => (
              <li key={prop.id}>
                <Link
                  href={`/design/vault/${prop.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <Building2 className="h-5 w-5 flex-shrink-0 text-gray-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{prop.address}</p>
                    <p className="font-mono text-xs text-gray-400">{prop.id}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    prop.cad_count > 0
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {prop.cad_count} file{prop.cad_count !== 1 ? 's' : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
