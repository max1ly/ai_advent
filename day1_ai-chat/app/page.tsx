'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChatContainer from './components/ChatContainer';
import ChatInput from './components/ChatInput';
import type { PendingFile } from './components/ChatInput';
import ErrorMessage from './components/ErrorMessage';
import ModelSelector from './components/ModelSelector';
import { MetricsDisplay } from './components/MetricsDisplay';
import MemoryDialog from './components/MemoryDialog';
import InvariantsDialog from './components/InvariantsDialog';
import IndexDialog from './components/IndexDialog';
import McpSettingsDialog from './components/McpSettingsDialog';
import ToolConfirmDialog from './components/ToolConfirmDialog';
import SupportBubble from './components/SupportBubble';
import { SessionHistory } from './components/SessionHistory';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { BookmarksList } from './components/BookmarksList';
import type { BookmarkEntry } from './components/BookmarksList';
import { SearchMessages } from './components/SearchMessages';
import { SystemPromptSelector } from './components/SystemPromptSelector';
import { SystemPromptDialog } from './components/SystemPromptDialog';
import type { ShortcutHandlers } from '@/lib/keyboard-shortcuts';
import type { Metrics, StrategyType, Branch, Invariant, McpToolCallRequest } from '@/lib/types';
import type { DisplayMessage, FileAttachment, RagSource } from '@/lib/types';
import type { PendingWriteData } from './components/ChatMessage';
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
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [strategy, setStrategy] = useState<StrategyType>('sliding-window');
  const [windowSize, setWindowSize] = useState(10);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming'>('ready');
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const pendingFilesRef = useRef<PendingFile[]>(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  const sessionIdRef = useRef<string | null>(null);
  const msgCounterRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isInvariantsOpen, setIsInvariantsOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [isIndexOpen, setIsIndexOpen] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragThreshold, setRagThreshold] = useState(0.3);
  const [ragTopK, setRagTopK] = useState(10);
  const [ragRerank, setRagRerank] = useState(true);
  const [ragSourceFilter, setRagSourceFilter] = useState<string[]>([]);
  const [invariants, setInvariants] = useState<Invariant[]>([]);
  const [pendingToolCall, setPendingToolCall] = useState<McpToolCallRequest | null>(null);
  const [pendingWrites, setPendingWrites] = useState<Array<PendingWriteData & { messageId: string }>>([]);
  const [isSessionHistoryOpen, setIsSessionHistoryOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSystemPromptDialogOpen, setIsSystemPromptDialogOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedPromptContent, setSelectedPromptContent] = useState<string>('');
  const [systemPromptRefreshKey, setSystemPromptRefreshKey] = useState(0);
  const [bookmarkedIndices, setBookmarkedIndices] = useState<Set<number>>(new Set());
  const toolChainDepthRef = useRef(0);
  const toolChainResultsRef = useRef<Array<{ tool: string; result: string }>>([]);
  const currentAssistantMsgIdRef = useRef<string>('');

  const loadBookmarks = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/bookmarks?sessionId=${encodeURIComponent(sid)}`);
      if (!res.ok) return;
      const data = await res.json();
      const indices = new Set<number>(
        (data.bookmarks ?? []).map((b: { message_index: number }) => b.message_index),
      );
      setBookmarkedIndices(indices);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[Bookmarks] Failed to load:', message);
    }
  }, []);

  const handleBookmarkToggle = useCallback((messageIndex: number, bookmarked: boolean) => {
    setBookmarkedIndices((prev) => {
      const next = new Set(prev);
      if (bookmarked) {
        next.add(messageIndex);
      } else {
        next.delete(messageIndex);
      }
      return next;
    });
  }, []);

  const handleScrollToMessage = useCallback((messageIndex: number) => {
    const container = document.querySelector('[data-chat-container]');
    if (!container) return;
    const messageElements = container.querySelectorAll('[data-message-index]');
    const target = Array.from(messageElements).find(
      (el) => el.getAttribute('data-message-index') === String(messageIndex),
    );
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const bookmarkEntries: BookmarkEntry[] = useMemo(() => {
    return Array.from(bookmarkedIndices)
      .sort((a, b) => a - b)
      .map((idx) => {
        const msg = messages[idx];
        return {
          messageIndex: idx,
          label: 'bookmark',
          contentPreview: msg ? msg.content.slice(0, 120) : '',
        };
      });
  }, [bookmarkedIndices, messages]);

  const handleExport = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      const res = await fetch(`/api/chat/export?sessionId=${encodeURIComponent(sessionIdRef.current)}`);
      if (!res.ok) {
        const data = await res.json();
        console.warn('[Export] Failed:', data.error);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-export-${sessionIdRef.current.slice(0, 8)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Export] Error:', message);
    }
  }, []);

  const handleSelectPrompt = useCallback((id: string | null, content: string) => {
    setSelectedPromptId(id);
    setSelectedPromptContent(content);
  }, []);

  const handleSystemPromptsChanged = useCallback(() => {
    setSystemPromptRefreshKey((k) => k + 1);
  }, []);

  const handleMemoryOpen = useCallback(() => setIsMemoryOpen(true), []);

  const handleRagToggle = useCallback((enabled: boolean) => {
    setRagEnabled(enabled);
    localStorage.setItem('chat-rag-enabled', String(enabled));
  }, []);

  const handleRagThresholdChange = useCallback((value: number) => {
    setRagThreshold(value);
    localStorage.setItem('chat-rag-threshold', String(value));
  }, []);

  const handleRagTopKChange = useCallback((value: number) => {
    setRagTopK(value);
    localStorage.setItem('chat-rag-topk', String(value));
  }, []);

  const handleRagRerankToggle = useCallback((enabled: boolean) => {
    setRagRerank(enabled);
    localStorage.setItem('chat-rag-rerank', String(enabled));
  }, []);

  const handleInvariantsUpdate = useCallback((updated: Invariant[]) => {
    setInvariants(updated);
    if (sessionIdRef.current) {
      localStorage.setItem(`invariants-${sessionIdRef.current}`, JSON.stringify(updated));
    }
  }, []);

  // Hydrate from localStorage after mount to avoid SSR/client mismatch
  useEffect(() => {
    const savedModel = localStorage.getItem('chat-model');
    if (savedModel) setModel(savedModel);
    const savedStrategy = localStorage.getItem('chat-strategy') as StrategyType | null;
    if (savedStrategy) setStrategy(savedStrategy);
    const savedWindowSize = localStorage.getItem('chat-window-size');
    if (savedWindowSize) setWindowSize(parseInt(savedWindowSize) || 10);
    const savedRag = localStorage.getItem('chat-rag-enabled');
    if (savedRag) setRagEnabled(savedRag === 'true');
    const savedThreshold = localStorage.getItem('chat-rag-threshold');
    if (savedThreshold) setRagThreshold(parseFloat(savedThreshold) || 0.3);
    const savedTopK = localStorage.getItem('chat-rag-topk');
    if (savedTopK) setRagTopK(parseInt(savedTopK) || 10);
    const savedRerank = localStorage.getItem('chat-rag-rerank');
    if (savedRerank) setRagRerank(savedRerank !== 'false');
  }, []);

  useEffect(() => {
    const savedSessionId = localStorage.getItem('chat-session-id');
    if (!savedSessionId) {
      setIsLoading(false);
      return;
    }

    sessionIdRef.current = savedSessionId;
    loadBookmarks(savedSessionId).catch(() => {});
    const savedInvariants = localStorage.getItem(`invariants-${savedSessionId}`);
    if (savedInvariants) {
      try {
        setInvariants(JSON.parse(savedInvariants));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[Invariants] Failed to parse saved invariants:', message);
        setInvariants([]);
      }
    }
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

  // Cmd/Ctrl+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleModelChange = useCallback((modelId: string) => {
    setModel(modelId);
    localStorage.setItem('chat-model', modelId);
  }, []);

  const handleStrategyChange = useCallback((type: StrategyType) => {
    setStrategy(type);
    localStorage.setItem('chat-strategy', type);
  }, []);

  const handleWindowSizeChange = useCallback((size: number) => {
    setWindowSize(size);
    localStorage.setItem('chat-window-size', String(size));
  }, []);

  const handleNewChat = useCallback(async () => {
    if (sessionIdRef.current) {
      await fetch('/api/chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, action: 'new-chat' }),
      });
    }
    sessionIdRef.current = null;
    localStorage.removeItem('chat-session-id');
    setMessages([]);
    setMetrics(null);
    setError(null);
    setInvariants([]);
    setBranches([]);
    setActiveBranchId(null);
    setBookmarkedIndices(new Set());
  }, []);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error('Failed to load session');
      const data = await res.json();
      if (data.messages?.length > 0) {
        const displayMessages: DisplayMessage[] = data.messages.map(
          (m: { role: string; content: string }) => ({
            id: String(++msgCounterRef.current),
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }),
        );
        setMessages(displayMessages);
        sessionIdRef.current = sessionId;
        localStorage.setItem('chat-session-id', sessionId);
        setMetrics(null);
        setError(null);
        setInvariants([]);
        setBranches([]);
        setActiveBranchId(null);
        loadBookmarks(sessionId).catch(() => {});
        requestAnimationFrame(() => {
          const container = document.querySelector('[data-chat-container]');
          if (container) container.scrollTop = container.scrollHeight;
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[SessionHistory] Failed to load session:', message);
    }
  }, [loadBookmarks]);

  const handleCheckpoint = useCallback(async () => {
    if (!sessionIdRef.current) {
      console.warn('[Checkpoint] No session ID — send a message first');
      return;
    }
    try {
      const res = await fetch('/api/chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, action: 'checkpoint' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        console.error('[Checkpoint] Failed:', res.status, err);
        return;
      }
      const data = await res.json();
      setBranches(data.branches);
      setActiveBranchId(data.branches[0]?.id ?? null);
    } catch (err) {
      console.error('[Checkpoint] Error:', err);
    }
  }, []);

  const handleSwitchBranch = useCallback(async (branchId: string) => {
    if (!sessionIdRef.current) return;
    setActiveBranchId(branchId);
    try {
      const res = await fetch('/api/chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, action: 'switch-branch', branchId }),
      });
      if (res.ok) {
        const data = await res.json();
        const displayMessages: DisplayMessage[] = data.messages.map(
          (m: { role: string; content: string }, i: number) => ({
            id: `branch-${i}`,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }),
        );
        setMessages(displayMessages);
        msgCounterRef.current = displayMessages.length;
      } else {
        console.error('[SwitchBranch] Failed:', res.status);
      }
    } catch (err) {
      console.error('[SwitchBranch] Error:', err);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleFilesSelected = useCallback((files: File[]) => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      const names = oversized.map((f) => f.name).join(', ');
      setError(new Error(`File${oversized.length > 1 ? 's' : ''} exceeded 50MB limit: ${names}`));
      // Only keep files that are within the size limit
      const valid = files.filter((f) => f.size <= MAX_FILE_SIZE);
      if (valid.length === 0) return;
      files = valid;
    }
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

  // Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      pendingFilesRef.current.forEach((pf) => {
        if (pf.preview) URL.revokeObjectURL(pf.preview);
      });
    };
  }, []);

  // Shared SSE stream handler — reads events and updates UI
  const streamChatResponse = useCallback(async (res: Response) => {
    const sid = res.headers.get('x-session-id');
    if (sid) {
      sessionIdRef.current = sid;
      localStorage.setItem('chat-session-id', sid);
      if (invariants.length > 0) {
        localStorage.setItem(`invariants-${sid}`, JSON.stringify(invariants));
      }
    }

    if (!res.body) {
      throw new Error('Response body is null — streaming is not supported by this environment');
    }
    const reader = res.body.getReader();
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
        let event;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          console.warn('[SSE] Malformed event, skipping:', line.slice(6, 100));
          continue;
        }
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
        } else if (event.type === 'data-pending-write') {
          const msgId = currentAssistantMsgIdRef.current;
          console.log('[SSE] Received data-pending-write:', event.data, 'for message:', msgId);
          setPendingWrites(prev => [...prev, {
            ...(event.data as PendingWriteData),
            messageId: msgId,
          }]);
        } else if (event.type === 'data-rag-sources') {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              ragSources: event.data as RagSource[],
            };
            return updated;
          });
        } else if (event.type === 'tool-input-available') {
          const toolNameStr = event.toolName as string;
          // pipeline_complete is a signal tool — display summary, no confirmation needed
          if (toolNameStr === 'pipeline_complete') {
            const input = (event.input ?? {}) as { summary?: string };
            if (input.summary) {
              assistantText += input.summary;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: assistantText,
                };
                return updated;
              });
            }
            toolChainDepthRef.current = 0;
            toolChainResultsRef.current = [];
          } else {
            // LLM wants to call an MCP tool — show confirmation
            const nameParts = toolNameStr.match(/^mcp__(.+?)__(.+)$/);
            if (nameParts) {
              const toolArgs = (event.input ?? {}) as Record<string, unknown>;
              setPendingToolCall({
                callId: event.toolCallId as string,
                serverId: '', // resolved server-side by tool name
                serverName: nameParts[1].replace(/_/g, ' '),
                toolName: nameParts[2],
                args: toolArgs,
              });
            }
          }
        } else if (event.type === 'error') {
          const errorText = event.errorText || event.error || 'Unknown API error';
          setError(new Error(errorText));
        }
      }
    }
  }, [invariants]);

  // Send a message to the LLM and stream the response
  const sendAndStream = useCallback(async (text: string, opts?: { filesPayload?: Array<{ filename: string; mediaType: string; data: string }>; forceToolUse?: boolean; diffReview?: boolean }) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        sessionId: sessionIdRef.current,
        model,
        files: opts?.filesPayload && opts.filesPayload.length > 0 ? opts.filesPayload : undefined,
        strategy,
        windowSize,
        invariants: invariants.filter(inv => inv.enabled).map(inv => inv.text),
        forceToolUse: opts?.forceToolUse,
        ragEnabled,
        ragThreshold,
        ragTopK,
        ragRerank,
        ragSourceFilter: ragSourceFilter.length > 0 ? ragSourceFilter : undefined,
        diffReview: opts?.diffReview,
        systemPrompt: selectedPromptContent || undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    await streamChatResponse(res);
  }, [model, strategy, windowSize, invariants, ragEnabled, ragThreshold, ragTopK, ragRerank, ragSourceFilter, selectedPromptContent, streamChatResponse]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if ((!text && pendingFiles.length === 0) || status !== 'ready') return;
      toolChainDepthRef.current = 0;
      toolChainResultsRef.current = [];

      // /diff command — code review mode
      if (text.startsWith('/diff')) {
        setInput('');
        setError(null);
        const diffUserMsg: DisplayMessage = {
          id: String(++msgCounterRef.current),
          role: 'user',
          content: text,
        };
        const diffAssistantMsg: DisplayMessage = {
          id: String(++msgCounterRef.current),
          role: 'assistant',
          content: '',
        };
        currentAssistantMsgIdRef.current = diffAssistantMsg.id;
        setMessages((prev) => [...prev, diffUserMsg, diffAssistantMsg]);
        setStatus('submitted');
        try {
          await sendAndStream(text, { diffReview: true });
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
            return prev;
          });
        } finally {
          setStatus('ready');
        }
        return;
      }

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
      currentAssistantMsgIdRef.current = assistantMsg.id;
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

        await sendAndStream(text, { filesPayload });
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
    [input, model, status, pendingFiles, strategy, windowSize, invariants, sendAndStream],
  );

  const handleToolAllow = useCallback(async () => {
    if (!pendingToolCall) return;
    const toolCall = pendingToolCall;
    setPendingToolCall(null);
    try {
      // Enrich tool args with accumulated pipeline data
      // This ensures fields like 'translated' from earlier steps get passed through
      // even if the LLM forgets to include them
      let enrichedArgs = { ...toolCall.args };
      if (toolChainResultsRef.current.length > 0) {
        let mergedPipelineData: Record<string, unknown> = {};
        for (const r of toolChainResultsRef.current) {
          try {
            const parsed = JSON.parse(r.result);
            let actualData = parsed;
            if (parsed?.content?.[0]?.text) {
              try { actualData = JSON.parse(parsed.content[0].text); } catch (err: unknown) { console.warn('[Pipeline] content[0].text is not JSON:', err instanceof Error ? err.message : String(err)); }
            }
            if (typeof actualData === 'object' && actualData !== null) {
              mergedPipelineData = { ...mergedPipelineData, ...actualData };
            }
          } catch (err: unknown) { console.warn('[Pipeline] Failed to parse tool result:', err instanceof Error ? err.message : String(err)); }
        }
        // Only fill in missing fields — don't override what the LLM explicitly set
        for (const [key, value] of Object.entries(mergedPipelineData)) {
          if (!(key in enrichedArgs)) {
            enrichedArgs[key] = value;
          }
        }
      }

      // Execute the MCP tool
      const res = await fetch('/api/mcp/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: toolCall.serverId,
          toolName: toolCall.toolName,
          args: enrichedArgs,
          callId: toolCall.callId,
        }),
      });
      const data = await res.json();
      const resultText = data.isError
        ? `Tool error: ${data.error}`
        : typeof data.result === 'string'
          ? data.result
          : JSON.stringify(data.result, null, 2);

      // Show tool result in UI
      const toolResultMsg: DisplayMessage = {
        id: String(++msgCounterRef.current),
        role: 'assistant',
        content: `**[Tool Result: ${toolCall.toolName}]**\n\`\`\`\n${resultText}\n\`\`\``,
      };
      setMessages((prev) => [...prev, toolResultMsg]);

      // Feed result back to LLM so it can continue the pipeline
      toolChainDepthRef.current++;
      toolChainResultsRef.current.push({ tool: toolCall.toolName, result: resultText });
      const shouldForceToolUse = toolChainDepthRef.current < 5;

      // Merge all pipeline results into a single object so the LLM has all fields available
      // MCP results are wrapped as {content: [{type: "text", text: "{...actual data...}"}]}
      // We need to unwrap to get the actual tool output data
      let mergedData: Record<string, unknown> = {};
      for (const r of toolChainResultsRef.current) {
        try {
          const parsed = JSON.parse(r.result);
          let actualData = parsed;
          // Unwrap MCP content wrapper if present
          if (parsed?.content?.[0]?.text) {
            try {
              actualData = JSON.parse(parsed.content[0].text);
            } catch (err: unknown) { console.warn('[Pipeline] content[0].text is not JSON, using outer object:', err instanceof Error ? err.message : String(err)); }
          }
          if (typeof actualData === 'object' && actualData !== null) {
            mergedData = { ...mergedData, ...actualData };
          }
        } catch (err: unknown) { console.warn('[Pipeline] Non-JSON tool result, skipping:', err instanceof Error ? err.message : String(err)); }
      }
      const mergedDataStr = Object.keys(mergedData).length > 0
        ? `\n\nMerged data from all pipeline steps:\n${JSON.stringify(mergedData, null, 2)}`
        : '';

      const allResults = toolChainResultsRef.current
        .map(r => `[${r.tool}]: ${r.result}`)
        .join('\n\n');
      const continuationMsg = `Pipeline progress:\n${allResults}${mergedDataStr}\n\nCheck the user's ORIGINAL request. If there are remaining steps, call the next tool. When calling the next tool, pass ALL relevant fields from the merged data above — especially the "translated" field if a translation was done. If all requested steps are done, call "pipeline_complete" with a brief summary. Do NOT call tools the user didn't ask for.`;
      const assistantMsg: DisplayMessage = {
        id: String(++msgCounterRef.current),
        role: 'assistant',
        content: '',
      };
      currentAssistantMsgIdRef.current = assistantMsg.id;
      setMessages((prev) => [...prev, assistantMsg]);
      setStatus('submitted');

      await sendAndStream(continuationMsg, { forceToolUse: shouldForceToolUse });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[MCP] Tool execution failed:', message);
      setError(err instanceof Error ? err : new Error(message));
    } finally {
      setStatus('ready');
    }
  }, [pendingToolCall, sendAndStream]);

  const handleToolDeny = useCallback(() => {
    if (!pendingToolCall) return;
    const toolCall = pendingToolCall;
    setPendingToolCall(null);
    const denialMsg: DisplayMessage = {
      id: String(++msgCounterRef.current),
      role: 'assistant',
      content: `*Tool call denied: ${toolCall.toolName}*`,
    };
    setMessages((prev) => [...prev, denialMsg]);
  }, [pendingToolCall]);

  const handleRetry = useCallback(() => {
    setError(null);
    setMessages((prev) => {
      const withoutLast = prev.filter(
        (_, i) => !(i === prev.length - 1 && prev[i].role === 'assistant' && !prev[i].content),
      );
      return withoutLast;
    });
  }, []);

  const handleCopyLastAssistantMessage = useCallback(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
    if (lastAssistant?.content) {
      navigator.clipboard.writeText(lastAssistant.content).catch((err) =>
        console.log('[Shortcuts] Copy failed:', err instanceof Error ? err.message : String(err)),
      );
    }
  }, [messages]);

  const handleToggleSidebar = useCallback(() => {
    setIsSessionHistoryOpen((prev) => !prev);
  }, []);

  const handleCloseDialog = useCallback(() => {
    if (isShortcutsOpen) { setIsShortcutsOpen(false); return; }
    if (isMemoryOpen) { setIsMemoryOpen(false); return; }
    if (isInvariantsOpen) { setIsInvariantsOpen(false); return; }
    if (isMcpOpen) { setIsMcpOpen(false); return; }
    if (isIndexOpen) { setIsIndexOpen(false); return; }
    if (isSessionHistoryOpen) { setIsSessionHistoryOpen(false); return; }
  }, [isShortcutsOpen, isMemoryOpen, isInvariantsOpen, isMcpOpen, isIndexOpen, isSessionHistoryOpen]);

  const shortcutHandlers: ShortcutHandlers = useMemo(() => ({
    onNewChat: handleNewChat,
    onToggleSidebar: handleToggleSidebar,
    onCopyLastAssistantMessage: handleCopyLastAssistantMessage,
    onCloseDialog: handleCloseDialog,
    onShowHelp: () => setIsShortcutsOpen(true),
  }), [handleNewChat, handleToggleSidebar, handleCopyLastAssistantMessage, handleCloseDialog]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 lg:max-w-[66%] mx-auto lg:shadow-lg">
      {/* Header */}
      <header className="shadow-sm bg-white px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-medium tracking-tight text-gray-800">MaxSeek Chat</h1>
            <button
              onClick={() => setIsSessionHistoryOpen(true)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Session History"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </button>
            <button
              onClick={() => setIsBookmarksOpen(true)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Bookmarks"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <button
              onClick={() => setIsMcpOpen(true)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="MCP Servers"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v5" />
                <path d="M6 7h12" />
                <path d="M8 7v4a4 4 0 0 0 8 0V7" />
                <path d="M12 15v4" />
                <path d="M8 19h8" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <SystemPromptSelector
              key={systemPromptRefreshKey}
              selectedPromptId={selectedPromptId}
              onSelectPrompt={handleSelectPrompt}
              onManageOpen={() => setIsSystemPromptDialogOpen(true)}
            />
            <ModelSelector value={model} onChange={handleModelChange} />
          </div>
        </div>
        <MetricsDisplay
          metrics={metrics}
          strategy={strategy}
          windowSize={windowSize}
          branches={branches}
          activeBranchId={activeBranchId}
          onStrategyChange={handleStrategyChange}
          onWindowSizeChange={handleWindowSizeChange}
          onNewChat={handleNewChat}
          onCheckpoint={handleCheckpoint}
          onSwitchBranch={handleSwitchBranch}
          onMemoryOpen={handleMemoryOpen}
          onInvariantsOpen={() => setIsInvariantsOpen(true)}
          invariantCount={invariants.filter(inv => inv.enabled).length}
          onIndexOpen={() => setIsIndexOpen(true)}
          ragEnabled={ragEnabled}
          onRagToggle={handleRagToggle}
          ragThreshold={ragThreshold}
          ragTopK={ragTopK}
          onRagThresholdChange={handleRagThresholdChange}
          onRagTopKChange={handleRagTopKChange}
          ragRerank={ragRerank}
          onRagRerankToggle={handleRagRerankToggle}
          onExport={handleExport}
        />
      </header>

      {/* Messages area */}
      <ChatContainer
        messages={messages}
        status={status}
        pendingWrites={pendingWrites}
        sessionId={sessionIdRef.current}
        bookmarkedIndices={bookmarkedIndices}
        onBookmarkToggle={handleBookmarkToggle}
      />

      {/* Tool confirmation */}
      {pendingToolCall && (
        <div className="px-4 py-2">
          <ToolConfirmDialog
            request={pendingToolCall}
            onAllow={handleToolAllow}
            onDeny={handleToolDeny}
          />
        </div>
      )}

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

      <MemoryDialog
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        sessionId={sessionIdRef.current}
        stmInfo={{ messageCount: messages.length, strategy, windowSize }}
      />

      <InvariantsDialog
        isOpen={isInvariantsOpen}
        onClose={() => setIsInvariantsOpen(false)}
        invariants={invariants}
        onUpdate={handleInvariantsUpdate}
      />

      <IndexDialog
        isOpen={isIndexOpen}
        onClose={() => setIsIndexOpen(false)}
        selectedDocs={ragSourceFilter}
        onSelectedDocsChange={setRagSourceFilter}
      />

      <McpSettingsDialog
        isOpen={isMcpOpen}
        onClose={() => setIsMcpOpen(false)}
      />

      <SystemPromptDialog
        isOpen={isSystemPromptDialogOpen}
        onClose={() => setIsSystemPromptDialogOpen(false)}
        onPromptsChanged={handleSystemPromptsChanged}
      />

      <SupportBubble />

      <SessionHistory
        currentSessionId={sessionIdRef.current}
        onSelectSession={handleSelectSession}
        isOpen={isSessionHistoryOpen}
        onClose={() => setIsSessionHistoryOpen(false)}
      />

      <ShortcutsDialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <BookmarksList
        isOpen={isBookmarksOpen}
        onClose={() => setIsBookmarksOpen(false)}
        bookmarks={bookmarkEntries}
        onScrollToMessage={handleScrollToMessage}
      />

      <KeyboardShortcuts handlers={shortcutHandlers} />

      <SearchMessages
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        currentSessionId={sessionIdRef.current}
        onScrollToMessage={handleScrollToMessage}
        onLoadSession={handleSelectSession}
      />
    </div>
  );
}
