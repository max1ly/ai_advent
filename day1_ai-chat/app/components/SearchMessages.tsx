'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SearchResult {
  session_id: string;
  message_index: number;
  role: string;
  content: string;
  snippet: string;
}

export interface SearchMessagesProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId: string | null;
  onScrollToMessage: (messageIndex: number) => void;
  onLoadSession: (sessionId: string) => void;
}

export function SearchMessages({
  isOpen,
  onClose,
  currentSessionId,
  onScrollToMessage,
  onLoadSession,
}: SearchMessagesProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if (!isOpen) {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: searchQuery });
      const res = await fetch(`/api/chat/search?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        console.warn('[Search] Failed:', data.error);
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Search] Error:', message);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  const handleResultClick = useCallback((result: SearchResult) => {
    if (result.session_id === currentSessionId) {
      onScrollToMessage(result.message_index);
    } else {
      onLoadSession(result.session_id);
      // After loading, scroll to the message
      setTimeout(() => {
        onScrollToMessage(result.message_index);
      }, 500);
    }
    onClose();
  }, [currentSessionId, onScrollToMessage, onLoadSession, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-xl mx-4 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="p-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400 flex-shrink-0"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Search messages..."
              className="flex-1 outline-none text-sm text-gray-800 placeholder-gray-400"
            />
            {isSearching && (
              <span className="text-xs text-gray-400">Searching...</span>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Esc
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-2">
          {results.length === 0 && query.trim() && !isSearching && (
            <p className="text-center text-sm text-gray-400 py-4">No results found</p>
          )}
          {results.map((result, idx) => (
            <button
              key={`${result.session_id}-${result.message_index}-${idx}`}
              onClick={() => handleResultClick(result)}
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 transition-colors block"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  result.role === 'user'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-green-50 text-green-600'
                }`}>
                  {result.role}
                </span>
                {result.session_id !== currentSessionId && (
                  <span className="text-xs text-gray-400">
                    other session
                  </span>
                )}
              </div>
              <p
                className="text-sm text-gray-700 line-clamp-2"
                dangerouslySetInnerHTML={{ __html: result.snippet }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
