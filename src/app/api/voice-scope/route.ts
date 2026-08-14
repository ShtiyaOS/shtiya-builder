import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transcribeToScope } from '@/lib/gemini/voice-scope';

export const runtime = 'nodejs';

/**
 * POST /api/voice-scope
 *
 * Accepts multipart/form-data with a single audio file under the field "audio"
 * plus an optional "property_id". Calls Gemini voice-to-scope extraction and
 * returns the structured ScopeResult.
 *
 * The caller (contractor/scope/new page) can then edit the result and save it.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const audioFile = formData.get('audio') as File | null;
  if (!audioFile) {
    return NextResponse.json({ error: 'No audio file provided under field "audio".' }, { status: 400 });
  }

  const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB — Gemini inlineData limit
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio file too large (${(audioFile.size / 1024 / 1024).toFixed(1)} MB). Max 20 MB.` },
      { status: 400 },
    );
  }

  const arrayBuffer = await audioFile.arrayBuffer();
  const base64Audio = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = audioFile.type || 'audio/webm';

  let scope;
  try {
    scope = await transcribeToScope(base64Audio, mimeType);
  } catch (err) {
    console.error('[voice-scope] Gemini extraction failed:', String(err));
    return NextResponse.json({ error: `Scope extraction failed: ${String(err)}` }, { status: 502 });
  }

  return NextResponse.json({ scope }, { status: 200 });
}
