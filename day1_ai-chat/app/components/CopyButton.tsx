'use client';

import { useState } from 'react';

export interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[CopyButton] clipboard failed:', message);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy message'}
      className={`text-xs text-gray-400 hover:text-gray-600 transition-colors ${className ?? ''}`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
