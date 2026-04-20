import { createSearchDocumentsTool, searchDocumentsTool } from '@/lib/rag/tool';

vi.mock('@/lib/rag/retriever', () => ({
  retrieveRelevant: vi.fn(),
}));

import { retrieveRelevant } from '@/lib/rag/retriever';

const mockRetrieveRelevant = vi.mocked(retrieveRelevant);

describe('createSearchDocumentsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a tool with correct description and inputSchema', () => {
    const tool = createSearchDocumentsTool();
    expect(tool.description).toContain('Search indexed documents');
    expect(tool.inputSchema).toBeDefined();
  });

  it('calls retrieveRelevant with default options', async () => {
    const mockResult = { results: [{ text: 'hello', source: 'doc.pdf', section: 'intro', score: 0.9 }], query: 'test', totalResults: 1 };
    mockRetrieveRelevant.mockResolvedValue(mockResult);

    const tool = createSearchDocumentsTool();
    const result = await tool.execute!({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: undefined as unknown as AbortSignal });

    expect(mockRetrieveRelevant).toHaveBeenCalledWith('test', 10, 0.3, 5, true, undefined);
    expect(result).toEqual(mockResult);
  });

  it('passes custom options to retrieveRelevant', async () => {
    const mockResult = { results: [], query: 'q', totalResults: 0 };
    mockRetrieveRelevant.mockResolvedValue(mockResult);

    const tool = createSearchDocumentsTool({ topK: 5, threshold: 0.5, rerank: false, sourceFilter: ['doc1'] });
    await tool.execute!({ query: 'q' }, { toolCallId: '2', messages: [], abortSignal: undefined as unknown as AbortSignal });

    expect(mockRetrieveRelevant).toHaveBeenCalledWith('q', 5, 0.5, 5, false, ['doc1']);
  });

  it('returns error object when retrieveRelevant throws an Error', async () => {
    mockRetrieveRelevant.mockRejectedValue(new Error('DB connection lost'));

    const tool = createSearchDocumentsTool();
    const result = await tool.execute!({ query: 'fail' }, { toolCallId: '3', messages: [], abortSignal: undefined as unknown as AbortSignal });

    expect(result).toEqual({
      results: [],
      query: 'fail',
      totalResults: 0,
      error: 'DB connection lost',
    });
  });

  it('returns generic error message when non-Error is thrown', async () => {
    mockRetrieveRelevant.mockRejectedValue('unexpected string error');

    const tool = createSearchDocumentsTool();
    const result = await tool.execute!({ query: 'fail2' }, { toolCallId: '4', messages: [], abortSignal: undefined as unknown as AbortSignal });

    expect(result).toEqual({
      results: [],
      query: 'fail2',
      totalResults: 0,
      error: 'Search failed',
    });
  });

  it('exports a default searchDocumentsTool instance', () => {
    expect(searchDocumentsTool).toBeDefined();
    expect(searchDocumentsTool.description).toContain('Search indexed documents');
  });
});
