// .github/scripts/rag.ts

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

// --- Types ---

interface DocChunk {
  text: string;
  source: string;
  embedding: number[];
}

// --- Cosine similarity (mirrors lib/rag/reranker.ts) ---

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

// --- Markdown chunking (simplified from lib/rag/chunker.ts) ---

const MAX_CHUNK_CHARS = 500;

function chunkMarkdown(text: string, source: string): Array<{ text: string; source: string }> {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const sections: Array<{ title: string; content: string }> = [];
  let lastIdx = 0;
  let lastTitle = '(preamble)';
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(text)) !== null) {
    const content = text.slice(lastIdx, match.index).trim();
    if (content.length > 0) {
      sections.push({ title: lastTitle, content });
    }
    lastTitle = match[2].trim();
    lastIdx = match.index + match[0].length;
  }
  // Capture trailing content
  const trailing = text.slice(lastIdx).trim();
  if (trailing.length > 0) {
    sections.push({ title: lastTitle, content: trailing });
  }

  // Split oversized sections at paragraph boundaries
  const chunks: Array<{ text: string; source: string }> = [];
  for (const section of sections) {
    const full = `${section.title}\n\n${section.content}`;
    if (full.length <= MAX_CHUNK_CHARS) {
      chunks.push({ text: full, source });
    } else {
      const paragraphs = section.content.split(/\n\n+/);
      let current = section.title;
      for (const para of paragraphs) {
        if (current.length + para.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
          chunks.push({ text: current, source });
          current = para;
        } else {
          current += '\n\n' + para;
        }
      }
      if (current.trim().length > 0) {
        chunks.push({ text: current, source });
      }
    }
  }

  return chunks;
}

// --- Embedding pipeline ---

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  // Set cache dir BEFORE pipeline creation (research finding)
  env.cacheDir = './.cache';
  console.log('\x1b[35m[RAG]\x1b[0m Loading embedding model (all-MiniLM-L6-v2 q8)...');
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
  console.log('\x1b[35m[RAG]\x1b[0m Model loaded');
  return extractor;
}

async function embed(text: string): Promise<number[]> {
  const ext = await getExtractor();
  const output = await ext(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

// --- Public API ---

const index: DocChunk[] = [];

/**
 * Index markdown documents into the in-memory RAG store.
 */
export async function indexDocs(docs: Array<{ content: string; source: string }>): Promise<number> {
  const allChunks: Array<{ text: string; source: string }> = [];
  for (const doc of docs) {
    allChunks.push(...chunkMarkdown(doc.content, doc.source));
  }

  console.log(`\x1b[35m[RAG]\x1b[0m Embedding ${allChunks.length} chunks from ${docs.length} docs...`);

  for (const chunk of allChunks) {
    const embedding = await embed(chunk.text);
    index.push({ text: chunk.text, source: chunk.source, embedding });
  }

  console.log(`\x1b[35m[RAG]\x1b[0m Indexed ${index.length} chunks`);
  return index.length;
}

/**
 * Search the index for the top-K most relevant chunks.
 */
export async function searchDocs(query: string, topK = 3): Promise<Array<{ text: string; source: string; score: number }>> {
  if (index.length === 0) return [];

  const queryEmbedding = await embed(query);

  const scored = index.map((chunk) => ({
    text: chunk.text,
    source: chunk.source,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
