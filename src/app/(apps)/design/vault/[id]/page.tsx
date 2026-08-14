import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, Upload, Download, Calendar, User, ArrowLeft } from 'lucide-react';
import { CadUploadForm } from '@/components/apps/design/CadUploadForm';
import { BoQGenerator } from '@/components/apps/design/BoQGenerator';

// ── Mock fallback ─────────────────────────────────────────────────────────────
const MOCK_DOCS = [
  {
    id: 'doc-cad-1',
    property_id: 'prop-1',
    uploaded_by: 'user-1',
    uploader_name: 'Alex Chen',
    type: 'cad',
    bucket_path: 'prop-1/user-1/1700000000000-floor_plan.pdf',
    public_url: null as string | null,
    created_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
  },
];

const MOCK_PROPERTY = {
  id: 'prop-1',
  address: '123 Lenox Ave, Harlem, NY 10026',
};

const EXT_ICONS: Record<string, string> = {
  '.dwg': 'DWG',
  '.rvt': 'RVT',
  '.ifc': 'IFC',
  '.pdf': 'PDF',
};

function fileLabel(bucketPath: string): string {
  const parts = bucketPath.split('/');
  const name = parts[parts.length - 1] ?? bucketPath;
  // Strip timestamp prefix: "1700000000000-filename.ext" → "filename.ext"
  return name.replace(/^\d+-/, '');
}

function fileExt(bucketPath: string): string {
  const name = fileLabel(bucketPath);
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CadVaultPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type PropertyData = typeof MOCK_PROPERTY;
  type DocData = (typeof MOCK_DOCS)[number];

  let property: PropertyData = MOCK_PROPERTY;
  let docs: DocData[] = MOCK_DOCS;

  if (user) {
    const { data: prop } = await supabase
      .from('properties')
      .select('id, address')
      .eq('id', id)
      .single();

    if (!prop && id !== 'prop-1') notFound();
    if (prop) property = prop as PropertyData;

    const { data: cadDocs } = await supabase
      .from('documents')
      .select('id, property_id, uploaded_by, type, bucket_path, created_at')
      .eq('property_id', id)
      .eq('type', 'cad')
      .order('created_at', { ascending: false });

    if (cadDocs && cadDocs.length > 0) {
      docs = cadDocs.map((d) => ({
        ...d,
        uploader_name: `User ${(d.uploaded_by as string).slice(0, 8)}`,
        public_url: null,
      })) as DocData[];
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/design" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Back to Design
      </Link>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CAD/BIM Vault</h1>
          <p className="mt-0.5 text-sm text-gray-500">{property.address}</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-0.5 text-xs font-medium text-indigo-700">
          {docs.length} file{docs.length !== 1 ? 's' : ''} vaulted
        </span>
      </div>

      {/* ── Upload form (client island) ───────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Upload CAD / BIM File</h2>
        <CadUploadForm propertyId={id} />
      </div>

      {/* ── Vaulted files list ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Vaulted Files</h2>
        </div>

        {docs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
            <Upload className="h-8 w-8 text-gray-200" />
            <p>No CAD/BIM files uploaded yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {docs.map((doc) => {
              const ext = fileExt(doc.bucket_path);
              const label = fileLabel(doc.bucket_path);
              const badge = EXT_ICONS[ext] ?? (ext.replace('.', '').toUpperCase() || 'FILE');

              return (
                <li key={doc.id} className="flex items-center gap-4 px-5 py-3.5">
                  {/* File type badge */}
                  <span className="flex h-9 w-12 flex-shrink-0 items-center justify-center rounded bg-indigo-50 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                    {badge}
                  </span>

                  {/* File name */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{label}</p>
                    <p className="font-mono text-xs text-gray-400">{doc.id}</p>
                  </div>

                  {/* Meta */}
                  <div className="hidden flex-shrink-0 flex-col items-end gap-0.5 sm:flex text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {doc.uploader_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {doc.public_url && (
                      <a
                        href={doc.public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Download"
                        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                    <div title="Document record ID" className="rounded-md p-1.5 text-gray-300">
                      <FileText className="h-4 w-4" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── BoQ Generator (client island) ────────────────────────────────── */}
      {docs.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Bill of Quantities Generator</h2>
          <p className="mb-4 text-xs text-gray-500">
            Select a PDF file from the vault and generate a structured BoQ using Gemini AI.
            The result can be handed off directly to the Contractor scope workflow.
          </p>
          <BoQGenerator
            propertyId={id}
            docs={docs.filter((d) => fileExt(d.bucket_path) === '.pdf').map((d) => ({
              id: d.id,
              label: fileLabel(d.bucket_path),
              public_url: d.public_url,
            }))}
          />
        </div>
      )}
    </div>
  );
}
