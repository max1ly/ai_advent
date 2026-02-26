'use client';

export interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  exchanges: number;
  contextWindow: number;
}

export interface Metrics {
  responseTime: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  model: string;
  tier: string;
  session?: SessionMetrics;
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

function contextColor(pct: number): string {
  if (pct >= 95) return 'text-red-600';
  if (pct >= 80) return 'text-yellow-600';
  return 'text-green-600';
}

function barColor(pct: number): string {
  if (pct >= 95) return 'bg-red-500';
  if (pct >= 80) return 'bg-yellow-500';
  return 'bg-green-500';
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

  const session = metrics.session;
  const contextPct = session
    ? Math.round((session.totalInputTokens / session.contextWindow) * 100)
    : 0;

  return (
    <div className="space-y-2">
      {/* Per-message metrics */}
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

      {/* Session totals */}
      {session && (
        <div className="flex items-center gap-4 text-sm border-t border-gray-100 pt-2">
          <span className="text-gray-500">
            Session: <span className="font-medium text-gray-700">{session.exchanges} exchanges</span>
          </span>
          <span className="text-gray-500">
            Total: <span className="font-medium text-gray-700">{session.totalTokens.toLocaleString()}</span>
            <span className="text-gray-400 text-xs ml-1">({session.totalInputTokens.toLocaleString()}↑ {session.totalOutputTokens.toLocaleString()}↓)</span>
          </span>
          <span className="text-gray-500">
            Cost: <span className="font-medium text-gray-700">{formatCost(session.totalCost)}</span>
          </span>
          <span className={`font-medium ${contextColor(contextPct)}`}>
            Context: {contextPct}%
          </span>
          {/* Mini progress bar */}
          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor(contextPct)}`}
              style={{ width: `${Math.min(contextPct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
