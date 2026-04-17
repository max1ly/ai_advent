import { describe, it, expect } from 'vitest';
import { chunkDocument, chunkStructureAware } from '@/lib/rag/chunker';

describe('chunkStructureAware', () => {
  it('returns chunks for markdown with headings', () => {
    const md = `# Intro\nHello world.\n\n## Details\nSome details here.`;
    const chunks = chunkStructureAware(md, 'readme.md', 'text/markdown');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].metadata.source).toBe('readme.md');
    expect(chunks[0].metadata.strategy).toBe('structure-aware');
    expect(chunks.some(c => c.metadata.section === 'Intro')).toBe(true);
    expect(chunks.some(c => c.metadata.section === 'Details')).toBe(true);
  });

  it('chunks code files by function boundaries', () => {
    const code = `import { foo } from 'bar';\n\nexport function greet() {\n  return 'hi';\n}\n\nexport function bye() {\n  return 'bye';\n}`;
    const chunks = chunkStructureAware(code, 'utils.ts', 'text/typescript');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some(c => c.metadata.section === 'greet')).toBe(true);
    expect(chunks.some(c => c.metadata.section === 'bye')).toBe(true);
  });

  it('falls back to paragraph splitting for plain text', () => {
    const text = `First paragraph here.\n\nSecond paragraph here.`;
    const chunks = chunkStructureAware(text, 'notes.txt', 'text/plain');
    expect(chunks.length).toBe(2);
    expect(chunks[0].text).toContain('First paragraph');
    expect(chunks[1].text).toContain('Second paragraph');
  });

  it('uses media type fallback when filename has no extension', () => {
    const md = `# Title\nContent here.`;
    const chunks = chunkStructureAware(md, 'noext', 'text/markdown');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.section).toBe('Title');
  });

  it('returns single chunk for empty-ish content', () => {
    const chunks = chunkStructureAware('just one line', 'f.txt', 'text/plain');
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe('just one line');
  });

  it('returns empty array for empty input', () => {
    const chunks = chunkStructureAware('', 'f.txt', 'text/plain');
    expect(chunks.length).toBe(0);
  });

  it('sub-splits oversized chunks at sentence boundaries', () => {
    const longParagraph = Array(50).fill('This is a sentence that is fairly long and takes up some space.').join(' ');
    const chunks = chunkStructureAware(longParagraph, 'big.txt', 'text/plain');
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(2500);
    }
  });
});

describe('chunkDocument', () => {
  it('delegates to chunkStructureAware', () => {
    const md = `# Hello\nWorld`;
    const a = chunkStructureAware(md, 'a.md', 'text/markdown');
    const b = chunkDocument(md, 'a.md', 'text/markdown');
    expect(b).toEqual(a);
  });
});
