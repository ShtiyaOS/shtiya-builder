import { createClient } from '@/lib/supabase/server';

// Supabase Storage bucket name for milestone media.
// Create this bucket in the Supabase Dashboard → Storage → New bucket.
const MILESTONE_BUCKET = 'milestones';

export interface UploadResult {
  bucketPath: string;
  publicUrl: string | null;
  mimeType: string;
  mediaType: 'photo' | 'video';
}

/**
 * uploadMilestoneFile
 *
 * Uploads a photo or video file to Supabase Storage under
 * `milestones/<propertyId>/<userId>/<timestamp>-<filename>`.
 *
 * @param file        The File object from a multipart/form-data upload.
 * @param propertyId  UUID of the property this milestone belongs to.
 * @param userId      UUID of the uploading contractor.
 * @returns           UploadResult with the storage path and public URL.
 * @throws            Error if the upload fails.
 */
export async function uploadMilestoneFile(
  file: File,
  propertyId: string,
  userId: string,
): Promise<UploadResult> {
  const supabase = await createClient();

  const isVideo = file.type.startsWith('video/');
  const mediaType: 'photo' | 'video' = isVideo ? 'video' : 'photo';

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const bucketPath = `${propertyId}/${userId}/${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error } = await supabase.storage
    .from(MILESTONE_BUCKET)
    .upload(bucketPath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`[storage] Upload failed for "${file.name}": ${error.message}`);
  }

  // Get a public URL (requires the bucket to have public read access).
  const { data: urlData } = supabase.storage
    .from(MILESTONE_BUCKET)
    .getPublicUrl(bucketPath);

  return {
    bucketPath,
    publicUrl: urlData?.publicUrl ?? null,
    mimeType: file.type,
    mediaType,
  };
}
