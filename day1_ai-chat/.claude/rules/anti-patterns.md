# Anti-patterns (NEVER do — bad → good)

## 1. Default export (bad) → Named export (good)

```tsx
// ❌ BAD — default export
export default function ChatMessage(props: Props) { ... }

// ✅ GOOD — named export
export function ChatMessage(props: ChatMessageProps) { ... }
```

## 2. Barrel `index.ts` (bad) → Direct path import (good)

```ts
// ❌ BAD — breaks tree-shaking
import { ChatMessage, ChatInput } from '@/app/components';

// ✅ GOOD — specific paths
import { ChatMessage } from '@/app/components/ChatMessage';
```

## 3. `process.env` in component (bad) → read in lib/ (good)

```tsx
// ❌ BAD — env in component
'use client';
export function Chat() {
  const key = process.env.NEXT_PUBLIC_KEY;
}

// ✅ GOOD — read in lib, pass as prop or via API
// lib/config.ts
export const getConfig = () => ({ key: process.env.SECRET_KEY });
```

## 4. `any` on tool args (bad) → Zod schema (good)

```ts
// ❌ BAD
tool({ execute: async (args: any) => { ... } });

// ✅ GOOD
tool({
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => { ... },
});
```

## 5. Swallow errors (bad) → Typed error message (good)

```ts
// ❌ BAD — lost context
try { await foo(); } catch {}

// ❌ BAD — generic
catch (e) { return { error: 'Failed' }; }

// ✅ GOOD
catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}
```

## 6. Duplicate reset logic (bad) → Reuse `handleNewChat` (good)

```tsx
// ❌ BAD — duplicates logic already in app/page.tsx:171-187
const handleClear = () => { setMessages([]); localStorage.removeItem(...); ... };

// ✅ GOOD — reuse existing
<button onClick={handleNewChat}>Clear chat</button>
```

## 7. Tailwind v4 syntax (bad) — project is v3

```css
/* ❌ BAD — Tailwind v4 */
@import "tailwindcss";

/* ✅ GOOD — Tailwind v3 */
@tailwind base;
@tailwind components;
@tailwind utilities;
```
