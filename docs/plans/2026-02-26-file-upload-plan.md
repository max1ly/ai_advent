# File Upload & Display — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to upload any file to the chat, display images/videos inline, show other files as pills, and extract text from text-based files to send to the model.

**Architecture:** Files are stored as BLOBs in a new SQLite `files` table linked to messages by `message_id`. A new `/api/files/[id]` endpoint serves files with correct MIME types for rendering. Text-based files have their content extracted and appended to the user message for the model. The client manages pending files state, sends them base64-encoded, and renders attachments in message bubbles.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, better-sqlite3, Vercel AI SDK v6

---

### Task 1: Add files table and DB functions

**Files:**
- Modify: `day1_ai-chat/lib/db.ts`

**Step 1: Add files table to schema**

In the `db.exec()` call (after the messages table creation), add:

```sql
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_session ON files(session_id);
CREATE INDEX IF NOT EXISTS idx_files_message ON files(message_id);
```

**Step 2: Update `saveMessage` to return the inserted row ID**

Change:

```typescript
export function saveMessage(
  sessionId: string,
  role: string,
  content: string,
  model?: string,
): number {
  const result = db.prepare(
    'INSERT INTO messages (session_id, role, content, model) VALUES (?, ?, ?, ?)',
  ).run(sessionId, role, content, model ?? null);
  return Number(result.lastInsertRowid);
}
```

**Step 3: Add `saveFile` function**

```typescript
export function saveFile(
  messageId: number,
  sessionId: string,
  filename: string,
  mediaType: string,
  data: Buffer,
): number {
  const result = db.prepare(
    'INSERT INTO files (message_id, session_id, filename, media_type, data, size) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(messageId, sessionId, filename, mediaType, data, data.length);
  return Number(result.lastInsertRowid);
}
```

**Step 4: Add `getFile` function**

```typescript
export function getFile(
  id: number,
): { filename: string; media_type: string; data: Buffer; size: number } | null {
  return db.prepare(
    'SELECT filename, media_type, data, size FROM files WHERE id = ?',
  ).get(id) as { filename: string; media_type: string; data: Buffer; size: number } | null;
}
```

**Step 5: Add `getMessageFiles` function**

```typescript
export function getMessageFiles(
  messageId: number,
): { id: number; filename: string; media_type: string; size: number }[] {
  return db.prepare(
    'SELECT id, filename, media_type, size FROM files WHERE message_id = ?',
  ).all(messageId) as { id: number; filename: string; media_type: string; size: number }[];
}
```

**Step 6: Add `getSessionMessagesWithFiles` function**

This replaces usage of `getSessionMessages` for history loading — returns messages with their file metadata:

```typescript
export function getSessionMessagesWithFiles(
  sessionId: string,
): { id: number; role: string; content: string; model: string | null; created_at: string; files: { id: number; filename: string; media_type: string; size: number }[] }[] {
  const messages = db.prepare(
    'SELECT id, role, content, model, created_at FROM messages WHERE session_id = ? ORDER BY id',
  ).all(sessionId) as { id: number; role: string; content: string; model: string | null; created_at: string }[];

  return messages.map((m) => ({
    ...m,
    files: getMessageFiles(m.id),
  }));
}
```

**Step 7: Verify — run TypeScript check**

Run: `cd /Users/maxlee/Projects/ai/ai-advent-challenge/day1_ai-chat && npx tsc --noEmit`
Expected: May show errors in files that call `saveMessage` without using return value — that's fine, we fix callers in Task 3.

---

### Task 2: Update types

**Files:**
- Modify: `day1_ai-chat/lib/types.ts`

**Step 1: Add FileAttachment type and update DisplayMessage**

Replace the entire file:

```typescript
export interface FileAttachment {
  id: number;
  filename: string;
  mediaType: string;
  size: number;
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: FileAttachment[];
}
```

---

### Task 3: Update agent to accept files and extract text

**Files:**
- Modify: `day1_ai-chat/lib/agent.ts`

**Step 1: Add file input type**

After the `Message` type (line 6), add:

```typescript
export interface ChatFile {
  filename: string;
  mediaType: string;
  data: string; // base64
}
```

**Step 2: Add text extraction helper**

Before the `ChatAgent` class, add:

