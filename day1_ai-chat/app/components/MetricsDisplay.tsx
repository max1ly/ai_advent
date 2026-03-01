'use client';

import type { Metrics, StrategyType, Branch } from '@/lib/types';

interface MetricsDisplayProps {
  metrics: Metrics | null;
  strategy: StrategyType;
  windowSize: number;
  branches: Branch[];
  activeBranchId: string | null;
  onStrategyChange: (type: StrategyType) => void;
  onWindowSizeChange: (size: number) => void;
  onNewChat: () => void;
  onCheckpoint: () => void;
  onSwitchBranch: (branchId: string) => void;
}

export default function MetricsDisplay({
  metrics,
  strategy,
  windowSize,
  branches,
  activeBranchId,
  onStrategyChange,
  onWindowSizeChange,
  onNewChat,
  onCheckpoint,
  onSwitchBranch,
}: MetricsDisplayProps) {
  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      {/* Strategy selector */}
      <select
        value={strategy}
        onChange={(e) => onStrategyChange(e.target.value as StrategyType)}
        className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
      >
        <option value="sliding-window">Sliding Window</option>
        <option value="facts">Sticky Facts</option>
        <option value="branching">Branching</option>
      </select>

      {/* Window size — hidden for branching */}
      {strategy !== 'branching' && (
        <label className="flex items-center gap-1 text-gray-600">
          Window:
          <input
            type="number"
            min={2}
            max={30}
            value={windowSize}
            onChange={(e) => onWindowSizeChange(Math.max(2, parseInt(e.target.value) || 10))}
            className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded text-sm"
          />
        </label>
      )}

      {/* Branching controls */}
      {strategy === 'branching' && (
        <>
          <button
            onClick={onCheckpoint}
            className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-sm hover:bg-indigo-100"
          >
            Checkpoint
          </button>
          {branches.length > 0 && (
            <select
              value={activeBranchId ?? ''}
              onChange={(e) => onSwitchBranch(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <span className="text-gray-300">|</span>

      {/* Token display */}
      {metrics ? (
        <>
          <span className="text-gray-600">
            Last:{' '}
            <span className="font-medium text-gray-800">
              {metrics.lastRequest.inputTokens}in/{metrics.lastRequest.outputTokens}out
            </span>
          </span>
          <span className="text-gray-600">
            Total:{' '}
            <span className="font-medium text-gray-800">
              {metrics.session.totalTokens.toLocaleString()}
            </span>
          </span>
          {metrics.session.totalStrategyTokens > 0 && (
            <span className="text-amber-600 text-xs">
              (strategy: {metrics.session.totalStrategyTokens.toLocaleString()})
            </span>
          )}
        </>
      ) : (
        <span className="text-gray-400">Tokens: —</span>
      )}

      {/* Spacer pushes New Chat to the right */}
      <div className="flex-1" />

      {/* New Chat button */}
      <button
        onClick={onNewChat}
        className="px-3 py-1 rounded text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 active:scale-95 transition-all"
      >
        New Chat
      </button>
    </div>
  );
}
