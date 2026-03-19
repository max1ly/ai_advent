import { describe, it, expect } from 'vitest';

interface RagSource {
  text: string;
  source: string;
  section: string;
  score: number;
}

// Mirror the inline dedup logic from agent.ts
function deduplicateRagSources(ragSources: RagSource[]): RagSource[] {
  const dedupMap = new Map<string, RagSource>();
  for (const src of ragSources) {
    const key = `${src.source}::${src.section}`;
    const existing = dedupMap.get(key);
    if (!existing || src.score > existing.score) {
      dedupMap.set(key, src);
    }
  }
  return Array.from(dedupMap.values());
}

describe('RAG source deduplication', () => {
  it('removes duplicates with same source and section, keeping highest score', () => {
    const sources: RagSource[] = [
      { text: 'chunk A', source: 'doc.pdf', section: 'Intro', score: 0.5 },
      { text: 'chunk B', source: 'doc.pdf', section: 'Intro', score: 0.3 },
      { text: 'chunk C', source: 'doc.pdf', section: 'Intro', score: 0.7 },
    ];
    const result = deduplicateRagSources(sources);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.7);
    expect(result[0].text).toBe('chunk C');
  });

  it('keeps sources with different sections', () => {
    const sources: RagSource[] = [
      { text: 'chunk A', source: 'doc.pdf', section: 'Intro', score: 0.5 },
      { text: 'chunk B', source: 'doc.pdf', section: 'Results', score: 0.3 },
    ];
    const result = deduplicateRagSources(sources);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.section).sort()).toEqual(['Intro', 'Results']);
  });

  it('keeps sources with different files', () => {
    const sources: RagSource[] = [
      { text: 'chunk A', source: 'doc1.pdf', section: 'Intro', score: 0.5 },
      { text: 'chunk B', source: 'doc2.pdf', section: 'Intro', score: 0.3 },
    ];
    const result = deduplicateRagSources(sources);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.source).sort()).toEqual(['doc1.pdf', 'doc2.pdf']);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateRagSources([])).toEqual([]);
  });

  it('handles single source', () => {
    const sources: RagSource[] = [
      { text: 'only one', source: 'doc.pdf', section: 'Intro', score: 0.1 },
    ];
    const result = deduplicateRagSources(sources);
    expect(result).toHaveLength(1);
  });

  it('reduces 25 sources with heavy overlap to fewer unique entries', () => {
    const sources: RagSource[] = [];
    // Simulate 5 searches returning 5 results each, with 3 unique source+section combos
    for (let search = 0; search < 5; search++) {
      sources.push(
        { text: `search${search}-a`, source: 'ml.pdf', section: 'Intro', score: 0.2 + search * 0.05 },
        { text: `search${search}-b`, source: 'ml.pdf', section: 'Methods', score: 0.3 + search * 0.05 },
        { text: `search${search}-c`, source: 'dl.pdf', section: 'Results', score: 0.4 + search * 0.05 },
        { text: `search${search}-d`, source: 'ml.pdf', section: 'Intro', score: 0.25 + search * 0.05 },
        { text: `search${search}-e`, source: 'dl.pdf', section: 'Results', score: 0.35 + search * 0.05 },
      );
    }
    const result = deduplicateRagSources(sources);
    expect(result).toHaveLength(3); // ml.pdf::Intro, ml.pdf::Methods, dl.pdf::Results
    // Best scores should be from last search (highest scores)
    expect(result.find(s => s.source === 'ml.pdf' && s.section === 'Intro')?.score).toBeCloseTo(0.45);
    expect(result.find(s => s.source === 'ml.pdf' && s.section === 'Methods')?.score).toBeCloseTo(0.5);
    expect(result.find(s => s.source === 'dl.pdf' && s.section === 'Results')?.score).toBeCloseTo(0.6);
  });
});
