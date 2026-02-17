# Phase 1: Foundation & Core Chat - Research

**Researched:** 2026-02-17
**Domain:** Next.js 15 App Router, AI streaming chat application
**Confidence:** HIGH

## Summary

Phase 1 requires building a streaming chat interface with DeepSeek API integration. The recommended approach uses Next.js 15 App Router with Vercel AI SDK, which provides first-class DeepSeek support and handles streaming complexity automatically through the `useChat` hook and `streamText` function.

The standard stack is Next.js 15 + Vercel AI SDK + react-markdown + Tailwind CSS. This combination is well-documented, actively maintained (all updated in 2026), and specifically designed for streaming AI chat applications. Vercel AI SDK abstracts SSE complexity, manages state automatically, and includes built-in error handling.

**Primary recommendation:** Use Vercel AI SDK's `useChat` hook on the client and `streamText` function in Route Handlers. Don't hand-roll SSE streaming or markdown rendering—both have production-ready libraries that handle critical edge cases.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.x | Full-stack framework | App Router provides Route Handlers for APIs, built-in streaming support, production-ready TypeScript setup |
| @ai-sdk/deepseek | 4.1+ | DeepSeek provider | First-party provider in AI SDK 4.1+, handles auth, streaming, caching metadata |
| ai | 4.1+ (AI SDK Core) | Streaming orchestration | `streamText()` for server, `useChat()` for client, handles SSE automatically |
| react-markdown | 10.x | Safe markdown rendering | Security by default (no XSS), pure React components (no dangerouslySetInnerHTML) |
| remark-gfm | Latest | GitHub Flavored Markdown | Adds tables, checkboxes, strikethrough to markdown rendering |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | v4 | Styling | Optional but standard for Next.js (70%+ adoption). Use v4 for 70% smaller bundles vs v3 |
| react-textarea-autosize | 8.x+ | Auto-resizing textarea | Solves CHAT-01 requirement. 1.3KB gzipped, drop-in replacement for `<textarea>` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vercel AI SDK | Hand-rolled SSE | AI SDK handles reconnection, error recovery, state management. Hand-rolling requires solving these from scratch |
| react-markdown | marked + DOMPurify | react-markdown is JSX-native (safer), marked requires HTML sanitization post-processing |
| @ai-sdk/deepseek | Direct OpenAI SDK | DeepSeek provider handles cache hit/miss metadata, thinking mode, specific error handling |

**Installation:**
```bash
# Create Next.js 15 project with Tailwind
npx create-next-app@latest day1-ai-chat --typescript --tailwind --app --no-src-dir

# Install AI SDK and DeepSeek provider
npm install ai @ai-sdk/deepseek

# Install markdown rendering
npm install react-markdown remark-gfm

# Install textarea autosize
npm install react-textarea-autosize
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Chat UI (client component)
├── api/
│   └── chat/
│       └── route.ts        # Streaming API endpoint
├── components/
│   ├── ChatMessage.tsx     # Message display with markdown
│   ├── ChatInput.tsx       # Auto-resize textarea + send
│   └── ChatContainer.tsx   # Scroll container + messages
└── lib/
    └── deepseek.ts         # DeepSeek client configuration
```

**Rationale:** Next.js 15 App Router conventions require `route.ts` for API endpoints. Colocating components within `app/` is acceptable for small projects, but separate `components/` improves clarity. Private folders (`_components`) are optional but signal non-routable files.

### Pattern 1: Server-Side Streaming with Vercel AI SDK
**What:** Use `streamText()` in Route Handler to stream DeepSeek responses as SSE
**When to use:** All LLM streaming in this phase
**Example:**
```typescript
// app/api/chat/route.ts
// Source: https://ai-sdk.dev/providers/ai-sdk-providers/deepseek
import { createDeepSeek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: deepseek(process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'),
    messages,
  });

  return result.toDataStreamResponse();
}
```

**Why this pattern:**
- `streamText()` handles SSE formatting automatically
- `toDataStreamResponse()` returns proper Response with streaming headers
- Built-in error handling, reconnection logic, stream termination
- DeepSeek API key never exposed to browser (server-only)

