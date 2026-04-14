# Architecture Boundaries

## Layer rules

- `app/` → may import from `lib/` and `@/components/*`
- `lib/` → internal only. MUST NOT import from `app/`.
- `mcp-servers/` → standalone Node processes. MUST NOT import from `app/` or `lib/`. Communicate via stdio or HTTP/SSE.

## Import style

- Always use `@/` path alias (configured in `tsconfig.json`)
- Always import from specific file paths: `import { ChatMessage } from '@/app/components/ChatMessage'`
- NEVER barrel imports: `import { ChatMessage } from '@/app/components'` ❌

## HMR stability

For module-level singletons, use the `globalThis` pattern (see `lib/dev-assistant.ts:33-37`, `lib/mcp/manager.ts:150-171`):

```ts
const globalForX = globalThis as unknown as { xInstance?: X };
export const xInstance = globalForX.xInstance ?? new X();
if (process.env.NODE_ENV !== 'production') globalForX.xInstance = xInstance;
```

## Native module packages

Native deps (`better-sqlite3`, `@lancedb/lancedb`) MUST be listed in `next.config.ts` `serverExternalPackages` array.
