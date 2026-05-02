'use client';

import InputInspector from './InputInspector';
import AgentResponse from './AgentResponse';
import DefenseControls from './DefenseControls';
import type { AttackResult, AttackType } from '@/lib/lab/types';

interface AttackTabProps {
  title: string;
  description: string;
  attackType: AttackType;
  rawInput: string;
  result: AttackResult | null;
  loading: boolean;
  error: string | null;
  defenseEnabled: boolean;
  defenseLog: string[];
  onToggleDefense: (enabled: boolean) => void;
  onRunAttack: () => void;
}

export default function AttackTab({
  title,
  description,
  attackType,
  rawInput,
  result,
  loading,
  error,
  defenseEnabled,
  defenseLog,
  onToggleDefense,
  onRunAttack,
}: AttackTabProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-sm text-gray-400 mt-1">{description}</p>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        <div className="min-h-0">
          <InputInspector rawInput={rawInput} attackType={attackType} />
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <div className="flex-1 min-h-0">
            <AgentResponse
              result={result}
              loading={loading}
              error={error}
              onRetry={onRunAttack}
            />
          </div>
          <div className="h-48 flex-shrink-0">
            <DefenseControls
              attackType={attackType}
              defenseEnabled={defenseEnabled}
              onToggleDefense={onToggleDefense}
              defenseLog={defenseLog}
              onRunAttack={onRunAttack}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
