'use client';

import { useState } from 'react';
import type { RagSource } from '@/lib/types';

interface RagSourcesProps {
  sources: RagSource[];
}

function truncateText(text: string, maxLen = 150): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.7 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

export default function RagSources({ sources }: RagSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800 transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span className="font-medium">
          Sources ({sources.length})
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {sources.map((source, index) => (
            <SourceCard key={index} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: RagSource }) {
  const [showFull, setShowFull] = useState(false);
  const isLong = source.text.length > 150;
  const displayText = showFull ? source.text : truncateText(source.text);

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-gray-800 truncate">{source.source}</span>
        <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-mono text-emerald-700">
          {source.score.toFixed(2)}
        </span>
      </div>
      {source.section && (
        <div className="text-xs text-gray-500 mt-0.5">{source.section}</div>
      )}
      <p className="mt-1 text-gray-600 text-xs leading-relaxed whitespace-pre-wrap">
        {displayText}
        {isLong && (
          <button
            onClick={() => setShowFull(!showFull)}
            className="ml-1 text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {showFull ? 'Show less' : 'Read more'}
          </button>
        )}
      </p>
    </div>
  );
}
