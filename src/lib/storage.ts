import { createClient } from '@/lib/supabase/server';

/**
 * src/lib/storage.ts
 *
 * Shtiya Builder v3.0 — typed object-storage helpers for the three v3 buckets
 * declared in `supabase/storage.sql`.
 *
 * This is a standalone v3 module. The legacy v1 milestone helper
 * (`src/lib/supabase/storage.ts`, bucket `milestones`) is unrelated and is
 * neither imported nor wrapped here.
 */

// NOTE: all three v3 buckets are private — use createSignedUrl() for reads
export const BUCKETS = {
  DOCUMENTS: 'documents',
  VAULT_RAW: 'vault-raw',
  GIG_AFFIDAVITS: 'gig-affidavits',
} as const;

export type BucketId = (typeof BUCKETS)[keyof typeof BUCKETS];

/**
 * Buckets created with `public = false` in supabase/storage.sql. Reads against
 * these must go through a signed URL — `getPublicUrl()` still returns a
 * well-formed URL for them, but that URL is not servable.
 */
const PRIVATE_BUCKETS: ReadonlySet<BucketId> = new Set<BucketId>([
  BUCKETS.DOCUMENTS,
  BUCKETS.VAULT_RAW,
  BUCKETS.GIG_AFFIDAVITS,
]);

export interface UploadFileOptions {
  bucket: BucketId;
  /** e.g. `${propertyId}/${userId}/${Date.now()}-${safeName}` */
  path: string;
  file: File | Buffer;
  contentType: string;
}

export interface UploadFileResult {
  storagePath: string;
  publicUrl: string | null;
}

/**
 * Uploads a file into one of the three v3 buckets.
 *
 * `upsert` is false — an existing object at `path` is a hard failure rather
 * than a silent overwrite, so callers must supply a collision-free path.
 *
 * @throws Error if the upload fails.
 */
export async function uploadFile(opts: UploadFileOptions): Promise<UploadFileResult> {
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(opts.bucket)
    .upload(opts.path, opts.file, {
      contentType: opts.contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(
      `[storage] bucket="${opts.bucket}" path="${opts.path}": ${error.message}`,
    );
  }

  const { data: urlData } = supabase.storage.from(opts.bucket).getPublicUrl(opts.path);

  // Private buckets report null rather than handing back an unservable URL.
  const publicUrl = PRIVATE_BUCKETS.has(opts.bucket)
    ? null
    : (urlData?.publicUrl ?? null);

  return { storagePath: opts.path, publicUrl };
}

export interface CreateSignedUrlOptions {
  bucket: BucketId;
  path: string;
  expiresInSeconds: number;
}

/**
 * Mints a time-limited signed URL for an object in a private bucket.
 *
 * @throws Error if the signed URL cannot be created.
 */
export async function createSignedUrl(opts: CreateSignedUrlOptions): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(opts.bucket)
    .createSignedUrl(opts.path, opts.expiresInSeconds);

  if (error || !data) {
    const reason = error?.message ?? 'no signed URL returned';
    throw new Error(
      `[storage] signed URL failed for bucket="${opts.bucket}" path="${opts.path}": ${reason}`,
    );
  }

  return data.signedUrl;
}
