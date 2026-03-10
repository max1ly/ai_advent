'use client';

import { useState } from 'react';
import type { McpToolResult } from '@/lib/types';

interface ToolResultMessageProps {
  toolName: string;
  result: McpToolResult;
}

export default function ToolResultMessage({ toolName, result }: ToolResultMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const resultText = result.isError
    ? result.error || 'Unknown error'
    : typeof result.result === 'string'
      ? result.result
      : JSON.stringify(result.result, null, 2);

  const preview = resultText.length > 100 ? resultText.slice(0, 100) + '...' : resultText;

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[80%] rounded-2xl rounded-bl-md shadow-sm px-5 py-3 border ${
          result.isError ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            result.isError ? 'text-red-700 bg-red-100' : 'text-green-700 bg-green-100'
          }`}>
            {result.isError ? 'Tool Error' : 'Tool Result'}
          </span>
          <span className="text-xs text-gray-500">{toolName}</span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-left w-full"
        >
          <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto">
            {isExpanded ? resultText : preview}
          </pre>
          {resultText.length > 100 && (
            <span className="text-xs text-blue-500 hover:text-blue-700">
              {isExpanded ? 'Show less' : 'Show more'}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
