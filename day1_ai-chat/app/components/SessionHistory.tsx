'use client';

import { useCallback, useEffect, useState } from 'react';

export interface SessionItem {
  session_id: string;
  started: string;
  last_active: string;
  message_count: number;
}

export interface SessionHistoryProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffHours < 24 * 7) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function SessionHistory({ currentSessionId, onSelectSession, isOpen, onClose }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chat/sessions');
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[SessionHistory] Failed to load sessions:', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen, fetchSessions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Sidebar */}
      <div className="relative z-10 w-80 max-w-[85vw] bg-white h-full shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-800">Session History</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close session history"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-gray-500 text-sm">Loading sessions...</div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">No past sessions</div>
          )}
          {!loading && sessions.map((session) => {
            const isCurrent = session.session_id === currentSessionId;
            return (
              <button
                key={session.session_id}
                onClick={() => {
                  onSelectSession(session.session_id);
                  onClose();
                }}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  isCurrent ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {isCurrent ? 'Current session' : `Session`}
                  </span>
                  <span className="text-xs text-gray-400 ml-2 shrink-0">
                    {formatDate(session.last_active)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">
                    {session.message_count} message{session.message_count !== 1 ? 's' : ''}
                  </span>
                  {isCurrent && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
