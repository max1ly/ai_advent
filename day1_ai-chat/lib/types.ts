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

export interface Metrics {
  lastRequest: LastRequestMetrics;
  session: SessionMetrics;
}
