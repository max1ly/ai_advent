export type ChunkingStrategy = 'fixed-size' | 'structure-aware';

export interface ChunkMetadata {
  source: string;
  chunk_id: number;
  strategy: ChunkingStrategy;
  // fixed-size specific
  start_char?: number;
  end_char?: number;
  // structure-aware specific
  section?: string;
  page?: number;
}

export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}

export interface IndexingStats {
  filename: string;
  strategy: ChunkingStrategy;
  totalChunks: number;
  avgChunkSize: number;
  minChunkSize: number;
  maxChunkSize: number;
  embeddingDimensions: number;
  timeMs: number;
  previews: { text: string; metadata: ChunkMetadata }[];
}
