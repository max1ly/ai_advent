'use client';

import type { Metrics, CompressionSettings } from '@/lib/types';

interface MetricsDisplayProps {
  metrics: Metrics | null;
  compression: CompressionSettings;
  onCompressionChange: (settings: CompressionSettings) => void;
}

export default function MetricsDisplay({
  metrics,
  compression,
  onCompressionChange,
}: MetricsDisplayProps) {
  return (
    <div className="space-y-2">
      {/* Compression controls */}
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            role="switch"
            aria-checked={compression.enabled}
            tabIndex={0}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              compression.enabled ? 'bg-blue-500' : 'bg-gray-300'
            }`}
            onClick={() =>
              onCompressionChange({ ...compression, enabled: !compression.enabled })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCompressionChange({ ...compression, enabled: !compression.enabled });
              }
            }}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                compression.enabled ? 'translate-x-4' : ''
              }`}
            />
          </div>
          <span className="text-gray-600">Summarization</span>
        </label>

        <label className="flex items-center gap-1 text-gray-600">
          Recent:
          <input
            type="number"
            min={2}
            max={20}
            value={compression.recentWindowSize}
            disabled={!compression.enabled}
            onChange={(e) =>
              onCompressionChange({
                ...compression,
                recentWindowSize: Math.max(2, parseInt(e.target.value) || 6),
              })
            }
            className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded text-sm disabled:opacity-40 disabled:bg-gray-100"
          />
        </label>

        <label className="flex items-center gap-1 text-gray-600">
          Batch:
          <input
            type="number"
            min={4}
            max={30}
            value={compression.summaryBatchSize}
            disabled={!compression.enabled}
            onChange={(e) =>
              onCompressionChange({
                ...compression,
                summaryBatchSize: Math.max(4, parseInt(e.target.value) || 10),
              })
            }
            className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded text-sm disabled:opacity-40 disabled:bg-gray-100"
          />
        </label>

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
            {metrics.session.totalSummarizationTokens > 0 && (
              <span className="text-amber-600 text-xs">
                (summary: {metrics.session.totalSummarizationTokens.toLocaleString()})
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-400">Tokens: —</span>
        )}
      </div>
    </div>
  );
}
