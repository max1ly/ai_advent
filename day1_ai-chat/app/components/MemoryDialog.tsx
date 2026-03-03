'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WorkingMemoryEntry, ProfileEntry, SolutionEntry, KnowledgeEntry } from '@/lib/types';

interface MemoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  stmInfo: { messageCount: number; strategy: string; windowSize: number };
}

interface MemoryData {
  stm: { messageCount: number };
  workingMemory: WorkingMemoryEntry | null;
  profile: ProfileEntry[];
  solutions: SolutionEntry[];
  knowledge: KnowledgeEntry[];
}

function formatWorkingMemory(wm: WorkingMemoryEntry | null): string {
  if (!wm) return '(empty)';
  const lines: string[] = [];
  if (wm.task_description) lines.push(`Task: ${wm.task_description}`);
  if (wm.progress) lines.push(`Progress: ${wm.progress}`);
  if (wm.hypotheses) lines.push(`Hypotheses: ${wm.hypotheses}`);
  if (wm.updated_at) lines.push(`\nLast updated: ${wm.updated_at}`);
  return lines.length > 0 ? lines.join('\n') : '(empty)';
}

function formatProfile(entries: ProfileEntry[]): string {
  if (entries.length === 0) return '(empty)';
  return entries.map((e) => `${e.key}: ${e.value}`).join('\n');
}

function formatSolutions(entries: SolutionEntry[]): string {
  if (entries.length === 0) return '(empty)';
  return entries
    .map((s, i) => {
      let steps: string[];
      try {
        steps = JSON.parse(s.steps);
      } catch {
        steps = [s.steps];
      }
      const stepsText = steps.map((st, j) => `   ${j + 1}. ${st}`).join('\n');
      return `${i + 1}. ${s.task} (${s.outcome || 'no outcome'})\n${stepsText}`;
    })
    .join('\n\n');
}

function formatKnowledge(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return '(empty)';
  return entries.map((k) => `- ${k.fact}`).join('\n');
}

function calcRows(text: string, min: number = 4, max: number = 20): number {
  const lines = text.split('\n').length;
  return Math.max(min, Math.min(lines + 1, max));
}

export default function MemoryDialog({ isOpen, onClose, sessionId, stmInfo }: MemoryDialogProps) {
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMemory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?sessionId=${sessionId ?? ''}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (isOpen) {
      fetchMemory();
    }
  }, [isOpen, fetchMemory]);

  const handleClear = useCallback(
    async (type: string) => {
      if (type === 'working_memory') {
        await fetch('/api/memory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'working_memory', action: 'delete', sessionId }),
        });
      } else if (type === 'profile' && data) {
        for (const entry of data.profile) {
          await fetch('/api/memory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'profile', action: 'delete', data: { key: entry.key } }),
          });
        }
      } else if (type === 'solutions' && data) {
        for (const entry of data.solutions) {
          await fetch('/api/memory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'solutions', action: 'delete', data: { id: entry.id } }),
          });
        }
      } else if (type === 'knowledge' && data) {
        for (const entry of data.knowledge) {
          await fetch('/api/memory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'knowledge', action: 'delete', data: { id: entry.id } }),
          });
        }
      }
      fetchMemory();
    },
    [sessionId, data, fetchMemory],
  );

  if (!isOpen) return null;

  const stmText = `${stmInfo.messageCount} messages in current session (${stmInfo.strategy}, window: ${stmInfo.windowSize})`;
  const wmText = data ? formatWorkingMemory(data.workingMemory) : 'Loading...';
  const profileText = data ? formatProfile(data.profile) : 'Loading...';
  const solutionsText = data ? formatSolutions(data.solutions) : 'Loading...';
  const knowledgeText = data ? formatKnowledge(data.knowledge) : 'Loading...';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Agent Memory</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
          >
            &#x2715;
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          {loading && !data ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-24 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* STM */}
              <MemorySection title="Short-Term Memory" subtitle="Current conversation context">
                <textarea
                  readOnly
                  value={stmText}
                  rows={2}
                  className="w-full font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 resize-none focus:outline-none"
                />
              </MemorySection>

              {/* Working Memory */}
              <MemorySection
                title="Working Memory"
                subtitle="Current task scratchpad"
                onClear={() => handleClear('working_memory')}
                clearLabel="Clear"
              >
                <textarea
                  readOnly
                  value={wmText}
                  rows={calcRows(wmText)}
                  className="w-full font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 resize-none focus:outline-none min-h-[120px]"
                />
              </MemorySection>

              {/* Profile */}
              <MemorySection
                title="Profile"
                subtitle="Long-term factual memory"
                onClear={() => handleClear('profile')}
                clearLabel="Clear All"
                count={data?.profile.length}
              >
                <textarea
                  readOnly
                  value={profileText}
                  rows={calcRows(profileText)}
                  className="w-full font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 resize-none focus:outline-none min-h-[120px]"
                />
              </MemorySection>

              {/* Solutions */}
              <MemorySection
                title="Solutions"
                subtitle="Long-term procedural memory"
                onClear={() => handleClear('solutions')}
                clearLabel="Clear All"
                count={data?.solutions.length}
              >
                <textarea
                  readOnly
                  value={solutionsText}
                  rows={calcRows(solutionsText)}
                  className="w-full font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 resize-none focus:outline-none min-h-[120px]"
                />
              </MemorySection>

              {/* Knowledge */}
              <MemorySection
                title="Knowledge"
                subtitle="Long-term semantic memory"
                onClear={() => handleClear('knowledge')}
                clearLabel="Clear All"
                count={data?.knowledge.length}
              >
                <textarea
                  readOnly
                  value={knowledgeText}
                  rows={calcRows(knowledgeText)}
                  className="w-full font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 resize-none focus:outline-none min-h-[120px]"
                />
              </MemorySection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MemorySection({
  title,
  subtitle,
  onClear,
  clearLabel,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  onClear?: () => void;
  clearLabel?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <span className="font-medium text-gray-800 text-sm">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 text-xs text-gray-400">({count})</span>
          )}
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded border border-red-200 hover:border-red-300 transition-colors"
          >
            {clearLabel ?? 'Clear'}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
