import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStateMachine, parseTransitionSignals, detectTaskIntent } from '@/lib/task-state';
import { deleteTaskState } from '@/lib/db';

describe('TaskStateMachine', () => {
  const testSessionId = 'test-session-task-state';

  beforeEach(() => {
    deleteTaskState(testSessionId);
  });

  describe('State transitions', () => {
    it('should start in idle state', () => {
      const machine = new TaskStateMachine(testSessionId);
      const state = machine.getState();
      expect(state.status).toBe('idle');
      expect(state.paused).toBe(false);
      expect(state.taskDescription).toBe(null);
      expect(state.plan).toEqual([]);
      expect(state.currentStep).toBe(0);
      expect(state.stepResults).toEqual([]);
      expect(state.summary).toBe(null);
    });

    it('should transition from idle to planning on TASK_START', () => {
      const machine = new TaskStateMachine(testSessionId);
      const success = machine.transition('TASK_START', {
        taskDescription: 'Build a feature',
      });
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('planning');
      expect(state.taskDescription).toBe('Build a feature');
      expect(state.plan).toEqual([]);
      expect(state.currentStep).toBe(0);
    });

    it('should transition from planning to execution on PLAN_READY', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test task' });
      const success = machine.transition('PLAN_READY', {
        plan: ['Step 1', 'Step 2', 'Step 3'],
      });
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('execution');
      expect(state.plan).toEqual(['Step 1', 'Step 2', 'Step 3']);
      expect(state.currentStep).toBe(1);
    });

    it('should advance step on STEP_COMPLETE', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['A', 'B', 'C'] });

      const success = machine.transition('STEP_COMPLETE', {
        step: 1,
        stepResult: { step: 1, outcome: 'Done A', status: 'completed' },
      });
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.currentStep).toBe(2);
      expect(state.stepResults).toHaveLength(1);
      expect(state.stepResults[0].outcome).toBe('Done A');
    });

    it('should transition from execution to validation on VALIDATION_START', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['A'] });

      const success = machine.transition('VALIDATION_START');
      expect(success).toBe(true);
      expect(machine.getState().status).toBe('validation');
    });

    it('should transition from validation to done on TASK_DONE', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['A'] });
      machine.transition('VALIDATION_START');

      const success = machine.transition('TASK_DONE', {
        summary: 'All done',
      });
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('done');
      expect(state.summary).toBe('All done');
    });

    it('should transition from validation to failed on TASK_FAILED', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['A'] });
      machine.transition('VALIDATION_START');

      const success = machine.transition('TASK_FAILED', {
        summary: 'Failed validation',
      });
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('failed');
      expect(state.summary).toBe('Failed validation');
    });

    it('should allow retry from failed to planning on TASK_START', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'First try' });
      machine.transition('PLAN_READY', { plan: ['A'] });
      machine.transition('VALIDATION_START');
      machine.transition('TASK_FAILED', { summary: 'Failed' });

      const success = machine.transition('TASK_START', {
        taskDescription: 'Second try',
      });
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('planning');
      expect(state.taskDescription).toBe('Second try');
      expect(state.plan).toEqual([]);
      expect(state.currentStep).toBe(0);
      expect(state.stepResults).toEqual([]);
    });

    it('should reject invalid transitions', () => {
      const machine = new TaskStateMachine(testSessionId);
      const success = machine.transition('PLAN_READY');
      expect(success).toBe(false);
      expect(machine.getState().status).toBe('idle');
    });

    it('should ignore PLAN_READY when not in planning', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['A'] });

      const success = machine.transition('PLAN_READY', { plan: ['B'] });
      expect(success).toBe(false);
      expect(machine.getState().status).toBe('execution');
      expect(machine.getState().plan).toEqual(['A']);
    });
  });

  describe('Pause/Resume', () => {
    it('should pause without changing status', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.pause();

      const state = machine.getState();
      expect(state.paused).toBe(true);
      expect(state.status).toBe('planning');
    });

    it('should resume preserving full state', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test task' });
      machine.transition('PLAN_READY', { plan: ['A', 'B'] });
      machine.pause();

      machine.resume();
      const state = machine.getState();
      expect(state.paused).toBe(false);
      expect(state.status).toBe('execution');
      expect(state.taskDescription).toBe('Test task');
      expect(state.plan).toEqual(['A', 'B']);
    });

    it('should pause from any active state', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['A'] });
      machine.transition('VALIDATION_START');
      machine.pause();

      expect(machine.getState().paused).toBe(true);
      expect(machine.getState().status).toBe('validation');
    });
  });

  describe('Reset', () => {
    it('should reset to idle clearing everything', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['A', 'B'] });
      machine.transition('STEP_COMPLETE', {
        step: 1,
        stepResult: { step: 1, outcome: 'Done', status: 'completed' },
      });
      machine.pause();

      machine.reset();
      const state = machine.getState();
      expect(state.status).toBe('idle');
      expect(state.paused).toBe(false);
      expect(state.taskDescription).toBe(null);
      expect(state.plan).toEqual([]);
      expect(state.currentStep).toBe(0);
      expect(state.stepResults).toEqual([]);
      expect(state.summary).toBe(null);
    });
  });

  describe('Persistence', () => {
    it('should persist and reload from SQLite', () => {
      const machine1 = new TaskStateMachine(testSessionId);
      machine1.transition('TASK_START', { taskDescription: 'Persisted task' });
      machine1.transition('PLAN_READY', { plan: ['X', 'Y', 'Z'] });
      machine1.transition('STEP_COMPLETE', {
        step: 1,
        stepResult: { step: 1, outcome: 'X done', status: 'completed' },
      });

      const machine2 = new TaskStateMachine(testSessionId);
      const state = machine2.getState();
      expect(state.status).toBe('execution');
      expect(state.taskDescription).toBe('Persisted task');
      expect(state.plan).toEqual(['X', 'Y', 'Z']);
      expect(state.currentStep).toBe(2);
      expect(state.stepResults).toHaveLength(1);
      expect(state.stepResults[0].outcome).toBe('X done');
    });
  });

  describe('buildStatePrompt', () => {
    it('should return empty string when idle', () => {
      const machine = new TaskStateMachine(testSessionId);
      expect(machine.buildStatePrompt()).toBe('');
    });

    it('should show planning prompt with PLAN_READY instruction', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Build feature X' });
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('**Task Status**: Planning');
      expect(prompt).toContain('**Task**: Build feature X');
      expect(prompt).toContain('[PLAN_READY]');
    });

    it('should show execution prompt with step progress', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['Step A', 'Step B', 'Step C'] });
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('**Task Status**: Executing step 1 of 3');
      expect(prompt).toContain('1. [current] Step A');
      expect(prompt).toContain('2. [ ] Step B');
      expect(prompt).toContain('3. [ ] Step C');
      expect(prompt).toContain('[STEP_COMPLETE:N]');
    });

    it('should show done steps with [done] marker', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.transition('PLAN_READY', { plan: ['A', 'B', 'C'] });
      machine.transition('STEP_COMPLETE', {
        step: 1,
        stepResult: { step: 1, outcome: 'A done', status: 'completed' },
      });
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('1. [done] A');
      expect(prompt).toContain('2. [current] B');
      expect(prompt).toContain('3. [ ] C');
      expect(prompt).toContain('**Last Step Result**: A done (completed)');
    });

    it('should show validation prompt', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Validate me' });
      machine.transition('PLAN_READY', { plan: ['A'] });
      machine.transition('VALIDATION_START');
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('**Task Status**: Validation');
      expect(prompt).toContain('**Task**: Validate me');
      expect(prompt).toContain('[TASK_DONE]');
      expect(prompt).toContain('[TASK_FAILED]');
    });

    it('should show (PAUSED) indicator when paused', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test' });
      machine.pause();
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('**Task Status**: Planning (PAUSED)');
      expect(prompt).toContain('**Note**: Task is paused');
    });
  });
});

