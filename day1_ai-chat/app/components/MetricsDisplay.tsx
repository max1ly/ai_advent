'use client';

import type { Metrics, StrategyType, Branch, TaskStatus } from '@/lib/types';

export interface MetricsDisplayProps {
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
  ragEnabled: boolean;
  onRagToggle: (enabled: boolean) => void;
  ragThreshold: number;
  ragTopK: number;
  onRagThresholdChange: (value: number) => void;
  onRagTopKChange: (value: number) => void;
  ragRerank: boolean;
  onRagRerankToggle: (enabled: boolean) => void;
  onExport?: () => void;
}

export function MetricsDisplay({
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
  ragEnabled,
  onRagToggle,
  ragThreshold,
  ragTopK,
  onRagThresholdChange,
  onRagTopKChange,
  ragRerank,
  onRagRerankToggle,
  onExport,
}: MetricsDisplayProps) {
  return (
    <>
      {/* Row 1: Core controls */}
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
              onChange={(e) => {
                const parsed = parseInt(e.target.value);
                onWindowSizeChange(Math.max(2, isNaN(parsed) ? 10 : parsed));
              }}
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

        {/* Spacer pushes buttons to the right */}
        <div className="flex-1" />

        {/* Memory button */}
        <button
          onClick={onMemoryOpen}
          className="px-3 py-1 rounded text-sm text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:scale-105 active:scale-95 transition-all"
        >
          Memory
        </button>

        {/* Invariants button */}
        <button
          onClick={onInvariantsOpen}
          className="px-3 py-1 rounded text-sm text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:scale-105 active:scale-95 transition-all relative"
        >
          Invariants
          {invariantCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {invariantCount}
            </span>
          )}
        </button>

        {/* New Chat button */}
        <button
          onClick={onNewChat}
          className="px-3 py-1 rounded text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 active:scale-95 transition-all"
        >
          New Chat
        </button>

        {/* Export button */}
        {onExport && (
          <button
            onClick={onExport}
            className="px-3 py-1 rounded text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
            title="Export conversation as markdown"
          >
            Export
          </button>
        )}
      </div>

      {/* Row 2: RAG controls */}
      <div className="flex items-center gap-3 text-sm flex-wrap">
        {/* RAG toggle */}
        <button
          onClick={() => onRagToggle(!ragEnabled)}
          className={`px-3 py-1 rounded text-sm font-medium transition-all ${
            ragEnabled
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
          }`}
          title={ragEnabled ? 'RAG enabled — model searches indexed documents' : 'RAG disabled — model uses only its training data'}
        >
          RAG
        </button>

        {/* Index button */}
        <button
          onClick={onIndexOpen}
          className="px-3 py-1 rounded text-sm text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:scale-105 active:scale-95 transition-all"
        >
          Index
        </button>

        {ragEnabled && (
          <>
            <span className="text-gray-300">|</span>

            {/* Rerank toggle */}
            <button
              onClick={() => onRagRerankToggle(!ragRerank)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                ragRerank
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                  : 'bg-gray-100 text-gray-500 border border-gray-300'
              }`}
              title={ragRerank ? 'Reranking enabled — results sorted by cosine similarity' : 'Reranking disabled — raw LanceDB results'}
            >
              Rerank
            </button>

            {/* Threshold slider and Top-K — only when reranking */}
            {ragRerank && (
              <>
                <label className="flex items-center gap-1 text-gray-600">
                  Threshold:
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={ragThreshold}
                    onChange={(e) => onRagThresholdChange(parseFloat(e.target.value))}
                    className="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <span className="text-xs font-mono w-8">{ragThreshold.toFixed(2)}</span>
                </label>

                <label className="flex items-center gap-1 text-gray-600">
                  Top-K:
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={ragTopK}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value);
                      onRagTopKChange(Math.max(1, isNaN(parsed) ? 10 : parsed));
                    }}
                    className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded text-sm"
                  />
                </label>
              </>
            )}
          </>
        )}
      </div>
    </>
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
