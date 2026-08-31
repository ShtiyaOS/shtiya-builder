import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';

// ── Singleton client ──────────────────────────────────────────────────────────
// Initialised once at module load. The API key is read server-side only;
// this file must never be imported from a 'use client' component.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

// ── Response schema ───────────────────────────────────────────────────────────
// Forcing JSON output via responseMimeType + responseSchema gives us a
// deterministic structure rather than free-form text that needs regex parsing.
const PROBATE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    deceased_name: {
      type: SchemaType.STRING,
      description: 'Full legal name of the deceased property owner.',
      nullable: true,
    },
    executor_name: {
      type: SchemaType.STRING,
      description: 'Full legal name of the estate executor or administrator.',
      nullable: true,
    },
    executor_mailing_address: {
      type: SchemaType.STRING,
      description: 'Mailing address of the executor as stated in the document.',
      nullable: true,
    },
    property_address: {
      type: SchemaType.STRING,
      description:
        'Street address of the property subject to probate, including borough and zip if present.',
      nullable: true,
    },
    estimated_value: {
      type: SchemaType.STRING,
      description:
        'Estimated or appraised value of the estate or property, as a formatted string (e.g. "$450,000").',
      nullable: true,
    },
    case_number: {
      type: SchemaType.STRING,
      description: 'Court case or file number as printed on the document.',
      nullable: true,
    },
  },
  // Must be a mutable string[] — the SDK's ObjectSchema type does not accept readonly tuples.
  required: [
    'deceased_name',
    'executor_name',
    'executor_mailing_address',
    'property_address',
    'estimated_value',
    'case_number',
  ] as string[],
};

// ── Output type ───────────────────────────────────────────────────────────────
export interface ProbateData {
  deceased_name: string | null;
  executor_name: string | null;
  executor_mailing_address: string | null;
  property_address: string | null;
  estimated_value: string | null;
  case_number: string | null;
}

// ── OCR function ──────────────────────────────────────────────────────────────

/**
 * extractProbateData
 *
 * Sends a base64-encoded PDF page to Gemini 3.6 Flash and extracts structured
 * probate data using a strict JSON response schema.
 *
 * @param base64Pdf  Raw base64 string of the PDF (no data-URI prefix needed).
 * @param fileName   Optional filename used in logging for traceability.
 * @returns          Parsed ProbateData object, or throws on failure.
 */
export async function extractProbateData(
  base64Pdf: string,
  fileName = 'document.pdf',
): Promise<ProbateData> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: PROBATE_SCHEMA,
      // Lower temperature for deterministic extraction.
      temperature: 0,
    },
  });

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Pdf,
            },
          },
          {
            text: [
              'You are a legal document parser. Extract the following fields from this probate petition or estate document.',
              'Return ONLY a valid JSON object matching the schema. Use null for any field not found in the document.',
              'Do not infer or hallucinate values — only extract what is explicitly stated.',
            ].join(' '),
          },
        ],
      },
    ],
  });

  const raw = result.response.text();

  let parsed: ProbateData;
  try {
    parsed = JSON.parse(raw) as ProbateData;
  } catch (parseError) {
    throw new Error(
      `Gemini returned non-JSON output for "${fileName}": ${String(parseError)}. Raw: ${raw.slice(0, 200)}`,
    );
  }

  return parsed;
}
