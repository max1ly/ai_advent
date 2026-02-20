'use client';

import { useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatContainer from './components/ChatContainer';
import ChatInput from './components/ChatInput';
import ErrorMessage from './components/ErrorMessage';
import TemperatureSlider from './components/TemperatureSlider';

export default function Home() {
  const [temperature, setTemperature] = useState(1.0);
  const temperatureRef = useRef(1.0);

  // Keep ref in sync so transport always reads latest value
  temperatureRef.current = temperature;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        body: () => ({ temperature: temperatureRef.current }),
        fetch: async (input, init) => {
          if (typeof input === 'string' && input.endsWith('/api/chat') && init?.body) {
            const body = JSON.parse(init.body as string);
            console.log(
              '%c[Chat API]%c Request',
              'color: #0ea5e9; font-weight: bold',
              'color: inherit',
              {
                messageCount: body.messages?.length,
                temperature: body.temperature,
                messages: body.messages,
              },
            );
          }
          return globalThis.fetch(input, init);
        },
      }),
    [],
  );

  const { messages, sendMessage, error, status, regenerate } = useChat({ transport });
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
        <h1 className="text-xl font-medium tracking-tight text-gray-800">Chat MAX</h1>
        <TemperatureSlider value={temperature} onChange={setTemperature} />
      </header>

      {/* Messages area - takes remaining space */}
      <ChatContainer messages={messages} status={status} />

      {/* Error banner - shown conditionally above input */}
      {error && <ErrorMessage error={error} onRetry={regenerate} />}

      {/* Input area - fixed at bottom */}
      <ChatInput
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={status !== 'ready'}
      />
    </div>
  );
}
