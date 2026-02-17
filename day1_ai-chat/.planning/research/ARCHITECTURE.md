# Architecture Research

**Domain:** Minimal LLM Chat Web Application
**Researched:** 2026-02-17
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER (Browser)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Chat UI Component ('use client')                    │    │
│  │  - useChat hook (message state, input, submission)   │    │
│  │  - Message list (map & render)                       │    │
│  │  - Input form (controlled component)                 │    │
│  │  - Markdown renderer (react-markdown/streamdown)     │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │ HTTP POST                            │
│                       │ /api/chat                            │
├───────────────────────┼──────────────────────────────────────┤
│                       ↓                                      │
│                    API LAYER                                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Route Handler: app/api/chat/route.ts               │    │
│  │  - Extract message history from request             │    │
│  │  - Call streamText() with DeepSeek config           │    │
│  │  - Return streaming response                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │ HTTP POST (OpenAI-compatible)        │
│                       │ https://api.deepseek.com             │
├───────────────────────┼──────────────────────────────────────┤
│                       ↓                                      │
│                  EXTERNAL SERVICE                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │  DeepSeek API                                        │    │
│  │  - Receives chat completion request                  │    │
│  │  - Streams tokens back via SSE                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                       │                                      │
│                       │ Server-Sent Events (SSE)             │
│                       ↓                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ReadableStream processing                           │    │
│  │  - TextDecoderStream converts bytes                  │    │
│  │  - Chunks piped to React state                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                       │                                      │
│                       ↓                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  UI Updates (real-time)                              │    │
│  │  - Message state updates on each token               │    │
│  │  - Markdown renders incrementally                    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Page Component** | Root Server Component, renders chat UI | `app/page.tsx` - Server Component that imports Chat |
| **Chat UI Component** | Manages conversation state & display | Client Component with `useChat` hook from `@ai-sdk/react` |
| **Message List** | Renders message history with streaming | Maps `messages` array, renders markdown for each |
| **Input Form** | Captures user input, triggers submission | Controlled input with form `onSubmit` handler |
| **Markdown Renderer** | Displays formatted AI responses | `react-markdown` or `streamdown` with syntax highlighting |
| **API Route Handler** | Proxies requests to DeepSeek API | `app/api/chat/route.ts` - POST handler using `streamText()` |
| **Streaming Manager** | Handles SSE connection & token flow | Built into AI SDK's `streamText()` function |

## Recommended Project Structure

```
day1_ai-chat/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # POST endpoint for chat streaming
│   ├── components/
│   │   ├── chat.tsx               # Main chat UI (Client Component)
│   │   ├── message-list.tsx       # Message display component
│   │   ├── message-item.tsx       # Individual message with markdown
│   │   └── chat-input.tsx         # Input form component
│   ├── lib/
│   │   ├── deepseek.ts            # DeepSeek client configuration
│   │   └── types.ts               # TypeScript types for messages
│   ├── layout.tsx                 # Root layout (Server Component)
│   ├── page.tsx                   # Home page (Server Component)
│   └── globals.css                # Global styles + Tailwind
├── public/                        # Static assets
├── .env.local                     # Environment variables (API key)
├── next.config.ts                 # Next.js configuration
├── tailwind.config.ts             # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
├── package.json                   # Dependencies
├── Dockerfile                     # Multi-stage Docker build
└── .dockerignore                  # Docker build exclusions
```

### Structure Rationale

