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

export interface CompressionSettings {
  enabled: boolean;
  recentWindowSize: number;
  summaryBatchSize: number;
}

export interface LastRequestMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  summarizationTokens: number;
}

export interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalSummarizationTokens: number;
  exchanges: number;
  summariesGenerated: number;
}

export interface Metrics {
  lastRequest: LastRequestMetrics;
  session: SessionMetrics;
}
