# Design: CLAUDE.md for Day1 AI Chat

## Problem Statement

This project lacks a CLAUDE.md file, meaning each new Claude Code session starts without knowledge of the project's conventions, architecture, tech stack specifics (like AI SDK v6 patterns), or development workflow. This forces repeated context-gathering and risks inconsistent decisions across sessions. The existing `.claude/rules/debugging.md` covers debugging workflow but there's no top-level project context file.

## Success Criteria

1. A new Claude Code session can read CLAUDE.md and immediately know: stack, dev commands, architecture, key conventions, and gotchas
2. No outdated/incorrect information (e.g., wrong port, wrong package manager)
3. Concise enough to fit well within context without bloating it

## Constraints / Out of Scope

- Will NOT duplicate content from `.claude/rules/debugging.md` — just reference it
- Will NOT duplicate `.planning/` docs — just point to them
- Will NOT include testing docs until a test framework is actually installed
- Will NOT include deployment/Docker docs (Phase 2, not started)

## Approach

A single `CLAUDE.md` at the project root with these sections:

### 1. Project Overview + Development

```markdown
# Day1 AI Chat

AI-powered chat application built with Next.js 15, Vercel AI SDK v6, and DeepSeek.

## Development

- **Package manager:** pnpm
- **Dev server:** `pnpm dev` (runs on port 3030)
- **Build:** `pnpm build`
- **Lint:** `pnpm lint`
- **Environment:** Copy `.env.example` to `.env.local` and set `DEEPSEEK_API_KEY`

See `.claude/rules/debugging.md` for debugging workflow, service management, and validation steps.
```

### 2. Architecture

```markdown
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
```

### 3. AI SDK v6 Patterns

```markdown
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
```

### 4. Conventions + Key Decisions + References

```markdown
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
- `.env.example` — Required environment variables with documentation
```

## Open Questions

None — all questions resolved during brainstorming Q&A.

## Assumptions Validated

- AI SDK v6 methods (convertToModelMessages, toUIMessageStreamResponse, UIMessage.parts) confirmed in codebase
- Tailwind v3 confirmed (^3.4.17 in package.json, TypeScript-based config)
- Next.js 15 confirmed (^15.5.12)
- All UI components confirmed to use 'use client'
- No test framework currently installed
- Note: Project currently has package-lock.json (npm) but user confirmed pnpm as intended package manager
