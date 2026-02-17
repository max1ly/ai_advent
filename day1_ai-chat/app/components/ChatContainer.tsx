'use client';

import { useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import type { UIMessage } from '@ai-sdk/react';

interface ChatContainerProps {
  messages: UIMessage[];
  status: string;
}

export default function ChatContainer({ messages, status }: ChatContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Smart auto-scroll: only scroll if user is near bottom
    const container = containerRef.current;
    const bottom = bottomRef.current;

    if (!container || !bottom) return;

    const isNearBottom =
      container.scrollHeight - container.scrollTop <= container.clientHeight + 100;

    if (isNearBottom) {
      bottom.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, status]);

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
      <div ref={bottomRef} />
    </div>
  );
}
