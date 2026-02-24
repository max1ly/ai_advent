'use client';

import { useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import type { DisplayMessage } from '@/lib/types';

interface ChatContainerProps {
  messages: DisplayMessage[];
  status: string;
}

export default function ChatContainer({ messages, status }: ChatContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const lastMessageText = messages.at(-1)?.content ?? '';
  const isStreaming = status === 'streaming';

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNearBottom =
      container.scrollHeight - container.scrollTop <= container.clientHeight + 150;

    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, status, lastMessageText, isStreaming]);

  return (
    <div
      ref={containerRef}
      className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
    >
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-gray-500">
          Send a message to start chatting
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
            />
          ))}
          {status === 'submitted' && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3">
                <div className="flex items-center gap-1">
                  <span className="animate-bounce-dots h-2 w-2 rounded-full bg-gray-400" />
                  <span className="animate-bounce-dots animation-delay-200 h-2 w-2 rounded-full bg-gray-400" />
                  <span className="animate-bounce-dots animation-delay-400 h-2 w-2 rounded-full bg-gray-400" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <div />
    </div>
  );
}
