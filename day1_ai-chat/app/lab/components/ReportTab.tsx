'use client';

import type { TabResult } from '@/lib/lab/types';

interface ReportTabProps {
  results: Record<string, TabResult>;
}

const ATTACK_LABELS: Record<string, string> = {
  email: 'Email — Hidden HTML Comment (MCP Tool Abuse)',
  document: 'Document — Zero-Width Characters (Memory Poisoning)',
  search: 'Web Page — Hidden CSS + Markdown Link (Fabricated Data)',
  bing: 'Real-World: Bing Chat — Layered Concealment',
};

export default function ReportTab({ results }: ReportTabProps) {
  const attacks = ['email', 'document', 'search', 'bing'];

  function getStatus(tab: TabResult): string {
    if (!tab.withoutDefense && !tab.withDefense) return 'Not Tested';
    if (!tab.withDefense) return 'Defense Not Tested';
    if (!tab.withoutDefense) return 'Attack Not Tested';
    if (tab.withoutDefense.attackSucceeded && !tab.withDefense.attackSucceeded) return 'Blocked';
    if (tab.withoutDefense.attackSucceeded && tab.withDefense.attackSucceeded) return 'Bypassed';
    if (!tab.withoutDefense.attackSucceeded) return 'Attack Failed (no defense needed)';
    return 'Unknown';
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'Blocked': return 'text-green-400';
      case 'Bypassed': return 'text-red-400';
      case 'Not Tested':
      case 'Defense Not Tested':
      case 'Attack Not Tested': return 'text-gray-500';
      default: return 'text-yellow-400';
    }
  }

  function generateMarkdown(): string {
    let md = '# Prompt Injection Lab — Report\n\n';
    md += '| Attack | Without Defense | With Defense | Status |\n';
    md += '|---|---|---|---|\n';

    for (const key of attacks) {
      const tab = results[key] || { withoutDefense: null, withDefense: null };
      const label = ATTACK_LABELS[key];
      const without = tab.withoutDefense
        ? (tab.withoutDefense.attackSucceeded ? 'SUCCEEDED' : 'FAILED')
        : 'Not tested';
      const withDef = tab.withDefense
        ? (tab.withDefense.attackSucceeded ? 'SUCCEEDED' : 'FAILED')
        : 'Not tested';
      const status = getStatus(tab);
      md += `| ${label} | ${without} | ${withDef} | ${status} |\n`;
    }

    md += '\n## Details\n\n';

    for (const key of attacks) {
      const tab = results[key] || { withoutDefense: null, withDefense: null };
      md += `### ${ATTACK_LABELS[key]}\n\n`;

      if (tab.withoutDefense) {
        md += `**Without Defense:** ${tab.withoutDefense.attackSucceeded ? 'SUCCEEDED' : 'FAILED'}\n\n`;
        md += `> ${tab.withoutDefense.agentResponse.slice(0, 200)}${tab.withoutDefense.agentResponse.length > 200 ? '...' : ''}\n\n`;
        if (tab.withoutDefense.detectionDetails.flagsTriggered.length > 0) {
          md += `Flags: ${tab.withoutDefense.detectionDetails.flagsTriggered.join(', ')}\n\n`;
        }
      }

      if (tab.withDefense) {
        md += `**With Defense:** ${tab.withDefense.attackSucceeded ? 'SUCCEEDED' : 'FAILED'}\n\n`;
        md += `> ${tab.withDefense.agentResponse.slice(0, 200)}${tab.withDefense.agentResponse.length > 200 ? '...' : ''}\n\n`;
        if (tab.withDefense.defenseLog.length > 0) {
          md += `Defense log:\n${tab.withDefense.defenseLog.map(l => `- ${l}`).join('\n')}\n\n`;
        }
      }
    }

    return md;
  }

  function copyReport() {
    const md = generateMarkdown();
    navigator.clipboard.writeText(md);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Attack Report</h2>
          <p className="text-sm text-gray-400 mt-1">
            Run each attack with and without defenses to populate this report.
          </p>
        </div>
        <button
          onClick={copyReport}
          className="px-4 py-2 rounded text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          Copy as Markdown
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-gray-400 font-semibold">Attack</th>
              <th className="text-left py-3 px-4 text-gray-400 font-semibold">Without Defense</th>
              <th className="text-left py-3 px-4 text-gray-400 font-semibold">With Defense</th>
              <th className="text-left py-3 px-4 text-gray-400 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {attacks.map(key => {
              const tab = results[key] || { withoutDefense: null, withDefense: null };
              const status = getStatus(tab);
              return (
                <tr key={key} className="border-b border-gray-800">
                  <td className="py-3 px-4 text-gray-300">{ATTACK_LABELS[key]}</td>
                  <td className="py-3 px-4">
                    {tab.withoutDefense ? (
                      <span className={tab.withoutDefense.attackSucceeded ? 'text-red-400' : 'text-green-400'}>
                        {tab.withoutDefense.attackSucceeded ? 'SUCCEEDED' : 'FAILED'}
                      </span>
                    ) : (
                      <span className="text-gray-600">Not tested</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {tab.withDefense ? (
                      <span className={tab.withDefense.attackSucceeded ? 'text-red-400' : 'text-green-400'}>
                        {tab.withDefense.attackSucceeded ? 'SUCCEEDED' : 'FAILED'}
                      </span>
                    ) : (
                      <span className="text-gray-600">Not tested</span>
                    )}
                  </td>
                  <td className={`py-3 px-4 font-semibold ${getStatusColor(status)}`}>
                    {status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
