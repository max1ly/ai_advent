import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { chunkDocument } from '@/lib/rag/chunker';
import { embedTexts } from '@/lib/rag/embedder';
import { insertChunks, getIndexedFiles, deleteBySource, deleteAll } from '@/lib/rag/store';
import { resetProjectIndex } from '@/lib/dev-assistant';
import type { IndexingStats } from '@/lib/rag/types';

export async function GET() {
  try {
    const files = await getIndexedFiles();
    return NextResponse.json({ files });
  } catch (err) {
    console.error('[RAG] Error listing indexed files:', err);
    return NextResponse.json({ files: [] });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      filename,
      mediaType,
      data: base64Data,
    } = body as {
      filename: string;
      mediaType: string;
      data: string;
    };

    if (!filename || !base64Data) {
      return NextResponse.json(
        { error: 'Missing required fields: filename, data' },
        { status: 400 },
      );
    }

    const startTime = Date.now();

    // 1. Extract text from file
    const buffer = Buffer.from(base64Data, 'base64');
    let text: string;

    if (mediaType === 'application/pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      text = result.text;
      await parser.destroy();
    } else {
      text = buffer.toString('utf-8');
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text content could be extracted from the file' },
        { status: 422 },
      );
    }

    // 2. Chunk the document
    const chunks = chunkDocument(text, filename, mediaType);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'Document produced no chunks after processing' },
        { status: 422 },
      );
    }

    // 3. Generate embeddings
    const chunkTexts = chunks.map(c => c.text);
    const embeddings = await embedTexts(chunkTexts);

    // 4. Store in LanceDB
    await insertChunks(chunks, embeddings);

    // 5. Calculate stats
    const chunkSizes = chunks.map(c => c.text.length);
    const stats: IndexingStats = {
      filename,
      strategy: 'structure-aware' as const,
      totalChunks: chunks.length,
      avgChunkSize: Math.round(chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length),
      minChunkSize: Math.min(...chunkSizes),
      maxChunkSize: Math.max(...chunkSizes),
      embeddingDimensions: embeddings[0]?.length ?? 0,
      timeMs: Date.now() - startTime,
      previews: chunks.slice(0, 3).map(c => ({
        text: c.text.slice(0, 200) + (c.text.length > 200 ? '...' : ''),
        metadata: c.metadata,
      })),
    };

    console.log(
      `[RAG] Indexed "${filename}": ${stats.totalChunks} chunks, ` +
      `${stats.embeddingDimensions}d embeddings, ${stats.timeMs}ms`,
    );

    return NextResponse.json(stats);
  } catch (err) {
    console.error('[RAG] Indexing error:', err);
    const message = err instanceof Error ? err.message : 'Unknown indexing error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { source, all } = body as { source?: string; all?: boolean };

    if (all) {
      await deleteAll();
      resetProjectIndex();
      console.log('[RAG] Cleared entire index');
      return NextResponse.json({ deleted: true, all: true });
    }

    if (!source || typeof source !== 'string' || !source.trim()) {
      return NextResponse.json(
        { error: "Missing 'source' or 'all' in request body" },
        { status: 400 },
      );
    }

    await deleteBySource(source);
    resetProjectIndex();
    console.log(`[RAG] Deleted "${source}" from index`);
    return NextResponse.json({ deleted: true, source });
  } catch (err) {
    console.error('[RAG] Delete error:', err);
    const message = err instanceof Error ? err.message : 'Unknown delete error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
