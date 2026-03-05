import type { TaskState, TaskStatus, StepResult } from '@/lib/types';
import { getTaskState, saveTaskState, deleteTaskState } from '@/lib/db';

// Valid state transitions map
type TransitionSignal =
  | 'TASK_START'
  | 'PLAN_READY'
  | 'STEP_COMPLETE'
  | 'VALIDATION_START'
  | 'TASK_DONE'
  | 'TASK_FAILED';

const VALID_TRANSITIONS: Record<TaskStatus, TransitionSignal[]> = {
  idle: ['TASK_START'],
  planning: ['PLAN_READY'],
  execution: ['STEP_COMPLETE', 'VALIDATION_START'],
  validation: ['TASK_DONE', 'TASK_FAILED'],
  done: ['TASK_START'],
  failed: ['TASK_START'],
};

export interface TransitionPayload {
  taskDescription?: string;
  plan?: string[];
  step?: number;
  stepResult?: StepResult;
  summary?: string;
}

export interface ParsedSignal {
  type: TransitionSignal;
  step?: number;
}

/**
 * TaskStateMachine manages task lifecycle state and persistence
 */
export class TaskStateMachine {
  private state: TaskState;

  constructor(sessionId: string) {
    const loaded = getTaskState(sessionId);
    if (loaded) {
      this.state = loaded;
    } else {
      this.state = {
        sessionId,
        status: 'idle',
        paused: false,
        taskDescription: null,
        plan: [],
        currentStep: 0,
        stepResults: [],
        summary: null,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Get a copy of current state
   */
  getState(): TaskState {
    return { ...this.state };
  }

  /**
   * Attempt state transition with validation
   * Returns true if transition succeeded, false if invalid
   */
  transition(signal: TransitionSignal, payload?: TransitionPayload): boolean {
    const validSignals = VALID_TRANSITIONS[this.state.status];
    if (!validSignals.includes(signal)) {
      return false;
    }

    switch (signal) {
      case 'TASK_START':
        this.state.status = 'planning';
        this.state.taskDescription = payload?.taskDescription ?? null;
        this.state.plan = [];
        this.state.currentStep = 0;
        this.state.stepResults = [];
        this.state.summary = null;
        break;

      case 'PLAN_READY':
        if (this.state.status !== 'planning') return false;
        this.state.status = 'execution';
        this.state.plan = payload?.plan ?? [];
        this.state.currentStep = 1;
        break;

      case 'STEP_COMPLETE':
        if (payload?.stepResult) {
          this.state.stepResults.push(payload.stepResult);
        }
        if (payload?.step !== undefined) {
          this.state.currentStep = payload.step + 1;
        }
        break;

      case 'VALIDATION_START':
        this.state.status = 'validation';
        break;

      case 'TASK_DONE':
        this.state.status = 'done';
        this.state.summary = payload?.summary ?? null;
        break;

      case 'TASK_FAILED':
        this.state.status = 'failed';
        this.state.summary = payload?.summary ?? null;
        break;
    }

    this.state.updatedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  /**
   * Pause task execution
   */
  pause(): void {
    this.state.paused = true;
    this.state.updatedAt = new Date().toISOString();
    this.persist();
  }

  /**
   * Resume task execution
   */
  resume(): void {
    this.state.paused = false;
    this.state.updatedAt = new Date().toISOString();
    this.persist();
  }

  /**
   * Reset to idle state
   */
  reset(): void {
    this.state = {
      sessionId: this.state.sessionId,
      status: 'idle',
      paused: false,
      taskDescription: null,
      plan: [],
      currentStep: 0,
      stepResults: [],
      summary: null,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
  }

  /**
   * Build system prompt section based on current state
   */
  buildStatePrompt(): string {
    if (this.state.status === 'idle') {
      return '';
    }

    const parts: string[] = [];
    const pausedSuffix = this.state.paused ? ' (PAUSED)' : '';

    if (this.state.status === 'planning') {
      parts.push(`**Task Status**: Planning${pausedSuffix}`);
      if (this.state.taskDescription) {
        parts.push(`**Task**: ${this.state.taskDescription}`);
      }
      parts.push('');
      parts.push('Create a concrete, numbered plan for this task.');
      parts.push('When your plan is ready, include [PLAN_READY] in your response.');
    } else if (this.state.status === 'execution') {
      const totalSteps = this.state.plan.length;
      parts.push(`**Task Status**: Executing step ${this.state.currentStep} of ${totalSteps}${pausedSuffix}`);
      if (this.state.taskDescription) {
        parts.push(`**Task**: ${this.state.taskDescription}`);
      }
      parts.push('');
      parts.push('**Plan**:');
      this.state.plan.forEach((step, idx) => {
        const stepNum = idx + 1;
        const marker = idx < this.state.currentStep - 1
          ? '[done]'
          : idx === this.state.currentStep - 1
          ? '[current]'
          : '[ ]';
        parts.push(`${stepNum}. ${marker} ${step}`);
      });

      const lastResult = this.state.stepResults[this.state.stepResults.length - 1];
      if (lastResult) {
        parts.push('');
        parts.push(`**Last Step Result**: ${lastResult.outcome} (${lastResult.status})`);
      }

      parts.push('');
      parts.push('Execute the current step. When complete, include [STEP_COMPLETE:N] where N is the step number.');
      parts.push('When all steps are done, include [VALIDATION_START].');
    } else if (this.state.status === 'validation') {
      parts.push(`**Task Status**: Validation${pausedSuffix}`);
      if (this.state.taskDescription) {
        parts.push(`**Task**: ${this.state.taskDescription}`);
      }
      parts.push('');
      parts.push('Validate the completed task.');
      parts.push('Include [TASK_DONE] if successful, or [TASK_FAILED] if validation fails.');
    }

    if (this.state.paused) {
      parts.push('');
      parts.push('**Note**: Task is paused. Awaiting user instruction to continue.');
    }

    return parts.join('\n');
  }

  /**
   * Persist state to SQLite
   */
  private persist(): void {
    saveTaskState(this.state);
  }
}

/**
 * Parse transition signals from LLM output
 * Returns signals sorted with STEP_COMPLETE first, then others
 */
export function parseTransitionSignals(text: string): ParsedSignal[] {
  const signals: { signal: ParsedSignal; index: number }[] = [];

  // [PLAN_READY]
  const planReadyMatch = text.match(/\[PLAN_READY\]/i);
  if (planReadyMatch) {
    signals.push({ signal: { type: 'PLAN_READY' }, index: planReadyMatch.index! });
  }

  // [STEP_COMPLETE:N]
  const stepCompleteMatches = text.matchAll(/\[STEP_COMPLETE:(\d+)\]/gi);
  for (const match of stepCompleteMatches) {
    const step = parseInt(match[1], 10);
    if (!isNaN(step)) {
      signals.push({ signal: { type: 'STEP_COMPLETE', step }, index: match.index! });
    }
  }

  // [VALIDATION_START]
  const validationMatch = text.match(/\[VALIDATION_START\]/i);
  if (validationMatch) {
    signals.push({ signal: { type: 'VALIDATION_START' }, index: validationMatch.index! });
  }

  // [TASK_DONE]
  const taskDoneMatch = text.match(/\[TASK_DONE\]/i);
  if (taskDoneMatch) {
    signals.push({ signal: { type: 'TASK_DONE' }, index: taskDoneMatch.index! });
  }

  // [TASK_FAILED]
  const taskFailedMatch = text.match(/\[TASK_FAILED\]/i);
  if (taskFailedMatch) {
    signals.push({ signal: { type: 'TASK_FAILED' }, index: taskFailedMatch.index! });
  }

  // Sort: STEP_COMPLETE first, then others in original text order
  return signals
    .sort((a, b) => {
      const aIsStep = a.signal.type === 'STEP_COMPLETE';
      const bIsStep = b.signal.type === 'STEP_COMPLETE';
      if (aIsStep && !bIsStep) return -1;
      if (!aIsStep && bIsStep) return 1;
      return a.index - b.index;
    })
    .map(s => s.signal);
}

/**
 * Detect if a user message contains task intent
 */
export function detectTaskIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();

  // Reject greetings and questions
  if (/^(hi|hello|hey|what|why|how|when|where|who|can you|could you|would you)\b/i.test(lower)) {
    return false;
  }

  // Match imperative verbs at start
  const imperativePattern = /^(build|create|implement|fix|write|add|make|set up|design|refactor|update|develop|configure)\b/i;
  if (imperativePattern.test(lower)) {
    return true;
  }

  // Match multi-step indicators
  if (/\b(first.*then|step \d+|^\d+\.)/i.test(lower)) {
    return true;
  }

  return false;
}
