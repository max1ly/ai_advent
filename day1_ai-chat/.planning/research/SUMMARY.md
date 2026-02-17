# Project Research Summary

**Project:** Minimal LLM Chat Web App
**Domain:** AI-Powered Web Application (Chat Interface)
**Researched:** 2026-02-17
**Confidence:** HIGH

## Executive Summary

This is a minimal, stateless LLM chat web application built with Next.js 16 App Router and DeepSeek AI. The recommended approach uses Next.js Server Components with the Vercel AI SDK for streaming, react-markdown for safe rendering, and Docker for VPS deployment. The application prioritizes simplicity over features — no authentication, no persistence, no user management — making it architecturally straightforward but requiring careful attention to streaming implementation and security.

The key technical insight from research is that modern LLM chat apps succeed through streaming-first architecture. The AI SDK's `useChat` hook with `streamText` backend handles the complexity of SSE streaming, state management, and error recovery. The primary architectural pattern is a thin API proxy layer (Next.js route handler) that keeps API keys server-side while enabling client-side streaming via `ReadableStream`. This pattern is battle-tested across OpenAI, Anthropic, and DeepSeek integrations.

Critical risks center on production streaming (works locally but fails deployed), markdown XSS vulnerabilities (LLMs can generate malicious HTML), and environment variable confusion (NEXT_PUBLIC_ vars frozen at build time). All three require architectural decisions in Phase 1 — not retrofits. The recommended mitigation is to use secure-by-default libraries (react-markdown escapes HTML), server-only API routes (never client-side LLM calls), and explicit streaming configuration (`runtime: 'nodejs'`, `dynamic: 'force-dynamic'`). Docker deployment adds complexity around static asset copying and container networking, but multi-stage builds with standalone output mode are well-documented patterns.

## Key Findings

### Recommended Stack

Next.js 16 App Router provides the optimal foundation with native streaming support, Server Components for zero-JS page shells, and Server Actions for minimal API boilerplate. React 19 is required for Next.js 16 and provides Suspense improvements critical for streaming UIs. TypeScript 5.1.3+ is essential for maintaining code quality without a test suite and provides compile-time route validation. The Vercel AI SDK is the industry-standard abstraction layer — it handles SSE streaming, token buffering, React state management, and provides first-party DeepSeek support via `@ai-sdk/deepseek`.

**Core technologies:**
- **Next.js 16.1.6 with App Router** — React framework with native streaming and Server Components, eliminates API route boilerplate
- **Vercel AI SDK (ai + @ai-sdk/react)** — Streaming framework with `useChat` hook and `streamText` for turnkey SSE handling
- **@ai-sdk/deepseek 2.0.20+** — Official DeepSeek provider with OpenAI-compatible API, supports deepseek-chat (V3) model
- **react-markdown 10.1.0+** — Safe markdown rendering (escapes HTML by default), critical for XSS prevention
- **Tailwind CSS 4.x** — CSS-based configuration via `@theme`, smaller bundles than v3, official Next.js support
- **Docker with multi-stage builds** — Next.js standalone output mode creates ~150MB images vs ~1GB single-stage

**What NOT to use:**
- Next.js Pages Router (legacy, no native streaming)
- LangChain for simple chat (massive complexity for direct API calls)
- Client-side LLM API calls (exposes API keys)
- NEXT_PUBLIC_ prefix for API keys (frozen at build time, visible to client)
- Databases or auth systems (project spec says no persistence/auth)

### Expected Features

The feature research reveals a clear distinction between table stakes (streaming, markdown, syntax highlighting, error handling) and anti-features (persistence, multi-conversations, user accounts). Users expect ChatGPT-like streaming with token-by-token display, proper markdown rendering with code syntax highlighting and copy buttons, and the ability to stop generation mid-stream. These are non-negotiable for a "minimal but complete" chat experience.

**Must have (table stakes):**
- **Streaming responses** — Users expect ChatGPT-like token-by-token display; batch responses feel broken
- **Markdown rendering with sanitization** — LLMs output formatted text; must render safely without XSS risks
- **Code block syntax highlighting + copy button** — LLMs frequently generate code; unformatted code looks broken
- **Stop generation button** — Users must be able to abort long/incorrect responses mid-stream
- **Error handling with retry** — Network failures happen; show message and allow retry without losing context
- **Loading state** — 1-3 second delay before first token needs visual feedback (typing indicator)
- **Auto-resizing input** — Multi-line messages expected; textarea must grow appropriately
- **Mobile-responsive layout** — Many users access from phones; desktop-only feels dated

