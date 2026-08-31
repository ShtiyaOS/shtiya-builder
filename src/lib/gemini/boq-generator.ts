import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

// ── Response schema ───────────────────────────────────────────────────────────

const BOQ_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    project_title: {
      type: SchemaType.STRING,
      description: 'Short title summarising the construction project.',
      nullable: true,
    },
    sections: {
      type: SchemaType.ARRAY,
      description: 'Trade sections making up the Bill of Quantities.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          section_name: {
            type: SchemaType.STRING,
            description: 'Trade or CSI division name (e.g. "03 - Concrete", "09 - Finishes").',
          },
          items: {
            type: SchemaType.ARRAY,
            description: 'Line items within this section.',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                description: {
                  type: SchemaType.STRING,
                  description: 'Description of the work item.',
                },
                unit: {
                  type: SchemaType.STRING,
                  description: 'Unit of measure (SF, LF, EA, LS, CY, etc.).',
                  nullable: true,
                },
                quantity: {
                  type: SchemaType.NUMBER,
                  description: 'Estimated quantity in the stated unit.',
                  nullable: true,
                },
                unit_cost_usd: {
                  type: SchemaType.NUMBER,
                  description: 'Estimated unit cost in USD.',
                  nullable: true,
                },
                notes: {
                  type: SchemaType.STRING,
                  description: 'Any specification notes for this item.',
                  nullable: true,
                },
              },
              required: ['description'] as string[],
            },
          },
        },
        required: ['section_name', 'items'] as string[],
      },
    },
    total_estimated_cost_usd: {
      type: SchemaType.NUMBER,
      description: 'Sum of all item totals. Null if costs are unavailable.',
      nullable: true,
    },
    assumptions: {
      type: SchemaType.STRING,
      description: 'Key assumptions made during BoQ generation.',
      nullable: true,
    },
  },
  required: ['sections'] as string[],
};

// ── Output types ──────────────────────────────────────────────────────────────

export interface BoQLineItem {
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_cost_usd: number | null;
  notes: string | null;
}

export interface BoQSection {
  section_name: string;
  items: BoQLineItem[];
}

export interface BoQResult {
  project_title: string | null;
  sections: BoQSection[];
  total_estimated_cost_usd: number | null;
  assumptions: string | null;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * generateBoQ
 *
 * Sends a base64-encoded CAD/BIM file (or PDF) to Gemini 3.6 Flash and
 * extracts a structured Bill of Quantities broken down by trade section.
 *
 * For non-visual files (.dwg, .rvt, .ifc), callers should convert to PDF
 * or provide a description string via `contextText` before calling this.
 * For PDFs, Gemini can process the document natively.
 *
 * @param base64Data   Base64-encoded file content (no data-URI prefix).
 * @param mimeType     MIME type — 'application/pdf' preferred for native parsing.
 *                     Pass 'text/plain' when providing a text description only.
 * @param contextText  Optional plain-text description to prepend (e.g. project
 *                     brief, address, or notes extracted from the filename).
 * @returns            Parsed BoQResult with sections and line items.
 * @throws             Error with descriptive message on API or parse failure.
 */
export async function generateBoQ(
  base64Data: string,
  mimeType: string,
  contextText?: string,
): Promise<BoQResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: BOQ_SCHEMA,
      temperature: 0.1,
    },
  });

  const systemPrompt = [
    'You are a certified construction estimator specialised in producing Bills of Quantities (BoQ).',
    'Analyse the provided document and generate a complete, structured BoQ.',
    'Organise items by CSI trade division where possible.',
    'Use standard units of measure (SF, LF, EA, LS, CY, etc.).',
    'Provide realistic unit costs in USD based on current NYC market rates.',
    'If you cannot determine a quantity or cost, set the field to null — do not guess.',
    'Return ONLY valid JSON matching the provided schema.',
    contextText ? `Additional context: ${contextText}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const parts = [
    { inlineData: { mimeType, data: base64Data } },
    { text: systemPrompt },
  ];

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
  });

  const raw = result.response.text();
  let parsed: BoQResult;
  try {
    parsed = JSON.parse(raw) as BoQResult;
  } catch (err) {
    throw new Error(
      `Gemini returned non-JSON output for BoQ: ${String(err)}. Raw: ${raw.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(parsed.sections)) parsed.sections = [];

  return parsed;
}

// ── Scope hand-off helper ─────────────────────────────────────────────────────

/**
 * boqToScopeLineItems
 *
 * Flattens a BoQResult into the ScopeLineItem shape used by the Contractor
 * voice-scope page (T3.3), so a BoQ can be handed off as a scope draft
 * consumable by `src/app/(apps)/(contractor)/contractor/scope/new/page.tsx`.
 */
export function boqToScopeLineItems(boq: BoQResult): Array<{
  trade: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_cost_usd: number | null;
}> {
  return boq.sections.flatMap((section) =>
    section.items.map((item) => ({
      trade: section.section_name,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost_usd: item.unit_cost_usd,
    })),
  );
}
