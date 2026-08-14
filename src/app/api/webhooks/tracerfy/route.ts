import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { skipTraceOwner } from '@/lib/tracerfy/client';

/**
 * POST /api/webhooks/tracerfy
 *
 * Runs a Tracerfy skip-trace lookup for the owner/executor of a given property
 * and writes the returned contact information back into `properties.metadata`.
 *
 * Body: { property_id: string }
 *
 * On success the property's metadata JSONB is updated with:
 * {
 *   ...existing metadata,
 *   skip_trace: {
 *     phones: string[],
 *     emails: string[],
 *     traced_at: ISO timestamp,
 *   }
 * }
 *
 * Errors from the Tracerfy API (including exhausted retries) are returned as
 * a structured JSON error rather than a 500, so callers can distinguish a
 * rate-limit failure from a bad property_id.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const { property_id } = body ?? {};
  if (!property_id || typeof property_id !== 'string') {
    return NextResponse.json(
      { error: 'property_id (string) is required.' },
      { status: 400 },
    );
  }

  // ── Fetch the property record ─────────────────────────────────────────────
  const { data: property, error: fetchError } = await supabase
    .from('properties')
    .select('id, address, metadata')
    .eq('id', property_id)
    .single();

  if (fetchError || !property) {
    return NextResponse.json(
      { error: `Property not found: ${fetchError?.message ?? 'no rows returned'}` },
      { status: 404 },
    );
  }

  // ── Resolve the name to look up ───────────────────────────────────────────
  // Prefer the executor recorded by the OCR step; fall back to the owner name
  // captured in metadata, then to the property address as a last resort.
  const metadata = (property.metadata ?? {}) as Record<string, unknown>;
  const traceName =
    (metadata.executor_name as string | undefined) ??
    (metadata.deceased_name as string | undefined) ??
    '';

  if (!traceName) {
    return NextResponse.json(
      {
        error:
          'No owner or executor name found in property metadata. ' +
          'Run probate OCR ingestion (T2.4) first, or supply executor_name manually.',
      },
      { status: 422 },
    );
  }

  // ── Call Tracerfy ─────────────────────────────────────────────────────────
  let contact;
  try {
    contact = await skipTraceOwner(traceName, property.address);
  } catch (traceErr) {
    const reason = String(traceErr);
    console.error(`[tracerfy-webhook] Skip-trace failed for property ${property_id}: ${reason}`);

    // Surface the reason in the response so the caller knows whether this was
    // a rate-limit exhaustion or a hard API failure.
    const isRateLimit = reason.includes('429') || reason.toLowerCase().includes('rate-limit');
    return NextResponse.json(
      {
        error: isRateLimit
          ? 'Tracerfy rate limit exhausted. Retry later.'
          : `Skip-trace lookup failed: ${reason}`,
        property_id,
        retryable: isRateLimit,
      },
      { status: isRateLimit ? 429 : 502 },
    );
  }

  // ── Merge contact data into properties.metadata ───────────────────────────
  // We fetch-then-update (rather than using a DB function) because the Database
  // type is a placeholder (any) and there is no jsonb_set helper in the JS SDK.
  // The merge preserves all existing metadata keys.
  const updatedMetadata = {
    ...metadata,
    skip_trace: {
      phones: contact.phones,
      emails: contact.emails,
      traced_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await supabase
    .from('properties')
    .update({ metadata: updatedMetadata })
    .eq('id', property_id);

  if (updateError) {
    console.error(
      `[tracerfy-webhook] DB update failed for property ${property_id}: ${updateError.message}`,
    );
    return NextResponse.json(
      { error: `Contact data retrieved but DB update failed: ${updateError.message}` },
      { status: 500 },
    );
  }

  console.info(
    `[tracerfy-webhook] OK property=${property_id} ` +
      `phones=${contact.phones.length} emails=${contact.emails.length}`,
  );

  return NextResponse.json(
    {
      property_id,
      skip_trace: {
        phones: contact.phones,
        emails: contact.emails,
        traced_at: updatedMetadata.skip_trace.traced_at,
      },
    },
    { status: 200 },
  );
}