```typescript
const TEXT_TYPES = new Set([
  'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
  'application/json', 'application/xml', 'text/xml', 'text/markdown',
]);

function isTextFile(mediaType: string): boolean {
  return TEXT_TYPES.has(mediaType) || mediaType.startsWith('text/');
}

function extractTextFromFiles(files: ChatFile[]): string {
  const parts: string[] = [];
  for (const file of files) {
    if (isTextFile(file.mediaType)) {
      const text = Buffer.from(file.data, 'base64').toString('utf-8');
      parts.push(`[File: ${file.filename}]\n${text}`);
    }
  }
  return parts.join('\n\n');
}
```

**Step 3: Update `chat()` method signature and message construction**

Change the `chat` method to accept optional files:

```typescript
chat(userMessage: string, files?: ChatFile[]) {
```

Update the message construction at the top of `chat()`. Replace:

```typescript
this.history.push({ role: 'user', content: userMessage });
this.onMessagePersist?.('user', userMessage);
```

With:

```typescript
// Build the full message with extracted file text
let fullMessage = userMessage;
if (files?.length) {
  const extracted = extractTextFromFiles(files);
  if (extracted) {
    fullMessage = `${userMessage}\n\n${extracted}`;
  }
}

this.history.push({ role: 'user', content: fullMessage });
this.onMessagePersist?.('user', userMessage);
```

Note: we persist the original `userMessage` (without file text) to the DB, but send `fullMessage` (with extracted text) to the model via history.

**Step 4: Verify**

Run: `cd /Users/maxlee/Projects/ai/ai-advent-challenge/day1_ai-chat && npx tsc --noEmit`

---

### Task 4: Update API route to accept files and save to DB

**Files:**
- Modify: `day1_ai-chat/app/api/chat/route.ts`
- Modify: `day1_ai-chat/lib/sessions.ts`

**Step 1: Update sessions.ts to return message IDs from persistence**

The `onMessagePersist` callback currently doesn't return the message ID. Update `getOrCreateAgent` in `lib/sessions.ts`:

Change the `onMessagePersist` callback:

```typescript
onMessagePersist: (role, content) => {
  return saveMessage(sid, role, content, model);
},
```

And update the `ChatAgent` constructor `onMessagePersist` type in `lib/agent.ts` (line 15 and 21):

```typescript
private onMessagePersist?: (role: string, content: string) => number | void;
```

And in constructor opts:

```typescript
onMessagePersist?: (role: string, content: string) => number | void;
```

**Step 2: Update chat route to handle files**

Replace `app/api/chat/route.ts`:

```typescript
import { createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import { getOrCreateAgent } from '@/lib/sessions';
import { saveFile } from '@/lib/db';

export async function POST(req: Request) {
  const { message, sessionId, model, files } = await req.json();

  const { agent, sessionId: sid } = getOrCreateAgent(sessionId, model);

  try {
    const stream = agent.chat(message, files);

    // Save files to DB after the user message is persisted
    // The message ID comes from the persist callback, but since it's async in the stream,
    // we need to save files after the message. We'll use a post-persist hook.
    if (files?.length) {
      // Get the last message ID for this session
      const { saveFile: saveFileDb } = await import('@/lib/db');
      const { getLastMessageId } = await import('@/lib/db');
      for (const file of files) {
        const data = Buffer.from(file.data, 'base64');
        // We need the message_id — but persist happens inside chat()
        // Let's handle this differently — see Step 3
      }
    }

    return createUIMessageStreamResponse({
      stream,
      headers: { 'x-session-id': sid },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          type: 'error',
          errorText: errorMessage,
        });
      },
    });
    return createUIMessageStreamResponse({
      stream,
      status: 500,
      headers: { 'x-session-id': sid },
    });
  }
}
```

**Step 3: Better approach — save files via onMessagePersist**

Actually, the cleaner approach is to have the agent pass files through to the persist callback. Update the approach:

In `lib/sessions.ts`, update the persist callback to also handle files:

