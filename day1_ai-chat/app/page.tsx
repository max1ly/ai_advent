'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ChatContainer from './components/ChatContainer';
import ChatInput from './components/ChatInput';
import ErrorMessage from './components/ErrorMessage';
import ModelSelector from './components/ModelSelector';
import MetricsDisplay from './components/MetricsDisplay';
import type { Metrics } from './components/MetricsDisplay';
import type { DisplayMessage } from '@/lib/types';
import { DEFAULT_MODEL } from '@/lib/models';

export default function Home() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming'>('ready');
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState('');
  const sessionIdRef = useRef<string | null>(null);
  const msgCounterRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedSessionId = localStorage.getItem('chat-session-id');
    if (!savedSessionId) {
      setIsLoading(false);
      return;
    }

    sessionIdRef.current = savedSessionId;
    fetch(`/api/chat/${savedSessionId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load history');
        return res.json();
      })
      .then((data) => {
        if (data.messages?.length > 0) {
          const displayMessages: DisplayMessage[] = data.messages.map(
            (m: { role: string; content: string }) => ({
              id: String(++msgCounterRef.current),
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }),
          );
          setMessages(displayMessages);
        }
      })
      .catch(() => {
        // Session not found or error — start fresh
        localStorage.removeItem('chat-session-id');
        sessionIdRef.current = null;
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || status !== 'ready') return;

      setInput('');
      setError(null);

      // Add user message to display
      const userMsg: DisplayMessage = {
        id: String(++msgCounterRef.current),
        role: 'user',
        content: text,
      };
      const assistantMsg: DisplayMessage = {
        id: String(++msgCounterRef.current),
        role: 'assistant',
        content: '',
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus('submitted');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            sessionId: sessionIdRef.current,
            model,
          }),
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

        // Capture session ID from response
        const sid = res.headers.get('x-session-id');
        if (sid) {
          sessionIdRef.current = sid;
          localStorage.setItem('chat-session-id', sid);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';

        setStatus('streaming');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!; // keep incomplete last line

          for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
            const event = JSON.parse(line.slice(6));

            if (event.type === 'text-delta') {
              assistantText += event.delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: assistantText,
                };
                return updated;
              });
            } else if (event.type === 'data-metrics') {
              setMetrics(event.data as Metrics);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        // Remove the empty assistant message on error
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setStatus('ready');
      }
    },
    [input, model, status],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setMessages((prev) => {
      const withoutLast = prev.filter(
        (_, i) => !(i === prev.length - 1 && prev[i].role === 'assistant' && !prev[i].content),
      );
      return withoutLast;
    });
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-50 lg:max-w-[66%] mx-auto lg:shadow-lg">
      {/* Header */}
      <header className="shadow-sm bg-white px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-medium tracking-tight text-gray-800">Chat MAX</h1>
          <ModelSelector value={model} onChange={setModel} />
        </div>
        <MetricsDisplay metrics={metrics} />
      </header>

      {/* Messages area */}
      <ChatContainer messages={messages} status={status} />

      {/* Error banner */}
      {error && <ErrorMessage error={error} onRetry={handleRetry} />}

      {/* Input area */}
      <ChatInput
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={status !== 'ready' || isLoading}
      />
    </div>
  );
}
