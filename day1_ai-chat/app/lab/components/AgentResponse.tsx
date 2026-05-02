'use client';

import type { AttackResult } from '@/lib/lab/types';

interface AgentResponseProps {
  result: AttackResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function AgentResponse({ result, loading, error, onRetry }: AgentResponseProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300">Agent Response</h3>
        {result && (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              result.attackSucceeded
                ? 'bg-red-900/50 text-red-400 border border-red-700'
                : 'bg-green-900/50 text-green-400 border border-green-700'
            }`}
          >
            {result.attackSucceeded ? 'ATTACK SUCCEEDED' : 'ATTACK FAILED'}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded bg-gray-900 p-4 text-sm">
        {loading && (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-white rounded-full" />
            Running attack against DeepSeek agent...
          </div>
        )}

        {error && (
          <div className="text-red-400">
            <p className="font-semibold mb-2">Error</p>
            <p className="mb-3">{error}</p>
            <button
              onClick={onRetry}
              className="text-xs px-3 py-1 rounded border border-red-700 text-red-400 hover:text-white hover:border-red-500 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {result && !loading && !error && (
          <div>
            <pre className="whitespace-pre-wrap text-gray-300 mb-4">{result.agentResponse}</pre>

            {result.detectionDetails.flagsTriggered.length > 0 && (
              <div className="mt-3 border-t border-gray-700 pt-3">
                <p className="text-xs font-semibold text-red-400 mb-1">Detection Flags:</p>
                <ul className="text-xs text-red-300 space-y-1">
                  {result.detectionDetails.flagsTriggered.map((flag, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <span className="text-red-500">!</span> {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.detectionDetails.toolCallsAttempted.length > 0 && (
              <div className="mt-3 border-t border-gray-700 pt-3">
                <p className="text-xs font-semibold text-red-400 mb-1">Unauthorized Tool Calls:</p>
                <ul className="text-xs text-red-300 space-y-1">
                  {result.detectionDetails.toolCallsAttempted.map((tc, i) => (
                    <li key={i} className="font-mono">{tc}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.detectionDetails.memoryWritesAttempted.length > 0 && (
              <div className="mt-3 border-t border-gray-700 pt-3">
                <p className="text-xs font-semibold text-red-400 mb-1">Unauthorized Memory Writes:</p>
                <ul className="text-xs text-red-300 space-y-1">
                  {result.detectionDetails.memoryWritesAttempted.map((mw, i) => (
                    <li key={i} className="font-mono">{mw}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.detectionDetails.fabricatedEntities.length > 0 && (
              <div className="mt-3 border-t border-gray-700 pt-3">
                <p className="text-xs font-semibold text-red-400 mb-1">Fabricated Entities:</p>
                <ul className="text-xs text-red-300 space-y-1">
                  {result.detectionDetails.fabricatedEntities.map((e, i) => (
                    <li key={i}>&quot;{e}&quot;</li>
                  ))}
                </ul>
              </div>
            )}

            {result.detectionDetails.suspiciousUrls.length > 0 && (
              <div className="mt-3 border-t border-gray-700 pt-3">
                <p className="text-xs font-semibold text-red-400 mb-1">Suspicious URLs:</p>
                <ul className="text-xs text-red-300 space-y-1">
                  {result.detectionDetails.suspiciousUrls.map((url, i) => (
                    <li key={i} className="font-mono break-all">{url}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!result && !loading && !error && (
          <p className="text-gray-500 italic">Click &quot;Run Attack&quot; to see the agent&apos;s response.</p>
        )}
      </div>
    </div>
  );
}