```typescript
import { ChatAgent } from '@/lib/agent';
import { saveMessage, getSessionMessages, saveFile } from '@/lib/db';

const sessions = new Map<string, ChatAgent>();

export function getOrCreateAgent(
  sessionId: string | null,
  model?: string,
): { agent: ChatAgent; sessionId: string } {
  if (sessionId && sessions.has(sessionId)) {
    const agent = sessions.get(sessionId)!;
    if (model) {
      agent.setModel(model);
    }
    return { agent, sessionId };
  }

  const sid = sessionId ?? crypto.randomUUID();
  const rows = sessionId ? getSessionMessages(sessionId) : [];
  const history = rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

  const agent = new ChatAgent({
    model,
    history,
    onMessagePersist: (role, content, files) => {
      const messageId = saveMessage(sid, role, content, model);
      if (files?.length) {
        for (const file of files) {
          const data = Buffer.from(file.data, 'base64');
          saveFile(messageId, sid, file.filename, file.mediaType, data);
        }
      }
    },
  });

  if (history.length > 0) {
    console.log(
      `\x1b[36m[Sessions]\x1b[0m Restored ${history.length} messages for session ${sid.slice(0, 8)}…`,
    );
  }

  sessions.set(sid, agent);
  return { agent, sessionId: sid };
}
```

In `lib/agent.ts`, update the persist callback type and call:

```typescript
private onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
```

Constructor opts:

```typescript
onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
```

And in `chat()`, update the persist call for user messages:

```typescript
this.onMessagePersist?.('user', userMessage, files);
```

And the final route becomes simple:

```typescript
import { createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import { getOrCreateAgent } from '@/lib/sessions';

export async function POST(req: Request) {
  const { message, sessionId, model, files } = await req.json();

  const { agent, sessionId: sid } = getOrCreateAgent(sessionId, model);

  try {
    const stream = agent.chat(message, files);
    return createUIMessageStreamResponse({
      stream,
      headers: { 'x-session-id': sid },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          type: 'error',
          errorText: errorMessage,
        });
      },
    });
    return createUIMessageStreamResponse({
      stream,
      status: 500,
      headers: { 'x-session-id': sid },
    });
  }
}
```

**Step 4: Verify**

Run: `cd /Users/maxlee/Projects/ai/ai-advent-challenge/day1_ai-chat && npx tsc --noEmit`

---

### Task 5: Create file serving endpoint

**Files:**
- Create: `day1_ai-chat/app/api/files/[id]/route.ts`

**Step 1: Create the GET endpoint**

```typescript
import { getFile } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fileId = parseInt(id, 10);

  if (isNaN(fileId)) {
    return new Response('Invalid file ID', { status: 400 });
  }

  const file = getFile(fileId);
  if (!file) {
    return new Response('File not found', { status: 404 });
  }

  return new Response(file.data, {
    headers: {
      'Content-Type': file.media_type,
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Content-Length': String(file.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
```

**Step 2: Verify**

Run: `cd /Users/maxlee/Projects/ai/ai-advent-challenge/day1_ai-chat && npx tsc --noEmit`

---

### Task 6: Update history endpoint to include files

**Files:**
- Modify: `day1_ai-chat/app/api/chat/[sessionId]/route.ts`

**Step 1: Use `getSessionMessagesWithFiles` and include file metadata**

```typescript
import { getSessionMessagesWithFiles } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const messages = getSessionMessagesWithFiles(sessionId);

  return Response.json({
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
      files: m.files.map((f) => ({
        id: f.id,
        filename: f.filename,
        mediaType: f.media_type,
        size: f.size,
      })),
    })),
  });
}
```

**Step 2: Verify**

Run: `cd /Users/maxlee/Projects/ai/ai-advent-challenge/day1_ai-chat && npx tsc --noEmit`

---

### Task 7: Update ChatInput with file upload

**Files:**
- Modify: `day1_ai-chat/app/components/ChatInput.tsx`

**Step 1: Add file upload props, state, and UI**

Replace the entire file:

```tsx
'use client';

import React, { useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

export interface PendingFile {
  file: File;
  preview?: string; // data URL for image previews
}

interface ChatInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  pendingFiles: PendingFile[];
  onFilesSelected: (files: File[]) => void;
  onFileRemove: (index: number) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  pendingFiles,
  onFilesSelected,
  onFileRemove,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const isDisabled = isLoading || (!input.trim() && pendingFiles.length === 0);

  return (
    <form onSubmit={handleSubmit} className="bg-white px-4 py-3">
      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingFiles.map((pf, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
            >
              {pf.preview ? (
                <img src={pf.preview} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <span className="text-gray-400">📎</span>
              )}
              <span className="max-w-[150px] truncate text-gray-700">{pf.file.name}</span>
              <span className="text-gray-400 text-xs">{formatFileSize(pf.file.size)}</span>
              <button
                type="button"
                onClick={() => onFileRemove(i)}
                className="text-gray-400 hover:text-red-500 ml-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          title="Attach files"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <TextareaAutosize
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          minRows={1}
          maxRows={8}
          placeholder="Type a message..."
          className="flex-1 resize-none rounded-full border border-gray-200 px-4 py-2 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="submit"
          disabled={isDisabled}
          className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}
```

---

### Task 8: Update ChatMessage to render files

**Files:**
- Modify: `day1_ai-chat/app/components/ChatMessage.tsx`

**Step 1: Add file rendering to user messages**

Replace the entire file:

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { DisplayMessage, FileAttachment } from '@/lib/types';

interface ChatMessageProps {
  message: DisplayMessage;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileDisplay({ file }: { file: FileAttachment }) {
  const url = `/api/files/${file.id}`;

  if (file.mediaType.startsWith('image/')) {
    return (
      <img
        src={url}
        alt={file.filename}
        className="max-w-[400px] max-h-[300px] object-contain rounded-lg"
        loading="lazy"
      />
    );
  }

  if (file.mediaType.startsWith('video/')) {
    return (
      <video
        controls
        className="max-w-[400px] max-h-[300px] rounded-lg"
        preload="metadata"
      >
        <source src={url} type={file.mediaType} />
      </video>
    );
  }

  // Generic file pill
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
      <span className="text-gray-400">📎</span>
      <span className="font-medium text-gray-700 max-w-[200px] truncate">{file.filename}</span>
      <span className="text-gray-400 text-xs">{formatFileSize(file.size)}</span>
    </div>
  );
}

function FileAttachments({ files }: { files: FileAttachment[] }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {files.map((file) => (
        <FileDisplay key={file.id} file={file} />
      ))}
    </div>
  );
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const role = message.role;
  const content = message.content;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 px-5 py-3 text-white shadow-md">
          {message.files && <FileAttachments files={message.files} />}
          {content}
        </div>
      </div>
    );
  }

  // Show loading dots if assistant message has no visible text yet
  if (!content) {
    return (
      <div className="flex justify-start">
        <div className="rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3">
          <div className="flex items-center gap-1">
            <span className="animate-bounce-dots h-2 w-2 rounded-full bg-gray-400" />
            <span className="animate-bounce-dots animation-delay-200 h-2 w-2 rounded-full bg-gray-400" />
            <span className="animate-bounce-dots animation-delay-400 h-2 w-2 rounded-full bg-gray-400" />
          </div>
        </div>
      </div>
    );
  }

  // Assistant message with markdown rendering
  const components: Components = {
    code({ inline, className, children, ...props }: any) {
      if (inline) {
        return (
          <code
            className="rounded bg-gray-100 px-1 py-0.5"
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <pre className="overflow-x-auto rounded-lg bg-gray-100 p-4">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    },
  };

  return (
    <div className="flex justify-start">
      <div className="prose max-w-none max-w-[80%] rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
```

---

### Task 9: Wire file state through page.tsx

**Files:**
- Modify: `day1_ai-chat/app/page.tsx`

**Step 1: Add file state management and update handleSubmit**

This is the largest change. Key additions:
- `pendingFiles` state for files selected before sending
- Convert files to base64 before sending
- Include file metadata in display messages
- Handle files from history loading

Replace the entire file:

```tsx
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
  const [model, setModel] = useState(DEFAULT_MODEL);
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
        // Show local previews for files until we get server IDs
        files: filesToSend.map((pf, i) => ({
          id: -(i + 1), // negative IDs = local/pending
          filename: pf.file.name,
          mediaType: pf.file.type,
          size: pf.file.size,
        })),
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
        pendingFiles={pendingFiles}
        onFilesSelected={handleFilesSelected}
        onFileRemove={handleFileRemove}
      />
    </div>
  );
}
```

**Step 2: Verify — run TypeScript check**

Run: `cd /Users/maxlee/Projects/ai/ai-advent-challenge/day1_ai-chat && npx tsc --noEmit`
Expected: Clean compilation

**Step 3: Test manually**

Run: `cd /Users/maxlee/Projects/ai/ai-advent-challenge/day1_ai-chat && pnpm dev`

Test:
1. Click paperclip icon — file picker opens
2. Select an image — preview chip appears above textarea
3. Click ✕ on chip — file removed
4. Select image + type text — send — image renders in user bubble, model responds to text
5. Select a .txt file — send — model should reference the file content in its response
6. Select a .pdf — sends as pill display, model doesn't see content (no PDF extraction)
7. Refresh page — history loads with file attachments visible
