import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

// ── Response schema ───────────────────────────────────────────────────────────

const SCOPE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    project_title: {
      type: SchemaType.STRING,
      description: 'Short title summarising the overall scope of work.',
      nullable: true,
    },
    property_address: {
      type: SchemaType.STRING,
      description: 'Property address mentioned in the recording, if any.',
      nullable: true,
    },
    line_items: {
      type: SchemaType.ARRAY,
      description: 'Individual scope line items extracted from the recording.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          trade: {
            type: SchemaType.STRING,
            description: 'Trade category (e.g. Plumbing, Electrical, Carpentry, Roofing).',
          },
          description: {
            type: SchemaType.STRING,
            description: 'Plain-language description of the work to be done.',
          },
          unit: {
            type: SchemaType.STRING,
            description: 'Unit of measure (e.g. SF, LF, EA, LS).',
            nullable: true,
          },
          quantity: {
            type: SchemaType.NUMBER,
            description: 'Estimated quantity in the stated unit.',
            nullable: true,
          },
          unit_cost_usd: {
            type: SchemaType.NUMBER,
            description: 'Estimated cost per unit in USD, or null if unknown.',
            nullable: true,
          },
        },
        required: ['trade', 'description'],
      },
    },
    notes: {
      type: SchemaType.STRING,
      description: 'Any additional notes or caveats mentioned in the recording.',
      nullable: true,
    },
  },
  required: ['line_items'],
};

// ── Output types ──────────────────────────────────────────────────────────────

export interface ScopeLineItem {
  trade: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_cost_usd: number | null;
}

export interface ScopeResult {
  project_title: string | null;
  property_address: string | null;
  line_items: ScopeLineItem[];
  notes: string | null;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * transcribeToScope
 *
 * Sends a base64-encoded audio clip to Gemini 3.6 Flash for transcription
 * and structured extraction into a line-item construction scope of work.
 *
 * @param base64Audio  Raw base64 string of the audio data (no data-URI prefix).
 * @param mimeType     MIME type of the audio: 'audio/webm', 'audio/mp4', etc.
 * @returns            Parsed ScopeResult with project title, address, and line items.
 * @throws             Error with descriptive message on API or parse failure.
 */
export async function transcribeToScope(
  base64Audio: string,
  mimeType: string,
): Promise<ScopeResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SCOPE_SCHEMA,
      temperature: 0.2,
    },
  });

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: { mimeType, data: base64Audio },
          },
          {
            text: [
              'You are a construction estimator assistant.',
              'Listen to the audio recording and extract a structured construction scope of work.',
              'For each task mentioned, identify the trade, a clear description, unit, quantity, and unit cost if stated.',
              'Return ONLY valid JSON matching the schema. Use null for fields not mentioned.',
              'Do not invent quantities or costs — only include what is explicitly stated or clearly implied.',
            ].join(' '),
          },
        ],
      },
    ],
  });

  const raw = result.response.text();
  let parsed: ScopeResult;
  try {
    parsed = JSON.parse(raw) as ScopeResult;
  } catch (err) {
    throw new Error(
      `Gemini returned non-JSON output for voice scope: ${String(err)}. Raw: ${raw.slice(0, 200)}`,
    );
  }

  // Guarantee line_items is always an array.
  if (!Array.isArray(parsed.line_items)) parsed.line_items = [];

  return parsed;
}
