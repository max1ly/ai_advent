# CLAUDE.md — day1_ai-chat

AI chat app with multi-provider support, RAG, and MCP tool integration.

## Stack (pinned — do NOT upgrade)

| Component | Version | Notes |
|---|---|---|
| Node | ≥20 | better-sqlite3 constraint |
| pnpm | lockfileVersion 9.0 | package manager |
| TypeScript | 5.9.3 | strict mode, `@/` path alias |
| Next.js | 15.5.12 | App Router, `output: 'standalone'` |
| React | 18.3.1 | NOT 19 |
| Tailwind | 3.4.19 | **v3 syntax** — NOT v4 |
| ai (Vercel AI SDK) | 6.0.97 | `streamText`, `tool`, `jsonSchema` |
| @ai-sdk/deepseek | 2.0.20 | primary provider |
| @modelcontextprotocol/sdk | 1.27.1 | stdio + SSE |
| @lancedb/lancedb | 0.27.0 | vector store |
| better-sqlite3 | 12.6.2 | native; `serverExternalPackages` |
| vitest | 4.0.18 | globals: true, jsdom env |

Dev port: **3030**.

## Architecture

- `app/` — Next.js App Router pages, layouts, route handlers. May import from `lib/`.
- `app/components/` — React components (PascalCase `.tsx`).
- `app/api/<segment>/route.ts` — HTTP/streaming route handlers. Thin; delegate to `lib/`.
- `lib/` — business logic, agent orchestration, providers. Internal only; MUST NOT import from `app/`.
- `mcp-servers/` — standalone Node processes. NO imports from `app/` or `lib/`. Communicate via stdio/SSE.
- `__tests__/` — colocated with source (`lib/__tests__/`, `app/components/__tests__/`).

See `@.claude/rules/architecture.md` for boundary details.

## Naming conventions

- Components: **PascalCase.tsx** in `app/components/` (e.g., `ChatMessage.tsx`)
- Lib modules: **camelCase.ts** in `lib/` (e.g., `modelRegistry.ts`)
- Route segments: **lowercase**, dynamic params `[param]`
- Directories: **kebab-case** (e.g., `mcp-servers/`, `chat-history/`)
- Tests: `<name>.test.ts(x)` in `__tests__/` subfolder
- NEVER barrel `index.ts` — import from specific file paths via `@/` alias

## Patterns (MUST follow)

- **Before writing new code, READ** `.claude/rules/component-rules-v1.md` for strict rules on every new component (one-component-per-file, exported `<Name>Props` interface, named export, required test file).
- **Client components:** `'use client'` on line 1. Only when needed (hooks, events). Push boundary to leaves.
- **Named exports only.** NEVER `export default` for components or lib modules.
- **Typed props:** export a TS interface `ComponentNameProps`.
- **Env vars:** read in `lib/` only. NEVER `process.env.X` inside `app/components/*`.
- **Tools:** define via AI SDK `tool()` with Zod `inputSchema`. NEVER `any` in schemas.
- **Errors:** `err instanceof Error ? err.message : String(err)` at every catch site.
- **Streaming errors:** use `createUIMessageStream` writer `{ type: 'error', errorText }`.
- **REST errors:** `return NextResponse.json({ error }, { status: 500 })`.
- **Fire-and-forget:** always `.catch(err => console.log(...))` on unawaited promises.

See `@.claude/rules/patterns.md` for code examples.

## Anti-patterns (NEVER do)

- Default exports on components or lib modules
- Barrel `index.ts` files
- Inline `process.env.X` inside components
- Raw `fetch(apiUrl)` instead of AI SDK provider
- `any` on tool `execute` args or missing `inputSchema`
- Top-level `await` in root/shared layouts
- `'use client'` on page-root components that don't need it
- Swallowing errors (`catch {}`) or generic `{ error: 'Failed' }`
- Tailwind v4 syntax (project is v3)
- Creating duplicate reset/clear logic when `app/page.tsx:171-187 handleNewChat()` already exists

See `@.claude/rules/anti-patterns.md` for bad→good pairs.

## File templates

See `@.claude/rules/templates.md` for:
- Client component (PascalCase.tsx with `'use client'`, typed props, named export)
- API route handler (try/catch, streaming or JSON response)
- Lib module (camelCase.ts, named exports, no barrel)
- Tool factory (AI SDK `tool()` with Zod schema)

## Subagents available

- **nextjs-route-builder** — for `app/api/**/route.ts` tasks. Auto-invoked when creating/editing route handlers.
- **component-builder** — for React + Tailwind client components in `app/components/`.

## Skills available

- **verify-build** — runs `pnpm exec tsc --noEmit --skipLibCheck`, `pnpm vitest run`, `pnpm build`. Reports compact PASS/FAIL with `file:line` pointers.
- **test-code** — Level 1: find vitest coverage gaps, author tests for the top 3–5 uncovered files, run them, verify three green runs, write a report. Trigger: "add tests", "find coverage gaps", "write tests", "cover X with tests".
- **test-smoke** — Level 2: execute 3–5 natural-language UI scenarios against the running app using Playwright. Manages app lifecycle on :3030, generates specs, captures screenshots on failure, writes diagnosis report. Trigger: "run smoke test", "test the UI", "test scenarios: ...".
- **test-new-feature** — Orchestrator: chains test-code + test-smoke under a shared timestamp, writes unified report with cross-level diagnosis, promotes passing specs. Trigger: "new feature just created", "cover this feature".

## Known issues (do not try to fix)

- `pnpm lint` is currently broken (ESLint 9 + eslint-config-next 16 circular ref). Use `pnpm exec tsc --noEmit --skipLibCheck` instead.
- Vitest globals not in `tsconfig.json` `types` → ignore TS errors in `__tests__/*` when running `tsc`.

## Good code examples

- Streaming route: `app/api/chat/route.ts:5-47`
- Streaming error: `app/api/chat/route.ts:31-46`
- Client component: `app/components/ChatMessage.tsx:1-143`
- Tool factory: `lib/rag/tool.ts:13-35`
- Agent orchestration: `lib/agent.ts:164-407`
- Multi-provider abstraction: `lib/models.ts:1-73,702`
- Singleton + HMR: `lib/dev-assistant.ts:33-37`
