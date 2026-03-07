export interface FileAttachment {
  id: number;
  filename: string;
  mediaType: string;
  size: number;
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: FileAttachment[];
}

export type StrategyType = 'sliding-window' | 'facts' | 'branching';

export interface StrategySettings {
  type: StrategyType;
  windowSize: number;
}

export interface Branch {
  id: string;
  name: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface LastRequestMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  strategyTokens: number;
}

export interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalStrategyTokens: number;
  exchanges: number;
}

export interface TaskStateMetrics {
  status: TaskStatus;
  currentStep: number;
  planLength: number;
  paused: boolean;
  needsApproval: boolean;
}

export interface Metrics {
  lastRequest: LastRequestMetrics;
  session: SessionMetrics;
  taskState?: TaskStateMetrics;
}

// Memory layer types

export interface WorkingMemoryEntry {
  id?: number;
  session_id: string;
  task_description: string;
  progress: string;
  hypotheses: string;
  updated_at?: string;
}

export interface ProfileEntry {
  id?: number;
  key: string;
  value: string;
  created_at?: string;
  updated_at?: string;
}

export interface SolutionEntry {
  id?: number;
  task: string;
  steps: string; // JSON array
  outcome: string;
  created_at?: string;
}

export interface KnowledgeEntry {
  id?: number;
  fact: string;
  source: string;
  created_at?: string;
}

export interface MemoryState {
  workingMemory: WorkingMemoryEntry | null;
  profile: ProfileEntry[];
  solutions: SolutionEntry[];
  knowledge: KnowledgeEntry[];
}

export interface MemoryExtractionResult {
  working_memory: {
    task_description: string;
    progress: string;
    hypotheses: string;
    is_new_task: boolean;
  } | null;
  profile: { key: string; value: string; operation: 'ADD' | 'UPDATE' | 'NOOP' }[];
  solutions: { task: string; steps: string[]; outcome: string } | null;
  knowledge: { fact: string; source: string; operation: 'ADD' | 'NOOP' }[];
}

// Invariants

export interface Invariant {
  id: string;
  text: string;
  enabled: boolean;
  createdAt: number;
}

// Task State Machine types

export type TaskStatus = 'idle' | 'planning' | 'review' | 'execution' | 'validation' | 'done' | 'failed';

export interface StepResult {
  step: number;
  outcome: string;
  status: 'completed' | 'skipped' | 'failed';
}

export interface TaskState {
  sessionId: string;
  status: TaskStatus;
  paused: boolean;
  taskDescription: string | null;
  plan: string[];
  currentStep: number;
  stepResults: StepResult[];
  summary: string | null;
  updatedAt: string;
}
