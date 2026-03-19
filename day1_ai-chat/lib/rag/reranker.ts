/**
 * Cosine similarity reranking for RAG results.
 * Computes cosine similarity between query vector and each chunk's stored vector.
 * Returns results sorted by similarity (descending), with cosine similarity as score.
 */

export interface RankedResult {
  text: string;
  source: string;
  section: string;
  score: number; // cosine similarity, 0-1, higher = more relevant
}

/**
 * Full cosine similarity — robust for any vectors, not just L2-normalized.
 * For 384-dim vectors this is < 1ms, so no need for dot-product shortcut.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

interface ChunkWithVector {
  text: string;
  source: string;
  section: string;
  vector: number[];
  _distance: number;
}

/**
 * Rerank chunks by cosine similarity to query vector, then filter by threshold.
 * Falls back to original L2-distance ordering if scoring fails.
 */
export function rerankAndFilter(
  queryVector: number[],
  chunks: ChunkWithVector[],
  threshold: number,
  maxResults: number,
): RankedResult[] {
  try {
    const scored = chunks.map(chunk => ({
      text: chunk.text,
      source: chunk.source,
      section: chunk.section,
      score: cosineSimilarity(queryVector, chunk.vector),
    }));

    // Sort by cosine similarity descending (higher = more relevant)
    scored.sort((a, b) => b.score - a.score);

    // Filter by threshold and cap results
    const filtered = scored.filter(r => r.score >= threshold);
    return filtered.slice(0, maxResults);
  } catch (err) {
    console.error('\x1b[31m[RAG]\x1b[0m Reranker failed, falling back to L2 order:', err);
    // Graceful fallback: return original results sorted by L2 distance (already sorted by LanceDB)
    return chunks.slice(0, maxResults).map(chunk => ({
      text: chunk.text,
      source: chunk.source,
      section: chunk.section,
      score: 1 - (chunk._distance * chunk._distance / 2), // approximate cosine from L2
    }));
  }
}
