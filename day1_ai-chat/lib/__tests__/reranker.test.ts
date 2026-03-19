import { describe, it, expect } from 'vitest';
import { rerankAndFilter } from '../rag/reranker';

describe('rerankAndFilter', () => {
  // Create a simple unit vector pointing in a specific direction
  function makeVector(angle: number, dims = 4): number[] {
    const v = new Array(dims).fill(0);
    v[0] = Math.cos(angle);
    v[1] = Math.sin(angle);
    return v;
  }

  const queryVector = makeVector(0); // [1, 0, 0, 0]

  it('ranks chunks by cosine similarity (most similar first)', () => {
    const chunks = [
      { text: 'far', source: 'a.pdf', section: 'S1', vector: makeVector(Math.PI / 2), _distance: 1.4 },
      { text: 'close', source: 'b.pdf', section: 'S1', vector: makeVector(0.1), _distance: 0.1 },
      { text: 'mid', source: 'c.pdf', section: 'S1', vector: makeVector(0.5), _distance: 0.5 },
    ];

    const results = rerankAndFilter(queryVector, chunks, 0, 10);
    expect(results[0].text).toBe('close');
    expect(results[1].text).toBe('mid');
    expect(results[2].text).toBe('far');
  });

  it('filters chunks below threshold', () => {
    const chunks = [
      { text: 'good', source: 'a.pdf', section: 'S1', vector: makeVector(0.1), _distance: 0.1 },
      { text: 'bad', source: 'b.pdf', section: 'S1', vector: makeVector(Math.PI / 2), _distance: 1.4 },
    ];

    const results = rerankAndFilter(queryVector, chunks, 0.5, 10);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('good');
  });

  it('caps results at maxResults', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      text: `chunk-${i}`,
      source: 'a.pdf',
      section: 'S1',
      vector: makeVector(i * 0.1),
      _distance: i * 0.1,
    }));

    const results = rerankAndFilter(queryVector, chunks, 0, 3);
    expect(results).toHaveLength(3);
  });

  it('returns empty array when all below threshold', () => {
    const chunks = [
      { text: 'irrelevant', source: 'a.pdf', section: 'S1', vector: makeVector(Math.PI), _distance: 2.0 },
    ];

    const results = rerankAndFilter(queryVector, chunks, 0.5, 10);
    expect(results).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const results = rerankAndFilter(queryVector, [], 0, 10);
    expect(results).toHaveLength(0);
  });

  it('produces scores between 0 and 1 for unit vectors', () => {
    const chunks = [
      { text: 'a', source: 'a.pdf', section: 'S1', vector: makeVector(0.3), _distance: 0.3 },
    ];

    const results = rerankAndFilter(queryVector, chunks, 0, 10);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].score).toBeLessThanOrEqual(1);
  });
});
