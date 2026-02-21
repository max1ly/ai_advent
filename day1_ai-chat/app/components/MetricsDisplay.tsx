'use client';

export interface Metrics {
  responseTime: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  model: string;
  tier: string;
}

interface MetricsDisplayProps {
  metrics: Metrics | null;
}

function formatTime(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatCost(cost: number): string {
  if (cost === 0) return 'Free';
  return `$${cost.toFixed(6)}`;
}

export default function MetricsDisplay({ metrics }: MetricsDisplayProps) {
  if (!metrics) {
    return (
      <div className="flex items-center gap-4 text-sm text-gray-400">
        <span>Time: —</span>
        <span>Tokens: —</span>
        <span>Cost: —</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-gray-600">
        Time: <span className="font-medium text-gray-800">{formatTime(metrics.responseTime)}</span>
      </span>
      <span className="text-gray-600">
        Tokens: <span className="font-medium text-gray-800">{metrics.totalTokens}</span>
        <span className="text-gray-400 text-xs ml-1">({metrics.inputTokens}↑ {metrics.outputTokens}↓)</span>
      </span>
      <span className="text-gray-600">
        Cost: <span className="font-medium text-gray-800">{formatCost(metrics.cost)}</span>
      </span>
    </div>
  );
}
