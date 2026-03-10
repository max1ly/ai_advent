'use client';

import type { McpToolCallRequest } from '@/lib/types';

interface ToolConfirmDialogProps {
  request: McpToolCallRequest;
  onAllow: () => void;
  onDeny: () => void;
}

export default function ToolConfirmDialog({ request, onAllow, onDeny }: ToolConfirmDialogProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-amber-50 border border-amber-200 shadow-sm px-5 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
            Tool Call
          </span>
          <span className="text-xs text-gray-500">{request.serverName}</span>
        </div>
        <p className="text-sm font-medium text-gray-800 mb-1">{request.toolName}</p>
        {Object.keys(request.args).length > 0 && (
          <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-3 mb-3 overflow-x-auto">
            {JSON.stringify(request.args, null, 2)}
          </pre>
        )}
        <div className="flex gap-2">
          <button
            onClick={onAllow}
            className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors"
          >
            Allow
          </button>
          <button
            onClick={onDeny}
            className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300 transition-colors"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
