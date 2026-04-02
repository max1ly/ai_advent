'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const markdownComponents: Components = {
  pre({ children, ...props }: any) {
    return (
      <pre className="overflow-x-auto rounded-md bg-gray-800 p-2 text-xs" {...props}>
        {children}
      </pre>
    );
  },
  code({ className, children, ...props }: any) {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <code className={`text-gray-100 text-xs ${className}`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-gray-100 text-gray-800 px-1 py-0.5 text-xs" {...props}>
        {children}
      </code>
    );
  },
  p({ children, ...props }: any) {
    return <p className="mb-1.5 last:mb-0" {...props}>{children}</p>;
  },
  ul({ children, ...props }: any) {
    return <ul className="list-disc pl-4 mb-1.5" {...props}>{children}</ul>;
  },
  ol({ children, ...props }: any) {
    return <ol className="list-decimal pl-4 mb-1.5" {...props}>{children}</ol>;
  },
  li({ children, ...props }: any) {
    return <li className="mb-0.5" {...props}>{children}</li>;
  },
  a({ children, ...props }: any) {
    return <a className="text-indigo-600 underline" {...props}>{children}</a>;
  },
};

const GREETING = 'Hello! I\'m your support assistant. How can I help you today? I can answer questions about features, billing, troubleshooting, or check on your support tickets.';

const supportTransport = new DefaultChatTransport({
  api: '/api/support/chat',
});

interface SupportChatProps {
  onClose: () => void;
}

export default function SupportChat({ onClose }: SupportChatProps) {
  const { messages, sendMessage, status } = useChat({
    transport: supportTransport,
    id: 'support-chat',
    messages: [
      {
        id: 'greeting',
        role: 'assistant',
        parts: [{ type: 'text', text: GREETING }],
      },
    ],
  });

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isStreaming = status === 'streaming';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    sendMessage({ text });
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  function getMessageText(message: typeof messages[0]): string {
    if ('parts' in message && Array.isArray(message.parts)) {
      return message.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
    }
    return '';
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
          <span className="font-semibold text-sm">Support Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-indigo-500 rounded transition-colors"
          aria-label="Close support chat"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
        {messages.map((message) => {
          const text = getMessageText(message);
          if (!text) return null;

          const isUser = (message as { role: string }).role === 'user';

          if (isUser) {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-xl rounded-br-sm bg-indigo-600 px-3 py-2 text-white text-sm shadow-sm">
                  {text}
                </div>
              </div>
            );
          }

          return (
            <div key={message.id} className="flex justify-start">
              <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-white px-3 py-2 text-sm text-gray-800 shadow-sm border border-gray-100">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {text}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}

        {isStreaming && !getMessageText(messages[messages.length - 1]) && (
          <div className="flex justify-start">
            <div className="rounded-xl rounded-bl-sm bg-white px-3 py-2 shadow-sm border border-gray-100">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2 bg-white border-t border-gray-200 rounded-b-xl">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
