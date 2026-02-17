# Technology Stack

**Project:** Minimal LLM Chat Web App
**Researched:** 2026-02-17
**Confidence:** HIGH

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 16.1.6 | React framework with App Router | Current stable release (Feb 2026). App Router provides native streaming support, Server Components, and Server Actions for minimal boilerplate in AI chat apps. Industry standard for production React apps. |
| React | 19.x | UI library | Required by Next.js 15+. React 19 is stable and provides Suspense improvements critical for streaming UIs. |
| TypeScript | 5.1.3+ | Type safety | Minimum version required for async Server Components. Provides compile-time route validation in Next.js 15.5+. Essential for maintaining code quality without a test suite. |
| Node.js | 24.x LTS | Runtime | Current LTS version (Krypton). Required for Next.js 16. Use in Docker with `node:24-slim` for production deployments. |

### AI/LLM Integration
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vercel AI SDK | Latest (ai) | AI streaming framework | Official SDK for Next.js AI apps. Provides `streamText` for streaming responses, `useChat` hook for chat UIs, and first-party DeepSeek provider support. Handles SSE streaming, token buffering, and React state management automatically. |
| @ai-sdk/deepseek | 2.0.20+ | DeepSeek provider | Official DeepSeek provider for AI SDK. Supports deepseek-chat (V3), R1 models, and tool calling. OpenAI-compatible API makes migration easy if needed. |
| @ai-sdk/react | Latest | React hooks | Provides `useChat` hook for streaming chat interfaces. Manages chat state, handles message streaming, and updates UI automatically. Works seamlessly with Next.js App Router. |
| zod | Latest | Schema validation | Required by AI SDK for tool calling and structured outputs. Industry standard for TypeScript runtime validation. |

### UI Libraries
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.x | Styling framework | Current stable version (released 2025). V4 uses CSS-based configuration via `@theme` directive, eliminating config files. Smaller bundle size than v3. Next.js has official Tailwind support. |
| react-markdown | 10.1.0+ | Markdown rendering | Current stable release. Safe by default (no dangerouslySetInnerHTML). Uses micromark parser, follows CommonMark spec. Essential for rendering LLM responses with formatting. |
| remark-gfm | Latest | GitHub Flavored Markdown | Adds tables, strikethrough, task lists, autolinks to react-markdown. Standard plugin for chat apps that need formatted code responses. |

### Infrastructure
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Docker | Latest | Containerization | Required for VPS deployment. Use multi-stage builds with Next.js standalone output mode to create minimal production images (~100MB vs ~1GB). |
| Docker Compose | Latest (optional) | Local development orchestration | Useful for consistent dev environment setup, though not required for this minimal app. |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| rehype-highlight | Latest | Syntax highlighting in code blocks | If LLM responses include code. Use with react-markdown's rehypePlugins prop. |
| remark-math + rehype-katex | Latest | Math rendering | If LLM responses include mathematical notation. Not needed for general chat. |

## Installation

```bash
# Core dependencies
npm install next@latest react@latest react-dom@latest

# TypeScript
npm install -D typescript @types/react @types/node

# Tailwind CSS v4
npm install tailwindcss@next @tailwindcss/postcss@next

# AI SDK with DeepSeek
npm install ai @ai-sdk/react @ai-sdk/deepseek zod

# Markdown rendering
npm install react-markdown remark-gfm

# Optional: Syntax highlighting for code blocks
npm install rehype-highlight
```

## Environment Variables

