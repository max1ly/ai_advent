import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getWorkingMemory,
  saveWorkingMemory,
  clearWorkingMemory,
  getProfile,
  saveProfileEntry,
  deleteProfileEntry,
  getSolutions,
  saveSolution,
  deleteSolution,
  getKnowledge,
  saveKnowledge,
  deleteKnowledge,
  clearAllMemory,
} from '@/lib/db';
import { MemoryManager } from '@/lib/memory';
import type { MemoryExtractionResult } from '@/lib/types';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

beforeEach(() => {
  clearAllMemory();
});

// --- Working Memory ---

describe('Working Memory', () => {
  it('saves and retrieves working memory', () => {
    saveWorkingMemory('session-1', 'implement auth', 'chose JWT', 'token vs session');
    const wm = getWorkingMemory('session-1');
    expect(wm).not.toBeNull();
    expect(wm!.task_description).toBe('implement auth');
    expect(wm!.progress).toBe('chose JWT');
    expect(wm!.hypotheses).toBe('token vs session');
  });

  it('upserts on same session_id', () => {
    saveWorkingMemory('session-1', 'task A', 'progress A', 'hyp A');
    saveWorkingMemory('session-1', 'task B', 'progress B', 'hyp B');
    const wm = getWorkingMemory('session-1');
    expect(wm!.task_description).toBe('task B');
    expect(wm!.progress).toBe('progress B');
  });

  it('clears working memory', () => {
    saveWorkingMemory('session-1', 'task', 'progress', 'hyp');
    clearWorkingMemory('session-1');
    expect(getWorkingMemory('session-1')).toBeNull();
  });

  it('returns null for unknown session', () => {
    expect(getWorkingMemory('nonexistent')).toBeNull();
  });
});

// --- Profile ---

describe('Profile', () => {
  it('inserts new key', () => {
    saveProfileEntry('name', 'Max');
    const profile = getProfile();
    expect(profile).toHaveLength(1);
    expect(profile[0].key).toBe('name');
    expect(profile[0].value).toBe('Max');
  });

  it('updates existing key', () => {
    saveProfileEntry('name', 'Max');
    saveProfileEntry('name', 'Maxim');
    const profile = getProfile();
    expect(profile).toHaveLength(1);
    expect(profile[0].value).toBe('Maxim');
  });

  it('returns all entries ordered by key', () => {
    saveProfileEntry('name', 'Max');
    saveProfileEntry('expertise', 'TypeScript');
    saveProfileEntry('role', 'developer');
    const profile = getProfile();
    expect(profile).toHaveLength(3);
    expect(profile[0].key).toBe('expertise');
    expect(profile[1].key).toBe('name');
    expect(profile[2].key).toBe('role');
  });

  it('deletes by key', () => {
    saveProfileEntry('name', 'Max');
    saveProfileEntry('role', 'dev');
    deleteProfileEntry('name');
    const profile = getProfile();
    expect(profile).toHaveLength(1);
    expect(profile[0].key).toBe('role');
  });
});

// --- Solutions ---

describe('Solutions', () => {
  it('stores task and steps', () => {
    saveSolution('deploy app', '["step1","step2"]', 'success');
    const solutions = getSolutions();
    expect(solutions).toHaveLength(1);
    expect(solutions[0].task).toBe('deploy app');
    expect(JSON.parse(solutions[0].steps)).toEqual(['step1', 'step2']);
    expect(solutions[0].outcome).toBe('success');
  });

  it('returns all entries', () => {
    saveSolution('task A', '["a1"]', 'success');
    saveSolution('task B', '["b1","b2"]', 'success');
    expect(getSolutions()).toHaveLength(2);
  });

  it('deletes by id', () => {
    saveSolution('task A', '["a1"]', 'success');
    saveSolution('task B', '["b1"]', 'success');
    const solutions = getSolutions();
    deleteSolution(solutions[0].id);
    expect(getSolutions()).toHaveLength(1);
  });
});

// --- Knowledge ---

describe('Knowledge', () => {
  it('inserts new fact', () => {
    saveKnowledge('Next.js uses App Router', 'conversation');
    const facts = getKnowledge();
    expect(facts).toHaveLength(1);
    expect(facts[0].fact).toBe('Next.js uses App Router');
  });

  it('ignores duplicate fact', () => {
    saveKnowledge('fact A', 'conversation');
    saveKnowledge('fact A', 'conversation');
    expect(getKnowledge()).toHaveLength(1);
  });

  it('returns all facts', () => {
    saveKnowledge('fact A', 'conversation');
    saveKnowledge('fact B', 'conversation');
    expect(getKnowledge()).toHaveLength(2);
  });

  it('deletes by id', () => {
    saveKnowledge('fact A', 'conversation');
    saveKnowledge('fact B', 'conversation');
    const facts = getKnowledge();
    deleteKnowledge(facts[0].id);
    expect(getKnowledge()).toHaveLength(1);
  });
});

// --- System Prompt Builder ---

