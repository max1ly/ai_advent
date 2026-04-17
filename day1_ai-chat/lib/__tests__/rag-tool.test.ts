import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/rag/retriever', () => ({
  retrieveRelevant: vi.fn().mockResolvedValue({
    results: [{ text: 'hello', source: 'doc.md', score: 0.9 }],
    query: 'test',
    totalResults: 1,
  }),
}));

import { createSearchDocumentsTool, searchDocumentsTool } from '@/lib/rag/tool';
import { retrieveRelevant } from '@/lib/rag/retriever';

describe('createSearchDocumentsTool', () => {
  it('returns a tool object with description and execute', () => {
    const tool = createSearchDocumentsTool();
    expect(tool).toHaveProperty('description');
    expect(tool).toHaveProperty('execute');
    expect(typeof tool.description).toBe('string');
    expect(typeof tool.execute).toBe('function');
  });

  it('execute calls retrieveRelevant with defaults', async () => {
    const tool = createSearchDocumentsTool();
    const result = await tool.execute({ query: 'hello' }, { toolCallId: 'tc1', messages: [], abortSignal: new AbortController().signal });
    expect(retrieveRelevant).toHaveBeenCalledWith('hello', 10, 0.3, 5, true, undefined);
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('totalResults', 1);
  });

  it('passes custom options to retrieveRelevant', async () => {
    const tool = createSearchDocumentsTool({ threshold: 0.5, topK: 3, rerank: false, sourceFilter: ['a.md'] });
    await tool.execute({ query: 'test' }, { toolCallId: 'tc2', messages: [], abortSignal: new AbortController().signal });
    expect(retrieveRelevant).toHaveBeenCalledWith('test', 3, 0.5, 5, false, ['a.md']);
  });

  it('returns error object when retrieveRelevant throws', async () => {
    vi.mocked(retrieveRelevant).mockRejectedValueOnce(new Error('embedding failed'));
    const tool = createSearchDocumentsTool();
    const result = await tool.execute({ query: 'fail' }, { toolCallId: 'tc3', messages: [], abortSignal: new AbortController().signal });
    expect(result).toHaveProperty('error', 'embedding failed');
    expect(result).toHaveProperty('totalResults', 0);
  });
});

describe('searchDocumentsTool', () => {
  it('is a pre-built tool instance with defaults', () => {
    expect(searchDocumentsTool).toHaveProperty('execute');
    expect(searchDocumentsTool).toHaveProperty('description');
  });
});
