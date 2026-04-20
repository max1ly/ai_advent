'use client';

import { useCallback } from 'react';

export interface BookmarkEntry {
  messageIndex: number;
  label: string;
  contentPreview: string;
}

export interface BookmarksListProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: BookmarkEntry[];
  onScrollToMessage: (messageIndex: number) => void;
}

export function BookmarksList({ isOpen, onClose, bookmarks, onScrollToMessage }: BookmarksListProps) {
  const handleItemClick = useCallback((messageIndex: number) => {
    onScrollToMessage(messageIndex);
    onClose();
  }, [onScrollToMessage, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[70vh] bg-white rounded-xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-800">Bookmarks</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close bookmarks"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(70vh-56px)] p-4">
          {bookmarks.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No bookmarks yet. Click the star icon on a message to bookmark it.</p>
          ) : (
            <ul className="space-y-2">
              {bookmarks.map((bm) => (
                <li key={bm.messageIndex}>
                  <button
                    onClick={() => handleItemClick(bm.messageIndex)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-yellow-500 flex-shrink-0"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">Message #{bm.messageIndex + 1}</span>
                      {bm.label !== 'bookmark' && (
                        <span className="text-xs text-gray-400">{bm.label}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 pl-6">{bm.contentPreview}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