```bash
# .env.local
DEEPSEEK_API_KEY=your_api_key_here
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Framework | Next.js App Router | Remix, Astro, SvelteKit | Next.js has best-in-class streaming support, official Vercel AI SDK integration, and largest ecosystem for AI apps. App Router's Server Actions eliminate API route boilerplate. |
| AI SDK | Vercel AI SDK | OpenAI SDK directly, LangChain | Vercel AI SDK abstracts provider differences, handles streaming automatically, and provides React hooks. OpenAI SDK requires manual streaming implementation. LangChain adds unnecessary complexity for simple chat. |
| DeepSeek Integration | @ai-sdk/deepseek | OpenAI SDK with DeepSeek endpoint | @ai-sdk/deepseek provides first-party support, type safety, and consistent API with other AI SDK providers. Using OpenAI SDK works but loses AI SDK benefits. |
| Markdown | react-markdown | marked + DOMPurify, MDX | react-markdown is React-native, safe by default, and plugin-based. marked requires manual sanitization. MDX is overkill for rendering LLM responses (not authoring content). |
| Styling | Tailwind CSS v4 | Tailwind v3, CSS Modules, styled-components | v4 has smaller bundle, CSS-based config, and better DX. v3 works but is legacy. CSS Modules require more boilerplate for utility-first styling. styled-components adds runtime overhead. |
| Containerization | Docker multi-stage | Single-stage Docker, Vercel deployment | Multi-stage builds with standalone output create minimal images. Single-stage includes dev dependencies (~1GB). Vercel is easier but costs more than VPS. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Next.js Pages Router | Legacy router. No native streaming support, requires custom API routes for SSE. | Next.js App Router (file-system based with Server Components) |
| create-react-app | Deprecated, no longer maintained, no SSR/streaming support. | Next.js with App Router |
| LangChain for simple chat | Massive dependency tree, complex abstractions unnecessary for direct LLM API calls. | Vercel AI SDK (minimal, streaming-first) |
| Vercel AI Gateway for DeepSeek | Adds latency and cost (Vercel proxy layer). DeepSeek API is already fast and cheap. | Direct DeepSeek API via @ai-sdk/deepseek |
| Streaming with fetch API manually | Error-prone, requires manual SSE parsing, state management, error handling. | AI SDK's streamText + useChat (handles everything) |
| node:24 (full) Docker image | 1GB+ base image with unnecessary packages. | node:24-slim (~150MB, production-ready) |
| Database for message history | Adds complexity, requires migrations, backup strategy. Project spec says "no persistence". | In-memory state via React (resets on page refresh) |
| NextAuth or Clerk | Authentication adds session management, cookies, database needs. Project spec says "no auth". | No authentication (open access) |

## Stack Patterns by Variant

**If you need message persistence later:**
- Add Vercel KV (Redis) or Upstash Redis for serverless key-value storage
- Store messages by session ID in Redis
- Retrieve on page load via Server Component
- Because Redis is fast, cheap, and doesn't require migrations like SQL databases

**If you need authentication later:**
- Use Clerk (easiest) or NextAuth (most flexible)
- Store API keys per-user in environment or encrypted database
- Because these libraries handle session management, OAuth, and security automatically

**If you need rate limiting:**
- Use Upstash Rate Limit (serverless) or redis-based rate limiting
- Apply to API routes via middleware
- Because DeepSeek API costs scale with usage, rate limiting prevents abuse

**If you need multiple LLM providers:**
- Keep @ai-sdk/deepseek, add @ai-sdk/openai, @ai-sdk/anthropic as needed
- Switch providers via environment variable or UI selection
- Because AI SDK provides unified interface across providers

**If deploying to Kubernetes instead of VPS:**
- Use same Dockerfile with standalone output
- Add health check endpoint (`/api/health`)
- Configure horizontal pod autoscaling based on CPU
- Because Next.js standalone mode works identically across orchestrators

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@16.x | React 19.x | Next.js 16 requires React 19. Next.js 15 works with React 18 or 19. |
| next@16.x | Node.js 20.9+ | Minimum Node.js 20.9. Recommended: 24.x LTS for production. |
| @ai-sdk/deepseek@2.x | ai@latest | First-party provider, version-locked to AI SDK major version. |
| react-markdown@10.x | Node.js 16+ | Works with React 18 and 19. |
| tailwindcss@4.x | Next.js 15+ | Tailwind v4 requires PostCSS 8+, which Next.js 15+ includes. |
| TypeScript@5.1.3+ | Next.js 15+ | Required for async Server Components and typed routes (15.5+). |

## DeepSeek Model Recommendation

For "cheapest DeepSeek model":
- **Model:** `deepseek-chat` (DeepSeek V3)
- **Pricing:** $0.27/M input tokens, $1.10/M output tokens (cache miss)
- **Pricing with cache:** $0.07/M input tokens (95% cheaper for repeated context)
- **Why:** General-purpose chat model, balances cost and quality. R1 Distill models are cheaper ($0.03-0.14/M tokens) but designed for reasoning tasks, not conversational chat.

Alternative if you need advanced reasoning:
- **Model:** `deepseek-reasoner` (R1)
- **Use case:** Complex problem-solving, math, coding challenges
- **Cost:** Higher token usage due to chain-of-thought reasoning

## Docker Configuration Notes

**Next.js Standalone Mode:**
Enable in `next.config.ts`:
```typescript
export default {
  output: 'standalone'
}
```

This creates `.next/standalone` folder with only necessary files (~10MB vs ~500MB node_modules).

**Multi-Stage Dockerfile Pattern:**
1. **base:** Install dependencies
2. **builder:** Build Next.js app with `npm run build`
3. **runner:** Copy standalone output, use `node:24-slim`, run as non-root user

**Image Size:**
- Single-stage: ~1.2GB
- Multi-stage with standalone: ~150MB
- Difference: 87% smaller, faster deploys, lower bandwidth costs

**Security:**
- Run as non-root user (`USER node`)
- Use `.dockerignore` to exclude `.env`, `node_modules`, `.git`
- Never commit API keys to image layers
- Pass secrets via environment variables at runtime

## Development vs Production

**Development (localhost):**
```bash
npm run dev  # Hot reload, error overlay, verbose logging
```

**Production (Docker on VPS):**
```bash
docker build -t chat-app .
docker run -p 3030:3030 -e DEEPSEEK_API_KEY=xxx chat-app
```

**Key Differences:**
- Dev uses webpack dev server (slow but full error messages)
- Prod uses standalone server.js (fast, minimal logging)
- Dev hot-reloads on file changes
- Prod serves pre-built static assets from `.next` folder

## Sources

**HIGH Confidence (Official Documentation):**
- [Next.js 16.1.6 Release](https://eosl.date/eol/product/nextjs/) - Version confirmation
- [Next.js Standalone Output](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output) - Docker optimization
- [Vercel AI SDK Getting Started](https://ai-sdk.dev/docs/getting-started/nextjs-app-router) - Official Next.js integration
- [DeepSeek Provider Documentation](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek) - @ai-sdk/deepseek usage
- [react-markdown Releases](https://github.com/remarkjs/react-markdown/releases) - Version 10.1.0
- [Tailwind CSS v4 Guide](https://designrevision.com/blog/tailwind-4-migration) - v4 features and migration

**MEDIUM Confidence (Verified via Multiple Sources):**
- [Next.js Docker Best Practices 2025](https://medium.com/front-end-world/dockerizing-a-next-js-application-in-2025-bacdca4810fe) - Multi-stage builds
- [DeepSeek API Pricing 2026](https://aipricing.org/brands/deepseek) - Model costs
- [Node.js LTS Releases](https://endoflife.date/nodejs) - Node 24 LTS status
- [AI SDK useChat Hook](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat) - Streaming implementation

**MEDIUM Confidence (WebSearch + Official Verification):**
- [@ai-sdk/deepseek npm](https://www.npmjs.com/package/@ai-sdk/deepseek) - Version 2.0.20
- [Next.js + DeepSeek Integration](https://itsrakesh.com/blog/integrating-deepseek-api-in-nextjs-and-expressjs-app) - Integration patterns
- [remark-gfm Usage](https://github.com/remarkjs/remark-gfm) - GFM plugin for react-markdown

---
*Stack research for: Minimal LLM Chat Web App*
*Researched: 2026-02-17*
*Researcher: GSD Project Researcher*