**Should have (competitive advantage):**
- **Instant load time** — Zero-config simplicity (no auth/DB) enables sub-100ms first paint
- **Privacy-first messaging** — Explicit "no data stored" promise builds trust for sensitive queries
- **Regenerate last response** — Let users retry without retyping prompt (wait for user feedback first)
- **Dark mode** — Reduces eye strain for long sessions (defer to v1.x after validation)

**Defer (v2+):**
- **Message persistence** — Requires DB, auth, major architecture change; users can copy/paste to save
- **Multi-conversation threads** — Needs session management, sidebar UI; too complex for MVP
- **User authentication** — Only add if persistence becomes critical; massive scope increase
- **File/image upload** — Multimodal increases API cost and complexity; text-only simpler
- **Advanced model selection** — Decision paralysis; use cheapest model (deepseek-chat) and iterate

### Architecture Approach

The architecture follows the AI SDK Transport Pattern: client `useChat` hook communicates with server `/api/chat` endpoint that proxies requests to DeepSeek. The hook defaults to POST `/api/chat` and handles streaming automatically. The page layout remains a Server Component (zero JS shipped), while only the interactive chat UI is marked `'use client'`. API keys stay server-side in environment variables, never exposed to the browser. The streaming flow is: user submits → POST /api/chat → `streamText()` calls DeepSeek → SSE tokens stream back → React state updates incrementally → markdown renders progressively.

**Major components:**
1. **Chat UI Component (Client)** — `'use client'` boundary using `useChat` hook for state management, message rendering, and form submission
2. **API Route Handler (Server)** — `app/api/chat/route.ts` proxies requests to DeepSeek via `streamText()`, returns SSE streaming response
3. **Markdown Renderer** — react-markdown with memoization (or streamdown) to prevent re-parsing on every token during streaming
4. **DeepSeek Client Config** — `app/lib/deepseek.ts` using `createOpenAI()` with `baseURL: 'https://api.deepseek.com'` for OpenAI-compatible integration

**Key patterns:**
- **Server/Client Component boundary** — Keep layouts/pages as Server Components, minimize `'use client'` to only interactive portions
- **OpenAI-Compatible API Integration** — DeepSeek uses OpenAI SDK with custom baseURL, enabling easy provider switching
- **Streaming Markdown with Memoization** — Use streamdown or memoized react-markdown to avoid re-parsing entire message on each token
- **Docker multi-stage builds** — Standalone output mode creates minimal production images (~100MB vs ~1GB)

**Critical dependencies:**
- Cannot test `useChat` hook until API route exists — build API route in parallel or before client integration
- Markdown rendering depends on streaming working correctly — test streaming first
- Docker deployment requires static assets (`public/`, `.next/static/`) copied manually to standalone folder

### Critical Pitfalls

The research identified 6 critical pitfalls that cause rewrites or major production issues if not addressed upfront during Phase 1:

1. **SSE Buffering in Production** — Streaming works in dev but fails deployed; entire response dumps after completion. Fix: Return ReadableStream immediately, don't await processing. Export `runtime: 'nodejs'` and `dynamic: 'force-dynamic'` in route. Test on actual deployment platform early. Some platforms (AWS Amplify) don't support streaming at all.

2. **XSS Vulnerabilities in Markdown** — LLM responses can contain malicious HTML/JavaScript that execute in browser. Fix: Use react-markdown (escapes HTML by default), never use `dangerouslySetInnerHTML`. Implement CSP headers. Test with `<img src=x onerror=alert('XSS')>` payload.

3. **NEXT_PUBLIC_ Environment Variables Frozen at Build Time** — Build with dev API key, deploy with prod key set at runtime, but app still uses dev key. Fix: Never use NEXT_PUBLIC_ for API keys. DeepSeek calls must be server-side only. Environment variables without prefix are server-only.

4. **Missing Static Assets in Standalone Docker Build** — Next.js builds successfully but shows broken images, missing CSS, 404s. Fix: Standalone output doesn't include `public/` or `.next/static/` by default. Must manually copy in Dockerfile: `COPY --from=builder /app/public ./public` and `COPY --from=builder /app/.next/static ./.next/static`.

5. **Rate Limiting Without Exponential Backoff** — DeepSeek returns 429 or 503 errors during peak usage, app crashes or shows cryptic errors. Fix: Implement exponential backoff with jitter for 429/500/503. Monitor rate limit headers. DeepSeek has frequent capacity issues, retry logic is essential.

6. **Auto-Scroll Disrupting User Reading** — As response streams, page jumps to bottom continuously, preventing users from reading earlier messages. Fix: Use ChatScrollAnchor pattern with IntersectionObserver. Only auto-scroll when user is at bottom. Provide "Jump to latest" button when scrolled up.