describe('parseTransitionSignals', () => {
  it('should extract PLAN_READY', () => {
    const text = 'Here is the plan. [PLAN_READY]';
    const signals = parseTransitionSignals(text);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ type: 'PLAN_READY' });
  });

  it('should extract STEP_COMPLETE with number', () => {
    const text = 'Step 1 is done. [STEP_COMPLETE:1]';
    const signals = parseTransitionSignals(text);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ type: 'STEP_COMPLETE', step: 1 });
  });

  it('should extract VALIDATION_START', () => {
    const text = 'All steps complete. [VALIDATION_START]';
    const signals = parseTransitionSignals(text);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ type: 'VALIDATION_START' });
  });

  it('should extract TASK_DONE', () => {
    const text = 'Validation passed. [TASK_DONE]';
    const signals = parseTransitionSignals(text);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ type: 'TASK_DONE' });
  });

  it('should extract TASK_FAILED', () => {
    const text = 'Validation failed. [TASK_FAILED]';
    const signals = parseTransitionSignals(text);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ type: 'TASK_FAILED' });
  });

  it('should extract multiple signals in one response', () => {
    const text = 'Done with step 2. [STEP_COMPLETE:2] Starting validation. [VALIDATION_START]';
    const signals = parseTransitionSignals(text);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toEqual({ type: 'STEP_COMPLETE', step: 2 });
    expect(signals[1]).toEqual({ type: 'VALIDATION_START' });
  });

  it('should return empty array when no signals found', () => {
    const text = 'This is just regular text without any signals.';
    const signals = parseTransitionSignals(text);
    expect(signals).toEqual([]);
  });

  it('should ignore malformed signals', () => {
    const text = '[STEP_COMPLETE:abc] [INVALID_SIGNAL] [STEP_COMPLETE:5]';
    const signals = parseTransitionSignals(text);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ type: 'STEP_COMPLETE', step: 5 });
  });

  it('should sort STEP_COMPLETE signals first', () => {
    const text = '[TASK_DONE] [STEP_COMPLETE:3] [PLAN_READY]';
    const signals = parseTransitionSignals(text);
    expect(signals).toHaveLength(3);
    expect(signals[0]).toEqual({ type: 'STEP_COMPLETE', step: 3 });
    // Others maintain order
    expect(signals.map(s => s.type)).toEqual(['STEP_COMPLETE', 'TASK_DONE', 'PLAN_READY']);
  });
});

