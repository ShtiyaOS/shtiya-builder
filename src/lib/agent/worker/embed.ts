import OpenAI from 'openai';

/**
 * Query embedding for corpus retrieval.
 *
 * The corpora store `embedding vector(1536)` (10700 §4), so the model is fixed
 * by the schema, not by preference: a 768-dimension Gemini vector — which is
 * what /api/match uses against the v1 `properties` tables — cannot be compared
 * against these columns at all. The two embedding spaces are separate on
 * purpose and must not be mixed.
 */
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS  = 1536;

/**
 * Returns the query vector, or null when one cannot be produced.
 *
 * Null rather than throw, and null rather than a zero vector. A zero vector is
 * not "no query" — it is a query that sits at cosine distance 1.0 from
 * everything, which either returns nothing or returns an arbitrary slice of the
 * corpus depending on the bar. A worker that gets null retrieves nothing, and
 * the Output Gate then refuses to answer for lack of citations, which is the
 * correct outcome for "we could not run the search".
 */
export async function embedQuery(query: string): Promise<number[] | null> {
  if (typeof query !== 'string' || query.trim() === '') return null;
  if (!process.env.OPENAI_API_KEY) {
    console.error('[worker] OPENAI_API_KEY is not configured; retrieval disabled');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    });

    const vector = response?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMS) {
      console.error('[worker] unexpected embedding dimensions', {
        expected: EMBEDDING_DIMS,
        received: Array.isArray(vector) ? vector.length : null,
      });
      return null;
    }

    return vector;
  } catch (err) {
    console.error('[worker] embedding call failed', { err });
    return null;
  }
}