**Moderate pitfalls to address:**
- Missing loading states during 1-3s delay before first token (Phase 1 Chat UI)
- Docker container not binding to 0.0.0.0 (Phase 2 Deployment)
- Using npm/yarn to start app instead of `node server.js` directly (Phase 2 Deployment)

## Implications for Roadmap

Based on research, the project naturally divides into 3 phases that follow architectural dependencies and minimize risk:

### Phase 1: Foundation & Core Chat
**Rationale:** Must establish streaming architecture and security posture before building dependent features. The AI SDK integration, markdown security, and error handling are architectural foundations that can't be retrofitted. This phase delivers a working chat interface with proper streaming, proving the core value proposition.

**Delivers:**
- Working Next.js 16 App Router application with TypeScript and Tailwind CSS
- DeepSeek API integration via Vercel AI SDK with proper streaming
- Secure markdown rendering with syntax highlighting
- Basic chat UI with message history, input form, and loading states
- Error handling with exponential backoff for rate limits
- Mobile-responsive layout

**Addresses features:**
- Streaming responses (table stakes)
- Markdown rendering with sanitization (table stakes)
- Code syntax highlighting + copy button (table stakes)
- Message input with auto-resize (table stakes)
- Loading state indicators (table stakes)
- Error handling with retry (table stakes)
- Mobile-responsive layout (table stakes)

**Avoids pitfalls:**
- SSE buffering (configure runtime/dynamic exports, test streaming early)
- XSS vulnerabilities (use react-markdown from start)
- NEXT_PUBLIC_ vars (server-side API routes only)
- Rate limiting (implement retry logic in initial API integration)
- Auto-scroll disruption (ChatScrollAnchor pattern from start)
- Hardcoded model names (use env var: DEEPSEEK_MODEL)

**Research flag:** SKIP RESEARCH-PHASE — Architecture patterns are well-documented in AI SDK and Next.js docs. Follow established patterns from ARCHITECTURE.md.

### Phase 2: Polish & UX Refinement
**Rationale:** Once streaming and security are proven, add quality-of-life features that improve UX without changing architecture. Stop button requires stream cancellation logic. Clear conversation and keyboard shortcuts are simple state operations. These are "quick wins" that significantly improve perceived quality.

**Delivers:**
- Stop generation button with proper stream cancellation
- Regenerate last response functionality
- One-click clear conversation
- Keyboard shortcuts (Cmd+Enter to send, Escape to stop)
- Dark mode with system preference detection
- DeepSeek model attribution in UI

**Addresses features:**
- Stop generation button (table stakes — moved from P1 to reduce initial complexity)
- Regenerate last response (competitive advantage)
- Clear conversation (competitive advantage)
- Keyboard shortcuts (competitive advantage)
- Dark mode (competitive advantage)

**Avoids pitfalls:**
- Stream not closed on error (ensure stop button calls controller.close())
- Missing loading states (add states for regeneration action)

**Research flag:** SKIP RESEARCH-PHASE — Standard React patterns for state management and event handling. No novel integration points.

### Phase 3: Production Deployment
**Rationale:** Deployment is separated from development because Docker configuration is complex and has platform-specific gotchas. Multi-stage builds, static asset handling, and container networking require careful implementation. Testing locally before VPS deployment prevents costly troubleshooting in production.

**Delivers:**
- Multi-stage Dockerfile with Next.js standalone output
- .dockerignore for optimized builds
- Docker Compose for local testing (optional)
- Production-ready Docker image (~150MB)
- VPS deployment instructions
- Environment variable configuration guide

**Addresses infrastructure:**
- Docker multi-stage build with standalone output (from STACK.md)
- Container networking (0.0.0.0 binding)
- Process management (node server.js as PID 1, not npm)
- Static asset copying (public/ and .next/static/)
- Environment variable security (server-side only)

**Avoids pitfalls:**
- Missing static assets in Docker (manual COPY commands in Dockerfile)
- Container not accessible (bind to 0.0.0.0, verify with netstat)
- npm/yarn as PID 1 (use node directly for graceful shutdown)
- Missing .dockerignore (exclude node_modules, .next, .git)

**Research flag:** SKIP RESEARCH-PHASE — Docker patterns for Next.js are well-documented. Follow examples from STACK.md and PITFALLS.md sources.

### Phase Ordering Rationale

- **Phase 1 first** because streaming architecture and security cannot be retrofitted. XSS prevention, server-side API proxying, and SSE configuration are foundational. Building other features before proving streaming works creates rework risk.

- **Phase 2 second** because UX improvements (stop button, regenerate, keyboard shortcuts) depend on stable streaming and state management from Phase 1. These are additive features that don't change architecture.

