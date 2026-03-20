import { embedSingle } from './embedder';
import { searchChunks } from './store';
import { rerankAndFilter } from './reranker';

export interface RetrievalResult {
  text: string;
  source: string;
  section: string;
  score: number; // cosine similarity (0-1, higher = more relevant)
}

/**
 * Embed a query and retrieve the most relevant chunks from LanceDB.
 * Uses cosine similarity reranking and threshold filtering.
 *
 * @param query - The search query text
 * @param retrieveK - Number of candidates to fetch from LanceDB (default: 10)
 * @param threshold - Minimum cosine similarity score to keep (default: 0.3)
 * @param maxResults - Maximum results to return after filtering (default: 5)
 */
export async function retrieveRelevant(
  query: string,
  retrieveK = 10,
  threshold = 0.3,
  maxResults = 5,
  rerank = true,
  sourceFilter?: string[],
): Promise<{ results: RetrievalResult[]; query: string; totalResults: number }> {
  const queryVector = await embedSingle(query);
  const chunks = await searchChunks(queryVector, retrieveK, sourceFilter);

  let results: RetrievalResult[];
  if (rerank) {
    results = rerankAndFilter(queryVector, chunks, threshold, maxResults);
  } else {
    // Baseline mode: return raw LanceDB results (already sorted by L2 distance)
    results = chunks.slice(0, maxResults).map(chunk => ({
      text: chunk.text,
      source: chunk.source,
      section: chunk.section,
      score: 1 - (chunk._distance * chunk._distance / 2), // approximate cosine from L2
    }));
  }

  return { results, query, totalResults: results.length };
}
