# Day1 AI Chat

AI-powered chat application built with Next.js 15, Vercel AI SDK v6, and DeepSeek.

## Development

- **Package manager:** pnpm
- **Dev server:** `pnpm dev` (runs on port 3030)
- **Build:** `pnpm build`
- **Lint:** `pnpm lint`
- **Environment:** Create `.env.local` with `DEEPSEEK_API_KEY=<your-key>` (required). Optional: `DEEPSEEK_MODEL` (defaults to `deepseek-chat`).

See `.claude/rules/debugging.md` for debugging workflow, service management, and validation steps.

## Architecture

Next.js 15 App Router with a single-page streaming chat interface.

### Structure
- `app/page.tsx` — Main chat page (Client Component, owns `useChat` hook state)
- `app/api/chat/route.ts` — POST endpoint, streams responses via SSE
- `app/components/` — Client Components: ChatContainer, ChatInput, ChatMessage, ErrorMessage
- `app/layout.tsx` — Root layout (Server Component)
- `lib/deepseek.ts` — DeepSeek provider configuration

### Data Flow
1. `page.tsx` calls `useChat()` from `@ai-sdk/react` to manage conversation
2. User input → POST to `/api/chat` with message history
3. Route handler uses `streamText()` with DeepSeek provider
4. Response streams back as SSE via `toUIMessageStreamResponse()`

### Component Conventions
- All UI components are Client Components (`'use client'`)
- PascalCase filenames in `app/components/`
- No barrel exports (no index.ts files)
- Props passed down from page.tsx; no global state management

## AI SDK v6 Patterns

This project uses Vercel AI SDK v6 which has breaking changes from v3/v4. Key patterns:

### Server (route.ts)
- Use `convertToModelMessages(messages)` to convert UI messages to model format
- Use `streamText()` from `ai` package with the converted messages
- Return `result.toUIMessageStreamResponse()` (not `toDataStreamResponse`)
- Do NOT pass `maxTokens` — removed in v6

### Client (page.tsx)
- Use `useChat()` from `@ai-sdk/react`
- Call `sendMessage({ text: input })` — not `handleSubmit` with form events
- Messages are `UIMessage` type with `.parts` array (not `.content` string)
- Access text via `message.parts.filter(p => p.type === 'text')`

### Common Gotchas
- Old tutorials show `messages.content` — use `messages.parts` instead
- Old tutorials show `maxTokens` option — this no longer exists in v6
- Old tutorials show `toDataStreamResponse()` — use `toUIMessageStreamResponse()`

## Conventions

### Commit Messages
Conventional commits format: `type: description`
- Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`
- Lowercase, imperative mood, no trailing period
- Example: `feat: add message retry on stream failure`

### Code Style
- Follow existing patterns in the codebase
- TypeScript strict mode enabled
- Path alias: `@/*` maps to project root
- Tailwind CSS for all styling (no CSS modules, no styled-components)

## Key Decisions

These were made deliberately — do not change without discussion:
- **Tailwind v3** (not v4) — v4 has PostCSS compatibility issues with this setup
- **Next.js 15** (not 16) — 16 has Turbopack build bugs
- **Port 3030** — avoids conflicts with other local services

## References

- `.planning/` — Project scope, requirements (REQUIREMENTS.md), roadmap (ROADMAP.md), current state (STATE.md)
- `.claude/rules/debugging.md` — Debugging workflow, service management, validation steps
- `.claude/rules/testing.md` — Testing mandate, Vitest/Playwright patterns, anti-patterns
- `.claude/rules/backend-engineer.md` — Backend engineer subagent role, mandatory checkpoints, implementation standards
- `.claude/rules/frontend-engineer.md` — Frontend engineer subagent role, UI/UX standards, accessibility requirements
- `.claude/rules/qa.md` — QA validation subagent role, evidence-based testing, smoke test procedures
