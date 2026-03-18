import { tool } from 'ai';
import { z } from 'zod';
import { retrieveRelevant } from './retriever';

const inputSchema = z.object({
  query: z.string().describe('The search query to find relevant document passages'),
});

/**
 * AI SDK v6 tool with execute handler for auto-execution.
 * Named without `mcp__` prefix so page.tsx:288 doesn't route it
 * to the MCP confirmation dialog.
 */
export const searchDocumentsTool = tool({
  description:
    'Search indexed documents for relevant passages. Use this when the user asks a question that might be answered by their uploaded documents.',
  inputSchema,
  execute: async ({ query }) => {
    try {
      const result = await retrieveRelevant(query);
      console.log(`\x1b[35m[RAG]\x1b[0m Search "${query.slice(0, 60)}": ${result.totalResults} results`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      console.error(`\x1b[31m[RAG]\x1b[0m Search failed: ${message}`);
      return { results: [], query, totalResults: 0, error: message };
    }
  },
});
