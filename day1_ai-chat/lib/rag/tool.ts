import { tool } from 'ai';
import { z } from 'zod';
import { retrieveRelevant } from './retriever';

const inputSchema = z.object({
  query: z.string().describe('The search query to find relevant document passages'),
});

/**
 * Creates a parameterized RAG search tool for the AI SDK.
 *
 * Returns an AI SDK `tool()` instance that searches indexed documents for
 * relevant passages using vector similarity. Configuration options are
 * captured in closure so each agent session can use distinct retrieval params.
 *
 * @param opts - Optional retrieval configuration.
 * @param opts.threshold - Minimum similarity score (0–1) for results. Defaults to `0.3`.
 * @param opts.topK - Maximum number of passages to return. Defaults to `10`.
 * @param opts.rerank - Whether to rerank results for relevance. Defaults to `true`.
 * @param opts.sourceFilter - Optional list of source identifiers to restrict search scope.
 * @returns An AI SDK tool that accepts a `query` string and returns matching passages.
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
