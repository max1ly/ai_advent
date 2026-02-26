'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ChatContainer from './components/ChatContainer';
import ChatInput from './components/ChatInput';
import type { PendingFile } from './components/ChatInput';
import ErrorMessage from './components/ErrorMessage';
import ModelSelector from './components/ModelSelector';
import MetricsDisplay from './components/MetricsDisplay';
import type { Metrics } from './components/MetricsDisplay';
import type { DisplayMessage, FileAttachment } from '@/lib/types';
import { DEFAULT_MODEL } from '@/lib/models';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix to get pure base64
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [model, setModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chat-model') || DEFAULT_MODEL;
    }
    return DEFAULT_MODEL;
  });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming'>('ready');
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
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
            (m: { role: string; content: string; files?: FileAttachment[] }) => ({
              id: String(++msgCounterRef.current),
              role: m.role as 'user' | 'assistant',
              content: m.content,
              files: m.files,
            }),
          );
          setMessages(displayMessages);
          // Scroll to bottom after history renders
          requestAnimationFrame(() => {
            const container = document.querySelector('[data-chat-container]');
            if (container) container.scrollTop = container.scrollHeight;
          });
        }
      })
      .catch(() => {
        localStorage.removeItem('chat-session-id');
        sessionIdRef.current = null;
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleModelChange = useCallback((modelId: string) => {
    setModel(modelId);
    localStorage.setItem('chat-model', modelId);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleFilesSelected = useCallback((files: File[]) => {
    const newPending: PendingFile[] = files.map((file) => {
      const pf: PendingFile = { file };
      if (file.type.startsWith('image/')) {
        pf.preview = URL.createObjectURL(file);
      }
      return pf;
    });
    setPendingFiles((prev) => [...prev, ...newPending]);
  }, []);

  const handleFileRemove = useCallback((index: number) => {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if ((!text && pendingFiles.length === 0) || status !== 'ready') return;

      // Capture and clear pending files
      const filesToSend = [...pendingFiles];
      setInput('');
      setPendingFiles([]);
      setError(null);

      // Clean up preview URLs
      filesToSend.forEach((pf) => {
        if (pf.preview) URL.revokeObjectURL(pf.preview);
      });

      // Add user message to display (files shown as pending — IDs will come from server)
      const userMsg: DisplayMessage = {
        id: String(++msgCounterRef.current),
        role: 'user',
        content: text,
        files: filesToSend.length > 0
          ? filesToSend.map((pf, i) => ({
              id: -(i + 1), // negative IDs = local/pending
              filename: pf.file.name,
              mediaType: pf.file.type || 'application/octet-stream',
              size: pf.file.size,
            }))
          : undefined,
      };
      const assistantMsg: DisplayMessage = {
        id: String(++msgCounterRef.current),
        role: 'assistant',
        content: '',
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus('submitted');

      try {
        // Convert files to base64
        const filesPayload = await Promise.all(
          filesToSend.map(async (pf) => ({
            filename: pf.file.name,
            mediaType: pf.file.type || 'application/octet-stream',
            data: await fileToBase64(pf.file),
          })),
        );

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            sessionId: sessionIdRef.current,
            model,
            files: filesPayload.length > 0 ? filesPayload : undefined,
          }),
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

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
          buffer = lines.pop()!;

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
            } else if (event.type === 'error') {
              const errorText = event.errorText || event.error || 'Unknown API error';
              setError(new Error(errorText));
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
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
    [input, model, status, pendingFiles],
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
          <ModelSelector value={model} onChange={handleModelChange} />
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
        pendingFiles={pendingFiles}
        onFilesSelected={handleFilesSelected}
        onFileRemove={handleFileRemove}
      />
    </div>
  );
}