### Pattern 2: Client-Side State with useChat Hook
**What:** Use `useChat()` hook to manage messages, streaming state, errors
**When to use:** All chat UI components
**Example:**
```typescript
// app/page.tsx
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
'use client';

import { useChat } from 'ai/react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, error, status } = useChat();

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}

      {status === 'streaming' && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  );
}
```

**Why this pattern:**
- `useChat()` manages messages array, input state, submit handler automatically
- `status` provides loading state ('submitted' | 'streaming' | 'ready' | 'error')
- Streaming updates happen automatically via SSE connection
- Error handling built-in with retry support

### Pattern 3: Safe Markdown Rendering
**What:** Use react-markdown with remark-gfm for GitHub Flavored Markdown
**When to use:** Rendering all AI responses
**Example:**
```tsx
// app/components/ChatMessage.tsx
// Source: https://github.com/remarkjs/react-markdown
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Customize rendering if needed
        code: ({ node, inline, className, children, ...props }) => {
          return inline ? (
            <code className="bg-gray-100 rounded px-1" {...props}>
              {children}
            </code>
          ) : (
            <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

**Why this pattern:**
- `react-markdown` is XSS-safe by default (no `dangerouslySetInnerHTML`)
- `remarkGfm` adds tables, task lists, strikethrough
- Component mapping allows custom styling without HTML injection
- URL sanitization built-in (blocks `javascript:`, `vbscript:` protocols)

### Pattern 4: Auto-Scroll Chat Container
**What:** Use ref + useEffect to scroll to bottom on new messages, with smart user-scroll detection
**When to use:** Chat message container (CHAT-06 requirement)
**Example:**
```tsx
// Source: https://davelage.com/posts/chat-scroll-react/
import { useEffect, useRef } from 'react';

export function ChatContainer({ messages }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bottomRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const isScrolledToBottom =
      container.scrollHeight - container.scrollTop <= container.clientHeight + 100;

    // Only auto-scroll if user is near bottom (not reading history)
    if (isScrolledToBottom) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div ref={containerRef} className="overflow-y-auto">
      {messages.map(m => <ChatMessage key={m.id} {...m} />)}
      <div ref={bottomRef} />
    </div>
  );
}
```

**Why this pattern:**
- Only scrolls if user is near bottom (preserves ability to read history)
- `scrollIntoView` with smooth behavior for better UX
- Triggers on messages change (handles streaming updates)
- 100px threshold prevents scroll-fighting during rapid streaming

### Pattern 5: Auto-Resize Textarea
**What:** Use react-textarea-autosize for multi-line input that grows with content
**When to use:** Chat input (CHAT-01 requirement)
**Example:**
```tsx
// Source: https://www.npmjs.com/package/react-textarea-autosize
import TextareaAutosize from 'react-textarea-autosize';

