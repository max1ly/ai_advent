# Patterns (Good Code Examples)

## 1. Streaming route handler (`app/api/chat/route.ts:5-47`)

```ts
export async function POST(req: Request) {
  const sid = req.headers.get('x-session-id') ?? crypto.randomUUID();
  try {
    const { messages } = await req.json();
    const agent = await getOrCreateAgent(sid);
    const stream = createUIMessageStream({
      execute: ({ writer }) => agent.run(messages, writer),
    });
    return createUIMessageStreamResponse({ stream, headers: { 'x-session-id': sid } });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stream = createUIMessageStream({
      execute: ({ writer }) => { writer.write({ type: 'error', errorText: errorMessage }); },
    });
    return createUIMessageStreamResponse({ stream, status: 500, headers: { 'x-session-id': sid } });
  }
}
```

## 2. Client component (`app/components/ChatMessage.tsx`)

```tsx
'use client';

import { memo } from 'react';

export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatMessage = memo(function ChatMessage({ role, content }: ChatMessageProps) {
  return (
    <div className={role === 'user' ? 'bg-blue-50 p-3 rounded' : 'bg-white p-3'}>
      {content}
    </div>
  );
});
```

## 3. Tool factory with Zod (`lib/rag/tool.ts:13-35`)

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const createRagTool = (config: RagConfig) =>
  tool({
    description: 'Search knowledge base for relevant context.',
    inputSchema: z.object({
      query: z.string().describe('Natural-language search query'),
      limit: z.number().int().min(1).max(10).default(3),
    }),
    execute: async ({ query, limit }) => {
      try {
        const results = await config.search(query, limit);
        return { results };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { results: [], error: message };
      }
    },
  });
```

## 4. Fire-and-forget side effect (`lib/agent.ts:401-404`)

```ts
memoryManager
  .extractMemory(sessionId, messages)
  .catch((err) => console.log('[Memory] Extraction failed:', err.message));
```

## 5. Partial-success MCP startup (`lib/mcp/manager.ts:150-171`)

```ts
const results = await Promise.allSettled(servers.map((s) => s.connect()));
results.forEach((r, i) => {
  if (r.status === 'rejected') {
    console.error(`[MCP] ${servers[i].name} failed:`, r.reason);
  }
});
```
