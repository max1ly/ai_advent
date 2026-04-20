import type { SessionMetrics, LastRequestMetrics } from '@/lib/types';

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
}

export interface MetricsPayload {
  lastRequest: LastRequestMetrics;
  session: SessionMetrics;
  taskState: {
    status: string;
    currentStep: number;
    planLength: number;
    paused: boolean;
    needsApproval: boolean;
  };
}

export function createInitialSessionMetrics(): SessionMetrics {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalStrategyTokens: 0,
    exchanges: 0,
  };
}

export function updateSessionMetrics(
  metrics: SessionMetrics,
  usage: UsageInfo,
  strategyTokens: number,
): void {
  metrics.totalInputTokens += usage.inputTokens;
  metrics.totalOutputTokens += usage.outputTokens;
  metrics.totalTokens += usage.inputTokens + usage.outputTokens + strategyTokens;
  metrics.totalStrategyTokens += strategyTokens;
  metrics.exchanges += 1;
}

export function buildLastRequestMetrics(
  usage: UsageInfo,
  strategyTokens: number,
): LastRequestMetrics {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    strategyTokens,
  };
}

export function computeDurationMs(startTime: number): number {
  return Date.now() - startTime;
}

export function buildMetricsPayload(
  lastRequest: LastRequestMetrics,
  session: SessionMetrics,
  taskState: { status: string; currentStep: number; planLength: number; paused: boolean; needsApproval: boolean },
): MetricsPayload {
  return {
    lastRequest,
    session: { ...session },
    taskState,
  };
}