export function ChatInput({ value, onChange, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      <TextareaAutosize
        value={value}
        onChange={onChange}
        minRows={1}
        maxRows={8}
        placeholder="Type a message..."
        className="w-full resize-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e);
          }
        }}
      />
    </form>
  );
}
```

**Why this pattern:**
- `minRows`/`maxRows` prevents UI from breaking with long pastes
- Enter submits, Shift+Enter adds newline (standard chat UX)
- `resize: none` via className prevents dual-control (user + auto)
- Drop-in replacement for `<textarea>` (same props)

### Anti-Patterns to Avoid
- **Accessing env vars in client components:** Always use API routes for secrets. `NEXT_PUBLIC_*` prefix required for browser exposure.
- **Buffering entire stream in Route Handler:** Return `result.toDataStreamResponse()` immediately. Don't await full response before returning.
- **Using `dangerouslySetInnerHTML` for markdown:** Always use react-markdown. HTML injection is the #1 XSS vector.
- **Missing SSE cleanup in useEffect:** If hand-rolling SSE (not recommended), always close EventSource in cleanup function.
- **Dynamic rendering in shared layouts:** Avoid `cookies()`, `headers()`, `searchParams` in root layout—makes every page dynamic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE streaming | Custom ReadableStream + EventSource client | Vercel AI SDK `streamText()` + `useChat()` | SSE requires: reconnection logic, error recovery, state management, proper cleanup, message parsing. AI SDK handles all of these. Hand-rolled solutions often have memory leaks (unclosed EventSource) or race conditions. |
| Markdown rendering | Custom parser or `marked` + DOMPurify | `react-markdown` | Markdown-to-HTML-to-React has XSS risks. react-markdown goes Markdown → AST → React (no HTML step). Also handles: URL sanitization, protocol filtering, component mapping. |
| Message state management | useState for messages array | `useChat()` hook | `useChat` handles: optimistic updates, streaming chunks, error states, retry logic, message IDs, role management. Hand-rolling requires solving all of these. |
| Auto-resize textarea | scrollHeight manipulation | react-textarea-autosize | Edge cases: paste of 1000 lines, window resize, font size changes, maxRows enforcement. Library handles all of these in 1.3KB. |
| DeepSeek API client | Custom fetch + stream parsing | @ai-sdk/deepseek provider | Provider handles: cache hit/miss metadata, thinking mode (deepseek-reasoner), error codes, retry logic, base URL configuration. |

**Key insight:** Streaming AI chat has critical edge cases (network failures, partial responses, reconnection, memory leaks). Production-ready libraries have solved these through real-world usage. Hand-rolling saves no meaningful bundle size but adds significant maintenance burden and bug surface.

## Common Pitfalls

### Pitfall 1: Accidentally Making Pages Dynamic
**What goes wrong:** Adding `cookies()`, `headers()`, or `searchParams` to a shared layout makes every page using that layout dynamic (no static generation).
**Why it happens:** Next.js 15 App Router automatically switches to dynamic rendering when runtime functions are called.
**How to avoid:** Keep runtime functions (cookies, headers, searchParams) in page.tsx or route.ts, not in layout.tsx. Use route groups to limit layout scope if needed.
**Warning signs:** Build output shows all pages as "ƒ" (dynamic) instead of "○" (static). Slower response times. Check `next build` output.
**Source:** https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them

### Pitfall 2: Missing SSE Connection Cleanup
**What goes wrong:** EventSource connections stay open after component unmounts, causing memory leaks and ghost listeners.
**Why it happens:** useEffect cleanup function not implemented, or SSE source not closed properly.
**How to avoid:** If using raw SSE (not recommended), always close EventSource in useEffect cleanup:
```tsx
useEffect(() => {
  const eventSource = new EventSource('/api/chat');
  eventSource.onmessage = handleMessage;
  return () => eventSource.close(); // CRITICAL
}, []);
```
**Warning signs:** Network tab shows persistent SSE connections after navigating away. Memory usage grows over time. Multiple listeners firing.
**Source:** https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996

### Pitfall 3: Environment Variables at Build Time vs Runtime
**What goes wrong:** Environment variables are baked into JavaScript bundle at build time, requiring rebuild to change API keys or model names.
**Why it happens:** Next.js evaluates env vars during build unless code runs at runtime (server components, route handlers).
**How to avoid:**
- Server-only env vars (API keys): Access in Route Handlers or Server Components—always runtime
- Client env vars (NEXT_PUBLIC_*): Baked at build time by design
- For Docker: Use standalone output mode, inject env vars at container start
**Warning signs:** Changing .env requires rebuild. API key changes don't take effect. Docker containers require rebuild for config changes.
**Source:** https://nextjs.org/docs/pages/guides/environment-variables

### Pitfall 4: Stale Closures in useEffect
**What goes wrong:** useEffect callbacks reference old state/props, causing incorrect behavior in streaming updates.
**Why it happens:** Missing dependencies in useEffect dependency array.
**How to avoid:**
- Use ESLint rule `react-hooks/exhaustive-deps` (enabled by default in Next.js)
- For streaming callbacks, use refs for mutable values or AbortController for cancellation
```tsx
// BAD: stale closure
const [messages, setMessages] = useState([]);
useEffect(() => {
  // messages is stale here if not in deps
  console.log(messages);
}, []); // Empty deps = closure over initial messages

// GOOD: include dependencies
useEffect(() => {
  console.log(messages);
}, [messages]);
```
**Warning signs:** State updates not reflecting in callbacks. Old data appearing in handlers. Duplicate event listeners.
**Source:** https://www.freecodecamp.org/news/fix-memory-leaks-in-react-apps/

### Pitfall 5: Auto-Scroll Fighting User Intent
**What goes wrong:** Chat auto-scrolls to bottom while user is reading old messages, frustrating UX.
**Why it happens:** Unconditional scrollIntoView on every message update.
**How to avoid:** Only auto-scroll if user is near bottom (see Pattern 4). Check scroll position before forcing scroll:
```tsx
const isNearBottom =
  container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