describe('MemoryManager.buildSystemPromptSection', () => {
  const mm = new MemoryManager();

  it('returns empty string for empty memory', () => {
    expect(mm.buildSystemPromptSection('empty-session')).toBe('');
  });

  it('includes profile section when populated', () => {
    saveProfileEntry('name', 'Max');
    const section = mm.buildSystemPromptSection('any-session');
    expect(section).toContain('=== LONG-TERM MEMORY ===');
    expect(section).toContain('Profile:');
    expect(section).toContain('- name: Max');
    expect(section).not.toContain('WORKING MEMORY');
  });

  it('includes all sections when all layers populated', () => {
    saveProfileEntry('name', 'Max');
    saveSolution('deploy', '["step1"]', 'success');
    saveKnowledge('Next.js 15 is latest', 'conversation');
    saveWorkingMemory('session-x', 'build feature', 'halfway', 'try approach B');

    const section = mm.buildSystemPromptSection('session-x');
    expect(section).toContain('=== LONG-TERM MEMORY ===');
    expect(section).toContain('Profile:');
    expect(section).toContain('- name: Max');
    expect(section).toContain('Solutions (1 learned procedure)');
    expect(section).toContain('Knowledge (1 fact)');
    expect(section).toContain('=== WORKING MEMORY ===');
    expect(section).toContain('Task: build feature');
    expect(section).toContain('Progress: halfway');
    expect(section).toContain('Hypotheses: try approach B');
  });

  it('isolates working memory by session', () => {
    saveWorkingMemory('session-A', 'task A', '', '');
    saveWorkingMemory('session-B', 'task B', '', '');

    const sectionA = mm.buildSystemPromptSection('session-A');
    const sectionB = mm.buildSystemPromptSection('session-B');
    expect(sectionA).toContain('Task: task A');
    expect(sectionA).not.toContain('task B');
    expect(sectionB).toContain('Task: task B');
    expect(sectionB).not.toContain('task A');
  });
});

// --- Extraction Application ---

describe('MemoryManager.applyExtraction', () => {
  const mm = new MemoryManager();

  it('applies valid extraction result', () => {
    const result: MemoryExtractionResult = {
      working_memory: {
        task_description: 'implement auth',
        progress: 'started',
        hypotheses: 'JWT vs session',
        is_new_task: true,
      },
      profile: [
        { key: 'name', value: 'Max', operation: 'ADD' },
        { key: 'role', value: 'dev', operation: 'ADD' },
      ],
      solutions: {
        task: 'setup project',
        steps: ['init', 'install deps', 'configure'],
        outcome: 'success',
      },
      knowledge: [
        { fact: 'Port 3030 is used', source: 'conversation', operation: 'ADD' },
      ],
    };

    mm.applyExtraction('test-session', result);

    const wm = getWorkingMemory('test-session');
    expect(wm!.task_description).toBe('implement auth');

    const profile = getProfile();
    expect(profile).toHaveLength(2);

    const solutions = getSolutions();
    expect(solutions).toHaveLength(1);
    expect(solutions[0].task).toBe('setup project');

    const knowledge = getKnowledge();
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0].fact).toBe('Port 3030 is used');
  });

  it('skips NOOP operations', () => {
    const result: MemoryExtractionResult = {
      working_memory: null,
      profile: [{ key: 'name', value: 'Max', operation: 'NOOP' }],
      solutions: null,
      knowledge: [{ fact: 'something', source: 'conversation', operation: 'NOOP' }],
    };

    mm.applyExtraction('test-session', result);

    expect(getProfile()).toHaveLength(0);
    expect(getKnowledge()).toHaveLength(0);
  });

  it('handles empty extraction result', () => {
    const result: MemoryExtractionResult = {
      working_memory: null,
      profile: [],
      solutions: null,
      knowledge: [],
    };

    mm.applyExtraction('test-session', result);

    expect(getWorkingMemory('test-session')).toBeNull();
    expect(getProfile()).toHaveLength(0);
    expect(getSolutions()).toHaveLength(0);
    expect(getKnowledge()).toHaveLength(0);
  });

  it('overwrites working memory for same session', () => {
    const result1: MemoryExtractionResult = {
      working_memory: { task_description: 'task A', progress: '', hypotheses: '', is_new_task: true },
      profile: [],
      solutions: null,
      knowledge: [],
    };
    const result2: MemoryExtractionResult = {
      working_memory: { task_description: 'task B', progress: 'done', hypotheses: '', is_new_task: true },
      profile: [],
      solutions: null,
      knowledge: [],
    };

    mm.applyExtraction('session-1', result1);
    mm.applyExtraction('session-1', result2);

    const wm = getWorkingMemory('session-1');
    expect(wm!.task_description).toBe('task B');
    expect(wm!.progress).toBe('done');
  });
});

// --- clearAllMemory ---

describe('clearAllMemory', () => {
  it('wipes all memory tables', () => {
    saveWorkingMemory('s1', 'task', 'p', 'h');
    saveProfileEntry('name', 'Max');
    saveSolution('t', '[]', 'success');
    saveKnowledge('fact', 'conversation');

    clearAllMemory();

    expect(getWorkingMemory('s1')).toBeNull();
    expect(getProfile()).toHaveLength(0);
    expect(getSolutions()).toHaveLength(0);
    expect(getKnowledge()).toHaveLength(0);
  });
});

