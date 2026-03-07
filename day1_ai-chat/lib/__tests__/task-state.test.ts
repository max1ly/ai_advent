import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStateMachine, parseTransitionSignals, detectTaskIntent, detectApprovalIntent, detectRejectionIntent } from '@/lib/task-state';
import { deleteTaskState } from '@/lib/db';

describe('TaskStateMachine', () => {
  const testSessionId = 'test-session-task-state';

  beforeEach(() => {
    deleteTaskState(testSessionId);
  });

  // Helper to get to review state
  function toReview(machine: TaskStateMachine) {
    machine.transition('TASK_START', { taskDescription: 'Test task' });
    machine.transition('PLAN_READY', { plan: ['Step 1', 'Step 2', 'Step 3'] });
  }

  // Helper to get to execution state
  function toExecution(machine: TaskStateMachine) {
    toReview(machine);
    machine.transition('PLAN_APPROVED');
  }

  // Helper to get to validation state
  function toValidation(machine: TaskStateMachine) {
    toExecution(machine);
    machine.transition('VALIDATION_START');
  }

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

    it('should transition from planning to review on PLAN_READY', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Test task' });
      const success = machine.transition('PLAN_READY', {
        plan: ['Step 1', 'Step 2', 'Step 3'],
      });
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('review');
      expect(state.plan).toEqual(['Step 1', 'Step 2', 'Step 3']);
      expect(state.currentStep).toBe(0);
    });

    it('should advance step on STEP_COMPLETE', () => {
      const machine = new TaskStateMachine(testSessionId);
      toExecution(machine);

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
      toExecution(machine);

      const success = machine.transition('VALIDATION_START');
      expect(success).toBe(true);
      expect(machine.getState().status).toBe('validation');
    });

    it('should allow retry from failed to planning on TASK_START', () => {
      const machine = new TaskStateMachine(testSessionId);
      toValidation(machine);
      machine.transition('RESULT_APPROVED', { summary: 'Done' });
      // done → new task
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
      toExecution(machine);

      const success = machine.transition('PLAN_READY', { plan: ['B'] });
      expect(success).toBe(false);
      expect(machine.getState().status).toBe('execution');
      expect(machine.getState().plan).toEqual(['Step 1', 'Step 2', 'Step 3']);
    });
  });

  describe('Review gate', () => {
    it('should transition from review to execution on PLAN_APPROVED', () => {
      const machine = new TaskStateMachine(testSessionId);
      toReview(machine);
      const success = machine.transition('PLAN_APPROVED');
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('execution');
      expect(state.currentStep).toBe(1);
      expect(state.plan).toEqual(['Step 1', 'Step 2', 'Step 3']);
    });

    it('should transition from review to planning on PLAN_REJECTED', () => {
      const machine = new TaskStateMachine(testSessionId);
      toReview(machine);
      const success = machine.transition('PLAN_REJECTED');
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('planning');
      expect(state.taskDescription).toBe('Test task');
    });

    it('should reject STEP_COMPLETE in review state', () => {
      const machine = new TaskStateMachine(testSessionId);
      toReview(machine);
      const success = machine.transition('STEP_COMPLETE', {
        step: 1,
        stepResult: { step: 1, outcome: 'X', status: 'completed' },
      });
      expect(success).toBe(false);
      expect(machine.getState().status).toBe('review');
    });

    it('should reject TASK_DONE in review state', () => {
      const machine = new TaskStateMachine(testSessionId);
      toReview(machine);
      const success = machine.transition('TASK_DONE');
      expect(success).toBe(false);
      expect(machine.getState().status).toBe('review');
    });
  });

  describe('Validation gate', () => {
    it('should transition from validation to done on RESULT_APPROVED', () => {
      const machine = new TaskStateMachine(testSessionId);
      toValidation(machine);
      const success = machine.transition('RESULT_APPROVED', { summary: 'All good' });
      expect(success).toBe(true);
      const state = machine.getState();
      expect(state.status).toBe('done');
      expect(state.summary).toBe('All good');
    });

    it('should transition from validation to execution on RESULT_REJECTED', () => {
      const machine = new TaskStateMachine(testSessionId);
      toValidation(machine);
      const success = machine.transition('RESULT_REJECTED');
      expect(success).toBe(true);
      expect(machine.getState().status).toBe('execution');
    });

    it('should block TASK_DONE in validation (not in valid transitions)', () => {
      const machine = new TaskStateMachine(testSessionId);
      toValidation(machine);
      const success = machine.transition('TASK_DONE');
      expect(success).toBe(false);
      expect(machine.getState().status).toBe('validation');
    });

    it('should block TASK_FAILED in validation', () => {
      const machine = new TaskStateMachine(testSessionId);
      toValidation(machine);
      const success = machine.transition('TASK_FAILED');
      expect(success).toBe(false);
      expect(machine.getState().status).toBe('validation');
    });
  });

  describe('Blocked signals', () => {
    it('should include blocked signal warning in buildStatePrompt', () => {
      const machine = new TaskStateMachine(testSessionId);
      toReview(machine);
      machine.setBlockedSignal('TASK_DONE');
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('TRANSITION BLOCKED');
      expect(prompt).toContain('TASK_DONE');
    });

    it('should clear blocked signal after including in prompt', () => {
      const machine = new TaskStateMachine(testSessionId);
      toReview(machine);
      machine.setBlockedSignal('TASK_DONE');
      machine.buildStatePrompt(); // consumes it
      const prompt2 = machine.buildStatePrompt();
      expect(prompt2).not.toContain('TRANSITION BLOCKED');
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
      toExecution(machine);
      machine.pause();

      machine.resume();
      const state = machine.getState();
      expect(state.paused).toBe(false);
      expect(state.status).toBe('execution');
      expect(state.taskDescription).toBe('Test task');
      expect(state.plan).toEqual(['Step 1', 'Step 2', 'Step 3']);
    });

    it('should pause from review state', () => {
      const machine = new TaskStateMachine(testSessionId);
      toReview(machine);
      machine.pause();
      expect(machine.getState().paused).toBe(true);
      expect(machine.getState().status).toBe('review');
    });

    it('should pause from validation state', () => {
      const machine = new TaskStateMachine(testSessionId);
      toValidation(machine);
      machine.pause();
      expect(machine.getState().paused).toBe(true);
      expect(machine.getState().status).toBe('validation');
    });
  });

  describe('Reset', () => {
    it('should reset to idle clearing everything', () => {
      const machine = new TaskStateMachine(testSessionId);
      toExecution(machine);
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
      toExecution(machine1);
      machine1.transition('STEP_COMPLETE', {
        step: 1,
        stepResult: { step: 1, outcome: 'X done', status: 'completed' },
      });

      const machine2 = new TaskStateMachine(testSessionId);
      const state = machine2.getState();
      expect(state.status).toBe('execution');
      expect(state.taskDescription).toBe('Test task');
      expect(state.plan).toEqual(['Step 1', 'Step 2', 'Step 3']);
      expect(state.currentStep).toBe(2);
      expect(state.stepResults).toHaveLength(1);
      expect(state.stepResults[0].outcome).toBe('X done');
    });

    it('should persist review state', () => {
      const machine1 = new TaskStateMachine(testSessionId);
      toReview(machine1);

      const machine2 = new TaskStateMachine(testSessionId);
      expect(machine2.getState().status).toBe('review');
      expect(machine2.getState().plan).toEqual(['Step 1', 'Step 2', 'Step 3']);
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

    it('should show review prompt with approval instructions', () => {
      const machine = new TaskStateMachine(testSessionId);
      toReview(machine);
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('Review');
      expect(prompt).toContain('Awaiting Plan Approval');
      expect(prompt).toContain('**Proposed Plan**');
      expect(prompt).toContain('1. Step 1');
      expect(prompt).toContain('Do NOT begin execution');
    });

    it('should show execution prompt with step progress', () => {
      const machine = new TaskStateMachine(testSessionId);
      toExecution(machine);
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('**Task Status**: Executing step 1 of 3');
      expect(prompt).toContain('1. [current] Step 1');
      expect(prompt).toContain('2. [ ] Step 2');
      expect(prompt).toContain('3. [ ] Step 3');
      expect(prompt).toContain('[STEP_COMPLETE:N]');
    });

    it('should show done steps with [done] marker', () => {
      const machine = new TaskStateMachine(testSessionId);
      toExecution(machine);
      machine.transition('STEP_COMPLETE', {
        step: 1,
        stepResult: { step: 1, outcome: 'A done', status: 'completed' },
      });
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('1. [done] Step 1');
      expect(prompt).toContain('2. [current] Step 2');
      expect(prompt).toContain('3. [ ] Step 3');
      expect(prompt).toContain('**Last Step Result**: A done (completed)');
    });

    it('should show validation prompt with user approval instruction', () => {
      const machine = new TaskStateMachine(testSessionId);
      toValidation(machine);
      const prompt = machine.buildStatePrompt();
      expect(prompt).toContain('Validation');
      expect(prompt).toContain('Awaiting Result Approval');
      expect(prompt).toContain('The user must approve');
      expect(prompt).toContain('Do NOT emit [TASK_DONE]');
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

  describe('Full lifecycle', () => {
    it('should complete full lifecycle: idle → planning → review → execution → validation → done', () => {
      const machine = new TaskStateMachine(testSessionId);

      // idle → planning
      machine.transition('TASK_START', { taskDescription: 'Build API' });
      expect(machine.getState().status).toBe('planning');

      // planning → review
      machine.transition('PLAN_READY', { plan: ['Design', 'Build', 'Test'] });
      expect(machine.getState().status).toBe('review');

      // review → execution
      machine.transition('PLAN_APPROVED');
      expect(machine.getState().status).toBe('execution');
      expect(machine.getState().currentStep).toBe(1);

      // execution steps
      machine.transition('STEP_COMPLETE', { step: 1, stepResult: { step: 1, outcome: 'Designed', status: 'completed' } });
      machine.transition('STEP_COMPLETE', { step: 2, stepResult: { step: 2, outcome: 'Built', status: 'completed' } });
      machine.transition('STEP_COMPLETE', { step: 3, stepResult: { step: 3, outcome: 'Tested', status: 'completed' } });

      // execution → validation
      machine.transition('VALIDATION_START');
      expect(machine.getState().status).toBe('validation');

      // validation → done (user approval)
      machine.transition('RESULT_APPROVED', { summary: 'API complete' });
      expect(machine.getState().status).toBe('done');
      expect(machine.getState().summary).toBe('API complete');
    });

    it('should handle rejection and re-plan cycle', () => {
      const machine = new TaskStateMachine(testSessionId);
      machine.transition('TASK_START', { taskDescription: 'Build API' });
      machine.transition('PLAN_READY', { plan: ['Too many steps'] });
      expect(machine.getState().status).toBe('review');

      // Reject → back to planning
      machine.transition('PLAN_REJECTED');
      expect(machine.getState().status).toBe('planning');
      expect(machine.getState().taskDescription).toBe('Build API');

      // Re-plan with simpler steps
      machine.transition('PLAN_READY', { plan: ['Step A', 'Step B'] });
      expect(machine.getState().status).toBe('review');
      expect(machine.getState().plan).toEqual(['Step A', 'Step B']);

      // Approve this time
      machine.transition('PLAN_APPROVED');
      expect(machine.getState().status).toBe('execution');
    });

    it('should handle result rejection and re-execution', () => {
      const machine = new TaskStateMachine(testSessionId);
      toValidation(machine);

      // Reject result → back to execution
      machine.transition('RESULT_REJECTED');
      expect(machine.getState().status).toBe('execution');
      expect(machine.getState().plan).toEqual(['Step 1', 'Step 2', 'Step 3']);

      // Re-execute and re-validate
      machine.transition('VALIDATION_START');
      expect(machine.getState().status).toBe('validation');

      // Approve this time
      machine.transition('RESULT_APPROVED', { summary: 'Fixed and approved' });
      expect(machine.getState().status).toBe('done');
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
  });

  it('should reject casual conversation', () => {
    expect(detectTaskIntent('Hi there')).toBe(false);
    expect(detectTaskIntent('Hello, how are you?')).toBe(false);
    expect(detectTaskIntent('What is your name?')).toBe(false);
    expect(detectTaskIntent('Can you help me?')).toBe(false);
  });

  it('should detect multi-step indicators', () => {
    expect(detectTaskIntent('First create the file, then add the code')).toBe(true);
    expect(detectTaskIntent('step 1: install dependencies')).toBe(true);
    expect(detectTaskIntent('1. Create component\n2. Add tests')).toBe(true);
  });
});

describe('detectApprovalIntent', () => {
  it('should detect simple approvals', () => {
    expect(detectApprovalIntent('yes')).toBe(true);
    expect(detectApprovalIntent('ok')).toBe(true);
    expect(detectApprovalIntent('go')).toBe(true);
    expect(detectApprovalIntent('yep')).toBe(true);
    expect(detectApprovalIntent('yeah')).toBe(true);
    expect(detectApprovalIntent('sure')).toBe(true);
  });

  it('should detect approval phrases', () => {
    expect(detectApprovalIntent('go ahead')).toBe(true);
    expect(detectApprovalIntent('looks good')).toBe(true);
    expect(detectApprovalIntent('approved')).toBe(true);
    expect(detectApprovalIntent('lgtm')).toBe(true);
    expect(detectApprovalIntent('proceed with the plan')).toBe(true);
    expect(detectApprovalIntent("let's do it")).toBe(true);
    expect(detectApprovalIntent('ship it')).toBe(true);
    expect(detectApprovalIntent('confirmed')).toBe(true);
  });

  it('should not match in unrelated context', () => {
    expect(detectApprovalIntent('yesterday was nice')).toBe(false);
    expect(detectApprovalIntent('tell me about okra')).toBe(false);
    expect(detectApprovalIntent('what do you think?')).toBe(false);
  });
});

describe('detectRejectionIntent', () => {
  it('should detect simple rejections', () => {
    expect(detectRejectionIntent('no')).toBe(true);
    expect(detectRejectionIntent('nope')).toBe(true);
    expect(detectRejectionIntent('nah')).toBe(true);
  });

  it('should detect rejection phrases', () => {
    expect(detectRejectionIntent('try again')).toBe(true);
    expect(detectRejectionIntent('redo the plan')).toBe(true);
    expect(detectRejectionIntent('this is wrong')).toBe(true);
    expect(detectRejectionIntent('not good enough')).toBe(true);
    expect(detectRejectionIntent('change the plan please')).toBe(true);
    expect(detectRejectionIntent('revise the steps')).toBe(true);
    expect(detectRejectionIntent('start over')).toBe(true);
  });

  it('should not match casual messages', () => {
    expect(detectRejectionIntent('tell me more about this')).toBe(false);
    expect(detectRejectionIntent('what else can we do?')).toBe(false);
    expect(detectRejectionIntent('how does this work?')).toBe(false);
  });
});