- **Phase 3 last** because deployment configuration is independent of application code and benefits from having a complete feature set to test. Docker issues are easier to debug when the app itself is known-working. Testing deployment with a minimal feature set could miss issues that appear under real usage.

- **No Phase 4 (v2 features)** in initial roadmap because research clearly shows persistence, auth, and multi-conversations are architectural changes that require user validation first. Defer until product-market fit is established.

### Research Flags

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Well-documented AI SDK + Next.js patterns in official docs
- **Phase 2:** Standard React state management and UI patterns
- **Phase 3:** Established Docker best practices for Next.js

**Recommendation:** No phases require `/gsd:research-phase` during planning. All patterns are documented in STACK.md, ARCHITECTURE.md, and PITFALLS.md. Proceed directly to requirements definition for each phase.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Next.js 16, AI SDK, and DeepSeek docs verified. Version compatibility confirmed via release notes and npm registry. |
| Features | HIGH | Multiple established chat UIs analyzed (ChatGPT, Claude.ai, LibreChat). Table stakes vs. differentiators validated across 5+ sources. |
| Architecture | HIGH | AI SDK architecture is official Vercel pattern. Next.js Server/Client Components and streaming documented in Next.js 16 docs. DeepSeek OpenAI compatibility verified in official API docs. |
| Pitfalls | HIGH | 6 critical pitfalls sourced from production incident reports, GitHub issues, and technical deep-dives. SSE buffering, XSS, and Docker asset issues confirmed across multiple 2025-2026 sources. |

**Overall confidence:** HIGH

Research benefited from recent (2025-2026) documentation and incident reports for Next.js 16, AI SDK updates, and DeepSeek API. Stack choices are industry-standard with strong official documentation. Pitfalls are well-documented in community reports with verified solutions.

### Gaps to Address

Minor gaps that need attention during implementation but don't affect architecture:

- **DeepSeek API reliability** — Research shows frequent capacity issues and rate limiting during peak times. Implement robust retry logic in Phase 1 and monitor DeepSeek status page during development. Consider documenting fallback UX if API is down for extended periods.

- **Syntax highlighting library choice** — STACK.md mentions rehype-highlight but doesn't compare against Shiki or Prism. Decision can be made during Phase 1 implementation based on bundle size and theme compatibility with dark mode. All three libraries work with react-markdown.

- **VPS provider specifics** — Deployment instructions will vary by VPS provider (DigitalOcean, Hetzner, Linode, etc.). Phase 3 should document generic Docker commands but acknowledge provider-specific differences in firewall configuration, reverse proxy setup, and SSL certificate management.

- **Streaming verification on production platform** — Research emphasizes testing streaming on actual deployment platform (some platforms like AWS Amplify don't support SSE for Next.js). Phase 3 should include verification step: deploy minimal streaming endpoint, confirm tokens arrive incrementally before full deployment.

These gaps are implementation details, not blockers. Proceed with roadmap creation using research findings as documented.

## Sources

### Primary (HIGH confidence)
- [Next.js 16.1.6 Documentation](https://nextjs.org/docs) — App Router, Server Components, streaming, Docker deployment
- [Vercel AI SDK Documentation](https://ai-sdk.dev/docs) — useChat hook, streamText, DeepSeek provider integration
- [DeepSeek API Documentation](https://api-docs.deepseek.com/) — API endpoints, model names, error codes, rate limits
- [react-markdown Documentation](https://github.com/remarkjs/react-markdown) — Security model, XSS prevention, plugin system
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs) — CSS-based configuration, Next.js integration

### Secondary (MEDIUM confidence)
- [Next.js Docker Best Practices 2025](https://medium.com/front-end-world/dockerizing-a-next-js-application-in-2025-bacdca4810fe) — Multi-stage builds, standalone output
- [AI SDK Cookbook: Markdown Chatbot with Memoization](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization) — Performance optimization patterns
- [How to Fix Streaming SSR Issues in Next.js](https://oneuptime.com/blog/post/2026-01-24-nextjs-streaming-ssr-issues/view) — Production streaming pitfalls
- [DeepSeek API Pricing](https://aipricing.org/brands/deepseek) — Model costs, cache pricing
- [Best Open Source Chat UIs for LLMs in 2026](https://poornaprakashsr.medium.com/5-best-open-source-chat-uis-for-llms-in-2025-11282403b18f) — Feature comparison

### Tertiary (LOW confidence — requires validation)
- Community discussions on Next.js + DeepSeek integration patterns
- GitHub issue threads on NEXT_PUBLIC_ environment variable behavior in Docker
- Blog posts on ChatGPT-like UX patterns (auto-scroll, loading states)

---
*Research completed: 2026-02-17*
*Ready for roadmap: yes*
