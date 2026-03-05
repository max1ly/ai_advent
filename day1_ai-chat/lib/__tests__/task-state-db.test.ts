import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTaskState,
  saveTaskState,
  deleteTaskState,
} from '@/lib/db';
import type { TaskState } from '@/lib/types';

beforeEach(() => {
  deleteTaskState('test-session');
});

describe('Task State DB', () => {
  it('should return null for unknown session', () => {
    expect(getTaskState('nonexistent')).toBeNull();
  });

  it('should save and retrieve task state', () => {
    const state: TaskState = {
      sessionId: 'test-session',
      status: 'planning',
      paused: false,
      taskDescription: 'Build a REST API',
      plan: ['Define models', 'Create endpoints'],
      currentStep: 0,
      stepResults: [],
      summary: null,
      updatedAt: '',
    };
    saveTaskState(state);

    const loaded = getTaskState('test-session');
    expect(loaded).not.toBeNull();
    expect(loaded!.status).toBe('planning');
    expect(loaded!.taskDescription).toBe('Build a REST API');
    expect(loaded!.plan).toEqual(['Define models', 'Create endpoints']);
    expect(loaded!.stepResults).toEqual([]);
    expect(loaded!.paused).toBe(false);
  });

  it('should upsert on same session_id', () => {
    const state1: TaskState = {
      sessionId: 'test-session',
      status: 'planning',
      paused: false,
      taskDescription: 'Task A',
      plan: [],
      currentStep: 0,
      stepResults: [],
      summary: null,
      updatedAt: '',
    };
    saveTaskState(state1);

    const state2: TaskState = {
      ...state1,
      status: 'execution',
      currentStep: 1,
      plan: ['Step 1', 'Step 2'],
      stepResults: [{ step: 0, outcome: 'Done', status: 'completed' }],
    };
    saveTaskState(state2);

    const loaded = getTaskState('test-session');
    expect(loaded!.status).toBe('execution');
    expect(loaded!.currentStep).toBe(1);
    expect(loaded!.stepResults).toHaveLength(1);
  });

  it('should delete task state', () => {
    const state: TaskState = {
      sessionId: 'test-session',
      status: 'idle',
      paused: false,
      taskDescription: null,
      plan: [],
      currentStep: 0,
      stepResults: [],
      summary: null,
      updatedAt: '',
    };
    saveTaskState(state);
    deleteTaskState('test-session');
    expect(getTaskState('test-session')).toBeNull();
  });

  it('should persist paused flag as boolean', () => {
    const state: TaskState = {
      sessionId: 'test-session',
      status: 'execution',
      paused: true,
      taskDescription: 'Task',
      plan: ['Step 1'],
      currentStep: 0,
      stepResults: [],
      summary: null,
      updatedAt: '',
    };
    saveTaskState(state);

    const loaded = getTaskState('test-session');
    expect(loaded!.paused).toBe(true);
  });
});
