'use client';

import { useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatContainer from './components/ChatContainer';
import ChatInput from './components/ChatInput';
import ErrorMessage from './components/ErrorMessage';
import ModelSelector from './components/ModelSelector';
import MetricsDisplay from './components/MetricsDisplay';
import type { Metrics } from './components/MetricsDisplay';
import { DEFAULT_MODEL } from '@/lib/models';

export default function Home() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const modelRef = useRef(model);

  // Keep ref in sync so transport always reads latest value
  modelRef.current = model;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        body: () => ({ model: modelRef.current }),
        fetch: async (input, init) => {
          if (typeof input === 'string' && input.endsWith('/api/chat') && init?.body) {
            const body = JSON.parse(init.body as string);
            console.log(
              '%c[Chat API]%c Request',
              'color: #0ea5e9; font-weight: bold',
              'color: inherit',
              {
                messageCount: body.messages?.length,
                model: body.model,
              },
            );
          }
          return globalThis.fetch(input, init);
        },
      }),
    [],
  );

  const { messages, sendMessage, error, status, regenerate } = useChat({
    transport,
    onData: (dataPart: any) => {
      if (dataPart.type === 'data-metrics') {
        setMetrics(dataPart.data as Metrics);
      }
    },
  });
  const [input, setInput] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    sendMessage({ text: input });
    setInput('');
  };

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
      {error && <ErrorMessage error={error} onRetry={regenerate} />}

      {/* Input area */}
      <ChatInput
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={status !== 'ready'}
      />
    </div>
  );
}
