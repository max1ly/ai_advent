'use client';

import { useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatContainer from './components/ChatContainer';
import ChatInput from './components/ChatInput';
import ErrorMessage from './components/ErrorMessage';
import StopSequencesInput from './components/StopSequencesInput';

export default function Home() {
  const [stopSequencesRaw, setStopSequencesRaw] = useState('');
  const stopSequencesRef = useRef<string[]>([]);

  // Keep ref in sync so transport always reads latest value
  stopSequencesRef.current = stopSequencesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        body: () => ({ stopSequences: stopSequencesRef.current }),
      }),
    [],
  );

  const { messages, sendMessage, error, status, regenerate } = useChat({
    transport,
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
        <h1 className="text-xl font-medium tracking-tight text-gray-800">Chat MAX</h1>
        <StopSequencesInput value={stopSequencesRaw} onChange={setStopSequencesRaw} />
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
