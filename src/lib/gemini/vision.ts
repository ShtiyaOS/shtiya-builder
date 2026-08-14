import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

// ── Response schema ───────────────────────────────────────────────────────────

const VISION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    ai_summary: {
      type: SchemaType.STRING,
      description: 'A 2–4 sentence plain-language summary of what is visible in the media.',
    },
    flagged_issues: {
      type: SchemaType.ARRAY,
      description: 'List of safety or scope-mismatch issues identified.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          issue: {
            type: SchemaType.STRING,
            description: 'Concise description of the issue.',
          },
          severity: {
            type: SchemaType.STRING,
            description: 'Severity level: low | medium | high | critical',
          },
        },
        required: ['issue', 'severity'],
      },
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: 'Model confidence score between 0.0 and 1.0.',
    },
    blocks_draw: {
      type: SchemaType.BOOLEAN,
      description: 'True if any flagged issue is severe enough to block an escrow draw release.',
    },
  },
  required: ['ai_summary', 'flagged_issues', 'confidence', 'blocks_draw'],
};

// ── Output types ──────────────────────────────────────────────────────────────

export interface FlaggedIssue {
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface VisionInspectionResult {
  ai_summary: string;
  flagged_issues: FlaggedIssue[];
  confidence: number;
  blocks_draw: boolean;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * inspectMilestone
 *
 * Sends a base64-encoded photo or video frame to Gemini 1.5 Flash for
 * multimodal site inspection. Returns a structured VisionInspectionResult.
 *
 * For files > 20 MB, callers should use the Gemini Files API instead of
 * inlineData — this function handles only the inlineData path.
 *
 * @param base64Media     Raw base64 string of the media (no data-URI prefix).
 * @param mimeType        MIME type: 'image/jpeg', 'image/png', 'video/mp4', etc.
 * @param scopeDescription  Optional scope context to improve issue detection.
 */
export async function inspectMilestone(
  base64Media: string,
  mimeType: string,
  scopeDescription?: string,
): Promise<VisionInspectionResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: VISION_SCHEMA,
      temperature: 0.1,
    },
  });

  const contextNote = scopeDescription
    ? `The contractor's approved scope of work is: "${scopeDescription}".`
    : '';

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Media } },
          {
            text: [
              'You are an AI construction site inspector.',
              contextNote,
              'Analyse this milestone photo or video and identify:',
              '1. A plain-language summary of the visible work.',
              '2. Any safety hazards, code violations, or scope mismatches.',
              '3. Your confidence in the analysis (0.0–1.0).',
              '4. Whether any issue is severe enough to block an escrow draw release.',
              'Set blocks_draw=true if ANY issue has severity "high" or "critical".',
              'Return ONLY valid JSON matching the schema.',
            ].filter(Boolean).join(' '),
          },
        ],
      },
    ],
  });

  const raw = result.response.text();
  let parsed: VisionInspectionResult;
  try {
    parsed = JSON.parse(raw) as VisionInspectionResult;
  } catch (err) {
    throw new Error(
      `Gemini Vision returned non-JSON: ${String(err)}. Raw: ${raw.slice(0, 200)}`,
    );
  }

  // Guarantee types
  if (!Array.isArray(parsed.flagged_issues)) parsed.flagged_issues = [];
  parsed.confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
  parsed.blocks_draw = Boolean(parsed.blocks_draw);

  // Double-check blocks_draw logic — enforce server-side regardless of model output.
  const hasCritical = parsed.flagged_issues.some(
    (i) => i.severity === 'high' || i.severity === 'critical',
  );
  if (hasCritical) parsed.blocks_draw = true;

  return parsed;
}
