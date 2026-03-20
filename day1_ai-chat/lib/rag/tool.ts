import { tool } from 'ai';
import { z } from 'zod';
import { retrieveRelevant } from './retriever';

const inputSchema = z.object({
  query: z.string().describe('The search query to find relevant document passages'),
});

/**
 * Factory function to create a parameterized search_documents tool.
 * Captures threshold and topK in closure per-request.
 */
export function createSearchDocumentsTool(opts?: { threshold?: number; topK?: number; rerank?: boolean; sourceFilter?: string[] }) {
  const threshold = opts?.threshold ?? 0.3;
  const topK = opts?.topK ?? 10;
  const rerank = opts?.rerank ?? true;
  const sourceFilter = opts?.sourceFilter;

  return tool({
    description:
      'Search indexed documents for relevant passages. Use this when the user asks a question that might be answered by their uploaded documents.',
    inputSchema,
    execute: async ({ query }) => {
      try {
        const result = await retrieveRelevant(query, topK, threshold, 5, rerank, sourceFilter);
        console.log(`\x1b[35m[RAG]\x1b[0m Search "${query.slice(0, 60)}": ${result.totalResults} results (topK=${topK}, threshold=${threshold}, rerank=${rerank})`);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Search failed';
        console.error(`\x1b[31m[RAG]\x1b[0m Search failed: ${message}`);
        return { results: [], query, totalResults: 0, error: message };
      }
    },
  });
}

/** Backward-compatible default export */
export const searchDocumentsTool = createSearchDocumentsTool();
