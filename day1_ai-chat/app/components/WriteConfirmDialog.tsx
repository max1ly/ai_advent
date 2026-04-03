'use client';

import { useState } from 'react';

interface WriteConfirmDialogProps {
  writeId: string;
  path: string;
  diff: string;
  isNewFile: boolean;
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return <div className="text-gray-500 text-xs">{line}</div>;
  }
  if (line.startsWith('@@')) {
    return <div className="text-blue-400 text-xs bg-blue-900/20 px-2">{line}</div>;
  }
  if (line.startsWith('+')) {
    return <div className="bg-green-900/30 text-green-300 px-2">{line}</div>;
  }
  if (line.startsWith('-')) {
    return <div className="bg-red-900/30 text-red-300 px-2">{line}</div>;
  }
  return <div className="text-gray-400 px-2">{line}</div>;
}

export default function WriteConfirmDialog({ writeId, path, diff, isNewFile }: WriteConfirmDialogProps) {
  const [status, setStatus] = useState<'pending' | 'applying' | 'applied' | 'rejected' | 'error'>('pending');
  const [resultMessage, setResultMessage] = useState('');

  const diffLines = diff.split('\n');
  // Skip the first two header lines from createTwoFilesPatch (=== ... ===)
  const displayLines = diffLines.filter(line => !line.startsWith('='));

  const handleApply = async () => {
    setStatus('applying');
    try {
      const res = await fetch('/api/dev-assistant/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writeId, action: 'apply' }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('applied');
        setResultMessage(data.result);
      } else {
        setStatus('error');
        setResultMessage(data.error || 'Failed to apply');
      }
    } catch {
      setStatus('error');
      setResultMessage('Network error');
    }
  };

  const handleReject = async () => {
    try {
      await fetch('/api/dev-assistant/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writeId, action: 'reject' }),
      });
    } catch {
      // Best-effort cleanup
    }
    setStatus('rejected');
    setResultMessage('Write cancelled');
  };

  return (
    <div className="my-3 rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{path}</span>
          {isNewFile && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">new file</span>
          )}
        </div>
      </div>

      {/* Diff */}
      <div className="bg-gray-900 overflow-x-auto">
        <pre className="text-xs font-mono leading-5 py-2">
          {displayLines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </pre>
      </div>

      {/* Actions */}
      <div className="bg-gray-50 px-3 py-2 border-t border-gray-200">
        {status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
            >
              Apply
            </button>
            <button
              onClick={handleReject}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
            >
              Reject
            </button>
          </div>
        )}
        {status === 'applying' && (
          <span className="text-sm text-gray-500">Applying...</span>
        )}
        {status === 'applied' && (
          <span className="text-sm text-green-600">{resultMessage}</span>
        )}
        {status === 'rejected' && (
          <span className="text-sm text-gray-500">{resultMessage}</span>
        )}
        {status === 'error' && (
          <span className="text-sm text-red-600">{resultMessage}</span>
        )}
      </div>
    </div>
  );
}
