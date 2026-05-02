'use client';

import { useState, useCallback } from 'react';
import AttackTab from './components/AttackTab';
import ReportTab from './components/ReportTab';
import { getEmailAttackInput, getDocumentAttackInput, getSearchAttackInput, getBingAttackInput } from '@/lib/lab/attacks';
import type { AttackResult, AttackType, TabResult } from '@/lib/lab/types';

type TabKey = AttackType | 'report';

interface TabState {
  result: AttackResult | null;
  loading: boolean;
  error: string | null;
  defenseEnabled: boolean;
  defenseLog: string[];
}

const TAB_CONFIG: Array<{ key: TabKey; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'document', label: 'Document' },
  { key: 'search', label: 'Web Page' },
  { key: 'bing', label: 'Bing Chat (Real-World)' },
  { key: 'report', label: 'Report' },
];

const ATTACK_DESCRIPTIONS: Record<AttackType, { title: string; description: string }> = {
  email: {
    title: 'Attack 1: Hidden-Instruction Email',
    description: 'An HTML comment injects instructions to call an unauthorized send_email tool. The agent should only summarize — not forward data.',
  },
  document: {
    title: 'Attack 2: Invisible Payload Document',
    description: 'Zero-width Unicode characters encode hidden instructions to poison the memory system with false information.',
  },
  search: {
    title: 'Attack 3: Injected Web Page',
    description: 'Hidden CSS text and a Markdown link payload attempt to fabricate search results and exfiltrate data.',
  },
  bing: {
    title: 'Real-World: Bing Chat Hidden-Text Injection',
    description: 'Reproduces the Bing Chat attack using layered concealment: HTML comments, off-screen positioning, zero-size text, and authority escalation.',
  },
};

const ATTACK_INPUTS: Record<AttackType, () => string> = {
  email: getEmailAttackInput,
  document: getDocumentAttackInput,
  search: getSearchAttackInput,
  bing: getBingAttackInput,
};

const API_ROUTES: Record<AttackType, string> = {
  email: '/api/lab/email',
  document: '/api/lab/document',
  search: '/api/lab/search',
  bing: '/api/lab/bing',
};

function initialTabState(): TabState {
  return { result: null, loading: false, error: null, defenseEnabled: false, defenseLog: [] };
}

export default function LabPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('email');
  const [tabStates, setTabStates] = useState<Record<AttackType, TabState>>({
    email: initialTabState(),
    document: initialTabState(),
    search: initialTabState(),
    bing: initialTabState(),
  });
  const [reportResults, setReportResults] = useState<Record<string, TabResult>>({
    email: { withoutDefense: null, withDefense: null },
    document: { withoutDefense: null, withDefense: null },
    search: { withoutDefense: null, withDefense: null },
    bing: { withoutDefense: null, withDefense: null },
  });

  const updateTabState = useCallback((key: AttackType, updates: Partial<TabState>) => {
    setTabStates(prev => ({
      ...prev,
      [key]: { ...prev[key], ...updates },
    }));
  }, []);

  const runAttack = useCallback(async (key: AttackType) => {
    const state = tabStates[key];
    updateTabState(key, { loading: true, error: null, defenseLog: [] });

    try {
      const res = await fetch(API_ROUTES[key], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defenseEnabled: state.defenseEnabled }),
      });

      const data = await res.json();

      if (data.error) {
        updateTabState(key, { loading: false, error: data.error });
        return;
      }

      const result: AttackResult = data;
      updateTabState(key, {
        loading: false,
        result,
        defenseLog: result.defenseLog,
      });

      setReportResults(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          [state.defenseEnabled ? 'withDefense' : 'withoutDefense']: result,
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      updateTabState(key, { loading: false, error: message });
    }
  }, [tabStates, updateTabState]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <div className="px-6 py-4 border-b border-gray-800">
        <h1 className="text-2xl font-bold">Prompt Injection Lab</h1>
        <p className="text-sm text-gray-400 mt-1">
          Educational demonstration of indirect prompt injection attacks and defenses.
          Run each attack with defense OFF first, then toggle ON to see the difference.
        </p>
      </div>

      <div className="flex border-b border-gray-800 px-6">
        {TAB_CONFIG.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 min-h-0">
        {activeTab === 'report' ? (
          <ReportTab results={reportResults} />
        ) : (
          <AttackTab
            title={ATTACK_DESCRIPTIONS[activeTab].title}
            description={ATTACK_DESCRIPTIONS[activeTab].description}
            attackType={activeTab}
            rawInput={ATTACK_INPUTS[activeTab]()}
            result={tabStates[activeTab].result}
            loading={tabStates[activeTab].loading}
            error={tabStates[activeTab].error}
            defenseEnabled={tabStates[activeTab].defenseEnabled}
            defenseLog={tabStates[activeTab].defenseLog}
            onToggleDefense={(enabled) => updateTabState(activeTab, { defenseEnabled: enabled })}
            onRunAttack={() => runAttack(activeTab)}
          />
        )}
      </div>
    </div>
  );
}
