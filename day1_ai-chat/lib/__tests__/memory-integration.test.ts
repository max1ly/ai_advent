import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveWorkingMemory,
  getWorkingMemory,
  saveProfileEntry,
  getProfile,
  saveSolution,
  getSolutions,
  saveKnowledge,
  getKnowledge,
  clearAllMemory,
} from '@/lib/db';
import { MemoryManager } from '@/lib/memory';

beforeEach(() => {
  clearAllMemory();
});

describe('Memory persistence round-trip', () => {
  it('profile entries persist across MemoryManager instances', () => {
    saveProfileEntry('name', 'Max');
    saveProfileEntry('language', 'TypeScript');

    // Create a new MemoryManager (simulates a new request)
    const mm = new MemoryManager();
    const state = mm.getMemoryState('any-session');

    expect(state.profile).toHaveLength(2);
    expect(state.profile.find((p) => p.key === 'name')?.value).toBe('Max');
    expect(state.profile.find((p) => p.key === 'language')?.value).toBe('TypeScript');
  });

  it('solutions persist across MemoryManager instances', () => {
    saveSolution('deploy app', '["build","push","verify"]', 'success');

    const mm = new MemoryManager();
    const state = mm.getMemoryState('any');
    expect(state.solutions).toHaveLength(1);
    expect(state.solutions[0].task).toBe('deploy app');
  });

  it('knowledge persists across MemoryManager instances', () => {
    saveKnowledge('Port 3030 is the dev port', 'conversation');

    const mm = new MemoryManager();
    const state = mm.getMemoryState('any');
    expect(state.knowledge).toHaveLength(1);
    expect(state.knowledge[0].fact).toBe('Port 3030 is the dev port');
  });
});

describe('Session isolation for working memory', () => {
  it('working memory is scoped to session_id', () => {
    saveWorkingMemory('session-A', 'task A', 'progress A', 'hyp A');
    saveWorkingMemory('session-B', 'task B', 'progress B', 'hyp B');

    const mm = new MemoryManager();

    const stateA = mm.getMemoryState('session-A');
    const stateB = mm.getMemoryState('session-B');

    expect(stateA.workingMemory?.task_description).toBe('task A');
    expect(stateB.workingMemory?.task_description).toBe('task B');
  });

  it('session without working memory returns null', () => {
    saveWorkingMemory('session-A', 'task A', '', '');

    const mm = new MemoryManager();
    const state = mm.getMemoryState('session-C');

    expect(state.workingMemory).toBeNull();
  });
});

describe('LTM is global (not session-scoped)', () => {
  it('profile is accessible regardless of session', () => {
    saveProfileEntry('expertise', 'frontend');

    const mm = new MemoryManager();

    const state1 = mm.getMemoryState('session-1');
    const state2 = mm.getMemoryState('session-2');

    expect(state1.profile).toHaveLength(1);
    expect(state2.profile).toHaveLength(1);
    expect(state1.profile[0].value).toBe('frontend');
    expect(state2.profile[0].value).toBe('frontend');
  });

  it('knowledge is accessible regardless of session', () => {
    saveKnowledge('SQLite uses WAL mode', 'conversation');

    const mm = new MemoryManager();

    expect(mm.getMemoryState('session-X').knowledge).toHaveLength(1);
    expect(mm.getMemoryState('session-Y').knowledge).toHaveLength(1);
  });

  it('solutions are accessible regardless of session', () => {
    saveSolution('setup CI', '["configure","test","deploy"]', 'success');

    const mm = new MemoryManager();

    expect(mm.getMemoryState('any-1').solutions).toHaveLength(1);
    expect(mm.getMemoryState('any-2').solutions).toHaveLength(1);
  });
});

describe('System prompt injection', () => {
  it('produces correct output with all layers populated', () => {
    saveProfileEntry('name', 'Max');
    saveProfileEntry('role', 'developer');
    saveSolution('fix CORS', '["add headers","test"]', 'success');
    saveKnowledge('Next.js 15 uses App Router', 'conversation');
    saveWorkingMemory('session-full', 'implement memory', 'designing schema', 'SQLite vs JSON');

    const mm = new MemoryManager();
    const section = mm.buildSystemPromptSection('session-full');

    // LTM comes first
    expect(section.indexOf('LONG-TERM MEMORY')).toBeLessThan(section.indexOf('WORKING MEMORY'));

    // All subsections present
    expect(section).toContain('Profile:');
    expect(section).toContain('- name: Max');
    expect(section).toContain('- role: developer');
    expect(section).toContain('Solutions (1 learned procedure)');
    expect(section).toContain('"fix CORS"');
    expect(section).toContain('Knowledge (1 fact)');
    expect(section).toContain('- Next.js 15 uses App Router');
    expect(section).toContain('Task: implement memory');
    expect(section).toContain('Progress: designing schema');
    expect(section).toContain('Hypotheses: SQLite vs JSON');
  });

  it('omits empty LTM when only working memory exists', () => {
    saveWorkingMemory('session-wm', 'task only', '', '');

    const mm = new MemoryManager();
    const section = mm.buildSystemPromptSection('session-wm');

    expect(section).toContain('WORKING MEMORY');
    expect(section).not.toContain('LONG-TERM MEMORY');
  });

  it('omits working memory when only LTM exists', () => {
    saveProfileEntry('name', 'Max');

    const mm = new MemoryManager();
    const section = mm.buildSystemPromptSection('no-wm-session');

    expect(section).toContain('LONG-TERM MEMORY');
    expect(section).not.toContain('WORKING MEMORY');
  });
});

describe('clearAllMemory wipes everything', () => {
  it('clears all tables at once', () => {
    saveWorkingMemory('s1', 'task', 'p', 'h');
    saveWorkingMemory('s2', 'task2', 'p2', 'h2');
    saveProfileEntry('name', 'Max');
    saveProfileEntry('role', 'dev');
    saveSolution('task A', '["a"]', 'success');
    saveSolution('task B', '["b"]', 'success');
    saveKnowledge('fact 1', 'conversation');
    saveKnowledge('fact 2', 'conversation');

    clearAllMemory();

    expect(getWorkingMemory('s1')).toBeNull();
    expect(getWorkingMemory('s2')).toBeNull();
    expect(getProfile()).toHaveLength(0);
    expect(getSolutions()).toHaveLength(0);
    expect(getKnowledge()).toHaveLength(0);
  });

  it('MemoryManager reflects cleared state', () => {
    saveProfileEntry('name', 'Max');
    saveKnowledge('fact', 'conversation');

    clearAllMemory();

    const mm = new MemoryManager();
    const state = mm.getMemoryState('any');
    expect(state.profile).toHaveLength(0);
    expect(state.knowledge).toHaveLength(0);
    expect(mm.buildSystemPromptSection('any')).toBe('');
  });
});
