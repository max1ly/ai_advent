'use client';

import { useState } from 'react';
import type { AttackType } from '@/lib/lab/types';

const DEFENSE_TOOLTIPS: Record<AttackType, string> = {
  email: 'Input Sanitization: Strips HTML comments, script/style tags, and other hidden markup using an HTML parser. The injected <!-- comment --> payload is removed before the agent sees the email.',
  document: 'Zero-Width Stripping + Boundary Markers + Hardened Prompt: Removes invisible Unicode characters that encode hidden instructions, wraps input in <UNTRUSTED_DOCUMENT> tags, and switches to a system prompt that instructs the agent to treat tagged content as data only.',
  search: 'HTML Sanitization + Output Validation: Strips hidden CSS elements (font-size:0, color:white, off-screen positioning, aria-hidden) from the web page, then validates the agent\'s response for fabricated entities and suspicious URLs not present in the source.',
  bing: 'All Three Layers Combined: Applies HTML sanitization (hidden elements), zero-width character stripping, content boundary markers, hardened system prompt, and output validation. Reproduces the full defense stack needed against layered concealment attacks.',
};

interface DefenseControlsProps {
  attackType: AttackType;
  defenseEnabled: boolean;
  onToggleDefense: (enabled: boolean) => void;
  defenseLog: string[];
  onRunAttack: () => void;
  loading: boolean;
}

export default function DefenseControls({
  attackType,
  defenseEnabled,
  onToggleDefense,
  defenseLog,
  onRunAttack,
  loading,
}: DefenseControlsProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300">Defense Controls</h3>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span
                className="text-sm text-gray-400 cursor-help border-b border-dotted border-gray-500"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                Defense:
              </span>
              {showTooltip && (
                <div className="absolute bottom-full left-0 mb-2 w-80 p-3 rounded bg-gray-800 border border-gray-600 text-xs text-gray-300 leading-relaxed shadow-lg z-10">
                  {DEFENSE_TOOLTIPS[attackType]}
                </div>
              )}
            </div>
            <button
              onClick={() => onToggleDefense(!defenseEnabled)}
              disabled={loading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                defenseEnabled ? 'bg-green-600' : 'bg-gray-600'
              } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  defenseEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-semibold ${defenseEnabled ? 'text-green-400' : 'text-red-400'}`}>
              {defenseEnabled ? 'ON' : 'OFF'}
            </span>
          </div>

          <button
            onClick={onRunAttack}
            disabled={loading}
            className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${
              loading
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {loading ? 'Running...' : 'Run Attack'}
          </button>
        </div>

        <div className="flex-1 overflow-auto rounded bg-gray-900 p-3 text-xs font-mono">
          <p className="text-gray-500 mb-2">Defense Log:</p>
          {defenseLog.length === 0 ? (
            <p className="text-gray-600 italic">
              {defenseEnabled ? 'No log entries yet. Run the attack to see defense activity.' : 'Defense OFF — no sanitization applied.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {defenseLog.map((entry, i) => (
                <li key={i} className="text-gray-400">
                  <span className="text-green-500 mr-1">&gt;</span>{entry}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
