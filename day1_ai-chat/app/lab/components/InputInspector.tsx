'use client';

import { useState } from 'react';

interface InputInspectorProps {
  rawInput: string;
  attackType: 'email' | 'document' | 'search' | 'bing';
}

export default function InputInspector({ rawInput, attackType }: InputInspectorProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300">Input Inspector</h3>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
        >
          {showRaw ? 'Rendered View' : 'Raw View'}
        </button>
      </div>
      <div className="flex-1 overflow-auto rounded bg-gray-900 p-4 text-sm font-mono">
        {showRaw ? (
          <RawView input={rawInput} attackType={attackType} />
        ) : (
          <RenderedView input={rawInput} attackType={attackType} />
        )}
      </div>
    </div>
  );
}

function RawView({ input, attackType }: { input: string; attackType: string }) {
  const highlighted = highlightPayloads(input, attackType);
  return (
    <pre className="whitespace-pre-wrap text-gray-300">
      {highlighted.map((segment, i) => (
        <span
          key={i}
          className={segment.isPayload ? 'bg-red-900/50 text-red-300 border border-red-700 rounded px-0.5' : ''}
          title={segment.isPayload ? `HIDDEN PAYLOAD: ${segment.technique}` : undefined}
        >
          {segment.text}
        </span>
      ))}
    </pre>
  );
}

function RenderedView({ input, attackType }: { input: string; attackType: string }) {
  const visibleText = getVisibleText(input, attackType);
  return (
    <div>
      <pre className="whitespace-pre-wrap text-gray-300">{visibleText}</pre>
      <p className="mt-4 text-xs text-yellow-500 italic">
        This is what a human would see. Switch to Raw View to see the hidden payloads.
      </p>
    </div>
  );
}

interface Segment {
  text: string;
  isPayload: boolean;
  technique?: string;
}

function highlightPayloads(input: string, attackType: string): Segment[] {
  const segments: Segment[] = [];

  if (attackType === 'email') {
    const commentRegex = /<!--[\s\S]*?-->/g;
    let lastIndex = 0;
    let match;
    while ((match = commentRegex.exec(input)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: input.slice(lastIndex, match.index), isPayload: false });
      }
      segments.push({ text: match[0], isPayload: true, technique: 'HTML Comment' });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < input.length) {
      segments.push({ text: input.slice(lastIndex), isPayload: false });
    }
    return segments.length > 0 ? segments : [{ text: input, isPayload: false }];
  }

  if (attackType === 'document') {
    const zwRegex = /[​‌‍‎‏؜᠎⁠-⁤﻿]+/g;
    let lastIndex = 0;
    let match;
    while ((match = zwRegex.exec(input)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: input.slice(lastIndex, match.index), isPayload: false });
      }
      segments.push({ text: '[ZERO-WIDTH PAYLOAD]', isPayload: true, technique: 'Zero-Width Characters' });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < input.length) {
      segments.push({ text: input.slice(lastIndex), isPayload: false });
    }
    return segments.length > 0 ? segments : [{ text: input, isPayload: false }];
  }

  if (attackType === 'search' || attackType === 'bing') {
    const hiddenPatterns = [
      { regex: /<!--[\s\S]*?-->/g, technique: 'HTML Comment' },
      { regex: /<span[^>]*style="[^"]*(?:font-size:\s*0|color:\s*white|position:\s*absolute[^"]*left:\s*-\d+px)[^"]*"[^>]*>[\s\S]*?<\/span>/gi, technique: 'Hidden CSS' },
      { regex: /<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/gi, technique: 'aria-hidden' },
    ];

    const combined: Array<{ start: number; end: number; text: string; technique: string }> = [];
    for (const { regex, technique } of hiddenPatterns) {
      let match;
      while ((match = regex.exec(input)) !== null) {
        combined.push({ start: match.index, end: match.index + match[0].length, text: match[0], technique });
      }
    }
    combined.sort((a, b) => a.start - b.start);

    let lastIndex = 0;
    for (const item of combined) {
      if (item.start > lastIndex) {
        segments.push({ text: input.slice(lastIndex, item.start), isPayload: false });
      }
      segments.push({ text: item.text, isPayload: true, technique: item.technique });
      lastIndex = item.end;
    }
    if (lastIndex < input.length) {
      segments.push({ text: input.slice(lastIndex), isPayload: false });
    }
    return segments.length > 0 ? segments : [{ text: input, isPayload: false }];
  }

  return [{ text: input, isPayload: false }];
}

function getVisibleText(input: string, attackType: string): string {
  if (attackType === 'document') {
    return input.replace(/[​‌‍‎‏؜᠎⁠-⁤﻿]/g, '');
  }
  return input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<span[^>]*style="[^"]*(?:font-size:\s*0|color:\s*white|display:\s*none|visibility:\s*hidden|position:\s*absolute[^"]*left:\s*-\d+px)[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
