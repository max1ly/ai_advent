import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSetModel = vi.fn();
const mockSetStrategy = vi.fn();
const mockConstructor = vi.fn();

vi.mock('@/lib/agent', () => {
  return {
    ChatAgent: class MockChatAgent {
      setModel = mockSetModel;
      setStrategy = mockSetStrategy;
      run = vi.fn();
      constructor(opts: unknown) {
        mockConstructor(opts);
      }
    },
  };
});

const mockGetSessionMessages = vi.fn().mockReturnValue([]);
const mockSaveMessage = vi.fn().mockReturnValue(1);
const mockSaveFile = vi.fn();

vi.mock('@/lib/db', () => ({
  getSessionMessages: (...args: unknown[]) => mockGetSessionMessages(...args),
  saveMessage: (...args: unknown[]) => mockSaveMessage(...args),
  saveFile: (...args: unknown[]) => mockSaveFile(...args),
}));

vi.mock('@/lib/mcp/manager', () => ({
  mcpManager: {},
}));

import { getOrCreateAgent, getAgent, deleteSession } from '@/lib/sessions';

beforeEach(() => {
  vi.clearAllMocks();
  deleteSession('test-session');
  deleteSession('session-2');
  deleteSession('session-3');
});

describe('getOrCreateAgent', () => {
  it('creates a new agent for a new session ID', () => {
    const result = getOrCreateAgent('test-session');
    expect(result.sessionId).toBe('test-session');
    expect(result.agent).toBeDefined();
  });

  it('generates a UUID when sessionId is null', () => {
    const result = getOrCreateAgent(null);
    expect(result.sessionId).toBeTruthy();
    expect(result.sessionId.length).toBeGreaterThan(0);
    // UUID format check
    expect(result.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    deleteSession(result.sessionId);
  });

  it('returns the same agent for an existing session', () => {
    const first = getOrCreateAgent('test-session');
    const second = getOrCreateAgent('test-session');
    expect(second.agent).toBe(first.agent);
  });

  it('calls setModel when model is passed on existing session', () => {
    getOrCreateAgent('test-session');
    getOrCreateAgent('test-session', 'deepseek-chat');
    expect(mockSetModel).toHaveBeenCalledWith('deepseek-chat');
  });

  it('calls setStrategy when strategy is passed on existing session', () => {
    getOrCreateAgent('test-session');
    const strategy = { mode: 'plan' as const };
    getOrCreateAgent('test-session', undefined, strategy);
    expect(mockSetStrategy).toHaveBeenCalledWith(strategy);
  });

  it('does not call setModel when model is undefined on existing session', () => {
    getOrCreateAgent('test-session');
    getOrCreateAgent('test-session');
    expect(mockSetModel).not.toHaveBeenCalled();
  });

  it('does not call setStrategy when strategy is undefined on existing session', () => {
    getOrCreateAgent('test-session');
    getOrCreateAgent('test-session');
    expect(mockSetStrategy).not.toHaveBeenCalled();
  });

  it('does not query DB when sessionId is null', () => {
    const result = getOrCreateAgent(null);
    expect(mockGetSessionMessages).not.toHaveBeenCalled();
    deleteSession(result.sessionId);
  });

  it('queries DB for history when sessionId is provided and session is new', () => {
    mockGetSessionMessages.mockReturnValue([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
    const result = getOrCreateAgent('session-3');
    expect(mockGetSessionMessages).toHaveBeenCalledWith('session-3');
    expect(mockConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-3',
        history: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ],
      }),
    );
    deleteSession(result.sessionId);
  });

  it('passes model and strategy to ChatAgent constructor for new sessions', () => {
    const strategy = { mode: 'act' as const };
    getOrCreateAgent('test-session', 'gpt-4', strategy);
    expect(mockConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4',
        sessionId: 'test-session',
        strategy,
      }),
    );
  });

  it('does not create a new agent on reuse — constructor called once', () => {
    getOrCreateAgent('test-session');
    getOrCreateAgent('test-session');
    getOrCreateAgent('test-session');
    expect(mockConstructor).toHaveBeenCalledTimes(1);
  });

  it('manages multiple independent sessions', () => {
    const a = getOrCreateAgent('test-session');
    const b = getOrCreateAgent('session-2');
    expect(a.agent).not.toBe(b.agent);
    expect(a.sessionId).toBe('test-session');
    expect(b.sessionId).toBe('session-2');
  });

  it('recreates agent after session is deleted', () => {
    const first = getOrCreateAgent('test-session');
    deleteSession('test-session');
    const second = getOrCreateAgent('test-session');
    expect(second.agent).not.toBe(first.agent);
    expect(mockConstructor).toHaveBeenCalledTimes(2);
  });

  it('onMessagePersist callback saves message and files', () => {
    getOrCreateAgent('test-session');
    // Extract the onMessagePersist callback from the constructor call
    const constructorOpts = mockConstructor.mock.calls[0][0];
    const onMessagePersist = constructorOpts.onMessagePersist;

    onMessagePersist('user', 'hello');
    expect(mockSaveMessage).toHaveBeenCalledWith('test-session', 'user', 'hello', undefined);

    mockSaveMessage.mockReturnValue(42);
    const files = [
      { filename: 'test.png', mediaType: 'image/png', data: btoa('fake-data') },
    ];
    onMessagePersist('assistant', 'here is an image', files);
    expect(mockSaveMessage).toHaveBeenCalledWith('test-session', 'assistant', 'here is an image', undefined);
    expect(mockSaveFile).toHaveBeenCalledWith(
      42,
      'test-session',
      'test.png',
      'image/png',
      expect.any(Buffer),
    );
  });

  it('onMessagePersist does not call saveFile when files array is empty', () => {
    getOrCreateAgent('test-session');
    const constructorOpts = mockConstructor.mock.calls[0][0];
    const onMessagePersist = constructorOpts.onMessagePersist;

    onMessagePersist('user', 'hello', []);
    expect(mockSaveFile).not.toHaveBeenCalled();
  });
});

describe('getAgent', () => {
  it('returns null for unknown session', () => {
    expect(getAgent('unknown')).toBeNull();
  });

  it('returns agent after creation', () => {
    const { agent } = getOrCreateAgent('session-2');
    expect(getAgent('session-2')).toBe(agent);
  });

  it('returns null after session is deleted', () => {
    getOrCreateAgent('session-2');
    deleteSession('session-2');
    expect(getAgent('session-2')).toBeNull();
  });
});

describe('deleteSession', () => {
  it('removes the session so getAgent returns null', () => {
    getOrCreateAgent('session-2');
    deleteSession('session-2');
    expect(getAgent('session-2')).toBeNull();
  });

  it('is a no-op for unknown session', () => {
    expect(() => deleteSession('nonexistent')).not.toThrow();
  });

  it('only removes the targeted session, not others', () => {
    getOrCreateAgent('test-session');
    getOrCreateAgent('session-2');
    deleteSession('test-session');
    expect(getAgent('test-session')).toBeNull();
    expect(getAgent('session-2')).not.toBeNull();
  });
});
