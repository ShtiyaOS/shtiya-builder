/**
 * The platform's model client.
 *
 * WHY GEMINI AND NOT OPENAI
 *
 * The supervisor was written against OpenAI's chat completions API, but this
 * deployment carries no OPENAI_API_KEY — only GOOGLE_GENERATIVE_AI_API_KEY /
 * GEMINI_API_KEY. An absent key is not a degraded planner, it is no planner at
 * all: every call throws, the plan is empty, and the Co-Pilot answers
 * no_authority_on_point to every question ever asked. Switching providers is
 * what makes the agent capable of running.
 *
 * -- I-A6 IS PRESERVED ACROSS THE MOVE. The system instruction is passed as a
 * SEPARATE, structured field (Gemini's `systemInstruction`), never concatenated
 * into the user turn. Callers hand in one of the ten reviewed prompt constants
 * and a separately-built user payload; this module never interpolates the two.
 */

/**
 * models/gemini-2.5-flash APPEARS in this account's model list but returns 404
 * on use: "no longer available to new users ... use models/gemini-3.6-flash".
 * The listing endpoint advertises models the key cannot actually call, so it is
 * not a safe source of truth — this value was picked from a real 404.
 */
const MODEL = 'gemini-3.6-flash';
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function apiKey(): string | null {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? null;
}

export interface ModelCallParams {
  /** MUST be a compile-time constant from src/lib/agent/prompts/ (I-A1). */
  systemPrompt: string;
  /** The user payload. Structured JSON for planning, prose for synthesis. */
  userContent: string;
  /** Ask the model for a JSON object rather than prose. */
  json?: boolean;
}

/**
 * Returns the model's text, or null when the call could not be made.
 *
 * Null rather than throw, and null rather than a placeholder string. Every
 * caller in this codebase treats null as "no answer", which flows into a
 * fallback the user can read. A placeholder would flow into the Output Gate and
 * be presented as content.
 */
export async function callGemini(params: ModelCallParams): Promise<string | null> {
  const { systemPrompt, userContent, json } = params;

  const key = apiKey();
  if (!key) {
    console.error('[gemini] no API key configured; model calls disabled');
    return null;
  }

  const url = ENDPOINT_BASE + '/' + MODEL + ':generateContent?key=' + encodeURIComponent(key);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // -- I-A6: the reviewed prompt travels in its own field. It is never
        // built, concatenated, or interpolated with request input.
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('[gemini] call failed', { status: response.status, detail: detail.slice(0, 300) });
      return null;
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map(p => p?.text ?? '')
      .join('')
      .trim();

    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch (err) {
    console.error('[gemini] call threw', { err });
    return null;
  }
}
