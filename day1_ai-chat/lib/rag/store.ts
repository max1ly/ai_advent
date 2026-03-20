import * as lancedb from '@lancedb/lancedb';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { Chunk } from './types';

const TABLE_NAME = 'documents';

let dbInstance: lancedb.Connection | null = null;

async function getDb(): Promise<lancedb.Connection> {
  if (!dbInstance) {
    const dbDir = join(process.cwd(), 'data', 'lancedb');
    mkdirSync(dbDir, { recursive: true });
    dbInstance = await lancedb.connect(dbDir);
    console.log('[RAG] LanceDB connected at', dbDir);
  }
  return dbInstance;
}

interface DocumentRecord {
  [key: string]: unknown;
  vector: number[];
  text: string;
  source: string;
  chunk_id: number;
  strategy: string;
  section: string;
  page: number;
  start_char: number;
  end_char: number;
  indexed_at: string;
}

/**
 * Insert chunks with their embeddings into LanceDB.
 */
export async function insertChunks(
  chunks: Chunk[],
  embeddings: number[][],
): Promise<void> {
  if (chunks.length === 0) return;
  if (chunks.length !== embeddings.length) {
    throw new Error(
      `Chunk count (${chunks.length}) does not match embedding count (${embeddings.length})`,
    );
  }

  const db = await getDb();

  const records: DocumentRecord[] = chunks.map((chunk, i) => ({
    vector: embeddings[i],
    text: chunk.text,
    source: chunk.metadata.source,
    chunk_id: chunk.metadata.chunk_id,
    strategy: chunk.metadata.strategy,
    section: chunk.metadata.section ?? '',
    page: chunk.metadata.page ?? -1,
    start_char: chunk.metadata.start_char ?? -1,
    end_char: chunk.metadata.end_char ?? -1,
    indexed_at: new Date().toISOString(),
  }));

  const tableNames = await db.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    const table = await db.openTable(TABLE_NAME);
    await table.add(records);
  } else {
    await db.createTable(TABLE_NAME, records);
    console.log(`[RAG] Created table "${TABLE_NAME}"`);
  }

  console.log(`[RAG] Inserted ${records.length} chunks from "${chunks[0]?.metadata.source}"`);
}

/**
 * Get list of all indexed source filenames.
 */
export async function getIndexedFiles(): Promise<string[]> {
  const db = await getDb();
  const tableNames = await db.tableNames();

  if (!tableNames.includes(TABLE_NAME)) {
    return [];
  }

  const table = await db.openTable(TABLE_NAME);
  const results = await table.query().select(['source']).toArray();
  const unique = Array.from(new Set(results.map(r => r.source as string)));
  return unique;
}

/**
 * Search for similar chunks by vector similarity.
 * Returns results with text, metadata, and distance score.
 */
export async function searchChunks(
  queryVector: number[],
  limit = 5,
  sourceFilter?: string[],
): Promise<Array<{ text: string; source: string; chunk_id: number; section: string; page: number; _distance: number; vector: number[] }>> {
  const db = await getDb();
  const tableNames = await db.tableNames();

  if (!tableNames.includes(TABLE_NAME)) {
    return [];
  }

  const table = await db.openTable(TABLE_NAME);
  let query = table.search(queryVector).limit(limit);
  if (sourceFilter && sourceFilter.length > 0) {
    const escaped = sourceFilter.map(s => s.replace(/'/g, "''"));
    const inList = escaped.map(s => `'${s}'`).join(', ');
    query = query.where(`source IN (${inList})`);
  }
  const results = await query.toArray();

  return results.map(r => ({
    text: r.text as string,
    source: r.source as string,
    chunk_id: r.chunk_id as number,
    section: r.section as string,
    page: r.page as number,
    _distance: r._distance as number,
    vector: Array.from(r.vector as Iterable<number>),
  }));
}
