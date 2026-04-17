import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSetModel = vi.fn();
const mockSetStrategy = vi.fn();

vi.mock('@/lib/agent', () => {
  return {
    ChatAgent: class MockChatAgent {
      setModel = mockSetModel;
      setStrategy = mockSetStrategy;
      run = vi.fn();
      constructor() {}
    },
  };
});

vi.mock('@/lib/db', () => ({
  getSessionMessages: vi.fn().mockReturnValue([]),
  saveMessage: vi.fn().mockReturnValue(1),
  saveFile: vi.fn(),
}));

vi.mock('@/lib/mcp/manager', () => ({
  mcpManager: {},
}));

import { getOrCreateAgent, getAgent, deleteSession } from '@/lib/sessions';

beforeEach(() => {
  vi.clearAllMocks();
  deleteSession('test-session');
  deleteSession('session-2');
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
});

describe('getAgent', () => {
  it('returns null for unknown session', () => {
    expect(getAgent('unknown')).toBeNull();
  });

  it('returns agent after creation', () => {
    const { agent } = getOrCreateAgent('session-2');
    expect(getAgent('session-2')).toBe(agent);
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
});