describe('detectTaskIntent', () => {
  it('should detect imperative phrases', () => {
    expect(detectTaskIntent('Build a login feature')).toBe(true);
    expect(detectTaskIntent('Create a new component')).toBe(true);
    expect(detectTaskIntent('Implement user authentication')).toBe(true);
    expect(detectTaskIntent('Fix the bug in the header')).toBe(true);
    expect(detectTaskIntent('Write tests for the API')).toBe(true);
    expect(detectTaskIntent('Add a footer to the page')).toBe(true);
    expect(detectTaskIntent('Make the button responsive')).toBe(true);
    expect(detectTaskIntent('Set up the database')).toBe(true);
    expect(detectTaskIntent('Design a new layout')).toBe(true);
    expect(detectTaskIntent('Refactor the code')).toBe(true);
    expect(detectTaskIntent('Update the dependencies')).toBe(true);
    expect(detectTaskIntent('Develop the feature')).toBe(true);
    expect(detectTaskIntent('Configure the environment')).toBe(true);
  });

  it('should reject casual conversation', () => {
    expect(detectTaskIntent('Hi there')).toBe(false);
    expect(detectTaskIntent('Hello, how are you?')).toBe(false);
    expect(detectTaskIntent('Hey!')).toBe(false);
    expect(detectTaskIntent('What is your name?')).toBe(false);
    expect(detectTaskIntent('Why is the sky blue?')).toBe(false);
    expect(detectTaskIntent('How does this work?')).toBe(false);
    expect(detectTaskIntent('When should I use this?')).toBe(false);
    expect(detectTaskIntent('Where can I find this?')).toBe(false);
    expect(detectTaskIntent('Who made this?')).toBe(false);
    expect(detectTaskIntent('Can you help me?')).toBe(false);
    expect(detectTaskIntent('Could you explain this?')).toBe(false);
    expect(detectTaskIntent('Would you recommend this?')).toBe(false);
  });

  it('should detect multi-step indicators', () => {
    expect(detectTaskIntent('First create the file, then add the code')).toBe(true);
    expect(detectTaskIntent('step 1: install dependencies')).toBe(true);
    expect(detectTaskIntent('1. Create component\n2. Add tests')).toBe(true);
  });
});