- **app/api/chat/**: Route Handlers in Next.js App Router follow file-system routing; `route.ts` in a folder creates an API endpoint at that path
- **app/components/**: Colocation pattern - keep components close to where they're used; for a single-page app, flat structure in `app/components/` is clearest
- **app/lib/**: Utility functions and configuration that don't render UI; DeepSeek client setup lives here
- **Client Component boundary**: Only `app/components/chat.tsx` and its children need `'use client'` directive; the page itself stays as a Server Component
- **No state management library needed**: For a minimal chat app with no persistence, `useChat` hook manages all state internally; no need for Zustand/Redux

## Architectural Patterns

### Pattern 1: AI SDK Transport Pattern

**What:** The AI SDK `useChat` hook uses a transport-based architecture where the client hook communicates with a server endpoint that proxies LLM requests. The hook defaults to POST `/api/chat` and handles streaming automatically.

**When to use:** This is the standard pattern for all AI SDK integrations. Use it for DeepSeek, OpenAI, Anthropic, or any OpenAI-compatible API.

**Trade-offs:**
- **Pros:** Abstracts streaming complexity, automatic state management, built-in error handling, zero custom plumbing
- **Cons:** Tight coupling to AI SDK's conventions, requires server-side proxy (can't call LLM directly from browser due to API key exposure)

**Example:**
```typescript
// app/components/chat.tsx
'use client'
import { useChat } from '@ai-sdk/react'

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat', // Defaults to this, but explicit is clear
  })

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  )
}
```

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: deepseek('deepseek-chat'),
    messages,
  })

  return result.toDataStreamResponse()
}
```

### Pattern 2: Server/Client Component Boundary

**What:** Next.js App Router defaults to Server Components. Only mark components as Client Components (`'use client'`) when they need browser APIs (useState, useEffect, onClick) or third-party libraries requiring client-side execution.

**When to use:** Always. This is a core App Router principle. For a chat app: page layout and API routes are Server Components; only the interactive chat UI is a Client Component.

**Trade-offs:**
- **Pros:** Smaller JavaScript bundle (server components ship zero JS), better initial page load, improved SEO
- **Cons:** Client Components can't directly import Server Components (only via `children` prop pattern), learning curve for developers new to RSC

**Example:**
```typescript
// app/page.tsx (Server Component - no 'use client')
import Chat from './components/chat'

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI Chat</h1>
      <Chat />
    </main>
  )
}
```

```typescript
// app/components/chat.tsx (Client Component - needs 'use client')
'use client'
import { useChat } from '@ai-sdk/react'

export default function Chat() {
  // useChat is a React hook - requires client-side execution
  const { messages, input, handleInputChange, handleSubmit } = useChat()
  // ... component implementation
}
```

### Pattern 3: Streaming Markdown with Memoization

**What:** AI responses stream token-by-token, causing React to re-render the markdown on every token. Memoization prevents re-parsing already-complete markdown blocks, improving performance for long responses.

**When to use:** When rendering markdown in streaming chat responses. Critical for responses longer than a few sentences.

**Trade-offs:**
- **Pros:** Dramatic performance improvement (10x+ for long responses), smoother UX, reduced CPU usage
- **Cons:** Additional dependency (`streamdown` or custom memoization logic), slightly more complex rendering code

**Example:**
```typescript
// Using Vercel's streamdown (built for streaming AI content)
import Markdown from 'streamdown'

function Message({ content }: { content: string }) {
  return <Markdown>{content}</Markdown>
}
```

**Alternative with react-markdown + memoization:**
```typescript
import ReactMarkdown from 'react-markdown'
import { memo, useMemo } from 'react'

const MemoizedMarkdown = memo(({ content }: { content: string }) => {
  const blocks = useMemo(() => {
    // Split content into complete blocks (paragraphs, code blocks, etc.)
    // Only re-parse blocks that have changed
    return parseIntoBlocks(content)
  }, [content])

  return <ReactMarkdown>{content}</ReactMarkdown>
})
```

### Pattern 4: OpenAI-Compatible API Integration

**What:** DeepSeek API is OpenAI-compatible, meaning you use OpenAI SDKs/libraries but point `baseURL` to `https://api.deepseek.com`. This pattern works for any OpenAI-compatible API (Together.ai, Groq, local LLMs via LM Studio, etc.).

**When to use:** When integrating DeepSeek or any OpenAI-compatible provider. Leverage existing OpenAI tooling rather than building custom clients.

**Trade-offs:**
- **Pros:** Reuse battle-tested OpenAI SDK, easy provider switching, community patterns apply directly
- **Cons:** Limited to OpenAI's API contract (can't use provider-specific features not in OpenAI spec)

**Example:**
```typescript
// app/lib/deepseek.ts
import { createOpenAI } from '@ai-sdk/openai'

export const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com',
})

// To switch providers, just change config:
// export const groq = createOpenAI({
//   apiKey: process.env.GROQ_API_KEY!,
//   baseURL: 'https://api.groq.com/openai/v1',
// })
```

## Data Flow

### Request Flow (User Message to AI Response)

```
User types message
    ↓
handleSubmit() called (from useChat hook)
    ↓
POST request to /api/chat with { messages: [...history, newMessage] }
    ↓
Route handler extracts messages from request body
    ↓
streamText() called with DeepSeek model + message history
    ↓
HTTP POST to https://api.deepseek.com with stream: true
    ↓
DeepSeek generates response, streams tokens back via SSE
    ↓
AI SDK processes SSE stream, converts to data stream
    ↓
toDataStreamResponse() returns streaming HTTP response
    ↓
useChat hook receives stream, updates messages state incrementally
    ↓
React re-renders with new token appended to current message
    ↓
Markdown component renders updated message content
    ↓
User sees response appear in real-time
```

### State Management Flow

```
[User Input]
    ↓
useChat hook internal state:
  - messages: Message[]        # Full conversation history
  - input: string              # Current input field value
  - isLoading: boolean         # Request in flight
    ↓
handleInputChange updates 'input' state
    ↓
handleSubmit:
  1. Optimistically adds user message to 'messages'
  2. Sets isLoading = true
  3. POSTs to /api/chat
  4. Receives streaming response
  5. Creates new assistant message in 'messages'
  6. Appends each token to assistant message.content
  7. Sets isLoading = false when complete
    ↓
React re-renders on each state update
    ↓
UI reflects current conversation state
```

### Key Data Flows

1. **Message History Accumulation**: Each user/assistant exchange appends to the `messages` array maintained by `useChat`. On page refresh, state is lost (no persistence requirement).

2. **Streaming Token Accumulation**: As SSE tokens arrive, the AI SDK accumulates them into the current assistant message's `content` field. React's state updates trigger re-renders, creating the "typing" effect.

3. **API Key Security**: Environment variable (`DEEPSEEK_API_KEY`) lives in `.env.local`, accessed only in server-side code (API route). Never exposed to browser. Docker deployment passes this as a build arg or runtime secret.

4. **Error Propagation**: If DeepSeek API fails, `streamText()` throws. Wrap in try/catch in route handler, return error response. `useChat` hook exposes an `error` state for UI display.

## Build Order & Dependencies

### Recommended Build Sequence

**Phase 1: Static Foundation (no LLM integration)**
1. Next.js app initialization (`create-next-app`)
2. Install dependencies (AI SDK, Tailwind, react-markdown)
3. Create basic layout (app/layout.tsx, app/page.tsx)
4. Build static chat UI shell (message list, input form)
   - Hardcode mock messages for layout verification
   - No interactivity yet

**Phase 2: Client-Side State Management**
1. Add `'use client'` to chat component
2. Integrate `useChat` hook (without API endpoint yet)
   - Will error on submit since `/api/chat` doesn't exist
3. Wire up input/submit handlers
4. Render messages from `useChat` state

**Phase 3: API Integration**
1. Create DeepSeek client config (app/lib/deepseek.ts)
2. Implement API route handler (app/api/chat/route.ts)
3. Test streaming with real API
4. Verify end-to-end flow

**Phase 4: Markdown & Polish**
1. Add markdown rendering to message display
2. Optimize with memoization (streamdown or custom)
3. Add syntax highlighting for code blocks
4. Style improvements (Tailwind utility classes)

**Phase 5: Deployment**
1. Create multi-stage Dockerfile
2. Configure environment variables for production
3. Build Docker image
4. Deploy to VPS

### Component Dependencies

```
app/page.tsx (Server Component)
    ↓ imports
app/components/chat.tsx (Client Component, 'use client')
    ↓ imports & uses
@ai-sdk/react (useChat hook)
    ↓ makes HTTP request to
app/api/chat/route.ts (API Route Handler)
    ↓ imports & calls
app/lib/deepseek.ts (DeepSeek client config)
    ↓ uses
@ai-sdk/openai (createOpenAI factory)
    ↓ calls
DeepSeek API (https://api.deepseek.com)
```

**Critical Path:** You cannot test the `useChat` hook until the API route exists. Build the API route in parallel with or before the client component integration.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-100 users** | Single Docker container on VPS. DeepSeek API handles all LLM load. No optimization needed. Current architecture is sufficient. |
| **100-1k users** | Add edge caching for static assets (Cloudflare). Increase VPS resources (CPU/RAM). Monitor DeepSeek API rate limits. Consider connection pooling if hitting limits. |
| **1k-10k users** | Move to managed container platform (Fly.io, Railway, Render). Add CDN for global distribution. Implement rate limiting to protect API key. Consider upgrading DeepSeek plan for higher limits. |
| **10k+ users** | Add authentication to prevent abuse. Implement request queuing. Explore multi-region deployment. Consider custom LLM hosting if DeepSeek costs become prohibitive. Add observability (logging, metrics). |

### Scaling Priorities

1. **First bottleneck: API rate limits** - DeepSeek enforces request-per-minute limits. Mitigation: client-side rate limiting, request queuing, user authentication to track/limit per-user usage.

2. **Second bottleneck: Concurrent connections** - Node.js event loop can handle thousands of concurrent SSE connections, but VPS network I/O may saturate. Mitigation: scale horizontally (multiple containers + load balancer), upgrade VPS network capacity.

3. **Third bottleneck: Cold start latency** - If moving to serverless, streaming responses suffer from cold starts. Mitigation: use container platforms with warm instances (Fly.io, Railway) instead of true serverless (AWS Lambda).

**For minimal chat app with no persistence:** The architecture scales well because there's no database to tune, no session management complexity, and no user data to migrate. Scaling is primarily about handling concurrent streaming connections.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling LLM API Directly from Client Component

**What people do:** Import DeepSeek/OpenAI SDK in a Client Component and call it directly to avoid building an API route.

**Why it's wrong:** Exposes API key to browser. Anyone can inspect network traffic or source maps and extract your key. Results in unauthorized usage, bill shock, or key revocation.

**Do this instead:** Always proxy LLM requests through a server-side API route. API key stays in environment variables on the server. Client sends requests to your API route, which forwards to the LLM provider.

### Anti-Pattern 2: Using 'use client' on Layout/Page Components

**What people do:** Add `'use client'` to `app/layout.tsx` or `app/page.tsx` to "make it work" with client-side libraries.

**Why it's wrong:** Ships unnecessary JavaScript to the client. Negates the performance benefits of Server Components. Forces all child components to be client-rendered.

**Do this instead:** Keep layouts/pages as Server Components. Extract interactive portions into dedicated Client Components. Import Client Components into Server Components as children. Minimize the Client Component boundary.

### Anti-Pattern 3: Re-rendering Markdown on Every Token Without Memoization

**What people do:** Use `react-markdown` directly on the streaming message content without any optimization.

**Why it's wrong:** Markdown parsing is CPU-intensive. Streaming responses can deliver 50+ tokens/second. Re-parsing the entire message on each token causes janky UI, high CPU usage, and poor mobile performance.

**Do this instead:** Use `streamdown` (built for streaming) or implement memoization. Only parse/render markdown blocks that have changed. Split content into discrete blocks and memoize each independently.

### Anti-Pattern 4: Storing API Key in Client-Side Environment Variables

**What people do:** Create `NEXT_PUBLIC_DEEPSEEK_API_KEY` and use it in Client Components.

**Why it's wrong:** Next.js `NEXT_PUBLIC_` prefix bundles the value into client JavaScript. Anyone can read it. This is for public keys only (analytics tracking IDs, public API endpoints).

**Do this instead:** Use un-prefixed environment variables (e.g., `DEEPSEEK_API_KEY`) which are server-only. Access them only in API routes or Server Components. Never expose them to the client bundle.

### Anti-Pattern 5: Implementing Custom Streaming Logic

**What people do:** Manually create `ReadableStream`, handle SSE protocol, manage state synchronization, and build token accumulation logic from scratch.

**Why it's wrong:** Reinvents the wheel. The AI SDK (`@ai-sdk/react` + `ai`) handles all of this, including error recovery, chunk parsing, and state management. Custom implementations are bug-prone and lack these features.

**Do this instead:** Use `useChat` + `streamText` from AI SDK. It's battle-tested, handles edge cases, and provides a clean API. Only build custom streaming if you have truly unique requirements that AI SDK doesn't support.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **DeepSeek API** | OpenAI-compatible client via `@ai-sdk/openai` with custom `baseURL` | Set `baseURL: 'https://api.deepseek.com'`. Models: `deepseek-chat` (non-reasoning), `deepseek-reasoner` (reasoning). Both use DeepSeek-V3.2 as of Feb 2026. |
| **Docker Registry** | Multi-stage build, push to Docker Hub or VPS registry | Use `node:22-alpine` for minimal image size. Set `output: "standalone"` in `next.config.ts` for Docker optimization. |
| **VPS Deployment** | SSH + Docker Compose or direct `docker run` | Pass `DEEPSEEK_API_KEY` as environment variable via `-e` flag or `.env` file. Expose port 3000. Use reverse proxy (Nginx/Caddy) for HTTPS. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Page (Server) ↔ Chat (Client)** | Props (initial data) + children pattern | Page doesn't pass data to Chat in minimal app. Chat manages own state via `useChat`. |
| **Chat (Client) ↔ API Route (Server)** | HTTP POST with JSON body | Chat sends `{ messages: Message[] }`. API route returns streaming response via SSE. Handled automatically by AI SDK. |
| **API Route ↔ DeepSeek** | HTTP POST with OpenAI-compatible JSON | API route uses `streamText()` which handles request formatting, streaming, and response parsing. Set `stream: true` in request. |
| **Message Component ↔ Markdown Renderer** | Props (content string) | Pass `message.content` to markdown component. Renderer parses and displays. Use memoization to prevent re-parsing. |

## Confidence Assessment

| Aspect | Level | Sources |
|--------|-------|---------|
| **useChat Hook Architecture** | HIGH | Official AI SDK docs, Vercel Academy tutorials |
| **Next.js App Router Patterns** | HIGH | Official Next.js v16 docs (2026) |
| **Streaming Implementation** | HIGH | AI SDK reference, Upstash SSE tutorial, official Next.js streaming docs |
| **DeepSeek API Integration** | HIGH | Official DeepSeek API docs, verified OpenAI compatibility |
| **Docker Deployment** | MEDIUM | Multiple 2025-2026 tutorials, official Next.js Docker example |
| **Markdown Streaming Optimization** | HIGH | AI SDK cookbook, Vercel streamdown library documentation |
| **Build Order Dependencies** | MEDIUM | Inferred from component relationships and AI SDK architecture |

## Sources

**Official Documentation (HIGH confidence):**
- [AI SDK: Getting Started with Next.js App Router](https://ai-sdk.dev/docs/getting-started/nextjs-app-router)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [DeepSeek API Documentation](https://api-docs.deepseek.com/)
- [AI SDK UI: useChat Hook Reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [Next.js: Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)

**Technical Tutorials & Guides (MEDIUM-HIGH confidence):**
- [Using Server-Sent Events to Stream LLM Responses in Next.js](https://upstash.com/blog/sse-streaming-llm-responses)
- [Next.js App Router Advanced Patterns for 2026](https://medium.com/@beenakumawat002/next-js-app-router-advanced-patterns-for-2026-server-actions-ppr-streaming-edge-first-b76b1b3dcac7)
- [Next.js 15 Streaming Handbook](https://www.freecodecamp.org/news/the-nextjs-15-streaming-handbook/)
- [Dockerizing a Next.js Application in 2025](https://frontendworld.substack.com/p/dockerizing-a-nextjs-application)
- [AI SDK Cookbook: Markdown Chatbot with Memoization](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization)

**Community Resources (MEDIUM confidence):**
- [Vercel Streamdown (React Markdown for Streaming)](https://github.com/vercel/streamdown)
- [Integrating Markdown in Streaming Chat](https://athrael.net/blog/building-an-ai-chat-assistant/add-markdown-to-streaming-chat)
- [Next.js Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/nextjs-complete-guide)

---
*Architecture research for: Minimal LLM Chat Web Application with DeepSeek*
*Researched: 2026-02-17*
