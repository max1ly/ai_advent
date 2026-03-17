import type { Chunk, ChunkingStrategy } from './types';

/**
 * Fixed-size chunking: split text by character count with overlap.
 */
export function chunkFixedSize(
  text: string,
  source: string,
  chunkSize = 500,
): Chunk[] {
  if (chunkSize < 50) chunkSize = 50;
  const overlap = Math.floor(chunkSize * 0.1);
  const chunks: Chunk[] = [];
  let start = 0;
  let chunkId = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkText = text.slice(start, end).trim();

    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        metadata: {
          source,
          chunk_id: chunkId++,
          strategy: 'fixed-size',
          start_char: start,
          end_char: end,
        },
      });
    }

    // Move forward by chunkSize minus overlap
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Structure-aware chunking: split by document structure.
 */
export function chunkStructureAware(
  text: string,
  source: string,
  fileType: string,
): Chunk[] {
  const ext = getExtension(source, fileType);

  if (ext === 'md' || ext === 'markdown') {
    return chunkMarkdown(text, source);
  }
  if (isCodeFile(ext)) {
    return chunkCode(text, source);
  }
  // PDF text or plain text: split by paragraphs
  return chunkParagraphs(text, source);
}

/**
 * Router: pick strategy and chunk.
 */
export function chunkDocument(
  text: string,
  source: string,
  fileType: string,
  strategy: ChunkingStrategy,
  chunkSize?: number,
): Chunk[] {
  if (strategy === 'fixed-size') {
    return chunkFixedSize(text, source, chunkSize);
  }
  return chunkStructureAware(text, source, fileType);
}

// --- Internal helpers ---

function getExtension(filename: string, mediaType: string): string {
  // Try filename extension first
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx !== -1) {
    return filename.slice(dotIdx + 1).toLowerCase();
  }
  // Fall back to media type
  if (mediaType.includes('markdown')) return 'md';
  if (mediaType.includes('javascript')) return 'js';
  if (mediaType.includes('typescript')) return 'ts';
  if (mediaType.includes('python')) return 'py';
  if (mediaType.includes('pdf')) return 'pdf';
  return 'txt';
}

function isCodeFile(ext: string): boolean {
  return ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'rb'].includes(ext);
}

const MAX_CHUNK_CHARS = 2000;

/**
 * Split oversized chunks at sentence boundaries.
 */
function subSplitIfNeeded(text: string, source: string, baseChunkId: number, section?: string): Chunk[] {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [{
      text,
      metadata: {
        source,
        chunk_id: baseChunkId,
        strategy: 'structure-aware',
        section,
      },
    }];
  }

  // Split at sentence boundaries
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  const chunks: Chunk[] = [];
  let current = '';
  let id = baseChunkId;

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push({
        text: current.trim(),
        metadata: { source, chunk_id: id++, strategy: 'structure-aware', section },
      });
      current = '';
    }
    current += sentence;
  }

  if (current.trim().length > 0) {
    chunks.push({
      text: current.trim(),
      metadata: { source, chunk_id: id++, strategy: 'structure-aware', section },
    });
  }

  return chunks;
}

/**
 * Markdown: split by headings (h1-h3).
 */
function chunkMarkdown(text: string, source: string): Chunk[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const sections: { title: string; content: string }[] = [];
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

  // Remaining content after last heading
  const remaining = text.slice(lastIdx).trim();
  if (remaining.length > 0) {
    sections.push({ title: lastTitle, content: remaining });
  }

  // If no headings found, treat as single section
  if (sections.length === 0 && text.trim().length > 0) {
    sections.push({ title: '(document)', content: text.trim() });
  }

  const chunks: Chunk[] = [];
  let chunkId = 0;

  for (const section of sections) {
    const subChunks = subSplitIfNeeded(section.content, source, chunkId, section.title);
    for (const c of subChunks) {
      c.metadata.chunk_id = chunkId++;
      chunks.push(c);
    }
  }

  return chunks;
}

/**
 * Code: split by function/class boundaries.
 */
function chunkCode(text: string, source: string): Chunk[] {
  // Match function, class, export declarations
  const boundaryRegex = /^(?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*=\s*(?:async\s+)?(?:\(|function))/gm;
  const boundaries: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = boundaryRegex.exec(text)) !== null) {
    boundaries.push(match.index);
  }

  if (boundaries.length === 0) {
    // No function boundaries found — treat as paragraphs
    return chunkParagraphs(text, source);
  }

  const chunks: Chunk[] = [];
  let chunkId = 0;

  // Content before first boundary
  if (boundaries[0] > 0) {
    const preamble = text.slice(0, boundaries[0]).trim();
    if (preamble.length > 0) {
      const subChunks = subSplitIfNeeded(preamble, source, chunkId, '(imports)');
      for (const c of subChunks) {
        c.metadata.chunk_id = chunkId++;
        chunks.push(c);
      }
    }
  }

  // Each boundary to next boundary
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : text.length;
    const block = text.slice(start, end).trim();

    if (block.length > 0) {
      // Extract function/class name for section metadata
      const nameMatch = block.match(/(?:function|class)\s+(\w+)|const\s+(\w+)/);
      const section = nameMatch?.[1] || nameMatch?.[2] || '(block)';

      const subChunks = subSplitIfNeeded(block, source, chunkId, section);
      for (const c of subChunks) {
        c.metadata.chunk_id = chunkId++;
        chunks.push(c);
      }
    }
  }

  return chunks;
}

/**
 * Plain text / PDF: split by double-newline paragraphs.
 */
function chunkParagraphs(text: string, source: string): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: Chunk[] = [];
  let chunkId = 0;

  for (const para of paragraphs) {
    const subChunks = subSplitIfNeeded(para.trim(), source, chunkId);
    for (const c of subChunks) {
      c.metadata.chunk_id = chunkId++;
      chunks.push(c);
    }
  }

  // If no paragraphs (single block), return whole text
  if (chunks.length === 0 && text.trim().length > 0) {
    const subChunks = subSplitIfNeeded(text.trim(), source, 0);
    for (const c of subChunks) {
      c.metadata.chunk_id = chunkId++;
      chunks.push(c);
    }
  }

  return chunks;
}