if (isNearBottom) {
  bottomRef.current.scrollIntoView();
}
```
**Warning signs:** User reports can't read history during active streaming. Scroll position jumps unexpectedly.
**Source:** https://davelage.com/posts/chat-scroll-react/

### Pitfall 6: HTML Injection in Markdown
**What goes wrong:** Using `dangerouslySetInnerHTML` or insecure markdown libraries allows XSS attacks.
**Why it happens:** Treating markdown as HTML instead of structured content. Using libraries that convert markdown → HTML → DOM.
**How to avoid:**
- ALWAYS use react-markdown (markdown → AST → React, no HTML step)
- NEVER use `dangerouslySetInnerHTML` for AI responses
- If HTML needed, use rehype-sanitize plugin with strict schema
**Warning signs:** `<script>` tags in markdown execute. Links with `javascript:` protocol work. Inspect elements show raw HTML.
**Source:** https://strapi.io/blog/react-markdown-complete-guide-security-styling

### Pitfall 7: Missing Error Boundaries for Streaming
**What goes wrong:** Streaming errors crash entire app instead of showing error message to user.
**Why it happens:** No error boundary around chat components. Vercel AI SDK errors not caught.
**How to avoid:**
- Use `error` from `useChat()` hook to display user-friendly messages
- Add error.tsx in app directory for App Router error boundary
- Provide retry mechanism:
```tsx
const { error, reload } = useChat();
if (error) {
  return (
    <div>
      Error: {error.message}
      <button onClick={() => reload()}>Retry</button>
    </div>
  );
}
```
**Warning signs:** White screen on API failure. No user feedback on errors. Console errors but no UI indication.
**Source:** https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat

## Code Examples

Verified patterns from official sources:

### Complete Route Handler with DeepSeek Streaming
```typescript
// app/api/chat/route.ts
// Source: https://ai-sdk.dev/providers/ai-sdk-providers/deepseek
import { createDeepSeek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const result = streamText({
      model: deepseek(process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'),
      messages,
      maxTokens: 4096,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to process request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Complete Chat UI with useChat Hook
```tsx
// app/page.tsx
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
'use client';

import { useChat } from 'ai/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TextareaAutosize from 'react-textarea-autosize';
import { useEffect, useRef } from 'react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, error, status, reload } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map(m => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block p-3 rounded-lg ${
              m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            }`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {m.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {status === 'streaming' && (
          <div className="text-gray-500">AI is typing...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error.message}
          <button onClick={() => reload()} className="ml-4 underline">
            Retry
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <TextareaAutosize
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
          minRows={1}
          maxRows={8}
          className="flex-1 p-3 border rounded resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={status === 'streaming'}
          className="px-6 py-3 bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

### Environment Configuration
```bash
# .env.local
# Source: https://api-docs.deepseek.com/
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router + API routes | App Router + Route Handlers | Next.js 13+ (2023) | Route Handlers have native streaming support, better TypeScript inference, simpler API |
| Custom SSE implementation | Vercel AI SDK | AI SDK 4.0+ (2024) | Transport-based architecture, state decoupled, tool calling redesigned |
| marked + DOMPurify | react-markdown | react-markdown 9+ (2024) | ESM-only, direct AST → React (no HTML), safer by design |
| Tailwind v3 | Tailwind v4 | Tailwind 4.0 (2024) | 70% smaller bundles, CSS-first config, automatic content detection |
| AI SDK 3.x useChat | AI SDK 5.0 useChat | AI SDK 5.0 (2026) | Transport-based, no input state management, UIMessage persistence |

**Deprecated/outdated:**
- `next.config.js` runtime configuration: Use environment variables instead (runtime config deprecated)
- `getServerSideProps` for streaming: Use App Router streaming with React Suspense
- Manual ReadableStream in Route Handlers: Use AI SDK `streamText()` which handles stream management
- `allowedElements` for security: react-markdown is safe by default, don't need whitelisting unless allowing HTML

## Open Questions

1. **DeepSeek API rate limits**
   - What we know: $0.14/1M input tokens, $0.28/1M output tokens for deepseek-v3. 5M free tokens on signup.
   - What's unclear: Specific rate limits (requests per minute/hour) not documented in search results
   - Recommendation: Check official docs at api-docs.deepseek.com or start with conservative rate (10 req/min) and test. Add client-side debouncing if needed.

2. **Optimal maxTokens for chat**
   - What we know: DeepSeek-chat supports long context
   - What's unclear: Recommended maxTokens for conversational responses (balance between completeness and cost)
   - Recommendation: Start with 4096 maxTokens (standard for chat), adjust based on response quality. Monitor token usage via DeepSeek API response metadata.

3. **Context caching benefits**
   - What we know: Cache hits cost 90% less ($0.028/M vs $0.28/M)
   - What's unclear: How to implement caching in streaming chat context (system prompts, conversation history)
   - Recommendation: Research DeepSeek cache API in official docs. Likely requires sending conversation history as cached context.

4. **Production deployment considerations**
   - What we know: Phase 2 covers Docker deployment
   - What's unclear: Performance implications of streaming on VPS (memory, concurrent connections)
   - Recommendation: Defer to Phase 2 research. Likely needs: Node.js streaming limits config, connection pooling, reverse proxy buffering settings.

## Sources

### Primary (HIGH confidence)
- [Vercel AI SDK - DeepSeek Provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek) - Installation, setup, streaming support
- [Vercel AI SDK - useChat Reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat) - Hook API, parameters, return values
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown) - Security features, usage examples
- [Next.js Project Structure Docs](https://nextjs.org/docs/app/getting-started/project-structure) - Official App Router conventions
- [DeepSeek API Docs - Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion) - Streaming configuration
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing) - Token costs, cache pricing

### Secondary (MEDIUM confidence)
- [Next.js 15 Streaming SSE - Upstash Blog](https://upstash.com/blog/sse-streaming-llm-responses) - SSE implementation patterns (Jan 2026)
- [Fixing Slow SSE in Next.js - Medium](https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996) - Common SSE pitfalls (Jan 2026)
- [Streaming Chat Scroll - Dave Lage](https://davelage.com/posts/chat-scroll-react/) - Auto-scroll patterns with user awareness
- [React Markdown Complete Guide - Strapi](https://strapi.io/blog/react-markdown-complete-guide-security-styling) - Security best practices (2025)
- [Common Next.js App Router Mistakes - Vercel](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them) - Dynamic rendering pitfalls
- [Tailwind + Next.js Setup Guide - DesignRevision](https://designrevision.com/blog/tailwind-nextjs-setup) - Installation, v3 vs v4 comparison (2026)
- [Next.js Environment Variables - TheLinuxCode](https://thelinuxcode.com/nextjs-environment-variables-2026-build-time-vs-runtime-security-and-production-patterns/) - Build vs runtime config (2026)
- [App Router Pitfalls - Imidef](https://imidef.com/en/2026-02-11-app-router-pitfalls) - Common mistakes (Feb 2026)

### Tertiary (LOW confidence - marked for validation)
- [Vercel AI SDK 5.0 Announcement](https://vercel.com/blog/ai-sdk-5) - Transport-based architecture changes
- [react-textarea-autosize npm](https://www.npmjs.com/package/react-textarea-autosize) - Library docs, usage patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are official/first-party (Vercel AI SDK, react-markdown from unified.js), actively maintained, documented in official docs with 2026 updates
- Architecture: HIGH - Patterns verified in official docs (AI SDK, Next.js), multiple current sources (Jan-Feb 2026), code examples tested in official documentation
- Pitfalls: MEDIUM-HIGH - Common mistakes documented in official Vercel blog and recent community posts (2026), but some based on earlier Next.js versions (principles still apply)
- DeepSeek specifics: MEDIUM - Official docs for API, but rate limits not fully documented, caching implementation unclear

**Research date:** 2026-02-17
**Valid until:** 2026-03-19 (30 days - stable ecosystem, but AI SDK and Next.js release frequently)

**Notes:**
- All core libraries (Next.js 15, AI SDK 4.1+, react-markdown 10) have official documentation accessed Feb 2026
- DeepSeek provider is first-party as of AI SDK 4.1 (recent addition)
- Tailwind v4 is latest stable, significant changes from v3 (CSS-first config)
- App Router is now standard for Next.js (Pages Router in maintenance mode)
