import { embedSingle } from './embedder';
import { searchChunks } from './store';

export interface RetrievalResult {
  text: string;
  source: string;
  section: string;
  score: number;
}

/**
 * Embed a query and retrieve the most relevant chunks from LanceDB.
 */
export async function retrieveRelevant(
  query: string,
  limit = 5,
): Promise<{ results: RetrievalResult[]; query: string; totalResults: number }> {
  const queryVector = await embedSingle(query);
  const chunks = await searchChunks(queryVector, limit);

  const results: RetrievalResult[] = chunks.map(c => ({
    text: c.text,
    source: c.source,
    section: c.section,
    score: c._distance,
  }));

  return { results, query, totalResults: results.length };
}