// --- extractMemory ---

describe('MemoryManager.extractMemory', () => {
  const mm = new MemoryManager();
  const mockModel = {} as Parameters<typeof import('ai').generateText>[0]['model'];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('extracts memory from a valid LLM response and persists it', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);

    const llmResponse = JSON.stringify({
      working_memory: { task_description: 'build auth', progress: 'started', hypotheses: 'JWT', is_new_task: true },
      profile: [{ key: 'name', value: 'Max', operation: 'ADD' }],
      solutions: null,
      knowledge: [{ fact: 'Uses Next.js 15', source: 'conversation', operation: 'ADD' }],
    });

    mockedGenerateText.mockResolvedValue({
      text: llmResponse,
      usage: { inputTokens: 100, outputTokens: 50 },
    } as never);

    const tokens = await mm.extractMemory('My name is Max and I am building auth', '', 'session-ext', mockModel);

    expect(tokens).toBe(150);
    expect(mockedGenerateText).toHaveBeenCalledOnce();

    // Verify persistence
    const wm = getWorkingMemory('session-ext');
    expect(wm).not.toBeNull();
    expect(wm!.task_description).toBe('build auth');

    const profile = getProfile();
    expect(profile).toHaveLength(1);
    expect(profile[0].value).toBe('Max');

    const knowledge = getKnowledge();
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0].fact).toBe('Uses Next.js 15');
  });

  it('handles LLM response wrapped in markdown code block', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);

    const jsonContent = JSON.stringify({
      working_memory: { task_description: 'testing', progress: '', hypotheses: '', is_new_task: true },
      profile: [],
      solutions: null,
      knowledge: [],
    });

    mockedGenerateText.mockResolvedValue({
      text: '```json\n' + jsonContent + '\n```',
      usage: { inputTokens: 80, outputTokens: 30 },
    } as never);

    const tokens = await mm.extractMemory('I am testing', '', 'session-md', mockModel);

    expect(tokens).toBe(110);
    const wm = getWorkingMemory('session-md');
    expect(wm).not.toBeNull();
    expect(wm!.task_description).toBe('testing');
  });

  it('returns 0 and does not throw when generateText rejects', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);

    mockedGenerateText.mockRejectedValue(new Error('API rate limit exceeded'));

    const tokens = await mm.extractMemory('hello', '', 'session-err', mockModel);

    expect(tokens).toBe(0);
    // No memory should be persisted
    expect(getWorkingMemory('session-err')).toBeNull();
  });

  it('returns 0 when LLM returns invalid JSON', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);

    mockedGenerateText.mockResolvedValue({
      text: 'This is not valid JSON at all.',
      usage: { inputTokens: 50, outputTokens: 20 },
    } as never);

    const tokens = await mm.extractMemory('something', '', 'session-bad-json', mockModel);

    expect(tokens).toBe(0);
    expect(getWorkingMemory('session-bad-json')).toBeNull();
  });

  it('returns 0 when a non-Error is thrown', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);

    mockedGenerateText.mockRejectedValue('string error');

    const tokens = await mm.extractMemory('hi', '', 'session-str-err', mockModel);

    expect(tokens).toBe(0);
  });

  it('includes existing memory context in the prompt to generateText', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);

    // Seed existing memory
    saveWorkingMemory('session-ctx', 'existing task', 'some progress', '');
    saveProfileEntry('name', 'Max');
    saveKnowledge('fact one', 'conversation');

    mockedGenerateText.mockResolvedValue({
      text: JSON.stringify({
        working_memory: null,
        profile: [],
        solutions: null,
        knowledge: [],
      }),
      usage: { inputTokens: 200, outputTokens: 40 },
    } as never);

    await mm.extractMemory('continue', '', 'session-ctx', mockModel);

    const callArgs = mockedGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('existing task');
    expect(callArgs.prompt).toContain('name=Max');
    expect(callArgs.prompt).toContain('fact one');
  });

  it('handles missing usage gracefully (defaults to 0)', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);

    mockedGenerateText.mockResolvedValue({
      text: JSON.stringify({
        working_memory: null,
        profile: [],
        solutions: null,
        knowledge: [],
      }),
      usage: undefined,
    } as never);

    const tokens = await mm.extractMemory('test', '', 'session-no-usage', mockModel);

    expect(tokens).toBe(0);
  });

  it('persists solutions when extraction includes a completed task', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);

    mockedGenerateText.mockResolvedValue({
      text: JSON.stringify({
        working_memory: null,
        profile: [],
        solutions: { task: 'deploy to prod', steps: ['build', 'push', 'verify'], outcome: 'success' },
        knowledge: [],
      }),
      usage: { inputTokens: 60, outputTokens: 40 },
    } as never);

    const tokens = await mm.extractMemory('I deployed successfully', '', 'session-sol', mockModel);

    expect(tokens).toBe(100);
    const solutions = getSolutions();
    expect(solutions).toHaveLength(1);
    expect(solutions[0].task).toBe('deploy to prod');
    expect(JSON.parse(solutions[0].steps)).toEqual(['build', 'push', 'verify']);
  });
});
