import { tool } from 'ai';
import { jsonSchema } from 'ai';
import { createSearchDocumentsTool } from '@/lib/rag/tool';
import { retrieveRelevant } from '@/lib/rag/retriever';
import { indexProjectDocs, getProjectDocSources } from '@/lib/dev-assistant';
import type { ModelConfig } from '@/lib/models';

export interface RagOptions {
  ragEnabled?: boolean;
  ragThreshold?: number;
  ragTopK?: number;
  ragRerank?: boolean;
  ragSourceFilter?: string[];
}

export interface RagSetupResult {
  ragEnabled: boolean;
  ragSystemSection: string;
  preSearchResults: PreSearchResults | null;
  searchDocumentsTool: ReturnType<typeof tool<Parameters<typeof jsonSchema>[0], unknown>> | null;
  projectSources: string[];
}

export type PreSearchResults = {
  results: Array<{ text: string; source: string; section: string; score: number }>;
  query: string;
  totalResults: number;
};

/**
 * Builds the RAG system prompt section injected when RAG mode is active.
 */
export function buildRagSystemSection(): string {
  return `=== RAG MODE ===
You have access to the user's indexed documents via the search_documents tool.

Rules:
1. Use ONLY information from the retrieved documents. Do NOT use your training knowledge.
2. If no relevant information is found, say: "I could not find relevant information in the indexed documents."
3. Answer directly and concisely — no more than 3 paragraphs.
4. Do not narrate your search process (no "I'll search...", "Let me look...", "Based on the documents...").
===`;
}

/**
 * Indexes project docs and returns available project sources.
 * If indexing fails, RAG is disabled for this request.
 */
export async function initProjectDocs(): Promise<{ success: boolean; projectSources: string[] }> {
  try {
    await Promise.race([
      indexProjectDocs(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Indexing timed out (5s)')), 5000)),
    ]);
    return { success: true, projectSources: getProjectDocSources() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\x1b[31m[Agent]\x1b[0m Project doc indexing failed (Ollama may not be running):', message);
    return { success: false, projectSources: getProjectDocSources() };
  }
}

/**
 * Creates and registers the search_documents tool based on RAG options and project sources.
 */
export function createRagSearchTool(options: RagOptions, projectSources: string[]): ReturnType<typeof createSearchDocumentsTool> | null {
  const { ragEnabled, ragThreshold, ragTopK, ragRerank, ragSourceFilter } = options;

  if (projectSources.length > 0 || ragEnabled) {
    return createSearchDocumentsTool({
      threshold: ragThreshold ?? 0.3,
      topK: ragTopK ?? 10,
      rerank: ragRerank ?? true,
      sourceFilter: ragEnabled && ragSourceFilter && ragSourceFilter.length > 0
        ? ragSourceFilter
        : (projectSources.length > 0 ? projectSources : undefined),
    });
  }
  return null;
}

/**
 * Performs pre-search for weak-tier models that cannot use tool calling.
 * Returns pre-fetched results and a context block to inject into the system prompt.
 */
export async function performPreSearch(
  userMessage: string,
  modelConfig: ModelConfig,
  options: RagOptions,
): Promise<{ preSearchResults: PreSearchResults | null; contextBlock: string | null }> {
  const { ragEnabled, ragTopK, ragThreshold, ragRerank, ragSourceFilter } = options;

  const usePreSearch = ragEnabled && modelConfig.tier === 'weak';
  if (!usePreSearch) {
    return { preSearchResults: null, contextBlock: null };
  }

  const preSearchResults = await retrieveRelevant(
    userMessage,
    ragTopK,
    ragThreshold,
    5,
    ragRerank,
    ragSourceFilter,
  );
  console.log(`\x1b[35m[RAG]\x1b[0m Pre-search "${userMessage.slice(0, 60)}": ${preSearchResults.totalResults} results (weak model, tool calling bypassed)`);

  if (preSearchResults.totalResults > 0) {
    const contextBlock = preSearchResults.results
      .map((r) => r.text)
      .join('\n\n---\n\n');
    return { preSearchResults, contextBlock };
  }

  return { preSearchResults, contextBlock: null };
}

/**
 * Extracts and emits RAG sources from either pre-search results (weak models)
 * or tool call results (strong models). Returns the sources array or null if
 * the response is a refusal or no sources found.
 */
export function extractRagSources(
  finalText: string,
  preSearchResults: PreSearchResults | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finalSteps: any[] | undefined,
): Array<{ text: string; source: string; section: string; score: number }> | null {
  // Check if the LLM indicated it couldn't find relevant info
  const refusalPatterns = [
    /could not find (?:any |relevant )?information/i,
    /no (?:relevant )?information (?:was )?found/i,
    /don'?t have (?:the )?relevant information/i,
    /falls? outside (?:the )?scope/i,
    /not (?:covered |discussed |mentioned )in the (?:indexed |uploaded )/i,
    /couldn'?t find (?:any )?relevant/i,
  ];
  const isRefusal = refusalPatterns.some((p) => p.test(finalText));

  if (isRefusal) {
    return null;
  }

  let ragSources: Array<{ text: string; source: string; section: string; score: number }> = [];

  if (preSearchResults && preSearchResults.totalResults > 0) {
    // Weak model: sources from pre-search
    ragSources = preSearchResults.results;
  } else if (finalSteps) {
    // Strong model: sources from tool call results
    const ragSourceMap = new Map<string, { text: string; source: string; section: string; score: number }>();
    for (const step of finalSteps) {
      for (const toolResult of step.toolResults) {
        if (toolResult.toolName === 'search_documents' && toolResult.output) {
          const r = toolResult.output as { results?: Array<{ text: string; source: string; section: string; score: number }>; totalResults?: number };
          if (r.results && (r.totalResults ?? 0) > 0) {
            for (const src of r.results) {
              const key = `${src.source}::${src.section}::${src.text.slice(0, 100)}`;
              const existing = ragSourceMap.get(key);
              if (!existing || src.score > existing.score) {
                ragSourceMap.set(key, src);
              }
            }
          }
        }
      }
    }
    ragSources = Array.from(ragSourceMap.values())
      .sort((a, b) => b.score - a.score);
  }

  return ragSources.length > 0 ? ragSources : null;
}
