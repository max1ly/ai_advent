'use client';

import type { Metrics, StrategyType, Branch, TaskStatus } from '@/lib/types';

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
  onMemoryOpen: () => void;
  onInvariantsOpen: () => void;
  invariantCount: number;
  onIndexOpen: () => void;
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
  onMemoryOpen,
  onInvariantsOpen,
  invariantCount,
  onIndexOpen,
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

      {/* Task state indicator */}
      {metrics?.taskState && metrics.taskState.status !== 'idle' && (
        <>
          <span className="text-gray-300">|</span>
          <TaskStateIndicator
            status={metrics.taskState.status}
            currentStep={metrics.taskState.currentStep}
            planLength={metrics.taskState.planLength}
            paused={metrics.taskState.paused}
            needsApproval={metrics.taskState.needsApproval}
          />
        </>
      )}

      {/* Spacer pushes New Chat to the right */}
      <div className="flex-1" />

      {/* Index button */}
      <button
        onClick={onIndexOpen}
        className="px-3 py-1 rounded text-sm text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:scale-105 active:scale-95 transition-all"
      >
        Index
      </button>

      {/* Memory button */}
      <button
        onClick={onMemoryOpen}
        className="px-3 py-1 rounded text-sm text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:scale-105 active:scale-95 transition-all"
      >
        Memory
      </button>

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

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  idle: { label: 'Idle', color: 'text-gray-500', bgColor: 'bg-gray-100' },
  planning: { label: 'Planning', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  review: { label: 'Review', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  execution: { label: 'Executing', color: 'text-green-700', bgColor: 'bg-green-50' },
  validation: { label: 'Validating', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  done: { label: 'Done', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  failed: { label: 'Failed', color: 'text-red-700', bgColor: 'bg-red-50' },
};

function TaskStateIndicator({
  status,
  currentStep,
  planLength,
  paused,
  needsApproval,
}: {
  status: TaskStatus;
  currentStep: number;
  planLength: number;
  paused: boolean;
  needsApproval: boolean;
}) {
  const config = STATUS_CONFIG[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bgColor}`}>
      {needsApproval && (
        <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      )}
      {paused && (
        <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
      )}
      {config.label}
      {status === 'execution' && planLength > 0 && (
        <span className="text-[10px] opacity-75">
          {currentStep}/{planLength}
        </span>
      )}
    </span>
  );
}
