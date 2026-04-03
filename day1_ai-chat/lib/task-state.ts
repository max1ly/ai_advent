import type { TaskState, TaskStatus, StepResult } from '@/lib/types';
import { getTaskState, saveTaskState, deleteTaskState } from '@/lib/db';

// Valid state transitions map
type TransitionSignal =
  | 'TASK_START'
  | 'PLAN_READY'
  | 'PLAN_APPROVED'
  | 'PLAN_REJECTED'
  | 'STEP_COMPLETE'
  | 'VALIDATION_START'
  | 'TASK_DONE'
  | 'TASK_FAILED'
  | 'RESULT_APPROVED'
  | 'RESULT_REJECTED';

const VALID_TRANSITIONS: Record<TaskStatus, TransitionSignal[]> = {
  idle: ['TASK_START'],
  planning: ['PLAN_READY'],
  review: ['PLAN_APPROVED', 'PLAN_REJECTED'],
  execution: ['STEP_COMPLETE', 'VALIDATION_START'],
  validation: ['RESULT_APPROVED', 'RESULT_REJECTED'],
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
  private lastBlockedSignal: { signal: string; fromState: string; reason: string } | null = null;

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
        this.state.status = 'review';
        this.state.plan = payload?.plan ?? [];
        this.state.currentStep = 0;
        break;

      case 'PLAN_APPROVED':
        this.state.status = 'execution';
        this.state.currentStep = 1;
        break;

      case 'PLAN_REJECTED':
        this.state.status = 'planning';
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

      case 'RESULT_APPROVED':
        this.state.status = 'done';
        this.state.summary = payload?.summary ?? 'Approved by user';
        break;

      case 'RESULT_REJECTED':
        this.state.status = 'execution';
        break;
    }

    this.state.updatedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  /**
   * Store a blocked signal for feedback in the next prompt
   */
  setBlockedSignal(signal: string): void {
    this.lastBlockedSignal = {
      signal,
      fromState: this.state.status,
      reason: `Signal [${signal}] is not valid from state "${this.state.status}"`,
    };
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

    // Blocked signal warning
    if (this.lastBlockedSignal) {
      parts.push(`\u26a0\ufe0f TRANSITION BLOCKED: Signal [${this.lastBlockedSignal.signal}] was rejected.`);
      parts.push(`Current state: ${this.lastBlockedSignal.fromState}. ${this.lastBlockedSignal.reason}`);
      parts.push('You must follow the correct lifecycle sequence.');
      parts.push('');
      this.lastBlockedSignal = null;
    }

    const pausedSuffix = this.state.paused ? ' (PAUSED)' : '';

    if (this.state.status === 'planning') {
      parts.push(`**Task Status**: Planning${pausedSuffix}`);
      if (this.state.taskDescription) {
        parts.push(`**Task**: ${this.state.taskDescription}`);
      }
      parts.push('');
      parts.push('Create a concrete, numbered plan for this task.');
      parts.push('When your plan is ready, include [PLAN_READY] in your response.');
    } else if (this.state.status === 'review') {
      parts.push(`**Task Status**: Review \u2014 Awaiting Plan Approval${pausedSuffix}`);
      if (this.state.taskDescription) {
        parts.push(`**Task**: ${this.state.taskDescription}`);
      }
      parts.push('');
      parts.push('**Proposed Plan**:');
      this.state.plan.forEach((step, idx) => {
        parts.push(`${idx + 1}. ${step}`);
      });
      parts.push('');
      parts.push('The plan above is awaiting user approval.');
      parts.push('- If the user approves, proceed with execution.');
      parts.push('- If the user provides feedback or rejects, revise the plan incorporating their feedback.');
      parts.push('- Do NOT begin execution until the plan is explicitly approved.');
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
      parts.push(`**Task Status**: Validation \u2014 Awaiting Result Approval${pausedSuffix}`);
      if (this.state.taskDescription) {
        parts.push(`**Task**: ${this.state.taskDescription}`);
      }
      parts.push('');
      if (this.state.stepResults.length > 0) {
        parts.push('**Completed Steps**:');
        this.state.stepResults.forEach((r) => {
          parts.push(`- Step ${r.step}: ${r.outcome} (${r.status})`);
        });
        parts.push('');
      }
      parts.push('Present your validation of the completed work to the user.');
      parts.push('The user must approve the result before the task can be marked complete.');
      parts.push('Do NOT emit [TASK_DONE] or [TASK_FAILED]. The user will decide.');
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

  // Only trigger planning when the user explicitly asks to plan
  if (/^(plan|create a plan|make a plan|plan how to|plan out)\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Detect if a user message indicates approval/acceptance
 */
export function detectApprovalIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  // Short exact matches
  if (/^(yes|ok|yep|yeah|sure|go)$/i.test(lower)) return true;
  // Phrase patterns
  const patterns = [
    /\bapproved?\b/, /\bgo ahead\b/, /\bproceed\b/, /\blet'?s do it\b/,
    /\blooks good\b/, /\blgtm\b/, /\bstart\b/, /\bexecute\b/, /\bbegin\b/,
    /\bdo it\b/, /\bconfirm(?:ed)?\b/, /\baccept\b/, /\bship it\b/,
  ];
  return patterns.some((p) => p.test(lower));
}

/**
 * Detect if a user message indicates rejection/redo
 */
export function detectRejectionIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  // Short exact matches
  if (/^(no|nope|nah)$/i.test(lower)) return true;
  // Phrase patterns
  const patterns = [
    /\breject(?:ed)?\b/, /\bredo\b/, /\btry again\b/, /\bnot good\b/,
    /\bwrong\b/, /\bchange the plan\b/, /\brevise\b/, /\brethink\b/,
    /\bstart over\b/, /\bbad\b/,
  ];
  return patterns.some((p) => p.test(lower));
}
