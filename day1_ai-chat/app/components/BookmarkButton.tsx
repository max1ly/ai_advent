'use client';

import { useCallback } from 'react';

export interface BookmarkButtonProps {
  sessionId: string | null;
  messageIndex: number;
  isBookmarked: boolean;
  onToggle: (messageIndex: number, bookmarked: boolean) => void;
}

export function BookmarkButton({ sessionId, messageIndex, isBookmarked, onToggle }: BookmarkButtonProps) {
  const handleClick = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (isBookmarked) {
        await fetch('/api/bookmarks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, messageIndex }),
        });
        onToggle(messageIndex, false);
      } else {
        await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, messageIndex }),
        });
        onToggle(messageIndex, true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[Bookmark] Toggle failed:', message);
    }
  }, [sessionId, messageIndex, isBookmarked, onToggle]);

  return (
    <button
      onClick={handleClick}
      className={`p-1 transition-colors ${isBookmarked ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-gray-500'}`}
      title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={isBookmarked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
